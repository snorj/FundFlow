import api from './api';

const dashboardService = {
  getBalance: async (targetCurrency = 'AUD') => {
    try {
      const response = await api.get('/dashboard/balance/', {
        params: { target_currency: targetCurrency },
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching balance for ${targetCurrency}:`, error.response || error.message);
      throw error.response?.data || new Error('Failed to fetch balance');
    }
  },
  
  // Future dashboard-specific services can be added here
  // e.g., getTransactionSummary, getSpendingByCategory, etc.
};

export default dashboardService; 