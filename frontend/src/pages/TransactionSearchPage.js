import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { 
  FiSearch, 
  FiRefreshCw, 
  FiSave, 
  FiBookmark,
  FiAlertCircle,
  FiX,
  FiCheckCircle
} from 'react-icons/fi';
import TransactionSearchForm from '../components/transactions/TransactionSearchForm';
import TransactionSearchResults from '../components/transactions/TransactionSearchResults';
import CustomViewSelector from '../components/modals/CustomViewSelector';
import transactionService from '../services/transactions';
import { exportTransactions } from '../utils/exportUtils';
import './TransactionSearchPage.css';

// Custom debounce hook
const useDebounce = (value, delay) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};

const TransactionSearchPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Search state
  const [searchCriteria, setSearchCriteria] = useState({
    vendors: [],
    categories: [],
    dateRange: { start: '', end: '' },
    amountRange: { min: '', max: '' },
    keywords: '',
    direction: 'all',
    logic: 'AND',
    page: 1,
    page_size: 50,
    sort_by: '-transaction_date'
  });
  
  // Results state
  const [searchResults, setSearchResults] = useState({
    results: [],
    pagination: {},
    summary: {},
    logic_operator: 'AND'
  });
  
  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [, setSelectedTransactions] = useState([]);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [savedSearchName, setSavedSearchName] = useState('');
  
  // Custom View state
  const [showCustomViewSelector, setShowCustomViewSelector] = useState(false);
  const [transactionsToAdd, setTransactionsToAdd] = useState([]);
  const [successMessage, setSuccessMessage] = useState('');
  
  // Refs for managing search
  const searchTimeoutRef = useRef(null);
  const abortControllerRef = useRef(null);
  
  // Debounced search criteria for auto-search
  const debouncedSearchCriteria = useDebounce(searchCriteria, 500);
  
  // Load initial search from URL parameters
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const initialCriteria = { ...searchCriteria };
    let hasParams = false;
    
    // Parse URL parameters
    if (urlParams.get('keywords')) {
      initialCriteria.keywords = urlParams.get('keywords');
      hasParams = true;
    }
    
    if (urlParams.get('vendors')) {
      initialCriteria.vendors = urlParams.get('vendors').split(',');
      hasParams = true;
    }
    
    if (urlParams.get('categories')) {
      initialCriteria.categories = urlParams.get('categories').split(',').map(Number);
      hasParams = true;
    }
    
    if (urlParams.get('start_date')) {
      initialCriteria.dateRange.start = urlParams.get('start_date');
      hasParams = true;
    }
    
    if (urlParams.get('end_date')) {
      initialCriteria.dateRange.end = urlParams.get('end_date');
      hasParams = true;
    }
    
    if (urlParams.get('direction')) {
      initialCriteria.direction = urlParams.get('direction');
      hasParams = true;
    }
    
    if (hasParams) {
      setSearchCriteria(initialCriteria);
      setHasSearched(true);
    }
  }, [location.search]);
  
  // Perform search with current criteria
  const performSearch = useCallback(async (criteria = searchCriteria, showLoading = true) => {
    // Cancel any pending search
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new abort controller
    abortControllerRef.current = new AbortController();
    
    try {
      if (showLoading) {
        setIsLoading(true);
      }
      setError(null);
      
      // Filter out empty criteria
      const cleanCriteria = {
        ...criteria,
        vendors: criteria.vendors?.filter(v => v.trim()) || [],
        categories: criteria.categories?.filter(c => c) || [],
        keywords: criteria.keywords?.trim() || '',
        dateRange: {
          start: criteria.dateRange?.start || null,
          end: criteria.dateRange?.end || null
        },
        amountRange: {
          min: criteria.amountRange?.min || null,
          max: criteria.amountRange?.max || null
        }
      };
      
      // Remove empty filters
      Object.keys(cleanCriteria).forEach(key => {
        if (Array.isArray(cleanCriteria[key]) && cleanCriteria[key].length === 0) {
          delete cleanCriteria[key];
        } else if (key === 'dateRange' && !cleanCriteria[key].start && !cleanCriteria[key].end) {
          delete cleanCriteria[key];
        } else if (key === 'amountRange' && !cleanCriteria[key].min && !cleanCriteria[key].max) {
          delete cleanCriteria[key];
        } else if (!cleanCriteria[key] && cleanCriteria[key] !== 0) {
          delete cleanCriteria[key];
        }
      });
      
      console.log('Performing search with criteria:', cleanCriteria);
      
      const response = await transactionService.searchTransactions(cleanCriteria);
      
      setSearchResults(response);
      setHasSearched(true);
      
      // Update URL with search parameters
      const params = new URLSearchParams();
      
      if (criteria.keywords) params.set('keywords', criteria.keywords);
      if (criteria.vendors?.length) params.set('vendors', criteria.vendors.join(','));
      if (criteria.categories?.length) params.set('categories', criteria.categories.join(','));
      if (criteria.dateRange?.start) params.set('start_date', criteria.dateRange.start);
      if (criteria.dateRange?.end) params.set('end_date', criteria.dateRange.end);
      if (criteria.direction && criteria.direction !== 'all') params.set('direction', criteria.direction);
      
      const newURL = `${location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
      window.history.replaceState({}, '', newURL);
      
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Search error:', err);
        setError(err.response?.data?.message || 'Failed to search transactions. Please try again.');
        setSearchResults({ results: [], pagination: {}, summary: {}, logic_operator: 'AND' });
      }
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }, [searchCriteria]);
  
  // Auto-search when criteria changes (debounced)
  useEffect(() => {
    if (hasSearched && debouncedSearchCriteria) {
      performSearch(debouncedSearchCriteria, false);
    }
  }, [debouncedSearchCriteria, hasSearched, performSearch]);
  
  // Handle search form submission
  const handleSearch = useCallback((newCriteria) => {
    const updatedCriteria = { ...newCriteria, page: 1 }; // Reset to first page
    setSearchCriteria(updatedCriteria);
    performSearch(updatedCriteria);
  }, [performSearch]);
  
  // Handle search form reset
  const handleReset = useCallback(() => {
    const resetCriteria = {
      vendors: [],
      categories: [],
      dateRange: { start: '', end: '' },
      amountRange: { min: '', max: '' },
      keywords: '',
      direction: 'all',
      logic: 'AND',
      page: 1,
      page_size: 50,
      sort_by: '-transaction_date'
    };
    
    setSearchCriteria(resetCriteria);
    setSearchResults({ results: [], pagination: {}, summary: {}, logic_operator: 'AND' });
    setHasSearched(false);
    setSelectedTransactions([]);
    setError(null);
    
    // Clear URL parameters
    navigate(location.pathname, { replace: true });
  }, [navigate, location.pathname]);
  
  // Handle sorting
  const handleSort = useCallback((sortField) => {
    const newCriteria = { ...searchCriteria, sort_by: sortField, page: 1 };
    setSearchCriteria(newCriteria);
    performSearch(newCriteria);
  }, [searchCriteria, performSearch]);
  
  // Handle pagination
  const handlePageChange = useCallback((newPage) => {
    const newCriteria = { ...searchCriteria, page: newPage };
    setSearchCriteria(newCriteria);
    performSearch(newCriteria);
  }, [searchCriteria, performSearch]);
  
  // Handle selection changes
  const handleSelectionChange = useCallback((selectedIds) => {
    setSelectedTransactions(selectedIds);
  }, []);
  
  // Handle export
  const handleExport = useCallback(async (exportData) => {
    let exportFormat = 'unknown';
    try {
      const { format, transactions } = exportData;
      exportFormat = format;
      
      await exportTransactions(
        transactions,
        format,
        searchCriteria,
        searchResults.summary
      );
      
    } catch (err) {
      console.error('Export error:', err);
      setError(`Failed to export transactions as ${exportFormat.toUpperCase()}. Please try again.`);
    }
  }, [searchCriteria, searchResults.summary]);
  
  // Handle save search
  const handleSaveSearch = useCallback(() => {
    setShowSaveDialog(true);
  }, []);
  
  // Save search to localStorage (simple implementation)
  const saveSearch = useCallback(() => {
    if (!savedSearchName.trim()) return;
    
    try {
      const savedSearches = JSON.parse(localStorage.getItem('savedTransactionSearches') || '[]');
      const newSearch = {
        id: Date.now(),
        name: savedSearchName.trim(),
        criteria: searchCriteria,
        createdAt: new Date().toISOString()
      };
      
      savedSearches.push(newSearch);
      localStorage.setItem('savedTransactionSearches', JSON.stringify(savedSearches));
      
      setShowSaveDialog(false);
      setSavedSearchName('');
      
      // Show success message
      setError(null);
      // You could add a success toast here
      
    } catch (err) {
      console.error('Save search error:', err);
      setError('Failed to save search. Please try again.');
    }
  }, [savedSearchName, searchCriteria]);
  
  // Handle add to custom view
  const handleAddToView = useCallback((selectedTransactionIds) => {
    // Get the actual transaction objects from the search results
    const transactionsToAddToView = searchResults.results.filter(
      transaction => selectedTransactionIds.includes(transaction.id)
    );
    
    setTransactionsToAdd(transactionsToAddToView);
    setShowCustomViewSelector(true);
  }, [searchResults.results]);
  
  // Handle custom view selection success
  const handleCustomViewSuccess = useCallback((result) => {
    setSuccessMessage(`Successfully added ${result.transactionCount} transaction${result.transactionCount !== 1 ? 's' : ''} to "${result.viewName}"`);
    
    // Clear success message after 5 seconds
    setTimeout(() => {
      setSuccessMessage('');
    }, 5000);
  }, []);
  
  // Handle custom view selector close
  const handleCloseCustomViewSelector = useCallback(() => {
    setShowCustomViewSelector(false);
    setTransactionsToAdd([]);
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const searchTimeout = searchTimeoutRef.current;
      if (searchTimeout) {
        clearTimeout(searchTimeout);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  return (
    <div className="transaction-search-page">
      {/* Page Header */}
      <div className="search-header">
        <div className="header-content">
          <h1>
            <FiSearch className="header-icon" />
            Advanced Transaction Search
          </h1>
          <p>Search and filter your transactions with powerful criteria and export options.</p>
        </div>
        
        <div className="header-actions">
          {hasSearched && (
            <button
              className="save-search-btn"
              onClick={handleSaveSearch}
              title="Save this search"
            >
              <FiBookmark />
              Save Search
            </button>
          )}
          
          <button
            className="refresh-btn"
            onClick={() => performSearch()}
            disabled={isLoading}
            title="Refresh results"
          >
            <FiRefreshCw className={isLoading ? 'spinning' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="error-banner">
          <FiAlertCircle className="error-icon" />
          <span>{error}</span>
          <button
            className="error-close"
            onClick={() => setError(null)}
            aria-label="Dismiss error"
          >
            <FiX />
          </button>
        </div>
      )}

      {/* Success Message */}
      {successMessage && (
        <div className="success-banner">
          <FiCheckCircle className="success-icon" />
          <span>{successMessage}</span>
          <button
            className="success-close"
            onClick={() => setSuccessMessage('')}
            aria-label="Dismiss success message"
          >
            <FiX />
          </button>
        </div>
      )}

      {/* Search Form */}
      <TransactionSearchForm
        onSearch={handleSearch}
        onReset={handleReset}
        isLoading={isLoading}
        initialValues={searchCriteria}
      />

      {/* Search Results */}
      {hasSearched && (
        <TransactionSearchResults
          results={searchResults.results}
          pagination={searchResults.pagination}
          summary={searchResults.summary}
          searchCriteria={searchCriteria}
          isLoading={isLoading}
          onSort={handleSort}
          onPageChange={handlePageChange}
          onSelectionChange={handleSelectionChange}
          onExport={handleExport}
          onAddToView={handleAddToView}
          onViewTransaction={(transaction) => {
            // Navigate to transaction detail view
            navigate(`/transactions/${transaction.id}`);
          }}
          onEditTransaction={(transaction) => {
            // Navigate to transaction edit view
            navigate(`/transactions/${transaction.id}/edit`);
          }}
          onDeleteTransaction={(transaction) => {
            // Handle transaction deletion
            if (window.confirm(`Are you sure you want to delete this transaction?\n\n${transaction.description}`)) {
              // TODO: Implement delete functionality
              console.log('Delete transaction:', transaction.id);
            }
          }}
        />
      )}

      {/* Save Search Dialog */}
      {showSaveDialog && (
        <div className="modal-overlay">
          <div className="save-dialog">
            <div className="dialog-header">
              <h3>Save Search</h3>
              <button
                className="dialog-close"
                onClick={() => setShowSaveDialog(false)}
              >
                <FiX />
              </button>
            </div>
            
            <div className="dialog-content">
              <label htmlFor="search-name">Search Name:</label>
              <input
                id="search-name"
                type="text"
                value={savedSearchName}
                onChange={(e) => setSavedSearchName(e.target.value)}
                placeholder="Enter a name for this search..."
                autoFocus
              />
            </div>
            
            <div className="dialog-actions">
              <button
                className="cancel-btn"
                onClick={() => setShowSaveDialog(false)}
              >
                Cancel
              </button>
              <button
                className="save-btn"
                onClick={saveSearch}
                disabled={!savedSearchName.trim()}
              >
                <FiSave />
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom View Selector Modal */}
      <CustomViewSelector
        isOpen={showCustomViewSelector}
        onClose={handleCloseCustomViewSelector}
        transactions={transactionsToAdd}
        onSuccess={handleCustomViewSuccess}
      />
    </div>
  );
};

export default TransactionSearchPage; 