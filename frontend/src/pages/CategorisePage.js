import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CategoryTreeNode from '../components/categorization/CategoryTreeNode';
import categoryService from '../services/categories';
import { FiPlus, FiLoader, FiAlertCircle, FiEdit, FiArrowRight, FiSearch } from 'react-icons/fi';
import './CategorisePage.css'; // We'll create this CSS file next

const CategorisePage = () => {
  const navigate = useNavigate();
  const [availableCategories, setAvailableCategories] = useState([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [error, setError] = useState(null);

  const [searchTerm, setSearchTerm] = useState('');

  const [showTopLevelInput, setShowTopLevelInput] = useState(false);
  const [newTopLevelName, setNewTopLevelName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState(null);

  const fetchCategories = useCallback(async () => {
    setIsLoadingCategories(true);
    setError(null);
    try {
      const categoriesData = await categoryService.getCategories();
      setAvailableCategories(categoriesData || []);
    } catch (err) {
      console.error("Error fetching categories:", err);
      setError(err.message || 'Failed to load categories.');
    } finally {
      setIsLoadingCategories(false);
    }
  }, []);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  const handleCreateCategory = useCallback(async (name, parentId = null) => {
    setIsCreating(true);
    setCreateError(null);
    try {
      const newCategoryData = { name, parent: parentId };
      await categoryService.createCategory(newCategoryData);
      await fetchCategories(); 
      setShowTopLevelInput(false);
      setNewTopLevelName('');
    } catch (error) {
      console.error("Failed to create category:", error);
      setCreateError(error.message || "Failed to create category.");
      throw error; // Re-throw for CategoryTreeNode to handle inline errors
    } finally {
      setIsCreating(false);
    }
  }, [fetchCategories]);

  const categoriesById = useMemo(() => 
    new Map(availableCategories.map(cat => [cat.id, cat]))
  , [availableCategories]);

  const visibleCategoryIds = useMemo(() => {
    if (!searchTerm.trim()) {
      return null; // No filter, all are visible conceptually
    }
    const lowerSearchTerm = searchTerm.toLowerCase();
    const directMatches = new Set();

    availableCategories.forEach(category => {
      if (category.name.toLowerCase().includes(lowerSearchTerm)) {
        directMatches.add(category.id);
      }
    });

    if (directMatches.size === 0) {
      return new Set(); // Search term present, but no direct matches
    }

    const visibleIds = new Set(directMatches);
    directMatches.forEach(matchId => {
      let currentId = categoriesById.get(matchId)?.parent;
      while (currentId) {
        visibleIds.add(currentId);
        const parentCategory = categoriesById.get(currentId);
        currentId = parentCategory ? parentCategory.parent : null;
      }
    });
    return visibleIds;
  }, [availableCategories, searchTerm, categoriesById]);

  const systemRootCategories = useMemo(() => 
    availableCategories.filter(cat => 
      !cat.parent && 
      !cat.is_custom &&
      (visibleCategoryIds === null || visibleCategoryIds.has(cat.id))
    )
  , [availableCategories, visibleCategoryIds]);

  const userRootCategories = useMemo(() => 
    availableCategories.filter(cat => 
      !cat.parent && 
      cat.is_custom &&
      (visibleCategoryIds === null || visibleCategoryIds.has(cat.id))
    )
  , [availableCategories, visibleCategoryIds]);

  const handleAddTopLevelClick = () => {
    setShowTopLevelInput(true);
    setNewTopLevelName('');
    setCreateError(null);
  };

  const handleSaveTopLevel = () => {
    if (!newTopLevelName.trim()) {
      setCreateError("Category name cannot be empty.");
      return;
    }
    handleCreateCategory(newTopLevelName, null);
  };

  const handleCancelTopLevel = () => {
    setShowTopLevelInput(false);
    setNewTopLevelName('');
    setCreateError(null);
  };
  
  const goToCategoriseTransactions = () => {
    navigate('/categorise/transactions');
  };

  if (isLoadingCategories) {
    return <div className="page-loading-state"><FiLoader className="spinner" /> <p>Loading Categories...</p></div>;
  }

  if (error) {
    return <div className="page-error-state"><FiAlertCircle /> <p>Error: {error}</p><button onClick={fetchCategories}>Retry</button></div>;
  }

  const noResultsFromSearch = searchTerm.trim() && visibleCategoryIds && visibleCategoryIds.size === 0;

  return (
    <div className="categorise-page-container">
      <div className="categorise-header-bar">
        <h1>Manage Categories</h1>
        <button onClick={goToCategoriseTransactions} className="action-button teal-button navigate-button">
            <FiEdit className="button-icon"/> Review Uncategorized Transactions <FiArrowRight className="button-icon-right"/>
        </button>
      </div>

      <div className="category-management-area card-style">
        <div className="category-toolbar">
          <div className="search-categories-input-container">
            <FiSearch className="search-icon" />
            <input
              type="text"
              placeholder="Search categories..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-categories-input"
            />
          </div>
          {!showTopLevelInput && (
            <button className="add-category-button" onClick={handleAddTopLevelClick} disabled={isCreating}>
              <FiPlus /> Add Top-Level Category
            </button>
          )}
        </div>
        
        {showTopLevelInput && (
          <div className="add-category-input-area top-level-add-form">
            <input
              type="text"
              value={newTopLevelName}
              onChange={(e) => {
                setNewTopLevelName(e.target.value);
                if (createError) setCreateError(null);
              }}
              placeholder="New top-level category name..."
              disabled={isCreating}
              autoFocus
            />
            <button onClick={handleSaveTopLevel} disabled={!newTopLevelName.trim() || isCreating} title="Save">
              {isCreating ? <FiLoader className="spinner-inline"/> : <FiPlus />}
            </button>
            <button onClick={handleCancelTopLevel} disabled={isCreating} title="Cancel">Cancel</button>
            {createError && <p className="inline-error-text error-message">{createError}</p>}
          </div>
        )}
        
        <p className="category-instructions">
          View your category structure below. Add new top-level categories or sub-categories directly in the tree.
        </p>
        
        <div className={`category-tree-view ${isCreating ? 'disabled-tree' : ''}`}>
          {(systemRootCategories.length === 0 && userRootCategories.length === 0 && !showTopLevelInput && !searchTerm.trim()) && (
            <p>No categories found. Add a top-level category to get started.</p>
          )}
          {noResultsFromSearch && (
            <p>No categories match your search term "{searchTerm}".</p>
          )}
          {systemRootCategories.map(rootCat => (
            <CategoryTreeNode
              key={rootCat.id}
              category={rootCat}
              allCategories={availableCategories}
              visibleCategoryIds={visibleCategoryIds}
              level={0}
              onCreateCategory={handleCreateCategory}
              isCreating={isCreating}
            />
          ))}
          {userRootCategories.map(rootCat => (
            <CategoryTreeNode
              key={rootCat.id}
              category={rootCat}
              allCategories={availableCategories}
              visibleCategoryIds={visibleCategoryIds}
              level={0}
              onCreateCategory={handleCreateCategory}
              isCreating={isCreating}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default CategorisePage; 