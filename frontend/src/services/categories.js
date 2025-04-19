import api from './api'; // Your configured axios instance

const categoryService = {
  /**
   * Fetches available categories (System + User's Own).
   * @returns {Promise<Array>} - Promise resolving to an array of category objects.
   */
  getCategories: async () => {
    try {
      const response = await api.get('/categories/');
      // The backend list view returns paginated data by default
      // Adjust if you disable pagination or change the response structure
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching categories:', error.response || error);
      throw error.response?.data || new Error('Failed to fetch categories.');
    }
  },

  /**
   * Creates a new custom category for the current user.
   * @param {object} categoryData - Object containing category details (e.g., { name: 'New Cat', parent: 123 })
   * @returns {Promise<object>} - Promise resolving to the newly created category object.
   */
  createCategory: async (categoryData) => {
    try {
      const response = await api.post('/categories/', categoryData);
      return response.data;
    } catch (error) {
      console.error('Error creating category:', error.response || error);
      // Extract specific validation errors if possible
      const errorMessages = error.response?.data ?
         Object.values(error.response.data).flat().join(' ') // Basic join of error values
         : 'Failed to create category.';
      throw new Error(errorMessages);
    }
  },

  // Add updateCategory, deleteCategory functions later if needed for the Settings page
};

export default categoryService;