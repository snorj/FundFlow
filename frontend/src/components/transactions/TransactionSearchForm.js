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
import './TransactionSearchForm.css';

const TransactionSearchForm = ({ onSearch, onReset, isLoading = false, className = '' }) => {
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

  // Date presets
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
      { label: 'Last Year', start: formatDate(lastYearStart), end: formatDate(lastYearEnd) },
      { label: 'Last 30 Days', start: formatDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)), end: formatDate(today) },
      { label: 'Last 90 Days', start: formatDate(new Date(today.getTime() - 90 * 24 * 60 * 60 * 1000)), end: formatDate(today) }
    ];
  }, []);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setLoadingData(true);
      setError(null);
      try {
        const [categoriesData, transactionsData] = await Promise.all([
          categoryService.getCategories(),
          transactionService.getTransactions({ page_size: 1000 })
        ]);

        setCategories(categoriesData || []);
        
        // Extract unique vendors from transactions
        const uniqueVendors = Array.from(
          new Map(
            transactionsData
              .filter(t => t.vendor_name)
              .map(t => [t.vendor_name, { name: t.vendor_name, id: t.vendor_id || t.vendor_name }])
          ).values()
        ).sort((a, b) => a.name.localeCompare(b.name));
        
        setVendors(uniqueVendors);
      } catch (err) {
        console.error('Error loading search data:', err);
        setError('Failed to load search options. Please try again.');
      } finally {
        setLoadingData(false);
      }
    };

    loadData();
  }, []);

  // Filter vendors based on search term
  const filteredVendors = useMemo(() => {
    if (!vendorSearchTerm.trim()) return vendors;
    return vendors.filter(vendor => 
      vendor.name.toLowerCase().includes(vendorSearchTerm.toLowerCase())
    );
  }, [vendors, vendorSearchTerm]);

  // Filter categories based on search term
  const filteredCategories = useMemo(() => {
    if (!categorySearchTerm.trim()) return categories;
    return categories.filter(category => 
      category.name.toLowerCase().includes(categorySearchTerm.toLowerCase())
    );
  }, [categories, categorySearchTerm]);

  // Handle form changes
  const handleFilterChange = useCallback((key, value) => {
    setFilters(prev => ({
      ...prev,
      [key]: value
    }));
  }, []);

  // Handle vendor selection
  const handleVendorToggle = useCallback((vendor) => {
    setFilters(prev => ({
      ...prev,
      vendors: prev.vendors.some(v => v.id === vendor.id)
        ? prev.vendors.filter(v => v.id !== vendor.id)
        : [...prev.vendors, vendor]
    }));
  }, []);

  // Handle category selection
  const handleCategoryToggle = useCallback((category) => {
    setFilters(prev => ({
      ...prev,
      categories: prev.categories.some(c => c.id === category.id)
        ? prev.categories.filter(c => c.id !== category.id)
        : [...prev.categories, category]
    }));
  }, []);

  // Handle date preset selection
  const handleDatePreset = useCallback((preset) => {
    setFilters(prev => ({
      ...prev,
      dateRange: { start: preset.start, end: preset.end }
    }));
  }, []);

  // Handle amount range changes
  const handleAmountRangeChange = useCallback((field, value) => {
    const numValue = value === '' ? '' : parseFloat(value);
    if (value !== '' && (isNaN(numValue) || numValue < 0)) return;
    
    setFilters(prev => ({
      ...prev,
      amountRange: { ...prev.amountRange, [field]: value }
    }));
  }, []);

  // Handle form submission
  const handleSubmit = useCallback((e) => {
    e.preventDefault();
    if (onSearch) {
      onSearch(filters);
    }
  }, [filters, onSearch]);

  // Handle form reset
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
    setIsVendorDropdownOpen(false);
    setIsCategoryDropdownOpen(false);
    if (onReset) {
      onReset();
    }
  }, [onReset]);

  // Check if form has active filters
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
                          onClick={() => handleVendorToggle(vendor)}
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
                          onClick={() => handleCategoryToggle(category)}
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
                onChange={(e) => handleAmountRangeChange('min', e.target.value)}
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
                onChange={(e) => handleAmountRangeChange('max', e.target.value)}
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
};

TransactionSearchForm.propTypes = {
  onSearch: PropTypes.func.isRequired,
  onReset: PropTypes.func,
  isLoading: PropTypes.bool,
  className: PropTypes.string
};

export default TransactionSearchForm; 