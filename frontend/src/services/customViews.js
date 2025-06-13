import api from './api';

const customViewService = {
    /**
     * Get all custom views for the current user
     * @param {Object} params - Query parameters for filtering/pagination
     * @returns {Promise<Array>} Promise resolving to array of custom views
     */
    getCustomViews: async (params = {}) => {
        try {
            const response = await api.get('/custom-views/', { params });
            
            // Handle DRF pagination - check if response has results property
            if (response.data && response.data.results) {
                return response.data.results;
            } else if (Array.isArray(response.data)) {
                return response.data;
            } else {
                console.warn('Unexpected custom views data structure:', response.data);
                return [];
            }
        } catch (error) {
            console.error("Error fetching custom views:", error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Get a specific custom view by ID
     * @param {string} viewId - The custom view ID
     * @returns {Promise<Object>} Promise resolving to the custom view
     */
    getCustomView: async (viewId) => {
        try {
            const response = await api.get(`/custom-views/${viewId}/`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching custom view ${viewId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Create a new custom view
     * @param {Object} viewData - The custom view data
     * @param {string} viewData.name - View name
     * @param {string} [viewData.description] - View description
     * @param {Object} [viewData.search_criteria] - Search criteria for automatic transaction inclusion
     * @returns {Promise<Object>} Promise resolving to the created custom view
     */
    createCustomView: async (viewData) => {
        try {
            const response = await api.post('/custom-views/', viewData);
            return response.data;
        } catch (error) {
            console.error('Error creating custom view:', error.response?.data || error.message);
            const errorMessages = error.response?.data ? 
                Object.values(error.response.data).flat().join(' ') 
                : 'Failed to create custom view.';
            throw new Error(errorMessages);
        }
    },

    /**
     * Update a custom view
     * @param {string} viewId - The custom view ID
     * @param {Object} viewData - The updated view data
     * @returns {Promise<Object>} Promise resolving to the updated custom view
     */
    updateCustomView: async (viewId, viewData) => {
        try {
            const response = await api.put(`/custom-views/${viewId}/`, viewData);
            return response.data;
        } catch (error) {
            console.error(`Error updating custom view ${viewId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Delete a custom view
     * @param {string} viewId - The custom view ID
     * @returns {Promise<void>} Promise resolving when view is deleted
     */
    deleteCustomView: async (viewId) => {
        try {
            const response = await api.delete(`/custom-views/${viewId}/`);
            return response.data;
        } catch (error) {
            console.error(`Error deleting custom view ${viewId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Get all categories for a custom view
     * @param {string} viewId - The custom view ID
     * @returns {Promise<Array>} Promise resolving to array of custom categories
     */
    getCustomCategories: async (viewId) => {
        try {
            const response = await api.get(`/custom-views/${viewId}/categories/`);
            return response.data;
        } catch (error) {
            console.error(`Error fetching categories for view ${viewId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Create a new custom category within a view
     * @param {string} viewId - The custom view ID
     * @param {Object} categoryData - The category data
     * @param {string} categoryData.name - Category name
     * @param {string} [categoryData.parent] - Parent category ID
     * @param {number} [categoryData.order] - Display order
     * @returns {Promise<Object>} Promise resolving to the created category
     */
    createCustomCategory: async (viewId, categoryData) => {
        try {
            const response = await api.post(`/custom-views/${viewId}/categories/`, categoryData);
            return response.data;
        } catch (error) {
            console.error(`Error creating category for view ${viewId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Update a custom category
     * @param {string} categoryId - The category ID
     * @param {Object} categoryData - The updated category data
     * @returns {Promise<Object>} Promise resolving to the updated category
     */
    updateCustomCategory: async (categoryId, categoryData) => {
        try {
            const response = await api.put(`/custom-categories/${categoryId}/`, categoryData);
            return response.data;
        } catch (error) {
            console.error(`Error updating category ${categoryId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Delete a custom category
     * @param {string} categoryId - The category ID
     * @returns {Promise<void>} Promise resolving when category is deleted
     */
    deleteCustomCategory: async (categoryId) => {
        try {
            const response = await api.delete(`/custom-categories/${categoryId}/`);
            return response.data;
        } catch (error) {
            console.error(`Error deleting category ${categoryId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Get all transactions assigned to a custom view
     * @param {string} viewId - The custom view ID
     * @param {Object} params - Query parameters for filtering/pagination
     * @returns {Promise<Array>} Promise resolving to array of view transactions
     */
    getViewTransactions: async (viewId, params = {}) => {
        try {
            const response = await api.get(`/custom-views/${viewId}/transactions/`, { params });
            
            if (response.data && response.data.results) {
                return response.data.results;
            } else if (Array.isArray(response.data)) {
                return response.data;
            } else {
                return [];
            }
        } catch (error) {
            console.error(`Error fetching transactions for view ${viewId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Get all transactions for a custom view (both assigned and matching search criteria)
     * @param {string} viewId - The custom view ID
     * @param {Object} params - Query parameters for filtering/pagination
     * @returns {Promise<Object>} Promise resolving to comprehensive transaction data
     */
    getAllViewTransactions: async (viewId, params = {}) => {
        try {
            const response = await api.get(`/custom-views/${viewId}/all-transactions/`, { params });
            return response.data;
        } catch (error) {
            console.error(`Error fetching all transactions for view ${viewId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Assign transactions to a custom view
     * @param {string} viewId - The custom view ID
     * @param {Object} assignmentData - The assignment data
     * @param {Array} assignmentData.transaction_ids - Array of transaction IDs to assign
     * @param {string} [assignmentData.custom_category] - Custom category ID for assignment
     * @param {string} [assignmentData.notes] - Optional notes for the assignment
     * @returns {Promise<Object>} Promise resolving to assignment results
     */
    assignTransactions: async (viewId, assignmentData) => {
        try {
            const response = await api.post(`/custom-views/${viewId}/transactions/`, assignmentData);
            return response.data;
        } catch (error) {
            console.error(`Error assigning transactions to view ${viewId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Update a transaction assignment
     * @param {string} assignmentId - The view transaction assignment ID
     * @param {Object} assignmentData - The updated assignment data
     * @returns {Promise<Object>} Promise resolving to the updated assignment
     */
    updateTransactionAssignment: async (assignmentId, assignmentData) => {
        try {
            const response = await api.put(`/view-transactions/${assignmentId}/`, assignmentData);
            return response.data;
        } catch (error) {
            console.error(`Error updating transaction assignment ${assignmentId}:`, error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Remove transaction assignment from a custom view
     * @param {string} assignmentId - The view transaction assignment ID
     * @returns {Promise<void>} Promise resolving when assignment is removed
     */
    removeTransactionAssignment: async (assignmentId) => {
        try {
            const response = await api.delete(`/view-transactions/${assignmentId}/`);
            return response.data;
        } catch (error) {
            console.error(`Error removing transaction assignment ${assignmentId}:`, error.response?.data || error.message);
            throw error;
        }
    }
};

export default customViewService; 