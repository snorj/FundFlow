"""
Auto-categorization service for FundFlow transactions.

This module implements the simplified core algorithm for automatically categorizing transactions
based on vendor rules with direct vendor matching and newest-rule-wins conflict resolution.
"""

import logging
from typing import List, Dict, Optional, Any
from decimal import Decimal
from django.db import transaction as db_transaction
from django.db.models import Q, QuerySet
from django.utils import timezone

from .models import Transaction, VendorRule, Vendor, Category, VendorMapping

logger = logging.getLogger(__name__)


class AutoCategorizationResult:
    """Result object for auto-categorization operations."""
    
    def __init__(self):
        self.categorized_count = 0
        self.skipped_count = 0
        self.error_count = 0 
        self.categorized_transactions: List[int] = []
        self.errors: List[Dict[str, Any]] = []
        self.rules_applied: Dict[str, int] = {}  # rule_id -> count
        
        # For API response formatting
        self.successes: Dict[int, str] = {}  # transaction_id -> rule_id
        self.skips: Dict[int, str] = {}      # transaction_id -> reason
        self.error_details: Dict[int, str] = {}  # transaction_id -> error message
        
    def add_success(self, transaction_id: int, rule_id: str):
        """Record a successful categorization."""
        self.categorized_count += 1
        self.categorized_transactions.append(transaction_id)
        self.rules_applied[rule_id] = self.rules_applied.get(rule_id, 0) + 1
        self.successes[transaction_id] = rule_id
        
    def add_skip(self, transaction_id: int, reason: str):
        """Record a skipped transaction."""
        self.skipped_count += 1
        self.skips[transaction_id] = reason
        logger.debug(f"Skipped transaction {transaction_id}: {reason}")
        
    def add_error(self, transaction_id: int, error: str, exception: Exception = None):
        """Record an error during categorization."""
        self.error_count += 1
        self.errors.append({
            'transaction_id': transaction_id,
            'error': error,
            'exception_type': type(exception).__name__ if exception else None
        })
        self.error_details[transaction_id] = error
        logger.error(f"Error categorizing transaction {transaction_id}: {error}")
        
    def to_dict(self) -> Dict[str, Any]:
        """Convert result to dictionary for API responses."""
        return {
            'categorized_count': self.categorized_count,
            'skipped_count': self.skipped_count,  
            'error_count': self.error_count,
            'categorized_transactions': self.categorized_transactions,
            'rules_applied': self.rules_applied,
            'errors': self.errors
        }

    @property
    def total_processed(self) -> int:
        """Total number of transactions processed."""
        return self.categorized_count + self.skipped_count + self.error_count


