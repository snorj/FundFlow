import React, { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Tree } from 'react-arborist';
import { 
  FiFolder, 
  FiTag,
  FiDollarSign,
  FiMoreVertical,
  FiChevronRight,
  FiEdit3,
  FiTrash2,
  FiPlus,
  FiCopy,
  FiCheck,
  FiX
} from 'react-icons/fi';
import { formatCurrency } from '../../utils/formatting';
import vendorRuleService from '../../services/vendorRules';
import VendorRuleUpdateModal from '../modals/VendorRuleUpdateModal';
import CategoryCreationModal from '../modals/CategoryCreationModal';
import './CategoryTreeEditor.css';

const CategoryTreeEditor = React.memo(({ 
  data, 
  onMove, 
  onRename, 
  onSelect,
  onDelete,
  onCreateChild,
  onCreateRoot,
  onDuplicate,
  onCategoryCreated,
  transactions = [],
  categorySpendingTotals = {},
  selectedNodeId = null,
  className = ''
}) => {
  // State for inline editing and context menu
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, nodeId: null });
  const [validationError, setValidationError] = useState('');
  const [focusedNodeId, setFocusedNodeId] = useState(null);
  const [announceText, setAnnounceText] = useState('');
  
  // State for vendor rule update modal
  const [vendorRuleUpdateModal, setVendorRuleUpdateModal] = useState({
    isOpen: false,
    vendorName: '',
    oldCategoryName: '',
    newCategoryName: '',
    existingRule: null,
    newCategoryId: null,
    pendingMoveArgs: null,
    isChecking: false
  });
  
  // State for category creation modal
  const [categoryCreationModal, setCategoryCreationModal] = useState({
    isOpen: false,
    preSelectedParent: null
  });

  // State for vendor rules and visual feedback
  const [vendorRules, setVendorRules] = useState(new Map());
  const [recentlyMovedNodes, setRecentlyMovedNodes] = useState(new Set());
  const [processingNodes, setProcessingNodes] = useState(new Set());
  const [moveResults, setMoveResults] = useState(new Map()); // success/error tracking
  
  const editInputRef = useRef(null);
  const treeRef = useRef(null);

  // Load vendor rules on component mount
  useEffect(() => {
    const loadVendorRules = async () => {
      try {
        const response = await vendorRuleService.getVendorRules();
        const rulesMap = new Map();
        
        if (response.results) {
          response.results.forEach(rule => {
            // Map vendor names to rule data for quick lookup
            const vendorKey = rule.vendor_name || rule.vendor?.name;
            if (vendorKey) {
              rulesMap.set(vendorKey, rule);
            }
          });
        }
        
        setVendorRules(rulesMap);
      } catch (error) {
        console.error('Failed to load vendor rules:', error);
      }
    };

    loadVendorRules();
  }, []);

  // Clear move highlighting after animation
  useEffect(() => {
    if (recentlyMovedNodes.size > 0) {
      const timer = setTimeout(() => {
        setRecentlyMovedNodes(new Set());
        setMoveResults(new Map());
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [recentlyMovedNodes]);

  // Screen reader announcement function
  const announceToScreenReader = useCallback((message) => {
    setAnnounceText(message);
    // Clear the announcement after a short delay to allow for re-announcements
    setTimeout(() => setAnnounceText(''), 1000);
  }, []);

  // Function to add visual feedback for move operations
  const addMoveHighlight = useCallback((nodeId, result = 'moved') => {
    setRecentlyMovedNodes(prev => new Set([...prev, nodeId]));
    setMoveResults(prev => new Map([...prev, [nodeId, result]]));
    setProcessingNodes(prev => {
      const newSet = new Set(prev);
      newSet.delete(nodeId);
      return newSet;
    });
  }, []);

  // Function to show processing state
  const setNodeProcessing = useCallback((nodeId, processing = true) => {
    setProcessingNodes(prev => {
      const newSet = new Set(prev);
      if (processing) {
        newSet.add(nodeId);
      } else {
        newSet.delete(nodeId);
      }
      return newSet;
    });
  }, []);

  // Enhanced focus management
  // Note: focusNode function removed as it was unused

  // Memoized tree data transformation
  const treeData = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    // Transform flat data into tree structure with performance optimization
    const itemMap = new Map();
    const rootItems = [];
    
    // First pass: create map for O(1) lookups
    data.forEach(item => {
      itemMap.set(item.id, { ...item, children: [] });
    });
    
    // Second pass: build tree structure
    data.forEach(item => {
      const treeItem = itemMap.get(item.id);
      if (item.parent) {
        const parent = itemMap.get(item.parent);
        if (parent) {
          parent.children.push(treeItem);
        } else {
          rootItems.push(treeItem);
        }
      } else {
        rootItems.push(treeItem);
      }
    });
    
    return rootItems;
  }, [data]);

  // Memoized validation function
  const validateMove = useCallback((dragId, parentId, treeData) => {
    if (!dragId || dragId === parentId) return false;
    
    const dragNode = findNodeById(dragId, treeData);
    if (!dragNode) return false;
    
    // Prevent dropping a node onto its own descendant
    const isDescendant = (nodeId, potentialAncestorId) => {
      const node = findNodeById(nodeId, treeData);
      if (!node || !node.children) return false;
      
      return node.children.some(child => 
        child.id === potentialAncestorId || isDescendant(child.id, potentialAncestorId)
      );
    };
    
    return !isDescendant(dragId, parentId);
  }, []);

  // Memoized node renderer function for performance
  const renderNode = useCallback(({ node, style, dragHandle, tree }) => {
    const { isCategory, isVendor, isTransaction, name, amount, transactionCount, date } = node.data;
    const isSelected = selectedNodeId === node.id;
    const hasChildren = node.children && node.children.length > 0;
    const isOpen = node.isOpen;
    const vendorRule = vendorRules.get(name);
    const isHighlighted = recentlyMovedNodes.has(node.id);
    const isProcessing = processingNodes.has(node.id);
    const moveResult = moveResults.get(node.id);

    const handleClick = () => {
      if (editingNodeId === node.id) return; // Don't change selection while editing
      setFocusedNodeId(node.id);
      if (onSelect) {
        onSelect(node.data);
      }
      // Announce node selection to screen readers
      const nodeTypeLabel = isCategory ? 'category' : isVendor ? 'vendor' : 'transaction';
      const ruleStatus = vendorRule ? ' with auto-assignment rule' : '';
      announceToScreenReader(`Selected ${nodeTypeLabel}: ${name}${ruleStatus}`);
    };

    const handleDoubleClick = () => {
      // Double click to edit (unless it's a transaction)
      if (node.data.type !== 'transaction') {
        startEditing(node.id, name);
      } else if (hasChildren) {
        tree.toggle(node);
      }
    };

    const handleExpandClick = (e) => {
      e.stopPropagation();
      if (hasChildren) {
        const willBeOpen = !isOpen;
        tree.toggle(node);
        // Announce state change to screen readers
        const childCount = node.children ? node.children.length : 0;
        const stateText = willBeOpen ? 'expanded' : 'collapsed';
        announceToScreenReader(`${name} ${stateText}, ${childCount} child${childCount !== 1 ? 'ren' : ''}`);
      }
    };

    const handleRightClick = (e) => {
      // Only show context menu for categories and vendors (not transactions for now)
      if (node.data.type !== 'transaction') {
        showContextMenu(e, node.id);
      }
    };

    const handleKeyDown = (e) => {
      if (editingNodeId === node.id) {
        // Editing mode keyboard shortcuts
        if (e.key === 'Enter') {
          e.preventDefault();
          saveEdit();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          cancelEditing();
        }
      } else {
        // Navigation and action keyboard shortcuts
        switch (e.key) {
          case 'F2':
            if (node.data.type !== 'transaction') {
              e.preventDefault();
              startEditing(node.id, name);
            }
            break;
          
          case 'Enter':
          case ' ': // Space key
            if (hasChildren) {
              e.preventDefault();
              const willBeOpen = !isOpen;
              tree.toggle(node);
              // Announce state change to screen readers
              const childCount = node.children ? node.children.length : 0;
              const stateText = willBeOpen ? 'expanded' : 'collapsed';
              announceToScreenReader(`${name} ${stateText}, ${childCount} child${childCount !== 1 ? 'ren' : ''}`);
            }
            break;
          
          case 'ArrowRight':
            if (hasChildren && !isOpen) {
              e.preventDefault();
              tree.open(node);
              const childCount = node.children ? node.children.length : 0;
              announceToScreenReader(`${name} expanded, ${childCount} child${childCount !== 1 ? 'ren' : ''}`);
            }
            break;
          
          case 'ArrowLeft':
            if (hasChildren && isOpen) {
              e.preventDefault();
              tree.close(node);
              announceToScreenReader(`${name} collapsed`);
            }
            break;
          
          case 'Delete':
          case 'Backspace':
            if (node.data.type !== 'transaction' && !node.data.is_system) {
              e.preventDefault();
              if (onDelete) {
                onDelete({ id: node.id, node: node.data });
                announceToScreenReader(`Deleted ${node.data.type}: ${name}`);
              }
            }
            break;
          
          case '+':
          case 'Insert':
            if (node.data.type === 'category') {
              e.preventDefault();
              if (onCreateChild) {
                onCreateChild({ parentId: node.id, parentNode: node.data });
                announceToScreenReader(`Creating new child category in ${name}`);
              }
            }
            break;
          
          case 'c':
            if (e.ctrlKey || e.metaKey) {
              e.preventDefault();
              if (onDuplicate) {
                onDuplicate({ id: node.id, node: node.data });
                announceToScreenReader(`Duplicated ${node.data.type}: ${name}`);
              }
            }
            break;
          
          case 'ContextMenu':
            if (node.data.type !== 'transaction') {
              e.preventDefault();
              const rect = e.target.getBoundingClientRect();
              showContextMenu({
                preventDefault: () => {},
                stopPropagation: () => {},
                clientX: rect.right,
                clientY: rect.top
              }, node.id);
            }
            break;
          
          default:
            break;
        }
      }
    };

    const isEditing = editingNodeId === node.id;

    // Build dynamic class list for visual feedback
    const nodeClasses = [
      'tree-node',
      `${node.data.type}-node`,
      node.data.type,
      isSelected ? 'selected' : '',
      hasChildren ? 'has-children' : '',
      isOpen ? 'expanded' : 'collapsed',
      isEditing ? 'editing' : '',
      isHighlighted ? 'recently-moved' : '',
      isProcessing ? 'processing' : '',
      moveResult === 'success' ? 'move-success' : '',
      moveResult === 'error' ? 'move-error' : ''
    ].filter(Boolean).join(' ');

    return (
      <div 
        className={nodeClasses}
        style={style}
        ref={dragHandle}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleRightClick}
        onKeyDown={handleKeyDown}
        role="treeitem"
        aria-selected={isSelected}
        aria-expanded={hasChildren ? isOpen : undefined}
        aria-level={node.level + 1}
        aria-setsize={node.parent?.children?.length || treeData.length}
        aria-posinset={node.index + 1}
        aria-label={`${node.data.type}: ${name}${amount > 0 ? `, ${formatCurrency(amount)}` : ''}${hasChildren ? `, ${node.children.length} child${node.children.length !== 1 ? 'ren' : ''}` : ''}${vendorRule ? ' with auto-assignment rule' : ''}`}
        aria-describedby={`node-description-${node.id}`}
        tabIndex={focusedNodeId === node.id ? 0 : -1}
        data-node-id={node.id}
        data-node-type={node.data.type}
      >
        {/* Connection lines for visual hierarchy */}
        <div className="node-connection-line" />
        
        <div className="node-content">
          {/* Hidden description for screen readers */}
          <div id={`node-description-${node.id}`} className="sr-only">
            {node.data.type === 'category' && `Category with ${node.children?.length || 0} items`}
            {node.data.type === 'vendor' && `Vendor${transactionCount > 0 ? ` with ${transactionCount} transactions` : ''}`}
            {node.data.type === 'transaction' && `Transaction${date ? ` from ${new Date(date).toLocaleDateString()}` : ''}`}
            {amount > 0 && `, total amount: ${formatCurrency(amount)}`}
          </div>

          {/* Expand/Collapse indicator */}
          {hasChildren && (
            <button 
              className="expand-collapse-indicator"
              onClick={handleExpandClick}
              aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${name} with ${node.children.length} child${node.children.length !== 1 ? 'ren' : ''}`}
              tabIndex={-1}
            >
              <FiChevronRight className={`chevron ${isOpen ? 'open' : ''}`} />
            </button>
          )}
          
          {/* Spacer for non-expandable items */}
          {!hasChildren && <div className="expand-spacer" />}

          {/* Icon with enhanced styling */}
          <span className={`node-icon ${isCategory ? 'category-icon' : ''} ${isVendor ? 'vendor-icon' : ''} ${isTransaction ? 'transaction-icon' : ''}`}>
                          {isCategory && <FiFolder />}
            {isVendor && <FiTag />}
            {isTransaction && <FiDollarSign />}
          </span>

          {/* Name with enhanced typography and inline editing */}
          <div className="node-label-container">
            {isEditing ? (
              <div className="inline-edit-container">
                <input
                  ref={editInputRef}
                  type="text"
                  value={editingValue}
                  onChange={(e) => setEditingValue(e.target.value)}
                  onBlur={saveEdit}
                  className={`inline-edit-input ${validationError ? 'error' : ''}`}
                  placeholder="Enter name..."
                />
                <div className="inline-edit-actions">
                  <button
                    className="inline-edit-action save"
                    onClick={saveEdit}
                    title="Save (Enter)"
                  >
                    <FiCheck />
                  </button>
                  <button
                    className="inline-edit-action cancel"
                    onClick={cancelEditing}
                    title="Cancel (Escape)"
                  >
                    <FiX />
                  </button>
                </div>
                {validationError && (
                  <div className="validation-error">{validationError}</div>
                )}
              </div>
            ) : (
              <span className="node-label" title={name}>
                {name}
              </span>
            )}
          </div>

          {/* Enhanced amount and count display */}
          {(isCategory || isVendor) && amount > 0 && (
            <span className="node-amount">
              <span className="amount-value">{formatCurrency(amount)}</span>
              {transactionCount > 0 && (
                <span className="transaction-count">{transactionCount} txn{transactionCount > 1 ? 's' : ''}</span>
              )}
            </span>
          )}

          {/* Transaction amount for individual transactions */}
          {isTransaction && amount > 0 && (
            <span className="node-amount transaction-amount">
              {formatCurrency(amount)}
            </span>
          )}

          {/* Enhanced date display */}
          {isTransaction && date && (
            <span className="node-date">
              {new Date(date).toLocaleDateString()}
            </span>
          )}

          {/* Vendor Rule Indicator */}
          {isVendor && vendorRule && (
            <div className="vendor-rule-indicator rule-active">
              <div className="vendor-rule-tooltip">
                Auto-rule: {vendorRule.category_name}
              </div>
            </div>
          )}

          {/* Context menu trigger */}
          {!isEditing && node.data.type !== 'transaction' && (
            <button 
              className="node-menu-trigger"
              onClick={(e) => {
                e.stopPropagation();
                showContextMenu(e, node.id);
              }}
              aria-label={`More options for ${name}`}
              aria-haspopup="menu"
              aria-expanded={contextMenu.visible && contextMenu.nodeId === node.id}
              tabIndex={-1}
            >
              <FiMoreVertical />
            </button>
          )}
        </div>
      </div>
    );
  }, [editingNodeId, editingValue, validationError, contextMenu, treeData, selectedNodeId, onSelect, showContextMenu, saveEdit, cancelEditing, vendorRules, recentlyMovedNodes, processingNodes, moveResults, onDelete, onCreateChild, onDuplicate, findNodeById]);

  // Optimized move handler with useCallback
  const handleMove = useCallback(async (args) => {
    const { dragIds, parentId } = args;
    
    // Validation logic to prevent invalid drops
    const isValidMove = validateMove(dragIds[0], parentId, treeData);
    
    if (!isValidMove) {
      console.warn('Invalid move operation prevented');
      return;
    }

    const dragNode = findNodeById(dragIds[0], treeData);
    const targetParent = parentId ? findNodeById(parentId, treeData) : null;

    // Check if this is a vendor being moved to a different category
    if (dragNode && dragNode.type === 'vendor' && targetParent && targetParent.type === 'category') {
      // Set processing state
      setProcessingNodes(prev => new Set([...prev, dragNode.id]));
      
      try {
        // Check for existing vendor rules
        setVendorRuleUpdateModal(prev => ({
          ...prev,
          isChecking: true
        }));
        
        const existingRules = await vendorRuleService.getVendorRules({
          vendor_name: dragNode.name
        });
        
        const conflictingRule = existingRules.find(rule => 
          rule.vendor_name === dragNode.name && 
          rule.category_id !== targetParent.id &&
          rule.is_persistent
        );
        
        if (conflictingRule) {
          // Show vendor rule update modal
          setVendorRuleUpdateModal({
            isOpen: true,
            vendorName: dragNode.name,
            oldCategoryName: conflictingRule.category_name,
            newCategoryName: targetParent.name,
            existingRule: conflictingRule,
            newCategoryId: targetParent.id,
            pendingMoveArgs: args,
            isChecking: false
          });
          
          // Don't proceed with move yet - wait for user decision
          setProcessingNodes(prev => {
            const newSet = new Set(prev);
            newSet.delete(dragNode.id);
            return newSet;
          });
          return;
        }
        
        // Clear checking state
        setVendorRuleUpdateModal(prev => ({
          ...prev,
          isChecking: false
        }));
        
      } catch (error) {
        console.error('Error checking vendor rules:', error);
        
        // Clear loading state
        setVendorRuleUpdateModal(prev => ({
          ...prev,
          isChecking: false
        }));
        
        // Show user-friendly error message but allow the move to continue
        const errorMessage = error.response?.data?.message || 'Failed to check vendor rules. The move will continue without rule verification.';
        
        // You could show a toast notification here if you have a notification system
        console.warn('Vendor rule check failed:', errorMessage);
        
        // Continue with the move despite the error
      } finally {
        // Clear processing state
        setProcessingNodes(prev => {
          const newSet = new Set(prev);
          newSet.delete(dragNode.id);
          return newSet;
        });
      }
    }

    // Proceed with the move if no vendor rule conflicts or not a vendor move
    if (onMove) {
      // Add visual feedback
      setRecentlyMovedNodes(prev => new Set([...prev, dragIds[0]]));
      
      // Set move result
      setMoveResults(prev => new Map([...prev, [dragIds[0], { status: 'success', timestamp: Date.now() }]]));
      
      // Execute the move
      onMove(args);
      
      // Clear highlighting after animation
      setTimeout(() => {
        setRecentlyMovedNodes(prev => {
          const newSet = new Set(prev);
          newSet.delete(dragIds[0]);
          return newSet;
        });
        
        setMoveResults(prev => {
          const newMap = new Map(prev);
          newMap.delete(dragIds[0]);
          return newMap;
        });
      }, 2000);
    }
  }, [treeData, validateMove, onMove]);

  // Helper function to find node by ID
  const findNodeById = (id, nodes) => {
    for (const node of nodes) {
      if (node.id === id) return node;
      if (node.children) {
        const found = findNodeById(id, node.children);
        if (found) return found;
      }
    }
    return null;
  };

  // Inline editing functions
  const startEditing = useCallback((nodeId, currentName) => {
    setEditingNodeId(nodeId);
    setEditingValue(currentName || '');
    setValidationError('');
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
    
    // Focus the input after state update
    setTimeout(() => {
      if (editInputRef.current) {
        editInputRef.current.focus();
        editInputRef.current.select();
      }
    }, 50);
  }, []);

  const cancelEditing = useCallback(() => {
    setEditingNodeId(null);
    setEditingValue('');
    setValidationError('');
  }, []);

  const validateNodeName = useCallback((name, nodeId, nodeType) => {
    if (!name || name.trim().length === 0) {
      return 'Name cannot be empty';
    }
    
    if (name.trim().length > 100) {
      return 'Name must be less than 100 characters';
    }
    
    // Check for duplicate names at the same level
    const node = findNodeById(nodeId, data);
    if (node) {
      const siblings = data.filter(item => 
        item.parent === node.parent && 
        item.id !== nodeId && 
        item.type === nodeType
      );
      
      if (siblings.some(sibling => sibling.name.toLowerCase() === name.trim().toLowerCase())) {
        return 'A node with this name already exists at this level';
      }
    }
    
    // Additional validation for specific node types
    if (nodeType === 'category') {
      const forbiddenChars = /[<>:"/\\|?*]/;
      if (forbiddenChars.test(name)) {
        return 'Category names cannot contain special characters: < > : " / \\ | ? *';
      }
    }
    
    return null;
  }, [data, findNodeById]);

  const saveEdit = useCallback(() => {
    if (!editingNodeId || !editingValue) return;
    
    const node = findNodeById(editingNodeId, data);
    if (!node) return;
    
    const trimmedValue = editingValue.trim();
    const error = validateNodeName(trimmedValue, editingNodeId, node.type);
    
    if (error) {
      setValidationError(error);
      return;
    }
    
    // Call the rename handler
    if (onRename) {
      onRename({
        id: editingNodeId,
        name: trimmedValue,
        node: node
      });
    }
    
    cancelEditing();
  }, [editingNodeId, editingValue, data, validateNodeName, onRename, cancelEditing, findNodeById]);

  // Context menu functions
  const showContextMenu = useCallback((e, nodeId) => {
    e.preventDefault();
    e.stopPropagation();
    
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      nodeId: nodeId
    });
  }, []);

  const hideContextMenu = useCallback(() => {
    setContextMenu({ visible: false, x: 0, y: 0, nodeId: null });
  }, []);

  const handleContextMenuAction = useCallback((action, nodeId) => {
    const node = findNodeById(nodeId, data);
    if (!node) return;

    hideContextMenu();

    switch (action) {
      case 'edit':
        startEditing(nodeId, node.name);
        break;
      case 'delete':
        if (onDelete) {
          onDelete({ id: nodeId, node });
        }
        break;
      case 'add-child':
        if (onCreateChild) {
          onCreateChild({ parentId: nodeId, parentNode: node });
        } else {
          // Use internal modal if no external handler provided
          handleCreateChildCategory(nodeId, node);
        }
        break;
      case 'duplicate':
        if (onDuplicate) {
          onDuplicate({ id: nodeId, node });
        }
        break;
      default:
        break;
    }
  }, [data, hideContextMenu, startEditing, onDelete, onCreateChild, onDuplicate, findNodeById, handleCreateChildCategory]);

  const handleRename = (args) => {
    if (onRename) {
      onRename(args);
    }
  };

  // Vendor rule update modal handlers
  const handleVendorRuleUpdated = async (result) => {
    const { pendingMoveArgs, vendorName } = vendorRuleUpdateModal;
    
    // Update vendor rules cache based on the result
    if (result.action === 'updated' && result.updatedRule) {
      setVendorRules(prev => new Map([...prev, [vendorName, result.updatedRule]]));
    } else if (result.action === 'removed') {
      setVendorRules(prev => {
        const newMap = new Map(prev);
        newMap.delete(vendorName);
        return newMap;
      });
    }
    
    // Close the modal
    setVendorRuleUpdateModal({
      isOpen: false,
      vendorName: '',
      oldCategoryName: '',
      newCategoryName: '',
      existingRule: null,
      newCategoryId: null,
      pendingMoveArgs: null,
      isChecking: false
    });

    // Proceed with the move with visual feedback
    if (pendingMoveArgs && onMove) {
      try {
        await onMove(pendingMoveArgs);
        addMoveHighlight(pendingMoveArgs.dragIds[0], 'success');
        announceToScreenReader(`Successfully moved ${vendorName}`);
      } catch (error) {
        console.error('Error during pending move operation:', error);
        addMoveHighlight(pendingMoveArgs.dragIds[0], 'error');
        announceToScreenReader(`Failed to move ${vendorName}: ${error.message}`);
      } finally {
        setNodeProcessing(pendingMoveArgs.dragIds[0], false);
      }
    }

    // Announce the result to screen readers
    if (result.message) {
      announceToScreenReader(result.message);
    }
  };

  const handleVendorRuleModalClose = () => {
    setVendorRuleUpdateModal({
      isOpen: false,
      vendorName: '',
      oldCategoryName: '',
      newCategoryName: '',
      existingRule: null,
      newCategoryId: null,
      pendingMoveArgs: null,
      isChecking: false
    });
  };

  // Category creation modal handlers
  const handleCreateRootCategory = useCallback(() => {
    setCategoryCreationModal({
      isOpen: true,
      preSelectedParent: null
    });
  }, []);

  const handleCreateChildCategory = useCallback((parentId, parentNode) => {
    setCategoryCreationModal({
      isOpen: true,
      preSelectedParent: {
        id: parentId,
        name: parentNode.name
      }
    });
  }, []);

  const handleCategoryCreationModalClose = () => {
    setCategoryCreationModal({
      isOpen: false,
      preSelectedParent: null
    });
  };

  const handleCategoryCreated = useCallback((newCategory) => {
    // Notify parent component about the new category
    if (onCategoryCreated) {
      onCategoryCreated(newCategory);
    }
    
    // Announce to screen readers
    announceToScreenReader(`Category "${newCategory.name}" created successfully`);
  }, [onCategoryCreated, announceToScreenReader]);

  // Context Menu Component
  const ContextMenu = () => {
    if (!contextMenu.visible) return null;

    const contextNode = findNodeById(contextMenu.nodeId, data);
    if (!contextNode) return null;

    const canHaveChildren = contextNode.type === 'category';
    const isSystemNode = contextNode.is_system || false;

    return (
      <div
        className="context-menu-overlay"
        onClick={hideContextMenu}
      >
        <div
          className="context-menu"
          style={{
            left: contextMenu.x,
            top: contextMenu.y
          }}
          onClick={(e) => e.stopPropagation()}
          role="menu"
          aria-label={`Context menu for ${contextNode.name}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              hideContextMenu();
            }
          }}
        >
          <div 
            className="context-menu-item" 
            onClick={() => handleContextMenuAction('edit', contextMenu.nodeId)}
            role="menuitem"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleContextMenuAction('edit', contextMenu.nodeId);
              }
            }}
          >
            <FiEdit3 />
            <span>Rename</span>
            <span className="keyboard-shortcut">F2</span>
          </div>
          
          {canHaveChildren && (
            <div 
              className="context-menu-item" 
              onClick={() => handleContextMenuAction('add-child', contextMenu.nodeId)}
              role="menuitem"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleContextMenuAction('add-child', contextMenu.nodeId);
                }
              }}
            >
              <FiPlus />
              <span>Add Child Category</span>
            </div>
          )}
          
          {!isSystemNode && (
            <div 
              className="context-menu-item" 
              onClick={() => handleContextMenuAction('duplicate', contextMenu.nodeId)}
              role="menuitem"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleContextMenuAction('duplicate', contextMenu.nodeId);
                }
              }}
            >
              <FiCopy />
              <span>Duplicate</span>
            </div>
          )}
          
          <div className="context-menu-separator" role="separator" />
          
          {!isSystemNode && (
            <div 
              className="context-menu-item danger" 
              onClick={() => handleContextMenuAction('delete', contextMenu.nodeId)}
              role="menuitem"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleContextMenuAction('delete', contextMenu.nodeId);
                }
              }}
            >
              <FiTrash2 />
              <span>Delete</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div 
      className={`category-tree-editor ${className}`}
      onClick={hideContextMenu}
    >
      {/* Screen reader announcements */}
      <div 
        className="sr-only" 
        aria-live="polite" 
        aria-atomic="true"
        id="tree-announcements"
      >
        {announceText}
      </div>

      {/* Tree editor toolbar */}
      <div className="tree-editor-toolbar">
        <button
          type="button"
          className="btn btn-primary tree-add-root-btn"
          onClick={handleCreateRootCategory}
          title="Create a new root-level category"
          aria-label="Create new category"
        >
          <FiPlus />
          <span>New Category</span>
        </button>
      </div>

      <Tree
        ref={treeRef}
        data={treeData}
        renderNode={renderNode}
        onMove={handleMove}
        onRename={handleRename}
        openByDefault={false}
        indent={24}
        rowHeight={36}
        overscanCount={5}
        width="100%"
        height="100%"
        padding={8}
        className="arborist-tree"
        // Performance optimizations
        disableMultiSelection={false}
        selectionFollowsFocus={true}
        // Accessibility attributes
        role="tree"
        aria-label="Category tree with vendors and transactions"
        aria-describedby="tree-instructions"
        // Enhanced drag and drop configuration
        dndRootElement={null}
        disableDrag={false}
        disableDrop={false}
        dragPreview={true}
        // Optimized virtualization settings
        renderContainer={({ children, style, dragDropManager, ref }) => (
          <div 
            ref={ref}
            style={{
              ...style,
              willChange: 'transform',
              contain: 'layout style paint'
            }}
          >
            {children}
          </div>
        )}
        // Custom drag and drop behavior with performance optimizations
        onCanDrop={(args) => {
          const isValid = validateMove(args.dragIds[0], args.parentId, data);
          
          // Throttled visual feedback for invalid drops
          if (args.dragNode && args.parentNode) {
            const targetElement = document.querySelector(`[data-node-id="${args.parentNode.id}"]`);
            if (targetElement) {
              requestAnimationFrame(() => {
                if (isValid) {
                  targetElement.setAttribute('data-drop-target', 'valid');
                } else {
                  targetElement.setAttribute('data-drop-target', 'invalid');
                }
              });
            }
          }
          
          return isValid;
        }}
        onWillReceiveDrop={(args) => {
          // Clean up visual feedback using animation frame
          requestAnimationFrame(() => {
            const allNodes = document.querySelectorAll('[data-drop-target]');
            allNodes.forEach(node => node.removeAttribute('data-drop-target'));
          });
          
          return validateMove(args.dragIds[0], args.parentId, data);
        }}
        // Enhanced drag start and end handlers with performance optimization
        onDragStart={(args) => {
          const dragElement = document.querySelector(`[data-node-id="${args.dragIds[0]}"]`);
          if (dragElement) {
            requestAnimationFrame(() => {
              dragElement.setAttribute('data-dragging', 'true');
            });
          }
        }}
        onDragEnd={(args) => {
          // Clean up all drag-related attributes using animation frame
          requestAnimationFrame(() => {
            const allNodes = document.querySelectorAll('[data-dragging], [data-drop-target]');
            allNodes.forEach(node => {
              node.removeAttribute('data-dragging');
              node.removeAttribute('data-drop-target');
            });
          });
        }}
      />
      
      {/* Instructions for screen reader users */}
      <div id="tree-instructions" className="sr-only">
        Use arrow keys to navigate. Press Enter or Space to expand/collapse. 
        Press F2 to rename. Press Delete to remove items. 
        Press Plus or Insert to add child categories. 
        Press Ctrl+C to duplicate. 
        Right-click or press the Context Menu key for more options.
      </div>
      
      <ContextMenu />
      
      <VendorRuleUpdateModal
        isOpen={vendorRuleUpdateModal.isOpen}
        onClose={handleVendorRuleModalClose}
        vendorName={vendorRuleUpdateModal.vendorName}
        oldCategoryName={vendorRuleUpdateModal.oldCategoryName}
        newCategoryName={vendorRuleUpdateModal.newCategoryName}
        existingRule={vendorRuleUpdateModal.existingRule}
        newCategoryId={vendorRuleUpdateModal.newCategoryId}
        onRuleUpdated={handleVendorRuleUpdated}
        isChecking={vendorRuleUpdateModal.isChecking}
      />
      
      <CategoryCreationModal
        isOpen={categoryCreationModal.isOpen}
        onClose={handleCategoryCreationModalClose}
        onCategoryCreated={handleCategoryCreated}
        preSelectedParent={categoryCreationModal.preSelectedParent}
        availableCategories={data}
      />
    </div>
  );
});

CategoryTreeEditor.propTypes = {
  data: PropTypes.array,
  onMove: PropTypes.func,
  onRename: PropTypes.func,
  onSelect: PropTypes.func,
  onDelete: PropTypes.func,
  onCreateChild: PropTypes.func,
  onCreateRoot: PropTypes.func,
  onDuplicate: PropTypes.func,
  onCategoryCreated: PropTypes.func,
  transactions: PropTypes.array,
  categorySpendingTotals: PropTypes.object,
  selectedNodeId: PropTypes.string,
  className: PropTypes.string
};

CategoryTreeEditor.defaultProps = {
  data: [],
  transactions: [],
  categorySpendingTotals: {},
  selectedNodeId: null,
  className: '',
  onMove: () => {},
  onRename: () => {},
  onSelect: () => {},
  onDelete: () => {},
  onCreateChild: () => {},
  onCreateRoot: () => {},
  onDuplicate: () => {},
  onCategoryCreated: () => {}
};

export default CategoryTreeEditor; 