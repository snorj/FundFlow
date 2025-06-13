/**
 * Review Workflow Utility Functions
 * 
 * Provides helper functions for transaction review business logic including
 * vendor grouping, progress tracking, data transformation, and state management utilities.
 */

import { formatCurrency, formatDate } from './formatting';

/**
 * Groups transactions by vendor for the review interface
 * 
 * @param {Array} transactions - Array of transaction objects with vendor information
 * @returns {Array} Array of vendor group objects with aggregated data
 */
export const groupTransactionsByVendor = (transactions = []) => {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  // Group transactions by vendor ID and vendor name
  const vendorMap = new Map();

  transactions.forEach(transaction => {
    const vendorKey = `${transaction.vendor_id || 'unknown'}_${transaction.vendor_name || 'Unknown Vendor'}`;
    
    if (!vendorMap.has(vendorKey)) {
      vendorMap.set(vendorKey, {
        vendor_id: transaction.vendor_id || null,
        vendor_name: transaction.vendor_name || 'Unknown Vendor',
        vendor_logo: transaction.vendor_logo || null,
        suggested_category_id: transaction.suggested_category_id || null,
        suggested_category_name: transaction.suggested_category_name || null,
        confidence_score: transaction.confidence_score || 0,
        has_rule: transaction.has_rule || false,
        transactions: [],
        total_amount: 0,
        transaction_count: 0,
        date_range: { earliest: null, latest: null },
        currencies: new Set(),
        review_status: 'pending' // pending, approved, rejected, modified
      });
    }

    const group = vendorMap.get(vendorKey);
    group.transactions.push(transaction);
    group.total_amount += parseFloat(transaction.signed_aud_amount || 0);
    group.transaction_count += 1;

    // Track date range
    const transactionDate = new Date(transaction.date);
    if (!group.date_range.earliest || transactionDate < group.date_range.earliest) {
      group.date_range.earliest = transactionDate;
    }
    if (!group.date_range.latest || transactionDate > group.date_range.latest) {
      group.date_range.latest = transactionDate;
    }

    // Track currencies
    if (transaction.original_currency) {
      group.currencies.add(transaction.original_currency);
    }
  });

  // Convert to array and sort by total amount (descending)
  const vendorGroups = Array.from(vendorMap.values()).map((group, index) => ({
    ...group,
    id: group.vendor_id || `vendor_group_${index}`,
    currencies: Array.from(group.currencies),
    sample_transactions: selectRepresentativeTransactions(group.transactions, 3),
    formatted_total: formatCurrency(group.total_amount, group.total_amount >= 0 ? 'CREDIT' : 'DEBIT'),
    formatted_date_range: formatDateRange(group.date_range.earliest, group.date_range.latest)
  }));

  return vendorGroups.sort((a, b) => Math.abs(b.total_amount) - Math.abs(a.total_amount));
};

/**
 * Selects representative transactions from a group for display
 * 
 * @param {Array} transactions - All transactions in the group
 * @param {number} count - Maximum number of transactions to select
 * @returns {Array} Array of representative transactions
 */
