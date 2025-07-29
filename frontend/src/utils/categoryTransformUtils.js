/**
 * Utility functions for transforming category data between different formats
 * Used to convert backend category data to TreeView component format
 */

/**
 * Transform flat category array and transactions into hierarchical tree structure
 * @param {Array} categories - Flat array of category objects from backend
 * @param {Array} transactions - Array of transaction objects (optional)
 * @param {Object} options - Configuration options
 * @returns {Array} Hierarchical tree structure for TreeView
 */
export const transformCategoryData = (categories = [], transactions = [], options = {}) => {
  const {
    includeVendors = true,
    includeTransactions = true,
    showSystemCategories = true,
    showUserCategories = true,
    categorySpendingTotals = {},
    vendorMappings = [] // New option for vendor mappings
  } = options;

  // Defensive checks
  const categoriesArray = Array.isArray(categories) ? categories : [];
  const transactionsArray = Array.isArray(transactions) ? transactions : [];

  // Separate categories and vendors from the input
  let filteredCategories = categoriesArray.filter(item => {
    if (item.type && item.type !== 'category') return false;
    
    // Filter based on system/user preferences
    if (!showSystemCategories && !item.is_custom) return false;
    if (!showUserCategories && item.is_custom) return false;
    
    return true;
  });

  let vendorNodes = categoriesArray.filter(item => item.type === 'vendor');
  
  // DEBUG: Log vendor data
  console.log('🐛 DEBUG - transformCategoryData:');
  console.log('  Total items:', categoriesArray.length);
  console.log('  Categories:', filteredCategories.length);
  console.log('  Vendor nodes:', vendorNodes.length, vendorNodes);
  console.log('  includeVendors:', includeVendors);

  // Validate vendor nodes structure and log detailed info
  vendorNodes.forEach((vendor, index) => {
    if (!vendor.id || !vendor.name || vendor.type !== 'vendor') {
      console.warn(`⚠️  Invalid vendor node at index ${index}:`, vendor);
    } else {
      console.log(`📝 Vendor ${index}: ${vendor.name} (ID: ${vendor.id}, Parent: ${vendor.parent})`);
    }
  });

  // Build category tree
  const categoryTree = buildCategoryTree(filteredCategories);

  // Add vendor nodes from API (if any) and transaction children if requested
  if (includeVendors || includeTransactions) {
    // First add vendor nodes from API if they exist
    if (vendorNodes.length > 0) {
      console.log('  Adding vendor nodes from API...');
      addVendorNodesFromAPI(categoryTree, vendorNodes);
    }
    
    // Then add vendor/transaction children from transaction data
    // Note: We always include transaction-derived vendors if no API vendors exist,
    // but we can also include both if needed (they serve different purposes)
    addVendorAndTransactionChildren(categoryTree, transactionsArray, {
      includeVendors: includeVendors && vendorNodes.length === 0, // Only create transaction-derived vendors if no API vendors
      includeTransactions,
      categorySpendingTotals,
      vendorMappings
    });
  }

  return categoryTree;
};

/**
 * Add vendor nodes from API to the category tree
 * @param {Array} categoryTree - The category tree to add vendors to
 * @param {Array} vendorNodes - Vendor nodes from the API
 */