class AutoCategorizationService:
    """Service for auto-categorizing transactions based on simplified vendor rules."""
    
    def __init__(self, user):
        self.user = user
        self.logger = logger
        
    def categorize_transactions(self, transactions: QuerySet = None, 
                              force_recategorize: bool = False) -> AutoCategorizationResult:
        """
        Auto-categorize transactions based on vendor rules using direct vendor matching.
        
        Args:
            transactions: QuerySet of transactions to categorize. If None, processes all user's transactions.
            force_recategorize: If True, recategorize already categorized transactions.
            
        Returns:
            AutoCategorizationResult with categorization statistics and results.
        """
        result = AutoCategorizationResult()
        
        # Get transactions to process
        if transactions is None:
            transactions = Transaction.objects.filter(user=self.user)
            
        # Filter out already categorized transactions unless force_recategorize is True
        if not force_recategorize:
            transactions = transactions.filter(category__isnull=True)
            
        # Filter out hidden transactions
        transactions = transactions.filter(is_hidden=False)
            
        transactions = transactions.select_related('vendor', 'category').order_by('transaction_date', 'id')
        
        transaction_count = transactions.count()
        self.logger.info(f"User {self.user.id}: Starting simplified auto-categorization for {transaction_count} transactions "
                        f"(force_recategorize={force_recategorize})")
        
        if transaction_count == 0:
            self.logger.info(f"User {self.user.id}: No transactions to categorize")
            return result
            
        # Get applicable vendor rules for this user (newest-rule-wins ordering)
        vendor_rules = self._get_applicable_vendor_rules()
        rule_count = vendor_rules.count()
        
        self.logger.info(f"User {self.user.id}: Found {rule_count} applicable vendor rules")
        
        if rule_count == 0:
            result.skipped_count = transaction_count
            self.logger.info(f"User {self.user.id}: No vendor rules found, skipping all transactions")
            return result
            
        # Process transactions in batches for performance
        batch_size = 100
        processed = 0
        
        with db_transaction.atomic():
            for i in range(0, transaction_count, batch_size):
                batch = transactions[i:i + batch_size]
                self._process_transaction_batch(batch, vendor_rules, result)
                processed += len(batch)
                
                if processed % 500 == 0:  # Log progress every 500 transactions
                    self.logger.info(f"User {self.user.id}: Processed {processed}/{transaction_count} transactions")
                    
        self.logger.info(f"User {self.user.id}: Simplified auto-categorization complete. "
                        f"Categorized: {result.categorized_count}, "
                        f"Skipped: {result.skipped_count}, "
                        f"Errors: {result.error_count}")
        
        return result
        
    def categorize_single_transaction(self, transaction: Transaction, 
                                    force_recategorize: bool = False) -> Optional[VendorRule]:
        """
        Auto-categorize a single transaction using direct vendor name matching.
        
        Args:
            transaction: Transaction instance to categorize
            force_recategorize: If True, recategorize even if already categorized
            
        Returns:
            VendorRule that was applied, or None if no rule matched
        """
        # Check if already categorized
        if transaction.category and not force_recategorize:
            self.logger.debug(f"Transaction {transaction.id} already categorized, skipping")
            return None
            
        # Check if transaction has a vendor name
        if not transaction.vendor_name:
            self.logger.debug(f"Transaction {transaction.id} has no vendor name, skipping")
            return None
            
        # Find matching rule using simplified logic
        matching_rule = self._find_matching_rule(transaction)
        
        if not matching_rule:
            self.logger.debug(f"No matching rule found for transaction {transaction.id}")
            return None
            
        # Apply the rule
        try:
            with db_transaction.atomic():
                transaction.category = matching_rule.category
                transaction.auto_categorized = True  # Mark as auto-categorized
                transaction.save(update_fields=['category', 'auto_categorized', 'updated_at'])
                
                self.logger.info(f"User {self.user.id}: Auto-categorized transaction {transaction.id} "
                               f"using rule {matching_rule.id} "
                               f"({transaction.vendor_name} -> {matching_rule.category.name})")
                
                return matching_rule
                
        except Exception as e:
            self.logger.error(f"Error applying rule {matching_rule.id} to transaction {transaction.id}: {e}")
            return None
            
    def _get_applicable_vendor_rules(self) -> QuerySet:
        """Get vendor rules applicable to this user, ordered by newest-first for newest-rule-wins."""
        from django.db.models import Q
        
        return VendorRule.objects.filter(
            Q(vendor__user=self.user) &  # User's vendors only
            (Q(category__user__isnull=True) | Q(category__user=self.user)) &  # System or user's categories
            Q(is_persistent=True)  # Only apply persistent rules automatically
        ).select_related('vendor', 'category').order_by('-updated_at').distinct()  # Newest rule wins
        
    def _process_transaction_batch(self, transactions: QuerySet, vendor_rules: QuerySet, 
                                 result: AutoCategorizationResult) -> None:
        """Process a batch of transactions for categorization using vendor name matching."""
        for transaction in transactions:
            try:
                # Skip if no vendor name
                if not transaction.vendor_name:
                    result.add_skip(transaction.id, "No vendor name")
                    continue
                    
                # Skip if already categorized (double-check)
                if transaction.category:
                    result.add_skip(transaction.id, f"Already categorized as {transaction.category.name}")
                    continue
                    
                # Find matching rule using vendor name matching
                matching_rule = self._find_matching_rule_from_queryset(transaction, vendor_rules)
                
                if not matching_rule:
                    result.add_skip(transaction.id, f"No matching rule for vendor '{transaction.vendor_name}'")
                    continue
                    
                # Apply the rule
                transaction.category = matching_rule.category
                transaction.auto_categorized = True  # Mark as auto-categorized
                transaction.save(update_fields=['category', 'auto_categorized', 'updated_at'])
                
                result.add_success(transaction.id, matching_rule.id)
                
                self.logger.debug(f"Applied rule {matching_rule.id} to transaction {transaction.id}")
                
            except Exception as e:
                result.add_error(transaction.id, str(e), e)
                
    def _find_matching_rule(self, transaction: Transaction) -> Optional[VendorRule]:
        """Find the best matching vendor rule for a transaction using vendor name matching."""
        if not transaction.vendor_name:
            return None
            
        vendor_rules = self._get_applicable_vendor_rules()
        # Find vendor rules by matching vendor names
        matching_rules = vendor_rules.filter(vendor__name__iexact=transaction.vendor_name)
        
        # Return the first (newest) rule for this vendor name (newest-rule-wins)
        return matching_rules.first()
        
    def _find_matching_rule_from_queryset(self, transaction: Transaction, 
                                        vendor_rules: QuerySet) -> Optional[VendorRule]:
        """Find the best matching rule from a queryset using vendor name matching."""
        if not transaction.vendor_name:
            return None
            
        # Filter rules for this vendor name - case-insensitive matching
        matching_rules = vendor_rules.filter(vendor__name__iexact=transaction.vendor_name)
        
        # Return the first (newest) rule for this vendor name (newest-rule-wins)
        return matching_rules.first()
        
    def get_categorization_suggestions(self, transaction: Transaction) -> List[Dict[str, Any]]:
        """
        Get categorization suggestions for a transaction without applying them.
        
        Args:
            transaction: Transaction to get suggestions for
            
        Returns:
            List of suggestion dictionaries with rule details
        """
        suggestions = []
        
        if not transaction.vendor_name:
            return suggestions
            
        # Get all applicable rules for this vendor name (case-insensitive matching)
        vendor_rules = self._get_applicable_vendor_rules().filter(
            vendor__name__iexact=transaction.vendor_name
        )
        
        for rule in vendor_rules:
            suggestions.append({
                'rule_id': rule.id,
                'category_id': rule.category.id,
                'category_name': rule.category.name,
                'vendor_name': rule.vendor.name,
                'is_persistent': rule.is_persistent,
                'created_at': rule.created_at.isoformat(),
                'updated_at': rule.updated_at.isoformat()
            })
                
        # Sort by newest first (newest-rule-wins)
        suggestions.sort(key=lambda x: x['updated_at'], reverse=True)
        
        return suggestions


def auto_categorize_user_transactions(user, transactions: QuerySet = None, 
                                    force_recategorize: bool = False) -> AutoCategorizationResult:
    """
    Convenience function to auto-categorize transactions for a user using simplified logic.
    
    Args:
        user: User whose transactions to categorize
        transactions: Optional queryset of specific transactions to categorize
        force_recategorize: Whether to recategorize already categorized transactions
        
    Returns:
        AutoCategorizationResult with operation results
    """
    service = AutoCategorizationService(user)
    return service.categorize_transactions(transactions, force_recategorize)


def auto_categorize_single_transaction(transaction: Transaction, 
                                     force_recategorize: bool = False) -> Optional[VendorRule]:
    """
    Convenience function to auto-categorize a single transaction using simplified logic.
    
    Args:
        transaction: Transaction to categorize
        force_recategorize: Whether to recategorize if already categorized
        
    Returns:
        VendorRule that was applied, or None if no rule matched  
    """
    service = AutoCategorizationService(transaction.user)
    return service.categorize_single_transaction(transaction, force_recategorize)