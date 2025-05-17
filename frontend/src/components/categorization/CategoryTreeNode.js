import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
// --- Add FiSave, FiXCircle, FiTrash2 ---
import { FiChevronRight, FiChevronDown, FiPlusCircle, FiSave, FiXCircle, FiLoader, FiTrash2 } from 'react-icons/fi';

const CategoryTreeNode = ({
  category,
  allCategories,
  visibleCategoryIds,
  level = 0,
  onSelectNode = () => {},
  pendingSelectionId = null,
  // --- NEW PROP: Handler for creating category ---
  onCreateCategory, // Expects function like: async (name, parentId) => { /* API call & refresh */ }
  onDeleteCategory, // NEW: Handler for deleting a category
  isCreating, // Flag from parent indicating a creation is in progress globally
  isDeleting, // NEW: Flag from parent indicating a delete is in progress for THIS category
}) => {
  const [isExpanded, setIsExpanded] = useState(level < 1);
  // --- NEW State for inline adding ---
  const [showAddInput, setShowAddInput] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [isSavingChild, setIsSavingChild] = useState(false); // Local saving state
  const [addChildError, setAddChildError] = useState(null);
  // --- End New State ---

  // Determine which children to display
  const displayChildren = useMemo(() => {
    const potentialChildren = allCategories.filter(c => c.parent === category.id);
    if (visibleCategoryIds === null) {
      // No search filter active, show all potential children
      return potentialChildren;
    }
    // Search filter active, only show children that are in the visible set
    return potentialChildren.filter(child => visibleCategoryIds.has(child.id));
  }, [allCategories, category.id, visibleCategoryIds]);

  const handleToggleExpand = (e) => { e.stopPropagation(); setIsExpanded(!isExpanded); };
  const handleSelect = () => { onSelectNode(category.id); };

  const handleAddChildClick = (e) => {
     e.stopPropagation();
     setShowAddInput(true); // Show the input field below this node
     setNewChildName(''); // Reset name
     setAddChildError(null); // Clear errors
  }

  const handleCancelAddChild = () => {
      setShowAddInput(false);
      setNewChildName('');
      setAddChildError(null);
  }

  const handleNewChildNameChange = (e) => {
      setNewChildName(e.target.value);
      setAddChildError(null);
  }

  const handleSaveNewChild = async (e) => {
      e.stopPropagation(); // Prevent node selection
      if (!newChildName.trim() || isSavingChild || isCreating || isDeleting) return; // Prevent empty/double submit

      setIsSavingChild(true);
      setAddChildError(null);
      try {
          // Call the creation handler passed from the modal
          await onCreateCategory(newChildName.trim(), category.id); // Pass name and *this* node's ID as parent
          // Success! Clear fields and hide input. Parent handles refresh.
          handleCancelAddChild();
      } catch (error) {
          console.error("Error saving child category:", error);
          setAddChildError(error.message || "Could not save category.");
      } finally {
          setIsSavingChild(false);
      }
  }

  // --- NEW: Delete Handler ---
  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (isDeleting || isCreating) return;
    // Confirmation dialog
    const confirmDelete = window.confirm(
      `Are you sure you want to delete the category "${category.name}"?\n\n` +
      `- Transactions in this category will become uncategorized.\n` +
      `- Sub-categories will be moved up one level.\n` +
      `- Mapping rules pointing to this category will be unassigned.`
    );
    if (confirmDelete) {
      onDeleteCategory(category.id);
    }
  };
  // --- END NEW ---

  const isSelected = pendingSelectionId === category.id;
  // Disable interactions if a global creation/save is happening
  const isDisabled = isCreating || isSavingChild || isDeleting;
  const isUserCategory = category.user !== null; // Check if it's a user-owned category

  // If a search is active and this node itself is not in visibleCategoryIds, don't render it.
  // This check is actually primarily handled by the parent (CategorisePage) when it decides which root nodes to render.
  // However, this component should not render if, for some reason, it receives a category not in the visible set
  // when a filter is active. This acts as a safeguard, though typically CategorisePage won't call it.
  if (visibleCategoryIds !== null && !visibleCategoryIds.has(category.id)) {
    return null; 
  }

  return (
    <div className="category-tree-node" style={{ paddingLeft: `${level * 20}px` }}>
      <div className={`node-content ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`} onClick={!isDisabled ? handleSelect : undefined}>
        <span className="expand-icon" onClick={!isDisabled ? handleToggleExpand : undefined}>
          {/* Show expand icon only if there are children to display based on the filter */}
          {displayChildren.length > 0 ? ( isExpanded ? <FiChevronDown size="14" /> : <FiChevronRight size="14" /> ) : ( <span className="spacer"></span> )}
        </span>
        <span className="node-name">{category.name}</span>
        <div className="node-actions">
          {isUserCategory && !isDeleting && (
            <button 
              className="action-button-icon delete-category-button" 
              title={`Delete category ${category.name}`}
              onClick={handleDeleteClick} 
              disabled={isDisabled}
            >
              <FiTrash2 size="14"/>
            </button>
          )}
          {isUserCategory && isDeleting && (
            <FiLoader size="14" className="spinner-inline" title="Deleting..."/>
          )}
          <button 
            className="action-button-icon add-child-button" 
            title={`Add sub-category to ${category.name}`} 
            onClick={!isDisabled ? handleAddChildClick : undefined} 
            disabled={isDisabled}
          >
            <FiPlusCircle size="14"/>
          </button>
        </div>
      </div>

      {/* --- Inline Add Input Area --- */}
      {showAddInput && (
          <div className="add-child-input-area" style={{ paddingLeft: `${(level + 1) * 10}px` }}> {/* Indent slightly more */}
              <input
                  type="text"
                  value={newChildName}
                  onChange={handleNewChildNameChange}
                  placeholder="New sub-category name..."
                  disabled={isSavingChild || isCreating || isDeleting}
                  autoFocus
              />
              <button onClick={handleSaveNewChild} disabled={!newChildName.trim() || isSavingChild || isCreating || isDeleting} title="Save">
                  {isSavingChild ? <FiLoader size="14" className="spinner-inline"/> : <FiSave size="14"/>}
              </button>
              <button onClick={handleCancelAddChild} disabled={isSavingChild || isCreating || isDeleting} title="Cancel">
                  <FiXCircle size="14"/>
              </button>
              {addChildError && <span className="inline-error-text">{addChildError}</span>}
          </div>
      )}
      {/* --- End Inline Add --- */}

      {isExpanded && displayChildren.length > 0 && (
        <div className="node-children">
          {displayChildren.map(child => (
            <CategoryTreeNode
              key={child.id}
              category={child}
              allCategories={allCategories}
              visibleCategoryIds={visibleCategoryIds}
              level={level + 1}
              onSelectNode={onSelectNode}
              pendingSelectionId={pendingSelectionId}
              onCreateCategory={onCreateCategory}
              onDeleteCategory={onDeleteCategory}
              isCreating={isCreating}
              isDeleting={isDeleting}
            />
          ))}
        </div>
      )}
    </div>
  );
};

CategoryTreeNode.propTypes = {
  category: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    parent: PropTypes.number, // null or number
    user: PropTypes.number, // null or number
  }).isRequired,
  allCategories: PropTypes.array.isRequired,
  visibleCategoryIds: PropTypes.instanceOf(Set), // Can be a Set or null
  level: PropTypes.number,
  onSelectNode: PropTypes.func, // Made optional for CategorisePage context
  pendingSelectionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.oneOf([null])]),
  // onInitiateAddChild: PropTypes.func.isRequired,
  onCreateCategory: PropTypes.func.isRequired, // Add new prop type
  onDeleteCategory: PropTypes.func.isRequired, // Added onDeleteCategory prop type
  isCreating: PropTypes.bool, // Add new prop type
  isDeleting: PropTypes.bool, // Added isDeleting prop type (for this specific node)
};

export default CategoryTreeNode;