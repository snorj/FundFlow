import React, { useState, useMemo, useCallback } from 'react';
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
  FiShoppingBag,
  FiFolder,
  FiFolderPlus
} from 'react-icons/fi';

const CategoryTreeNode = ({
  item, // Can be category, vendor, or transaction
  allItems, // All categories and vendors
  visibleItemIds,
  level = 0,
  onSelectNode = () => {},
  onCategorySelect,
  onVendorSelect,
  onTransactionSelect, // New prop for transaction selection
  pendingSelectionId = null,
  onCreateCategory,
  onDeleteCategory,
  isCreating,
  isDeleting,
  // Enhanced functionality props
  transactions = [], // All transactions for calculating totals and creating vendor children
  categorySpendingTotals = {},
  vendorsByCategory = {},
  selectedCategoryId = null,
  selectedVendorId = null,
  selectedTransactionId = null, // New prop for transaction selection
  showSpendingTotals = true,
  showVendorCounts = true,
  enableSmartInteractions = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(level < 2 && item.type !== 'transaction'); 
  const [showAddInput, setShowAddInput] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [isSavingChild, setIsSavingChild] = useState(false);
  const [addChildError, setAddChildError] = useState(null);

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

  // Format currency amount in AUD
  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }, []);

  // Get vendor children for categories (vendors that have transactions in this category)
  const getVendorChildren = useCallback(() => {
    if (item.type !== 'category') return [];
    
    const transactionsArray = Array.isArray(transactions) ? transactions : [];
    const vendorMap = {};
    
    // Group transactions by vendor for this category
    transactionsArray
      .filter(t => t.category === item.id)
      .forEach(t => {
        const vendorName = t.vendor_name || t.description || 'Unknown Vendor';
        const vendorId = t.vendor_id || `vendor_${vendorName}`;
        
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
    const vendorName = item.name;
    
    // Find transactions for this vendor under the parent category
    return transactionsArray
      .filter(t => {
        if (t.category !== item.parent) return false;
        const txVendorName = t.vendor_name || t.description || 'Unknown Vendor';
        return txVendorName === vendorName;
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
    if (item.type === 'transaction') return []; // Transactions don't have children

    if (item.type === 'vendor') {
      // Vendors show their transactions
      return getTransactionChildren();
    }
    
    if (item.type === 'category') {
      // Categories show subcategories AND vendors
      const subcategories = allItems.filter(child => 
        child.parent === item.id && child.type === 'category'
      );
      const vendorChildren = getVendorChildren();
      
      const allChildren = [...subcategories, ...vendorChildren];
      
      if (visibleItemIds === null) {
        return allChildren;
      }
      return allChildren.filter(child => visibleItemIds.has(child.id));
    }
    
    return [];
  }, [allItems, item.id, item.type, visibleItemIds, getVendorChildren, getTransactionChildren]);

  // Calculate totals and vendor data
  const categoryTotal = useMemo(() => {
    if (item.type !== 'category') return 0;
    // Use pre-calculated totals if available, otherwise calculate
    const total = categorySpendingTotals[item.id] || calculateCategoryTotal(item.id);
    if (total > 0) {
      console.log(`💰 CategoryTreeNode: Category "${item.name}" total: ${formatCurrency(total)}`);
    }
    return total;
  }, [item.id, item.type, item.name, categorySpendingTotals, calculateCategoryTotal, formatCurrency]);

  const hasChildren = displayChildren.length > 0;
  const hasSubcategories = displayChildren.filter(child => child.type === 'category').length > 0;
  const hasVendors = displayChildren.filter(child => child.type === 'vendor').length > 0;
  const hasTransactions = displayChildren.filter(child => child.type === 'transaction').length > 0;

  // Event handlers with smart interactions
  const handleToggleExpand = useCallback((e) => { 
    e.stopPropagation(); 
    if (item.type !== 'transaction' && hasChildren) {
      setIsExpanded(!isExpanded);
    }
  }, [item.type, hasChildren, isExpanded]);

  const handleSelect = useCallback(() => { 
    if (!enableSmartInteractions) return;
    
    if (item.type === 'category') {
      onSelectNode(item.id);
      if (onCategorySelect) onCategorySelect(item);
    } else if (item.type === 'vendor') {
      if (onVendorSelect) onVendorSelect(item);
    } else if (item.type === 'transaction') {
      if (onTransactionSelect) onTransactionSelect(item);
    }
  }, [item, enableSmartInteractions, onSelectNode, onCategorySelect, onVendorSelect, onTransactionSelect]);

  const handleDoubleClick = useCallback((e) => {
    if (!enableSmartInteractions) return;
    e.stopPropagation();
    
    // Double click to edit (more robust implementation)
    if (item.type === 'category' && item.is_custom) {
      // TODO: Implement inline editing for user-owned categories
      console.log(`Edit category "${item.name}" (ID: ${item.id})`);
      // This could trigger an inline editing mode or open an edit modal
    } else if (item.type === 'vendor') {
      // TODO: Implement vendor editing
      console.log(`Edit vendor "${item.name}" (ID: ${item.id})`);
    } else {
      console.log(`Cannot edit system category "${item.name}"`);
    }
  }, [item, enableSmartInteractions]);

  const handleRightClick = useCallback((e) => {
    if (!enableSmartInteractions) return;
    e.preventDefault();
    e.stopPropagation();
    
    // Right click context menu (enhanced implementation)
    const contextMenuItems = [];
    
    if (item.type === 'category') {
      if (item.is_custom) {
        contextMenuItems.push(
          { label: 'Edit Category', action: () => console.log(`Edit category ${item.name}`) },
          { label: 'Add Subcategory', action: () => console.log(`Add subcategory to ${item.name}`) },
          { label: 'Delete Category', action: () => console.log(`Delete category ${item.name}`) },
          { separator: true },
          { label: 'View Transactions', action: () => console.log(`View transactions for ${item.name}`) }
        );
      } else {
        contextMenuItems.push(
          { label: 'Add Subcategory', action: () => console.log(`Add subcategory to ${item.name}`) },
          { label: 'View Transactions', action: () => console.log(`View transactions for ${item.name}`) }
        );
      }
    } else if (item.type === 'vendor') {
      contextMenuItems.push(
        { label: 'Edit Vendor', action: () => console.log(`Edit vendor ${item.name}`) },
        { label: 'View Transactions', action: () => console.log(`View transactions for ${item.name}`) },
        { label: 'Merge with Another Vendor', action: () => console.log(`Merge vendor ${item.name}`) }
      );
    }
    
    // TODO: Implement actual context menu component
    console.log(`Context menu for ${item.type} "${item.name}":`, contextMenuItems);
  }, [item, enableSmartInteractions]);

  const handleKeyDown = useCallback((e) => {
    if (!enableSmartInteractions) return;
    
    switch (e.key) {
      case 'Enter':
        // Enter key selects the item
        e.preventDefault();
        handleSelect();
        break;
      case ' ':
        // Space key toggles expansion for categories and vendors
        e.preventDefault();
        if ((item.type === 'category' || item.type === 'vendor') && hasChildren) {
          handleToggleExpand(e);
        }
        break;
      case 'ArrowRight':
        // Right arrow expands categories and vendors
        e.preventDefault();
        if ((item.type === 'category' || item.type === 'vendor') && hasChildren && !isExpanded) {
          setIsExpanded(true);
        }
        break;
      case 'ArrowLeft':
        // Left arrow collapses categories and vendors
        e.preventDefault();
        if ((item.type === 'category' || item.type === 'vendor') && hasChildren && isExpanded) {
          setIsExpanded(false);
        }
        break;
      case 'F2':
        // F2 key triggers edit mode
        e.preventDefault();
        handleDoubleClick(e);
        break;
      case 'Delete':
        // Delete key for user-owned categories
        e.preventDefault();
        if (item.type === 'category' && item.is_custom && onDeleteCategory) {
          handleDeleteClick(e);
        }
        break;
      default:
        // Allow other keys to bubble up
        break;
    }
  }, [item, enableSmartInteractions, handleSelect, handleToggleExpand, handleDoubleClick, hasChildren, isExpanded, onDeleteCategory]);

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

  // Selection states
  const isSelected = (item.type === 'category' && selectedCategoryId === item.id) || 
                   (item.type === 'vendor' && selectedVendorId === item.id) ||
                   (item.type === 'transaction' && selectedTransactionId === item.id) ||
                   pendingSelectionId === item.id;
  const isDisabled = isCreating || isSavingChild || (item.type === 'category' && isDeleting); 
  const isUserOwnedContext = item.user !== null && item.is_custom === true; 

  if (visibleItemIds !== null && !visibleItemIds.has(item.id)) {
    return null; 
  }

  return (
    <div className={`category-tree-node item-type-${item.type} ${isSelected ? 'selected' : ''}`} style={{ paddingLeft: `${level * 20}px` }}>
      <div 
        className={`node-content ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`} 
        onClick={!isDisabled ? handleSelect : undefined}
        onDoubleClick={!isDisabled ? handleDoubleClick : undefined}
        onContextMenu={!isDisabled ? handleRightClick : undefined}
        onKeyDown={!isDisabled ? handleKeyDown : undefined}
        tabIndex={enableSmartInteractions && !isDisabled ? 0 : -1}
        role="treeitem"
        aria-expanded={item.type === 'category' ? isExpanded : undefined}
        aria-selected={isSelected}
        aria-label={`${item.type === 'category' ? 'Category' : item.type === 'vendor' ? 'Vendor' : 'Transaction'}: ${item.name}${
          item.type === 'category' && showSpendingTotals && categoryTotal !== 0 
            ? `, spending total: ${formatCurrency(categoryTotal)}` 
            : ''
        }`}
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
            {isExpanded ? <FiFolderPlus size="16" /> : <FiFolder size="16" />}
          </span>
        )}
        {item.type === 'vendor' && <FiTag size="14" className="node-icon vendor-icon" title="Vendor"/>}
        {item.type === 'transaction' && <FiDollarSign size="14" className="node-icon transaction-icon" title="Transaction"/>}
        
        <span className="node-name">{item.name}</span>
        
        {/* Amount display for different node types */}
        {item.type === 'category' && showSpendingTotals && categoryTotal !== 0 && (
          <span className="category-amount">
            <FiDollarSign size="12" />
            {formatCurrency(categoryTotal)}
          </span>
        )}
        
        {item.type === 'vendor' && (
          <span className="vendor-amount">
            <FiDollarSign size="12" />
            {formatCurrency(item.totalAmount || 0)}
            <span className="transaction-count">• {item.transactionCount || 0} txn{(item.transactionCount || 0) !== 1 ? 's' : ''}</span>
          </span>
        )}
        
        {item.type === 'transaction' && (
          <span className="transaction-details">
            <span className={`transaction-amount ${item.direction === 'DEBIT' ? 'debit' : 'credit'}`}>
              {item.direction === 'DEBIT' ? '-' : '+'}
              {formatCurrency(item.amount || 0)}
            </span>
            <span className="transaction-date">
              {new Date(item.date).toLocaleDateString('en-AU', { 
                day: '2-digit', 
                month: '2-digit',
                year: '2-digit'
              })}
            </span>
          </span>
        )}
        
        {item.type === 'category' && (
          <div className="node-actions">
            {isUserOwnedContext && !isDeleting && (
              <button 
                className="action-button-icon delete-category-button" 
                title={`Delete category ${item.name}`}
                onClick={handleDeleteClick} 
                disabled={isDisabled}
              >
                <FiTrash2 size="14"/>
              </button>
            )}
            {isUserOwnedContext && isDeleting && (
              <FiLoader size="14" className="spinner-inline" title="Deleting..."/>
            )}
            {isUserOwnedContext && (
                 <button 
                    className="action-button-icon add-child-button" 
                    title={`Add sub-category to ${item.name}`} 
                    onClick={!isDisabled ? handleAddChildClick : undefined} 
                    disabled={isDisabled}
                >
            <FiPlusCircle size="14"/>
        </button>
            )}
          </div>
        )}
      </div>

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
              pendingSelectionId={pendingSelectionId}
              onCreateCategory={onCreateCategory}
              onDeleteCategory={onDeleteCategory}
              isCreating={isCreating}
              isDeleting={onDeleteCategory ? isDeleting : false}
              // Pass through enhanced props
              transactions={transactions}
              categorySpendingTotals={categorySpendingTotals}
              vendorsByCategory={vendorsByCategory}
              selectedCategoryId={selectedCategoryId}
              selectedVendorId={selectedVendorId}
              selectedTransactionId={selectedTransactionId}
              showSpendingTotals={showSpendingTotals}
              showVendorCounts={showVendorCounts}
              enableSmartInteractions={enableSmartInteractions}
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
    user: PropTypes.number, // User ID or null for system categories
    is_custom: PropTypes.bool, // True for user categories and vendors
    type: PropTypes.oneOf(['category', 'vendor', 'transaction']).isRequired,
  }).isRequired,
  allItems: PropTypes.array.isRequired,
  visibleItemIds: PropTypes.instanceOf(Set), 
  level: PropTypes.number,
  onSelectNode: PropTypes.func,
  onCategorySelect: PropTypes.func,
  onVendorSelect: PropTypes.func,
  onTransactionSelect: PropTypes.func,
  pendingSelectionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.oneOf([null])]),
  onCreateCategory: PropTypes.func,
  onDeleteCategory: PropTypes.func,
  isCreating: PropTypes.bool, 
  isDeleting: PropTypes.bool,
  transactions: PropTypes.array,
  categorySpendingTotals: PropTypes.object,
  vendorsByCategory: PropTypes.object,
  selectedCategoryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectedVendorId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  selectedTransactionId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  showSpendingTotals: PropTypes.bool,
  showVendorCounts: PropTypes.bool,
  enableSmartInteractions: PropTypes.bool,
};

export default CategoryTreeNode;