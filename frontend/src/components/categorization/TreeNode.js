import React, { useRef, useState, useCallback } from 'react';
import { useDrag, useDrop } from 'react-dnd';
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
  FiX
} from 'react-icons/fi';

const ItemTypes = {
  CATEGORY: 'category',
  VENDOR: 'vendor',
  TRANSACTION: 'transaction'
};

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
  onVendorEdit, // Add vendor editing prop
  onDrop,
  onDragStart,
  onDragEnd,
  selectedCategoryId,
  selectedVendorId,
  selectedTransactionId,
  deletingCategoryId,
  isCreating,
  draggedItem,
  searchTerm
}) => {
  const ref = useRef(null);
  const [isHovered, setIsHovered] = useState(false);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [dropPosition, setDropPosition] = useState(null);
  const [mouseDownTime, setMouseDownTime] = useState(null);
  const [mouseDownPosition, setMouseDownPosition] = useState(null);
  
  // Category editing state
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editedCategoryName, setEditedCategoryName] = useState('');
  const [categoryEditError, setCategoryEditError] = useState(null);
  
  // Context menu state
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPosition, setContextMenuPosition] = useState({ top: 0, left: 0 });

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

  // Drag functionality (only for categories)
  const [{ isDragging }, drag] = useDrag({
    type: ItemTypes.CATEGORY,
    item: () => {
      onDragStart?.(node);
      return { id: node.id, type: node.type, node };
    },
    end: () => {
      onDragEnd?.();
    },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
    canDrag: () => {
      // Only categories (not system) can be dragged
      return node.type === 'category' && !node.is_system;
    }
  });

  // Drop functionality - enhanced to support multiple drop positions
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ItemTypes.CATEGORY,
    hover: (item, monitor) => {
      if (!ref.current) return;
      
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      
      // Determine drop position based on hover location
      if (hoverClientY < hoverMiddleY * 0.3) {
        setDropPosition('before');
      } else if (hoverClientY > hoverMiddleY * 1.7) {
        setDropPosition('after');
      } else {
        setDropPosition('inside');
      }
    },
    drop: (item, monitor) => {
      if (!monitor.didDrop()) {
        onDrop?.(item.node, node, dropPosition);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
    canDrop: (item) => {
      // Can't drop on self
      if (item.id === node.id) return false;
      
      // Can only drop categories
      if (item.type !== 'category') return false;
      
      // For 'inside' drops, target must be a category and not system
      if (node.type !== 'category' || node.is_system) {
        // But allow 'before' and 'after' drops if the parent allows it
        return level > 0;
      }
      
      return true;
    }
  });

  // Combine drag and drop refs
  const dragDropRef = drag(drop(ref));

  // Smart click handler that doesn't interfere with drag
  const handleMouseDown = (e) => {
    setMouseDownTime(Date.now());
    setMouseDownPosition({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = (e) => {
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
    if (node.type === 'category') {
      onCategorySelect?.(node);
    } else if (node.type === 'vendor') {
      onVendorSelect?.(node);
    } else if (node.type === 'transaction') {
      onTransactionSelect?.(node);
    }
  };

  const handleToggle = (e) => {
    e.stopPropagation();
    onToggleExpand?.(node.id);
  };

  // Category editing handlers
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

  // Vendor editing handler
  const handleEditVendorClick = (e) => {
    e?.stopPropagation();
    if (node.type !== 'vendor') return;
    
    // Call the parent's onVendorEdit handler with the vendor name
    if (onVendorEdit) {
      onVendorEdit(node.name);
    }
  };

  // Context menu handlers
  const handleContextMenuClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!showContextMenu) {
      // Calculate position for fixed positioning
      const buttonRect = e.currentTarget.getBoundingClientRect();
      const position = {
        top: buttonRect.bottom + window.scrollY,
        left: buttonRect.left + window.scrollX - 150 + buttonRect.width // Align right edge
      };
      
      // Ensure menu doesn't go off-screen
      if (position.left < 10) {
        position.left = 10;
      }
      if (position.top + 120 > window.innerHeight + window.scrollY) {
        position.top = buttonRect.top + window.scrollY - 120; // Show above button
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
    
    if (isDragging) classes.push('dragging');
    if (isOver && canDrop) {
      classes.push('drop-target');
      if (dropPosition) classes.push(`drop-${dropPosition}`);
    }
    if (isOver && !canDrop) classes.push('drop-invalid');
    if (deletingCategoryId === node.id) classes.push('deleting');
    
    return classes.join(' ');
  };

  const getContextMenuItems = () => {
    switch (node.type) {
      case 'category':
        if (node.is_system) return [];
        return [
          { id: 'edit', label: 'Rename', icon: <FiEdit3 /> },
          { id: 'create', label: 'Add Subcategory', icon: <FiPlus /> },
          { id: 'delete', label: 'Delete', icon: <FiTrash2 /> }
        ];
      case 'vendor':
        return [
          { id: 'edit', label: 'Edit Vendor Name', icon: <FiEdit3 /> },
          { id: 'info', label: 'View Transactions', icon: <FiInfo /> }
        ];
      case 'transaction':
        return [
          { id: 'info', label: 'View Details', icon: <FiInfo /> }
        ];
      default:
        return [];
    }
  };

  const hasChildren = node.children && node.children.length > 0;
  const indentWidth = level * 20;
  const contextMenuItems = getContextMenuItems();

  return (
    <React.Fragment>
      {/* Drop zone before node */}
      {isOver && canDrop && dropPosition === 'before' && (
        <div className="drop-zone drop-zone-before" />
      )}
      
      <div
        ref={dragDropRef}
        className={getNodeClassName()}
        style={{ paddingLeft: `${indentWidth}px` }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          // Don't immediately close context menu to allow moving cursor to menu
        }}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
      >
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

          {/* Drag Handle (only for draggable categories) */}
          {node.type === 'category' && !node.is_system && (
            <div className="drag-handle">
              <FiMove />
            </div>
          )}

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
                {node.name}
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
          {(isHovered || showContextMenu) && !isEditingCategory && contextMenuItems.length > 0 && (
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

      {/* Drop zone after node */}
      {isOver && canDrop && dropPosition === 'after' && (
        <div className="drop-zone drop-zone-after" />
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
        <div className="tree-node-children">
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
              onVendorEdit={onVendorEdit} // Pass vendor editing prop
              onDrop={onDrop}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              selectedCategoryId={selectedCategoryId}
              selectedVendorId={selectedVendorId}
              selectedTransactionId={selectedTransactionId}
              deletingCategoryId={deletingCategoryId}
              isCreating={isCreating}
              draggedItem={draggedItem}
              searchTerm={searchTerm}
            />
          ))}
        </div>
      )}

      {/* Portal-based context menu to avoid click interception */}
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