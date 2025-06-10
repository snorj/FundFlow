// frontend/src/components/categorization/CategorySelectorModal.js
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import CategoryTreeNode from './CategoryTreeNode';
import './CategorySelectorModal.css';
// --- Add FiSave, FiXCircle ---
import { FiX, FiPlus, FiLoader, FiSave, FiXCircle } from 'react-icons/fi';
import categoryService from '../../services/categories';

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
  
  // Feature Control
  allowCreate = true, // New: control creation capability
  
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
  
  const [creationState, setCreationState] = useState({
    isCreating: false,
    showTopLevelInput: false,
    newTopLevelName: '',
    createError: null,
  });

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectionState({
        selectedCategoryId: normalizedInitialCategory,
        pendingSelectionId: selectionMode === 'confirm' ? normalizedInitialCategory : null,
      });
      setCreationState({
        isCreating: false,
        showTopLevelInput: false,
        newTopLevelName: '',
        createError: null,
      });
    }
  }, [isOpen, normalizedInitialCategory, selectionMode]);

  // Filter and organize categories
  const processedCategories = useMemo(() => {
    let filtered = normalizedCategories.filter(item => !item.type || item.type === 'category');
    
    return {
      all: filtered,
      systemRoot: filtered.filter(cat => !cat.parent && !cat.is_custom && showSystemCategories),
      userRoot: filtered.filter(cat => !cat.parent && cat.is_custom && showUserCategories),
    };
  }, [normalizedCategories, showSystemCategories, showUserCategories]);

  // Selection handlers based on mode
  const handleNodeSelect = useCallback((categoryId) => {
    if (selectionMode === 'immediate') {
      // Immediate mode: select and notify parent immediately
      const selectedCategory = processedCategories.all.find(c => c.id === categoryId);
      setSelectionState(prev => ({ ...prev, selectedCategoryId: categoryId }));
      onSelectCategory(selectedCategory); // Pass the full category object for consistency
      onClose(); // Auto-close modal
    } else if (selectionMode === 'confirm') {
      // Confirm mode: set pending selection for confirmation
      setSelectionState(prev => ({ ...prev, pendingSelectionId: categoryId }));
    }
    // 'none' mode: no selection handling
  }, [selectionMode, onSelectCategory, onClose, processedCategories.all]);

  const handleConfirm = useCallback(() => {
    if (selectionMode === 'confirm' && selectionState.pendingSelectionId !== null) {
      // Find the full category object to pass to parent
      const selectedCategory = processedCategories.all.find(c => c.id === selectionState.pendingSelectionId);
      setSelectionState(prev => ({ ...prev, selectedCategoryId: prev.pendingSelectionId }));
      onSelectCategory(selectedCategory); // Pass the full category object for maximum flexibility
      onClose(); // Close modal after confirming
    }
  }, [selectionMode, selectionState.pendingSelectionId, onSelectCategory, processedCategories.all, onClose]);

  // Category creation handler
  const handleCreateCategory = useCallback(async (name, parentId = null) => {
    if (!allowCreate) return;
    
    console.log(`Modal: handleCreateCategory called with Name: ${name}, ParentID: ${parentId}`);
    setCreationState(prev => ({ ...prev, isCreating: true, createError: null }));
    
    try {
      const newCategoryData = { name, parent: parentId };
      const createdCategory = await categoryService.createCategory(newCategoryData);
      console.log("Modal: Category created via API:", createdCategory);

      // Refresh the category list if callback provided
      if (onCategoriesUpdate) {
        const updatedCategoriesData = await categoryService.getCategories();
        onCategoriesUpdate(updatedCategoriesData || []);
      }

      // Reset creation UI
      setCreationState(prev => ({
        ...prev,
        showTopLevelInput: false,
        newTopLevelName: '',
      }));

      // Auto-select newly created category in immediate mode
      if (selectionMode === 'immediate' && createdCategory) {
        handleNodeSelect(createdCategory.id);
      }

    } catch (error) {
      console.error("Modal: Failed to create category:", error);
      setCreationState(prev => ({
        ...prev,
        createError: error.message || "Failed to create category."
      }));
      throw error;
    } finally {
      setCreationState(prev => ({ ...prev, isCreating: false }));
    }
  }, [allowCreate, onCategoriesUpdate, selectionMode, handleNodeSelect]);

  // Top-level creation handlers
  const handleAddTopLevelClick = useCallback(() => {
    if (!allowCreate) return;
    setCreationState(prev => ({
      ...prev,
      showTopLevelInput: true,
      newTopLevelName: '',
      createError: null,
    }));
  }, [allowCreate]);

  const handleSaveTopLevel = useCallback(() => {
    if (creationState.newTopLevelName.trim()) {
      handleCreateCategory(creationState.newTopLevelName.trim(), null);
    }
  }, [creationState.newTopLevelName, handleCreateCategory]);

  const handleCancelTopLevel = useCallback(() => {
    setCreationState(prev => ({
      ...prev,
      showTopLevelInput: false,
      newTopLevelName: '',
      createError: null,
    }));
  }, []);

  if (!isOpen) return null;

  // Determine what to display as selected
  const displaySelectedId = selectionMode === 'confirm' 
    ? selectionState.pendingSelectionId 
    : selectionState.selectedCategoryId;
  
  const selectedCategory = processedCategories.all.find(c => c.id === displaySelectedId);
  const selectedCategoryName = selectedCategory ? selectedCategory.name : 'None';

  // Determine modal CSS classes
  const modalClasses = [
    'category-modal-content',
    `category-modal--${selectionMode}`,
    `category-modal--${modalSize}`,
    allowCreate ? 'category-modal--with-creation' : 'category-modal--no-creation'
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

        {/* Top Actions - Only show if creation is allowed */}
        {allowCreate && (
          <div className="modal-actions-top">
            {!creationState.showTopLevelInput ? (
              <button 
                className="add-top-level-button" 
                onClick={handleAddTopLevelClick} 
                disabled={creationState.isCreating}
              >
                <FiPlus/> Add Top-Level Category
              </button>
            ) : (
              <div className="add-top-level-input-area">
                <input
                  type="text"
                  value={creationState.newTopLevelName}
                  onChange={(e) => setCreationState(prev => ({ ...prev, newTopLevelName: e.target.value }))}
                  placeholder="New top-level category name..."
                  disabled={creationState.isCreating}
                  autoFocus
                />
                <button 
                  onClick={handleSaveTopLevel} 
                  disabled={!creationState.newTopLevelName.trim() || creationState.isCreating} 
                  title="Save"
                >
                  {creationState.isCreating ? <FiLoader size="14" className="spinner-inline"/> : <FiSave size="14"/>}
                </button>
                <button onClick={handleCancelTopLevel} disabled={creationState.isCreating} title="Cancel">
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
              Selected: <strong>{selectedCategoryName}</strong>
            </p>
          )}
          
          <div className={`category-tree-container ${creationState.isCreating ? 'disabled-tree' : ''}`}>
            {/* System Categories */}
            {showSystemCategories && processedCategories.systemRoot.length > 0 && (
              <div className="tree-section">
                <h4>System Categories</h4>
                {processedCategories.systemRoot.map(rootCat => (
                  <CategoryTreeNode
                    key={rootCat.id} 
                    item={rootCat} 
                    allItems={processedCategories.all}
                    visibleItemIds={null}
                    onSelectNode={selectionMode !== 'none' ? handleNodeSelect : () => {}} 
                    pendingSelectionId={displaySelectedId}
                    onCreateCategory={allowCreate ? handleCreateCategory : null}
                    isCreating={creationState.isCreating}
                  />
                ))}
              </div>
            )}
            
            {/* User Categories */}
            {showUserCategories && processedCategories.userRoot.length > 0 && (
              <div className="tree-section">
                <h4>Custom Categories</h4>
                {processedCategories.userRoot.map(rootCat => (
                  <CategoryTreeNode
                    key={rootCat.id} 
                    item={rootCat} 
                    allItems={processedCategories.all}
                    visibleItemIds={null}
                    onSelectNode={selectionMode !== 'none' ? handleNodeSelect : () => {}} 
                    pendingSelectionId={displaySelectedId}
                    onCreateCategory={allowCreate ? handleCreateCategory : null} 
                    isCreating={creationState.isCreating}
                  />
                ))}
              </div>
            )}
            
            {/* No categories message */}
            {processedCategories.systemRoot.length === 0 && processedCategories.userRoot.length === 0 && (
              <p className="no-categories-message">No categories available.</p>
            )}
          </div>
        </div>

        {/* Footer - Only show if needed */}
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
  
  // Feature Control
  allowCreate: PropTypes.bool,
  
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