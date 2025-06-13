import React, { createContext, useContext, useReducer, useCallback, useMemo, useEffect } from 'react';
import {
  groupTransactionsByVendor,
  calculateReviewProgress,
  validateBulkOperation,
  generateReviewSummary,
  cloneVendorGroups,
  reviewStorageUtils
} from '../utils/reviewWorkflow';

// Action types for the review workflow
const REVIEW_ACTIONS = {
  // Data loading actions
  SET_LOADING: 'SET_LOADING',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  LOAD_VENDOR_GROUPS: 'LOAD_VENDOR_GROUPS',
  LOAD_CATEGORIES: 'LOAD_CATEGORIES',
  
  // Selection actions
  SELECT_VENDOR_GROUP: 'SELECT_VENDOR_GROUP',
  TOGGLE_VENDOR_GROUP_SELECTION: 'TOGGLE_VENDOR_GROUP_SELECTION',
  SELECT_ALL_VENDOR_GROUPS: 'SELECT_ALL_VENDOR_GROUPS',
  DESELECT_ALL_VENDOR_GROUPS: 'DESELECT_ALL_VENDOR_GROUPS',
  
  // Category assignment actions
  UPDATE_VENDOR_CATEGORY: 'UPDATE_VENDOR_CATEGORY',
  APPLY_CATEGORY_CHANGES: 'APPLY_CATEGORY_CHANGES',
  
  // Review actions
  APPROVE_VENDOR_GROUP: 'APPROVE_VENDOR_GROUP',
  REJECT_VENDOR_GROUP: 'REJECT_VENDOR_GROUP',
  BULK_APPROVE: 'BULK_APPROVE',
  BULK_REJECT: 'BULK_REJECT',
  
  // Rule management actions
  CREATE_RULE: 'CREATE_RULE',
  UPDATE_RULE: 'UPDATE_RULE',
  DELETE_RULE: 'DELETE_RULE',
  
  // Progress and completion actions
  UPDATE_PROGRESS: 'UPDATE_PROGRESS',
  SAVE_PROGRESS: 'SAVE_PROGRESS',
  LOAD_PROGRESS: 'LOAD_PROGRESS',
  COMPLETE_REVIEW: 'COMPLETE_REVIEW',
  
  // UI state actions
  SET_PROCESSING: 'SET_PROCESSING',
  SET_FILTERS: 'SET_FILTERS',
  SET_SORT_ORDER: 'SET_SORT_ORDER'
};

// Initial state for the review context
const initialState = {
  // Data state
  vendorGroups: [],
  categories: [],
  availableRules: [],
  
  // Selection state
  selectedVendorGroups: new Set(),
  categoryChanges: new Map(), // vendorGroupId -> categoryId
  
  // Review state
  approvedGroups: new Set(),
  rejectedGroups: new Set(),
  completedGroups: new Set(),
  createdRules: [],
  
  // Progress state
  reviewProgress: {
    totalGroups: 0,
    totalTransactions: 0,
    totalAmount: 0,
    completionPercentage: 0,
    reviewedGroups: 0,
    remainingGroups: 0
  },
  
  // UI state
  loading: false,
  processing: false,
  error: null,
  filters: {
    status: 'all', // all, pending, approved, rejected
    minConfidence: 0,
    hasRule: undefined,
    vendorSearch: '',
    categoryId: null
  },
  sortBy: 'amount',
  sortOrder: 'desc',
  
  // Session state
  sessionId: null,
  isReviewComplete: false,
  lastSaved: null
};

