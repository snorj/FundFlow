import os
import tempfile
from datetime import date, timedelta
from decimal import Decimal
from django.test import TestCase
from django.core.management import call_command
from io import StringIO

from transactions.models import HistoricalExchangeRate, BASE_CURRENCY_FOR_CONVERSION
from transactions.services import get_historical_rate, get_closest_rate_for_pair


class HistoricalRateServiceTests(TestCase):
    """
    Comprehensive tests for the get_historical_rate service and cross-currency conversion logic.
    Tests cover direct rate lookups, cross-currency conversion via AUD, rate inversion, and error handling.
    """

    def setUp(self):
        """Set up test fixtures with comprehensive exchange rate data."""
        self.test_date_1 = date(2023, 1, 15)  # Primary test date
        self.test_date_2 = date(2023, 2, 15)  # Secondary test date 
        self.test_date_3 = date(2023, 3, 15)  # Third test date
        
        # Future date for testing gap limits
        self.future_date = date(2024, 1, 15)
        
        # Past date for testing gap limits
        self.past_date = date(2022, 1, 15)

        # Create direct AUD-based rates (AUD as source currency)
        self.create_aud_rates()
        
        # Create some non-AUD source rates to test the service's AUD-centric logic
        self.create_non_aud_rates()
        
        # Store expected values for testing
        self.setup_expected_values()

    def create_aud_rates(self):
        """Create AUD-based exchange rates for testing."""
        # AUD to major currencies on primary test date
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

        # Same currencies on secondary test date with different rates
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='USD',
            date=self.test_date_2,
            rate=Decimal('0.7200')  # 1 AUD = 0.72 USD
        )
        
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='EUR',
            date=self.test_date_2,
            rate=Decimal('0.6700')  # 1 AUD = 0.67 EUR
        )

        # Third date with a few rates for gap testing
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='USD',
            date=self.test_date_3,
            rate=Decimal('0.6900')  # 1 AUD = 0.69 USD
        )

    def create_non_aud_rates(self):
        """Create some non-AUD source rates to ensure the service works correctly."""
        # These should not be used directly by the service since it's AUD-centric
        # But they help test that the service properly queries for AUD-based rates
        HistoricalExchangeRate.objects.create(
            source_currency='USD',
            target_currency='EUR',
            date=self.test_date_1,
            rate=Decimal('0.9000')  # This should NOT be used by AUD-centric service
        )

    def setup_expected_values(self):
        """Calculate expected values for cross-currency conversions."""
        # Expected cross-currency rates for test_date_1
        # USD to EUR via AUD: (1/0.7000) * 0.6500 = 1.4286 * 0.6500 ≈ 0.9286
        self.expected_usd_to_eur = (Decimal('1') / Decimal('0.7000')) * Decimal('0.6500')
        
        # EUR to USD via AUD: (1/0.6500) * 0.7000 = 1.5385 * 0.7000 ≈ 1.0769
        self.expected_eur_to_usd = (Decimal('1') / Decimal('0.6500')) * Decimal('0.7000')
        
        # JPY to GBP via AUD: (1/95.0000) * 0.5500 = 0.0105 * 0.5500 ≈ 0.0058
        self.expected_jpy_to_gbp = (Decimal('1') / Decimal('95.0000')) * Decimal('0.5500')

    def test_fixture_creation(self):
        """Verify that test fixtures are created correctly."""
        # Check total count
        total_rates = HistoricalExchangeRate.objects.count()
        self.assertGreater(total_rates, 0, "Test fixtures should create exchange rates")
        
        # Check specific rates exist
        aud_usd_rate = HistoricalExchangeRate.objects.filter(
            source_currency='AUD', 
            target_currency='USD', 
            date=self.test_date_1
        ).first()
        self.assertIsNotNone(aud_usd_rate, "AUD/USD rate should exist for test_date_1")
        self.assertEqual(aud_usd_rate.rate, Decimal('0.7000'))
        
        # Check we have rates on multiple dates
        dates_with_rates = HistoricalExchangeRate.objects.values_list('date', flat=True).distinct()
        self.assertGreaterEqual(len(dates_with_rates), 3, "Should have rates on multiple dates")

    def test_direct_aud_to_foreign_lookup(self):
        """Test direct rate lookup when AUD is the source currency."""
        # AUD to USD
        rate = get_historical_rate(self.test_date_1, 'AUD', 'USD')
        self.assertEqual(rate, Decimal('0.7000'))
        
        # AUD to EUR
        rate = get_historical_rate(self.test_date_1, 'AUD', 'EUR')
        self.assertEqual(rate, Decimal('0.6500'))
        
        # AUD to JPY
        rate = get_historical_rate(self.test_date_1, 'AUD', 'JPY')
        self.assertEqual(rate, Decimal('95.0000'))

    def test_direct_foreign_to_aud_lookup(self):
        """Test direct rate lookup when AUD is the target currency (requires inversion)."""
        # USD to AUD (should invert 0.7000 to get ~1.4286)
        expected_usd_to_aud = Decimal('1') / Decimal('0.7000')
        rate = get_historical_rate(self.test_date_1, 'USD', 'AUD')
        self.assertAlmostEqual(float(rate), float(expected_usd_to_aud), places=6)
        
        # EUR to AUD (should invert 0.6500 to get ~1.5385)
        expected_eur_to_aud = Decimal('1') / Decimal('0.6500')
        rate = get_historical_rate(self.test_date_1, 'EUR', 'AUD')
        self.assertAlmostEqual(float(rate), float(expected_eur_to_aud), places=6)

    def test_cross_currency_conversion(self):
        """Test cross-currency conversion via AUD when no direct rate exists."""
        # USD to EUR via AUD
        rate = get_historical_rate(self.test_date_1, 'USD', 'EUR')
        self.assertIsNotNone(rate, "Cross-currency USD to EUR should return a rate")
        self.assertAlmostEqual(float(rate), float(self.expected_usd_to_eur), places=6)
        
        # EUR to USD via AUD
        rate = get_historical_rate(self.test_date_1, 'EUR', 'USD')
        self.assertIsNotNone(rate, "Cross-currency EUR to USD should return a rate")
        self.assertAlmostEqual(float(rate), float(self.expected_eur_to_usd), places=6)
        
        # JPY to GBP via AUD
        rate = get_historical_rate(self.test_date_1, 'JPY', 'GBP')
        self.assertIsNotNone(rate, "Cross-currency JPY to GBP should return a rate")
        self.assertAlmostEqual(float(rate), float(self.expected_jpy_to_gbp), places=6)

    def test_same_currency_conversion(self):
        """Test that converting a currency to itself returns 1.0."""
        rate = get_historical_rate(self.test_date_1, 'USD', 'USD')
        self.assertEqual(rate, Decimal('1.0'))
        
        rate = get_historical_rate(self.test_date_1, 'AUD', 'AUD')
        self.assertEqual(rate, Decimal('1.0'))
        
        rate = get_historical_rate(self.test_date_1, 'EUR', 'EUR')
        self.assertEqual(rate, Decimal('1.0'))

    def test_case_insensitive_currency_codes(self):
        """Test that currency codes are handled case-insensitively."""
        # Test mixed case
        rate_lower = get_historical_rate(self.test_date_1, 'aud', 'usd')
        rate_upper = get_historical_rate(self.test_date_1, 'AUD', 'USD')
        rate_mixed = get_historical_rate(self.test_date_1, 'Aud', 'Usd')
        
        self.assertEqual(rate_lower, rate_upper)
        self.assertEqual(rate_upper, rate_mixed)
        self.assertEqual(rate_lower, Decimal('0.7000'))

    def test_closest_date_selection(self):
        """Test that the service correctly selects the closest available date."""
        # Test date between test_date_1 and test_date_2
        between_date = self.test_date_1 + timedelta(days=15)  # Halfway between Jan 15 and Feb 15
        
        rate = get_historical_rate(between_date, 'AUD', 'USD')
        self.assertIsNotNone(rate, "Should find a rate even for dates between available data")
        
        # The rate should be either from test_date_1 (0.7000) or test_date_2 (0.7200)
        self.assertIn(rate, [Decimal('0.7000'), Decimal('0.7200')])

    def test_missing_rate_returns_none(self):
        """Test that missing rates return None rather than raising exceptions."""
        # Test with non-existent currency
        rate = get_historical_rate(self.test_date_1, 'AUD', 'XYZ')
        self.assertIsNone(rate, "Non-existent currency should return None")
        
        # Test with date too far in the future (beyond MAX_DAYS_GAP = 180 days)
        far_future_date = self.test_date_1 + timedelta(days=250)  # Beyond MAX_DAYS_GAP
        rate = get_historical_rate(far_future_date, 'AUD', 'USD')
        self.assertIsNone(rate, "Date too far in future should return None")
        
        # Test with date too far in the past (beyond MAX_DAYS_GAP = 180 days)
        far_past_date = self.test_date_1 - timedelta(days=250)  # Beyond MAX_DAYS_GAP
        rate = get_historical_rate(far_past_date, 'AUD', 'USD')
        self.assertIsNone(rate, "Date too far in past should return None")

    def test_decimal_precision(self):
        """Test that returned rates maintain appropriate decimal precision."""
        rate = get_historical_rate(self.test_date_1, 'AUD', 'USD')
        self.assertIsInstance(rate, Decimal, "Rate should be returned as Decimal")
        
        # Test cross-currency precision
        cross_rate = get_historical_rate(self.test_date_1, 'USD', 'EUR')
        self.assertIsInstance(cross_rate, Decimal, "Cross-currency rate should be Decimal")
        
        # Check that precision is reasonable (should have up to 9 decimal places as per service)
        rate_str = str(cross_rate)
        if '.' in rate_str:
            decimal_places = len(rate_str.split('.')[1])
            self.assertLessEqual(decimal_places, 9, "Should not exceed 9 decimal places")

    def test_get_closest_rate_for_pair_function(self):
        """Test the helper function get_closest_rate_for_pair directly."""
        # Test AUD to USD (direct)
        result = get_closest_rate_for_pair(self.test_date_1, 'AUD', 'USD', 30)
        self.assertIsNotNone(result, "Should find AUD to USD rate")
        found_date, found_rate = result
        self.assertEqual(found_rate, Decimal('0.7000'))
        self.assertEqual(found_date, self.test_date_1)
        
        # Test USD to AUD (inversion)
        result = get_closest_rate_for_pair(self.test_date_1, 'USD', 'AUD', 30)
        self.assertIsNotNone(result, "Should find USD to AUD rate via inversion")
        found_date, found_rate = result
        expected_inverted = Decimal('1') / Decimal('0.7000')
        self.assertAlmostEqual(float(found_rate), float(expected_inverted), places=6)
        
        # Test non-AUD pair (should return None as this function only handles AUD pairs)
        result = get_closest_rate_for_pair(self.test_date_1, 'USD', 'EUR', 30)
        self.assertIsNone(result, "Non-AUD pairs should return None from this helper function")

    def test_multiple_dates_closest_selection(self):
        """Test closest date selection when multiple dates are available."""
        # Create a test scenario with rates on specific dates
        test_base_date = date(2023, 6, 15)
        before_date = test_base_date - timedelta(days=5)  # June 10
        after_date = test_base_date + timedelta(days=3)   # June 18
        
        # Create rates on both dates
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='CHF',
            date=before_date,
            rate=Decimal('0.6000')
        )
        
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='CHF',
            date=after_date,
            rate=Decimal('0.6100')
        )
        
        # Test lookup exactly on base date (should pick closest)
        rate = get_historical_rate(test_base_date, 'AUD', 'CHF')
        self.assertIsNotNone(rate)
        # Should pick the after_date (3 days away) over before_date (5 days away)
        self.assertEqual(rate, Decimal('0.6100'))

    def test_edge_case_zero_rate_handling(self):
        """Test handling of zero rates (should not cause division by zero errors)."""
        # Create a zero rate (unusual but possible)
        HistoricalExchangeRate.objects.create(
            source_currency='AUD',
            target_currency='ZAR',
            date=self.test_date_1,
            rate=Decimal('0.0000')
        )
        
        # Test inversion of zero rate (ZAR to AUD should return None to avoid division by zero)
        rate = get_historical_rate(self.test_date_1, 'ZAR', 'AUD')
        self.assertIsNone(rate, "Inversion of zero rate should return None to avoid division by zero")
        
        # Test direct zero rate (AUD to ZAR should return 0)
        rate = get_historical_rate(self.test_date_1, 'AUD', 'ZAR')
        self.assertEqual(rate, Decimal('0.0000')) 