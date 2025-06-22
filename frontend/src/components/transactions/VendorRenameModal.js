import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { FiX, FiLoader, FiAlertCircle } from 'react-icons/fi';
import vendorMappingService from '../../services/vendorMapping';
import './VendorRenameModal.css';

const VendorRenameModal = ({ 
  isOpen, 
  onClose, 
  vendor, 
  onRename, 
  onSuccess 
}) => {
  const [newName, setNewName] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state when modal opens/closes or vendor changes
  useEffect(() => {
    if (isOpen && vendor) {
      setNewName('');
      setError('');
      setIsSubmitting(false);
    }
  }, [isOpen, vendor]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    if (!vendor || !newName.trim()) {
      setError('Vendor name cannot be empty');
      return;
    }

    if (newName.trim() === vendor) {
      setError('The new name must be different from the current name');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const result = await vendorMappingService.renameVendor(vendor, newName.trim());
      
      // Call the onRename callback if provided (for backward compatibility)
      if (onRename) {
        await onRename(vendor, newName.trim());
      }
      
      // Call the onSuccess callback if provided
      if (onSuccess) {
        onSuccess(result);
      }
      
      // Close the modal
      onClose();
      
    } catch (error) {
      console.error('Error renaming vendor:', error);
      setError(error.message || 'Failed to rename vendor. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [vendor, newName, onRename, onSuccess, onClose]);

  const handleClose = useCallback(() => {
    if (!isSubmitting) {
      onClose();
    }
  }, [isSubmitting, onClose]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Escape' && !isSubmitting) {
      onClose();
    }
  }, [isSubmitting, onClose]);

  // Don't render if not open or no vendor
  if (!isOpen || !vendor) {
    return null;
  }

  return (
    <div 
      className="vendor-rename-modal-overlay" 
      onClick={handleClose}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div 
        className="vendor-rename-modal-content" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="vendor-rename-modal-header">
          <h2>Rename Vendor</h2>
          <button 
            className="vendor-rename-modal-close-button"
            onClick={handleClose}
            disabled={isSubmitting}
            aria-label="Close modal"
          >
            <FiX />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Content */}
          <div className="vendor-rename-modal-body">
            <div className="vendor-rename-form-group">
              <label className="vendor-rename-form-label">
                Current Name:
              </label>
              <div className="vendor-rename-current-name">
                {vendor}
              </div>
            </div>

            <div className="vendor-rename-form-group">
              <label htmlFor="newVendorName" className="vendor-rename-form-label">
                New Vendor Name: <span className="required">*</span>
              </label>
              <input
                id="newVendorName"
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (error) setError(''); // Clear error on input change
                }}
                className={`vendor-rename-form-input ${error ? 'error' : ''}`}
                placeholder="Enter new vendor name"
                disabled={isSubmitting}
                autoFocus
                maxLength={255}
              />
              {error && (
                <div className="vendor-rename-error-message">
                  <FiAlertCircle />
                  <span>{error}</span>
                </div>
              )}
            </div>

            <div className="vendor-rename-info-text">
              <p>
                Renaming this vendor will create a mapping that applies to all future 
                transactions with this vendor name.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="vendor-rename-modal-footer">
            <button 
              type="button"
              onClick={handleClose} 
              className="vendor-rename-button vendor-rename-button-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="vendor-rename-button vendor-rename-button-primary"
              disabled={isSubmitting || !newName.trim()}
            >
              {isSubmitting ? (
                <>
                  <FiLoader className="vendor-rename-button-spinner" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

VendorRenameModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  vendor: PropTypes.string,
  onRename: PropTypes.func, // Optional: for backward compatibility
  onSuccess: PropTypes.func, // Optional: called with the API result
};

VendorRenameModal.defaultProps = {
  vendor: null,
  onRename: null,
  onSuccess: null,
};

export default VendorRenameModal; 