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
def create_mock_up_transaction(tx_id, created_at_iso, aud_amount_cents, foreign_amount_cents=None, foreign_currency_code=None, description="Test Transaction"):
    """
    Create a mock Up Bank API transaction.
    
    Args:
        tx_id: Transaction ID
        created_at_iso: ISO timestamp
        aud_amount_cents: Actual AUD amount charged by Up Bank (e.g., -1650 for -$16.50)
        foreign_amount_cents: Original foreign currency amount (e.g., -1000 for -10.00 EUR)
        foreign_currency_code: Original currency code (e.g., "EUR")
        description: Transaction description
    """
    transaction_data = {
        "id": tx_id,
        "attributes": {
            "createdAt": created_at_iso,
            "description": description,
            "amount": {
                "currencyCode": "AUD",  # Up Bank always charges in AUD
                "valueInBaseUnits": aud_amount_cents,  # Actual AUD amount charged
                "value": str(Decimal(aud_amount_cents) / 100)
            },
        },
    }
    
    # Add foreignAmount only if this was a foreign currency transaction
    if foreign_amount_cents is not None and foreign_currency_code is not None:
        transaction_data["attributes"]["foreignAmount"] = {
            "currencyCode": foreign_currency_code,
            "valueInBaseUnits": foreign_amount_cents,  # Original foreign amount
            "value": str(Decimal(foreign_amount_cents) / 100)
        }
    
    return transaction_data

