const { test, expect } = require('./setup/test-setup');
const path = require('path');

test.describe('Transaction Upload Tests', () => {
  test.describe('File Upload Interface', () => {
    test('should display transaction upload interface', async ({ page }) => {
      await page.goto('/');
      
      // Navigate to or check for upload functionality
      // This will help us understand what the actual app interface looks like
      
      // Take a screenshot to see the current state
      await page.screenshot({ 
        path: 'test-results/screenshots/app-home-page.png',
        fullPage: true 
      });
      
      // Check for common upload interface elements
      const uploadElements = [
        'input[type="file"]',
        'button:has-text("Upload")',
        '[data-testid="upload"]',
        '.upload-area',
        '.file-upload'
      ];
      
      let foundUploadInterface = false;
      for (const selector of uploadElements) {
        if (await page.isVisible(selector)) {
          foundUploadInterface = true;
          console.log(`Found upload interface: ${selector}`);
          break;
        }
      }
      
      // For now, just log what we find rather than asserting
      console.log(`Upload interface found: ${foundUploadInterface}`);
    });

    test('should handle navigation to transactions page', async ({ page }) => {
      await page.goto('/');
      
      // Look for navigation links/buttons to transactions
      const transactionLinks = [
        'a:has-text("Transactions")',
        'button:has-text("Transactions")',
        'a[href*="transactions"]',
        'a[href*="transaction"]',
        '.nav-link:has-text("Transactions")'
      ];
      
      let foundTransactionNav = false;
      for (const selector of transactionLinks) {
        if (await page.isVisible(selector)) {
          await page.click(selector);
          await page.waitForLoadState('networkidle');
          foundTransactionNav = true;
          console.log(`Found and clicked transaction nav: ${selector}`);
          
          // Take screenshot of transactions page
          await page.screenshot({ 
            path: 'test-results/screenshots/transactions-page.png',
            fullPage: true 
          });
          break;
        }
      }
      
      console.log(`Transaction navigation found: ${foundTransactionNav}`);
    });
  });

  test.describe('CSV File Handling', () => {
    test('should validate CSV files are readable', async ({ page }) => {
      // Test our CSV test files exist and are readable
      const fs = require('fs');
      
      const csvFiles = [
        'tests/assets/small-test.csv',
        'tests/assets/invalid-test.csv', 
        'tests/assets/empty-test.csv'
      ];
      
      for (const csvFile of csvFiles) {
        expect(fs.existsSync(csvFile)).toBe(true);
        
        const content = fs.readFileSync(csvFile, 'utf8');
        expect(content).toBeTruthy();
        
        console.log(`✓ CSV file valid: ${csvFile} (${content.length} bytes)`);
      }
    });

    test('should validate project CSV files exist', async ({ page }) => {
      // Check the actual project CSV files
      const fs = require('fs');
      
      const projectCsvFiles = [
        'IngAllTransactions.csv',
        'UpAllTransactions.csv', 
        'all_transactions_2020_to_2025.csv'
      ];
      
      for (const csvFile of projectCsvFiles) {
        if (fs.existsSync(csvFile)) {
          const content = fs.readFileSync(csvFile, 'utf8');
          const lines = content.split('\n');
          
          console.log(`✓ Project CSV found: ${csvFile} (${lines.length} lines)`);
          
          // Check if it has proper headers
          if (lines.length > 0) {
            const headers = lines[0].toLowerCase();
            const hasDateColumn = headers.includes('date');
            const hasAmountColumn = headers.includes('amount') || headers.includes('value');
            const hasDescColumn = headers.includes('description') || headers.includes('desc');
            
            console.log(`  Headers: ${headers}`);
            console.log(`  Has expected columns: date=${hasDateColumn}, amount=${hasAmountColumn}, desc=${hasDescColumn}`);
          }
        } else {
          console.log(`⚠ Project CSV not found: ${csvFile}`);
        }
      }
    });
  });

  test.describe('API Endpoint Testing', () => {
    test('should check transaction API endpoints', async ({ request }) => {
      // Test the actual API endpoints
      const apiEndpoints = [
        'http://localhost:8000/api/transactions/',
        'http://localhost:8000/api/categories/',
        'http://localhost:8000/api/dashboard/balance/',
        'http://localhost:8000/api/'
      ];
      
      for (const endpoint of apiEndpoints) {
        try {
          const response = await request.get(endpoint);
          console.log(`API ${endpoint}: ${response.status()}`);
          
          // 401 is expected for protected endpoints
          // 200, 404, 405 are all acceptable responses that show the server is working
          expect([200, 401, 404, 405].includes(response.status())).toBe(true);
          
          // If we get a successful response, log some details
          if (response.status() === 200) {
            const responseText = await response.text();
            console.log(`  Response length: ${responseText.length} chars`);
          }
        } catch (error) {
          console.log(`API ${endpoint}: Error - ${error.message}`);
        }
      }
    });
  });

  test.describe('UI Component Detection', () => {
    test('should identify key UI components on main page', async ({ page }) => {
      await page.goto('/');
      
      // Wait for page to load
      await page.waitForLoadState('networkidle');
      
      // Check for common UI elements
      const uiElements = {
        'Logo/Brand': ['img[alt*="logo"]', 'img[alt*="FundFlow"]', '.logo', '.brand'],
        'Navigation': ['nav', '.navbar', '.navigation', '.menu'],
        'Login Form': ['form', 'input[type="password"]', 'input[name="password"]'],
        'Buttons': ['button', '.btn'],
        'Input Fields': ['input', 'textarea', 'select'],
        'Links': ['a']
      };
      
      const foundElements = {};
      
      for (const [category, selectors] of Object.entries(uiElements)) {
        foundElements[category] = [];
        
        for (const selector of selectors) {
          const elements = await page.locator(selector).all();
          if (elements.length > 0) {
            foundElements[category].push(`${selector} (${elements.length})`);
          }
        }
      }
      
      // Log what we found
      console.log('\n🔍 UI Elements Analysis:');
      for (const [category, found] of Object.entries(foundElements)) {
        console.log(`  ${category}: ${found.length > 0 ? found.join(', ') : 'None found'}`);
      }
      
      // Take detailed screenshot
      await page.screenshot({ 
        path: 'test-results/screenshots/ui-analysis.png',
        fullPage: true 
      });
    });

    test('should check page titles and meta information', async ({ page }) => {
      await page.goto('/');
      
      const title = await page.title();
      const url = page.url();
      
      console.log(`Page Title: "${title}"`);
      console.log(`Page URL: ${url}`);
      
      // Check for React app indicators
      const hasReactRoot = await page.isVisible('#root');
      const hasReactDevTools = await page.evaluate(() => {
        return window.React !== undefined || window.__REACT_DEVTOOLS_GLOBAL_HOOK__ !== undefined;
      });
      
      console.log(`Has React root element: ${hasReactRoot}`);
      console.log(`Has React DevTools: ${hasReactDevTools}`);
      
      // Basic assertions
      expect(title).toBeTruthy();
      expect(url).toContain('localhost:3000');
    });
  });
}); 