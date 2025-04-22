# transactions/tests/test_api_transactions.py
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
        """Set up data for the whole test class."""
        cls.user1 = User.objects.create_user(username='user1', password='password123')
        cls.user2 = User.objects.create_user(username='user2', password='password123')

        cls.cat_food = Category.objects.create(name='Food', user=None)
        cls.cat_travel = Category.objects.create(name='Travel', user=None)
        cls.cat_user1_custom = Category.objects.create(name='Gadgets', user=cls.user1)
        cls.cat_user2_custom = Category.objects.create(name='Work', user=cls.user2)

        # Transactions for User 1
        cls.tx1_user1 = Transaction.objects.create( # Uncategorized
            user=cls.user1, category=None, transaction_date=date(2024, 1, 10),
            description='Coffee Shop A', amount=Decimal('5.50'), direction='DEBIT'
        )
        cls.tx2_user1 = Transaction.objects.create( # Uncategorized
            user=cls.user1, category=None, transaction_date=date(2024, 1, 5),
            description='Coffee Shop A', amount=Decimal('6.00'), direction='DEBIT'
        )
        cls.tx3_user1 = Transaction.objects.create( # Uncategorized
            user=cls.user1, category=None, transaction_date=date(2024, 1, 8),
            description='Supermarket B', amount=Decimal('55.20'), direction='DEBIT'
        )
        cls.tx4_user1_salary = Transaction.objects.create( # Uncategorized CREDIT
            user=cls.user1, category=None, transaction_date=date(2024, 1, 15),
            description='Salary Deposit', amount=Decimal('2500.00'), direction='CREDIT'
        )
        cls.tx5_user1_categorized = Transaction.objects.create( # Categorized (Travel)
            user=cls.user1, category=cls.cat_travel, transaction_date=date(2024, 1, 12),
            description='Train Ticket', amount=Decimal('30.00'), direction='DEBIT'
        )
        cls.tx6_user1_categorized = Transaction.objects.create( # Categorized (Food)
            user=cls.user1, category=cls.cat_food, transaction_date=date(2024, 1, 11),
            description='Restaurant C', amount=Decimal('45.00'), direction='DEBIT'
        )


        # Transaction for User 2
        cls.tx1_user2 = Transaction.objects.create( # Uncategorized
            user=cls.user2, category=None, transaction_date=date(2024, 1, 9),
            description='Book Store', amount=Decimal('25.00'), direction='DEBIT'
        )

        # Verification
        user1_tx_count = Transaction.objects.filter(user=cls.user1).count()
        assert user1_tx_count == 6, f"Expected 6 transactions for user1, found {user1_tx_count}"
        user1_uncategorized_count = Transaction.objects.filter(user=cls.user1, category__isnull=True).count()
        assert user1_uncategorized_count == 4, f"Expected 4 uncategorized transactions for user1, found {user1_uncategorized_count}"


        # URLs
        cls.uncategorized_url = reverse('transaction-uncategorized-groups')
        cls.batch_categorize_url = reverse('transaction-batch-categorize')
        cls.transaction_list_url = reverse('transaction-list') # Add list URL


    def setUp(self):
        """Authenticate user1 and make class data available on self."""
        self.client.force_authenticate(user=self.user1)
        self.user1 = TransactionAPITests.user1
        self.user2 = TransactionAPITests.user2
        self.cat_food = TransactionAPITests.cat_food
        self.cat_travel = TransactionAPITests.cat_travel
        self.cat_user1_custom = TransactionAPITests.cat_user1_custom
        self.cat_user2_custom = TransactionAPITests.cat_user2_custom
        self.tx1_user1 = TransactionAPITests.tx1_user1
        self.tx2_user1 = TransactionAPITests.tx2_user1
        self.tx3_user1 = TransactionAPITests.tx3_user1
        self.tx4_user1_salary = TransactionAPITests.tx4_user1_salary
        self.tx5_user1_categorized = TransactionAPITests.tx5_user1_categorized
        self.tx6_user1_categorized = TransactionAPITests.tx6_user1_categorized
        self.tx1_user2 = TransactionAPITests.tx1_user2


    # === Uncategorized Group List Tests (GET /api/transactions/uncategorized-groups/) ===

    def test_list_uncategorized_groups_authenticated(self):
        response = self.client.get(self.uncategorized_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 3) # Coffee, Supermarket, Salary
        # Check sorting (newest group first based on MAX date)
        group_descriptions_ordered = [group['description'] for group in response.data]
        expected_order = ['Salary Deposit', 'Coffee Shop A', 'Supermarket B'] # Max dates: 15th, 10th, 8th
        self.assertEqual(group_descriptions_ordered, expected_order)
        # ... (keep detailed checks for one group if desired) ...

    def test_list_uncategorized_groups_unauthenticated(self):
        self.client.logout()
        response = self.client.get(self.uncategorized_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_list_uncategorized_groups_no_uncategorized(self):
        Transaction.objects.filter(user=self.user1, category__isnull=True).update(category=self.cat_food)
        response = self.client.get(self.uncategorized_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertEqual(len(response.data), 0)

    def test_check_uncategorized_groups_existence_true(self):
        """Test check_existence=true when groups exist."""
        response = self.client.get(self.uncategorized_url, {'check_existence': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'has_uncategorized': True})

    def test_check_uncategorized_groups_existence_false(self):
        """Test check_existence=true when no groups exist."""
        Transaction.objects.filter(user=self.user1, category__isnull=True).update(category=self.cat_food)
        response = self.client.get(self.uncategorized_url, {'check_existence': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data, {'has_uncategorized': False})


    # === Batch Categorize Tests (PATCH /api/transactions/batch-categorize/) ===

    def test_batch_categorize_success(self):
        transaction_ids = [self.tx1_user1.id, self.tx2_user1.id]
        category_id = self.cat_food.id
        data = {'transaction_ids': transaction_ids, 'category_id': category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['updated_count'], 2)
        self.assertIn(f'assigned category "{self.cat_food.name}"', response.data['message'])
        # Verify DB
        tx1 = Transaction.objects.get(pk=self.tx1_user1.id); tx2 = Transaction.objects.get(pk=self.tx2_user1.id); tx3 = Transaction.objects.get(pk=self.tx3_user1.id)
        self.assertEqual(tx1.category, self.cat_food); self.assertEqual(tx2.category, self.cat_food); self.assertIsNone(tx3.category)

    def test_batch_categorize_success_single_transaction(self):
        transaction_ids = [self.tx3_user1.id]
        category_id = self.cat_food.id
        data = {'transaction_ids': transaction_ids, 'category_id': category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK); self.assertEqual(response.data['updated_count'], 1)
        tx3 = Transaction.objects.get(pk=self.tx3_user1.id); self.assertEqual(tx3.category, self.cat_food)

    def test_batch_categorize_success_with_custom_category(self):
        transaction_ids = [self.tx1_user1.id]
        category_id = self.cat_user1_custom.id
        data = {'transaction_ids': transaction_ids, 'category_id': category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK); self.assertEqual(response.data['updated_count'], 1)
        tx1 = Transaction.objects.get(pk=self.tx1_user1.id); self.assertEqual(tx1.category, self.cat_user1_custom)

    def test_batch_categorize_fail_invalid_category_id(self):
        transaction_ids = [self.tx1_user1.id]; invalid_category_id = 9999
        data = {'transaction_ids': transaction_ids, 'category_id': invalid_category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND); self.assertIn('error', response.data)
        tx1 = Transaction.objects.get(pk=self.tx1_user1.id); self.assertIsNone(tx1.category)

    def test_batch_categorize_fail_category_not_owned(self):
        transaction_ids = [self.tx1_user1.id]; other_user_category_id = self.cat_user2_custom.id
        data = {'transaction_ids': transaction_ids, 'category_id': other_user_category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND); self.assertIn('error', response.data)
        tx1 = Transaction.objects.get(pk=self.tx1_user1.id); self.assertIsNone(tx1.category)

    def test_batch_categorize_fail_transaction_not_owned(self):
        transaction_ids = [self.tx1_user2.id]; category_id = self.cat_food.id
        data = {'transaction_ids': transaction_ids, 'category_id': category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK); self.assertEqual(response.data['updated_count'], 0)
        tx1_user2 = Transaction.objects.get(pk=self.tx1_user2.id); self.assertIsNone(tx1_user2.category)

    def test_batch_categorize_fail_partial_ownership(self):
        transaction_ids = [self.tx1_user1.id, self.tx1_user2.id]; category_id = self.cat_food.id
        data = {'transaction_ids': transaction_ids, 'category_id': category_id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK); self.assertEqual(response.data['updated_count'], 1)
        tx1_user1 = Transaction.objects.get(pk=self.tx1_user1.id); tx1_user2 = Transaction.objects.get(pk=self.tx1_user2.id)
        self.assertEqual(tx1_user1.category, self.cat_food); self.assertIsNone(tx1_user2.category)

    def test_batch_categorize_fail_missing_data(self):
        # Missing transaction_ids
        response = self.client.patch(self.batch_categorize_url, {'category_id': self.cat_food.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST); self.assertIn('transaction_ids', response.data['error'].lower())
        # Missing category_id
        response = self.client.patch(self.batch_categorize_url, {'transaction_ids': [self.tx1_user1.id]}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST); self.assertIn('category_id', response.data['error'].lower())
        # Empty transaction_ids list
        response = self.client.patch(self.batch_categorize_url, {'transaction_ids': [], 'category_id': self.cat_food.id}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST); self.assertIn('transaction_ids', response.data['error'].lower())

    def test_batch_categorize_fail_invalid_id_format(self):
        data = {'transaction_ids': ['abc', self.tx1_user1.id], 'category_id': self.cat_food.id}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST); self.assertIn('invalid id format', response.data['error'].lower())
        data = {'transaction_ids': [self.tx1_user1.id], 'category_id': 'xyz'}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST); self.assertIn('invalid id format', response.data['error'].lower())

    def test_batch_categorize_unauthenticated(self):
        self.client.logout()
        data = {'transaction_ids': [1], 'category_id': 1}
        response = self.client.patch(self.batch_categorize_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


    # === Transaction List Tests (GET /api/transactions/) ===

    def test_list_transactions_all_for_user(self):
        """Test listing all transactions for the authenticated user."""
        response = self.client.get(self.transaction_list_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # User 1 has 6 transactions total (4 uncategorized + 2 categorized)
        # Check based on pagination structure if enabled
        if 'results' in response.data:
            self.assertEqual(response.data['count'], 6)
            self.assertEqual(len(response.data['results']), 6) # Assuming page size is >= 6
            results = response.data['results']
        else:
            self.assertEqual(len(response.data), 6)
            results = response.data

        # Check if specific transaction descriptions are present
        descriptions = [tx['description'] for tx in results]
        self.assertIn('Coffee Shop A', descriptions)
        self.assertIn('Supermarket B', descriptions)
        self.assertIn('Salary Deposit', descriptions)
        self.assertIn('Train Ticket', descriptions)
        self.assertIn('Restaurant C', descriptions)
        # Ensure user2's transaction is NOT present
        self.assertNotIn('Book Store', descriptions)

    def test_list_transactions_categorized_only(self):
        """Test filtering for categorized transactions."""
        response = self.client.get(self.transaction_list_url, {'status': 'categorized'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        if 'results' in response.data:
            self.assertEqual(response.data['count'], 2) # Train Ticket, Restaurant C
            self.assertEqual(len(response.data['results']), 2)
            results = response.data['results']
        else:
             self.assertEqual(len(response.data), 2)
             results = response.data

        descriptions = [tx['description'] for tx in results]
        self.assertIn('Train Ticket', descriptions)
        self.assertIn('Restaurant C', descriptions)
        self.assertNotIn('Coffee Shop A', descriptions)
        self.assertNotIn('Salary Deposit', descriptions)
        # Check category is not null
        self.assertIsNotNone(results[0]['category'])
        self.assertIsNotNone(results[1]['category'])

    def test_list_transactions_uncategorized_only(self):
        """Test filtering for uncategorized transactions."""
        response = self.client.get(self.transaction_list_url, {'status': 'uncategorized'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        if 'results' in response.data:
            self.assertEqual(response.data['count'], 4) # 2x Coffee, Supermarket, Salary
            self.assertEqual(len(response.data['results']), 4)
            results = response.data['results']
        else:
             self.assertEqual(len(response.data), 4)
             results = response.data

        descriptions = [tx['description'] for tx in results]
        self.assertIn('Coffee Shop A', descriptions)
        self.assertIn('Supermarket B', descriptions)
        self.assertIn('Salary Deposit', descriptions)
        self.assertNotIn('Train Ticket', descriptions)
        # Check category is null
        self.assertIsNone(results[0]['category'])
        self.assertIsNone(results[1]['category'])
        self.assertIsNone(results[2]['category'])
        self.assertIsNone(results[3]['category'])

    def test_list_transactions_unauthenticated(self):
        """Test listing transactions requires authentication."""
        self.client.logout()
        response = self.client.get(self.transaction_list_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # Add more tests for TransactionListView filtering later if needed
    # (e.g., by date range, amount, specific category ID)

    # Add tests for Transaction Detail/Update/Delete later if needed