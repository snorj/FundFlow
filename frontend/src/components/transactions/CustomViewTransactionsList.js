import React, { useState, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import { 
  FiTrash2, 
  FiCheck, 
  FiMinus, 
  FiRefreshCw,
  FiAlertTriangle,
  FiX,
  FiCheckCircle,
  FiTag
} from 'react-icons/fi';
import customViewService from '../../services/customViews';
import { formatCurrency } from '../../utils/formatting';
import CustomCategorySelector from '../modals/CustomCategorySelector';
import TransactionFilterPanel from './TransactionFilterPanel';
import './CustomViewTransactionsList.css';

const CustomViewTransactionsList = ({ 
  viewId, 
  onTransactionsRemoved,
  refreshTrigger = 0 
}) => {
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [selectedTransactions, setSelectedTransactions] = useState(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [removeError, setRemoveError] = useState(null);
  const [filters, setFilters] = useState(null);

  // Load transactions for the view
  useEffect(() => {
    if (viewId) {
      loadTransactions();
    }
  }, [viewId, refreshTrigger]);

  const loadTransactions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const viewTransactions = await customViewService.getViewTransactions(viewId);
      setTransactions(viewTransactions || []);
      setFilteredTransactions(viewTransactions || []);
      setSelectedTransactions(new Set()); // Clear selections when reloading
    } catch (err) {
      console.error('Error loading view transactions:', err);
      setError('Failed to load transactions. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle transaction selection
  const handleTransactionToggle = (transactionId) => {
    setSelectedTransactions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(transactionId)) {
        newSet.delete(transactionId);
      } else {
        newSet.add(transactionId);
      }
      return newSet;
    });
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedTransactions.size === filteredTransactions.length) {
      // Deselect all
      setSelectedTransactions(new Set());
    } else {
      // Select all (filtered)
      setSelectedTransactions(new Set(filteredTransactions.map(t => t.transaction.id)));
    }
  };

  // Calculate selection summary
  const selectionSummary = useMemo(() => {
    if (selectedTransactions.size === 0) return null;
    
    const selectedTxns = filteredTransactions.filter(t => 
      selectedTransactions.has(t.transaction.id)
    );
    
    const totalAmount = selectedTxns.reduce((sum, t) => 
      sum + (t.transaction.signed_aud_amount || t.transaction.signed_original_amount || 0), 0
    );
    
    return {
      count: selectedTransactions.size,
      totalAmount
    };
  }, [selectedTransactions, filteredTransactions]);

  // Handle remove confirmation
  const handleRemoveClick = () => {
    if (selectedTransactions.size === 0) return;
    setShowConfirmDialog(true);
    setRemoveError(null);
  };

  // Handle actual removal
  const handleConfirmRemove = async () => {
    setIsRemoving(true);
    setRemoveError(null);

    try {
      const transactionIds = Array.from(selectedTransactions);
      const result = await customViewService.removeTransactions(viewId, {
        transaction_ids: transactionIds
      });

      // Success - reload transactions and notify parent
      await loadTransactions();
      setShowConfirmDialog(false);
      
      if (onTransactionsRemoved) {
        onTransactionsRemoved({
          removedCount: result.summary?.deleted || transactionIds.length,
          totalRequested: transactionIds.length
        });
      }

    } catch (err) {
      console.error('Error removing transactions:', err);
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.message || 
                          'Failed to remove transactions. Please try again.';
      setRemoveError(errorMessage);
    } finally {
      setIsRemoving(false);
    }
  };

  // Handle cancel removal
  const handleCancelRemove = () => {
    setShowConfirmDialog(false);
    setRemoveError(null);
  };

  // Handle category change for individual transactions
  const handleCategoryChange = async (assignmentId, categoryId, categoryName) => {
    try {
      // Optimistic update
      setTransactions(prev => prev.map(t => 
        t.id === assignmentId 
          ? { 
              ...t, 
              custom_category: categoryId, 
              custom_category_name: categoryName 
            }
          : t
      ));

      // API call
      await customViewService.updateTransactionCategory(assignmentId, categoryId);
      
    } catch (error) {
      console.error('Error updating transaction category:', error);
      
      // Revert optimistic update on error
      loadTransactions();
      setError('Failed to update category. Please try again.');
    }
  };

  // Handle batch category change for selected transactions
  const handleBatchCategoryChange = async (categoryId, categoryName) => {
    if (selectedTransactions.size === 0) return;

    try {
      // Get assignment IDs for selected transactions
      const updates = [];
      const selectedTransactionIds = Array.from(selectedTransactions);
      
      transactions.forEach(viewTransaction => {
        if (selectedTransactionIds.includes(viewTransaction.transaction.id)) {
          updates.push({
            assignmentId: viewTransaction.id,
            categoryId: categoryId
          });
        }
      });

      // Optimistic update
      setTransactions(prev => prev.map(t => {
        const isSelected = selectedTransactionIds.includes(t.transaction.id);
        return isSelected 
          ? { 
              ...t, 
              custom_category: categoryId, 
              custom_category_name: categoryName 
            }
          : t;
      }));

      // API call - use batch update if available, otherwise individual calls
      if (updates.length > 1) {
        try {
          await customViewService.batchUpdateCategories(updates);
        } catch (batchError) {
          // Fallback to individual updates if batch API doesn't exist
          console.warn('Batch update failed, falling back to individual updates:', batchError);
          await Promise.all(
            updates.map(update => 
              customViewService.updateTransactionCategory(update.assignmentId, update.categoryId)
            )
          );
        }
      } else if (updates.length === 1) {
        await customViewService.updateTransactionCategory(updates[0].assignmentId, updates[0].categoryId);
      }

      // Clear selection after successful batch update
      setSelectedTransactions(new Set());
      
    } catch (error) {
      console.error('Error updating batch categories:', error);
      
      // Revert optimistic update on error
      loadTransactions();
      setError('Failed to update categories. Please try again.');
    }
  };

  // Handle filter changes
  const handleFiltersChange = (newFilters) => {
    setFilters(newFilters);
    applyFilters(transactions, newFilters);
  };

  // Apply filters to transactions
  const applyFilters = (transactionList, filterCriteria) => {
    if (!filterCriteria) {
      setFilteredTransactions(transactionList);
      return;
    }

    let filtered = [...transactionList];

    // Category filter
    if (filterCriteria.category) {
      filtered = filtered.filter(t => t.custom_category === filterCriteria.category);
    }

    // Date range filter
    if (filterCriteria.dateRange.from || filterCriteria.dateRange.to) {
      filtered = filtered.filter(t => {
        const transactionDate = new Date(t.transaction.transaction_date);
        const fromDate = filterCriteria.dateRange.from ? new Date(filterCriteria.dateRange.from) : null;
        const toDate = filterCriteria.dateRange.to ? new Date(filterCriteria.dateRange.to) : null;

        if (fromDate && transactionDate < fromDate) return false;
        if (toDate && transactionDate > toDate) return false;
        return true;
      });
    }

    // Amount range filter
    if (filterCriteria.amountRange.min || filterCriteria.amountRange.max) {
      filtered = filtered.filter(t => {
        const amount = Math.abs(t.transaction.signed_aud_amount || t.transaction.signed_original_amount || 0);
        const minAmount = filterCriteria.amountRange.min ? parseFloat(filterCriteria.amountRange.min) : null;
        const maxAmount = filterCriteria.amountRange.max ? parseFloat(filterCriteria.amountRange.max) : null;

        if (minAmount !== null && amount < minAmount) return false;
        if (maxAmount !== null && amount > maxAmount) return false;
        return true;
      });
    }

    // Categorization status filter
    if (filterCriteria.showUncategorizedOnly) {
      filtered = filtered.filter(t => !t.custom_category);
    } else if (filterCriteria.showCategorizedOnly) {
      filtered = filtered.filter(t => !!t.custom_category);
    }

    setFilteredTransactions(filtered);
  };

  // Re-apply filters when transactions change
  useEffect(() => {
    if (filters) {
      applyFilters(transactions, filters);
    }
  }, [transactions, filters]);

  if (isLoading) {
    return (
      <div className="custom-view-transactions-loading">
        <FiRefreshCw className="spinner" />
        <p>Loading transactions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="custom-view-transactions-error">
        <FiAlertTriangle />
        <p>{error}</p>
        <button className="retry-btn" onClick={loadTransactions}>
          Try Again
        </button>
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="custom-view-transactions-empty">
        <p>No transactions assigned to this view yet.</p>
        <p className="help-text">
          Use the transaction search to find and add transactions to this view.
        </p>
      </div>
    );
  }

  return (
    <div className="custom-view-transactions-list">
      {/* Filter Panel */}
      <TransactionFilterPanel
        viewId={viewId}
        onFiltersChange={handleFiltersChange}
        totalTransactions={transactions.length}
        filteredTransactions={filteredTransactions.length}
      />

      {/* Header with bulk actions */}
      <div className="transactions-header">
        <div className="header-left">
          <label className="select-all-checkbox">
            <input
              type="checkbox"
              checked={selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0}
              onChange={handleSelectAll}
            />
            <span>
              {selectedTransactions.size === filteredTransactions.length && filteredTransactions.length > 0
                ? 'Deselect All' 
                : `Select All (${filteredTransactions.length})`
              }
            </span>
          </label>
          
          {selectionSummary && (
            <div className="selection-summary">
              <span className="selection-count">
                {selectionSummary.count} selected
              </span>
              <span className="selection-total">
                ({formatCurrency(Math.abs(selectionSummary.totalAmount), 'AUD')})
              </span>
            </div>
          )}
        </div>
        
        <div className="header-actions">
          {selectedTransactions.size > 0 && (
            <>
              <div className="batch-category-selector">
                <span className="batch-label">Category:</span>
                <CustomCategorySelector
                  viewId={viewId}
                  currentCategoryId={null}
                  currentCategoryName={null}
                  onCategoryChange={handleBatchCategoryChange}
                  size="small"
                  placeholder="Set category for selected..."
                  disabled={false}
                />
              </div>
              
              <button
                className="remove-btn"
                onClick={handleRemoveClick}
                title="Remove selected transactions from this view"
              >
                <FiMinus />
                Remove from View ({selectedTransactions.size})
              </button>
            </>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      {filteredTransactions.length === 0 && transactions.length > 0 ? (
        <div className="no-filtered-results">
          <p>No transactions match the current filters.</p>
          <p className="help-text">Try adjusting your filter criteria to see more results.</p>
        </div>
      ) : (
        <div className="transactions-table-container">
          <table className="transactions-table">
          <thead>
            <tr>
              <th className="select-column">
                <FiCheck />
              </th>
              <th className="date-column">Date</th>
              <th className="description-column">Description</th>
              <th className="vendor-column">Vendor</th>
              <th className="category-column">Custom Category</th>
              <th className="amount-column">Amount</th>
              <th className="assigned-column">Assigned</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions.map((viewTransaction) => {
              const transaction = viewTransaction.transaction;
              const isSelected = selectedTransactions.has(transaction.id);
              const isCategorized = !!viewTransaction.custom_category;
              
              return (
                <tr 
                  key={viewTransaction.id}
                  className={`transaction-row ${isSelected ? 'selected' : ''} ${isCategorized ? 'categorized' : 'uncategorized'}`}
                >
                  <td className="select-cell">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleTransactionToggle(transaction.id)}
                    />
                  </td>
                  
                  <td className="date-cell">
                    {new Date(transaction.transaction_date).toLocaleDateString()}
                  </td>
                  
                  <td className="description-cell">
                    <div className="description-content">
                      <span className="description-text">
                        {transaction.description}
                      </span>
                      {viewTransaction.notes && (
                        <span className="notes-text">
                          Note: {viewTransaction.notes}
                        </span>
                      )}
                    </div>
                  </td>
                  
                  <td className="vendor-cell">
                    {transaction.vendor_name || 'Unknown'}
                  </td>
                  
                  <td className="category-cell">
                    <CustomCategorySelector
                      viewId={viewId}
                      currentCategoryId={viewTransaction.custom_category}
                      currentCategoryName={viewTransaction.custom_category_name}
                      onCategoryChange={(categoryId, categoryName) => 
                        handleCategoryChange(viewTransaction.id, categoryId, categoryName)
                      }
                      size="small"
                      disabled={false}
                    />
                  </td>
                  
                  <td className="amount-cell">
                    <span className={`amount ${(transaction.signed_aud_amount || transaction.signed_original_amount || 0) >= 0 ? 'positive' : 'negative'}`}>
                      {formatCurrency(
                        Math.abs(transaction.signed_aud_amount || transaction.signed_original_amount || 0),
                        transaction.original_currency || 'AUD'
                      )}
                    </span>
                  </td>
                  
                  <td className="assigned-cell">
                    <span className="assigned-date">
                      {new Date(viewTransaction.assigned_at).toLocaleDateString()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="modal-overlay">
          <div className="confirmation-dialog">
            <div className="dialog-header">
              <h3>Confirm Removal</h3>
              <button
                className="dialog-close"
                onClick={handleCancelRemove}
                disabled={isRemoving}
              >
                <FiX />
              </button>
            </div>
            
            <div className="dialog-content">
              <div className="warning-icon">
                <FiAlertTriangle />
              </div>
              
              <div className="confirmation-message">
                <p>
                  Are you sure you want to remove <strong>{selectedTransactions.size}</strong> 
                  transaction{selectedTransactions.size !== 1 ? 's' : ''} from this view?
                </p>
                
                {selectionSummary && (
                  <p className="removal-summary">
                    Total amount: <strong>
                      {formatCurrency(Math.abs(selectionSummary.totalAmount), 'AUD')}
                    </strong>
                  </p>
                )}
                
                <p className="warning-text">
                  This will only remove them from this custom view. 
                  The transactions will remain in your account.
                </p>
              </div>
              
              {removeError && (
                <div className="error-message">
                  <FiAlertTriangle />
                  <span>{removeError}</span>
                </div>
              )}
            </div>
            
            <div className="dialog-actions">
              <button
                className="cancel-btn"
                onClick={handleCancelRemove}
                disabled={isRemoving}
              >
                Cancel
              </button>
              <button
                className="confirm-btn"
                onClick={handleConfirmRemove}
                disabled={isRemoving}
              >
                {isRemoving ? (
                  <>
                    <FiRefreshCw className="spinner" />
                    Removing...
                  </>
                ) : (
                  <>
                    <FiTrash2 />
                    Remove {selectedTransactions.size}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

CustomViewTransactionsList.propTypes = {
  viewId: PropTypes.string.isRequired,
  onTransactionsRemoved: PropTypes.func,
  refreshTrigger: PropTypes.number
};

export default CustomViewTransactionsList; 