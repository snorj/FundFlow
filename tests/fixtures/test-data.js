/**
 * Test Data Fixtures for FundFlow Tests
 */

const path = require('path');

// Sample user data for testing
const testUsers = {
  validUser: {
    username: 'testuser123',
    email: 'test@example.com',
    password: 'TestPassword123!',
    firstName: 'Test',
    lastName: 'User'
  },
  
  adminUser: {
    username: 'adminuser',
    email: 'admin@example.com',
    password: 'AdminPassword123!',
    firstName: 'Admin',
    lastName: 'User',
    isAdmin: true
  },
  
  invalidUser: {
    username: 'invalid',
    email: 'invalid-email',
    password: '123',
    firstName: '',
    lastName: ''
  }
};

// Sample transaction data
const sampleTransactions = [
  {
    date: '2024-01-15',
    description: 'Grocery Store Purchase',
    amount: -45.67,
    category: 'Groceries',
    vendor: 'SuperMarket Inc',
    account: 'Checking'
  },
  {
    date: '2024-01-16',
    description: 'Salary Deposit',
    amount: 2500.00,
    category: 'Income',
    vendor: 'Employer Corp',
    account: 'Checking'
  },
  {
    date: '2024-01-17',
    description: 'Gas Station',
    amount: -42.30,
    category: 'Transportation',
    vendor: 'Shell Gas',
    account: 'Credit Card'
  },
  {
    date: '2024-01-18',
    description: 'Coffee Shop',
    amount: -5.25,
    category: 'Dining',
    vendor: 'Local Cafe',
    account: 'Debit Card'
  },
  {
    date: '2024-01-19',
    description: 'Utility Bill',
    amount: -125.00,
    category: 'Utilities',
    vendor: 'Electric Company',
    account: 'Checking'
  }
];

// Sample category structure
const sampleCategories = {
  income: {
    name: 'Income',
    children: [
      { name: 'Salary' },
      { name: 'Freelance' },
      { name: 'Investments' },
      { name: 'Other Income' }
    ]
  },
  expenses: {
    name: 'Expenses',
    children: [
      {
        name: 'Food & Dining',
        children: [
          { name: 'Groceries' },
          { name: 'Restaurants' },
          { name: 'Coffee & Cafes' }
        ]
      },
      {
        name: 'Transportation',
        children: [
          { name: 'Gas' },
          { name: 'Public Transit' },
          { name: 'Parking' },
          { name: 'Car Maintenance' }
        ]
      },
      {
        name: 'Housing',
        children: [
          { name: 'Rent/Mortgage' },
          { name: 'Utilities' },
          { name: 'Home Maintenance' },
          { name: 'Insurance' }
        ]
      },
      {
        name: 'Entertainment',
        children: [
          { name: 'Movies' },
          { name: 'Sports' },
          { name: 'Hobbies' }
        ]
      }
    ]
  }
};

// Sample vendor rules
const sampleVendorRules = [
  {
    vendor: 'SuperMarket Inc',
    category: 'Groceries',
    priority: 1
  },
  {
    vendor: 'Shell Gas',
    category: 'Transportation > Gas',
    priority: 2
  },
  {
    vendor: 'Local Cafe',
    category: 'Food & Dining > Coffee & Cafes',
    priority: 1
  }
];

// Test CSV data - minimal version for testing
const testCSVData = `Date,Description,Amount,Account
2024-01-01,Opening Balance,1000.00,Checking
2024-01-02,Grocery Store,-45.67,Checking
2024-01-03,Gas Station,-32.50,Checking
2024-01-04,Salary Deposit,2500.00,Checking
2024-01-05,Coffee Shop,-4.25,Checking
2024-01-06,Utility Bill,-125.00,Checking
2024-01-07,Restaurant,-67.89,Checking
2024-01-08,Online Purchase,-29.99,Credit Card
2024-01-09,ATM Withdrawal,-100.00,Checking
2024-01-10,Interest Payment,2.50,Savings`;

// Large test CSV data for performance testing
const generateLargeCSVData = (rows = 1000) => {
  const headers = 'Date,Description,Amount,Account\n';
  const vendors = ['Grocery Store', 'Gas Station', 'Coffee Shop', 'Restaurant', 'Online Store', 'Utility Company'];
  const accounts = ['Checking', 'Savings', 'Credit Card'];
  
  let csvData = headers;
  const startDate = new Date('2023-01-01');
  
  for (let i = 0; i < rows; i++) {
    const date = new Date(startDate.getTime() + (i * 24 * 60 * 60 * 1000));
    const vendor = vendors[Math.floor(Math.random() * vendors.length)];
    const account = accounts[Math.floor(Math.random() * accounts.length)];
    const amount = (Math.random() * 200 - 100).toFixed(2); // Random amount between -100 and 100
    
    csvData += `${date.toISOString().split('T')[0]},${vendor},${amount},${account}\n`;
  }
  
  return csvData;
};

