import React, { useState, useCallback, useMemo, forwardRef } from 'react';
import PropTypes from 'prop-types';
import { 
  FiChevronDown, 
  FiChevronUp, 
  FiCheck, 
  FiX, 
  FiEdit3, 
  FiTrash2, 
  FiPlus,
  FiUser,
  FiDollarSign,
  FiCalendar,
  FiTag
} from 'react-icons/fi';
import { formatCurrency, formatDate } from '../../utils/formatting';
import './VendorGroupCard.css';

const VendorGroupCard = React.memo(forwardRef(({ 
  vendorGroup, 
  isSelected = false,
  availableCategories = [],
  onSelectionChange,
  onCategoryChange,
  onApprove,
  onReject,
  onModify,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  isLoading = false,
  className = ''
}, ref) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    vendorGroup?.suggested_category_id || ''
  );

  // Calculate summary statistics - memoized for performance
  const summary = useMemo(() => {
    if (!vendorGroup?.transactions) return {};
    
    const transactions = vendorGroup.transactions;
    const totalAmount = transactions.reduce((sum, tx) => sum + (tx.signed_aud_amount || 0), 0);
    const dateRange = {
      earliest: transactions.reduce((earliest, tx) => 
        !earliest || tx.date < earliest ? tx.date : earliest, null),
      latest: transactions.reduce((latest, tx) => 
        !latest || tx.date > latest ? tx.date : latest, null)
    };
    
    return {
      count: transactions.length,
      totalAmount,
      dateRange
    };
  }, [vendorGroup?.transactions]);

  // Get selected category name - memoized for performance
  const selectedCategoryName = useMemo(() => {
    if (!selectedCategoryId) return "Uncategorized";
    const selectedIdNum = parseInt(selectedCategoryId, 10);
    const foundCategory = availableCategories?.find(cat => cat.id === selectedIdNum);
    return foundCategory ? foundCategory.name : `Unknown (ID: ${selectedIdNum})`;
  }, [selectedCategoryId, availableCategories]);

  // Get sample transactions (first 3) - memoized for performance
  const sampleTransactions = useMemo(() => {
    if (!vendorGroup?.transactions) return [];
    return vendorGroup.transactions.slice(0, 3);
  }, [vendorGroup?.transactions]);

  // Optimized event handlers with useCallback
  const handleCategoryChange = useCallback((event) => {
    const newCategoryId = event.target.value;
    setSelectedCategoryId(newCategoryId);
    
    if (onCategoryChange) {
      onCategoryChange(vendorGroup.vendor_id, newCategoryId);
    }
  }, [vendorGroup?.vendor_id, onCategoryChange]);

  const handleSelectionToggle = useCallback(() => {
    if (onSelectionChange) {
      onSelectionChange(vendorGroup.vendor_id, !isSelected);
    }
  }, [vendorGroup?.vendor_id, isSelected, onSelectionChange]);

  const handleExpansionToggle = useCallback(() => {
    setIsExpanded(prev => !prev);
  }, []);

  // Action handlers - memoized to prevent unnecessary re-renders
  const handleApprove = useCallback(() => {
    if (onApprove && !isLoading) {
      onApprove(vendorGroup);
    }
  }, [vendorGroup, onApprove, isLoading]);

  const handleReject = useCallback(() => {
    if (onReject && !isLoading) {
      onReject(vendorGroup);
    }
  }, [vendorGroup, onReject, isLoading]);

  const handleModify = useCallback(() => {
    if (onModify && !isLoading) {
      onModify(vendorGroup);
    }
  }, [vendorGroup, onModify, isLoading]);

  const handleCreateRule = useCallback(() => {
    if (onCreateRule && !isLoading) {
      onCreateRule(vendorGroup);
    }
  }, [vendorGroup, onCreateRule, isLoading]);

  const handleUpdateRule = useCallback(() => {
    if (onUpdateRule && !isLoading) {
      onUpdateRule(vendorGroup);
    }
  }, [vendorGroup, onUpdateRule, isLoading]);

  const handleDeleteRule = useCallback(() => {
    if (onDeleteRule && !isLoading) {
      onDeleteRule(vendorGroup);
    }
  }, [vendorGroup, onDeleteRule, isLoading]);

  if (!vendorGroup) {
    return <div ref={ref} className="vendor-group-card loading">Loading vendor group...</div>;
  }

  return (
    <div 
      ref={ref} 
      className={`vendor-group-card ${isSelected ? 'selected' : ''} ${isLoading ? 'loading' : ''} ${className}`}
    >
      {/* Header Section */}
      <div className="vendor-header">
        <div className="vendor-info">
          <div className="vendor-selection">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleSelectionToggle}
              disabled={isLoading}
              className="vendor-checkbox"
            />
          </div>
          
          <div className="vendor-identity">
            <div className="vendor-logo">
              {vendorGroup.vendor_logo ? (
                <img src={vendorGroup.vendor_logo} alt={vendorGroup.vendor_name} />
              ) : (
                <FiUser className="default-logo" />
              )}
            </div>
            
            <div className="vendor-details">
              <h3 className="vendor-name">{vendorGroup.vendor_name}</h3>
              <div className="vendor-meta">
                <span className="transaction-count">
                  <FiDollarSign className="meta-icon" />
                  {summary.count} transaction{summary.count !== 1 ? 's' : ''}
                </span>
                <span className="total-amount">
                  {formatCurrency(summary.totalAmount, 'AUD')}
                </span>
                {summary.dateRange.earliest && (
                  <span className="date-range">
                    <FiCalendar className="meta-icon" />
                    {summary.dateRange.earliest === summary.dateRange.latest 
                      ? formatDate(summary.dateRange.earliest)
                      : `${formatDate(summary.dateRange.earliest)} - ${formatDate(summary.dateRange.latest)}`
                    }
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="vendor-actions">
          <button
            className="expand-button"
            onClick={handleExpansionToggle}
            disabled={isLoading}
            title={isExpanded ? "Collapse transactions" : "Expand transactions"}
          >
            {isExpanded ? <FiChevronUp /> : <FiChevronDown />}
          </button>
        </div>
      </div>

      {/* Category Assignment Section */}
      <div className="category-assignment">
        <div className="category-selection">
          <label className="category-label">
            <FiTag className="label-icon" />
            Category:
          </label>
          <select
            value={selectedCategoryId}
            onChange={handleCategoryChange}
            disabled={isLoading}
            className="category-dropdown"
          >
            <option value="">Uncategorized</option>
            {availableCategories.map(category => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        <div className="rule-management">
          {vendorGroup.has_rule ? (
            <div className="rule-actions">
              <button
                className="rule-action-btn update-rule-btn"
                onClick={handleUpdateRule}
                disabled={isLoading}
                title="Update existing rule"
              >
                <FiEdit3 />
                Update Rule
              </button>
              <button
                className="rule-action-btn delete-rule-btn"
                onClick={handleDeleteRule}
                disabled={isLoading}
                title="Delete existing rule"
              >
                <FiTrash2 />
                Delete Rule
              </button>
            </div>
          ) : (
            <button
              className="rule-action-btn create-rule-btn"
              onClick={handleCreateRule}
              disabled={isLoading}
              title="Create new categorization rule"
            >
              <FiPlus />
              Create Rule
            </button>
          )}
        </div>
      </div>

      {/* Expandable Transaction List */}
      {isExpanded && (
        <div className="transaction-list">
          <div className="list-header">
            <h4>Recent Transactions</h4>
            <span className="showing-count">
              Showing {sampleTransactions.length} of {summary.count}
            </span>
          </div>
          
          <div className="transaction-items">
            {sampleTransactions.map((transaction, index) => (
              <div key={transaction.id || index} className="transaction-item">
                <div className="transaction-date">
                  {formatDate(transaction.date)}
                </div>
                <div className="transaction-description">
                  {transaction.description || 'No description'}
                </div>
                <div className={`transaction-amount ${transaction.signed_aud_amount >= 0 ? 'positive' : 'negative'}`}>
                  {formatCurrency(transaction.signed_aud_amount, 'AUD')}
                </div>
              </div>
            ))}
            
            {summary.count > 3 && (
              <div className="more-transactions">
                +{summary.count - 3} more transactions
              </div>
            )}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="card-actions">
        <button
          className="action-btn reject-btn"
          onClick={handleReject}
          disabled={isLoading}
          title="Reject auto-assignment"
        >
          <FiX />
          Reject
        </button>
        
        <button
          className="action-btn modify-btn"
          onClick={handleModify}
          disabled={isLoading}
          title="Modify assignment"
        >
          <FiEdit3 />
          Modify
        </button>
        
        <button
          className="action-btn approve-btn"
          onClick={handleApprove}
          disabled={isLoading || !selectedCategoryId}
          title="Approve assignment"
        >
          <FiCheck />
          Approve
        </button>
      </div>
    </div>
  );
}));

VendorGroupCard.displayName = 'VendorGroupCard';

VendorGroupCard.propTypes = {
  vendorGroup: PropTypes.shape({
    vendor_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    vendor_name: PropTypes.string.isRequired,
    vendor_logo: PropTypes.string,
    suggested_category_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    transactions: PropTypes.arrayOf(PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
      date: PropTypes.string.isRequired,
      description: PropTypes.string,
      signed_aud_amount: PropTypes.number.isRequired
    })).isRequired,
    has_rule: PropTypes.bool
  }).isRequired,
  isSelected: PropTypes.bool,
  availableCategories: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired
  })),
  onSelectionChange: PropTypes.func,
  onCategoryChange: PropTypes.func,
  onApprove: PropTypes.func,
  onReject: PropTypes.func,
  onModify: PropTypes.func,
  onCreateRule: PropTypes.func,
  onUpdateRule: PropTypes.func,
  onDeleteRule: PropTypes.func,
  isLoading: PropTypes.bool,
  className: PropTypes.string
};

export default VendorGroupCard; 