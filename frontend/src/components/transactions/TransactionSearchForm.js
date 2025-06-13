import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { 
  FiSearch, 
  FiFilter, 
  FiX, 
  FiCalendar, 
  FiDollarSign, 
  FiTag, 
  FiRefreshCw,
  FiChevronDown,
  FiCheck
} from 'react-icons/fi';
import categoryService from '../../services/categories';
import transactionService from '../../services/transactions';
import { formatCurrency } from '../../utils/formatting';
import { useDebounce, useDebouncedCallback } from '../../hooks/useDebounce';
import { usePerformanceMonitor } from '../../hooks/usePerformanceMonitor';
import './TransactionSearchForm.css';

const TransactionSearchForm = React.memo(({ onSearch, onReset, isLoading = false, className = '' }) => {
  // Performance monitoring
  const { performanceData } = usePerformanceMonitor('TransactionSearchForm');

  // Form state
  const [filters, setFilters] = useState({
    vendors: [],
    categories: [],
    dateRange: { start: '', end: '' },
    amountRange: { min: '', max: '' },
    keywords: '',
    direction: 'all', // 'all', 'inflow', 'outflow'
    logic: 'AND'
  });

  // Data state
  const [vendors, setVendors] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState(null);

  // UI state
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [vendorSearchTerm, setVendorSearchTerm] = useState('');
  const [categorySearchTerm, setCategorySearchTerm] = useState('');
  const [isVendorDropdownOpen, setIsVendorDropdownOpen] = useState(false);
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);

  // Debounced search terms for performance
  const debouncedVendorSearch = useDebounce(vendorSearchTerm, 300);
  const debouncedCategorySearch = useDebounce(categorySearchTerm, 300);
  const debouncedKeywords = useDebounce(filters.keywords, 500);

  // Debounced search callback
  const debouncedSearch = useDebouncedCallback((searchFilters) => {
    if (onSearch) {
      onSearch(searchFilters);
    }
  }, 400, [onSearch]);

  // Date presets - memoized for performance
  const datePresets = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const thisWeekStart = new Date(today);
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
    
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);
    
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
    
    const thisYearStart = new Date(now.getFullYear(), 0, 1);
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const lastYearEnd = new Date(now.getFullYear() - 1, 11, 31);

    const formatDate = (date) => date.toISOString().split('T')[0];

    return [
      { label: 'Today', start: formatDate(today), end: formatDate(today) },
      { label: 'Yesterday', start: formatDate(yesterday), end: formatDate(yesterday) },
      { label: 'This Week', start: formatDate(thisWeekStart), end: formatDate(today) },
      { label: 'Last Week', start: formatDate(lastWeekStart), end: formatDate(lastWeekEnd) },
      { label: 'This Month', start: formatDate(thisMonthStart), end: formatDate(today) },
      { label: 'Last Month', start: formatDate(lastMonthStart), end: formatDate(lastMonthEnd) },
      { label: 'This Year', start: formatDate(thisYearStart), end: formatDate(today) },
      { label: 'Last Year', start: formatDate(lastYearStart), end: formatDate(lastYearEnd) }
    ];
  }, []);

  // Filtered vendors and categories - memoized for performance
  const filteredVendors = useMemo(() => {
    if (!debouncedVendorSearch) return vendors;
    return vendors.filter(vendor => 
      vendor.name.toLowerCase().includes(debouncedVendorSearch.toLowerCase())
    );
  }, [vendors, debouncedVendorSearch]);

  const filteredCategories = useMemo(() => {
    if (!debouncedCategorySearch) return categories;
    return categories.filter(category => 
      category.name.toLowerCase().includes(debouncedCategorySearch.toLowerCase())
    );
  }, [categories, debouncedCategorySearch]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      setError(null);
      
      try {
        const [vendorData, categoryData] = await Promise.all([
          transactionService.getVendors(),
          categoryService.getCategories()
        ]);
        
        setVendors(vendorData || []);
        setCategories(categoryData || []);
      } catch (err) {
        console.error('Failed to load search data:', err);
        setError('Failed to load search options. Please try again.');
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

  // Trigger search when debounced keywords change
  useEffect(() => {
    if (debouncedKeywords !== filters.keywords) {
      const updatedFilters = { ...filters, keywords: debouncedKeywords };
      setFilters(updatedFilters);
      debouncedSearch(updatedFilters);
    }
  }, [debouncedKeywords, filters, debouncedSearch]);

  // Optimized filter update function
  const updateFilters = useCallback((updates) => {
    setFilters(prevFilters => {
      const newFilters = { ...prevFilters, ...updates };
      
      // Trigger search for non-keyword changes immediately
      if (!updates.hasOwnProperty('keywords')) {
        debouncedSearch(newFilters);
      }
      
      return newFilters;
    });
  }, [debouncedSearch]);

  // Optimized event handlers
  const handleVendorToggle = useCallback((vendorId) => {
    updateFilters({
      vendors: filters.vendors.includes(vendorId)
        ? filters.vendors.filter(id => id !== vendorId)
        : [...filters.vendors, vendorId]
    });
  }, [filters.vendors, updateFilters]);

  const handleCategoryToggle = useCallback((categoryId) => {
    updateFilters({
      categories: filters.categories.includes(categoryId)
        ? filters.categories.filter(id => id !== categoryId)
        : [...filters.categories, categoryId]
    });
  }, [filters.categories, updateFilters]);

  const handleDatePreset = useCallback((preset) => {
    updateFilters({
      dateRange: { start: preset.start, end: preset.end }
    });
  }, [updateFilters]);

  const handleFilterChange = useCallback((key, value) => {
    updateFilters({ [key]: value });
  }, [updateFilters]);

  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    debouncedSearch(filters);
  }, [filters, debouncedSearch]);

  const handleReset = useCallback(() => {
    const resetFilters = {
      vendors: [],
      categories: [],
      dateRange: { start: '', end: '' },
      amountRange: { min: '', max: '' },
      keywords: '',
      direction: 'all',
      logic: 'AND'
    };
    
    setFilters(resetFilters);
    setVendorSearchTerm('');
    setCategorySearchTerm('');
    
    if (onReset) {
      onReset();
    }
  }, [onReset]);

  // Check if form has active filters - memoized for performance
  const hasActiveFilters = useMemo(() => {
    return filters.vendors.length > 0 ||
           filters.categories.length > 0 ||
           filters.dateRange.start ||
           filters.dateRange.end ||
           filters.amountRange.min ||
           filters.amountRange.max ||
           filters.keywords.trim() ||
           filters.direction !== 'all';
  }, [filters]);

  if (loadingData) {
    return (
      <div className={`transaction-search-form loading ${className}`}>
        <div className="search-loading">
          <FiRefreshCw className="spinner" />
          <p>Loading search options...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`transaction-search-form error ${className}`}>
        <div className="search-error">
          <p>{error}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <form 
      className={`transaction-search-form ${className}`} 
      onSubmit={handleSubmit}
      role="search"
      aria-label="Transaction search form"
    >
      {/* Basic Search Row */}
      <div className="search-row basic-search">
        <div className="search-input-group">
          <FiSearch className="search-icon" />
          <input
            type="text"
            placeholder="Search descriptions, notes, or transaction details..."
            value={filters.keywords}
            onChange={(e) => handleFilterChange('keywords', e.target.value)}
            className="search-input keywords-input"
            aria-label="Search keywords"
          />
          {filters.keywords && (
            <button
              type="button"
              className="clear-input-btn"
              onClick={() => handleFilterChange('keywords', '')}
              aria-label="Clear keywords"
            >
              <FiX />
            </button>
          )}
        </div>
        
        <div className="search-actions">
          <button
            type="button"
            className={`advanced-toggle ${showAdvanced ? 'active' : ''}`}
            onClick={() => setShowAdvanced(!showAdvanced)}
            aria-expanded={showAdvanced}
            aria-controls="advanced-filters"
          >
            <FiFilter />
            Advanced {showAdvanced ? '▲' : '▼'}
          </button>
          
          <button
            type="submit"
            className="search-btn primary"
            disabled={isLoading}
            aria-label="Search transactions"
          >
            {isLoading ? <FiRefreshCw className="spinner" /> : <FiSearch />}
            Search
          </button>
          
          {hasActiveFilters && (
            <button
              type="button"
              className="reset-btn secondary"
              onClick={handleReset}
              aria-label="Reset all filters"
            >
              <FiX />
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div id="advanced-filters" className="advanced-filters">
          {/* Vendor Filter */}
          <div className="filter-group">
            <label className="filter-label">
              <FiTag className="label-icon" />
              Vendors ({filters.vendors.length} selected)
            </label>
            <div className="dropdown-container">
              <div 
                className={`dropdown-trigger ${isVendorDropdownOpen ? 'open' : ''}`}
                onClick={() => setIsVendorDropdownOpen(!isVendorDropdownOpen)}
                role="button"
                aria-expanded={isVendorDropdownOpen}
                aria-haspopup="listbox"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsVendorDropdownOpen(!isVendorDropdownOpen);
                  }
                }}
              >
                <span>
                  {filters.vendors.length === 0 
                    ? 'Select vendors...' 
                    : `${filters.vendors.length} vendor${filters.vendors.length !== 1 ? 's' : ''} selected`
                  }
                </span>
                <FiChevronDown className="dropdown-arrow" />
              </div>
              
              {isVendorDropdownOpen && (
                <div className="dropdown-content vendors-dropdown">
                  <div className="dropdown-search">
                    <FiSearch className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search vendors..."
                      value={vendorSearchTerm}
                      onChange={(e) => setVendorSearchTerm(e.target.value)}
                      className="dropdown-search-input"
                      autoFocus
                    />
                  </div>
                  <div className="dropdown-options" role="listbox">
                    {filteredVendors.length === 0 ? (
                      <div className="no-options">No vendors found</div>
                    ) : (
                      filteredVendors.map(vendor => (
                        <div
                          key={vendor.id}
                          className={`dropdown-option ${filters.vendors.some(v => v.id === vendor.id) ? 'selected' : ''}`}
                          onClick={() => handleVendorToggle(vendor.id)}
                          role="option"
                          aria-selected={filters.vendors.some(v => v.id === vendor.id)}
                        >
                          <div className="option-checkbox">
                            {filters.vendors.some(v => v.id === vendor.id) && <FiCheck />}
                          </div>
                          <span className="option-label">{vendor.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Category Filter */}
          <div className="filter-group">
            <label className="filter-label">
              <FiTag className="label-icon" />
              Categories ({filters.categories.length} selected)
            </label>
            <div className="dropdown-container">
              <div 
                className={`dropdown-trigger ${isCategoryDropdownOpen ? 'open' : ''}`}
                onClick={() => setIsCategoryDropdownOpen(!isCategoryDropdownOpen)}
                role="button"
                aria-expanded={isCategoryDropdownOpen}
                aria-haspopup="listbox"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setIsCategoryDropdownOpen(!isCategoryDropdownOpen);
                  }
                }}
              >
                <span>
                  {filters.categories.length === 0 
                    ? 'Select categories...' 
                    : `${filters.categories.length} categor${filters.categories.length !== 1 ? 'ies' : 'y'} selected`
                  }
                </span>
                <FiChevronDown className="dropdown-arrow" />
              </div>
              
              {isCategoryDropdownOpen && (
                <div className="dropdown-content categories-dropdown">
                  <div className="dropdown-search">
                    <FiSearch className="search-icon" />
                    <input
                      type="text"
                      placeholder="Search categories..."
                      value={categorySearchTerm}
                      onChange={(e) => setCategorySearchTerm(e.target.value)}
                      className="dropdown-search-input"
                      autoFocus
                    />
                  </div>
                  <div className="dropdown-options" role="listbox">
                    {filteredCategories.length === 0 ? (
                      <div className="no-options">No categories found</div>
                    ) : (
                      filteredCategories.map(category => (
                        <div
                          key={category.id}
                          className={`dropdown-option ${filters.categories.some(c => c.id === category.id) ? 'selected' : ''}`}
                          onClick={() => handleCategoryToggle(category.id)}
                          role="option"
                          aria-selected={filters.categories.some(c => c.id === category.id)}
                        >
                          <div className="option-checkbox">
                            {filters.categories.some(c => c.id === category.id) && <FiCheck />}
                          </div>
                          <span className="option-label">{category.name}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Date Range Filter */}
          <div className="filter-group date-filter">
            <label className="filter-label">
              <FiCalendar className="label-icon" />
              Date Range
            </label>
            <div className="date-inputs">
              <input
                type="date"
                value={filters.dateRange.start}
                onChange={(e) => handleFilterChange('dateRange', { ...filters.dateRange, start: e.target.value })}
                className="date-input"
                aria-label="Start date"
              />
              <span className="date-separator">to</span>
              <input
                type="date"
                value={filters.dateRange.end}
                onChange={(e) => handleFilterChange('dateRange', { ...filters.dateRange, end: e.target.value })}
                className="date-input"
                aria-label="End date"
              />
            </div>
            <div className="date-presets">
              {datePresets.map(preset => (
                <button
                  key={preset.label}
                  type="button"
                  className="preset-btn"
                  onClick={() => handleDatePreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount Range Filter */}
          <div className="filter-group amount-filter">
            <label className="filter-label">
              <FiDollarSign className="label-icon" />
              Amount Range
            </label>
            <div className="amount-inputs">
              <input
                type="number"
                placeholder="Min amount"
                value={filters.amountRange.min}
                onChange={(e) => handleFilterChange('amountRange', { ...filters.amountRange, min: e.target.value })}
                className="amount-input"
                min="0"
                step="0.01"
                aria-label="Minimum amount"
              />
              <span className="amount-separator">to</span>
              <input
                type="number"
                placeholder="Max amount"
                value={filters.amountRange.max}
                onChange={(e) => handleFilterChange('amountRange', { ...filters.amountRange, max: e.target.value })}
                className="amount-input"
                min="0"
                step="0.01"
                aria-label="Maximum amount"
              />
            </div>
          </div>

          {/* Direction Filter */}
          <div className="filter-group direction-filter">
            <label className="filter-label">
              Transaction Type
            </label>
            <div className="direction-options">
              <label className="radio-option">
                <input
                  type="radio"
                  value="all"
                  checked={filters.direction === 'all'}
                  onChange={(e) => handleFilterChange('direction', e.target.value)}
                />
                <span>All Transactions</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  value="inflow"
                  checked={filters.direction === 'inflow'}
                  onChange={(e) => handleFilterChange('direction', e.target.value)}
                />
                <span>Income (Inflow)</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  value="outflow"
                  checked={filters.direction === 'outflow'}
                  onChange={(e) => handleFilterChange('direction', e.target.value)}
                />
                <span>Expenses (Outflow)</span>
              </label>
            </div>
          </div>

          {/* Logic Filter */}
          <div className="filter-group logic-filter">
            <label className="filter-label">
              Filter Logic
            </label>
            <div className="logic-options">
              <label className="radio-option">
                <input
                  type="radio"
                  value="AND"
                  checked={filters.logic === 'AND'}
                  onChange={(e) => handleFilterChange('logic', e.target.value)}
                />
                <span>Match ALL criteria (AND)</span>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  value="OR"
                  checked={filters.logic === 'OR'}
                  onChange={(e) => handleFilterChange('logic', e.target.value)}
                />
                <span>Match ANY criteria (OR)</span>
              </label>
            </div>
          </div>
        </div>
      )}
    </form>
  );
});

TransactionSearchForm.propTypes = {
  onSearch: PropTypes.func.isRequired,
  onReset: PropTypes.func,
  isLoading: PropTypes.bool,
  className: PropTypes.string
};

export default TransactionSearchForm; 