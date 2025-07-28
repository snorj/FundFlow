import React, { createContext, useContext, useReducer, useCallback, useMemo } from 'react';

// Action types
const ACTIONS = {
  SELECT_CATEGORY: 'SELECT_CATEGORY',
  SELECT_VENDOR: 'SELECT_VENDOR',
  SELECT_TRANSACTION_GROUP: 'SELECT_TRANSACTION_GROUP',
  UPDATE_VENDOR: 'UPDATE_VENDOR',
  UPDATE_CATEGORY: 'UPDATE_CATEGORY',
  CREATE_RULE: 'CREATE_RULE',
  UPDATE_RULE: 'UPDATE_RULE',
  CATEGORISE_TRANSACTION_GROUP: 'CATEGORISE_TRANSACTION_GROUP',
  MERGE_TRANSACTION_GROUPS: 'MERGE_TRANSACTION_GROUPS',
  SPLIT_TRANSACTION_GROUP: 'SPLIT_TRANSACTION_GROUP',
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR'
};

// Initial state
const initialState = {
  // Selection state
  selectedCategory: null,
  selectedVendor: null,
  selectedTransactionGroup: null,
  
  // Data state
  categories: [],
  vendors: [],
  transactions: [],
  transactionGroups: [],
  rules: [],
  
  // UI state
  loading: false,
  error: null,
  
  // Filter state
  searchTerm: '',
  confidenceFilter: 'all',
  sortBy: 'amount',
  sortOrder: 'desc'
};

// Reducer function
function categorizationReducer(state, action) {
  switch (action.type) {
    case ACTIONS.SELECT_CATEGORY:
      return {
        ...state,
        selectedCategory: action.payload,
        selectedVendor: null, // Clear vendor when category changes
        selectedTransactionGroup: null // Clear transaction group when category changes
      };
    
    case ACTIONS.SELECT_VENDOR:
      return {
        ...state,
        selectedVendor: action.payload.vendor,
        selectedCategory: action.payload.category || state.selectedCategory,
        selectedTransactionGroup: null // Clear transaction group when vendor changes
      };
    
    case ACTIONS.SELECT_TRANSACTION_GROUP:
      return {
        ...state,
        selectedTransactionGroup: action.payload
      };
    
    case ACTIONS.UPDATE_VENDOR:
      return {
        ...state,
        vendors: state.vendors.map(vendor =>
          vendor.id === action.payload.id ? { ...vendor, ...action.payload } : vendor
        ),
        selectedVendor: state.selectedVendor?.id === action.payload.id 
          ? { ...state.selectedVendor, ...action.payload } 
          : state.selectedVendor
      };
    
    case ACTIONS.UPDATE_CATEGORY:
      return {
        ...state,
        categories: state.categories.map(category =>
          category.id === action.payload.id ? { ...category, ...action.payload } : category
        ),
        selectedCategory: state.selectedCategory?.id === action.payload.id 
          ? { ...state.selectedCategory, ...action.payload } 
          : state.selectedCategory
      };
    
    case ACTIONS.CREATE_RULE:
      return {
        ...state,
        rules: [...state.rules, { id: Date.now(), ...action.payload, active: true }]
      };
    
    case ACTIONS.UPDATE_RULE:
      return {
        ...state,
        rules: state.rules.map(rule =>
          rule.id === action.payload.id ? { ...rule, ...action.payload } : rule
        )
      };
    
    case ACTIONS.CATEGORISE_TRANSACTION_GROUP:
      const { groupId, categoryId } = action.payload;
      return {
        ...state,
        transactionGroups: state.transactionGroups.filter(group => group.id !== groupId),
        transactions: state.transactions.map(transaction => {
          // Update transactions that belong to this group
          const group = state.transactionGroups.find(g => g.id === groupId);
          if (group && transaction.description.includes(group.merchant)) {
            return { ...transaction, categoryId };
          }
          return transaction;
        })
      };
    
    case ACTIONS.MERGE_TRANSACTION_GROUPS:
      const { sourceGroupId, targetGroupId } = action.payload;
      const sourceGroup = state.transactionGroups.find(g => g.id === sourceGroupId);
      const targetGroup = state.transactionGroups.find(g => g.id === targetGroupId);
      
      if (!sourceGroup || !targetGroup) return state;
      
      return {
        ...state,
        transactionGroups: state.transactionGroups
          .filter(group => group.id !== sourceGroupId)
          .map(group => 
            group.id === targetGroupId 
              ? {
                  ...group,
                  amount: group.amount + sourceGroup.amount,
                  count: group.count + sourceGroup.count
                }
              : group
          )
      };
    
    case ACTIONS.SPLIT_TRANSACTION_GROUP:
      // Implementation would depend on specific split requirements
      return state;
    
    case ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload
      };
    
    case ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false
      };
    
    case ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null
      };
    
    default:
      return state;
  }
}

