import api from './api'; // Your configured axios instance

const transactionService = {
  uploadTransactions: async (file) => {
    // ... (existing upload function) ...
    const formData = new FormData();
    formData.append('file', file);
    try {
      const response = await api.post('/transactions/upload/', formData, { /* headers */ });
      return response.data;
    } catch (error) {
      console.error('Error uploading transactions:', error.response || error);
      throw error.response?.data || new Error('Failed to upload file.');
    }
  },

  getTransactions: async () => {
    // ... (existing get function) ...
    try {
      // Assuming default pagination, adjust if needed
      const response = await api.get('/transactions/');
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching transactions:', error.response || error);
      throw error.response?.data || new Error('Failed to fetch transactions.');
    }
  },

  batchUpdateCategory: async (transactionIds, categoryId) => {
    // ... (existing batch update function) ...
    try {
      const payload = { /* ... */ };
      const response = await api.patch('/transactions/batch-categorize/', payload);
      return response.data;
    } catch (error) {
      console.error('Error batch updating categories:', error.response || error);
      throw error.response?.data || new Error('Failed to assign category.');
    }
  },

  // --- NEW FUNCTION TO FETCH UNCATEGORIZED GROUPS ---
  /**
   * Fetches uncategorized transactions grouped by description.
   * @returns {Promise<Array>} - Promise resolving to an array of group objects.
   */
  getUncategorizedGroups: async () => {
    try {
      // Call the backend endpoint we created
      const response = await api.get('/transactions/uncategorized-groups/');
      // This endpoint returns the list directly (no pagination added in the view yet)
      return response.data;
    } catch (error) {
      console.error('Error fetching uncategorized groups:', error.response || error);
      throw error.response?.data || new Error('Failed to fetch uncategorized groups.');
    }
  },
  // --- END NEW FUNCTION ---

};

export default transactionService;