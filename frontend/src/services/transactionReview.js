import api from './api';

/**
 * Transaction Review API Service
 * 
 * Provides API functions for the auto-assignment review workflow,
 * including fetching pending transactions, bulk operations, and review completion.
 */

/**
 * Fetch transactions that need review after auto-assignment
 * Groups transactions by vendor and includes metadata for review interface
 * 
 * @returns {Promise<Object>} Response containing vendor groups and review metadata
 */
export const fetchPendingReview = async () => {
  try {
    const response = await api.get('/transactions/pending-review');
    return {
      success: true,
      data: response.data,
      vendorGroups: response.data.vendor_groups || [],
      metadata: response.data.metadata || {},
      totalTransactions: response.data.total_transactions || 0,
      totalAmount: response.data.total_amount || 0
    };
  } catch (error) {
    console.error('Failed to fetch pending review:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch transactions for review',
      details: error.response?.data || {}
    };
  }
};

/**
 * Apply categorization to multiple vendor groups at once
 * 
 * @param {Array} vendorGroups - Array of vendor group IDs or objects to categorize
 * @param {Object} categoryMappings - Mapping of vendor group ID to category ID
 * @param {Object} options - Additional options (create_rules, apply_to_future, etc.)
 * @returns {Promise<Object>} Response with results and any errors
 */
export const bulkCategorize = async (vendorGroups, categoryMappings, options = {}) => {
  try {
    const payload = {
      vendor_groups: vendorGroups,
      category_mappings: categoryMappings,
      options: {
        create_rules: options.createRules || false,
        apply_to_future: options.applyToFuture || true,
        update_existing: options.updateExisting || false,
        ...options
      }
    };

    const response = await api.post('/transactions/bulk-categorize', payload);
    return {
      success: true,
      data: response.data,
      updatedCount: response.data.updated_count || 0,
      createdRules: response.data.created_rules || [],
      errors: response.data.errors || []
    };
  } catch (error) {
    console.error('Failed to bulk categorize:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to apply bulk categorization',
      details: error.response?.data || {}
    };
  }
};

/**
 * Update category for a single transaction or vendor group
 * 
 * @param {string|number} id - Transaction ID or vendor group ID
 * @param {string|number} categoryId - New category ID
 * @param {Object} options - Additional options
 * @returns {Promise<Object>} Response with update results
 */
export const updateTransactionCategory = async (id, categoryId, options = {}) => {
  try {
    const payload = {
      category_id: categoryId,
      options: {
        type: options.type || 'vendor_group', // 'transaction' or 'vendor_group'
        create_rule: options.createRule || false,
        apply_to_future: options.applyToFuture || true,
        ...options
      }
    };

    const endpoint = options.type === 'transaction' 
      ? `/transactions/${id}/categorize`
      : `/transactions/vendor-groups/${id}/categorize`;

    const response = await api.post(endpoint, payload);
    return {
      success: true,
      data: response.data,
      updatedTransactions: response.data.updated_transactions || [],
      createdRule: response.data.created_rule || null
    };
  } catch (error) {
    console.error('Failed to update transaction category:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to update category',
      details: error.response?.data || {}
    };
  }
};

/**
 * Reject auto-assignments for selected vendor groups
 * 
 * @param {Array} vendorGroupIds - Array of vendor group IDs to reject
 * @param {string} reason - Reason for rejection (optional)
 * @returns {Promise<Object>} Response with rejection results
 */
export const bulkReject = async (vendorGroupIds, reason = '') => {
  try {
    const payload = {
      vendor_group_ids: vendorGroupIds,
      reason,
      action: 'reject_auto_assignment'
    };

    const response = await api.post('/transactions/bulk-reject', payload);
    return {
      success: true,
      data: response.data,
      rejectedCount: response.data.rejected_count || 0,
      affectedTransactions: response.data.affected_transactions || []
    };
  } catch (error) {
    console.error('Failed to bulk reject:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to reject auto-assignments',
      details: error.response?.data || {}
    };
  }
};

/**
 * Mark the review session as complete
 * 
 * @param {Object} reviewData - Summary data about the completed review
 * @returns {Promise<Object>} Response confirming completion
 */
export const submitReviewComplete = async (reviewData = {}) => {
  try {
    const payload = {
      review_summary: {
        total_groups_reviewed: reviewData.totalGroupsReviewed || 0,
        total_transactions_processed: reviewData.totalTransactionsProcessed || 0,
        total_amount_processed: reviewData.totalAmountProcessed || 0,
        approved_count: reviewData.approvedCount || 0,
        rejected_count: reviewData.rejectedCount || 0,
        modified_count: reviewData.modifiedCount || 0,
        rules_created: reviewData.rulesCreated || 0,
        completed_at: new Date().toISOString(),
        ...reviewData
      }
    };

    const response = await api.post('/transactions/review-complete', payload);
    return {
      success: true,
      data: response.data,
      reviewId: response.data.review_id || null,
      completedAt: response.data.completed_at || null
    };
  } catch (error) {
    console.error('Failed to complete review:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to complete review',
      details: error.response?.data || {}
    };
  }
};

