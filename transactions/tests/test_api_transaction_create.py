# transactions/tests/test_api_transaction_create.py
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
from decimal import Decimal
from datetime import date, timedelta
from ..models import Transaction, Category, Vendor

User = get_user_model()

class TransactionCreateAPITests(APITestCase):
    """
    Tests for the Transaction Create API endpoint (/api/transactions/create/).
    """

    @classmethod
    def setUpTestData(cls):
        """Set up data for the whole test class."""
        cls.user1 = User.objects.create_user(username='user1', password='password123')
        cls.user2 = User.objects.create_user(username='user2', password='password123')

        # Create test categories
        cls.category_system = Category.objects.create(name='Food', user=None)  # System category
        cls.category_user1 = Category.objects.create(name='My Groceries', user=cls.user1)  # User1 category
        cls.category_user2 = Category.objects.create(name='User2 Category', user=cls.user2)  # User2 category

        # Create test vendors
        cls.vendor_system = Vendor.objects.create(name='Woolworths', user=None)  # System vendor
        cls.vendor_user1 = Vendor.objects.create(name='My Local Shop', user=cls.user1)  # User1 vendor
        cls.vendor_user2 = Vendor.objects.create(name='User2 Vendor', user=cls.user2)  # User2 vendor

        # URL
        cls.create_url = reverse('transaction-create')

    def setUp(self):
        """Authenticate user1 for most tests."""
        self.client.force_authenticate(user=self.user1)
        # Assign class data to instance for easier access
        self.user1 = TransactionCreateAPITests.user1
        self.user2 = TransactionCreateAPITests.user2
        self.category_system = TransactionCreateAPITests.category_system
        self.category_user1 = TransactionCreateAPITests.category_user1
        self.category_user2 = TransactionCreateAPITests.category_user2
        self.vendor_system = TransactionCreateAPITests.vendor_system
        self.vendor_user1 = TransactionCreateAPITests.vendor_user1
        self.vendor_user2 = TransactionCreateAPITests.vendor_user2

    # === Successful Creation Tests ===

    def test_create_basic_transaction_success(self):
        """Test creating a basic manual transaction with required fields only."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Coffee purchase',
            'original_amount': '5.50',
            'original_currency': 'AUD',
            'direction': 'DEBIT'
        }
        response = self.client.post(self.create_url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('transaction', response.data)
        self.assertIn('message', response.data)
        self.assertEqual(response.data['message'], 'Transaction created successfully.')
        
        # Verify transaction was created in database
        transaction = Transaction.objects.get(id=response.data['transaction']['id'])
        self.assertEqual(transaction.user, self.user1)
        self.assertEqual(transaction.description, 'Coffee purchase')
        self.assertEqual(transaction.original_amount, Decimal('5.50'))
        self.assertEqual(transaction.original_currency, 'AUD')
        self.assertEqual(transaction.direction, 'DEBIT')
        self.assertEqual(transaction.source, 'manual')

    def test_create_transaction_with_category_success(self):
        """Test creating a transaction with a category."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Grocery shopping',
            'original_amount': '25.00',
            'original_currency': 'USD',
            'direction': 'DEBIT',
            'category_id': self.category_system.id
        }
        response = self.client.post(self.create_url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        transaction = Transaction.objects.get(id=response.data['transaction']['id'])
        self.assertEqual(transaction.category, self.category_system)

    def test_create_transaction_with_vendor_success(self):
        """Test creating a transaction with a vendor."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Shopping',
            'original_amount': '15.00',
            'original_currency': 'EUR',
            'direction': 'DEBIT',
            'vendor_id': self.vendor_user1.id
        }
        response = self.client.post(self.create_url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        transaction = Transaction.objects.get(id=response.data['transaction']['id'])
        self.assertEqual(transaction.vendor, self.vendor_user1)

    def test_create_transaction_with_category_and_vendor(self):
        """Test creating a transaction with both category and vendor."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Lunch at restaurant',
            'original_amount': '12.50',
            'original_currency': 'GBP',
            'direction': 'DEBIT',
            'category_id': self.category_user1.id,
            'vendor_id': self.vendor_system.id
        }
        response = self.client.post(self.create_url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        transaction = Transaction.objects.get(id=response.data['transaction']['id'])
        self.assertEqual(transaction.category, self.category_user1)
        self.assertEqual(transaction.vendor, self.vendor_system)

    def test_create_credit_transaction(self):
        """Test creating a CREDIT transaction."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Salary payment',
            'original_amount': '3000.00',
            'original_currency': 'AUD',
            'direction': 'CREDIT'
        }
        response = self.client.post(self.create_url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        transaction = Transaction.objects.get(id=response.data['transaction']['id'])
        self.assertEqual(transaction.direction, 'CREDIT')

    # === Validation Error Tests ===

    def test_create_transaction_missing_required_fields(self):
        """Test validation errors for missing required fields."""
        # Missing description
        data = {
            'transaction_date': '2023-01-15',
            'original_amount': '5.50',
            'original_currency': 'AUD',
            'direction': 'DEBIT'
        }
        response = self.client.post(self.create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('description', response.data)

    def test_create_transaction_invalid_amount(self):
        """Test validation for invalid amounts."""
        # Negative amount
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Test',
            'original_amount': '-5.50',
            'original_currency': 'AUD',
            'direction': 'DEBIT'
        }
        response = self.client.post(self.create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('original_amount', response.data)

        # Zero amount
        data['original_amount'] = '0.00'
        response = self.client.post(self.create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_transaction_invalid_currency(self):
        """Test validation for invalid currency codes."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Test',
            'original_amount': '5.50',
            'original_currency': 'XYZ',  # Invalid currency
            'direction': 'DEBIT'
        }
        response = self.client.post(self.create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('original_currency', response.data)

    def test_create_transaction_invalid_direction(self):
        """Test validation for invalid direction."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Test',
            'original_amount': '5.50',
            'original_currency': 'AUD',
            'direction': 'INVALID'
        }
        response = self.client.post(self.create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('direction', response.data)

    def test_create_transaction_future_date_too_far(self):
        """Test validation for dates too far in the future."""
        future_date = date.today() + timedelta(days=400)  # More than 1 year
        data = {
            'transaction_date': future_date.isoformat(),
            'description': 'Future transaction',
            'original_amount': '5.50',
            'original_currency': 'AUD',
            'direction': 'DEBIT'
        }
        response = self.client.post(self.create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('transaction_date', response.data)

    def test_create_transaction_invalid_category_access(self):
        """Test validation for accessing other user's categories."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Test',
            'original_amount': '5.50',
            'original_currency': 'AUD',
            'direction': 'DEBIT',
            'category_id': self.category_user2.id  # User1 trying to use User2's category
        }
        response = self.client.post(self.create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('category_id', response.data)

    def test_create_transaction_invalid_vendor_access(self):
        """Test validation for accessing other user's vendors."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Test',
            'original_amount': '5.50',
            'original_currency': 'AUD',
            'direction': 'DEBIT',
            'vendor_id': self.vendor_user2.id  # User1 trying to use User2's vendor
        }
        response = self.client.post(self.create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('vendor_id', response.data)

    def test_create_transaction_nonexistent_category(self):
        """Test validation for non-existent category."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Test',
            'original_amount': '5.50',
            'original_currency': 'AUD',
            'direction': 'DEBIT',
            'category_id': 9999  # Non-existent category
        }
        response = self.client.post(self.create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('category_id', response.data)

    def test_create_transaction_nonexistent_vendor(self):
        """Test validation for non-existent vendor."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Test',
            'original_amount': '5.50',
            'original_currency': 'AUD',
            'direction': 'DEBIT',
            'vendor_id': 9999  # Non-existent vendor
        }
        response = self.client.post(self.create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('vendor_id', response.data)

    # === Authentication Tests ===

    def test_create_transaction_unauthenticated(self):
        """Test that unauthenticated users cannot create transactions."""
        self.client.logout()
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Test',
            'original_amount': '5.50',
            'original_currency': 'AUD',
            'direction': 'DEBIT'
        }
        response = self.client.post(self.create_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # === Currency Conversion Tests ===

    def test_create_transaction_aud_currency_conversion(self):
        """Test that AUD transactions have immediate AUD amount."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'AUD Transaction',
            'original_amount': '10.00',
            'original_currency': 'AUD',
            'direction': 'DEBIT'
        }
        response = self.client.post(self.create_url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data['currency_converted'])
        self.assertEqual(response.data['conversion_rate'], 1.0)

    def test_create_transaction_foreign_currency(self):
        """Test creating transaction with foreign currency."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'USD Transaction',
            'original_amount': '10.00',
            'original_currency': 'USD',
            'direction': 'DEBIT'
        }
        response = self.client.post(self.create_url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        # Currency conversion success depends on rate availability
        # We just verify the transaction was created
        transaction = Transaction.objects.get(id=response.data['transaction']['id'])
        self.assertEqual(transaction.original_currency, 'USD')

    # === Response Format Tests ===

    def test_create_transaction_response_format(self):
        """Test that the response has the expected format."""
        data = {
            'transaction_date': '2023-01-15',
            'description': 'Response format test',
            'original_amount': '5.50',
            'original_currency': 'AUD',
            'direction': 'DEBIT'
        }
        response = self.client.post(self.create_url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        # Check response structure
        self.assertIn('transaction', response.data)
        self.assertIn('message', response.data)
        self.assertIn('currency_converted', response.data)
        self.assertIn('conversion_rate', response.data)
        
        # Check transaction object has expected fields
        transaction_data = response.data['transaction']
        expected_fields = ['id', 'description', 'original_amount', 'original_currency', 'direction', 'transaction_date']
        for field in expected_fields:
            self.assertIn(field, transaction_data) 