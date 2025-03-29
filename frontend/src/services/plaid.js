// src/services/plaid.js
import api from './api';

class PlaidService {
  // Get a link token from your backend to initialize Plaid Link
  // Using GET method to match LinkTokenView implementation
  async createLinkToken() {
    const response = await api.get('/finance/link-token/');
    return response.data;
  }

  // Exchange public token for access token
  // Using POST method to match AccessTokenExchangeView implementation
  async exchangePublicToken(publicToken, metadata = {}) {
    const response = await api.post('/finance/exchange-token/', {
      public_token: publicToken,
      institution_id: metadata.institution?.institution_id || '',
      institution_name: metadata.institution?.name || ''
    });
    return response.data;
  }

  // Get all linked accounts - GET method
  async getAccounts() {
    const response = await api.get('/finance/accounts/');
    return response.data;
  }

  // Get transactions - GET method with params
  async getTransactions(startDate, endDate) {
    const response = await api.get('/finance/transactions/', {
      params: {
        start_date: startDate,
        end_date: endDate
      }
    });
    return response.data;
  }

  // Get plaid items (connected bank accounts) - GET method
  async getPlaidItems() {
    const response = await api.get('/finance/plaid-items/');
    return response.data;
  }

  // Fetch transactions from Plaid - POST method
  async fetchTransactions(itemId) {
    const response = await api.post('/finance/fetch-transactions/', {
      item_id: itemId
    });
    return response.data;
  }

  // Get categories - GET method
  async getCategories() {
    const response = await api.get('/finance/categories/');
    return response.data;
  }

  // Update a category - PUT method
  async updateCategory(categoryId, data) {
    const response = await api.put(`/finance/categories/${categoryId}/`, data);
    return response.data;
  }

  // Create a category - POST method
  async createCategory(data) {
    const response = await api.post('/finance/categories/', data);
    return response.data;
  }

  // Delete a category - DELETE method
  async deleteCategory(categoryId) {
    const response = await api.delete(`/finance/categories/${categoryId}/`);
    return response.data;
  }
}

export default new PlaidService();