/**
 * Save review progress for later continuation
 * 
 * @param {Object} progressData - Current review state and progress
 * @returns {Promise<Object>} Response confirming save
 */
export const saveReviewProgress = async (progressData) => {
  try {
    const payload = {
      progress: {
        vendor_selections: Array.from(progressData.selectedVendors || []),
        category_changes: Object.fromEntries(progressData.categoryChanges || new Map()),
        completed_groups: progressData.completedGroups || [],
        saved_at: new Date().toISOString(),
        ...progressData
      }
    };

    const response = await api.post('/transactions/review-progress', payload);
    return {
      success: true,
      data: response.data,
      progressId: response.data.progress_id || null
    };
  } catch (error) {
    console.error('Failed to save review progress:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to save progress',
      details: error.response?.data || {}
    };
  }
};

/**
 * Load previously saved review progress
 * 
 * @param {string} progressId - ID of the saved progress (optional, loads latest if not provided)
 * @returns {Promise<Object>} Response with saved progress data
 */
export const loadReviewProgress = async (progressId = null) => {
  try {
    const endpoint = progressId 
      ? `/transactions/review-progress/${progressId}`
      : '/transactions/review-progress/latest';

    const response = await api.get(endpoint);
    return {
      success: true,
      data: response.data,
      progress: response.data.progress || {},
      hasProgress: !!response.data.progress
    };
  } catch (error) {
    console.error('Failed to load review progress:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to load progress',
      details: error.response?.data || {},
      hasProgress: false
    };
  }
};

/**
 * Get available categorization rules for reference during review
 * 
 * @param {Object} filters - Optional filters for rules (vendor, category, etc.)
 * @returns {Promise<Object>} Response with available rules
 */
export const getCategorizationRules = async (filters = {}) => {
  try {
    const params = new URLSearchParams(filters).toString();
    const endpoint = params 
      ? `/categorization/rules?${params}`
      : '/categorization/rules';

    const response = await api.get(endpoint);
    return {
      success: true,
      data: response.data,
      rules: response.data.rules || [],
      totalCount: response.data.total_count || 0
    };
  } catch (error) {
    console.error('Failed to fetch categorization rules:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to fetch rules',
      details: error.response?.data || {},
      rules: []
    };
  }
};

/**
 * Create a new categorization rule during review
 * 
 * @param {Object} ruleData - Rule definition data
 * @returns {Promise<Object>} Response with created rule
 */
export const createCategorizationRule = async (ruleData) => {
  try {
    const payload = {
      rule: {
        name: ruleData.name,
        description: ruleData.description || '',
        vendor_pattern: ruleData.vendorPattern || '',
        description_pattern: ruleData.descriptionPattern || '',
        amount_range: ruleData.amountRange || null,
        category_id: ruleData.categoryId,
        priority: ruleData.priority || 50,
        is_active: ruleData.isActive !== false,
        created_during_review: true,
        ...ruleData
      }
    };

    const response = await api.post('/categorization/rules', payload);
    return {
      success: true,
      data: response.data,
      rule: response.data.rule || {},
      ruleId: response.data.rule?.id || null
    };
  } catch (error) {
    console.error('Failed to create categorization rule:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to create rule',
      details: error.response?.data || {}
    };
  }
};

/**
 * Update an existing categorization rule
 * 
 * @param {string|number} ruleId - ID of the rule to update
 * @param {Object} updateData - Data to update
 * @returns {Promise<Object>} Response with updated rule
 */
export const updateCategorizationRule = async (ruleId, updateData) => {
  try {
    const payload = {
      rule: {
        ...updateData,
        updated_during_review: true
      }
    };

    const response = await api.put(`/categorization/rules/${ruleId}`, payload);
    return {
      success: true,
      data: response.data,
      rule: response.data.rule || {}
    };
  } catch (error) {
    console.error('Failed to update categorization rule:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to update rule',
      details: error.response?.data || {}
    };
  }
};

/**
 * Delete a categorization rule
 * 
 * @param {string|number} ruleId - ID of the rule to delete
 * @returns {Promise<Object>} Response confirming deletion
 */
export const deleteCategorizationRule = async (ruleId) => {
  try {
    const response = await api.delete(`/categorization/rules/${ruleId}`);
    return {
      success: true,
      data: response.data,
      deletedRuleId: ruleId
    };
  } catch (error) {
    console.error('Failed to delete categorization rule:', error);
    return {
      success: false,
      error: error.response?.data?.message || 'Failed to delete rule',
      details: error.response?.data || {}
    };
  }
};

// Export all functions for easy importing
export default {
  fetchPendingReview,
  bulkCategorize,
  updateTransactionCategory,
  bulkReject,
  submitReviewComplete,
  saveReviewProgress,
  loadReviewProgress,
  getCategorizationRules,
  createCategorizationRule,
  updateCategorizationRule,
  deleteCategorizationRule
}; 