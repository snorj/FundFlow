from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Category, Transaction, Vendor, VendorRule, VendorMapping, BASE_CURRENCY_FOR_CONVERSION
from django.db.models import Q
import uuid

User = get_user_model()

class CategorySerializer(serializers.ModelSerializer):
    """
    Serializer for Category model.
    Handles nested representation minimally (returns parent ID).
    Includes derived 'is_custom' field.
    """
    # Derived field to indicate if it's a custom user category
    is_custom = serializers.SerializerMethodField(read_only=True)
    # Make parent field writeable using its ID, but read shows ID too.
    # Frontend might need to reconstruct hierarchy based on parent IDs.
    parent = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), # Base queryset, filtered in validation/views
        allow_null=True,
        required=False # Allow null for top-level categories
    )
    # User field should not be directly set by API client, set internally in view
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    class Meta:
        model = Category
        fields = [
            'id',
            'name',
            'parent', # Will show parent category's ID
            'user',   # Will show user's ID (or null for system)
            'is_custom',
            'created_at',
            'updated_at',
            # Add 'children' if you want to expose child IDs directly (read-only)
            # 'children',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def get_is_custom(self, obj):
        """Determine if the category is custom (belongs to a user)."""
        return obj.user is not None

    def validate_parent(self, value):
        """
        Ensure users can only parent categories under System categories (user=None)
        or their *own* existing custom categories.
        """
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            # Should not happen if IsAuthenticated permission is used
            raise serializers.ValidationError("User context not available.")

        if value is not None: # If a parent is being assigned
            # Check if the chosen parent category exists and is accessible
            if value.user is not None and value.user != request.user:
                 raise serializers.ValidationError("You can only nest categories under system categories or your own categories.")
        return value

    def validate_name(self, value):
        """
        Ensure name uniqueness considering parent and user.
        DRF performs uniqueness checks based on model constraints,
        but we can add explicit checks if needed, especially for updates.
        """
        # Basic check: Name shouldn't be empty
        if not value or not value.strip():
            raise serializers.ValidationError("Category name cannot be empty.")

        # More complex check for uniqueness within the same parent/user context
        # This often requires context from the view (instance being updated)
        instance = self.instance # None during CREATE, the Category object during UPDATE
        request = self.context.get('request')
        parent = self.initial_data.get('parent', instance.parent if instance else None) # Get parent from input or existing instance

        queryset = Category.objects.filter(name__iexact=value.strip(), parent=parent, user=request.user)

        if instance: # If updating, exclude self from the check
            queryset = queryset.exclude(pk=instance.pk)

        if queryset.exists():
            raise serializers.ValidationError(f"A category named '{value}' already exists under this parent.")

        return value.strip() # Return cleaned value
    
class TransactionSerializer(serializers.ModelSerializer):
    """
    Serializer for the Transaction model for LISTING/READING.
    Includes currency fields, category details, and new last_modified.
    """
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    # user field is implicitly handled by DRF, typically read-only or set in view.
    # For explicit read-only ID:
    user = serializers.PrimaryKeyRelatedField(read_only=True)

    # Expose the signed original amount
    signed_original_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    # Expose the signed AUD amount (can be null)
    signed_aud_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True, allow_null=True)

    class Meta:
        model = Transaction
        fields = [
            'id',
            'user', # User ID
            'category',             # For writing category ID (though this serializer is mainly for reading)
            'category_name',        # For reading category name
            'transaction_date',
            'description',
            'original_amount',
            'original_currency',
            'direction',            # Ensure 'direction' is used, not 'type'
            'aud_amount',           
            'exchange_rate_to_aud', 
            'signed_original_amount',
            'signed_aud_amount',
            'source',               
            'bank_transaction_id',  
            'source_account_identifier',
            'counterparty_identifier',
            'source_code',
            'source_type',
            'source_notifications',
            'created_at',
            'updated_at',
            'last_modified',        # New field
        ]
        read_only_fields = [
            'id', 'user', 'category_name',
            'signed_original_amount', 'signed_aud_amount', 
            'aud_amount', 'exchange_rate_to_aud', 
            'created_at', 'updated_at', 'last_modified' # Add last_modified here
        ]

class TransactionUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer for UPDATING Transaction instances.
    Allows editing description, date, category, and financial details.
    """
    # Category is writeable using its ID.
    # Queryset will be filtered in the view or validation to ensure user access.
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(), # Base queryset
        allow_null=True, # Allow un-categorizing
        required=False   # Not always required to change category
    )

    class Meta:
        model = Transaction
        fields = [
            'description',
            'transaction_date',
            'category',
            'original_amount',
            'original_currency',
            # 'direction' is generally not something a user would edit post-creation
            # for an existing transaction, as it fundamentally changes its nature.
            # If it needs to be editable, add it here.
        ]
        # No read_only_fields needed here as we expect all these to be potentially writable.

    def validate_category(self, value):
        """
        Ensure the user can assign this category.
        Category must be a system category (user=None) or belong to the request.user.
        """
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            # This should ideally be caught by IsAuthenticated permission
            raise serializers.ValidationError("User context not available for category validation.")

        if value is not None: # If a category is being assigned (i.e., not None)
            if not (value.user is None or value.user == request.user):
                raise serializers.ValidationError("You can only assign system categories or your own categories.")
        return value

    def validate(self, data):
        """
        Object-level validation.
        If original_amount or original_currency is being changed,
        ensure both are provided if one is.
        """
        original_amount_changed = 'original_amount' in data
        original_currency_changed = 'original_currency' in data

        # If only one of amount or currency is provided for an update,
        # it implies an incomplete financial update.
        # We need the existing instance's values to make a full decision.
        if original_amount_changed != original_currency_changed:
            # If one is provided, the other must also be provided or be unchanged (which means it should be in data or instance)
            # This logic is tricky because 'data' only contains fields sent in the PATCH request.
            # For PUT, all fields are required by default unless partial=True.
            # Let's assume for now that if one is being changed, the other should accompany it.
            if original_amount_changed and not data.get('original_currency') and not (self.instance and self.instance.original_currency):
                raise serializers.ValidationError("If updating original_amount, original_currency must also be provided.")
            if original_currency_changed and not data.get('original_amount') and not (self.instance and self.instance.original_amount):
                 raise serializers.ValidationError("If updating original_currency, original_amount must also be provided.")
        
        # Consider if original_currency needs specific validation (e.g., valid ISO code)
        # Model's CharField max_length will handle length.
        # If original_currency is provided, it should be a valid non-empty string.
        if 'original_currency' in data and (data['original_currency'] is None or not str(data['original_currency']).strip()):
            raise serializers.ValidationError({"original_currency": "Original currency cannot be empty if provided."})

        return data

class VendorSerializer(serializers.ModelSerializer):
    """
    Serializer for the Vendor model for CRUD operations.
    Handles vendor creation, reading, updating, and deletion.
    """
    # User field should not be directly set by API client, set internally in view
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    
    # Add a derived field to show if it's a system-wide vendor
    is_system_vendor = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = Vendor
        fields = [
            'id',
            'name',
            'user',
            'is_system_vendor',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def get_is_system_vendor(self, obj):
        """Determine if the vendor is system-wide (no specific user)."""
        return obj.user is None

    def validate_name(self, value):
        """
        Ensure vendor name is not empty and is unique within the user's scope.
        """
        # Basic check: Name shouldn't be empty
        if not value or not value.strip():
            raise serializers.ValidationError("Vendor name cannot be empty.")

        # Uniqueness check within the same user context
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available.")

        instance = self.instance  # None during CREATE, the Vendor object during UPDATE
        
        # Check for existing vendor with same name for this user
        queryset = Vendor.objects.filter(name__iexact=value.strip(), user=request.user)
        
        if instance:  # If updating, exclude self from the check
            queryset = queryset.exclude(pk=instance.pk)

        if queryset.exists():
            raise serializers.ValidationError(f"A vendor named '{value}' already exists.")

        return value.strip()  # Return cleaned value

class TransactionCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating manual transactions.
    Handles manual transaction creation with proper field validation and currency conversion.
    """
    # Use separate fields for foreign key relationships for better control
    category_id = serializers.IntegerField(required=False, allow_null=True, source='category.id')
    vendor_id = serializers.IntegerField(required=False, allow_null=True, source='vendor.id')
    
    # Override to make these fields required for manual creation
    transaction_date = serializers.DateField(required=True)
    description = serializers.CharField(required=True, max_length=500)
    original_amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=True)
    original_currency = serializers.CharField(max_length=3, required=True)
    direction = serializers.ChoiceField(choices=['DEBIT', 'CREDIT'], required=True)

    class Meta:
        model = Transaction
        fields = [
            'transaction_date',
            'description', 
            'original_amount',
            'original_currency',
            'direction',
            'category_id',
            'vendor_id',
        ]

    def validate_original_amount(self, value):
        """Ensure amount is positive."""
        if value is None:
            raise serializers.ValidationError("Amount is required.")
        if value <= 0:
            raise serializers.ValidationError("Amount must be positive.")
        return value

    def validate_original_currency(self, value):
        """Ensure currency is a valid 3-letter code."""
        if not value or not value.strip():
            raise serializers.ValidationError("Currency code is required.")
        
        value = value.strip().upper()
        if len(value) != 3:
            raise serializers.ValidationError("Currency code must be exactly 3 characters.")
        
        # Basic validation - could be enhanced with list of valid ISO codes
        if not value.isalpha():
            raise serializers.ValidationError("Currency code must contain only letters.")
        
        # List of commonly supported currencies - could be made configurable
        SUPPORTED_CURRENCIES = {
            'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'CHF', 'CNY', 'SEK', 'NZD',
            'MXN', 'SGD', 'HKD', 'NOK', 'ZAR', 'INR', 'TRY', 'BRL', 'TWD', 'DKK',
            'PLN', 'THB', 'ILS', 'KRW', 'CZK', 'HUF', 'RON', 'RUB', 'CLP', 'PHP'
        }
        
        if value not in SUPPORTED_CURRENCIES:
            raise serializers.ValidationError(
                f"Currency '{value}' is not supported. Supported currencies: {', '.join(sorted(SUPPORTED_CURRENCIES))}"
            )
        
        return value

    def validate_transaction_date(self, value):
        """
        Validate transaction date - ensure it's not too far in the future
        and warn if it's very old (but allow it).
        """
        from datetime import date, timedelta
        
        if value is None:
            raise serializers.ValidationError("Transaction date is required.")
        
        today = date.today()
        
        # Don't allow dates more than 1 year in the future
        max_future_date = today + timedelta(days=365)
        if value > max_future_date:
            raise serializers.ValidationError(
                f"Transaction date cannot be more than 1 year in the future (max: {max_future_date})."
            )
        
        # Warn about very old dates (but allow them)
        min_reasonable_date = today - timedelta(days=3650)  # 10 years ago
        if value < min_reasonable_date:
            # Note: We could log a warning here but still allow the transaction
            # For now, we'll accept it but could add logging if needed
            pass
        
        return value

    def validate_description(self, value):
        """Ensure description is not empty."""
        if not value or not value.strip():
            raise serializers.ValidationError("Description is required.")
        return value.strip()

    def validate_category_id(self, value):
        """
        Ensure the category exists and is accessible to the user.
        Category must be a system category (user=None) or belong to the request.user.
        """
        if value is None:
            return None  # Allow null category
            
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available.")

        try:
            category = Category.objects.filter(
                Q(user__isnull=True) | Q(user=request.user)
            ).get(id=value)
            return category
        except Category.DoesNotExist:
            raise serializers.ValidationError("Category not found or access denied.")

    def validate_vendor_id(self, value):
        """
        Ensure the vendor exists and is accessible to the user.
        Vendor must be a system vendor (user=None) or belong to the request.user.
        """
        if value is None:
            return None  # Allow null vendor
            
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available.")

        try:
            vendor = Vendor.objects.filter(
                Q(user__isnull=True) | Q(user=request.user)
            ).get(id=value)
            return vendor
        except Vendor.DoesNotExist:
            raise serializers.ValidationError("Vendor not found or access denied.")

    def validate(self, data):
        """
        Enhanced object-level validation including currency conversion checks
        and cross-field validation.
        """
        # Ensure we have all required fields
        required_fields = ['transaction_date', 'description', 'original_amount', 'original_currency', 'direction']
        for field in required_fields:
            if field not in data or data[field] is None:
                raise serializers.ValidationError(f"{field} is required for manual transaction creation.")

        # Additional validation for currency conversion feasibility
        original_currency = data.get('original_currency')
        transaction_date = data.get('transaction_date')
        
        if original_currency and transaction_date:
            # Import here to avoid circular imports
            from .services import get_historical_rate
            from datetime import date
            
            # Check if we can get exchange rate for future currency conversion
            # Only check if currency is not the base currency
            if original_currency != BASE_CURRENCY_FOR_CONVERSION:
                # For future dates, we might not have exchange rates
                if transaction_date > date.today():
                    # We'll allow it but note that conversion might fail later
                    # The actual conversion will happen in the create() method
                    pass
                else:
                    # For past/present dates, we can check if rate is available
                    # This is optional validation - we don't fail the transaction if rate is unavailable
                    # The model's update_aud_amount_if_needed() will handle missing rates gracefully
                    pass

        # Validate amount precision (ensure it's not more than 2 decimal places for most currencies)
        original_amount = data.get('original_amount')
        if original_amount is not None:
            # Convert to string to check decimal places
            amount_str = str(original_amount)
            if '.' in amount_str:
                decimal_places = len(amount_str.split('.')[1])
                if decimal_places > 2:
                    raise serializers.ValidationError(
                        "Amount cannot have more than 2 decimal places."
                    )

        return data

    def create(self, validated_data):
        """
        Enhanced create method with better error handling and currency conversion.
        """
        # Extract the related objects from validated data
        category = validated_data.pop('category', {}).get('id') if 'category' in validated_data else None
        vendor = validated_data.pop('vendor', {}).get('id') if 'vendor' in validated_data else None
        
        # Get the user from context
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available.")
        
        # Set required fields for transaction creation
        validated_data['source'] = 'manual'
        validated_data['category'] = category
        validated_data['vendor'] = vendor
        validated_data['user'] = request.user
        
        try:
            # Create the transaction
            transaction = Transaction.objects.create(**validated_data)
            
            # Trigger AUD conversion if needed - this handles rate fetching and conversion
            conversion_successful = transaction.update_aud_amount_if_needed()
            
            # Note: We don't fail the transaction creation if currency conversion fails
            # The transaction will be created with aud_amount=None, which is acceptable
            # Currency conversion can be retried later or handled manually
            
            return transaction
            
        except Exception as e:
            # Log the error and re-raise with a user-friendly message
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create manual transaction: {e}", exc_info=True)
            raise serializers.ValidationError(
                "Failed to create transaction. Please check your input and try again."
            )

