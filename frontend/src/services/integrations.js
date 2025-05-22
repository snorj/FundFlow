// frontend/src/services/integrations.js
import api from './api'; // Import the configured Axios instance

const integrationsService = {
    // Check if Up Bank integration exists for the user
    checkUpLinkStatus: async () => {
        try {
            const response = await api.get('/integrations/up/setup/'); // Path should be relative to /api
            // Expecting { is_linked: true/false }
            return response.data;
        } catch (error) {
            console.error("Error checking Up link status:", error.response?.data || error.message);
            // Rethrow or handle appropriately - maybe return a default state?
            // For now, rethrow to be handled by the component
            throw error;
        }
    },

    // Save/Update the user's Up Bank PAT
    saveUpToken: async (token) => {
        try {
            const response = await api.post('/integrations/up/setup/', { // Path should be relative to /api
                personal_access_token: token,
            });
            // Expecting success message or confirmation
            return response.data;
        } catch (error) {
            console.error("Error saving Up token:", error.response?.data || error.message);
            throw error; // Let component handle specific error messages
        }
    },

    // Remove the Up Bank link
    removeUpLink: async () => {
        try {
            const response = await api.delete('/integrations/up/setup/'); // Path should be relative to /api
            // Expecting 204 No Content on success
            return response.data; // May be empty on 204
        } catch (error) {
            console.error("Error removing Up link:", error.response?.data || error.message);
            throw error;
        }
    },

    // Trigger a manual sync
    triggerUpSync: async (since, until) => {
        try {
            const params = new URLSearchParams();
            if (since) {
                params.append('since', since);
            }
            if (until) {
                params.append('until', until);
            }
            const queryString = params.toString();
            // Corrected URL: Removed leading /api/
            const url = `integrations/up/sync/${queryString ? '?' + queryString : ''}`;

            const response = await api.post(url);
            // Expecting { message, created_count, duplicate_count } on success
            return response.data;
        } catch (error) {
            console.error("Error triggering Up sync:", error.response?.data || error.message);
            throw error;
        }
    }
};

export default integrationsService;