from rest_framework import serializers
from django.contrib.auth import get_user_model
from .models import Category, Transaction, Vendor, VendorRule, CustomView, CustomCategory, ViewTransaction, BASE_CURRENCY_FOR_CONVERSION
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

class TransactionSearchSerializer(serializers.Serializer):
    """
    Serializer for validating and processing transaction search requests.
    Handles all the filter parameters from the frontend search form.
    """
    # Vendor filter - array of vendor IDs or names
    vendors = serializers.ListField(
        child=serializers.CharField(max_length=255),
        required=False,
        allow_empty=True,
        help_text="List of vendor IDs or names to filter by"
    )
    
    # Category filter - array of category IDs
    categories = serializers.ListField(
        child=serializers.IntegerField(),
        required=False,
        allow_empty=True,
        help_text="List of category IDs to filter by"
    )
    
    # Date range filter
    date_range = serializers.DictField(
        child=serializers.DateField(allow_null=True),
        required=False,
        help_text="Date range with 'start' and 'end' keys"
    )
    
    # Amount range filter
    amount_range = serializers.DictField(
        child=serializers.DecimalField(max_digits=12, decimal_places=2, allow_null=True),
        required=False,
        help_text="Amount range with 'min' and 'max' keys"
    )
    
    # Keywords search
    keywords = serializers.CharField(
        required=False,
        allow_blank=True,
        max_length=500,
        help_text="Keywords to search in transaction descriptions"
    )
    
    # Transaction direction filter
    direction = serializers.ChoiceField(
        choices=[('all', 'All'), ('inflow', 'Credit'), ('outflow', 'Debit')],
        required=False,
        default='all',
        help_text="Transaction direction filter"
    )
    
    # Logic operator
    logic = serializers.ChoiceField(
        choices=[('AND', 'AND'), ('OR', 'OR')],
        required=False,
        default='AND',
        help_text="Logic operator for combining filters"
    )
    
    # Pagination parameters
    page = serializers.IntegerField(
        required=False,
        default=1,
        min_value=1,
        help_text="Page number for pagination"
    )
    
    page_size = serializers.IntegerField(
        required=False,
        default=50,
        min_value=1,
        max_value=1000,
        help_text="Number of results per page"
    )
    
    # Sorting parameters
    sort_by = serializers.ChoiceField(
        choices=[
            ('transaction_date', 'Date'),
            ('-transaction_date', 'Date (desc)'),
            ('original_amount', 'Amount'),
            ('-original_amount', 'Amount (desc)'),
            ('description', 'Description'),
            ('-description', 'Description (desc)'),
            ('category__name', 'Category'),
            ('-category__name', 'Category (desc)'),
            ('vendor__name', 'Vendor'),
            ('-vendor__name', 'Vendor (desc)'),
        ],
        required=False,
        default='-transaction_date',
        help_text="Field to sort results by"
    )

    def validate_date_range(self, value):
        """Validate date range has proper start/end format"""
        if not value:
            return value
            
        start_date = value.get('start')
        end_date = value.get('end')
        
        if start_date and end_date and start_date > end_date:
            raise serializers.ValidationError("Start date cannot be after end date")
            
        return value
    
    def validate_amount_range(self, value):
        """Validate amount range has proper min/max format"""
        if not value:
            return value
            
        min_amount = value.get('min')
        max_amount = value.get('max')
        
        if min_amount is not None and min_amount < 0:
            raise serializers.ValidationError("Minimum amount cannot be negative")
            
        if max_amount is not None and max_amount < 0:
            raise serializers.ValidationError("Maximum amount cannot be negative")
            
        if (min_amount is not None and max_amount is not None and 
            min_amount > max_amount):
            raise serializers.ValidationError("Minimum amount cannot be greater than maximum amount")
            
        return value

    def validate_vendors(self, value):
        """Ensure vendor IDs exist and are accessible to the user"""
        if not value:
            return value
            
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available")
        
        # Filter vendors to ensure they belong to the user or are system vendors
        from .models import Vendor
        vendor_ids = []
        vendor_names = []
        
        for vendor_identifier in value:
            if vendor_identifier.isdigit():
                vendor_ids.append(int(vendor_identifier))
            else:
                vendor_names.append(vendor_identifier)
        
        # Check vendor IDs exist and are accessible
        if vendor_ids:
            accessible_vendor_ids = Vendor.objects.filter(
                Q(id__in=vendor_ids) & 
                (Q(user=request.user) | Q(user__isnull=True))
            ).values_list('id', flat=True)
            
            invalid_ids = set(vendor_ids) - set(accessible_vendor_ids)
            if invalid_ids:
                raise serializers.ValidationError(f"Invalid vendor IDs: {list(invalid_ids)}")
        
        return value

    def validate_categories(self, value):
        """Ensure category IDs exist and are accessible to the user"""
        if not value:
            return value
            
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available")
        
        # Check categories exist and are accessible
        accessible_category_ids = Category.objects.filter(
            Q(id__in=value) & 
            (Q(user=request.user) | Q(user__isnull=True))
        ).values_list('id', flat=True)
        
        invalid_ids = set(value) - set(accessible_category_ids)
        if invalid_ids:
            raise serializers.ValidationError(f"Invalid category IDs: {list(invalid_ids)}")
            
        return value


