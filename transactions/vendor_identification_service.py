"""
Vendor identification service for FundFlow transactions.

This module implements vendor identification and assignment based on transaction descriptions
and counterparty information, with pattern matching and automatic vendor creation.
"""

import logging
import re
from typing import List, Dict, Optional, Tuple
from django.db import transaction as db_transaction
from django.db.models import Q, QuerySet
from django.utils import timezone

from .models import Transaction, Vendor

logger = logging.getLogger(__name__)


class VendorIdentificationResult:
    """Result object for vendor identification operations."""
    
    def __init__(self):
        self.identified_count = 0
        self.created_vendors_count = 0
        self.skipped_count = 0
        self.error_count = 0
        
        # For detailed tracking
        self.identified_transactions: List[int] = []
        self.created_vendors: List[str] = []  # vendor names
        self.skipped_transactions: Dict[int, str] = {}  # transaction_id -> reason
        self.errors: List[Dict[str, any]] = []
        
    def add_identified(self, transaction_id: int, vendor_name: str, is_new_vendor: bool = False):
        """Record a successful vendor identification."""
        self.identified_count += 1
        self.identified_transactions.append(transaction_id)
        
        if is_new_vendor and vendor_name not in self.created_vendors:
            self.created_vendors.append(vendor_name)
            self.created_vendors_count += 1
            
    def add_skip(self, transaction_id: int, reason: str):
        """Record a skipped transaction."""
        self.skipped_count += 1
        self.skipped_transactions[transaction_id] = reason
        logger.debug(f"Skipped transaction {transaction_id}: {reason}")
        
    def add_error(self, transaction_id: int, error: str, exception: Exception = None):
        """Record an error."""
        self.error_count += 1
        self.errors.append({
            'transaction_id': transaction_id,
            'error': error,
            'exception': str(exception) if exception else None
        })
        logger.error(f"Error processing transaction {transaction_id}: {error}")
        
    @property
    def total_processed(self) -> int:
        return self.identified_count + self.skipped_count + self.error_count
        
    def to_dict(self) -> Dict[str, any]:
        """Convert result to dictionary for API responses."""
        return {
            'identified_count': self.identified_count,
            'created_vendors_count': self.created_vendors_count,
            'skipped_count': self.skipped_count,
            'error_count': self.error_count,
            'total_processed': self.total_processed,
            'created_vendors': self.created_vendors,
            'errors': self.errors
        }


