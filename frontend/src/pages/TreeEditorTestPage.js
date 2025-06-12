import React, { useState, useEffect } from 'react';
import CategoryTreeEditor from '../components/categorization/CategoryTreeEditor';
import categoryService from '../services/categories';
import transactionService from '../services/transactions';
import { FiRefreshCw, FiInfo, FiTarget } from 'react-icons/fi';
import './TreeEditorTestPage.css';

const TreeEditorTestPage = () => {
  const [data, setData] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [categorySpendingTotals, setCategorySpendingTotals] = useState({});
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
  const handleMove = async (sourceId, targetParentId, position) => {
    console.log('Move operation:', { sourceId, targetParentId, position });
    // In a real implementation, you would make an API call here
    // For testing, we'll just log the operation
    alert(`Move operation: Moving node ${sourceId} to parent ${targetParentId} at position ${position}`);
  };

  const handleRename = async (nodeId, newName) => {
    console.log('Rename operation:', { nodeId, newName });
    try {
      // Find the node in our data
      const node = data.find(item => item.id === nodeId);
      if (node && node.type === 'category') {
        await categoryService.updateCategory(nodeId, { name: newName });
        await loadData(); // Reload data
        alert(`Successfully renamed to: ${newName}`);
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

  const handleDelete = async (nodeId) => {
    console.log('Delete operation:', { nodeId });
    if (window.confirm('Are you sure you want to delete this item?')) {
      try {
        const node = data.find(item => item.id === nodeId);
        if (node && node.type === 'category') {
          await categoryService.deleteCategory(nodeId);
          await loadData(); // Reload data
          alert('Successfully deleted');
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
      await categoryService.createCategory({ name, parent: parentId });
      await loadData(); // Reload data
      alert(`Successfully created child category: ${name}`);
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
        <button onClick={loadData} className="refresh-button">
          <FiRefreshCw /> Refresh Data
        </button>
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