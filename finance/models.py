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
    account_id = models.CharField(max_length=255, unique=True)
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
    
    def __str__(self):
        return f"{self.name} ({self.mask or 'xxxx'})"