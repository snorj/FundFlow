import React, { useState, useCallback, useMemo } from 'react';
import TreeNode from './TreeNode';
import { filterTreeData } from '../../utils/categoryTransformUtils';
import { FiFolder, FiX } from 'react-icons/fi';
import './TreeView.css';

// Move Mode Banner Component
const MoveBanner = ({ movingCategory, onCancel }) => {
  if (!movingCategory) return null;

  return (
    <div className="move-mode-banner">
      <div className="move-banner-content">
        <FiFolder className="move-banner-icon" />
        <span className="move-banner-text">
          Moving "{movingCategory.name}" - Click on a destination or the root area
        </span>
        <button onClick={onCancel} className="move-cancel-button" title="Cancel move">
          <FiX />
        </button>
      </div>
    </div>
  );
};

// Root Drop Zone Component
const RootMoveZone = ({ isInMoveMode, onMoveToRoot, movingCategory }) => {
  if (!isInMoveMode) return null;

  return (
    <div className="root-move-zone" onClick={onMoveToRoot}>
      <div className="root-move-zone-content">
        <FiFolder className="root-move-icon" />
        <span className="root-move-text">
          Move "{movingCategory?.name}" to top level
        </span>
      </div>
    </div>
  );
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
  onVendorEdit,
  onCategoryMove,
  onVendorMove,
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
  const [bulkSelectedIds, setBulkSelectedIds] = useState(new Set());
  const [bulkOperationMode, setBulkOperationMode] = useState(false);
  
  // Move mode state
  const [moveMode, setMoveMode] = useState({
    isActive: false,
    movingCategory: null
  });

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

  // Move mode handlers
  const handleStartMove = useCallback((node) => {
    setMoveMode({
      isActive: true,
      movingCategory: node  // Keep same name for compatibility
    });
    
    // Auto-expand all categories to show move destinations
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      const expandAllCategories = (nodes) => {
        nodes.forEach(treeNode => {
          if (treeNode.type === 'category' && treeNode.id !== node.id) {
            newSet.add(treeNode.id);
            if (treeNode.children) {
              expandAllCategories(treeNode.children);
            }
          }
        });
      };
      expandAllCategories(filteredData);
      return newSet;
    });
  }, [filteredData, setExpandedNodes]);

  const handleCancelMove = useCallback(() => {
    setMoveMode({
      isActive: false,
      movingCategory: null
    });
  }, []);

  const handleMoveToRoot = useCallback(() => {
    if (!moveMode.movingCategory) return;
    
    const movingItem = moveMode.movingCategory;
    const confirmMessage = `Move "${movingItem.name}" to the top level?`;
    if (window.confirm(confirmMessage)) {
      if (movingItem.type === 'category' && onCategoryMove) {
        onCategoryMove(movingItem.id, null, 'root');
      } else if (movingItem.type === 'vendor' && onVendorMove) {
        onVendorMove(movingItem.vendor_id, null, 'root');
      }
      handleCancelMove();
    }
  }, [moveMode.movingCategory, onCategoryMove, onVendorMove, handleCancelMove]);

  const handleMoveToCategory = useCallback((targetCategory, position) => {
    if (!moveMode.movingCategory) return;
    
    const movingItem = moveMode.movingCategory;
    
    // Prevent moving to self
    if (movingItem.id === targetCategory.id) return;
    
    // For categories, prevent circular dependencies
    if (movingItem.type === 'category') {
      const isDescendant = (target, source) => {
        if (!target.children || target.children.length === 0) return false;
        return target.children.some(child => 
          child.id === source.id || isDescendant(child, source)
        );
      };
      
      if (position === 'inside' && isDescendant(targetCategory, movingItem)) {
        alert('Cannot move a category into its own subcategory.');
        return;
      }
    }
    
    const positionText = position === 'inside' ? 'inside' : position === 'before' ? 'above' : 'below';
    const confirmMessage = `Move "${movingItem.name}" ${positionText} "${targetCategory.name}"?`;
    
    if (window.confirm(confirmMessage)) {
      if (movingItem.type === 'category' && onCategoryMove) {
        onCategoryMove(movingItem.id, targetCategory.id, position);
      } else if (movingItem.type === 'vendor' && onVendorMove) {
        onVendorMove(movingItem.vendor_id, targetCategory.id, position);
      }
      handleCancelMove();
    }
  }, [moveMode.movingCategory, onCategoryMove, onVendorMove, handleCancelMove]);

  // Enhanced bulk operations
  const handleBulkSelect = useCallback((nodeId, selected) => {
    setBulkSelectedIds(prev => {
      const newSet = new Set(prev);
      if (selected) {
        newSet.add(nodeId);
      } else {
        newSet.delete(nodeId);
      }
      return newSet;
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (bulkSelectedIds.size === 0) return;
    
    const message = `Are you sure you want to delete ${bulkSelectedIds.size} selected categories?`;
    if (window.confirm(message)) {
      Array.from(bulkSelectedIds).forEach(id => {
        onCategoryDelete?.(id);
      });
      setBulkSelectedIds(new Set());
      setBulkOperationMode(false);
    }
  }, [bulkSelectedIds, onCategoryDelete]);

  const handleBulkExpand = useCallback(() => {
    const allCategoryIds = new Set();
    const collectCategoryIds = (nodes) => {
      nodes.forEach(node => {
        if (node.type === 'category') {
          allCategoryIds.add(node.id);
          if (node.children) {
            collectCategoryIds(node.children);
          }
        }
      });
    };
    
    collectCategoryIds(filteredData);
    setExpandedNodes(allCategoryIds);
  }, [filteredData, setExpandedNodes]);

  const handleBulkCollapse = useCallback(() => {
    setExpandedNodes(new Set());
  }, [setExpandedNodes]);

  // Expand all nodes that match search
  React.useEffect(() => {
    if (searchTerm.trim() && visibleItemIds) {
      setExpandedNodes(prev => {
        const newSet = new Set(prev);
        visibleItemIds.forEach(id => newSet.add(id));
        return newSet;
      });
    }
  }, [searchTerm, visibleItemIds, setExpandedNodes]);
  
  return (
    <div className={`tree-view ${bulkOperationMode ? 'bulk-mode' : ''} ${moveMode.isActive ? 'move-mode' : ''}`}>
      {/* Move mode banner */}
      <MoveBanner 
        movingCategory={moveMode.movingCategory}
        onCancel={handleCancelMove}
      />

      {/* Bulk operations toolbar */}
      {bulkOperationMode && (
        <div className="bulk-operations-toolbar">
          <div className="bulk-info">
            <span>{bulkSelectedIds.size} items selected</span>
          </div>
          <div className="bulk-actions">
            <button onClick={handleBulkExpand} className="bulk-action-btn">
              Expand All
            </button>
            <button onClick={handleBulkCollapse} className="bulk-action-btn">
              Collapse All  
            </button>
            <button 
              onClick={handleBulkDelete} 
              className="bulk-action-btn danger"
              disabled={bulkSelectedIds.size === 0}
            >
              Delete Selected ({bulkSelectedIds.size})
            </button>
            <button 
              onClick={() => {
                setBulkOperationMode(false);
                setBulkSelectedIds(new Set());
              }} 
              className="bulk-action-btn"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="tree-nodes">
        {/* Root move zone */}
        <RootMoveZone 
          isInMoveMode={moveMode.isActive}
          onMoveToRoot={handleMoveToRoot}
          movingCategory={moveMode.movingCategory}
        />

        {filteredData.length === 0 ? (
          <div className="tree-empty">
            {searchTerm ? 'No items match your search' : 'No categories available'}
          </div>
        ) : (
          filteredData.map(node => (
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
              onVendorEdit={onVendorEdit}
              selectedCategoryId={selectedCategoryId}
              selectedVendorId={selectedVendorId}
              selectedTransactionId={selectedTransactionId}
              deletingCategoryId={deletingCategoryId}
              isCreating={isCreating}
              searchTerm={searchTerm}
              bulkOperationMode={bulkOperationMode}
              bulkSelectedIds={bulkSelectedIds}
              onBulkSelect={handleBulkSelect}
              // Move mode props
              moveMode={moveMode}
              onStartMove={handleStartMove}
              onMoveToCategory={handleMoveToCategory}
            />
          ))
        )}
      </div>
    </div>
  );
};

export default TreeView;