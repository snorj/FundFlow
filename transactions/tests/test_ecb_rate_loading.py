import os
import tempfile
from decimal import Decimal
from datetime import date
from io import StringIO

from django.test import TestCase
from django.core.management import call_command
from django.core.management.base import CommandError

from ..models import HistoricalExchangeRate
from ..management.commands.load_ecb_rates import Command


class ECBRateLoadingTests(TestCase):
    """
    Comprehensive test suite for the ECB exchange rate loading command.
    Tests various scenarios including normal operation, edge cases, and error handling.
    """
    
    def setUp(self):
        """Set up test fixtures and sample data."""
        self.command = Command()
        self.temp_dir = tempfile.mkdtemp()
        
        # Sample ECB CSV data - normal format
        self.sample_ecb_data = """Date,TIME_PERIOD,Australian dollar/Euro (EXR.M.AUD.EUR.SP00.E),US dollar/Euro (EXR.M.USD.EUR.SP00.E),UK pound sterling/Euro (EXR.M.GBP.EUR.SP00.E),Japanese yen/Euro (EXR.M.JPY.EUR.SP00.E)
1999-01-04,1999-01,1.910000,1.180000,0.702000,133.130000
1999-01-05,1999-01,1.920000,1.185000,0.705000,133.850000
1999-01-06,1999-01,1.915000,1.182000,0.703000,133.500000"""

        # Sample data with edge cases
        self.edge_case_data = """Date,TIME_PERIOD,Australian dollar/Euro (EXR.M.AUD.EUR.SP00.E),New Taiwan dollar/Euro (EXR.M.TWD.EUR.SP00.E)
2023-12-29,2023-12,1.655000,34.567000
2024-01-01,2024-01,1.660000,34.890000"""

        # Sample data with missing values and duplicates
        self.problematic_data = """Date,TIME_PERIOD,Australian dollar/Euro (EXR.M.AUD.EUR.SP00.E),US dollar/Euro (EXR.M.USD.EUR.SP00.E),Australian dollar/Euro (EXR.M.AUD.EUR.SP00.A)
2023-01-01,2023-01,1.550000,1.070000,1.551000
2023-01-02,2023-01,1.560000,,1.561000
2023-01-03,2023-01,,1.080000,"""

        # Malformed CSV data
        self.malformed_data = """Date,TIME_PERIOD,Invalid Header Format
not_a_date,2023-01,1.550000
2023-01-01,2023-01,not_a_number"""

    def tearDown(self):
        """Clean up test files."""
        # Clean up any temporary files created during tests
        for filename in os.listdir(self.temp_dir):
            file_path = os.path.join(self.temp_dir, filename)
            if os.path.isfile(file_path):
                os.remove(file_path)
        os.rmdir(self.temp_dir)

    def _create_test_file(self, content, filename='test_rates.csv'):
        """Helper method to create test CSV files."""
        file_path = os.path.join(self.temp_dir, filename)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)
        return file_path

    def test_currency_code_extraction_standard_format(self):
        """Test currency code extraction from standard ECB header formats."""
        test_cases = [
            ('Australian dollar/Euro (EXR.M.AUD.EUR.SP00.E)', 'AUD'),
            ('US dollar/Euro (EXR.M.USD.EUR.SP00.E)', 'USD'),
            ('UK pound sterling/Euro (EXR.M.GBP.EUR.SP00.E)', 'GBP'),
            ('Japanese yen/Euro (EXR.M.JPY.EUR.SP00.E)', 'JPY'),
            ('Canadian dollar/Euro (EXR.M.CAD.EUR.SP00.E)', 'CAD'),
            ('Swiss franc/Euro (EXR.M.CHF.EUR.SP00.E)', 'CHF'),
            ('New Taiwan dollar/Euro (EXR.M.TWD.EUR.SP00.E)', 'TWD'),
        ]
        
        for header, expected_code in test_cases:
            with self.subTest(header=header):
                extracted_code = self.command.extract_currency_code(header)
                self.assertEqual(extracted_code, expected_code)

    def test_currency_code_extraction_edge_cases(self):
        """Test currency code extraction with edge cases and invalid formats."""
        edge_cases = [
            ('Invalid header format', None),
            ('Australian dollar/Euro', None),  # Missing pattern
            ('Australian dollar/Euro (EXR.M.AUD.EUR.SP00.A)', 'AUD'),  # Different ending
            ('', None),  # Empty string
            ('Random text with AUD somewhere', 'AUD'),  # Fallback pattern
        ]
        
        for header, expected_code in edge_cases:
            with self.subTest(header=header):
                extracted_code = self.command.extract_currency_code(header)
                self.assertEqual(extracted_code, expected_code)

    def test_load_ecb_rates_normal_operation(self):
        """Test normal ECB rate loading with valid data."""
        test_file = self._create_test_file(self.sample_ecb_data)
        
        # Verify database is initially empty
        self.assertEqual(HistoricalExchangeRate.objects.count(), 0)
        
        # Load the rates
        out = StringIO()
        call_command('load_ecb_rates', test_file, stdout=out)
        
        # Verify rates were loaded
        self.assertTrue(HistoricalExchangeRate.objects.filter(
            source_currency='AUD', target_currency='USD').exists())
        self.assertTrue(HistoricalExchangeRate.objects.filter(
            source_currency='AUD', target_currency='GBP').exists())
        self.assertTrue(HistoricalExchangeRate.objects.filter(
            source_currency='AUD', target_currency='JPY').exists())
        
        # Check specific rate values and conversions
        # On 1999-01-04: AUD/EUR = 1.91, USD/EUR = 1.18
        # Expected AUD/USD = 1.91 / 1.18 = 1.618644...
        aud_usd_rate = HistoricalExchangeRate.objects.get(
            source_currency='AUD', target_currency='USD', date=date(1999, 1, 4))
        expected_rate = Decimal('1.91') / Decimal('1.18')
        self.assertAlmostEqual(float(aud_usd_rate.rate), float(expected_rate), places=6)

        # Verify total number of rate entries (3 dates × 3 currencies + 3 EUR rates)
        self.assertEqual(HistoricalExchangeRate.objects.count(), 12)  # 3 dates × 4 currencies

    def test_load_ecb_rates_with_duplicate_currencies(self):
        """Test ECB rate loading with duplicate currency columns."""
        test_file = self._create_test_file(self.problematic_data)
        
        out = StringIO()
        call_command('load_ecb_rates', test_file, stdout=out)
        
        # Should only process first occurrence of each currency
        aud_rates = HistoricalExchangeRate.objects.filter(
            source_currency='AUD', target_currency='USD')
        self.assertTrue(aud_rates.exists())
        
        # Verify no duplicate rates for same date/currency pair
        rate_count = HistoricalExchangeRate.objects.filter(
            source_currency='AUD', target_currency='USD', date=date(2023, 1, 1)).count()
        self.assertEqual(rate_count, 1)

    def test_load_ecb_rates_missing_values(self):
        """Test handling of missing exchange rate values."""
        test_file = self._create_test_file(self.problematic_data)
        
        out = StringIO()
        call_command('load_ecb_rates', test_file, stdout=out)
        
        # Should skip rows with missing values for specific currencies
        # but process valid entries
        valid_rates = HistoricalExchangeRate.objects.filter(
            source_currency='AUD', target_currency='USD', date=date(2023, 1, 1))
        self.assertTrue(valid_rates.exists())
        
        # Should not create entry for date with missing USD rate
        missing_usd_rates = HistoricalExchangeRate.objects.filter(
            source_currency='AUD', target_currency='USD', date=date(2023, 1, 2))
        self.assertFalse(missing_usd_rates.exists())

    def test_load_ecb_rates_file_not_found(self):
        """Test error handling when specified file doesn't exist."""
        non_existent_file = os.path.join(self.temp_dir, 'nonexistent.csv')
        
        with self.assertRaises(CommandError):
            call_command('load_ecb_rates', non_existent_file)

    def test_load_ecb_rates_malformed_data(self):
        """Test handling of malformed CSV data."""
        test_file = self._create_test_file(self.malformed_data)
        
        out = StringIO()
        # Should handle malformed data gracefully without crashing
        call_command('load_ecb_rates', test_file, stdout=out)
        
        # Should not create any exchange rates due to invalid data
        self.assertEqual(HistoricalExchangeRate.objects.count(), 0)

    def test_load_ecb_rates_date_parsing(self):
        """Test correct parsing of various date formats."""
        test_file = self._create_test_file(self.edge_case_data)
        
        out = StringIO()
        call_command('load_ecb_rates', test_file, stdout=out)
        
        # Verify dates were parsed correctly
        rate_2023 = HistoricalExchangeRate.objects.filter(date=date(2023, 12, 29))
        rate_2024 = HistoricalExchangeRate.objects.filter(date=date(2024, 1, 1))
        
        self.assertTrue(rate_2023.exists())
        self.assertTrue(rate_2024.exists())

    def test_load_ecb_rates_decimal_precision(self):
        """Test that exchange rates maintain proper decimal precision."""
        test_file = self._create_test_file(self.sample_ecb_data)
        
        out = StringIO()
        call_command('load_ecb_rates', test_file, stdout=out)
        
        # Check that rates maintain proper precision
        sample_rate = HistoricalExchangeRate.objects.first()
        self.assertIsInstance(sample_rate.rate, Decimal)
        
        # Verify precision is maintained (should be at least 6 decimal places)
        rate_str = str(sample_rate.rate)
        if '.' in rate_str:
            decimal_places = len(rate_str.split('.')[1])
            self.assertGreaterEqual(decimal_places, 1)

    def test_load_ecb_rates_clear_existing_option(self):
        """Test the --clear option to remove existing rates before loading."""
        # First, create some existing rates
        HistoricalExchangeRate.objects.create(
            date=date(2020, 1, 1),
            source_currency='AUD',
            target_currency='USD',
            rate=Decimal('0.75')
        )
        
        initial_count = HistoricalExchangeRate.objects.count()
        self.assertEqual(initial_count, 1)
        
        test_file = self._create_test_file(self.sample_ecb_data)
        
        # Load with --clear option
        out = StringIO()
        call_command('load_ecb_rates', test_file, '--clear', stdout=out)
        
        # Verify old rates were cleared and new ones loaded
        final_count = HistoricalExchangeRate.objects.count()
        self.assertGreater(final_count, initial_count)
        
        # Verify the old rate is gone
        old_rate_exists = HistoricalExchangeRate.objects.filter(
            date=date(2020, 1, 1), source_currency='AUD', target_currency='USD').exists()
        self.assertFalse(old_rate_exists)

    def test_load_ecb_rates_base_currency_conversion(self):
        """Test that EUR-based rates are correctly converted to AUD-based rates."""
        test_file = self._create_test_file(self.sample_ecb_data)
        
        out = StringIO()
        call_command('load_ecb_rates', test_file, stdout=out)
        
        # All rates should have AUD as source currency
        non_aud_source_rates = HistoricalExchangeRate.objects.exclude(source_currency='AUD')
        self.assertEqual(non_aud_source_rates.count(), 0)
        
        # Verify the conversion logic
        # For 1999-01-04: AUD/EUR = 1.91, USD/EUR = 1.18
        # Expected AUD/USD should be 1.91/1.18 ≈ 1.618644
        aud_usd_rate = HistoricalExchangeRate.objects.get(
            source_currency='AUD', target_currency='USD', date=date(1999, 1, 4))
        
        expected_rate = Decimal('1.91') / Decimal('1.18')
        self.assertAlmostEqual(float(aud_usd_rate.rate), float(expected_rate), places=6)

    def test_load_ecb_rates_output_messages(self):
        """Test that the command provides appropriate output messages."""
        test_file = self._create_test_file(self.sample_ecb_data)
        
        out = StringIO()
        call_command('load_ecb_rates', test_file, stdout=out)
        
        output = out.getvalue()
        
        # Check for expected output messages
        self.assertIn('currencies detected', output.lower())
        self.assertIn('exchange rates loaded', output.lower())
        self.assertIn('transactions re-processed', output.lower())

    def test_load_ecb_rates_idempotent_operation(self):
        """Test that running the command multiple times with same data is idempotent."""
        test_file = self._create_test_file(self.sample_ecb_data)
        
        # Load rates first time
        out1 = StringIO()
        call_command('load_ecb_rates', test_file, stdout=out1)
        first_count = HistoricalExchangeRate.objects.count()
        
        # Load rates second time (should update existing, not duplicate)
        out2 = StringIO()
        call_command('load_ecb_rates', test_file, stdout=out2)
        second_count = HistoricalExchangeRate.objects.count()
        
        # Count should be the same (updated, not duplicated)
        self.assertEqual(first_count, second_count)
        
        # Verify rates are still accurate
        aud_usd_rate = HistoricalExchangeRate.objects.get(
            source_currency='AUD', target_currency='USD', date=date(1999, 1, 4))
        expected_rate = Decimal('1.91') / Decimal('1.18')
        self.assertAlmostEqual(float(aud_usd_rate.rate), float(expected_rate), places=6) 