from decimal import Decimal
from datetime import date, timedelta
import io

from django.urls import reverse
from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from ..models import HistoricalExchangeRate, Transaction, Category, BASE_CURRENCY_FOR_CONVERSION
from ..services import get_historical_rate

User = get_user_model()

class CurrencyConversionTests(TestCase):
    def setUp(self):
        self.user1 = User.objects.create_user(username='user1', password='password123')
        self.client = APIClient()
        self.client.force_authenticate(user=self.user1)

        # Sample Exchange Rates
        HistoricalExchangeRate.objects.create(date=date(2024, 1, 1), source_currency='AUD', target_currency='USD', rate=Decimal('0.70'))
        HistoricalExchangeRate.objects.create(date=date(2024, 1, 5), source_currency='AUD', target_currency='USD', rate=Decimal('0.71'))
        HistoricalExchangeRate.objects.create(date=date(2024, 1, 10), source_currency='AUD', target_currency='USD', rate=Decimal('0.72'))
        HistoricalExchangeRate.objects.create(date=date(2024, 1, 1), source_currency='AUD', target_currency='EUR', rate=Decimal('0.60'))
        HistoricalExchangeRate.objects.create(date=date(2024, 1, 5), source_currency='AUD', target_currency='EUR', rate=Decimal('0.61'))
        HistoricalExchangeRate.objects.create(date=date(2024, 1, 10), source_currency='AUD', target_currency='EUR', rate=Decimal('0.62'))
        HistoricalExchangeRate.objects.create(date=date(2024, 1, 15), source_currency='AUD', target_currency='GBP', rate=Decimal('0.55'))
        HistoricalExchangeRate.objects.create(date=date(2023, 12, 20), source_currency='AUD', target_currency='JPY', rate=Decimal('90.00'))
        
        self.category1 = Category.objects.create(name='Test Cat 1', user=self.user1)
        self.dashboard_balance_url = reverse('dashboard-balance') # Assuming 'dashboard-balance' is the name in urls.py

    def test_get_historical_rate_aud_to_foreign_exact_date(self):
        """Test AUD to Foreign currency conversion with an exact date match."""
        rate = get_historical_rate(date(2024, 1, 5), 'AUD', 'USD')
        self.assertEqual(rate, Decimal('0.71').quantize(Decimal('1e-9')))

        rate_eur = get_historical_rate(date(2024, 1, 1), 'AUD', 'EUR')
        self.assertEqual(rate_eur, Decimal('0.60').quantize(Decimal('1e-9')))

    def test_get_historical_rate_foreign_to_aud_exact_date(self):
        """Test Foreign to AUD currency conversion (inversion) with an exact date match."""
        # USD to AUD
        expected_rate_usd_aud = (Decimal('1.0') / Decimal('0.70')).quantize(Decimal('1e-9'))
        rate_usd_aud = get_historical_rate(date(2024, 1, 1), 'USD', 'AUD')
        self.assertEqual(rate_usd_aud, expected_rate_usd_aud)

        # EUR to AUD
        expected_rate_eur_aud = (Decimal('1.0') / Decimal('0.61')).quantize(Decimal('1e-9'))
        rate_eur_aud = get_historical_rate(date(2024, 1, 5), 'EUR', 'AUD')
        self.assertEqual(rate_eur_aud, expected_rate_eur_aud)

    def test_get_historical_rate_to_self_is_one(self):
        """Test conversion from a currency to itself is 1.0."""
        self.assertEqual(get_historical_rate(date(2024, 1, 1), 'AUD', 'AUD'), Decimal('1.0'))
        self.assertEqual(get_historical_rate(date(2024, 1, 1), 'USD', 'USD'), Decimal('1.0'))
        self.assertEqual(get_historical_rate(date(2024, 1, 1), 'EUR', 'EUR'), Decimal('1.0'))

    def test_get_historical_rate_closest_past(self):
        """Test closest date logic: past rate is closer."""
        # Lookup date 2024-01-03. Rates exist for 01-01 (2 days past) and 01-05 (2 days future, but 01-01 is also 2 days).
        # The logic for equidistant currently prefers future. Let's adjust test for this specific case or make a new one for true past preference.
        # For a date like 2024-01-02, 01-01 is 1 day past, 01-05 is 3 days future. 01-01 (0.70) should be chosen.
        rate = get_historical_rate(date(2024, 1, 2), 'AUD', 'USD')
        self.assertEqual(rate, Decimal('0.70').quantize(Decimal('1e-9'))) 

    def test_get_historical_rate_closest_future(self):
        """Test closest date logic: future rate is closer."""
        # Lookup date 2024-01-08. Rates exist for 01-05 (3 days past) and 01-10 (2 days future).
        # 01-10 (0.72) should be chosen.
        rate = get_historical_rate(date(2024, 1, 8), 'AUD', 'USD')
        self.assertEqual(rate, Decimal('0.72').quantize(Decimal('1e-9')))

    def test_get_historical_rate_equidistant_prefers_future(self):
        """Test closest date logic: equidistant, future rate preferred."""
        # Lookup date 2024-01-03. Rates for AUD/USD: 01-01 (2 days past, 0.70), 01-05 (2 days future, 0.71).
        # Future rate 0.71 should be chosen.
        rate = get_historical_rate(date(2024, 1, 3), 'AUD', 'USD')
        self.assertEqual(rate, Decimal('0.71').quantize(Decimal('1e-9')))

    def test_get_historical_rate_only_past_exists(self):
        """Test when only a past rate exists within reasonable history."""
        # AUD to JPY, rate only for 2023-12-20 (90.00)
        rate = get_historical_rate(date(2024, 1, 1), 'AUD', 'JPY')
        self.assertEqual(rate, Decimal('90.00').quantize(Decimal('1e-9')))

    def test_get_historical_rate_only_future_exists(self):
        """Test when only a future rate exists."""
        # AUD to GBP, rate only for 2024-01-15 (0.55)
        rate = get_historical_rate(date(2024, 1, 1), 'AUD', 'GBP')
        self.assertEqual(rate, Decimal('0.55').quantize(Decimal('1e-9')))

    def test_get_historical_rate_no_rate_found(self):
        """Test when no rate can be found for the currency pair."""
        rate = get_historical_rate(date(2024, 1, 1), 'AUD', 'XXX') # XXX is not in our test data
        self.assertIsNone(rate)
        rate_cross_fail = get_historical_rate(date(2024, 1, 1), 'USD', 'XXX')
        self.assertIsNone(rate_cross_fail)

    def test_get_historical_rate_foreign_to_aud_closest_date(self):
        """Test Foreign to AUD conversion using closest date logic."""
        # EUR to AUD, lookup 2024-01-07. AUD/EUR rates: 01-05 (0.61, 2 days past), 01-10 (0.62, 3 days future)
        # Closest AUD/EUR is 0.61 on 01-05. Inverted: 1/0.61
        expected_rate = (Decimal('1.0') / Decimal('0.61')).quantize(Decimal('1e-9'))
        rate = get_historical_rate(date(2024, 1, 7), 'EUR', 'AUD')
        self.assertEqual(rate, expected_rate)

    def test_get_historical_rate_cross_currency_exact_date(self):
        """Test cross-currency conversion (USD to EUR) with exact date matches for underlying AUD rates."""
        # For USD to EUR on 2024-01-05:
        # USD -> AUD: rate_aud_usd is 0.71. So, USD_AUD is 1/0.71
        # AUD -> EUR: rate_aud_eur is 0.61
        # Expected: (1/0.71) * 0.61
        rate_aud_usd = Decimal('0.71')
        rate_aud_eur = Decimal('0.61')
        expected_rate = ( (Decimal('1.0') / rate_aud_usd) * rate_aud_eur ).quantize(Decimal('1e-9'))
        
        rate = get_historical_rate(date(2024, 1, 5), 'USD', 'EUR')
        self.assertEqual(rate, expected_rate)

    def test_get_historical_rate_cross_currency_closest_dates(self):
        """Test cross-currency (GBP to JPY) using closest dates for underlying AUD rates."""
        # GBP to JPY on 2024-01-01:
        # GBP -> AUD: Closest AUD/GBP is 0.55 on 2024-01-15. So GBP_AUD is 1/0.55
        # AUD -> JPY: Closest AUD/JPY is 90.00 on 2023-12-20.
        # Expected: (1/0.55) * 90.00
        rate_aud_gbp_closest = Decimal('0.55') # from 2024-01-15
        rate_aud_jpy_closest = Decimal('90.00') # from 2023-12-20

        expected_rate = ( (Decimal('1.0') / rate_aud_gbp_closest) * rate_aud_jpy_closest ).quantize(Decimal('1e-9'))
        rate = get_historical_rate(date(2024, 1, 1), 'GBP', 'JPY')
        self.assertEqual(rate, expected_rate)

    def test_get_historical_rate_cross_currency_one_leg_missing(self):
        """Test cross-currency when one leg of AUD conversion is missing."""
        # USD to XXX (AUD/XXX does not exist)
        rate = get_historical_rate(date(2024, 1, 1), 'USD', 'XXX')
        self.assertIsNone(rate)

        # XXX to USD (AUD/XXX does not exist)
        rate_rev = get_historical_rate(date(2024, 1, 1), 'XXX', 'USD')
        self.assertIsNone(rate_rev)

    # More tests will be added here for closest date logic, cross-currency, missing rates etc. 

    # --- Tests for Transaction.update_aud_amount_if_needed() ---

    def test_transaction_update_aud_amount_foreign_to_aud(self):
        """Test conversion from foreign currency to AUD on Transaction model."""
        tx = Transaction.objects.create(
            user=self.user1, transaction_date=date(2024, 1, 5),
            description='EUR Test', original_amount=Decimal('100.00'),
            original_currency='EUR', direction='DEBIT'
        )
        self.assertIsNone(tx.aud_amount)
        self.assertIsNone(tx.exchange_rate_to_aud)

        tx.update_aud_amount_if_needed()
        tx.refresh_from_db() # Ensure we have the saved values

        # Expected: EUR -> AUD on 2024-01-05. AUD/EUR rate is 0.61.
        # So, EUR/AUD rate is 1/0.61. AUD Amount = 100 * (1/0.61)
        expected_aud_rate = (Decimal('1.0') / Decimal('0.61')).quantize(Decimal('1e-9'))
        expected_aud_amount = (Decimal('100.00') * expected_aud_rate).quantize(Decimal('0.01'))
        
        self.assertEqual(tx.exchange_rate_to_aud, expected_aud_rate)
        self.assertEqual(tx.aud_amount, expected_aud_amount)

    def test_transaction_update_aud_amount_aud_is_base(self):
        """Test Transaction where original currency is already AUD."""
        tx = Transaction.objects.create(
            user=self.user1, transaction_date=date(2024, 1, 1),
            description='AUD Test', original_amount=Decimal('50.00'),
            original_currency='AUD', direction='DEBIT'
        )
        tx.update_aud_amount_if_needed()
        tx.refresh_from_db()

        self.assertEqual(tx.aud_amount, Decimal('50.00'))
        self.assertEqual(tx.exchange_rate_to_aud, Decimal('1.0'))

    def test_transaction_update_aud_amount_no_rate_found(self):
        """Test Transaction update when no exchange rate is found."""
        tx = Transaction.objects.create(
            user=self.user1, transaction_date=date(2024, 1, 1),
            description='XXX Test', original_amount=Decimal('100.00'),
            original_currency='XXX', direction='DEBIT'
        )
        tx.update_aud_amount_if_needed()
        tx.refresh_from_db()

        self.assertIsNone(tx.aud_amount)
        self.assertIsNone(tx.exchange_rate_to_aud)

    def test_transaction_update_aud_amount_force_recalculation(self):
        """Test force_recalculation flag."""
        tx = Transaction.objects.create(
            user=self.user1, transaction_date=date(2024, 1, 1),
            description='USD to AUD initial', original_amount=Decimal('10.00'),
            original_currency='USD', direction='DEBIT',
            aud_amount=Decimal('999.99'), # Deliberately wrong initial value
            exchange_rate_to_aud=Decimal('99.99') # Deliberately wrong
        )
        
        # Call without force, should not change
        tx.update_aud_amount_if_needed()
        tx.refresh_from_db()
        self.assertEqual(tx.aud_amount, Decimal('999.99'))
        self.assertEqual(tx.exchange_rate_to_aud, Decimal('99.99'))

        # Call with force, should recalculate
        tx.update_aud_amount_if_needed(force_recalculation=True)
        tx.refresh_from_db()

        expected_aud_rate = (Decimal('1.0') / Decimal('0.70')).quantize(Decimal('1e-9'))
        expected_aud_amount = (Decimal('10.00') * expected_aud_rate).quantize(Decimal('0.01'))
        self.assertEqual(tx.exchange_rate_to_aud, expected_aud_rate)
        self.assertEqual(tx.aud_amount, expected_aud_amount)

    # --- Tests for DashboardBalanceView API --- 

    def _create_transaction_for_balance_test(self, original_amount, original_currency, transaction_date_str, direction='DEBIT'):
        tx = Transaction.objects.create(
            user=self.user1,
            description=f'{original_currency} tx',
            original_amount=Decimal(str(original_amount)),
            original_currency=original_currency,
            transaction_date=date.fromisoformat(transaction_date_str),
            direction=direction
        )
        tx.update_aud_amount_if_needed(force_recalculation=True) # Ensure aud_amount is populated based on setUp rates
        return tx

    def test_dashboard_balance_api_aud_default(self):
        """Test balance API returns AUD balance correctly by default."""
        self._create_transaction_for_balance_test('100.00', 'AUD', '2024-01-01') # AUD 100
        self._create_transaction_for_balance_test('10.00', 'USD', '2024-01-01') # USD 10 -> AUD 10 / 0.70 = 14.29
        # Expected total AUD: 100 + (10 / 0.70) = 100 + 14.2857... = 114.29 (rounded)

        response = self.client.get(self.dashboard_balance_url)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        expected_total_balance = Decimal('100.00') + (Decimal('10.00') / Decimal('0.70'))
        self.assertAlmostEqual(Decimal(data['total_balance_in_target_currency']), expected_total_balance, places=2)
        self.assertEqual(data['target_currency_code'], 'AUD')
        self.assertEqual(data['converted_transactions_count'], 2)
        self.assertEqual(data['total_transactions_count'], 2)
        self.assertEqual(data['unconverted_transactions_count'], 0)
        self.assertIsNone(data['warning'])

    def test_dashboard_balance_api_target_usd(self):
        """Test balance API with target_currency=USD."""
        # Tx1: 50 AUD on 2024-01-01 -> 50 * 0.70 = 35 USD
        self._create_transaction_for_balance_test('50.00', 'AUD', '2024-01-01')
        # Tx2: 100 EUR on 2024-01-05. EUR->AUD: 100 / 0.61. Then AUD->USD: (100/0.61) * 0.71
        self._create_transaction_for_balance_test('100.00', 'EUR', '2024-01-05')
        # Tx3: 20 USD on 2024-01-10 -> 20 USD
        self._create_transaction_for_balance_test('20.00', 'USD', '2024-01-10')

        response = self.client.get(self.dashboard_balance_url, {'target_currency': 'USD'})
        self.assertEqual(response.status_code, 200)
        data = response.json()

        bal1_usd = Decimal('50.00') * Decimal('0.70')
        bal2_eur_in_aud = Decimal('100.00') / Decimal('0.61')
        bal2_usd = bal2_eur_in_aud * Decimal('0.71') # AUD/USD on 2024-01-05 is 0.71
        bal3_usd = Decimal('20.00')
        expected_total_balance = bal1_usd + bal2_usd + bal3_usd

        self.assertAlmostEqual(Decimal(data['total_balance_in_target_currency']), expected_total_balance, places=2)
        self.assertEqual(data['target_currency_code'], 'USD')
        self.assertEqual(data['converted_transactions_count'], 3)
        self.assertEqual(data['unconverted_transactions_count'], 0)

    def test_dashboard_balance_api_unconvertible_transaction(self):
        """Test balance API when a transaction cannot be converted."""
        self._create_transaction_for_balance_test('100.00', 'AUD', '2024-01-01') # AUD 100
        self._create_transaction_for_balance_test('5.00', 'XXX', '2024-01-01')  # Unconvertible

        response = self.client.get(self.dashboard_balance_url, {'target_currency': 'AUD'})
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertAlmostEqual(Decimal(data['total_balance_in_target_currency']), Decimal('100.00'), places=2)
        self.assertEqual(data['converted_transactions_count'], 1)
        self.assertEqual(data['unconverted_transactions_count'], 1)
        self.assertEqual(data['total_transactions_count'], 2)
        self.assertIsNotNone(data['warning'])
        self.assertIn('1 transaction(s) could not be converted', data['warning']) 

    def test_get_historical_rate_max_date_gap(self):
        """Test rate lookup with varying gaps to nearest rate."""
        # Create a rate in the middle of a date range
        mid_date = date(2024, 6, 15)
        HistoricalExchangeRate.objects.create(
            date=mid_date,
            source_currency='AUD',
            target_currency='USD',
            rate=Decimal('0.75')
        )

        # Test dates at increasing distances
        test_dates = [
            mid_date + timedelta(days=1),   # 1 day after
            mid_date + timedelta(days=7),   # 1 week after
            mid_date + timedelta(days=30),  # 1 month after
            mid_date + timedelta(days=90),  # 3 months after
        ]

        for test_date in test_dates:
            rate = get_historical_rate(test_date, 'AUD', 'USD')
            if rate is not None:
                self.assertEqual(rate, Decimal('0.75').quantize(Decimal('1e-9')))

    def test_csv_upload_with_future_dates(self):
        """Test CSV upload with transactions having future dates."""
        future_date = (date.today() + timedelta(days=5)).strftime('%Y%m%d')
        csv_content = (
            "Date,Name / Description,Account,Counterparty,Code,Debit/credit,Amount (EUR),Transaction type,Notifications\n"
            f"{future_date},Future Transaction,Account1,CP1,CODE1,DEBIT,100.00,TYPE1,\n"
        )
        
        csv_file = io.StringIO(csv_content)
        csv_file.name = 'test.csv'  # Add .name attribute which Django's File objects expect
        
        response = self.client.post(
            reverse('transaction-csv-upload'),  # Fixed URL name
            {'file': csv_file},
            format='multipart'
        )
        
        self.assertEqual(response.status_code, 201)
        created_tx = Transaction.objects.first()
        self.assertIsNone(created_tx.aud_amount)  # Future date should not have exchange rate
        self.assertIsNone(created_tx.exchange_rate_to_aud)

    def test_csv_upload_with_distant_past_dates(self):
        """Test CSV upload with transactions having dates far in the past."""
        distant_past = date(2020, 1, 1).strftime('%Y%m%d')
        csv_content = (
            "Date,Name / Description,Account,Counterparty,Code,Debit/credit,Amount (EUR),Transaction type,Notifications\n"
            f"{distant_past},Old Transaction,Account1,CP1,CODE1,DEBIT,100.00,TYPE1,\n"
        )
        
        csv_file = io.StringIO(csv_content)
        csv_file.name = 'test.csv'
        
        response = self.client.post(
            reverse('transaction-csv-upload'),  # Fixed URL name
            {'file': csv_file},
            format='multipart'
        )
        
        self.assertEqual(response.status_code, 201)
        created_tx = Transaction.objects.first()
        self.assertIsNone(created_tx.aud_amount)  # Distant past should not have exchange rate
        self.assertIsNone(created_tx.exchange_rate_to_aud)

    def test_dashboard_balance_with_unconvertible_transactions(self):
        """Test dashboard balance calculation with transactions that can't be converted."""
        # Create a transaction with a future date
        future_tx = Transaction.objects.create(
            user=self.user1,
            transaction_date=date.today() + timedelta(days=5),
            description='Future Transaction',
            original_amount=Decimal('100.00'),
            original_currency='EUR',
            direction='DEBIT'
        )

        # Create a transaction with a distant past date
        past_tx = Transaction.objects.create(
            user=self.user1,
            transaction_date=date(2020, 1, 1),
            description='Past Transaction',
            original_amount=Decimal('200.00'),
            original_currency='EUR',
            direction='DEBIT'
        )

        response = self.client.get(self.dashboard_balance_url)
        self.assertEqual(response.status_code, 200)
        data = response.json()

        self.assertEqual(data['unconverted_transactions_count'], 2)
        self.assertEqual(data['converted_transactions_count'], 0)
        self.assertEqual(data['total_transactions_count'], 2)
        self.assertIsNotNone(data['warning'])
        self.assertIn('2 transaction(s) could not be converted', data['warning']) 