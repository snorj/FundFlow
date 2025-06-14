const { expect } = require('@playwright/test');

/**
 * Authentication Helper Functions for FundFlow Tests
 */

class AuthHelpers {
  constructor(page) {
    this.page = page;
  }

  /**
   * Login with credentials
   */
  async login(credentials = {}) {
    const { username = 'testuser', password = 'testpass123' } = credentials;
    
    // Navigate to login page
    await this.page.goto('/login');
    
    // Wait for login form to be visible
    await this.page.waitForSelector('input[name="username"], input[type="email"]');
    
    // Fill credentials
    await this.page.fill('input[name="username"], input[type="email"]', username);
    await this.page.fill('input[name="password"], input[type="password"]', password);
    
    // Submit form
    await this.page.click('button[type="submit"], button:has-text("Sign In")');
    
    // Wait for navigation or dashboard
    try {
      await this.page.waitForURL('**/dashboard', { timeout: 10000 });
    } catch {
      // If dashboard URL doesn't exist, wait for any navigation away from login
      await this.page.waitForFunction(() => !window.location.pathname.includes('/login'));
    }
    
    // Verify authentication token exists
    const token = await this.page.evaluate(() => {
      return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    });
    
    expect(token).toBeTruthy();
    return token;
  }

  /**
   * Register new user
   */
  async register(userData = {}) {
    const timestamp = Date.now();
    const defaultData = {
      username: `testuser${timestamp}`,
      email: `test${timestamp}@example.com`,
      password: 'TestPassword123!',
      confirmPassword: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User'
    };
    
    const data = { ...defaultData, ...userData };
    
    // Navigate to registration page
    await this.page.goto('/register');
    
    // Wait for registration form
    await this.page.waitForSelector('form');
    
    // Fill registration form
    if (await this.page.isVisible('input[name="firstName"]')) {
      await this.page.fill('input[name="firstName"]', data.firstName);
    }
    
    if (await this.page.isVisible('input[name="lastName"]')) {
      await this.page.fill('input[name="lastName"]', data.lastName);
    }
    
    await this.page.fill('input[name="username"]', data.username);
    await this.page.fill('input[name="email"], input[type="email"]', data.email);
    await this.page.fill('input[name="password"]', data.password);
    
    if (await this.page.isVisible('input[name="confirmPassword"], input[name="password2"]')) {
      await this.page.fill('input[name="confirmPassword"], input[name="password2"]', data.confirmPassword);
    }
    
    // Submit registration
    await this.page.click('button[type="submit"], button:has-text("Sign Up")');
    
    // Wait for success or redirect
    await this.page.waitForLoadState('networkidle');
    
    return data;
  }

  /**
   * Logout user
   */
  async logout() {
    // Try to find logout button/link
    const logoutSelectors = [
      'button:has-text("Logout")',
      'button:has-text("Sign Out")',
      'a:has-text("Logout")',
      'a:has-text("Sign Out")',
      '[data-testid="logout"]'
    ];
    
    let logoutFound = false;
    
    for (const selector of logoutSelectors) {
      if (await this.page.isVisible(selector)) {
        await this.page.click(selector);
        logoutFound = true;
        break;
      }
    }
    
    if (!logoutFound) {
      // If no logout button found, clear storage manually
      await this.page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await this.page.goto('/login');
    }
    
    // Wait for redirect to login or ensure we're logged out
    await this.page.waitForLoadState('networkidle');
    
    // Verify logout
    const token = await this.page.evaluate(() => {
      return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    });
    
    expect(token).toBeFalsy();
  }

  /**
   * Check if user is currently logged in
   */
  async isLoggedIn() {
    const token = await this.page.evaluate(() => {
      return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    });
    
    return !!token;
  }

  /**
   * Get current user information
   */
  async getCurrentUser() {
    return await this.page.evaluate(() => {
      const userStr = localStorage.getItem('user') || sessionStorage.getItem('user');
      return userStr ? JSON.parse(userStr) : null;
    });
  }

  /**
   * Login as admin user (if admin credentials are available)
   */
  async loginAsAdmin(adminCredentials = {}) {
    const credentials = {
      username: process.env.ADMIN_USERNAME || 'admin',
      password: process.env.ADMIN_PASSWORD || 'admin123',
      ...adminCredentials
    };
    
    return await this.login(credentials);
  }

  /**
   * Create test user via API (if available)
   */
  async createTestUser(userData = {}) {
    const timestamp = Date.now();
    const defaultData = {
      username: `testuser${timestamp}`,
      email: `test${timestamp}@example.com`,
      password: 'TestPassword123!',
      first_name: 'Test',
      last_name: 'User'
    };
    
    const data = { ...defaultData, ...userData };
    
    try {
      // Try to create user via API
      const response = await this.page.request.post('http://localhost:8000/api/auth/register/', {
        data: data
      });
      
      if (response.ok()) {
        const result = await response.json();
        return { ...data, id: result.id };
      }
    } catch (error) {
      console.warn('API user creation failed, falling back to UI registration');
    }
    
    // Fallback to UI registration
    return await this.register(data);
  }

  /**
   * Setup authenticated session for tests
   */
  async setupAuthenticatedSession(credentials = {}) {
    // Check if already logged in
    if (await this.isLoggedIn()) {
      return true;
    }
    
    // Try to login
    try {
      await this.login(credentials);
      return true;
    } catch (error) {
      // If login fails, try to register and login
      const userData = await this.register(credentials);
      await this.login({
        username: userData.username,
        password: userData.password
      });
      return true;
    }
  }

  /**
   * Clean up authentication state
   */
  async cleanupAuth() {
    await this.page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    
    await this.page.context().clearCookies();
  }

  /**
   * Wait for authentication to complete
   */
  async waitForAuthComplete(timeout = 10000) {
    await this.page.waitForFunction(() => {
      return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    }, { timeout });
  }

  /**
   * Verify protected route access
   */
  async verifyProtectedRoute(route) {
    await this.page.goto(route);
    
    // Should redirect to login if not authenticated
    if (!await this.isLoggedIn()) {
      await this.page.waitForURL('**/login');
      expect(this.page.url()).toContain('/login');
    }
  }
}

module.exports = { AuthHelpers }; 