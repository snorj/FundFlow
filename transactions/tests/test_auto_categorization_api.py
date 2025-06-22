"""
Integration tests for auto-categorization API endpoints.

Tests the REST API endpoints for auto-categorization functionality,
including batch processing, single transaction categorization, and suggestions.
"""

import json
from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APIClient

from transactions.models import Category, Vendor, VendorRule, Transaction

User = get_user_model()


class AutoCategorizationAPITest(TestCase):
    """Test auto-categorization API endpoints."""

    def setUp(self):
        """Set up test data."""
        # Create test user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        # Create API client and authenticate
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Create test categories
        self.category_groceries = Category.objects.create(
            name='Groceries'
        )
        self.category_restaurants = Category.objects.create(
            name='Restaurants'
        )
        
        # Create test vendors
        self.vendor_woolworths = Vendor.objects.create(
            name='Woolworths',
            display_name='Woolworths Supermarket'
        )
        self.vendor_mcdonalds = Vendor.objects.create(
            name='McDonalds',
            display_name='McDonald\'s Restaurant'
        )
        
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
            pattern='.*restaurant.*',
            is_persistent=True
        )
        
        # Create test transactions
        self.tx_uncategorized_woolworths = Transaction.objects.create(
            user=self.user,
            vendor=self.vendor_woolworths,
            transaction_date='2023-01-01',
            description='Woolworths grocery shopping',
            original_amount=Decimal('45.67'),
            original_currency='AUD',
            direction='DEBIT'
        )
        self.tx_uncategorized_mcdonalds = Transaction.objects.create(
            user=self.user,
            vendor=self.vendor_mcdonalds,
            transaction_date='2023-01-02',
            description='McDonalds restaurant meal',
            original_amount=Decimal('12.50'),
            original_currency='AUD',
            direction='DEBIT'
        )
        self.tx_already_categorized = Transaction.objects.create(
            user=self.user,
            vendor=self.vendor_woolworths,
            category=self.category_groceries,
            transaction_date='2023-01-03',
            description='Another Woolworths trip',
            original_amount=Decimal('23.45'),
            original_currency='AUD',
            direction='DEBIT'
        )
        self.tx_no_vendor = Transaction.objects.create(
            user=self.user,
            transaction_date='2023-01-04',
            description='Cash withdrawal',
            original_amount=Decimal('100.00'),
            original_currency='AUD',
            direction='DEBIT'
        )

    def test_auto_categorize_all_transactions(self):
        """Test auto-categorizing all user transactions."""
        url = reverse('auto-categorize-transactions')
        
        response = self.client.post(url, {
            'force_recategorize': False
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        
        # Should categorize 2 uncategorized transactions (woolworths, mcdonalds)
        self.assertEqual(data['categorized_count'], 2)
        self.assertEqual(data['skipped_count'], 2)  # already categorized + no vendor
        self.assertEqual(data['error_count'], 0)
        self.assertEqual(data['total_processed'], 4)
        
        # Verify transactions were categorized
        self.tx_uncategorized_woolworths.refresh_from_db()
        self.assertEqual(self.tx_uncategorized_woolworths.category, self.category_groceries)
        
        self.tx_uncategorized_mcdonalds.refresh_from_db()
        self.assertEqual(self.tx_uncategorized_mcdonalds.category, self.category_restaurants)

    def test_auto_categorize_specific_transactions(self):
        """Test auto-categorizing specific transaction IDs."""
        url = reverse('auto-categorize-transactions')
        
        response = self.client.post(url, {
            'transaction_ids': [self.tx_uncategorized_woolworths.id],
            'force_recategorize': False
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        
        # Should categorize only the specified transaction
        self.assertEqual(data['categorized_count'], 1)
        self.assertEqual(data['skipped_count'], 0)
        self.assertEqual(data['error_count'], 0)
        self.assertEqual(data['total_processed'], 1)
        
        # Verify only the specified transaction was categorized
        self.tx_uncategorized_woolworths.refresh_from_db()
        self.assertEqual(self.tx_uncategorized_woolworths.category, self.category_groceries)
        
        self.tx_uncategorized_mcdonalds.refresh_from_db()
        self.assertIsNone(self.tx_uncategorized_mcdonalds.category)

    def test_auto_categorize_force_recategorize(self):
        """Test force recategorization of already categorized transactions."""
        # Change the rule to a different category
        self.rule_woolworths.category = self.category_restaurants
        self.rule_woolworths.save()
        
        url = reverse('auto-categorize-transactions')
        
        response = self.client.post(url, {
            'transaction_ids': [self.tx_already_categorized.id],
            'force_recategorize': True
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        
        self.assertEqual(data['categorized_count'], 1)
        self.assertEqual(data['error_count'], 0)
        
        # Verify the transaction was recategorized
        self.tx_already_categorized.refresh_from_db()
        self.assertEqual(self.tx_already_categorized.category, self.category_restaurants)

    def test_auto_categorize_single_transaction_success(self):
        """Test auto-categorizing a single transaction successfully."""
        url = reverse('auto-categorize-single-transaction', kwargs={'pk': self.tx_uncategorized_woolworths.id})
        
        response = self.client.post(url, {
            'force_recategorize': False
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        
        self.assertTrue(data['success'])
        self.assertIsNotNone(data['rule_applied'])
        self.assertEqual(data['rule_applied']['vendor_name'], 'Woolworths')
        self.assertEqual(data['rule_applied']['category_name'], 'Groceries')
        self.assertIsNotNone(data['category_assigned'])
        self.assertEqual(data['category_assigned']['name'], 'Groceries')
        
        # Verify transaction was categorized
        self.tx_uncategorized_woolworths.refresh_from_db()
        self.assertEqual(self.tx_uncategorized_woolworths.category, self.category_groceries)

    def test_auto_categorize_single_transaction_already_categorized(self):
        """Test auto-categorizing a transaction that's already categorized."""
        url = reverse('auto-categorize-single-transaction', kwargs={'pk': self.tx_already_categorized.id})
        
        response = self.client.post(url, {
            'force_recategorize': False
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        
        self.assertFalse(data['success'])
        self.assertIsNone(data['rule_applied'])
        self.assertEqual(data['reason'], 'Transaction already categorized')

    def test_auto_categorize_single_transaction_no_vendor(self):
        """Test auto-categorizing a transaction with no vendor."""
        url = reverse('auto-categorize-single-transaction', kwargs={'pk': self.tx_no_vendor.id})
        
        response = self.client.post(url, {
            'force_recategorize': False
        }, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        
        self.assertFalse(data['success'])
        self.assertIsNone(data['rule_applied'])
        self.assertEqual(data['reason'], 'Transaction has no vendor assigned')

    def test_auto_categorize_single_transaction_not_found(self):
        """Test auto-categorizing a non-existent transaction."""
        url = reverse('auto-categorize-single-transaction', kwargs={'pk': 99999})
        
        response = self.client.post(url, {}, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        data = response.json()
        self.assertEqual(data['error'], 'Transaction not found')

    def test_categorization_suggestions(self):
        """Test getting categorization suggestions for a transaction."""
        url = reverse('categorization-suggestions', kwargs={'pk': self.tx_uncategorized_woolworths.id})
        
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        
        # Should have suggestions
        self.assertGreaterEqual(len(data['suggestions']), 1)
        
        # Check suggestion structure
        suggestion = data['suggestions'][0]
        self.assertIn('rule', suggestion)
        self.assertIn('category', suggestion)
        self.assertIn('confidence', suggestion)
        
        # Check vendor info
        self.assertIsNotNone(data['vendor'])
        self.assertEqual(data['vendor']['name'], 'Woolworths')
        
        # Check transaction info
        self.assertEqual(data['transaction']['id'], self.tx_uncategorized_woolworths.id)

    def test_categorization_suggestions_no_vendor(self):
        """Test getting suggestions for a transaction with no vendor."""
        url = reverse('categorization-suggestions', kwargs={'pk': self.tx_no_vendor.id})
        
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        
        # Should have no suggestions
        self.assertEqual(len(data['suggestions']), 0)
        self.assertIsNone(data['vendor'])

    def test_categorization_suggestions_not_found(self):
        """Test getting suggestions for a non-existent transaction."""
        url = reverse('categorization-suggestions', kwargs={'pk': 99999})
        
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_auto_categorization_unauthenticated(self):
        """Test that unauthenticated requests are rejected."""
        # Remove authentication
        self.client.force_authenticate(user=None)
        
        # Test batch auto-categorization
        url = reverse('auto-categorize-transactions')
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
        # Test single transaction auto-categorization
        url = reverse('auto-categorize-single-transaction', kwargs={'pk': self.tx_uncategorized_woolworths.id})
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
        # Test suggestions
        url = reverse('categorization-suggestions', kwargs={'pk': self.tx_uncategorized_woolworths.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_auto_categorization_different_user(self):
        """Test that users can't access other users' transactions."""
        # Create another user and transaction
        other_user = User.objects.create_user(
            username='otheruser',
            email='other@example.com',
            password='otherpass123'
        )
        other_transaction = Transaction.objects.create(
            user=other_user,
            vendor=self.vendor_woolworths,
            transaction_date='2023-01-05',
            description='Other user transaction',
            original_amount=Decimal('50.00'),
            original_currency='AUD',
            direction='DEBIT'
        )
        
        # Try to auto-categorize other user's transaction
        url = reverse('auto-categorize-single-transaction', kwargs={'pk': other_transaction.id})
        response = self.client.post(url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        
        # Try to get suggestions for other user's transaction
        url = reverse('categorization-suggestions', kwargs={'pk': other_transaction.id})
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_pattern_matching_categorization(self):
        """Test that pattern matching works correctly in API."""
        # Create a transaction that matches McDonalds pattern
        tx_pattern_match = Transaction.objects.create(
            user=self.user,
            vendor=self.vendor_mcdonalds,
            transaction_date='2023-01-06',
            description='McDonalds restaurant drive-thru',
            original_amount=Decimal('8.50'),
            original_currency='AUD',
            direction='DEBIT'
        )
        
        url = reverse('auto-categorize-single-transaction', kwargs={'pk': tx_pattern_match.id})
        
        response = self.client.post(url, {}, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        
        self.assertTrue(data['success'])
        self.assertEqual(data['rule_applied']['category_name'], 'Restaurants')
        
        # Verify transaction was categorized correctly
        tx_pattern_match.refresh_from_db()
        self.assertEqual(tx_pattern_match.category, self.category_restaurants) 