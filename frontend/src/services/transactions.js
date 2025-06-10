// frontend/src/services/transactions.js
import api from './api';

const transactionService = {
    // Enhanced getTransactions function to handle pagination properly
    getTransactions: async (params = {}) => {
        try {
            const response = await api.get('/transactions/', { params });
            
            // Handle DRF pagination - check if response has results property
            if (response.data && response.data.results) {
                // Paginated response from DRF
                return response.data.results;
            } else if (Array.isArray(response.data)) {
                // Direct array response
                return response.data;
            } else {
                // Fallback to empty array if structure is unexpected
                console.warn('Unexpected transaction data structure:', response.data);
                return [];
            }
        } catch (error) {
            console.error("Error fetching transactions:", error.response?.data || error.message);
            throw error;
        }
    },

    // Enhanced function with better error handling
    getCategorySpendingTotals: async () => {
        try {
            const response = await api.get('/transactions/category-spending-totals/');
            return response.data || {};
        } catch (error) {
            // This endpoint doesn't exist yet - graceful fallback
            console.log("Category spending totals endpoint not available, using client-side calculation");
            return {};
        }
    },

    // Enhanced function with better error handling  
    getVendorsByCategory: async () => {
        try {
            const response = await api.get('/transactions/vendors-by-category/');
            return response.data || {};
        } catch (error) {
            // This endpoint doesn't exist yet - graceful fallback
            console.log("Vendors by category endpoint not available, using client-side calculation");
            return {};
        }
    },

    uploadTransactions: async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await api.post('/transactions/upload/', formData, {
            headers: {
                'Content-Type': 'multipart/form-data',
            },
        });
        return response.data;
    },

    batchCategorizeTransactions: async (transactionIds, categoryId, originalDescription = 'Individual Selection') => {
        const response = await api.patch('/transactions/batch-categorize/', {
            transaction_ids: transactionIds,
            category_id: categoryId,
            original_description: originalDescription,
            clean_name: null // Optional - using original description as clean name
        });
        return response.data;
    },

    getUncategorizedGroups: async () => {
        const response = await api.get('/transactions/uncategorized-groups/');
        return response.data;
    },

    createTransaction: async (transactionData) => {
        const response = await api.post('/transactions/create/', transactionData);
        return response.data;
    },

    updateTransaction: async (id, transactionData) => {
        const response = await api.put(`/transactions/${id}/`, transactionData);
        return response.data;
    },

    batchUpdateCategory: async (transactionIds, categoryId, originalDescription, cleanName) => {
         try {
            // Assuming this exists
             const payload = {
                 transaction_ids: transactionIds,
                 category_id: categoryId,
                 original_description: originalDescription,
                 clean_name: cleanName, // Send null if not edited
             };
             const response = await api.patch('/transactions/batch-categorize/', payload);
             return response.data;
         } catch (error) {
             console.error("Error batch updating category:", error.response?.data || error.message);
             throw error;
         }
     },

    // --- FIX THIS FUNCTION ---
    checkUncategorizedExists: async () => {
        try {
            const response = await api.get('/transactions/uncategorized-groups/', {
                params: { check_existence: true } // Ensure param is sent correctly
            });
            // --- CORRECTLY EXTRACT THE BOOLEAN ---
            // The backend returns {'has_uncategorized': true/false}
            // Make sure to return the actual boolean value, not the whole response object.
            console.log("[checkUncategorizedExists service] API response:", response.data); // Add log
            return response.data?.has_uncategorized || false; // Extract the boolean, default to false
        } catch (error) {
            console.error("Error checking uncategorized existence:", error.response?.data || error.message);
            // On error, assume none exist to avoid showing prompt incorrectly
            return false;
            // Or rethrow: throw error;
        }
    },
    // --- END FIX ---

    deleteTransaction: async (id) => {
        try {
            const response = await api.delete(`/transactions/${id}/`);
            return response.data; // Or handle 204 No Content appropriately
        } catch (error) {
            console.error(`Error deleting transaction ${id}:`, error.response?.data || error.message);
            throw error.response?.data || error;
        }
    },

    /**
     * Create a manual transaction
     * @param {Object} transactionData - The transaction data
     * @param {string} transactionData.transaction_date - Transaction date (YYYY-MM-DD format)
     * @param {string} transactionData.description - Transaction description
     * @param {number} transactionData.original_amount - Transaction amount
     * @param {string} transactionData.original_currency - Currency code (e.g., 'USD')
     * @param {string} transactionData.direction - Transaction direction ('inflow' or 'outflow')
     * @param {number|null} [transactionData.category_id] - Optional category ID
     * @param {number|null} [transactionData.vendor_id] - Optional vendor ID
     * @returns {Promise<Object>} Promise resolving to the created transaction
     */
    createManualTransaction: async (transactionData) => {
        try {
            const response = await api.post('/transactions/create/', transactionData);
            return response.data;
        } catch (error) {
            console.error('Error creating manual transaction:', error.response?.data || error.message);
            // Extract specific validation errors if possible (following other services pattern)
            const errorMessages = error.response?.data ? 
                Object.values(error.response.data).flat().join(' ') 
                : 'Failed to create manual transaction.';
            throw new Error(errorMessages);
        }
    },
};

export default transactionService;