# transactions/views.py
import csv
import io # To handle in-memory text stream
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import datetime, timezone
from django.db import transaction as db_transaction # Renamed to avoid confusion
from rest_framework import generics, permissions, status, views, viewsets
from rest_framework.decorators import action
from rest_framework.views import APIView # Use APIView for custom logic
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser # For file uploads
from rest_framework.response import Response
from django.db.models import Q
from .models import Category, Transaction, Vendor, VendorRule, VendorMapping, DescriptionMapping, BASE_CURRENCY_FOR_CONVERSION, HistoricalExchangeRate # Import Transaction model
from .serializers import CategorySerializer, TransactionSerializer, TransactionUpdateSerializer, VendorSerializer, VendorRuleSerializer, VendorMappingSerializer, TransactionCreateSerializer # Add TransactionCreateSerializer
from .permissions import IsOwnerOrSystemReadOnly, IsOwner # Import IsOwner
import logging
from django.db.models import Count, Min, Sum, Case, When, Value, DecimalField
from django.shortcuts import get_object_or_404 # Useful for getting the Category
from transactions import serializers # Added logging
from django.db.models import Max # Import Max for aggregation
from rest_framework.parsers import JSONParser
from integrations.services import get_historical_exchange_rate
from .services import get_historical_rate, get_current_exchange_rate # Import our new rate service
from django_filters import rest_framework as filters # Import for filtering
from rest_framework.pagination import PageNumberPagination
from rest_framework.filters import OrderingFilter
from collections import defaultdict
from django.utils import timezone as django_timezone

logger = logging.getLogger(__name__)

# --- Standard Pagination ---
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = 'page_size'
    max_page_size = 100

# --- Transaction Filters ---
class TransactionFilter(filters.FilterSet):
    start_date = filters.DateFilter(field_name="transaction_date", lookup_expr='gte')
    end_date = filters.DateFilter(field_name="transaction_date", lookup_expr='lte')
    # category_id is handled by 'category' field name directly
    is_categorized = filters.BooleanFilter(field_name="category", lookup_expr='isnull', exclude=True) 
    # For is_categorized=True, we want category IS NOT NULL.
    # For is_categorized=False, we want category IS NULL.
    # The 'exclude=True' with 'isnull' means:
    #   - If True is passed to is_categorized: category IS NOT NULL (isnull=False)
    #   - If False is passed to is_categorized: category IS NULL (isnull=True)
    
    # Search filters for dashboard search bar
    vendor__name__icontains = filters.CharFilter(field_name="vendor__name", lookup_expr='icontains')
    category__name__icontains = filters.CharFilter(field_name="category__name", lookup_expr='icontains')

    class Meta:
        model = Transaction
        fields = ['start_date', 'end_date', 'category', 'is_categorized', 'original_currency', 
                 'vendor__name__icontains', 'category__name__icontains']

# --- Transaction List View ---
class TransactionListView(generics.ListAPIView):
    """
    API endpoint to list transactions for the authenticated user.
    Supports filtering, sorting, and pagination.
    """
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination # Use standard pagination
    filter_backends = [filters.DjangoFilterBackend, OrderingFilter] # Add OrderingFilter
    filterset_class = TransactionFilter 
    ordering_fields = ['transaction_date', 'description', 'original_amount', 'aud_amount', 'last_modified']
    ordering = ['-transaction_date', '-created_at'] # Default sort order

    def get_queryset(self):
        """
        This view should return a list of all transactions
        owned by the currently authenticated user.
        """
        return Transaction.objects.filter(user=self.request.user)

# --- Transaction Update View ---
class TransactionUpdateView(generics.RetrieveUpdateAPIView):
    """
    API endpoint to retrieve and update a specific transaction.
    Only the owner can update.
    """
    queryset = Transaction.objects.all() # Base queryset
    serializer_class = TransactionUpdateSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    lookup_field = 'pk'

    def get_queryset(self):
        """
        Ensure users can only access their own transactions,
        even for the base queryset used by get_object().
        """
        return Transaction.objects.filter(user=self.request.user)

    def perform_update(self, serializer):
        transaction = serializer.instance
        # Check if financial details are being changed
        original_amount_changed = 'original_amount' in serializer.validated_data and \
                                  serializer.validated_data['original_amount'] != transaction.original_amount
        original_currency_changed = 'original_currency' in serializer.validated_data and \
                                   serializer.validated_data['original_currency'] != transaction.original_currency
        category_changed = 'category' in serializer.validated_data and \
                           serializer.validated_data['category'] != transaction.category
        
        aud_recalc_needed = False

        if original_amount_changed or original_currency_changed:
            logger.info(f"Transaction {transaction.id}: Financial details changed. Setting aud_amount to None for recalc.")
            serializer.save(aud_amount=None, exchange_rate_to_aud=None) # Save with aud_amount cleared
            aud_recalc_needed = True # Mark that recalc is needed after this save
        else:
            serializer.save() # Save other changes (like description, date, or only category without financial changes)

        # Fetch the instance again after potential first save
        transaction.refresh_from_db()

        # If category changed OR if financial details changed (which also implies aud_recalc_needed)
        if category_changed or aud_recalc_needed:
            logger.info(f"Transaction {transaction.id}: Category changed or financial details updated. Forcing AUD amount recalculation.")
            transaction.update_aud_amount_if_needed(force_recalculation=True)
            # No need to call serializer.save() again if update_aud_amount_if_needed saves itself.
            # If it doesn't, you might need transaction.save() here.
            # Assuming update_aud_amount_if_needed handles its own save.

# --- Transaction Destroy View ---
class TransactionDestroyView(generics.RetrieveDestroyAPIView):
    """
    API endpoint to delete a specific transaction.
    Only the owner can delete.
    """
    queryset = Transaction.objects.all() 
    serializer_class = TransactionSerializer # Or minimal serializer if not returning content
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    lookup_field = 'pk'

    def get_queryset(self):
        return Transaction.objects.filter(user=self.request.user)

    def perform_destroy(self, instance):
        logger.info(f"User {self.request.user.id}: Deleting transaction ID {instance.id} ('{instance.description}').")
        instance.delete()

