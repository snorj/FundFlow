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

# --- Keep existing Transaction model ---
class Transaction(models.Model):
    """
    Represents a single financial transaction uploaded or entered by a user.
    """
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
    source_account_identifier = models.CharField(max_length=50, null=True, blank=True)
    counterparty_identifier = models.CharField(max_length=50, null=True, blank=True)
    source_code = models.CharField(max_length=10, null=True, blank=True)
    source_type = models.CharField(max_length=50, null=True, blank=True)
    source_notifications = models.TextField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-transaction_date', '-created_at']

    def __str__(self):
        direction_symbol = '-' if self.direction == 'DEBIT' else '+'
        return f"{self.transaction_date} | {self.user.username} | {self.description[:30]} | {direction_symbol}{self.amount}"

    @property
    def signed_amount(self):
        return -self.amount if self.direction == 'DEBIT' else self.amount


# --- NEW DescriptionMapping Model ---
class DescriptionMapping(models.Model):
    """
    Stores user-defined rules for mapping original transaction descriptions
    to cleaner names and automatically assigning categories.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE, # Rule belongs to a user
        related_name='description_mappings'
    )
    original_description = models.TextField(
        db_index=True, # We will query based on this often
        help_text="The exact description text as it appears in uploads (e.g., CSV)."
    )
    clean_name = models.CharField(
        max_length=255,
        help_text="The user-defined clean name for this vendor/description (e.g., 'Coffee Shop')."
    )
    assigned_category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL, # Keep the rule if category is deleted, but remove link
        null=True,
        blank=True, # Category might not be assigned immediately
        related_name='mapped_descriptions',
        help_text="The category to automatically assign to transactions with the original description."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        # Ensure a user doesn't map the same original description twice
        unique_together = ('user', 'original_description')
        ordering = ['original_description']
        verbose_name = "Description Mapping"
        verbose_name_plural = "Description Mappings"

    def __str__(self):
        return f"'{self.original_description}' -> '{self.clean_name}' ({self.user.username})"