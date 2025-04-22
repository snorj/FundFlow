import api from './api'; // Your configured axios instance

const transactionService = {
  uploadTransactions: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await api.post('/transactions/upload/', formData);
      return response.data;
    } catch (error) {
      console.error('Error uploading transactions:', error.response || error);
      throw error.response?.data || new Error('Failed to upload file.');
    }
  },

  getTransactions: async (filters = {}) => {
    try {
      const response = await api.get('/transactions/', { params: filters });
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching transactions:', error.response || error);
      throw error.response?.data || new Error('Failed to fetch transactions.');
    }
  },

  // --- UPDATED batchUpdateCategory FUNCTION ---
  /**
   * Assigns a category and potentially updates description/rule for transactions.
   * @param {Array<number>} transactionIds - Array of transaction IDs.
   * @param {number} categoryId - The ID of the category to assign.
   * @param {string} originalDescription - The original description for rule matching.
   * @param {string|null} editedDescription - The new clean name (if changed), otherwise null/undefined.
   * @returns {Promise<object>} - Promise resolving to the API response data.
   */
  batchUpdateCategory: async (transactionIds, categoryId, originalDescription, editedDescription = null) => {
    try {
      const payload = {
        transaction_ids: transactionIds,
        category_id: categoryId,
        original_description: originalDescription, // Always send original for rule matching
      };
      // Only include clean_name if it was actually edited and provided
      if (editedDescription && editedDescription.trim() && editedDescription.trim() !== originalDescription.trim()) {
        payload.clean_name = editedDescription.trim();
      }
      console.log("Sending PATCH payload:", payload); // Log the final payload
      const response = await api.patch('/transactions/batch-categorize/', payload);
      return response.data;
    } catch (error) {
      console.error('Error batch updating categories:', error.response || error);
      throw error.response?.data || new Error('Failed to assign category.');
    }
  },
  // --- END UPDATED FUNCTION ---

  getUncategorizedGroups: async () => {
    try {
      const response = await api.get('/transactions/uncategorized-groups/');
      return response.data;
    } catch (error) {
      console.error('Error fetching uncategorized groups:', error.response || error);
      throw error.response?.data || new Error('Failed to fetch uncategorized groups.');
    }
  },

  checkUncategorizedExists: async () => {
     try {
        const response = await api.get('/transactions/uncategorized-groups/', { params: { check_existence: true } });
        return response.data.has_uncategorized || false;
     } catch (error) {
         console.error('Error checking for uncategorized groups:', error.response || error);
         return false;
     }
  }
};

export default transactionService;