const addVendorNodesFromAPI = (categoryTree, vendorNodes) => {
  console.log('🐛 DEBUG - addVendorNodesFromAPI called with:');
  console.log('  vendorNodes count:', vendorNodes.length);
  console.log('  vendorNodes data:', vendorNodes);
  
  // Create a map for quick category lookup
  const categoryMap = new Map();
  
  const mapCategories = (nodes) => {
    nodes.forEach(node => {
      // Store both string and integer versions of the ID to handle type mismatches
      const id = node.id;
      
      // Skip if no valid ID
      if (id === null || id === undefined) {
        console.warn('⚠️  Category node missing ID:', node);
        return;
      }
      
      categoryMap.set(id, node);
      
      // Only add string/number versions if they're different from the original
      const stringId = String(id);
      const numberId = Number(id);
      
      if (stringId !== id) {
        categoryMap.set(stringId, node);
      }
      
      if (!isNaN(numberId) && numberId !== id) {
        categoryMap.set(numberId, node);
      }
      
      if (node.children) {
        mapCategories(node.children);
      }
    });
  };
  
  mapCategories(categoryTree);
  
  console.log('  categoryMap size:', categoryMap.size);
  console.log('  categoryMap keys:', Array.from(categoryMap.keys()));
  
  // Add vendor nodes to their parent categories
  // Backend now only sends vendors that have been assigned to categories
  vendorNodes.forEach(vendor => {
    const parentId = vendor.parent;
    console.log(`  Processing vendor ${vendor.name}: parent=${parentId}, hasParent=${categoryMap.has(parentId)}`);
    
    if (parentId !== null && parentId !== undefined && categoryMap.has(parentId)) {
      // Add to specific parent category
      const parentCategory = categoryMap.get(parentId);
      if (!parentCategory.children) {
        parentCategory.children = [];
      }
      parentCategory.children.push({...vendor});
      console.log(`    ✅ Added ${vendor.name} to ${parentCategory.name}`);
    } else {
      // Try alternative ID formats if the direct lookup failed
      const alternativeIds = [String(parentId), Number(parentId)];
      let foundParent = false;
      
      for (const altId of alternativeIds) {
        if (altId !== parentId && !isNaN(altId) && categoryMap.has(altId)) {
          const parentCategory = categoryMap.get(altId);
          if (!parentCategory.children) {
            parentCategory.children = [];
          }
          parentCategory.children.push({...vendor});
          console.log(`    ✅ Added ${vendor.name} to ${parentCategory.name} (using alt ID: ${altId})`);
          foundParent = true;
          break;
        }
      }
      
      if (!foundParent) {
        console.log(`    ❌ Skipped ${vendor.name} - no valid parent (${parentId})`);
        console.log(`    Available category IDs:`, Array.from(categoryMap.keys()).slice(0, 10));
      }
    }
  });
};

/**
 * Build hierarchical category tree from flat array
 * @param {Array} categories - Flat array of categories
 * @returns {Array} Hierarchical category tree
 */
const buildCategoryTree = (categories) => {
  // Create a map for quick lookup
  const categoryMap = {};
  const tree = [];

  // First pass: create all category nodes
  categories.forEach(category => {
    const node = {
      id: category.id,
      name: category.name,
      type: 'category',
      is_custom: category.is_custom,
      user: category.user,
      parent: category.parent,
      children: [],
      // Preserve original category data
      originalCategory: category
    };

    categoryMap[category.id] = node;
  });

  // Second pass: build the tree structure
  categories.forEach(category => {
    const node = categoryMap[category.id];
    if (category.parent && categoryMap[category.parent]) {
      // Add to parent's children
      categoryMap[category.parent].children.push(node);
    } else {
      // Root level category
      tree.push(node);
    }
  });

  return tree;
};

/**
 * Add vendor and transaction children to category nodes
 * @param {Array} categoryTree - Hierarchical category tree
 * @param {Array} transactions - Array of transactions
 * @param {Object} options - Configuration options
 */
const addVendorAndTransactionChildren = (categoryTree, transactions, options) => {
  const { includeVendors, includeTransactions, categorySpendingTotals, vendorMappings } = options;

  // Recursively process each category node
  const processNode = (node) => {
    if (node.type === 'category') {
      // Add vendors for this category
      if (includeVendors) {
        const vendorChildren = getVendorChildren(node.id, transactions, {
          includeTransactions,
          categorySpendingTotals,
          vendorMappings
        });
        node.children.push(...vendorChildren);
      }

      // Process subcategories recursively
      node.children.forEach(child => {
        if (child.type === 'category') {
          processNode(child);
        }
      });
    }
  };

  categoryTree.forEach(processNode);
};

/**
 * Get vendor children for a category
 * @param {number} categoryId - Category ID
 * @param {Array} transactions - Array of transactions
 * @param {Object} options - Configuration options
 * @returns {Array} Array of vendor nodes
 */