class VendorIdentificationService:
    """Service for identifying and assigning vendors to transactions."""
    
    def __init__(self, user):
        self.user = user
        self.logger = logger
        
    def identify_vendors_for_transactions(self, transactions: QuerySet) -> VendorIdentificationResult:
        """
        Identify and assign vendors to transactions based on descriptions and counterparty info.
        
        Args:
            transactions: QuerySet of transactions to process
            
        Returns:
            VendorIdentificationResult with identification statistics
        """
        result = VendorIdentificationResult()
        
        # Get transactions that don't have vendors assigned
        transactions = transactions.filter(vendor__isnull=True).order_by('transaction_date', 'id')
        transaction_count = transactions.count()
        
        self.logger.info(f"User {self.user.id}: Starting vendor identification for {transaction_count} transactions")
        
        if transaction_count == 0:
            self.logger.info(f"User {self.user.id}: No transactions need vendor identification")
            return result
            
        # Get applicable vendors for this user
        vendors = self._get_applicable_vendors()
        vendor_count = vendors.count()
        
        self.logger.info(f"User {self.user.id}: Found {vendor_count} applicable vendors")
        
        # Process transactions in batches
        batch_size = 100
        for i in range(0, transaction_count, batch_size):
            batch = transactions[i:i + batch_size]
            self._process_transaction_batch(batch, vendors, result)
            
        self.logger.info(f"User {self.user.id}: Vendor identification complete. "
                        f"Identified: {result.identified_count}, "
                        f"Created: {result.created_vendors_count}, "
                        f"Skipped: {result.skipped_count}, "
                        f"Errors: {result.error_count}")
        
        return result
        
    def identify_vendor_for_single_transaction(self, transaction: Transaction) -> Optional[Vendor]:
        """
        Identify and assign vendor for a single transaction.
        
        Args:
            transaction: Transaction to identify vendor for
            
        Returns:
            Vendor that was assigned, or None if no vendor could be identified
        """
        if transaction.vendor:
            self.logger.debug(f"Transaction {transaction.id} already has vendor {transaction.vendor.name}")
            return transaction.vendor
            
        # Get applicable vendors
        vendors = self._get_applicable_vendors()
        
        # Try to find matching vendor
        vendor = self._find_matching_vendor(transaction, vendors)
        
        if vendor:
            # Assign vendor to transaction
            try:
                with db_transaction.atomic():
                    transaction.vendor = vendor
                    transaction.save(update_fields=['vendor', 'updated_at'])
                    
                    self.logger.info(f"User {self.user.id}: Assigned vendor {vendor.name} to transaction {transaction.id}")
                    return vendor
                    
            except Exception as e:
                self.logger.error(f"Error assigning vendor {vendor.name} to transaction {transaction.id}: {e}")
                return None
        else:
            # Try to create a new vendor based on description/counterparty
            vendor = self._create_vendor_from_transaction(transaction)
            if vendor:
                try:
                    with db_transaction.atomic():
                        transaction.vendor = vendor
                        transaction.save(update_fields=['vendor', 'updated_at'])
                        
                        self.logger.info(f"User {self.user.id}: Created and assigned new vendor {vendor.name} to transaction {transaction.id}")
                        return vendor
                        
                except Exception as e:
                    self.logger.error(f"Error assigning new vendor {vendor.name} to transaction {transaction.id}: {e}")
                    return None
                    
        return None
        
    def _get_applicable_vendors(self) -> QuerySet:
        """Get vendors applicable to this user."""
        return Vendor.objects.filter(
            user=self.user  # Only user's vendors
        ).order_by('-created_at')
        
    def _process_transaction_batch(self, transactions: QuerySet, vendors: QuerySet, 
                                 result: VendorIdentificationResult) -> None:
        """Process a batch of transactions for vendor identification."""
        for transaction in transactions:
            try:
                # Skip if already has vendor (shouldn't happen due to filtering)
                if transaction.vendor:
                    result.add_skip(transaction.id, f"Already has vendor {transaction.vendor.name}")
                    continue
                    
                # Try to find matching vendor
                vendor = self._find_matching_vendor(transaction, vendors)
                
                if vendor:
                    # Assign existing vendor
                    transaction.vendor = vendor
                    transaction.save(update_fields=['vendor', 'updated_at'])
                    result.add_identified(transaction.id, vendor.name)
                    
                    self.logger.debug(f"Assigned existing vendor {vendor.name} to transaction {transaction.id}")
                else:
                    # Try to create new vendor
                    vendor = self._create_vendor_from_transaction(transaction)
                    if vendor:
                        transaction.vendor = vendor
                        transaction.save(update_fields=['vendor', 'updated_at'])
                        result.add_identified(transaction.id, vendor.name, is_new_vendor=True)
                        
                        self.logger.debug(f"Created and assigned new vendor {vendor.name} to transaction {transaction.id}")
                    else:
                        result.add_skip(transaction.id, "Could not identify or create vendor")
                        
            except Exception as e:
                result.add_error(transaction.id, str(e), e)
                
    def _find_matching_vendor(self, transaction: Transaction, vendors: QuerySet) -> Optional[Vendor]:
        """Find a matching vendor for the transaction."""
        description = transaction.description.lower()
        counterparty = getattr(transaction, 'counterparty', '').lower() if hasattr(transaction, 'counterparty') else ''
        
        # Check each vendor's patterns
        for vendor in vendors:
            if self._vendor_matches_transaction(vendor, description, counterparty):
                return vendor
                
        return None
        
    def _vendor_matches_transaction(self, vendor: Vendor, description: str, counterparty: str) -> bool:
        """Check if a vendor matches the transaction description/counterparty."""
        # Check vendor name
        if vendor.name.lower() in description or vendor.name.lower() in counterparty:
            return True
            
        # Check display name
        if vendor.display_name and (vendor.display_name.lower() in description or vendor.display_name.lower() in counterparty):
            return True
            
        # Check description patterns
        if vendor.description_patterns:
            for pattern in vendor.description_patterns:
                if isinstance(pattern, str):
                    pattern_lower = pattern.lower()
                    if pattern_lower in description or pattern_lower in counterparty:
                        return True
                        
        return False
        
    def _create_vendor_from_transaction(self, transaction: Transaction) -> Optional[Vendor]:
        """Create a new vendor based on transaction description/counterparty."""
        # Extract potential vendor name from description
        vendor_name = self._extract_vendor_name_from_description(transaction.description)
        
        if not vendor_name:
            # Check if transaction has counterparty field
            if hasattr(transaction, 'counterparty') and transaction.counterparty:
                vendor_name = self._clean_vendor_name(transaction.counterparty)
            
        if not vendor_name:
            return None
            
        # Check if vendor with this name already exists
        existing_vendor = Vendor.objects.filter(
            Q(user__isnull=True) | Q(user=self.user),
            name__iexact=vendor_name
        ).first()
        
        if existing_vendor:
            return existing_vendor
            
        # Create new vendor
        try:
            vendor = Vendor.objects.create(
                name=vendor_name,
                display_name=vendor_name,
                description_patterns=[transaction.description],
                user=self.user
            )
            
            self.logger.info(f"User {self.user.id}: Created new vendor '{vendor_name}' from transaction {transaction.id}")
            return vendor
            
        except Exception as e:
            self.logger.error(f"Error creating vendor '{vendor_name}': {e}")
            return None
            
    def _extract_vendor_name_from_description(self, description: str) -> Optional[str]:
        """Extract vendor name from transaction description."""
        # Common patterns for vendor names in transaction descriptions
        
        # Remove common prefixes/suffixes
        cleaned = description.strip()
        
        # Remove common transaction codes and patterns
        patterns_to_remove = [
            r'\b\d{4}\*+\d{4}\b',  # Card numbers like 1234****5678
            r'\b\d{2}/\d{2}\b',    # Dates like 12/25
            r'\bPOS\b',            # Point of sale
            r'\bEFTPOS\b',         # EFTPOS
            r'\bVISA\b',           # VISA
            r'\bMC\b',             # MasterCard
            r'\bMASTERCARD\b',     # MasterCard
            r'\bAU\b',             # Australia
            r'\b[A-Z]{2,3}\d+\b',  # Transaction codes
        ]
        
        for pattern in patterns_to_remove:
            cleaned = re.sub(pattern, '', cleaned, flags=re.IGNORECASE)
            
        # Split by common delimiters and take the first meaningful part
        delimiters = [' - ', ' / ', ' \\ ', '  ', ' * ', ' # ']
        for delimiter in delimiters:
            if delimiter in cleaned:
                parts = cleaned.split(delimiter)
                for part in parts:
                    part = part.strip()
                    if len(part) > 2 and not part.isdigit():
                        return self._clean_vendor_name(part)
                        
        # If no delimiters, clean the whole description
        return self._clean_vendor_name(cleaned)
        
    def _clean_vendor_name(self, name: str) -> Optional[str]:
        """Clean and validate vendor name."""
        if not name:
            return None
            
        # Remove extra whitespace
        cleaned = ' '.join(name.split())
        
        # Remove common suffixes
        suffixes_to_remove = [
            'PTY LTD',
            'LIMITED',
            'LTD',
            'AUSTRALIA',
            'AU',
            'STORE',
            'SHOP',
        ]
        
        for suffix in suffixes_to_remove:
            if cleaned.upper().endswith(' ' + suffix):
                cleaned = cleaned[:-len(suffix)-1].strip()
                
        # Validate length and content
        if len(cleaned) < 2 or len(cleaned) > 100:
            return None
            
        # Don't create vendors for generic terms
        generic_terms = [
            'PAYMENT',
            'TRANSFER',
            'WITHDRAWAL',
            'DEPOSIT',
            'CREDIT',
            'DEBIT',
            'REFUND',
            'CASH',
            'ATM',
            'BANK',
            'TRANSACTION',
            'PURCHASE',
            'SALE',
        ]
        
        if cleaned.upper() in generic_terms:
            return None
            
        return cleaned


def identify_vendors_for_user_transactions(user, transactions: QuerySet = None) -> VendorIdentificationResult:
    """
    Convenience function to identify vendors for user transactions.
    
    Args:
        user: User whose transactions to process
        transactions: Optional queryset of specific transactions to process
        
    Returns:
        VendorIdentificationResult with operation results
    """
    service = VendorIdentificationService(user)
    
    if transactions is None:
        transactions = Transaction.objects.filter(user=user)
        
    return service.identify_vendors_for_transactions(transactions)


def identify_vendor_for_single_transaction(transaction: Transaction) -> Optional[Vendor]:
    """
    Convenience function to identify vendor for a single transaction.
    
    Args:
        transaction: Transaction to identify vendor for
        
    Returns:
        Vendor that was assigned, or None if no vendor could be identified
    """
    service = VendorIdentificationService(transaction.user)
    return service.identify_vendor_for_single_transaction(transaction) 