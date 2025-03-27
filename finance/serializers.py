from rest_framework import serializers
from .models import PlaidItem, Account, Transaction, Category

class PlaidItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PlaidItem
        fields = ['id', 'institution_name', 'is_active', 'created_at']
        read_only_fields = ['id', 'created_at']

class AccountSerializer(serializers.ModelSerializer):
    class Meta:
        model = Account
        fields = ['id', 'name', 'official_name', 'account_type', 'account_subtype', 
                 'current_balance', 'available_balance', 'mask', 'created_at']
        read_only_fields = ['id', 'created_at']

class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = ['id', 'name', 'plaid_category_id', 'parent_category', 'is_custom', 'budget_amount']
        read_only_fields = ['id']

class TransactionSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source='account.name', read_only=True)
    
    class Meta:
        model = Transaction
        fields = [
            'id', 'transaction_id', 'date', 'name', 'amount', 'category',
            'pending', 'payment_channel', 'merchant_name', 'account_name'
        ]
        read_only_fields = ['id', 'transaction_id']