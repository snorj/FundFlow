import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './VendorRulePromptModal.css';
import { FiX, FiLoader, FiTag, FiCheck } from 'react-icons/fi';

const VendorRulePromptModal = ({ isOpen, onClose, onDismiss, vendors, category, onConfirm }) => {
  const [isCreatingRules, setIsCreatingRules] = useState(false);
  const [selectedVendors, setSelectedVendors] = useState(new Set(vendors));

  // Reset selectedVendors when modal opens or vendors change
  useEffect(() => {
    if (isOpen) {
      setSelectedVendors(new Set(vendors));
    }
  }, [isOpen, vendors]);

  if (!isOpen) return null;

  const handleVendorToggle = (vendor) => {
    const newSelectedVendors = new Set(selectedVendors);
    if (newSelectedVendors.has(vendor)) {
      newSelectedVendors.delete(vendor);
    } else {
      newSelectedVendors.add(vendor);
    }
    setSelectedVendors(newSelectedVendors);
  };

  const handleSelectAll = () => {
    if (selectedVendors.size === vendors.length) {
      // If all are selected, deselect all
      setSelectedVendors(new Set());
    } else {
      // If not all are selected, select all
      setSelectedVendors(new Set(vendors));
    }
  };

  const handleConfirm = async () => {
    if (selectedVendors.size === 0) {
      // If no vendors are selected, just close the modal
      onClose();
      return;
    }

    setIsCreatingRules(true);
    try {
      // Pass only the selected vendors to the confirm handler
      await onConfirm(Array.from(selectedVendors));
    } finally {
      setIsCreatingRules(false);
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !isCreatingRules) {
      if (onDismiss) {
        onDismiss();
      } else {
        onClose();
      }
    }
  };

  return (
    <div className="vendor-rule-prompt-overlay" onClick={handleOverlayClick}>
      <div className="vendor-rule-prompt-modal">
        <div className="modal-header">
          <h2 className="modal-title">
            <FiTag className="title-icon" />
            Create Vendor Rule{vendors.length > 1 ? 's' : ''}
          </h2>
          {!isCreatingRules && (
            <button 
              className="modal-close-button" 
              onClick={onDismiss || onClose}
              aria-label="Close modal"
            >
              <FiX />
            </button>
          )}
        </div>

        <div className="modal-body">
          {vendors.length === 1 ? (
            <div className="rule-description">
              <div className="vendor-selection-item">
                <label className="vendor-checkbox-label">
                  <input
                    type="checkbox"
                    checked={selectedVendors.has(vendors[0])}
                    onChange={() => handleVendorToggle(vendors[0])}
                    className="vendor-checkbox"
                  />
                  <span className="vendor-checkbox-text">
                    Always assign <strong>"{vendors[0]}"</strong> to category <strong>"{category}"</strong>
                  </span>
                </label>
              </div>
            </div>
          ) : (
            <div className="rule-description">
              <div className="vendor-selection-header">
                <p>Select which vendors should be automatically assigned to category <strong>"{category}"</strong>:</p>
                <button 
                  className="select-all-button"
                  onClick={handleSelectAll}
                  type="button"
                >
                  {selectedVendors.size === vendors.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div className="vendor-selection-list">
                {vendors.map(vendor => (
                  <div key={vendor} className="vendor-selection-item">
                    <label className="vendor-checkbox-label">
                      <input
                        type="checkbox"
                        checked={selectedVendors.has(vendor)}
                        onChange={() => handleVendorToggle(vendor)}
                        className="vendor-checkbox"
                      />
                      <FiTag className="vendor-icon" />
                      <span className="vendor-checkbox-text">{vendor}</span>
                    </label>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <div className="rule-explanation">
            <p>
              {selectedVendors.size === 0 ? (
                "No vendors selected. No rules will be created."
              ) : selectedVendors.size === 1 ? (
                "This will create a vendor rule that will automatically categorize future transactions from this vendor."
              ) : (
                `This will create ${selectedVendors.size} vendor rules that will automatically categorize future transactions from the selected vendors.`
              )}
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button 
            className="confirm-button" 
            onClick={handleConfirm}
            disabled={isCreatingRules}
          >
            {isCreatingRules ? (
              <>
                <FiLoader className="spinner" />
                Creating {selectedVendors.size === 1 ? 'Rule' : 'Rules'}...
              </>
            ) : selectedVendors.size === 0 ? (
              "Don't Create Rules"
            ) : selectedVendors.size === 1 ? (
              <>
                <FiCheck />
                Create Rule
              </>
            ) : (
              <>
                <FiCheck />
                Create {selectedVendors.size} Rules
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

VendorRulePromptModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onDismiss: PropTypes.func,
  vendors: PropTypes.arrayOf(PropTypes.string).isRequired,
  category: PropTypes.string.isRequired,
  onConfirm: PropTypes.func.isRequired,
};

export default VendorRulePromptModal; 