const getVendorChildren = (categoryId, transactions, options) => {
  const { includeTransactions, vendorMappings = [] } = options;
  const vendorMap = {};

  // Create a mapping lookup for O(1) performance
  const mappingLookup = {};
  vendorMappings.forEach(mapping => {
    mappingLookup[mapping.original_name] = mapping.mapped_vendor;
  });

  // Group transactions by vendor for this category
  transactions
    .filter(t => t.category === categoryId)
    .forEach(t => {
      const originalVendorName = t.description || 'Unknown Vendor';
      // Use mapped vendor name if available, otherwise use original
      const vendorName = mappingLookup[originalVendorName] || originalVendorName;
      const vendorId = `vendor_${vendorName}`;

      if (!vendorMap[vendorId]) {
        vendorMap[vendorId] = {
          id: vendorId,
          name: vendorName,
          type: 'vendor',
          parent: categoryId,
          is_custom: false,
          user: null,
          transactionCount: 0,
          totalAmount: 0,
          children: []
        };
      }

      vendorMap[vendorId].transactionCount += 1;
      vendorMap[vendorId].totalAmount += Math.abs(parseFloat(t.aud_amount || t.amount_aud || 0));

      // Add transaction as child if requested
      if (includeTransactions) {
        const transactionNode = {
          id: `transaction_${t.id}`,
          name: t.description,
          type: 'transaction',
          parent: vendorId,
          is_custom: false,
          user: null,
          amount: Math.abs(parseFloat(t.aud_amount || t.amount_aud || 0)),
          date: t.transaction_date,
          direction: t.direction,
          originalTransaction: t,
          children: [] // Transactions don't have children
        };
        vendorMap[vendorId].children.push(transactionNode);
      }
    });

  // Convert to array and sort by total amount (highest first)
  return Object.values(vendorMap)
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .map(vendor => {
      // Sort transactions by date (newest first)
      if (vendor.children.length > 0) {
        vendor.children.sort((a, b) => new Date(b.date) - new Date(a.date));
      }
      return vendor;
    });
};

/**
 * Transform tree data back to flat array (for backward compatibility)
 * @param {Array} treeData - Hierarchical tree data
 * @returns {Array} Flat array of categories only
 */
export const flattenCategoryTree = (treeData) => {
  const categories = [];

  const processNode = (node) => {
    if (node.type === 'category' && node.originalCategory) {
      categories.push(node.originalCategory);
    }
    
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        if (child.type === 'category') {
          processNode(child);
        }
      });
    }
  };

  treeData.forEach(processNode);
  return categories;
};

/**
 * Find a node in the tree by ID and type
 * @param {Array} treeData - Hierarchical tree data
 * @param {string|number} id - Node ID to find
 * @param {string} type - Node type ('category', 'vendor', 'transaction')
 * @returns {Object|null} Found node or null
 */
export const findNodeInTree = (treeData, id, type = null) => {
  const searchNode = (node) => {
    // Check if this is the node we're looking for
    if (node.id === id && (!type || node.type === type)) {
      return node;
    }

    // Search children recursively
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const found = searchNode(child);
        if (found) return found;
      }
    }

    return null;
  };

  for (const node of treeData) {
    const found = searchNode(node);
    if (found) return found;
  }

  return null;
};

/**
 * Filter tree data based on search term and visible item IDs
 * @param {Array} treeData - Hierarchical tree data
 * @param {string} searchTerm - Search term to filter by
 * @param {Set} visibleItemIds - Set of item IDs that should be visible
 * @returns {Array} Filtered tree data
 */
export const filterTreeData = (treeData, searchTerm, visibleItemIds = null) => {
  // If no search term and no visible items filter, return original data
  if ((!searchTerm || searchTerm.trim() === '') && !visibleItemIds) {
    return treeData;
  }

  // If we have visible item IDs, use that for filtering
  if (visibleItemIds && visibleItemIds.size > 0) {
    const filterByVisibleIds = (node) => {
      const nodeVisible = visibleItemIds.has(node.id);
      
      // Filter children recursively
      const filteredChildren = node.children
        ? node.children
            .map(child => filterByVisibleIds(child))
            .filter(child => child !== null)
        : [];

      // Include node if it's visible or has visible children
      if (nodeVisible || filteredChildren.length > 0) {
        return {
          ...node,
          children: filteredChildren
        };
      }

      return null;
    };

    return treeData
      .map(node => filterByVisibleIds(node))
      .filter(node => node !== null);
  }

  // Fallback to search term filtering
  const term = searchTerm.toLowerCase().trim();

  const filterNode = (node) => {
    // Check if current node matches
    const nodeMatches = node.name.toLowerCase().includes(term);
    
    // Filter children recursively
    const filteredChildren = node.children
      ? node.children
      .map(child => filterNode(child))
          .filter(child => child !== null)
      : [];

    // Include node if it matches or has matching children
    if (nodeMatches || filteredChildren.length > 0) {
      return {
        ...node,
        children: filteredChildren
      };
    }

    return null;
  };

  return treeData
    .map(node => filterNode(node))
    .filter(node => node !== null);
};