class SyncUpTransactionsLogicTests(TestCase):

    def setUp(self):
        self.user = User.objects.create_user(username="testsyncuser", password="password")

        # Patch decrypt_token AS IT IS IMPORTED AND USED within the 'integrations.logic' module
        self.decrypt_patcher = mock.patch('integrations.logic.decrypt_token')
        self.mock_decrypt = self.decrypt_patcher.start()
        self.mock_decrypt.return_value = "decrypted_pat_token" # Ensure this mock is active

        # We don't need get_historical_rate anymore since we use actual AUD amounts
        self.get_up_transactions_patcher = mock.patch('integrations.logic.get_up_transactions')
        self.mock_get_up_transactions = self.get_up_transactions_patcher.start()

    def tearDown(self):
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
        custom_date_str_input = "2023-01-01"  # Using YYYY-MM-DD format as expected by since_date_str

        sync_up_transactions_for_user(user_id=self.user.id, initial_sync=True, since_date_str=custom_date_str_input)
        
        # Expected ISO format for 2023-01-01 start of day
        expected_iso_output = "2023-01-01T00:00:00+00:00" 
        self.mock_get_up_transactions.assert_called_once_with("decrypted_pat_token", since_iso=expected_iso_output, until_iso=None)

    def test_sync_subsequent(self):
        last_sync = datetime.now(timezone.utc) - timedelta(days=5)
        self._create_integration(last_synced_at=last_sync)
        self.mock_get_up_transactions.return_value = []

        sync_up_transactions_for_user(user_id=self.user.id) # initial_sync is False by default
        expected_since_iso = (last_sync + timedelta(seconds=1)).isoformat()
        self.mock_get_up_transactions.assert_called_once_with("decrypted_pat_token", since_iso=expected_since_iso, until_iso=None)

    def test_sync_creates_new_aud_transactions(self):
        integration = self._create_integration()
        now_iso = datetime.now(timezone.utc).isoformat()
        mock_api_tx = [
            create_mock_up_transaction("up-tx-1", now_iso, -1000, description="Coffee AUD"),  # AUD domestic transaction
        ]
        self.mock_get_up_transactions.return_value = mock_api_tx

        result = sync_up_transactions_for_user(user_id=self.user.id, initial_sync=True)

        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 1)
        self.assertEqual(Transaction.objects.count(), 1)
        created_tx = Transaction.objects.first()
        self.assertEqual(created_tx.bank_transaction_id, "up-tx-1")
        self.assertEqual(created_tx.original_amount, Decimal("10.00"))  # Same as AUD amount for domestic
        self.assertEqual(created_tx.original_currency, "AUD")
        self.assertEqual(created_tx.direction, "DEBIT")
        self.assertEqual(created_tx.aud_amount, Decimal("10.00"))  # Up Bank's actual AUD charge
        self.assertEqual(created_tx.exchange_rate_to_aud, Decimal("1.0"))
        self.assertEqual(created_tx.description, "Coffee AUD")
        self.assertEqual(created_tx.source, "up_bank")

        integration.refresh_from_db()
        self.assertIsNotNone(integration.last_synced_at)
        # Check if last_synced_at is close to the transaction's createdAt
        self.assertAlmostEqual(integration.last_synced_at, datetime.fromisoformat(now_iso), delta=timedelta(seconds=1))

    def test_sync_handles_foreign_currency_with_actual_aud_amount(self):
        """Test that foreign currency transactions use Up Bank's actual AUD amounts rather than calculated conversions."""
        integration = self._create_integration()
        tx_date = datetime.now(timezone.utc) - timedelta(days=1)
        tx_date_iso = tx_date.isoformat()

        # Up Bank charges $16.50 AUD for a 10.00 EUR transaction (includes their fees/margins)
        mock_api_tx = [
            create_mock_up_transaction(
                "up-tx-eur", 
                tx_date_iso, 
                -1650,  # Actual AUD amount charged: -$16.50
                -1000,  # Original foreign amount: -10.00 EUR
                "EUR",
                "Souvenir EUR"
            ),
        ]
        self.mock_get_up_transactions.return_value = mock_api_tx

        result = sync_up_transactions_for_user(user_id=self.user.id, initial_sync=True)

        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 1)
        self.assertEqual(Transaction.objects.count(), 1)
        created_tx = Transaction.objects.first()

        # Should store the original foreign currency info for reference
        self.assertEqual(created_tx.original_amount, Decimal("10.00"))  # Original EUR amount
        self.assertEqual(created_tx.original_currency, "EUR")
        
        # Should use Up Bank's actual AUD charge (not calculated conversion)
        self.assertEqual(created_tx.aud_amount, Decimal("16.50"))  # Up Bank's actual AUD charge
        
        # Should calculate the effective rate Up Bank used: 16.50 / 10.00 = 1.65
        self.assertEqual(created_tx.exchange_rate_to_aud, Decimal("1.65"))  # Effective rate
        
        self.assertEqual(created_tx.direction, "DEBIT")
        self.assertEqual(created_tx.description, "Souvenir EUR")

        integration.refresh_from_db()
        self.assertAlmostEqual(integration.last_synced_at, tx_date, delta=timedelta(seconds=1))

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
            create_mock_up_transaction("up-tx-existing", now_iso, -500, description="Existing From API"), # Duplicate
            create_mock_up_transaction("up-tx-new", now_iso, -2000, description="New From API"),
        ]
        self.mock_get_up_transactions.return_value = mock_api_tx

        result = sync_up_transactions_for_user(user_id=self.user.id, initial_sync=True)
        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 1)
        self.assertEqual(result['duplicate_count'], 1)
        self.assertEqual(Transaction.objects.count(), 2) # 1 existing + 1 new
        self.assertTrue(Transaction.objects.filter(bank_transaction_id="up-tx-new").exists())

    def test_sync_converts_foreign_currency(self):
        """This test name is now misleading - we don't convert anymore, we use Up Bank's actual AUD amounts."""
        integration = self._create_integration()
        tx_date = datetime.now(timezone.utc) - timedelta(days=1)
        tx_date_iso = tx_date.isoformat()

        # Up Bank charged $16.50 AUD for a 10.00 EUR transaction
        mock_api_tx = [
            create_mock_up_transaction(
                "up-tx-eur", 
                tx_date_iso, 
                -1650,  # Up Bank's actual AUD charge: -$16.50
                -1000,  # Original EUR amount: -10.00 EUR
                "EUR",
                "Souvenir EUR"
            ),
        ]
        self.mock_get_up_transactions.return_value = mock_api_tx

        result = sync_up_transactions_for_user(user_id=self.user.id, initial_sync=True)

        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 1)
        self.assertEqual(Transaction.objects.count(), 1)
        created_tx = Transaction.objects.first()

        # Should store original EUR amount for reference
        self.assertEqual(created_tx.original_amount, Decimal("10.00"))
        self.assertEqual(created_tx.original_currency, "EUR")
        
        # Should use Up Bank's actual AUD charge
        self.assertEqual(created_tx.aud_amount, Decimal("16.50"))
        
        # Should calculate effective rate: 16.50 / 10.00 = 1.65
        self.assertEqual(created_tx.exchange_rate_to_aud, Decimal("1.65"))

        integration.refresh_from_db()
        self.assertAlmostEqual(integration.last_synced_at, tx_date, delta=timedelta(seconds=1))

    def test_sync_handles_failed_currency_conversion(self):
        """This test is no longer relevant since we don't do currency conversion - we use actual AUD amounts.
        Keeping it for backward compatibility but with updated expectations."""
        self._create_integration()
        tx_date_iso = (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()
        
        # Even foreign currency transactions should succeed now since we use actual AUD amounts
        mock_api_tx = [
            create_mock_up_transaction(
                "up-tx-jpy", 
                tx_date_iso, 
                -5000,  # Up Bank's actual AUD charge: -$50.00
                -500000,  # Original JPY amount: -5000.00 JPY
                "JPY",
                "Lunch JPY"
            ),
        ]
        self.mock_get_up_transactions.return_value = mock_api_tx

        result = sync_up_transactions_for_user(user_id=self.user.id, initial_sync=True)

        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 1)
        self.assertEqual(result['skipped_conversion_error'], 0)  # No conversion errors anymore
        self.assertEqual(Transaction.objects.count(), 1)
        created_tx = Transaction.objects.first()
        self.assertEqual(created_tx.original_amount, Decimal("5000.00"))  # Original JPY amount
        self.assertEqual(created_tx.original_currency, "JPY")
        self.assertEqual(created_tx.aud_amount, Decimal("50.00"))  # Up Bank's actual AUD charge
        self.assertEqual(created_tx.exchange_rate_to_aud, Decimal("0.01"))  # Effective rate: 50 / 5000 = 0.01

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