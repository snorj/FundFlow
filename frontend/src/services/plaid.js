// src/services/plaid.js
import api from './api';

class PlaidService {
  // Get a link token from your backend to initialize Plaid Link
  async createLinkToken() {
    const response = await api.post('/finance/create_link_token/');
    return response.data;
  }

  // Exchange public token for access token
  async exchangePublicToken(publicToken) {
    const response = await api.post('/finance/exchange_public_token/', {
      public_token: publicToken
    });
    return response.data;
  }

  // Get all linked accounts
  async getAccounts() {
    const response = await api.get('/finance/accounts/');
    return response.data;
  }

  // Get transactions
  async getTransactions(startDate, endDate) {
    const response = await api.get('/finance/transactions/', {
      params: {
        start_date: startDate,
        end_date: endDate
      }
    });
    return response.data;
  }

  // Get spending by category
  async getSpendingByCategory(startDate, endDate) {
    const response = await api.get('/finance/spending_by_category/', {
      params: {
        start_date: startDate,
        end_date: endDate
      }
    });
    return response.data;
  }
}

export default new PlaidService();