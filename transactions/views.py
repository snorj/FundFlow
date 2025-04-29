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

        check_existence_only = request.query_params.get('check_existence', 'false').lower() == 'true'
        if check_existence_only:
             logger.info(f"Checking existence of uncategorized groups for user: {user.username} ({user.id})")
             exists = Transaction.objects.filter(user=user, category__isnull=True).exists()
             return Response({'has_uncategorized': exists}, status=status.HTTP_200_OK)

        logger.info(f"Fetching uncategorized transaction groups for user: {user.username} ({user.id})")

        uncategorized_txs = Transaction.objects.filter(
            user=user,
            category__isnull=True
        ).order_by('description', '-transaction_date')

        grouped_transactions = {}
        for tx in uncategorized_txs:
            description = tx.description

            if description not in grouped_transactions:
                grouped_transactions[description] = {
                    'description': description,
                    'max_date': tx.transaction_date,
                    'transaction_ids': [],
                    'previews': [] # Initialize previews list
                }

            # --- ONLY ONE APPEND NEEDED ---
            grouped_transactions[description]['previews'].append({
                 'id': tx.id,
                 'date': tx.transaction_date,
                 'amount': tx.amount,
                 'direction': tx.direction,
                 'signed_amount': tx.signed_amount,
                 'source_account': tx.source_account_identifier,
                 'counterparty': tx.counterparty_identifier,
                 'code': tx.source_code,
                 'type': tx.source_type,
                 'notifications': tx.source_notifications,
            })

            grouped_transactions[description]['transaction_ids'].append(tx.id)

            # --- REMOVED THE SECOND, REDUNDANT APPEND BLOCK ---

        sorted_groups = sorted(
            grouped_transactions.values(),
            key=lambda group: group['max_date'],
            reverse=True
        )

        for group in sorted_groups:
            group['count'] = len(group['transaction_ids'])
            # Find earliest date from the previews we already have
            if group['previews']: # Check if previews is not empty
                 group['earliest_date'] = min(p['date'] for p in group['previews'])
            else:
                 group['earliest_date'] = None # Or handle as appropriate

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
    """
    API endpoint to upload a CSV file containing transactions.
    Checks for DescriptionMapping rules to auto-categorize and clean names.
    Checks for and skips duplicate transactions based on user, date, amount,
    direction, and the final description (after potential cleaning).
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    # Define expected CSV headers (adjust if your format differs)
    EXPECTED_HEADERS = [
        "Date", "Name / Description", "Account", "Counterparty",
        "Code", "Debit/credit", "Amount (EUR)", "Transaction type",
        "Notifications"
    ]

    def post(self, request, *args, **kwargs):
        logger.info(f"CSV Upload initiated by user: {request.user.username} ({request.user.id})")
        file_obj = request.FILES.get('file')
        current_user = request.user

        # --- Basic File Validation ---
        if not file_obj:
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)
        if not file_obj.name.lower().endswith('.csv'):
             return Response({'error': 'Invalid file type. Please upload a CSV file.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # --- Read and Decode File ---
            decoded_file = file_obj.read().decode('utf-8')
            io_string = io.StringIO(decoded_file)
            reader = csv.reader(io_string)

            # --- Header Validation ---
            try:
                headers = next(reader)
            except StopIteration:
                 return Response({'error': 'CSV file is empty or contains only headers.'}, status=status.HTTP_400_BAD_REQUEST)

            normalized_headers = [h.strip().lower() for h in headers]
            normalized_expected = [h.strip().lower() for h in self.EXPECTED_HEADERS]
            if normalized_headers != normalized_expected:
                 logger.warning(f"CSV header mismatch for user {current_user.id}. Expected: {normalized_expected}, Got: {normalized_headers}")
                 error_detail = "CSV headers do not match expected format. Please ensure columns are: " + ", ".join(self.EXPECTED_HEADERS)
                 return Response({'error': error_detail}, status=status.HTTP_400_BAD_REQUEST)

            # --- Data Processing Structures ---
            potential_transactions_data = [] # Store validated data from CSV rows
            errors = []                      # Store row-level processing errors
            processed_rows = 0
            min_date, max_date = None, None  # To optimize DB query

            # --- Phase 1: Parse CSV, Validate Rows, Collect Potential Data ---
            logger.info(f"User {current_user.id}: Phase 1 - Parsing CSV...")
            for i, row in enumerate(reader, start=1): # Start from 1 for user-friendly row numbers
                processed_rows += 1
                # Basic row structure check
                if len(row) != len(self.EXPECTED_HEADERS):
                    errors.append(f"Row {i+1}: Incorrect number of columns ({len(row)}), expected {len(self.EXPECTED_HEADERS)}. Row skipped.")
                    continue

                try:
                    # Extract Raw Data (adjust indices if your CSV differs)
                    raw_date_str = row[0].strip()
                    raw_description = row[1].strip()
                    raw_account = row[2].strip()
                    raw_counterparty = row[3].strip()
                    raw_code = row[4].strip()
                    raw_debit_credit = row[5].strip().upper()
                    raw_amount_str = row[6].strip().replace(',', '.') # Handle comma decimal separator
                    raw_transaction_type = row[7].strip()
                    raw_notifications = row[8].strip()

                    # Data Validation and Conversion
                    try: transaction_date = datetime.strptime(raw_date_str, '%Y%m%d').date()
                    except ValueError: raise ValueError(f"Invalid date format '{raw_date_str}' (expected YYYYMMDD).")
                    try: amount = Decimal(raw_amount_str); assert amount >= 0 # Ensure non-negative
                    except (InvalidOperation, AssertionError): raise ValueError(f"Invalid or negative amount format '{raw_amount_str}'.")
                    if raw_debit_credit not in ['DEBIT', 'CREDIT']: raise ValueError(f"Invalid Debit/credit value '{row[5].strip()}' (expected DEBIT or CREDIT).")
                    direction = raw_debit_credit

                    # Track date range for optimization
                    if min_date is None or transaction_date < min_date: min_date = transaction_date
                    if max_date is None or transaction_date > max_date: max_date = transaction_date

                    # Store validated data needed for duplicate check and final object creation
                    potential_transactions_data.append({
                        'row_num': i + 1, # Store row number for error reporting
                        'raw_description': raw_description,
                        'transaction_date': transaction_date,
                        'amount': amount,
                        'direction': direction,
                        'source_account_identifier': raw_account or None,
                        'counterparty_identifier': raw_counterparty or None,
                        'source_code': raw_code or None,
                        'source_type': raw_transaction_type or None,
                        'source_notifications': raw_notifications or None,
                    })

                except ValueError as ve:
                    logger.warning(f"User {current_user.id} - Row {i+1}: Validation Error: {str(ve)}")
                    errors.append(f"Row {i+1}: {str(ve)}")
                except Exception as e: # Catch unexpected errors during row processing
                    logger.error(f"User {current_user.id} - Row {i+1}: Unexpected error processing row: {str(e)}. Row data: {row}")
                    errors.append(f"Row {i+1}: Unexpected processing error. Row skipped.")

            logger.info(f"User {current_user.id}: Phase 1 Complete - Processed {processed_rows} data rows from CSV.")

            # --- Phase 2: Query Existing Transactions & Build Lookup Set ---
            existing_keys = set()
            if potential_transactions_data: # Only query if CSV had processable rows
                logger.info(f"User {current_user.id}: Phase 2 - Querying database for existing transactions...")
                # Optimize query using date range
                queryset = Transaction.objects.filter(user=current_user)
                if min_date and max_date:
                    queryset = queryset.filter(transaction_date__range=(min_date, max_date))
                    logger.debug(f"User {current_user.id}: Querying existing transactions between {min_date} and {max_date}")

                # Fetch only necessary fields for building the key set
                existing_keys = set(
                    (tx.transaction_date, tx.amount, tx.direction, tx.description)
                    for tx in queryset.only(
                        'transaction_date', 'amount', 'direction', 'description' # Django optimization
                    )
                )
                logger.info(f"User {current_user.id}: Phase 2 Complete - Found {len(existing_keys)} potentially relevant existing transaction keys.")
            else:
                 logger.info(f"User {current_user.id}: Phase 2 Skipped - No processable data from CSV.")

            # --- Phase 3: Filter Duplicates, Apply Rules, Build Final List ---
            logger.info(f"User {current_user.id}: Phase 3 - Filtering duplicates, applying rules, building create list...")
            transactions_to_create = []
            duplicate_count = 0
            applied_rules_count = 0

            # Pre-fetch user's description mappings for efficiency
            user_mappings = {
                mapping.original_description.strip().lower(): mapping
                for mapping in DescriptionMapping.objects.filter(user=current_user)
            }
            logger.debug(f"User {current_user.id}: Loaded {len(user_mappings)} description mappings.")

            for data in potential_transactions_data:
                raw_description = data['raw_description']

                # Apply Mapping Rule FIRST to get the final_description
                final_description = raw_description # Default to original description
                assigned_category = None
                matched_mapping = user_mappings.get(raw_description.strip().lower())

                if matched_mapping:
                    final_description = matched_mapping.clean_name # Use cleaned name if rule exists
                    assigned_category = matched_mapping.assigned_category # Use assigned category if rule exists

                # --- Generate Check Key using the FINAL description ---
                # This key is what we compare against the database's stored transaction
                check_key = (
                    data['transaction_date'],
                    data['amount'],
                    data['direction'],
                    final_description # Use the description *as it would be saved*
                )

                # --- Check for Duplicates ---
                if check_key in existing_keys:
                    duplicate_count += 1
                    logger.debug(f"User {current_user.id} - Row {data['row_num']}: Skipping duplicate: {check_key}")
                    continue # Skip to the next potential transaction

                # --- Not a duplicate, build the Transaction object ---
                if assigned_category: # Count rule application only if category actually assigned
                    applied_rules_count += 1

                transactions_to_create.append(
                    Transaction(
                        user=current_user,
                        category=assigned_category,
                        description=final_description, # Save the final (potentially cleaned) description
                        transaction_date=data['transaction_date'],
                        amount=data['amount'],
                        direction=data['direction'],
                        source_account_identifier=data['source_account_identifier'],
                        counterparty_identifier=data['counterparty_identifier'],
                        source_code=data['source_code'],
                        source_type=data['source_type'],
                        source_notifications=data['source_notifications'],
                    )
                )

            logger.info(f"User {current_user.id}: Phase 3 Complete - Found {duplicate_count} duplicates. Prepared {len(transactions_to_create)} new transactions.")

            # --- Phase 4: Bulk Create Non-Duplicate Transactions ---
            created_count = 0
            if transactions_to_create:
                logger.info(f"User {current_user.id}: Phase 4 - Performing bulk create for {len(transactions_to_create)} transactions...")
                try:
                    with db_transaction.atomic():
                        # bulk_create returns the list of created objects in Django 3+
                        created_objects = Transaction.objects.bulk_create(transactions_to_create)
                        created_count = len(created_objects)
                    logger.info(f"User {current_user.id}: Phase 4 Complete - Successfully created {created_count} transactions. {applied_rules_count} were auto-categorized.")
                except Exception as e:
                    logger.error(f"User {current_user.id}: Database error during bulk creation: {str(e)}")
                    # Add the DB error to the list of errors reported to the user
                    errors.append(f"Database error during final import step: {str(e)}. Some transactions might not have been saved.")
                    # Depending on severity, you might return 500 or just report in the message
                    # For now, we'll report it in the message and potentially return a different status if needed.
            else:
                logger.info(f"User {current_user.id}: Phase 4 Skipped - No new transactions to create.")

            # --- Phase 5: Prepare Response ---
            logger.info(f"User {current_user.id}: Phase 5 - Preparing response...")
            error_count = len(errors) # Recalculate in case DB error was added

            message = f"CSV processed. Found {processed_rows} data rows."
            if created_count > 0:
                 message += f" Imported {created_count} new transactions."
            else:
                 message += " No new transactions were imported."

            if duplicate_count > 0:
                 message += f" Skipped {duplicate_count} duplicate transaction(s)."
            if applied_rules_count > 0 and created_count > 0: # Only mention rules if new tx were created
                # Refine message slightly: rules apply to *newly imported* transactions
                message += f" {applied_rules_count} of the newly imported transaction(s) were automatically categorized."
            if error_count > 0:
                 message += f" Encountered {error_count} errors processing rows (see details)."

            # Determine appropriate status code
            response_status = status.HTTP_200_OK # Default to OK
            if created_count > 0:
                response_status = status.HTTP_201_CREATED # Indicate resource creation
            elif error_count > 0 and created_count == 0 and duplicate_count == 0 and processed_rows > 0 :
                 response_status = status.HTTP_400_BAD_REQUEST # Errors occurred, nothing imported

            return Response({
                'message': message,
                'imported_count': created_count,
                'duplicate_count': duplicate_count,
                'auto_categorized_count': applied_rules_count,
                'total_rows_processed': processed_rows,
                'errors': errors # Return list of errors
            }, status=response_status)

        except UnicodeDecodeError:
            logger.error(f"User {current_user.id}: CSV Upload failed due to encoding error.")
            return Response({'error': 'Failed to decode file. Please ensure it is UTF-8 encoded.'}, status=status.HTTP_400_BAD_REQUEST)
        except csv.Error as e:
            logger.error(f"User {current_user.id}: CSV parsing error: {e}")
            return Response({'error': f'Error parsing CSV file: {e}'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            # Catch any other unexpected errors (e.g., reading file before loop)
            logger.exception(f"User {current_user.id}: Unexpected error during CSV upload processing: {str(e)}") # Use exception for full traceback
            return Response({'error': 'An unexpected server error occurred during processing.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)