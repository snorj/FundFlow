from rest_framework import serializers
from .models import PlaidItem, Account, Transaction

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

class TransactionSerializer(serializers.ModelSerializer):
    account_name = serializers.CharField(source='account.name', read_only=True)
    
    class Meta:
        model = Transaction
        fields = [
            'id', 'transaction_id', 'date', 'name', 'amount', 'category',
            'pending', 'payment_channel', 'merchant_name', 'account_name'
        ]
        read_only_fields = ['id', 'transaction_id']