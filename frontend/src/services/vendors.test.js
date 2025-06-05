import vendorService from './vendors';

// Use the globally mocked axios from setupTests.js
// Get the mocked api instance
import api from './api';

describe('vendorService', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    jest.clearAllMocks();
  });

  describe('getVendors', () => {
    test('should fetch vendors successfully with paginated response', async () => {
      const mockResponse = {
        data: {
          results: [
            { id: 1, name: 'Amazon', is_system_vendor: true },
            { id: 2, name: 'Custom Vendor', is_system_vendor: false }
          ],
          count: 2
        }
      };
      
      api.get.mockResolvedValue(mockResponse);

      const result = await vendorService.getVendors();

      expect(api.get).toHaveBeenCalledWith('/vendors/');
      expect(result).toEqual(mockResponse.data.results);
    });

    test('should fetch vendors successfully with non-paginated response', async () => {
      const mockResponse = {
        data: [
          { id: 1, name: 'Amazon', is_system_vendor: true },
          { id: 2, name: 'Custom Vendor', is_system_vendor: false }
        ]
      };
      
      api.get.mockResolvedValue(mockResponse);

      const result = await vendorService.getVendors();

      expect(api.get).toHaveBeenCalledWith('/vendors/');
      expect(result).toEqual(mockResponse.data);
    });

    test('should handle network errors gracefully', async () => {
      const mockError = new Error('Network Error');
      api.get.mockRejectedValue(mockError);

      await expect(vendorService.getVendors()).rejects.toThrow('Failed to fetch vendors.');
    });

    test('should handle API errors with error response', async () => {
      const mockError = {
        response: {
          data: { detail: 'Authentication failed' }
        }
      };
      api.get.mockRejectedValue(mockError);

      await expect(vendorService.getVendors()).rejects.toEqual(mockError.response.data);
    });
  });

  describe('getVendorById', () => {
    test('should fetch vendor by ID successfully', async () => {
      const vendorId = 1;
      const mockResponse = {
        data: { id: 1, name: 'Amazon', is_system_vendor: true }
      };
      
      api.get.mockResolvedValue(mockResponse);

      const result = await vendorService.getVendorById(vendorId);

      expect(api.get).toHaveBeenCalledWith('/vendors/1/');
      expect(result).toEqual(mockResponse.data);
    });

    test('should handle vendor not found error', async () => {
      const vendorId = 999;
      const mockError = {
        response: {
          data: { detail: 'Not found.' }
        }
      };
      api.get.mockRejectedValue(mockError);

      await expect(vendorService.getVendorById(vendorId)).rejects.toEqual(mockError.response.data);
    });

    test('should handle network errors for specific vendor', async () => {
      const vendorId = 1;
      const mockError = new Error('Network Error');
      api.get.mockRejectedValue(mockError);

      await expect(vendorService.getVendorById(vendorId)).rejects.toThrow('Failed to fetch vendor with ID 1.');
    });
  });

  describe('createVendor', () => {
    test('should create vendor successfully', async () => {
      const vendorData = { name: 'New Vendor' };
      const mockResponse = {
        data: { id: 3, name: 'New Vendor', is_system_vendor: false }
      };
      
      api.post.mockResolvedValue(mockResponse);

      const result = await vendorService.createVendor(vendorData);

      expect(api.post).toHaveBeenCalledWith('/vendors/', vendorData);
      expect(result).toEqual(mockResponse.data);
    });

    test('should handle validation errors', async () => {
      const vendorData = { name: '' }; // Invalid data
      const mockError = {
        response: {
          data: {
            name: ['This field may not be blank.']
          }
        }
      };
      api.post.mockRejectedValue(mockError);

      await expect(vendorService.createVendor(vendorData)).rejects.toThrow('This field may not be blank.');
    });

    test('should handle network errors during creation', async () => {
      const vendorData = { name: 'New Vendor' };
      const mockError = new Error('Network Error');
      api.post.mockRejectedValue(mockError);

      await expect(vendorService.createVendor(vendorData)).rejects.toThrow('Failed to create vendor.');
    });
  });

  describe('updateVendor', () => {
    test('should update vendor successfully', async () => {
      const vendorId = 1;
      const vendorData = { name: 'Updated Vendor' };
      const mockResponse = {
        data: { id: 1, name: 'Updated Vendor', is_system_vendor: false }
      };
      
      api.put.mockResolvedValue(mockResponse);

      const result = await vendorService.updateVendor(vendorId, vendorData);

      expect(api.put).toHaveBeenCalledWith('/vendors/1/', vendorData);
      expect(result).toEqual(mockResponse.data);
    });

    test('should handle update validation errors', async () => {
      const vendorId = 1;
      const vendorData = { name: '' };
      const mockError = {
        response: {
          data: {
            name: ['This field may not be blank.']
          }
        }
      };
      api.put.mockRejectedValue(mockError);

      await expect(vendorService.updateVendor(vendorId, vendorData)).rejects.toThrow('This field may not be blank.');
    });
  });

  describe('patchVendor', () => {
    test('should partially update vendor successfully', async () => {
      const vendorId = 1;
      const vendorData = { name: 'Partially Updated' };
      const mockResponse = {
        data: { id: 1, name: 'Partially Updated', is_system_vendor: false }
      };
      
      api.patch.mockResolvedValue(mockResponse);

      const result = await vendorService.patchVendor(vendorId, vendorData);

      expect(api.patch).toHaveBeenCalledWith('/vendors/1/', vendorData);
      expect(result).toEqual(mockResponse.data);
    });

    test('should handle patch errors', async () => {
      const vendorId = 1;
      const vendorData = { name: 'Test' };
      const mockError = new Error('Network Error');
      api.patch.mockRejectedValue(mockError);

      await expect(vendorService.patchVendor(vendorId, vendorData)).rejects.toThrow('Failed to update vendor with ID 1.');
    });
  });

  describe('deleteVendor', () => {
    test('should delete vendor successfully', async () => {
      const vendorId = 1;
      const mockResponse = { data: {} }; // 204 No Content or empty response
      
      api.delete.mockResolvedValue(mockResponse);

      const result = await vendorService.deleteVendor(vendorId);

      expect(api.delete).toHaveBeenCalledWith('/vendors/1/');
      expect(result).toEqual(mockResponse.data);
    });

    test('should handle delete permission errors', async () => {
      const vendorId = 1;
      const mockError = {
        response: {
          data: { detail: 'You do not have permission to perform this action.' }
        }
      };
      api.delete.mockRejectedValue(mockError);

      await expect(vendorService.deleteVendor(vendorId)).rejects.toEqual(mockError.response.data);
    });

    test('should handle delete network errors', async () => {
      const vendorId = 1;
      const mockError = new Error('Network Error');
      api.delete.mockRejectedValue(mockError);

      await expect(vendorService.deleteVendor(vendorId)).rejects.toThrow('Failed to delete vendor with ID 1.');
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