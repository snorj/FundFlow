# transactions/models.py
from decimal import Decimal, ROUND_HALF_UP
from django.db import models
from django.conf import settings # To reference the User model safely
# from .services import get_historical_rate # Import new service <-- REMOVE THIS LINE
import logging # For logging in the new method
from django.utils import timezone

logger = logging.getLogger(__name__) # Logger for model method

# Define the base currency here to avoid circular imports
BASE_CURRENCY_FOR_CONVERSION = 'AUD'

# --- Keep existing Category model ---
class Category(models.Model):
    """
    Represents a category for transactions, supporting hierarchical structures
    and distinguishing between system-defined and user-defined categories.
    """
    name = models.CharField(
        max_length=100,
        help_text="Name of the category (e.g., 'Groceries', 'Rent', 'Alcohol')."
    )
    parent = models.ForeignKey(
        'self', # Self-referencing relationship for hierarchy
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        help_text="Parent category for creating hierarchy. Null for top-level categories."
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True, # Null indicates a system-wide category
        blank=True,
        help_text="User who owns this category. Null for system categories."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Categories"
        unique_together = ('user', 'parent', 'name')
        ordering = ['name']
        indexes = [
            models.Index(fields=['user', 'parent']),
            models.Index(fields=['parent']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        if self.parent:
            return f"{self.parent} > {self.name}"
        return self.name

class Vendor(models.Model):
    """
    Represents a vendor or merchant associated with transactions.
    """
    name = models.CharField(
        max_length=255,
        help_text="Name of the vendor (e.g., 'Woolworths', 'Shell', 'Coffee Club')."
    )
    display_name = models.CharField(
        max_length=255,
        default="",
        help_text="Display name for the vendor, used in UI (e.g., 'Woolworths Supermarket', 'Shell Gas Station')."
    )
    description_patterns = models.JSONField(
        default=list,
        help_text="Array of description patterns that help identify this vendor in transaction descriptions."
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        help_text="User who owns this vendor. Null for system-wide vendors."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'name')
        ordering = ['display_name', 'name']
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['display_name']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return self.display_name or self.name

class VendorMerge(models.Model):
    """
    Tracks vendor merge operations - which vendors have been merged together
    and which one is the primary vendor that all transactions should point to.
    """
    id = models.CharField(
        max_length=36,
        primary_key=True,
        help_text="UUID for the vendor merge operation."
    )
    primary_vendor = models.ForeignKey(
        Vendor,
        on_delete=models.CASCADE,
        related_name='primary_merges',
        db_index=True,
        help_text="The vendor that remains active after merging."
    )
    merged_vendor_ids = models.JSONField(
        help_text="Array of vendor IDs that have been merged into the primary vendor."
    )
    merged_descriptions = models.JSONField(
        help_text="Array of original vendor descriptions/names that were merged."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        help_text="User who performed the merge operation."
    )

    class Meta:
        verbose_name = "Vendor Merge"
        verbose_name_plural = "Vendor Merges"
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['primary_vendor']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        merged_count = len(self.merged_vendor_ids) if self.merged_vendor_ids else 0
        return f"Merge: {merged_count} vendors -> {self.primary_vendor.name}"

class VendorRule(models.Model):
    """
    Defines categorization rules for vendors with simplified direct vendor matching
    and unique vendor constraint for conflict-free rule management.
    """
    
    id = models.CharField(
        max_length=36,
        primary_key=True,
        help_text="UUID for the vendor rule."
    )
    vendor = models.ForeignKey(
        Vendor,
        on_delete=models.CASCADE,
        related_name='categorization_rules',
        db_index=True,
        help_text="The vendor this rule applies to."
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='vendor_rules',
        db_index=True,
        help_text="The category to assign when this rule matches."
    )
    is_persistent = models.BooleanField(
        default=False,
        db_index=True,
        help_text="If true, automatically assign this category to future transactions from this vendor."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Vendor Rule"
        verbose_name_plural = "Vendor Rules"
        ordering = ['-created_at']  # Newest rule wins for conflicts
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['is_persistent']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['vendor'],
                name='unique_vendor_rule'
            ),
        ]

    def __str__(self):
        persistent_text = " [Auto]" if self.is_persistent else ""
        return f"{self.vendor.name} -> {self.category.name}{persistent_text}"

class VendorMapping(models.Model):
    """
    Maps original vendor names to standardized vendor names, allowing multiple
    original names to be mapped to the same vendor for consistent categorization.
    """
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='vendor_mappings',
        db_index=True,
        help_text="User who owns this vendor mapping."
    )
    original_name = models.CharField(
        max_length=255,
        help_text="The original vendor name as it appears in transaction data."
    )
    mapped_vendor = models.CharField(
        max_length=255,
        help_text="The standardized vendor name this original name maps to."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Vendor Mapping"
        verbose_name_plural = "Vendor Mappings"
        unique_together = ('user', 'original_name')
        ordering = ['mapped_vendor', 'original_name']
        indexes = [
            models.Index(fields=['user', 'original_name']),
            models.Index(fields=['mapped_vendor']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.original_name} -> {self.mapped_vendor}"

    @classmethod
    def get_mapping_for_user(cls, user_id, original_name):
        """
        Efficiently retrieve the mapped vendor name for a given original name and user.
        Returns the mapped_vendor if found, otherwise returns the original_name.
        """
        try:
            mapping = cls.objects.get(user_id=user_id, original_name=original_name)
            return mapping.mapped_vendor
        except cls.DoesNotExist:
            return original_name

    @classmethod
    def bulk_get_mappings_for_user(cls, user_id, original_names):
        """
        Efficiently retrieve mappings for multiple original names.
        Returns a dictionary mapping original_name -> mapped_vendor.
        """
        mappings = cls.objects.filter(
            user_id=user_id,
            original_name__in=original_names
        ).values('original_name', 'mapped_vendor')
        
        return {m['original_name']: m['mapped_vendor'] for m in mappings}

class SplitTransaction(models.Model):
    """
    Represents a split portion of a parent transaction, allowing users to 
    categorize different parts of a single transaction into separate categories.
    """
    id = models.CharField(
        max_length=36,
        primary_key=True,
        help_text="UUID for the split transaction."
    )
    parent_transaction = models.ForeignKey(
        'Transaction',  # Forward reference since Transaction is defined later
        on_delete=models.CASCADE,
        related_name='split_transactions',
        db_index=True,
        help_text="The original transaction that this split belongs to."
    )
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        help_text="The amount allocated to this split (must be positive)."
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='split_transactions',
        db_index=True,
        help_text="The category assigned to this split portion."
    )
    description = models.CharField(
        max_length=500,
        help_text="Custom description for this split portion (e.g., 'Groceries portion of Walmart purchase')."
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Split Transaction"
        verbose_name_plural = "Split Transactions"
        ordering = ['parent_transaction', 'created_at']
        indexes = [
            models.Index(fields=['parent_transaction']),
            models.Index(fields=['category']),
            models.Index(fields=['created_at']),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(amount__gt=0),
                name='positive_split_amount'
            ),
        ]

    def __str__(self):
        return f"Split: {self.amount} → {self.category.name} ({self.parent_transaction.description[:30]})"

    def clean(self):
        """Validate that amount is positive and doesn't exceed parent transaction amount."""
        from django.core.exceptions import ValidationError
        
        if self.amount <= 0:
            raise ValidationError("Split amount must be positive.")
        
        if self.parent_transaction_id:
            # Check that total splits don't exceed parent transaction amount
            other_splits = SplitTransaction.objects.filter(
                parent_transaction=self.parent_transaction
            ).exclude(id=self.id)
            
            total_other_splits = sum(split.amount for split in other_splits)
            parent_amount = abs(self.parent_transaction.original_amount)
            
            if total_other_splits + self.amount > parent_amount:
                raise ValidationError(
                    f"Total split amount ({total_other_splits + self.amount}) "
                    f"cannot exceed parent transaction amount ({parent_amount})."
                )

class CustomView(models.Model):
    """
    Represents a custom user-defined view for organizing and analyzing transactions
    based on specific search criteria and custom categorization schemes.
    """
    id = models.CharField(
        max_length=36,
        primary_key=True,
        help_text="UUID for the custom view."
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='custom_views',
        db_index=True,
        help_text="User who owns this custom view."
    )
    name = models.CharField(
        max_length=255,
        help_text="Name of the custom view (e.g., 'Q4 Business Expenses', 'Vacation Planning')."
    )
    description = models.TextField(
        null=True,
        blank=True,
        help_text="Optional description of what this view is used for."
    )
    search_criteria = models.JSONField(
        help_text="JSON object containing search parameters like date ranges, vendors, amounts, etc."
    )
    is_archived = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Whether this view has been archived (hidden from active use)."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Custom View"
        verbose_name_plural = "Custom Views"
        unique_together = ('user', 'name')
        ordering = ['-updated_at', 'name']
        indexes = [
            models.Index(fields=['user', 'is_archived']),
            models.Index(fields=['created_at']),
            models.Index(fields=['updated_at']),
        ]

    def __str__(self):
        archived_text = " [Archived]" if self.is_archived else ""
        return f"{self.name} ({self.user.username}){archived_text}"

    def get_matching_transactions(self):
        """
        Apply the search criteria to find matching transactions.
        Returns a QuerySet of transactions that match this view's criteria.
        """
        from django.db.models import Q
        from datetime import datetime
        
        queryset = Transaction.objects.filter(user=self.user)
        criteria = self.search_criteria
        
        if not criteria:
            return queryset.none()
        
        # Apply date range filters
        if 'date_from' in criteria and criteria['date_from']:
            try:
                date_from = datetime.strptime(criteria['date_from'], '%Y-%m-%d').date()
                queryset = queryset.filter(transaction_date__gte=date_from)
            except ValueError:
                pass
        
        if 'date_to' in criteria and criteria['date_to']:
            try:
                date_to = datetime.strptime(criteria['date_to'], '%Y-%m-%d').date()
                queryset = queryset.filter(transaction_date__lte=date_to)
            except ValueError:
                pass
        
        # Apply amount filters
        if 'amount_min' in criteria and criteria['amount_min']:
            try:
                amount_min = Decimal(str(criteria['amount_min']))
                queryset = queryset.filter(original_amount__gte=amount_min)
            except (ValueError, TypeError):
                pass
        
        if 'amount_max' in criteria and criteria['amount_max']:
            try:
                amount_max = Decimal(str(criteria['amount_max']))
                queryset = queryset.filter(original_amount__lte=amount_max)
            except (ValueError, TypeError):
                pass
        
        # Apply vendor filters
        if 'vendor_ids' in criteria and criteria['vendor_ids']:
            vendor_ids = criteria['vendor_ids']
            if isinstance(vendor_ids, list):
                queryset = queryset.filter(vendor_id__in=vendor_ids)
        
        # Apply category filters
        if 'category_ids' in criteria and criteria['category_ids']:
            category_ids = criteria['category_ids']
            if isinstance(category_ids, list):
                queryset = queryset.filter(category_id__in=category_ids)
        
        # Apply direction filter
        if 'direction' in criteria and criteria['direction']:
            queryset = queryset.filter(direction=criteria['direction'])
        
        # Apply description search
        if 'description_contains' in criteria and criteria['description_contains']:
            search_term = criteria['description_contains']
            queryset = queryset.filter(description__icontains=search_term)
        
        return queryset.select_related('vendor', 'category').order_by('-transaction_date')

class CustomCategory(models.Model):
    """
    Represents a custom category within a specific CustomView, allowing users
    to create personalized category hierarchies for different analysis purposes.
    """
    id = models.CharField(
        max_length=36,
        primary_key=True,
        help_text="UUID for the custom category."
    )
    custom_view = models.ForeignKey(
        CustomView,
        on_delete=models.CASCADE,
        related_name='custom_categories',
        db_index=True,
        help_text="The custom view this category belongs to."
    )
    name = models.CharField(
        max_length=255,
        help_text="Name of the custom category (e.g., 'Travel Food', 'Project Expenses')."
    )
    parent = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='children',
        db_index=True,
        help_text="Parent custom category for creating hierarchy. Null for top-level categories."
    )
    order = models.IntegerField(
        default=0,
        help_text="Display order within the parent category or view."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Custom Category"
        verbose_name_plural = "Custom Categories"
        unique_together = ('custom_view', 'parent', 'name')
        ordering = ['custom_view', 'order', 'name']
        indexes = [
            models.Index(fields=['custom_view', 'parent']),
            models.Index(fields=['custom_view', 'order']),
            models.Index(fields=['parent']),
        ]

    def __str__(self):
        if self.parent:
            return f"{self.parent.name} > {self.name} ({self.custom_view.name})"
        return f"{self.name} ({self.custom_view.name})"

    def get_full_path(self):
        """Get the full hierarchical path of this category."""
        path = [self.name]
        current = self.parent
        while current:
            path.insert(0, current.name)
            current = current.parent
        return " > ".join(path)

    def get_descendants(self, include_self=False):
        """Get all descendant categories (children, grandchildren, etc.)."""
        descendants = list(self.children.all())
        if include_self:
            descendants.insert(0, self)
        
        for child in list(descendants):
            descendants.extend(child.get_descendants())
        
        return descendants

    def get_level(self):
        """Get the hierarchical level of this category (0 = root level)."""
        level = 0
        current = self.parent
        while current:
            level += 1
            current = current.parent
        return level

class Transaction(models.Model):
    SOURCE_CHOICES = [
        ('csv', 'CSV Upload'),
        ('up_bank', 'Up Bank API'),
        ('manual', 'Manual Entry'),
        # Add other sources as needed
    ]
    DIRECTION_CHOICES = [('DEBIT', 'Debit'), ('CREDIT', 'Credit'),]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='transactions', db_index=True)
    category = models.ForeignKey(Category, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions', db_index=True)
    vendor = models.ForeignKey(Vendor, on_delete=models.SET_NULL, null=True, blank=True, related_name='transactions', db_index=True)
    transaction_date = models.DateField(db_index=True)
    description = models.TextField(help_text="Description of the transaction (e.g., merchant name, notes).")

    # --- Transaction Splitting Fields ---
    is_parent_split = models.BooleanField(
        default=False,
        db_index=True,
        help_text="True if this transaction has been split into multiple categories."
    )
    parent_transaction = models.ForeignKey(
        'self',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='child_transactions',
        db_index=True,
        help_text="If this is a child transaction from a split, reference to the parent."
    )
    # --- END Transaction Splitting Fields ---

    # --- RENAMED and NEW Currency Fields ---
    original_amount = models.DecimalField( # RENAMED from 'amount'
        max_digits=12,
        decimal_places=2,
        help_text="The amount of the transaction in the original currency."
    )
    original_currency = models.CharField( # NEW Field
        max_length=3,
        db_index=True,
        help_text="ISO 4217 currency code of the original transaction (e.g., AUD, EUR)."
        # No default here, must be set during creation or migration
    )
    direction = models.CharField(max_length=10, choices=DIRECTION_CHOICES) # Kept direction field
    aud_amount = models.DecimalField( # NEW Field for AUD equivalent
        max_digits=12,      # Match original_amount or adjust if needed
        decimal_places=2,
        null=True,          # Allow NULL if conversion fails or for old data
        blank=True,
        help_text="The equivalent amount of the transaction in AUD, converted using the rate on the transaction date."
    )
    exchange_rate_to_aud = models.DecimalField( # NEW Field for the rate
        max_digits=18,      # Allow for sufficient precision in exchange rates
        decimal_places=9,   # Allow for sufficient precision
        null=True,
        blank=True,
        help_text="Exchange rate used to convert original_amount to aud_amount (Original Currency to AUD)."
    )
    
    # Account-based currency tracking
    account_base_currency = models.CharField(
        max_length=3,
        default='AUD',
        db_index=True,
        help_text="Currency of the source account (e.g., AUD for Up Bank, EUR for ING Bank CSV uploads)."
    )
    
    # Currency conversion tracking fields
    is_aud_conversion_manual = models.BooleanField(
        default=False,
        help_text="Whether the AUD conversion was manually set by a user or automatically calculated."
    )
    manual_conversion_note = models.TextField(
        null=True,
        blank=True,
        help_text="Optional note explaining the manual conversion reasoning."
    )
    # --- END RENAMED and NEW Currency Fields ---

    # --- Fields from CSV/Bank (Keep as is) ---
    source_account_identifier = models.CharField(max_length=50, null=True, blank=True)
    counterparty_identifier = models.CharField(max_length=50, null=True, blank=True)
    source_code = models.CharField(max_length=10, null=True, blank=True)
    source_type = models.CharField(max_length=50, null=True, blank=True)
    source_notifications = models.TextField(null=True, blank=True)

    # --- Fields for Integration/Metadata (Keep as is) ---
    source = models.CharField(max_length=20, choices=SOURCE_CHOICES, default='csv', db_index=True, help_text="Source from which this transaction was created.")
    bank_transaction_id = models.CharField(max_length=255, null=True, blank=True, db_index=True, help_text="Unique transaction ID provided by the bank API (if applicable).")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    last_modified = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-transaction_date', '-created_at']
        indexes = [
            models.Index(fields=['user', 'transaction_date']),
            models.Index(fields=['user', 'category']),
            models.Index(fields=['user', 'vendor']),
            models.Index(fields=['transaction_date', 'original_currency']),
            models.Index(fields=['source', 'user']),
            models.Index(fields=['is_parent_split']),
            models.Index(fields=['parent_transaction']),
            models.Index(fields=['bank_transaction_id']),
            models.Index(fields=['original_currency', 'transaction_date']),
            models.Index(fields=['user', 'created_at']),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(original_amount__gt=0),
                name='positive_original_amount'
            ),
            models.CheckConstraint(
                condition=models.Q(aud_amount__isnull=True) | models.Q(aud_amount__gt=0),
                name='positive_aud_amount_when_present'
            ),
            models.CheckConstraint(
                condition=models.Q(exchange_rate_to_aud__isnull=True) | models.Q(exchange_rate_to_aud__gt=0),
                name='positive_exchange_rate_when_present'
            ),
        ]

    def __str__(self):
        # Update string representation if desired
        direction_symbol = '-' if self.direction == 'DEBIT' else '+'
        # Display original amount/currency
        orig_display = f"{direction_symbol}{self.original_amount} {self.original_currency or '???'}"
        # Optionally add AUD amount if different and available
        aud_display = ""
        if self.original_currency != 'AUD' and self.aud_amount is not None:
            aud_display = f" (~{direction_symbol}{self.aud_amount} AUD)"
        return f"{self.transaction_date} | {self.user.username} | {self.description[:30]} | {orig_display}{aud_display} ({self.source})"

    @property
    def signed_original_amount(self):
        """Returns the original amount with correct sign based on direction."""
        # Ensure original_amount is Decimal before negation
        amount = self.original_amount if isinstance(self.original_amount, Decimal) else Decimal(0)
        return -amount if self.direction == 'DEBIT' else amount

    @property
    def signed_aud_amount(self):
        """Returns the AUD amount with correct sign, or None."""
        if self.aud_amount is None:
            return None
        amount = self.aud_amount # Already Decimal
        return -amount if self.direction == 'DEBIT' else amount

    @property
    def account_amount(self):
        """Get the amount in the account's base currency"""
        if self.source == 'up_bank':
            return self.aud_amount or Decimal('0')  # Up Bank provides authoritative AUD amount
        elif self.account_base_currency == self.original_currency:
            return self.original_amount  # CSV upload in account's currency
        else:
            # Fallback: convert if somehow original_currency differs from account_base_currency
            return self.aud_amount if self.aud_amount else self.original_amount

    @property
    def signed_account_amount(self):
        """Returns the account amount with correct sign based on direction."""
        amount = self.account_amount if isinstance(self.account_amount, Decimal) else Decimal(0)
        return -amount if self.direction == 'DEBIT' else amount

    # --- Split Transaction Helper Methods ---
    @property
    def total_split_amount(self):
        """Calculate the total amount allocated to splits for this transaction."""
        if not self.is_parent_split:
            return Decimal('0')
        return sum(split.amount for split in self.split_transactions.all())

    @property
    def remaining_split_amount(self):
        """Calculate how much of the transaction amount is not yet allocated to splits."""
        parent_amount = abs(self.original_amount)
        return parent_amount - self.total_split_amount

    @property
    def is_fully_split(self):
        """Check if the transaction has been completely allocated to splits."""
        return self.is_parent_split and self.remaining_split_amount <= Decimal('0.01')  # Allow for rounding

    def can_add_split(self, amount):
        """Check if a split of the given amount can be added to this transaction."""
        if not isinstance(amount, Decimal):
            amount = Decimal(str(amount))
        return self.remaining_split_amount >= amount

    def get_effective_category(self):
        """
        Get the effective category for this transaction.
        For split transactions, returns None since category is determined by splits.
        For regular transactions, returns the assigned category.
        """
        if self.is_parent_split:
            return None  # Category is determined by individual splits
        return self.category

    def get_split_summary(self):
        """Get a summary of all splits for this transaction."""
        if not self.is_parent_split:
            return None
        
        splits = self.split_transactions.select_related('category').all()
        return {
            'total_splits': len(splits),
            'total_amount': self.total_split_amount,
            'remaining_amount': self.remaining_split_amount,
            'is_fully_split': self.is_fully_split,
            'splits': [
                {
                    'id': split.id,
                    'amount': split.amount,
                    'category': split.category.name,
                    'description': split.description
                }
                for split in splits
            ]
        }
    # --- END Split Transaction Helper Methods ---

    def update_aud_amount_if_needed(self, force_recalculation=False):
        """
        Calculates and updates the aud_amount and exchange_rate_to_aud fields
        if aud_amount is None or if force_recalculation is True.
        Saves the instance if changes are made.
        Uses the new get_historical_rate service.
        """
        from .services import get_historical_rate # <-- ADD IMPORT HERE

        if not force_recalculation and self.aud_amount is not None:
            logger.debug(f"Transaction {self.id}: AUD amount already exists ({self.aud_amount}) and force_recalculation is false. Skipping.")
            return True # Indicates AUD amount is present

        logger.info(f"Transaction {self.id}: Attempting to update AUD amount. Original: {self.original_amount} {self.original_currency}. Date: {self.transaction_date}")

        # Preserve current values in case of failure to find new rate during forced recalc
        original_aud_amount = self.aud_amount
        original_exchange_rate = self.exchange_rate_to_aud

        # Assume failure or no change initially
        self.aud_amount = None 
        self.exchange_rate_to_aud = None

        if self.original_currency.upper() == BASE_CURRENCY_FOR_CONVERSION:
            self.aud_amount = self.original_amount
            self.exchange_rate_to_aud = Decimal("1.0")
            logger.info(f"Transaction {self.id}: Original currency is BASE ({BASE_CURRENCY_FOR_CONVERSION}). Set aud_amount to {self.aud_amount}.")
        else:
            # Use the new service. lookup_date is self.transaction_date (which is already a date object)
            # from_currency is self.original_currency
            # to_currency is BASE_CURRENCY_FOR_CONVERSION
            fetched_rate = get_historical_rate(
                self.transaction_date, 
                self.original_currency, 
                BASE_CURRENCY_FOR_CONVERSION
            )

            if fetched_rate is not None:
                self.exchange_rate_to_aud = fetched_rate # This is the rate FROM original_currency TO AUD
                # To get aud_amount, we MULTIPLY original_amount by (original_currency_TO_AUD_rate)
                self.aud_amount = (self.original_amount * self.exchange_rate_to_aud).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)
                logger.info(f"Transaction {self.id}: Converted to AUD using new service. Rate ({self.original_currency}->AUD): {self.exchange_rate_to_aud}, AUD Amount: {self.aud_amount}.")
            else:
                logger.warning(f"Transaction {self.id}: Failed to fetch exchange rate for {self.original_currency} to {BASE_CURRENCY_FOR_CONVERSION} on {self.transaction_date} using new service. AUD amount will be None.")
                # If force_recalculation was true and we failed to get a new rate, 
                # we should revert to original values if they existed, otherwise keep as None.
                if force_recalculation and original_aud_amount is not None:
                    self.aud_amount = original_aud_amount
                    self.exchange_rate_to_aud = original_exchange_rate
                    logger.info(f"Transaction {self.id}: Forced recalculation failed, reverting to original AUD amount: {self.aud_amount}")
                # else, aud_amount remains None (either it was already None, or force_recalc nullified it and failed to find new)

        # Determine if a change occurred or if a value was set where previously None
        # Only save if aud_amount is now populated, or if it was forced and values changed from original.
        # Or, simpler, if aud_amount or exchange_rate_to_aud has changed from the start of the method call.
        
        should_save = False
        if self.aud_amount is not None: # A value was successfully calculated
            if original_aud_amount != self.aud_amount or original_exchange_rate != self.exchange_rate_to_aud:
                should_save = True
        elif force_recalculation and original_aud_amount is not None: # Was forced, failed, and reverted to a non-None original.
             # Check if it actually reverted or if original was also None (though aud_amount is already None here)
             # This condition is a bit tricky. If it was forced, and now aud_amount is None, but original_aud_amount was not None,
             # it implies a change (from something to None). BUT we reverted above. So we save if the current state is different than initial.
             if original_aud_amount is not None or original_exchange_rate is not None: # if there was an original value
                if self.aud_amount != original_aud_amount or self.exchange_rate_to_aud != original_exchange_rate:
                    should_save = True # Should save because it was nullified from a previous value

        if should_save:
            try:
                self.save(update_fields=['aud_amount', 'exchange_rate_to_aud', 'updated_at'])
                logger.debug(f"Transaction {self.id}: Saved updated AUD amount and exchange rate.")
                return True
            except Exception as e:
                logger.error(f"Transaction {self.id}: Failed to save updated AUD amount: {e}")
                # Revert to original values on save failure to maintain data integrity
                self.aud_amount = original_aud_amount
                self.exchange_rate_to_aud = original_exchange_rate
                return False # Save failed
        else:
            logger.debug(f"Transaction {self.id}: No changes to AUD amount or rate, or still None. Not saved. Current AUD: {self.aud_amount}")
            return self.aud_amount is not None # Return true if AUD amount is populated (even if unchanged), false if None

