import React, { useState, useMemo, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import './VendorSelectorModal.css';
import { FiX, FiPlus, FiLoader, FiSave, FiXCircle, FiSearch } from 'react-icons/fi';
import vendorService from '../../services/vendors';

const VendorSelectorModal = ({
  // Core Modal Props
  isOpen,
  onClose,
  
  // Selection Configuration
  initialVendor = null, // Pre-selected vendor
  selectionMode = 'confirm', // 'immediate', 'confirm', 'none'
  onSelectVendor,
  
  // Data Management
  vendors = [], // Pre-loaded vendors (optional)
  onVendorsUpdate, // Optional callback to refresh vendor list
  
  // Feature Control
  allowCreate = true, // Control vendor creation capability
  
  // UI Customization
  modalTitle = 'Select Vendor', // Customizable title
  modalSize = 'md', // 'sm', 'md', 'lg'
  showConfirmationFooter = null, // Auto-determined by selectionMode if null
  
  // Filtering & Display
  showSystemVendors = true, // Control system vendors display
  showUserVendors = true, // Control user vendors display
  
  // Search Configuration
  enableSearch = true, // Enable/disable search functionality
  placeholder = 'Search vendors...', // Search input placeholder
}) => {
  
  // Normalize props
  const normalizedShowFooter = showConfirmationFooter !== null ? showConfirmationFooter : (selectionMode === 'confirm');
  
  // State Management
  const [selectionState, setSelectionState] = useState({
    selectedVendorId: initialVendor?.id || null,
    pendingSelectionId: null, // Only used in 'confirm' mode
  });
  
  const [dataState, setDataState] = useState({
    vendors: vendors,
    loading: false,
    error: null,
  });
  
  const [searchState, setSearchState] = useState({
    searchTerm: '',
  });
  
  const [creationState, setCreationState] = useState({
    isCreating: false,
    showCreateInput: false,
    newVendorName: '',
    createError: null,
  });

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectionState({
        selectedVendorId: initialVendor?.id || null,
        pendingSelectionId: selectionMode === 'confirm' ? initialVendor?.id || null : null,
      });
      setSearchState({
        searchTerm: '',
      });
      setCreationState({
        isCreating: false,
        showCreateInput: false,
        newVendorName: '',
        createError: null,
      });
      
      // Fetch vendors if not pre-loaded
      if (vendors.length === 0) {
        fetchVendors();
      }
    }
  }, [isOpen, initialVendor, selectionMode, vendors.length]);

  // Fetch vendors from API
  const fetchVendors = useCallback(async () => {
    setDataState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const vendorData = await vendorService.getVendors();
      setDataState(prev => ({ 
        ...prev, 
        vendors: vendorData || [],
        loading: false 
      }));
    } catch (error) {
      console.error('Failed to fetch vendors:', error);
      setDataState(prev => ({ 
        ...prev, 
        error: error.message || 'Failed to load vendors',
        loading: false 
      }));
    }
  }, []);

  // Filter and organise vendors
  const processedVendors = useMemo(() => {
    const allVendors = dataState.vendors;
    
    // Apply search filter
    let filtered = allVendors;
    if (enableSearch && searchState.searchTerm.trim()) {
      const searchTerm = searchState.searchTerm.toLowerCase();
      filtered = allVendors.filter(vendor => 
        vendor.name.toLowerCase().includes(searchTerm)
      );
    }
    
    return {
      all: filtered,
      system: filtered.filter(vendor => vendor.is_system_vendor && showSystemVendors),
      user: filtered.filter(vendor => !vendor.is_system_vendor && showUserVendors),
    };
  }, [dataState.vendors, searchState.searchTerm, enableSearch, showSystemVendors, showUserVendors]);

  // Selection handlers based on mode
  const handleVendorSelect = useCallback((vendorId) => {
    const vendor = dataState.vendors.find(v => v.id === vendorId);
    
    if (selectionMode === 'immediate') {
      // Immediate mode: select and notify parent immediately
      setSelectionState(prev => ({ ...prev, selectedVendorId: vendorId }));
      onSelectVendor(vendor);
      onClose(); // Auto-close modal
    } else if (selectionMode === 'confirm') {
      // Confirm mode: set pending selection for confirmation
      setSelectionState(prev => ({ ...prev, pendingSelectionId: vendorId }));
    }
    // 'none' mode: no selection handling
  }, [selectionMode, onSelectVendor, onClose, dataState.vendors]);

  const handleConfirm = useCallback(() => {
    if (selectionMode === 'confirm' && selectionState.pendingSelectionId !== null) {
      const vendor = dataState.vendors.find(v => v.id === selectionState.pendingSelectionId);
      setSelectionState(prev => ({ ...prev, selectedVendorId: prev.pendingSelectionId }));
      onSelectVendor(vendor);
      onClose();
    }
  }, [selectionMode, selectionState.pendingSelectionId, onSelectVendor, onClose, dataState.vendors]);

  // Vendor creation handlers
  const handleCreateVendor = useCallback(async () => {
    if (!allowCreate || !creationState.newVendorName.trim()) return;
    
    setCreationState(prev => ({ ...prev, isCreating: true, createError: null }));
    
    try {
      const newVendorData = { name: creationState.newVendorName.trim() };
      const createdVendor = await vendorService.createVendor(newVendorData);
      
      // Update local vendor list
      setDataState(prev => ({
        ...prev,
        vendors: [...prev.vendors, createdVendor]
      }));
      
      // Refresh the vendor list if callback provided
      if (onVendorsUpdate) {
        const updatedVendorsData = await vendorService.getVendors();
        onVendorsUpdate(updatedVendorsData || []);
      }

      // Reset creation UI
      setCreationState(prev => ({
        ...prev,
        showCreateInput: false,
        newVendorName: '',
      }));

      // Auto-select newly created vendor in immediate mode
      if (selectionMode === 'immediate' && createdVendor) {
        handleVendorSelect(createdVendor.id);
      }

    } catch (error) {
      console.error("Failed to create vendor:", error);
      setCreationState(prev => ({
        ...prev,
        createError: error.message || "Failed to create vendor."
      }));
    } finally {
      setCreationState(prev => ({ ...prev, isCreating: false }));
    }
  }, [allowCreate, creationState.newVendorName, onVendorsUpdate, selectionMode, handleVendorSelect]);

  const handleShowCreateInput = useCallback(() => {
    if (!allowCreate) return;
    setCreationState(prev => ({
      ...prev,
      showCreateInput: true,
      newVendorName: '',
      createError: null,
    }));
  }, [allowCreate]);

  const handleCancelCreate = useCallback(() => {
    setCreationState(prev => ({
      ...prev,
      showCreateInput: false,
      newVendorName: '',
      createError: null,
    }));
  }, []);

  // Search handler
  const handleSearchChange = useCallback((event) => {
    setSearchState(prev => ({ ...prev, searchTerm: event.target.value }));
  }, []);

  if (!isOpen) return null;

  // Determine what to display as selected
  const displaySelectedId = selectionMode === 'confirm' 
    ? selectionState.pendingSelectionId 
    : selectionState.selectedVendorId;
  
  const selectedVendor = dataState.vendors.find(v => v.id === displaySelectedId);
  const selectedVendorName = selectedVendor ? selectedVendor.name : 'None';

  // Determine modal CSS classes
  const modalClasses = [
    'vendor-modal-content',
    `vendor-modal--${selectionMode}`,
    `vendor-modal--${modalSize}`,
    allowCreate ? 'vendor-modal--with-creation' : 'vendor-modal--no-creation'
  ].join(' ');

  return (
    <div className="vendor-modal-overlay" onClick={onClose}>
      <div className={modalClasses} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>{modalTitle}</h2>
          <button onClick={onClose} className="modal-close-button" aria-label="Close">
            <FiX />
          </button>
        </div>

        {/* Search Section */}
        {enableSearch && (
          <div className="modal-search">
            <div className="search-input-container">
              <FiSearch className="search-icon" />
              <input
                type="text"
                value={searchState.searchTerm}
                onChange={handleSearchChange}
                placeholder={placeholder}
                className="search-input"
              />
            </div>
          </div>
        )}

        {/* Create Vendor Section */}
        {allowCreate && (
          <div className="modal-actions-top">
            {!creationState.showCreateInput ? (
              <button 
                className="add-vendor-button" 
                onClick={handleShowCreateInput} 
                disabled={creationState.isCreating}
              >
                <FiPlus/> Add New Vendor
              </button>
            ) : (
              <div className="add-vendor-input-area">
                <input
                  type="text"
                  value={creationState.newVendorName}
                  onChange={(e) => setCreationState(prev => ({ ...prev, newVendorName: e.target.value }))}
                  placeholder="New vendor name..."
                  disabled={creationState.isCreating}
                  autoFocus
                />
                <button 
                  onClick={handleCreateVendor} 
                  disabled={!creationState.newVendorName.trim() || creationState.isCreating} 
                  title="Save"
                >
                  {creationState.isCreating ? <FiLoader size="14" className="spinner-inline"/> : <FiSave size="14"/>}
                </button>
                <button onClick={handleCancelCreate} disabled={creationState.isCreating} title="Cancel">
                  <FiXCircle size="14"/>
                </button>
              </div>
            )}
            {creationState.createError && (
              <p className="inline-error-text modal-error">{creationState.createError}</p>
            )}
          </div>
        )}

        {/* Body */}
        <div className="modal-body">
          {selectionMode !== 'none' && (
            <p className="selection-preview">
              Selected: <strong>{selectedVendorName}</strong>
            </p>
          )}
          
          <div className={`vendor-list-container ${creationState.isCreating ? 'disabled-list' : ''}`}>
            {dataState.loading ? (
              <div className="loading-container">
                <FiLoader className="spinner" />
                <p>Loading vendors...</p>
              </div>
            ) : dataState.error ? (
              <div className="error-container">
                <p className="error-message">{dataState.error}</p>
                <button onClick={fetchVendors} className="retry-button">
                  Try Again
                </button>
              </div>
            ) : (
              <>
                {/* System Vendors */}
                {showSystemVendors && processedVendors.system.length > 0 && (
                  <div className="vendor-section">
                    <h4>System Vendors</h4>
                    <div className="vendor-list">
                      {processedVendors.system.map(vendor => (
                        <div
                          key={vendor.id}
                          className={`vendor-item ${displaySelectedId === vendor.id ? 'selected' : ''}`}
                          onClick={() => selectionMode !== 'none' && handleVendorSelect(vendor.id)}
                        >
                          <span className="vendor-name">{vendor.name}</span>
                          <span className="vendor-type">System</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* User Vendors */}
                {showUserVendors && processedVendors.user.length > 0 && (
                  <div className="vendor-section">
                    <h4>My Vendors</h4>
                    <div className="vendor-list">
                      {processedVendors.user.map(vendor => (
                        <div
                          key={vendor.id}
                          className={`vendor-item ${displaySelectedId === vendor.id ? 'selected' : ''}`}
                          onClick={() => selectionMode !== 'none' && handleVendorSelect(vendor.id)}
                        >
                          <span className="vendor-name">{vendor.name}</span>
                          <span className="vendor-type">Custom</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {/* No vendors message */}
                {processedVendors.system.length === 0 && processedVendors.user.length === 0 && (
                  <p className="no-vendors-message">
                    {searchState.searchTerm ? 'No vendors found matching your search.' : 'No vendors available.'}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        {normalizedShowFooter && (
          <div className="modal-footer">
            <button onClick={onClose} className="modal-button cancel" disabled={creationState.isCreating}>
              Cancel
            </button>
            <button 
              onClick={handleConfirm} 
              className="modal-button confirm" 
              disabled={
                creationState.isCreating || 
                selectionState.pendingSelectionId === initialVendor?.id || 
                !selectionState.pendingSelectionId
              }
            >
              Confirm Selection
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

VendorSelectorModal.propTypes = {
  // Core Modal Props
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  
  // Selection Configuration
  initialVendor: PropTypes.object,
  selectionMode: PropTypes.oneOf(['immediate', 'confirm', 'none']),
  onSelectVendor: PropTypes.func.isRequired,
  
  // Data Management
  vendors: PropTypes.array,
  onVendorsUpdate: PropTypes.func,
  
  // Feature Control
  allowCreate: PropTypes.bool,
  
  // UI Customization
  modalTitle: PropTypes.string,
  modalSize: PropTypes.oneOf(['sm', 'md', 'lg']),
  showConfirmationFooter: PropTypes.bool,
  
  // Filtering & Display
  showSystemVendors: PropTypes.bool,
  showUserVendors: PropTypes.bool,
  
  // Search Configuration
  enableSearch: PropTypes.bool,
  placeholder: PropTypes.string,
};

export default VendorSelectorModal; 