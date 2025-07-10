import React, { useState, useCallback, useMemo } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { useDrop } from 'react-dnd';
import TreeNode from './TreeNode';
import { filterTreeData } from '../../utils/categoryTransformUtils';
import './TreeView.css';

const ItemTypes = {
  CATEGORY: 'category',
  VENDOR: 'vendor',
  TRANSACTION: 'transaction'
};

const TreeView = ({ 
  data = [],
  searchTerm = '', 
  onCategorySelect,
  onVendorSelect,
  onTransactionSelect,
  onTransactionInfo,
  onCategoryCreate,
  onCategoryDelete,
  onCategoryRename,
  onVendorEdit, // Add vendor editing prop
  onCategoryMove,
  onDropValidation,
  selectedCategoryId,
  selectedVendorId,
  selectedTransactionId,
  deletingCategoryId,
  isCreating,
  visibleItemIds,
  expandedNodes: externalExpandedNodes,
  onExpandedNodesChange
}) => {
  const [internalExpandedNodes, setInternalExpandedNodes] = useState(new Set());
  const [draggedItem, setDraggedItem] = useState(null);

  // Use external expanded nodes if provided, otherwise use internal state
  const expandedNodes = externalExpandedNodes || internalExpandedNodes;
  const setExpandedNodes = onExpandedNodesChange || setInternalExpandedNodes;

  // Filter data based on search term and visible items
  const filteredData = useMemo(() => {
    if (!searchTerm.trim() && !visibleItemIds) {
      return data;
      }
    return filterTreeData(data, searchTerm, visibleItemIds);
  }, [data, searchTerm, visibleItemIds]);

  // Handle node expansion/collapse
  const handleToggleExpand = useCallback((nodeId) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  }, [setExpandedNodes]);
  
  // Handle drag start
  const handleDragStart = useCallback((item) => {
    setDraggedItem(item);
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    setDraggedItem(null);
  }, []);

  // Handle drop operation
  const handleDrop = useCallback((draggedNode, targetNode, position) => {
    // Validate the drop operation
    if (!draggedNode) {
      onDropValidation?.(false, 'Invalid drop operation', { draggedNode, targetNode });
      return;
    }

    // Handle root-level drops (making items top-level)
    if (position === 'root' || !targetNode) {
      if (onCategoryMove) {
        onCategoryMove(draggedNode.id, null, 'root');
      }
      return;
    }

    // Prevent dropping on self
    if (draggedNode.id === targetNode.id) {
      onDropValidation?.(false, 'Cannot drop item on itself', { draggedNode, targetNode });
      return;
    }

    // Prevent dropping parent into child (circular dependency)
    if (position === 'inside' && isDescendant(targetNode, draggedNode)) {
      onDropValidation?.(false, 'Cannot create circular dependency', { draggedNode, targetNode });
      return;
    }

    // Only allow category moves for now
    if (draggedNode.type !== 'category') {
      onDropValidation?.(false, 'Only categories can be moved', { draggedNode, targetNode });
      return;
    }
      
    // Call the move handler with the position
    if (onCategoryMove) {
      onCategoryMove(draggedNode.id, targetNode.id, position);
    }
  }, [onCategoryMove, onDropValidation]);

  // Helper function to check if target is a descendant of source
  const isDescendant = useCallback((target, source) => {
    if (!target.children || target.children.length === 0) {
          return false;
        }
        
    for (const child of target.children) {
      if (child.id === source.id || isDescendant(child, source)) {
        return true;
      }
    }
    return false;
  }, []);

  // Expand all nodes that match search
  React.useEffect(() => {
    if (searchTerm.trim() && visibleItemIds) {
      setExpandedNodes(prev => {
        const newSet = new Set(prev);
        visibleItemIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  }, [searchTerm, visibleItemIds]);
  
  return (
    <DndProvider backend={HTML5Backend}>
      <div className="tree-view">
        {filteredData.length === 0 ? (
          <div className="tree-empty">
            {searchTerm ? 'No items match your search' : 'No categories available'}
          </div>
        ) : (
          <RootDropZone onDrop={handleDrop}>
            {filteredData.map(node => (
              <TreeNode
                key={node.id}
                node={node}
                level={0}
                expanded={expandedNodes.has(node.id)}
                expandedNodes={expandedNodes}
                onToggleExpand={handleToggleExpand}
                onCategorySelect={onCategorySelect}
                onVendorSelect={onVendorSelect}
                onTransactionSelect={onTransactionSelect}
                onTransactionInfo={onTransactionInfo}
                onCategoryCreate={onCategoryCreate}
                onCategoryDelete={onCategoryDelete}
                onCategoryRename={onCategoryRename}
                onVendorEdit={onVendorEdit} // Pass vendor editing prop
                onDrop={handleDrop}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                selectedCategoryId={selectedCategoryId}
                selectedVendorId={selectedVendorId}
                selectedTransactionId={selectedTransactionId}
                deletingCategoryId={deletingCategoryId}
                isCreating={isCreating}
                draggedItem={draggedItem}
                searchTerm={searchTerm}
              />
            ))}
          </RootDropZone>
        )}
      </div>
    </DndProvider>
  );
};

// Root drop zone component for making items top-level
const RootDropZone = ({ onDrop, children }) => {
  const [{ isOver, canDrop }, drop] = useDrop({
    accept: ItemTypes.CATEGORY,
    drop: (item, monitor) => {
      if (!monitor.didDrop()) {
        // Drop on root means make it top-level (no parent)
        onDrop?.(item.node, null, 'root');
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
      canDrop: monitor.canDrop(),
    }),
  });

  return (
    <div 
      ref={drop}
      className={`tree-nodes ${isOver && canDrop ? 'root-drop-target' : ''}`}
    >
      {children}
    </div>
  );
};

export default TreeView;