class TransactionSearchResultSerializer(serializers.ModelSerializer):
    """
    Optimized serializer for transaction search results.
    Includes computed fields and related data for efficient display.
    """
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    signed_original_amount = serializers.SerializerMethodField()
    signed_aud_amount = serializers.SerializerMethodField()
    
    class Meta:
        model = Transaction
        fields = [
            'id',
            'transaction_date',
            'description',
            'vendor_name',
            'category_name',
            'original_amount',
            'original_currency',
            'aud_amount',
            'signed_original_amount',
            'signed_aud_amount',
            'direction',
            'source',
            'created_at',
            'updated_at'
        ]
    
    def get_signed_original_amount(self, obj):
        """Return amount with proper sign based on direction."""
        if obj.direction == 'CREDIT':
            return float(obj.original_amount)
        else:
            return -float(obj.original_amount)
    
    def get_signed_aud_amount(self, obj):
        """Return AUD amount with proper sign based on direction."""
        if obj.aud_amount is None:
            return None
        
        if obj.direction == 'CREDIT':
            return float(obj.aud_amount)
        else:
            return -float(obj.aud_amount)

class VendorRuleSerializer(serializers.ModelSerializer):
    """
    Serializer for VendorRule model for reading operations.
    Includes vendor and category names for display purposes.
    """
    vendor_name = serializers.CharField(source='vendor.name', read_only=True)
    category_name = serializers.CharField(source='category.name', read_only=True)
    
    class Meta:
        model = VendorRule
        fields = [
            'id',
            'vendor',
            'vendor_name',
            'category',
            'category_name',
            'pattern',
            'is_persistent',
            'priority',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'vendor_name', 'category_name', 'created_at', 'updated_at']


class VendorRuleCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating and updating VendorRule instances.
    Handles validation and ensures proper user access to vendors and categories.
    """
    # Use PrimaryKeyRelatedField for better control over validation
    vendor = serializers.PrimaryKeyRelatedField(
        queryset=Vendor.objects.all(),
        help_text="The vendor this rule applies to"
    )
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        help_text="The category to assign when this rule matches"
    )
    
    class Meta:
        model = VendorRule
        fields = [
            'vendor',
            'category',
            'pattern',
            'is_persistent',
            'priority'
        ]
    
    def validate_vendor(self, value):
        """Ensure the vendor is accessible to the current user."""
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available")
        
        # Vendor must be a system vendor (user=None) or belong to the current user
        if not (value.user is None or value.user == request.user):
            raise serializers.ValidationError("You can only create rules for system vendors or your own vendors")
        
        return value
    
    def validate_category(self, value):
        """Ensure the category is accessible to the current user."""
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available")
        
        # Category must be a system category (user=None) or belong to the current user
        if not (value.user is None or value.user == request.user):
            raise serializers.ValidationError("You can only assign system categories or your own categories")
        
        return value
    
    def validate(self, data):
        """
        Object-level validation to check for conflicts.
        Ensure only one active rule per vendor (for simple implementation).
        """
        vendor = data.get('vendor')
        is_persistent = data.get('is_persistent', False)
        
        if vendor and is_persistent:
            # Check for existing persistent rules for this vendor
            existing_rules = VendorRule.objects.filter(
                vendor=vendor,
                is_persistent=True
            )
            
            # If updating, exclude the current instance
            if self.instance:
                existing_rules = existing_rules.exclude(id=self.instance.id)
            
            if existing_rules.exists():
                existing_rule = existing_rules.first()
                raise serializers.ValidationError({
                    'vendor': f"A persistent rule already exists for this vendor (assigns to {existing_rule.category.name}). "
                             f"Please update or delete the existing rule first."
                })
        
        return data
    
    def create(self, validated_data):
        """Create a new VendorRule with a UUID."""
        validated_data['id'] = str(uuid.uuid4())
        return super().create(validated_data)


class VendorRuleUpdateSerializer(VendorRuleCreateSerializer):
    """
    Serializer for updating VendorRule instances.
    Inherits from create serializer but allows partial updates.
    """
    vendor = serializers.PrimaryKeyRelatedField(
        queryset=Vendor.objects.all(),
        required=False,
        help_text="The vendor this rule applies to"
    )
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        required=False,
        help_text="The category to assign when this rule matches"
    )
    
    class Meta(VendorRuleCreateSerializer.Meta):
        # All fields are optional for updates
        pass


# --- Custom Views Serializers ---

class CustomViewSerializer(serializers.ModelSerializer):
    """
    Serializer for CustomView model for reading operations.
    Includes computed fields for transaction counts and statistics.
    """
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    transaction_count = serializers.SerializerMethodField(read_only=True)
    categorized_count = serializers.SerializerMethodField(read_only=True)
    uncategorized_count = serializers.SerializerMethodField(read_only=True)
    total_amount = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = CustomView
        fields = [
            'id',
            'user',
            'name',
            'description',
            'search_criteria',
            'is_archived',
            'transaction_count',
            'categorized_count',
            'uncategorized_count',
            'total_amount',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']

    def get_transaction_count(self, obj):
        """Get total number of transactions in this view."""
        return obj.view_transactions.count()

    def get_categorized_count(self, obj):
        """Get number of categorized transactions in this view."""
        return obj.view_transactions.filter(custom_category__isnull=False).count()

    def get_uncategorized_count(self, obj):
        """Get number of uncategorized transactions in this view."""
        return obj.view_transactions.filter(custom_category__isnull=True).count()

    def get_total_amount(self, obj):
        """Get total amount of all transactions in this view."""
        from django.db.models import Sum
        result = obj.view_transactions.aggregate(
            total=Sum('transaction__original_amount')
        )
        return float(result['total']) if result['total'] else 0.0


class CustomViewCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating CustomView instances.
    Handles validation and ensures proper user assignment.
    """
    # User field should not be directly set by API client
    user = serializers.PrimaryKeyRelatedField(read_only=True)
    
    class Meta:
        model = CustomView
        fields = [
            'name',
            'description',
            'search_criteria',
            'is_archived'
        ]

    def validate_name(self, value):
        """Ensure name uniqueness for the user."""
        if not value or not value.strip():
            raise serializers.ValidationError("View name cannot be empty.")
        
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available.")
        
        # Check for uniqueness within user's views
        queryset = CustomView.objects.filter(
            name__iexact=value.strip(),
            user=request.user
        )
        
        # Exclude current instance during updates
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        
        if queryset.exists():
            raise serializers.ValidationError(f"A view named '{value}' already exists.")
        
        return value.strip()

    def validate_search_criteria(self, value):
        """Validate search criteria structure."""
        if not isinstance(value, dict):
            raise serializers.ValidationError("Search criteria must be a valid JSON object.")
        
        # Validate known fields if present
        valid_fields = {
            'date_from', 'date_to', 'amount_min', 'amount_max',
            'vendor_ids', 'category_ids', 'direction', 'description_contains'
        }
        
        for key in value.keys():
            if key not in valid_fields:
                raise serializers.ValidationError(f"Unknown search criteria field: {key}")
        
        # Validate date format if present
        if 'date_from' in value and value['date_from']:
            try:
                from datetime import datetime
                datetime.strptime(value['date_from'], '%Y-%m-%d')
            except ValueError:
                raise serializers.ValidationError("date_from must be in YYYY-MM-DD format.")
        
        if 'date_to' in value and value['date_to']:
            try:
                from datetime import datetime
                datetime.strptime(value['date_to'], '%Y-%m-%d')
            except ValueError:
                raise serializers.ValidationError("date_to must be in YYYY-MM-DD format.")
        
        return value

    def create(self, validated_data):
        """Create a new custom view with proper user assignment."""
        request = self.context.get('request')
        validated_data['id'] = str(uuid.uuid4())
        validated_data['user'] = request.user
        return super().create(validated_data)


