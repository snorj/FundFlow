import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CategoryTreeNode from '../components/categorization/CategoryTreeNode';
import TransactionDetailsModal from '../components/transactions/TransactionDetailsModal';
import categoryService from '../services/categories';
import transactionService from '../services/transactions';
import { FiPlus, FiLoader, FiAlertCircle, FiEdit, FiArrowRight, FiSearch } from 'react-icons/fi';
import './CategorisePage.css'; // We'll create this CSS file next

const CategorisePage = () => {
  const navigate = useNavigate();
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
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const [deletingCategoryId, setDeletingCategoryId] = useState(null);
  const [deleteError, setDeleteError] = useState(null);

  // Transaction details modal state
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [isTransactionDetailsOpen, setIsTransactionDetailsOpen] = useState(false);
  
  // Collapse all functionality
  const [collapseAllTrigger, setCollapseAllTrigger] = useState(0);

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
      const newCategoryData = { name, parent: parentId };
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
      await categoryService.deleteCategory(categoryId);
      await fetchItems(); 
      await fetchTransactions();
    } catch (err) {
      const backendError = err.response?.data?.error || err.message || "Failed to delete category.";
      setDeleteError(backendError);
    } finally {
      setDeletingCategoryId(null);
    }
  }, [fetchItems, fetchTransactions]);

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

  const systemRootCategories = useMemo(() => 
    allItems.filter(item => 
      item.type === 'category' &&
      !item.parent && 
      !item.is_custom &&
      (visibleItemIds === null || visibleItemIds.has(item.id))
    )
  , [allItems, visibleItemIds]);

  const userRootCategories = useMemo(() => 
    allItems.filter(item => 
      item.type === 'category' &&
      !item.parent && 
      item.is_custom &&
      (visibleItemIds === null || visibleItemIds.has(item.id))
    )
  , [allItems, visibleItemIds]);

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
    setCollapseAllTrigger(prev => prev + 1);
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
  const noItemsToShow = systemRootCategories.length === 0 && userRootCategories.length === 0 && !showTopLevelInput && !searchTerm.trim() && !isLoadingCategories && (!allItems.some(item => item.type === 'vendor'));

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
          {systemRootCategories.map(category => (
            <CategoryTreeNode
              key={category.id}
              item={category}
              allItems={allItems}
              visibleItemIds={visibleItemIds}
              level={0}
              onSelectNode={() => {}}
              onCategorySelect={handleCategorySelect}
              onVendorSelect={handleVendorSelect}
              onTransactionSelect={handleTransactionSelect}
              onTransactionInfo={handleTransactionInfo}
              onCreateCategory={handleCreateCategory}
              onDeleteCategory={handleDeleteCategory}
              isCreating={isCreating}
              isDeleting={deletingCategoryId === category.id}
              transactions={transactions}
              categorySpendingTotals={categorySpendingTotals}
              selectedCategoryId={selectedCategoryId}
              selectedVendorId={selectedVendorId}
              selectedTransactionId={selectedTransactionId}
              showSpendingTotals={true}
              enableSmartInteractions={true}
              collapseAllTrigger={collapseAllTrigger}
            />
          ))}
          {userRootCategories.map(category => (
            <CategoryTreeNode
              key={category.id}
              item={category}
              allItems={allItems}
              visibleItemIds={visibleItemIds}
              level={0}
              onSelectNode={() => {}}
              onCategorySelect={handleCategorySelect}
              onVendorSelect={handleVendorSelect}
              onTransactionSelect={handleTransactionSelect}
              onTransactionInfo={handleTransactionInfo}
              onCreateCategory={handleCreateCategory}
              onDeleteCategory={handleDeleteCategory}
              isCreating={isCreating}
              isDeleting={deletingCategoryId === category.id}
              transactions={transactions}
              categorySpendingTotals={categorySpendingTotals}
              selectedCategoryId={selectedCategoryId}
              selectedVendorId={selectedVendorId}
              selectedTransactionId={selectedTransactionId}
              showSpendingTotals={true}
              enableSmartInteractions={true}
              collapseAllTrigger={collapseAllTrigger}
            />
          ))}
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