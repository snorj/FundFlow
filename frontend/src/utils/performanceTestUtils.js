/**
 * Performance testing utilities for TreeView component
 * Generates large datasets and measures performance metrics
 */

/**
 * Generate a large category tree for performance testing
 * @param {Object} options - Configuration options
 * @returns {Array} Array of category objects
 */
export const generateLargeCategoryTree = ({
  totalCategories = 100,
  maxDepth = 4,
  branchingFactor = 3,
  includeVendors = true,
  vendorsPerCategory = 2,
  includeTransactions = true,
  transactionsPerVendor = 5
} = {}) => {
  const categories = [];
  const vendors = [];
  const transactions = [];
  let categoryId = 1;
  let vendorId = 1;
  let transactionId = 1;

  // Generate categories recursively
  const generateCategoriesAtLevel = (parentId = null, currentDepth = 0, remainingCategories) => {
    if (currentDepth >= maxDepth || remainingCategories <= 0) return 0;

    const categoriesAtThisLevel = Math.min(
      branchingFactor,
      Math.ceil(remainingCategories / Math.pow(branchingFactor, maxDepth - currentDepth - 1))
    );

    let categoriesCreated = 0;

    for (let i = 0; i < categoriesAtThisLevel && remainingCategories > 0; i++) {
      const category = {
        id: categoryId++,
        name: `Category ${categoryId - 1} (Level ${currentDepth})`,
        parent: parentId,
        is_custom: Math.random() > 0.7, // 30% custom categories
        type: 'category',
        user: Math.random() > 0.5 ? 1 : null
      };
      
      categories.push(category);
      categoriesCreated++;
      remainingCategories--;

      // Generate vendors for this category
      if (includeVendors) {
        for (let v = 0; v < vendorsPerCategory; v++) {
          const vendor = {
            id: vendorId++,
            name: `Vendor ${vendorId - 1} for Cat ${category.id}`,
            parent: category.id,
            type: 'vendor',
            category_id: category.id
          };
          vendors.push(vendor);

          // Generate transactions for this vendor
          if (includeTransactions) {
            for (let t = 0; t < transactionsPerVendor; t++) {
              const transaction = {
                id: transactionId++,
                name: `Transaction ${transactionId - 1}`,
                parent: vendor.id,
                type: 'transaction',
                vendor_id: vendor.id,
                category_id: category.id,
                amount: (Math.random() * 1000 - 500).toFixed(2), // Random amount between -500 and 500
                date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                originalTransaction: {
                  id: transactionId - 1,
                  amount: (Math.random() * 1000 - 500).toFixed(2),
                  description: `Test transaction ${transactionId - 1}`,
                  date: new Date().toISOString()
                }
              };
              transactions.push(transaction);
            }
          }
        }
      }

      // Recursively generate child categories
      const childrenCreated = generateCategoriesAtLevel(
        category.id, 
        currentDepth + 1, 
        Math.floor(remainingCategories / categoriesAtThisLevel)
      );
      categoriesCreated += childrenCreated;
    }

    return categoriesCreated;
  };

  generateCategoriesAtLevel(null, 0, totalCategories);

  // Combine all items
  return [...categories, ...vendors, ...transactions];
};

/**
 * Generate spending totals for categories
 * @param {Array} categories - Array of category objects
 * @param {Array} transactions - Array of transaction objects
 * @returns {Object} Object mapping category IDs to spending totals
 */
export const generateCategorySpendingTotals = (categories, transactions) => {
  const totals = {};
  
  categories.forEach(category => {
    if (category.type === 'category') {
      // Calculate total for this category and all subcategories
      const categoryTransactions = transactions.filter(t => 
        t.type === 'transaction' && t.category_id === category.id
      );
      
      const total = categoryTransactions.reduce((sum, t) => {
        return sum + parseFloat(t.amount || 0);
      }, 0);
      
      totals[category.id] = total;
    }
  });
  
  return totals;
};

/**
 * Measure TreeView rendering performance
 * @param {Function} renderFunction - Function that renders the TreeView
 * @param {Array} data - Data to render
 * @returns {Object} Performance metrics
 */
export const measureTreeViewPerformance = async (renderFunction, data) => {
  const startTime = performance.now();
  
  // Measure initial render
  const renderStart = performance.now();
  const result = await renderFunction(data);
  const renderEnd = performance.now();
  
  // Measure data transformation time (if applicable)
  const transformStart = performance.now();
  // Simulate data transformation
  const transformedData = data.map(item => ({ ...item }));
  const transformEnd = performance.now();
  
  const endTime = performance.now();
  
  return {
    totalTime: endTime - startTime,
    renderTime: renderEnd - renderStart,
    transformTime: transformEnd - transformStart,
    dataSize: data.length,
    memoryUsage: performance.memory ? {
      used: performance.memory.usedJSHeapSize,
      total: performance.memory.totalJSHeapSize,
      limit: performance.memory.jsHeapSizeLimit
    } : null
  };
};

/**
 * Performance test scenarios
 */
export const performanceTestScenarios = [
  {
    name: 'Small Tree (50 items)',
    config: {
      totalCategories: 20,
      maxDepth: 3,
      branchingFactor: 2,
      vendorsPerCategory: 1,
      transactionsPerVendor: 2
    }
  },
  {
    name: 'Medium Tree (200 items)',
    config: {
      totalCategories: 50,
      maxDepth: 4,
      branchingFactor: 3,
      vendorsPerCategory: 2,
      transactionsPerVendor: 3
    }
  },
  {
    name: 'Large Tree (500 items)',
    config: {
      totalCategories: 100,
      maxDepth: 5,
      branchingFactor: 3,
      vendorsPerCategory: 3,
      transactionsPerVendor: 4
    }
  },
  {
    name: 'Extra Large Tree (1000+ items)',
    config: {
      totalCategories: 200,
      maxDepth: 6,
      branchingFactor: 4,
      vendorsPerCategory: 3,
      transactionsPerVendor: 5
    }
  }
];

/**
 * Run performance benchmark
 * @param {Function} renderFunction - Function to test
 * @returns {Array} Array of performance results
 */
export const runPerformanceBenchmark = async (renderFunction) => {
  const results = [];
  
  for (const scenario of performanceTestScenarios) {
    console.log(`Running performance test: ${scenario.name}`);
    
    const data = generateLargeCategoryTree(scenario.config);
    const metrics = await measureTreeViewPerformance(renderFunction, data);
    
    results.push({
      scenario: scenario.name,
      config: scenario.config,
      metrics,
      passed: metrics.renderTime < 100 && metrics.totalTime < 500 // Performance thresholds
    });
    
    console.log(`${scenario.name}: ${metrics.renderTime.toFixed(2)}ms render, ${metrics.totalTime.toFixed(2)}ms total`);
  }
  
  return results;
};

const performanceTestUtilities = {
  generateLargeCategoryTree,
  generateCategorySpendingTotals,
  measureTreeViewPerformance,
  performanceTestScenarios,
  runPerformanceBenchmark
};

export default performanceTestUtilities; 