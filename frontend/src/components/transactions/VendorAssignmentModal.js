import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { FiX, FiLoader, FiAlertCircle, FiInfo } from 'react-icons/fi';
import vendorMappingService from '../../services/vendorMapping';
import './VendorAssignmentModal.css';

const VendorAssignmentModal = ({ 
  isOpen, 
  onClose, 
  vendor, 
  existingVendors = [],
  onAssign,
  onSuccess 
}) => {
  const [selectedVendor, setSelectedVendor] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [willInheritRules, setWillInheritRules] = useState(false);
  const [checkingRules, setCheckingRules] = useState(false);

  // Reset state when modal opens/closes or vendor changes
  useEffect(() => {
    if (isOpen && vendor) {
      setSelectedVendor('');
      setError('');
      setIsSubmitting(false);
      setWillInheritRules(false);
      setCheckingRules(false);
    }
  }, [isOpen, vendor]);

  // Check if selected vendor has rules
  useEffect(() => {
    const checkVendorRules = async () => {
      if (selectedVendor && selectedVendor !== vendor) {
        setCheckingRules(true);
        try {
          const hasRules = await vendorMappingService.checkVendorRules(selectedVendor);
          setWillInheritRules(hasRules);
        } catch (error) {
          console.error('Error checking vendor rules:', error);
          setWillInheritRules(false);
        } finally {
          setCheckingRules(false);
        }
      } else {
        setWillInheritRules(false);
        setCheckingRules(false);
      }
    };

    checkVendorRules();
  }, [selectedVendor, vendor]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    if (!vendor || !selectedVendor) {
      setError('Please select a vendor');
      return;
    }

    if (selectedVendor === vendor) {
      setError('Cannot assign a vendor to itself');
      return;
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      const result = await vendorMappingService.assignToExisting(vendor, selectedVendor);
      
      // Call the onAssign callback if provided (for backward compatibility)
      if (onAssign) {
        await onAssign(vendor, selectedVendor);
      }
      
      // Call the onSuccess callback if provided
      if (onSuccess) {
        onSuccess(result);
      }
      
      // Close the modal
      onClose();
      
    } catch (error) {
      console.error('Error assigning vendor:', error);
      setError(error.message || 'Failed to assign vendor. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [vendor, selectedVendor, onAssign, onSuccess, onClose]);

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

  // Filter out the current vendor from existing vendors list
  const availableVendors = existingVendors.filter(v => v !== vendor);

  return (
    <div 
      className="vendor-assignment-modal-overlay" 
      onClick={handleClose}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div 
        className="vendor-assignment-modal-content" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="vendor-assignment-modal-header">
          <h2>Assign to Existing Vendor</h2>
          <button 
            className="vendor-assignment-modal-close-button"
            onClick={handleClose}
            disabled={isSubmitting}
            aria-label="Close modal"
          >
            <FiX />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Content */}
          <div className="vendor-assignment-modal-body">
            <div className="vendor-assignment-form-group">
              <label className="vendor-assignment-form-label">
                Current Vendor:
              </label>
              <div className="vendor-assignment-current-vendor">
                {vendor}
              </div>
            </div>

            <div className="vendor-assignment-form-group">
              <label htmlFor="existingVendor" className="vendor-assignment-form-label">
                Select Existing Vendor: <span className="required">*</span>
              </label>
              <select
                id="existingVendor"
                value={selectedVendor}
                onChange={(e) => {
                  setSelectedVendor(e.target.value);
                  if (error) setError(''); // Clear error on selection change
                }}
                className={`vendor-assignment-form-select ${error ? 'error' : ''}`}
                disabled={isSubmitting}
              >
                <option value="">Select a vendor...</option>
                {availableVendors.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              {error && (
                <div className="vendor-assignment-error-message">
                  <FiAlertCircle />
                  <span>{error}</span>
                </div>
              )}
            </div>

            {/* Rule inheritance notification */}
            {selectedVendor && (
              <div className="vendor-assignment-rules-status">
                {checkingRules ? (
                  <div className="vendor-assignment-checking-rules">
                    <FiLoader className="vendor-assignment-spinner" />
                    <span>Checking for existing rules...</span>
                  </div>
                ) : willInheritRules ? (
                  <div className="vendor-assignment-inherit-notice">
                    <FiInfo />
                    <div>
                      <strong>Rule Inheritance</strong>
                      <p>
                        Transactions with this vendor will inherit existing rules from "{selectedVendor}".
                        Future transactions will be automatically categorized based on these rules.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="vendor-assignment-no-rules-notice">
                    <FiInfo />
                    <div>
                      <strong>No Existing Rules</strong>
                      <p>
                        The selected vendor "{selectedVendor}" doesn't have any categorization rules.
                        You can create rules later for automatic categorization.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="vendor-assignment-info-text">
              <p>
                Assigning this vendor will create a mapping that redirects all future 
                transactions from "{vendor}" to be treated as "{selectedVendor}".
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="vendor-assignment-modal-footer">
            <button 
              type="button"
              onClick={handleClose} 
              className="vendor-assignment-button vendor-assignment-button-secondary"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="vendor-assignment-button vendor-assignment-button-primary"
              disabled={isSubmitting || !selectedVendor}
            >
              {isSubmitting ? (
                <>
                  <FiLoader className="vendor-assignment-button-spinner" />
                  Assigning...
                </>
              ) : (
                'Assign'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

VendorAssignmentModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  vendor: PropTypes.string,
  existingVendors: PropTypes.arrayOf(PropTypes.string),
  onAssign: PropTypes.func, // Optional: for backward compatibility
  onSuccess: PropTypes.func, // Optional: called with the API result
};

VendorAssignmentModal.defaultProps = {
  vendor: null,
  existingVendors: [],
  onAssign: null,
  onSuccess: null,
};

export default VendorAssignmentModal; 