# transactions/models.py
from decimal import Decimal, ROUND_HALF_UP
from django.db import models
from django.conf import settings # To reference the User model safely
from integrations.services import get_historical_exchange_rate # For the new model method
import logging # For logging in the new method

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
        Does not attempt conversion for future-dated transactions via get_historical_exchange_rate.
        """
        if not force_recalculation and self.aud_amount is not None:
            logger.debug(f"Transaction {self.id}: AUD amount already exists and force_recalculation is false. Skipping.")
            return True # Indicates AUD amount is present

        logger.info(f"Transaction {self.id}: Attempting to update AUD amount. Original: {self.original_amount} {self.original_currency}. Date: {self.transaction_date}")

        if self.original_currency.upper() == BASE_CURRENCY_FOR_CONVERSION:
            self.aud_amount = self.original_amount
            self.exchange_rate_to_aud = Decimal("1.0")
            logger.info(f"Transaction {self.id}: Original currency is BASE ({BASE_CURRENCY_FOR_CONVERSION}). Set aud_amount to {self.aud_amount}.")
        else:
            # get_historical_exchange_rate now handles future date check internally
            rate = get_historical_exchange_rate(
                self.transaction_date.strftime('%Y-%m-%d'),
                self.original_currency,
                BASE_CURRENCY_FOR_CONVERSION
            )
            if rate is not None:
                self.aud_amount = (self.original_amount * rate).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                self.exchange_rate_to_aud = rate
                logger.info(f"Transaction {self.id}: Converted to AUD. Rate: {rate}, AUD Amount: {self.aud_amount}.")
            else:
                # Rate fetch failed (could be future date, API error, or rate not available)
                # We leave aud_amount and exchange_rate_to_aud as they were (likely None if new)
                # or unchanged if force_recalculation was true on an existing converted amount that now fails.
                # If force_recalculation was true and it fails, we might want to nullify existing aud_amount.
                # For now, if rate is None, we don't change existing aud_amount unless it was None initially.
                if self.aud_amount is None: # Only log error if it was genuinely missing and failed to be set
                    logger.warning(f"Transaction {self.id}: Failed to fetch exchange rate for {self.original_currency} to {BASE_CURRENCY_FOR_CONVERSION} on {self.transaction_date}. AUD amount remains None.")
                elif force_recalculation: # If forcing and it fails, log and potentially nullify
                    logger.warning(f"Transaction {self.id}: Forced recalculation failed for {self.original_currency} to {BASE_CURRENCY_FOR_CONVERSION} on {self.transaction_date}. AUD amount not updated from {self.aud_amount}.")
                    # Decide if self.aud_amount should be set to None here if force_recalculation fails
                    # For now, it leaves the old value. To nullify: 
                    # self.aud_amount = None
                    # self.exchange_rate_to_aud = None
        
        # Save only if aud_amount was actually populated or changed (or forced)
        # This check avoids saving if it was already populated and not forced,
        # or if it was None and failed to populate.
        # More precise: save if self.aud_amount is not None AND (was None before or force_recalculation)
        # Simpler: save if values were potentially set. A more robust check would compare old vs new values.
        if self.aud_amount is not None: # If it got successfully populated or was already populated and forced.
             try:
                 # Only save fields that could have been modified by this method
                 self.save(update_fields=['aud_amount', 'exchange_rate_to_aud', 'updated_at'])
                 logger.debug(f"Transaction {self.id}: Saved updated AUD amount and exchange rate.")
                 return True
             except Exception as e:
                 logger.error(f"Transaction {self.id}: Failed to save updated AUD amount: {e}")
                 return False # Save failed
        elif force_recalculation: # If forced but failed, it might still be None
             logger.debug(f"Transaction {self.id}: AUD amount is None after failed forced recalculation. Not saved.")
             return False
        else: # Was None and remained None
            logger.debug(f"Transaction {self.id}: AUD amount is None and was not updated. Not saved.")
            return False # AUD amount is not populated

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