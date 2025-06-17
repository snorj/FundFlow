import { useState, useCallback, useMemo } from 'react';
import { 
  transformCategoryData, 
  findNodeInTree, 
  filterTreeData,
  getCategoryIdsFromTree,
  getCategoryParentMap,
  categoryHasChildren
} from '../utils/categoryTransformUtils';

/**
 * Custom hook for managing TreeView component state and interactions
 * @param {Object} options - Configuration options
 * @returns {Object} Tree view state and methods
 */
export const useTreeView = ({
  categories = [],
  transactions = [],
  categorySpendingTotals = {},
  initialSelectedCategory = null,
  initialSelectedVendor = null,
  initialSelectedTransaction = null,
  includeVendors = true,
  includeTransactions = true,
  showSystemCategories = true,
  showUserCategories = true
} = {}) => {
  
  // Selection state
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialSelectedCategory);
  const [selectedVendorId, setSelectedVendorId] = useState(initialSelectedVendor);
  const [selectedTransactionId, setSelectedTransactionId] = useState(initialSelectedTransaction);
  
  // UI state
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // Transform data for TreeView
  const treeData = useMemo(() => {
    return transformCategoryData(categories, transactions, {
      includeVendors,
      includeTransactions,
      showSystemCategories,
      showUserCategories,
      categorySpendingTotals
    });
  }, [categories, transactions, categorySpendingTotals, includeVendors, includeTransactions, showSystemCategories, showUserCategories]);

  // Apply search filter
  const filteredTreeData = useMemo(() => {
    return filterTreeData(treeData, searchTerm);
  }, [treeData, searchTerm]);

  // Get helper data
  const categoryIds = useMemo(() => getCategoryIdsFromTree(treeData), [treeData]);
  const parentMap = useMemo(() => getCategoryParentMap(treeData), [treeData]);

  // Selection handlers
  const handleCategorySelect = useCallback((category) => {
    setSelectedCategoryId(category.id);
    setSelectedVendorId(null);
    setSelectedTransactionId(null);
  }, []);

  const handleVendorSelect = useCallback((vendor) => {
    setSelectedVendorId(vendor.id);
    setSelectedTransactionId(null);
  }, []);

  const handleTransactionSelect = useCallback((transaction) => {
    setSelectedTransactionId(transaction.id);
  }, []);

  // Node expansion handlers
  const handleNodeExpand = useCallback((nodeId) => {
    setExpandedNodes(prev => new Set([...prev, nodeId]));
  }, []);

  const handleNodeCollapse = useCallback((nodeId) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      newSet.delete(nodeId);
      return newSet;
    });
  }, []);

  const handleToggleNodeExpansion = useCallback((nodeId) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpandedNodes(new Set(categoryIds));
  }, [categoryIds]);

  const collapseAll = useCallback(() => {
    setExpandedNodes(new Set());
  }, []);

  // Utility methods
  const getSelectedCategory = useCallback(() => {
    return selectedCategoryId ? findNodeInTree(treeData, selectedCategoryId, 'category') : null;
  }, [treeData, selectedCategoryId]);

  const getSelectedVendor = useCallback(() => {
    return selectedVendorId ? findNodeInTree(treeData, selectedVendorId, 'vendor') : null;
  }, [treeData, selectedVendorId]);

  const getSelectedTransaction = useCallback(() => {
    return selectedTransactionId ? findNodeInTree(treeData, selectedTransactionId, 'transaction') : null;
  }, [treeData, selectedTransactionId]);

  const getCategoryChildren = useCallback((categoryId) => {
    const category = findNodeInTree(treeData, categoryId, 'category');
    return category ? category.children.filter(child => child.type === 'category') : [];
  }, [treeData]);

  const getVendorsByCategory = useCallback((categoryId) => {
    const category = findNodeInTree(treeData, categoryId, 'category');
    return category ? category.children.filter(child => child.type === 'vendor') : [];
  }, [treeData]);

  const getTransactionsByVendor = useCallback((vendorId) => {
    const vendor = findNodeInTree(treeData, vendorId, 'vendor');
    return vendor ? vendor.children.filter(child => child.type === 'transaction') : [];
  }, [treeData]);

  const hasChildren = useCallback((categoryId) => {
    return categoryHasChildren(treeData, categoryId);
  }, [treeData]);

  const isNodeExpanded = useCallback((nodeId) => {
    return expandedNodes.has(nodeId);
  }, [expandedNodes]);

  const clearSelection = useCallback(() => {
    setSelectedCategoryId(null);
    setSelectedVendorId(null);
    setSelectedTransactionId(null);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchTerm('');
  }, []);

  return {
    // Data
    treeData: filteredTreeData,
    originalTreeData: treeData,
    categoryIds,
    parentMap,
    
    // Selection state
    selectedCategoryId,
    selectedVendorId,
    selectedTransactionId,
    
    // UI state
    searchTerm,
    expandedNodes,
    
    // Selection handlers
    handleCategorySelect,
    handleVendorSelect,
    handleTransactionSelect,
    clearSelection,
    
    // Search handlers
    setSearchTerm,
    clearSearch,
    
    // Expansion handlers
    handleNodeExpand,
    handleNodeCollapse,
    handleToggleNodeExpansion,
    expandAll,
    collapseAll,
    isNodeExpanded,
    
    // Utility methods
    getSelectedCategory,
    getSelectedVendor,
    getSelectedTransaction,
    getCategoryChildren,
    getVendorsByCategory,
    getTransactionsByVendor,
    hasChildren
  };
};

export default useTreeView; 