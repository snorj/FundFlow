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
  FiX
} from 'react-icons/fi';
import { formatCurrency } from '../../utils/formatting';
import transactionService from '../../services/transactions';

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
  const [isExpanded, setIsExpanded] = useState(level < 2 && item.type !== 'transaction'); 
  const [showAddInput, setShowAddInput] = useState(false);
  const [newChildName, setNewChildName] = useState('');
  const [isSavingChild, setIsSavingChild] = useState(false);
  const [addChildError, setAddChildError] = useState(null);
  
  // Vendor editing state
  const [isEditingVendor, setIsEditingVendor] = useState(false);
  const [editedVendorName, setEditedVendorName] = useState('');
  const [isUpdatingVendor, setIsUpdatingVendor] = useState(false);
  const [vendorEditError, setVendorEditError] = useState(null);

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
    return categorySpendingTotals[item.id] || calculateCategoryTotal(item.id);
  }, [item.id, item.type, categorySpendingTotals, calculateCategoryTotal]);

  const hasChildren = displayChildren.length > 0;

  // Event handlers
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
    e.stopPropagation();
    if (item.type === 'category' && hasChildren) {
      setIsExpanded(!isExpanded);
    }
  }, [item.type, hasChildren, isExpanded]);

  const handleTransactionInfoClick = (e) => {
    e.stopPropagation();
    if (item.type === 'transaction' && onTransactionInfo) {
      const transactionToPass = item.originalTransaction || item;
      onTransactionInfo(transactionToPass);
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

  // Vendor editing handlers
  const handleEditVendorClick = (e) => {
    e.stopPropagation();
    if (item.type !== 'vendor' || isUpdatingVendor) return;
    setIsEditingVendor(true);
    setEditedVendorName(item.name || '');
    setVendorEditError(null);
  };

  const handleSaveVendor = async (e) => {
    e.stopPropagation();
    if (!editedVendorName.trim()) {
      setVendorEditError('Vendor name cannot be empty');
      return;
    }

    if (editedVendorName.trim() === item.name) {
      handleCancelVendorEdit();
      return;
    }

    setIsUpdatingVendor(true);
    setVendorEditError(null);

    try {
      // Find all transactions for this vendor
      const vendorTransactions = transactions.filter(t => {
        if (t.category !== item.parent) return false;
        const vendorName = t.description || 'Unknown Vendor';
        const expectedVendorId = `vendor_${vendorName}`;
        return expectedVendorId === item.id;
      });

      // Update all transactions with the new vendor name
      const promises = vendorTransactions.map(transaction => 
        transactionService.updateTransactionDescription(transaction.id, editedVendorName.trim())
      );
      
      await Promise.all(promises);
      
      // Reset editing state
      setIsEditingVendor(false);
      setEditedVendorName('');
      
      // Trigger a refresh of transaction data in the parent component
      // This will cause the vendor name to be updated in the tree
      if (window.location.pathname === '/categorise') {
        // For the manage categories page, we might need to refresh the data
        window.location.reload();
      }
      
    } catch (error) {
      console.error('Failed to update vendor name:', error);
      setVendorEditError(error.message || 'Failed to update vendor name');
    } finally {
      setIsUpdatingVendor(false);
    }
  };

  const handleCancelVendorEdit = () => {
    setIsEditingVendor(false);
    setEditedVendorName('');
    setVendorEditError(null);
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

  return (
    <div className={`category-tree-node item-type-${item.type} ${isSelected ? 'selected' : ''}`} style={{ paddingLeft: `${level * 20}px` }}>
      <div 
        className={`node-content ${isSelected ? 'selected' : ''} ${isDisabled ? 'disabled' : ''}`} 
        onClick={!isDisabled ? handleSelect : undefined}
        onDoubleClick={!isDisabled ? handleDoubleClick : undefined}
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
            {isExpanded ? <FiFolder size="16" /> : <FiFolder size="16" />}
          </span>
        )}
        {item.type === 'vendor' && <FiTag size="14" className="node-icon vendor-icon" title="Vendor"/>}
        {item.type === 'transaction' && <FiDollarSign size="14" className="node-icon transaction-icon" title="Transaction"/>}
        
        {/* Vendor name with editing capability */}
        {item.type === 'vendor' && !isEditingVendor && (
          <span className="node-name vendor-name">
            {item.name}
            <button 
              className="vendor-edit-button"
              onClick={handleEditVendorClick}
              title="Edit vendor name"
              disabled={isUpdatingVendor || isDeleting || isCreating}
            >
              <FiEdit3 size="12" />
            </button>
          </span>
        )}
        
        {/* Vendor editing input */}
        {item.type === 'vendor' && isEditingVendor && (
          <div className="vendor-edit-form">
            <input
              type="text"
              value={editedVendorName}
              onChange={(e) => setEditedVendorName(e.target.value)}
              className="vendor-edit-input"
              disabled={isUpdatingVendor}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveVendor(e);
                if (e.key === 'Escape') handleCancelVendorEdit();
              }}
            />
            <div className="vendor-edit-actions">
              <button 
                onClick={handleSaveVendor}
                disabled={isUpdatingVendor || !editedVendorName.trim()}
                className="vendor-save-button"
                title="Save"
              >
                {isUpdatingVendor ? <FiLoader size="12" className="spinner-inline" /> : <FiCheck size="12" />}
              </button>
              <button 
                onClick={handleCancelVendorEdit}
                disabled={isUpdatingVendor}
                className="vendor-cancel-button"
                title="Cancel"
              >
                <FiX size="12" />
              </button>
            </div>
          </div>
        )}
        
        {/* Regular node name for non-vendor items and non-transaction items under vendors */}
        {item.type !== 'vendor' && !(item.type === 'transaction' && level > 0 && allItems.find(parent => parent.id === item.parent)?.type === 'vendor') && <span className="node-name">{item.name}</span>}
        
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
              {formatCurrency(item.amount || 0, item.direction)}
            </span>
            <span className="transaction-date">
              {new Date(item.date).toLocaleDateString('en-AU', { 
                day: '2-digit', 
                month: '2-digit',
                year: '2-digit'
              })}
            </span>
            <button 
              className="action-button-icon transaction-info-button" 
              title={`View details for transaction`}
              onClick={handleTransactionInfoClick} 
              disabled={isDisabled}
            >
              <FiInfo size="14"/>
            </button>
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

      {/* Vendor editing error */}
      {item.type === 'vendor' && vendorEditError && (
        <div className="vendor-edit-error" style={{ paddingLeft: `${(level + 1) * 20}px` }}>
          {vendorEditError}
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