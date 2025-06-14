const { expect } = require('@playwright/test');

/**
 * Test Helper Utilities for FundFlow Playwright Tests
 */

class TestHelpers {
  constructor(page) {
    this.page = page;
  }

  /**
   * Wait for element to be visible and ready for interaction
   */
  async waitForElement(selector, timeout = 10000) {
    await this.page.waitForSelector(selector, { 
      state: 'visible', 
      timeout 
    });
  }

  /**
   * Wait for network request to complete
   */
  async waitForRequest(urlPattern, timeout = 10000) {
    return await this.page.waitForRequest(urlPattern, { timeout });
  }

  /**
   * Wait for API response
   */
  async waitForResponse(urlPattern, timeout = 10000) {
    return await this.page.waitForResponse(urlPattern, { timeout });
  }

  /**
   * Take screenshot with timestamp for debugging
   */
  async takeScreenshot(name = 'screenshot') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await this.page.screenshot({ 
      path: `test-results/screenshots/${name}-${timestamp}.png`,
      fullPage: true 
    });
  }

  /**
   * Clear all cookies and localStorage
   */
  async clearStorage() {
    await this.page.context().clearCookies();
    try {
      await this.page.evaluate(() => {
        try {
          localStorage.clear();
          sessionStorage.clear();
        } catch (e) {
          // Ignore security errors on certain pages
        }
      });
    } catch (e) {
      // Ignore if page doesn't allow storage access
    }
  }

  /**
   * Get current JWT token from localStorage
   */
  async getAuthToken() {
    return await this.page.evaluate(() => {
      return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    });
  }

  /**
   * Check if user is currently authenticated
   */
  async isAuthenticated() {
    const token = await this.getAuthToken();
    return !!token;
  }

  /**
   * Wait for page to be fully loaded (including API calls)
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Fill form field with validation
   */
  async fillField(selector, value, options = {}) {
    await this.waitForElement(selector);
    await this.page.fill(selector, value);
    
    if (options.validate) {
      const fieldValue = await this.page.inputValue(selector);
      expect(fieldValue).toBe(value);
    }
  }

  /**
   * Click element with wait and validation
   */
  async clickElement(selector, options = {}) {
    await this.waitForElement(selector);
    await this.page.click(selector);
    
    if (options.waitForNavigation) {
      await this.waitForPageLoad();
    }
  }

  /**
   * Upload file helper
   */
  async uploadFile(fileInputSelector, filePath) {
    await this.waitForElement(fileInputSelector);
    await this.page.setInputFiles(fileInputSelector, filePath);
  }

  /**
   * Wait for toast/notification message
   */
  async waitForToast(expectedMessage = null, timeout = 5000) {
    const toastSelector = '[data-testid="toast"], .toast, .notification';
    
    try {
      await this.page.waitForSelector(toastSelector, { 
        state: 'visible', 
        timeout 
      });
      
      if (expectedMessage) {
        const toastText = await this.page.textContent(toastSelector);
        expect(toastText).toContain(expectedMessage);
      }
      
      return true;
    } catch (error) {
      if (expectedMessage) {
        throw new Error(`Expected toast message "${expectedMessage}" not found`);
      }
      return false;
    }
  }

  /**
   * Get table data as array of objects
   */
  async getTableData(tableSelector) {
    return await this.page.evaluate((selector) => {
      const table = document.querySelector(selector);
      if (!table) return [];
      
      const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.textContent.trim());
      const rows = Array.from(table.querySelectorAll('tbody tr'));
      
      return rows.map(row => {
        const cells = Array.from(row.querySelectorAll('td'));
        const rowData = {};
        cells.forEach((cell, index) => {
          rowData[headers[index]] = cell.textContent.trim();
        });
        return rowData;
      });
    }, tableSelector);
  }

  /**
   * Wait for specific URL pattern
   */
  async waitForURL(urlPattern, timeout = 10000) {
    await this.page.waitForURL(urlPattern, { timeout });
  }

  /**
   * Check if element is visible
   */
  async isVisible(selector) {
    try {
      return await this.page.isVisible(selector);
    } catch {
      return false;
    }
  }

  /**
   * Get element text content
   */
  async getTextContent(selector) {
    await this.waitForElement(selector);
    return await this.page.textContent(selector);
  }

  /**
   * Generate random test data
   */
  generateTestData() {
    const timestamp = Date.now();
    return {
      email: `test${timestamp}@example.com`,
      username: `testuser${timestamp}`,
      password: 'TestPassword123!',
      firstName: 'Test',
      lastName: 'User'
    };
  }
}

module.exports = { TestHelpers }; 