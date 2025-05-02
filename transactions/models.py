# transactions/models.py
from django.db import models
from django.conf import settings # To reference the User model safely

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
    """
    Represents a single financial transaction uploaded or entered by a user.
    """
    # Choices for the new source field
    SOURCE_CHOICES = [
        ('csv', 'CSV Upload'),
        ('up_bank', 'Up Bank API'),
        # Add more sources here later if needed
    ]

    DIRECTION_CHOICES = [
        ('DEBIT', 'Debit'),
        ('CREDIT', 'Credit'),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='transactions',
        db_index=True
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transactions',
        db_index=True
    )
    transaction_date = models.DateField(db_index=True)
    description = models.TextField(
        help_text="Description of the transaction (e.g., merchant name, notes)."
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES)

    # --- Fields from CSV/Bank (Optional/Source Specific) ---
    source_account_identifier = models.CharField(max_length=50, null=True, blank=True)
    counterparty_identifier = models.CharField(max_length=50, null=True, blank=True)
    source_code = models.CharField(max_length=10, null=True, blank=True)
    source_type = models.CharField(max_length=50, null=True, blank=True)
    source_notifications = models.TextField(null=True, blank=True)

    # --- NEW FIELDS for Integration ---
    source = models.CharField(
        max_length=20,
        choices=SOURCE_CHOICES,
        default='csv', # Default to CSV for existing/manual data
        db_index=True,
        help_text="Source from which this transaction was created."
    )
    bank_transaction_id = models.CharField(
        max_length=255, # Up IDs are UUIDs (36 chars), but allow flexibility
        null=True,      # Allow null for CSV/manual transactions
        blank=True,
        db_index=True,  # Crucial for duplicate checking performance
        # unique=True,  # DO NOT add unique=True yet. Handle uniqueness in code.
        help_text="Unique transaction ID provided by the bank API (if applicable)."
    )
    # --- END NEW FIELDS ---

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-transaction_date', '-created_at']
        # Consider adding a unique_together constraint later if needed,
        # AFTER handling uniqueness in code robustly.
        # Example: unique_together = ('user', 'bank_transaction_id')
        # but requires bank_transaction_id to be non-null for the constraint.

    def __str__(self):
        direction_symbol = '-' if self.direction == 'DEBIT' else '+'
        return f"{self.transaction_date} | {self.user.username} | {self.description[:30]} | {direction_symbol}{self.amount} ({self.source})"

    @property
    def signed_amount(self):
        return -self.amount if self.direction == 'DEBIT' else self.amount

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