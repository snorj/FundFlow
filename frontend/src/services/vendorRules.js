import api from './api';

const vendorRuleService = {
  /**
   * Get all vendor rules for the current user
   * @returns {Promise<Array>} Promise resolving to array of vendor rule objects
   */
  getVendorRules: async () => {
    try {
      const response = await api.get('/vendor-rules/');
      return response.data.results || response.data;
    } catch (error) {
      console.error('Error fetching vendor rules:', error.response?.data || error.message);
      throw error.response?.data || new Error('Failed to fetch vendor rules.');
    }
  },



  /**
   * Get a specific vendor rule by ID
   * @param {string} id - The vendor rule ID
   * @returns {Promise<object>} Promise resolving to the vendor rule object
   */
  getVendorRuleById: async (id) => {
    try {
      const response = await api.get(`/vendor-rules/${id}/`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching vendor rule ${id}:`, error.response?.data || error.message);
      throw error.response?.data || new Error(`Failed to fetch vendor rule with ID ${id}.`);
    }
  },

  /**
   * Create a new vendor rule
   * @param {object} ruleData - The vendor rule data
   * @param {number} ruleData.vendor_id - The vendor ID (required)
   * @param {number} ruleData.category_id - The category ID (required)
   * @param {boolean} ruleData.is_persistent - Whether the rule is persistent (optional, default: true)
   * @returns {Promise<object>} Promise resolving to the created vendor rule object
   */
  createVendorRule: async (ruleData) => {
    try {
      const payload = {
        vendor_id: ruleData.vendor_id,
        category_id: ruleData.category_id,
        is_persistent: ruleData.is_persistent !== undefined ? ruleData.is_persistent : true
      };
      
      const response = await api.post('/vendor-rules/', payload);
      return response.data;
    } catch (error) {
      console.error('Error creating vendor rule:', error.response?.data || error.message);
      // Extract specific validation errors if possible
      const errorMessages = error.response?.data ? 
        Object.values(error.response.data).flat().join(' ') 
        : 'Failed to create vendor rule.';
      throw new Error(errorMessages);
    }
  },

  /**
   * Create multiple vendor rules for different vendors with the same category
   * @param {Array<string>} vendorNames - Array of vendor names
   * @param {number} categoryId - The category ID to assign
   * @param {boolean} isPersistent - Whether the rules are persistent (optional, default: true)
   * @returns {Promise<Array>} Promise resolving to array of created vendor rule objects
   */
  createVendorRulesForVendors: async (vendorNames, categoryId, isPersistent = true) => {
    try {
      // First, we need to find or create vendors for the given names
      const vendorPromises = vendorNames.map(async (vendorName) => {
        // Try to find existing vendor first
        try {
          const vendorsResponse = await api.get(`/vendors/?search=${encodeURIComponent(vendorName)}`);
          const vendors = vendorsResponse.data.results || vendorsResponse.data;
          const existingVendor = vendors.find(v => v.name.toLowerCase() === vendorName.toLowerCase());
          
          if (existingVendor) {
            return existingVendor;
          }
        } catch (error) {
          console.warn(`Error searching for vendor ${vendorName}:`, error);
        }
        
        // Create new vendor if not found
        try {
          const newVendorResponse = await api.post('/vendors/', { name: vendorName });
          return newVendorResponse.data;
        } catch (error) {
          console.error(`Error creating vendor ${vendorName}:`, error);
          throw new Error(`Failed to create vendor: ${vendorName}`);
        }
      });
      
      const vendors = await Promise.all(vendorPromises);
      
      // Create vendor rules for all vendors
      const rulePromises = vendors.map(vendor => 
        vendorRuleService.createVendorRule({
          vendor_id: vendor.id,
          category_id: categoryId,
          is_persistent: isPersistent
        })
      );
      
      const rules = await Promise.all(rulePromises);
      return rules;
      
    } catch (error) {
      console.error('Error creating vendor rules for vendors:', error);
      throw error instanceof Error ? error : new Error('Failed to create vendor rules.');
    }
  },

  /**
   * Update an existing vendor rule
   * @param {string} id - The vendor rule ID
   * @param {object} updateData - The update data
   * @returns {Promise<object>} Promise resolving to the updated vendor rule object
   */
  updateVendorRule: async (id, updateData) => {
    try {
      const response = await api.patch(`/vendor-rules/${id}/`, updateData);
      return response.data;
    } catch (error) {
      console.error(`Error updating vendor rule ${id}:`, error.response?.data || error.message);
      const errorMessages = error.response?.data ? 
        Object.values(error.response.data).flat().join(' ') 
        : 'Failed to update vendor rule.';
      throw new Error(errorMessages);
    }
  },

  /**
   * Delete a vendor rule
   * @param {string} id - The vendor rule ID
   * @returns {Promise<void>} Promise resolving when the rule is deleted
   */
  deleteVendorRule: async (id) => {
    try {
      await api.delete(`/vendor-rules/${id}/`);
    } catch (error) {
      console.error(`Error deleting vendor rule ${id}:`, error.response?.data || error.message);
      throw error.response?.data || new Error(`Failed to delete vendor rule with ID ${id}.`);
    }
  },

  /**
   * Check if vendor names have existing rules
   * @param {Array<string>} vendorNames - Array of vendor names to check
   * @returns {Promise<object>} Promise resolving to object mapping vendor names to boolean (has rules)
   */
  checkVendorNamesForRules: async (vendorNames) => {
    try {
      const results = {};
      
      // Get all vendor rules
      const rules = await vendorRuleService.getVendorRules();
      
      // Create a set of vendor names that have rules (case-insensitive)
      const vendorNamesWithRules = new Set(
        rules.map(rule => rule.vendor_name.toLowerCase())
      );
      
      // Check each vendor name
      vendorNames.forEach(vendorName => {
        results[vendorName] = vendorNamesWithRules.has(vendorName.toLowerCase());
      });
      
      return results;
      
    } catch (error) {
      console.error('Error checking vendor names for rules:', error);
      // Return false for all vendors on error to avoid blocking the UI
      const results = {};
      vendorNames.forEach(vendorName => {
        results[vendorName] = false;
      });
      return results;
    }
  }
};

export default vendorRuleService; 