import React, { useState, useEffect } from 'react';
import CategoryTreeEditor from '../components/categorization/CategoryTreeEditor';
import categoryService from '../services/categories';
import transactionService from '../services/transactions';
import { FiRefreshCw, FiInfo, FiTarget, FiRotateCcw, FiRotateCw, FiClock } from 'react-icons/fi';
import { useHistoryStack, createCategoryOperation } from '../hooks/useHistoryStack';
import './TreeEditorTestPage.css';

const TreeEditorTestPage = () => {
  const [data, setData] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [categorySpendingTotals, setCategorySpendingTotals] = useState({});
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Initialize history stack for undo/redo functionality
  const {
    pushOperation,
    undo,
    redo,
    getStatus,
    getOperationPreview
  } = useHistoryStack(30);

  // Load test data
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Load categories and vendors
      const categories = await categoryService.getCategories();
      setData(categories || []);

      // Load transactions (for spending totals)
      const transactionData = await transactionService.getTransactions({ page_size: 100 });
      setTransactions(transactionData || []);

      // Load spending totals
      try {
        const totals = await transactionService.getCategorySpendingTotals();
        setCategorySpendingTotals(totals || {});
      } catch {
        setCategorySpendingTotals({});
      }
    } catch (err) {
      console.error('Error loading data:', err);
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Event handlers for CategoryTreeEditor
  const handleMove = async (args) => {
    const { dragIds, parentId, index } = args;
    const dragNodeId = dragIds[0]; // react-arborist supports multi-select, but we'll handle single for now
    
    console.log('Move operation:', { dragNodeId, parentId, index });
    
    try {
      const dragNode = data.find(item => item.id === dragNodeId);
      
      if (dragNode && dragNode.type === 'category') {
        const oldParentId = dragNode.parent;
        const newParentId = parentId || null;
        
        // Create move operation for history
        const moveOperation = createCategoryOperation.move(
          dragNodeId,
          oldParentId,
          newParentId,
          dragNode.name,
          async (categoryId, targetParentId) => {
            const updateData = { 
              name: dragNode.name,
              parent: targetParentId
            };
            await categoryService.updateCategory(categoryId, updateData);
            await loadData();
          }
        );
        
        // Execute the operation
        await moveOperation.forwardOperation();
        
        // Record in history
        pushOperation(moveOperation);
        
        console.log(`Successfully moved "${dragNode.name}" to parent ${newParentId || 'root'}`);
      } else {
        console.log('Move operation not implemented for non-category items:', dragNode?.type);
      }
    } catch (err) {
      console.error('Move failed:', err);
      alert(`Move failed: ${err.message}`);
    }
  };

  const handleRename = async (args) => {
    const { id: nodeId, name: newName, node } = args;
    console.log('Rename operation:', { nodeId, newName, node });
    try {
      if (node && node.type === 'category') {
        const oldName = node.name;
        
        // Create rename operation for history
        const renameOperation = createCategoryOperation.rename(
          nodeId,
          oldName,
          newName,
          async (categoryId, name) => {
            await categoryService.updateCategory(categoryId, { name });
            await loadData();
          }
        );
        
        // Execute the operation
        await renameOperation.forwardOperation();
        
        // Record in history
        pushOperation(renameOperation);
        
        console.log(`Successfully renamed "${oldName}" to "${newName}"`);
      }
    } catch (err) {
      console.error('Rename failed:', err);
      alert(`Rename failed: ${err.message}`);
    }
  };

  const handleSelect = (node) => {
    console.log('Node selected:', node);
    setSelectedNodeId(node.id);
    setSelectedNode(node);
  };

  const handleDelete = async (args) => {
    const { id: nodeId, node } = args;
    console.log('Delete operation:', { nodeId, node });
    
    // Enhanced confirmation dialog with impact information
    const confirmMessage = node?.type === 'category' 
      ? `Are you sure you want to delete "${node.name}"?\n\nThis will:\n• Remove the category permanently\n• Unassign any associated transactions\n• Move child categories to parent level\n\nNote: This action can be undone using the undo button.`
      : 'Are you sure you want to delete this item?';
    
    if (window.confirm(confirmMessage)) {
      try {
        if (node && node.type === 'category') {
          // Create delete operation for history
          const deleteOperation = createCategoryOperation.delete(
            node,
            async (categoryId) => {
              await categoryService.deleteCategory(categoryId);
              await loadData();
            },
            async (categoryData) => {
              const newCategory = await categoryService.createCategory(categoryData);
              await loadData();
              return newCategory;
            }
          );
          
          // Execute the operation
          await deleteOperation.forwardOperation();
          
          // Record in history
          pushOperation(deleteOperation);
          
          console.log(`Successfully deleted category: ${node.name}`);
        } else {
          console.log('Delete operation not implemented for non-category items:', node?.type);
        }
      } catch (err) {
        console.error('Delete failed:', err);
        alert(`Delete failed: ${err.message}`);
      }
    }
  };

  const handleCreateChild = async (parentId, name) => {
    console.log('Create child operation:', { parentId, name });
    try {
      const categoryData = { name, parent: parentId };
      
      // Create category operation for history
      const createOperation = createCategoryOperation.create(
        categoryData,
        async (data) => {
          const newCategory = await categoryService.createCategory(data);
          await loadData();
          return newCategory;
        },
        async (categoryId) => {
          await categoryService.deleteCategory(categoryId);
          await loadData();
        }
      );
      
      // Execute the operation
      const result = await createOperation.forwardOperation();
      
      // Record in history (need to update with the actual ID from the result)
      if (result && result.id) {
        createOperation.data.id = result.id;
      }
      pushOperation(createOperation);
      
      console.log(`Successfully created child category: ${name}`);
    } catch (err) {
      console.error('Create child failed:', err);
      alert(`Create child failed: ${err.message}`);
    }
  };

  const handleDuplicate = async (nodeId) => {
    console.log('Duplicate operation:', { nodeId });
    const node = data.find(item => item.id === nodeId);
    if (node) {
      try {
        await categoryService.createCategory({ 
          name: `${node.name} (Copy)`, 
          parent: node.parent 
        });
        await loadData(); // Reload data
        alert(`Successfully duplicated: ${node.name}`);
      } catch (err) {
        console.error('Duplicate failed:', err);
        alert(`Duplicate failed: ${err.message}`);
      }
    }
  };

  const handleCategoryCreated = async (newCategory) => {
    console.log('Category created:', newCategory);
    
    // Create category operation for history (from modal creation)
    const createOperation = createCategoryOperation.create(
      newCategory,
      async (data) => {
        const result = await categoryService.createCategory(data);
        await loadData();
        return result;
      },
      async (categoryId) => {
        await categoryService.deleteCategory(categoryId);
        await loadData();
      }
    );
    
    // Record in history
    pushOperation(createOperation);
    
    await loadData(); // Reload data to show the new category
  };

  // Undo/Redo handlers
  const handleUndo = async () => {
    try {
      const result = await undo();
      if (result) {
        console.log('Undid operation:', result.operation.description);
      }
    } catch (err) {
      console.error('Undo failed:', err);
      alert(`Undo failed: ${err.message}`);
    }
  };

  const handleRedo = async () => {
    try {
      const result = await redo();
      if (result) {
        console.log('Redid operation:', result.operation.description);
      }
    } catch (err) {
      console.error('Redo failed:', err);
      alert(`Redo failed: ${err.message}`);
    }
  };

  // Get history status for UI
  const historyStatus = getStatus();
  const undoPreview = getOperationPreview('undo');
  const redoPreview = getOperationPreview('redo');

  if (loading) {
    return (
      <div className="tree-editor-test-page">
        <div className="loading-state">
          <FiRefreshCw className="spinner" />
          <p>Loading test data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="tree-editor-test-page">
        <div className="error-state">
          <p>Error: {error}</p>
          <button onClick={loadData}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tree-editor-test-page">
      <div className="test-header">
        <h1>CategoryTreeEditor Test Page</h1>
        <div className="header-actions">
          <div className="undo-redo-controls">
            <button 
              onClick={handleUndo} 
              disabled={!historyStatus.canUndo || historyStatus.isPerformingOperation}
              className="undo-button"
              title={undoPreview ? `Undo: ${undoPreview.description}` : 'No actions to undo'}
            >
              <FiRotateCcw /> Undo
            </button>
            <button 
              onClick={handleRedo} 
              disabled={!historyStatus.canRedo || historyStatus.isPerformingOperation}
              className="redo-button"
              title={redoPreview ? `Redo: ${redoPreview.description}` : 'No actions to redo'}
            >
              <FiRotateCw /> Redo
            </button>
            {historyStatus.historyLength > 0 && (
              <span className="history-info">
                <FiClock /> {historyStatus.historyLength} operations
              </span>
            )}
          </div>
          <button onClick={loadData} className="refresh-button">
            <FiRefreshCw /> Refresh Data
          </button>
        </div>
      </div>

      <div className="test-info-panel">
        <FiInfo className="info-icon" />
        <div className="test-instructions">
          <h3>Testing Instructions:</h3>
          <ul>
            <li><strong>Drag & Drop:</strong> Click and drag categories to move them around</li>
            <li><strong>Rename:</strong> Double-click on a category name or press F2 to edit</li>
            <li><strong>Context Menu:</strong> Right-click on categories for more options</li>
            <li><strong>Keyboard Navigation:</strong> Use arrow keys, Enter/Space to expand/collapse</li>
            <li><strong>Selection:</strong> Click on any item to select it</li>
            <li><strong>Undo/Redo:</strong> Use the Undo/Redo buttons to reverse or replay recent actions</li>
          </ul>
        </div>
      </div>

      <div className="test-content">
        <div className="tree-editor-container">
          <h3>Category Tree Editor</h3>
          <CategoryTreeEditor
            data={data}
            onMove={handleMove}
            onRename={handleRename}
            onSelect={handleSelect}
            onDelete={handleDelete}
            onCreateChild={handleCreateChild}
            onDuplicate={handleDuplicate}
            onCategoryCreated={handleCategoryCreated}
            transactions={transactions}
            categorySpendingTotals={categorySpendingTotals}
            selectedNodeId={selectedNodeId}
            className="test-tree-editor"
          />
        </div>

        <div className="selection-info-panel">
          <h3>Selection Info</h3>
          {selectedNode ? (
            <div className="selected-node-details">
              <p><FiTarget /> <strong>Selected:</strong> {selectedNode.name}</p>
              <p><strong>Type:</strong> {selectedNode.type}</p>
              <p><strong>ID:</strong> {selectedNode.id}</p>
              {selectedNode.parent && <p><strong>Parent ID:</strong> {selectedNode.parent}</p>}
              {selectedNode.amount !== undefined && (
                <p><strong>Amount:</strong> ${selectedNode.amount?.toFixed(2) || '0.00'}</p>
              )}
            </div>
          ) : (
            <p>No item selected. Click on a tree item to see details.</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default TreeEditorTestPage; 