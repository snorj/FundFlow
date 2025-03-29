// src/services/auth.js
import api from './api';

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

  // Logout user
  logout() {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
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
      const response = await api.get('/auth/user/');
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