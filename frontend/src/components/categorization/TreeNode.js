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
  const [dropPosition, setDropPosition] = useState(null);
  const [mouseDownTime, setMouseDownTime] = useState(null);
  const [mouseDownPosition, setMouseDownPosition] = useState(null);

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
    if (isOver && canDrop) {
      classes.push('drop-target');
      if (dropPosition) classes.push(`drop-${dropPosition}`);
    }
    if (isOver && !canDrop) classes.push('drop-invalid');
    if (deletingCategoryId === node.id) classes.push('deleting');
    
    return classes.join(' ');
  };

  const hasChildren = node.children && node.children.length > 0;
  const indentWidth = level * 20;

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
        onMouseLeave={() => setIsHovered(false)}
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