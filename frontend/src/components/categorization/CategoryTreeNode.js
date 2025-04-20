import React, { useState } from 'react';
import PropTypes from 'prop-types';
// --- Add FiSave, FiXCircle ---
import { FiChevronRight, FiChevronDown, FiPlusCircle, FiSave, FiXCircle, FiLoader } from 'react-icons/fi';

const CategoryTreeNode = ({
  category,
  allCategories,
  level = 0,
  onSelectNode,
  pendingSelectionId,
  // --- NEW PROP: Handler for creating category ---
  onCreateCategory, // Expects function like: async (name, parentId) => { /* API call & refresh */ }
  isCreating, // Flag from parent indicating a creation is in progress globally
}) => {
  const [isExpanded, setIsExpanded] = useState(level < 1);
  // --- NEW State for inline adding ---
  const [showAddInput, setShowAddInput] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [isSavingChild, setIsSavingChild] = useState(false); // Local saving state
  const [addChildError, setAddChildError] = useState(null);
  // --- End New State ---

  const children = allCategories.filter(c => c.parent === category.id);

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
      if (!newChildName.trim() || isSavingChild || isCreating) return; // Prevent empty/double submit

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


  const isSelected = pendingSelectionId === category.id;
  // Disable interactions if a global creation/save is happening
  const isDisabled = isCreating || isSavingChild;

  return (
    <div className="category-tree-node" style={{ paddingLeft: `${level * 20}px` }}>
      <div className={`node-content ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`} onClick={!isDisabled ? handleSelect : undefined}>
        <span className="expand-icon" onClick={!isDisabled ? handleToggleExpand : undefined}>
          {children.length > 0 ? ( isExpanded ? <FiChevronDown size="14" /> : <FiChevronRight size="14" /> ) : ( <span className="spacer"></span> )}
        </span>
        <span className="node-name">{category.name}</span>
        <button className="add-child-button" title={`Add sub-category to ${category.name}`} onClick={!isDisabled ? handleAddChildClick : undefined} disabled={isDisabled}>
            <FiPlusCircle size="14"/>
        </button>
      </div>

      {/* --- Inline Add Input Area --- */}
      {showAddInput && (
          <div className="add-child-input-area" style={{ paddingLeft: `${(level + 1) * 10}px` }}> {/* Indent slightly more */}
              <input
                  type="text"
                  value={newChildName}
                  onChange={handleNewChildNameChange}
                  placeholder="New sub-category name..."
                  disabled={isSavingChild || isCreating}
                  autoFocus
              />
              <button onClick={handleSaveNewChild} disabled={!newChildName.trim() || isSavingChild || isCreating} title="Save">
                  {isSavingChild ? <FiLoader size="14" className="spinner-inline"/> : <FiSave size="14"/>}
              </button>
              <button onClick={handleCancelAddChild} disabled={isSavingChild || isCreating} title="Cancel">
                  <FiXCircle size="14"/>
              </button>
              {addChildError && <span className="inline-error-text">{addChildError}</span>}
          </div>
      )}
      {/* --- End Inline Add --- */}


      {isExpanded && children.length > 0 && (
        <div className="node-children">
          {children.map(child => (
            <CategoryTreeNode
              key={child.id}
              category={child}
              allCategories={allCategories}
              level={level + 1}
              onSelectNode={onSelectNode}
              pendingSelectionId={pendingSelectionId}
              onCreateCategory={onCreateCategory} // Pass handler down
              isCreating={isCreating} // Pass global loading state down
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
  level: PropTypes.number,
  onSelectNode: PropTypes.func.isRequired,
  pendingSelectionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.oneOf([null])]),
  // onInitiateAddChild: PropTypes.func.isRequired,
  onCreateCategory: PropTypes.func.isRequired, // Add new prop type
  isCreating: PropTypes.bool, // Add new prop type
};

export default CategoryTreeNode;