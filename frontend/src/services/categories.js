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
   * Updates an existing category (e.g., changing parent for drag and drop).
   * @param {number} categoryId - ID of the category to update
   * @param {object} updateData - Object containing fields to update (e.g., { parent: 123 })
   * @returns {Promise<object>} - Promise resolving to the updated category object.
   */
  updateCategory: async (categoryId, updateData) => {
    try {
      const response = await api.patch(`/categories/${categoryId}/`, updateData);
      return response.data;
    } catch (error) {
      console.error('Error updating category:', error.response || error);
      // Extract specific validation errors if possible
      const errorMessages = error.response?.data ?
         Object.values(error.response.data).flat().join(' ') // Basic join of error values
         : 'Failed to update category.';
      throw new Error(errorMessages);
    }
  },

  /**
   * Deletes a category.
   * @param {number} categoryId - ID of the category to delete
   * @returns {Promise<void>} - Promise resolving when deletion is complete.
   */
  deleteCategory: async (categoryId) => {
    try {
      await api.delete(`/categories/${categoryId}/`);
    } catch (error) {
      console.error('Error deleting category:', error.response || error);
      const errorMessages = error.response?.data ?
         Object.values(error.response.data).flat().join(' ') // Basic join of error values
         : 'Failed to delete category.';
      throw new Error(errorMessages);
    }
  },

  /**
   * Search for category names with autocomplete functionality
   * @param {string} searchTerm - The search term for category names
   * @returns {Promise<Array>} Promise resolving to array of matching category names
   */
  searchCategoryNames: async (searchTerm) => {
    try {
      if (!searchTerm || searchTerm.trim().length < 1) {
        return [];
      }
      
      const response = await api.get(`/categories/search_names/?q=${encodeURIComponent(searchTerm.trim())}`);
      return response.data || [];
    } catch (error) {
      console.error('Error searching category names:', error.response?.data || error.message);
      throw error.response?.data || new Error('Failed to search category names.');
    }
  },
};

export default categoryService;