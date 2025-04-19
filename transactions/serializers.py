from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Category, Transaction

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
    
# --- NEW TRANSACTION SERIALIZER ---
class TransactionSerializer(serializers.ModelSerializer):
    """
    Serializer for the Transaction model.
    Includes category details nested (or just ID depending on need).
    """
    # To show category name instead of just ID in API responses:
    category_name = serializers.CharField(source='category.name', read_only=True, allow_null=True)
    # Or use nested serializer:
    # category = CategorySerializer(read_only=True) # If you want full category object

    user = serializers.PrimaryKeyRelatedField(read_only=True) # User assigned internally

    class Meta:
        model = Transaction
        fields = [
            'id',
            'user',
            'category', # ID for writing (if updating later)
            'category_name', # Read-only name display
            'transaction_date',
            'description',
            'amount',
            'direction',
            'signed_amount', # Include the property if useful for frontend
            # Optional source fields if needed by frontend
            'source_account_identifier',
            'counterparty_identifier',
            'source_code',
            'source_type',
            'source_notifications',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user', 'category_name', 'signed_amount', 'created_at', 'updated_at']