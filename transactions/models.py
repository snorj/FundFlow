# transactions/models.py
from decimal import Decimal, ROUND_HALF_UP
from django.db import models
from django.conf import settings # To reference the User model safely
# from .services import get_historical_rate # Import new service <-- REMOVE THIS LINE
import logging # For logging in the new method
from django.utils import timezone

logger = logging.getLogger(__name__) # Logger for model method

# Define the base currency here to avoid circular imports
BASE_CURRENCY_FOR_CONVERSION = 'AUD'

# --- Keep existing Category model ---
class Category(models.Model):
    """
    Represents a category for transactions, supporting hierarchical structures
    and distinguishing between system-defined and user-defined categories.
    """
    name = models.CharField(
        max_length=100,
        help_text="Name of the category (e.g., 'Groceries', 'Rent', 'Alcohol')."
    )
    parent = models.ForeignKey(
        'self', # Self-referencing relationship for hierarchy
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        help_text="Parent category for creating hierarchy. Null for top-level categories."
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True, # Null indicates a system-wide category
        blank=True,
        help_text="User who owns this category. Null for system categories."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Categories"
        unique_together = ('user', 'parent', 'name')
        ordering = ['name']

    def __str__(self):
        if self.parent:
            return f"{self.parent} > {self.name}"
        return self.name

class Transaction(models.Model):
    SOURCE_CHOICES = [
        ('csv', 'CSV Upload'),
        ('up_bank', 'Up Bank API'),
        ('manual', 'Manual Entry'),
        # Add other sources as needed
    ]
    DIRECTION_CHOICES = [('DEBIT', 'Debit'), ('CREDIT', 'Credit'),]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='transactions', db_index=True)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions', db_index=True)
    transaction_date = models.DateField(db_index=True)
    description = models.TextField(help_text="Description of the transaction (e.g., merchant name, notes).")

    # --- RENAMED and NEW Currency Fields ---
    original_amount = models.DecimalField( # RENAMED from 'amount'
        max_digits=12,
        decimal_places=2,
        help_text="The amount of the transaction in the original currency."
    )
    original_currency = models.CharField( # NEW Field
        max_length=3,
        db_index=True,
        help_text="ISO 4217 currency code of the original transaction (e.g., AUD, EUR)."
        # No default here, must be set during creation or migration
    )
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES) # Kept direction field
    aud_amount = models.DecimalField( # NEW Field for AUD equivalent
        max_digits=12,      # Match original_amount or adjust if needed
        decimal_places=2,
        null=True,          # Allow NULL if conversion fails or for old data
        blank=True,
        help_text="The equivalent amount of the transaction in AUD, converted using the rate on the transaction date."
    )
    exchange_rate_to_aud = models.DecimalField( # NEW Field for the rate
        max_digits=18,      # Allow for sufficient precision in exchange rates
        decimal_places=9,   # Allow for sufficient precision
        null=True,
        blank=True,
        help_text="Exchange rate used to convert original_amount to aud_amount (Original Currency to AUD)."
    )
    # --- END RENAMED and NEW Currency Fields ---

    # --- Fields from CSV/Bank (Keep as is) ---
    source_account_identifier = models.CharField(max_length=50, null=True, blank=True)
    counterparty_identifier = models.CharField(max_length=50, null=True, blank=True)
    source_code = models.CharField(max_length=10, null=True, blank=True)
    source_type = models.CharField(max_length=50, null=True, blank=True)
    source_notifications = models.TextField(null=True, blank=True)

    # --- Fields for Integration/Metadata (Keep as is) ---
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='csv', db_index=True, help_text="Source from which this transaction was created.")
    bank_transaction_id = models.CharField(max_length=255, null=True, blank=True, db_index=True, help_text="Unique transaction ID provided by the bank API (if applicable).")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-transaction_date', '-created_at']

    def __str__(self):
        # Update string representation if desired
        direction_symbol = '-' if self.direction == 'DEBIT' else '+'
        # Display original amount/currency
        orig_display = f"{direction_symbol}{self.original_amount} {self.original_currency or '???'}"
        # Optionally add AUD amount if different and available
        aud_display = ""
        if self.original_currency != 'AUD' and self.aud_amount is not None:
            aud_display = f" (~{direction_symbol}{self.aud_amount} AUD)"
        return f"{self.transaction_date} | {self.user.username} | {self.description[:30]} | {orig_display}{aud_display} ({self.source})"

    @property
    def signed_original_amount(self):
        """Returns the original amount with correct sign based on direction."""
        # Ensure original_amount is Decimal before negation
        amount = self.original_amount if isinstance(self.original_amount, Decimal) else Decimal(0)
        return -amount if self.direction == 'DEBIT' else amount

    @property
    def signed_aud_amount(self):
        """Returns the AUD amount with correct sign, or None."""
        if self.aud_amount is None:
            return None
        amount = self.aud_amount # Already Decimal
        return -amount if self.direction == 'DEBIT' else amount

    def update_aud_amount_if_needed(self, force_recalculation=False):
        """
        Calculates and updates the aud_amount and exchange_rate_to_aud fields
        if aud_amount is None or if force_recalculation is True.
        Saves the instance if changes are made.
        Uses the new get_historical_rate service.
        """
        from .services import get_historical_rate # <-- ADD IMPORT HERE

        if not force_recalculation and self.aud_amount is not None:
            logger.debug(f"Transaction {self.id}: AUD amount already exists ({self.aud_amount}) and force_recalculation is false. Skipping.")
            return True # Indicates AUD amount is present

        logger.info(f"Transaction {self.id}: Attempting to update AUD amount. Original: {self.original_amount} {self.original_currency}. Date: {self.transaction_date}")

        # Preserve current values in case of failure to find new rate during forced recalc
        original_aud_amount = self.aud_amount
        original_exchange_rate = self.exchange_rate_to_aud

        # Assume failure or no change initially
        self.aud_amount = None 
        self.exchange_rate_to_aud = None

        if self.original_currency.upper() == BASE_CURRENCY_FOR_CONVERSION:
            self.aud_amount = self.original_amount
            self.exchange_rate_to_aud = Decimal("1.0")
            logger.info(f"Transaction {self.id}: Original currency is BASE ({BASE_CURRENCY_FOR_CONVERSION}). Set aud_amount to {self.aud_amount}.")
        else:
            # Use the new service. lookup_date is self.transaction_date (which is already a date object)
            # from_currency is self.original_currency
            # to_currency is BASE_CURRENCY_FOR_CONVERSION
            fetched_rate = get_historical_rate(
                self.transaction_date, 
                self.original_currency, 
                BASE_CURRENCY_FOR_CONVERSION
            )

            if fetched_rate is not None:
                self.exchange_rate_to_aud = fetched_rate # This is the rate FROM original_currency TO AUD
                # To get aud_amount, we MULTIPLY original_amount by (original_currency_TO_AUD_rate)
                self.aud_amount = (self.original_amount * self.exchange_rate_to_aud).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                logger.info(f"Transaction {self.id}: Converted to AUD using new service. Rate ({self.original_currency}->AUD): {self.exchange_rate_to_aud}, AUD Amount: {self.aud_amount}.")
            else:
                logger.warning(f"Transaction {self.id}: Failed to fetch exchange rate for {self.original_currency} to {BASE_CURRENCY_FOR_CONVERSION} on {self.transaction_date} using new service. AUD amount will be None.")
                # If force_recalculation was true and we failed to get a new rate, 
                # we should revert to original values if they existed, otherwise keep as None.
                if force_recalculation and original_aud_amount is not None:
                    self.aud_amount = original_aud_amount
                    self.exchange_rate_to_aud = original_exchange_rate
                    logger.info(f"Transaction {self.id}: Forced recalculation failed, reverting to original AUD amount: {self.aud_amount}")
                # else, aud_amount remains None (either it was already None, or force_recalc nullified it and failed to find new)

        # Determine if a change occurred or if a value was set where previously None
        # Only save if aud_amount is now populated, or if it was forced and values changed from original.
        # Or, simpler, if aud_amount or exchange_rate_to_aud has changed from the start of the method call.
        
        should_save = False
        if self.aud_amount is not None: # A value was successfully calculated
            if original_aud_amount != self.aud_amount or original_exchange_rate != self.exchange_rate_to_aud:
                should_save = True
        elif force_recalculation and original_aud_amount is not None: # Was forced, failed, and reverted to a non-None original.
             # Check if it actually reverted or if original was also None (though aud_amount is already None here)
             # This condition is a bit tricky. If it was forced, and now aud_amount is None, but original_aud_amount was not None,
             # it implies a change (from something to None). BUT we reverted above. So we save if the current state is different than initial.
             if original_aud_amount is not None or original_exchange_rate is not None: # if there was an original value
                if self.aud_amount != original_aud_amount or self.exchange_rate_to_aud != original_exchange_rate:
                    should_save = True # Should save because it was nullified from a previous value

        if should_save:
            try:
                self.save(update_fields=['aud_amount', 'exchange_rate_to_aud', 'updated_at'])
                logger.debug(f"Transaction {self.id}: Saved updated AUD amount and exchange rate.")
                return True
            except Exception as e:
                logger.error(f"Transaction {self.id}: Failed to save updated AUD amount: {e}")
                # Revert to original values on save failure to maintain data integrity
                self.aud_amount = original_aud_amount
                self.exchange_rate_to_aud = original_exchange_rate
                return False # Save failed
        else:
            logger.debug(f"Transaction {self.id}: No changes to AUD amount or rate, or still None. Not saved. Current AUD: {self.aud_amount}")
            return self.aud_amount is not None # Return true if AUD amount is populated (even if unchanged), false if None

