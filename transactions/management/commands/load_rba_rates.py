import csv
import os
from datetime import datetime
from decimal import Decimal, InvalidOperation

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from transactions.models import HistoricalExchangeRate, Transaction

class Command(BaseCommand):
    help = 'Loads historical exchange rates from f11-data.csv into the HistoricalExchangeRate table.'

    # Define the row indices (0-based) for key parts of the CSV
    UNITS_ROW_INDEX = 5  # Row containing "Units" like USD, JPY (target currencies)
    DATA_START_ROW_INDEX = 12 # First row of actual date/rate data

    def handle(self, *args, **options):
        file_path = os.path.join(settings.BASE_DIR, 'f11-data.csv')
        self.stdout.write(f"Attempting to load exchange rates from: {file_path}")

        if not os.path.exists(file_path):
            raise CommandError(f"Error: The file f11-data.csv was not found at {file_path}")

        rates_to_create = []
        created_count = 0
        skipped_count = 0
        
        try:
            with open(file_path, 'r', encoding='utf-8-sig') as csvfile: # utf-8-sig to handle potential BOM
                reader = csv.reader(csvfile)
                all_rows = list(reader)

            if len(all_rows) <= self.DATA_START_ROW_INDEX:
                raise CommandError("CSV file does not have enough rows to contain data.")

            # Extract target currencies from the 'Units' row
            # Units are in row 5 (index 5), currency codes start from 2nd column (index 1)
            units_header = all_rows[self.UNITS_ROW_INDEX]
            if not units_header or len(units_header) < 2:
                 raise CommandError(f"Units header row (expected at row {self.UNITS_ROW_INDEX + 1}) is missing or too short.")
            
            # Target currencies, skipping the first column which is 'Units' label or date label for data rows
            target_currencies = units_header[1:] 

            # Data rows start from index DATA_START_ROW_INDEX
            data_rows = all_rows[self.DATA_START_ROW_INDEX:]

            for row_num, row_data in enumerate(data_rows, start=self.DATA_START_ROW_INDEX + 1):
                if not row_data or not row_data[0]: # Skip empty rows or rows without a date
                    self.stdout.write(self.style.WARNING(f"Skipping empty or dateless row {row_num}."))
                    continue
                
                try:
                    # Date is in the first column, format 'dd-Mon-YYYY'
                    date_str = row_data[0]
                    parsed_date = datetime.strptime(date_str, '%d-%b-%Y').date()
                except ValueError:
                    self.stdout.write(self.style.WARNING(f"Skipping row {row_num}: Invalid date format '{date_str}'."))
                    skipped_count += 1
                    continue

                # Rates start from the second column (index 1)
                rate_values = row_data[1:]

                for i, rate_str in enumerate(rate_values):
                    if i < len(target_currencies): # Ensure we don't go out of bounds for target_currencies
                        target_currency = target_currencies[i].strip().upper()
                        
                        # Skip "Trade-weighted Index" or other non-currency columns, and empty target currency codes
                        if not target_currency or target_currency == 'INDEX':
                            continue

                        if rate_str and rate_str.strip():
                            try:
                                rate_decimal = Decimal(rate_str.strip())
                                rates_to_create.append(
                                    HistoricalExchangeRate(
                                        date=parsed_date,
                                        source_currency='AUD', # As per RBA f11 data (A$1 = X TargetCurrency)
                                        target_currency=target_currency,
                                        rate=rate_decimal
                                    )
                                )
                            except InvalidOperation:
                                self.stdout.write(self.style.WARNING(f"Skipping rate for {target_currency} on {parsed_date}: Invalid decimal value '{rate_str}'."))
                                skipped_count +=1
                        # else: # Empty rate string, implicitly skipped
                    # else:
                        # self.stdout.write(self.style.WARNING(f"Row {row_num}, column {i+1}: More rate values than target currencies defined in header. Rate value '{rate_str}' skipped."))


            if rates_to_create:
                try:
                    with transaction.atomic():
                        # Clear existing rates before loading new ones
                        HistoricalExchangeRate.objects.all().delete()
                        self.stdout.write(self.style.SUCCESS("Successfully cleared old exchange rates."))
                        
                        HistoricalExchangeRate.objects.bulk_create(rates_to_create, batch_size=500)
                        created_count = len(rates_to_create)
                        self.stdout.write(self.style.SUCCESS(f"Successfully loaded {created_count} exchange rates."))

                        # --- NEW: Trigger re-processing of all transactions ---
                        self.stdout.write(self.style.NOTICE("Attempting to re-process AUD amounts for all transactions..."))
                        processed_tx_count = 0
                        updated_tx_count = 0
                        # Fetch all transactions. For very large datasets, consider chunking.
                        all_transactions = Transaction.objects.all()
                        total_tx_to_process = all_transactions.count()
                        self.stdout.write(f"Found {total_tx_to_process} transactions to re-process.")

                        for tx in all_transactions.iterator(): # Use iterator for memory efficiency
                            try:
                                # update_aud_amount_if_needed returns True if AUD amount is populated (even if unchanged) or save was successful
                                # and False if AUD amount is None or save failed.
                                # We are interested if an actual update (save) happened or a value changed.
                                # The method itself logs details. Here we just count.
                                tx.update_aud_amount_if_needed(force_recalculation=True)
                                # To know if it was *updated*, we'd need to compare before/after or have the method return a more specific status.
                                # For now, just assume it attempted processing. The method logs success/failure of getting rate.
                                processed_tx_count += 1
                                if processed_tx_count % 100 == 0: # Log progress every 100 transactions
                                     self.stdout.write(f"Re-processed {processed_tx_count}/{total_tx_to_process} transactions...")
                            except Exception as e:
                                self.stdout.write(self.style.ERROR(f"Error re-processing transaction {tx.id}: {e}"))
                        
                        self.stdout.write(self.style.SUCCESS(f"Finished re-processing AUD amounts for {processed_tx_count} transactions."))
                        # Note: To get a count of *actually updated* transactions, update_aud_amount_if_needed would need to signal a change more explicitly.
                        # The current return value (True if aud_amount is not None) doesn't distinguish between pre-existing and newly calculated.

                except Exception as e:
                    raise CommandError(f"Database error during bulk_create, delete, or transaction re-processing: {e}")
            else:
                self.stdout.write(self.style.WARNING("No valid exchange rates found to load."))

            if skipped_count > 0:
                self.stdout.write(self.style.WARNING(f"Skipped {skipped_count} invalid or problematic entries during parsing."))

        except FileNotFoundError:
            raise CommandError(f"Error: The file f11-data.csv was not found at {file_path}")
        except IndexError as e:
            raise CommandError(f"Error parsing CSV structure. Possible malformed CSV or incorrect row/column indexing: {e}")
        except Exception as e:
            raise CommandError(f"An unexpected error occurred: {e}") 