// Reducer function to handle state updates
function reviewReducer(state, action) {
  switch (action.type) {
    case REVIEW_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload,
        error: action.payload ? null : state.error
      };
    
    case REVIEW_ACTIONS.SET_PROCESSING:
      return {
        ...state,
        processing: action.payload
      };
    
    case REVIEW_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false,
        processing: false
      };
    
    case REVIEW_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null
      };
    
    case REVIEW_ACTIONS.LOAD_VENDOR_GROUPS:
      const { vendorGroups, sessionId } = action.payload;
      return {
        ...state,
        vendorGroups: cloneVendorGroups(vendorGroups),
        sessionId,
        loading: false,
        error: null
      };
    
    case REVIEW_ACTIONS.LOAD_CATEGORIES:
      return {
        ...state,
        categories: action.payload
      };
    
    case REVIEW_ACTIONS.SELECT_VENDOR_GROUP:
      return {
        ...state,
        selectedVendorGroups: new Set([action.payload])
      };
    
    case REVIEW_ACTIONS.TOGGLE_VENDOR_GROUP_SELECTION:
      const newSelection = new Set(state.selectedVendorGroups);
      if (newSelection.has(action.payload)) {
        newSelection.delete(action.payload);
      } else {
        newSelection.add(action.payload);
      }
      return {
        ...state,
        selectedVendorGroups: newSelection
      };
    
    case REVIEW_ACTIONS.SELECT_ALL_VENDOR_GROUPS:
      return {
        ...state,
        selectedVendorGroups: new Set(state.vendorGroups.map(group => group.id))
      };
    
    case REVIEW_ACTIONS.DESELECT_ALL_VENDOR_GROUPS:
      return {
        ...state,
        selectedVendorGroups: new Set()
      };
    
    case REVIEW_ACTIONS.UPDATE_VENDOR_CATEGORY:
      const { vendorGroupId, categoryId } = action.payload;
      const newCategoryChanges = new Map(state.categoryChanges);
      if (categoryId) {
        newCategoryChanges.set(vendorGroupId, categoryId);
      } else {
        newCategoryChanges.delete(vendorGroupId);
      }
      return {
        ...state,
        categoryChanges: newCategoryChanges
      };
    
    case REVIEW_ACTIONS.APPROVE_VENDOR_GROUP:
      const approvedGroupId = action.payload;
      return {
        ...state,
        approvedGroups: new Set([...state.approvedGroups, approvedGroupId]),
        rejectedGroups: new Set([...state.rejectedGroups].filter(id => id !== approvedGroupId)),
        completedGroups: new Set([...state.completedGroups, approvedGroupId]),
        selectedVendorGroups: new Set([...state.selectedVendorGroups].filter(id => id !== approvedGroupId))
      };
    
    case REVIEW_ACTIONS.REJECT_VENDOR_GROUP:
      const rejectedGroupId = action.payload;
      return {
        ...state,
        rejectedGroups: new Set([...state.rejectedGroups, rejectedGroupId]),
        approvedGroups: new Set([...state.approvedGroups].filter(id => id !== rejectedGroupId)),
        completedGroups: new Set([...state.completedGroups, rejectedGroupId]),
        selectedVendorGroups: new Set([...state.selectedVendorGroups].filter(id => id !== rejectedGroupId))
      };
    
    case REVIEW_ACTIONS.BULK_APPROVE:
      const bulkApprovedIds = action.payload;
      return {
        ...state,
        approvedGroups: new Set([...state.approvedGroups, ...bulkApprovedIds]),
        rejectedGroups: new Set([...state.rejectedGroups].filter(id => !bulkApprovedIds.includes(id))),
        completedGroups: new Set([...state.completedGroups, ...bulkApprovedIds]),
        selectedVendorGroups: new Set()
      };
    
    case REVIEW_ACTIONS.BULK_REJECT:
      const bulkRejectedIds = action.payload;
      return {
        ...state,
        rejectedGroups: new Set([...state.rejectedGroups, ...bulkRejectedIds]),
        approvedGroups: new Set([...state.approvedGroups].filter(id => !bulkRejectedIds.includes(id))),
        completedGroups: new Set([...state.completedGroups, ...bulkRejectedIds]),
        selectedVendorGroups: new Set()
      };
    
    case REVIEW_ACTIONS.CREATE_RULE:
      return {
        ...state,
        createdRules: [...state.createdRules, action.payload],
        availableRules: [...state.availableRules, action.payload]
      };
    
    case REVIEW_ACTIONS.UPDATE_RULE:
      const updatedRule = action.payload;
      return {
        ...state,
        availableRules: state.availableRules.map(rule =>
          rule.id === updatedRule.id ? updatedRule : rule
        ),
        createdRules: state.createdRules.map(rule =>
          rule.id === updatedRule.id ? updatedRule : rule
        )
      };
    
    case REVIEW_ACTIONS.DELETE_RULE:
      const deletedRuleId = action.payload;
      return {
        ...state,
        availableRules: state.availableRules.filter(rule => rule.id !== deletedRuleId),
        createdRules: state.createdRules.filter(rule => rule.id !== deletedRuleId)
      };
    
    case REVIEW_ACTIONS.UPDATE_PROGRESS:
      return {
        ...state,
        reviewProgress: action.payload
      };
    
    case REVIEW_ACTIONS.SAVE_PROGRESS:
      return {
        ...state,
        lastSaved: new Date().toISOString()
      };
    
    case REVIEW_ACTIONS.LOAD_PROGRESS:
      const { progress } = action.payload;
      return {
        ...state,
        selectedVendorGroups: new Set(progress.selectedVendors || []),
        categoryChanges: new Map(progress.categoryChanges || []),
        approvedGroups: new Set(progress.approvedGroups || []),
        rejectedGroups: new Set(progress.rejectedGroups || []),
        completedGroups: new Set(progress.completedGroups || []),
        createdRules: progress.createdRules || [],
        lastSaved: progress.savedAt
      };
    
    case REVIEW_ACTIONS.COMPLETE_REVIEW:
      return {
        ...state,
        isReviewComplete: true,
        selectedVendorGroups: new Set(),
        processing: false
      };
    
    case REVIEW_ACTIONS.SET_FILTERS:
      return {
        ...state,
        filters: { ...state.filters, ...action.payload }
      };
    
    case REVIEW_ACTIONS.SET_SORT_ORDER:
      return {
        ...state,
        sortBy: action.payload.sortBy || state.sortBy,
        sortOrder: action.payload.sortOrder || state.sortOrder
      };
    
    default:
      return state;
  }
}

