"""
Unit tests for the DashboardBalanceView API endpoint.
Tests currency aggregation, current exchange rate usage, and response structure.
"""

from decimal import Decimal, ROUND_HALF_UP
from unittest import mock
from django.test import TestCase
from accounts.models import User
from rest_framework.test import APIClient
from rest_framework import status
from datetime import date, timedelta
from django.utils import timezone

from transactions.models import Transaction, BASE_CURRENCY_FOR_CONVERSION
from transactions.services import get_current_exchange_rate


class DashboardBalanceTests(TestCase):
    """Test cases for the dashboard balance calculation API."""

    def setUp(self):
        """Set up test user and authenticated API client."""
        self.user = User.objects.create_user(
            username='testuser',
            password='testpassword123',
            email='test@example.com'
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Test data constants
        self.test_date = date.today()
        self.eur_rate = Decimal('1.65')
        self.usd_rate = Decimal('1.50')
        self.current_eur_rate = Decimal('1.70')  # Current rate (different from historical)

    def test_currency_aggregation_with_mixed_sources(self):
        """Test balance calculation with Up Bank + CSV data using current exchange rates."""
        # Create Up Bank EUR transaction
        up_tx = Transaction.objects.create(
            user=self.user,
            source='up_bank',
            description='Up Bank EUR Transaction',
            transaction_date=self.test_date,
            original_amount=Decimal('100.00'),
            original_currency='EUR',
            aud_amount=Decimal('165.00'),  # Historical conversion at 1.65
            exchange_rate_to_aud=self.eur_rate,
            direction='CREDIT'  # Fixed: Use CREDIT for positive amount
        )
        
        # Create CSV EUR transaction  
        csv_tx = Transaction.objects.create(
            user=self.user,
            source='csv',
            description='CSV EUR Transaction',
            transaction_date=self.test_date,
            original_amount=Decimal('50.00'),
            original_currency='EUR',
            aud_amount=Decimal('80.00'),  # Historical conversion at 1.60
            exchange_rate_to_aud=Decimal('1.60'),
            direction='CREDIT'  # Fixed: Use CREDIT for positive amount
        )
        
        # Mock current EUR rate (different from historical rates)
        with mock.patch('transactions.views.get_current_exchange_rate') as mock_rate:  # Fixed: Mock the correct path
            mock_rate.return_value = self.current_eur_rate  # Current rate: 1.70
            
            response = self.client.get('/api/dashboard/balance/')
            
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            data = response.json()
            
            # Should aggregate: €150 * 1.70 = $255 (not $245 from historical rates)
            expected_eur_total = Decimal('150.00')  # 100 + 50
            expected_balance = expected_eur_total * self.current_eur_rate
            
            self.assertEqual(Decimal(str(data['balance'])), expected_balance)
            self.assertEqual(data['methodology'], 'current_rates')
            
            # Verify currency breakdown
            eur_breakdown = next(
                (item for item in data['currency_breakdown'] if item['currency'] == 'EUR'),
                None
            )
            self.assertIsNotNone(eur_breakdown)
            self.assertEqual(Decimal(str(eur_breakdown['original_total'])), expected_eur_total)
            self.assertEqual(Decimal(str(eur_breakdown['exchange_rate'])), self.current_eur_rate)
            self.assertFalse(eur_breakdown['is_target_currency'])

    def test_aud_transactions_no_conversion(self):
        """Test AUD transactions don't get converted and maintain 1.0 exchange rate."""
        # Create AUD transaction
        tx = Transaction.objects.create(
            user=self.user,
            source='up_bank',
            description='AUD Transaction',
            transaction_date=self.test_date,
            original_amount=Decimal('100.00'),
            original_currency='AUD',
            aud_amount=Decimal('100.00'),
            exchange_rate_to_aud=Decimal('1.00'),
            direction='CREDIT'  # Fixed: Use CREDIT for positive amount
        )
        
        response = self.client.get('/api/dashboard/balance/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        
        # Check AUD amount is used directly
        self.assertEqual(Decimal(str(data['balance'])), Decimal('100.00'))
        
        # Verify currency breakdown for AUD
        aud_breakdown = next(
            (item for item in data['currency_breakdown'] if item['currency'] == 'AUD'),
            None
        )
        self.assertIsNotNone(aud_breakdown)
        self.assertEqual(Decimal(str(aud_breakdown['exchange_rate'])), Decimal('1.0'))
        self.assertEqual(Decimal(str(aud_breakdown['original_total'])), Decimal('100.00'))
        self.assertEqual(Decimal(str(aud_breakdown['converted_total'])), Decimal('100.00'))
        self.assertTrue(aud_breakdown['is_target_currency'])

    def test_currency_breakdown_response(self):
        """Test currency breakdown structure and content."""
        # Create transactions in different currencies
        Transaction.objects.create(
            user=self.user,
            source='up_bank',
            description='AUD Transaction',
            transaction_date=self.test_date,
            original_amount=Decimal('100.00'),
            original_currency='AUD',
            aud_amount=Decimal('100.00'),
            exchange_rate_to_aud=Decimal('1.00'),
            direction='CREDIT'  # Fixed: Use CREDIT for positive amount
        )
        
        Transaction.objects.create(
            user=self.user,
            source='csv',
            description='EUR Transaction',
            transaction_date=self.test_date,
            original_amount=Decimal('50.00'),
            original_currency='EUR',
            aud_amount=Decimal('80.00'),
            exchange_rate_to_aud=Decimal('1.60'),
            direction='CREDIT'  # Fixed: Use CREDIT for positive amount
        )
        
        # Mock current EUR rate
        with mock.patch('transactions.views.get_current_exchange_rate') as mock_rate:  # Fixed: Mock the correct path
            mock_rate.return_value = self.current_eur_rate  # Current rate: 1.70
            
            response = self.client.get('/api/dashboard/balance/')
            
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            data = response.json()
            
            # Check response structure
            required_fields = [
                'balance', 'currency', 'currency_breakdown', 
                'conversion_date', 'methodology', 'total_transactions_count',
                'conversion_failures', 'warning'
            ]
            for field in required_fields:
                self.assertIn(field, data)
            
            self.assertEqual(len(data['currency_breakdown']), 2)
            self.assertEqual(data['currency'], BASE_CURRENCY_FOR_CONVERSION)
            self.assertEqual(data['methodology'], 'current_rates')
            self.assertEqual(data['total_transactions_count'], 2)
            self.assertEqual(len(data['conversion_failures']), 0)
            self.assertIsNone(data['warning'])
            
            # Verify breakdown structure
            for breakdown_item in data['currency_breakdown']:
                required_breakdown_fields = [
                    'currency', 'original_total', 'converted_total',
                    'exchange_rate', 'is_target_currency'
                ]
                for field in required_breakdown_fields:
                    self.assertIn(field, breakdown_item)

    def test_conversion_failure_handling(self):
        """Test handling when current rates are unavailable."""
        # Create transaction in currency with no rate
        Transaction.objects.create(
            user=self.user,
            source='csv',
            description='Unknown Currency Transaction',
            transaction_date=self.test_date,
            original_amount=Decimal('100.00'),
            original_currency='XYZ',  # Unknown currency
            aud_amount=None,  # No historical conversion available
            exchange_rate_to_aud=None,
            direction='DEBIT'  # This one should remain DEBIT (expense) so it doesn't affect balance
        )
        
        # Create an AUD transaction so we still have some balance
        Transaction.objects.create(
            user=self.user,
            source='up_bank',
            description='AUD Transaction',
            transaction_date=self.test_date,
            original_amount=Decimal('50.00'),
            original_currency='AUD',
            aud_amount=Decimal('50.00'),
            exchange_rate_to_aud=Decimal('1.00'),
            direction='CREDIT'
        )
        
        # Mock current rate to return None for XYZ currency
        def mock_exchange_rate(from_currency, to_currency):
            if from_currency == 'XYZ':
                return None  # Simulate rate not available
            return Decimal('1.0')  # AUD to AUD
        
        with mock.patch('transactions.views.get_current_exchange_rate', side_effect=mock_exchange_rate):
            response = self.client.get('/api/dashboard/balance/')
            
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            data = response.json()
            
            # Check failure handling
            self.assertIn('conversion_failures', data)
            self.assertIn('XYZ', data['conversion_failures'])
            self.assertIsNotNone(data['warning'])
            self.assertIn('Unable to convert', data['warning'])
            self.assertIn('XYZ', data['warning'])
            
            # Should still calculate balance for AUD transactions
            self.assertEqual(Decimal(str(data['balance'])), Decimal('50.00'))
            
            # Should only have AUD in currency breakdown (XYZ excluded due to conversion failure)
            self.assertEqual(len(data['currency_breakdown']), 1)
            self.assertEqual(data['currency_breakdown'][0]['currency'], 'AUD')

    def test_mixed_debit_credit_aggregation(self):
        """Test that debits and credits are properly aggregated by currency."""
        # Create multiple EUR transactions with different directions
        Transaction.objects.create(
            user=self.user,
            source='up_bank',
            description='EUR Credit',
            transaction_date=self.test_date,
            original_amount=Decimal('200.00'),
            original_currency='EUR',
            aud_amount=Decimal('330.00'),
            exchange_rate_to_aud=self.eur_rate,
            direction='CREDIT'  # Positive
        )
        
        Transaction.objects.create(
            user=self.user,
            source='csv',
            description='EUR Debit',
            transaction_date=self.test_date,
            original_amount=Decimal('150.00'),
            original_currency='EUR',
            aud_amount=Decimal('247.50'),
            exchange_rate_to_aud=self.eur_rate,
            direction='DEBIT'  # Negative
        )
        
        # Mock current EUR rate
        with mock.patch('transactions.views.get_current_exchange_rate') as mock_rate:
            mock_rate.return_value = self.current_eur_rate
            
            response = self.client.get('/api/dashboard/balance/')
            
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            data = response.json()
            
            # Net EUR total should be: +200 - 150 = +50
            expected_eur_net = Decimal('50.00')
            expected_balance = expected_eur_net * self.current_eur_rate
            
            self.assertEqual(Decimal(str(data['balance'])), expected_balance)
            
            eur_breakdown = next(
                (item for item in data['currency_breakdown'] if item['currency'] == 'EUR'),
                None
            )
            self.assertEqual(Decimal(str(eur_breakdown['original_total'])), expected_eur_net)

    def test_target_currency_parameter(self):
        """Test specifying different target currency for conversion."""
        # Create USD transaction
        Transaction.objects.create(
            user=self.user,
            source='up_bank',
            description='USD Transaction',
            transaction_date=self.test_date,
            original_amount=Decimal('100.00'),
            original_currency='USD',
            aud_amount=Decimal('150.00'),
            exchange_rate_to_aud=self.usd_rate,
            direction='CREDIT'  # Fixed: Use CREDIT for positive amount
        )
        
        # Mock current USD to EUR rate
        with mock.patch('transactions.views.get_current_exchange_rate') as mock_rate:
            mock_rate.return_value = Decimal('0.85')  # USD to EUR
            
            # Request balance in EUR instead of AUD
            response = self.client.get('/api/dashboard/balance/?target_currency=EUR')
            
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            data = response.json()
            
            self.assertEqual(data['currency'], 'EUR')
            expected_balance = Decimal('100.00') * Decimal('0.85')  # 100 USD * 0.85
            self.assertEqual(Decimal(str(data['balance'])), expected_balance)

    def test_empty_transactions(self):
        """Test API response when user has no transactions."""
        response = self.client.get('/api/dashboard/balance/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        
        self.assertEqual(Decimal(str(data['balance'])), Decimal('0.00'))
        self.assertEqual(len(data['currency_breakdown']), 0)
        self.assertEqual(data['total_transactions_count'], 0)
        self.assertEqual(len(data['conversion_failures']), 0)
        self.assertIsNone(data['warning'])

    def test_unauthenticated_access(self):
        """Test that unauthenticated requests are rejected."""
        # Create client without authentication
        unauth_client = APIClient()
        response = unauth_client.get('/api/dashboard/balance/')
        
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_user_isolation(self):
        """Test that users only see their own transaction data."""
        # Create another user with transactions
        other_user = User.objects.create_user(
            username='otheruser',
            password='otherpassword123'
        )
        
        Transaction.objects.create(
            user=other_user,
            source='up_bank',
            description='Other User Transaction',
            transaction_date=self.test_date,
            original_amount=Decimal('1000.00'),
            original_currency='AUD',
            aud_amount=Decimal('1000.00'),
            exchange_rate_to_aud=Decimal('1.00'),
            direction='CREDIT'
        )
        
        # Create transaction for our test user
        Transaction.objects.create(
            user=self.user,
            source='up_bank',
            description='Test User Transaction',
            transaction_date=self.test_date,
            original_amount=Decimal('100.00'),
            original_currency='AUD',
            aud_amount=Decimal('100.00'),
            exchange_rate_to_aud=Decimal('1.00'),
            direction='CREDIT'  # Fixed: Use CREDIT for positive amount
        )
        
        response = self.client.get('/api/dashboard/balance/')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        
        # Should only see our user's transaction
        self.assertEqual(data['total_transactions_count'], 1)
        self.assertEqual(Decimal(str(data['balance'])), Decimal('100.00')) 