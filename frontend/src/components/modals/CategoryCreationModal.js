import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import { FiX, FiFolder, FiCheck, FiAlertCircle } from 'react-icons/fi';
import categoryService from '../../services/categories';
import './CategoryCreationModal.css';

const CategoryCreationModal = ({
  isOpen,
  onClose,
  onCategoryCreated,
  preSelectedParent = null,
  availableCategories = [],
  className = ''
}) => {
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    parent: preSelectedParent?.id || ''
  });
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  
  const modalRef = useRef(null);
  const nameInputRef = useRef(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setFormData({
        name: '',
        description: '',
        parent: preSelectedParent?.id || ''
      });
      setErrors({});
      setIsSubmitting(false);
      setSubmitAttempted(false);
      
      // Focus the name input after a short delay
      setTimeout(() => {
        if (nameInputRef.current) {
          nameInputRef.current.focus();
        }
      }, 100);
    }
  }, [isOpen, preSelectedParent]);

  // Handle form field changes
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear specific field error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  // Form validation
  const validateForm = () => {
    const newErrors = {};
    
    // Name validation
    if (!formData.name.trim()) {
      newErrors.name = 'Category name is required';
    } else if (formData.name.trim().length < 2) {
      newErrors.name = 'Category name must be at least 2 characters long';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = 'Category name must be less than 100 characters';
    }
    
    // Check for forbidden characters in category name
    const forbiddenChars = /[<>:"/\\|?*]/;
    if (formData.name && forbiddenChars.test(formData.name)) {
      newErrors.name = 'Category names cannot contain special characters: < > : " / \\ | ? *';
    }
    
    // Check for duplicate names (client-side validation)
    if (formData.name.trim()) {
      const parentId = formData.parent || null;
      const siblings = availableCategories.filter(cat => 
        cat.parent === parentId && 
        cat.name.toLowerCase() === formData.name.trim().toLowerCase()
      );
      
      if (siblings.length > 0) {
        newErrors.name = 'A category with this name already exists at this level';
      }
    }
    
    // Description validation (optional but limited length)
    if (formData.description && formData.description.length > 500) {
      newErrors.description = 'Description must be less than 500 characters';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitAttempted(true);
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      const categoryData = {
        name: formData.name.trim(),
        parent: formData.parent || null
      };
      
      // Only include description if it's not empty
      if (formData.description.trim()) {
        categoryData.description = formData.description.trim();
      }
      
      const newCategory = await categoryService.createCategory(categoryData);
      
      // Notify parent component of successful creation
      if (onCategoryCreated) {
        onCategoryCreated(newCategory);
      }
      
      // Close modal
      onClose();
      
    } catch (error) {
      console.error('Failed to create category:', error);
      
      // Handle API validation errors
      if (error.message.includes('already exists')) {
        setErrors({ name: 'A category with this name already exists at this level' });
      } else if (error.message.includes('parent')) {
        setErrors({ parent: 'Invalid parent category selected' });
      } else {
        setErrors({ 
          general: error.message || 'Failed to create category. Please try again.' 
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle escape key and overlay clicks
  useEffect(() => {
    if (!isOpen) return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  // Handle overlay click
  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  // Get parent category display name
  const getParentDisplayName = () => {
    if (!formData.parent) return 'Root Level';
    const parent = availableCategories.find(cat => cat.id.toString() === formData.parent.toString());
    return parent ? parent.name : 'Unknown Category';
  };

  // Filter available parent categories (exclude current category and its descendants)
  const getAvailableParents = () => {
    return availableCategories.filter(cat => cat.type === 'category');
  };

  if (!isOpen) return null;

  return (
    <div 
      className={`category-creation-modal-overlay ${className}`}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="category-modal-title"
    >
      <div 
        className="category-creation-modal"
        ref={modalRef}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="category-creation-modal-header">
          <h3 id="category-modal-title">
            <FiFolder />
            Create New Category
          </h3>
          <button
            className="category-creation-modal-close"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
          >
            <FiX />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="category-creation-modal-content">
          {/* General error message */}
          {errors.general && (
            <div className="error-message">
              <FiAlertCircle />
              <span>{errors.general}</span>
            </div>
          )}

          {/* Parent category info */}
          {preSelectedParent && (
            <div className="parent-category-info">
              <p>Creating category under: <strong>{preSelectedParent.name}</strong></p>
            </div>
          )}

          {/* Category name field */}
          <div className="form-field">
            <label htmlFor="category-name" className="form-label">
              Category Name *
            </label>
            <input
              ref={nameInputRef}
              type="text"
              id="category-name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              className={`form-input ${errors.name ? 'error' : ''}`}
              placeholder="Enter category name..."
              maxLength={100}
              disabled={isSubmitting}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && (
              <div id="name-error" className="field-error">
                <FiAlertCircle />
                <span>{errors.name}</span>
              </div>
            )}
          </div>

          {/* Parent category selection */}
          <div className="form-field">
            <label htmlFor="category-parent" className="form-label">
              Parent Category
            </label>
            <select
              id="category-parent"
              name="parent"
              value={formData.parent}
              onChange={handleInputChange}
              className={`form-select ${errors.parent ? 'error' : ''}`}
              disabled={isSubmitting || preSelectedParent}
              aria-describedby={errors.parent ? 'parent-error' : undefined}
            >
              <option value="">Root Level</option>
              {getAvailableParents().map(category => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            {errors.parent && (
              <div id="parent-error" className="field-error">
                <FiAlertCircle />
                <span>{errors.parent}</span>
              </div>
            )}
            {preSelectedParent && (
              <p className="field-help">Parent is pre-selected and cannot be changed</p>
            )}
          </div>

          {/* Description field */}
          <div className="form-field">
            <label htmlFor="category-description" className="form-label">
              Description (optional)
            </label>
            <textarea
              id="category-description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              className={`form-textarea ${errors.description ? 'error' : ''}`}
              placeholder="Enter category description..."
              maxLength={500}
              rows={3}
              disabled={isSubmitting}
              aria-describedby={errors.description ? 'description-error' : undefined}
            />
            {errors.description && (
              <div id="description-error" className="field-error">
                <FiAlertCircle />
                <span>{errors.description}</span>
              </div>
            )}
            <div className="field-help">
              {formData.description.length}/500 characters
            </div>
          </div>

          {/* Action buttons */}
          <div className="category-creation-modal-actions">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || (submitAttempted && Object.keys(errors).length > 0)}
            >
              {isSubmitting ? (
                <>
                  <div className="spinner" />
                  Creating...
                </>
              ) : (
                <>
                  <FiCheck />
                  Create Category
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

CategoryCreationModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCategoryCreated: PropTypes.func,
  preSelectedParent: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    name: PropTypes.string
  }),
  availableCategories: PropTypes.array,
  className: PropTypes.string
};

CategoryCreationModal.defaultProps = {
  onCategoryCreated: null,
  preSelectedParent: null,
  availableCategories: [],
  className: ''
};

export default CategoryCreationModal; 