/**
 * Calculate total spending for all categories in the tree
 * @param {Array} transactions - Array of transactions
 * @param {Array} categories - Flat array of categories
 * @returns {Object} Map of category ID to total spending
 */
export const calculateCategorySpendingTotals = (transactions = [], categories = []) => {
  const transactionsArray = Array.isArray(transactions) ? transactions : [];
  const categoriesArray = Array.isArray(categories) ? categories : [];
  
  const totals = {};

  // Calculate direct spending for each category
  categoriesArray.forEach(category => {
    const categoryTotal = calculateCategoryTotal(category.id, transactionsArray, categoriesArray);
    if (categoryTotal > 0) {
      totals[category.id] = categoryTotal;
    }
  });

  return totals;
};

/**
 * Calculate total spending for a specific category (including subcategories)
 * @param {number} categoryId - Category ID
 * @param {Array} transactions - Array of transactions
 * @param {Array} categories - Array of categories
 * @returns {number} Total spending amount
 */
const calculateCategoryTotal = (categoryId, transactions, categories) => {
  // Direct transactions in this category
  const directTotal = transactions
    .filter(t => t.category === categoryId)
    .reduce((sum, t) => sum + Math.abs(parseFloat(t.aud_amount || t.amount_aud || 0)), 0);

  // Transactions in subcategories (recursive)
  const childCategories = categories.filter(c => c.parent === categoryId);
  const childTotal = childCategories.reduce(
    (sum, child) => sum + calculateCategoryTotal(child.id, transactions, categories),
    0
  );

  return directTotal + childTotal;
};

/**
 * Get all category IDs from tree data (useful for context providers)
 * @param {Array} treeData - Hierarchical tree data
 * @returns {Array} Array of category IDs
 */
export const getCategoryIdsFromTree = (treeData) => {
  const categoryIds = [];

  const collectIds = (node) => {
    if (node.type === 'category') {
      categoryIds.push(node.id);
    }
    
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        if (child.type === 'category') {
          collectIds(child);
        }
      });
    }
  };

  treeData.forEach(collectIds);
  return categoryIds;
};

/**
 * Get parent-child relationships from tree data (useful for context providers)
 * @param {Array} treeData - Hierarchical tree data
 * @returns {Object} Map of category ID to parent ID
 */
export const getCategoryParentMap = (treeData) => {
  const parentMap = {};

  const mapParents = (node, parentId = null) => {
    if (node.type === 'category') {
      parentMap[node.id] = parentId;
    }
    
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => {
        if (child.type === 'category') {
          mapParents(child, node.id);
        }
      });
    }
  };

  treeData.forEach(node => mapParents(node));
  return parentMap;
};

/**
 * Check if a category has children in the tree (useful for context state management)
 * @param {Array} treeData - Hierarchical tree data
 * @param {string|number} categoryId - Category ID to check
 * @returns {boolean} True if category has children
 */
export const categoryHasChildren = (treeData, categoryId) => {
  const category = findNodeInTree(treeData, categoryId, 'category');
  return category && category.children && category.children.some(child => child.type === 'category');
};

const categoryTransformUtilities = {
  transformCategoryData,
  flattenCategoryTree,
  findNodeInTree,
  filterTreeData,
  calculateCategorySpendingTotals,
  getCategoryIdsFromTree,
  getCategoryParentMap,
  categoryHasChildren
};

export default categoryTransformUtilities; 