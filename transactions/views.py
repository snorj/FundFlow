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

from transactions import serializers # Added logging

logger = logging.getLogger(__name__)

# Create your views here.

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