class VendorRuleSerializer(serializers.ModelSerializer):
    """
    Serializer for VendorRule model for CRUD operations.
    Handles vendor rule creation, reading, updating, and deletion with proper validation.
    """
    # Make foreign key fields writeable using IDs
    vendor_id = serializers.IntegerField(write_only=True, source='vendor.id')
    category_id = serializers.IntegerField(write_only=True, source='category.id')
    
    # Read-only fields to show related object details
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    
    class Meta:
        model = VendorRule
        fields = [
            'id',
            'vendor_id',
            'vendor_name',
            'category_id', 
            'category_name',
            'is_persistent',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'vendor_name', 'category_name', 'created_at', 'updated_at']

    def validate_vendor_id(self, value):
        """
        Ensure the vendor exists and is accessible to the user.
        Vendor must be a system vendor (user=None) or belong to the request.user.
        """
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available.")

        try:
            vendor = Vendor.objects.filter(
                Q(user__isnull=True) | Q(user=request.user)
            ).get(id=value)
            return vendor
        except Vendor.DoesNotExist:
            raise serializers.ValidationError("Vendor not found or access denied.")

    def validate_category_id(self, value):
        """
        Ensure the category exists and is accessible to the user.
        Category must be a system category (user=None) or belong to the request.user.
        """
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available.")

        try:
            category = Category.objects.filter(
                Q(user__isnull=True) | Q(user=request.user)
            ).get(id=value)
            return category
        except Category.DoesNotExist:
            raise serializers.ValidationError("Category not found or access denied.")

    def validate(self, data):
        """
        Cross-field validation for vendor rules.
        """
        # Extract the vendor and category objects from validated data
        vendor = data.get('vendor', {}).get('id') if 'vendor' in data else None
        category = data.get('category', {}).get('id') if 'category' in data else None
        
        # Check for duplicate vendor rules (simplified - only one rule per vendor)
        if vendor:
            existing_rules = VendorRule.objects.filter(vendor=vendor)
            
            # Exclude self during updates
            if self.instance:
                existing_rules = existing_rules.exclude(pk=self.instance.pk)
            
            if existing_rules.exists():
                raise serializers.ValidationError(
                    "A rule for this vendor already exists. Only one rule per vendor is allowed."
                )

        return data

    def create(self, validated_data):
        """
        Create a new vendor rule with auto-generated UUID.
        """
        # Extract the related objects from validated data
        vendor = validated_data.pop('vendor', {}).get('id') if 'vendor' in validated_data else None
        category = validated_data.pop('category', {}).get('id') if 'category' in validated_data else None
        
        # Generate UUID for the rule
        validated_data['id'] = str(uuid.uuid4())
        validated_data['vendor'] = vendor
        validated_data['category'] = category
        
        return VendorRule.objects.create(**validated_data)

    def update(self, instance, validated_data):
        """
        Update an existing vendor rule.
        """
        # Extract the related objects from validated data
        vendor = validated_data.pop('vendor', {}).get('id') if 'vendor' in validated_data else None
        category = validated_data.pop('category', {}).get('id') if 'category' in validated_data else None
        
        if vendor:
            instance.vendor = vendor
        if category:
            instance.category = category
            
        # Update other fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
            
        instance.save()
        return instance


