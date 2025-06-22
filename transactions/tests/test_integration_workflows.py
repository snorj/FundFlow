"""
Integration tests for auto-categorization in transaction processing workflows.

Tests verify that auto-categorization is properly integrated into:
1. CSV upload workflow
2. Up Bank sync workflow  
3. Manual transaction creation workflow
"""

import io
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APIClient
from rest_framework import status
from unittest.mock import patch, MagicMock

from transactions.models import Category, Vendor, VendorRule, Transaction
from integrations.logic import sync_up_transactions_for_user

User = get_user_model()


class TransactionWorkflowIntegrationTest(TestCase):
    """Test auto-categorization integration across all transaction workflows."""

    def setUp(self):
        """Set up test data."""
        # Create test user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        # Create API client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Create test categories
        self.category_groceries = Category.objects.create(name='Groceries')
        self.category_restaurants = Category.objects.create(name='Restaurants')
        
        # Create test vendors
        self.vendor_woolworths = Vendor.objects.create(name='Woolworths')
        self.vendor_mcdonalds = Vendor.objects.create(name='McDonalds')
        
        # Create test vendor rules
        self.rule_woolworths = VendorRule.objects.create(
            id='rule-woolworths-001',
            vendor=self.vendor_woolworths,
            category=self.category_groceries,
            priority=1,
            is_persistent=True
        )
        self.rule_mcdonalds = VendorRule.objects.create(
            id='rule-mcdonalds-001',
            vendor=self.vendor_mcdonalds,
            category=self.category_restaurants,
            priority=2,
            is_persistent=True
        )

    def test_csv_upload_integration(self):
        """Test auto-categorization during CSV upload."""
        # Create CSV content with transactions that should match our vendor rules
        csv_content = (
            "Date,Name / Description,Account,Counterparty,Code,Debit/credit,Amount (EUR),Transaction type,Notifications\n"
            "20240101,Woolworths Purchase,ACC001,Woolworths,CODE1,DEBIT,25.50,PURCHASE,\n"
            "20240102,McDonalds Meal,ACC001,McDonalds,CODE2,DEBIT,12.75,PURCHASE,\n"
            "20240103,Unknown Vendor,ACC001,RandomVendor,CODE3,DEBIT,50.00,PURCHASE,\n"
        )
        
        # Convert to file-like object
        csv_file = io.StringIO(csv_content)
        csv_file.name = 'test.csv'
        
        # Upload CSV
        response = self.client.post(
            reverse('transaction-csv-upload'),
            {
                'file': csv_file,
                'account_base_currency': 'EUR'
            },
            format='multipart'
        )
        
        # Verify successful upload with auto-categorization
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        response_data = response.json()
        
        # Check response includes auto-categorization info
        self.assertIn('auto_categorized_count', response_data)
        self.assertIn('description_rules_applied_count', response_data)
        self.assertEqual(response_data['imported_count'], 3)
        self.assertEqual(response_data['auto_categorized_count'], 2)  # Woolworths and McDonalds
        
        # Verify transactions were categorized correctly
        woolworths_tx = Transaction.objects.get(description__icontains='Woolworths')
        mcdonalds_tx = Transaction.objects.get(description__icontains='McDonalds')
        unknown_tx = Transaction.objects.get(description__icontains='Unknown')
        
        self.assertEqual(woolworths_tx.category, self.category_groceries)
        self.assertEqual(mcdonalds_tx.category, self.category_restaurants)
        self.assertIsNone(unknown_tx.category)  # No matching vendor rule

    def test_manual_transaction_creation_integration(self):
        """Test auto-categorization during manual transaction creation."""
        # Create manual transaction data that should match our vendor rule
        transaction_data = {
            'transaction_date': '2024-01-01',
            'description': 'Woolworths Shopping',
            'original_amount': '45.00',
            'original_currency': 'AUD',
            'direction': 'DEBIT',
            'vendor_id': self.vendor_woolworths.id
        }
        
        # Create transaction
        response = self.client.post(
            reverse('transaction-create'),
            transaction_data,
            format='json'
        )
        
        # Verify successful creation with auto-categorization
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        response_data = response.json()
        
        # Check response includes auto-categorization info
        self.assertTrue(response_data['auto_categorized'])
        self.assertEqual(response_data['rule_applied'], self.rule_woolworths.id)
        
        # Verify transaction was categorized correctly
        transaction = Transaction.objects.get(id=response_data['transaction']['id'])
        self.assertEqual(transaction.category, self.category_groceries)
        self.assertEqual(transaction.vendor, self.vendor_woolworths)

    def test_manual_transaction_no_auto_categorization_if_category_provided(self):
        """Test that auto-categorization is skipped if category is manually provided."""
        # Create manual transaction with explicit category
        transaction_data = {
            'transaction_date': '2024-01-01',
            'description': 'Woolworths Shopping',
            'original_amount': '45.00',
            'original_currency': 'AUD',
            'direction': 'DEBIT',
            'vendor_id': self.vendor_woolworths.id,
            'category_id': self.category_restaurants.id  # Different from rule
        }
        
        # Create transaction
        response = self.client.post(
            reverse('transaction-create'),
            transaction_data,
            format='json'
        )
        
        # Verify successful creation without auto-categorization
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        response_data = response.json()
        
        # Check auto-categorization was skipped
        self.assertFalse(response_data['auto_categorized'])
        self.assertIsNone(response_data['rule_applied'])
        
        # Verify transaction kept manual category
        transaction = Transaction.objects.get(id=response_data['transaction']['id'])
        self.assertEqual(transaction.category, self.category_restaurants)  # Manual category preserved

    @patch('integrations.logic.get_up_transactions')
    @patch('integrations.logic.decrypt_token')
    def test_up_bank_sync_integration(self, mock_decrypt_token, mock_get_up_transactions):
        """Test auto-categorization during Up Bank sync."""
        # Mock Up Bank API response
        mock_up_transactions = [
            {
                'id': 'up-tx-001',
                'attributes': {
                    'createdAt': '2024-01-01T10:00:00Z',
                    'description': 'WOOLWORTHS 123 MELBOURNE',
                    'amount': {
                        'valueInBaseUnits': -2550,  # -$25.50 AUD
                        'currencyCode': 'AUD'
                    },
                    'foreignAmount': None  # Domestic transaction
                }
            },
            {
                'id': 'up-tx-002', 
                'attributes': {
                    'createdAt': '2024-01-01T12:00:00Z',
                    'description': 'MCDONALDS MELBOURNE',
                    'amount': {
                        'valueInBaseUnits': -1275,  # -$12.75 AUD
                        'currencyCode': 'AUD'
                    },
                    'foreignAmount': None  # Domestic transaction
                }
            },
            {
                'id': 'up-tx-003',
                'attributes': {
                    'createdAt': '2024-01-01T14:00:00Z',
                    'description': 'UNKNOWN VENDOR PTY LTD',
                    'amount': {
                        'valueInBaseUnits': -5000,  # -$50.00 AUD
                        'currencyCode': 'AUD'
                    },
                    'foreignAmount': None  # Domestic transaction
                }
            }
        ]
        mock_get_up_transactions.return_value = mock_up_transactions
        mock_decrypt_token.return_value = 'mock-decrypted-token'
        
        # Create Up integration for user (mock)
        from integrations.models import UpIntegration
        integration = UpIntegration.objects.create(
            user=self.user,
            personal_access_token_encrypted='mock-encrypted-token'
        )
        
        # Run sync
        result = sync_up_transactions_for_user(self.user.id, initial_sync=True)
        
        # Verify sync success with auto-categorization
        self.assertTrue(result['success'])
        self.assertEqual(result['created_count'], 3)
        self.assertEqual(result['auto_categorized_count'], 2)  # Woolworths and McDonalds
        
        # Verify transactions were categorized correctly
        woolworths_tx = Transaction.objects.get(bank_transaction_id='up-tx-001')
        mcdonalds_tx = Transaction.objects.get(bank_transaction_id='up-tx-002')
        unknown_tx = Transaction.objects.get(bank_transaction_id='up-tx-003')
        
        self.assertEqual(woolworths_tx.category, self.category_groceries)
        self.assertEqual(mcdonalds_tx.category, self.category_restaurants)
        self.assertIsNone(unknown_tx.category)  # No matching vendor rule

    def test_error_handling_in_workflows(self):
        """Test that auto-categorization errors don't break transaction processing."""
        # Mock the auto-categorization service to raise an exception
        with patch('transactions.auto_categorization_service.auto_categorize_user_transactions') as mock_categorize:
            mock_categorize.side_effect = Exception("Auto-categorization service unavailable")
            
            # CSV upload should still work despite auto-categorization failure
            csv_content = (
                "Date,Name / Description,Account,Counterparty,Code,Debit/credit,Amount (EUR),Transaction type,Notifications\n"
                "20240101,Test Transaction,ACC001,TestVendor,CODE1,DEBIT,25.50,PURCHASE,\n"
            )
            
            csv_file = io.StringIO(csv_content)
            csv_file.name = 'test.csv'
            
            response = self.client.post(
                reverse('transaction-csv-upload'),
                {
                    'file': csv_file,
                    'account_base_currency': 'EUR'
                },
                format='multipart'
            )
            
            # Should still succeed despite auto-categorization failure
            self.assertEqual(response.status_code, status.HTTP_201_CREATED)
            response_data = response.json()
            self.assertEqual(response_data['imported_count'], 1)
            self.assertEqual(response_data['auto_categorized_count'], 0)  # Failed to categorize
            
            # Verify transaction was still created
            self.assertEqual(Transaction.objects.count(), 1)
            transaction = Transaction.objects.first()
            self.assertIsNone(transaction.category)  # Not categorized due to error

    def test_performance_with_large_batches(self):
        """Test auto-categorization performance with larger transaction batches."""
        # Create a CSV with many transactions
        csv_lines = [
            "Date,Name / Description,Account,Counterparty,Code,Debit/credit,Amount (EUR),Transaction type,Notifications"
        ]
        
        # Add 50 transactions that should be auto-categorized
        for i in range(25):
            csv_lines.append(f"2024010{i%9 + 1:d},Woolworths Store {i},ACC001,Woolworths,CODE{i},DEBIT,{10.00 + i:.2f},PURCHASE,")
            csv_lines.append(f"2024010{i%9 + 1:d},McDonalds Restaurant {i},ACC001,McDonalds,CODE{i + 25},DEBIT,{8.00 + i:.2f},PURCHASE,")
        
        csv_content = '\n'.join(csv_lines) + '\n'
        csv_file = io.StringIO(csv_content)
        csv_file.name = 'large_test.csv'
        
        # Upload CSV
        response = self.client.post(
            reverse('transaction-csv-upload'),
            {
                'file': csv_file,
                'account_base_currency': 'EUR'
            },
            format='multipart'
        )
        
        # Verify successful upload with auto-categorization
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        response_data = response.json()
        
        self.assertEqual(response_data['imported_count'], 50)
        self.assertEqual(response_data['auto_categorized_count'], 50)  # All should be categorized
        
        # Verify categorization distribution
        groceries_count = Transaction.objects.filter(category=self.category_groceries).count()
        restaurants_count = Transaction.objects.filter(category=self.category_restaurants).count()
        
        self.assertEqual(groceries_count, 25)  # Woolworths transactions
        self.assertEqual(restaurants_count, 25)  # McDonalds transactions 