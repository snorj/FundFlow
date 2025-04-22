# transactions/views.py
import csv
import io # To handle in-memory text stream
from decimal import Decimal, InvalidOperation
from datetime import datetime
from django.db import transaction as db_transaction # Renamed to avoid confusion
from rest_framework import generics, permissions, status
from rest_framework.views import APIView # Use APIView for custom logic
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser # For file uploads
from rest_framework.response import Response
from django.db.models import Q
from .models import Category, Transaction, DescriptionMapping # Import Transaction model
from .serializers import CategorySerializer, TransactionSerializer # Add TransactionSerializer later
from .permissions import IsOwnerOrSystemReadOnly
import logging
from django.db.models import Count, Min
from django.shortcuts import get_object_or_404 # Useful for getting the Category
from transactions import serializers # Added logging
from django.db.models import Max # Import Max for aggregation
from rest_framework.parsers import JSONParser

logger = logging.getLogger(__name__)

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
        user = request.user
        logger.info(f"User {user.id}: Received PATCH request for batch categorization.")
        logger.info(f"Request data CONTENT: {request.data}")

        # --- Extract Data ---
        transaction_ids = request.data.get('transaction_ids')
        category_id = request.data.get('category_id')
        original_description = request.data.get('original_description')
        clean_name = request.data.get('clean_name') # Optional

        # --- Input Validation ---
        if not isinstance(transaction_ids, list) or not transaction_ids:
            logger.error(f"Validation failed: 'transaction_ids' is not a non-empty list. Value received: {transaction_ids} (Type: {type(transaction_ids)})")
            return Response({'error': 'A non-empty list of "transaction_ids" is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if category_id is None: # Check for None specifically, 0 might be valid?
            return Response({'error': '"category_id" is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not original_description or not isinstance(original_description, str):
             logger.error(f"Validation failed: 'original_description' is required and must be a string. Value received: {original_description}")
             return Response({'error': '"original_description" (string) is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if clean_name is not None and not isinstance(clean_name, str):
             logger.error(f"Validation failed: 'clean_name' must be a string if provided. Value received: {clean_name}")
             return Response({'error': 'If provided, "clean_name" must be a string.'}, status=status.HTTP_400_BAD_REQUEST)

        # Determine the final name to use for transactions and the rule
        final_clean_name = clean_name.strip() if clean_name and clean_name.strip() else original_description.strip()
        if not final_clean_name:
             return Response({'error': 'Resulting transaction description cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)

        # --- Validate IDs ---
        try:
            transaction_ids = [int(tid) for tid in transaction_ids]
            category_id = int(category_id)
        except (ValueError, TypeError):
            return Response({'error': 'Invalid ID format provided for transaction_ids or category_id.'}, status=status.HTTP_400_BAD_REQUEST)

        logger.info(f"User {user.id}: Validated input for categorizing {len(transaction_ids)} transactions (Orig Desc: '{original_description}') with Cat ID {category_id} and Clean Name '{final_clean_name}'.")

        # --- Validate Category ---
        try:
            category_to_assign = Category.objects.get( Q(pk=category_id), Q(user__isnull=True) | Q(user=user) )
            logger.debug(f"Found category to assign: {category_to_assign.name}")
        except Category.DoesNotExist:
            logger.warning(f"User {user.id}: Category ID {category_id} not found or not accessible.")
            return Response({'error': f'Category with ID {category_id} not found or access denied.'}, status=status.HTTP_404_NOT_FOUND)

        # --- Update Transactions FIRST ---
        updated_count = 0
        queryset = Transaction.objects.filter(
            user=user,
            id__in=transaction_ids
        )
        update_fields = {
            'category': category_to_assign,
            'description': final_clean_name # Update description to the clean name
        }
        try:
            with db_transaction.atomic():
                updated_count = queryset.update(**update_fields)
        except Exception as e:
             logger.error(f"Database error during transaction batch update for user {user.id}: {e}")
             return Response({"error": "Failed to update transactions due to a database error."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        # --- Create/Update Description Mapping Rule ONLY IF transactions were successfully updated ---
        mapping_rule = None
        created = False
        rule_processed_status = "not processed" # For logging/response message

        if updated_count > 0: # Only process rule if relevant transactions were actually found and updated
            mapping_defaults = {
                'clean_name': final_clean_name,
                'assigned_category': category_to_assign
            }
            try:
                # Ensure we use the original description from the request payload for the rule key
                mapping_rule, created = DescriptionMapping.objects.update_or_create(
                    user=user,
                    original_description=original_description, # Use original description for the rule key
                    defaults=mapping_defaults # Fields to set/update
                )
                if created:
                    logger.info(f"User {user.id}: Created new DescriptionMapping rule for '{original_description}'.")
                    rule_processed_status = "created"
                else:
                    logger.info(f"User {user.id}: Updated existing DescriptionMapping rule for '{original_description}'.")
                    rule_processed_status = "updated"

            except Exception as e:
                # Log this error, but don't fail the *entire* request since transactions were updated.
                # Include a warning in the response.
                logger.error(f"Database error during DescriptionMapping update/create (transactions WERE updated) for user {user.id}, original desc '{original_description}': {e}")
                rule_processed_status = "failed" # Update status for response message

        # --- Verification and Logging ---
        if updated_count != len(transaction_ids):
            logger.warning(f"User {user.id}: Mismatch in updated count. Requested {len(transaction_ids)}, updated {updated_count}.")
            # Log which ones failed if needed (requires extra query)

        logger.info(f"User {user.id}: Completed batch categorization. Updated {updated_count} transactions with category '{category_to_assign.name}' and description '{final_clean_name}'. Rule status: {rule_processed_status}.")

        # --- Prepare Response ---
        message = f'Successfully updated {updated_count} transaction(s).'
        if rule_processed_status == "created":
             message += f' Rule for "{original_description}" created.'
        elif rule_processed_status == "updated":
             message += f' Rule for "{original_description}" updated.'
        elif rule_processed_status == "failed":
             message += f' WARNING: Failed to create/update rule for "{original_description}".'


        return Response({
            'message': message,
            'updated_count': updated_count,
        }, status=status.HTTP_200_OK) # Return 200 OK as long as transaction update didn't fail
    
class UncategorizedTransactionGroupView(APIView):
    """
    API endpoint to list uncategorized transactions for the authenticated user,
    grouped by description. Returns groups ordered by the *most recent* transaction
    date within each group descending (newest groups first).
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        user = request.user

        # --- NEW: Check if only existence check is needed ---
        check_existence_only = request.query_params.get('check_existence', 'false').lower() == 'true'

        if check_existence_only:
             logger.info(f"Checking existence of uncategorized groups for user: {user.username} ({user.id})")
             exists = Transaction.objects.filter(user=user, category__isnull=True).exists()
             return Response({'has_uncategorized': exists}, status=status.HTTP_200_OK)
        
        logger.info(f"Fetching uncategorized transaction groups for user: {user.username} ({user.id})")

        # 1. Filter uncategorized transactions for the user
        # Order by description first for consistent grouping, then date if needed within group
        uncategorized_txs = Transaction.objects.filter(
            user=user,
            category__isnull=True
        ).order_by('description', '-transaction_date') # Order date descending within description

        # 2. Group transactions by description in Python
        grouped_transactions = {}
        for tx in uncategorized_txs:
            description = tx.description # Using the original description as key

            # --- ADD THIS CHECK BACK ---
            # If this description hasn't been seen yet, initialize its entry
            if description not in grouped_transactions:
                grouped_transactions[description] = {
                    'description': description, # Store the original description
                    'max_date': tx.transaction_date, # First one is the most recent due to sorting
                    'transaction_ids': [],
                    'previews': []
                }
            # --- END ADD CHECK ---

            # Add more detailed preview data, including source fields
            grouped_transactions[description]['previews'].append({
                 'id': tx.id,
                 'date': tx.transaction_date,
                 'amount': tx.amount,
                 'direction': tx.direction,
                 'signed_amount': tx.signed_amount,
                 # --- ADD SOURCE FIELDS ---
                 'source_account': tx.source_account_identifier,
                 'counterparty': tx.counterparty_identifier,
                 'code': tx.source_code,
                 'type': tx.source_type,
                 'notifications': tx.source_notifications,
                 # --- END ADD SOURCE FIELDS ---
            })

            # --- Track MOST RECENT date ---
            # No need to update if dates are already sorted descending within group
            # If sorting wasn't guaranteed, you'd do:
            # if tx.transaction_date > grouped_transactions[description]['max_date']:
            #     grouped_transactions[description]['max_date'] = tx.transaction_date
            # Since we ordered by -transaction_date initially, the first tx added
            # for a group *is* the most recent.

            # Add transaction ID
            grouped_transactions[description]['transaction_ids'].append(tx.id)

            # Add preview data (limit number of previews per group if needed)
            if len(grouped_transactions[description]['previews']) < 5: # Example limit
                 grouped_transactions[description]['previews'].append({
                     'id': tx.id,
                     'date': tx.transaction_date,
                     'amount': tx.amount,
                     'direction': tx.direction,
                     'signed_amount': tx.signed_amount
                 })

        # 3. Convert grouped data to a list and sort groups by MOST RECENT date DESCENDING
        sorted_groups = sorted(
            grouped_transactions.values(),
            key=lambda group: group['max_date'], # Sort using the tracked max_date
            reverse=True # Newest groups first
        )

        # Optional: Add count to each group
        for group in sorted_groups:
            group['count'] = len(group['transaction_ids'])
            # Optionally add earliest date too if needed by frontend, requires extra tracking
            # group['earliest_date'] = min(tx['date'] for tx in group['previews']) # Simple but less efficient

        logger.info(f"Found {len(sorted_groups)} groups of uncategorized transactions for user {user.id}, sorted by most recent.")

        return Response(sorted_groups, status=status.HTTP_200_OK)

# --- NEW TRANSACTION LIST VIEW ---
class TransactionListView(generics.ListAPIView):
    """
    API endpoint to list transactions for the authenticated user.
    Supports filtering by categorization status.
    """
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated]
    # pagination_class = PageNumberPagination # Keep if you want pagination

    def get_queryset(self):
        """
        Return transactions owned by the user, optionally filtered
        by categorization status, ordered by date descending.
        """
        user = self.request.user
        queryset = Transaction.objects.filter(user=user)

        # --- NEW FILTER ---
        # Check for a query parameter like 'status' or 'categorized'
        status_filter = self.request.query_params.get('status', None) # e.g., ?status=categorized or ?status=uncategorized

        if status_filter == 'categorized':
            logger.info(f"Filtering for CATEGORIZED transactions for user {user.id}")
            queryset = queryset.filter(category__isnull=False)
        elif status_filter == 'uncategorized':
             logger.info(f"Filtering for UNCATEGORIZED transactions for user {user.id}")
             queryset = queryset.filter(category__isnull=True)
        else:
             # Default: Return ALL transactions if no specific status filter is applied
             logger.info(f"Fetching ALL transactions for user: {user.username} ({user.id})")

        # Keep original ordering
        queryset = queryset.order_by('-transaction_date', '-created_at')
        logger.info(f"Found {queryset.count()} transactions matching filter for user {user.id}")
        return queryset

class CategoryListCreateView(generics.ListCreateAPIView):
    """
    API endpoint to list accessible categories (System + User's Own)
    and create new custom categories for the authenticated user.
    """
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated] # Must be logged in

    def get_queryset(self):
        """
        This view should return a list of all system categories
        plus categories owned by the currently authenticated user.
        """
        user = self.request.user
        # Use Q objects for OR condition: user is None OR user is the current user
        return Category.objects.filter(Q(user__isnull=True) | Q(user=user)).distinct()

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
    
# --- NEW CSV UPLOAD VIEW ---
class TransactionCSVUploadView(APIView):
    """
    API endpoint to upload a CSV file containing transactions.
    Checks for DescriptionMapping rules to auto-categorize and clean names.
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    EXPECTED_HEADERS = [
        "Date", "Name / Description", "Account", "Counterparty",
        "Code", "Debit/credit", "Amount (EUR)", "Transaction type",
        "Notifications"
    ]

    def post(self, request, *args, **kwargs):
        logger.info(f"CSV Upload initiated by user: {request.user.username} ({request.user.id})")
        file_obj = request.FILES.get('file')

        if not file_obj: # ... (keep file validation) ...
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if not file_obj.name.lower().endswith('.csv'): # ... (keep file type validation) ...
             return Response({'error': 'Invalid file type. Please upload a CSV file.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            decoded_file = file_obj.read().decode('utf-8')
            io_string = io.StringIO(decoded_file)
            reader = csv.reader(io_string)

            headers = next(reader)
            # ... (keep header validation logic) ...
            normalized_headers = [h.strip().lower() for h in headers]
            normalized_expected = [h.strip().lower() for h in self.EXPECTED_HEADERS]
            if len(normalized_headers) != len(normalized_expected) or normalized_headers != normalized_expected:
                 # ... (return header error response) ...
                 error_detail = "CSV headers do not match expected format." # Simplified error
                 return Response({'error': error_detail}, status=status.HTTP_400_BAD_REQUEST)


            transactions_to_create = []
            errors = []
            processed_rows = 0
            applied_rules_count = 0 # Counter for auto-categorized transactions

            # --- Pre-fetch user's mappings for efficiency ---
            # Fetch all mappings for the current user into a dictionary
            # Key: original_description (lowercase, stripped), Value: DescriptionMapping object
            user_mappings = {
                mapping.original_description.strip().lower(): mapping
                for mapping in DescriptionMapping.objects.filter(user=request.user)
            }
            logger.info(f"User {request.user.id}: Loaded {len(user_mappings)} description mappings.")
            # --- End Pre-fetch ---


            for i, row in enumerate(reader, start=1):
                processed_rows += 1
                if len(row) != len(self.EXPECTED_HEADERS): # ... (keep column count check) ...
                    errors.append(f"Row {i+1}: Incorrect number of columns, skipped.")
                    continue

                try:
                    # --- Extract Raw Data ---
                    raw_date_str = row[0].strip()
                    raw_description = row[1].strip() # Get the original description
                    raw_account = row[2].strip()
                    raw_counterparty = row[3].strip()
                    raw_code = row[4].strip()
                    raw_debit_credit = row[5].strip().upper()
                    raw_amount_str = row[6].strip().replace(',', '.')
                    raw_transaction_type = row[7].strip()
                    raw_notifications = row[8].strip()

                    # --- Data Validation and Conversion (Keep existing logic) ---
                    try: transaction_date = datetime.strptime(raw_date_str, '%Y%m%d').date()
                    except ValueError: raise ValueError(f"Invalid date format '{raw_date_str}'.")
                    try: amount = Decimal(raw_amount_str); assert amount >= 0
                    except (InvalidOperation, AssertionError): raise ValueError(f"Invalid amount format '{raw_amount_str}'.")
                    if raw_debit_credit not in ['DEBIT', 'CREDIT']: raise ValueError(f"Invalid direction '{row[5].strip()}'.")
                    direction = raw_debit_credit
                    # --- End Validation ---


                    # --- Apply Mapping Rule (NEW LOGIC) ---
                    final_description = raw_description # Default to original
                    assigned_category = None # Default to None
                    matched_mapping = user_mappings.get(raw_description.strip().lower()) # Check pre-fetched dict

                    if matched_mapping:
                        logger.debug(f"Row {i+1}: Found mapping for '{raw_description}'. Applying rule.")
                        final_description = matched_mapping.clean_name # Use the clean name
                        assigned_category = matched_mapping.assigned_category # Use the pre-assigned category
                        if assigned_category:
                            applied_rules_count += 1
                    # --- End Apply Mapping Rule ---


                    # --- Prepare Transaction Object ---
                    transactions_to_create.append(
                        Transaction(
                            user=request.user,
                            category=assigned_category, # Use category from mapping if found, else None
                            transaction_date=transaction_date,
                            description=final_description, # Use clean name if mapped, else original
                            amount=amount,
                            direction=direction,
                            source_account_identifier=raw_account or None,
                            counterparty_identifier=raw_counterparty or None,
                            source_code=raw_code or None,
                            source_type=raw_transaction_type or None,
                            source_notifications=raw_notifications or None,
                        )
                    )
                except ValueError as ve:
                    logger.warning(f"Row {i+1}: Validation Error: {str(ve)}")
                    errors.append(f"Row {i+1}: {str(ve)}")
                except Exception as e:
                    logger.error(f"Row {i+1}: Unexpected error processing row: {str(e)}. Row data: {row}")
                    errors.append(f"Row {i+1}: Unexpected error skipped.")

            # Remove logging before bulk create if not needed
            # logger.debug("Checking transactions before bulk create (sample):")
            # for i, tx_obj in enumerate(transactions_to_create[:3]):
            #     logger.debug(f"  - Obj {i}: category={tx_obj.category}, description='{tx_obj.description}'")

            # --- Bulk Create Transactions ---
            if transactions_to_create:
                try:
                    with db_transaction.atomic():
                        Transaction.objects.bulk_create(transactions_to_create)
                    logger.info(f"Successfully created/saved {len(transactions_to_create)} transactions for user {request.user.id}. {applied_rules_count} auto-categorized.")
                except Exception as e:
                    logger.error(f"Database error during bulk creation for user {request.user.id}: {str(e)}")
                    return Response({'error': 'Database error occurred during import.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # --- Prepare Response ---
            success_count = len(transactions_to_create)
            error_count = len(errors)
            message = f"CSV processed. Imported {success_count} out of {processed_rows} transactions."
            if applied_rules_count > 0:
                message += f" {applied_rules_count} transaction(s) were automatically categorized based on your rules."
            if errors:
                 message += f" Encountered {error_count} errors."
                 logger.warning(f"CSV Upload for user {request.user.id} finished with {error_count} errors.")

            return Response({
                'message': message,
                'imported_count': success_count,
                'auto_categorized_count': applied_rules_count, # Add new info
                'total_rows_processed': processed_rows,
                'errors': errors
            }, status=status.HTTP_201_CREATED if success_count > 0 else status.HTTP_400_BAD_REQUEST)

        except UnicodeDecodeError:
            logger.error("CSV Upload failed due to encoding error.")
            return Response({'error': 'Failed to decode file. Please ensure it is UTF-8 encoded.'}, status=status.HTTP_400_BAD_REQUEST)
        except csv.Error as e:
            logger.error(f"CSV parsing error: {e}")
            return Response({'error': f'Error parsing CSV file: {e}'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # Catch any other unexpected errors (e.g., reading file)
            logger.exception(f"Unexpected error during CSV upload for user {request.user.id}: {str(e)}") # Use exception for full traceback
            return Response({'error': 'An unexpected error occurred during processing.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)