// Create the context
const ReviewContext = createContext();

// Context provider component
export const ReviewProvider = ({ children, initialData = {} }) => {
  const [state, dispatch] = useReducer(reviewReducer, {
    ...initialState,
    ...initialData
  });

  // Auto-calculate progress when relevant state changes
  useEffect(() => {
    const progress = calculateReviewProgress(
      state.vendorGroups,
      state.completedGroups,
      state.categoryChanges
    );
    
    dispatch({
      type: REVIEW_ACTIONS.UPDATE_PROGRESS,
      payload: progress
    });
  }, [state.vendorGroups, state.completedGroups, state.categoryChanges]);

  // Auto-save progress periodically
  useEffect(() => {
    if (state.sessionId && !state.isReviewComplete) {
      const progressData = {
        selectedVendors: Array.from(state.selectedVendorGroups),
        categoryChanges: Array.from(state.categoryChanges.entries()),
        approvedGroups: Array.from(state.approvedGroups),
        rejectedGroups: Array.from(state.rejectedGroups),
        completedGroups: Array.from(state.completedGroups),
        createdRules: state.createdRules
      };

      const saveTimeout = setTimeout(() => {
        if (reviewStorageUtils.saveProgress(state.sessionId, progressData)) {
          dispatch({ type: REVIEW_ACTIONS.SAVE_PROGRESS });
        }
      }, 5000); // Auto-save every 5 seconds

      return () => clearTimeout(saveTimeout);
    }
  }, [
    state.sessionId,
    state.selectedVendorGroups,
    state.categoryChanges,
    state.approvedGroups,
    state.rejectedGroups,
    state.completedGroups,
    state.createdRules,
    state.isReviewComplete
  ]);

  // Action creators (memoized for performance)
  const actions = useMemo(() => ({
    // Data loading actions
    setLoading: useCallback((loading) => {
      dispatch({ type: REVIEW_ACTIONS.SET_LOADING, payload: loading });
    }, []),

    setProcessing: useCallback((processing) => {
      dispatch({ type: REVIEW_ACTIONS.SET_PROCESSING, payload: processing });
    }, []),

    setError: useCallback((error) => {
      dispatch({ type: REVIEW_ACTIONS.SET_ERROR, payload: error });
    }, []),

    clearError: useCallback(() => {
      dispatch({ type: REVIEW_ACTIONS.CLEAR_ERROR });
    }, []),

    loadVendorGroups: useCallback((vendorGroups, sessionId) => {
      dispatch({
        type: REVIEW_ACTIONS.LOAD_VENDOR_GROUPS,
        payload: { vendorGroups, sessionId }
      });
    }, []),

    loadCategories: useCallback((categories) => {
      dispatch({ type: REVIEW_ACTIONS.LOAD_CATEGORIES, payload: categories });
    }, []),

    // Selection actions
    selectVendorGroup: useCallback((vendorGroupId) => {
      dispatch({ type: REVIEW_ACTIONS.SELECT_VENDOR_GROUP, payload: vendorGroupId });
    }, []),

    toggleVendorGroupSelection: useCallback((vendorGroupId) => {
      dispatch({ type: REVIEW_ACTIONS.TOGGLE_VENDOR_GROUP_SELECTION, payload: vendorGroupId });
    }, []),

    selectAllVendorGroups: useCallback(() => {
      dispatch({ type: REVIEW_ACTIONS.SELECT_ALL_VENDOR_GROUPS });
    }, []),

    deselectAllVendorGroups: useCallback(() => {
      dispatch({ type: REVIEW_ACTIONS.DESELECT_ALL_VENDOR_GROUPS });
    }, []),

    // Category assignment actions
    updateVendorCategory: useCallback((vendorGroupId, categoryId) => {
      dispatch({
        type: REVIEW_ACTIONS.UPDATE_VENDOR_CATEGORY,
        payload: { vendorGroupId, categoryId }
      });
    }, []),

    // Review actions
    approveVendorGroup: useCallback((vendorGroupId) => {
      dispatch({ type: REVIEW_ACTIONS.APPROVE_VENDOR_GROUP, payload: vendorGroupId });
    }, []),

    rejectVendorGroup: useCallback((vendorGroupId) => {
      dispatch({ type: REVIEW_ACTIONS.REJECT_VENDOR_GROUP, payload: vendorGroupId });
    }, []),

    bulkApprove: useCallback((vendorGroupIds) => {
      dispatch({ type: REVIEW_ACTIONS.BULK_APPROVE, payload: vendorGroupIds });
    }, []),

    bulkReject: useCallback((vendorGroupIds) => {
      dispatch({ type: REVIEW_ACTIONS.BULK_REJECT, payload: vendorGroupIds });
    }, []),

    // Rule management actions
    createRule: useCallback((rule) => {
      dispatch({ type: REVIEW_ACTIONS.CREATE_RULE, payload: rule });
    }, []),

    updateRule: useCallback((rule) => {
      dispatch({ type: REVIEW_ACTIONS.UPDATE_RULE, payload: rule });
    }, []),

    deleteRule: useCallback((ruleId) => {
      dispatch({ type: REVIEW_ACTIONS.DELETE_RULE, payload: ruleId });
    }, []),

    // Progress and completion actions
    saveProgress: useCallback(() => {
      if (state.sessionId) {
        const progressData = {
          selectedVendors: Array.from(state.selectedVendorGroups),
          categoryChanges: Array.from(state.categoryChanges.entries()),
          approvedGroups: Array.from(state.approvedGroups),
          rejectedGroups: Array.from(state.rejectedGroups),
          completedGroups: Array.from(state.completedGroups),
          createdRules: state.createdRules
        };

        if (reviewStorageUtils.saveProgress(state.sessionId, progressData)) {
          dispatch({ type: REVIEW_ACTIONS.SAVE_PROGRESS });
          return true;
        }
      }
      return false;
    }, [state.sessionId, state.selectedVendorGroups, state.categoryChanges, state.approvedGroups, state.rejectedGroups, state.completedGroups, state.createdRules]),

    loadProgress: useCallback((sessionId) => {
      const progress = reviewStorageUtils.loadProgress(sessionId);
      if (progress) {
        dispatch({ type: REVIEW_ACTIONS.LOAD_PROGRESS, payload: { progress } });
        return true;
      }
      return false;
    }, []),

    completeReview: useCallback(() => {
      dispatch({ type: REVIEW_ACTIONS.COMPLETE_REVIEW });
    }, []),

    // UI state actions
    setFilters: useCallback((filters) => {
      dispatch({ type: REVIEW_ACTIONS.SET_FILTERS, payload: filters });
    }, []),

    setSortOrder: useCallback((sortBy, sortOrder) => {
      dispatch({ type: REVIEW_ACTIONS.SET_SORT_ORDER, payload: { sortBy, sortOrder } });
    }, [])
  }), [state.sessionId, state.selectedVendorGroups, state.categoryChanges, state.approvedGroups, state.rejectedGroups, state.completedGroups, state.createdRules]);

  // Computed values (memoized for performance)
  const computed = useMemo(() => ({
    // Selection helpers
    selectedVendorGroupIds: Array.from(state.selectedVendorGroups),
    hasSelectedGroups: state.selectedVendorGroups.size > 0,
    selectedGroupsCount: state.selectedVendorGroups.size,
    
    // Validation helpers
    validateBulkOperation: (operationType = 'approve') => {
      return validateBulkOperation(
        Array.from(state.selectedVendorGroups),
        state.vendorGroups,
        state.categoryChanges
      );
    },
    
    // Progress helpers
    isReviewCompleted: state.completedGroups.size === state.vendorGroups.length,
    canCompleteReview: state.completedGroups.size > 0,
    
    // Summary generation
    generateCompletionSummary: () => {
      return generateReviewSummary(
        state.vendorGroups,
        state.approvedGroups,
        state.rejectedGroups,
        state.categoryChanges,
        state.createdRules
      );
    },
    
    // Category helpers
    getCategoryById: (categoryId) => {
      return state.categories.find(cat => cat.id === categoryId);
    },
    
    getVendorGroupById: (vendorGroupId) => {
      return state.vendorGroups.find(group => group.id === vendorGroupId);
    },
    
    // Status helpers
    getVendorGroupStatus: (vendorGroupId) => {
      if (state.approvedGroups.has(vendorGroupId)) return 'approved';
      if (state.rejectedGroups.has(vendorGroupId)) return 'rejected';
      if (state.categoryChanges.has(vendorGroupId)) return 'modified';
      return 'pending';
    }
  }), [
    state.selectedVendorGroups,
    state.vendorGroups,
    state.categoryChanges,
    state.completedGroups,
    state.approvedGroups,
    state.rejectedGroups,
    state.createdRules,
    state.categories
  ]);

  // Context value
  const contextValue = useMemo(() => ({
    // State
    ...state,
    
    // Actions
    ...actions,
    
    // Computed values
    ...computed
  }), [state, actions, computed]);

  return (
    <ReviewContext.Provider value={contextValue}>
      {children}
    </ReviewContext.Provider>
  );
};

// Custom hook to use the review context
export const useReview = () => {
  const context = useContext(ReviewContext);
  if (!context) {
    throw new Error('useReview must be used within a ReviewProvider');
  }
  return context;
};

// Export action types for external use
export { REVIEW_ACTIONS }; 