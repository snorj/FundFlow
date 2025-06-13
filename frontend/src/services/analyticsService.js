import { apiService } from './apiService';

/**
 * Analytics service for custom view analytics
 * Provides methods to fetch analytics data from the backend
 */
class AnalyticsService {
    constructor() {
        this.baseUrl = '/api/custom-views';
    }

    /**
     * Get summary analytics for a custom view
     * @param {string} viewId - The custom view ID
     * @returns {Promise<Object>} Summary analytics data
     */
    async getSummary(viewId) {
        try {
            const response = await apiService.get(`${this.baseUrl}/${viewId}/analytics/summary/`);
            return response.data;
        } catch (error) {
            console.error('Failed to fetch summary analytics:', error);
            throw this.handleError(error, 'Failed to load summary statistics');
        }
    }

    /**
     * Get category breakdown analytics for a custom view
     * @param {string} viewId - The custom view ID
     * @param {Object} options - Query options
     * @param {string} options.type - 'custom' or 'system' category breakdown
     * @param {boolean} options.subcategories - Include subcategories
     * @returns {Promise<Object>} Category breakdown data
     */
    async getCategoryBreakdown(viewId, options = {}) {
        try {
            const params = new URLSearchParams();
            if (options.type) params.append('type', options.type);
            if (options.subcategories) params.append('subcategories', options.subcategories);

            const url = `${this.baseUrl}/${viewId}/analytics/categories/${params.toString() ? '?' + params.toString() : ''}`;
            const response = await apiService.get(url);
            return response.data;
        } catch (error) {
            console.error('Failed to fetch category breakdown:', error);
            throw this.handleError(error, 'Failed to load category breakdown');
        }
    }

    /**
     * Get timeline analytics for a custom view
     * @param {string} viewId - The custom view ID
     * @param {Object} options - Query options
     * @param {string} options.period - 'daily', 'weekly', or 'monthly'
     * @param {string} options.category - Category filter
     * @param {string} options.startDate - Start date (YYYY-MM-DD)
     * @param {string} options.endDate - End date (YYYY-MM-DD)
     * @returns {Promise<Object>} Timeline data
     */
    async getTimeline(viewId, options = {}) {
        try {
            const params = new URLSearchParams();
            if (options.period) params.append('period', options.period);
            if (options.category) params.append('category', options.category);
            if (options.startDate) params.append('start_date', options.startDate);
            if (options.endDate) params.append('end_date', options.endDate);

            const url = `${this.baseUrl}/${viewId}/analytics/timeline/${params.toString() ? '?' + params.toString() : ''}`;
            const response = await apiService.get(url);
            return response.data;
        } catch (error) {
            console.error('Failed to fetch timeline analytics:', error);
            throw this.handleError(error, 'Failed to load timeline data');
        }
    }

    /**
     * Get filtered transactions for a custom view
     * @param {string} viewId - The custom view ID
     * @param {Object} options - Query options
     * @param {string} options.category - Category filter
     * @param {string} options.startDate - Start date (YYYY-MM-DD)
     * @param {string} options.endDate - End date (YYYY-MM-DD)
     * @param {number} options.minAmount - Minimum amount filter
     * @param {number} options.maxAmount - Maximum amount filter
     * @param {string} options.direction - 'CREDIT' or 'DEBIT'
     * @param {number} options.page - Page number for pagination
     * @param {number} options.pageSize - Page size for pagination
     * @returns {Promise<Object>} Filtered transactions data
     */
    async getTransactions(viewId, options = {}) {
        try {
            const params = new URLSearchParams();
            if (options.category) params.append('category', options.category);
            if (options.startDate) params.append('start_date', options.startDate);
            if (options.endDate) params.append('end_date', options.endDate);
            if (options.minAmount !== undefined) params.append('min_amount', options.minAmount);
            if (options.maxAmount !== undefined) params.append('max_amount', options.maxAmount);
            if (options.direction) params.append('direction', options.direction);
            if (options.page) params.append('page', options.page);
            if (options.pageSize) params.append('page_size', options.pageSize);

            const url = `${this.baseUrl}/${viewId}/analytics/transactions/${params.toString() ? '?' + params.toString() : ''}`;
            const response = await apiService.get(url);
            return response.data;
        } catch (error) {
            console.error('Failed to fetch transactions:', error);
            throw this.handleError(error, 'Failed to load transactions');
        }
    }

