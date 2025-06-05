from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Category, Transaction, Vendor, BASE_CURRENCY_FOR_CONVERSION

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
