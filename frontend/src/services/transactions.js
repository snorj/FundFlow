// frontend/src/services/transactions.js
import api from './api';

const transactionService = {
    // --- Keep existing functions like getTransactions, uploadTransactions, etc. ---
    getTransactions: async (params = {}) => {
        try {
            // Assuming this function already exists and works
            const response = await api.get('/transactions/', { params });
            // Handle potential pagination if ListAPIView is used without explicit disabling
            // return response.data.results || response.data; // Adjust based on DRF pagination
            return response.data; // If pagination is off or handled differently
        } catch (error) {
            console.error("Error fetching transactions:", error.response?.data || error.message);
            throw error;
        }
    },

    uploadTransactions: async (file) => {
        try {
            // Assuming this function already exists and works
            const formData = new FormData();
            formData.append('file', file);
            const response = await api.post('/transactions/upload/', formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
            });
            return response.data;
        } catch (error) {
            console.error("Error uploading transactions:", error.response?.data || error.message);
            throw error;
        }
    },

    getUncategorizedGroups: async () => {
         try {
            // Assuming this exists
             const response = await api.get('/transactions/uncategorized-groups/');
             return response.data;
         } catch (error) {
             console.error("Error fetching uncategorized groups:", error.response?.data || error.message);
             throw error;
         }
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

    updateTransaction: async (id, transactionData) => {
        try {
            const response = await api.put(`/transactions/${id}/`, transactionData);
            return response.data;
        } catch (error) {
            console.error(`Error updating transaction ${id}:`, error.response?.data || error.message);
            throw error.response?.data || error;
        }
    },

    deleteTransaction: async (id) => {
        try {
            const response = await api.delete(`/transactions/${id}/`);
            return response.data; // Or handle 204 No Content appropriately
        } catch (error) {
            console.error(`Error deleting transaction ${id}:`, error.response?.data || error.message);
            throw error.response?.data || error;
        }
    },

};

export default transactionService;