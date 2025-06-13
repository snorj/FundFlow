import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';
import { 
    FiX, 
    FiArrowLeft, 
    FiArrowRight, 
    FiCheck, 
    FiLoader, 
    FiAlertCircle,
    FiCheckCircle,
    FiSearch,
    FiPlus,
    FiTrash2,
    FiEdit3
} from 'react-icons/fi';
import customViewService from '../../services/customViews';
import transactionService from '../../services/transactions';
import { formatCurrency } from '../../utils/formatting';
import './CustomViewCreator.css';

const STEPS = {
    METADATA: 1,
    TRANSACTION_SELECTION: 2,
    CATEGORY_STRUCTURE: 3,
    REVIEW: 4
};

const STEP_TITLES = {
    [STEPS.METADATA]: 'View Details',
    [STEPS.TRANSACTION_SELECTION]: 'Select Transactions',
    [STEPS.CATEGORY_STRUCTURE]: 'Create Categories',
    [STEPS.REVIEW]: 'Review & Create'
};

const CustomViewCreator = ({ 
    isOpen, 
    onClose, 
    onViewCreated 
}) => {
    // Wizard state
    const [currentStep, setCurrentStep] = useState(STEPS.METADATA);
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    // Form data state
    const [viewData, setViewData] = useState({
        name: '',
        description: '',
        search_criteria: {
            vendors: [],
            categories: [],
            dateRange: { start: '', end: '' },
            amountRange: { min: '', max: '' },
            keywords: '',
            direction: 'all',
            logic: 'AND'
        }
    });

    const [selectedTransactions, setSelectedTransactions] = useState([]);
    const [customCategories, setCustomCategories] = useState([]);
    const [newCategoryName, setNewCategoryName] = useState('');

    // Data loading state
    const [availableTransactions, setAvailableTransactions] = useState([]);
    const [loadingTransactions, setLoadingTransactions] = useState(false);
    const [transactionSearchTerm, setTransactionSearchTerm] = useState('');

    // Load available transactions when step changes to transaction selection
    useEffect(() => {
        if (currentStep === STEPS.TRANSACTION_SELECTION && availableTransactions.length === 0) {
            loadAvailableTransactions();
        }
    }, [currentStep]);

    const loadAvailableTransactions = async () => {
        setLoadingTransactions(true);
        try {
            const transactions = await transactionService.getTransactions({ page_size: 1000 });
            setAvailableTransactions(transactions || []);
        } catch (err) {
            console.error('Error loading transactions:', err);
            setError('Failed to load transactions. Please try again.');
        } finally {
            setLoadingTransactions(false);
        }
    };

    // Filter transactions based on search term
    const filteredTransactions = useMemo(() => {
        if (!transactionSearchTerm.trim()) return availableTransactions;
        const searchLower = transactionSearchTerm.toLowerCase();
        return availableTransactions.filter(transaction => 
            transaction.description?.toLowerCase().includes(searchLower) ||
            transaction.vendor_name?.toLowerCase().includes(searchLower) ||
            transaction.category_name?.toLowerCase().includes(searchLower)
        );
    }, [availableTransactions, transactionSearchTerm]);

    // Handle form field changes
    const handleViewDataChange = useCallback((field, value) => {
        setViewData(prev => ({
            ...prev,
            [field]: value
        }));
    }, []);

    // Handle transaction selection
    const handleTransactionToggle = useCallback((transaction) => {
        setSelectedTransactions(prev => {
            const isSelected = prev.some(t => t.id === transaction.id);
            if (isSelected) {
                return prev.filter(t => t.id !== transaction.id);
            } else {
                return [...prev, transaction];
            }
        });
    }, []);

    // Handle select all transactions
    const handleSelectAllTransactions = useCallback(() => {
        setSelectedTransactions(filteredTransactions);
    }, [filteredTransactions]);

    // Handle clear all transactions
    const handleClearAllTransactions = useCallback(() => {
        setSelectedTransactions([]);
    }, []);

    // Handle category management
    const handleAddCategory = useCallback(() => {
        if (!newCategoryName.trim()) return;
        
        const newCategory = {
            id: `temp_${Date.now()}`,
            name: newCategoryName.trim(),
            parent: null,
            order: customCategories.length
        };
        
        setCustomCategories(prev => [...prev, newCategory]);
        setNewCategoryName('');
    }, [newCategoryName, customCategories.length]);

    const handleRemoveCategory = useCallback((categoryId) => {
        setCustomCategories(prev => prev.filter(cat => cat.id !== categoryId));
    }, []);

    const handleEditCategory = useCallback((categoryId, newName) => {
        setCustomCategories(prev => 
            prev.map(cat => 
                cat.id === categoryId ? { ...cat, name: newName } : cat
            )
        );
    }, []);

    // Navigation handlers
    const handleNext = useCallback(() => {
        if (currentStep < STEPS.REVIEW) {
            setCurrentStep(prev => prev + 1);
            setError(null);
        }
    }, [currentStep]);

    const handlePrevious = useCallback(() => {
        if (currentStep > STEPS.METADATA) {
            setCurrentStep(prev => prev - 1);
            setError(null);
        }
    }, [currentStep]);

    // Validation for each step
    const isStepValid = useMemo(() => {
        switch (currentStep) {
            case STEPS.METADATA:
                return viewData.name.trim().length > 0;
            case STEPS.TRANSACTION_SELECTION:
                return selectedTransactions.length > 0;
            case STEPS.CATEGORY_STRUCTURE:
                return true; // Categories are optional
            case STEPS.REVIEW:
                return true;
            default:
                return false;
        }
    }, [currentStep, viewData.name, selectedTransactions.length]);

    // Handle form submission
    const handleCreateView = async () => {
        setIsCreating(true);
        setError(null);

        try {
            // Step 1: Create the custom view
            const createdView = await customViewService.createCustomView({
                name: viewData.name,
                description: viewData.description,
                search_criteria: viewData.search_criteria
            });

            // Step 2: Create custom categories if any
            const createdCategories = [];
            for (const category of customCategories) {
                try {
                    const createdCategory = await customViewService.createCustomCategory(
                        createdView.id,
                        {
                            name: category.name,
                            parent: category.parent,
                            order: category.order
                        }
                    );
                    createdCategories.push(createdCategory);
                } catch (categoryError) {
                    console.warn(`Failed to create category ${category.name}:`, categoryError);
                }
            }

            // Step 3: Assign selected transactions
            if (selectedTransactions.length > 0) {
                try {
                    await customViewService.assignTransactions(createdView.id, {
                        transaction_ids: selectedTransactions.map(t => t.id)
                    });
                } catch (assignmentError) {
                    console.warn('Failed to assign some transactions:', assignmentError);
                }
            }

            setSuccess(true);
            
            // Call the callback to notify parent component
            if (onViewCreated) {
                onViewCreated({
                    view: createdView,
                    categories: createdCategories,
                    transactionCount: selectedTransactions.length
                });
            }

            // Auto-close after success
            setTimeout(() => {
                handleClose();
            }, 2000);

        } catch (err) {
            console.error('Error creating custom view:', err);
            setError(err.message || 'Failed to create custom view');
        } finally {
            setIsCreating(false);
        }
    };

    // Handle modal close
    const handleClose = useCallback(() => {
        if (!isCreating) {
            setCurrentStep(STEPS.METADATA);
            setViewData({
                name: '',
                description: '',
                search_criteria: {
                    vendors: [],
                    categories: [],
                    dateRange: { start: '', end: '' },
                    amountRange: { min: '', max: '' },
                    keywords: '',
                    direction: 'all',
                    logic: 'AND'
                }
            });
            setSelectedTransactions([]);
            setCustomCategories([]);
            setNewCategoryName('');
            setTransactionSearchTerm('');
            setAvailableTransactions([]);
            setError(null);
            setSuccess(false);
            onClose();
        }
    }, [isCreating, onClose]);

    if (!isOpen) return null;

    return (
        <div className="custom-view-creator-overlay" onClick={handleClose}>
            <div className="custom-view-creator-modal" onClick={(e) => e.stopPropagation()}>
                <div className="custom-view-creator-header">
                    <div className="wizard-progress">
                        <div className="step-indicators">
                            {Object.values(STEPS).map(step => (
                                <div 
                                    key={step}
                                    className={`step-indicator ${currentStep >= step ? 'active' : ''} ${currentStep === step ? 'current' : ''}`}
                                >
                                    {currentStep > step ? <FiCheck /> : step}
                                </div>
                            ))}
                        </div>
                        <h3>{STEP_TITLES[currentStep]}</h3>
                    </div>
                    <button 
                        className="custom-view-creator-close"
                        onClick={handleClose}
                        disabled={isCreating}
                    >
                        <FiX />
                    </button>
                </div>

                <div className="custom-view-creator-content">
                    {success ? (
                        <div className="success-state">
                            <div className="success-icon">
                                <FiCheckCircle />
                            </div>
                            <h4>Custom View Created Successfully!</h4>
                            <p>Your custom view "{viewData.name}" has been created with {selectedTransactions.length} transactions and {customCategories.length} categories.</p>
                        </div>
                    ) : (
                        <>
                            {/* Step 1: Metadata */}
                            {currentStep === STEPS.METADATA && (
                                <div className="step-content">
                                    <div className="form-group">
                                        <label htmlFor="viewName">View Name *</label>
                                        <input
                                            id="viewName"
                                            type="text"
                                            value={viewData.name}
                                            onChange={(e) => handleViewDataChange('name', e.target.value)}
                                            placeholder="Enter a name for your custom view"
                                            maxLength={100}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label htmlFor="viewDescription">Description</label>
                                        <textarea
                                            id="viewDescription"
                                            value={viewData.description}
                                            onChange={(e) => handleViewDataChange('description', e.target.value)}
                                            placeholder="Optional description for your custom view"
                                            rows={3}
                                            maxLength={500}
                                        />
                                    </div>
                                    <div className="step-info">
                                        <p>Create a custom view to organize transactions for specific projects, events, or analysis purposes. This view will be independent from your main category tree.</p>
                                    </div>
                                </div>
                            )}

                            {/* Step 2: Transaction Selection */}
                            {currentStep === STEPS.TRANSACTION_SELECTION && (
                                <div className="step-content">
                                    <div className="transaction-selection-header">
                                        <div className="search-box">
                                            <FiSearch className="search-icon" />
                                            <input
                                                type="text"
                                                value={transactionSearchTerm}
                                                onChange={(e) => setTransactionSearchTerm(e.target.value)}
                                                placeholder="Search transactions..."
                                            />
                                        </div>
                                        <div className="selection-actions">
                                            <button 
                                                type="button" 
                                                onClick={handleSelectAllTransactions}
                                                className="btn-secondary"
                                            >
                                                Select All ({filteredTransactions.length})
                                            </button>
                                            <button 
                                                type="button" 
                                                onClick={handleClearAllTransactions}
                                                className="btn-secondary"
                                            >
                                                Clear All
                                            </button>
                                        </div>
                                    </div>

                                    <div className="selection-summary">
                                        <p>{selectedTransactions.length} transactions selected</p>
                                        {selectedTransactions.length > 0 && (
                                            <p className="total-amount">
                                                Total: {formatCurrency(
                                                    selectedTransactions.reduce((sum, t) => sum + (t.amount || 0), 0)
                                                )}
                                            </p>
                                        )}
                                    </div>

                                    {loadingTransactions ? (
                                        <div className="loading-state">
                                            <FiLoader className="spinner" />
                                            <p>Loading transactions...</p>
                                        </div>
                                    ) : (
                                        <div className="transaction-list">
                                            {filteredTransactions.map(transaction => {
                                                const isSelected = selectedTransactions.some(t => t.id === transaction.id);
                                                return (
                                                    <div 
                                                        key={transaction.id}
                                                        className={`transaction-item ${isSelected ? 'selected' : ''}`}
                                                        onClick={() => handleTransactionToggle(transaction)}
                                                    >
                                                        <div className="transaction-checkbox">
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => handleTransactionToggle(transaction)}
                                                            />
                                                        </div>
                                                        <div className="transaction-details">
                                                            <div className="transaction-description">
                                                                {transaction.description}
                                                            </div>
                                                            <div className="transaction-meta">
                                                                <span className="vendor">{transaction.vendor_name}</span>
                                                                <span className="category">{transaction.category_name}</span>
                                                                <span className="date">{transaction.transaction_date}</span>
                                                            </div>
                                                        </div>
                                                        <div className="transaction-amount">
                                                            {formatCurrency(transaction.amount)}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Step 3: Category Structure */}
                            {currentStep === STEPS.CATEGORY_STRUCTURE && (
                                <div className="step-content">
                                    <div className="category-creation-header">
                                        <h4>Create Custom Categories</h4>
                                        <p>Create categories specific to this view. These are independent from your main category tree.</p>
                                    </div>

                                    <div className="add-category-form">
                                        <div className="form-group">
                                            <input
                                                type="text"
                                                value={newCategoryName}
                                                onChange={(e) => setNewCategoryName(e.target.value)}
                                                placeholder="Enter category name"
                                                onKeyPress={(e) => e.key === 'Enter' && handleAddCategory()}
                                            />
                                            <button 
                                                type="button"
                                                onClick={handleAddCategory}
                                                disabled={!newCategoryName.trim()}
                                                className="btn-primary"
                                            >
                                                <FiPlus /> Add Category
                                            </button>
                                        </div>
                                    </div>

                                    <div className="custom-categories-list">
                                        {customCategories.length === 0 ? (
                                            <div className="empty-state">
                                                <p>No custom categories created yet. You can add categories above or skip this step.</p>
                                            </div>
                                        ) : (
                                            customCategories.map(category => (
                                                <CategoryItem
                                                    key={category.id}
                                                    category={category}
                                                    onEdit={handleEditCategory}
                                                    onRemove={handleRemoveCategory}
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Step 4: Review */}
                            {currentStep === STEPS.REVIEW && (
                                <div className="step-content">
                                    <div className="review-section">
                                        <h4>Review Your Custom View</h4>
                                        
                                        <div className="review-item">
                                            <h5>View Details</h5>
                                            <p><strong>Name:</strong> {viewData.name}</p>
                                            {viewData.description && (
                                                <p><strong>Description:</strong> {viewData.description}</p>
                                            )}
                                        </div>

                                        <div className="review-item">
                                            <h5>Transactions</h5>
                                            <p>{selectedTransactions.length} transactions selected</p>
                                            <p><strong>Total Amount:</strong> {formatCurrency(
                                                selectedTransactions.reduce((sum, t) => sum + (t.amount || 0), 0)
                                            )}</p>
                                        </div>

                                        <div className="review-item">
                                            <h5>Custom Categories</h5>
                                            {customCategories.length === 0 ? (
                                                <p>No custom categories</p>
                                            ) : (
                                                <ul>
                                                    {customCategories.map(category => (
                                                        <li key={category.id}>{category.name}</li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {error && (
                        <div className="error-message">
                            <FiAlertCircle />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                {!success && (
                    <div className="custom-view-creator-actions">
                        <button 
                            className="btn-secondary"
                            onClick={currentStep === STEPS.METADATA ? handleClose : handlePrevious}
                            disabled={isCreating}
                        >
                            {currentStep === STEPS.METADATA ? (
                                <>
                                    <FiX /> Cancel
                                </>
                            ) : (
                                <>
                                    <FiArrowLeft /> Previous
                                </>
                            )}
                        </button>
                        
                        {currentStep === STEPS.REVIEW ? (
                            <button 
                                className="btn-primary"
                                onClick={handleCreateView}
                                disabled={isCreating}
                            >
                                {isCreating ? (
                                    <>
                                        <FiLoader className="spinner" /> Creating...
                                    </>
                                ) : (
                                    <>
                                        <FiCheck /> Create View
                                    </>
                                )}
                            </button>
                        ) : (
                            <button 
                                className="btn-primary"
                                onClick={handleNext}
                                disabled={!isStepValid}
                            >
                                Next <FiArrowRight />
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// Category item component for editing
const CategoryItem = ({ category, onEdit, onRemove }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(category.name);

    const handleSave = () => {
        if (editName.trim() && editName !== category.name) {
            onEdit(category.id, editName.trim());
        }
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditName(category.name);
        setIsEditing(false);
    };

    return (
        <div className="category-item">
            {isEditing ? (
                <div className="category-edit">
                    <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && handleSave()}
                        onBlur={handleSave}
                        autoFocus
                    />
                    <button onClick={handleSave} className="btn-save">
                        <FiCheck />
                    </button>
                    <button onClick={handleCancel} className="btn-cancel">
                        <FiX />
                    </button>
                </div>
            ) : (
                <div className="category-display">
                    <span className="category-name">{category.name}</span>
                    <div className="category-actions">
                        <button onClick={() => setIsEditing(true)} className="btn-edit">
                            <FiEdit3 />
                        </button>
                        <button onClick={() => onRemove(category.id)} className="btn-remove">
                            <FiTrash2 />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

CustomViewCreator.propTypes = {
    isOpen: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
    onViewCreated: PropTypes.func
};

CategoryItem.propTypes = {
    category: PropTypes.object.isRequired,
    onEdit: PropTypes.func.isRequired,
    onRemove: PropTypes.func.isRequired
};

export default CustomViewCreator; 