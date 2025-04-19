# transactions/views.py
import csv
import io # To handle in-memory text stream
from decimal import Decimal, InvalidOperation
from datetime import datetime
from django.db import transaction as db_transaction # Renamed to avoid confusion
from rest_framework import generics, permissions, status
from rest_framework.views import APIView # Use APIView for custom logic
from rest_framework.parsers import MultiPartParser, FormParser # For file uploads
from rest_framework.response import Response
from django.db.models import Q
from .models import Category, Transaction # Import Transaction model
from .serializers import CategorySerializer, TransactionSerializer # Add TransactionSerializer later
from .permissions import IsOwnerOrSystemReadOnly
import logging
from django.db.models import Count, Min
from django.shortcuts import get_object_or_404 # Useful for getting the Category

from transactions import serializers # Added logging

logger = logging.getLogger(__name__)

# Create your views here.
# --- NEW BATCH CATEGORIZE VIEW ---
class BatchCategorizeTransactionView(APIView):
    """
    API endpoint to assign a category to multiple transactions at once.
    Expects a list of transaction IDs and a category ID in the request body.
    """
    permission_classes = [permissions.IsAuthenticated]

    def patch(self, request, *args, **kwargs):
        user = request.user
        transaction_ids = request.data.get('transaction_ids')
        category_id = request.data.get('category_id')

        # --- Input Validation ---
        if not isinstance(transaction_ids, list) or not transaction_ids:
            return Response({'error': 'A non-empty list of "transaction_ids" is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not category_id:
            return Response({'error': '"category_id" is required.'}, status=status.HTTP_400_BAD_REQUEST)

        # Ensure all provided IDs are integers
        try:
            transaction_ids = [int(tid) for tid in transaction_ids]
            category_id = int(category_id)
        except (ValueError, TypeError):
            return Response({'error': 'Invalid ID format provided.'}, status=status.HTTP_400_BAD_REQUEST)

        logger.info(f"User {user.id}: Attempting to categorize {len(transaction_ids)} transactions with category ID {category_id}.")

        # --- Validate Category ---
        try:
            # User must be able to access the category (System or their own)
            category_to_assign = Category.objects.get(
                Q(pk=category_id),
                Q(user__isnull=True) | Q(user=user)
            )
            logger.debug(f"Found category: {category_to_assign.name}")
        except Category.DoesNotExist:
            logger.warning(f"User {user.id}: Category ID {category_id} not found or not accessible.")
            return Response({'error': f'Category with ID {category_id} not found or access denied.'}, status=status.HTTP_404_NOT_FOUND) # Or 400 Bad Request

        # --- Update Transactions ---
        updated_count = 0
        not_found_ids = []
        not_owned_ids = []

        # Filter transactions that belong to the user AND are in the provided list
        # This prevents users from categorizing transactions they don't own
        queryset = Transaction.objects.filter(
            user=user,
            id__in=transaction_ids
        )

        # Perform the update within a database transaction for atomicity
        try:
            with db_transaction.atomic():
                updated_count = queryset.update(category=category_to_assign)
        except Exception as e:
             logger.error(f"Database error during batch categorization for user {user.id}: {e}")
             return Response({"error": "Failed to update transactions due to a database error."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


        # --- Verify which IDs were updated (optional but good feedback) ---
        if updated_count != len(transaction_ids):
            logger.warning(f"User {user.id}: Mismatch in updated count. Expected {len(transaction_ids)}, updated {updated_count}.")
            # Find which requested IDs were not updated (either didn't exist or didn't belong to user)
            updated_ids = set(queryset.values_list('id', flat=True))
            all_requested_ids = set(transaction_ids)
            missing_or_unowned_ids = list(all_requested_ids - updated_ids)
            logger.warning(f"User {user.id}: IDs not updated (missing or not owned): {missing_or_unowned_ids}")
            # Potentially split these into truly not found vs not owned if needed, requires more queries

        logger.info(f"User {user.id}: Successfully categorized {updated_count} transactions with category '{category_to_assign.name}'.")
        return Response({
            'message': f'Successfully assigned category "{category_to_assign.name}" to {updated_count} transaction(s).',
            'updated_count': updated_count,
            # 'not_updated_ids': missing_or_unowned_ids # Optionally return IDs that failed
        }, status=status.HTTP_200_OK)


# --- NEW UNCATEGORIZED TRANSACTION VIEW ---
class UncategorizedTransactionGroupView(APIView):
    """
    API endpoint to list uncategorized transactions for the authenticated user,
    grouped by description. Returns groups ordered by the earliest transaction
    date within each group.
    """
    permission_classes = [permissions.IsAuthenticated]
    # Use default pagination settings if defined globally, or add custom one if needed
    # pagination_class = PageNumberPagination (Import if needed)

    def get(self, request, *args, **kwargs):
        user = request.user
        logger.info(f"Fetching uncategorized transaction groups for user: {user.username} ({user.id})")

        # 1. Filter uncategorized transactions for the user
        uncategorized_txs = Transaction.objects.filter(
            user=user,
            category__isnull=True
        ).order_by('description', 'transaction_date') # Order for predictable grouping (optional but good)

        logger.debug(f"Queryset count BEFORE grouping (for user {user.id}): {uncategorized_txs.count()}") 
        logger.info(f"Queryset count BEFORE grouping for user {user.id}: {uncategorized_txs.count()}")
        logger.info(f"First 5 Tx IDs in queryset: {[tx.id for tx in uncategorized_txs[:5]]}")   

        # 2. Group transactions by description in Python
        # (Alternative: Could use database GROUP BY if performance becomes an issue,
        # but Python grouping is often simpler for complex structures)
        grouped_transactions = {}
        for tx in uncategorized_txs:
            description = tx.description # Or normalize description if needed (e.g., lowercase, strip)
            if description not in grouped_transactions:
                grouped_transactions[description] = {
                    'description': description,
                    'earliest_date': tx.transaction_date, # Track earliest date for sorting groups
                    'transaction_ids': [], # Store IDs for batch update later
                    'previews': [] # Store limited info for preview
                }

            # Update earliest date if current tx is earlier
            if tx.transaction_date < grouped_transactions[description]['earliest_date']:
                grouped_transactions[description]['earliest_date'] = tx.transaction_date

            # Add transaction ID
            grouped_transactions[description]['transaction_ids'].append(tx.id)

            # Add preview data (limit number of previews per group if needed)
            if len(grouped_transactions[description]['previews']) < 5: # Example limit
                 grouped_transactions[description]['previews'].append({
                     'id': tx.id,
                     'date': tx.transaction_date,
                     'amount': tx.amount,
                     'direction': tx.direction,
                     'signed_amount': tx.signed_amount # Use property if available
                 })

        # 3. Convert grouped data to a list and sort groups by earliest date
        sorted_groups = sorted(
            grouped_transactions.values(),
            key=lambda group: group['earliest_date'] # Sort groups chronologically
        )

        # Optional: Add count to each group
        for group in sorted_groups:
            group['count'] = len(group['transaction_ids'])

        logger.info(f"Found {len(sorted_groups)} groups of uncategorized transactions for user {user.id}")

        # --- Optional: Apply Pagination if needed ---
        # paginator = self.pagination_class()
        # page = paginator.paginate_queryset(sorted_groups, request, view=self)
        # if page is not None:
        #     return paginator.get_paginated_response(page)

        # Return the sorted list of groups
        return Response(sorted_groups, status=status.HTTP_200_OK)

# --- NEW TRANSACTION LIST VIEW ---
class TransactionListView(generics.ListAPIView):
    """
    API endpoint to list transactions for the authenticated user.
    Supports basic filtering and pagination (optional).
    """
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated]
    # Optional: Add pagination
    # from rest_framework.pagination import PageNumberPagination
    # pagination_class = PageNumberPagination
    # pagination_class.page_size = 50 # Example page size

    def get_queryset(self):
        """
        Return transactions owned by the currently authenticated user,
        ordered by date descending.
        """
        user = self.request.user
        logger.info(f"Fetching transactions for user: {user.username} ({user.id})")
        queryset = Transaction.objects.filter(user=user).order_by('-transaction_date', '-created_at')
        logger.info(f"Found {queryset.count()} transactions for user {user.id}")
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
    """
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser] # Support file uploads

    # Define expected CSV headers (adjust if your actual file might differ slightly)
    EXPECTED_HEADERS = [
        "Date", "Name / Description", "Account", "Counterparty",
        "Code", "Debit/credit", "Amount (EUR)", "Transaction type",
        "Notifications"
    ]

    def post(self, request, *args, **kwargs):
        logger.info(f"CSV Upload initiated by user: {request.user.username} ({request.user.id})")
        file_obj = request.FILES.get('file') # 'file' is the expected key in the FormData

        if not file_obj:
            logger.warning("No file provided in upload request.")
            return Response({'error': 'No file provided.'}, status=status.HTTP_400_BAD_REQUEST)

        # Basic check for file type (optional but recommended)
        if not file_obj.name.lower().endswith('.csv'):
             logger.warning(f"Invalid file type uploaded: {file_obj.name}")
             return Response({'error': 'Invalid file type. Please upload a CSV file.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            # Read CSV file content - decode assuming UTF-8
            decoded_file = file_obj.read().decode('utf-8')
            # Use io.StringIO to treat the string as a file
            io_string = io.StringIO(decoded_file)
            # Skip the header row during processing if necessary
            reader = csv.reader(io_string)

            # --- Header Validation ---
            headers = next(reader) # Read the first row as headers
            # Normalize headers (lowercase, strip whitespace) for comparison
            normalized_headers = [h.strip().lower() for h in headers]
            normalized_expected = [h.strip().lower() for h in self.EXPECTED_HEADERS]

            # Simple check: Check if number of columns match
            if len(normalized_headers) != len(normalized_expected):
                 logger.error(f"CSV header count mismatch. Expected {len(normalized_expected)}, Got {len(normalized_headers)}. Headers: {headers}")
                 return Response({'error': f'CSV header count mismatch. Expected {len(normalized_expected)} columns.'}, status=status.HTTP_400_BAD_REQUEST)

            # More robust check: Ensure all expected headers are present (order might not matter)
            # Or enforce exact order if needed. Let's assume order matters for now.
            if normalized_headers != normalized_expected:
                logger.error(f"CSV headers do not match expected format. Expected: {self.EXPECTED_HEADERS}, Got: {headers}")
                # Provide more specific feedback if possible
                error_detail = f"CSV headers do not match expected format. Expected: '{', '.join(self.EXPECTED_HEADERS)}'. Got: '{', '.join(headers)}'."
                return Response({'error': error_detail}, status=status.HTTP_400_BAD_REQUEST)


            transactions_to_create = []
            errors = []
            processed_rows = 0

            for i, row in enumerate(reader, start=1): # Start counting rows from 1 (after header)
                processed_rows += 1
                if len(row) != len(self.EXPECTED_HEADERS):
                    logger.warning(f"Row {i+1}: Incorrect number of columns ({len(row)}), skipping.")
                    errors.append(f"Row {i+1}: Incorrect number of columns, skipped.")
                    continue # Skip row

                # Map row data based on EXPECTED_HEADERS order
                try:
                    date_str = row[0].strip()
                    description = row[1].strip()
                    account = row[2].strip()
                    counterparty = row[3].strip()
                    code = row[4].strip()
                    debit_credit = row[5].strip().upper() # Normalize to uppercase
                    amount_str = row[6].strip().replace(',', '.') # Replace comma with dot for Decimal
                    transaction_type = row[7].strip()
                    notifications = row[8].strip()

                    # --- Data Validation and Conversion ---
                    # Date
                    try:
                        transaction_date = datetime.strptime(date_str, '%Y%m%d').date()
                    except ValueError:
                        raise ValueError(f"Invalid date format '{date_str}'. Expected YYYYMMDD.")

                    # Amount
                    try:
                        amount = Decimal(amount_str)
                        if amount < 0:
                             # Amount should always be positive, direction is separate
                             raise ValueError("Amount cannot be negative.")
                    except InvalidOperation:
                        raise ValueError(f"Invalid amount format '{row[6].strip()}'. Expected a number.")

                    # Direction (Debit/Credit)
                    if debit_credit not in ['DEBIT', 'CREDIT']:
                        raise ValueError(f"Invalid direction '{row[5].strip()}'. Expected 'Debit' or 'Credit'.")
                    direction = debit_credit

                    # --- Prepare Transaction Object ---
                    transactions_to_create.append(
                        Transaction(
                            user=request.user, # Assign logged-in user
                            category=None, # Assign category later
                            transaction_date=transaction_date,
                            description=description,
                            amount=amount,
                            direction=direction,
                            # Store optional source fields
                            source_account_identifier=account or None,
                            counterparty_identifier=counterparty or None,
                            source_code=code or None,
                            source_type=transaction_type or None,
                            source_notifications=notifications or None,
                        )
                    )
                except ValueError as ve:
                    logger.warning(f"Row {i+1}: Validation Error: {str(ve)}")
                    errors.append(f"Row {i+1}: {str(ve)}")
                except Exception as e:
                    # Catch unexpected errors during row processing
                    logger.error(f"Row {i+1}: Unexpected error processing row: {str(e)}. Row data: {row}")
                    errors.append(f"Row {i+1}: Unexpected error skipped.")

            logger.debug(f"Checking transactions before bulk create (sample):")
            for i, tx_obj in enumerate(transactions_to_create[:3]): # Log first 3
                logger.debug(f"  - Obj {i}: category={tx_obj.category}")

            # --- Bulk Create Transactions ---
            if transactions_to_create:
                try:
                    # Use bulk_create for efficiency, wrap in transaction
                    with db_transaction.atomic():
                        Transaction.objects.bulk_create(transactions_to_create)
                    logger.info(f"Successfully created {len(transactions_to_create)} transactions for user {request.user.id}.")
                except Exception as e:
                    # Catch errors during database insertion
                    logger.error(f"Database error during bulk creation for user {request.user.id}: {str(e)}")
                    return Response({'error': 'Database error occurred during import.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

            # --- Prepare Response ---
            success_count = len(transactions_to_create)
            error_count = len(errors)
            message = f"CSV processed. Imported {success_count} out of {processed_rows} transactions."
            if errors:
                 message += f" Encountered {error_count} errors."
                 logger.warning(f"CSV Upload for user {request.user.id} finished with {error_count} errors.")

            return Response({
                'message': message,
                'imported_count': success_count,
                'total_rows_processed': processed_rows,
                'errors': errors # Send back row-specific errors
            }, status=status.HTTP_201_CREATED if success_count > 0 else status.HTTP_400_BAD_REQUEST) # Return 201 if *any* were created

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