import csv
import os
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from transactions.models import HistoricalExchangeRate, Transaction

class Command(BaseCommand):
    help = 'Loads historical exchange rates from exchange_rates.csv (ECB data) into the HistoricalExchangeRate table.'

    def extract_currency_code(self, header):
        """
        Extract currency code from ECB header format.
        Examples:
        - "Australian dollar/Euro (EXR.M.AUD.EUR.SP00.E)" -> "AUD"
        - "US dollar/Euro (EXR.M.USD.EUR.SP00.E)" -> "USD"
        - "Japanese yen/Euro (EXR.M.JPY.EUR.SP00.E)" -> "JPY"
        """
        # Look for pattern like (EXR.M.CCC.EUR.SP00.E) where CCC is the currency code
        match = re.search(r'\(EXR\.M\.([A-Z]{3})\.EUR\.SP00\.[AE]\)', header)
        if match:
            return match.group(1)
        
        # Fallback: try to find 3-letter currency codes in the header
        currency_match = re.search(r'\b([A-Z]{3})\b', header)
        if currency_match:
            return currency_match.group(1)
        
        return None

    def handle(self, *args, **options):
        file_path = os.path.join(settings.BASE_DIR, 'exchange_rates.csv')
        self.stdout.write(f"Attempting to load ECB exchange rates from: {file_path}")

        if not os.path.exists(file_path):
            raise CommandError(f"Error: The file exchange_rates.csv was not found at {file_path}")

        rates_to_create = []
        created_count = 0
        skipped_count = 0
        aud_eur_rates = {}  # Store AUD/EUR rates for base currency conversion
        
        try:
            with open(file_path, 'r', encoding='utf-8-sig') as csvfile:
                reader = csv.reader(csvfile)
                all_rows = list(reader)

            if len(all_rows) <= 1:
                raise CommandError("CSV file does not have enough rows to contain data.")

            # Extract header row (first row contains Date and currency pair descriptions)
            header_row = all_rows[0]
            if not header_row or len(header_row) < 2:
                raise CommandError("Header row is missing or too short.")
            
            # Extract currency codes from descriptive headers
            # Skip first column (DATE), second column (TIME PERIOD) 
            currency_codes = []
            header_map = {}  # Map column index to currency code
            seen_currencies = set()  # Track currencies we've already processed
            
            for i, header in enumerate(header_row[2:], start=2):  # Start from column 2 (index 2)
                currency_code = self.extract_currency_code(header)
                if currency_code and currency_code not in seen_currencies:
                    currency_codes.append(currency_code)
                    header_map[i] = currency_code
                    seen_currencies.add(currency_code)
                    self.stdout.write(f"Column {i}: {header[:50]}... -> {currency_code}")
                elif currency_code and currency_code in seen_currencies:
                    self.stdout.write(self.style.WARNING(f"Skipping duplicate currency {currency_code} in column {i}"))
                else:
                    self.stdout.write(self.style.WARNING(f"Could not extract currency from header: {header[:50]}..."))

            # Find AUD column for base currency conversion
            aud_column = None
            for col_idx, currency in header_map.items():
                if currency == 'AUD':
                    aud_column = col_idx
                    break
            
            if aud_column is None:
                raise CommandError("AUD currency not found in ECB data. Cannot maintain AUD as base currency.")

            self.stdout.write(f"Found {len(currency_codes)} currencies in ECB data")
            self.stdout.write(f"AUD column found at index {aud_column}")

            # Data rows start from index 1 (after header)
            data_rows = all_rows[1:]
            self.stdout.write(f"Processing {len(data_rows)} data rows...")

            # First pass: collect AUD/EUR rates for conversion
            for row_num, row_data in enumerate(data_rows, start=2):
                if not row_data or not row_data[0]:
                    continue
                
                try:
                    # Date format: YYYY-MM-DD
                    date_str = row_data[0]
                    parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                    
                    # Get AUD rate (EUR to AUD) from the correct column
                    if len(row_data) > aud_column and row_data[aud_column]:
                        aud_rate_str = row_data[aud_column].strip()
                        if aud_rate_str:
                            try:
                                aud_eur_rate = Decimal(aud_rate_str)
                                aud_eur_rates[parsed_date] = aud_eur_rate
                            except InvalidOperation:
                                pass
                except ValueError:
                    continue

            self.stdout.write(f"Collected {len(aud_eur_rates)} AUD/EUR conversion rates")

            # Second pass: process all currencies with AUD as base
            for row_num, row_data in enumerate(data_rows, start=2):
                if not row_data or not row_data[0]:
                    self.stdout.write(self.style.WARNING(f"Skipping empty or dateless row {row_num}."))
                    continue
                
                try:
                    # Date format: YYYY-MM-DD
                    date_str = row_data[0]
                    parsed_date = datetime.strptime(date_str, '%Y-%m-%d').date()
                except ValueError:
                    self.stdout.write(self.style.WARNING(f"Skipping row {row_num}: Invalid date format '{date_str}'."))
                    skipped_count += 1
                    continue

                # Get AUD/EUR rate for this date
                if parsed_date not in aud_eur_rates:
                    self.stdout.write(self.style.WARNING(f"Skipping {parsed_date}: No AUD/EUR rate available for base currency conversion."))
                    skipped_count += 1
                    continue
                
                aud_eur_rate = aud_eur_rates[parsed_date]

                # Process each currency column
                for col_idx, target_currency in header_map.items():
                    # Skip AUD (can't convert AUD to AUD)
                    if target_currency == 'AUD':
                        continue
                    
                    if len(row_data) > col_idx and row_data[col_idx]:
                        rate_str = row_data[col_idx].strip()
                        if rate_str:
                            try:
                                # ECB rate: 1 EUR = X target_currency
                                eur_to_target_rate = Decimal(rate_str)
                                
                                # Convert to AUD base: 1 AUD = ? target_currency
                                # 1 AUD = aud_eur_rate EUR
                                # aud_eur_rate EUR = aud_eur_rate * eur_to_target_rate target_currency
                                # Therefore: 1 AUD = aud_eur_rate * eur_to_target_rate target_currency
                                aud_to_target_rate = aud_eur_rate * eur_to_target_rate
                                
                                rates_to_create.append(
                                    HistoricalExchangeRate(
                                        date=parsed_date,
                                        source_currency='AUD',
                                        target_currency=target_currency,
                                        rate=aud_to_target_rate
                                    )
                                )
                            except InvalidOperation:
                                self.stdout.write(self.style.WARNING(f"Skipping rate for {target_currency} on {parsed_date}: Invalid decimal value '{rate_str}'."))
                                skipped_count += 1

            if rates_to_create:
                try:
                    with transaction.atomic():
                        # Clear existing rates before loading new ones
                        HistoricalExchangeRate.objects.all().delete()
                        self.stdout.write(self.style.SUCCESS("Successfully cleared old exchange rates."))
                        
                        HistoricalExchangeRate.objects.bulk_create(rates_to_create, batch_size=500)
                        created_count = len(rates_to_create)
                        self.stdout.write(self.style.SUCCESS(f"Successfully loaded {created_count} exchange rates with AUD as base currency."))

                        # Re-process all transactions with new rates
                        self.stdout.write(self.style.NOTICE("Re-processing AUD amounts for all transactions..."))
                        processed_tx_count = 0
                        
                        all_transactions = Transaction.objects.all()
                        total_tx_to_process = all_transactions.count()
                        self.stdout.write(f"Found {total_tx_to_process} transactions to re-process.")

                        for tx in all_transactions.iterator():
                            try:
                                tx.update_aud_amount_if_needed(force_recalculation=True)
                                processed_tx_count += 1
                                if processed_tx_count % 100 == 0:
                                    self.stdout.write(f"Re-processed {processed_tx_count}/{total_tx_to_process} transactions...")
                            except Exception as e:
                                self.stdout.write(self.style.ERROR(f"Error re-processing transaction {tx.id}: {e}"))
                        
                        self.stdout.write(self.style.SUCCESS(f"Finished re-processing AUD amounts for {processed_tx_count} transactions."))

                except Exception as e:
                    raise CommandError(f"Database error during bulk_create, delete, or transaction re-processing: {e}")
            else:
                self.stdout.write(self.style.WARNING("No valid exchange rates found to load."))

            if skipped_count > 0:
                self.stdout.write(self.style.WARNING(f"Skipped {skipped_count} invalid or problematic entries during parsing."))

        except FileNotFoundError:
            raise CommandError(f"Error: The file exchange_rates.csv was not found at {file_path}")
        except Exception as e:
            raise CommandError(f"An unexpected error occurred: {e}") 