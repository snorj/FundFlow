import React, { useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  FiChevronRight, 
  FiChevronDown, 
  FiFolder, 
  FiUser, 
  FiCreditCard,
  FiMove,
  FiPlus,
  FiTrash2,
  FiInfo,
  FiEdit3,
  FiMoreVertical,
  FiCheck,
  FiX,
  FiArrowDown,
  FiArrowRight,
  FiArrowUp
} from 'react-icons/fi';

// Enhanced search highlighting component
const HighlightText = ({ text, searchTerm }) => {
  if (!searchTerm) return text;
  
  const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  const parts = text.split(regex);
  
  return (
    <span>
      {parts.map((part, index) => 
        regex.test(part) ? (
          <mark key={index} className="search-highlight">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  );
};

// Move Destination Indicator Components
const MoveDestinationBefore = ({ targetNode, onMove }) => (
  <div className="move-destination move-destination-before" onClick={() => onMove(targetNode, 'before')}>
    <div className="move-destination-line"></div>
    <div className="move-destination-label">
      <FiArrowUp className="move-destination-icon" />
      <span>Move above "{targetNode.name}"</span>
    </div>
  </div>
);

const MoveDestinationAfter = ({ targetNode, onMove }) => (
  <div className="move-destination move-destination-after" onClick={() => onMove(targetNode, 'after')}>
    <div className="move-destination-line"></div>
    <div className="move-destination-label">
      <FiArrowDown className="move-destination-icon" />
      <span>Move below "{targetNode.name}"</span>
    </div>
  </div>
);

const MoveDestinationInside = ({ targetNode, onMove }) => (
  <div className="move-destination-inside-overlay" onClick={() => onMove(targetNode, 'inside')}>
    <div className="move-destination-inside-content">
      <FiArrowRight className="move-destination-icon" />
      <span>Move inside "{targetNode.name}"</span>
    </div>
  </div>
);

const TreeNode = ({
  node,
  level = 0,
  expanded = false,
  expandedNodes,
  onToggleExpand,
  onCategorySelect,
  onVendorSelect,
  onTransactionSelect,
  onTransactionInfo,
  onCategoryCreate,
  onCategoryDelete,
  onCategoryRename,
  onVendorEdit,
  selectedCategoryId,
  selectedVendorId,
  selectedTransactionId,
  deletingCategoryId,
  isCreating,
  searchTerm,
  bulkOperationMode,
  bulkSelectedIds,
  onBulkSelect,
  // Move mode props
  moveMode,
  onStartMove,
  onMoveToCategory
}) => {
  const ref = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [mouseDownTime, setMouseDownTime] = useState(null);
  const [mouseDownPosition, setMouseDownPosition] = useState(null);
  
  // Category editing state
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editedCategoryName, setEditedCategoryName] = useState('');
  const [categoryEditError, setCategoryEditError] = useState(null);
  
  // Context menu state
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ top: 0, left: 0 });
  
  // Animation state
  const [isCollapsing, setIsCollapsing] = useState(false);
  const [isExpanding, setIsExpanding] = useState(false);

  // Calculate derived values
  const hasChildren = node.children && node.children.length > 0;
  const indentWidth = level * 20;
  
  // Check if this node is a valid move destination
  const isValidMoveDestination = moveMode?.isActive && 
    moveMode.movingCategory && 
    node.type === 'category' &&
    !node.is_system &&
    node.id !== moveMode.movingCategory.id;

  // Check if this is the node being moved
  const isBeingMoved = moveMode?.isActive && 
    moveMode.movingCategory && 
    node.id === moveMode.movingCategory.id;

  // Smart click handler that doesn't interfere with move mode
  const handleMouseDown = (e) => {
    if (moveMode?.isActive) return; // Don't handle clicks in move mode
    setMouseDownTime(Date.now());
    setMouseDownPosition({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = (e) => {
    if (moveMode?.isActive) return; // Don't handle clicks in move mode
    if (!mouseDownTime || !mouseDownPosition) return;
    
    const clickDuration = Date.now() - mouseDownTime;
    const distance = Math.sqrt(
      Math.pow(e.clientX - mouseDownPosition.x, 2) + 
      Math.pow(e.clientY - mouseDownPosition.y, 2)
    );
    
    // Only treat as click if it was quick and didn't move much
    if (clickDuration < 300 && distance < 5) {
      handleClick();
    }
    
    setMouseDownTime(null);
    setMouseDownPosition(null);
  };

  const handleClick = () => {
    if (moveMode?.isActive) return; // Don't handle selection in move mode
    
    if (node.type === 'category') {
      onCategorySelect?.(node);
    } else if (node.type === 'vendor') {
      onVendorSelect?.(node);
    } else if (node.type === 'transaction') {
      onTransactionSelect?.(node);
    }
  };

  // Enhanced toggle with animations
  const handleToggle = (e) => {
    if (e) e.stopPropagation();
    
    if (expanded) {
      setIsCollapsing(true);
      setTimeout(() => {
        onToggleExpand?.(node.id);
        setIsCollapsing(false);
      }, 150);
    } else {
      setIsExpanding(true);
      onToggleExpand?.(node.id);
      setTimeout(() => setIsExpanding(false), 300);
    }
  };

  // Add click-outside handler for context menu
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (showContextMenu) {
        const isClickOnMenu = event.target.closest('.context-menu');
        const isClickOnButton = event.target.closest('.context-menu-button');
        
        if (!isClickOnMenu && !isClickOnButton) {
          setShowContextMenu(false);
        }
      }
    };

    if (showContextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [showContextMenu]);

  // All the existing handlers remain the same...
  const handleEditCategoryClick = (e) => {
    e?.stopPropagation();
    if (node.type !== 'category' || node.is_system) return;
    setEditedCategoryName(node.name);
    setIsEditingCategory(true);
    setCategoryEditError(null);
  };

  const handleSaveCategoryEdit = () => {
    if (!editedCategoryName.trim()) {
      setCategoryEditError('Category name cannot be empty');
      return;
    }

    if (editedCategoryName.trim() === node.name) {
      handleCancelCategoryEdit();
      return;
    }

    if (onCategoryRename) {
      onCategoryRename(node.id, editedCategoryName.trim())
        .then(() => {
          setIsEditingCategory(false);
          setEditedCategoryName('');
          setCategoryEditError(null);
        })
        .catch((error) => {
          setCategoryEditError(error.message || 'Failed to rename category');
        });
    }
  };

  const handleCancelCategoryEdit = () => {
    setIsEditingCategory(false);
    setEditedCategoryName('');
    setCategoryEditError(null);
  };

  const handleEditVendorClick = (e) => {
    e?.stopPropagation();
    if (node.type !== 'vendor') return;
    
    if (onVendorEdit) {
      onVendorEdit(node.name);
    }
  };

  const handleContextMenuClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!showContextMenu) {
      const buttonRect = e.currentTarget.getBoundingClientRect();
      const position = {
        top: buttonRect.bottom + window.scrollY,
        left: buttonRect.left + window.scrollX - 150 + buttonRect.width
      };
      
      if (position.left < 10) {
        position.left = 10;
      }
      if (position.top + 120 > window.innerHeight + window.scrollY) {
        position.top = buttonRect.top + window.scrollY - 120;
      }
      
      setContextMenuPosition(position);
    }
    
    setShowContextMenu(prev => !prev);
  };

  const handleContextMenuAction = (action) => {
    setShowContextMenu(false);
    
    switch (action) {
      case 'edit':
        if (node.type === 'category') {
          handleEditCategoryClick();
        } else if (node.type === 'vendor') {
          handleEditVendorClick();
        }
        break;
      case 'create':
        handleCreateCategory();
        break;
      case 'delete':
        handleDeleteCategory();
        break;
      case 'move':
        handleMoveClick();
        break;
      case 'info':
        if (node.type === 'vendor') {
          onVendorSelect?.(node);
        } else if (node.type === 'transaction') {
          handleTransactionInfo();
        }
        break;
      default:
        console.warn('Unknown context menu action:', action);
    }
  };

  const handleMoveClick = (e) => {
    e?.stopPropagation();
    if (node.type === 'category' && node.is_system) return;
    if (node.type !== 'category' && node.type !== 'vendor') return;
    onStartMove?.(node);
  };

  const handleCreateCategory = (e) => {
    e?.stopPropagation();
    setShowCreateInput(true);
  };

  const handleSaveNewCategory = () => {
    if (newCategoryName.trim()) {
      onCategoryCreate?.(newCategoryName.trim(), node.id);
      setNewCategoryName('');
      setShowCreateInput(false);
    }
  };

  const handleCancelNewCategory = () => {
    setNewCategoryName('');
    setShowCreateInput(false);
  };

  const handleDeleteCategory = (e) => {
    e?.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${node.name}"?`)) {
      onCategoryDelete?.(node.id);
    }
  };

  const handleTransactionInfo = (e) => {
    e?.stopPropagation();
    onTransactionInfo?.(node.originalTransaction || node);
  };

  const getIcon = () => {
    if (node.type === 'category') {
      return <FiFolder />;
    } else if (node.type === 'vendor') {
      return <FiUser />;
    } else if (node.type === 'transaction') {
      return <FiCreditCard />;
    }
    return null;
  };

  const getNodeClassName = () => {
    const classes = ['tree-node'];
    
    if (node.type === 'category' && selectedCategoryId === node.id) {
      classes.push('selected');
    } else if (node.type === 'vendor' && selectedVendorId === node.id) {
      classes.push('selected');
    } else if (node.type === 'transaction' && selectedTransactionId === node.id) {
      classes.push('selected');
    }
    
    if (isBeingMoved) classes.push('being-moved');
    if (isValidMoveDestination) classes.push('move-destination-node');
    if (deletingCategoryId === node.id) classes.push('deleting');
    
    // Add data attributes for styling
    classes.push(`data-type-${node.type}`);
    if (node.is_system) classes.push('data-system');
    
    return classes.join(' ');
  };

  const getContextMenuItems = () => {
    switch (node.type) {
      case 'category':
        if (node.is_system) return [];
        const items = [
          { id: 'edit', label: 'Rename', icon: <FiEdit3 /> },
          { id: 'create', label: 'Add Subcategory', icon: <FiPlus /> },
          { id: 'move', label: 'Move', icon: <FiMove /> },
          { id: 'delete', label: 'Delete', icon: <FiTrash2 /> }
        ];
        // Disable move option if already in move mode
        if (moveMode?.isActive) {
          return items.filter(item => item.id !== 'move');
        }
        return items;
      case 'vendor':
        const vendorItems = [
          { id: 'edit', label: 'Edit Vendor Name', icon: <FiEdit3 /> },
          { id: 'move', label: 'Move', icon: <FiMove /> },
          { id: 'info', label: 'View Transactions', icon: <FiInfo /> }
        ];
        // Disable move option if already in move mode
        if (moveMode?.isActive) {
          return vendorItems.filter(item => item.id !== 'move');
        }
        return vendorItems;
      case 'transaction':
        return [
          { id: 'info', label: 'View Details', icon: <FiInfo /> }
        ];
      default:
        return [];
    }
  };

  const contextMenuItems = getContextMenuItems();

  return (
    <React.Fragment>
      {/* Move destination before */}
      {isValidMoveDestination && (
        <MoveDestinationBefore 
          targetNode={node} 
          onMove={onMoveToCategory}
        />
      )}
      
      <div
        ref={ref}
        className={getNodeClassName()}
        style={{ paddingLeft: `${indentWidth}px` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        data-node-id={node.id}
        data-node-type={node.type}
        data-node-system={node.is_system}
      >
        {/* Move destination inside overlay */}
        {isValidMoveDestination && (
          <MoveDestinationInside 
            targetNode={node} 
            onMove={onMoveToCategory}
          />
        )}
        
        {/* Bulk selection checkbox */}
        {bulkOperationMode && node.type === 'category' && !node.is_system && (
          <div className="bulk-checkbox">
            <input
              type="checkbox"
              checked={bulkSelectedIds?.has(node.id) || false}
              onChange={(e) => onBulkSelect?.(node.id, e.target.checked)}
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}

        <div className="tree-node-content">
          {/* Expand/Collapse Toggle */}
          <div className="tree-node-toggle">
            {hasChildren ? (
              <button onClick={handleToggle} className="toggle-button">
                {expanded ? <FiChevronDown /> : <FiChevronRight />}
              </button>
            ) : (
              <div className="toggle-spacer" />
            )}
          </div>

          {/* Icon */}
          <div className="tree-node-icon">
            {getIcon()}
          </div>

          {/* Name or Edit Input */}
          <div className="tree-node-name">
            {isEditingCategory ? (
              <div className="category-edit-form">
                <input
                  type="text"
                  value={editedCategoryName}
                  onChange={(e) => setEditedCategoryName(e.target.value)}
                  className="category-edit-input"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveCategoryEdit();
                    if (e.key === 'Escape') handleCancelCategoryEdit();
                  }}
                />
                <div className="category-edit-actions">
                  <button 
                    onClick={handleSaveCategoryEdit}
                    disabled={!editedCategoryName.trim()}
                    className="category-save-button"
                    title="Save"
                  >
                    <FiCheck size="12" />
                  </button>
                  <button 
                    onClick={handleCancelCategoryEdit}
                    className="category-cancel-button"
                    title="Cancel"
                  >
                    <FiX size="12" />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <HighlightText text={node.name} searchTerm={searchTerm} />
                {node.type === 'vendor' && node.transactionCount && (
                  <span className="transaction-count">
                    ({node.transactionCount})
                  </span>
                )}
                {node.type === 'transaction' && node.amount && (
                  <span className="transaction-amount">
                    ${Math.abs(node.amount).toFixed(2)}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          {(isHovered || showContextMenu) && !isEditingCategory && contextMenuItems.length > 0 && !moveMode?.isActive && (
            <div className="tree-node-actions">
              <div className="context-menu-container">
                <button
                  onClick={handleContextMenuClick}
                  className="context-menu-button"
                  title="More actions"
                >
                  <FiMoreVertical />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Category editing error */}
      {isEditingCategory && categoryEditError && (
        <div className="category-edit-error" style={{ paddingLeft: `${(level + 1) * 20}px` }}>
          {categoryEditError}
        </div>
      )}

      {/* Move destination after */}
      {isValidMoveDestination && (
        <MoveDestinationAfter 
          targetNode={node} 
          onMove={onMoveToCategory}
        />
      )}

      {/* Create new category input */}
      {showCreateInput && (
        <div
          className="tree-node create-input"
          style={{ paddingLeft: `${(level + 1) * 20}px` }}
        >
          <div className="tree-node-content">
            <div className="tree-node-toggle">
              <div className="toggle-spacer" />
            </div>
            <div className="tree-node-icon">
              <FiFolder />
            </div>
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleSaveNewCategory();
                } else if (e.key === 'Escape') {
                  handleCancelNewCategory();
                }
              }}
              placeholder="Category name..."
              className="category-input"
              autoFocus
            />
            <div className="tree-node-actions">
              <button onClick={handleSaveNewCategory} className="action-button">
                ✓
              </button>
              <button onClick={handleCancelNewCategory} className="action-button">
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      {expanded && hasChildren && (
        <div className={`tree-node-children ${isExpanding ? 'expanding' : ''} ${isCollapsing ? 'collapsing' : ''}`}>
          {node.children.map(child => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              expanded={expandedNodes?.has ? expandedNodes.has(child.id) : false}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
              onCategorySelect={onCategorySelect}
              onVendorSelect={onVendorSelect}
              onTransactionSelect={onTransactionSelect}
              onTransactionInfo={onTransactionInfo}
              onCategoryCreate={onCategoryCreate}
              onCategoryDelete={onCategoryDelete}
              onCategoryRename={onCategoryRename}
              onVendorEdit={onVendorEdit}
              selectedCategoryId={selectedCategoryId}
              selectedVendorId={selectedVendorId}
              selectedTransactionId={selectedTransactionId}
              deletingCategoryId={deletingCategoryId}
              isCreating={isCreating}
              searchTerm={searchTerm}
              bulkOperationMode={bulkOperationMode}
              bulkSelectedIds={bulkSelectedIds}
              onBulkSelect={onBulkSelect}
              // Move mode props
              moveMode={moveMode}
              onStartMove={onStartMove}
              onMoveToCategory={onMoveToCategory}
            />
          ))}
        </div>
      )}

      {/* Portal-based context menu */}
      {showContextMenu && createPortal(
        <div 
          className="context-menu"
          style={{ top: contextMenuPosition.top, left: contextMenuPosition.left }}
        >
          {contextMenuItems.map(item => (
            <button
              key={item.id}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleContextMenuAction(item.id);
              }}
              className="context-menu-item"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </React.Fragment>
  );
};

export default TreeNode; 