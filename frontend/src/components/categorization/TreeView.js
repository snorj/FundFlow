import React, { useState, useCallback, useMemo } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import TreeNode from './TreeNode';
import { filterTreeData } from '../../utils/categoryTransformUtils';
import './TreeView.css';

const TreeView = ({ 
  data = [], 
  searchTerm = '', 
  onCategorySelect,
  onVendorSelect,
  onTransactionSelect,
  onTransactionInfo,
  onCategoryCreate,
  onCategoryDelete,
  onCategoryMove,
  onDropValidation,
  selectedCategoryId,
  selectedVendorId,
  selectedTransactionId,
  deletingCategoryId,
  isCreating,
  visibleItemIds
}) => {
  const [expandedNodes, setExpandedNodes] = useState(new Set());
  const [draggedItem, setDraggedItem] = useState(null);

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
  }, []);

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
    if (!draggedNode || !targetNode) {
      onDropValidation?.(false, 'Invalid drop operation', { draggedNode, targetNode });
      return;
    }

    // Prevent dropping on self
    if (draggedNode.id === targetNode.id) {
      onDropValidation?.(false, 'Cannot drop item on itself', { draggedNode, targetNode });
      return;
    }

    // Prevent dropping parent into child (circular dependency)
    if (isDescendant(targetNode, draggedNode)) {
      onDropValidation?.(false, 'Cannot create circular dependency', { draggedNode, targetNode });
      return;
    }

    // Only allow category moves for now
    if (draggedNode.type !== 'category') {
      onDropValidation?.(false, 'Only categories can be moved', { draggedNode, targetNode });
      return;
    }

    // Call the move handler
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
          <div className="tree-nodes">
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
          </div>
        )}
      </div>
    </DndProvider>
  );
};

export default TreeView; 