// Create context
const CategorizationContext = createContext();

// Context provider component
export const CategorizationProvider = ({ children, initialData = {} }) => {
  // Debug logging
  console.log('CategorizationProvider: Received initialData:', {
    categories: initialData.categories?.length || 0,
    vendors: initialData.vendors?.length || 0,
    transactions: initialData.transactions?.length || 0,
    transactionGroups: initialData.transactionGroups?.length || 0,
    hasData: !!initialData.categories && !!initialData.vendors && !!initialData.transactions
  });

  const [state, dispatch] = useReducer(categorizationReducer, {
    ...initialState,
    ...initialData
  });

  // Debug logging for state
  console.log('CategorizationProvider: Current state after reducer:', {
    categories: state.categories?.length || 0,
    vendors: state.vendors?.length || 0,
    transactions: state.transactions?.length || 0,
    transactionGroups: state.transactionGroups?.length || 0,
    rootCategories: state.categories?.filter(c => !c.parentId)?.length || 0
  });

  // Selection actions
  const selectCategory = useCallback((category) => {
    dispatch({ type: ACTIONS.SELECT_CATEGORY, payload: category });
  }, []);

  const selectVendor = useCallback((vendor, category = null) => {
    dispatch({ 
      type: ACTIONS.SELECT_VENDOR, 
      payload: { vendor, category } 
    });
  }, []);

  const selectTransactionGroup = useCallback((group) => {
    dispatch({ type: ACTIONS.SELECT_TRANSACTION_GROUP, payload: group });
  }, []);

  // Data update actions
  const updateVendor = useCallback((vendorData) => {
    dispatch({ type: ACTIONS.UPDATE_VENDOR, payload: vendorData });
  }, []);

  const updateCategory = useCallback((categoryData) => {
    dispatch({ type: ACTIONS.UPDATE_CATEGORY, payload: categoryData });
  }, []);

  const createRule = useCallback((ruleData) => {
    dispatch({ type: ACTIONS.CREATE_RULE, payload: ruleData });
  }, []);

  const updateRule = useCallback((ruleData) => {
    dispatch({ type: ACTIONS.UPDATE_RULE, payload: ruleData });
  }, []);

  // Transaction group actions
    const categoriseTransactionGroup = useCallback((groupId, categoryId) => {
    dispatch({
      type: ACTIONS.CATEGORISE_TRANSACTION_GROUP, 
      payload: { groupId, categoryId } 
    });
  }, []);

  const mergeTransactionGroups = useCallback((sourceGroupId, targetGroupId) => {
    dispatch({ 
      type: ACTIONS.MERGE_TRANSACTION_GROUPS, 
      payload: { sourceGroupId, targetGroupId } 
    });
  }, []);

  const splitTransactionGroup = useCallback((groupId, splitData) => {
    dispatch({ 
      type: ACTIONS.SPLIT_TRANSACTION_GROUP, 
      payload: { groupId, splitData } 
    });
  }, []);

  // UI actions
  const setLoading = useCallback((loading) => {
    dispatch({ type: ACTIONS.SET_LOADING, payload: loading });
  }, []);

  const setError = useCallback((error) => {
    dispatch({ type: ACTIONS.SET_ERROR, payload: error });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: ACTIONS.CLEAR_ERROR });
  }, []);

  // Computed values
  const computedValues = useMemo(() => {
    // Calculate category totals including subcategories
    const getCategoryTotal = (categoryId) => {
      const directTotal = state.transactions
        .filter(t => t.categoryId === categoryId)
        .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0);
      
      const childCategories = state.categories.filter(c => c.parentId === categoryId);
      const childTotal = childCategories.reduce(
        (sum, child) => sum + getCategoryTotal(child.id),
        0
      );
      
      return directTotal + childTotal;
    };

    // Get vendors for a specific category
    const getCategoryVendors = (categoryId) => {
      return state.vendors.filter(vendor => {
        return state.transactions.some(t => 
          t.vendorId === vendor.id && t.categoryId === categoryId
        );
      });
    };

    // Get filtered and sorted transaction groups
    const getFilteredTransactionGroups = () => {
      let filtered = state.transactionGroups;

      // Apply search filter
      if (state.searchTerm) {
        filtered = filtered.filter(group => 
          group.merchant.toLowerCase().includes(state.searchTerm.toLowerCase()) ||
          group.description.toLowerCase().includes(state.searchTerm.toLowerCase())
        );
      }

      // Apply confidence filter
      if (state.confidenceFilter !== 'all') {
        filtered = filtered.filter(group => group.confidence === state.confidenceFilter);
      }

      // Apply sorting
      return filtered.sort((a, b) => {
        let aValue, bValue;
        
        switch (state.sortBy) {
          case 'amount':
            aValue = a.amount;
            bValue = b.amount;
            break;
          case 'date':
            aValue = new Date(a.date);
            bValue = new Date(b.date);
            break;
          case 'merchant':
            aValue = a.merchant.toLowerCase();
            bValue = b.merchant.toLowerCase();
            break;
          case 'count':
            aValue = a.count;
            bValue = b.count;
            break;
          default:
            return 0;
        }

        if (state.sortOrder === 'asc') {
          return aValue > bValue ? 1 : -1;
        } else {
          return aValue < bValue ? 1 : -1;
        }
      });
    };

    // Get transactions for selected vendor/category
    const getRelatedTransactions = () => {
      if (state.selectedVendor && state.selectedCategory) {
        return state.transactions.filter(t => 
          t.vendorId === state.selectedVendor.id && 
          t.categoryId === state.selectedCategory.id
        );
      } else if (state.selectedCategory) {
        return state.transactions.filter(t => t.categoryId === state.selectedCategory.id);
      } else if (state.selectedVendor) {
        return state.transactions.filter(t => t.vendorId === state.selectedVendor.id);
      }
      return [];
    };

    return {
      getCategoryTotal,
      getCategoryVendors,
      getFilteredTransactionGroups: getFilteredTransactionGroups(),
      getRelatedTransactions: getRelatedTransactions()
    };
  }, [
    state.categories, 
    state.transactions, 
    state.vendors, 
    state.transactionGroups,
    state.selectedCategory,
    state.selectedVendor,
    state.searchTerm,
    state.confidenceFilter,
    state.sortBy,
    state.sortOrder
  ]);

  // Context value
  const value = {
    // State
    ...state,
    
    // Actions
    selectCategory,
    selectVendor,
    selectTransactionGroup,
    updateVendor,
    updateCategory,
    createRule,
    updateRule,
    categoriseTransactionGroup,
    mergeTransactionGroups,
    splitTransactionGroup,
    setLoading,
    setError,
    clearError,
    
    // Computed values
    ...computedValues
  };

  return (
    <CategorizationContext.Provider value={value}>
      {children}
    </CategorizationContext.Provider>
  );
};

// Custom hook to use the context
export const useCategorization = () => {
  const context = useContext(CategorizationContext);
  if (!context) {
    throw new Error('useCategorization must be used within a CategorizationProvider');
  }
  return context;
};

export default CategorizationContext; 