# --- Keep existing DescriptionMapping model ---
class DescriptionMapping(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='description_mappings'
    )
    original_description = models.TextField(
        db_index=True,
        help_text="The exact description text as it appears in uploads (e.g., CSV)."
    )
    clean_name = models.CharField(
        max_length=255,
        help_text="The user-defined clean name for this vendor/description (e.g., 'Coffee Shop')."
    )
    assigned_category = models.ForeignKey(
        Category, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='mapped_descriptions',
        help_text="The category to automatically assign to transactions with the original description."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = ('user', 'original_description')
        ordering = ['original_description']
        verbose_name = "Description Mapping"
        verbose_name_plural = "Description Mappings"
        indexes = [
            models.Index(fields=['user']),
            models.Index(fields=['assigned_category']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"'{self.original_description}' -> '{self.clean_name}' ({self.user.username})"

# --- NEW: Model for Storing Historical Exchange Rates ---
class HistoricalExchangeRate(models.Model):
    """
    Stores historical exchange rates, primarily loaded from a CSV file.
    Rates are stored relative to a source_currency (e.g., AUD) to a target_currency.
    """
    date = models.DateField(
        db_index=True,
        help_text="The date for which this exchange rate is valid."
    )
    source_currency = models.CharField(
        max_length=3,
        db_index=True,
        help_text="The source currency code (e.g., AUD)."
    )
    target_currency = models.CharField(
        max_length=3,
        db_index=True,
        help_text="The target currency code (e.g., USD, EUR)."
    )
    rate = models.DecimalField(
        max_digits=18,  # Sufficient for various exchange rates
        decimal_places=9, # Standard for many rate providers
        help_text="The exchange rate: 1 unit of source_currency equals this many units of target_currency."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Historical Exchange Rate"
        verbose_name_plural = "Historical Exchange Rates"
        unique_together = ('date', 'source_currency', 'target_currency')
        ordering = ['-date', 'source_currency', 'target_currency'] # Most recent first
        indexes = [
            models.Index(fields=['date', 'source_currency']),
            models.Index(fields=['source_currency', 'target_currency']),
            models.Index(fields=['date']),
        ]
        constraints = [
            models.CheckConstraint(
                condition=models.Q(rate__gt=0),
                name='positive_exchange_rate'
            ),
        ]

    def __str__(self):
        return f"{self.date}: 1 {self.source_currency} = {self.rate} {self.target_currency}"