# --- Transaction Create View ---
class TransactionCreateView(generics.CreateAPIView):
    """
    API endpoint to create manual transactions for the authenticated user.
    Handles validation, currency conversion, and proper relationship assignment.
    """
    serializer_class = TransactionCreateSerializer
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser]

    def perform_create(self, serializer):
        """
        Override to set the user and handle any additional logic during creation.
        """
        user = self.request.user
        logger.info(f"User {user.id}: Creating manual transaction.")
        
        # The serializer's create method handles most of the logic
        # including user assignment, currency conversion, etc.
        transaction = serializer.save()
        
        logger.info(f"User {user.id}: Successfully created manual transaction ID {transaction.id} "
                   f"('{transaction.description}', {transaction.signed_original_amount} {transaction.original_currency}).")
        
        return transaction

    def get_serializer_context(self):
        """Pass request to serializer context for validation."""
        return {'request': self.request}

    def create(self, request, *args, **kwargs):
        """
        Override create to provide enhanced response data and error handling.
        """
        serializer = self.get_serializer(data=request.data)
        
        try:
            serializer.is_valid(raise_exception=True)
            transaction = self.perform_create(serializer)
            
            # Apply vendor identification if the transaction doesn't already have a vendor
            vendor_identified = False
            if not transaction.vendor:
                logger.info(f"User {request.user.id}: Attempting vendor identification for new manual transaction {transaction.id}")
                try:
                    from .vendor_identification_service import identify_vendor_for_single_transaction
                    
                    identified_vendor = identify_vendor_for_single_transaction(transaction)
                    if identified_vendor:
                        vendor_identified = True
                        transaction.refresh_from_db()  # Refresh to get updated vendor
                        logger.info(f"User {request.user.id}: Identified vendor {identified_vendor.name} for manual transaction {transaction.id}")
                    else:
                        logger.debug(f"User {request.user.id}: Could not identify vendor for manual transaction {transaction.id}")
                        
                except Exception as e:
                    logger.error(f"User {request.user.id}: Vendor identification failed for manual transaction {transaction.id}: {e}", exc_info=True)
                    # Don't fail the transaction creation if vendor identification fails
            else:
                logger.debug(f"User {request.user.id}: Manual transaction {transaction.id} already has vendor {transaction.vendor.name}, skipping vendor identification")
                vendor_identified = True  # Already had a vendor
            
            # Apply auto-categorization if the transaction doesn't already have a category
            auto_categorized = False
            rule_applied = None
            if not transaction.category:
                logger.info(f"User {request.user.id}: Attempting auto-categorization for new manual transaction {transaction.id}")
                try:
                    from .auto_categorization_service import auto_categorize_single_transaction
                    
                    applied_rule = auto_categorize_single_transaction(transaction)
                    if applied_rule:
                        auto_categorized = True
                        rule_applied = applied_rule.id
                        transaction.refresh_from_db()  # Refresh to get updated category
                        logger.info(f"User {request.user.id}: Auto-categorized manual transaction {transaction.id} "
                                   f"using rule {rule_applied}")
                    else:
                        logger.debug(f"User {request.user.id}: Manual transaction {transaction.id} could not be auto-categorized: "
                                    f"No matching vendor rule found")
                        
                except Exception as e:
                    logger.error(f"User {request.user.id}: Auto-categorization failed for manual transaction {transaction.id}: {e}", exc_info=True)
                    # Don't fail the transaction creation if auto-categorization fails
            else:
                logger.debug(f"User {request.user.id}: Manual transaction {transaction.id} already has category {transaction.category.name}, skipping auto-categorization")
            
            # Use the standard TransactionSerializer for the response
            # to provide consistent read format (includes computed fields)
            response_serializer = TransactionSerializer(transaction, context={'request': request})
            
            # Prepare success response with additional metadata
            response_data = {
                'transaction': response_serializer.data,
                'message': 'Transaction created successfully.',
                'currency_converted': transaction.aud_amount is not None,
                'conversion_rate': float(transaction.exchange_rate_to_aud) if transaction.exchange_rate_to_aud else None,
                'vendor_identified': vendor_identified,
                'auto_categorized': auto_categorized,
                'rule_applied': rule_applied
            }
            
            return Response(response_data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            # Log detailed error for debugging
            logger.error(f"User {request.user.id}: Failed to create manual transaction: {e}", exc_info=True)
            
            # If it's a validation error, let DRF handle it normally
            if hasattr(e, 'detail'):
                return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)
            
            # For unexpected errors, return generic error message
            return Response(
                {'error': 'Failed to create transaction. Please check your input and try again.'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

# Create your views here.
# --- NEW BATCH CATEGORIZE VIEW ---
class BatchCategorizeTransactionView(APIView):
    """
    API endpoint to assign a category to multiple transactions at once.
    Optionally creates/updates a DescriptionMapping rule if a clean name is provided.
    Optionally updates the description of the processed transactions.
    Expects: {
        "transaction_ids": [int],
        "category_id": int,
        "original_description": "string from CSV used for grouping", // Required
        "clean_name": "string (optional, user-edited name)" // Optional
    }
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser] # Explicitly use JSONParser

    def patch(self, request, *args, **kwargs):
        """
        Batch categorize transactions by assigning them to a category.
        """
        user = request.user
        transaction_ids = request.data.get('transaction_ids', [])
        category_id = request.data.get('category_id')
        original_description = request.data.get('original_description')
        clean_name = request.data.get('clean_name') # Optional

        # Validate required fields
        if not transaction_ids:
            return Response(
                {'error': 'transaction_ids is required and must be a non-empty list.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not category_id:
            return Response(
                {'error': 'category_id is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if not original_description:
            return Response(
                {'error': 'original_description is required.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            # Verify the category exists and user has access to it
            category = Category.objects.get(
                Q(user__isnull=True) | Q(user=user),
                id=category_id
            )
        except Category.DoesNotExist:
            return Response(
                {'error': f'Category with id {category_id} not found or not accessible.'},
                status=status.HTTP_404_NOT_FOUND
            )

        # Get the transactions that belong to the user and are uncategorized
        transactions = Transaction.objects.filter(
            user=user,
            id__in=transaction_ids,
            category__isnull=True
        )

        if not transactions.exists():
            return Response(
                {'error': 'No valid uncategorized transactions found to categorize.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        updated_count = 0
        errors = []

        # Process each transaction
        for transaction in transactions:
            try:
                # Update the transaction
                transaction.category = category
                transaction.save(update_fields=['category', 'updated_at'])
                updated_count += 1

                # Optionally create/update a DescriptionMapping rule
                if clean_name and clean_name.strip():
                    # Check if a mapping already exists for this description
                    mapping, created = DescriptionMapping.objects.get_or_create(
                        user=user,
                        original_description=original_description,
                        defaults={
                            'clean_name': clean_name.strip(),
                            'assigned_category': category
                        }
                    )
                    
                    if not created:
                        # Update existing mapping
                        mapping.clean_name = clean_name.strip()
                        mapping.assigned_category = category
                        mapping.save()

            except Exception as e:
                errors.append(f"Error updating transaction {transaction.id}: {str(e)}")

        # Prepare response
        message = f"Successfully categorized {updated_count} transaction(s)."
        if errors:
            message += f" {len(errors)} transaction(s) had errors."

        return Response({
            'message': message,
            'updated_count': updated_count,
            'errors': errors if errors else None
        }, status=status.HTTP_200_OK)


class BatchHideTransactionView(APIView):
    """
    API endpoint to hide multiple transactions at once.
    Expects: {
        "transaction_ids": [int],
        "action": "hide" or "unhide"
    }
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser]

    def patch(self, request, *args, **kwargs):
        """
        Batch hide or unhide transactions.
        """
        user = request.user
        transaction_ids = request.data.get('transaction_ids', [])
        action = request.data.get('action', 'hide')

        # Validate required fields
        if not transaction_ids:
            return Response(
                {'error': 'transaction_ids is required and must be a non-empty list.'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if action not in ['hide', 'unhide']:
            return Response(
                {'error': 'action must be either "hide" or "unhide".'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Determine the filter based on action
        if action == 'hide':
            # For hiding, we want uncategorized transactions that are not already hidden
            transactions = Transaction.objects.filter(
                user=user,
                id__in=transaction_ids,
                category__isnull=True,
                is_hidden=False
            )
            is_hidden_value = True
        else:  # unhide
            # For unhiding, we want hidden transactions
            transactions = Transaction.objects.filter(
                user=user,
                id__in=transaction_ids,
                is_hidden=True
            )
            is_hidden_value = False

        if not transactions.exists():
            return Response(
                {'error': f'No valid transactions found to {action}.'},
                status=status.HTTP_400_BAD_REQUEST
            )

        updated_count = 0
        errors = []

        # Process each transaction
        for transaction in transactions:
            try:
                # Update the transaction
                transaction.is_hidden = is_hidden_value
                transaction.save(update_fields=['is_hidden', 'updated_at'])
                updated_count += 1

            except Exception as e:
                errors.append(f"Error updating transaction {transaction.id}: {str(e)}")

        # Prepare response
        message = f"Successfully {action}d {updated_count} transaction(s)."
        if errors:
            message += f" {len(errors)} transaction(s) had errors."

        return Response({
            'message': message,
            'updated_count': updated_count,
            'errors': errors if errors else None
        }, status=status.HTTP_200_OK)

class UncategorizedTransactionGroupView(APIView):
    """
    API endpoint to list uncategorized transactions for the authenticated user,
    grouped by description. Returns groups ordered by the *most recent* transaction
    date within each group descending (newest groups first).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user

        check_existence_only = request.query_params.get('check_existence', 'false').lower() == 'true'
        if check_existence_only:
             # ... (Keep existence check logic) ...
             exists = Transaction.objects.filter(user=user, category__isnull=True, is_hidden=False).exists()
             return Response({'has_uncategorized': exists}, status=status.HTTP_200_OK)


        logger.info(f"Fetching uncategorized transaction groups for user: {user.username} ({user.id})")

        uncategorized_txs = Transaction.objects.filter(
            user=user,
            category__isnull=True,
            is_hidden=False
        ).order_by('description', '-transaction_date') # Order needed for grouping and getting max_date easily

        # Get all vendor mappings for this user to apply them during grouping
        # Apply vendor mappings before grouping
        vendor_mappings = {}
        mappings = VendorMapping.objects.filter(user=user).values('original_name', 'mapped_vendor')
        for mapping in mappings:
            vendor_mappings[mapping['original_name'].lower()] = mapping['mapped_vendor']
        
        logger.info(f"DEBUG: User {user.id} has {len(vendor_mappings)} vendor mappings: {vendor_mappings}")
        
        grouped_transactions = {}
        for tx in uncategorized_txs:
            original_description = tx.description
            # Follow mapping chains until we reach the final mapped vendor
            description = original_description
            seen_mappings = set()  # Prevent infinite loops
            
            while description.lower() in vendor_mappings and description.lower() not in seen_mappings:
                seen_mappings.add(description.lower())
                new_description = vendor_mappings[description.lower()]
                logger.info(f"DEBUG: Mapping applied - '{description}' -> '{new_description}'")
                description = new_description
            
            # Final description after following the mapping chain
            if original_description != description:
                logger.info(f"DEBUG: Final mapping result - '{original_description}' -> '{description}'")

            if description not in grouped_transactions:
                grouped_transactions[description] = {
                    'description': description,
                    'max_date': tx.transaction_date, # First one in sorted group is max
                    'transaction_ids': [],
                    'previews': []
                }

            # --- Build Preview Data ---
            grouped_transactions[description]['previews'].append({
                 'id': tx.id,
                 'date': tx.transaction_date,
                 'description': original_description, # Use original description for vendor editing
                 # --- FIX: Use original_amount ---
                 'amount': tx.original_amount,
                 # --- FIX: Use original_currency ---
                 'currency': tx.original_currency, # Add currency info
                 'direction': tx.direction,
                 # --- FIX: Use model property ---
                 'signed_amount': tx.signed_original_amount, # Use property for signed value
                 # Keep other source fields if needed by frontend details modal
                 'source_account': tx.source_account_identifier,
                 'counterparty': tx.counterparty_identifier,
                 'code': tx.source_code,
                 'type': tx.source_type,
                 'notifications': tx.source_notifications,
            })

            grouped_transactions[description]['transaction_ids'].append(tx.id)

            # --- NO SECOND APPEND (already removed) ---

        # Convert dict to list and sort by date
        sorted_groups = sorted(
            grouped_transactions.values(),
            key=lambda group: group['max_date'],
            reverse=True
        )

        # Add counts and earliest date
        for group in sorted_groups:
            group['count'] = len(group['transaction_ids'])
            if group['previews']:
                 group['earliest_date'] = min(p['date'] for p in group['previews'])
            else:
                 group['earliest_date'] = None

        logger.info(f"Found {len(sorted_groups)} groups of uncategorized transactions for user {user.id}, sorted by most recent.")
        return Response(sorted_groups, status=status.HTTP_200_OK)


class HiddenTransactionGroupView(APIView):
    """
    API endpoint to list hidden transactions for the authenticated user,
    grouped by description. Returns groups ordered by the *most recent* transaction
    date within each group descending (newest groups first).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user

        check_existence_only = request.query_params.get('check_existence', 'false').lower() == 'true'
        if check_existence_only:
             exists = Transaction.objects.filter(user=user, is_hidden=True).exists()
             return Response({'has_hidden': exists}, status=status.HTTP_200_OK)

        logger.info(f"Fetching hidden transaction groups for user: {user.username} ({user.id})")

        hidden_txs = Transaction.objects.filter(
            user=user,
            is_hidden=True
        ).order_by('description', '-transaction_date')

        # Get all vendor mappings for this user to apply them during grouping
        vendor_mappings = {}
        mappings = VendorMapping.objects.filter(user=user).values('original_name', 'mapped_vendor')
        for mapping in mappings:
            vendor_mappings[mapping['original_name'].lower()] = mapping['mapped_vendor']
        
        logger.info(f"DEBUG: User {user.id} has {len(vendor_mappings)} vendor mappings: {vendor_mappings}")
        
        grouped_transactions = {}
        for tx in hidden_txs:
            original_description = tx.description
            # Follow mapping chains until we reach the final mapped vendor
            description = original_description
            seen_mappings = set()  # Prevent infinite loops
            
            while description.lower() in vendor_mappings and description.lower() not in seen_mappings:
                seen_mappings.add(description.lower())
                new_description = vendor_mappings[description.lower()]
                logger.info(f"DEBUG: Mapping applied - '{description}' -> '{new_description}'")
                description = new_description
            
            # Final description after following the mapping chain
            if original_description != description:
                logger.info(f"DEBUG: Final mapping result - '{original_description}' -> '{description}'")

            if description not in grouped_transactions:
                grouped_transactions[description] = {
                    'description': description,
                    'max_date': tx.transaction_date,
                    'transaction_ids': [],
                    'previews': []
                }

            # --- Build Preview Data ---
            grouped_transactions[description]['previews'].append({
                 'id': tx.id,
                 'date': tx.transaction_date,
                 'description': original_description,
                 'amount': tx.original_amount,
                 'currency': tx.original_currency,
                 'direction': tx.direction,
                 'signed_amount': tx.signed_original_amount,
                 'source_account': tx.source_account_identifier,
                 'counterparty': tx.counterparty_identifier,
                 'code': tx.source_code,
                 'type': tx.source_type,
                 'notifications': tx.source_notifications,
            })

            grouped_transactions[description]['transaction_ids'].append(tx.id)

        # Convert dict to list and sort by date
        sorted_groups = sorted(
            grouped_transactions.values(),
            key=lambda group: group['max_date'],
            reverse=True
        )

        # Add counts and earliest date
        for group in sorted_groups:
            group['count'] = len(group['transaction_ids'])
            if group['previews']:
                 group['earliest_date'] = min(p['date'] for p in group['previews'])
            else:
                 group['earliest_date'] = None

        logger.info(f"Found {len(sorted_groups)} groups of hidden transactions for user {user.id}, sorted by most recent.")
        return Response(sorted_groups, status=status.HTTP_200_OK)
    
class CategoryListCreateView(generics.ListCreateAPIView):
    """
    API endpoint to list accessible categories (System + User's Own)
    and create new custom categories for the authenticated user.
    It now also includes 'vendor' nodes derived from DescriptionMappings.
    """
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination # Added pagination

    def get_queryset(self):
        """
        This view should return a list of all system categories
        plus categories owned by the currently authenticated user.
        Prefetch related description mappings for efficiency when constructing vendor nodes.
        """
        user = self.request.user
        # Use Q objects for OR condition: user is None OR user is the current user
        # Prefetch description mappings assigned to these categories
        return Category.objects.filter(
            Q(user__isnull=True) | Q(user=user)
        ).distinct().prefetch_related('mapped_descriptions')

    def list(self, request, *args, **kwargs):
        """
        Custom list method to include vendor nodes alongside categories.
        Handles pagination properly by adding vendors to the paginated results.
        """
        user = self.request.user
        queryset = self.filter_queryset(self.get_queryset())

        # Apply pagination to the queryset of categories
        page = self.paginate_queryset(queryset)
        if page is not None:
            category_serializer = self.get_serializer(page, many=True)
            categories_data = category_serializer.data
            # Add type: 'category' to all category objects in the current page
            for cat_data in categories_data:
                cat_data['type'] = 'category'
            
            # Add vendor nodes to the tree - only include vendors assigned to categories
            vendors = Vendor.objects.filter(user=user, parent_category__isnull=False)
            vendor_nodes = []
            for vendor in vendors:
                vendor_nodes.append({
                    'id': f"vendor-{vendor.id}", 
                    'name': vendor.display_name or vendor.name,
                    'type': 'vendor',
                    'parent': vendor.parent_category_id, 
                    'user': user.id, 
                    'is_custom': True,
                    'vendor_id': vendor.id,  # Include actual vendor ID for operations
                })
            
            # Combine categories and vendor nodes for this page
            combined_data_for_this_page = categories_data + vendor_nodes
            
            # Get the paginated response structure and modify it to include vendor nodes
            paginated_response = self.get_paginated_response(combined_data_for_this_page)
            
            return paginated_response

        # Fallback if not paginated (should not happen with pagination_class set)
        category_serializer = self.get_serializer(queryset, many=True)
        categories_data = category_serializer.data
        for cat_data in categories_data:
            cat_data['type'] = 'category'
        # Add vendor nodes for non-paginated response - only include vendors assigned to categories
        vendors = Vendor.objects.filter(user=user, parent_category__isnull=False)
        vendor_nodes = []
        for vendor in vendors:
            vendor_nodes.append({
                'id': f"vendor-{vendor.id}", 
                'name': vendor.display_name or vendor.name,
                'type': 'vendor',
                'parent': vendor.parent_category_id, 
                'user': user.id, 
                'is_custom': True,
                'vendor_id': vendor.id,
            })
        combined_data = categories_data + vendor_nodes
        return Response(combined_data)

    def perform_create(self, serializer):
        """
        Automatically set the user field to the logged-in user
        when creating a new category.
        Also pass request context to serializer for validation.
        """
        # Ensure the parent is valid before saving
        parent = serializer.validated_data.get('parent')
        if parent and parent.user is not None and parent.user != self.request.user:
             # This validation is also in the serializer, but belt-and-suspenders here
             raise serializers.ValidationError({"parent": "Invalid parent category selected."})

        serializer.save(user=self.request.user) # Assign current user

    def get_serializer_context(self):
        """Pass request to serializer context for validation."""
        return {'request': self.request}

class CategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    API endpoint to retrieve, update, or delete a specific category.
    Permissions ensure users can only modify their own custom categories.
    """
    serializer_class = CategorySerializer
    # Apply custom permission AFTER ensuring user is authenticated
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrSystemReadOnly]
    lookup_field = 'pk' # Default, explicit is fine

    def get_queryset(self):
        user = self.request.user
        logger.info(f"Listing categories for user: {user.id if user else 'Anonymous'}") # Log user
        queryset = Category.objects.filter(Q(user__isnull=True) | Q(user=user)).distinct()
        logger.info(f"Queryset count before serialization: {queryset.count()}") # Log count
        for cat in queryset: # Log individual items
            logger.info(f"  - Category ID: {cat.id}, Name: {cat.name}, User: {cat.user_id}")
        return queryset

    def perform_update(self, serializer):
        """Ensure user context is available for serializer validation during update."""
        serializer.save() # User field is read-only, won't be changed

    def get_serializer_context(self):
        """Pass request to serializer context for validation."""
        return {'request': self.request}
    
    def destroy(self, request, *args, **kwargs):
        category_to_delete = self.get_object() # Checks permissions via get_queryset
        user = request.user

        # Permission IsOwnerOrSystemReadOnly already ensures only owned custom categories can be deleted.
        # System categories (category_to_delete.user is None) will be blocked by the permission class.
        
        logger.info(f"User {user.id}: Attempting to delete category ID {category_to_delete.id} ('{category_to_delete.name}')")

        try:
            with db_transaction.atomic():
                # 1. Handle Transactions: Set category to null
                transactions_updated_count = Transaction.objects.filter(category=category_to_delete).update(category=None, updated_at=datetime.now(timezone.utc))
                logger.info(f"User {user.id}: Unassigned {transactions_updated_count} transactions from deleted category '{category_to_delete.name}'.")

                # 2. Handle Child Categories: Promote children
                children_promoted_count = 0
                new_parent = category_to_delete.parent # Could be None if it was a top-level category
                for child_category in Category.objects.filter(parent=category_to_delete):
                    child_category.parent = new_parent
                    child_category.save(update_fields=['parent', 'updated_at'])
                    children_promoted_count += 1
                if children_promoted_count > 0:
                    logger.info(f"User {user.id}: Promoted {children_promoted_count} child categories of '{category_to_delete.name}'.")

                # 3. Handle Description Mappings: Set assigned_category to null
                mappings_updated_count = DescriptionMapping.objects.filter(assigned_category=category_to_delete).update(assigned_category=None, updated_at=datetime.now(timezone.utc))
                if mappings_updated_count > 0:
                    logger.info(f"User {user.id}: Unassigned {mappings_updated_count} description mapping rules from deleted category '{category_to_delete.name}'.")
                
                # 4. Delete the category itself
                category_name = category_to_delete.name # Store for logging before deletion
                category_to_delete.delete()
                logger.info(f"User {user.id}: Successfully deleted category '{category_name}'.")

            return Response(status=status.HTTP_204_NO_CONTENT)

        except Exception as e:
            logger.error(f"User {user.id}: Error during deletion of category '{category_to_delete.name}': {e}", exc_info=True)
            return Response({"error": "An error occurred while trying to delete the category."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class CategoryNamesSearchView(generics.ListAPIView):
    """
    API endpoint to search category names for autocomplete functionality.
    Similar to VendorNamesSearchView but for categories.
    """
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = None  # Disable pagination for autocomplete

    def get_queryset(self):
        """
        Return categories accessible to the user (system + their own)
        filtered by search query.
        """
        user = self.request.user
        search_query = self.request.query_params.get('q', '')
        
        if not search_query or len(search_query.strip()) < 1:
            return Category.objects.none()
        
        # Search in both system categories and user's categories
        queryset = Category.objects.filter(
            Q(user__isnull=True) | Q(user=user)
        ).filter(
            name__icontains=search_query.strip()
        ).distinct()
        
        return queryset

    def list(self, request, *args, **kwargs):
        """
        Return a simple list of category names for autocomplete.
        """
        queryset = self.get_queryset()
        category_names = list(queryset.values_list('name', flat=True).order_by('name'))
        return Response(category_names)

# --- Vendor Views ---
class VendorListCreateView(generics.ListCreateAPIView):
    """
    API endpoint to list accessible vendors (System + User's Own)
    and create new custom vendors for the authenticated user.
    """
    serializer_class = VendorSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend, OrderingFilter]
    ordering_fields = ['name', 'created_at', 'updated_at']
    ordering = ['name']  # Default alphabetical sort

    def get_queryset(self):
        """
        This view should return a list of all system vendors
        plus vendors owned by the currently authenticated user.
        Supports search filtering via 'search' query parameter.
        """
        user = self.request.user
        queryset = Vendor.objects.filter(
            Q(user__isnull=True) | Q(user=user)
        ).distinct()
        
        # Add search functionality
        search_query = self.request.query_params.get('search', None)
        if search_query:
            queryset = queryset.filter(name__icontains=search_query)
            
        return queryset

    def perform_create(self, serializer):
        """
        Automatically set the user field to the logged-in user
        when creating a new vendor.
        """
        serializer.save(user=self.request.user)

    def get_serializer_context(self):
        """Pass request to serializer context for validation."""
        return {'request': self.request}

class VendorDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    API endpoint to retrieve, update, or delete a specific vendor.
    Permissions ensure users can only modify their own custom vendors.
    """
    serializer_class = VendorSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrSystemReadOnly]
    lookup_field = 'pk'

    def get_queryset(self):
        """
        Return vendors accessible to the user (only their own vendors).
        """
        user = self.request.user
        return Vendor.objects.filter(user=user)

    def perform_update(self, serializer):
        """Handle vendor updates, including vendor rule handling when moving vendors."""
        vendor = self.get_object()
        old_parent_category = vendor.parent_category
        new_parent_category = serializer.validated_data.get('parent_category')
        
        # Check if vendor is being moved (parent_category changed)
        if old_parent_category != new_parent_category:
            from .models import VendorRule
            # Check if vendor has existing rules
            existing_rule = VendorRule.objects.filter(vendor=vendor).first()
            
            if existing_rule:
                # If vendor has rules and is being moved, we need to handle this
                # For now, we'll allow the move but the frontend should prompt the user
                # The actual rule handling logic will be in a separate endpoint
                logger.info(f"Vendor {vendor.id} with existing rule {existing_rule.id} is being moved from category {old_parent_category} to {new_parent_category}")
        
        serializer.save()  # User field is read-only, won't be changed

    def get_serializer_context(self):
        """Pass request to serializer context for validation."""
        return {'request': self.request}

    def destroy(self, request, *args, **kwargs):
        """
        Handle vendor deletion with proper cleanup of related transactions.
        """
        vendor_to_delete = self.get_object()  # Checks permissions via get_queryset
        user = request.user

        logger.info(f"User {user.id}: Attempting to delete vendor ID {vendor_to_delete.id} ('{vendor_to_delete.name}')")

        try:
            with db_transaction.atomic():
                # 1. Handle Transactions: Set vendor to null (SET_NULL behavior)
                transactions_updated_count = Transaction.objects.filter(vendor=vendor_to_delete).update(
                    vendor=None, 
                    updated_at=datetime.now(timezone.utc)
                )
                logger.info(f"User {user.id}: Unassigned {transactions_updated_count} transactions from deleted vendor '{vendor_to_delete.name}'.")

                # 2. Delete the vendor itself
                vendor_name = vendor_to_delete.name  # Store for logging before deletion
                vendor_to_delete.delete()
                logger.info(f"User {user.id}: Successfully deleted vendor '{vendor_name}'.")

            return Response(status=status.HTTP_204_NO_CONTENT)

        except Exception as e:
            logger.error(f"User {user.id}: Error during deletion of vendor '{vendor_to_delete.name}': {e}", exc_info=True)
            return Response({"error": "An error occurred while trying to delete the vendor."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class VendorNamesSearchView(APIView):
    """
    API endpoint to search for vendor names for autocomplete functionality.
    Returns only vendor names, not full vendor objects, for better performance.
    
    GET /api/vendors/search_names/?q=search_term
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        search_query = request.query_params.get('q', '').strip()
        if not search_query:
            return Response([], status=status.HTTP_200_OK)

        user = request.user
        
        # Get vendor names from multiple sources:
        # 1. Vendor objects, 2. VendorMapping mapped_vendor values, 3. Transaction descriptions
        
        # 1. Get names from Vendor objects (system + user's own)
        vendor_names = set(
            Vendor.objects.filter(
                Q(user__isnull=True) | Q(user=user)
            ).filter(
                name__icontains=search_query
            ).values_list('name', flat=True)
        )
        
        # 2. Get mapped vendor names from VendorMapping (user's own mappings)
        mapped_vendor_names = set(
            VendorMapping.objects.filter(
                user=user
            ).filter(
                mapped_vendor__icontains=search_query
            ).values_list('mapped_vendor', flat=True)
        )
        
        # 3. Get unique transaction descriptions that match (user's own transactions)
        transaction_descriptions = set(
            Transaction.objects.filter(
                user=user
            ).filter(
                description__icontains=search_query
            ).values_list('description', flat=True).distinct()
        )
        
        # Combine and sort all unique names
        all_names = sorted(vendor_names.union(mapped_vendor_names).union(transaction_descriptions))
        
        # Limit results to avoid overwhelming the UI
        return Response(all_names[:20], status=status.HTTP_200_OK)

class TransactionCSVUploadView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def get_expected_headers(self, currency_code):
        """Generate expected headers based on the account currency"""
        return [
            "Date", "Name / Description", "Account", "Counterparty",
            "Code", "Debit/credit", f"Amount ({currency_code})", "Transaction type",
            "Notifications"
        ]

    def post(self, request, *args, **kwargs):
        logger.info(f"CSV Upload initiated by user: {request.user.username} ({request.user.id})")
        file_obj = request.FILES.get('file')
        current_user = request.user
        
        # --- NEW: Get account base currency from request ---
        account_base_currency = request.data.get('account_base_currency', 'EUR').upper()
        
        # Validate currency code
        if len(account_base_currency) != 3:
            return Response({'error': 'account_base_currency must be a 3-letter currency code'}, 
                          status=status.HTTP_400_BAD_REQUEST)
        
        # --- CSV Currency is now dynamic based on account ---
        CSV_FILE_CURRENCY = account_base_currency
        # Get dynamic expected headers based on currency
        EXPECTED_HEADERS = self.get_expected_headers(account_base_currency)
        # --- End Currency Setup ---

        if not file_obj: # ... (file validation as before) ...
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if not file_obj.name.lower().endswith('.csv'):
             return Response({'error': 'Invalid file type. Please upload a CSV file.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            decoded_file = file_obj.read().decode('utf-8')
            io_string = io.StringIO(decoded_file)
            reader = csv.reader(io_string)
            try:
                headers = next(reader)
            except StopIteration:
                 return Response({'error': 'CSV file is empty or contains only headers.'}, status=status.HTTP_400_BAD_REQUEST)
            # ... (header validation logic remains the same) ...
            normalized_headers = [h.strip().lower() for h in headers]
            normalized_expected = [h.strip().lower() for h in EXPECTED_HEADERS]
            if normalized_headers != normalized_expected:
                 error_detail = "CSV headers do not match expected format. Please ensure columns are: " + ", ".join(EXPECTED_HEADERS)
                 return Response({'error': error_detail}, status=status.HTTP_400_BAD_REQUEST)

            potential_transactions_data = []
            errors = []
            processed_rows = 0
            min_date, max_date = None, None

            logger.info(f"User {current_user.id}: Phase 1 - Parsing CSV (Assumed Currency: {CSV_FILE_CURRENCY})...")
            for i, row in enumerate(reader, start=1):
                processed_rows += 1
                if len(row) != len(EXPECTED_HEADERS): # ... (skip row logic) ...
                    errors.append(f"Row {i+1}: Incorrect number of columns ({len(row)}), expected {len(EXPECTED_HEADERS)}. Row skipped.")
                    continue
                try:
                    raw_date_str, raw_description, raw_account, raw_counterparty, raw_code, raw_debit_credit_str, raw_amount_str, raw_type, raw_notify = [r.strip() for r in row]
                    raw_debit_credit = raw_debit_credit_str.upper()
                    
                    transaction_date_obj = datetime.strptime(raw_date_str, '%Y%m%d').date()
                    parsed_amount = Decimal(raw_amount_str.replace(',', '.'))
                    if parsed_amount < 0: raise ValueError("Amount in CSV should be positive.")
                    if raw_debit_credit not in ['DEBIT', 'CREDIT']: raise ValueError("Invalid direction.")
                    direction = raw_debit_credit
                    
                    if min_date is None or transaction_date_obj < min_date: min_date = transaction_date_obj
                    if max_date is None or transaction_date_obj > max_date: max_date = transaction_date_obj

                    potential_transactions_data.append({
                        'row_num': i + 1,
                        'transaction_date': transaction_date_obj,
                        'raw_description': raw_description,
                        'original_amount': parsed_amount,
                        'original_currency': CSV_FILE_CURRENCY, # Hardcoded EUR
                        'direction': direction,
                        'source_account_identifier': raw_account or None,
                        'counterparty_identifier': raw_counterparty or None,
                        'source_code': raw_code or None,
                        'source_type': raw_type or None,
                        'source_notifications': raw_notify or None,
                    })
                except ValueError as ve: errors.append(f"Row {i+1}: {str(ve)}")
                except Exception as e:
                    errors.append(f"Row {i+1}: Unexpected processing error.")
                    logger.error(f"Row {i+1} CSV processing error: {e}", exc_info=True)

            logger.info(f"User {current_user.id}: Phase 1 Complete - Processed {processed_rows} data rows from CSV.")

            # --- Phase 2: Query Existing (Duplicate Check) ---
            # ... (duplicate check logic remains the same, uses 'original_amount' and 'original_currency') ...
            existing_keys_for_duplicate_check = set()
            if potential_transactions_data:
                logger.info(f"User {current_user.id}: Phase 2 - Querying database for potential duplicates...")
                queryset = Transaction.objects.filter(user=current_user, source='csv')
                if min_date and max_date: queryset = queryset.filter(transaction_date__range=(min_date, max_date))
                existing_keys_for_duplicate_check = set(
                    (tx.transaction_date, tx.original_amount, tx.direction, tx.description, tx.original_currency)
                    for tx in queryset.only('transaction_date', 'original_amount', 'direction', 'description', 'original_currency')
                )
                logger.info(f"User {current_user.id}: Phase 2 Complete - Found {len(existing_keys_for_duplicate_check)} potentially relevant existing CSV transaction keys.")


            # --- Phase 3: Filter, Convert, Build Final List ---
            # ... (logic for description mapping, duplicate check using key, and currency conversion is largely the same) ...
            # ... (The original_currency for conversion will now always be CSV_FILE_CURRENCY for items from this view) ...
            logger.info(f"User {current_user.id}: Phase 3 - Filtering, converting, building transaction list...")
            transactions_to_create = []
            duplicate_count = 0
            skipped_conversion_error_count = 0
            applied_rules_count = 0
            user_mappings = { m.original_description.strip().lower(): m for m in DescriptionMapping.objects.filter(user=current_user) }
            
            # Get vendor mappings for the user
            from .models import VendorMapping
            vendor_mappings = VendorMapping.objects.filter(user=current_user)
            vendor_mapping_dict = {vm.original_name.lower(): vm.mapped_vendor for vm in vendor_mappings}

            for data_item in potential_transactions_data:
                raw_description = data_item['raw_description']
                final_description = raw_description
                assigned_category = None
                matched_mapping = user_mappings.get(raw_description.strip().lower())
                if matched_mapping:
                    final_description = matched_mapping.clean_name
                    assigned_category = matched_mapping.assigned_category
                    if assigned_category: applied_rules_count += 1

                duplicate_check_key = (
                    data_item['transaction_date'], data_item['original_amount'],
                    data_item['direction'], final_description, data_item['original_currency']
                )
                if duplicate_check_key in existing_keys_for_duplicate_check:
                    duplicate_count += 1
                    continue

                aud_amount_val, exchange_rate_val = None, None
                original_currency_code = data_item['original_currency']

                # --- MODIFIED SECTION FOR CURRENCY CONVERSION ---
                # ALWAYS attempt conversion, regardless of auto-categorization.
                if original_currency_code == BASE_CURRENCY_FOR_CONVERSION:
                    aud_amount_val = data_item['original_amount']
                    exchange_rate_val = Decimal("1.0")
                else:
                    # It's okay to attempt conversion even for future dates here, 
                    # get_historical_rate will handle date validation (e.g., max_days_gap)
                    rate = get_historical_rate( 
                        data_item['transaction_date'], 
                        original_currency_code, 
                        BASE_CURRENCY_FOR_CONVERSION
                    )
                    if rate is not None:
                        aud_amount_val = (data_item['original_amount'] * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                        exchange_rate_val = rate
                    else:
                        skipped_conversion_error_count += 1
                        logger.warning(f"User {current_user.id} - Row {data_item['row_num']}: Rate fetch failed for {original_currency_code}->{BASE_CURRENCY_FOR_CONVERSION} on {data_item['transaction_date']}.")
                # --- END OF MODIFIED SECTION ---

                # --- NEW VENDOR MAPPING LOGIC ---
                # Extract original vendor name from CSV data
                counterparty = data_item.get('counterparty_identifier') or ''
                original_vendor_name = counterparty.strip()
                if not original_vendor_name:
                    # Fallback to description if no counterparty
                    original_vendor_name = final_description.split(' - ')[0].split(' | ')[0].strip()
                if not original_vendor_name:
                    original_vendor_name = 'Unknown Vendor'
                
                # Check for vendor mapping
                mapped_vendor_name = vendor_mapping_dict.get(original_vendor_name.lower())
                vendor_name = mapped_vendor_name if mapped_vendor_name else original_vendor_name
                # --- END VENDOR MAPPING LOGIC ---

                transactions_to_create.append(
                    Transaction(
                        user=current_user, category=assigned_category, description=final_description,
                        transaction_date=data_item['transaction_date'],
                        original_amount=data_item['original_amount'], original_currency=original_currency_code,
                        direction=data_item['direction'], aud_amount=aud_amount_val, exchange_rate_to_aud=exchange_rate_val,
                        account_base_currency=account_base_currency,
                        source='csv', bank_transaction_id=None,
                        source_account_identifier=data_item['source_account_identifier'],
                        counterparty_identifier=data_item['counterparty_identifier'],
                        source_code=data_item['source_code'], source_type=data_item['source_type'],
                        source_notifications=data_item['source_notifications'],
                        # New vendor name fields
                        original_vendor_name=original_vendor_name,
                        vendor_name=vendor_name,
                        auto_categorized=False,  # Will be set to True by auto-categorization if a rule is applied
                    )
                )
            # ... (Phase 4: Bulk Create and Phase 5: Prepare Response - logic remains the same) ...
            logger.info(f"User {current_user.id}: Phase 3 Complete. Dups: {duplicate_count}. New: {len(transactions_to_create)}. Convert Errors: {skipped_conversion_error_count}.")
            created_count = 0
            auto_categorized_count = 0
            if transactions_to_create:
                try:
                    with db_transaction.atomic():
                        created_objects = Transaction.objects.bulk_create(transactions_to_create)
                        created_count = len(created_objects)
                    logger.info(f"User {current_user.id}: Phase 4 Complete - Created {created_count} transactions from CSV.")
                    
                    # Get the newly created transaction IDs for subsequent processing
                    new_transaction_ids = [obj.id for obj in created_objects if obj.id] if created_count > 0 else []
                    
                    # Phase 4.5: Identify and assign vendors to newly created transactions
                    vendor_identified_count = 0
                    vendor_created_count = 0
                    if created_count > 0:
                        logger.info(f"User {current_user.id}: Phase 4.5 - Starting vendor identification for {created_count} new transactions...")
                        try:
                            from .vendor_identification_service import identify_vendors_for_user_transactions
                            
                            # Create queryset of newly created transactions for vendor identification
                            new_transactions_qs = Transaction.objects.filter(
                                id__in=new_transaction_ids,
                                user=current_user
                            )
                            
                            # Apply vendor identification to the new transactions
                            vendor_result = identify_vendors_for_user_transactions(
                                current_user,
                                transactions=new_transactions_qs
                            )
                            vendor_identified_count = vendor_result.identified_count
                            vendor_created_count = vendor_result.created_vendors_count
                            
                            logger.info(f"User {current_user.id}: Phase 4.5 Complete - Identified vendors for {vendor_identified_count} "
                                       f"out of {created_count} new transactions. "
                                       f"Created {vendor_created_count} new vendors. "
                                       f"Skipped: {vendor_result.skipped_count}, "
                                       f"Errors: {vendor_result.error_count}")
                        except Exception as e:
                            logger.error(f"User {current_user.id}: Vendor identification failed during CSV upload: {e}", exc_info=True)
                            # Don't fail the upload if vendor identification fails
                    
                    # Phase 5: Apply auto-categorization to newly created transactions
                    if created_count > 0:
                        logger.info(f"User {current_user.id}: Phase 5 - Starting auto-categorization for {created_count} new transactions...")
                        try:
                            from .auto_categorization_service import auto_categorize_user_transactions
                            
                            if new_transaction_ids:
                                # Create queryset of newly created transactions for auto-categorization
                                new_transactions_qs = Transaction.objects.filter(
                                    id__in=new_transaction_ids,
                                    user=current_user
                                )
                                
                                # Apply auto-categorization only to the new transactions
                                categorization_result = auto_categorize_user_transactions(
                                    current_user,
                                    transactions=new_transactions_qs
                                )
                                auto_categorized_count = categorization_result.categorized_count
                                
                                logger.info(f"User {current_user.id}: Phase 5 Complete - Auto-categorized {auto_categorized_count} "
                                           f"out of {created_count} new transactions. "
                                           f"Skipped: {categorization_result.skipped_count}, "
                                           f"Errors: {categorization_result.error_count}")
                            else:
                                logger.warning(f"User {current_user.id}: Phase 5 - No transaction IDs available for auto-categorization")
                                
                        except Exception as e:
                            logger.error(f"User {current_user.id}: Auto-categorization failed during CSV upload: {e}", exc_info=True)
                            # Don't fail the entire upload if auto-categorization fails
                            
                except Exception as e:
                    errors.append(f"Database error: {str(e)}.")
                    logger.error(f"User {current_user.id}: DB error CSV txns: {e}", exc_info=True)

            error_count = len(errors)
            message = f"CSV (Assumed {CSV_FILE_CURRENCY}) processed. Found {processed_rows} data rows."
            if created_count > 0: message += f" Imported {created_count} new transactions."
            else: message += " No new transactions were imported."
            if duplicate_count > 0: message += f" Skipped {duplicate_count} potential duplicates."
            if applied_rules_count > 0: message += f" Applied {applied_rules_count} description rules."
            if vendor_identified_count > 0: message += f" Identified vendors for {vendor_identified_count} transactions."
            if vendor_created_count > 0: message += f" Created {vendor_created_count} new vendors."
            if auto_categorized_count > 0: message += f" Auto-categorized {auto_categorized_count} transactions using vendor rules."
            if skipped_conversion_error_count > 0: message += f" Failed to convert currency for {skipped_conversion_error_count} transactions to {BASE_CURRENCY_FOR_CONVERSION}."
            if error_count > 0: message += f" Encountered {error_count} errors."

            response_status = status.HTTP_200_OK
            if created_count > 0: response_status = status.HTTP_201_CREATED
            elif error_count > 0 and not transactions_to_create and processed_rows > 0: response_status = status.HTTP_400_BAD_REQUEST

            return Response({
                'message': message, 
                'imported_count': created_count, 
                'duplicate_count': duplicate_count,
                'vendor_identified_count': vendor_identified_count,  # New: vendor identification count
                'vendor_created_count': vendor_created_count,  # New: new vendors created count
                'auto_categorized_count': auto_categorized_count,  # New: vendor rule auto-categorization count
                'description_rules_applied_count': applied_rules_count,  # Renamed for clarity 
                'conversion_error_count': skipped_conversion_error_count,
                'total_rows_processed': processed_rows, 
                'errors': errors
            }, status=response_status)

        except UnicodeDecodeError: # ... (exception handling as before) ...
            logger.error(f"User {current_user.id}: CSV Upload failed due to encoding error.")
            return Response({'error': 'Failed to decode file. Please ensure it is UTF-8 encoded.'}, status=status.HTTP_400_BAD_REQUEST)
        except csv.Error as e:
            logger.error(f"User {current_user.id}: CSV parsing error: {e}")
            return Response({'error': f'Error parsing CSV file: {e}'}, status=status.HTTP_400_BAD_REQUEST)
        except StopIteration:
             logger.warning(f"User {current_user.id}: CSV file was empty after headers.")
             return Response({'error': 'CSV file appears to be empty or contain only headers.'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.exception(f"User {current_user.id}: Unexpected error during CSV upload processing: {str(e)}")
            return Response({'error': 'An unexpected server error occurred during CSV processing.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# --- NEW: Dashboard Balance API View ---
class DashboardBalanceView(views.APIView):
    """
    API endpoint to calculate and return the user's account holdings 
    in a specified currency using account-based aggregation.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        target_currency = request.GET.get('target_currency', BASE_CURRENCY_FOR_CONVERSION).upper()
        
        logger.info(f"User {user.id}: Calculating account-based holdings balance for target currency: {target_currency}")
        
        # Step 1: Get all user transactions
        transactions = Transaction.objects.filter(user=user).select_related('category')
        logger.debug(f"User {user.id}: Processing {transactions.count()} transactions for account holdings")
        
        # Step 2: Aggregate by account base currency using account amounts
        account_holdings = defaultdict(Decimal)
        transaction_counts = defaultdict(int)
        
        for tx in transactions:
            # Use account_amount property which handles Up Bank vs CSV logic
            account_amount = tx.signed_account_amount
            if account_amount is not None:
                if tx.source == 'up_bank':
                    # Up Bank transactions are always AUD holdings
                    account_holdings['AUD'] += account_amount
                    transaction_counts['AUD'] += 1
                else:
                    # CSV transactions use their account's base currency
                    account_holdings[tx.account_base_currency] += account_amount
                    transaction_counts[tx.account_base_currency] += 1
                   
                logger.debug(f"User {user.id}: Transaction {tx.id} - {account_amount} {tx.account_base_currency if tx.source != 'up_bank' else 'AUD'}")
        
        # Step 3: Convert holdings to target currency for display
        total_balance = Decimal('0.00')
        holdings_breakdown = []
        conversion_failures = []
        
        for currency, holding_amount in account_holdings.items():
            if currency == target_currency:
                converted_amount = holding_amount
                exchange_rate = Decimal('1.0')
                logger.debug(f"User {user.id}: {currency} holding is target currency, no conversion needed: {holding_amount}")
                include_in_total = True
            else:
                exchange_rate = get_current_exchange_rate(currency, target_currency)
                if exchange_rate:
                    converted_amount = holding_amount * exchange_rate
                    logger.debug(f"User {user.id}: Converted {holding_amount} {currency} to {converted_amount} {target_currency} at rate {exchange_rate}")
                    include_in_total = True
                else:
                    logger.warning(f"User {user.id}: No exchange rate available for {currency} -> {target_currency}")
                    converted_amount = Decimal('0.00')  # Set to 0 for display, but still show the holding
                    exchange_rate = None
                    include_in_total = False
                    conversion_failures.append({
                        'currency': currency,
                        'amount': str(holding_amount),
                        'reason': 'missing_exchange_rate'
                    })
            
            # Always add to holdings breakdown, even if conversion failed
            if include_in_total:
                total_balance += converted_amount
            
            holdings_breakdown.append({
                'currency': currency,
                'holding_amount': holding_amount.quantize(Decimal('0.01')),
                'converted_amount': converted_amount.quantize(Decimal('0.01')) if converted_amount else None,
                'exchange_rate': exchange_rate.quantize(Decimal('0.000001')) if exchange_rate else None,
                'transaction_count': transaction_counts[currency],
                'is_target_currency': currency == target_currency,
                'conversion_failed': not include_in_total
            })
        
        # Step 4: Calculate transaction counts
        total_transactions = transactions.count()
        successfully_converted_transactions = sum(breakdown['transaction_count'] for breakdown in holdings_breakdown)
        
        # Step 5: Return account holdings response
        logger.info(f"User {user.id}: Account holdings calculated. Total: {total_balance:.2f} {target_currency}. Holdings in {len(holdings_breakdown)} currencies. Conversion failures: {len(conversion_failures)}")
        
        return Response({
            'balance': total_balance.quantize(Decimal('0.01')),
            'total_balance_in_target_currency': total_balance.quantize(Decimal('0.01')),  # Frontend compatibility
            'currency': target_currency,
            'holdings_breakdown': holdings_breakdown,  # Changed from currency_breakdown
            'conversion_date': django_timezone.now().date().isoformat(),
            'methodology': 'account_holdings',  # Changed from 'current_rates'
            'total_transactions': total_transactions,
            'converted_transactions_count': successfully_converted_transactions,
            'conversion_failures': conversion_failures,
            'account_count': len(holdings_breakdown),  # NEW: Number of different account currencies
            'metadata': {
                'calculation_method': 'Account-based holdings aggregation',
                'up_bank_handling': 'Uses aud_amount (authoritative bank deduction)',
                'csv_handling': 'Uses original_amount in account base currency',
                'conversion_purpose': 'Display only - core holdings remain in native currencies'
            }
        })

# --- NEW: Analytics API Views for Visualization Page ---

class BalanceOverTimeView(views.APIView):
    """
    API endpoint to return balance progression over time for charting.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        target_currency = request.GET.get('target_currency', BASE_CURRENCY_FOR_CONVERSION).upper()
        
        # Get date range parameters
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        
        logger.info(f"User {user.id}: Getting balance over time for {target_currency}")
        
        # Get transactions within date range
        transactions = Transaction.objects.filter(user=user).order_by('transaction_date', 'id')
        
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
                transactions = transactions.filter(transaction_date__gte=start_date)
            except ValueError:
                return Response({'error': 'Invalid start_date format. Use YYYY-MM-DD'}, 
                              status=status.HTTP_400_BAD_REQUEST)
        
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
                transactions = transactions.filter(transaction_date__lte=end_date)
            except ValueError:
                return Response({'error': 'Invalid end_date format. Use YYYY-MM-DD'}, 
                              status=status.HTTP_400_BAD_REQUEST)
        
        # Calculate running balance by date
        balance_data = []
        running_balance = Decimal('0.00')
        current_date = None
        daily_balance = Decimal('0.00')
        
        for tx in transactions:
            # If we've moved to a new date, record the previous day's balance
            if current_date and tx.transaction_date != current_date:
                balance_data.append({
                    'date': current_date.isoformat(),
                    'balance': running_balance.quantize(Decimal('0.01')),
                    'formatted_balance': f"{target_currency} {running_balance:.2f}"
                })
                daily_balance = Decimal('0.00')
            
            current_date = tx.transaction_date
            
            # Add transaction amount to running balance
            if tx.source == 'up_bank':
                amount = tx.signed_aud_amount or Decimal('0.00')
            else:
                amount = tx.signed_account_amount or Decimal('0.00')
                
            # Convert to target currency if needed
            if tx.account_base_currency != target_currency and tx.source != 'up_bank':
                rate = get_current_exchange_rate(tx.account_base_currency, target_currency)
                if rate:
                    amount = amount * rate
                    
            running_balance += amount
            daily_balance += amount
        
        # Don't forget the last date
        if current_date:
            balance_data.append({
                'date': current_date.isoformat(),
                'balance': running_balance.quantize(Decimal('0.01')),
                'formatted_balance': f"{target_currency} {running_balance:.2f}"
            })
        
        return Response({
            'balance_over_time': balance_data,
            'currency': target_currency,
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None,
            'final_balance': running_balance.quantize(Decimal('0.01')),
            'total_transactions': transactions.count()
        })


class CategorySpendingView(views.APIView):
    """
    API endpoint to return spending breakdown by category for pie charts.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        target_currency = request.GET.get('target_currency', BASE_CURRENCY_FOR_CONVERSION).upper()
        
        # Get date range parameters
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        category_level = request.GET.get('level', 'subcategory')  # 'category' or 'subcategory'
        
        logger.info(f"User {user.id}: Getting category spending breakdown")
        
        # Get categorized transactions only (exclude uncategorized and hidden)
        transactions = Transaction.objects.filter(
            user=user,
            category__isnull=False,
            is_hidden=False,
            direction='DEBIT'  # Only expenses
        ).select_related('category', 'category__parent')
        
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
                transactions = transactions.filter(transaction_date__gte=start_date)
            except ValueError:
                return Response({'error': 'Invalid start_date format. Use YYYY-MM-DD'}, 
                              status=status.HTTP_400_BAD_REQUEST)
        
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
                transactions = transactions.filter(transaction_date__lte=end_date)
            except ValueError:
                return Response({'error': 'Invalid end_date format. Use YYYY-MM-DD'}, 
                              status=status.HTTP_400_BAD_REQUEST)
        
        # Aggregate spending by category
        category_totals = defaultdict(Decimal)
        category_details = {}
        
        for tx in transactions:
            # Determine which category level to use
            if category_level == 'category':
                # Use parent category if it exists, otherwise the category itself
                category = tx.category.parent if tx.category.parent else tx.category
            else:
                # Use the actual category (subcategory level)
                category = tx.category
            
            category_name = category.name
            
            # Get transaction amount in target currency
            if tx.source == 'up_bank':
                amount = abs(tx.aud_amount or Decimal('0.00'))
            else:
                amount = abs(tx.original_amount or Decimal('0.00'))
                # Convert to target currency if needed
                if tx.account_base_currency != target_currency:
                    rate = get_current_exchange_rate(tx.account_base_currency, target_currency)
                    if rate:
                        amount = amount * rate
            
            category_totals[category_name] += amount
            
            # Store category details for frontend
            category_details[category_name] = {
                'id': category.id,
                'name': category.name,
                'parent_name': category.parent.name if category.parent else None,
                'level': 'parent' if not category.parent else 'child'
            }
        
        # Convert to list format for pie chart
        spending_data = []
        total_spending = sum(category_totals.values())
        
        for category_name, amount in sorted(category_totals.items(), key=lambda x: x[1], reverse=True):
            percentage = (amount / total_spending * 100) if total_spending > 0 else 0
            spending_data.append({
                'category': category_name,
                'amount': amount.quantize(Decimal('0.01')),
                'percentage': round(percentage, 1),
                'formatted_amount': f"{target_currency} {amount:.2f}",
                **category_details[category_name]
            })
        
        return Response({
            'category_spending': spending_data,
            'total_spending': total_spending.quantize(Decimal('0.01')),
            'currency': target_currency,
            'category_level': category_level,
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None,
            'transaction_count': transactions.count()
        })


class IncomeVsExpensesView(views.APIView):
    """
    API endpoint to return monthly income vs expenses data for bar charts.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        target_currency = request.GET.get('target_currency', BASE_CURRENCY_FOR_CONVERSION).upper()
        
        # Get date range parameters
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        
        logger.info(f"User {user.id}: Getting income vs expenses breakdown")
        
        # Get categorized transactions only
        transactions = Transaction.objects.filter(
            user=user,
            category__isnull=False,
            is_hidden=False
        ).select_related('category')
        
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
                transactions = transactions.filter(transaction_date__gte=start_date)
            except ValueError:
                return Response({'error': 'Invalid start_date format. Use YYYY-MM-DD'}, 
                              status=status.HTTP_400_BAD_REQUEST)
        
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
                transactions = transactions.filter(transaction_date__lte=end_date)
            except ValueError:
                return Response({'error': 'Invalid end_date format. Use YYYY-MM-DD'}, 
                              status=status.HTTP_400_BAD_REQUEST)
        
        # Group by month and calculate income/expenses
        monthly_data = defaultdict(lambda: {'income': Decimal('0.00'), 'expenses': Decimal('0.00')})
        
        for tx in transactions:
            month_key = f"{tx.transaction_date.year}-{tx.transaction_date.month:02d}"
            
            # Get transaction amount in target currency
            if tx.source == 'up_bank':
                amount = abs(tx.aud_amount or Decimal('0.00'))
            else:
                amount = abs(tx.original_amount or Decimal('0.00'))
                # Convert to target currency if needed
                if tx.account_base_currency != target_currency:
                    rate = get_current_exchange_rate(tx.account_base_currency, target_currency)
                    if rate:
                        amount = amount * rate
            
            # Categorize as income or expense
            if tx.direction == 'CREDIT':
                monthly_data[month_key]['income'] += amount
            else:  # DEBIT
                monthly_data[month_key]['expenses'] += amount
        
        # Convert to list format for bar chart
        comparison_data = []
        for month_key in sorted(monthly_data.keys()):
            year, month = month_key.split('-')
            month_name = datetime(int(year), int(month), 1).strftime('%B %Y')
            
            income = monthly_data[month_key]['income']
            expenses = monthly_data[month_key]['expenses']
            net_savings = income - expenses
            savings_rate = (net_savings / income * 100) if income > 0 else 0
            
            comparison_data.append({
                'month': month_key,
                'month_name': month_name,
                'income': income.quantize(Decimal('0.01')),
                'expenses': expenses.quantize(Decimal('0.01')),
                'net_savings': net_savings.quantize(Decimal('0.01')),
                'savings_rate': round(savings_rate, 1),
                'formatted_income': f"{target_currency} {income:.2f}",
                'formatted_expenses': f"{target_currency} {expenses:.2f}",
                'formatted_savings': f"{target_currency} {net_savings:.2f}"
            })
        
        # Calculate overall totals
        total_income = sum(item['income'] for item in comparison_data)
        total_expenses = sum(item['expenses'] for item in comparison_data)
        overall_savings_rate = ((total_income - total_expenses) / total_income * 100) if total_income > 0 else 0
        
        return Response({
            'monthly_comparison': comparison_data,
            'currency': target_currency,
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None,
            'totals': {
                'income': total_income.quantize(Decimal('0.01')),
                'expenses': total_expenses.quantize(Decimal('0.01')),
                'net_savings': (total_income - total_expenses).quantize(Decimal('0.01')),
                'savings_rate': round(overall_savings_rate, 1)
            }
        })


class SankeyFlowView(views.APIView):
    """
    API endpoint to return Sankey flow data showing income -> categories -> subcategories.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user
        target_currency = request.GET.get('target_currency', BASE_CURRENCY_FOR_CONVERSION).upper()
        
        # Get date range parameters
        start_date = request.GET.get('start_date')
        end_date = request.GET.get('end_date')
        
        logger.info(f"User {user.id}: Getting Sankey flow data")
        
        # Get categorized transactions only
        transactions = Transaction.objects.filter(
            user=user,
            category__isnull=False,
            is_hidden=False
        ).select_related('category', 'category__parent')
        
        if start_date:
            try:
                start_date = datetime.strptime(start_date, '%Y-%m-%d').date()
                transactions = transactions.filter(transaction_date__gte=start_date)
            except ValueError:
                return Response({'error': 'Invalid start_date format. Use YYYY-MM-DD'}, 
                              status=status.HTTP_400_BAD_REQUEST)
        
        if end_date:
            try:
                end_date = datetime.strptime(end_date, '%Y-%m-%d').date()
                transactions = transactions.filter(transaction_date__lte=end_date)
            except ValueError:
                return Response({'error': 'Invalid end_date format. Use YYYY-MM-DD'}, 
                              status=status.HTTP_400_BAD_REQUEST)
        
        # Calculate flows: Income -> Parent Categories -> Subcategories
        nodes = set()
        links = []
        
        # Track income and spending by category
        income_total = Decimal('0.00')
        parent_category_totals = defaultdict(Decimal)
        subcategory_totals = defaultdict(Decimal)
        
        for tx in transactions:
            # Get transaction amount in target currency
            if tx.source == 'up_bank':
                amount = abs(tx.aud_amount or Decimal('0.00'))
            else:
                amount = abs(tx.original_amount or Decimal('0.00'))
                # Convert to target currency if needed
                if tx.account_base_currency != target_currency:
                    rate = get_current_exchange_rate(tx.account_base_currency, target_currency)
                    if rate:
                        amount = amount * rate
            
            if tx.direction == 'CREDIT':
                # Income
                income_total += amount
                nodes.add('Total Income')
            else:
                # Expenses - track by category hierarchy
                parent_category = tx.category.parent if tx.category.parent else tx.category
                subcategory = tx.category
                
                parent_name = parent_category.name
                subcategory_name = subcategory.name
                
                parent_category_totals[parent_name] += amount
                subcategory_totals[f"{parent_name} > {subcategory_name}"] += amount
                
                nodes.add(parent_name)
                nodes.add(subcategory_name)
        
        # Create flows from Income to Parent Categories
        for parent_name, amount in parent_category_totals.items():
            proportion = amount / income_total if income_total > 0 else 0
            allocated_income = income_total * proportion
            
            links.append({
                'source': 'Total Income',
                'target': parent_name,
                'value': float(allocated_income.quantize(Decimal('0.01'))),
                'formatted_value': f"{target_currency} {allocated_income:.2f}"
            })
        
        # Create flows from Parent Categories to Subcategories
        for subcategory_key, amount in subcategory_totals.items():
            parent_name, subcategory_name = subcategory_key.split(' > ')
            
            links.append({
                'source': parent_name,
                'target': subcategory_name,
                'value': float(amount.quantize(Decimal('0.01'))),
                'formatted_value': f"{target_currency} {amount:.2f}"
            })
        
        # Convert nodes to list with metadata
        node_list = []
        for node in nodes:
            node_list.append({
                'id': node,
                'name': node
            })
        
        return Response({
            'nodes': node_list,
            'links': links,
            'currency': target_currency,
            'start_date': start_date.isoformat() if start_date else None,
            'end_date': end_date.isoformat() if end_date else None,
            'total_income': income_total.quantize(Decimal('0.01')),
            'total_expenses': sum(parent_category_totals.values()).quantize(Decimal('0.01'))
        })

# --- VendorRule Views ---
class VendorRuleListCreateView(generics.ListCreateAPIView):
    """
    API endpoint to list and create vendor rules for the authenticated user.
    Supports filtering by vendor and category.
    """
    serializer_class = VendorRuleSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = StandardResultsSetPagination
    filter_backends = [filters.DjangoFilterBackend, OrderingFilter]
    ordering_fields = ['created_at', 'updated_at']
    ordering = ['-created_at']  # Default: newest first (newest rule wins)

    def get_queryset(self):
        """
        Return vendor rules with vendors/categories accessible to the user.
        Only includes rules for vendors and categories the user can access.
        """
        user = self.request.user
        return VendorRule.objects.filter(
            Q(vendor__user__isnull=True) | Q(vendor__user=user),  # System or user's vendors
            Q(category__user__isnull=True) | Q(category__user=user)  # System or user's categories
        ).select_related('vendor', 'category').distinct()

    def get_serializer_context(self):
        """Pass request to serializer context for validation."""
        return {'request': self.request}

class VendorRuleDetailView(generics.RetrieveUpdateDestroyAPIView):
    """
    API endpoint to retrieve, update, or delete a specific vendor rule.
    Users can only modify rules for vendors/categories they have access to.
    """
    serializer_class = VendorRuleSerializer
    permission_classes = [permissions.IsAuthenticated]
    lookup_field = 'pk'

    def get_queryset(self):
        """
        Return vendor rules with vendors/categories accessible to the user.
        """
        user = self.request.user
        return VendorRule.objects.filter(
            Q(vendor__user__isnull=True) | Q(vendor__user=user),  # System or user's vendors
            Q(category__user__isnull=True) | Q(category__user=user)  # System or user's categories
        ).select_related('vendor', 'category').distinct()

    def get_serializer_context(self):
        """Pass request to serializer context for validation."""
        return {'request': self.request}

    def destroy(self, request, *args, **kwargs):
        """
        Handle vendor rule deletion with proper logging.
        """
        vendor_rule = self.get_object()
        user = request.user

        logger.info(f"User {user.id}: Attempting to delete vendor rule ID {vendor_rule.id} "
                   f"({vendor_rule.vendor.name} -> {vendor_rule.category.name})")

        try:
            with db_transaction.atomic():
                # Store info for logging before deletion
                vendor_name = vendor_rule.vendor.name
                category_name = vendor_rule.category.name
                rule_id = vendor_rule.id
                
                # Delete the vendor rule
                vendor_rule.delete()
                
                logger.info(f"User {user.id}: Successfully deleted vendor rule '{rule_id}' "
                           f"({vendor_name} -> {category_name})")

            return Response(status=status.HTTP_204_NO_CONTENT)

        except Exception as e:
            logger.error(f"User {user.id}: Error during deletion of vendor rule '{vendor_rule.id}': {e}", 
                        exc_info=True)
            return Response(
                {"error": "An error occurred while trying to delete the vendor rule."}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

# --- Auto-Categorization Views ---

class AutoCategorizeTransactionsView(APIView):
    """
    API endpoint to auto-categorize transactions for the authenticated user.
    Supports both batch processing of all uncategorized transactions and 
    force recategorization of already categorized transactions.
    
    POST /api/transactions/auto-categorize/
    Body: {
        "force_recategorize": boolean (optional, default: false),
        "transaction_ids": [int] (optional, if provided only these transactions are processed)
    }
    
    Returns: {
        "categorized_count": int,
        "skipped_count": int,
        "error_count": int,
        "total_processed": int,
        "results": [...] (detailed results for each transaction)
    }
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request, *args, **kwargs):
        user = request.user
        force_recategorize = request.data.get('force_recategorize', False)
        transaction_ids = request.data.get('transaction_ids', None)
        
        logger.info(f"User {user.id}: Starting auto-categorization request. "
                   f"Force recategorize: {force_recategorize}, "
                   f"Specific transactions: {len(transaction_ids) if transaction_ids else 'All'}")
        
        try:
            # Import the service and functions 
            from .auto_categorization_service import (
                AutoCategorizationService,
                auto_categorize_user_transactions
            )
            
            # If specific transaction IDs provided, get only those transactions
            if transaction_ids:
                queryset = Transaction.objects.filter(
                    user=user,
                    id__in=transaction_ids
                ).select_related('vendor', 'category')
                
                logger.info(f"User {user.id}: Processing {queryset.count()} specific transactions")
            else:
                # Use the convenience function for all user transactions
                result = auto_categorize_user_transactions(user, force_recategorize=force_recategorize)
                
                logger.info(f"User {user.id}: Auto-categorization complete. "
                           f"Categorized: {result.categorized_count}, "
                           f"Skipped: {result.skipped_count}, "
                           f"Errors: {result.error_count}")
                
                return Response({
                    'categorized_count': result.categorized_count,
                    'skipped_count': result.skipped_count,
                    'error_count': result.error_count,
                    'total_processed': result.total_processed,
                    'results': [
                        {
                            'transaction_id': tx_id,
                            'status': 'categorized',
                            'rule_applied': rule_id,
                            'category_name': None  # Would need to fetch from rule
                        }
                        for tx_id, rule_id in result.successes.items()
                    ] + [
                        {
                            'transaction_id': tx_id,
                            'status': 'skipped',
                            'reason': reason
                        }
                        for tx_id, reason in result.skips.items()
                                    ] + [
                    {
                        'transaction_id': tx_id,
                        'status': 'error',
                        'reason': str(error)
                    }
                    for tx_id, error in result.error_details.items()
                ]
                }, status=status.HTTP_200_OK)
            
            # Process specific transactions using the service
            service = AutoCategorizationService(user)
            result = service.categorize_transactions(queryset, force_recategorize=force_recategorize)
            
            logger.info(f"User {user.id}: Auto-categorization complete for specific transactions. "
                       f"Categorized: {result.categorized_count}, "
                       f"Skipped: {result.skipped_count}, "
                       f"Errors: {result.error_count}")
            
            return Response({
                'categorized_count': result.categorized_count,
                'skipped_count': result.skipped_count,
                'error_count': result.error_count,
                'total_processed': result.total_processed,
                'results': [
                    {
                        'transaction_id': tx_id,
                        'status': 'categorized',
                        'rule_applied': rule_id,
                        'category_name': None  # Would need to fetch from rule
                    }
                    for tx_id, rule_id in result.successes.items()
                ] + [
                    {
                        'transaction_id': tx_id,
                        'status': 'skipped',
                        'reason': reason
                    }
                    for tx_id, reason in result.skips.items()
                ] + [
                    {
                        'transaction_id': tx_id,
                        'status': 'error',
                        'reason': str(error)
                    }
                    for tx_id, error in result.error_details.items()
                ]
            }, status=status.HTTP_200_OK)
        
        except Exception as e:
            logger.error(f"User {user.id}: Error during auto-categorization: {e}", exc_info=True)
            return Response({
                'error': 'An error occurred during auto-categorization',
                'detail': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class AutoCategorizeSingleTransactionView(APIView):
    """
    API endpoint to auto-categorize a single transaction.
    
    POST /api/transactions/{transaction_id}/auto-categorize/
    Body: {
        "force_recategorize": boolean (optional, default: false)
    }
    
    Returns: {
        "success": boolean,
        "rule_applied": {rule details} or null,
        "category_assigned": {category details} or null,
        "reason": string (if not successful)
    }
    """
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    parser_classes = [JSONParser]
    lookup_field = 'pk'

    def post(self, request, pk=None, *args, **kwargs):
        user = request.user
        force_recategorize = request.data.get('force_recategorize', False)
        
        try:
            # Get the transaction
            transaction = Transaction.objects.select_related('vendor', 'category').get(
                id=pk, 
                user=user
            )
            
            logger.info(f"User {user.id}: Auto-categorizing single transaction {transaction.id}")
            
            # Import the service
            from .auto_categorization_service import (
                AutoCategorizationService,
                auto_categorize_single_transaction
            )
            
            # Use the convenience function
            applied_rule = auto_categorize_single_transaction(
                transaction, 
                force_recategorize=force_recategorize
            )
            
            if applied_rule:
                # Refresh the transaction to get updated category
                transaction.refresh_from_db()
                
                logger.info(f"User {user.id}: Successfully auto-categorized transaction {transaction.id} "
                           f"using rule {applied_rule.id}")
                
                return Response({
                    'success': True,
                    'rule_applied': {
                        'id': applied_rule.id,
                        'rule_id': applied_rule.id,
                        'vendor_name': applied_rule.vendor.name,
                        'category_name': applied_rule.category.name,
                        'is_persistent': applied_rule.is_persistent,
                        'created_at': applied_rule.created_at.isoformat(),
                        'updated_at': applied_rule.updated_at.isoformat()
                    },
                    'category_assigned': {
                        'id': transaction.category.id,
                        'name': transaction.category.name
                    }
                }, status=status.HTTP_200_OK)
            else:
                # No rule was applied
                if transaction.category and not force_recategorize:
                    reason = 'Transaction already categorized'
                elif not transaction.vendor:
                    reason = 'Transaction has no vendor assigned'
                else:
                    reason = 'No matching vendor rule found'
                
                logger.debug(f"User {user.id}: Could not auto-categorize transaction {transaction.id}: {reason}")
                
                return Response({
                    'success': False,
                    'rule_applied': None,
                    'category_assigned': None,
                    'reason': reason
                }, status=status.HTTP_200_OK)
        
        except Transaction.DoesNotExist:
            return Response({
                'error': 'Transaction not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"User {user.id}: Error during single transaction auto-categorization: {e}", exc_info=True)
            return Response({
                'error': 'An error occurred during auto-categorization',
                'detail': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class CategorizationSuggestionsView(APIView):
    """
    API endpoint to get categorization suggestions for a transaction.
    Returns suggested categories and vendor rules without applying them.
    
    GET /api/transactions/{transaction_id}/suggestions/
    
    Returns: {
        "suggestions": [
            {
                "rule": {rule details},
                "category": {category details},
                "confidence": float,
                "reason": string
            }
        ],
        "vendor": {vendor details} or null
    }
    """
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    lookup_field = 'pk'

    def get(self, request, pk=None, *args, **kwargs):
        user = request.user
        
        try:
            # Get the transaction
            transaction = Transaction.objects.select_related('vendor', 'category').get(
                id=pk, 
                user=user
            )
            
            logger.debug(f"User {user.id}: Getting categorization suggestions for transaction {transaction.id}")
            
            # Import the service
            from .auto_categorization_service import AutoCategorizationService
            
            service = AutoCategorizationService(user)
            suggestions = service.get_categorization_suggestions(transaction)
            
            # Format suggestions for API response
            formatted_suggestions = []
            for suggestion in suggestions:
                formatted_suggestions.append({
                    'rule': {
                        'id': suggestion['rule_id'],
                        'vendor_name': suggestion['vendor_name'],
                        'category_name': suggestion['category_name'],
                        'is_persistent': suggestion['is_persistent'],
                        'created_at': suggestion['created_at'],
                        'updated_at': suggestion['updated_at']
                    },
                    'category': {
                        'id': suggestion['category_id'],
                        'name': suggestion['category_name']
                    }
                })
            
            vendor_info = None
            if transaction.vendor:
                vendor_info = {
                    'id': transaction.vendor.id,
                    'name': transaction.vendor.name,
                    'display_name': transaction.vendor.display_name,
                    'is_system': transaction.vendor.user is None
                }
            
            logger.debug(f"User {user.id}: Found {len(formatted_suggestions)} suggestions for transaction {transaction.id}")
            
            return Response({
                'suggestions': formatted_suggestions,
                'vendor': vendor_info,
                'transaction': {
                    'id': transaction.id,
                    'description': transaction.description,
                    'amount': transaction.original_amount,
                    'currency': transaction.original_currency,
                    'current_category': {
                        'id': transaction.category.id,
                        'name': transaction.category.name
                    } if transaction.category else None
                }
            }, status=status.HTTP_200_OK)
        
        except Transaction.DoesNotExist:
            return Response({
                'error': 'Transaction not found'
            }, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            logger.error(f"User {user.id}: Error getting categorization suggestions: {e}", exc_info=True)
            return Response({
                'error': 'An error occurred while getting suggestions',
                'detail': str(e)
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

# --- NEW: VendorMappingViewSet ---
class VendorMappingViewSet(viewsets.ModelViewSet):
    """
    API endpoint to create, retrieve, update, or delete vendor mappings.
    """
    serializer_class = VendorMappingSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        """
        Return vendor mappings accessible to the user.
        """
        user = self.request.user
        return VendorMapping.objects.filter(user=user)

    def perform_create(self, serializer):
        """
        Automatically set the user field to the logged-in user
        when creating a new vendor mapping.
        """
        serializer.save(user=self.request.user)

    def perform_update(self, serializer):
        """Ensure user context is available for serializer validation during update."""
        serializer.save()  # User field is read-only, won't be changed

    def perform_destroy(self, instance):
        """
        Handle vendor mapping deletion with proper logging.
        """
        logger.info(f"User {self.request.user.id}: Attempting to delete vendor mapping ID {instance.id}")

        try:
            with db_transaction.atomic():
                # Delete the vendor mapping
                instance.delete()
                
                logger.info(f"User {self.request.user.id}: Successfully deleted vendor mapping ID {instance.id}")

            return Response(status=status.HTTP_204_NO_CONTENT)

        except Exception as e:
            logger.error(f"User {self.request.user.id}: Error during deletion of vendor mapping ID {instance.id}: {e}", exc_info=True)
            return Response(
                {"error": "An error occurred while trying to delete the vendor mapping."}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

    @action(detail=False, methods=['post'])
    def rename_vendor(self, request):
        """Endpoint to rename a vendor with validation for uniqueness"""
        original_name = request.data.get('original_name')
        new_name = request.data.get('new_name')
        
        # Validate input
        if not original_name or not new_name:
            return Response({'error': 'Both original_name and new_name are required'}, 
                            status=status.HTTP_400_BAD_REQUEST)
        
        # Check for duplicate vendor names
        if VendorMapping.objects.filter(user=request.user, mapped_vendor=new_name).exists():
            return Response({'error': 'This vendor name already exists'}, 
                            status=status.HTTP_400_BAD_REQUEST)
        
        # Create or update the mapping
        obj, created = VendorMapping.objects.update_or_create(
            user=request.user,
            original_name=original_name,
            defaults={'mapped_vendor': new_name}
        )
        
        logger.info(f"User {request.user.id}: {'Created' if created else 'Updated'} vendor mapping: '{original_name}' -> '{new_name}'")
        
        return Response(VendorMappingSerializer(obj).data)
    
    @action(detail=False, methods=['post'])
    def assign_to_existing(self, request):
        """Endpoint to assign a vendor name to an existing vendor"""
        original_name = request.data.get('original_name')
        existing_vendor = request.data.get('existing_vendor')
        
        # Validate input
        if not original_name or not existing_vendor:
            return Response({'error': 'Both original_name and existing_vendor are required'}, 
                            status=status.HTTP_400_BAD_REQUEST)
        
        # Verify the existing vendor exists in any of the same sources that search suggestions come from
        vendor_exists = False
        
        # 1. Check if it exists as a Vendor object (system + user's own)
        if Vendor.objects.filter(
            Q(user__isnull=True) | Q(user=request.user),
            name__iexact=existing_vendor
        ).exists():
            vendor_exists = True
        
        # 2. Check if it exists in VendorMapping mapped_vendor values (user's own mappings)  
        elif VendorMapping.objects.filter(user=request.user, mapped_vendor__iexact=existing_vendor).exists():
            vendor_exists = True
            
        # 3. Check if it exists in transaction descriptions (user's own transactions)
        elif Transaction.objects.filter(user=request.user, description__iexact=existing_vendor).exists():
            vendor_exists = True
        
        if not vendor_exists:
            return Response({'error': 'The specified existing vendor does not exist'}, 
                            status=status.HTTP_400_BAD_REQUEST)
        
        # Create or update the mapping
        obj, created = VendorMapping.objects.update_or_create(
            user=request.user,
            original_name=original_name,
            defaults={'mapped_vendor': existing_vendor}
        )
        
        logger.info(f"User {request.user.id}: {'Created' if created else 'Updated'} vendor assignment: '{original_name}' -> '{existing_vendor}'")
        
        return Response(VendorMappingSerializer(obj).data)
    
    @action(detail=False, methods=['post'])
    def bulk_mapping(self, request):
        """Endpoint to handle bulk mapping operations"""
        mappings = request.data.get('mappings', [])
        
        if not mappings or not isinstance(mappings, list):
            return Response({'error': 'A list of mappings is required'}, 
                            status=status.HTTP_400_BAD_REQUEST)
        
        results = []
        errors = []
        
        for mapping in mappings:
            original_name = mapping.get('original_name')
            mapped_vendor = mapping.get('mapped_vendor')
            
            if not original_name or not mapped_vendor:
                errors.append(f"Missing required fields for mapping: {mapping}")
                continue
            
            try:
                obj, created = VendorMapping.objects.update_or_create(
                    user=request.user,
                    original_name=original_name,
                    defaults={'mapped_vendor': mapped_vendor}
                )
                results.append(VendorMappingSerializer(obj).data)
            except Exception as e:
                errors.append(f"Error processing mapping {mapping}: {str(e)}")
        
        logger.info(f"User {request.user.id}: Bulk mapping completed. {len(results)} successful, {len(errors)} errors")
        
        return Response({
            'results': results,
            'errors': errors
        })
    
    @action(detail=False, methods=['get'])
    def auto_categorization_results(self, request):
        """Endpoint to retrieve auto-categorization results based on vendor mappings"""
        # Get all transactions for the user that have descriptions
        transactions = Transaction.objects.filter(user=request.user).exclude(description='')
        
        # Get all vendor mappings for the user
        mappings = VendorMapping.objects.filter(user=request.user)
        
        # Create a dictionary for quick lookup
        mapping_dict = {m.original_name: m.mapped_vendor for m in mappings}
        
        # Get vendor rules with their categories
        vendor_rules = VendorRule.objects.select_related('vendor', 'category').all()
        rule_dict = {rule.vendor.name: rule.category.name for rule in vendor_rules}
        
        results = []
        for transaction in transactions:
            # Use the transaction description as the original vendor name
            original_vendor = transaction.description
            mapped_vendor = mapping_dict.get(original_vendor, original_vendor)
            category = rule_dict.get(mapped_vendor, 'Uncategorized')
            
            results.append({
                'transaction_id': transaction.id,
                'original_vendor': original_vendor,
                'mapped_vendor': mapped_vendor,
                'category': category,
                'current_category': transaction.category.name if transaction.category else None
            })
        
        logger.info(f"User {request.user.id}: Retrieved auto-categorization results for {len(results)} transactions")
        
        return Response(results)