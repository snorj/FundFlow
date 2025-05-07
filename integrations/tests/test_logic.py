# integrations/tests/test_logic.py
from decimal import Decimal
from unittest import mock
from datetime import datetime, timedelta, timezone

from django.test import TestCase
from django.contrib.auth import get_user_model
from requests import HTTPError

from integrations.models import UpIntegration
from integrations.logic import sync_up_transactions_for_user, DEFAULT_INITIAL_SYNC_DAYS, BASE_CURRENCY_FOR_CONVERSION
from transactions.models import Transaction # Import your app's Transaction model

User = get_user_model()

# Helper to create a mock Up API transaction data structure
def create_mock_up_transaction(tx_id, created_at_iso, amount_cents, currency_code="AUD", description="Test Transaction"):
    return {
        "id": tx_id,
        "attributes": {
            "createdAt": created_at_iso,
            "description": description,
            "amount": {
                "currencyCode": currency_code,
                "valueInBaseUnits": amount_cents, # e.g., -1234 for -12.34
                "value": str(Decimal(amount_cents) / 100) # For completeness, though logic uses valueInBaseUnits
            },
            # Add other attributes if your logic starts using them
        },
        # Add links if your logic uses them (not currently)
    }

class SyncUpTransactionsLogicTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username="testsyncuser", password="password")

        # Patch decrypt_token AS IT IS IMPORTED AND USED within the 'integrations.logic' module
        self.decrypt_patcher = mock.patch('integrations.logic.decrypt_token')
        self.mock_decrypt = self.decrypt_patcher.start()
        self.mock_decrypt.return_value = "decrypted_pat_token" # Ensure this mock is active

        # We don't actually need to mock encrypt_token for these logic tests,
        # as sync_up_transactions_for_user does not call encrypt_token.
        # If other logic functions did, we'd patch 'integrations.logic.encrypt_token' similarly.

        # These service layer mocks remain the same, as they are called from integrations.logic
        self.get_up_transactions_patcher = mock.patch('integrations.logic.get_up_transactions')
        self.get_historical_rate_patcher = mock.patch('integrations.logic.get_historical_exchange_rate')
        self.mock_get_up_transactions = self.get_up_transactions_patcher.start()
        self.mock_get_historical_rate = self.get_historical_rate_patcher.start()


    def tearDown(self):
        # It's good practice to stop patchers in reverse order of starting,
        # though for non-overlapping patches it doesn't strictly matter.
        self.get_historical_rate_patcher.stop()
        self.get_up_transactions_patcher.stop()
        self.decrypt_patcher.stop()

    def _create_integration(self, last_synced_at=None):
        # Assume token is already encrypted for this mock setup
        return UpIntegration.objects.create(
            user=self.user,
            personal_access_token_encrypted="fake_encrypted_token",
            last_synced_at=last_synced_at
        )

    def test_sync_user_not_found(self):
        result = sync_up_transactions_for_user(user_id=999) # Non-existent user
        self.assertFalse(result['success'])
        self.assertEqual(result['error'], 'user_not_found')

    def test_sync_integration_not_found(self):
        result = sync_up_transactions_for_user(user_id=self.user.id)
        self.assertFalse(result['success'])
        self.assertEqual(result['error'], 'integration_not_found')

    def test_sync_pat_decryption_fails(self):
        self._create_integration()
        self.mock_decrypt.return_value = None # Simulate decryption failure
        result = sync_up_transactions_for_user(user_id=self.user.id)
        self.assertFalse(result['success'])
        self.assertEqual(result['error'], 'decryption_failed')

    def test_sync_initial_no_custom_date(self):
        self._create_integration()
        self.mock_get_up_transactions.return_value = [] # No transactions from API

        sync_up_transactions_for_user(user_id=self.user.id, initial_sync=True)

        # Check that get_up_transactions was called with a 'since' approximately N days ago
        self.mock_get_up_transactions.assert_called_once()
        call_args = self.mock_get_up_transactions.call_args[0] # (token, since_iso=...)
        call_kwargs = self.mock_get_up_transactions.call_args[1] # {} in this case, or use named args
        
        # More robust way to get named arg if it might be positional or keyword
        since_iso_arg = call_kwargs.get('since_iso', call_args[1] if len(call_args) > 1 else None)

        self.assertIsNotNone(since_iso_arg)
        expected_since_date = (datetime.now(timezone.utc) - timedelta(days=DEFAULT_INITIAL_SYNC_DAYS)).date()
        actual_since_date = datetime.fromisoformat(since_iso_arg).date()
        # Allow for a small difference due to execution time
        self.assertAlmostEqual(actual_since_date, expected_since_date, delta=timedelta(days=1))

    def test_sync_initial_with_custom_date(self):
        self._create_integration()
        self.mock_get_up_transactions.return_value = []
        custom_date_str_input = "2023-01-01T00:00:00Z" # Input with Z
        # Expected output from .isoformat() for a UTC datetime often includes +00:00
        expected_iso_output = "2023-01-01T00:00:00+00:00" 

        sync_up_transactions_for_user(user_id=self.user.id, initial_sync=True, custom_since_iso=custom_date_str_input)
        
        # Assert using the expected isoformat output
        self.mock_get_up_transactions.assert_called_once_with("decrypted_pat_token", since_iso=expected_iso_output)

    def test_sync_subsequent(self):
        last_sync = datetime.now(timezone.utc) - timedelta(days=5)
        self._create_integration(last_synced_at=last_sync)
        self.mock_get_up_transactions.return_value = []

        sync_up_transactions_for_user(user_id=self.user.id) # initial_sync is False by default
        expected_since_iso = (last_sync + timedelta(seconds=1)).isoformat()
        self.mock_get_up_transactions.assert_called_once_with("decrypted_pat_token", since_iso=expected_since_iso)

    def test_sync_creates_new_aud_transactions(self):
        integration = self._create_integration()
        now_iso = datetime.now(timezone.utc).isoformat()
        mock_api_tx = [
            create_mock_up_transaction("up-tx-1", now_iso, -1000, "AUD", "Coffee AUD"),
        ]
        self.mock_get_up_transactions.return_value = mock_api_tx

        result = sync_up_transactions_for_user(user_id=self.user.id, initial_sync=True)

        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 1)
        self.assertEqual(Transaction.objects.count(), 1)
        created_tx = Transaction.objects.first()
        self.assertEqual(created_tx.bank_transaction_id, "up-tx-1")
        self.assertEqual(created_tx.original_amount, Decimal("10.00"))
        self.assertEqual(created_tx.original_currency, "AUD")
        self.assertEqual(created_tx.direction, "DEBIT")
        self.assertEqual(created_tx.aud_amount, Decimal("10.00")) # AUD to AUD
        self.assertEqual(created_tx.exchange_rate_to_aud, Decimal("1.0"))
        self.assertEqual(created_tx.description, "Coffee AUD")
        self.assertEqual(created_tx.source, "up_bank")

        integration.refresh_from_db()
        self.assertIsNotNone(integration.last_synced_at)
        # Check if last_synced_at is close to the transaction's createdAt
        self.assertAlmostEqual(integration.last_synced_at, datetime.fromisoformat(now_iso), delta=timedelta(seconds=1))


    def test_sync_skips_duplicates(self):
        self._create_integration()
        now_iso = datetime.now(timezone.utc).isoformat()
        # Pre-existing transaction
        Transaction.objects.create(
            user=self.user, bank_transaction_id="up-tx-existing", source="up_bank",
            transaction_date=datetime.now(timezone.utc).date(), description="Existing",
            original_amount=Decimal("5.00"), original_currency="AUD", direction="DEBIT",
            aud_amount=Decimal("5.00"), exchange_rate_to_aud=Decimal("1.0")
        )
        mock_api_tx = [
            create_mock_up_transaction("up-tx-existing", now_iso, -500, "AUD", "Existing From API"), # Duplicate
            create_mock_up_transaction("up-tx-new", now_iso, -2000, "AUD", "New From API"),
        ]
        self.mock_get_up_transactions.return_value = mock_api_tx

        result = sync_up_transactions_for_user(user_id=self.user.id, initial_sync=True)
        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 1)
        self.assertEqual(result['duplicate_count'], 1)
        self.assertEqual(Transaction.objects.count(), 2) # 1 existing + 1 new
        self.assertTrue(Transaction.objects.filter(bank_transaction_id="up-tx-new").exists())


    def test_sync_converts_foreign_currency(self):
        integration = self._create_integration()
        tx_date = datetime.now(timezone.utc) - timedelta(days=1)
        tx_date_iso = tx_date.isoformat()
        tx_date_str_for_api = tx_date.strftime('%Y-%m-%d')

        mock_api_tx = [
            create_mock_up_transaction("up-tx-eur", tx_date_iso, -1000, "EUR", "Souvenir EUR"), # 10 EUR
        ]
        self.mock_get_up_transactions.return_value = mock_api_tx
        self.mock_get_historical_rate.return_value = Decimal("1.65") # 1 EUR = 1.65 AUD

        result = sync_up_transactions_for_user(user_id=self.user.id, initial_sync=True)

        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 1)
        self.assertEqual(Transaction.objects.count(), 1)
        created_tx = Transaction.objects.first()

        self.mock_get_historical_rate.assert_called_once_with(
            tx_date_str_for_api, "EUR", BASE_CURRENCY_FOR_CONVERSION
        )
        self.assertEqual(created_tx.original_amount, Decimal("10.00"))
        self.assertEqual(created_tx.original_currency, "EUR")
        self.assertEqual(created_tx.aud_amount, Decimal("16.50")) # 10 * 1.65
        self.assertEqual(created_tx.exchange_rate_to_aud, Decimal("1.65"))

        integration.refresh_from_db()
        self.assertAlmostEqual(integration.last_synced_at, tx_date, delta=timedelta(seconds=1))


    def test_sync_handles_failed_currency_conversion(self):
        self._create_integration()
        tx_date_iso = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        mock_api_tx = [
            create_mock_up_transaction("up-tx-jpy", tx_date_iso, -500000, "JPY", "Lunch JPY"), # 5000 JPY
        ]
        self.mock_get_up_transactions.return_value = mock_api_tx
        self.mock_get_historical_rate.return_value = None # Simulate failure to get rate

        result = sync_up_transactions_for_user(user_id=self.user.id, initial_sync=True)

        self.assertTrue(result['success']) # Sync itself is successful, but with issues
        self.assertEqual(result['created_count'], 1)
        self.assertEqual(result['skipped_conversion_error'], 1)
        self.assertEqual(Transaction.objects.count(), 1)
        created_tx = Transaction.objects.first()
        self.assertEqual(created_tx.original_amount, Decimal("5000.00"))
        self.assertEqual(created_tx.original_currency, "JPY")
        self.assertIsNone(created_tx.aud_amount) # Should be None
        self.assertIsNone(created_tx.exchange_rate_to_aud) # Should be None

    def test_sync_api_http_error(self):
        self._create_integration()
        # Mock the HTTPError response details
        mock_http_error_response = mock.Mock()
        mock_http_error_response.status_code = 401
        mock_http_error_response.text = '{"errors": [{"title": "Not Authorized"}]}'
        self.mock_get_up_transactions.side_effect = HTTPError(response=mock_http_error_response)

        result = sync_up_transactions_for_user(user_id=self.user.id)
        self.assertFalse(result['success'])
        self.assertEqual(result['error'], 'invalid_token')

    def test_sync_no_new_transactions_updates_timestamp(self):
        last_sync_time = datetime.now(timezone.utc) - timedelta(hours=1)
        integration = self._create_integration(last_synced_at=last_sync_time)
        self.mock_get_up_transactions.return_value = [] # No new transactions

        before_sync_call_time = datetime.now(timezone.utc)
        result = sync_up_transactions_for_user(user_id=self.user.id)
        after_sync_call_time = datetime.now(timezone.utc)

        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 0)
        integration.refresh_from_db()
        # last_synced_at should be updated to around the time the sync ran
        self.assertTrue(before_sync_call_time <= integration.last_synced_at <= after_sync_call_time)