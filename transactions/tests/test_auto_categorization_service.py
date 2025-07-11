"""
Tests for the simplified auto-categorization service.

This test suite covers the simplified auto-categorization system that uses direct vendor
matching with newest-rule-wins conflict resolution, without pattern matching or priority systems.
"""

from decimal import Decimal
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.db import transaction as db_transaction

from transactions.models import Transaction, VendorRule, Vendor, Category
from transactions.auto_categorization_service import (
    AutoCategorizationService, 
    AutoCategorizationResult,
    auto_categorize_user_transactions,
    auto_categorize_single_transaction
)

User = get_user_model()


class AutoCategorizationServiceTest(TestCase):
    
    def setUp(self):
        # Create test users
        self.user1 = User.objects.create_user(
            username='user1',
            email='user1@test.com',
            password='testpass123'
        )
        self.user2 = User.objects.create_user(
            username='user2',
            email='user2@test.com', 
            password='testpass123'
        )
        
        # Create test categories
        self.category_groceries = Category.objects.create(
            name='Groceries'
        )
        self.category_restaurants = Category.objects.create(
            name='Restaurants'
        )
        self.category_gas = Category.objects.create(
            name='Gas'
        )
        
        # Create test vendors
        self.vendor_woolworths = Vendor.objects.create(
            name='Woolworths',
            display_name='Woolworths Supermarkets'
        )
        self.vendor_mcdonalds = Vendor.objects.create(
            name='McDonalds',
            display_name="McDonald's"
        )
        self.vendor_shell = Vendor.objects.create(
            name='Shell',
            display_name='Shell Gas Station'
        )
        
        # Create simplified vendor rules (no pattern/priority)
        self.rule_woolworths = VendorRule.objects.create(
            id='rule-woolworths',
            vendor=self.vendor_woolworths,
            category=self.category_groceries,
            is_persistent=True
        )
        self.rule_mcdonalds = VendorRule.objects.create(
            id='rule-mcdonalds',
            vendor=self.vendor_mcdonalds,
            category=self.category_restaurants,
            is_persistent=True
        )
        self.rule_shell = VendorRule.objects.create(
            id='rule-shell',
            vendor=self.vendor_shell,
            category=self.category_gas,
            is_persistent=True
        )
        
        # Create test transactions
        self.tx_woolworths_uncategorized = Transaction.objects.create(
            user=self.user1,
            vendor=self.vendor_woolworths,
            transaction_date='2023-01-01',
            description='Woolworths Weekly Shop',
            original_amount=Decimal('95.50'),
            original_currency='AUD',
            direction='DEBIT'
        )
        
        self.tx_mcdonalds_uncategorized = Transaction.objects.create(
            user=self.user1,
            vendor=self.vendor_mcdonalds,
            transaction_date='2023-01-02',
            description="McDonald's Meal Deal",
            original_amount=Decimal('12.50'),
            original_currency='AUD',
            direction='DEBIT'
        )
        
        self.tx_shell_uncategorized = Transaction.objects.create(
            user=self.user1,
            vendor=self.vendor_shell,
            transaction_date='2023-01-03',
            description='Shell Gas Station Fuel',
            original_amount=Decimal('80.00'),
            original_currency='AUD',
            direction='DEBIT'
        )
        
        # Already categorized transaction
        self.tx_already_categorized = Transaction.objects.create(
            user=self.user1,
            vendor=self.vendor_woolworths,
            category=self.category_groceries,
            transaction_date='2023-01-04',
            description='Woolworths Weekly Shop',
            original_amount=Decimal('120.00'),
            original_currency='AUD',
            direction='DEBIT'
        )
        
        # Transaction without vendor
        self.tx_no_vendor = Transaction.objects.create(
            user=self.user1,
            transaction_date='2023-01-05',
            description='Manual Entry',
            original_amount=Decimal('25.00'),
            original_currency='AUD',
            direction='DEBIT'
        )
        
        # Transaction for different user
        self.tx_user2 = Transaction.objects.create(
            user=self.user2,
            vendor=self.vendor_woolworths,
            transaction_date='2023-01-06',
            description='Different User Transaction',
            original_amount=Decimal('35.00'),
            original_currency='AUD',
            direction='DEBIT'
        )
        
        self.service = AutoCategorizationService(self.user1)
        
    def test_init(self):
        """Test service initialization."""
        self.assertEqual(self.service.user, self.user1)
        
    def test_get_applicable_vendor_rules(self):
        """Test getting applicable vendor rules with newest-first ordering."""
        rules = self.service._get_applicable_vendor_rules()
        
        # Should get all persistent rules
        self.assertGreater(rules.count(), 0)
        
        # Should be ordered by newest first (-updated_at)
        rule_dates = [rule.updated_at for rule in rules]
        sorted_dates = sorted(rule_dates, reverse=True)
        self.assertEqual(rule_dates, sorted_dates)
        
    def test_find_matching_rule_direct_vendor_match(self):
        """Test finding matching rule using direct vendor matching."""
        # Should find rule for Woolworths vendor
        matching_rule = self.service._find_matching_rule(self.tx_woolworths_uncategorized)
        self.assertEqual(matching_rule, self.rule_woolworths)
        
        # Should find rule for McDonald's vendor
        matching_rule = self.service._find_matching_rule(self.tx_mcdonalds_uncategorized)
        self.assertEqual(matching_rule, self.rule_mcdonalds)
        
    def test_find_matching_rule_no_vendor(self):
        """Test finding matching rule for transaction without vendor."""
        matching_rule = self.service._find_matching_rule(self.tx_no_vendor)
        self.assertIsNone(matching_rule)
        
    def test_newest_rule_wins(self):
        """Test newest-rule-wins conflict resolution."""
        # Create a newer rule for the same vendor with different category
        import time
        time.sleep(0.1)  # Ensure different timestamp
        
        newer_rule = VendorRule.objects.create(
            id='rule-woolworths-newer',
            vendor=self.vendor_woolworths,
            category=self.category_restaurants,  # Different category
            is_persistent=True
        )
        
        # Should find the newer rule
        matching_rule = self.service._find_matching_rule(self.tx_woolworths_uncategorized)
        self.assertEqual(matching_rule, newer_rule)
        
    def test_categorize_single_transaction_success(self):
        """Test successful single transaction categorization."""
        # Verify transaction is uncategorized
        self.assertIsNone(self.tx_woolworths_uncategorized.category)
        
        # Categorize the transaction
        applied_rule = self.service.categorize_single_transaction(
            self.tx_woolworths_uncategorized
        )
        
        # Verify rule was applied
        self.assertEqual(applied_rule, self.rule_woolworths)
        
        # Refresh transaction from database
        self.tx_woolworths_uncategorized.refresh_from_db()
        self.assertEqual(self.tx_woolworths_uncategorized.category, self.category_groceries)
        
    def test_categorize_single_transaction_already_categorized(self):
        """Test single transaction categorization when already categorized."""
        # Should return None for already categorized transaction
        applied_rule = self.service.categorize_single_transaction(
            self.tx_already_categorized
        )
        self.assertIsNone(applied_rule)
        
    def test_categorize_single_transaction_force_recategorize(self):
        """Test force recategorization of already categorized transaction."""
        # Should recategorize when force_recategorize=True
        applied_rule = self.service.categorize_single_transaction(
            self.tx_already_categorized,
            force_recategorize=True
        )
        self.assertEqual(applied_rule, self.rule_woolworths)
        
    def test_categorize_single_transaction_no_vendor(self):
        """Test single transaction categorization without vendor."""
        applied_rule = self.service.categorize_single_transaction(self.tx_no_vendor)
        self.assertIsNone(applied_rule)
        
    def test_categorize_single_transaction_no_matching_rule(self):
        """Test single transaction categorization with no matching rule."""
        # Create vendor without rules
        vendor_no_rules = Vendor.objects.create(name='NoRulesVendor')
        tx_no_rules = Transaction.objects.create(
            user=self.user1,
            vendor=vendor_no_rules,
            transaction_date='2023-01-07',
            description='No rules transaction',
            original_amount=Decimal('50.00'),
            original_currency='AUD',
            direction='DEBIT'
        )
        
        applied_rule = self.service.categorize_single_transaction(tx_no_rules)
        self.assertIsNone(applied_rule)
        
    def test_categorize_transactions_batch_processing(self):
        """Test batch processing of transactions."""
        result = self.service.categorize_transactions()
        
        # Should categorize the uncategorized transactions (3 total)
        self.assertEqual(result.categorized_count, 3)
        self.assertEqual(result.skipped_count, 1)  # Already categorized transaction
        self.assertEqual(result.error_count, 0)
        
        # Verify transactions were categorized correctly
        self.tx_woolworths_uncategorized.refresh_from_db()
        self.tx_mcdonalds_uncategorized.refresh_from_db()
        self.tx_shell_uncategorized.refresh_from_db()
        
        self.assertEqual(self.tx_woolworths_uncategorized.category, self.category_groceries)
        self.assertEqual(self.tx_mcdonalds_uncategorized.category, self.category_restaurants)
        self.assertEqual(self.tx_shell_uncategorized.category, self.category_gas)
        
    def test_categorize_transactions_specific_queryset(self):
        """Test categorization with specific transaction queryset."""
        # Only categorize Woolworths transaction
        transactions = Transaction.objects.filter(id=self.tx_woolworths_uncategorized.id)
        result = self.service.categorize_transactions(transactions)
        
        self.assertEqual(result.categorized_count, 1)
        self.assertEqual(result.skipped_count, 0)
        self.assertEqual(result.categorized_transactions, [self.tx_woolworths_uncategorized.id])
        
    def test_categorize_transactions_force_recategorize(self):
        """Test force recategorization of already categorized transactions."""
        # First categorize all transactions
        self.service.categorize_transactions()
        
        # Verify the transaction was categorized
        self.tx_woolworths_uncategorized.refresh_from_db()
        self.assertEqual(self.tx_woolworths_uncategorized.category, self.category_groceries)
        
        # Change a rule to different category
        self.rule_woolworths.category = self.category_restaurants
        self.rule_woolworths.save()
        
        # Force recategorize - the algorithm should match based on the new rule and change category
        result = self.service.categorize_single_transaction(
            self.tx_woolworths_uncategorized, 
            force_recategorize=True
        )
        
        # Should have found and applied the updated rule
        self.assertEqual(result, self.rule_woolworths)
        
        # Verify category changed
        self.tx_woolworths_uncategorized.refresh_from_db()
        self.assertEqual(self.tx_woolworths_uncategorized.category, self.category_restaurants)
        
    def test_categorize_transactions_no_rules(self):
        """Test categorization when no rules exist."""
        # Delete all rules
        VendorRule.objects.all().delete()
        
        result = self.service.categorize_transactions()
        
        # Should skip all transactions
        self.assertEqual(result.categorized_count, 0)
        self.assertGreater(result.skipped_count, 0)
        
    def test_categorize_transactions_no_transactions(self):
        """Test categorization when no transactions exist."""
        # Delete all transactions for user1
        Transaction.objects.filter(user=self.user1).delete()
        
        result = self.service.categorize_transactions()
        
        # Should have no transactions to process
        self.assertEqual(result.categorized_count, 0)
        self.assertEqual(result.skipped_count, 0)
        self.assertEqual(result.error_count, 0)
        
    def test_get_categorization_suggestions(self):
        """Test getting categorization suggestions."""
        suggestions = self.service.get_categorization_suggestions(
            self.tx_woolworths_uncategorized
        )
        
        # Should have suggestions for Woolworths transaction
        self.assertGreater(len(suggestions), 0)
        
        # Check suggestion structure (simplified)
        suggestion = suggestions[0]
        expected_keys = [
            'rule_id', 'category_id', 'category_name', 'vendor_name',
            'is_persistent', 'created_at', 'updated_at'
        ]
        for key in expected_keys:
            self.assertIn(key, suggestion)
            
        # Should be sorted by newest first (updated_at)
        if len(suggestions) > 1:
            for i in range(len(suggestions) - 1):
                current = suggestions[i]
                next_suggestion = suggestions[i + 1]
                self.assertGreaterEqual(current['updated_at'], next_suggestion['updated_at'])
                    
    def test_get_categorization_suggestions_no_vendor(self):
        """Test suggestions for transaction without vendor."""
        suggestions = self.service.get_categorization_suggestions(self.tx_no_vendor)
        self.assertEqual(len(suggestions), 0)
        
    def test_auto_categorization_result(self):
        """Test AutoCategorizationResult functionality."""
        result = AutoCategorizationResult()
        
        # Test initial state
        self.assertEqual(result.categorized_count, 0)
        self.assertEqual(result.skipped_count, 0)
        self.assertEqual(result.error_count, 0)
        
        # Test adding success
        result.add_success(123, 'rule-123')
        self.assertEqual(result.categorized_count, 1)
        self.assertIn(123, result.categorized_transactions)
        self.assertEqual(result.rules_applied['rule-123'], 1)
        
        # Test adding skip
        result.add_skip(456, 'test reason')
        self.assertEqual(result.skipped_count, 1)
        
        # Test adding error
        result.add_error(789, 'test error', ValueError('test'))
        self.assertEqual(result.error_count, 1)
        self.assertEqual(len(result.errors), 1)
        
        # Test to_dict
        result_dict = result.to_dict()
        expected_keys = [
            'categorized_count', 'skipped_count', 'error_count',
            'categorized_transactions', 'rules_applied', 'errors'
        ]
        for key in expected_keys:
            self.assertIn(key, result_dict)
            
    def test_convenience_functions(self):
        """Test convenience functions."""
        # Test auto_categorize_user_transactions
        result = auto_categorize_user_transactions(self.user1)
        self.assertIsInstance(result, AutoCategorizationResult)
        self.assertGreater(result.categorized_count, 0)
        
        # Test auto_categorize_single_transaction
        # Create a new uncategorized transaction
        tx = Transaction.objects.create(
            user=self.user1,
            vendor=self.vendor_woolworths,
            transaction_date='2023-01-10',
            description='Test Transaction',
            original_amount=Decimal('30.00'),
            original_currency='AUD',
            direction='DEBIT'
        )
        
        applied_rule = auto_categorize_single_transaction(tx)
        self.assertEqual(applied_rule, self.rule_woolworths)
        
        tx.refresh_from_db()
        self.assertEqual(tx.category, self.category_groceries)
        
    def test_cross_user_isolation(self):
        """Test that users can only categorize their own transactions."""
        # Create service for user2
        service_user2 = AutoCategorizationService(self.user2)
        
        # User2 should not see user1's transactions
        result = service_user2.categorize_transactions()
        
        # Should have no transactions to categorize for user2
        self.assertEqual(result.categorized_count, 0)
        
        # Verify user1's transactions remain uncategorized by user2's service
        self.tx_woolworths_uncategorized.refresh_from_db()
        self.assertIsNone(self.tx_woolworths_uncategorized.category)
        
    def test_database_transaction_rollback(self):
        """Test that database transactions are properly rolled back on error."""
        # Create a rule that will cause an error during save
        with self.assertRaises(Exception):
            with db_transaction.atomic():
                # Force a database error by trying to save with invalid data
                # This is a bit contrived, but demonstrates the rollback behavior
                self.tx_woolworths_uncategorized.category = self.category_groceries
                self.tx_woolworths_uncategorized.save()
                
                # Force an error
                raise ValueError("Forced error for testing")
                
        # Transaction should be rolled back
        self.tx_woolworths_uncategorized.refresh_from_db()
        self.assertIsNone(self.tx_woolworths_uncategorized.category)
        
    def test_large_batch_processing(self):
        """Test processing large numbers of transactions."""
        # Create many transactions
        transactions = []
        for i in range(150):  # More than batch size of 100
            tx = Transaction.objects.create(
                user=self.user1,
                vendor=self.vendor_woolworths,
                transaction_date='2023-01-01',
                description=f'Transaction {i}',
                original_amount=Decimal('10.00'),
                original_currency='AUD',
                direction='DEBIT'
            )
            transactions.append(tx)
            
        # Should process all transactions
        result = self.service.categorize_transactions()
        
        # Should categorize all new transactions (150) + existing uncategorized (3) = 153
        self.assertGreaterEqual(result.categorized_count, 150)