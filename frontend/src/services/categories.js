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

  /**
   * Updates an existing category.
   * @param {string|number} categoryId - The ID of the category to update
   * @param {object} categoryData - Object containing updated category details
   * @returns {Promise<object>} - Promise resolving to the updated category object.
   */
  updateCategory: async (categoryId, categoryData) => {
    try {
      const response = await api.put(`/categories/${categoryId}/`, categoryData);
      return response.data;
    } catch (error) {
      console.error('Error updating category:', error.response || error);
      const errorMessages = error.response?.data ?
         Object.values(error.response.data).flat().join(' ')
         : 'Failed to update category.';
      throw new Error(errorMessages);
    }
  },

  /**
   * Deletes a category by ID.
   * @param {string|number} categoryId - The ID of the category to delete
   * @returns {Promise<void>} - Promise resolving when category is deleted.
   */
  deleteCategory: async (categoryId) => {
    try {
      const response = await api.delete(`/categories/${categoryId}/`);
      return response.data;
    } catch (error) {
      console.error('Error deleting category:', error.response || error);
      const errorMessages = error.response?.data ?
         Object.values(error.response.data).flat().join(' ')
         : 'Failed to delete category.';
      throw new Error(errorMessages);
    }
  },
};

export default categoryService;