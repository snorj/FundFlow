from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from ..models import Category, Transaction
from decimal import Decimal
from datetime import date

User = get_user_model()

class TransactionAPITests(APITestCase):
    """
    Tests for Transaction related API endpoints.
    """

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole test class (using cls)."""
        # Users
        cls.user1 = User.objects.create_user(username='user1', password='password123')
        cls.user2 = User.objects.create_user(username='user2', password='password123')
        print(f"\nDEBUG: Created user1 (ID: {cls.user1.id}), user2 (ID: {cls.user2.id})") # DEBUG PRINT

        # Categories
        cls.cat_food = Category.objects.create(name='Food', user=None)
        cls.cat_travel = Category.objects.create(name='Travel', user=None)
        cls.cat_user1_custom = Category.objects.create(name='Gadgets', user=cls.user1)
        cls.cat_user2_custom = Category.objects.create(name='Work', user=cls.user2)
        print(f"DEBUG: Created categories.") # DEBUG PRINT

        # --- Transactions for User 1 ---
        print("DEBUG: Creating user1 transactions...") # DEBUG PRINT
        cls.tx1_user1 = Transaction.objects.create(
            user=cls.user1, category=None, transaction_date=date(2024, 1, 10),
            description='Coffee Shop A', amount=Decimal('5.50'), direction='DEBIT'
        )
        print(f"DEBUG: Created tx1_user1 (ID: {cls.tx1_user1.id}). Count for user1 uncategorized: {Transaction.objects.filter(user=cls.user1, category__isnull=True).count()}") # DEBUG

        cls.tx2_user1 = Transaction.objects.create(
            user=cls.user1, category=None, transaction_date=date(2024, 1, 5),
            description='Coffee Shop A', amount=Decimal('6.00'), direction='DEBIT'
        )
        print(f"DEBUG: Created tx2_user1 (ID: {cls.tx2_user1.id}). Count for user1 uncategorized: {Transaction.objects.filter(user=cls.user1, category__isnull=True).count()}") # DEBUG

        cls.tx3_user1 = Transaction.objects.create(
            user=cls.user1, category=None, transaction_date=date(2024, 1, 8),
            description='Supermarket B', amount=Decimal('55.20'), direction='DEBIT'
        )
        print(f"DEBUG: Created tx3_user1 (ID: {cls.tx3_user1.id}). Count for user1 uncategorized: {Transaction.objects.filter(user=cls.user1, category__isnull=True).count()}") # DEBUG

        # Use a distinct variable name for clarity
        cls.tx4_user1_salary = Transaction.objects.create(
            user=cls.user1, category=None, transaction_date=date(2024, 1, 15),
            description='Salary Deposit', amount=Decimal('2500.00'), direction='CREDIT'
        )
        print(f"DEBUG: Created tx4_user1_salary (ID: {cls.tx4_user1_salary.id}). Count for user1 uncategorized: {Transaction.objects.filter(user=cls.user1, category__isnull=True).count()}") # DEBUG


        # Categorized Transaction (Should NOT count towards uncategorized)
        cls.tx5_user1_categorized = Transaction.objects.create( # Give it a variable name too
            user=cls.user1, category=cls.cat_travel, transaction_date=date(2024, 1, 12),
            description='Train Ticket', amount=Decimal('30.00'), direction='DEBIT'
        )
        print(f"DEBUG: Created tx5_user1_categorized (ID: {cls.tx5_user1_categorized.id}). Count for user1 uncategorized: {Transaction.objects.filter(user=cls.user1, category__isnull=True).count()}") # DEBUG


        # --- Transaction for User 2 ---
        cls.tx1_user2 = Transaction.objects.create(
            user=cls.user2, category=None, transaction_date=date(2024, 1, 9),
            description='Book Store', amount=Decimal('25.00'), direction='DEBIT'
        )
        print(f"DEBUG: Created tx1_user2 (ID: {cls.tx1_user2.id})") # DEBUG PRINT


        # --- Final Verification ---
        user1_uncategorized_count = Transaction.objects.filter(user=cls.user1, category__isnull=True).count()
        print(f"DEBUG: Final check - User1 uncategorized count: {user1_uncategorized_count}") # DEBUG PRINT
        assert user1_uncategorized_count == 4, f"Expected 4 uncategorized transactions for user1, found {user1_uncategorized_count}"

        # URLs
        cls.uncategorized_url = reverse('transaction-uncategorized-groups')
        cls.batch_categorize_url = reverse('transaction-batch-categorize')

    def setUp(self):
        """Authenticate user1 and make class data available on self."""
        self.client.force_authenticate(user=self.user1)
        # --- ADD THIS: Copy class data to instance ---
        self.user1 = TransactionAPITests.user1
        self.user2 = TransactionAPITests.user2
        self.cat_food = TransactionAPITests.cat_food
        self.cat_travel = TransactionAPITests.cat_travel
        self.cat_user1_custom = TransactionAPITests.cat_user1_custom
        self.cat_user2_custom = TransactionAPITests.cat_user2_custom
        self.tx1_user1 = TransactionAPITests.tx1_user1
        self.tx2_user1 = TransactionAPITests.tx2_user1
        self.tx3_user1 = TransactionAPITests.tx3_user1
        self.tx1_user2 = TransactionAPITests.tx1_user2
        # --- END ADDITION ---

    # === Uncategorized Group List Tests (GET /api/transactions/uncategorized-groups/) ===

    def test_list_uncategorized_groups_authenticated(self):
        """
        Ensure endpoint returns correctly grouped and sorted uncategorized transactions for user1.
        """
        response = self.client.get(self.uncategorized_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # Expecting 3 groups for user1: 'Coffee Shop A', 'Supermarket B', 'Salary Deposit'
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 3)

        # Data should be sorted by the earliest date *within* each group
        # Earliest dates: Coffee=Jan 5, Supermarket=Jan 8, Salary=Jan 15
        group_descriptions_ordered = [group['description'] for group in response.data]
        expected_order = ['Coffee Shop A', 'Supermarket B', 'Salary Deposit']
        self.assertEqual(group_descriptions_ordered, expected_order)

        # --- Detailed check of the 'Coffee Shop A' group ---
        coffee_group = next((g for g in response.data if g['description'] == 'Coffee Shop A'), None)
        self.assertIsNotNone(coffee_group)
        self.assertEqual(coffee_group['description'], 'Coffee Shop A')
        self.assertEqual(coffee_group['count'], 2) # Should have 2 transactions
        self.assertEqual(len(coffee_group['transaction_ids']), 2)
        self.assertEqual(len(coffee_group['previews']), 2) # Both should be in preview (limit was 5)
        # Check earliest date is correct
        self.assertEqual(str(coffee_group['earliest_date']), '2024-01-05')
        # Check one of the preview items contains expected data
        preview_amounts = [Decimal(p['amount']) for p in coffee_group['previews']]
        self.assertIn(Decimal('5.50'), preview_amounts)
        self.assertIn(Decimal('6.00'), preview_amounts)

        # --- Detailed check of the 'Supermarket B' group ---
        supermarket_group = next((g for g in response.data if g['description'] == 'Supermarket B'), None)
        self.assertIsNotNone(supermarket_group)
        self.assertEqual(supermarket_group['count'], 1)
        self.assertEqual(len(supermarket_group['transaction_ids']), 1)
        self.assertEqual(len(supermarket_group['previews']), 1)
        self.assertEqual(str(supermarket_group['earliest_date']), '2024-01-08')
        self.assertEqual(Decimal(supermarket_group['previews'][0]['amount']), Decimal('55.20'))
        self.assertEqual(supermarket_group['previews'][0]['direction'], 'DEBIT')

        # --- Detailed check of the 'Salary Deposit' group ---
        salary_group = next((g for g in response.data if g['description'] == 'Salary Deposit'), None)
        self.assertIsNotNone(salary_group)
        self.assertEqual(salary_group['count'], 1)
        self.assertEqual(len(salary_group['transaction_ids']), 1)
        self.assertEqual(len(salary_group['previews']), 1)
        self.assertEqual(str(salary_group['earliest_date']), '2024-01-15')
        self.assertEqual(Decimal(salary_group['previews'][0]['amount']), Decimal('2500.00'))
        self.assertEqual(salary_group['previews'][0]['direction'], 'CREDIT')


    def test_list_uncategorized_groups_unauthenticated(self):
        """
        Ensure unauthenticated users cannot access the endpoint.
        """
        self.client.logout() # Ensure not authenticated
        response = self.client.get(self.uncategorized_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_uncategorized_groups_no_uncategorized(self):
        """
        Ensure endpoint returns an empty list if user has no uncategorized transactions.
        """
        # Categorize all of user1's initially uncategorized transactions
        Transaction.objects.filter(user=self.user1, category__isnull=True).update(category=self.cat_food)

        response = self.client.get(self.uncategorized_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 0)

    # Note: Add tests related to pagination if you enable it in the view.
    # e.g., check 'count', 'next', 'previous' keys and length of 'results'.



    # === Batch Categorize Tests (USE self. AGAIN) ===

    def test_batch_categorize_success(self):
        # --- Revert to using self. ---
        transaction_ids = [self.tx1_user1.id, self.tx2_user1.id]
        category_id = self.cat_food.id
        # --- End Revert ---
        data = {'transaction_ids': transaction_ids, 'category_id': category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['updated_count'], 2)
        # --- Revert to using self. ---
        self.assertIn(f'assigned category "{self.cat_food.name}"', response.data['message'])
        # --- End Revert ---

        # Fetch fresh objects to verify
        tx1 = Transaction.objects.get(pk=self.tx1_user1.id)
        tx2 = Transaction.objects.get(pk=self.tx2_user1.id)
        tx3 = Transaction.objects.get(pk=self.tx3_user1.id)
        # --- Revert to using self. ---
        self.assertEqual(tx1.category, self.cat_food)
        self.assertEqual(tx2.category, self.cat_food)
        self.assertIsNone(tx3.category)
        # --- End Revert ---

    def test_batch_categorize_success_single_transaction(self):
        # --- Revert to using self. ---
        transaction_ids = [self.tx3_user1.id]
        category_id = self.cat_food.id
        # --- End Revert ---
        data = {'transaction_ids': transaction_ids, 'category_id': category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['updated_count'], 1)
        tx3 = Transaction.objects.get(pk=self.tx3_user1.id)
        # --- Revert to using self. ---
        self.assertEqual(tx3.category, self.cat_food)
        # --- End Revert ---

    def test_batch_categorize_success_with_custom_category(self):
        # --- Revert to using self. ---
        transaction_ids = [self.tx1_user1.id]
        category_id = self.cat_user1_custom.id
         # --- End Revert ---
        data = {'transaction_ids': transaction_ids, 'category_id': category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['updated_count'], 1)
        tx1 = Transaction.objects.get(pk=self.tx1_user1.id)
        # --- Revert to using self. ---
        self.assertEqual(tx1.category, self.cat_user1_custom)
        # --- End Revert ---

    def test_batch_categorize_fail_invalid_category_id(self):
        # --- Revert to using self. ---
        transaction_ids = [self.tx1_user1.id]
        # --- End Revert ---
        invalid_category_id = 9999
        data = {'transaction_ids': transaction_ids, 'category_id': invalid_category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn('error', response.data)
        tx1 = Transaction.objects.get(pk=self.tx1_user1.id)
        self.assertIsNone(tx1.category)

    def test_batch_categorize_fail_category_not_owned(self):
        # --- Revert to using self. ---
        transaction_ids = [self.tx1_user1.id]
        other_user_category_id = self.cat_user2_custom.id
        # --- End Revert ---
        data = {'transaction_ids': transaction_ids, 'category_id': other_user_category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertIn('error', response.data)
        tx1 = Transaction.objects.get(pk=self.tx1_user1.id)
        self.assertIsNone(tx1.category)

    def test_batch_categorize_fail_transaction_not_owned(self):
        # --- Revert to using self. ---
        transaction_ids = [self.tx1_user2.id]
        category_id = self.cat_food.id
        # --- End Revert ---
        data = {'transaction_ids': transaction_ids, 'category_id': category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['updated_count'], 0)
        tx1_user2 = Transaction.objects.get(pk=self.tx1_user2.id)
        self.assertIsNone(tx1_user2.category)

    def test_batch_categorize_fail_partial_ownership(self):
        # --- Revert to using self. ---
        transaction_ids = [self.tx1_user1.id, self.tx1_user2.id]
        category_id = self.cat_food.id
        # --- End Revert ---
        data = {'transaction_ids': transaction_ids, 'category_id': category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['updated_count'], 1)
        tx1_user1 = Transaction.objects.get(pk=self.tx1_user1.id)
        tx1_user2 = Transaction.objects.get(pk=self.tx1_user2.id)
        # --- Revert to using self. ---
        self.assertEqual(tx1_user1.category, self.cat_food)
        self.assertIsNone(tx1_user2.category)
        # --- End Revert ---

    def test_batch_categorize_fail_missing_data(self):
        # --- Revert to using self. ---
        response = self.client.patch(self.batch_categorize_url, {'category_id': self.cat_food.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('transaction_ids', response.data['error'].lower())
        response = self.client.patch(self.batch_categorize_url, {'transaction_ids': [self.tx1_user1.id]}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('category_id', response.data['error'].lower())
        response = self.client.patch(self.batch_categorize_url, {'transaction_ids': [], 'category_id': self.cat_food.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('transaction_ids', response.data['error'].lower())
        # --- End Revert ---

    def test_batch_categorize_fail_invalid_id_format(self):
        # --- Revert to using self. ---
        data = {'transaction_ids': ['abc', self.tx1_user1.id], 'category_id': self.cat_food.id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('invalid id format', response.data['error'].lower())
        data = {'transaction_ids': [self.tx1_user1.id], 'category_id': 'xyz'}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('invalid id format', response.data['error'].lower())
        # --- End Revert ---

    def test_batch_categorize_unauthenticated(self):
        self.client.logout()
        data = {'transaction_ids': [1], 'category_id': 1}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
