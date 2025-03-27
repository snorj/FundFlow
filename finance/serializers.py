from rest_framework import serializers
from .models import PlaidItem, Account

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