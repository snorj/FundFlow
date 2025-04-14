// src/services/auth.js
import api from './api';
// Remove: import { resetAllState } from '../utils/StateResetUtil'; // REMOVE THIS IMPORT

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

  // Logout user - REMOVE call to resetAllState
  logout() {
    // Remove: resetAllState(); // REMOVE THIS CALL

    // Clear localStorage
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user'); // Also remove cached user info if stored

    // Clear any other potentially cached data (Keep this part)
    this.clearCachedData();
  }

  // Clear cached data (Keep this function)
  clearCachedData() {
    // Find and remove all items that might contain sensitive/cached data
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);

      // Adjust this list based on actual keys you might use for caching
      if (key && (
          key.includes('account') ||
          key.includes('transaction') ||
          key.includes('plaid') || // Keep just in case remnants exist
          key.includes('balance') ||
          key.includes('finance') ||
          key.includes('budget') || // Add other potential keys
          key.includes('report')
      )) {
        localStorage.removeItem(key);
      }
    }

    // Also clear session storage for good measure
    sessionStorage.clear();
  }


  // Refresh access token
  async refreshToken(refreshToken) {
    const response = await api.post('/auth/token/refresh/', {
      refresh: refreshToken
    });
    // Store the new access token upon successful refresh
    if (response.data.access) {
        localStorage.setItem('access_token', response.data.access);
    }
    return response.data;
  }

  // Get current user
  async getCurrentUser() {
    // No try...catch needed here, let api interceptor handle 401
    const response = await api.get('/auth/me/');
    // Cache user info in localStorage? Optional but can reduce API calls.
    // localStorage.setItem('user', JSON.stringify(response.data));
    return response.data;
  }

  // Check if user is authenticated (simple check)
  isAuthenticated() {
    return !!localStorage.getItem('access_token');
  }
}

export default new AuthService();