export const selectRepresentativeTransactions = (transactions = [], count = 3) => {
  if (!Array.isArray(transactions) || transactions.length === 0) {
    return [];
  }

  if (transactions.length <= count) {
    return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  // Sort by date (newest first) and take a mix of recent and representative amounts
  const sortedByDate = transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  const sortedByAmount = [...transactions].sort((a, b) => Math.abs(b.signed_aud_amount) - Math.abs(a.signed_aud_amount));

  const selected = new Set();
  const result = [];

  // Always include the most recent transaction
  if (sortedByDate[0]) {
    selected.add(sortedByDate[0].id);
    result.push(sortedByDate[0]);
  }

  // Include the largest amount transaction if different from most recent
  if (sortedByAmount[0] && !selected.has(sortedByAmount[0].id) && result.length < count) {
    selected.add(sortedByAmount[0].id);
    result.push(sortedByAmount[0]);
  }

  // Fill remaining slots with other recent transactions
  for (const transaction of sortedByDate) {
    if (result.length >= count) break;
    if (!selected.has(transaction.id)) {
      result.push(transaction);
    }
  }

  return result;
};

/**
 * Formats a date range for display
 * 
 * @param {Date} startDate - Earliest date
 * @param {Date} endDate - Latest date
 * @returns {string} Formatted date range string
 */
export const formatDateRange = (startDate, endDate) => {
  if (!startDate || !endDate) return 'N/A';

  const start = formatDate(startDate.toISOString().split('T')[0]);
  const end = formatDate(endDate.toISOString().split('T')[0]);

  if (start === end) {
    return start;
  }

  return `${start} - ${end}`;
};

/**
 * Calculates review progress statistics
 * 
 * @param {Array} vendorGroups - Array of vendor group objects
 * @param {Set} completedGroups - Set of completed vendor group IDs
 * @param {Map} categoryChanges - Map of vendor group ID to new category
 * @returns {Object} Progress statistics object
 */
export const calculateReviewProgress = (vendorGroups = [], completedGroups = new Set(), categoryChanges = new Map()) => {
  const totalGroups = vendorGroups.length;
  const totalTransactions = vendorGroups.reduce((sum, group) => sum + group.transaction_count, 0);
  const totalAmount = vendorGroups.reduce((sum, group) => sum + Math.abs(group.total_amount), 0);

  const reviewedGroups = Array.from(completedGroups).length;
  const modifiedGroups = Array.from(categoryChanges).length;

  const completedTransactions = vendorGroups
    .filter(group => completedGroups.has(group.id))
    .reduce((sum, group) => sum + group.transaction_count, 0);

  const completedAmount = vendorGroups
    .filter(group => completedGroups.has(group.id))
    .reduce((sum, group) => sum + Math.abs(group.total_amount), 0);

  const completionPercentage = totalGroups > 0 ? Math.round((reviewedGroups / totalGroups) * 100) : 0;

  return {
    totalGroups,
    totalTransactions,
    totalAmount,
    reviewedGroups,
    modifiedGroups,
    completedTransactions,
    completedAmount,
    completionPercentage,
    remainingGroups: totalGroups - reviewedGroups,
    pendingTransactions: totalTransactions - completedTransactions,
    pendingAmount: totalAmount - completedAmount,
    formatted: {
      totalAmount: formatCurrency(totalAmount, 'CREDIT'),
      completedAmount: formatCurrency(completedAmount, 'CREDIT'),
      pendingAmount: formatCurrency(totalAmount - completedAmount, 'CREDIT')
    }
  };
};

/**
 * Filters vendor groups based on review status and other criteria
 * 
 * @param {Array} vendorGroups - Array of vendor group objects
 * @param {Object} filters - Filter criteria object
 * @returns {Array} Filtered vendor groups
 */
export const filterVendorGroups = (vendorGroups = [], filters = {}) => {
  let filtered = [...vendorGroups];

  // Filter by review status
  if (filters.status && filters.status !== 'all') {
    filtered = filtered.filter(group => group.review_status === filters.status);
  }

  // Filter by minimum confidence score
  if (filters.minConfidence !== undefined) {
    filtered = filtered.filter(group => group.confidence_score >= filters.minConfidence);
  }

  // Filter by has_rule
  if (filters.hasRule !== undefined) {
    filtered = filtered.filter(group => group.has_rule === filters.hasRule);
  }

  // Filter by minimum amount
  if (filters.minAmount !== undefined) {
    filtered = filtered.filter(group => Math.abs(group.total_amount) >= filters.minAmount);
  }

  // Filter by vendor name search
  if (filters.vendorSearch) {
    const searchTerm = filters.vendorSearch.toLowerCase();
    filtered = filtered.filter(group => 
      group.vendor_name.toLowerCase().includes(searchTerm)
    );
  }

  // Filter by category
  if (filters.categoryId) {
    filtered = filtered.filter(group => 
      group.suggested_category_id === filters.categoryId
    );
  }

  return filtered;
};

/**
 * Sorts vendor groups based on specified criteria
 * 
 * @param {Array} vendorGroups - Array of vendor group objects
 * @param {string} sortBy - Sort criteria ('amount', 'date', 'name', 'confidence', 'count')
 * @param {string} sortOrder - Sort order ('asc' or 'desc')
 * @returns {Array} Sorted vendor groups
 */
export const sortVendorGroups = (vendorGroups = [], sortBy = 'amount', sortOrder = 'desc') => {
  const sorted = [...vendorGroups];

  sorted.sort((a, b) => {
    let compareValue = 0;

    switch (sortBy) {
      case 'amount':
        compareValue = Math.abs(a.total_amount) - Math.abs(b.total_amount);
        break;
      case 'date':
        compareValue = new Date(a.date_range.latest) - new Date(b.date_range.latest);
        break;
      case 'name':
        compareValue = a.vendor_name.localeCompare(b.vendor_name);
        break;
      case 'confidence':
        compareValue = a.confidence_score - b.confidence_score;
        break;
      case 'count':
        compareValue = a.transaction_count - b.transaction_count;
        break;
      default:
        compareValue = Math.abs(a.total_amount) - Math.abs(b.total_amount);
    }

    return sortOrder === 'desc' ? -compareValue : compareValue;
  });

  return sorted;
};

/**
 * Validates vendor group selection for bulk operations
 * 
 * @param {Array} selectedGroupIds - Array of selected vendor group IDs
 * @param {Array} vendorGroups - Array of all vendor groups
 * @param {Map} categoryChanges - Map of category changes
 * @returns {Object} Validation result with errors and warnings
 */
export const validateBulkOperation = (selectedGroupIds = [], vendorGroups = [], categoryChanges = new Map()) => {
  const validation = {
    isValid: true,
    errors: [],
    warnings: [],
    selectedGroups: []
  };

  if (selectedGroupIds.length === 0) {
    validation.isValid = false;
    validation.errors.push('No vendor groups selected for bulk operation');
    return validation;
  }

  // Find selected groups and validate
  selectedGroupIds.forEach(groupId => {
    const group = vendorGroups.find(g => g.id === groupId);
    if (!group) {
      validation.errors.push(`Vendor group ${groupId} not found`);
      validation.isValid = false;
    } else {
      validation.selectedGroups.push(group);

      // Check for missing category assignments
      if (!group.suggested_category_id && !categoryChanges.has(groupId)) {
        validation.warnings.push(`Vendor group "${group.vendor_name}" has no category assigned`);
      }

      // Check for low confidence scores
      if (group.confidence_score < 0.7) {
        validation.warnings.push(`Vendor group "${group.vendor_name}" has low confidence score (${Math.round(group.confidence_score * 100)}%)`);
      }
    }
  });

  return validation;
};

/**
 * Generates summary data for review completion
 * 
 * @param {Array} vendorGroups - Array of vendor groups
 * @param {Set} approvedGroups - Set of approved group IDs
 * @param {Set} rejectedGroups - Set of rejected group IDs
 * @param {Map} categoryChanges - Map of category changes
 * @param {Array} createdRules - Array of rules created during review
 * @returns {Object} Review completion summary
 */
export const generateReviewSummary = (
  vendorGroups = [],
  approvedGroups = new Set(),
  rejectedGroups = new Set(),
  categoryChanges = new Map(),
  createdRules = []
) => {
  const totalGroups = vendorGroups.length;
  const totalTransactions = vendorGroups.reduce((sum, group) => sum + group.transaction_count, 0);
  const totalAmount = vendorGroups.reduce((sum, group) => sum + Math.abs(group.total_amount), 0);

  const approvedCount = approvedGroups.size;
  const rejectedCount = rejectedGroups.size;
  const modifiedCount = categoryChanges.size;
  const rulesCreated = createdRules.length;

  const processedGroups = approvedCount + rejectedCount;
  const processedTransactions = vendorGroups
    .filter(group => approvedGroups.has(group.id) || rejectedGroups.has(group.id))
    .reduce((sum, group) => sum + group.transaction_count, 0);

  const processedAmount = vendorGroups
    .filter(group => approvedGroups.has(group.id) || rejectedGroups.has(group.id))
    .reduce((sum, group) => sum + Math.abs(group.total_amount), 0);

  return {
    totalGroupsReviewed: processedGroups,
    totalTransactionsProcessed: processedTransactions,
    totalAmountProcessed: processedAmount,
    approvedCount,
    rejectedCount,
    modifiedCount,
    rulesCreated,
    completionPercentage: totalGroups > 0 ? Math.round((processedGroups / totalGroups) * 100) : 0,
    summary: {
      totalGroups,
      totalTransactions,
      totalAmount: totalAmount,
      processedPercentage: totalGroups > 0 ? Math.round((processedGroups / totalGroups) * 100) : 0,
      formatted: {
        totalAmount: formatCurrency(totalAmount, 'CREDIT'),
        processedAmount: formatCurrency(processedAmount, 'CREDIT')
      }
    }
  };
};

/**
 * Creates a deep copy of vendor groups for safe state manipulation
 * 
 * @param {Array} vendorGroups - Array of vendor groups to clone
 * @returns {Array} Deep copy of vendor groups
 */
export const cloneVendorGroups = (vendorGroups = []) => {
  return vendorGroups.map(group => ({
    ...group,
    // Clone the actual fields from the API response
    transaction_ids: Array.isArray(group.transaction_ids) ? [...group.transaction_ids] : [],
    previews: Array.isArray(group.previews) ? [...group.previews.map(preview => ({ ...preview }))] : [],
    // Keep the fields that exist, add defaults for those that don't
    transactions: Array.isArray(group.transactions) ? [...group.transactions] : [],
    sample_transactions: Array.isArray(group.sample_transactions) ? [...group.sample_transactions] : [],
    date_range: group.date_range ? { ...group.date_range } : {},
    currencies: Array.isArray(group.currencies) ? [...group.currencies] : []
  }));
};

/**
 * Merges vendor group updates with existing data
 * 
 * @param {Array} existingGroups - Current vendor groups
 * @param {Array} updates - Array of group updates
 * @returns {Array} Updated vendor groups
 */
export const mergeVendorGroupUpdates = (existingGroups = [], updates = []) => {
  const updatesMap = new Map(updates.map(update => [update.id, update]));

  return existingGroups.map(group => {
    const update = updatesMap.get(group.id);
    return update ? { ...group, ...update } : group;
  });
};

/**
 * Utility functions for local storage persistence
 */
export const reviewStorageUtils = {
  /**
   * Save review progress to local storage
   */
  saveProgress: (sessionId, progressData) => {
    try {
      const storageKey = `review_progress_${sessionId}`;
      const dataToSave = {
        ...progressData,
        savedAt: new Date().toISOString(),
        version: '1.0'
      };
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
      return true;
    } catch (error) {
      console.error('Failed to save review progress:', error);
      return false;
    }
  },

  /**
   * Load review progress from local storage
   */
  loadProgress: (sessionId) => {
    try {
      const storageKey = `review_progress_${sessionId}`;
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.error('Failed to load review progress:', error);
      return null;
    }
  },

  /**
   * Clear saved progress for a session
   */
  clearProgress: (sessionId) => {
    try {
      const storageKey = `review_progress_${sessionId}`;
      localStorage.removeItem(storageKey);
      return true;
    } catch (error) {
      console.error('Failed to clear review progress:', error);
      return false;
    }
  },

  /**
   * Get all saved progress sessions
   */
  getSavedSessions: () => {
    try {
      const sessions = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('review_progress_')) {
          const sessionId = key.replace('review_progress_', '');
          const data = JSON.parse(localStorage.getItem(key));
          sessions.push({
            sessionId,
            savedAt: data.savedAt,
            ...data
          });
        }
      }
      return sessions.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    } catch (error) {
      console.error('Failed to get saved sessions:', error);
      return [];
    }
  }
}; 