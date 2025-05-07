# integrations/tests/test_logic.py

import unittest
from unittest.mock import patch, MagicMock, ANY
from decimal import Decimal
from datetime import datetime, timedelta, timezone

from django.test import TestCase
from django.contrib.auth import get_user_model
import requests

# Import the function to test
from integrations.logic import sync_up_transactions_for_user, DEFAULT_INITIAL_SYNC_DAYS

# Import models involved (to mock or create instances)
from integrations.models import UpIntegration
from transactions.models import Transaction

# Assume User model is standard Django User or compatible
User = get_user_model()

# --- Helper function to create mock API transaction data ---
def create_mock_up_transaction(
    tx_id, created_at_iso, description="Test Merchant", amount_cents=-1234
):
    return {
        "id": tx_id,
        "attributes": {
            "status": "SETTLED",
            "description": description,
            "amount": {
                "currencyCode": "AUD",
                "value": f"{Decimal(amount_cents) / 100:.2f}",
                "valueInBaseUnits": amount_cents,
            },
            "createdAt": created_at_iso,
            "settledAt": created_at_iso, # Assume settled for simplicity
            # Add other fields if your transformation logic uses them
        },
        # Add relationships if needed by your logic
    }

# --- Test Class ---
class SyncUpTransactionsLogicTests(TestCase):

    @classmethod
    def setUpTestData(cls):
        # Create a user that exists across all tests in this class
        cls.user = User.objects.create_user(username="testsyncuser", password="password")
        # Store a fixed time for mocking 'now'
        cls.mock_now = datetime(2025, 4, 30, 12, 0, 0, tzinfo=timezone.utc)
        cls.test_pat_plain = "plain-test-pat-123"
        cls.test_pat_encrypted = "encrypted-test-pat-abc" # Assume this is the result of encryption

    def setUp(self):
        # Create integration instance for most tests - specific tests can override/delete
        self.integration = UpIntegration.objects.create(
            user=self.user,
            personal_access_token_encrypted=self.test_pat_encrypted,
            last_synced_at=None # Start with no sync history unless overridden
        )

    # --- Patch common dependencies ---
    # Note: Order matters for nested patches (applied bottom-up)
    @patch('integrations.logic.get_transactions')
    @patch('integrations.logic.decrypt_token')
    @patch('integrations.logic.Transaction.objects.bulk_create')
    @patch('integrations.logic.Transaction.objects.filter')
    @patch('integrations.logic.UpIntegration.objects.select_related') # Patching manager access
    @patch('integrations.logic.datetime') # Mock datetime
    def test_initial_sync_success_default_lookback(
        self, mock_dt, mock_up_integration_mgr, mock_tx_filter, mock_bulk_create, mock_decrypt, mock_get_tx
    ):
        """Test successful initial sync using default lookback period."""
        # --- Arrange ---
        # Mock datetime.now()
        mock_dt.now.return_value = self.mock_now
        mock_dt.side_effect = lambda *args, **kw: datetime(*args, **kw) # Allow creating datetimes

        # Mock UpIntegration get manager
        mock_up_integration_mgr.return_value.get.return_value = self.integration

        # Mock decrypt_token
        mock_decrypt.return_value = self.test_pat_plain

        # Mock Transaction filter (for duplicate check - return empty initially)
        mock_tx_filter.return_value.values_list.return_value.none() # Simulate no existing transactions

        # Mock get_transactions API call result
        tx1_time = (self.mock_now - timedelta(days=10)).isoformat()
        tx2_time = (self.mock_now - timedelta(days=5)).isoformat()
        mock_api_transactions = [
            create_mock_up_transaction("up-tx-1", tx1_time, amount_cents=-1000),
            create_mock_up_transaction("up-tx-2", tx2_time, amount_cents=500),
        ]
        mock_get_tx.return_value = mock_api_transactions

        # Mock bulk_create return value (needed for count)
        mock_bulk_create.return_value = [MagicMock(), MagicMock()] # Simulate 2 created objects

        # Calculate expected 'since' filter for default lookback
        expected_since = (self.mock_now - timedelta(days=DEFAULT_INITIAL_SYNC_DAYS)).isoformat()

        # --- Act ---
        result = sync_up_transactions_for_user(self.user.id, initial_sync=True)

        # --- Assert ---
        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 2)
        self.assertEqual(result['duplicate_count'], 0)
        self.assertIn("Imported 2 new transactions", result['message'])

        # Check mocks called correctly
        mock_decrypt.assert_called_once_with(self.test_pat_encrypted)
        mock_get_tx.assert_called_once_with(self.test_pat_plain, since_iso=expected_since)
        mock_tx_filter.assert_called_once() # Check it was called for duplicate check
        mock_bulk_create.assert_called_once() # Check bulk create was called
        # Check the objects passed to bulk_create have correct data
        created_tx_objects = mock_bulk_create.call_args[0][0]
        self.assertEqual(len(created_tx_objects), 2)
        self.assertEqual(created_tx_objects[0].bank_transaction_id, "up-tx-1")
        self.assertEqual(created_tx_objects[0].amount, Decimal("10.00"))
        self.assertEqual(created_tx_objects[0].direction, "DEBIT")
        self.assertEqual(created_tx_objects[0].source, "up_bank")
        self.assertEqual(created_tx_objects[1].bank_transaction_id, "up-tx-2")
        self.assertEqual(created_tx_objects[1].amount, Decimal("5.00"))
        self.assertEqual(created_tx_objects[1].direction, "CREDIT")

        # Check last_synced_at was updated correctly
        self.integration.refresh_from_db()
        # It should be updated to the LATEST createdAt timestamp from the fetched batch
        self.assertEqual(self.integration.last_synced_at, datetime.fromisoformat(tx2_time))


    @patch('integrations.logic.get_transactions')
    @patch('integrations.logic.decrypt_token')
    @patch('integrations.logic.Transaction.objects.bulk_create')
    @patch('integrations.logic.Transaction.objects.filter')
    @patch('integrations.logic.UpIntegration.objects.select_related')
    @patch('integrations.logic.datetime')
    def test_subsequent_sync_uses_last_synced_at(
        self, mock_dt, mock_up_integration_mgr, mock_tx_filter, mock_bulk_create, mock_decrypt, mock_get_tx
    ):
        """Test subsequent sync uses last_synced_at + 1s for the 'since' filter."""
         # --- Arrange ---
        last_sync = self.mock_now - timedelta(days=2)
        self.integration.last_synced_at = last_sync
        self.integration.save()

        mock_dt.now.return_value = self.mock_now
        mock_up_integration_mgr.return_value.get.return_value = self.integration
        mock_decrypt.return_value = self.test_pat_plain
        mock_tx_filter.return_value.values_list.return_value.none() # No duplicates
        mock_get_tx.return_value = [] # Simulate no new transactions found
        mock_bulk_create.return_value = []

        expected_since = (last_sync + timedelta(seconds=1)).isoformat()

        # --- Act ---
        result = sync_up_transactions_for_user(self.user.id) # initial_sync=False (default)

        # --- Assert ---
        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 0)
        self.assertEqual(result['duplicate_count'], 0)
        self.assertIn("No new transactions found", result['message'])

        mock_decrypt.assert_called_once_with(self.test_pat_encrypted)
        # Crucially, check the 'since' parameter used
        mock_get_tx.assert_called_once_with(self.test_pat_plain, since_iso=expected_since)
        mock_bulk_create.assert_not_called() # No new transactions

        # Check last_synced_at was updated to 'now' since we checked
        self.integration.refresh_from_db()
        self.assertEqual(self.integration.last_synced_at, self.mock_now)

    @patch('integrations.logic.get_transactions')
    @patch('integrations.logic.decrypt_token')
    @patch('integrations.logic.Transaction.objects.bulk_create')
    @patch('integrations.logic.Transaction.objects.filter')
    @patch('integrations.logic.UpIntegration.objects.select_related')
    @patch('integrations.logic.datetime')
    def test_sync_skips_duplicates(
        self, mock_dt, mock_up_integration_mgr, mock_tx_filter, mock_bulk_create, mock_decrypt, mock_get_tx
    ):
        """Test that existing transactions (by bank_transaction_id) are skipped."""
        # --- Arrange ---
        mock_dt.now.return_value = self.mock_now
        mock_up_integration_mgr.return_value.get.return_value = self.integration
        mock_decrypt.return_value = self.test_pat_plain

        # Mock existing transaction IDs in DB
        existing_bank_id = "up-tx-existing"
        # Corrected Mock: Mock the result of .values_list() called on the filtered queryset
        mock_filtered_queryset = mock_tx_filter.return_value
        mock_filtered_queryset.values_list.return_value = [existing_bank_id]

        # Mock API response including one existing and one new transaction
        tx_existing_time = (self.mock_now - timedelta(days=1)).isoformat()
        tx_new_time = self.mock_now.isoformat()
        mock_api_transactions = [
            create_mock_up_transaction(existing_bank_id, tx_existing_time),
            create_mock_up_transaction("up-tx-new", tx_new_time),
        ]
        mock_get_tx.return_value = mock_api_transactions
        mock_bulk_create.return_value = [MagicMock()] # Simulate 1 created object

        # Determine expected 'since' based on initial sync
        expected_since = (self.mock_now - timedelta(days=DEFAULT_INITIAL_SYNC_DAYS)).isoformat()

        # --- Act ---
        result = sync_up_transactions_for_user(self.user.id, initial_sync=True) # Still using initial_sync=True for this test case


        # --- Assert ---
        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 1, "Only one new transaction should be created")
        # Ensure the duplicate count assertion is still correct
        self.assertEqual(result['duplicate_count'], 1, "One duplicate should be skipped")
        self.assertIn("Imported 1 new transaction", result['message'])
        self.assertIn("Skipped 1 duplicate", result['message'])

        mock_get_tx.assert_called_once_with(self.test_pat_plain, since_iso=expected_since)
        # Check the filter call itself
        mock_tx_filter.assert_called_once_with(
            user=self.user, source='up_bank', bank_transaction_id__in={existing_bank_id, 'up-tx-new'}
        )
        # Check that values_list was called on the filtered queryset mock
        mock_filtered_queryset.values_list.assert_called_once_with('bank_transaction_id', flat=True)

        mock_bulk_create.assert_called_once()
        # Check only the *new* transaction was passed to bulk_create
        created_tx_objects = mock_bulk_create.call_args[0][0]
        self.assertEqual(len(created_tx_objects), 1)
        self.assertEqual(created_tx_objects[0].bank_transaction_id, "up-tx-new")

        # Check last_synced_at updated to the time of the NEW transaction
        self.integration.refresh_from_db()
        self.assertEqual(self.integration.last_synced_at, datetime.fromisoformat(tx_new_time))

    # --- Error Handling Tests ---

    @patch('integrations.logic.get_transactions')
    @patch('integrations.logic.decrypt_token')
    @patch('integrations.logic.UpIntegration.objects.select_related')
    def test_sync_invalid_token_http401(self, mock_up_integration_mgr, mock_decrypt, mock_get_tx):
        """Test handling of 401 Unauthorized error from API."""
        # --- Arrange ---
        mock_up_integration_mgr.return_value.get.return_value = self.integration
        mock_decrypt.return_value = self.test_pat_plain

        # Mock get_transactions to raise HTTPError 401
        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = '{"errors": [{"title": "Not Authorized"}]}'
        mock_get_tx.side_effect = requests.exceptions.HTTPError(response=mock_response)

        # --- Act ---
        result = sync_up_transactions_for_user(self.user.id)

        # --- Assert ---
        self.assertFalse(result['success'])
        self.assertEqual(result['created_count'], 0)
        self.assertEqual(result['duplicate_count'], 0)
        self.assertEqual(result['error'], 'invalid_token')
        self.assertIn("token is invalid or expired", result['message'])
        mock_get_tx.assert_called_once() # Ensure the service was called

    @patch('integrations.logic.decrypt_token')
    @patch('integrations.logic.UpIntegration.objects.select_related')
    def test_sync_integration_not_found(self, mock_up_integration_mgr, mock_decrypt):
        """Test scenario where the user has no UpIntegration record."""
        # --- Arrange ---
        # Mock the manager's get method to raise DoesNotExist
        mock_up_integration_mgr.return_value.get.side_effect = UpIntegration.DoesNotExist

        # --- Act ---
        result = sync_up_transactions_for_user(self.user.id)

        # --- Assert ---
        self.assertFalse(result['success'])
        self.assertEqual(result['error'], 'integration_not_found')
        self.assertIn("Up Bank account not linked", result['message'])
        mock_decrypt.assert_not_called() # Decryption shouldn't be attempted

    @patch('integrations.logic.decrypt_token')
    @patch('integrations.logic.UpIntegration.objects.select_related')
    def test_sync_decryption_failure(self, mock_up_integration_mgr, mock_decrypt):
        """Test scenario where token decryption fails."""
        # --- Arrange ---
        mock_up_integration_mgr.return_value.get.return_value = self.integration
        mock_decrypt.return_value = None # Simulate decryption failure

        # --- Act ---
        result = sync_up_transactions_for_user(self.user.id)

        # --- Assert ---
        self.assertFalse(result['success'])
        self.assertEqual(result['error'], 'decryption_failed')
        self.assertIn("Internal error: Could not access token", result['message'])
        mock_decrypt.assert_called_once_with(self.test_pat_encrypted)

    # Add more tests for:
    # - Initial sync with valid custom_since_iso
    # - Initial sync with *invalid* custom_since_iso (ensure fallback)
    # - API returning 500 error
    # - API returning network error (RequestException)
    # - Bulk create failing
    # - Data transformation failing for one transaction (should skip that one, continue others)