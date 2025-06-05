import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import './AddTransactionModal.css';
import { FiX, FiLoader, FiSave, FiCalendar, FiDollarSign, FiTag, FiUser } from 'react-icons/fi';
import CategorySelectorModal from '../categorization/CategorySelectorModal';
import VendorSelectorModal from './VendorSelectorModal';
import transactionService from '../../services/transactions';

const AddTransactionModal = ({
  // Core Modal Props
  isOpen,
  onClose,
  onSuccess,
  
  // UI Customization
  modalTitle = 'Add Transaction',
  modalSize = 'md', // 'sm', 'md', 'lg'
  
  // Initial Values
  initialData = {},
  
  // Feature Control
  showVendorField = true,
  showCategoryField = true,
}) => {
  
  // Form State
  const [formState, setFormState] = useState({
    description: '',
    transaction_date: '',
    original_amount: '',
    original_currency: 'AUD',
    direction: 'outflow', // 'inflow' or 'outflow'
  });
  
  // Selection State
  const [selectionState, setSelectionState] = useState({
    selectedCategory: null,
    selectedVendor: null,
  });
  
  // UI State
  const [uiState, setUiState] = useState({
    loading: false,
    errors: {},
    showCategorySelector: false,
    showVendorSelector: false,
  });

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      // Reset form to initial values or defaults
      setFormState({
        description: initialData.description || '',
        transaction_date: initialData.transaction_date || new Date().toISOString().split('T')[0],
        original_amount: initialData.original_amount || '',
        original_currency: initialData.original_currency || 'AUD',
        direction: initialData.direction || 'outflow',
      });
      
      setSelectionState({
        selectedCategory: initialData.category || null,
        selectedVendor: initialData.vendor || null,
      });
      
      setUiState({
        loading: false,
        errors: {},
        showCategorySelector: false,
        showVendorSelector: false,
      });
    }
  }, [isOpen, initialData]);

  // Form validation
  const validateForm = useCallback(() => {
    const errors = {};
    
    if (!formState.description?.trim()) {
      errors.description = 'Description is required';
    }
    
    if (!formState.transaction_date) {
      errors.transaction_date = 'Date is required';
    }
    
    if (!formState.original_amount || isNaN(parseFloat(formState.original_amount)) || parseFloat(formState.original_amount) <= 0) {
      errors.original_amount = 'Please enter a valid amount greater than 0';
    }
    
    if (!formState.original_currency?.trim()) {
      errors.original_currency = 'Currency is required';
    } else if (formState.original_currency.length !== 3) {
      errors.original_currency = 'Currency must be 3 characters (e.g., AUD, USD)';
    }
    
    if (!formState.direction) {
      errors.direction = 'Transaction direction is required';
    }
    
    if (showCategoryField && !selectionState.selectedCategory) {
      errors.category = 'Please select a category';
    }
    
    return errors;
  }, [formState, selectionState, showCategoryField]);

  // Form handlers
  const handleFieldChange = useCallback((field, value) => {
    setFormState(prev => ({ ...prev, [field]: value }));
    
    // Clear error when user starts typing
    if (uiState.errors[field]) {
      setUiState(prev => ({
        ...prev,
        errors: { ...prev.errors, [field]: null }
      }));
    }
  }, [uiState.errors]);

  // Selection handlers
  const handleCategorySelect = useCallback((category) => {
    setSelectionState(prev => ({ ...prev, selectedCategory: category }));
    setUiState(prev => ({ 
      ...prev, 
      showCategorySelector: false,
      errors: { ...prev.errors, category: null }
    }));
  }, []);

  const handleVendorSelect = useCallback((vendor) => {
    setSelectionState(prev => ({ ...prev, selectedVendor: vendor }));
    setUiState(prev => ({ 
      ...prev, 
      showVendorSelector: false 
    }));
  }, []);

  // Modal handlers
  const handleCategoryModalOpen = useCallback(() => {
    setUiState(prev => ({ ...prev, showCategorySelector: true }));
  }, []);

  const handleVendorModalOpen = useCallback(() => {
    setUiState(prev => ({ ...prev, showVendorSelector: true }));
  }, []);

  const handleCategoryModalClose = useCallback(() => {
    setUiState(prev => ({ ...prev, showCategorySelector: false }));
  }, []);

  const handleVendorModalClose = useCallback(() => {
    setUiState(prev => ({ ...prev, showVendorSelector: false }));
  }, []);

  // Form submission
  const handleSubmit = useCallback(async () => {
    const errors = validateForm();
    
    if (Object.keys(errors).length > 0) {
      setUiState(prev => ({ ...prev, errors }));
      return;
    }
    
    setUiState(prev => ({ ...prev, loading: true, errors: {} }));
    
    try {
      const transactionData = {
        description: formState.description.trim(),
        transaction_date: formState.transaction_date,
        original_amount: parseFloat(formState.original_amount),
        original_currency: formState.original_currency.toUpperCase(),
        direction: formState.direction,
        category_id: selectionState.selectedCategory?.id || null,
        vendor_id: selectionState.selectedVendor?.id || null,
      };
      
      const createdTransaction = await transactionService.createManualTransaction(transactionData);
      
      // Success handling
      if (onSuccess) {
        onSuccess(createdTransaction);
      }
      
      onClose();
      
    } catch (error) {
      console.error('Failed to create transaction:', error);
      setUiState(prev => ({
        ...prev,
        errors: { submit: error.message || 'Failed to create transaction. Please try again.' }
      }));
    } finally {
      setUiState(prev => ({ ...prev, loading: false }));
    }
  }, [formState, selectionState, validateForm, onSuccess, onClose]);

  // Cancel handler
  const handleCancel = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  // Determine modal CSS classes
  const modalClasses = [
    'transaction-modal-content',
    `transaction-modal--${modalSize}`,
    uiState.loading ? 'transaction-modal--loading' : ''
  ].join(' ');

  return (
    <>
      <div className="transaction-modal-overlay" onClick={handleCancel}>
        <div className={modalClasses} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div className="modal-header">
            <h2>{modalTitle}</h2>
            <button onClick={handleCancel} className="modal-close-button" aria-label="Close">
              <FiX />
            </button>
          </div>

          {/* Body */}
          <div className="modal-body">
            <form className="transaction-form" onSubmit={(e) => e.preventDefault()}>
              
              {/* Description Field */}
              <div className="form-group">
                <label htmlFor="description" className="form-label">
                  <FiTag className="form-icon" />
                  Description *
                </label>
                <input
                  id="description"
                  type="text"
                  className={`form-input ${uiState.errors.description ? 'form-input--error' : ''}`}
                  value={formState.description}
                  onChange={(e) => handleFieldChange('description', e.target.value)}
                  placeholder="Enter transaction description"
                  disabled={uiState.loading}
                />
                {uiState.errors.description && (
                  <span className="form-error">{uiState.errors.description}</span>
                )}
              </div>

              {/* Date Field */}
              <div className="form-group">
                <label htmlFor="transaction_date" className="form-label">
                  <FiCalendar className="form-icon" />
                  Date *
                </label>
                <input
                  id="transaction_date"
                  type="date"
                  className={`form-input ${uiState.errors.transaction_date ? 'form-input--error' : ''}`}
                  value={formState.transaction_date}
                  onChange={(e) => handleFieldChange('transaction_date', e.target.value)}
                  disabled={uiState.loading}
                />
                {uiState.errors.transaction_date && (
                  <span className="form-error">{uiState.errors.transaction_date}</span>
                )}
              </div>

              {/* Amount and Currency Row */}
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="original_amount" className="form-label">
                    <FiDollarSign className="form-icon" />
                    Amount *
                  </label>
                  <input
                    id="original_amount"
                    type="number"
                    step="0.01"
                    min="0"
                    className={`form-input ${uiState.errors.original_amount ? 'form-input--error' : ''}`}
                    value={formState.original_amount}
                    onChange={(e) => handleFieldChange('original_amount', e.target.value)}
                    placeholder="0.00"
                    disabled={uiState.loading}
                  />
                  {uiState.errors.original_amount && (
                    <span className="form-error">{uiState.errors.original_amount}</span>
                  )}
                </div>

                <div className="form-group">
                  <label htmlFor="original_currency" className="form-label">Currency *</label>
                  <input
                    id="original_currency"
                    type="text"
                    maxLength="3"
                    className={`form-input ${uiState.errors.original_currency ? 'form-input--error' : ''}`}
                    value={formState.original_currency}
                    onChange={(e) => handleFieldChange('original_currency', e.target.value.toUpperCase())}
                    placeholder="AUD"
                    disabled={uiState.loading}
                  />
                  {uiState.errors.original_currency && (
                    <span className="form-error">{uiState.errors.original_currency}</span>
                  )}
                </div>
              </div>

              {/* Direction Field */}
              <div className="form-group">
                <label className="form-label">Direction *</label>
                <div className="radio-group">
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="direction"
                      value="outflow"
                      checked={formState.direction === 'outflow'}
                      onChange={(e) => handleFieldChange('direction', e.target.value)}
                      disabled={uiState.loading}
                    />
                    <span className="radio-label">Outflow (Money Out)</span>
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      name="direction"
                      value="inflow"
                      checked={formState.direction === 'inflow'}
                      onChange={(e) => handleFieldChange('direction', e.target.value)}
                      disabled={uiState.loading}
                    />
                    <span className="radio-label">Inflow (Money In)</span>
                  </label>
                </div>
                {uiState.errors.direction && (
                  <span className="form-error">{uiState.errors.direction}</span>
                )}
              </div>

              {/* Category Field */}
              {showCategoryField && (
                <div className="form-group">
                  <label className="form-label">
                    <FiTag className="form-icon" />
                    Category *
                  </label>
                  <div className="selector-field">
                    <input
                      type="text"
                      className={`form-input ${uiState.errors.category ? 'form-input--error' : ''}`}
                      value={selectionState.selectedCategory?.name || ''}
                      placeholder="Select a category"
                      readOnly
                      disabled={uiState.loading}
                    />
                    <button
                      type="button"
                      className="selector-button"
                      onClick={handleCategoryModalOpen}
                      disabled={uiState.loading}
                    >
                      Select
                    </button>
                  </div>
                  {uiState.errors.category && (
                    <span className="form-error">{uiState.errors.category}</span>
                  )}
                </div>
              )}

              {/* Vendor Field */}
              {showVendorField && (
                <div className="form-group">
                  <label className="form-label">
                    <FiUser className="form-icon" />
                    Vendor (Optional)
                  </label>
                  <div className="selector-field">
                    <input
                      type="text"
                      className="form-input"
                      value={selectionState.selectedVendor?.name || ''}
                      placeholder="Select a vendor (optional)"
                      readOnly
                      disabled={uiState.loading}
                    />
                    <button
                      type="button"
                      className="selector-button"
                      onClick={handleVendorModalOpen}
                      disabled={uiState.loading}
                    >
                      Select
                    </button>
                  </div>
                </div>
              )}

              {/* Global Error */}
              {uiState.errors.submit && (
                <div className="form-error form-error--global">{uiState.errors.submit}</div>
              )}
            </form>
          </div>

          {/* Footer */}
          <div className="modal-footer">
            <button
              onClick={handleCancel}
              className="modal-button cancel"
              disabled={uiState.loading}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              className="modal-button confirm"
              disabled={uiState.loading}
            >
              {uiState.loading ? (
                <>
                  <FiLoader className="spinner" />
                  Saving...
                </>
              ) : (
                <>
                  <FiSave />
                  Save Transaction
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Category Selector Modal */}
      {showCategoryField && (
        <CategorySelectorModal
          isOpen={uiState.showCategorySelector}
          onClose={handleCategoryModalClose}
          onSelectCategory={handleCategorySelect}
          initialCategory={selectionState.selectedCategory}
          selectionMode="immediate"
        />
      )}

      {/* Vendor Selector Modal */}
      {showVendorField && (
        <VendorSelectorModal
          isOpen={uiState.showVendorSelector}
          onClose={handleVendorModalClose}
          onSelectVendor={handleVendorSelect}
          initialVendor={selectionState.selectedVendor}
          selectionMode="immediate"
          allowCreate={true}
        />
      )}
    </>
  );
};

AddTransactionModal.propTypes = {
  // Core Modal Props
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
  
  // UI Customization
  modalTitle: PropTypes.string,
  modalSize: PropTypes.oneOf(['sm', 'md', 'lg']),
  
  // Initial Values
  initialData: PropTypes.object,
  
  // Feature Control
  showVendorField: PropTypes.bool,
  showCategoryField: PropTypes.bool,
};

export default AddTransactionModal; 