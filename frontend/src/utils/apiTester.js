// src/utils/apiTester.js
import authService from '../services/auth';
import plaidService from '../services/plaid';

// Test function to run all API tests
const testAllApis = async () => {
  console.log('==== API TEST UTILITY ====');
  try {
    // Step 1: Test registration and save the credentials
    const testUser = await testRegistration();
    
    // Step 2: Test login with the newly created user
    await testLogin(testUser.username, testUser.password);
    
    // Step 3: Test get current user
    await testGetCurrentUser();
    
    // Step 4: Test Plaid endpoints
    await testPlaidEndpoints();
    
    console.log('==== ALL TESTS COMPLETED ====');
  } catch (error) {
    console.error('Test failed:', error);
  }
};

// Test user registration
const testRegistration = async () => {
  console.log('Testing registration...');
  try {
    // Generate a unique username and password
    const randomSuffix = Math.floor(Math.random() * 10000);
    const testUser = {
      username: `testuser_${randomSuffix}`,
      email: `test${randomSuffix}@example.com`,
      password: 'TestPassword123!',
      password2: 'TestPassword123!',
      first_name: 'Test',
      last_name: 'User'
    };
    
    console.log(`Creating test user: ${testUser.username}`);
    const result = await authService.register(testUser);
    console.log('Registration result:', result);
    
    // Return the test user info for login
    return {
      username: testUser.username,
      password: testUser.password
    };
  } catch (error) {
    console.error('Registration error:', error.response?.data || error.message);
    throw error;
  }
};

// Test user login
const testLogin = async (username, password) => {
  console.log(`Testing login with username: ${username}...`);
  try {
    const credentials = {
      username: username,
      password: password
    };
    
    const result = await authService.login(credentials);
    console.log('Login successful! Tokens received');
    console.log('Access token present:', !!result.access);
    console.log('Refresh token present:', !!result.refresh);
    return result;
  } catch (error) {
    console.error('Login error:', error.response?.data || error.message);
    throw error;
  }
};

// Test getting current user
const testGetCurrentUser = async () => {
  console.log('Testing get current user...');
  try {
    const user = await authService.getCurrentUser();
    console.log('Current user:', user);
    return user;
  } catch (error) {
    console.error('Get user error:', error.response?.data || error.message);
    throw error;
  }
};

// in the testPlaidEndpoints function inside src/utils/apiTester.js
const testPlaidEndpoints = async () => {
    console.log('Testing Plaid endpoints...');
    
    try {
      // Test creating link token
      console.log('Testing create link token...');
      try {
        const linkTokenResult = await plaidService.createLinkToken();
        console.log('Link token result:', linkTokenResult);
      } catch (linkTokenError) {
        console.error('Link token error:', linkTokenError.response?.data || linkTokenError.message);
      }
      
      try {
        console.log('Testing get plaid items...');
        const items = await plaidService.getPlaidItems();
        console.log('Plaid items:', items);
      } catch (itemsError) {
        console.log('Note: Get plaid items failed - this is expected if no accounts connected yet');
        console.log(itemsError.response?.data || itemsError.message);
      }
      
      try {
        console.log('Testing get accounts...');
        const accounts = await plaidService.getAccounts();
        console.log('Accounts:', accounts);
      } catch (accountsError) {
        console.log('Note: Get accounts failed - this is expected if no accounts connected yet');
        console.log(accountsError.response?.data || accountsError.message);
      }
      
      try {
        console.log('Testing get transactions...');
        const today = new Date();
        const oneMonthAgo = new Date(today);
        oneMonthAgo.setMonth(today.getMonth() - 1);
        
        const formattedStart = oneMonthAgo.toISOString().split('T')[0];
        const formattedEnd = today.toISOString().split('T')[0];
        
        const transactions = await plaidService.getTransactions(formattedStart, formattedEnd);
        console.log('Transactions:', transactions);
      } catch (transactionsError) {
        console.log('Note: Get transactions failed - this is expected if no accounts connected yet');
        console.log(transactionsError.response?.data || transactionsError.message);
      }
      
      try {
        console.log('Testing get categories...');
        const categories = await plaidService.getCategories();
        console.log('Categories:', categories);
      } catch (categoriesError) {
        console.log('Note: Get categories failed');
        console.log(categoriesError.response?.data || categoriesError.message);
      }
      
    } catch (error) {
      console.error('Plaid test error:', error.response?.data || error.message);
      throw error;
    }
  };

export default testAllApis;