class VendorMappingSerializer(serializers.ModelSerializer):
    """
    Serializer for VendorMapping model for CRUD operations.
    Handles vendor mapping creation, reading, updating, and deletion with proper validation.
    """
    # User field should not be directly set by API client, set internally in view
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    
    class Meta:
        model = VendorMapping
        fields = [
            'id',
            'user',
            'original_name',
            'mapped_vendor',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def validate_original_name(self, value):
        """
        Ensure the original name is not empty and is properly formatted.
        """
        if not value or not value.strip():
            raise serializers.ValidationError("Original vendor name cannot be empty.")
        
        # Normalize whitespace
        return value.strip()

    def validate_mapped_vendor(self, value):
        """
        Ensure the mapped vendor name is not empty and is properly formatted.
        """
        if not value or not value.strip():
            raise serializers.ValidationError("Mapped vendor name cannot be empty.")
        
        # Normalize whitespace
        return value.strip()

    def validate(self, data):
        """
        Cross-field validation for vendor mappings.
        """
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available.")
        
        user = request.user
        original_name = data.get('original_name')
        
        # Check for duplicate original_name for this user
        if original_name:
            existing_mappings = VendorMapping.objects.filter(
                user=user,
                original_name=original_name
            )
            
            # Exclude self during updates
            if self.instance:
                existing_mappings = existing_mappings.exclude(pk=self.instance.pk)
            
            if existing_mappings.exists():
                raise serializers.ValidationError(
                    "A mapping for this original vendor name already exists."
                )

        return data

    def create(self, validated_data):
        """
        Create a new vendor mapping for the authenticated user.
        """
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available.")
        
        validated_data['user'] = request.user
        return VendorMapping.objects.create(**validated_data)

    def update(self, instance, validated_data):
        """
        Update an existing vendor mapping.
        """
        # Update fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
            
        instance.save()
        return instance
