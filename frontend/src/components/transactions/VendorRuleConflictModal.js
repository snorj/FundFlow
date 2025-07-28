import React, { useState } from 'react';
import { FiX, FiAlertTriangle, FiTag, FiMove } from 'react-icons/fi';
import './VendorRuleConflictModal.css';

const VendorRuleConflictModal = ({
  isOpen,
  onClose,
  vendor,
  currentRule,
  newParentCategory,
  onKeepCurrentRule,
  onInheritFromParent,
  onRemoveRule
}) => {
  const [selectedOption, setSelectedOption] = useState('keep');
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    setIsProcessing(true);
    try {
      switch (selectedOption) {
        case 'keep':
          await onKeepCurrentRule();
          break;
        case 'inherit':
          await onInheritFromParent();
          break;
        case 'remove':
          await onRemoveRule();
          break;
        default:
          break;
      }
      onClose();
    } catch (error) {
      console.error('Error handling vendor rule conflict:', error);
      alert('Failed to update vendor rule: ' + (error.message || 'Unknown error'));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={handleCancel}>
      <div className="modal-content vendor-rule-conflict-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="header-content">
            <FiAlertTriangle className="warning-icon" />
            <h2>Vendor Rule Conflict</h2>
          </div>
          <button 
            onClick={handleCancel} 
            className="close-button"
            disabled={isProcessing}
            aria-label="Close modal"
          >
            <FiX />
          </button>
        </header>

        <div className="modal-body">
          <div className="conflict-info">
            <p className="vendor-info">
              <strong>Vendor:</strong> {vendor?.name}
            </p>
            <p className="current-rule-info">
              <strong>Current Rule:</strong> Automatically categorize as 
              <span className="category-tag">
                <FiTag className="tag-icon" />
                {currentRule?.category_name}
              </span>
            </p>
            {newParentCategory && (
              <p className="new-parent-info">
                <strong>New Location:</strong> Moving to 
                <span className="category-tag">
                  <FiMove className="move-icon" />
                  {newParentCategory.name}
                </span>
              </p>
            )}
          </div>

          <div className="options-section">
            <h3>What would you like to do with the vendor rule?</h3>
            
            <div className="option-group">
              <label className="option-label">
                <input
                  type="radio"
                  name="ruleOption"
                  value="keep"
                  checked={selectedOption === 'keep'}
                  onChange={(e) => setSelectedOption(e.target.value)}
                  disabled={isProcessing}
                />
                <div className="option-content">
                  <strong>Keep Current Rule</strong>
                  <p>Continue categorizing transactions as <em>{currentRule?.category_name}</em></p>
                </div>
              </label>

              {newParentCategory && (
                <label className="option-label">
                  <input
                    type="radio"
                    name="ruleOption"
                    value="inherit"
                    checked={selectedOption === 'inherit'}
                    onChange={(e) => setSelectedOption(e.target.value)}
                    disabled={isProcessing}
                  />
                  <div className="option-content">
                    <strong>Inherit from New Parent</strong>
                    <p>Change rule to categorize transactions as <em>{newParentCategory.name}</em></p>
                  </div>
                </label>
              )}

              <label className="option-label">
                <input
                  type="radio"
                  name="ruleOption"
                  value="remove"
                  checked={selectedOption === 'remove'}
                  onChange={(e) => setSelectedOption(e.target.value)}
                  disabled={isProcessing}
                />
                <div className="option-content">
                  <strong>Remove Rule</strong>
                  <p>Stop automatically categorizing transactions from this vendor</p>
                </div>
              </label>
            </div>
          </div>
        </div>

        <footer className="modal-footer">
          <button 
            onClick={handleCancel}
            className="button-secondary"
            disabled={isProcessing}
          >
            Cancel Move
          </button>
          <button 
            onClick={handleSubmit}
            className="button-primary"
            disabled={isProcessing}
          >
            {isProcessing ? 'Processing...' : 'Move Vendor'}
          </button>
        </footer>
      </div>
    </div>
  );
};

export default VendorRuleConflictModal; 