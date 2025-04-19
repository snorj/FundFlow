from django.db import models
from django.conf import settings # To reference the User model safely

# Create your models here.

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
        on_delete=models.CASCADE, # If a parent is deleted, delete children? Or SET_NULL? Cascade seems reasonable for categories.
        null=True,
        blank=True,
        related_name='children', # Allows easy querying for sub-categories (e.g., category.children.all())
        help_text="Parent category for creating hierarchy. Null for top-level categories."
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE, # If user is deleted, delete their custom categories
        null=True, # Null indicates a system-wide category
        blank=True,
        help_text="User who owns this category. Null for system categories."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Categories" # Correct pluralization in Admin
        # Ensure category names are unique within the same parent for the same user
        # (or unique within the same parent for system categories where user is null)
        # Note: unique_together with nullable fields can behave differently across DBs.
        # We might rely more on API validation later if needed.
        unique_together = ('user', 'parent', 'name')
        ordering = ['name'] # Default ordering

    def __str__(self):
        # Display category hierarchy in string representation (optional)
        if self.parent:
            return f"{self.parent} > {self.name}"
        return self.name

class Transaction(models.Model):
    """
    Represents a single financial transaction uploaded or entered by a user.
    """
    DIRECTION_CHOICES = [
        ('DEBIT', 'Debit'),   # Money going out
        ('CREDIT', 'Credit'), # Money coming in
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE, # Transactions belong to a user
        related_name='transactions',
        db_index=True # Often queried by user
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL, # Keep transaction if category is deleted
        null=True, # Allow uncategorized transactions initially
        blank=True,
        related_name='transactions',
        db_index=True # Often queried by category
    )
    transaction_date = models.DateField(
        db_index=True # Often queried/sorted by date
    )
    description = models.TextField( # Use TextField for potentially longer descriptions
        help_text="Description of the transaction (e.g., merchant name, notes)."
    )
    amount = models.DecimalField(
        max_digits=12, # Max 1 billion (adjust as needed)
        decimal_places=2,
        help_text="Amount of the transaction."
    )
    direction = models.CharField(
        max_length=10,
        choices=DIRECTION_CHOICES,
        help_text="Whether the amount is a Debit (outgoing) or Credit (incoming)."
    )

    # Optional fields parsed from specific CSV format (make nullable/blank)
    source_account_identifier = models.CharField(max_length=50, null=True, blank=True)
    counterparty_identifier = models.CharField(max_length=50, null=True, blank=True)
    source_code = models.CharField(max_length=10, null=True, blank=True)
    source_type = models.CharField(max_length=50, null=True, blank=True)
    source_notifications = models.TextField(null=True, blank=True)

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-transaction_date', '-created_at'] # Show newest transactions first

    def __str__(self):
        direction_symbol = '-' if self.direction == 'DEBIT' else '+'
        return f"{self.transaction_date} | {self.user.username} | {self.description[:30]} | {direction_symbol}{self.amount}"

    # Optional property to always return signed amount if needed often
    @property
    def signed_amount(self):
        return -self.amount if self.direction == 'DEBIT' else self.amount