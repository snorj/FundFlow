import api from './api';

const vendorService = {
  /**
   * Get all vendors for the current user (includes system vendors and user's own vendors)
   * @returns {Promise<Array>} Promise resolving to array of vendor objects
   */
  getVendors: async () => {
    try {
      const response = await api.get('/vendors/');
      // Handle potential pagination (like categories service)
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching vendors:', error.response?.data || error.message);
      throw error.response?.data || new Error('Failed to fetch vendors.');
    }
  },

  /**
   * Get a specific vendor by ID
   * @param {number|string} id - The vendor ID
   * @returns {Promise<object>} Promise resolving to the vendor object
   */
  getVendorById: async (id) => {
    try {
      const response = await api.get(`/vendors/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching vendor ${id}:`, error.response?.data || error.message);
      throw error.response?.data || new Error(`Failed to fetch vendor with ID ${id}.`);
    }
  },

  /**
   * Create a new vendor
   * @param {object} vendorData - The vendor data
   * @param {string} vendorData.name - The vendor name (required)
   * @returns {Promise<object>} Promise resolving to the created vendor object
   */
  createVendor: async (vendorData) => {
    try {
      const response = await api.post('/vendors/', vendorData);
      return response.data;
    } catch (error) {
      console.error('Error creating vendor:', error.response?.data || error.message);
      // Extract specific validation errors if possible (following categories service pattern)
      const errorMessages = error.response?.data ? 
        Object.values(error.response.data).flat().join(' ') 
        : 'Failed to create vendor.';
      throw new Error(errorMessages);
    }
  },

  /**
   * Update an existing vendor
   * @param {number|string} id - The vendor ID
   * @param {object} vendorData - The updated vendor data
   * @returns {Promise<object>} Promise resolving to the updated vendor object
   */
  updateVendor: async (id, vendorData) => {
    try {
      const response = await api.put(`/vendors/${id}/`, vendorData);
      return response.data;
    } catch (error) {
      console.error(`Error updating vendor ${id}:`, error.response?.data || error.message);
      const errorMessages = error.response?.data ? 
        Object.values(error.response.data).flat().join(' ') 
        : `Failed to update vendor with ID ${id}.`;
      throw new Error(errorMessages);
    }
  },

  /**
   * Partially update an existing vendor
   * @param {number|string} id - The vendor ID
   * @param {object} vendorData - The partial vendor data to update
   * @returns {Promise<object>} Promise resolving to the updated vendor object
   */
  patchVendor: async (id, vendorData) => {
    try {
      const response = await api.patch(`/vendors/${id}/`, vendorData);
      return response.data;
    } catch (error) {
      console.error(`Error patching vendor ${id}:`, error.response?.data || error.message);
      const errorMessages = error.response?.data ? 
        Object.values(error.response.data).flat().join(' ') 
        : `Failed to update vendor with ID ${id}.`;
      throw new Error(errorMessages);
    }
  },

  /**
   * Delete a vendor
   * @param {number|string} id - The vendor ID
   * @returns {Promise<void>} Promise resolving when vendor is deleted
   */
  deleteVendor: async (id) => {
    try {
      const response = await api.delete(`/vendors/${id}/`);
      return response.data; // May be empty for 204 No Content
    } catch (error) {
      console.error(`Error deleting vendor ${id}:`, error.response?.data || error.message);
      throw error.response?.data || new Error(`Failed to delete vendor with ID ${id}.`);
    }
  },
};

export default vendorService; 