from django.db import models
from django.conf import settings
from django.contrib.auth import get_user_model

User = get_user_model()

class PlaidItem(models.Model):
    """
    Represents a Plaid Item - an item is a connection to a financial institution
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='plaid_items')
    item_id = models.CharField(max_length=255, unique=True)
    access_token = models.CharField(max_length=255)
    institution_id = models.CharField(max_length=255, null=True, blank=True)
    institution_name = models.CharField(max_length=255, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'plaid_items'

    def belongs_to_user(self, user):
        """Check if this item belongs to the given user"""
        return self.user_id == user.id
    
    def __str__(self):
        return f"Plaid Item: {self.institution_name or 'Unknown'} for {self.user.username}"

class Account(models.Model):
    """
    Represents a financial account from Plaid
    """
    ACCOUNT_TYPES = (
        ('depository', 'Depository'),
        ('credit', 'Credit'),
        ('loan', 'Loan'),
        ('investment', 'Investment'),
        ('other', 'Other'),
    )
    
    plaid_item = models.ForeignKey(PlaidItem, on_delete=models.CASCADE, related_name='accounts')
    account_id = models.CharField(max_length=255)
    name = models.CharField(max_length=255)
    official_name = models.CharField(max_length=255, null=True, blank=True)
    account_type = models.CharField(max_length=50, choices=ACCOUNT_TYPES)
    account_subtype = models.CharField(max_length=50, blank=True, null=True)
    current_balance = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    available_balance = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    mask = models.CharField(max_length=4, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'accounts'
        unique_together = [['plaid_item', 'account_id']]
    
    def __str__(self):
        return f"{self.name} ({self.mask or 'xxxx'})"

class Category(models.Model):
    """
    Represents a transaction category
    """
    name = models.CharField(max_length=255)
    plaid_category_id = models.CharField(max_length=255, null=True, blank=True)
    parent_category = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subcategories')
    
    # For custom user categories
    user = models.ForeignKey(User, on_delete=models.CASCADE, null=True, blank=True, related_name='custom_categories')
    is_custom = models.BooleanField(default=False)
    
    # For budget tracking
    budget_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    
    # System fields
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'categories'
        verbose_name_plural = 'categories'
        unique_together = [['name', 'user']]
    
    def __str__(self):
        return self.name

class Transaction(models.Model):
    """
    Represents a financial transaction from Plaid
    """
    account = models.ForeignKey(Account, on_delete=models.CASCADE, related_name='transactions')
    transaction_id = models.CharField(max_length=255, unique=True)
    
    # Basic transaction details
    date = models.DateField()
    name = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    
    # Category information
    category_string = models.CharField(max_length=255, null=True, blank=True)  # Original category string from Plaid
    category_id = models.CharField(max_length=255, null=True, blank=True)  # Original category ID from Plaid
    categories = models.ManyToManyField(Category, related_name='transactions', blank=True)  # Linked categories
    
    # Additional transaction data
    pending = models.BooleanField(default=False)
    payment_channel = models.CharField(max_length=50, null=True, blank=True)
    
    # Location data
    address = models.CharField(max_length=255, null=True, blank=True)
    city = models.CharField(max_length=100, null=True, blank=True)
    country = models.CharField(max_length=100, null=True, blank=True)
    postal_code = models.CharField(max_length=20, null=True, blank=True)
    region = models.CharField(max_length=100, null=True, blank=True)
    
    # Merchant data
    merchant_name = models.CharField(max_length=255, null=True, blank=True)
    
    # System fields
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'transactions'
        ordering = ['-date', '-created_at']
    
    def __str__(self):
        return f"{self.name} - ${self.amount} on {self.date}"