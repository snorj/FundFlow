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
  FiTag
} from 'react-icons/fi';
import { formatCurrency } from '../../utils/formatting';
import './TransactionSearchResults.css';

const TransactionSearchResults = ({ 
  results = [], 
  pagination = {}, 
  summary = {}, 
  searchCriteria = {},
  isLoading = false,
  onSort,
  onPageChange,
  onSelectionChange,
  onExport,
  onViewTransaction,
  onEditTransaction,
  onDeleteTransaction,
  className = ''
}) => {
  // Selection state
  const [selectedTransactions, setSelectedTransactions] = useState(new Set());
  const [sortConfig, setSortConfig] = useState({ field: null, direction: 'asc' });

  // Handle individual transaction selection
  const handleTransactionSelect = useCallback((transactionId) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(transactionId)) {
      newSelected.delete(transactionId);
    } else {
      newSelected.add(transactionId);
    }
    setSelectedTransactions(newSelected);
    
    if (onSelectionChange) {
      onSelectionChange(Array.from(newSelected));
    }
  }, [selectedTransactions, onSelectionChange]);

  // Handle select all/none
  const handleSelectAll = useCallback(() => {
    if (selectedTransactions.size === results.length && results.length > 0) {
      // Deselect all
      setSelectedTransactions(new Set());
      if (onSelectionChange) {
        onSelectionChange([]);
      }
    } else {
      // Select all
      const allIds = new Set(results.map(t => t.id));
      setSelectedTransactions(allIds);
      if (onSelectionChange) {
        onSelectionChange(Array.from(allIds));
      }
    }
  }, [selectedTransactions.size, results, onSelectionChange]);

  // Handle column sorting
  const handleSort = useCallback((field) => {
    const direction = sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    const sortField = direction === 'desc' ? `-${field}` : field;
    
    setSortConfig({ field, direction });
    
    if (onSort) {
      onSort(sortField);
    }
  }, [sortConfig, onSort]);

  // Handle pagination
  const handlePageChange = useCallback((newPage) => {
    if (onPageChange) {
      onPageChange(newPage);
    }
  }, [onPageChange]);

  // Handle export
  const handleExport = useCallback((format) => {
    if (onExport) {
      const exportData = {
        format,
        transactions: selectedTransactions.size > 0 
          ? results.filter(t => selectedTransactions.has(t.id))
          : results,
        searchCriteria,
        summary
      };
      onExport(exportData);
    }
  }, [onExport, selectedTransactions, results, searchCriteria, summary]);

  // Format transaction direction
  const formatDirection = useCallback((direction) => {
    return direction === 'CREDIT' ? 'Income' : 'Expense';
  }, []);

  // Format transaction date
  const formatDate = useCallback((dateString) => {
    return new Date(dateString).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }, []);

  // Get sort icon for column
  const getSortIcon = useCallback((field) => {
    if (sortConfig.field !== field) {
      return null;
    }
    return sortConfig.direction === 'asc' ? <FiArrowUp /> : <FiArrowDown />;
  }, [sortConfig]);

  // Calculate selection summary
  const selectionSummary = useMemo(() => {
    if (selectedTransactions.size === 0) return null;
    
    const selectedResults = results.filter(t => selectedTransactions.has(t.id));
    const totalAmount = selectedResults.reduce((sum, t) => sum + (t.signed_original_amount || 0), 0);
    const totalAudAmount = selectedResults.reduce((sum, t) => sum + (t.signed_aud_amount || 0), 0);
    
    return {
      count: selectedResults.length,
      totalAmount,
      totalAudAmount
    };
  }, [selectedTransactions, results]);

  // Render loading state
  if (isLoading) {
    return (
      <div className={`transaction-search-results loading ${className}`}>
        <div className="results-loading">
          <FiRefreshCw className="spinner" />
          <p>Searching transactions...</p>
        </div>
      </div>
    );
  }

  // Render empty state
  if (!results || results.length === 0) {
    return (
      <div className={`transaction-search-results empty ${className}`}>
        <div className="empty-state">
          <FiFilter className="empty-icon" />
          <h3>No transactions found</h3>
          <p>Try adjusting your search criteria or clearing some filters.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`transaction-search-results ${className}`}>
      {/* Summary Statistics */}
      <div className="results-summary">
        <div className="summary-stats">
          <div className="stat-item">
            <FiInfo className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{summary.total_transactions || 0}</span>
              <span className="stat-label">Transactions</span>
            </div>
          </div>
          
          <div className="stat-item">
            <FiDollarSign className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{formatCurrency(summary.total_aud_amount || 0, 'AUD')}</span>
              <span className="stat-label">Total (AUD)</span>
            </div>
          </div>
          
          {summary.date_range && (
            <div className="stat-item">
              <FiCalendar className="stat-icon" />
              <div className="stat-content">
                <span className="stat-value">
                  {summary.date_range.earliest && summary.date_range.latest
                    ? `${formatDate(summary.date_range.earliest)} - ${formatDate(summary.date_range.latest)}`
                    : 'All dates'
                  }
                </span>
                <span className="stat-label">Date Range</span>
              </div>
            </div>
          )}
          
          <div className="stat-item">
            <FiTag className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">
                {summary.by_categorization?.categorized_count || 0} / {summary.total_transactions || 0}
              </span>
              <span className="stat-label">Categorized</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="results-actions">
          {selectedTransactions.size > 0 && (
            <div className="selection-info">
              <span>{selectedTransactions.size} selected</span>
              {selectionSummary && (
                <span className="selection-total">
                  ({formatCurrency(selectionSummary.totalAudAmount, 'AUD')})
                </span>
              )}
            </div>
          )}
          
          <div className="action-buttons">
            <button
              className="export-btn"
              onClick={() => handleExport('csv')}
              disabled={results.length === 0}
              title="Export to CSV"
            >
              <FiDownload />
              CSV
            </button>
            
            <button
              className="export-btn"
              onClick={() => handleExport('pdf')}
              disabled={results.length === 0}
              title="Export to PDF"
            >
              <FiDownload />
              PDF
            </button>
          </div>
        </div>
      </div>

      {/* Results Table */}
      <div className="results-table-container">
        <table className="results-table">
          <thead>
            <tr>
              <th className="select-column">
                <button
                  className="select-all-btn"
                  onClick={handleSelectAll}
                  aria-label={selectedTransactions.size === results.length ? 'Deselect all' : 'Select all'}
                >
                  {selectedTransactions.size === results.length && results.length > 0 ? (
                    <FiCheckSquare />
                  ) : selectedTransactions.size > 0 ? (
                    <FiSquare className="partial" />
                  ) : (
                    <FiSquare />
                  )}
                </button>
              </th>
              
              <th 
                className="sortable-column"
                onClick={() => handleSort('transaction_date')}
              >
                Date {getSortIcon('transaction_date')}
              </th>
              
              <th 
                className="sortable-column description-column"
                onClick={() => handleSort('description')}
              >
                Description {getSortIcon('description')}
              </th>
              
              <th 
                className="sortable-column"
                onClick={() => handleSort('vendor__name')}
              >
                Vendor {getSortIcon('vendor__name')}
              </th>
              
              <th 
                className="sortable-column"
                onClick={() => handleSort('category__name')}
              >
                Category {getSortIcon('category__name')}
              </th>
              
              <th 
                className="sortable-column amount-column"
                onClick={() => handleSort('original_amount')}
              >
                Amount {getSortIcon('original_amount')}
              </th>
              
              <th className="direction-column">Type</th>
              <th className="actions-column">Actions</th>
            </tr>
          </thead>
          
          <tbody>
            {results.map((transaction) => (
              <tr 
                key={transaction.id}
                className={`transaction-row ${selectedTransactions.has(transaction.id) ? 'selected' : ''}`}
              >
                <td className="select-cell">
                  <button
                    className="select-btn"
                    onClick={() => handleTransactionSelect(transaction.id)}
                    aria-label={`${selectedTransactions.has(transaction.id) ? 'Deselect' : 'Select'} transaction`}
                  >
                    {selectedTransactions.has(transaction.id) ? <FiCheckSquare /> : <FiSquare />}
                  </button>
                </td>
                
                <td className="date-cell">
                  {formatDate(transaction.transaction_date)}
                </td>
                
                <td className="description-cell">
                  <div className="description-content">
                    <span className="description-text" title={transaction.description}>
                      {transaction.description}
                    </span>
                    {transaction.source && (
                      <span className="source-badge">{transaction.source}</span>
                    )}
                  </div>
                </td>
                
                <td className="vendor-cell">
                  {transaction.vendor_name ? (
                    <span className="vendor-name">{transaction.vendor_name}</span>
                  ) : (
                    <span className="no-vendor">No vendor</span>
                  )}
                </td>
                
                <td className="category-cell">
                  {transaction.category_name ? (
                    <span className="category-name">{transaction.category_name}</span>
                  ) : (
                    <span className="no-category">Uncategorized</span>
                  )}
                </td>
                
                <td className="amount-cell">
                  <div className="amount-content">
                    <span className={`amount ${transaction.direction === 'CREDIT' ? 'positive' : 'negative'}`}>
                      {formatCurrency(Math.abs(transaction.signed_original_amount || 0), transaction.original_currency)}
                    </span>
                    {transaction.signed_aud_amount !== null && transaction.original_currency !== 'AUD' && (
                      <span className="aud-amount">
                        {formatCurrency(Math.abs(transaction.signed_aud_amount), 'AUD')}
                      </span>
                    )}
                  </div>
                </td>
                
                <td className="direction-cell">
                  <span className={`direction-badge ${transaction.direction.toLowerCase()}`}>
                    {formatDirection(transaction.direction)}
                  </span>
                </td>
                
                <td className="actions-cell">
                  <div className="action-buttons">
                    {onViewTransaction && (
                      <button
                        className="action-btn view-btn"
                        onClick={() => onViewTransaction(transaction)}
                        title="View details"
                      >
                        <FiEye />
                      </button>
                    )}
                    
                    {onEditTransaction && (
                      <button
                        className="action-btn edit-btn"
                        onClick={() => onEditTransaction(transaction)}
                        title="Edit transaction"
                      >
                        <FiEdit3 />
                      </button>
                    )}
                    
                    {onDeleteTransaction && (
                      <button
                        className="action-btn delete-btn"
                        onClick={() => onDeleteTransaction(transaction)}
                        title="Delete transaction"
                      >
                        <FiTrash2 />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.total_pages > 1 && (
        <div className="results-pagination">
          <div className="pagination-info">
            <span>
              Showing {((pagination.page - 1) * pagination.page_size) + 1} to{' '}
              {Math.min(pagination.page * pagination.page_size, pagination.total_count)} of{' '}
              {pagination.total_count} transactions
            </span>
          </div>
          
          <div className="pagination-controls">
            <button
              className="pagination-btn"
              onClick={() => handlePageChange(pagination.page - 1)}
              disabled={!pagination.has_previous}
            >
              Previous
            </button>
            
            <div className="page-numbers">
              {Array.from({ length: Math.min(5, pagination.total_pages) }, (_, i) => {
                const startPage = Math.max(1, pagination.page - 2);
                const pageNum = startPage + i;
                
                if (pageNum > pagination.total_pages) return null;
                
                return (
                  <button
                    key={pageNum}
                    className={`page-btn ${pageNum === pagination.page ? 'active' : ''}`}
                    onClick={() => handlePageChange(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              className="pagination-btn"
              onClick={() => handlePageChange(pagination.page + 1)}
              disabled={!pagination.has_next}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

TransactionSearchResults.propTypes = {
  results: PropTypes.arrayOf(PropTypes.object),
  pagination: PropTypes.object,
  summary: PropTypes.object,
  searchCriteria: PropTypes.object,
  isLoading: PropTypes.bool,
  onSort: PropTypes.func,
  onPageChange: PropTypes.func,
  onSelectionChange: PropTypes.func,
  onExport: PropTypes.func,
  onViewTransaction: PropTypes.func,
  onEditTransaction: PropTypes.func,
  onDeleteTransaction: PropTypes.func,
  className: PropTypes.string
};

export default TransactionSearchResults; 