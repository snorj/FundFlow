import api from './api';

/**
 * Service for handling Plaid-related API calls
 */
const plaidService = {
  /**
   * Get a link token to initialize Plaid Link
   * @returns {Promise} Promise with the link token
   */
  getLinkToken: async () => {
    try {
      const response = await api.get('/finance/link-token/');
      return response.data;
    } catch (error) {
      console.error('Error getting link token:', error);
      throw error;
    }
  },

  /**
   * Exchange a public token for an access token
   * @param {string} publicToken - The public token from Plaid Link
   * @param {string} institutionId - The ID of the financial institution
   * @param {string} institutionName - The name of the financial institution
   * @returns {Promise} Promise with the exchange response
   */
  exchangePublicToken: async (publicToken, institutionId, institutionName) => {
    try {
      const response = await api.post('/finance/exchange-token/', {
        public_token: publicToken,
        institution_id: institutionId,
        institution_name: institutionName
      });
      return response.data;
    } catch (error) {
      console.error('Error exchanging public token:', error);
      throw error;
    }
  },

  /**
   * Get all Plaid items (connected institutions) for the current user
   * @returns {Promise} Promise with the Plaid items
   */
  getPlaidItems: async () => {
    try {
      const response = await api.get('/finance/plaid-items/');
      return response.data;
    } catch (error) {
      console.error('Error getting Plaid items:', error);
      throw error;
    }
  },

  /**
   * Get all accounts for the current user
   * @returns {Promise} Promise with the accounts
   */
  getAccounts: async () => {
    try {
      const response = await api.get('/finance/accounts/');
      return response.data;
    } catch (error) {
      console.error('Error getting accounts:', error);
      throw error;
    }
  },

  /**
   * Fetch transactions for a specific Plaid item
   * @param {string} itemId - The ID of the Plaid item
   * @returns {Promise} Promise with the fetch response
   */
  fetchTransactions: async (itemId) => {
    try {
      const response = await api.post('/finance/fetch-transactions/', {
        item_id: itemId
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw error;
    }
  },

  /**
   * Get transactions with optional filtering
   * @param {Object} filters - Optional filters (account_id, start_date, end_date, etc.)
   * @returns {Promise} Promise with the transactions
   */
  getTransactions: async (filters = {}) => {
    try {
      // Convert filters object to query string parameters
      const params = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key] !== null && filters[key] !== undefined) {
          params.append(key, filters[key]);
        }
      });

      const response = await api.get(`/finance/transactions/?${params.toString()}`);
      return response.data;
    } catch (error) {
      console.error('Error getting transactions:', error);
      throw error;
    }
  }
};

export default plaidService;