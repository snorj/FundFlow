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

  getBalanceOverTime: async (targetCurrency = 'AUD', startDate = null, endDate = null) => {
    try {
      const params = { target_currency: targetCurrency };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      
      const response = await api.get('/analytics/balance-over-time/', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching balance over time:', error.response || error.message);
      throw error.response?.data || new Error('Failed to fetch balance over time');
    }
  },

  getCategorySpending: async (targetCurrency = 'AUD', startDate = null, endDate = null, level = 'subcategory') => {
    try {
      const params = { target_currency: targetCurrency, level };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      
      const response = await api.get('/analytics/category-spending/', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching category spending:', error.response || error.message);
      throw error.response?.data || new Error('Failed to fetch category spending');
    }
  },

  getIncomeVsExpenses: async (targetCurrency = 'AUD', startDate = null, endDate = null) => {
    try {
      const params = { target_currency: targetCurrency };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      
      const response = await api.get('/analytics/income-vs-expenses/', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching income vs expenses:', error.response || error.message);
      throw error.response?.data || new Error('Failed to fetch income vs expenses');
    }
  },

  getSankeyFlow: async (targetCurrency = 'AUD', startDate = null, endDate = null) => {
    try {
      const params = { target_currency: targetCurrency };
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;
      
      const response = await api.get('/analytics/sankey-flow/', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching Sankey flow data:', error.response || error.message);
      throw error.response?.data || new Error('Failed to fetch Sankey flow data');
    }
  },
  
  // Helper method to get default date range (last 3 months)
  getDefaultDateRange: () => {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - 3);
    
    return {
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0]
    };
  }
};

export default dashboardService; 