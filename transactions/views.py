# transactions/views.py
import csv
import io # To handle in-memory text stream
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
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
from integrations.services import get_historical_exchange_rate
from integrations.logic import BASE_CURRENCY_FOR_CONVERSION # AUD


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

        check_existence_only = request.query_params.get('check_existence', 'false').lower() == 'true'
        if check_existence_only:
             # ... (Keep existence check logic) ...
             exists = Transaction.objects.filter(user=user, category__isnull=True).exists()
             return Response({'has_uncategorized': exists}, status=status.HTTP_200_OK)


        logger.info(f"Fetching uncategorized transaction groups for user: {user.username} ({user.id})")

        uncategorized_txs = Transaction.objects.filter(
            user=user,
            category__isnull=True
        ).order_by('description', '-transaction_date') # Order needed for grouping and getting max_date easily

        grouped_transactions = {}
        for tx in uncategorized_txs:
            description = tx.description # Use the actual description from the DB

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
    
class TransactionCSVUploadView(APIView):
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
        current_user = request.user
        
        # --- CSV Currency is Hardcoded to EUR ---
        CSV_FILE_CURRENCY = 'EUR'
        # --- End Currency Hardcoding ---

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
            normalized_expected = [h.strip().lower() for h in self.EXPECTED_HEADERS]
            if normalized_headers != normalized_expected:
                 error_detail = "CSV headers do not match expected format. Please ensure columns are: " + ", ".join(self.EXPECTED_HEADERS)
                 return Response({'error': error_detail}, status=status.HTTP_400_BAD_REQUEST)

            potential_transactions_data = []
            errors = []
            processed_rows = 0
            min_date, max_date = None, None

            logger.info(f"User {current_user.id}: Phase 1 - Parsing CSV (Assumed Currency: {CSV_FILE_CURRENCY})...")
            for i, row in enumerate(reader, start=1):
                processed_rows += 1
                if len(row) != len(self.EXPECTED_HEADERS): # ... (skip row logic) ...
                    errors.append(f"Row {i+1}: Incorrect number of columns ({len(row)}), expected {len(self.EXPECTED_HEADERS)}. Row skipped.")
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

            for data_item in potential_transactions_data:
                raw_description = data_item['raw_description'] # Corrected from data_item['description']
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
                original_currency_code = data_item['original_currency'] # Will be 'EUR'

                if original_currency_code == BASE_CURRENCY_FOR_CONVERSION: # e.g., if 'EUR' == 'AUD' (false)
                    aud_amount_val = data_item['original_amount']
                    exchange_rate_val = Decimal("1.0")
                else:
                    rate = get_historical_exchange_rate(
                        data_item['transaction_date'].strftime('%Y-%m-%d'),
                        original_currency_code, BASE_CURRENCY_FOR_CONVERSION
                    )
                    if rate is not None:
                        aud_amount_val = (data_item['original_amount'] * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                        exchange_rate_val = rate
                    else:
                        skipped_conversion_error_count += 1
                        logger.warning(f"User {current_user.id} - Row {data_item['row_num']}: Rate fetch failed {original_currency_code}->{BASE_CURRENCY_FOR_CONVERSION} on {data_item['transaction_date']}.")

                transactions_to_create.append(
                    Transaction(
                        user=current_user, category=assigned_category, description=final_description,
                        transaction_date=data_item['transaction_date'],
                        original_amount=data_item['original_amount'], original_currency=original_currency_code,
                        direction=data_item['direction'], aud_amount=aud_amount_val, exchange_rate_to_aud=exchange_rate_val,
                        source='csv', bank_transaction_id=None,
                        source_account_identifier=data_item['source_account_identifier'],
                        counterparty_identifier=data_item['counterparty_identifier'],
                        source_code=data_item['source_code'], source_type=data_item['source_type'],
                        source_notifications=data_item['source_notifications'],
                    )
                )
            # ... (Phase 4: Bulk Create and Phase 5: Prepare Response - logic remains the same) ...
            logger.info(f"User {current_user.id}: Phase 3 Complete. Dups: {duplicate_count}. New: {len(transactions_to_create)}. Convert Errors: {skipped_conversion_error_count}.")
            created_count = 0
            if transactions_to_create:
                try:
                    with db_transaction.atomic():
                        created_objects = Transaction.objects.bulk_create(transactions_to_create)
                        created_count = len(created_objects)
                    logger.info(f"User {current_user.id}: Phase 4 Complete - Created {created_count} transactions from CSV.")
                except Exception as e:
                    errors.append(f"Database error: {str(e)}.")
                    logger.error(f"User {current_user.id}: DB error CSV txns: {e}", exc_info=True)

            error_count = len(errors)
            message = f"CSV (Assumed {CSV_FILE_CURRENCY}) processed. Found {processed_rows} data rows."
            if created_count > 0: message += f" Imported {created_count} new transactions."
            else: message += " No new transactions were imported."
            if duplicate_count > 0: message += f" Skipped {duplicate_count} potential duplicates."
            if applied_rules_count > 0: message += f" Applied {applied_rules_count} description rules."
            if skipped_conversion_error_count > 0: message += f" Failed to convert currency for {skipped_conversion_error_count} transactions to {BASE_CURRENCY_FOR_CONVERSION}."
            if error_count > 0: message += f" Encountered {error_count} errors."

            response_status = status.HTTP_200_OK
            if created_count > 0: response_status = status.HTTP_201_CREATED
            elif error_count > 0 and not transactions_to_create and processed_rows > 0: response_status = status.HTTP_400_BAD_REQUEST

            return Response({
                'message': message, 'imported_count': created_count, 'duplicate_count': duplicate_count,
                'auto_categorized_count': applied_rules_count, 'conversion_error_count': skipped_conversion_error_count,
                'total_rows_processed': processed_rows, 'errors': errors
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