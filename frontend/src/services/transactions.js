import api from './api'; // Your configured axios instance

const transactionService = {
  /**
   * Uploads a CSV file containing transactions.
   * @param {File} file - The CSV file object.
   * @returns {Promise<object>} - Promise resolving to the API response data.
   */
  uploadTransactions: async (file) => {
    const formData = new FormData();
    formData.append('file', file); // 'file' matches the key expected by the backend

    try {
      // Axios automatically sets the correct 'Content-Type: multipart/form-data; boundary=...'
      // when the data is a FormData object. DO NOT set it manually here.
      const response = await api.post('/transactions/upload/', formData); // <-- Remove the third argument (config with headers)
      return response.data;
    } catch (error) {
      console.error('Error uploading transactions:', error.response || error);
      throw error.response?.data || new Error('Failed to upload file.');
    }
  },

  /**
   * Fetches transactions for the current user, optionally filtered.
   * @param {object} [filters] - Optional filter parameters (e.g., { status: 'categorized' })
   * @returns {Promise<Array>} - Promise resolving to an array of transaction objects.
   */
  getTransactions: async (filters = {}) => { // Accept filters object
    try {
      // Pass filters as URL query parameters
      const response = await api.get('/transactions/', { params: filters });
      // Handle potential pagination
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching transactions:', error.response || error);
      throw error.response?.data || new Error('Failed to fetch transactions.');
    }
  },

  batchUpdateCategory: async (transactionIds, categoryId) => {
    try {
      const payload = { // This payload looks correct
        transaction_ids: transactionIds,
        category_id: categoryId,
      };
      console.log("Sending PATCH payload:", payload); // <-- ADD LOGGING HERE
      // Axios PATCH syntax: api.patch(url, data, [config])
      const response = await api.patch('/transactions/batch-categorize/', payload); // <-- Check this line
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

  /**
   * Checks if there are any uncategorized transaction groups for the user.
   * @returns {Promise<boolean>} - Promise resolving to true if uncategorized groups exist, false otherwise.
   */
  checkUncategorizedExists: async () => {
    try {
       const response = await api.get('/transactions/uncategorized-groups/', {
           params: { check_existence: true } // Use the new param
       });
       return response.data.has_uncategorized || false;
    } catch (error) {
        console.error('Error checking for uncategorized groups:', error.response || error);
        // Assume none exist on error to avoid blocking UI, but log it
        return false;
    }
 }

};

export default transactionService;