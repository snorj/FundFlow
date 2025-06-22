import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import TreeView from '../components/categorization/TreeView';
import { transformCategoryData } from '../utils/categoryTransformUtils';
import TransactionDetailsModal from '../components/transactions/TransactionDetailsModal';
import categoryService from '../services/categories';
import transactionService from '../services/transactions';
import { FiPlus, FiLoader, FiAlertCircle, FiEdit, FiArrowRight, FiSearch } from 'react-icons/fi';
import './CategorisePage.css'; // We'll create this CSS file next

const CategorisePage = () => {
  const navigate = useNavigate();
  const treeRef = useRef();
  const [allItems, setAllItems] = useState([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [error, setError] = useState(null);

  // New state for enhanced functionality
  const [transactions, setTransactions] = useState([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [categorySpendingTotals, setCategorySpendingTotals] = useState({});
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedVendorId, setSelectedVendorId] = useState(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');

  const [showTopLevelInput, setShowTopLevelInput] = useState(false);
  const [newTopLevelName, setNewTopLevelName] = useState('');
  const [expandedNodes, setExpandedNodes] = useState(new Set());

  // State for operations
  const [isCreating, setIsCreating] = useState(false);
  const [deletingCategoryId, setDeletingCategoryId] = useState(null);

  // Error states  
  const [createError, setCreateError] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // Transaction details modal state
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [isTransactionDetailsOpen, setIsTransactionDetailsOpen] = useState(false);
  
  // Collapse all functionality - removed unused state since TreeView handles this via ref

  const fetchItems = useCallback(async () => {
    setIsLoadingCategories(true);
    setError(null);
    setDeleteError(null);
    setCreateError(null);
    try {
      const itemsData = await categoryService.getCategories();
      setAllItems(itemsData || []);
    } catch (err) {
      console.error("Error fetching items:", err);
      setError(err.message || 'Failed to load categories and vendors.');
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  // New function to fetch transaction data
  const fetchTransactions = useCallback(async () => {
    setIsLoadingTransactions(true);
    try {
      const transactionData = await transactionService.getTransactions({ page_size: 1000 });
      setTransactions(transactionData || []);
      
      try {
        const totals = await transactionService.getCategorySpendingTotals();
        setCategorySpendingTotals(totals || {});
      } catch {
        setCategorySpendingTotals({});
      }
    } catch (err) {
      console.error("Error fetching transactions:", err);
      setTransactions([]);
      setCategorySpendingTotals({});
    } finally {
      setIsLoadingTransactions(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
    fetchTransactions();
  }, [fetchItems, fetchTransactions]);

  const handleCreateCategory = useCallback(async (name, parentId = null) => {
    setIsCreating(true);
    setCreateError(null);
    setDeleteError(null);
    try {
      // Convert parent ID to integer if provided
      const parentIdInt = parentId ? parseInt(parentId, 10) : null;
      if (parentId && isNaN(parentIdInt)) {
        throw new Error('Invalid parent category ID format');
      }
      
      const newCategoryData = { name, parent: parentIdInt };
      await categoryService.createCategory(newCategoryData);
      await fetchItems(); 
      setShowTopLevelInput(false);
      setNewTopLevelName('');
    } catch (error) {
      setCreateError(error.message || "Failed to create category.");
    } finally {
      setIsCreating(false);
    }
  }, [fetchItems]);

  const handleDeleteCategory = useCallback(async (categoryId) => {
    setDeletingCategoryId(categoryId);
    setDeleteError(null);
    setCreateError(null);
    try {
      // Convert ID to integer to match backend expectations
      const categoryIdInt = parseInt(categoryId, 10);
      if (isNaN(categoryIdInt)) {
        throw new Error('Invalid category ID format');
      }
      
      await categoryService.deleteCategory(categoryIdInt);
      await fetchItems(); 
      await fetchTransactions();
    } catch (err) {
      const backendError = err.response?.data?.error || err.message || "Failed to delete category.";
      setDeleteError(backendError);
    } finally {
      setDeletingCategoryId(null);
    }
  }, [fetchItems, fetchTransactions]);

  const handleCategoryRename = useCallback(async (categoryId, newName) => {
    try {
      // Optimistic update
      const updatedItems = allItems.map(item => 
        item.id === categoryId ? { ...item, name: newName } : item
      );
      setAllItems(updatedItems);
      
      // Convert ID to integer to match backend expectations
      const categoryIdInt = parseInt(categoryId, 10);
      if (isNaN(categoryIdInt)) {
        throw new Error('Invalid category ID format');
      }
      
      // Perform the actual backend update
      await categoryService.updateCategory(categoryIdInt, { name: newName });
      
      console.log('Category renamed successfully:', categoryId, 'to:', newName);
      
    } catch (error) {
      console.error('Failed to rename category:', error);
      
      // On error, rollback by refetching the original data
      await fetchItems();
      throw error; // Re-throw to let the component handle the error display
    }
  }, [allItems, fetchItems]);

  // New handlers for category and vendor selection
  const handleCategorySelect = useCallback((category) => {
    setSelectedCategoryId(category.id);
    setSelectedVendorId(null);
  }, []);

  const handleVendorSelect = useCallback((vendor) => {
    setSelectedVendorId(vendor.id);
  }, []);

  // New handler for transaction selection
  const handleTransactionSelect = useCallback((transaction) => {
    setSelectedTransactionId(transaction.id);
    setSelectedVendorId(null);
    setSelectedCategoryId(null);
  }, []);

  // New handler for transaction info display
  const handleTransactionInfo = useCallback((transaction) => {
    setSelectedTransaction(transaction);
    setIsTransactionDetailsOpen(true);
  }, []);

  // Handler for drag and drop validation feedback
  const handleDropValidation = useCallback((success, message, details) => {
    console.log('Drop validation:', { success, message, details });
    
    if (success) {
      // Show success feedback without refreshing data (optimistic updates handle this)
      console.log('Drag operation successful:', message);
    } else {
      // Show error message for failed operations
      console.warn('Drag operation failed:', message);
    }
  }, []);

  // Handler for category move operations
  const handleCategoryMove = useCallback(async (draggedCategoryId, targetCategoryId, position) => {
    try {
      // Perform optimistic update
      const updatedItems = [...allItems];
      const draggedIndex = updatedItems.findIndex(item => item.id === draggedCategoryId);
      
      if (draggedIndex === -1) {
        throw new Error('Dragged category not found');
      }
      
      const draggedCategory = { ...updatedItems[draggedIndex] };
      
      // Determine the new parent based on position
      let newParentId = null;
      if (position === 'inside') {
        newParentId = targetCategoryId;
      } else if (position === 'before' || position === 'after') {
        const targetCategory = allItems.find(item => item.id === targetCategoryId);
        newParentId = targetCategory?.parent || null;
      } else if (position === 'root') {
        newParentId = null;
      }
      
      // Update the dragged category's parent
      draggedCategory.parent = newParentId;
      updatedItems[draggedIndex] = draggedCategory;
      
      // Optimistically update the UI
      setAllItems(updatedItems);
      
      // Convert IDs to integers to match backend expectations
      const draggedIdInt = parseInt(draggedCategoryId, 10);
      const parentIdInt = newParentId ? parseInt(newParentId, 10) : null;
      
      // Validate that ID conversion was successful
      if (isNaN(draggedIdInt)) {
        throw new Error('Invalid category ID format');
      }
      if (newParentId && isNaN(parentIdInt)) {
        throw new Error('Invalid parent category ID format');
      }
      
      // Perform the actual backend update
      await categoryService.updateCategory(draggedIdInt, { 
        parent: parentIdInt 
      });
      
      // Success! No need to refetch - optimistic update is already applied
      console.log('Category moved successfully:', draggedCategoryId, 'to position:', position);
      
    } catch (error) {
      console.error('Failed to move category:', error);
      
      // On error, rollback by refetching the original data
      await fetchItems();
      
      // Show error feedback
      handleDropValidation(false, error.message || 'Failed to move category', {
        draggedCategoryId,
        targetCategoryId,
        position
      });
    }
  }, [allItems, categoryService, handleDropValidation, setAllItems, fetchItems]);

  const itemsById = useMemo(() => 
    new Map(allItems.map(item => [item.id, item]))
  , [allItems]);

  const visibleItemIds = useMemo(() => {
    if (!searchTerm.trim()) {
      return null;
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    const directMatches = new Set();

    allItems.forEach(item => {
      if (item.name.toLowerCase().includes(lowerSearchTerm)) {
        directMatches.add(item.id);
      }
    });

    if (directMatches.size === 0) {
      return new Set();
    }

    const visibleIds = new Set(directMatches);

    directMatches.forEach(matchId => {
      const matchedItem = itemsById.get(matchId);
      if (!matchedItem) return;

      let parentIdToTrace = null;
      if (matchedItem.type === 'vendor') {
        parentIdToTrace = matchedItem.parent;
      } else if (matchedItem.type === 'category') {
        parentIdToTrace = matchedItem.parent;
      }

      while (parentIdToTrace) {
        const parentItem = itemsById.get(parentIdToTrace);
        if (parentItem && parentItem.type === 'category') {
          visibleIds.add(parentItem.id);
          parentIdToTrace = parentItem.parent;
        } else {
          parentIdToTrace = null;
        }
      }
    });
    return visibleIds;
  }, [allItems, searchTerm, itemsById]);

  // Transform data for TreeView
  const treeData = useMemo(() => {
    // Filter categories based on search
    let filteredCategories = allItems.filter(item => 
      item.type === 'category' &&
      (visibleItemIds === null || visibleItemIds.has(item.id))
    );

    return transformCategoryData(filteredCategories, transactions, {
      includeVendors: true,
      includeTransactions: true,
      showSystemCategories: true,
      showUserCategories: true,
      categorySpendingTotals
    });
  }, [allItems, transactions, categorySpendingTotals, visibleItemIds]);

  // Categories are now handled directly in treeData - no need to separate system/user

  const handleAddTopLevelClick = () => {
    setShowTopLevelInput(true);
    setNewTopLevelName('');
    setCreateError(null);
    setDeleteError(null);
  };

  const handleSaveTopLevel = () => {
    if (!newTopLevelName.trim()) {
      setCreateError("Category name cannot be empty.");
      return;
    }
    handleCreateCategory(newTopLevelName, null);
  };

  const handleCancelTopLevel = () => {
    setShowTopLevelInput(false);
    setNewTopLevelName('');
    setCreateError(null);
  };
  
  const goToCategoriseTransactions = () => {
    navigate('/categorise/transactions');
  };

  const handleCollapseAll = () => {
    // Collapse all expanded nodes
    setExpandedNodes(new Set());
  };

  const isPageBusy = isLoadingCategories || isCreating || deletingCategoryId !== null;
  const isLoading = isLoadingCategories || isLoadingTransactions;

  if (isLoading && !deletingCategoryId && !isCreating) {
    return (
      <div className="page-loading-state">
        <FiLoader className="spinner" /> 
        <p>Loading Categories & Transaction Data...</p>
      </div>
    );
  }

  if (error && !createError && !deleteError) {
    return (
      <div className="page-error-state">
        <FiAlertCircle /> 
        <p>Error: {error}</p>
        <button onClick={fetchItems} disabled={isPageBusy}>Retry</button>
      </div>
    );
  }

  const noResultsFromSearch = searchTerm.trim() && visibleItemIds && visibleItemIds.size === 0;
  const noItemsToShow = treeData.length === 0 && !showTopLevelInput && !searchTerm.trim() && !isLoadingCategories;

  return (
    <div className="categorise-page-container">
      <div className="categorise-header-bar">
        <h1>Manage Categories & Vendors</h1>
        <button onClick={goToCategoriseTransactions} className="action-button teal-button navigate-button" disabled={isPageBusy}>
            <FiEdit className="button-icon"/> Review Uncategorized Transactions <FiArrowRight className="button-icon-right"/>
        </button>
      </div>

      {deleteError && (
        <div className="page-error-state banner-error">
            <FiAlertCircle /> <p>{deleteError}</p>
            <button onClick={() => setDeleteError(null)} className="dismiss-error-button">Dismiss</button>
        </div>
      )}

      <div className={`category-management-area card-style ${isPageBusy ? 'busy-state' : ''}`}>
        <div className="category-toolbar">
          <div className="search-categories-input-container">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search categories or vendors..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-categories-input"
              disabled={isPageBusy}
            />
          </div>
          <div className="toolbar-actions">
            <button 
              className="collapse-all-button" 
              onClick={handleCollapseAll} 
              disabled={isPageBusy}
              title="Collapse all categories"
            >
              Collapse All
            </button>
            {!showTopLevelInput && (
              <button className="add-category-button" onClick={handleAddTopLevelClick} disabled={isPageBusy}>
                <FiPlus /> Add Top-Level Category
              </button>
            )}
          </div>
        </div>
        
        {showTopLevelInput && (
          <div className="add-category-input-area top-level-add-form">
            <input
              type="text"
              value={newTopLevelName}
              onChange={(e) => {
                setNewTopLevelName(e.target.value);
                if (createError) setCreateError(null);
              }}
              placeholder="New top-level category name..."
              disabled={isCreating || deletingCategoryId !== null}
              autoFocus
            />
            <button onClick={handleSaveTopLevel} disabled={!newTopLevelName.trim() || isCreating || deletingCategoryId !== null} title="Save">
              {isCreating ? <FiLoader className="spinner-inline"/> : <FiPlus />}
            </button>
            <button onClick={handleCancelTopLevel} disabled={isCreating || deletingCategoryId !== null} title="Cancel">Cancel</button>
            {createError && <p className="inline-error-text error-message">{createError}</p>}
          </div>
        )}
        
        <p className="category-instructions">
          View your category structure with real-time spending totals and vendor information. 
          Click vendor counts to expand vendor lists. Enhanced interactions include selection and smart operations.
        </p>
        
        <div className={`category-tree-view ${isPageBusy ? 'disabled-tree' : ''}`}>
          {noItemsToShow && (
            <p>No categories or vendors found. Add a top-level category to get started.</p>
          )}
          {noResultsFromSearch && (
            <p>No categories or vendors match your search term "{searchTerm}".</p>
          )}
          {treeData.length > 0 && (
            <TreeView
              data={treeData}
              searchTerm={searchTerm}
              onCategorySelect={handleCategorySelect}
              onVendorSelect={handleVendorSelect}
              onTransactionSelect={handleTransactionSelect}
              onTransactionInfo={handleTransactionInfo}
              onCategoryCreate={handleCreateCategory}
              onCategoryDelete={handleDeleteCategory}
              onCategoryRename={handleCategoryRename}
              onCategoryMove={handleCategoryMove}
              onDropValidation={handleDropValidation}
              selectedCategoryId={selectedCategoryId}
              selectedVendorId={selectedVendorId}
              selectedTransactionId={selectedTransactionId}
              deletingCategoryId={deletingCategoryId}
              isCreating={isCreating}
              visibleItemIds={visibleItemIds}
              expandedNodes={expandedNodes}
              onExpandedNodesChange={setExpandedNodes}
            />
          )}
        </div>
      </div>

      {/* Transaction Details Modal */}
      <TransactionDetailsModal
        isOpen={isTransactionDetailsOpen}
        onClose={() => {
          setIsTransactionDetailsOpen(false);
          setSelectedTransaction(null);
        }}
        transaction={selectedTransaction}
      />
    </div>
  );
};

export default CategorisePage; 