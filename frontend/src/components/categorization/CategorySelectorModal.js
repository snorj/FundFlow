// frontend/src/components/categorization/CategorySelectorModal.js
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import CategoryTreeNode from './CategoryTreeNode';
import './CategorySelectorModal.css';
// --- Add FiSave, FiXCircle ---
import { FiX, FiPlus, FiLoader, FiSave, FiXCircle } from 'react-icons/fi';
import categoryService from '../../services/categories';
const CategorySelectorModal = ({
  isOpen,
  onClose,
  onSelectCategory,
  availableCategories = [], // Receive the *function* to update categories from parent
  onCategoriesUpdate, // Callback like: (newCategoryList) => { setAvailableCategories(newCategoryList) }
  currentSelectedId = null,
}) => {
  const [pendingSelectionId, setPendingSelectionId] = useState(currentSelectedId);
  // --- NEW: State for Top-Level Add ---
  const [showTopLevelInput, setShowTopLevelInput] = useState(false);
  const [newTopLevelName, setNewTopLevelName] = useState('');
  const [isCreating, setIsCreating] = useState(false); // Global creating state for modal
  const [createError, setCreateError] = useState(null);
  // --- End NEW ---

  useEffect(() => {
      if (isOpen) {
          setPendingSelectionId(currentSelectedId);
          setShowTopLevelInput(false); // Reset states on open
          setNewTopLevelName('');
          setCreateError(null);
      }
  }, [isOpen, currentSelectedId]);


  const systemRootCategories = useMemo(() => availableCategories.filter(cat => !cat.parent && !cat.is_custom), [availableCategories]);
  const userRootCategories = useMemo(() => availableCategories.filter(cat => !cat.parent && cat.is_custom), [availableCategories]);


  const handleNodeSelect = (categoryId) => { setPendingSelectionId(categoryId); };
  const handleConfirm = () => { onSelectCategory(pendingSelectionId); };


  // --- NEW: Category Creation Handler ---
  const handleCreateCategory = useCallback(async (name, parentId = null) => {
      console.log(`Modal: handleCreateCategory called with Name: ${name}, ParentID: ${parentId}`);
      setIsCreating(true);
      setCreateError(null);
      try {
          const newCategoryData = { name, parent: parentId };
          const createdCategory = await categoryService.createCategory(newCategoryData);
          console.log("Modal: Category created via API:", createdCategory);

          // Refresh the category list by fetching it again
          // Alternatively, just add the new one to the existing list for faster UI update
          // const updatedCategories = [...availableCategories, createdCategory];
          // onCategoriesUpdate(updatedCategories); // Call parent update function
          const categoriesData = await categoryService.getCategories();
          onCategoriesUpdate(categoriesData || []); // Update parent state


          // Reset top-level input if it was used
          setShowTopLevelInput(false);
          setNewTopLevelName('');

          // Potentially auto-select the newly created category?
          // setPendingSelectionId(createdCategory.id);

      } catch (error) {
          console.error("Modal: Failed to create category:", error);
          setCreateError(error.message || "Failed to create category.");
          // Re-throw error so node can catch it for inline errors
          throw error;
      } finally {
          setIsCreating(false);
      }
  }, [onCategoriesUpdate]); // Include callback in dependencies

  const handleAddTopLevelClick = () => {
      setShowTopLevelInput(true);
      setNewTopLevelName('');
      setCreateError(null);
  }
  const handleSaveTopLevel = () => {
       handleCreateCategory(newTopLevelName, null); // Call general handler with null parent
  }
  const handleCancelTopLevel = () => {
       setShowTopLevelInput(false);
       setNewTopLevelName('');
       setCreateError(null);
  }
  // --- End NEW ---

  if (!isOpen) { return null; }

  const pendingCategory = availableCategories.find(c => c.id === pendingSelectionId);
  const pendingCategoryName = pendingCategory ? pendingCategory.name : 'None';

  return (
    <div className="category-modal-overlay" onClick={onClose}>
      <div className="category-modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Select Category</h2>
          <button onClick={onClose} className="modal-close-button" aria-label="Close"><FiX /></button>
        </div>

        {/* --- Updated Top Actions --- */}
        <div className="modal-actions-top">
             {!showTopLevelInput ? (
                <button className="add-top-level-button" onClick={handleAddTopLevelClick} disabled={isCreating}>
                    <FiPlus/> Add Top-Level Category
                </button>
             ) : (
                 <div className="add-top-level-input-area">
                     <input
                         type="text"
                         value={newTopLevelName}
                         onChange={(e) => setNewTopLevelName(e.target.value)}
                         placeholder="New top-level category name..."
                         disabled={isCreating}
                         autoFocus
                     />
                     <button onClick={handleSaveTopLevel} disabled={!newTopLevelName.trim() || isCreating} title="Save">
                         {isCreating ? <FiLoader size="14" className="spinner-inline"/> : <FiSave size="14"/>}
                     </button>
                     <button onClick={handleCancelTopLevel} disabled={isCreating} title="Cancel">
                         <FiXCircle size="14"/>
                     </button>
                 </div>
             )}
             {/* Show general creation errors here */}
             {createError && <p className="inline-error-text modal-error">{createError}</p>}
        </div>
        {/* --- End Top Actions --- */}


        <div className="modal-body">
           <p className="selection-preview">Selected: <strong>{pendingCategoryName}</strong></p>
           <div className={`category-tree-container ${isCreating ? 'disabled-tree' : ''}`}> {/* Disable tree during create */}
             {/* Render System Root Nodes */}
             {systemRootCategories.map(rootCat => (
                 <CategoryTreeNode
                     key={rootCat.id} 
                     category={rootCat} 
                     allCategories={availableCategories}
                     visibleCategoryIds={null} // Explicitly pass null as no filter in modal
                     onSelectNode={handleNodeSelect} 
                     pendingSelectionId={pendingSelectionId}
                     onCreateCategory={handleCreateCategory} 
                     isCreating={isCreating}
                 />
             ))}
             {/* Render User Root Nodes */}
             {userRootCategories.map(rootCat => (
                 <CategoryTreeNode
                     key={rootCat.id} 
                     category={rootCat} 
                     allCategories={availableCategories}
                     visibleCategoryIds={null} // Explicitly pass null as no filter in modal
                     onSelectNode={handleNodeSelect} 
                     pendingSelectionId={pendingSelectionId}
                     onCreateCategory={handleCreateCategory} 
                     isCreating={isCreating}
                 />
             ))}
             {/* ... no categories message ... */}
           </div>
        </div>

        <div className="modal-footer">
          <button onClick={onClose} className="modal-button cancel" disabled={isCreating}>Cancel</button>
          <button onClick={handleConfirm} className="modal-button confirm" disabled={isCreating || pendingSelectionId === currentSelectedId}>
            Confirm Selection
          </button>
        </div>
      </div>
    </div>
  );
};

CategorySelectorModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSelectCategory: PropTypes.func.isRequired,
  availableCategories: PropTypes.array,
  onCategoriesUpdate: PropTypes.func.isRequired,
  currentSelectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.oneOf([null])]),
};

export default CategorySelectorModal;