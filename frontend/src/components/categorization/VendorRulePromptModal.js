import React, { useState } from 'react';
import PropTypes from 'prop-types';
import './VendorRulePromptModal.css';
import { FiX, FiLoader, FiTag, FiCheck } from 'react-icons/fi';

const VendorRulePromptModal = ({ isOpen, onClose, onDismiss, vendors, category, onConfirm }) => {
  const [isCreatingRules, setIsCreatingRules] = useState(false);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsCreatingRules(true);
    try {
      await onConfirm();
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
            <p className="rule-description">
              Always assign <strong>"{vendors[0]}"</strong> to category <strong>"{category}"</strong>?
            </p>
          ) : (
            <div className="rule-description">
              <p>Always assign these vendors to category <strong>"{category}"</strong>?</p>
              <ul className="vendor-list">
                {vendors.map(vendor => (
                  <li key={vendor} className="vendor-item">
                    <FiTag className="vendor-icon" />
                    {vendor}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          <div className="rule-explanation">
            <p>
              This will create {vendors.length === 1 ? 'a vendor rule' : 'vendor rules'} that will 
              automatically categorize future transactions from {vendors.length === 1 ? 'this vendor' : 'these vendors'}.
            </p>
          </div>
        </div>

        <div className="modal-footer">
          <button 
            className="cancel-button" 
            onClick={onClose}
            disabled={isCreatingRules}
          >
            Don't Create Rule
          </button>
          <button 
            className="confirm-button" 
            onClick={handleConfirm}
            disabled={isCreatingRules}
          >
            {isCreatingRules ? (
              <>
                <FiLoader className="spinner" />
                Creating Rule{vendors.length > 1 ? 's' : ''}...
              </>
            ) : (
              <>
                <FiCheck />
                Create Rule{vendors.length > 1 ? 's' : ''}
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