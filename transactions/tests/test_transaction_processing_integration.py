import os
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from django.test import TestCase
from django.contrib.auth import get_user_model
from django.core.management import call_command
from io import StringIO

from transactions.models import Transaction, HistoricalExchangeRate, Category, Vendor, BASE_CURRENCY_FOR_CONVERSION
from transactions.services import get_historical_rate

User = get_user_model()


class TransactionProcessingIntegrationTests(TestCase):
    """
    Integration tests for transaction processing with currency conversion.
    Tests the full flow from transaction creation to AUD amount calculation.
    """

    def setUp(self):
        """Set up test fixtures for users, exchange rates, and test data."""
        # Create test user
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
        
        # Create test category and vendor
        self.category = Category.objects.create(
            name='Test Category',
            user=self.user
        )
        
        self.vendor = Vendor.objects.create(
            name='Test Vendor',
            user=self.user
        )
        
        # Define test dates
        self.test_date_1 = date(2023, 1, 15)  # Primary test date
        self.test_date_2 = date(2023, 2, 15)  # Secondary test date
        self.test_date_3 = date(2023, 3, 15)  # Third test date
        
        # Create comprehensive exchange rate fixtures
        self.create_exchange_rate_fixtures()
        
        # Store expected conversion values for verification
        self.setup_expected_conversion_values()

    def create_exchange_rate_fixtures(self):
        """Create comprehensive exchange rate test fixtures."""
        
        # Direct AUD rates (AUD as source currency) - Primary test date
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='USD',
            date=self.test_date_1,
            rate=Decimal('0.7000')  # 1 AUD = 0.70 USD
        )
        
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='EUR',
            date=self.test_date_1,
            rate=Decimal('0.6500')  # 1 AUD = 0.65 EUR
        )
        
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='GBP',
            date=self.test_date_1,
            rate=Decimal('0.5500')  # 1 AUD = 0.55 GBP
        )
        
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='JPY',
            date=self.test_date_1,
            rate=Decimal('95.0000')  # 1 AUD = 95 JPY
        )
        
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='CAD',
            date=self.test_date_1,
            rate=Decimal('0.9500')  # 1 AUD = 0.95 CAD
        )

        # Secondary test date with different rates
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='USD',
            date=self.test_date_2,
            rate=Decimal('0.7200')  # 1 AUD = 0.72 USD (rate changed)
        )
        
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='EUR',
            date=self.test_date_2,
            rate=Decimal('0.6700')  # 1 AUD = 0.67 EUR (rate changed)
        )

        # Third test date with limited rates
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='USD',
            date=self.test_date_3,
            rate=Decimal('0.6900')  # 1 AUD = 0.69 USD
        )
        
        # Add some additional currencies for cross-currency testing
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='CHF',
            date=self.test_date_1,
            rate=Decimal('0.6200')  # 1 AUD = 0.62 CHF
        )
        
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='NOK',
            date=self.test_date_1,
            rate=Decimal('7.2000')  # 1 AUD = 7.20 NOK
        )

    def setup_expected_conversion_values(self):
        """Calculate expected AUD conversion values for test verification."""
        
        # For USD transactions on test_date_1
        # USD to AUD rate = 1 / (AUD to USD rate) = 1 / 0.7000 = ~1.4286
        self.expected_usd_to_aud_rate = Decimal('1') / Decimal('0.7000')
        
        # For EUR transactions on test_date_1  
        # EUR to AUD rate = 1 / (AUD to EUR rate) = 1 / 0.6500 = ~1.5385
        self.expected_eur_to_aud_rate = Decimal('1') / Decimal('0.6500')
        
        # For JPY transactions on test_date_1
        # JPY to AUD rate = 1 / (AUD to JPY rate) = 1 / 95.0000 = ~0.0105
        self.expected_jpy_to_aud_rate = Decimal('1') / Decimal('95.0000')

    def test_fixture_creation(self):
        """Verify that test fixtures are created correctly."""
        # Check user creation
        self.assertIsNotNone(self.user)
        self.assertEqual(self.user.username, 'testuser')
        
        # Check exchange rate fixtures
        total_rates = HistoricalExchangeRate.objects.count()
        self.assertGreater(total_rates, 0, "Exchange rate fixtures should be created")
        
        # Check specific rates exist
        usd_rate = HistoricalExchangeRate.objects.filter(
            source_currency='AUD',
            target_currency='USD',
            date=self.test_date_1
        ).first()
        self.assertIsNotNone(usd_rate)
        self.assertEqual(usd_rate.rate, Decimal('0.7000'))
        
        # Check we have rates on multiple dates
        dates_count = HistoricalExchangeRate.objects.values_list('date', flat=True).distinct().count()
        self.assertGreaterEqual(dates_count, 3, "Should have rates on multiple dates")

    def test_aud_transaction_processing(self):
        """Test processing of transactions already in AUD (no conversion needed)."""
        transaction = Transaction.objects.create(
            user=self.user,
            category=self.category,
            vendor=self.vendor,
            transaction_date=self.test_date_1,
            description='Test AUD transaction',
            original_amount=Decimal('100.00'),
            original_currency='AUD',
            direction='DEBIT'
        )
        
        # Process the transaction
        result = transaction.update_aud_amount_if_needed()
        
        # Refresh from database
        transaction.refresh_from_db()
        
        # Verify results
        self.assertTrue(result, "AUD transaction processing should succeed")
        self.assertEqual(transaction.aud_amount, Decimal('100.00'))
        self.assertEqual(transaction.exchange_rate_to_aud, Decimal('1.0'))
        self.assertEqual(transaction.original_currency, 'AUD')

    def test_usd_transaction_processing(self):
        """Test processing of USD transactions with direct AUD conversion."""
        transaction = Transaction.objects.create(
            user=self.user,
            category=self.category,
            vendor=self.vendor,
            transaction_date=self.test_date_1,
            description='Test USD transaction',
            original_amount=Decimal('100.00'),
            original_currency='USD',
            direction='DEBIT'
        )
        
        # Process the transaction
        result = transaction.update_aud_amount_if_needed()
        
        # Refresh from database
        transaction.refresh_from_db()
        
        # Verify results
        self.assertTrue(result, "USD transaction processing should succeed")
        
        # USD 100.00 should convert to AUD using rate: 1 USD = (1/0.7000) AUD = ~1.4286 AUD
        # So 100 USD = 100 * 1.4286 = ~142.86 AUD
        expected_aud_amount = (Decimal('100.00') * self.expected_usd_to_aud_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        expected_rate = self.expected_usd_to_aud_rate
        
        self.assertEqual(transaction.aud_amount, expected_aud_amount)
        self.assertAlmostEqual(float(transaction.exchange_rate_to_aud), float(expected_rate), places=6)
        self.assertEqual(transaction.original_currency, 'USD')

    def test_eur_transaction_processing(self):
        """Test processing of EUR transactions with direct AUD conversion."""
        transaction = Transaction.objects.create(
            user=self.user,
            category=self.category,
            vendor=self.vendor,
            transaction_date=self.test_date_1,
            description='Test EUR transaction',
            original_amount=Decimal('50.00'),
            original_currency='EUR',
            direction='CREDIT'
        )
        
        # Process the transaction
        result = transaction.update_aud_amount_if_needed()
        
        # Refresh from database
        transaction.refresh_from_db()
        
        # Verify results
        self.assertTrue(result, "EUR transaction processing should succeed")
        
        # EUR 50.00 should convert to AUD using rate: 1 EUR = (1/0.6500) AUD = ~1.5385 AUD
        # So 50 EUR = 50 * 1.5385 = ~76.92 AUD
        expected_aud_amount = (Decimal('50.00') * self.expected_eur_to_aud_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        expected_rate = self.expected_eur_to_aud_rate
        
        self.assertEqual(transaction.aud_amount, expected_aud_amount)
        self.assertAlmostEqual(float(transaction.exchange_rate_to_aud), float(expected_rate), places=6)
        self.assertEqual(transaction.original_currency, 'EUR')
        self.assertEqual(transaction.direction, 'CREDIT')

    def test_jpy_transaction_processing(self):
        """Test processing of JPY transactions (large amounts, small rate)."""
        transaction = Transaction.objects.create(
            user=self.user,
            category=self.category,
            vendor=self.vendor,
            transaction_date=self.test_date_1,
            description='Test JPY transaction',
            original_amount=Decimal('10000.00'),
            original_currency='JPY',
            direction='DEBIT'
        )
        
        # Process the transaction
        result = transaction.update_aud_amount_if_needed()
        
        # Refresh from database
        transaction.refresh_from_db()
        
        # Verify results
        self.assertTrue(result, "JPY transaction processing should succeed")
        
        # JPY 10000 should convert to AUD using rate: 1 JPY = (1/95.0000) AUD = ~0.0105 AUD
        # So 10000 JPY = 10000 * 0.0105 = ~105.26 AUD
        expected_aud_amount = (Decimal('10000.00') * self.expected_jpy_to_aud_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        expected_rate = self.expected_jpy_to_aud_rate
        
        self.assertEqual(transaction.aud_amount, expected_aud_amount)
        self.assertAlmostEqual(float(transaction.exchange_rate_to_aud), float(expected_rate), places=6)
        self.assertEqual(transaction.original_currency, 'JPY')

    def test_date_specific_exchange_rate_usage(self):
        """Test that transactions use exchange rates specific to their transaction date."""
        # Create USD transaction on test_date_1
        transaction_1 = Transaction.objects.create(
            user=self.user,
            transaction_date=self.test_date_1,
            description='USD transaction date 1',
            original_amount=Decimal('100.00'),
            original_currency='USD',
            direction='DEBIT'
        )
        
        # Create USD transaction on test_date_2 (different rate)
        transaction_2 = Transaction.objects.create(
            user=self.user,
            transaction_date=self.test_date_2,
            description='USD transaction date 2',
            original_amount=Decimal('100.00'),
            original_currency='USD',
            direction='DEBIT'
        )
        
        # Process both transactions
        result_1 = transaction_1.update_aud_amount_if_needed()
        result_2 = transaction_2.update_aud_amount_if_needed()
        
        # Refresh from database
        transaction_1.refresh_from_db()
        transaction_2.refresh_from_db()
        
        # Verify both succeeded
        self.assertTrue(result_1)
        self.assertTrue(result_2)
        
        # Calculate expected amounts for each date
        # Date 1: USD rate = 0.7000, so USD->AUD = 1/0.7000 = ~1.4286
        expected_rate_1 = Decimal('1') / Decimal('0.7000')
        expected_aud_1 = (Decimal('100.00') * expected_rate_1).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        # Date 2: USD rate = 0.7200, so USD->AUD = 1/0.7200 = ~1.3889  
        expected_rate_2 = Decimal('1') / Decimal('0.7200')
        expected_aud_2 = (Decimal('100.00') * expected_rate_2).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        # Verify different rates were used
        self.assertEqual(transaction_1.aud_amount, expected_aud_1)
        self.assertEqual(transaction_2.aud_amount, expected_aud_2)
        self.assertNotEqual(transaction_1.aud_amount, transaction_2.aud_amount, "Different dates should use different rates")
        
        # Verify exchange rates are different
        self.assertAlmostEqual(float(transaction_1.exchange_rate_to_aud), float(expected_rate_1), places=6)
        self.assertAlmostEqual(float(transaction_2.exchange_rate_to_aud), float(expected_rate_2), places=6)
        self.assertNotEqual(transaction_1.exchange_rate_to_aud, transaction_2.exchange_rate_to_aud)

    def test_missing_exchange_rate_handling(self):
        """Test handling of transactions with currencies that have no available exchange rates."""
        transaction = Transaction.objects.create(
            user=self.user,
            transaction_date=self.test_date_1,
            description='Unknown currency transaction',
            original_amount=Decimal('100.00'),
            original_currency='XYZ',  # Non-existent currency
            direction='DEBIT'
        )
        
        # Process the transaction
        result = transaction.update_aud_amount_if_needed()
        
        # Refresh from database
        transaction.refresh_from_db()
        
        # Verify graceful handling
        self.assertFalse(result, "Transaction with missing rate should return False")
        self.assertIsNone(transaction.aud_amount, "AUD amount should remain None")
        self.assertIsNone(transaction.exchange_rate_to_aud, "Exchange rate should remain None")
        self.assertEqual(transaction.original_currency, 'XYZ')

    def test_future_date_transaction_handling(self):
        """Test handling of transactions with dates that have no nearby exchange rates."""
        # Create transaction with date far in the future (beyond MAX_DAYS_GAP)
        future_date = self.test_date_1 + timedelta(days=250)
        
        transaction = Transaction.objects.create(
            user=self.user,
            transaction_date=future_date,
            description='Future date transaction',
            original_amount=Decimal('100.00'),
            original_currency='USD',
            direction='DEBIT'
        )
        
        # Process the transaction
        result = transaction.update_aud_amount_if_needed()
        
        # Refresh from database
        transaction.refresh_from_db()
        
        # Verify graceful handling
        self.assertFalse(result, "Transaction with future date should return False")
        self.assertIsNone(transaction.aud_amount, "AUD amount should remain None for future dates")
        self.assertIsNone(transaction.exchange_rate_to_aud, "Exchange rate should remain None for future dates")

    def test_zero_amount_transaction_processing(self):
        """Test processing of transactions with zero amounts."""
        transaction = Transaction.objects.create(
            user=self.user,
            transaction_date=self.test_date_1,
            description='Zero amount transaction',
            original_amount=Decimal('0.00'),
            original_currency='USD',
            direction='DEBIT'
        )
        
        # Process the transaction
        result = transaction.update_aud_amount_if_needed()
        
        # Refresh from database
        transaction.refresh_from_db()
        
        # Verify results
        self.assertTrue(result, "Zero amount transaction should process successfully")
        self.assertEqual(transaction.aud_amount, Decimal('0.00'))
        self.assertIsNotNone(transaction.exchange_rate_to_aud)

    def test_force_recalculation_behavior(self):
        """Test force recalculation behavior when AUD amount already exists."""
        transaction = Transaction.objects.create(
            user=self.user,
            transaction_date=self.test_date_1,
            description='Force recalc test',
            original_amount=Decimal('100.00'),
            original_currency='USD',
            direction='DEBIT'
        )
        
        # First processing
        result_1 = transaction.update_aud_amount_if_needed()
        transaction.refresh_from_db()
        original_aud_amount = transaction.aud_amount
        original_exchange_rate = transaction.exchange_rate_to_aud
        
        self.assertTrue(result_1)
        self.assertIsNotNone(original_aud_amount)
        
        # Second processing without force (should skip)
        result_2 = transaction.update_aud_amount_if_needed(force_recalculation=False)
        transaction.refresh_from_db()
        
        self.assertTrue(result_2)
        self.assertEqual(transaction.aud_amount, original_aud_amount, "Should not recalculate without force")
        self.assertEqual(transaction.exchange_rate_to_aud, original_exchange_rate)
        
        # Third processing with force (should recalculate)
        result_3 = transaction.update_aud_amount_if_needed(force_recalculation=True)
        transaction.refresh_from_db()
        
        self.assertTrue(result_3)
        # Should get same result since rate hasn't changed
        self.assertEqual(transaction.aud_amount, original_aud_amount)
        self.assertEqual(transaction.exchange_rate_to_aud, original_exchange_rate)

    def test_signed_amount_properties(self):
        """Test the signed amount properties work correctly with currency conversion."""
        # Test DEBIT transaction (should be negative)
        debit_transaction = Transaction.objects.create(
            user=self.user,
            transaction_date=self.test_date_1,
            description='Debit transaction',
            original_amount=Decimal('100.00'),
            original_currency='USD',
            direction='DEBIT'
        )
        
        debit_transaction.update_aud_amount_if_needed()
        debit_transaction.refresh_from_db()
        
        # Test CREDIT transaction (should be positive)
        credit_transaction = Transaction.objects.create(
            user=self.user,
            transaction_date=self.test_date_1,
            description='Credit transaction',
            original_amount=Decimal('100.00'),
            original_currency='USD',
            direction='CREDIT'
        )
        
        credit_transaction.update_aud_amount_if_needed()
        credit_transaction.refresh_from_db()
        
        # Verify signed amounts
        self.assertEqual(debit_transaction.signed_original_amount, Decimal('-100.00'))
        self.assertEqual(credit_transaction.signed_original_amount, Decimal('100.00'))
        
        # Verify signed AUD amounts
        self.assertLess(debit_transaction.signed_aud_amount, Decimal('0'))
        self.assertGreater(credit_transaction.signed_aud_amount, Decimal('0'))
        self.assertEqual(abs(debit_transaction.signed_aud_amount), credit_transaction.signed_aud_amount)

    def test_cross_currency_conversion_integration(self):
        """Test integration with cross-currency conversion scenarios."""
        # Test a currency that might require cross-currency conversion
        # CHF transaction (uses direct AUD->CHF rate for conversion)
        transaction = Transaction.objects.create(
            user=self.user,
            transaction_date=self.test_date_1,
            description='CHF transaction',
            original_amount=Decimal('75.00'),
            original_currency='CHF',
            direction='DEBIT'
        )
        
        # Process the transaction
        result = transaction.update_aud_amount_if_needed()
        
        # Refresh from database
        transaction.refresh_from_db()
        
        # Verify results
        self.assertTrue(result, "CHF transaction processing should succeed")
        
        # CHF 75.00 should convert to AUD using rate: 1 CHF = (1/0.6200) AUD = ~1.6129 AUD
        # So 75 CHF = 75 * 1.6129 = ~120.97 AUD
        expected_chf_to_aud_rate = Decimal('1') / Decimal('0.6200')
        expected_aud_amount = (Decimal('75.00') * expected_chf_to_aud_rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
        
        self.assertEqual(transaction.aud_amount, expected_aud_amount)
        self.assertAlmostEqual(float(transaction.exchange_rate_to_aud), float(expected_chf_to_aud_rate), places=6)
        self.assertEqual(transaction.original_currency, 'CHF') 