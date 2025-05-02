# integrations/logic.py
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from dateutil.parser import isoparse # For parsing ISO 8601 timestamps robustly

from django.contrib.auth import get_user_model
from django.db import transaction as db_transaction
from requests.exceptions import RequestException, HTTPError

from .models import UpIntegration
from .utils import decrypt_token
from .services import get_transactions # Import the service function
from transactions.models import Transaction # Import your app's Transaction model

logger = logging.getLogger(__name__)
User = get_user_model()

# Define constants or get from settings if needed
DEFAULT_INITIAL_SYNC_DAYS = 90

def sync_up_transactions_for_user(user_id: int, initial_sync: bool = False, custom_since_iso: str = None) -> dict:
    """
    Fetches transactions from Up Bank API for a given user, checks for duplicates,
    and saves new transactions to the FundFlow database.

    Args:
        user_id (int): The ID of the FundFlow user to sync for.
        initial_sync (bool): Flag indicating if this is the first sync. Affects the 'since' logic.
        custom_since_iso (str, optional): An ISO 8601 timestamp to override the start date
                                         for an initial sync.

    Returns:
        dict: A summary of the sync operation, e.g.,
              {'success': bool, 'message': str, 'created_count': int, 'duplicate_count': int, 'error': str | None}
    """
    try:
        user = User.objects.get(pk=user_id)
        integration = UpIntegration.objects.select_related('user').get(user=user)
        logger.info(f"[Sync User {user_id}]: Starting sync. Initial: {initial_sync}.")
    except User.DoesNotExist:
        logger.error(f"[Sync User {user_id}]: User not found.")
        return {'success': False, 'message': 'User not found.', 'created_count': 0, 'duplicate_count': 0, 'error': 'user_not_found'}
    except UpIntegration.DoesNotExist:
        logger.warning(f"[Sync User {user_id}]: Up Integration record not found.")
        return {'success': False, 'message': 'Up Bank account not linked.', 'created_count': 0, 'duplicate_count': 0, 'error': 'integration_not_found'}

    # Decrypt PAT
    pat = decrypt_token(integration.personal_access_token_encrypted)
    if not pat:
        logger.error(f"[Sync User {user_id}]: Failed to decrypt Personal Access Token.")
        return {'success': False, 'message': 'Internal error: Could not access token.', 'created_count': 0, 'duplicate_count': 0, 'error': 'decryption_failed'}

    # --- Determine 'since' timestamp for API call ---
    sync_start_time = datetime.now(timezone.utc) # Record when this attempt started
    since_filter_iso = None
    min_date_for_query = None # To optimize duplicate check query

    if initial_sync:
        if custom_since_iso:
            try:
                # Validate and parse custom date
                since_filter_iso = isoparse(custom_since_iso).isoformat()
                min_date_for_query = isoparse(custom_since_iso).date()
                logger.info(f"[Sync User {user_id}]: Initial sync using custom start date: {since_filter_iso}")
            except ValueError:
                logger.warning(f"[Sync User {user_id}]: Invalid custom_since_iso format: {custom_since_iso}. Falling back.")
                # Fallback to default if custom date is invalid
                fallback_since = sync_start_time - timedelta(days=DEFAULT_INITIAL_SYNC_DAYS)
                since_filter_iso = fallback_since.isoformat()
                min_date_for_query = fallback_since.date()
                logger.info(f"[Sync User {user_id}]: Initial sync using default {DEFAULT_INITIAL_SYNC_DAYS}-day lookback.")
        else:
            # Default initial sync: last N days
            default_since = sync_start_time - timedelta(days=DEFAULT_INITIAL_SYNC_DAYS)
            since_filter_iso = default_since.isoformat()
            min_date_for_query = default_since.date()
            logger.info(f"[Sync User {user_id}]: Initial sync using default {DEFAULT_INITIAL_SYNC_DAYS}-day lookback.")
    elif integration.last_synced_at:
        # Subsequent sync: fetch since last successful sync + 1 second to avoid overlap issues if possible
        # Up API uses ISO 8601, includes microseconds if available.
        # Adding a small buffer like 1 sec is generally safe.
        since_filter_iso = (integration.last_synced_at + timedelta(seconds=1)).isoformat()
        min_date_for_query = integration.last_synced_at.date() # Query DB from last sync date
        logger.info(f"[Sync User {user_id}]: Subsequent sync, fetching since: {since_filter_iso}")
    else:
        # Should ideally not happen if initial_sync flag is used correctly, but handle as initial.
        logger.warning(f"[Sync User {user_id}]: last_synced_at is null, treating as initial sync (default lookback).")
        default_since = sync_start_time - timedelta(days=DEFAULT_INITIAL_SYNC_DAYS)
        since_filter_iso = default_since.isoformat()
        min_date_for_query = default_since.date()


    # --- Fetch Transactions from Up API ---
    try:
        logger.info(f"[Sync User {user_id}]: Calling get_transactions service (since={since_filter_iso})...")
        up_transactions = get_transactions(pat, since_iso=since_filter_iso)
        logger.info(f"[Sync User {user_id}]: Fetched {len(up_transactions)} transactions from Up API.")
    except HTTPError as e:
        logger.error(f"[Sync User {user_id}]: HTTP error fetching Up transactions: {e.response.status_code} - {e.response.text}")
        error_code = 'api_http_error'
        message = f"Error communicating with Up Bank (HTTP {e.response.status_code})."
        if e.response.status_code == 401:
            message = "Up Bank token is invalid or expired. Please relink."
            error_code = 'invalid_token'
        return {'success': False, 'message': message, 'created_count': 0, 'duplicate_count': 0, 'error': error_code}
    except RequestException as e:
        logger.error(f"[Sync User {user_id}]: Network error fetching Up transactions: {e}")
        return {'success': False, 'message': 'Network error connecting to Up Bank.', 'created_count': 0, 'duplicate_count': 0, 'error': 'api_network_error'}
    except Exception as e: # Catch unexpected errors from service/parsing
        logger.exception(f"[Sync User {user_id}]: Unexpected error during transaction fetch: {e}")
        return {'success': False, 'message': 'An unexpected error occurred during sync.', 'created_count': 0, 'duplicate_count': 0, 'error': 'sync_fetch_error'}

    if not up_transactions:
        logger.info(f"[Sync User {user_id}]: No new transactions found since {since_filter_iso}.")
        # Update last_synced_at even if no new transactions, marks that we checked.
        integration.last_synced_at = sync_start_time
        integration.save(update_fields=['last_synced_at'])
        return {'success': True, 'message': 'No new transactions found.', 'created_count': 0, 'duplicate_count': 0, 'error': None}

    # --- Prepare for Duplicate Check ---
    # Get IDs of transactions fetched from API
    fetched_bank_ids = {tx['id'] for tx in up_transactions}

    # Query existing bank IDs in our DB for this user (more efficient than keys)
    # Filter by date range if possible to reduce query size
    existing_tx_query = Transaction.objects.filter(
        user=user,
        source='up_bank',
        bank_transaction_id__in=fetched_bank_ids # Check only against IDs we just fetched
    )
    # Note: The date filter below is less critical now we filter by ID, but kept for potential minor optimization
    # if min_date_for_query:
    #     existing_tx_query = existing_tx_query.filter(transaction_date__gte=min_date_for_query)

    existing_bank_ids = set(existing_tx_query.values_list('bank_transaction_id', flat=True))
    logger.info(f"[Sync User {user_id}]: Found {len(existing_bank_ids)} existing matching bank transaction IDs in DB.")

    # --- Process and Prepare New Transactions ---
    transactions_to_create = []
    duplicate_count = 0
    latest_transaction_created_at = None # Track the timestamp of the newest processed transaction

    for tx_data in up_transactions:
        bank_id = tx_data['id']
        attributes = tx_data['attributes']

        # --- Duplicate Check ---
        if bank_id in existing_bank_ids:
            duplicate_count += 1
            continue

        # --- Data Transformation ---
        try:
            # Use 'createdAt' for the primary date
            created_at_dt = isoparse(attributes['createdAt'])
            transaction_date = created_at_dt.date() # Store just the date part

            # Track the latest timestamp encountered in this batch
            if latest_transaction_created_at is None or created_at_dt > latest_transaction_created_at:
                latest_transaction_created_at = created_at_dt

            amount_details = attributes['amount']
            amount_value = Decimal(amount_details['valueInBaseUnits']) / 100
            direction = 'DEBIT' if amount_value < 0 else 'CREDIT'
            description = attributes['description'] # Use Up's cleaned description

            # Build the FundFlow Transaction object
            new_tx = Transaction(
                user=user,
                bank_transaction_id=bank_id,
                source='up_bank',
                transaction_date=transaction_date,
                description=description,
                amount=abs(amount_value), # Store positive amount
                direction=direction,
                # Optional: Map other fields if needed and available
                # e.g., source_type could map from attributes['transactionType'] if populated
            )
            transactions_to_create.append(new_tx)

        except (KeyError, TypeError, ValueError) as e:
            logger.error(f"[Sync User {user_id}]: Error transforming transaction data for bank_id {bank_id}: {e}. Data: {tx_data}")
            # Optionally add to an error list to report back
            continue # Skip this transaction

    logger.info(f"[Sync User {user_id}]: Processed API data. Found {duplicate_count} duplicates. Prepared {len(transactions_to_create)} new transactions.")

    # --- Bulk Create ---
    created_count = 0
    if transactions_to_create:
        try:
            with db_transaction.atomic():
                created_objects = Transaction.objects.bulk_create(transactions_to_create)
                created_count = len(created_objects)
            logger.info(f"[Sync User {user_id}]: Successfully bulk created {created_count} new transactions.")
        except Exception as e:
            logger.exception(f"[Sync User {user_id}]: Database error during bulk creation: {e}")
            return {'success': False, 'message': 'Database error saving new transactions.', 'created_count': 0, 'duplicate_count': duplicate_count, 'error': 'db_bulk_create_error'}

    # --- Update Sync Timestamp ---
    try:
        # Use the *latest createdAt timestamp* from the *successfully processed batch*
        # Or fallback to the time the sync started if no tx were processed/found
        timestamp_to_save = latest_transaction_created_at if latest_transaction_created_at else sync_start_time
        integration.last_synced_at = timestamp_to_save
        integration.save(update_fields=['last_synced_at'])
        logger.info(f"[Sync User {user_id}]: Updated last_synced_at to {timestamp_to_save.isoformat()}")
    except Exception as e:
        # Log error but don't necessarily fail the whole sync if transactions were saved
        logger.exception(f"[Sync User {user_id}]: Failed to update last_synced_at timestamp: {e}")
        # The sync was otherwise successful, but this might cause duplicate checks next time

    message = f"Sync complete. Imported {created_count} new transactions."
    if duplicate_count > 0:
        message += f" Skipped {duplicate_count} duplicates."

    return {'success': True, 'message': message, 'created_count': created_count, 'duplicate_count': duplicate_count, 'error': None}