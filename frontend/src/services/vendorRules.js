import api from './api';

const vendorRuleService = {
    /**
     * Get all vendor rules for the current user
     * @returns {Promise<Object>} Promise resolving to paginated vendor rules
     */
    getVendorRules: async (params = {}) => {
        try {
            const response = await api.get('/vendor-rules/', { params });
            return response.data;
        } catch (error) {
            console.error('Error fetching vendor rules:', error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Create a new vendor rule
     * @param {Object} ruleData - The vendor rule data
     * @param {number} ruleData.vendor - Vendor ID
     * @param {number} ruleData.category - Category ID
     * @param {boolean} [ruleData.is_persistent=true] - Whether the rule is persistent
     * @param {number} [ruleData.priority=1] - Rule priority (1-10)
     * @param {string} [ruleData.pattern] - Optional pattern for matching
     * @returns {Promise<Object>} Promise resolving to the created vendor rule
     */
    createVendorRule: async (ruleData) => {
        try {
            const response = await api.post('/vendor-rules/', ruleData);
            return response.data;
        } catch (error) {
            console.error('Error creating vendor rule:', error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Update an existing vendor rule
     * @param {string} ruleId - The vendor rule UUID
     * @param {Object} ruleData - The updated vendor rule data
     * @returns {Promise<Object>} Promise resolving to the updated vendor rule
     */
    updateVendorRule: async (ruleId, ruleData) => {
        try {
            const response = await api.put(`/vendor-rules/${ruleId}/`, ruleData);
            return response.data;
        } catch (error) {
            console.error('Error updating vendor rule:', error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Delete a vendor rule
     * @param {string} ruleId - The vendor rule UUID
     * @returns {Promise<Object>} Promise resolving to deletion confirmation
     */
    deleteVendorRule: async (ruleId) => {
        try {
            const response = await api.delete(`/vendor-rules/${ruleId}/`);
            return response.data;
        } catch (error) {
            console.error('Error deleting vendor rule:', error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Get a specific vendor rule by ID
     * @param {string} ruleId - The vendor rule UUID
     * @returns {Promise<Object>} Promise resolving to the vendor rule
     */
    getVendorRule: async (ruleId) => {
        try {
            const response = await api.get(`/vendor-rules/${ruleId}/`);
            return response.data;
        } catch (error) {
            console.error('Error fetching vendor rule:', error.response?.data || error.message);
            throw error;
        }
    },

    /**
     * Resolve vendor rule conflict
     * @param {string} action - The action to take ('replace' or 'keep')
     * @param {string} existingRuleId - The ID of the existing rule
     * @param {Object} newRuleData - The data for the new rule
     * @returns {Promise<Object>} Promise resolving to the result of the conflict resolution
     */
    resolveConflict: async (action, existingRuleId, newRuleData) => {
        try {
            const response = await api.post('/vendor-rules/resolve-conflict/', {
                action: action,
                existing_rule_id: existingRuleId,
                new_rule_data: newRuleData
            });
            return response.data;
        } catch (error) {
            console.error('Error resolving vendor rule conflict:', error);
            throw error;
        }
    }
};

export default vendorRuleService; 