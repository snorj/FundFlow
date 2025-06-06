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

    def add_arguments(self, parser):
        parser.add_argument(
            'file_path', 
            nargs='?', 
            default=None,
            help='Path to the ECB exchange rates CSV file (default: exchange_rates.csv in project root)'
        )
        parser.add_argument(
            '--clear',
            action='store_true',
            help='Clear existing exchange rates before loading new ones'
        )

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
        # Determine file path
        if options['file_path']:
            file_path = options['file_path']
        else:
            file_path = os.path.join(settings.BASE_DIR, 'exchange_rates.csv')
            
        self.stdout.write(f"Attempting to load ECB exchange rates from: {file_path}")

        if not os.path.exists(file_path):
            raise CommandError(f"Error: The file {os.path.basename(file_path)} was not found at {file_path}")

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
                self.stdout.write(self.style.WARNING("AUD currency not found in ECB data. Cannot maintain AUD as base currency."))
                self.stdout.write(self.style.WARNING("No valid exchange rates found to load."))
                return

            self.stdout.write(f"Found {len(currency_codes)} currencies detected in ECB data")
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
                for col_idx, currency_code in header_map.items():
                    # Skip AUD (can't convert AUD to AUD)
                    if currency_code == 'AUD':
                        continue
                    
                    if col_idx < len(row_data):
                        rate_str = row_data[col_idx].strip()
                        
                        if not rate_str or rate_str.lower() in ['', 'n/a', 'na', '-']:
                            if options['verbosity'] >= 2:
                                self.stdout.write(f"  Skipping {currency_code}: empty value")
                            continue
                        
                        try:
                            # For non-EUR currencies, convert via EUR
                            # ECB rate: 1 EUR = X target_currency  
                            eur_to_target_rate = Decimal(rate_str)
                            
                            # Convert to AUD base: 1 AUD = ? target_currency
                            # AUD/EUR rate tells us: 1 EUR = aud_eur_rate AUD
                            # EUR/target rate tells us: 1 EUR = eur_to_target_rate target_currency
                            # Therefore: 1 AUD = (1/aud_eur_rate) EUR = (1/aud_eur_rate) * eur_to_target_rate target_currency
                            # Simplified: 1 AUD = eur_to_target_rate / aud_eur_rate target_currency
                            aud_to_target_rate = eur_to_target_rate / aud_eur_rate
                            
                            if options['verbosity'] >= 2:
                                self.stdout.write(f"  Converting {currency_code}: EUR rate = {eur_to_target_rate}, AUD rate = {aud_to_target_rate}")
                            
                            # Create the rate record
                            rates_to_create.append(HistoricalExchangeRate(
                                date=parsed_date,
                                source_currency='AUD',
                                target_currency=currency_code,
                                rate=aud_to_target_rate
                            ))
                            
                        except (ValueError, InvalidOperation) as e:
                            if options['verbosity'] >= 1:
                                self.stdout.write(
                                    self.style.WARNING(f"Skipping invalid rate for {currency_code} on {parsed_date}: {rate_str} ({e})")
                                )
                            continue
                
                # Also create EUR rate from AUD/EUR data
                # This ensures EUR is available as a target currency
                # Note: aud_eur_rate from CSV means "1 EUR = aud_eur_rate AUD"
                # But we need to store "1 AUD = ? EUR", so we use the inverse
                aud_to_eur_rate = Decimal('1') / aud_eur_rate
                
                if options['verbosity'] >= 2:
                    self.stdout.write(f"  Adding EUR rate: 1 AUD = {aud_to_eur_rate} EUR (inverse of {aud_eur_rate})")
                
                rates_to_create.append(HistoricalExchangeRate(
                    date=parsed_date,
                    source_currency='AUD',
                    target_currency='EUR',
                    rate=aud_to_eur_rate
                ))

            if rates_to_create:
                try:
                    with transaction.atomic():
                        # Conditionally clear existing rates based on --clear option
                        if options['clear']:
                            HistoricalExchangeRate.objects.all().delete()
                            self.stdout.write(self.style.SUCCESS("Successfully cleared old exchange rates."))
                        
                        # Use update_or_create for each rate to handle duplicates gracefully
                        created_count = 0
                        updated_count = 0
                        
                        for rate_obj in rates_to_create:
                            rate_instance, created = HistoricalExchangeRate.objects.update_or_create(
                                date=rate_obj.date,
                                source_currency=rate_obj.source_currency,
                                target_currency=rate_obj.target_currency,
                                defaults={'rate': rate_obj.rate}
                            )
                            if created:
                                created_count += 1
                            else:
                                updated_count += 1
                        
                        total_processed = created_count + updated_count
                        self.stdout.write(self.style.SUCCESS(f"Successfully loaded {total_processed} exchange rates with AUD as base currency - {total_processed} exchange rates loaded."))
                        if updated_count > 0:
                            self.stdout.write(self.style.NOTICE(f"Created: {created_count}, Updated: {updated_count}"))

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
                        
                        self.stdout.write(self.style.SUCCESS(f"Finished re-processing AUD amounts for {processed_tx_count} transactions - {processed_tx_count} transactions re-processed."))

                except Exception as e:
                    raise CommandError(f"Database error during rate loading or transaction re-processing: {e}")
            else:
                self.stdout.write(self.style.WARNING("No valid exchange rates found to load."))

            if skipped_count > 0:
                self.stdout.write(self.style.WARNING(f"Skipped {skipped_count} invalid or problematic entries during parsing."))

        except FileNotFoundError:
            raise CommandError(f"Error: The file exchange_rates.csv was not found at {file_path}")
        except Exception as e:
            raise CommandError(f"An unexpected error occurred: {e}") 