# finance/admin.py
from django.contrib import admin
from .models import PlaidItem, Account, Transaction, Category

@admin.register(PlaidItem)
class PlaidItemAdmin(admin.ModelAdmin):
    list_display = ('institution_name', 'user', 'is_active', 'created_at')
    list_filter = ('is_active', 'institution_name')
    search_fields = ('institution_name', 'user__username')

@admin.register(Account)
class AccountAdmin(admin.ModelAdmin):
    list_display = ('name', 'account_type', 'plaid_item', 'current_balance')
    list_filter = ('account_type',)
    search_fields = ('name', 'plaid_item__institution_name')

@admin.register(Transaction)
class TransactionAdmin(admin.ModelAdmin):
    list_display = ('name', 'date', 'amount', 'account')
    list_filter = ('date', 'account__account_type')
    search_fields = ('name', 'account__name')

@admin.register(Category)
class CategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_custom', 'user')
    list_filter = ('is_custom',)
    search_fields = ('name',)