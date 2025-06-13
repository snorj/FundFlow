import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { 
  FiX, 
  FiBookmark, 
  FiCheck, 
  FiAlertCircle,
  FiRefreshCw
} from 'react-icons/fi';
import customViewService from '../../services/customViews';
import { formatCurrency } from '../../utils/formatting';
import './CustomViewSelector.css';

const CustomViewSelector = ({ 
  isOpen, 
  onClose, 
  transactions = [], 
  onViewSelected,
  onSuccess
}) => {
  const [customViews, setCustomViews] = useState([]);
  const [selectedView, setSelectedView] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAssigning, setIsAssigning] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  // Load custom views when modal opens
  useEffect(() => {
    if (isOpen) {
      loadCustomViews();
    }
  }, [isOpen]);

  const loadCustomViews = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const views = await customViewService.getCustomViews();
      setCustomViews(views.filter(view => !view.is_archived));
    } catch (err) {
      console.error('Error loading custom views:', err);
      setError('Failed to load custom views. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewSelect = (view) => {
    setSelectedView(view);
    setError(null);
  };

  const handleConfirm = async () => {
    if (!selectedView || transactions.length === 0) return;

    setIsAssigning(true);
    setError(null);

    try {
      // Get the actual transaction objects to extract IDs
      const transactionIds = Array.isArray(transactions[0]) 
        ? transactions
        : transactions.map(t => typeof t === 'object' ? t.id : t);

      await customViewService.assignTransactions(selectedView.id, {
        transaction_ids: transactionIds
      });

      setSuccess(true);
      
      // Call success callback after a brief delay
      setTimeout(() => {
        if (onSuccess) {
          onSuccess({
            viewName: selectedView.name,
            transactionCount: transactions.length
          });
        }
        handleClose();
      }, 1500);

    } catch (err) {
      console.error('Error assigning transactions:', err);
      const errorMessage = err.response?.data?.error || 
                          err.response?.data?.message || 
                          'Failed to add transactions to view. Please try again.';
      setError(errorMessage);
    } finally {
      setIsAssigning(false);
    }
  };

  const handleClose = () => {
    setSelectedView(null);
    setError(null);
    setSuccess(false);
    setIsAssigning(false);
    onClose();
  };

  // Calculate total amount for display
  const totalAmount = transactions.reduce((sum, t) => {
    const amount = typeof t === 'object' ? (t.signed_aud_amount || t.signed_original_amount || 0) : 0;
    return sum + amount;
  }, 0);

  if (!isOpen) return null;

  return (
    <div className="custom-view-selector-overlay" onClick={handleClose}>
      <div className="custom-view-selector-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <FiBookmark className="header-icon" />
            Add to Custom View
          </h3>
          <button 
            className="close-btn" 
            onClick={handleClose}
            disabled={isAssigning}
          >
            <FiX />
          </button>
        </div>

        <div className="modal-content">
          {success ? (
            <div className="success-state">
              <div className="success-icon">
                <FiCheck />
              </div>
              <p>Successfully added {transactions.length} transaction{transactions.length !== 1 ? 's' : ''} to "{selectedView?.name}"</p>
            </div>
          ) : (
            <>
              {/* Transaction Summary */}
              <div className="transaction-summary">
                <p>
                  Adding <strong>{transactions.length}</strong> transaction{transactions.length !== 1 ? 's' : ''} 
                  {totalAmount !== 0 && (
                    <span> totaling <strong>{formatCurrency(Math.abs(totalAmount), 'AUD')}</strong></span>
                  )}
                </p>
              </div>

              {/* Error Display */}
              {error && (
                <div className="error-message">
                  <FiAlertCircle />
                  <span>{error}</span>
                </div>
              )}

              {/* Custom Views List */}
              <div className="views-section">
                <h4>Select a Custom View:</h4>
                
                {isLoading ? (
                  <div className="loading-state">
                    <FiRefreshCw className="spinner" />
                    <p>Loading custom views...</p>
                  </div>
                ) : customViews.length === 0 ? (
                  <div className="empty-state">
                    <p>No custom views available. Create a custom view first to add transactions.</p>
                  </div>
                ) : (
                  <div className="views-list">
                    {customViews.map(view => (
                      <div 
                        key={view.id}
                        className={`view-item ${selectedView?.id === view.id ? 'selected' : ''}`}
                        onClick={() => handleViewSelect(view)}
                      >
                        <div className="view-main">
                          <h5>{view.name}</h5>
                          {view.description && (
                            <p className="view-description">{view.description}</p>
                          )}
                        </div>
                        
                        <div className="view-stats">
                          <span className="transaction-count">
                            {view.transaction_count || 0} transactions
                          </span>
                          {view.total_amount && (
                            <span className="total-amount">
                              {formatCurrency(view.total_amount, 'AUD')}
                            </span>
                          )}
                        </div>

                        {selectedView?.id === view.id && (
                          <div className="selected-indicator">
                            <FiCheck />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {!success && (
          <div className="modal-actions">
            <button 
              className="btn-secondary" 
              onClick={handleClose}
              disabled={isAssigning}
            >
              Cancel
            </button>
            <button 
              className="btn-primary" 
              onClick={handleConfirm}
              disabled={!selectedView || isAssigning || customViews.length === 0}
            >
              {isAssigning ? (
                <>
                  <FiRefreshCw className="spinner" />
                  Adding...
                </>
              ) : (
                <>
                  <FiCheck />
                  Add to View
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

CustomViewSelector.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  transactions: PropTypes.array.isRequired,
  onViewSelected: PropTypes.func,
  onSuccess: PropTypes.func
};

export default CustomViewSelector; 