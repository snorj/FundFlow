// frontend/src/components/categorization/CategorySelectorModal.js
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import TreeView from './TreeView';
import { transformCategoryData, calculateCategorySpendingTotals } from '../../utils/categoryTransformUtils';
import './CategorySelectorModal.css';
import { FiX } from 'react-icons/fi';

const CategorySelectorModal = ({
  // Core Modal Props
  isOpen,
  onClose,
  
  // Selection Configuration
  initialCategory = null, // New: allows pre-selection
  selectionMode = 'confirm', // New: 'immediate', 'confirm', 'none'
  onSelectCategory,
  
  // Data Management (backward compatibility)
  categories = [], // New: preferred prop name
  availableCategories = [], // Legacy: for backward compatibility
  onCategoriesUpdate, // Optional
  transactions = [], // New: transactions for TreeView
  
  // Feature Control
  showVendors = false, // New: control vendor display in tree
  showTransactions = false, // New: control transaction display in tree
  
  // UI Customization
  modalTitle = 'Select Category', // New: customizable title
  modalSize = 'md', // New: 'sm', 'md', 'lg'
  showConfirmationFooter = null, // New: auto-determined by selectionMode if null
  
  // Filtering & Display
  showSystemCategories = true, // New: control system categories display
  showUserCategories = true, // New: control user categories display
  
  // Legacy Props (for backward compatibility)
  currentSelectedId = null, // Legacy: mapped to initialCategory
  transaction = null, // Legacy: optional transaction context (unused in current impl)
}) => {
  
  // Normalize props for backward compatibility
  const normalizedCategories = categories.length > 0 ? categories : availableCategories;
  const normalizedInitialCategory = initialCategory || currentSelectedId;
  const normalizedShowFooter = showConfirmationFooter !== null ? showConfirmationFooter : (selectionMode === 'confirm');
  
  // State Management - Simplified structure
  const [selectionState, setSelectionState] = useState({
    selectedCategoryId: normalizedInitialCategory,
    pendingSelectionId: null, // Only used in 'confirm' mode
  });

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectionState({
        selectedCategoryId: normalizedInitialCategory,
        pendingSelectionId: selectionMode === 'confirm' ? normalizedInitialCategory : null,
      });
    }
  }, [isOpen, normalizedInitialCategory, selectionMode]);

  // Transform categories to tree format and calculate spending totals
  const processedData = useMemo(() => {
    // Keep both categories and vendors if showVendors is true
    let filtered = normalizedCategories.filter(item => {
      if (!item.type || item.type === 'category') return true;
      if (showVendors && item.type === 'vendor') return true;
      return false;
    });
    
    // Calculate spending totals if transactions are provided (only for categories)
    const categoriesOnly = filtered.filter(item => !item.type || item.type === 'category');
    const categorySpendingTotals = transactions.length > 0 
      ? calculateCategorySpendingTotals(transactions, categoriesOnly)
      : {};

    // Transform to tree format for TreeView
    const treeData = transformCategoryData(filtered, transactions, {
      includeVendors: showVendors,
      includeTransactions: showTransactions,
      showSystemCategories,
      showUserCategories,
      categorySpendingTotals
    });

    return {
      all: filtered,
      treeData,
      categorySpendingTotals,
      // Legacy compatibility
      systemRoot: filtered.filter(cat => !cat.parent && !cat.is_custom && showSystemCategories),
      userRoot: filtered.filter(cat => !cat.parent && cat.is_custom && showUserCategories),
    };
  }, [normalizedCategories, transactions, showVendors, showTransactions, showSystemCategories, showUserCategories]);

  // Selection handlers based on mode
  const handleNodeSelect = useCallback((categoryId) => {
    if (selectionMode === 'immediate') {
      // Immediate mode: select and notify parent immediately
      const selectedCategory = processedData.all.find(c => c.id === categoryId);
      setSelectionState(prev => ({ ...prev, selectedCategoryId: categoryId }));
      onSelectCategory(selectedCategory); // Pass the full category object for consistency
      onClose(); // Auto-close modal
    } else if (selectionMode === 'confirm') {
      // Confirm mode: set pending selection for confirmation
      setSelectionState(prev => ({ ...prev, pendingSelectionId: categoryId }));
    }
    // 'none' mode: no selection handling
  }, [selectionMode, onSelectCategory, onClose, processedData.all]);

  const handleConfirm = useCallback(() => {
    if (selectionMode === 'confirm' && selectionState.pendingSelectionId !== null) {
      // Find the full category object to pass to parent
      const selectedCategory = processedData.all.find(c => c.id === selectionState.pendingSelectionId);
      setSelectionState(prev => ({ ...prev, selectedCategoryId: prev.pendingSelectionId }));
      onSelectCategory(selectedCategory); // Pass the full category object for maximum flexibility
      onClose(); // Close modal after confirming
    }
  }, [selectionMode, selectionState.pendingSelectionId, onSelectCategory, processedData.all, onClose]);



  // TreeView-compatible category selection handler
  const handleCategorySelect = useCallback((categoryNode) => {
    if (categoryNode && categoryNode.type === 'category') {
      handleNodeSelect(categoryNode.id);
    }
  }, [handleNodeSelect]);

  if (!isOpen) return null;

  // Determine what to display as selected
  const displaySelectedId = selectionMode === 'confirm' 
    ? selectionState.pendingSelectionId 
    : selectionState.selectedCategoryId;
  
  const selectedCategory = processedData.all.find(c => c.id === displaySelectedId);
  const selectedCategoryName = selectedCategory ? selectedCategory.name : 'None';

  // Determine modal CSS classes
  const modalClasses = [
    'category-modal-content',
    `category-modal--${selectionMode}`,
    `category-modal--${modalSize}`,
    'category-modal--no-creation'
  ].join(' ');

  return (
    <div className="category-modal-overlay" onClick={onClose}>
      <div className={modalClasses} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <h2>{modalTitle}</h2>
          <button onClick={onClose} className="modal-close-button" aria-label="Close">
            <FiX />
          </button>
        </div>



        {/* Body */}
        <div className="modal-body">
          {selectionMode !== 'none' && (
            <p className="selection-preview">
              Selected: <strong>{selectedCategoryName}</strong>
            </p>
          )}
          
          <div className="category-tree-container">
            {processedData.treeData.length > 0 ? (
              <TreeView
                data={processedData.treeData}
                width={400}
                height={300}
                onCategorySelect={selectionMode !== 'none' ? handleCategorySelect : undefined}
                onCreateCategory={undefined} // No category creation allowed
                onDeleteCategory={undefined} // Don't allow deletion in modal
                isCreating={false}
                isDeleting={false}
                categorySpendingTotals={processedData.categorySpendingTotals}
                selectedCategoryId={displaySelectedId}
                showSpendingTotals={transactions.length > 0}
                enableSmartInteractions={selectionMode !== 'none'}
                enableDragAndDrop={false}
                className="category-selector-tree"
              />
            ) : (
              <p className="no-categories-message">No categories available.</p>
            )}
          </div>
        </div>

        {/* Footer - Only show if needed */}
        {normalizedShowFooter && (
          <div className="modal-footer">
            <button onClick={onClose} className="modal-button cancel">
              Cancel
            </button>
            <button 
              onClick={handleConfirm} 
              className="modal-button confirm" 
              disabled={
                selectionState.pendingSelectionId === normalizedInitialCategory || 
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

CategorySelectorModal.propTypes = {
  // Core Modal Props
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  
  // Selection Configuration
  initialCategory: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectionMode: PropTypes.oneOf(['immediate', 'confirm', 'none']),
  onSelectCategory: PropTypes.func.isRequired,
  
  // Data Management
  categories: PropTypes.array,
  availableCategories: PropTypes.array, // Legacy support
  onCategoriesUpdate: PropTypes.func,
  transactions: PropTypes.array, // New: transactions for TreeView
  
  // Feature Control
  showVendors: PropTypes.bool, // New: control vendor display
  showTransactions: PropTypes.bool, // New: control transaction display
  
  // UI Customization
  modalTitle: PropTypes.string,
  modalSize: PropTypes.oneOf(['sm', 'md', 'lg']),
  showConfirmationFooter: PropTypes.bool,
  
  // Filtering & Display
  showSystemCategories: PropTypes.bool,
  showUserCategories: PropTypes.bool,
  
  // Legacy Props (backward compatibility)
  currentSelectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  transaction: PropTypes.object, // Optional transaction context
};

export default CategorySelectorModal;