import React, { useState, useCallback, useRef, useEffect } from 'react';
import PropTypes from 'prop-types';
import { FiSearch, FiCalendar, FiX, FiLoader } from 'react-icons/fi';
import vendorMappingService from '../../services/vendorMapping';
import categoryService from '../../services/categories';
import './TransactionSearchBar.css';

const TransactionSearchBar = ({ onSearch, onClear }) => {
  // Search state
  const [searchState, setSearchState] = useState({
    vendorSearch: '',
    categorySearch: '',
    dateFrom: '',
    dateTo: '',
    datePreset: '',
  });

  // Dropdown state
  const [dropdownState, setDropdownState] = useState({
    vendorSuggestions: [],
    categorySuggestions: [],
    showVendorSuggestions: false,
    showCategorySuggestions: false,
    selectedVendorIndex: -1,
    selectedCategoryIndex: -1,
    isSearchingVendors: false,
    isSearchingCategories: false,
  });

  // Refs
  const vendorInputRef = useRef(null);
  const categoryInputRef = useRef(null);
  const vendorSuggestionsRef = useRef(null);
  const categorySuggestionsRef = useRef(null);
  const vendorTimeoutRef = useRef(null);
  const categoryTimeoutRef = useRef(null);

  // Date presets
  const datePresets = [
    { value: '', label: 'All time' },
    { value: 'last_week', label: 'Last week' },
    { value: 'last_month', label: 'Last month' },
    { value: 'last_3_months', label: 'Last 3 months' },
    { value: 'custom', label: 'Custom range' },
  ];

  // Calculate preset dates
  const getPresetDates = useCallback((preset) => {
    const today = new Date();
    const formatDate = (date) => date.toISOString().split('T')[0];

    switch (preset) {
      case 'last_week':
        const lastWeek = new Date(today);
        lastWeek.setDate(today.getDate() - 7);
        return { from: formatDate(lastWeek), to: formatDate(today) };
      
      case 'last_month':
        const lastMonth = new Date(today);
        lastMonth.setMonth(today.getMonth() - 1);
        return { from: formatDate(lastMonth), to: formatDate(today) };
      
      case 'last_3_months':
        const last3Months = new Date(today);
        last3Months.setMonth(today.getMonth() - 3);
        return { from: formatDate(last3Months), to: formatDate(today) };
      
      default:
        return { from: '', to: '' };
    }
  }, []);

  // Search vendors
  const searchVendors = useCallback(async (searchTerm) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setDropdownState(prev => ({
        ...prev,
        vendorSuggestions: [],
        showVendorSuggestions: false,
      }));
      return;
    }

    setDropdownState(prev => ({ ...prev, isSearchingVendors: true }));
    try {
      const suggestions = await vendorMappingService.searchVendorNames(searchTerm);
      setDropdownState(prev => ({
        ...prev,
        vendorSuggestions: suggestions,
        showVendorSuggestions: suggestions.length > 0,
        selectedVendorIndex: -1,
        isSearchingVendors: false,
      }));
    } catch (error) {
      console.error('Error searching vendors:', error);
      setDropdownState(prev => ({
        ...prev,
        vendorSuggestions: [],
        showVendorSuggestions: false,
        isSearchingVendors: false,
      }));
    }
  }, []);

  // Search categories
  const searchCategories = useCallback(async (searchTerm) => {
    if (!searchTerm || searchTerm.trim().length < 2) {
      setDropdownState(prev => ({
        ...prev,
        categorySuggestions: [],
        showCategorySuggestions: false,
      }));
      return;
    }

    setDropdownState(prev => ({ ...prev, isSearchingCategories: true }));
    try {
      const suggestions = await categoryService.searchCategoryNames(searchTerm);
      setDropdownState(prev => ({
        ...prev,
        categorySuggestions: suggestions,
        showCategorySuggestions: suggestions.length > 0,
        selectedCategoryIndex: -1,
        isSearchingCategories: false,
      }));
    } catch (error) {
      console.error('Error searching categories:', error);
      setDropdownState(prev => ({
        ...prev,
        categorySuggestions: [],
        showCategorySuggestions: false,
        isSearchingCategories: false,
      }));
    }
  }, []);

  // Handle vendor input change
  const handleVendorInputChange = useCallback((e) => {
    const value = e.target.value;
    setSearchState(prev => ({ ...prev, vendorSearch: value }));

    // Clear previous timeout
    if (vendorTimeoutRef.current) {
      clearTimeout(vendorTimeoutRef.current);
    }

    // Debounce search
    vendorTimeoutRef.current = setTimeout(() => {
      searchVendors(value);
    }, 300);
  }, [searchVendors]);

  // Handle category input change
  const handleCategoryInputChange = useCallback((e) => {
    const value = e.target.value;
    setSearchState(prev => ({ ...prev, categorySearch: value }));

    // Clear previous timeout
    if (categoryTimeoutRef.current) {
      clearTimeout(categoryTimeoutRef.current);
    }

    // Debounce search
    categoryTimeoutRef.current = setTimeout(() => {
      searchCategories(value);
    }, 300);
  }, [searchCategories]);

  // Handle suggestion selection
  const handleVendorSelect = useCallback((vendor) => {
    setSearchState(prev => ({ ...prev, vendorSearch: vendor }));
    setDropdownState(prev => ({
      ...prev,
      showVendorSuggestions: false,
      selectedVendorIndex: -1,
    }));
    vendorInputRef.current?.focus();
  }, []);

  const handleCategorySelect = useCallback((category) => {
    setSearchState(prev => ({ ...prev, categorySearch: category }));
    setDropdownState(prev => ({
      ...prev,
      showCategorySuggestions: false,
      selectedCategoryIndex: -1,
    }));
    categoryInputRef.current?.focus();
  }, []);

  // Handle date preset change
  const handleDatePresetChange = useCallback((e) => {
    const preset = e.target.value;
    setSearchState(prev => ({ ...prev, datePreset: preset }));

    if (preset && preset !== 'custom') {
      const dates = getPresetDates(preset);
      setSearchState(prev => ({
        ...prev,
        dateFrom: dates.from,
        dateTo: dates.to,
      }));
    } else if (preset === '') {
      setSearchState(prev => ({
        ...prev,
        dateFrom: '',
        dateTo: '',
      }));
    }
  }, [getPresetDates]);

  // Handle keyboard navigation
  const handleVendorKeyDown = useCallback((e) => {
    if (dropdownState.showVendorSuggestions && dropdownState.vendorSuggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setDropdownState(prev => ({
            ...prev,
            selectedVendorIndex: prev.selectedVendorIndex < prev.vendorSuggestions.length - 1 
              ? prev.selectedVendorIndex + 1 : 0
          }));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setDropdownState(prev => ({
            ...prev,
            selectedVendorIndex: prev.selectedVendorIndex > 0 
              ? prev.selectedVendorIndex - 1 : prev.vendorSuggestions.length - 1
          }));
          break;
        case 'Enter':
          e.preventDefault();
          if (dropdownState.selectedVendorIndex >= 0) {
            handleVendorSelect(dropdownState.vendorSuggestions[dropdownState.selectedVendorIndex]);
          }
          break;
        case 'Escape':
          setDropdownState(prev => ({ ...prev, showVendorSuggestions: false, selectedVendorIndex: -1 }));
          break;
      }
    }
  }, [dropdownState.showVendorSuggestions, dropdownState.vendorSuggestions, dropdownState.selectedVendorIndex, handleVendorSelect]);

  const handleCategoryKeyDown = useCallback((e) => {
    if (dropdownState.showCategorySuggestions && dropdownState.categorySuggestions.length > 0) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setDropdownState(prev => ({
            ...prev,
            selectedCategoryIndex: prev.selectedCategoryIndex < prev.categorySuggestions.length - 1 
              ? prev.selectedCategoryIndex + 1 : 0
          }));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setDropdownState(prev => ({
            ...prev,
            selectedCategoryIndex: prev.selectedCategoryIndex > 0 
              ? prev.selectedCategoryIndex - 1 : prev.categorySuggestions.length - 1
          }));
          break;
        case 'Enter':
          e.preventDefault();
          if (dropdownState.selectedCategoryIndex >= 0) {
            handleCategorySelect(dropdownState.categorySuggestions[dropdownState.selectedCategoryIndex]);
          }
          break;
        case 'Escape':
          setDropdownState(prev => ({ ...prev, showCategorySuggestions: false, selectedCategoryIndex: -1 }));
          break;
      }
    }
  }, [dropdownState.showCategorySuggestions, dropdownState.categorySuggestions, dropdownState.selectedCategoryIndex, handleCategorySelect]);

  // Handle manual search trigger
  const handleSearchClick = useCallback(() => {
    const searchParams = {
      vendor: searchState.vendorSearch.trim() || null,
      category: searchState.categorySearch.trim() || null,
      dateFrom: searchState.dateFrom || null,
      dateTo: searchState.dateTo || null,
    };

    // Only trigger search if any parameter has a value
    const hasSearchParams = Object.values(searchParams).some(value => value !== null);
    
    if (onSearch) {
      onSearch(hasSearchParams ? searchParams : null);
    }
  }, [searchState.vendorSearch, searchState.categorySearch, searchState.dateFrom, searchState.dateTo, onSearch]);

  // Handle clear
  const handleClear = useCallback(() => {
    setSearchState({
      vendorSearch: '',
      categorySearch: '',
      dateFrom: '',
      dateTo: '',
      datePreset: '',
    });
    setDropdownState(prev => ({
      ...prev,
      vendorSuggestions: [],
      categorySuggestions: [],
      showVendorSuggestions: false,
      showCategorySuggestions: false,
      selectedVendorIndex: -1,
      selectedCategoryIndex: -1,
    }));
    
    if (onClear) {
      onClear();
    }
  }, [onClear]);

  // Handle Enter key press in inputs to trigger search
  const handleKeyPress = useCallback((e) => {
    if (e.key === 'Enter' && !dropdownState.showVendorSuggestions && !dropdownState.showCategorySuggestions) {
      e.preventDefault();
      handleSearchClick();
    }
  }, [handleSearchClick, dropdownState.showVendorSuggestions, dropdownState.showCategorySuggestions]);

  // Check if any filters are active
  const hasActiveFilters = searchState.vendorSearch || searchState.categorySearch || 
                          searchState.dateFrom || searchState.dateTo;

  return (
    <div className="transaction-search-bar">
      <div className="search-row">
        {/* Vendor Search */}
        <div className="search-field">
          <label className="search-label">Vendor</label>
          <div className="search-input-container">
            <FiSearch className="search-icon" />
            <input
              ref={vendorInputRef}
              type="text"
              value={searchState.vendorSearch}
              onChange={handleVendorInputChange}
              onKeyDown={handleVendorKeyDown}
              onKeyPress={handleKeyPress}
              className="search-input"
              placeholder="Search vendors..."
              autoComplete="off"
            />
            {dropdownState.isSearchingVendors && (
              <FiLoader className="search-loading-icon" />
            )}
          </div>
          
          {/* Vendor Suggestions */}
          {dropdownState.showVendorSuggestions && dropdownState.vendorSuggestions.length > 0 && (
            <div ref={vendorSuggestionsRef} className="search-suggestions">
              {dropdownState.vendorSuggestions.map((suggestion, index) => (
                <div
                  key={suggestion}
                  className={`search-suggestion ${
                    index === dropdownState.selectedVendorIndex ? 'selected' : ''
                  }`}
                  onClick={() => handleVendorSelect(suggestion)}
                  onMouseEnter={() => setDropdownState(prev => ({ ...prev, selectedVendorIndex: index }))}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Category Search */}
        <div className="search-field">
          <label className="search-label">Category</label>
          <div className="search-input-container">
            <FiSearch className="search-icon" />
            <input
              ref={categoryInputRef}
              type="text"
              value={searchState.categorySearch}
              onChange={handleCategoryInputChange}
              onKeyDown={handleCategoryKeyDown}
              onKeyPress={handleKeyPress}
              className="search-input"
              placeholder="Search categories..."
              autoComplete="off"
            />
            {dropdownState.isSearchingCategories && (
              <FiLoader className="search-loading-icon" />
            )}
          </div>
          
          {/* Category Suggestions */}
          {dropdownState.showCategorySuggestions && dropdownState.categorySuggestions.length > 0 && (
            <div ref={categorySuggestionsRef} className="search-suggestions">
              {dropdownState.categorySuggestions.map((suggestion, index) => (
                <div
                  key={suggestion}
                  className={`search-suggestion ${
                    index === dropdownState.selectedCategoryIndex ? 'selected' : ''
                  }`}
                  onClick={() => handleCategorySelect(suggestion)}
                  onMouseEnter={() => setDropdownState(prev => ({ ...prev, selectedCategoryIndex: index }))}
                >
                  {suggestion}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Date Range */}
        <div className="search-field">
          <label className="search-label">Date Range</label>
          <select
            value={searchState.datePreset}
            onChange={handleDatePresetChange}
            className="search-select"
          >
            {datePresets.map(preset => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
        </div>

        {/* Custom Date Range */}
        {searchState.datePreset === 'custom' && (
          <>
            <div className="search-field">
              <label className="search-label">From</label>
              <div className="search-input-container">
                <FiCalendar className="search-icon" />
                <input
                  type="date"
                  value={searchState.dateFrom}
                  onChange={(e) => setSearchState(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="search-input"
                />
              </div>
            </div>
            <div className="search-field">
              <label className="search-label">To</label>
              <div className="search-input-container">
                <FiCalendar className="search-icon" />
                <input
                  type="date"
                  value={searchState.dateTo}
                  onChange={(e) => setSearchState(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="search-input"
                />
              </div>
            </div>
          </>
        )}

        {/* Search Button */}
        <div className="search-field">
          <button
            onClick={handleSearchClick}
            className="search-button"
            title="Search transactions"
          >
            <FiSearch />
            Search
          </button>
        </div>

        {/* Clear Button */}
        {hasActiveFilters && (
          <div className="search-field">
            <button
              onClick={handleClear}
              className="search-clear-button"
              title="Clear all filters"
            >
              <FiX />
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

TransactionSearchBar.propTypes = {
  onSearch: PropTypes.func.isRequired,
  onClear: PropTypes.func,
};

export default TransactionSearchBar; 