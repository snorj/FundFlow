import React, { useState, useMemo, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
// Enhanced icons for the improved interface
import { 
  FiChevronRight, 
  FiChevronDown, 
  FiPlusCircle, 
  FiSave, 
  FiXCircle, 
  FiLoader, 
  FiTrash2, 
  FiTag,
  FiDollarSign,
  FiFolder,
  FiInfo,
  FiEdit3,
  FiCheck,
  FiX,
  FiMoreVertical
} from 'react-icons/fi';
import { formatCurrency } from '../../utils/formatting';

const CategoryTreeNode = ({
  item,
  allItems,
  visibleItemIds,
  level = 0,
  onSelectNode = () => {},
  onCategorySelect,
  onVendorSelect,
  onTransactionSelect,
  onTransactionInfo,
  onCreateCategory,
  onDeleteCategory,
  onRenameCategory,
  onVendorEdit, // New prop for vendor editing
  isCreating,
  isDeleting,
  transactions = [],
  categorySpendingTotals = {},
  selectedCategoryId = null,
  selectedVendorId = null,
  selectedTransactionId = null,
  showSpendingTotals = true,
  enableSmartInteractions = true,
  collapseAllTrigger,
}) => {
  // Local state for tree management
  const [isExpanded, setIsExpanded] = useState(false);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [addChildError, setAddChildError] = useState(null);
  const [isSavingChild, setIsSavingChild] = useState(false);

  // Category editing state
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editedCategoryName, setEditedCategoryName] = useState('');
  const [categoryEditError, setCategoryEditError] = useState(null);
  
  // Context menu state
  const [showContextMenu, setShowContextMenu] = useState(false);

  // Calculate spending total for this category (including subcategories)
  const calculateCategoryTotal = useCallback((categoryId) => {
    // Defensive check: ensure transactions is an array
    const transactionsArray = Array.isArray(transactions) ? transactions : [];
    if (!transactionsArray.length) return 0;
    
    // Direct transactions in this category
    const directTotal = transactionsArray
      .filter(t => t.category === categoryId)
      .reduce((sum, t) => sum + Math.abs(parseFloat(t.aud_amount || t.amount_aud || 0)), 0);
    
    // Transactions in subcategories (recursive)
    const childCategories = allItems.filter(c => c.parent === categoryId && c.type === 'category');
    const childTotal = childCategories.reduce(
      (sum, child) => sum + calculateCategoryTotal(child.id),
      0
    );
    
    return directTotal + childTotal;
  }, [allItems, transactions]);

  // Get vendor children for categories (vendors that have transactions in this category)
  const getVendorChildren = useCallback(() => {
    if (item.type !== 'category') return [];
    
    const transactionsArray = Array.isArray(transactions) ? transactions : [];
    const vendorMap = {};
    
    // Group transactions by vendor for this category
    transactionsArray
      .filter(t => t.category === item.id)
      .forEach(t => {
        const vendorName = t.description || 'Unknown Vendor';
        // Use description for vendor ID to ensure consistent grouping
        const vendorId = `vendor_${vendorName}`;
        
        if (!vendorMap[vendorId]) {
          vendorMap[vendorId] = {
            id: vendorId,
            name: vendorName,
            type: 'vendor',
            parent: item.id,
            is_custom: false,
            user: null,
            transactionCount: 0,
            totalAmount: 0
          };
        }
        vendorMap[vendorId].transactionCount += 1;
        vendorMap[vendorId].totalAmount += Math.abs(parseFloat(t.aud_amount || t.amount_aud || 0));
      });
    
    // Sort vendors by total amount (highest first)
    return Object.values(vendorMap).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [item.id, item.type, transactions]);

  // Get transaction children for vendors
  const getTransactionChildren = useCallback(() => {
    if (item.type !== 'vendor') return [];
    
    const transactionsArray = Array.isArray(transactions) ? transactions : [];
    const vendorId = item.id;
    
    // Find transactions for this vendor under the parent category
    return transactionsArray
      .filter(t => {
        if (t.category !== item.parent) return false;
        
        // Create the same vendor ID logic as in getVendorChildren
        const vendorName = t.description || 'Unknown Vendor';
        const expectedVendorId = `vendor_${vendorName}`;
        
        // Match by vendor ID to properly group transactions
        return expectedVendorId === vendorId;
      })
      .map(t => ({
        id: `transaction_${t.id}`,
        name: t.description,
        type: 'transaction',
        parent: item.id,
        is_custom: false,
        user: null,
        originalTransaction: t, // Keep reference to original transaction data
        amount: Math.abs(parseFloat(t.aud_amount || t.amount_aud || 0)),
        date: t.transaction_date,
        direction: t.direction
      }))
      .sort((a, b) => new Date(b.date) - new Date(a.date)); // Sort by date, newest first
  }, [item.id, item.type, item.parent, item.name, transactions]);

  // Determine which children to display based on item type
  const displayChildren = useMemo(() => {
    if (!item || item.type !== 'category') return [];
    
    const children = allItems.filter(child => child.parent === item.id);
    
    // Sort children: categories first, then vendors, then transactions
    return children.sort((a, b) => {
      const typeOrder = { category: 0, vendor: 1, transaction: 2 };
      const aOrder = typeOrder[a.type] || 3;
      const bOrder = typeOrder[b.type] || 3;
      
      if (aOrder !== bOrder) return aOrder - bOrder;
      
      // Within the same type, sort by name
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [allItems, item]);

  // Calculate totals and vendor data
  const categoryTotal = useMemo(() => {
    if (!showSpendingTotals || item.type !== 'category') return 0;
    return categorySpendingTotals[item.id] || calculateCategoryTotal(item.id);
  }, [showSpendingTotals, item.id, item.type, categorySpendingTotals, calculateCategoryTotal]);

  const hasChildren = displayChildren.length > 0;

  // Handlers
  const handleToggleExpand = useCallback((e) => {
    e.stopPropagation();
    setIsExpanded(!isExpanded);
  }, [isExpanded]);

  const handleSelect = useCallback(() => {
    onSelectNode(item);
    if (item.type === 'category' && onCategorySelect) {
      onCategorySelect(item);
    } else if (item.type === 'vendor' && onVendorSelect) {
      onVendorSelect(item);
    } else if (item.type === 'transaction' && onTransactionSelect) {
      onTransactionSelect(item);
    }
  }, [item, onSelectNode, onCategorySelect, onVendorSelect, onTransactionSelect]);

  const handleTransactionInfoClick = (e) => {
    e.stopPropagation();
    if (item.type === 'transaction' && onTransactionInfo) {
      const transactionToPass = item.originalTransaction || item;
      onTransactionInfo(transactionToPass);
    }
  };

  // Category editing handlers
  const handleEditCategoryClick = (e) => {
    e.stopPropagation();
    if (item.type !== 'category' || !isUserOwnedContext) return;
    setEditedCategoryName(item.name);
    setIsEditingCategory(true);
    setCategoryEditError(null);
  };

  const handleSaveCategoryEdit = async () => {
    if (!editedCategoryName.trim()) {
      setCategoryEditError('Category name cannot be empty');
      return;
    }

    if (editedCategoryName.trim() === item.name) {
      handleCancelCategoryEdit();
      return;
    }

    try {
      if (onRenameCategory) {
        await onRenameCategory(item.id, editedCategoryName.trim());
        setIsEditingCategory(false);
        setEditedCategoryName('');
        setCategoryEditError(null);
      }
    } catch (error) {
      setCategoryEditError(error.message || 'Failed to rename category');
    }
  };

  const handleCancelCategoryEdit = () => {
    setIsEditingCategory(false);
    setEditedCategoryName('');
    setCategoryEditError(null);
  };

  // Context menu handlers
  const handleContextMenuClick = (e) => {
    e.stopPropagation();
    setShowContextMenu(!showContextMenu);
  };

  const handleContextMenuAction = (action) => {
    setShowContextMenu(false);
    
    switch (action) {
      case 'edit':
        if (item.type === 'category') {
          handleEditCategoryClick({ stopPropagation: () => {} });
        } else if (item.type === 'vendor') {
          handleEditVendorClick({ stopPropagation: () => {} });
        }
        break;
      case 'create':
        handleAddChildClick({ stopPropagation: () => {} });
        break;
      case 'delete':
        handleDeleteClick({ stopPropagation: () => {} });
        break;
      case 'info':
        handleTransactionInfoClick({ stopPropagation: () => {} });
        break;
      default:
        break;
    }
  };

  // Existing handlers
  const handleAddChildClick = (e) => {
     e.stopPropagation();
     if (item.type !== 'category') return;
     setShowAddInput(true);
     setNewChildName('');
     setAddChildError(null);
  }

  const handleCancelAddChild = () => {
      setShowAddInput(false);
      setNewChildName('');
      setAddChildError(null);
  }

  const handleNewChildNameChange = (e) => {
      setNewChildName(e.target.value);
      setAddChildError(null);
  }

  const handleSaveNewChild = async (e) => {
      e.stopPropagation();
      if (item.type !== 'category' || !newChildName.trim() || isSavingChild || isCreating || isDeleting) return;
      if (!onCreateCategory) return; // Should not happen if button is shown

      setIsSavingChild(true);
      setAddChildError(null);
      try {
          await onCreateCategory(newChildName.trim(), item.id);
          handleCancelAddChild();
      } catch (error) {
          console.error("Error saving child category:", error);
          setAddChildError(error.message || "Could not save category.");
      } finally {
          setIsSavingChild(false);
      }
  }

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    if (item.type !== 'category' || isDeleting || isCreating) return;
    if (!onDeleteCategory) return; // Should not happen if button is shown

    const confirmDelete = window.confirm(
      `Are you sure you want to delete the category "${item.name}"?\n\n` +
      `- Transactions in this category will become uncategorized.\n` +
      `- Sub-categories will be moved up one level.\n` +
      `- Mapping rules pointing to this category will be unassigned.`
    );
    if (confirmDelete) {
      onDeleteCategory(item.id);
    }
  };

  // Vendor editing handler
  const handleEditVendorClick = (e) => {
    e.stopPropagation();
    if (item.type !== 'vendor') return;
    
    // Call the parent's onVendorEdit handler with the vendor name
    if (onVendorEdit) {
      onVendorEdit(item.name);
    }
  };

  const getContextMenuItems = () => {
    switch (item.type) {
      case 'category':
        if (!isUserOwnedContext) return [];
        return [
          { id: 'edit', label: 'Rename', icon: <FiEdit3 /> },
          { id: 'create', label: 'Add Subcategory', icon: <FiPlusCircle /> },
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

  // Selection states
  const isSelected = (item.type === 'category' && selectedCategoryId === item.id) || 
                   (item.type === 'vendor' && selectedVendorId === item.id) ||
                   (item.type === 'transaction' && selectedTransactionId === item.id);
  const isDisabled = isCreating || isSavingChild || (item.type === 'category' && isDeleting); 
  const isUserOwnedContext = item.user !== null && item.is_custom === true; 

  useEffect(() => {
    if (collapseAllTrigger) {
      setIsExpanded(false);
    }
  }, [collapseAllTrigger]);

  if (visibleItemIds !== null && !visibleItemIds.has(item.id)) {
    return null; 
  }

  const contextMenuItems = getContextMenuItems();

  return (
    <div className={`category-tree-node item-type-${item.type} ${isSelected ? 'selected' : ''}`} style={{ paddingLeft: `${level * 20}px` }}>
      <div 
        className={`node-content ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`} 
        onClick={!isDisabled ? handleSelect : undefined}
        tabIndex={enableSmartInteractions && !isDisabled ? 0 : -1}
        role="treeitem"
        aria-expanded={item.type === 'category' ? isExpanded : undefined}
        aria-selected={isSelected}
        aria-label={`${item.type === 'category' ? 'Category' : item.type === 'vendor' ? 'Vendor' : 'Transaction'}: ${item.name}${
          item.type === 'category' && showSpendingTotals && categoryTotal !== 0 
            ? `, spending total: ${formatCurrency(categoryTotal)}` 
            : ''
        }`}
        onMouseLeave={() => setShowContextMenu(false)}
      >
        <span className="expand-icon" onClick={!isDisabled && hasChildren ? handleToggleExpand : undefined}>
          {hasChildren ? 
            (isExpanded ? <FiChevronDown size="14" /> : <FiChevronRight size="14" />) : 
            (<span className="spacer"></span>)
          }
        </span>
        
        {/* Enhanced icons for different node types */}
        {item.type === 'category' && (
          <span className="node-icon category-icon">
            {isExpanded ? <FiFolder size="16" /> : <FiFolder size="16" />}
          </span>
        )}
        {item.type === 'vendor' && <FiTag size="14" className="node-icon vendor-icon" title="Vendor"/>}
        {item.type === 'transaction' && <FiDollarSign size="14" className="node-icon transaction-icon" title="Transaction"/>}
        
        {/* Category name with editing capability */}
        {item.type === 'category' && !isEditingCategory && (
          <span className="node-name category-name">
            {item.name}
          </span>
        )}
        
        {/* Category editing input */}
        {item.type === 'category' && isEditingCategory && (
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
        )}

        {/* Vendor name */}
        {item.type === 'vendor' && (
          <span className="node-name vendor-name">
            {item.name}
          </span>
        )}
        
        {/* Transaction name and details */}
        {item.type === 'transaction' && (
          <span className="node-name transaction-name">
            {item.name}
            <span className={`transaction-amount ${item.direction === 'DEBIT' ? 'debit' : 'credit'}`}>
              {formatCurrency(Math.abs(item.amount || 0))}
            </span>
          </span>
        )}
        
        {/* Spending totals for categories */}
        {item.type === 'category' && showSpendingTotals && categoryTotal !== 0 && (
          <span className="spending-total">
            {formatCurrency(categoryTotal)}
          </span>
        )}

        {/* Context Menu Actions */}
        {!isEditingCategory && contextMenuItems.length > 0 && (
          <div className="node-actions">
            <div className="context-menu-container">
              <button
                onClick={handleContextMenuClick}
                className="context-menu-button"
                title="More actions"
              >
                <FiMoreVertical size="14" />
              </button>
              
              {showContextMenu && (
                <div className="context-menu">
                  {contextMenuItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => handleContextMenuAction(item.id)}
                      className="context-menu-item"
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Category editing error */}
      {item.type === 'category' && categoryEditError && (
        <div className="category-edit-error" style={{ paddingLeft: `${(level + 1) * 20}px` }}>
          {categoryEditError}
        </div>
      )}



      {item.type === 'category' && showAddInput && (
          <div className="add-child-input-area" style={{ paddingLeft: `${(level + 1) * 10}px` }}>
              <input
                  type="text"
                  value={newChildName}
                  onChange={handleNewChildNameChange}
                  placeholder="New sub-category name..."
                  disabled={isSavingChild || isCreating || isDeleting}
                  autoFocus
              />
              <button onClick={handleSaveNewChild} disabled={!newChildName.trim() || isSavingChild || isCreating || isDeleting} title="Save">
                  {isSavingChild ? <FiLoader size="14" className="spinner-inline"/> : <FiSave size="14"/>}
              </button>
              <button onClick={handleCancelAddChild} disabled={isSavingChild || isCreating || isDeleting} title="Cancel">
                  <FiXCircle size="14"/>
              </button>
              {addChildError && <span className="inline-error-text">{addChildError}</span>}
          </div>
      )}

      {/* New unified children rendering for all node types */}
      {isExpanded && hasChildren && (
        <div className="node-children">
          {displayChildren.map(childItem => (
            <CategoryTreeNode
              key={childItem.id}
              item={childItem}
              allItems={allItems}
              visibleItemIds={visibleItemIds}
              level={level + 1}
              onSelectNode={onSelectNode}
              onCategorySelect={onCategorySelect}
              onVendorSelect={onVendorSelect}
              onTransactionSelect={onTransactionSelect}
              onTransactionInfo={onTransactionInfo}
              onCreateCategory={onCreateCategory}
              onDeleteCategory={onDeleteCategory}
              onRenameCategory={onRenameCategory}
              onVendorEdit={onVendorEdit} // Pass the new prop
              isCreating={isCreating}
              isDeleting={onDeleteCategory ? isDeleting : false}
              transactions={transactions}
              categorySpendingTotals={categorySpendingTotals}
              selectedCategoryId={selectedCategoryId}
              selectedVendorId={selectedVendorId}
              selectedTransactionId={selectedTransactionId}
              showSpendingTotals={showSpendingTotals}
              enableSmartInteractions={enableSmartInteractions}
              collapseAllTrigger={collapseAllTrigger}
            />
          ))}
        </div>
      )}
    </div>
  );
};

CategoryTreeNode.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    name: PropTypes.string.isRequired,
    parent: PropTypes.oneOfType([PropTypes.string, PropTypes.number]), 
    user: PropTypes.number,
    is_custom: PropTypes.bool,
    type: PropTypes.oneOf(['category', 'vendor', 'transaction']).isRequired,
  }).isRequired,
  allItems: PropTypes.array.isRequired,
  visibleItemIds: PropTypes.instanceOf(Set), 
  level: PropTypes.number,
  onSelectNode: PropTypes.func,
  onCategorySelect: PropTypes.func,
  onVendorSelect: PropTypes.func,
  onTransactionSelect: PropTypes.func,
  onTransactionInfo: PropTypes.func,
  onCreateCategory: PropTypes.func,
  onDeleteCategory: PropTypes.func,
  onRenameCategory: PropTypes.func,
  onVendorEdit: PropTypes.func, // Add propType for onVendorEdit
  isCreating: PropTypes.bool, 
  isDeleting: PropTypes.bool,
  transactions: PropTypes.array,
  categorySpendingTotals: PropTypes.object,
  selectedCategoryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectedVendorId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectedTransactionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  showSpendingTotals: PropTypes.bool,
  enableSmartInteractions: PropTypes.bool,
  collapseAllTrigger: PropTypes.number,
};

export default CategoryTreeNode;