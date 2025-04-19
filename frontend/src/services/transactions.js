import api from './api'; // Your configured axios instance

const transactionService = {
  /**
   * Uploads a CSV file containing transactions.
   * @param {File} file - The CSV file object.
   * @returns {Promise<object>} - Promise resolving to the API response data.
   */
  uploadTransactions: async (file) => {
    const formData = new FormData();
    formData.append('file', file); // 'file' must match the key expected by the backend view

    try {
      const response = await api.post('/transactions/upload/', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      return response.data; // { message, imported_count, total_rows_processed, errors }
    } catch (error) {
      console.error('Error uploading transactions:', error.response || error);
      // Rethrow or handle specific errors as needed
      throw error.response?.data || new Error('Failed to upload file.');
    }
  },

  /**
   * Fetches transactions for the current user.
   * @returns {Promise<Array>} - Promise resolving to an array of transaction objects.
   */
  getTransactions: async () => {
    try {
      const response = await api.get('/transactions/');
      // If using pagination, the data might be under response.data.results
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching transactions:', error.response || error);
      throw error.response?.data || new Error('Failed to fetch transactions.');
    }
  },

  // Add updateTransaction, deleteTransaction functions here later
};

export default transactionService;