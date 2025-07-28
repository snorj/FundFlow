import React, { useState } from 'react';
import TreeView from '../components/categorization/TreeView';
import './TreeViewTestPage.css';

const TreeViewTestPage = () => {
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedVendorId, setSelectedVendorId] = useState(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingCategoryId, setDeletingCategoryId] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  // Dummy tree data
  const [treeData, setTreeData] = useState([
    {
      id: 1,
      name: 'Food & Dining',
      type: 'category',
      is_custom: true,
      is_system: false,
      parent: null,
      children: [
        {
          id: 11,
          name: 'Restaurants',
          type: 'category',
          is_custom: true,
          is_system: false,
          parent: 1,
          children: [
            {
              id: 'vendor_1',
              name: 'McDonald\'s',
              type: 'vendor',
              parent: 11,
              transactionCount: 5,
              totalAmount: 45.50,
              children: [
                {
                  id: 'transaction_1',
                  name: 'McDonald\'s - Lunch',
                  type: 'transaction',
                  parent: 'vendor_1',
                  amount: 12.50,
                  date: '2024-01-15',
                  children: []
                }
              ]
            },
            {
              id: 'vendor_2',
              name: 'Pizza Palace',
              type: 'vendor',
              parent: 11,
              transactionCount: 3,
              totalAmount: 67.80,
              children: []
            }
          ]
        },
        {
          id: 12,
          name: 'Groceries',
          type: 'category',
          is_custom: true,
          is_system: false,
          parent: 1,
          children: [
            {
              id: 'vendor_3',
              name: 'Walmart',
              type: 'vendor',
              parent: 12,
              transactionCount: 8,
              totalAmount: 234.60,
              children: []
            }
          ]
        }
      ]
    },
    {
      id: 2,
      name: 'Transportation',
      type: 'category',
      is_custom: true,
      is_system: false,
      parent: null,
      children: [
        {
          id: 21,
          name: 'Gas',
          type: 'category',
          is_custom: true,
          is_system: false,
          parent: 2,
          children: [
            {
              id: 'vendor_4',
              name: 'Shell',
              type: 'vendor',
              parent: 21,
              transactionCount: 12,
              totalAmount: 456.78,
              children: []
            }
          ]
        },
        {
          id: 22,
          name: 'Public Transit',
          type: 'category',
          is_custom: true,
          is_system: false,
          parent: 2,
          children: []
        }
      ]
    },
    {
      id: 3,
      name: 'Entertainment',
      type: 'category',
      is_custom: true,
      is_system: false,
      parent: null,
      children: [
        {
          id: 31,
          name: 'Movies',
          type: 'category',
          is_custom: true,
          is_system: false,
          parent: 3,
          children: []
        }
      ]
    },
    {
      id: 4,
      name: 'Bills & Utilities',
      type: 'category',
      is_custom: false,
      is_system: true,
      parent: null,
      children: [
        {
          id: 41,
          name: 'Electricity',
          type: 'category',
          is_custom: false,
          is_system: true,
          parent: 4,
          children: []
        }
      ]
    }
  ]);

  // Event handlers
  const handleCategorySelect = (category) => {
    console.log('Category selected:', category);
    setSelectedCategoryId(category.id);
    setSelectedVendorId(null);
    setSelectedTransactionId(null);
  };

  const handleVendorSelect = (vendor) => {
    console.log('Vendor selected:', vendor);
    setSelectedVendorId(vendor.id);
    setSelectedCategoryId(null);
    setSelectedTransactionId(null);
  };

  const handleTransactionSelect = (transaction) => {
    console.log('Transaction selected:', transaction);
    setSelectedTransactionId(transaction.id);
    setSelectedCategoryId(null);
    setSelectedVendorId(null);
  };

  const handleTransactionInfo = (transaction) => {
    console.log('Transaction info requested:', transaction);
    alert(`Transaction: ${transaction.name}\nAmount: $${transaction.amount}\nDate: ${transaction.date}`);
  };

  const handleCategoryCreate = (name, parentId) => {
    console.log('Create category:', { name, parentId });
    setIsCreating(true);
    
    // Simulate API call
    setTimeout(() => {
      const newId = Math.max(...getAllIds(treeData)) + 1;
      const newCategory = {
        id: newId,
        name: name,
        type: 'category',
        is_custom: true,
        is_system: false,
        parent: parentId,
        children: []
      };

      // Add to tree data
      if (parentId) {
        // Find parent and add as child
        const updateTreeData = (nodes) => {
          return nodes.map(node => {
            if (node.id === parentId) {
              return {
                ...node,
                children: [...node.children, newCategory]
              };
            } else if (node.children.length > 0) {
              return {
                ...node,
                children: updateTreeData(node.children)
              };
            }
            return node;
          });
        };
        setTreeData(updateTreeData(treeData));
      } else {
        // Add as top-level category
        setTreeData([...treeData, newCategory]);
      }
      
      setIsCreating(false);
      console.log('Category created successfully!');
    }, 1000);
  };

  const handleCategoryDelete = (categoryId) => {
    console.log('Delete category:', categoryId);
    setDeletingCategoryId(categoryId);
    
    // Simulate API call
    setTimeout(() => {
      const removeFromTree = (nodes) => {
        return nodes.filter(node => node.id !== categoryId).map(node => ({
          ...node,
          children: removeFromTree(node.children)
        }));
      };
      
      setTreeData(removeFromTree(treeData));
      setDeletingCategoryId(null);
      console.log('Category deleted successfully!');
    }, 1000);
  };

  const handleCategoryRename = (categoryId, newName) => {
    console.log('Rename category:', categoryId, 'to:', newName);
    
    // Simulate API call
    return new Promise((resolve) => {
      setTimeout(() => {
        const updateInTree = (nodes) => {
          return nodes.map(node => {
            if (node.id === categoryId) {
              return { ...node, name: newName };
            } else if (node.children && node.children.length > 0) {
              return { ...node, children: updateInTree(node.children) };
            }
            return node;
          });
        };
        
        setTreeData(updateInTree(treeData));
        console.log('Category renamed successfully!');
        resolve();
      }, 500);
    });
  };

  const handleCategoryMove = (draggedCategoryId, targetCategoryId, position) => {
    console.log('Move category:', { draggedCategoryId, targetCategoryId, position });
    
    // Simulate API call
    setTimeout(() => {
      // Find and remove the dragged category
      let draggedCategory = null;
      const removeFromTree = (nodes) => {
        return nodes.filter(node => {
          if (node.id === draggedCategoryId) {
            draggedCategory = { ...node };
            return false;
          }
          return true;
        }).map(node => ({
          ...node,
          children: removeFromTree(node.children)
        }));
      };

      let newTreeData = removeFromTree(treeData);

      if (draggedCategory) {
        // Update parent
        draggedCategory.parent = position === 'inside' ? targetCategoryId : null;

        if (position === 'inside') {
          // Add as child of target
          const addToParent = (nodes) => {
            return nodes.map(node => {
              if (node.id === targetCategoryId) {
                return {
                  ...node,
                  children: [...node.children, draggedCategory]
                };
              } else if (node.children.length > 0) {
                return {
                  ...node,
                  children: addToParent(node.children)
                };
              }
              return node;
            });
          };
          newTreeData = addToParent(newTreeData);
        } else {
          // Add as top-level (for now, we'll just add to root)
          newTreeData = [...newTreeData, draggedCategory];
        }

        setTreeData(newTreeData);
        console.log('✅ Category moved successfully!');
      }
    }, 500);
  };

  // Helper function to get all IDs from tree
  const getAllIds = (nodes) => {
    let ids = [];
    nodes.forEach(node => {
      if (typeof node.id === 'number') {
        ids.push(node.id);
      }
      if (node.children && node.children.length > 0) {
        ids = [...ids, ...getAllIds(node.children)];
      }
    });
    return ids;
  };

  return (
    <div className="tree-test-page">
      <div className="test-header">
        <h1>🧪 React DnD TreeView Test Page</h1>
        <p>Test the drag and drop functionality with dummy data</p>
      </div>

      <div className="test-controls">
        <div className="search-control">
          <label>Search: </label>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search categories, vendors, transactions..."
          />
        </div>
        
        <div className="selection-info">
          <p><strong>Selected:</strong></p>
          <ul>
            <li>Category: {selectedCategoryId || 'None'}</li>
            <li>Vendor: {selectedVendorId || 'None'}</li>
            <li>Transaction: {selectedTransactionId || 'None'}</li>
          </ul>
        </div>
      </div>

      <div className="test-instructions">
        <h3>🎯 Test Instructions:</h3>
        <ul>
                      <li><strong>Drag & Drop:</strong> Drag custom categories (not system ones) to reorganise</li>
          <li><strong>Expand/Collapse:</strong> Click chevron icons to expand/collapse categories</li>
          <li><strong>Selection:</strong> Click on any item to select it</li>
          <li><strong>Actions:</strong> Hover over categories to see add/delete buttons</li>
          <li><strong>Transaction Info:</strong> Hover over transactions to see info button</li>
          <li><strong>Search:</strong> Use the search box to filter items</li>
        </ul>
      </div>

      <div className="tree-container">
        <TreeView
          data={treeData}
          searchTerm={searchTerm}
          onCategorySelect={handleCategorySelect}
          onVendorSelect={handleVendorSelect}
          onTransactionSelect={handleTransactionSelect}
          onTransactionInfo={handleTransactionInfo}
          onCategoryCreate={handleCategoryCreate}
          onCategoryDelete={handleCategoryDelete}
          onCategoryRename={handleCategoryRename}
          onCategoryMove={handleCategoryMove}
          selectedCategoryId={selectedCategoryId}
          selectedVendorId={selectedVendorId}
          selectedTransactionId={selectedTransactionId}
          deletingCategoryId={deletingCategoryId}
          isCreating={isCreating}
          visibleItemIds={null}
        />
      </div>

      <div className="debug-info">
        <h3>🔍 Debug Info:</h3>
        <p>Check the browser console for detailed logs of all interactions!</p>
        <details>
          <summary>Current Tree Data (JSON)</summary>
          <pre>{JSON.stringify(treeData, null, 2)}</pre>
        </details>
      </div>
    </div>
  );
};

export default TreeViewTestPage; 