# --- Keep existing DescriptionMapping model ---
class DescriptionMapping(models.Model):
    # ... (DescriptionMapping model definition remains unchanged) ...
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='description_mappings'
    )
    original_description = models.TextField(
        db_index=True,
        help_text="The exact description text as it appears in uploads (e.g., CSV)."
    )
    clean_name = models.CharField(
        max_length=255,
        help_text="The user-defined clean name for this vendor/description (e.g., 'Coffee Shop')."
    )
    assigned_category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='mapped_descriptions',
        help_text="The category to automatically assign to transactions with the original description."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'original_description')
        ordering = ['original_description']
        verbose_name = "Description Mapping"
        verbose_name_plural = "Description Mappings"

    def __str__(self):
        return f"'{self.original_description}' -> '{self.clean_name}' ({self.user.username})"

# --- NEW: Model for Storing Historical Exchange Rates ---
class HistoricalExchangeRate(models.Model):
    """
    Stores historical exchange rates, primarily loaded from a CSV file.
    Rates are stored relative to a source_currency (e.g., AUD) to a target_currency.
    """
    date = models.DateField(
        db_index=True,
        help_text="The date for which this exchange rate is valid."
    )
    source_currency = models.CharField(
        max_length=3,
        db_index=True,
        help_text="The source currency code (e.g., AUD)."
    )
    target_currency = models.CharField(
        max_length=3,
        db_index=True,
        help_text="The target currency code (e.g., USD, EUR)."
    )
    rate = models.DecimalField(
        max_digits=18,  # Sufficient for various exchange rates
        decimal_places=9, # Standard for many rate providers
        help_text="The exchange rate: 1 unit of source_currency equals this many units of target_currency."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Historical Exchange Rate"
        verbose_name_plural = "Historical Exchange Rates"
        unique_together = ('date', 'source_currency', 'target_currency')
        ordering = ['-date', 'source_currency', 'target_currency'] # Most recent first

    def __str__(self):
        return f"{self.date}: 1 {self.source_currency} = {self.rate} {self.target_currency}"