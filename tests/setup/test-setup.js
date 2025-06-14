const { test: base, expect } = require('@playwright/test');
const { TestHelpers } = require('../utils/test-helpers');
const { AuthHelpers } = require('../utils/auth-helpers');
const { LoginPage } = require('../pages/LoginPage');
const { testConfig } = require('../fixtures/test-data');

/**
 * Test Setup and Configuration
 */

// Extend base test with custom fixtures
const test = base.extend({
  // Test helpers fixture
  testHelpers: async ({ page }, use) => {
    const helpers = new TestHelpers(page);
    await use(helpers);
  },

  // Auth helpers fixture
  authHelpers: async ({ page }, use) => {
    const auth = new AuthHelpers(page);
    await use(auth);
  },

  // Login page fixture
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },

  // Authenticated page fixture - automatically logs in
  authenticatedPage: async ({ page, authHelpers }, use) => {
    await authHelpers.setupAuthenticatedSession(testConfig.testUserCredentials);
    await use(page);
  }
});

// Global test configuration
test.describe.configure({ mode: 'parallel' });

// Before all tests
test.beforeAll(async () => {
  console.log('🚀 Starting FundFlow Test Suite');
  
  // Create screenshots directory
  const fs = require('fs');
  const path = require('path');
  
  const screenshotsDir = path.join(__dirname, '../test-results/screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }
});

// Before each test
test.beforeEach(async ({ page, testHelpers }) => {
  // Set default timeout
  page.setDefaultTimeout(testConfig.defaultTimeout);
  
  // Clear storage before each test
  await testHelpers.clearStorage();
  
  // Wait for page to be ready
  await page.waitForLoadState('networkidle');
});

// After each test
test.afterEach(async ({ page, testHelpers }, testInfo) => {
  // Take screenshot on failure
  if (testInfo.status !== testInfo.expectedStatus) {
    const screenshotName = `failure-${testInfo.title.replace(/\s+/g, '-')}-${Date.now()}`;
    await testHelpers.takeScreenshot(screenshotName);
  }
  
  // Clean up storage
  await testHelpers.clearStorage();
});

// After all tests
test.afterAll(async () => {
  console.log('✅ FundFlow Test Suite Complete');
});

/**
 * Custom test helpers and utilities
 */

// Skip test if condition is not met
const skipIf = (condition, reason) => {
  return condition ? test.skip : test;
};

// Run test only if condition is met
const runIf = (condition, reason) => {
  return condition ? test : test.skip;
};

// Retry test with custom retry count
const retryTest = (retries) => {
  return test.describe.configure({ retries });
};

// Test with extended timeout
const longTest = test.extend({
  timeout: testConfig.longTimeout
});

// Common test patterns
const testPatterns = {
  /**
   * Test authentication flow
   */
  authFlow: async ({ page, authHelpers, loginPage }) => {
    await loginPage.goto();
    await loginPage.verifyPageElements();
    
    // Test invalid login
    await loginPage.login('invalid', 'invalid');
    expect(await loginPage.hasError()).toBe(true);
    
    // Test valid login
    await loginPage.clearForm();
    await authHelpers.setupAuthenticatedSession();
    expect(await authHelpers.isLoggedIn()).toBe(true);
  },

  /**
   * Test API response
   */
  apiResponse: async ({ page, request }, endpoint, expectedStatus = 200) => {
    const response = await request.get(endpoint);
    expect(response.status()).toBe(expectedStatus);
    return response;
  },

  /**
   * Test form validation
   */
  formValidation: async ({ page }, formSelector, testCases) => {
    for (const testCase of testCases) {
      // Clear form
      await page.fill(`${formSelector} input`, '');
      
      // Fill with test data
      for (const [field, value] of Object.entries(testCase.data)) {
        await page.fill(`${formSelector} input[name="${field}"]`, value);
      }
      
      // Submit form
      await page.click(`${formSelector} button[type="submit"]`);
      
      // Check result
      if (testCase.shouldPass) {
        await page.waitForLoadState('networkidle');
        expect(page.url()).not.toContain('error');
      } else {
        expect(await page.isVisible('.error, [data-testid="error"]')).toBe(true);
      }
    }
  }
};

// Export everything needed for tests
module.exports = {
  test,
  expect,
  skipIf,
  runIf,
  retryTest,
  longTest,
  testPatterns,
  testConfig
}; 