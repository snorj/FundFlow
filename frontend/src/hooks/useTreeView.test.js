import { act, renderHook } from '@testing-library/react';
import { useTreeView } from './useTreeView';

// Mock the transform utilities
jest.mock('../utils/categoryTransformUtils', () => ({
  transformCategoryData: jest.fn(),
  findNodeInTree: jest.fn(),
  filterTreeData: jest.fn(),
  getCategoryIdsFromTree: jest.fn(),
  getCategoryParentMap: jest.fn(),
  categoryHasChildren: jest.fn()
}));

import {
  transformCategoryData,
  findNodeInTree,
  filterTreeData,
  getCategoryIdsFromTree,
  getCategoryParentMap,
  categoryHasChildren
} from '../utils/categoryTransformUtils';

describe('useTreeView', () => {
  const mockCategories = [
    { id: 1, name: 'Food', parent: null, is_custom: true },
    { id: 2, name: 'Restaurants', parent: 1, is_custom: true }
  ];

  const mockTransactions = [
    { id: 1, category: 1, vendor_name: 'Starbucks', aud_amount: 15.50 }
  ];

  const mockTreeData = [
    {
      id: 1,
      name: 'Food',
      type: 'category',
      children: [
        {
          id: 2,
          name: 'Restaurants',
          type: 'category',
          children: []
        }
      ]
    }
  ];

  const mockCategorySpendingTotals = { 1: 150.00, 2: 50.00 };

  beforeEach(() => {
    // Setup default mock returns
    transformCategoryData.mockReturnValue(mockTreeData);
    findNodeInTree.mockReturnValue(null);
    filterTreeData.mockImplementation((data) => data);
    getCategoryIdsFromTree.mockReturnValue([1, 2]);
    getCategoryParentMap.mockReturnValue({ 1: null, 2: 1 });
    categoryHasChildren.mockReturnValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initializes with default values', () => {
    const { result } = renderHook(() => useTreeView());

    expect(result.current.selectedCategoryId).toBeNull();
    expect(result.current.selectedVendorId).toBeNull();
    expect(result.current.selectedTransactionId).toBeNull();
    expect(result.current.searchTerm).toBe('');
    expect(result.current.expandedNodes).toEqual(new Set());
  });

  test('initializes with provided values', () => {
    const { result } = renderHook(() => useTreeView({
      categories: mockCategories,
      transactions: mockTransactions,
      categorySpendingTotals: mockCategorySpendingTotals,
      initialSelectedCategory: 1,
      initialSelectedVendor: 'vendor_1',
      initialSelectedTransaction: 'transaction_1'
    }));

    expect(result.current.selectedCategoryId).toBe(1);
    expect(result.current.selectedVendorId).toBe('vendor_1');
    expect(result.current.selectedTransactionId).toBe('transaction_1');
  });

  test('transforms data correctly', () => {
    renderHook(() => useTreeView({
      categories: mockCategories,
      transactions: mockTransactions,
      categorySpendingTotals: mockCategorySpendingTotals,
      includeVendors: true,
      includeTransactions: false
    }));

    expect(transformCategoryData).toHaveBeenCalledWith(
      mockCategories,
      mockTransactions,
      {
        includeVendors: true,
        includeTransactions: false,
        showSystemCategories: true,
        showUserCategories: true,
        categorySpendingTotals: mockCategorySpendingTotals
      }
    );
  });

  test('handles category selection', () => {
    const { result } = renderHook(() => useTreeView());

    act(() => {
      result.current.handleCategorySelect({ id: 1, name: 'Food' });
    });

    expect(result.current.selectedCategoryId).toBe(1);
    expect(result.current.selectedVendorId).toBeNull();
    expect(result.current.selectedTransactionId).toBeNull();
  });

  test('handles vendor selection', () => {
    const { result } = renderHook(() => useTreeView({
      initialSelectedCategory: 1
    }));

    act(() => {
      result.current.handleVendorSelect({ id: 'vendor_1', name: 'Starbucks' });
    });

    expect(result.current.selectedCategoryId).toBe(1);
    expect(result.current.selectedVendorId).toBe('vendor_1');
    expect(result.current.selectedTransactionId).toBeNull();
  });

  test('handles transaction selection', () => {
    const { result } = renderHook(() => useTreeView({
      initialSelectedVendor: 'vendor_1'
    }));

    act(() => {
      result.current.handleTransactionSelect({ id: 'transaction_1', name: 'Coffee' });
    });

    expect(result.current.selectedVendorId).toBe('vendor_1');
    expect(result.current.selectedTransactionId).toBe('transaction_1');
  });

  test('handles node expansion', () => {
    const { result } = renderHook(() => useTreeView());

    act(() => {
      result.current.handleNodeExpand(1);
    });

    expect(result.current.expandedNodes.has(1)).toBe(true);
    expect(result.current.isNodeExpanded(1)).toBe(true);
  });

  test('handles node collapse', () => {
    const { result } = renderHook(() => useTreeView());

    // First expand
    act(() => {
      result.current.handleNodeExpand(1);
    });

    expect(result.current.expandedNodes.has(1)).toBe(true);

    // Then collapse
    act(() => {
      result.current.handleNodeCollapse(1);
    });

    expect(result.current.expandedNodes.has(1)).toBe(false);
    expect(result.current.isNodeExpanded(1)).toBe(false);
  });

  test('handles toggle node expansion', () => {
    const { result } = renderHook(() => useTreeView());

    // Toggle to expand
    act(() => {
      result.current.handleToggleNodeExpansion(1);
    });

    expect(result.current.expandedNodes.has(1)).toBe(true);

    // Toggle to collapse
    act(() => {
      result.current.handleToggleNodeExpansion(1);
    });

    expect(result.current.expandedNodes.has(1)).toBe(false);
  });

  test('handles expand all', () => {
    const { result } = renderHook(() => useTreeView());

    act(() => {
      result.current.expandAll();
    });

    expect(result.current.expandedNodes).toEqual(new Set([1, 2]));
  });

  test('handles collapse all', () => {
    const { result } = renderHook(() => useTreeView());

    // First expand some nodes
    act(() => {
      result.current.handleNodeExpand(1);
      result.current.handleNodeExpand(2);
    });

    expect(result.current.expandedNodes.size).toBe(2);

    // Then collapse all
    act(() => {
      result.current.collapseAll();
    });

    expect(result.current.expandedNodes.size).toBe(0);
  });

  test('handles search term changes', () => {
    const { result } = renderHook(() => useTreeView());

    act(() => {
      result.current.setSearchTerm('food');
    });

    expect(result.current.searchTerm).toBe('food');
    expect(filterTreeData).toHaveBeenCalledWith(mockTreeData, 'food');
  });

  test('clears search', () => {
    const { result } = renderHook(() => useTreeView());

    act(() => {
      result.current.setSearchTerm('food');
    });

    expect(result.current.searchTerm).toBe('food');

    act(() => {
      result.current.clearSearch();
    });

    expect(result.current.searchTerm).toBe('');
  });

  test('clears selection', () => {
    const { result } = renderHook(() => useTreeView({
      initialSelectedCategory: 1,
      initialSelectedVendor: 'vendor_1',
      initialSelectedTransaction: 'transaction_1'
    }));

    expect(result.current.selectedCategoryId).toBe(1);
    expect(result.current.selectedVendorId).toBe('vendor_1');
    expect(result.current.selectedTransactionId).toBe('transaction_1');

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedCategoryId).toBeNull();
    expect(result.current.selectedVendorId).toBeNull();
    expect(result.current.selectedTransactionId).toBeNull();
  });

  test('provides selected item getters', () => {
    const mockCategory = { id: 1, name: 'Food', type: 'category' };
    const mockVendor = { id: 'vendor_1', name: 'Starbucks', type: 'vendor' };
    const mockTransaction = { id: 'transaction_1', name: 'Coffee', type: 'transaction' };

    findNodeInTree
      .mockReturnValueOnce(mockCategory)
      .mockReturnValueOnce(mockVendor)
      .mockReturnValueOnce(mockTransaction);

    const { result } = renderHook(() => useTreeView({
      initialSelectedCategory: 1,
      initialSelectedVendor: 'vendor_1',
      initialSelectedTransaction: 'transaction_1'
    }));

    expect(result.current.getSelectedCategory()).toEqual(mockCategory);
    expect(result.current.getSelectedVendor()).toEqual(mockVendor);
    expect(result.current.getSelectedTransaction()).toEqual(mockTransaction);
  });

  test('provides utility methods for getting children', () => {
    const mockCategoryWithChildren = {
      id: 1,
      children: [
        { id: 2, type: 'category', name: 'Subcategory' },
        { id: 'vendor_1', type: 'vendor', name: 'Starbucks' }
      ]
    };

    const mockVendorWithTransactions = {
      id: 'vendor_1',
      children: [
        { id: 'transaction_1', type: 'transaction', name: 'Coffee' }
      ]
    };

    findNodeInTree
      .mockReturnValueOnce(mockCategoryWithChildren)
      .mockReturnValueOnce(mockCategoryWithChildren)
      .mockReturnValueOnce(mockVendorWithTransactions);

    const { result } = renderHook(() => useTreeView());

    const categoryChildren = result.current.getCategoryChildren(1);
    const vendorsByCategory = result.current.getVendorsByCategory(1);
    const transactionsByVendor = result.current.getTransactionsByVendor('vendor_1');

    expect(categoryChildren).toEqual([{ id: 2, type: 'category', name: 'Subcategory' }]);
    expect(vendorsByCategory).toEqual([{ id: 'vendor_1', type: 'vendor', name: 'Starbucks' }]);
    expect(transactionsByVendor).toEqual([{ id: 'transaction_1', type: 'transaction', name: 'Coffee' }]);
  });

  test('hasChildren method works correctly', () => {
    categoryHasChildren.mockReturnValue(true);

    const { result } = renderHook(() => useTreeView());

    expect(result.current.hasChildren(1)).toBe(true);
    expect(categoryHasChildren).toHaveBeenCalledWith(mockTreeData, 1);
  });
}); 