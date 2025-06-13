import React, { useState, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { 
  FiCheck, 
  FiSquare, 
  FiCheckSquare, 
  FiArrowUp, 
  FiArrowDown, 
  FiDownload,
  FiEye,
  FiEdit3,
  FiTrash2,
  FiFilter,
  FiRefreshCw,
  FiInfo,
  FiDollarSign,
  FiCalendar,
  FiTag,
  FiPlus,
  FiBookmark,
  FiUser,
  FiMoreVertical
} from 'react-icons/fi';
import { formatCurrency, formatDate } from '../../utils/formatting';
import { useInfiniteScroll } from '../../hooks/useLazyLoading';
import { LazyList, LoadingIndicator } from '../common/LazyWrapper';
import './TransactionSearchResults.css';

const TransactionSearchResults = React.memo(({ 
  searchCriteria = {},
  onTransactionSelect,
  onTransactionEdit,
  onTransactionDelete,
  onExport,
  className = '',
  pageSize = 20
}) => {
  const [selectedTransactions, setSelectedTransactions] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  // Lazy loading function for transactions
  const loadTransactions = useCallback(async ({ page, pageSize: size, signal }) => {
    try {
      const response = await fetch('/api/transactions/search/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRFToken': document.querySelector('[name=csrfmiddlewaretoken]')?.value || ''
        },
        body: JSON.stringify({
          ...searchCriteria,
          page: page + 1, // Backend expects 1-based pagination
          page_size: size,
          ordering: sortConfig.direction === 'desc' ? `-${sortConfig.key}` : sortConfig.key
        }),
        signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        data: data.results || [],
        hasMore: !!data.next,
        total: data.count || 0,
        page: page
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        throw error;
      }
      console.error('Error loading transactions:', error);
      throw new Error('Failed to load transactions');
    }
  }, [searchCriteria, sortConfig]);

  // Infinite scroll hook
  const {
    data: transactions,
    loading,
    hasMore,
    error,
    loadMore,
    reload,
    sentinelRef
  } = useInfiniteScroll(loadTransactions, {
    pageSize,
    threshold: 0.1,
    rootMargin: '100px',
    enabled: Object.keys(searchCriteria).length > 0
  });

  // Memoized transaction selection handlers
  const handleTransactionSelect = useCallback((transactionId, selected) => {
    setSelectedTransactions(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(transactionId);
      } else {
        newSet.delete(transactionId);
      }
      return newSet;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    if (selectedTransactions.size === transactions.length) {
      setSelectedTransactions(new Set());
    } else {
      setSelectedTransactions(new Set(transactions.map(t => t.id)));
    }
  }, [transactions, selectedTransactions.size]);

  const handleSort = useCallback((key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  }, []);

  // Memoized bulk actions
  const handleBulkExport = useCallback(() => {
    if (onExport && selectedTransactions.size > 0) {
      const selectedData = transactions.filter(t => selectedTransactions.has(t.id));
      onExport(selectedData);
    }
  }, [onExport, selectedTransactions, transactions]);

  const handleBulkDelete = useCallback(() => {
    if (onTransactionDelete && selectedTransactions.size > 0) {
      const selectedIds = Array.from(selectedTransactions);
      onTransactionDelete(selectedIds);
      setSelectedTransactions(new Set());
    }
  }, [onTransactionDelete, selectedTransactions]);

  // Memoized transaction row renderer
  const renderTransaction = useCallback((transaction, index) => (
    <TransactionRow
      key={transaction.id}
      transaction={transaction}
      isSelected={selectedTransactions.has(transaction.id)}
      onSelect={handleTransactionSelect}
      onView={onTransactionSelect}
      onEdit={onTransactionEdit}
      onDelete={onTransactionDelete}
      index={index}
    />
  ), [selectedTransactions, handleTransactionSelect, onTransactionSelect, onTransactionEdit, onTransactionDelete]);

  // Memoized summary statistics
  const summaryStats = useMemo(() => {
    if (transactions.length === 0) return null;

    const totalAmount = transactions.reduce((sum, t) => sum + (t.signed_aud_amount || 0), 0);
    const avgAmount = totalAmount / transactions.length;
    const categories = new Set(transactions.map(t => t.category_name).filter(Boolean));

    return {
      count: transactions.length,
      totalAmount,
      avgAmount,
      categoriesCount: categories.size
    };
  }, [transactions]);

  // Loading state for initial search
  if (Object.keys(searchCriteria).length === 0) {
    return (
      <div className={`transaction-search-results ${className}`}>
        <div className="search-results-empty">
          <FiFilter size={48} />
          <h3>Ready to Search</h3>
          <p>Use the search form above to find transactions</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && transactions.length === 0) {
    return (
      <div className={`transaction-search-results ${className}`}>
        <div className="search-results-error">
          <h3>Search Error</h3>
          <p>{error.message}</p>
          <button onClick={reload} className="btn btn-primary">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`transaction-search-results ${className}`}>
      {/* Results Header */}
      <div className="search-results-header">
        <div className="results-info">
          <h3>Search Results</h3>
          {summaryStats && (
            <div className="results-summary">
              <span className="summary-item">
                <FiDollarSign size={16} />
                Total: {formatCurrency(summaryStats.totalAmount)}
              </span>
              <span className="summary-item">
                <FiTag size={16} />
                {summaryStats.categoriesCount} categories
              </span>
              <span className="summary-item">
                {summaryStats.count} transactions
                {hasMore && ' (showing partial results)'}
              </span>
            </div>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedTransactions.size > 0 && (
          <div className="bulk-actions">
            <span className="selected-count">
              {selectedTransactions.size} selected
            </span>
            <button 
              onClick={handleBulkExport}
              className="btn btn-secondary btn-sm"
              title="Export selected transactions"
            >
              <FiDownload size={16} />
              Export
            </button>
            <button 
              onClick={handleBulkDelete}
              className="btn btn-danger btn-sm"
              title="Delete selected transactions"
            >
              <FiTrash2 size={16} />
              Delete
            </button>
          </div>
        )}
      </div>

      {/* Results Table Header */}
      <div className="search-results-table">
        <div className="table-header">
          <div className="header-cell select-cell">
            <input
              type="checkbox"
              checked={transactions.length > 0 && selectedTransactions.size === transactions.length}
              onChange={handleSelectAll}
              title="Select all visible transactions"
            />
          </div>
          <div 
            className={`header-cell sortable ${sortConfig.key === 'date' ? `sorted-${sortConfig.direction}` : ''}`}
            onClick={() => handleSort('date')}
          >
            <FiCalendar size={16} />
            Date
          </div>
          <div 
            className={`header-cell sortable ${sortConfig.key === 'description' ? `sorted-${sortConfig.direction}` : ''}`}
            onClick={() => handleSort('description')}
          >
            Description
          </div>
          <div 
            className={`header-cell sortable ${sortConfig.key === 'signed_aud_amount' ? `sorted-${sortConfig.direction}` : ''}`}
            onClick={() => handleSort('signed_aud_amount')}
          >
            <FiDollarSign size={16} />
            Amount
          </div>
          <div 
            className={`header-cell sortable ${sortConfig.key === 'category_name' ? `sorted-${sortConfig.direction}` : ''}`}
            onClick={() => handleSort('category_name')}
          >
            <FiTag size={16} />
            Category
          </div>
          <div className="header-cell actions-cell">
            Actions
          </div>
        </div>

        {/* Lazy Loaded Transaction List */}
        <LazyList
          items={transactions}
          renderItem={renderTransaction}
          loadMore={loadMore}
          hasMore={hasMore}
          loading={loading}
          className="transaction-list"
          itemClassName="transaction-row-wrapper"
          loadingComponent={<LoadingIndicator message="Loading more transactions..." />}
          emptyComponent={
            <div className="search-results-empty">
              <FiFilter size={48} />
              <h3>No Results Found</h3>
              <p>Try adjusting your search criteria</p>
            </div>
          }
        />
      </div>

      {/* Loading indicator for infinite scroll */}
      <div ref={sentinelRef} className="scroll-sentinel" />
    </div>
  );
});

// Memoized transaction row component
const TransactionRow = React.memo(({ 
  transaction, 
  isSelected, 
  onSelect, 
  onView, 
  onEdit, 
  onDelete,
  index 
}) => {
  const handleSelect = useCallback((e) => {
    onSelect(transaction.id, e.target.checked);
  }, [transaction.id, onSelect]);

  const handleView = useCallback(() => {
    if (onView) onView(transaction);
  }, [transaction, onView]);

  const handleEdit = useCallback(() => {
    if (onEdit) onEdit(transaction);
  }, [transaction, onEdit]);

  const handleDelete = useCallback(() => {
    if (onDelete) onDelete([transaction.id]);
  }, [transaction.id, onDelete]);

  return (
    <div className={`transaction-row ${isSelected ? 'selected' : ''}`}>
      <div className="row-cell select-cell">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={handleSelect}
        />
      </div>
      <div className="row-cell date-cell">
        <FiCalendar size={14} />
        {formatDate(transaction.date)}
      </div>
      <div className="row-cell description-cell">
        <div className="description-content">
          <span className="description-text">{transaction.description}</span>
          {transaction.vendor_name && (
            <span className="vendor-name">
              <FiUser size={12} />
              {transaction.vendor_name}
            </span>
          )}
        </div>
      </div>
      <div className={`row-cell amount-cell ${transaction.signed_aud_amount >= 0 ? 'positive' : 'negative'}`}>
        {formatCurrency(transaction.signed_aud_amount)}
      </div>
      <div className="row-cell category-cell">
        {transaction.category_name ? (
          <span className="category-tag">
            <FiTag size={12} />
            {transaction.category_name}
          </span>
        ) : (
          <span className="uncategorized">Uncategorized</span>
        )}
      </div>
      <div className="row-cell actions-cell">
        <div className="action-buttons">
          <button 
            onClick={handleView}
            className="btn-icon"
            title="View transaction details"
          >
            <FiEye size={16} />
          </button>
          <button 
            onClick={handleEdit}
            className="btn-icon"
            title="Edit transaction"
          >
            <FiEdit3 size={16} />
          </button>
          <button 
            onClick={handleDelete}
            className="btn-icon btn-danger"
            title="Delete transaction"
          >
            <FiTrash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
});

TransactionRow.propTypes = {
  transaction: PropTypes.object.isRequired,
  isSelected: PropTypes.bool.isRequired,
  onSelect: PropTypes.func.isRequired,
  onView: PropTypes.func,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
  index: PropTypes.number.isRequired
};

TransactionSearchResults.propTypes = {
  searchCriteria: PropTypes.object,
  onTransactionSelect: PropTypes.func,
  onTransactionEdit: PropTypes.func,
  onTransactionDelete: PropTypes.func,
  onExport: PropTypes.func,
  className: PropTypes.string,
  pageSize: PropTypes.number
};

export default TransactionSearchResults; 