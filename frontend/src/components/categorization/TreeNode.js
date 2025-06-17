import React, { useRef, useState } from 'react';
import { useDrag, useDrop } from 'react-dnd';
import { 
  FiChevronRight, 
  FiChevronDown, 
  FiFolder, 
  FiUser, 
  FiCreditCard,
  FiMove,
  FiPlus,
  FiTrash2,
  FiInfo
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
    canDrag: () => node.type === 'category' && !node.is_system
  });

  // Drop functionality
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ItemTypes.CATEGORY,
    drop: (item, monitor) => {
      if (!monitor.didDrop()) {
        onDrop?.(item.node, node, 'inside');
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
    canDrop: (item) => {
      // Can't drop on self
      if (item.id === node.id) return false;
      
      // Can only drop categories on categories
      if (item.type !== 'category' || node.type !== 'category') return false;
      
      // Can't drop on system categories
      if (node.is_system) return false;
      
      return true;
    }
  });

  // Combine drag and drop refs
  const dragDropRef = drag(drop(ref));

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

  const handleCreateCategory = (e) => {
    e.stopPropagation();
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
    e.stopPropagation();
    if (window.confirm(`Are you sure you want to delete "${node.name}"?`)) {
      onCategoryDelete?.(node.id);
    }
  };

  const handleTransactionInfo = (e) => {
    e.stopPropagation();
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
    if (isOver && canDrop) classes.push('drop-target');
    if (isOver && !canDrop) classes.push('drop-invalid');
    if (deletingCategoryId === node.id) classes.push('deleting');
    
    return classes.join(' ');
  };

  const hasChildren = node.children && node.children.length > 0;
  const indentWidth = level * 20;

  return (
    <React.Fragment>
      <div
        ref={dragDropRef}
        className={getNodeClassName()}
        style={{ paddingLeft: `${indentWidth}px` }}
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
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

          {/* Name */}
          <div className="tree-node-name">
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
          </div>

          {/* Actions */}
          {isHovered && (
            <div className="tree-node-actions">
              {node.type === 'category' && !node.is_system && (
                <React.Fragment>
                  <button
                    onClick={handleCreateCategory}
                    className="action-button"
                    title="Add subcategory"
                  >
                    <FiPlus />
                  </button>
                  <button
                    onClick={handleDeleteCategory}
                    className="action-button delete"
                    title="Delete category"
                  >
                    <FiTrash2 />
                  </button>
                </React.Fragment>
              )}
              {node.type === 'transaction' && (
                <button
                  onClick={handleTransactionInfo}
                  className="action-button"
                  title="View transaction details"
                >
                  <FiInfo />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Create new category input */}
      {showCreateInput && (
        <div
          className="tree-node create-input"
          style={{ paddingLeft: `${indentWidth + 20}px` }}
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
              onBlur={handleCancelNewCategory}
              placeholder="Category name..."
              autoFocus
              className="category-input"
            />
          </div>
        </div>
      )}

      {/* Render children */}
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
    </React.Fragment>
  );
};

export default TreeNode; 