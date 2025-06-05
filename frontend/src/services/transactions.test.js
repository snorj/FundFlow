import transactionService from './transactions';
import api from './api';

// Use the globally mocked axios from setupTests.js

describe('transactionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createManualTransaction', () => {
    test('should create manual transaction successfully with all required fields', async () => {
      const transactionData = {
        transaction_date: '2025-01-15',
        description: 'Coffee purchase',
        original_amount: 5.99,
        original_currency: 'USD',
        direction: 'outflow'
      };
      
      const mockResponse = {
        data: {
          id: 123,
          transaction_date: '2025-01-15',
          description: 'Coffee purchase',
          original_amount: 5.99,
          original_currency: 'USD',
          direction: 'outflow',
          category_id: null,
          vendor_id: null,
          created_at: '2025-01-15T10:00:00Z'
        }
      };
      
      api.post.mockResolvedValue(mockResponse);

      const result = await transactionService.createManualTransaction(transactionData);

      expect(api.post).toHaveBeenCalledWith('/transactions/create/', transactionData);
      expect(result).toEqual(mockResponse.data);
    });

    test('should create manual transaction with optional category and vendor', async () => {
      const transactionData = {
        transaction_date: '2025-01-15',
        description: 'Grocery shopping',
        original_amount: 85.50,
        original_currency: 'USD',
        direction: 'outflow',
        category_id: 10,
        vendor_id: 5
      };
      
      const mockResponse = {
        data: {
          id: 124,
          ...transactionData,
          created_at: '2025-01-15T10:00:00Z'
        }
      };
      
      api.post.mockResolvedValue(mockResponse);

      const result = await transactionService.createManualTransaction(transactionData);

      expect(api.post).toHaveBeenCalledWith('/transactions/create/', transactionData);
      expect(result).toEqual(mockResponse.data);
    });

    test('should handle validation errors for missing required fields', async () => {
      const invalidTransactionData = {
        description: 'Test transaction',
        // Missing required fields: transaction_date, original_amount, original_currency, direction
      };
      
      const mockError = {
        response: {
          data: {
            transaction_date: ['This field is required.'],
            original_amount: ['This field is required.'],
            original_currency: ['This field is required.'],
            direction: ['This field is required.']
          }
        }
      };
      
      api.post.mockRejectedValue(mockError);

      await expect(transactionService.createManualTransaction(invalidTransactionData))
        .rejects.toThrow('This field is required. This field is required. This field is required. This field is required.');
    });

    test('should handle validation errors for invalid field values', async () => {
      const invalidTransactionData = {
        transaction_date: 'invalid-date',
        description: '',
        original_amount: 'not-a-number',
        original_currency: 'INVALID',
        direction: 'invalid-direction'
      };
      
      const mockError = {
        response: {
          data: {
            transaction_date: ['Date has wrong format. Use one of these formats instead: YYYY-MM-DD.'],
            description: ['This field may not be blank.'],
            original_amount: ['A valid number is required.'],
            original_currency: ['Invalid currency code.'],
            direction: ['Must be either "inflow" or "outflow".']
          }
        }
      };
      
      api.post.mockRejectedValue(mockError);

      await expect(transactionService.createManualTransaction(invalidTransactionData))
        .rejects.toThrow('Date has wrong format. Use one of these formats instead: YYYY-MM-DD. This field may not be blank. A valid number is required. Invalid currency code. Must be either "inflow" or "outflow".');
    });

    test('should handle authentication errors', async () => {
      const transactionData = {
        transaction_date: '2025-01-15',
        description: 'Test transaction',
        original_amount: 10.00,
        original_currency: 'USD',
        direction: 'outflow'
      };
      
      const mockError = {
        response: {
          data: { detail: 'Authentication credentials were not provided.' }
        }
      };
      
      api.post.mockRejectedValue(mockError);

      await expect(transactionService.createManualTransaction(transactionData))
        .rejects.toThrow('Authentication credentials were not provided.');
    });

    test('should handle foreign key validation errors', async () => {
      const transactionData = {
        transaction_date: '2025-01-15',
        description: 'Test transaction',
        original_amount: 10.00,
        original_currency: 'USD',
        direction: 'outflow',
        category_id: 999, // Non-existent category
        vendor_id: 888    // Non-existent vendor
      };
      
      const mockError = {
        response: {
          data: {
            category_id: ['Invalid pk "999" - object does not exist.'],
            vendor_id: ['Invalid pk "888" - object does not exist.']
          }
        }
      };
      
      api.post.mockRejectedValue(mockError);

      await expect(transactionService.createManualTransaction(transactionData))
        .rejects.toThrow('Invalid pk "999" - object does not exist. Invalid pk "888" - object does not exist.');
    });

    test('should handle network errors gracefully', async () => {
      const transactionData = {
        transaction_date: '2025-01-15',
        description: 'Test transaction',
        original_amount: 10.00,
        original_currency: 'USD',
        direction: 'outflow'
      };
      
      const mockError = new Error('Network Error');
      api.post.mockRejectedValue(mockError);

      await expect(transactionService.createManualTransaction(transactionData))
        .rejects.toThrow('Failed to create manual transaction.');
    });

    test('should handle server errors (500)', async () => {
      const transactionData = {
        transaction_date: '2025-01-15',
        description: 'Test transaction',
        original_amount: 10.00,
        original_currency: 'USD',
        direction: 'outflow'
      };
      
      const mockError = {
        response: {
          data: { detail: 'Internal server error' }
        }
      };
      
      api.post.mockRejectedValue(mockError);

      await expect(transactionService.createManualTransaction(transactionData))
        .rejects.toThrow('Internal server error');
    });

    test('should create inflow transaction successfully', async () => {
      const inflowTransactionData = {
        transaction_date: '2025-01-15',
        description: 'Salary payment',
        original_amount: 5000.00,
        original_currency: 'USD',
        direction: 'inflow'
      };
      
      const mockResponse = {
        data: {
          id: 125,
          ...inflowTransactionData,
          created_at: '2025-01-15T10:00:00Z'
        }
      };
      
      api.post.mockResolvedValue(mockResponse);

      const result = await transactionService.createManualTransaction(inflowTransactionData);

      expect(api.post).toHaveBeenCalledWith('/transactions/create/', inflowTransactionData);
      expect(result).toEqual(mockResponse.data);
    });
  });
});

// Suppress console.error messages during tests
const originalError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalError;
}); 