import React, { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { FiX, FiLoader, FiAlertCircle, FiSearch, FiCheck, FiGitMerge } from 'react-icons/fi';
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
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
  const [existingVendor, setExistingVendor] = useState(null);
  const [showMergeConfirm, setShowMergeConfirm] = useState(false);
  
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Reset state when modal opens/closes or vendor changes
  useEffect(() => {
    if (isOpen && vendor) {
      setNewName('');
      setError('');
      setIsSubmitting(false);
      setSearchSuggestions([]);
      setIsSearching(false);
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
      setExistingVendor(null);
      setShowMergeConfirm(false);
    }
  }, [isOpen, vendor]);

  // Search for vendor suggestions
  const searchVendorSuggestions = useCallback(async (searchTerm) => {
    console.log('🔍 searchVendorSuggestions called with:', searchTerm);
    
    if (!searchTerm || searchTerm.trim().length < 2) {
      console.log('❌ Search term too short, clearing suggestions');
      setSearchSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setIsSearching(true);
    try {
      console.log('🚀 Calling vendorMappingService.searchVendorNames...');
      const suggestions = await vendorMappingService.searchVendorNames(searchTerm);
      console.log('📦 Raw suggestions received:', suggestions);
      
      // Filter out the current vendor and exact matches
      const filteredSuggestions = suggestions.filter(suggestion => 
        suggestion.toLowerCase() !== vendor.toLowerCase() &&
        suggestion.toLowerCase() !== searchTerm.toLowerCase()
      );
      console.log('✅ Filtered suggestions:', filteredSuggestions);
      console.log('🎯 Current vendor:', vendor);
      console.log('🔎 Search term:', searchTerm);
      
      setSearchSuggestions(filteredSuggestions);
      setShowSuggestions(filteredSuggestions.length > 0);
      setSelectedSuggestionIndex(-1);
      
      console.log('💡 Show suggestions:', filteredSuggestions.length > 0);
      console.log('📊 Final state - suggestions:', filteredSuggestions, 'showSuggestions:', filteredSuggestions.length > 0);
    } catch (error) {
      console.error('❌ Error searching vendor names:', error);
      setSearchSuggestions([]);
      setShowSuggestions(false);
    } finally {
      setIsSearching(false);
    }
  }, [vendor]);

  // Handle input change with debounced search
  const handleInputChange = useCallback((e) => {
    const value = e.target.value;
    setNewName(value);
    setError('');
    setExistingVendor(null);
    setShowMergeConfirm(false);

    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Debounce search requests
    searchTimeoutRef.current = setTimeout(() => {
      searchVendorSuggestions(value);
    }, 300);
  }, [searchVendorSuggestions]);

  // Handle suggestion selection
  const handleSuggestionSelect = useCallback((suggestion) => {
    setNewName(suggestion);
    setShowSuggestions(false);
    setSelectedSuggestionIndex(-1);
    setExistingVendor(suggestion);
    setShowMergeConfirm(true);
    inputRef.current?.focus();
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (showSuggestions && searchSuggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedSuggestionIndex(prev => 
            prev < searchSuggestions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setSelectedSuggestionIndex(prev => 
            prev > 0 ? prev - 1 : searchSuggestions.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (selectedSuggestionIndex >= 0 && selectedSuggestionIndex < searchSuggestions.length) {
            handleSuggestionSelect(searchSuggestions[selectedSuggestionIndex]);
          } else {
            handleSubmit(e);
          }
          break;
        case 'Escape':
          setShowSuggestions(false);
          setSelectedSuggestionIndex(-1);
          break;
        default:
          break;
      }
    } else if (e.key === 'Escape' && !isSubmitting) {
      onClose();
    }
  }, [showSuggestions, searchSuggestions, selectedSuggestionIndex, handleSuggestionSelect, isSubmitting, onClose]);

  // Check if vendor exists when user finishes typing
  const checkVendorExists = useCallback(async (vendorName) => {
    if (!vendorName || vendorName.trim() === vendor) return false;

    try {
      const exists = await vendorMappingService.checkVendorExists(vendorName.trim());
      if (exists) {
        setExistingVendor(vendorName.trim());
        setShowMergeConfirm(true);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error checking vendor existence:', error);
      return false;
    }
  }, [vendor]);

  // Handle form submission
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

    // If not confirming a merge, check if vendor exists first
    if (!showMergeConfirm) {
      const vendorExists = await checkVendorExists(newName.trim());
      
      // If checkVendorExists found an existing vendor, don't proceed with rename
      // The state will be updated and user will see the merge confirmation dialog
      if (vendorExists) {
        return;
      }
    }
    
    setIsSubmitting(true);
    setError('');
    
    try {
      let result;
      
      if (showMergeConfirm && existingVendor) {
        // User confirmed merge, use assign to existing API
        result = await vendorMappingService.assignToExisting(vendor, existingVendor);
      } else {
        // Regular rename operation
        result = await vendorMappingService.renameVendor(vendor, newName.trim());
      }
      
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
      console.error('Error processing vendor operation:', error);
      setError(error.message || 'Failed to process vendor operation. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [vendor, newName, onRename, onSuccess, onClose, showMergeConfirm, checkVendorExists]);

  // Handle merge confirmation
  const handleConfirmMerge = useCallback(() => {
    // Don't reset showMergeConfirm here - let handleSubmit manage the state
    handleSubmit({ preventDefault: () => {} });
  }, [handleSubmit]);

  // Handle merge cancellation
  const handleCancelMerge = useCallback(() => {
    setShowMergeConfirm(false);
    setExistingVendor(null);
    inputRef.current?.focus();
  }, []);

  const handleClose = useCallback(() => {
    if (!isSubmitting) {
      onClose();
    }
  }, [isSubmitting, onClose]);

  // Click outside to hide suggestions
  const handleClickOutside = useCallback((e) => {
    if (suggestionsRef.current && !suggestionsRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)) {
      setShowSuggestions(false);
      setSelectedSuggestionIndex(-1);
    }
  }, []);

  useEffect(() => {
    if (showSuggestions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showSuggestions, handleClickOutside]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

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
          <h2>{showMergeConfirm ? 'Merge Vendors' : 'Rename Vendor'}</h2>
          <button 
            className="vendor-rename-modal-close-button"
            onClick={handleClose}
            disabled={isSubmitting}
            aria-label="Close modal"
          >
            <FiX />
          </button>
        </div>

        {!showMergeConfirm ? (
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
                <div className="vendor-rename-input-container">
                  <div className="vendor-rename-search-wrapper">
                    <FiSearch className="vendor-rename-search-icon" />
                    <input
                      ref={inputRef}
                      id="newVendorName"
                      type="text"
                      value={newName}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      className={`vendor-rename-form-input ${error ? 'error' : ''}`}
                      placeholder="Start typing to search for existing vendors..."
                      disabled={isSubmitting}
                      autoFocus
                      maxLength={255}
                      autoComplete="off"
                    />
                    {isSearching && (
                      <FiLoader className="vendor-rename-loading-icon" />
                    )}
                  </div>
                  
                  {/* Search Suggestions */}
                  {showSuggestions && searchSuggestions.length > 0 && (
                    <div ref={suggestionsRef} className="vendor-rename-suggestions">
                      <div className="vendor-rename-suggestions-header">
                        Existing vendors (click to merge):
                      </div>
                      {searchSuggestions.map((suggestion, index) => (
                        <div
                          key={suggestion}
                          className={`vendor-rename-suggestion ${
                            index === selectedSuggestionIndex ? 'selected' : ''
                          }`}
                          onClick={() => handleSuggestionSelect(suggestion)}
                          onMouseEnter={() => setSelectedSuggestionIndex(index)}
                        >
                                                                  <FiGitMerge className="vendor-rename-suggestion-icon" />
                          <span className="vendor-rename-suggestion-text">{suggestion}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {error && (
                  <div className="vendor-rename-error-message">
                    <FiAlertCircle />
                    <span>{error}</span>
                  </div>
                )}
              </div>

              <div className="vendor-rename-info-text">
                <p>
                  As you type, suggestions for existing vendors will appear below. 
                  Click on a suggestion to merge with that vendor instead of creating a new one.
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
                  <>
                    <FiCheck className="vendor-rename-button-icon" />
                    Rename Vendor
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          /* Merge Confirmation Dialog */
          <div className="vendor-rename-modal-body">
            <div className="vendor-rename-merge-confirmation">
              <div className="vendor-rename-merge-icon">
                                        <FiGitMerge />
              </div>
              <h3>Merge Vendors</h3>
              <p>
                The vendor name <strong>"{newName}"</strong> already exists.
              </p>
              <p>
                Do you want to merge <strong>"{vendor}"</strong> with the existing vendor <strong>"{existingVendor}"</strong>?
              </p>
              <div className="vendor-rename-merge-details">
                <div className="vendor-rename-merge-detail">
                  <FiCheck className="vendor-rename-merge-check" />
                  All transactions from "{vendor}" will be assigned to "{existingVendor}"
                </div>
                <div className="vendor-rename-merge-detail">
                  <FiCheck className="vendor-rename-merge-check" />
                  Future transactions with "{vendor}" will automatically map to "{existingVendor}"
                </div>
                <div className="vendor-rename-merge-detail">
                  <FiCheck className="vendor-rename-merge-check" />
                  If "{existingVendor}" has categorization rules, they will apply to merged transactions
                </div>
              </div>
            </div>

            <div className="vendor-rename-modal-footer">
              <button 
                type="button"
                onClick={handleCancelMerge} 
                className="vendor-rename-button vendor-rename-button-secondary"
                disabled={isSubmitting}
              >
                Cancel
              </button>
              <button 
                type="button"
                onClick={handleConfirmMerge}
                className="vendor-rename-button vendor-rename-button-primary"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <FiLoader className="vendor-rename-button-spinner" />
                    Merging...
                  </>
                ) : (
                  <>
                                            <FiGitMerge className="vendor-rename-button-icon" />
                    Confirm Merge
                  </>
                )}
              </button>
            </div>
          </div>
        )}
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