import {
  transformCategoryData,
  flattenCategoryTree,
  findNodeInTree,
  filterTreeData,
  calculateCategorySpendingTotals
} from './categoryTransformUtils';

describe('categoryTransformUtils', () => {
  // Mock data for testing
  const mockCategories = [
    {
      id: 1,
      name: 'Food & Dining',
      parent: null,
      is_custom: true,
      user: 1
    },
    {
      id: 2,
      name: 'Restaurants',
      parent: 1,
      is_custom: true,
      user: 1
    },
    {
      id: 3,
      name: 'Transport',
      parent: null,
      is_custom: false,
      user: null
    },
    {
      id: 4,
      name: 'Gas',
      parent: 3,
      is_custom: false,
      user: null
    }
  ];

  const mockTransactions = [
    {
      id: 1,
      description: 'Starbucks',
      category: 1,
      aud_amount: -5.50,
      transaction_date: '2024-01-15',
      direction: 'outgoing'
    },
    {
      id: 2,
      description: 'McDonald\'s',
      category: 2,
      aud_amount: -12.30,
      transaction_date: '2024-01-14',
      direction: 'outgoing'
    },
    {
      id: 3,
      description: 'Shell Gas Station',
      category: 4,
      aud_amount: -45.00,
      transaction_date: '2024-01-13',
      direction: 'outgoing'
    },
    {
      id: 4,
      description: 'Starbucks',
      category: 1,
      aud_amount: -4.75,
      transaction_date: '2024-01-12',
      direction: 'outgoing'
    }
  ];

  describe('transformCategoryData', () => {
    test('transforms flat category array to hierarchical tree', () => {
      const result = transformCategoryData(mockCategories, [], {
        includeVendors: false,
        includeTransactions: false
      });

      expect(result).toHaveLength(2); // Two root categories
      expect(result[0].name).toBe('Food & Dining');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].name).toBe('Restaurants');
      expect(result[1].name).toBe('Transport');
      expect(result[1].children).toHaveLength(1);
      expect(result[1].children[0].name).toBe('Gas');
    });

    test('includes vendor children when includeVendors is true', () => {
      const result = transformCategoryData(mockCategories, mockTransactions, {
        includeVendors: true,
        includeTransactions: false
      });

      const foodCategory = result.find(cat => cat.name === 'Food & Dining');
      expect(foodCategory.children.some(child => child.type === 'vendor')).toBe(true);
      
      const starbucksVendor = foodCategory.children.find(child => child.name === 'Starbucks');
      expect(starbucksVendor).toBeDefined();
      expect(starbucksVendor.type).toBe('vendor');
      expect(starbucksVendor.totalAmount).toBe(10.25); // 5.50 + 4.75
    });

    test('includes transaction children when includeTransactions is true', () => {
      const result = transformCategoryData(mockCategories, mockTransactions, {
        includeVendors: true,
        includeTransactions: true
      });

      const foodCategory = result.find(cat => cat.name === 'Food & Dining');
      const starbucksVendor = foodCategory.children.find(child => child.name === 'Starbucks');
      
      expect(starbucksVendor.children).toHaveLength(2); // Two Starbucks transactions
      expect(starbucksVendor.children[0].type).toBe('transaction');
      expect(starbucksVendor.children[0].amount).toBe(5.50);
    });

    test('filters system categories when showSystemCategories is false', () => {
      const result = transformCategoryData(mockCategories, [], {
        showSystemCategories: false,
        showUserCategories: true,
        includeVendors: false
      });

      expect(result).toHaveLength(1); // Only user categories
      expect(result[0].name).toBe('Food & Dining');
      expect(result.some(cat => cat.name === 'Transport')).toBe(false);
    });

    test('filters user categories when showUserCategories is false', () => {
      const result = transformCategoryData(mockCategories, [], {
        showSystemCategories: true,
        showUserCategories: false,
        includeVendors: false
      });

      expect(result).toHaveLength(1); // Only system categories
      expect(result[0].name).toBe('Transport');
      expect(result.some(cat => cat.name === 'Food & Dining')).toBe(false);
    });

    test('handles empty categories array', () => {
      const result = transformCategoryData([], mockTransactions);
      expect(result).toEqual([]);
    });

    test('handles non-array categories input', () => {
      const result = transformCategoryData(null, mockTransactions);
      expect(result).toEqual([]);
    });

    test('preserves original category data', () => {
      const result = transformCategoryData(mockCategories, [], {
        includeVendors: false
      });

      expect(result[0].originalCategory).toEqual(mockCategories[0]);
    });
  });

  describe('flattenCategoryTree', () => {
    test('converts hierarchical tree back to flat array', () => {
      const treeData = transformCategoryData(mockCategories, [], {
        includeVendors: false
      });
      const flattened = flattenCategoryTree(treeData);

      expect(flattened).toHaveLength(4); // All 4 categories
      expect(flattened.every(cat => cat.id && cat.name)).toBe(true);
    });

    test('excludes non-category nodes', () => {
      const treeData = transformCategoryData(mockCategories, mockTransactions, {
        includeVendors: true,
        includeTransactions: true
      });
      const flattened = flattenCategoryTree(treeData);

      expect(flattened.every(item => !item.type || item.type === 'category')).toBe(true);
    });

    test('handles empty tree data', () => {
      const result = flattenCategoryTree([]);
      expect(result).toEqual([]);
    });
  });

  describe('findNodeInTree', () => {
    let treeData;

    beforeEach(() => {
      treeData = transformCategoryData(mockCategories, mockTransactions, {
        includeVendors: true,
        includeTransactions: true
      });
    });

    test('finds category node by id', () => {
      const found = findNodeInTree(treeData, 1, 'category');
      expect(found).toBeDefined();
      expect(found.name).toBe('Food & Dining');
      expect(found.type).toBe('category');
    });

    test('finds vendor node by id', () => {
      const found = findNodeInTree(treeData, 'vendor_Starbucks', 'vendor');
      expect(found).toBeDefined();
      expect(found.name).toBe('Starbucks');
      expect(found.type).toBe('vendor');
    });

    test('finds transaction node by id', () => {
      const found = findNodeInTree(treeData, 'transaction_1', 'transaction');
      expect(found).toBeDefined();
      expect(found.type).toBe('transaction');
    });

    test('returns null for non-existent node', () => {
      const found = findNodeInTree(treeData, 999);
      expect(found).toBeNull();
    });

    test('finds node without type specification', () => {
      const found = findNodeInTree(treeData, 1);
      expect(found).toBeDefined();
      expect(found.name).toBe('Food & Dining');
    });
  });

  describe('filterTreeData', () => {
    let treeData;

    beforeEach(() => {
      treeData = transformCategoryData(mockCategories, mockTransactions, {
        includeVendors: true,
        includeTransactions: false
      });
    });

    test('filters nodes by search term', () => {
      const filtered = filterTreeData(treeData, 'Food');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Food & Dining');
    });

    test('includes parent nodes when children match', () => {
      const filtered = filterTreeData(treeData, 'Restaurants');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Food & Dining'); // Parent included
      expect(filtered[0].children.some(child => child.name === 'Restaurants')).toBe(true);
    });

    test('is case insensitive', () => {
      const filtered = filterTreeData(treeData, 'FOOD');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].name).toBe('Food & Dining');
    });

    test('returns all data for empty search term', () => {
      const filtered = filterTreeData(treeData, '');
      expect(filtered).toEqual(treeData);
    });

    test('returns empty array when no matches found', () => {
      const filtered = filterTreeData(treeData, 'NonExistent');
      expect(filtered).toEqual([]);
    });

    test('handles null/undefined search term', () => {
      const filtered1 = filterTreeData(treeData, null);
      const filtered2 = filterTreeData(treeData, undefined);
      expect(filtered1).toEqual(treeData);
      expect(filtered2).toEqual(treeData);
    });
  });

  describe('calculateCategorySpendingTotals', () => {
    test('calculates direct spending for categories', () => {
      const totals = calculateCategorySpendingTotals(mockTransactions, mockCategories);
      
      expect(totals[1]).toBe(22.55); // Food & Dining: 10.25 (direct) + 12.30 (Restaurants subcategory)
      expect(totals[2]).toBe(12.30); // Restaurants: 12.30
      expect(totals[4]).toBe(45.00); // Gas: 45.00
    });

    test('includes subcategory spending in parent totals', () => {
      const totals = calculateCategorySpendingTotals(mockTransactions, mockCategories);
      
      // Transport category should include Gas subcategory spending
      expect(totals[3]).toBe(45.00); // Transport total includes Gas spending
    });

    test('handles empty transactions array', () => {
      const totals = calculateCategorySpendingTotals([], mockCategories);
      expect(Object.keys(totals)).toHaveLength(0);
    });

    test('handles empty categories array', () => {
      const totals = calculateCategorySpendingTotals(mockTransactions, []);
      expect(totals).toEqual({});
    });

    test('handles non-array inputs', () => {
      const totals = calculateCategorySpendingTotals(null, null);
      expect(totals).toEqual({});
    });

    test('uses absolute values for amounts', () => {
      const negativeTransactions = [
        {
          id: 1,
          category: 1,
          aud_amount: -100.00 // Negative amount
        }
      ];
      const totals = calculateCategorySpendingTotals(negativeTransactions, [mockCategories[0]]);
      expect(totals[1]).toBe(100.00); // Should be positive
    });
  });
}); 