import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { 
  FiChevronDown, 
  FiTag, 
  FiCheck, 
  FiPlus,
  FiLoader
} from 'react-icons/fi';
import customViewService from '../../services/customViews';
import './CustomCategorySelector.css';

const CustomCategorySelector = ({ 
  viewId,
  currentCategoryId = null,
  currentCategoryName = null,
  onCategoryChange,
  disabled = false,
  size = 'medium',
  placeholder = 'Select category...',
  allowUncategorized = true,
  showCreateOption = true
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // Load custom categories when dropdown opens
  useEffect(() => {
    if (isOpen && viewId && categories.length === 0) {
      loadCategories();
    }
  }, [isOpen, viewId]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
        setSearchTerm('');
        setIsCreating(false);
        setNewCategoryName('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  const loadCategories = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const customCategories = await customViewService.getCustomCategories(viewId);
      setCategories(customCategories || []);
    } catch (err) {
      console.error('Error loading custom categories:', err);
      setError('Failed to load categories');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
    setError(null);
  };

  const handleCategorySelect = (categoryId, categoryName) => {
    if (onCategoryChange) {
      onCategoryChange(categoryId, categoryName);
    }
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim() || !showCreateOption) return;

    setIsCreating(true);
    setError(null);

    try {
      const createdCategory = await customViewService.createCustomCategory(viewId, {
        name: newCategoryName.trim(),
        parent: null,
        order: categories.length
      });

      // Add to local categories list
      setCategories(prev => [...prev, createdCategory]);
      
      // Auto-select the newly created category
      handleCategorySelect(createdCategory.id, createdCategory.name);
      
      setNewCategoryName('');
      setIsCreating(false);
    } catch (err) {
      console.error('Error creating category:', err);
      setError('Failed to create category');
      setIsCreating(false);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && newCategoryName.trim()) {
      event.preventDefault();
      handleCreateCategory();
    } else if (event.key === 'Escape') {
      setIsCreating(false);
      setNewCategoryName('');
    }
  };

  // Filter categories based on search term
  const filteredCategories = categories.filter(category =>
    category.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Get display text for current selection
  const getDisplayText = () => {
    if (currentCategoryName) {
      return currentCategoryName;
    }
    if (allowUncategorized) {
      return 'Uncategorized';
    }
    return placeholder;
  };

  // Determine if current selection is uncategorized
  const isUncategorized = !currentCategoryId;

  return (
    <div 
      className={`custom-category-selector ${size} ${disabled ? 'disabled' : ''}`}
      ref={dropdownRef}
    >
      <div 
        className={`selector-trigger ${isOpen ? 'open' : ''} ${isUncategorized ? 'uncategorized' : ''}`}
        onClick={handleToggle}
        role="button"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
      >
        <div className="selector-content">
          <FiTag className="selector-icon" />
          <span className="selector-text">{getDisplayText()}</span>
        </div>
        <FiChevronDown className={`dropdown-arrow ${isOpen ? 'rotated' : ''}`} />
      </div>

      {isOpen && (
        <div className="selector-dropdown">
          {/* Search input */}
          <div className="dropdown-search">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="dropdown-loading">
              <FiLoader className="spinner" />
              <span>Loading categories...</span>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="dropdown-error">
              <span>{error}</span>
              <button onClick={loadCategories} className="retry-btn">
                Retry
              </button>
            </div>
          )}

          {/* Categories list */}
          {!isLoading && !error && (
            <div className="dropdown-options" role="listbox">
              {/* Uncategorized option */}
              {allowUncategorized && (
                <div
                  className={`dropdown-option ${isUncategorized ? 'selected' : ''}`}
                  onClick={() => handleCategorySelect(null, null)}
                  role="option"
                  aria-selected={isUncategorized}
                >
                  <div className="option-content">
                    <span className="option-label uncategorized">Uncategorized</span>
                    {isUncategorized && <FiCheck className="check-icon" />}
                  </div>
                </div>
              )}

              {/* Custom categories */}
              {filteredCategories.length > 0 ? (
                filteredCategories.map(category => {
                  const isSelected = currentCategoryId === category.id;
                  return (
                    <div
                      key={category.id}
                      className={`dropdown-option ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleCategorySelect(category.id, category.name)}
                      role="option"
                      aria-selected={isSelected}
                    >
                      <div className="option-content">
                        <span className="option-label">{category.name}</span>
                        {isSelected && <FiCheck className="check-icon" />}
                      </div>
                    </div>
                  );
                })
              ) : (
                !isCreating && searchTerm && (
                  <div className="no-results">
                    No categories found for "{searchTerm}"
                  </div>
                )
              )}

              {/* Create new category option */}
              {showCreateOption && !isLoading && !error && (
                <>
                  {!isCreating ? (
                    <div
                      className="dropdown-option create-option"
                      onClick={() => setIsCreating(true)}
                    >
                      <div className="option-content">
                        <FiPlus className="option-icon" />
                        <span className="option-label">Create new category</span>
                      </div>
                    </div>
                  ) : (
                    <div className="create-category-form">
                      <input
                        type="text"
                        placeholder="Category name..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="create-input"
                        autoFocus
                      />
                      <div className="create-actions">
                        <button
                          onClick={handleCreateCategory}
                          disabled={!newCategoryName.trim() || isCreating}
                          className="create-btn"
                        >
                          {isCreating ? <FiLoader className="spinner" /> : <FiCheck />}
                        </button>
                        <button
                          onClick={() => {
                            setIsCreating(false);
                            setNewCategoryName('');
                          }}
                          className="cancel-btn"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

CustomCategorySelector.propTypes = {
  viewId: PropTypes.string.isRequired,
  currentCategoryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  currentCategoryName: PropTypes.string,
  onCategoryChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  size: PropTypes.oneOf(['small', 'medium', 'large']),
  placeholder: PropTypes.string,
  allowUncategorized: PropTypes.bool,
  showCreateOption: PropTypes.bool
};

export default CustomCategorySelector; 