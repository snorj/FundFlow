import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import transactionService from '../services/transactions';
import categoryService from '../services/categories';
import CategorySelectorModal from '../components/categorization/CategorySelectorModal';
import TransactionDetailsModal from '../components/transactions/TransactionDetailsModal';
import VendorRuleModal from '../components/modals/VendorRuleModal';
import './CategoriseTransactions.css';
import { FiLoader, FiInbox, FiAlertCircle, FiCheck, FiTag, FiSquare, FiCheckSquare, FiInfo, FiEdit3, FiX } from 'react-icons/fi';
import { formatDate, formatCurrency } from '../utils/formatting';

const CategoriseTransactionsPage = () => {
    const [groupedTransactions, setGroupedTransactions] = useState([]);
    const [availableCategories, setAvailableCategories] = useState([]);
    const [selectedTransactionIds, setSelectedTransactionIds] = useState(new Set());
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [isLoadingGroups, setIsLoadingGroups] = useState(true);
    const [isLoadingCategories, setIsLoadingCategories] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [submitError, setSubmitError] = useState(null);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [isTransactionDetailsOpen, setIsTransactionDetailsOpen] = useState(false);
    const [editingVendor, setEditingVendor] = useState(null);
    const [isUpdatingVendor, setIsUpdatingVendor] = useState(false);
    const [vendorRuleModal, setVendorRuleModal] = useState({
        isOpen: false,
        vendorName: '',
        categoryName: '',
        vendorId: null,
        categoryId: null
    });
    const navigate = useNavigate();

    const handleCategoriesUpdate = useCallback(async () => {
        try {
            const categoriesData = await categoryService.getCategories();
            setAvailableCategories(categoriesData || []);
        } catch (err) {
            console.error("Error refreshing categories:", err);
            setSubmitError("Could not refresh category list after update.");
        }
    }, []);

    const fetchData = useCallback(async () => {
        setIsLoadingGroups(true);
        setIsLoadingCategories(true);
        setError(null);
        setSubmitError(null);
        try {
            const [groupsData, categoriesData] = await Promise.all([
                transactionService.getUncategorizedGroups(),
                categoryService.getCategories()
            ]);
            setGroupedTransactions(groupsData || []);
            setAvailableCategories(categoriesData || []);
        } catch (err) {
            console.error("Error fetching data for categorization:", err);
            setError(err.message || 'Failed to load data needed for categorization.');
        } finally {
            setIsLoadingGroups(false);
            setIsLoadingCategories(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Selection handlers
    const handleTransactionToggle = (transactionId) => {
        setSelectedTransactionIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(transactionId)) {
                newSet.delete(transactionId);
            } else {
                newSet.add(transactionId);
            }
            return newSet;
        });
    };

    const handleGroupToggle = (group) => {
        const groupTransactionIds = group.transaction_ids;
        const allSelected = groupTransactionIds.every(id => selectedTransactionIds.has(id));
        
        setSelectedTransactionIds(prev => {
            const newSet = new Set(prev);
            if (allSelected) {
                // Deselect all in group
                groupTransactionIds.forEach(id => newSet.delete(id));
            } else {
                // Select all in group
                groupTransactionIds.forEach(id => newSet.add(id));
            }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        const allTransactionIds = groupedTransactions.flatMap(group => group.transaction_ids);
        const allSelected = allTransactionIds.every(id => selectedTransactionIds.has(id));
        
        if (allSelected) {
            setSelectedTransactionIds(new Set());
        } else {
            setSelectedTransactionIds(new Set(allTransactionIds));
        }
    };

    const handleCategorySelect = (category) => {
        setSelectedCategory(category);
        setIsCategoryModalOpen(false);
    };

    const handleTransactionDetails = (transaction) => {
        setSelectedTransaction(transaction);
        setIsTransactionDetailsOpen(true);
    };

    const handleEditVendor = (groupIndex, currentDescription) => {
        setEditingVendor({ groupIndex, newName: currentDescription });
    };

    const handleSaveVendor = async (groupIndex) => {
        if (!editingVendor || editingVendor.groupIndex !== groupIndex) return;
        
        setIsUpdatingVendor(true);
        setSubmitError(null);
        
        try {
            const group = groupedTransactions[groupIndex];
            const newDescription = editingVendor.newName.trim();
            
            if (!newDescription || newDescription === group.description) {
                setEditingVendor(null);
                return;
            }

            // Update all transactions in this group
            const promises = group.transaction_ids.map(transactionId => 
                transactionService.updateTransactionDescription(transactionId, newDescription)
            );
            
            await Promise.all(promises);
            
            // Update the local state
            setGroupedTransactions(prev => {
                return prev.map((g, index) => {
                    if (index === groupIndex) {
                        return {
                            ...g,
                            description: newDescription,
                            previews: g.previews.map(preview => ({ ...preview, description: newDescription }))
                        };
                    }
                    return g;
                });
            });

            setEditingVendor(null);
        } catch (error) {
            setSubmitError(error.message || 'Failed to update vendor name. Please try again.');
        } finally {
            setIsUpdatingVendor(false);
        }
    };

    const handleCancelVendorEdit = () => {
        setEditingVendor(null);
    };

    const handleVendorRuleModalClose = () => {
        setVendorRuleModal({
            isOpen: false,
            vendorName: '',
            categoryName: '',
            vendorId: null,
            categoryId: null
        });
    };

    const handleVendorRuleCreated = (response) => {
        console.log('Vendor rule created:', response);
        // Could show a success message or update some state here
    };

    const handleCategorizeSelected = async () => {
        if (!selectedCategory || selectedTransactionIds.size === 0) return;
        
        setIsSubmitting(true);
        setSubmitError(null);
        
        try {
            // Group selected transactions by their original description
            const transactionsByDescription = new Map();
            
            groupedTransactions.forEach(group => {
                const selectedInGroup = group.transaction_ids.filter(id => selectedTransactionIds.has(id));
                if (selectedInGroup.length > 0) {
                    transactionsByDescription.set(group.description, selectedInGroup);
                }
            });
            
            // Make separate API calls for each description group
            const promises = Array.from(transactionsByDescription.entries()).map(([description, transactionIds]) => {
                return transactionService.batchCategorizeTransactions(
                 transactionIds,
                    selectedCategory.id,
                    description // Use the actual description from the group
                );
            });
            
            await Promise.all(promises);
            
            // Remove categorized transactions from the view
            setGroupedTransactions(prev => {
                return prev.map(group => ({
                    ...group,
                    transaction_ids: group.transaction_ids.filter(id => !selectedTransactionIds.has(id)),
                    previews: group.previews.filter(preview => !selectedTransactionIds.has(preview.id)),
                    count: group.transaction_ids.filter(id => !selectedTransactionIds.has(id)).length
                })).filter(group => group.count > 0); // Remove empty groups
            });
            
            // Show vendor rule modal if we have a single vendor description
            if (transactionsByDescription.size === 1) {
                const [vendorDescription] = transactionsByDescription.keys();
                setVendorRuleModal({
                    isOpen: true,
                    vendorName: vendorDescription,
                    categoryName: selectedCategory.name,
                    vendorId: null, // We'll handle vendor creation in the modal
                    categoryId: selectedCategory.id
                });
            }
            
            // Clear selections
            setSelectedTransactionIds(new Set());
            setSelectedCategory(null);
            
        } catch (err) {
            console.error("Error categorizing transactions:", err);
            setSubmitError(err.message || 'Failed to categorize transactions. Please try again.');
        } finally {
             setIsSubmitting(false);
        }
    };
    
    const isLoading = isLoadingGroups || isLoadingCategories;
    const totalTransactions = groupedTransactions.reduce((sum, group) => sum + group.count, 0);
    const allTransactionIds = groupedTransactions.flatMap(group => group.transaction_ids);
    const allSelected = allTransactionIds.length > 0 && allTransactionIds.every(id => selectedTransactionIds.has(id));

    if (isLoading) {
        return (
            <div className="categorization-page loading-state">
                <FiLoader className="spinner" />
                <p>Loading transactions to categorize...</p>
            </div>
        );
    }

    if (error && !isLoading) {
         return (
            <div className="categorization-page error-state">
                <FiAlertCircle />
                <p>Error loading data: {error}</p>
                <button onClick={fetchData} className="retry-button">Retry</button>
            </div>
        );
    }

    if (!isLoading && !error && totalTransactions === 0) {
         return (
            <div className="categorization-page empty-state">
                 <FiInbox />
                 <h2>All Caught Up!</h2>
                 <p>There are no transactions waiting for categorization.</p>
                 <button onClick={() => navigate('/dashboard')} className="action-button teal-button">
                     Back to Dashboard
                 </button>
            </div>
         );
    }

    return (
        <div className="categorization-page">
            <div className="categorization-header">
                <h1>Review Uncategorized Transactions</h1> 
                <p className="transaction-count">{totalTransactions} transactions in {groupedTransactions.length} groups</p>
            </div>

             {submitError && (
                <div className="categorization-error error-message">
                   <FiAlertCircle /> {submitError}
                </div>
             )}

            {/* Selection Controls */}
            <div className="selection-controls">
                <div className="bulk-controls">
                    <button 
                        className="select-all-button"
                        onClick={handleSelectAll}
                        disabled={isSubmitting}
                    >
                        {allSelected ? <FiCheckSquare /> : <FiSquare />}
                        {allSelected ? 'Deselect All' : 'Select All'}
                    </button>
                    
                    <span className="selection-count">
                        {selectedTransactionIds.size} selected
                    </span>
                </div>

                <div className="categorization-controls">
                    <button
                        className="category-select-button"
                        onClick={() => setIsCategoryModalOpen(true)}
                        disabled={isSubmitting || selectedTransactionIds.size === 0}
                    >
                        <FiTag />
                        {selectedCategory ? selectedCategory.name : 'Select Category'}
                    </button>
                    
                    <button
                        className="categorize-button"
                        onClick={handleCategorizeSelected}
                        disabled={isSubmitting || selectedTransactionIds.size === 0 || !selectedCategory}
                    >
                        {isSubmitting ? <FiLoader className="spinner-inline" /> : <FiCheck />}
                        Categorize Selected
                    </button>
                </div>
            </div>

            {/* Transaction Groups */}
            <div className="transaction-groups">
                {groupedTransactions.map((group, groupIndex) => {
                    const groupTransactionIds = group.transaction_ids;
                    const allGroupSelected = groupTransactionIds.every(id => selectedTransactionIds.has(id));
                    const someGroupSelected = groupTransactionIds.some(id => selectedTransactionIds.has(id));
                    
                    return (
                        <div key={`group-${groupIndex}`} className="transaction-group">
                            <div className="group-header">
                                <button
                                    className="group-select-button"
                                    onClick={() => handleGroupToggle(group)}
                                    disabled={isSubmitting}
                                >
                                    {allGroupSelected ? <FiCheckSquare /> : someGroupSelected ? <FiCheckSquare className="partial" /> : <FiSquare />}
                                </button>
                                
                                <div className="group-info">
                                    {editingVendor?.groupIndex === groupIndex ? (
                                        <div className="vendor-edit-container">
                                            <input
                                                type="text"
                                                value={editingVendor.newName}
                                                onChange={(e) => setEditingVendor(prev => ({ ...prev, newName: e.target.value }))}
                                                className="vendor-edit-input"
                                                placeholder="Enter vendor name"
                                                autoFocus
                                                disabled={isUpdatingVendor}
                                            />
                                            <div className="vendor-edit-actions">
                                                <button 
                                                    className="vendor-save-button"
                                                    onClick={() => handleSaveVendor(groupIndex)}
                                                    disabled={isUpdatingVendor || !editingVendor.newName.trim()}
                                                >
                                                    <FiCheck />
                                                </button>
                                                <button 
                                                    className="vendor-cancel-button"
                                                    onClick={handleCancelVendorEdit}
                                                    disabled={isUpdatingVendor}
                                                >
                                                    <FiX />
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="vendor-display">
                                            <h3 className="group-description">{group.description}</h3>
                                            <button
                                                className="vendor-edit-button"
                                                onClick={() => handleEditVendor(groupIndex, group.description)}
                                                title="Edit vendor name"
                                                disabled={isSubmitting || isUpdatingVendor}
                                            >
                                                <FiEdit3 />
                                            </button>
                                        </div>
                                    )}
                                    <span className="group-meta">
                                        {group.count} transaction(s)
                                        {group.earliest_date && ` • ${formatDate(group.earliest_date)}`}
                                    </span>
                                </div>
                            </div>

                            <div className="group-transactions">
                                {group.previews.map(transaction => (
                                    <div key={transaction.id} className="transaction-item">
                                        <button
                                            className="transaction-select-button"
                                            onClick={() => handleTransactionToggle(transaction.id)}
                                            disabled={isSubmitting}
                                        >
                                            {selectedTransactionIds.has(transaction.id) ? <FiCheckSquare /> : <FiSquare />}
                                        </button>
                                        
                                        <div className="transaction-details">
                                            <span className="transaction-date">{formatDate(transaction.date)}</span>
                                            <span className={`transaction-amount amount-${transaction.direction?.toLowerCase()}`}>
                                                {formatCurrency(transaction.amount, transaction.direction, transaction.currency)}
                                            </span>
                                        </div>

                                        <button
                                            className="transaction-info-button"
                                            onClick={() => handleTransactionDetails(transaction)}
                                            title="View transaction details"
                                            disabled={isSubmitting}
                                        >
                                            <FiInfo />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Category Selector Modal */}
            <CategorySelectorModal
                isOpen={isCategoryModalOpen}
                onClose={() => setIsCategoryModalOpen(false)}
                onSelectCategory={handleCategorySelect}
                categories={availableCategories}
                            onCategoriesUpdate={handleCategoriesUpdate}
                selectionMode="confirm"
                modalTitle="Select Category for Transactions"
            />

            {/* Transaction Details Modal */}
            <TransactionDetailsModal
                isOpen={isTransactionDetailsOpen}
                onClose={() => setIsTransactionDetailsOpen(false)}
                transaction={selectedTransaction}
            />

            {/* Vendor Rule Modal */}
            <VendorRuleModal
                isOpen={vendorRuleModal.isOpen}
                onClose={handleVendorRuleModalClose}
                vendorName={vendorRuleModal.vendorName}
                categoryName={vendorRuleModal.categoryName}
                vendorId={vendorRuleModal.vendorId}
                categoryId={vendorRuleModal.categoryId}
                onRuleCreated={handleVendorRuleCreated}
            />
        </div>
    );
};

export default CategoriseTransactionsPage; 