// File paths for test assets
const testFilePaths = {
  smallCSV: path.join(__dirname, '../assets/small-test.csv'),
  largeCSV: path.join(__dirname, '../assets/large-test.csv'),
  invalidCSV: path.join(__dirname, '../assets/invalid-test.csv'),
  emptyCSV: path.join(__dirname, '../assets/empty-test.csv'),
  
  // Project CSV files for testing
  ingTransactions: path.join(__dirname, '../../IngAllTransactions.csv'),
  upTransactions: path.join(__dirname, '../../UpAllTransactions.csv'),
  allTransactions: path.join(__dirname, '../../all_transactions_2020_to_2025.csv')
};

// Invalid CSV data for error testing
const invalidCSVData = `Date,Description,Amount
invalid-date,Test Transaction,not-a-number
2024-01-01,Missing Amount,
,Empty Description,25.00
2024-01-02,Valid Transaction,15.50`;

// Empty CSV for testing
const emptyCSVData = `Date,Description,Amount,Account`;

// API endpoints for testing
const apiEndpoints = {
  auth: {
    login: '/api/auth/login/',
    register: '/api/auth/register/',
    logout: '/api/auth/logout/',
    refresh: '/api/auth/token/refresh/',
    user: '/api/auth/user/'
  },
  transactions: {
    list: '/api/transactions/',
    upload: '/api/transactions/upload/',
    categorize: '/api/transactions/categorize/',
    search: '/api/transactions/search/'
  },
  categories: {
    list: '/api/categories/',
    create: '/api/categories/',
    update: '/api/categories/',
    delete: '/api/categories/'
  },
  dashboard: {
    balance: '/api/dashboard/balance/',
    spending: '/api/dashboard/spending/',
    overview: '/api/dashboard/overview/'
  }
};

// Common selectors for UI elements
const selectors = {
  auth: {
    loginForm: 'form[data-testid="login-form"]',
    usernameInput: 'input[name="username"], input[type="email"]',
    passwordInput: 'input[name="password"]',
    loginButton: 'button[type="submit"], button:has-text("Sign In")',
    registerForm: 'form[data-testid="register-form"]',
    registerButton: 'button[type="submit"], button:has-text("Sign Up")',
    logoutButton: 'button:has-text("Logout"), button:has-text("Sign Out")'
  },
  
  transactions: {
    uploadButton: 'button:has-text("Upload"), input[type="file"]',
    transactionTable: '[data-testid="transactions-table"], table',
    searchInput: 'input[placeholder*="search"], input[name="search"]',
    categorySelect: 'select[name="category"], [data-testid="category-select"]',
    amountInput: 'input[name="amount"], input[type="number"]',
    dateInput: 'input[name="date"], input[type="date"]'
  },
  
  categories: {
    categoryTree: '[data-testid="category-tree"]',
    addCategoryButton: 'button:has-text("Add Category")',
    categoryInput: 'input[name="category"], input[placeholder*="category"]',
    saveButton: 'button:has-text("Save")',
    deleteButton: 'button:has-text("Delete")'
  },
  
  dashboard: {
    balanceCard: '[data-testid="balance-card"]',
    spendingChart: '[data-testid="spending-chart"]',
    recentTransactions: '[data-testid="recent-transactions"]'
  },
  
  common: {
    loading: '[data-testid="loading"], .loading, .spinner',
    toast: '[data-testid="toast"], .toast, .notification',
    modal: '[data-testid="modal"], .modal',
    confirmButton: 'button:has-text("Confirm"), button:has-text("Yes")',
    cancelButton: 'button:has-text("Cancel"), button:has-text("No")'
  }
};

// Test configuration
const testConfig = {
  defaultTimeout: 10000,
  longTimeout: 30000,
  retries: 2,
  
  // URLs
  baseURL: 'http://localhost:3000',
  apiURL: 'http://localhost:8000',
  
  // Test user credentials
  testUserCredentials: {
    username: 'playwright-test-user',
    email: 'playwright@test.com',
    password: 'PlaywrightTest123!'
  }
};

module.exports = {
  testUsers,
  sampleTransactions,
  sampleCategories,
  sampleVendorRules,
  testCSVData,
  generateLargeCSVData,
  invalidCSVData,
  emptyCSVData,
  testFilePaths,
  apiEndpoints,
  selectors,
  testConfig
}; 