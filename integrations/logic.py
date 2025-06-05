# integrations/logic.py
import logging
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from dateutil.parser import isoparse

from django.contrib.auth import get_user_model
from django.db import transaction as db_transaction
from requests.exceptions import RequestException, HTTPError

from .models import UpIntegration
from .utils import decrypt_token
from .services import get_transactions as get_up_transactions
from transactions.models import Transaction, BASE_CURRENCY_FOR_CONVERSION
from transactions.services import get_historical_rate

logger = logging.getLogger(__name__)
User = get_user_model()

DEFAULT_INITIAL_SYNC_DAYS = 90

def sync_up_transactions_for_user(user_id: int, initial_sync: bool = False, since_date_str: str = None, until_date_str: str = None) -> dict:
    try:
        user = User.objects.get(pk=user_id)
        integration = UpIntegration.objects.select_related('user').get(user=user)
        logger.info(f"[Sync User {user_id}]: Starting sync (Source: Up Bank). Initial: {initial_sync}. Provided since: {since_date_str}, until: {until_date_str}.")
    except User.DoesNotExist:
        logger.error(f"[Sync User {user_id}]: User not found.")
        return {'success': False, 'message': 'User not found.', 'created_count': 0, 'duplicate_count': 0, 'skipped_conversion_error':0, 'conversion_failures': [], 'error': 'user_not_found'}
    except UpIntegration.DoesNotExist:
        logger.warning(f"[Sync User {user_id}]: Up Integration record not found.")
        return {'success': False, 'message': 'Up Bank account not linked.', 'created_count': 0, 'duplicate_count': 0, 'skipped_conversion_error':0, 'conversion_failures': [], 'error': 'integration_not_found'}

    pat = decrypt_token(integration.personal_access_token_encrypted)
    if not pat:
        logger.error(f"[Sync User {user_id}]: Failed to decrypt PAT.")
        return {'success': False, 'message': 'Internal error: Could not access token.', 'created_count': 0, 'duplicate_count': 0, 'skipped_conversion_error':0, 'conversion_failures': [], 'error': 'decryption_failed'}

    sync_start_time = datetime.now(timezone.utc)
    since_filter_iso = None # Defined further down based on sync type
    until_filter_iso = None # For the new 'until' parameter
    min_date_for_db_query = None # For optimizing duplicate check

    # Handle 'until' date first
    if until_date_str:
        try:
            # Assuming until_date_str is YYYY-MM-DD from the date picker
            parsed_until_date = datetime.strptime(until_date_str, '%Y-%m-%d')
            # Set to end of day, make timezone-aware (UTC), then format
            until_filter_iso = parsed_until_date.replace(hour=23, minute=59, second=59, microsecond=999999, tzinfo=timezone.utc).isoformat()
            logger.info(f"[Sync User {user_id}]: Using provided until_date (UTC end of day): {until_filter_iso}")
        except ValueError:
            logger.warning(f"[Sync User {user_id}]: Invalid until_date_str '{until_date_str}'. Ignoring.")
            until_filter_iso = None # Up API will fetch up to current time if None

    # Determine 'since' date
    if since_date_str:
        try:
            # Assuming since_date_str is YYYY-MM-DD from the date picker
            parsed_custom_date = datetime.strptime(since_date_str, '%Y-%m-%d')
            # Set to beginning of day, make timezone-aware (UTC), then format
            since_filter_iso = parsed_custom_date.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc).isoformat()
            min_date_for_db_query = parsed_custom_date.date() # Keep this as date for DB query optimization
            logger.info(f"[Sync User {user_id}]: Using provided since_date (UTC start of day): {since_filter_iso}")
        except ValueError:
            logger.warning(f"[Sync User {user_id}]: Invalid since_date_str '{since_date_str}'. Falling back to default logic.")
            since_date_str = None # Reset to fall through

    if not since_filter_iso: # Only if not set by a valid since_date_str
        if initial_sync:
            # Default to start of day, X days ago, UTC
            default_since = (sync_start_time - timedelta(days=DEFAULT_INITIAL_SYNC_DAYS)).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
            since_filter_iso = default_since.isoformat()
            min_date_for_db_query = default_since.date()
            logger.info(f"[Sync User {user_id}]: Initial sync, fetching since (UTC start of day): {since_filter_iso}")
        elif integration.last_synced_at:
            # last_synced_at is already UTC and has time, add 1 sec to avoid re-fetching last tx
            since_filter_iso = (integration.last_synced_at + timedelta(seconds=1)).isoformat()
            min_date_for_db_query = integration.last_synced_at.date()
            logger.info(f"[Sync User {user_id}]: Subsequent sync, fetching since: {since_filter_iso}")
        else:
            # Fallback: Default to start of day, X days ago, UTC
            default_since = (sync_start_time - timedelta(days=DEFAULT_INITIAL_SYNC_DAYS)).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=timezone.utc)
            since_filter_iso = default_since.isoformat()
            min_date_for_db_query = default_since.date()
            logger.warning(f"[Sync User {user_id}]: last_synced_at is null and no valid since_date provided. Defaulting to {DEFAULT_INITIAL_SYNC_DAYS}-day lookback (UTC start of day): {since_filter_iso}")

    try:
        logger.info(f"[Sync User {user_id}]: Calling get_up_transactions service (since={since_filter_iso}, until={until_filter_iso})...")
        up_transactions_data = get_up_transactions(pat, since_iso=since_filter_iso, until_iso=until_filter_iso)
        logger.info(f"[Sync User {user_id}]: Fetched {len(up_transactions_data)} transactions from Up API.")
    except HTTPError as e: # ... (error handling as before, with skipped_conversion_error) ...
        error_code = 'api_http_error'
        message = f"Error communicating with Up Bank (HTTP {e.response.status_code})."
        if e.response.status_code == 401: message, error_code = "Up Bank token is invalid or expired. Please relink.", 'invalid_token'
        logger.error(f"[Sync User {user_id}]: HTTP error fetching Up transactions: {e.response.status_code} - {e.response.text[:200]}")
        return {'success': False, 'message': message, 'created_count': 0, 'duplicate_count': 0, 'skipped_conversion_error':0, 'conversion_failures': [], 'error': error_code}
    except RequestException as e: # ... (error handling as before, with skipped_conversion_error) ...
        logger.error(f"[Sync User {user_id}]: Network error fetching Up transactions: {e}")
        return {'success': False, 'message': 'Network error connecting to Up Bank.', 'created_count': 0, 'duplicate_count': 0, 'skipped_conversion_error':0, 'conversion_failures': [], 'error': 'api_network_error'}
    except Exception as e:
        logger.exception(f"[Sync User {user_id}]: Unexpected error during Up transaction fetch: {e}")
        return {'success': False, 'message': 'An unexpected error occurred during sync.', 'created_count': 0, 'duplicate_count': 0, 'skipped_conversion_error':0, 'conversion_failures': [], 'error': 'sync_fetch_error'}

    if not up_transactions_data: # ... (handling as before) ...
        logger.info(f"[Sync User {user_id}]: No new Up transactions found since {since_filter_iso}.")
        integration.last_synced_at = sync_start_time
        integration.save(update_fields=['last_synced_at'])
        return {'success': True, 'message': 'No new transactions from Up Bank found.', 'created_count': 0, 'duplicate_count': 0, 'skipped_conversion_error':0, 'conversion_failures': [], 'error': None}


    fetched_bank_ids = {tx['id'] for tx in up_transactions_data}
    existing_bank_ids_in_db = set(
        Transaction.objects.filter(
            user=user, source='up_bank', bank_transaction_id__in=fetched_bank_ids
        ).values_list('bank_transaction_id', flat=True)
    )
    logger.info(f"[Sync User {user_id}]: Found {len(existing_bank_ids_in_db)} existing Up transaction IDs in DB matching fetched IDs.")

    transactions_to_create = []
    duplicate_count = 0
    skipped_conversion_error_count = 0
    conversion_failures = []  # Track detailed conversion failure information
    latest_transaction_api_created_at = None

    for tx_data in up_transactions_data:
        bank_id = tx_data['id']
        attributes = tx_data['attributes']

        if bank_id in existing_bank_ids_in_db:
            duplicate_count += 1
            continue

        try:
            api_created_at_str = attributes['createdAt']
            api_created_at_dt = isoparse(api_created_at_str)
            transaction_date_obj = api_created_at_dt.date()

            if latest_transaction_api_created_at is None or api_created_at_dt > latest_transaction_api_created_at:
                latest_transaction_api_created_at = api_created_at_dt

            # --- UPDATED: Logic to get original amount and currency from Up API ---
            original_amount_details = attributes.get('foreignAmount') # Prioritize foreignAmount
            if original_amount_details and original_amount_details.get('valueInBaseUnits') is not None:
                # This was a foreign currency transaction
                original_amount_val_cents = original_amount_details['valueInBaseUnits']
                original_currency_code = original_amount_details['currencyCode'].upper()
                logger.debug(f"[Sync User {user_id}]: Tx {bank_id} is foreign: {original_amount_val_cents} {original_currency_code}")
            else:
                # Domestic transaction or foreignAmount is null/incomplete
                original_amount_details = attributes['amount'] # Fallback to primary amount
                original_amount_val_cents = original_amount_details['valueInBaseUnits']
                original_currency_code = original_amount_details['currencyCode'].upper()
                logger.debug(f"[Sync User {user_id}]: Tx {bank_id} is domestic/primary: {original_amount_val_cents} {original_currency_code}")
            # --- END UPDATED ---

            original_amount_decimal = Decimal(original_amount_val_cents) / 100
            direction = 'DEBIT' if original_amount_decimal < 0 else 'CREDIT'
            abs_original_amount = abs(original_amount_decimal)
            
            description = attributes['description']

            aud_amount_val = None
            exchange_rate_val = None

            # --- MODIFIED SECTION FOR CURRENCY CONVERSION (Bank API Sync) ---
            if original_currency_code == BASE_CURRENCY_FOR_CONVERSION: # e.g., 'AUD'
                aud_amount_val = abs_original_amount
                exchange_rate_val = Decimal("1.0")
            else:
                # Foreign currency transaction: Attempt to convert to AUD immediately.
                rate = get_historical_rate( # Ensure get_historical_rate is imported from transactions.services
                    transaction_date_obj, # This should be a date object
                    original_currency_code,
                    BASE_CURRENCY_FOR_CONVERSION
                )
                if rate is not None:
                    aud_amount_val = (abs_original_amount * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                    exchange_rate_val = rate
                    logger.info(f"[Sync User {user_id}]: Converted {original_currency_code} transaction {bank_id} to AUD. Rate: {exchange_rate_val}, AUD Amount: {aud_amount_val}.")
                else:
                    # aud_amount_val and exchange_rate_val remain None
                    logger.warning(f"[Sync User {user_id}]: Could not get exchange rate for {original_currency_code} transaction {bank_id} dated {transaction_date_obj} to AUD. AUD amount will be None.")
                    
                    # Track detailed conversion failure information
                    conversion_failures.append({
                        'currency': original_currency_code,
                        'date': transaction_date_obj.isoformat(),
                        'amount': str(abs_original_amount),
                        'description': description[:50] + ('...' if len(description) > 50 else ''),
                        'reason': 'missing_exchange_rate'
                    })
                    skipped_conversion_error_count += 1

            # Create the Transaction object
            new_tx = Transaction(
                user=user, bank_transaction_id=bank_id, source='up_bank',
                transaction_date=transaction_date_obj, description=description,
                original_amount=abs_original_amount, original_currency=original_currency_code,
                direction=direction, aud_amount=aud_amount_val, exchange_rate_to_aud=exchange_rate_val
            )
            transactions_to_create.append(new_tx)

        except (KeyError, TypeError, ValueError) as e:
            logger.error(f"[Sync User {user_id}]: Error transforming Up transaction data for bank_id {bank_id}: {e}. Data: {attributes}", exc_info=True)
            
            # Track data parsing failures
            conversion_failures.append({
                'currency': 'UNKNOWN',
                'date': 'UNKNOWN',
                'amount': 'UNKNOWN',
                'description': f'Data parsing error for transaction {bank_id}',
                'reason': 'data_parsing_error'
            })
            skipped_conversion_error_count += 1
            continue

    logger.info(f"[Sync User {user_id}]: Processed API data. Duplicates: {duplicate_count}. New: {len(transactions_to_create)}. Conversion errors: {skipped_conversion_error_count}.")

    created_count = 0
    if transactions_to_create: # ... (bulk create logic as before) ...
        try:
            with db_transaction.atomic():
                created_objects = Transaction.objects.bulk_create(transactions_to_create)
                created_count = len(created_objects)
            logger.info(f"[Sync User {user_id}]: Successfully bulk created {created_count} new Up transactions.")
        except Exception as e:
            logger.exception(f"[Sync User {user_id}]: Database error during bulk creation: {e}")
            return {'success': False, 'message': 'Database error saving new transactions.', 'created_count': 0, 'duplicate_count': duplicate_count, 'skipped_conversion_error': skipped_conversion_error_count, 'conversion_failures': conversion_failures, 'error': 'db_bulk_create_error'}

    try: # ... (update last_synced_at logic as before) ...
        timestamp_to_save = latest_transaction_api_created_at if latest_transaction_api_created_at else sync_start_time
        integration.last_synced_at = timestamp_to_save
        integration.save(update_fields=['last_synced_at'])
        logger.info(f"[Sync User {user_id}]: Updated last_synced_at to {timestamp_to_save.isoformat()}")
    except Exception as e:
        logger.exception(f"[Sync User {user_id}]: Failed to update last_synced_at: {e}")

    message = f"Up Bank sync complete. Imported {created_count} new transactions." # ... (message building as before) ...
    if duplicate_count > 0: message += f" Skipped {duplicate_count} duplicates."
    if skipped_conversion_error_count > 0: message += f" {skipped_conversion_error_count} transactions could not be converted to {BASE_CURRENCY_FOR_CONVERSION} due to missing exchange rates."
    return {
        'success': True, 'message': message, 'created_count': created_count,
        'duplicate_count': duplicate_count, 'skipped_conversion_error': skipped_conversion_error_count, 
        'conversion_failures': conversion_failures, 'error': None
    }