class CustomCategorySerializer(serializers.ModelSerializer):
    """
    Serializer for CustomCategory model for reading operations.
    Includes computed fields for transaction counts and hierarchy information.
    """
    custom_view_name = serializers.CharField(source='custom_view.name', read_only=True)
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)
    transaction_count = serializers.SerializerMethodField(read_only=True)
    total_amount = serializers.SerializerMethodField(read_only=True)
    full_path = serializers.SerializerMethodField(read_only=True)
    level = serializers.SerializerMethodField(read_only=True)
    
    class Meta:
        model = CustomCategory
        fields = [
            'id',
            'custom_view',
            'custom_view_name',
            'name',
            'parent',
            'parent_name',
            'order',
            'transaction_count',
            'total_amount',
            'full_path',
            'level',
            'created_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']

    def get_transaction_count(self, obj):
        """Get number of transactions assigned to this category."""
        return obj.get_transaction_count()

    def get_total_amount(self, obj):
        """Get total amount of transactions assigned to this category."""
        return float(obj.get_total_amount())

    def get_full_path(self, obj):
        """Get the full hierarchical path of this category."""
        return obj.get_full_path()

    def get_level(self, obj):
        """Get the hierarchical level of this category."""
        return obj.get_level()


class CustomCategoryCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating and updating CustomCategory instances.
    Handles validation and ensures proper view assignment.
    """
    # Custom view is required and must be accessible to the user
    custom_view = serializers.PrimaryKeyRelatedField(
        queryset=CustomView.objects.all(),
        help_text="The custom view this category belongs to"
    )
    
    # Parent category must belong to the same view
    parent = serializers.PrimaryKeyRelatedField(
        queryset=CustomCategory.objects.all(),
        allow_null=True,
        required=False,
        help_text="Parent category for hierarchy"
    )
    
    class Meta:
        model = CustomCategory
        fields = [
            'custom_view',
            'name',
            'parent',
            'order'
        ]

    def validate_custom_view(self, value):
        """Ensure user has access to the custom view."""
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available.")
        
        if value.user != request.user:
            raise serializers.ValidationError("You can only create categories in your own views.")
        
        return value

    def validate_parent(self, value):
        """Ensure parent belongs to the same view."""
        if value is not None:
            custom_view = self.initial_data.get('custom_view')
            if custom_view and str(value.custom_view.id) != str(custom_view):
                raise serializers.ValidationError("Parent category must belong to the same view.")
        
        return value

    def validate_name(self, value):
        """Ensure name uniqueness within the view and parent."""
        if not value or not value.strip():
            raise serializers.ValidationError("Category name cannot be empty.")
        
        return value.strip()

    def validate(self, data):
        """Object-level validation."""
        # Check for circular reference
        if data.get('parent'):
            parent = data['parent']
            current = parent.parent
            while current:
                if current == self.instance:
                    raise serializers.ValidationError("Cannot create circular reference in category hierarchy.")
                current = current.parent
        
        # Check name uniqueness within view and parent
        custom_view = data.get('custom_view')
        parent = data.get('parent')
        name = data.get('name')
        
        if custom_view and name:
            queryset = CustomCategory.objects.filter(
                custom_view=custom_view,
                parent=parent,
                name__iexact=name
            )
            
            if self.instance:
                queryset = queryset.exclude(pk=self.instance.pk)
            
            if queryset.exists():
                raise serializers.ValidationError("A category with this name already exists under this parent.")
        
        return data

    def create(self, validated_data):
        """Create a new custom category with UUID."""
        validated_data['id'] = str(uuid.uuid4())
        return super().create(validated_data)


class ViewTransactionSerializer(serializers.ModelSerializer):
    """
    Serializer for ViewTransaction model for reading operations.
    Includes transaction and category details for display.
    """
    transaction_description = serializers.CharField(source='transaction.description', read_only=True)
    transaction_amount = serializers.DecimalField(source='transaction.original_amount', max_digits=12, decimal_places=2, read_only=True)
    transaction_currency = serializers.CharField(source='transaction.original_currency', read_only=True)
    transaction_date = serializers.DateField(source='transaction.transaction_date', read_only=True)
    custom_category_name = serializers.CharField(source='custom_category.name', read_only=True, allow_null=True)
    custom_view_name = serializers.CharField(source='custom_view.name', read_only=True)
    
    class Meta:
        model = ViewTransaction
        fields = [
            'id',
            'custom_view',
            'custom_view_name',
            'transaction',
            'transaction_description',
            'transaction_amount',
            'transaction_currency',
            'transaction_date',
            'custom_category',
            'custom_category_name',
            'notes',
            'assigned_at',
            'updated_at'
        ]
        read_only_fields = ['id', 'assigned_at', 'updated_at']


class ViewTransactionCreateSerializer(serializers.ModelSerializer):
    """
    Serializer for creating and updating ViewTransaction assignments.
    Handles validation and ensures proper relationships.
    """
    # Custom view must be accessible to the user
    custom_view = serializers.PrimaryKeyRelatedField(
        queryset=CustomView.objects.all(),
        help_text="The custom view to assign the transaction to"
    )
    
    # Transaction must belong to the user
    transaction = serializers.PrimaryKeyRelatedField(
        queryset=Transaction.objects.all(),
        help_text="The transaction to assign to the view"
    )
    
    # Custom category must belong to the same view
    custom_category = serializers.PrimaryKeyRelatedField(
        queryset=CustomCategory.objects.all(),
        allow_null=True,
        required=False,
        help_text="The custom category to assign within the view"
    )
    
    class Meta:
        model = ViewTransaction
        fields = [
            'custom_view',
            'transaction',
            'custom_category',
            'notes'
        ]

    def validate_custom_view(self, value):
        """Ensure user has access to the custom view."""
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available.")
        
        if value.user != request.user:
            raise serializers.ValidationError("You can only assign transactions to your own views.")
        
        return value

    def validate_transaction(self, value):
        """Ensure user owns the transaction."""
        request = self.context.get('request')
        if not request or not hasattr(request, 'user'):
            raise serializers.ValidationError("User context not available.")
        
        if value.user != request.user:
            raise serializers.ValidationError("You can only assign your own transactions.")
        
        return value

    def validate_custom_category(self, value):
        """Ensure custom category belongs to the same view."""
        if value is not None:
            custom_view = self.initial_data.get('custom_view')
            if custom_view and str(value.custom_view.id) != str(custom_view):
                raise serializers.ValidationError("Custom category must belong to the same view.")
        
        return value

    def validate(self, data):
        """Object-level validation."""
        custom_view = data.get('custom_view')
        transaction = data.get('transaction')
        
        # Check if assignment already exists (for create operations)
        if not self.instance and custom_view and transaction:
            if ViewTransaction.objects.filter(custom_view=custom_view, transaction=transaction).exists():
                raise serializers.ValidationError("Transaction is already assigned to this view.")
        
        return data

    def create(self, validated_data):
        """Create a new view transaction assignment with UUID."""
        validated_data['id'] = str(uuid.uuid4())
        return super().create(validated_data)
