import api from './api';

const vendorMappingService = {
  /**
   * Get all vendor mappings for the current user
   * @returns {Promise<Array>} Promise resolving to array of vendor mapping objects
   */
  getVendorMappings: async () => {
    try {
      const response = await api.get('/vendor-mappings/');
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching vendor mappings:', error.response?.data || error.message);
      throw error.response?.data || new Error('Failed to fetch vendor mappings.');
    }
  },

  /**
   * Rename a vendor (create a new vendor mapping)
   * @param {string} originalName - The original vendor name
   * @param {string} mappedVendor - The new vendor name
   * @returns {Promise<object>} Promise resolving to the created mapping object
   */
  renameVendor: async (originalName, mappedVendor) => {
    try {
      const response = await api.post('/vendor-mappings/rename_vendor/', {
        original_name: originalName,
        new_name: mappedVendor
      });
      return response.data;
    } catch (error) {
      console.error('Error renaming vendor:', error.response?.data || error.message);
      
      // Handle specific error cases
      if (error.response?.data?.error === 'duplicate_vendor') {
        throw new Error('This vendor name already exists. Please use a different name.');
      }
      if (error.response?.data?.error === 'same_name') {
        throw new Error('The new name must be different from the original name.');
      }
      
      const errorMessages = error.response?.data ? 
        Object.values(error.response.data).flat().join(' ') 
        : 'Failed to rename vendor.';
      throw new Error(errorMessages);
    }
  },

  /**
   * Assign a vendor to an existing mapped vendor
   * @param {string} originalName - The original vendor name
   * @param {string} existingVendor - The existing mapped vendor name
   * @returns {Promise<object>} Promise resolving to the created/updated mapping object
   */
  assignToExisting: async (originalName, existingVendor) => {
    try {
      const response = await api.post('/vendor-mappings/assign_to_existing/', {
        original_name: originalName,
        existing_vendor: existingVendor
      });
      return response.data;
    } catch (error) {
      console.error('Error assigning vendor:', error.response?.data || error.message);
      
      // Handle specific error cases
      if (error.response?.data?.error === 'vendor_not_found') {
        throw new Error('The selected vendor does not exist.');
      }
      if (error.response?.data?.error === 'same_vendor') {
        throw new Error('Cannot assign a vendor to itself.');
      }
      
      const errorMessages = error.response?.data ? 
        Object.values(error.response.data).flat().join(' ') 
        : 'Failed to assign vendor.';
      throw new Error(errorMessages);
    }
  },

  /**
   * Bulk mapping operation for multiple vendors
   * @param {Array} mappings - Array of mapping objects with original_name and mapped_vendor
   * @returns {Promise<object>} Promise resolving to the bulk operation result
   */
  bulkMapping: async (mappings) => {
    try {
      const response = await api.post('/vendor-mappings/bulk_mapping/', {
        mappings: mappings
      });
      return response.data;
    } catch (error) {
      console.error('Error in bulk mapping:', error.response?.data || error.message);
      
      const errorMessages = error.response?.data ? 
        Object.values(error.response.data).flat().join(' ') 
        : 'Failed to perform bulk mapping.';
      throw new Error(errorMessages);
    }
  },

  /**
   * Get auto-categorization results based on vendor mappings
   * @returns {Promise<object>} Promise resolving to categorization results
   */
  getAutoCategorization: async () => {
    try {
      const response = await api.get('/vendor-mappings/auto_categorization_results/');
      return response.data;
    } catch (error) {
      console.error('Error fetching auto-categorization results:', error.response?.data || error.message);
      throw error.response?.data || new Error('Failed to fetch auto-categorization results.');
    }
  },

  /**
   * Get list of all unique vendor names (for dropdowns)
   * @returns {Promise<Array>} Promise resolving to array of vendor names
   */
  getVendorNames: async () => {
    try {
      // We can derive this from transactions or vendor mappings
      const response = await api.get('/vendor-mappings/');
      const mappings = response.data.results || response.data;
      
      // Extract unique mapped vendor names
      const uniqueVendors = [...new Set(mappings.map(m => m.mapped_vendor))];
      return uniqueVendors.sort();
    } catch (error) {
      console.error('Error fetching vendor names:', error.response?.data || error.message);
      throw error.response?.data || new Error('Failed to fetch vendor names.');
    }
  },

  /**
   * Search for vendor names with autocomplete functionality
   * @param {string} searchTerm - The search term for vendor names
   * @returns {Promise<Array>} Promise resolving to array of matching vendor names
   */
  searchVendorNames: async (searchTerm) => {
    try {
      if (!searchTerm || searchTerm.trim().length < 1) {
        return [];
      }
      
      const response = await api.get(`/vendors/search_names/?q=${encodeURIComponent(searchTerm.trim())}`);
      return response.data || [];
    } catch (error) {
      console.error('Error searching vendor names:', error.response?.data || error.message);
      throw error.response?.data || new Error('Failed to search vendor names.');
    }
  },

  /**
   * Check if a vendor name already exists (for duplicate detection)
   * @param {string} vendorName - The vendor name to check
   * @returns {Promise<boolean>} Promise resolving to true if vendor exists
   */
  checkVendorExists: async (vendorName) => {
    try {
      const response = await api.get(`/vendors/?search=${encodeURIComponent(vendorName)}`);
      const vendors = response.data.results || response.data;
      
      // Check for exact name match (case insensitive)
      return vendors.some(vendor => 
        vendor.name.toLowerCase() === vendorName.toLowerCase()
      );
    } catch (error) {
      console.error('Error checking vendor existence:', error.response?.data || error.message);
      // Return false on error to avoid blocking the UI
      return false;
    }
  },

  /**
   * Check if a vendor has existing rules
   * @param {string} vendorName - The vendor name to check
   * @returns {Promise<boolean>} Promise resolving to true if vendor has rules
   */
  checkVendorRules: async (vendorName) => {
    try {
      const response = await api.get(`/vendor-rules/?vendor=${encodeURIComponent(vendorName)}`);
      const rules = response.data.results || response.data;
      return Array.isArray(rules) && rules.length > 0;
    } catch (error) {
      console.error('Error checking vendor rules:', error.response?.data || error.message);
      // Return false on error to avoid blocking the UI
      return false;
    }
  },

  /**
   * Create a vendor mapping
   * @param {object} mappingData - The mapping data
   * @param {string} mappingData.original_name - The original vendor name
   * @param {string} mappingData.mapped_vendor - The mapped vendor name
   * @returns {Promise<object>} Promise resolving to the created mapping object
   */
  createMapping: async (mappingData) => {
    try {
      const response = await api.post('/vendor-mappings/', mappingData);
      return response.data;
    } catch (error) {
      console.error('Error creating vendor mapping:', error.response?.data || error.message);
      
      const errorMessages = error.response?.data ? 
        Object.values(error.response.data).flat().join(' ') 
        : 'Failed to create vendor mapping.';
      throw new Error(errorMessages);
    }
  },

  /**
   * Update a vendor mapping
   * @param {number|string} id - The mapping ID
   * @param {object} mappingData - The updated mapping data
   * @returns {Promise<object>} Promise resolving to the updated mapping object
   */
  updateMapping: async (id, mappingData) => {
    try {
      const response = await api.put(`/vendor-mappings/${id}/`, mappingData);
      return response.data;
    } catch (error) {
      console.error(`Error updating vendor mapping ${id}:`, error.response?.data || error.message);
      
      const errorMessages = error.response?.data ? 
        Object.values(error.response.data).flat().join(' ') 
        : `Failed to update vendor mapping with ID ${id}.`;
      throw new Error(errorMessages);
    }
  },

  /**
   * Delete a vendor mapping
   * @param {number|string} id - The mapping ID
   * @returns {Promise<void>} Promise resolving when mapping is deleted
   */
  deleteMapping: async (id) => {
    try {
      const response = await api.delete(`/vendor-mappings/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Error deleting vendor mapping ${id}:`, error.response?.data || error.message);
      throw error.response?.data || new Error(`Failed to delete vendor mapping with ID ${id}.`);
    }
  },
};

export default vendorMappingService; 