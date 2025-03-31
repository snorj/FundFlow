// src/services/auth.js
import api from './api';
import { resetAllState } from '../utils/StateResetUtil'; // Add this import

class AuthService {
  // Register a new user
  async register(userData) {
    const response = await api.post('/auth/register/', userData);
    return response.data;
  }

  // Login user and get tokens
  async login(credentials) {
    const response = await api.post('/auth/token/', credentials);
    
    // Store tokens in localStorage
    if (response.data.access) {
      localStorage.setItem('access_token', response.data.access);
      localStorage.setItem('refresh_token', response.data.refresh);
    }
    
    return response.data;
  }

  // Logout user - UPDATED to clear all data and trigger state reset
  logout() {
    // Trigger global state reset first
    resetAllState();
    
    // Then clear localStorage
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    
    // Clear any other cached finance data
    this.clearCachedData();
  }
  
  // Clear cached data
  clearCachedData() {
    // Find and remove all finance-related items in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      
      // Remove any keys that might contain financial data
      if (key && (
          key.includes('account') || 
          key.includes('transaction') || 
          key.includes('plaid') || 
          key.includes('balance') ||
          key.includes('finance')
      )) {
        localStorage.removeItem(key);
      }
    }
    
    // Also clear session storage
    sessionStorage.clear();
  }

  // Refresh access token
  async refreshToken(refreshToken) {
    const response = await api.post('/auth/token/refresh/', {
      refresh: refreshToken
    });
    return response.data;
  }

  // Get current user
  async getCurrentUser() {
    try {
      const response = await api.get('/auth/me/');
      return response.data;
    } catch (error) {
      return null;
    }
  }

  // Check if user is authenticated
  isAuthenticated() {
    return !!localStorage.getItem('access_token');
  }
}

export default new AuthService();