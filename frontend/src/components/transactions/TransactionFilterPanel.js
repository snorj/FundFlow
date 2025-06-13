import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { 
  FiFilter, 
  FiX, 
  FiCalendar, 
  FiDollarSign,
  FiTag,
  FiEye,
  FiEyeOff
} from 'react-icons/fi';
import CustomCategorySelector from '../modals/CustomCategorySelector';
import './TransactionFilterPanel.css';

const TransactionFilterPanel = ({
  viewId,
  onFiltersChange,
  isCollapsed: initialCollapsed = false,
  totalTransactions = 0,
  filteredTransactions = 0
}) => {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [filters, setFilters] = useState({
    category: null,
    categoryName: null,
    dateRange: {
      from: '',
      to: '',
      preset: ''
    },
    amountRange: {
      min: '',
      max: ''
    },
    showUncategorizedOnly: false,
    showCategorizedOnly: false
  });

  // Date presets
  const datePresets = [
    { key: 'today', label: 'Today' },
    { key: 'yesterday', label: 'Yesterday' },
    { key: 'this_week', label: 'This Week' },
    { key: 'last_week', label: 'Last Week' },
    { key: 'this_month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'this_quarter', label: 'This Quarter' },
    { key: 'last_quarter', label: 'Last Quarter' },
    { key: 'this_year', label: 'This Year' },
    { key: 'last_year', label: 'Last Year' }
  ];

  // Calculate date range for presets
  const getDateRangeForPreset = (preset) => {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    
    switch (preset) {
      case 'today':
        return {
          from: startOfDay.toISOString().split('T')[0],
          to: startOfDay.toISOString().split('T')[0]
        };
        
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return {
          from: yesterday.toISOString().split('T')[0],
          to: yesterday.toISOString().split('T')[0]
        };
        
      case 'this_week':
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        return {
          from: startOfWeek.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0]
        };
        
      case 'this_month':
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          from: startOfMonth.toISOString().split('T')[0],
          to: today.toISOString().split('T')[0]
        };
        
      case 'last_month':
        const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
        return {
          from: lastMonthStart.toISOString().split('T')[0],
          to: lastMonthEnd.toISOString().split('T')[0]
        };
        
      default:
        return { from: '', to: '' };
    }
  };

  // Update filters when any filter changes
  useEffect(() => {
    if (onFiltersChange) {
      onFiltersChange(filters);
    }
  }, [filters, onFiltersChange]);

  // Handle category filter change
  const handleCategoryChange = (categoryId, categoryName) => {
    setFilters(prev => ({
      ...prev,
      category: categoryId,
      categoryName: categoryName
    }));
  };

  // Handle date preset selection
  const handleDatePresetChange = (preset) => {
    const dateRange = getDateRangeForPreset(preset);
    setFilters(prev => ({
      ...prev,
      dateRange: {
        ...dateRange,
        preset: preset
      }
    }));
  };

  // Handle custom date range input
  const handleDateRangeChange = (field, value) => {
    setFilters(prev => ({
      ...prev,
      dateRange: {
        ...prev.dateRange,
        [field]: value,
        preset: '' // Clear preset when manually setting dates
      }
    }));
  };

  // Handle amount range change
  const handleAmountRangeChange = (field, value) => {
    // Allow empty string or valid numbers
    if (value === '' || (!isNaN(value) && !isNaN(parseFloat(value)))) {
      setFilters(prev => ({
        ...prev,
        amountRange: {
          ...prev.amountRange,
          [field]: value
        }
      }));
    }
  };

  // Handle categorization status toggle
  const handleCategorizationToggle = (type) => {
    setFilters(prev => {
      const newFilters = { ...prev };
      
      if (type === 'uncategorized') {
        newFilters.showUncategorizedOnly = !prev.showUncategorizedOnly;
        if (newFilters.showUncategorizedOnly) {
          newFilters.showCategorizedOnly = false;
        }
      } else if (type === 'categorized') {
        newFilters.showCategorizedOnly = !prev.showCategorizedOnly;
        if (newFilters.showCategorizedOnly) {
          newFilters.showUncategorizedOnly = false;
        }
      }
      
      return newFilters;
    });
  };

  // Clear all filters
  const handleClearFilters = () => {
    setFilters({
      category: null,
      categoryName: null,
      dateRange: {
        from: '',
        to: '',
        preset: ''
      },
      amountRange: {
        min: '',
        max: ''
      },
      showUncategorizedOnly: false,
      showCategorizedOnly: false
    });
  };

  // Check if any filters are active
  const hasActiveFilters = () => {
    return !!(
      filters.category ||
      filters.dateRange.from ||
      filters.dateRange.to ||
      filters.amountRange.min ||
      filters.amountRange.max ||
      filters.showUncategorizedOnly ||
      filters.showCategorizedOnly
    );
  };

  return (
    <div className={`transaction-filter-panel ${isCollapsed ? 'collapsed' : 'expanded'}`}>
      {/* Filter Header */}
      <div className="filter-header">
        <div className="filter-header-left">
          <button
            className="filter-toggle"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Show Filters' : 'Hide Filters'}
          >
            <FiFilter />
            <span>Filters</span>
            {hasActiveFilters() && <span className="active-indicator">●</span>}
          </button>
          
          {!isCollapsed && hasActiveFilters() && (
            <button
              className="clear-filters-btn"
              onClick={handleClearFilters}
              title="Clear all filters"
            >
              <FiX />
              Clear Filters
            </button>
          )}
        </div>
        
        <div className="filter-results">
          <span className="results-text">
            {filteredTransactions} of {totalTransactions} transactions
          </span>
        </div>
      </div>

      {/* Filter Controls */}
      {!isCollapsed && (
        <div className="filter-controls">
          {/* Category Filter */}
          <div className="filter-group">
            <label className="filter-label">
              <FiTag />
              Category
            </label>
            <CustomCategorySelector
              viewId={viewId}
              currentCategoryId={filters.category}
              currentCategoryName={filters.categoryName}
              onCategoryChange={handleCategoryChange}
              size="small"
              placeholder="All categories"
              allowUncategorized={false}
              showCreateOption={false}
            />
          </div>

          {/* Date Range Filter */}
          <div className="filter-group">
            <label className="filter-label">
              <FiCalendar />
              Date Range
            </label>
            
            {/* Date Presets */}
            <div className="date-presets">
              <select
                value={filters.dateRange.preset}
                onChange={(e) => handleDatePresetChange(e.target.value)}
                className="preset-select"
              >
                <option value="">Custom Range</option>
                {datePresets.map(preset => (
                  <option key={preset.key} value={preset.key}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Custom Date Inputs */}
            <div className="date-inputs">
              <input
                type="date"
                value={filters.dateRange.from}
                onChange={(e) => handleDateRangeChange('from', e.target.value)}
                className="date-input"
                placeholder="From"
              />
              <span className="date-separator">to</span>
              <input
                type="date"
                value={filters.dateRange.to}
                onChange={(e) => handleDateRangeChange('to', e.target.value)}
                className="date-input"
                placeholder="To"
              />
            </div>
          </div>

          {/* Amount Range Filter */}
          <div className="filter-group">
            <label className="filter-label">
              <FiDollarSign />
              Amount Range
            </label>
            <div className="amount-inputs">
              <input
                type="number"
                value={filters.amountRange.min}
                onChange={(e) => handleAmountRangeChange('min', e.target.value)}
                className="amount-input"
                placeholder="Min amount"
                step="0.01"
                min="0"
              />
              <span className="amount-separator">to</span>
              <input
                type="number"
                value={filters.amountRange.max}
                onChange={(e) => handleAmountRangeChange('max', e.target.value)}
                className="amount-input"
                placeholder="Max amount"
                step="0.01"
                min="0"
              />
            </div>
          </div>

          {/* Categorization Status Filter */}
          <div className="filter-group">
            <label className="filter-label">Show Only</label>
            <div className="status-toggles">
              <button
                className={`status-toggle ${filters.showUncategorizedOnly ? 'active' : ''}`}
                onClick={() => handleCategorizationToggle('uncategorized')}
              >
                {filters.showUncategorizedOnly ? <FiEye /> : <FiEyeOff />}
                Uncategorized
              </button>
              
              <button
                className={`status-toggle ${filters.showCategorizedOnly ? 'active' : ''}`}
                onClick={() => handleCategorizationToggle('categorized')}
              >
                {filters.showCategorizedOnly ? <FiEye /> : <FiEyeOff />}
                Categorized
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

TransactionFilterPanel.propTypes = {
  viewId: PropTypes.string.isRequired,
  onFiltersChange: PropTypes.func.isRequired,
  isCollapsed: PropTypes.bool,
  totalTransactions: PropTypes.number,
  filteredTransactions: PropTypes.number
};

export default TransactionFilterPanel; 