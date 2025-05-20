import React, { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
// FiTag for vendors, FiSave, FiXCircle, FiTrash2 for categories
import { FiChevronRight, FiChevronDown, FiPlusCircle, FiSave, FiXCircle, FiLoader, FiTrash2, FiTag } from 'react-icons/fi';

const CategoryTreeNode = ({
  item, // Renamed from category
  allItems, // Renamed from allCategories
  visibleItemIds, // Renamed from visibleCategoryIds
  level = 0,
  onSelectNode = () => {},
  pendingSelectionId = null,
  onCreateCategory, // For categories only
  onDeleteCategory, // For categories only
  isCreating, // Global flag for category creation
  isDeleting, // Is this specific ITEM (category) being deleted?
}) => {
  const [isExpanded, setIsExpanded] = useState(level < 1 && item.type === 'category'); // Only expand categories by default
  const [showAddInput, setShowAddInput] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [isSavingChild, setIsSavingChild] = useState(false);
  const [addChildError, setAddChildError] = useState(null);

  // Determine which children to display
  const displayChildren = useMemo(() => {
    if (item.type === 'vendor') return []; // Vendors don't have children in this model

    const potentialChildren = allItems.filter(child => child.parent === item.id);
    if (visibleItemIds === null) {
      return potentialChildren;
    }
    return potentialChildren.filter(child => visibleItemIds.has(child.id));
  }, [allItems, item.id, item.type, visibleItemIds]);

  const handleToggleExpand = (e) => { e.stopPropagation(); if (item.type === 'category') setIsExpanded(!isExpanded); };
  const handleSelect = () => { 
    // Selection might be relevant for vendors later (e.g. to edit mapping)
    // For now, only categories are selectable in the modal context. CategorisePage doesn't use onSelectNode.
    if (item.type === 'category') {
        onSelectNode(item.id); 
    }
    // If vendors need to be selectable for other purposes, adjust here.
  };

  const handleAddChildClick = (e) => {
     e.stopPropagation();
     if (item.type !== 'category') return;
     setShowAddInput(true);
     setNewChildName('');
     setAddChildError(null);
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
      e.stopPropagation();
      if (item.type !== 'category' || !newChildName.trim() || isSavingChild || isCreating || isDeleting) return;
      if (!onCreateCategory) return; // Should not happen if button is shown

      setIsSavingChild(true);
      setAddChildError(null);
      try {
          await onCreateCategory(newChildName.trim(), item.id);
          handleCancelAddChild();
      } catch (error) {
          console.error("Error saving child category:", error);
          setAddChildError(error.message || "Could not save category.");
      } finally {
          setIsSavingChild(false);
      }
  }

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (item.type !== 'category' || isDeleting || isCreating) return;
    if (!onDeleteCategory) return; // Should not happen if button is shown

    const confirmDelete = window.confirm(
      `Are you sure you want to delete the category "${item.name}"?\n\n` +
      `- Transactions in this category will become uncategorized.\n` +
      `- Sub-categories will be moved up one level.\n` +
      `- Mapping rules pointing to this category will be unassigned.`
    );
    if (confirmDelete) {
      onDeleteCategory(item.id);
    }
  };

  const isSelected = pendingSelectionId === item.id;
  const isDisabled = isCreating || isSavingChild || (item.type === 'category' && isDeleting); 
  // User-owned categories can be deleted/have children added.
  // item.user might be user ID for categories, or the parent category's user ID for vendors for consistency.
  // item.is_custom might be true for user categories and vendors.
  const isUserOwnedContext = item.user !== null && item.is_custom === true; 

  if (visibleItemIds !== null && !visibleItemIds.has(item.id)) {
    return null; 
  }

  return (
    <div className={`category-tree-node item-type-${item.type}`} style={{ paddingLeft: `${level * 20}px` }}>
      <div className={`node-content ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`} onClick={!isDisabled && item.type === 'category' ? handleSelect : undefined}>
        <span className="expand-icon" onClick={!isDisabled && item.type === 'category' ? handleToggleExpand : undefined}>
          {item.type === 'category' && displayChildren.length > 0 ? 
            (isExpanded ? <FiChevronDown size="14" /> : <FiChevronRight size="14" />) : 
            (<span className="spacer"></span>)
          }
        </span>
        
        {item.type === 'vendor' && <FiTag size="14" className="node-icon vendor-icon" title="Vendor/Merchant Rule"/>}
        <span className="node-name">{item.name}</span>
        
        {item.type === 'category' && (
          <div className="node-actions">
            {isUserOwnedContext && !isDeleting && (
              <button 
                className="action-button-icon delete-category-button" 
                title={`Delete category ${item.name}`}
                onClick={handleDeleteClick} 
                disabled={isDisabled}
              >
                <FiTrash2 size="14"/>
              </button>
            )}
            {isUserOwnedContext && isDeleting && (
              <FiLoader size="14" className="spinner-inline" title="Deleting..."/>
            )}
            {/* Add child button only for categories, isUserOwnedContext might also apply if system categories can't have user children */}
            {isUserOwnedContext && (
                 <button 
                    className="action-button-icon add-child-button" 
                    title={`Add sub-category to ${item.name}`} 
                    onClick={!isDisabled ? handleAddChildClick : undefined} 
                    disabled={isDisabled}
                >
            <FiPlusCircle size="14"/>
        </button>
            )}
          </div>
        )}
      </div>

      {item.type === 'category' && showAddInput && (
          <div className="add-child-input-area" style={{ paddingLeft: `${(level + 1) * 10}px` }}>
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

      {item.type === 'category' && isExpanded && displayChildren.length > 0 && (
        <div className="node-children">
          {displayChildren.map(childItem => (
            <CategoryTreeNode
              key={childItem.id}
              item={childItem} // Pass childItem as item
              allItems={allItems}
              visibleItemIds={visibleItemIds}
              level={level + 1}
              onSelectNode={onSelectNode}
              pendingSelectionId={pendingSelectionId}
              onCreateCategory={onCreateCategory} // Pass down for further nesting
              onDeleteCategory={onDeleteCategory} // Pass down for further nesting
              isCreating={isCreating} // Pass down global creating flag
              // isDeleting for child is true if deletingCategoryId matches childItem.id AND childItem.type is 'category'
              // The parent (CategorisePage) sets isDeleting only for the item directly being deleted.
              // So, we rely on the top-level isDeleting for the specific item.
              isDeleting={childItem.type === 'category' && onDeleteCategory ? isDeleting : false} 
              // This is tricky. The `isDeleting` prop is specific to THIS node instance. 
              // The parent passes `isDeleting={deletingCategoryId === item.id}`.
              // So, when rendering children, their `isDeleting` prop should be derived from parent state.
              // This should be `isDeleting={deletingCategoryIdFromParent === childItem.id}` which is what CategorisePage does.
              // The current `isDeleting` in this component refers to `item.id`.
              // For children, CategorisePage will pass the correct `isDeleting` based on `deletingCategoryId` state.
            />
          ))}
        </div>
      )}
    </div>
  );
};

CategoryTreeNode.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    parent: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), 
    user: PropTypes.number, // User ID or null for system categories
    is_custom: PropTypes.bool, // True for user categories and vendors
    type: PropTypes.oneOf(['category', 'vendor']).isRequired,
    // Vendors might have original_description, etc.
  }).isRequired,
  allItems: PropTypes.array.isRequired,
  visibleItemIds: PropTypes.instanceOf(Set), 
  level: PropTypes.number,
  onSelectNode: PropTypes.func,
  pendingSelectionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.oneOf([null])]),
  onCreateCategory: PropTypes.func, // Now optional, only used if item.type is category
  onDeleteCategory: PropTypes.func, // Now optional, only used if item.type is category
  isCreating: PropTypes.bool, 
  isDeleting: PropTypes.bool, // Is this specific item being deleted?
};

export default CategoryTreeNode;