    /**
     * Get all analytics data for a view in parallel
     * @param {string} viewId - The custom view ID
     * @param {Object} options - Options for each analytics call
     * @returns {Promise<Object>} Combined analytics data
     */
    async getAllAnalytics(viewId, options = {}) {
        try {
            const [summary, categoryBreakdown, timeline] = await Promise.all([
                this.getSummary(viewId),
                this.getCategoryBreakdown(viewId, options.categories || {}),
                this.getTimeline(viewId, options.timeline || {})
            ]);

            return {
                summary,
                categoryBreakdown,
                timeline,
                metadata: {
                    fetchedAt: new Date().toISOString(),
                    viewId
                }
            };
        } catch (error) {
            console.error('Failed to fetch all analytics:', error);
            throw this.handleError(error, 'Failed to load analytics data');
        }
    }

    /**
     * Export transactions to CSV
     * @param {string} viewId - The custom view ID
     * @param {Object} options - Filter options
     * @returns {Promise<Blob>} CSV file blob
     */
    async exportTransactionsCSV(viewId, options = {}) {
        try {
            const params = new URLSearchParams();
            if (options.category) params.append('category', options.category);
            if (options.startDate) params.append('start_date', options.startDate);
            if (options.endDate) params.append('end_date', options.endDate);
            if (options.minAmount !== undefined) params.append('min_amount', options.minAmount);
            if (options.maxAmount !== undefined) params.append('max_amount', options.maxAmount);
            if (options.direction) params.append('direction', options.direction);
            params.append('format', 'csv');

            const url = `${this.baseUrl}/${viewId}/analytics/transactions/${params.toString() ? '?' + params.toString() : ''}`;
            const response = await apiService.get(url, {
                responseType: 'blob',
                headers: {
                    'Accept': 'text/csv'
                }
            });

            return response.data;
        } catch (error) {
            console.error('Failed to export CSV:', error);
            throw this.handleError(error, 'Failed to export data');
        }
    }

    /**
     * Handle API errors and provide user-friendly messages
     * @param {Error} error - The error object
     * @param {string} defaultMessage - Default error message
     * @returns {Error} Enhanced error object
     */
    handleError(error, defaultMessage) {
        if (error.response) {
            const status = error.response.status;
            const data = error.response.data;

            switch (status) {
                case 404:
                    return new Error('Custom view not found or you do not have access to it');
                case 403:
                    return new Error('You do not have permission to access this data');
                case 400:
                    return new Error(data.detail || 'Invalid request parameters');
                case 500:
                    return new Error('Server error occurred while processing your request');
                default:
                    return new Error(data.detail || defaultMessage);
            }
        } else if (error.request) {
            return new Error('Network error - please check your connection');
        } else {
            return new Error(defaultMessage);
        }
    }

    /**
     * Format currency values for display
     * @param {number} amount - The amount to format
     * @param {string} currency - Currency code (default: AUD)
     * @returns {string} Formatted currency string
     */
    formatCurrency(amount, currency = 'AUD') {
        return new Intl.NumberFormat('en-AU', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount);
    }

    /**
     * Format percentage values for display
     * @param {number} percentage - The percentage to format
     * @param {number} decimals - Number of decimal places
     * @returns {string} Formatted percentage string
     */
    formatPercentage(percentage, decimals = 1) {
        return `${percentage.toFixed(decimals)}%`;
    }

    /**
     * Format date for API calls
     * @param {Date|string} date - The date to format
     * @returns {string} Formatted date string (YYYY-MM-DD)
     */
    formatDateForAPI(date) {
        if (!date) return null;
        
        const dateObj = date instanceof Date ? date : new Date(date);
        return dateObj.toISOString().split('T')[0];
    }

    /**
     * Calculate percentage change between two values
     * @param {number} current - Current value
     * @param {number} previous - Previous value
     * @returns {number} Percentage change
     */
    calculatePercentageChange(current, previous) {
        if (previous === 0) return current > 0 ? 100 : 0;
        return ((current - previous) / previous) * 100;
    }
}

// Create and export a singleton instance
export const analyticsService = new AnalyticsService();
export default analyticsService; 