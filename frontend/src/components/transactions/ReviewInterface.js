import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { 
  FiCheck, 
  FiX, 
  FiCheckSquare, 
  FiSquare, 
  FiLoader, 
  FiInfo,
  FiActivity,
  FiBarChart,
  FiClock,
  FiSave,
  FiHome
} from 'react-icons/fi';
import VendorGroupCard from './VendorGroupCard';
import { formatCurrency } from '../../utils/formatting';
import './ReviewInterface.css';

const ReviewInterface = ({
  vendorGroups = [],
  availableCategories = [],
  isLoading = false,
  error = null,
  onApprove,
  onReject,
  onModify,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
  onBulkApprove,
  onBulkReject,
  onFinishReview,
  onSaveForLater,
  onReturnToDashboard,
  className = ''
}) => {
  // Selection state
  const [selectedVendorIds, setSelectedVendorIds] = useState(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMessage, setProcessingMessage] = useState('');
  
  // Individual vendor category changes
  const [vendorCategoryChanges, setVendorCategoryChanges] = useState(new Map());

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!vendorGroups || vendorGroups.length === 0) {
      return {
        totalGroups: 0,
        totalTransactions: 0,
        totalAmount: 0,
        completedGroups: 0,
        pendingGroups: 0
      };
    }

    const stats = vendorGroups.reduce((acc, group) => {
      const transactionCount = group.transactions?.length || 0;
      const groupAmount = group.transactions?.reduce((sum, tx) => sum + (tx.signed_aud_amount || 0), 0) || 0;
      
      return {
        totalGroups: acc.totalGroups + 1,
        totalTransactions: acc.totalTransactions + transactionCount,
        totalAmount: acc.totalAmount + groupAmount,
        completedGroups: acc.completedGroups + (group.reviewed ? 1 : 0),
        pendingGroups: acc.pendingGroups + (group.reviewed ? 0 : 1)
      };
    }, {
      totalGroups: 0,
      totalTransactions: 0,
      totalAmount: 0,
      completedGroups: 0,
      pendingGroups: 0
    });

    return {
      ...stats,
      completionPercentage: stats.totalGroups > 0 ? Math.round((stats.completedGroups / stats.totalGroups) * 100) : 0
    };
  }, [vendorGroups]);

  // Calculate selection summary
  const selectionSummary = useMemo(() => {
    if (selectedVendorIds.size === 0) return null;
    
    const selectedGroups = vendorGroups.filter(group => selectedVendorIds.has(group.vendor_id));
    const totalTransactions = selectedGroups.reduce((sum, group) => sum + (group.transactions?.length || 0), 0);
    const totalAmount = selectedGroups.reduce((sum, group) => 
      sum + (group.transactions?.reduce((groupSum, tx) => groupSum + (tx.signed_aud_amount || 0), 0) || 0), 0
    );
    
    return {
      count: selectedGroups.length,
      totalTransactions,
      totalAmount
    };
  }, [selectedVendorIds, vendorGroups]);

  // Handle vendor selection
  const handleVendorSelectionChange = useCallback((vendorId, isSelected) => {
    setSelectedVendorIds(prev => {
      const newSelected = new Set(prev);
      if (isSelected) {
        newSelected.add(vendorId);
      } else {
        newSelected.delete(vendorId);
      }
      return newSelected;
    });
  }, []);

  // Handle select all/none
  const handleSelectAll = useCallback(() => {
    const allVendorIds = vendorGroups.map(group => group.vendor_id);
    const allSelected = allVendorIds.every(id => selectedVendorIds.has(id));
    
    if (allSelected) {
      setSelectedVendorIds(new Set());
    } else {
      setSelectedVendorIds(new Set(allVendorIds));
    }
  }, [vendorGroups, selectedVendorIds]);

  // Handle category changes
  const handleCategoryChange = useCallback((vendorId, categoryId) => {
    setVendorCategoryChanges(prev => {
      const newChanges = new Map(prev);
      if (categoryId) {
        newChanges.set(vendorId, categoryId);
      } else {
        newChanges.delete(vendorId);
      }
      return newChanges;
    });
  }, []);

  // Handle individual vendor actions
  const handleVendorApprove = useCallback(async (vendorGroup) => {
    if (!onApprove) return;
    
    setIsProcessing(true);
    setProcessingMessage(`Approving ${vendorGroup.vendor_name}...`);
    
    try {
      const categoryId = vendorCategoryChanges.get(vendorGroup.vendor_id) || vendorGroup.suggested_category_id;
      await onApprove(vendorGroup, categoryId);
      
      // Remove from selection after approval
      setSelectedVendorIds(prev => {
        const newSelected = new Set(prev);
        newSelected.delete(vendorGroup.vendor_id);
        return newSelected;
      });
      
      // Remove from category changes
      setVendorCategoryChanges(prev => {
        const newChanges = new Map(prev);
        newChanges.delete(vendorGroup.vendor_id);
        return newChanges;
      });
    } catch (error) {
      console.error('Failed to approve vendor group:', error);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  }, [onApprove, vendorCategoryChanges]);

  const handleVendorReject = useCallback(async (vendorGroup) => {
    if (!onReject) return;
    
    setIsProcessing(true);
    setProcessingMessage(`Rejecting ${vendorGroup.vendor_name}...`);
    
    try {
      await onReject(vendorGroup);
      
      // Remove from selection after rejection
      setSelectedVendorIds(prev => {
        const newSelected = new Set(prev);
        newSelected.delete(vendorGroup.vendor_id);
        return newSelected;
      });
    } catch (error) {
      console.error('Failed to reject vendor group:', error);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  }, [onReject]);

  const handleVendorModify = useCallback(async (vendorGroup) => {
    if (!onModify) return;
    
    try {
      await onModify(vendorGroup);
    } catch (error) {
      console.error('Failed to modify vendor group:', error);
    }
  }, [onModify]);

  // Handle bulk operations
  const handleBulkApprove = useCallback(async () => {
    if (!onBulkApprove || selectedVendorIds.size === 0) return;
    
    setIsProcessing(true);
    setProcessingMessage(`Approving ${selectedVendorIds.size} vendor groups...`);
    
    try {
      const selectedGroups = vendorGroups.filter(group => selectedVendorIds.has(group.vendor_id));
      const groupsWithCategories = selectedGroups.map(group => ({
        ...group,
        categoryId: vendorCategoryChanges.get(group.vendor_id) || group.suggested_category_id
      }));
      
      await onBulkApprove(groupsWithCategories);
      
      // Clear selections after bulk approval
      setSelectedVendorIds(new Set());
      setVendorCategoryChanges(new Map());
    } catch (error) {
      console.error('Failed to bulk approve:', error);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  }, [onBulkApprove, selectedVendorIds, vendorGroups, vendorCategoryChanges]);

  const handleBulkReject = useCallback(async () => {
    if (!onBulkReject || selectedVendorIds.size === 0) return;
    
    setIsProcessing(true);
    setProcessingMessage(`Rejecting ${selectedVendorIds.size} vendor groups...`);
    
    try {
      const selectedGroups = vendorGroups.filter(group => selectedVendorIds.has(group.vendor_id));
      await onBulkReject(selectedGroups);
      
      // Clear selections after bulk rejection
      setSelectedVendorIds(new Set());
    } catch (error) {
      console.error('Failed to bulk reject:', error);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  }, [onBulkReject, selectedVendorIds, vendorGroups]);

  // Handle completion actions
  const handleFinishReview = useCallback(async () => {
    if (!onFinishReview) return;
    
    setIsProcessing(true);
    setProcessingMessage('Finishing review...');
    
    try {
      await onFinishReview();
    } catch (error) {
      console.error('Failed to finish review:', error);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  }, [onFinishReview]);

  const handleSaveForLater = useCallback(async () => {
    if (!onSaveForLater) return;
    
    setIsProcessing(true);
    setProcessingMessage('Saving progress...');
    
    try {
      await onSaveForLater();
    } catch (error) {
      console.error('Failed to save for later:', error);
    } finally {
      setIsProcessing(false);
      setProcessingMessage('');
    }
  }, [onSaveForLater]);

  // Loading state
  if (isLoading) {
    return (
      <div className={`review-interface loading ${className}`}>
        <div className="loading-state">
          <FiLoader className="spinner" />
          <h3>Loading review interface...</h3>
          <p>Gathering vendor groups and transaction data for review</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={`review-interface error ${className}`}>
        <div className="error-state">
          <FiX className="error-icon" />
          <h3>Failed to load review data</h3>
          <p>{error}</p>
          <button 
            className="retry-btn"
            onClick={() => window.location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Empty state
  if (!vendorGroups || vendorGroups.length === 0) {
    return (
      <div className={`review-interface empty ${className}`}>
        <div className="empty-state">
          <FiCheck className="empty-icon" />
          <h3>No transactions need review</h3>
          <p>All uploaded transactions have been automatically categorized or there are no pending transactions to review.</p>
          {onReturnToDashboard && (
            <button 
              className="return-btn"
              onClick={onReturnToDashboard}
            >
              <FiHome />
              Return to Dashboard
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`review-interface ${className}`}>
      {/* Header with Summary Statistics */}
      <div className="review-header">
        <div className="header-content">
          <h1>Auto-Assignment Review</h1>
          <p className="header-description">
            Review and confirm automatically categorized transactions before finalizing.
          </p>
        </div>
        
        <div className="summary-stats">
          <div className="stat-card">
                                            <FiBarChart className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{summary.totalGroups}</span>
              <span className="stat-label">Vendor Groups</span>
            </div>
          </div>
          
          <div className="stat-card">
            <FiActivity className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{summary.totalTransactions}</span>
              <span className="stat-label">Transactions</span>
            </div>
          </div>
          
          <div className="stat-card">
            <FiInfo className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{formatCurrency(summary.totalAmount, 'AUD')}</span>
              <span className="stat-label">Total Amount</span>
            </div>
          </div>
          
          <div className="stat-card">
            <FiClock className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{summary.completionPercentage}%</span>
              <span className="stat-label">Complete</span>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="progress-section">
        <div className="progress-bar">
          <div 
            className="progress-fill"
            style={{ width: `${summary.completionPercentage}%` }}
          />
        </div>
        <div className="progress-text">
          {summary.completedGroups} of {summary.totalGroups} vendor groups reviewed
        </div>
      </div>

      {/* Bulk Controls */}
      <div className="bulk-controls">
        <div className="selection-controls">
          <button
            className="select-all-btn"
            onClick={handleSelectAll}
            disabled={isProcessing}
          >
            {selectedVendorIds.size === vendorGroups.length ? (
              <FiCheckSquare />
            ) : selectedVendorIds.size > 0 ? (
              <FiCheckSquare className="partial" />
            ) : (
              <FiSquare />
            )}
            {selectedVendorIds.size === vendorGroups.length ? 'Deselect All' : 'Select All'}
          </button>
          
          {selectionSummary && (
            <div className="selection-summary">
              <span className="selection-count">
                {selectionSummary.count} vendor groups selected
              </span>
              <span className="selection-details">
                {selectionSummary.totalTransactions} transactions, {formatCurrency(selectionSummary.totalAmount, 'AUD')}
              </span>
            </div>
          )}
        </div>

        <div className="bulk-actions">
          <button
            className="bulk-btn bulk-reject-btn"
            onClick={handleBulkReject}
            disabled={selectedVendorIds.size === 0 || isProcessing}
          >
            <FiX />
            Bulk Reject
          </button>
          
          <button
            className="bulk-btn bulk-approve-btn"
            onClick={handleBulkApprove}
            disabled={selectedVendorIds.size === 0 || isProcessing}
          >
            <FiCheck />
            Bulk Approve
          </button>
        </div>
      </div>

      {/* Processing Indicator */}
      {isProcessing && (
        <div className="processing-indicator">
          <FiLoader className="processing-spinner" />
          <span>{processingMessage}</span>
        </div>
      )}

      {/* Vendor Group Cards */}
      <div className="vendor-groups">
        {vendorGroups.map((vendorGroup) => (
          <VendorGroupCard
            key={vendorGroup.vendor_id}
            vendorGroup={vendorGroup}
            isSelected={selectedVendorIds.has(vendorGroup.vendor_id)}
            availableCategories={availableCategories}
            onSelectionChange={handleVendorSelectionChange}
            onCategoryChange={handleCategoryChange}
            onApprove={handleVendorApprove}
            onReject={handleVendorReject}
            onModify={handleVendorModify}
            onCreateRule={onCreateRule}
            onUpdateRule={onUpdateRule}
            onDeleteRule={onDeleteRule}
            isLoading={isProcessing}
          />
        ))}
      </div>

      {/* Completion Controls */}
      <div className="completion-controls">
        <div className="completion-summary">
          <h3>Review Complete?</h3>
          <p>
            {summary.pendingGroups === 0 
              ? 'All vendor groups have been reviewed. You can now finish the review process.'
              : `${summary.pendingGroups} vendor groups still need review.`
            }
          </p>
        </div>

        <div className="completion-actions">
          {onSaveForLater && (
            <button
              className="completion-btn save-btn"
              onClick={handleSaveForLater}
              disabled={isProcessing}
            >
              <FiSave />
              Save for Later
            </button>
          )}
          
          {onReturnToDashboard && (
            <button
              className="completion-btn return-btn"
              onClick={onReturnToDashboard}
              disabled={isProcessing}
            >
              <FiHome />
              Return to Dashboard
            </button>
          )}
          
          {onFinishReview && (
            <button
              className="completion-btn finish-btn"
              onClick={handleFinishReview}
              disabled={isProcessing || summary.pendingGroups > 0}
            >
              <FiCheck />
              Finish Review
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

ReviewInterface.propTypes = {
  vendorGroups: PropTypes.arrayOf(PropTypes.shape({
    vendor_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    vendor_name: PropTypes.string.isRequired,
    vendor_logo: PropTypes.string,
    suggested_category_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    transactions: PropTypes.array.isRequired,
    has_rule: PropTypes.bool,
    reviewed: PropTypes.bool
  })),
  availableCategories: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired
  })),
  isLoading: PropTypes.bool,
  error: PropTypes.string,
  onApprove: PropTypes.func,
  onReject: PropTypes.func,
  onModify: PropTypes.func,
  onCreateRule: PropTypes.func,
  onUpdateRule: PropTypes.func,
  onDeleteRule: PropTypes.func,
  onBulkApprove: PropTypes.func,
  onBulkReject: PropTypes.func,
  onFinishReview: PropTypes.func,
  onSaveForLater: PropTypes.func,
  onReturnToDashboard: PropTypes.func,
  className: PropTypes.string
};

export default ReviewInterface; 