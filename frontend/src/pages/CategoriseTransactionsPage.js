import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import transactionService from '../services/transactions';
import categoryService from '../services/categories';
import vendorRuleService from '../services/vendorRules';
import CategorySelectorModal from '../components/categorization/CategorySelectorModal';
import TransactionDetailsModal from '../components/transactions/TransactionDetailsModal';
import VendorRulePromptModal from '../components/categorization/VendorRulePromptModal';
import VendorRenameModal from '../components/transactions/VendorRenameModal';
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
    const [isUpdatingVendor, setIsUpdatingVendor] = useState(false);
    const [isVendorRenameModalOpen, setIsVendorRenameModalOpen] = useState(false);
    const [vendorToRename, setVendorToRename] = useState(null);
    const [isAutoCategorizingSelected, setIsAutoCategorizingSelected] = useState(false);
    const [autoCategorizeError, setAutoCategorizeError] = useState(null);
    const [autoCategorizeResults, setAutoCategorizeResults] = useState(null);
    const [isVendorRulePromptOpen, setIsVendorRulePromptOpen] = useState(false);
    const [vendorRulePromptData, setVendorRulePromptData] = useState(null);
    const [isCreatingVendorRules, setIsCreatingVendorRules] = useState(false);
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
        const group = groupedTransactions[groupIndex];
        setVendorToRename({
            groupIndex,
            currentName: currentDescription,
            group: group
        });
        setIsVendorRenameModalOpen(true);
    };



    const handleVendorRenameModalClose = () => {
        setIsVendorRenameModalOpen(false);
        setVendorToRename(null);
    };

    const handleVendorRenameSuccess = (result) => {
        if (!vendorToRename) return;
        
        try {
            const { groupIndex } = vendorToRename;
            const newVendorName = result.mapped_vendor || result.new_vendor_name;
            
            if (!newVendorName) {
                console.error('No new vendor name in result:', result);
                return;
            }

            // Update the local state to reflect the vendor rename/merge
            setGroupedTransactions(prev => {
                return prev.map((g, index) => {
                    if (index === groupIndex) {
                        return {
                            ...g,
                            description: newVendorName,
                            previews: g.previews.map(preview => ({ ...preview, description: newVendorName }))
                        };
                    }
                    return g;
                });
            });

            setIsVendorRenameModalOpen(false);
            setVendorToRename(null);
            console.log('Vendor renamed/merged successfully:', result);
        } catch (error) {
            console.error('Error updating local state after vendor rename:', error);
            setSubmitError('Vendor was updated but display may not reflect changes. Please refresh the page.');
        }
    };

    const handleVendorRulePromptConfirm = async () => {
        setIsCreatingVendorRules(true);
        try {
            // Create vendor rules and then perform categorization
            await performCategorization(true);
            setIsVendorRulePromptOpen(false);
            setVendorRulePromptData(null);
        } catch (error) {
            console.error("Error in vendor rule creation and categorization:", error);
            setSubmitError(error.message || 'Failed to create vendor rules and categorize transactions.');
            setIsVendorRulePromptOpen(false);
            setVendorRulePromptData(null);
        } finally {
            setIsCreatingVendorRules(false);
        }
    };

    const handleVendorRulePromptClose = async () => {
        if (isCreatingVendorRules) return; // Prevent closing while in progress
        
        setIsVendorRulePromptOpen(false);
        // Proceed with categorization without creating rules
        if (vendorRulePromptData) {
            // Restore the selection from the prompt data
            setSelectedTransactionIds(vendorRulePromptData.selectedTransactionIds);
            setVendorRulePromptData(null);
            // Perform categorization without creating rules
            await performCategorization(false);
        }
    };

    const handleVendorRulePromptDismiss = () => {
        if (isCreatingVendorRules) return; // Prevent closing while in progress
        
        // Just close the modal without doing anything
        setIsVendorRulePromptOpen(false);
        setVendorRulePromptData(null);
    };

    const handleCategorizeSelected = async () => {
        if (!selectedCategory || selectedTransactionIds.size === 0) return;
        
        // Check if user is categorizing entire vendor groups and should be prompted for vendor rules
        const vendorGroupsToRule = [];
        
        groupedTransactions.forEach(group => {
            const selectedInGroup = group.transaction_ids.filter(id => selectedTransactionIds.has(id));
            // If user selected ALL transactions in this group, consider it for vendor rule creation
            if (selectedInGroup.length === group.transaction_ids.length && group.transaction_ids.length > 0) {
                vendorGroupsToRule.push(group.description);
            }
        });
        
        // If there are vendor groups that could benefit from rules, show the prompt
        if (vendorGroupsToRule.length > 0) {
            setVendorRulePromptData({
                vendors: vendorGroupsToRule,
                category: selectedCategory.name,
                categoryId: selectedCategory.id,
                selectedTransactionIds: new Set(selectedTransactionIds)
            });
            setIsVendorRulePromptOpen(true);
            return; // Don't proceed with categorization yet
        }
        
        // Otherwise, proceed with normal categorization
        await performCategorization();
    };

    const performCategorization = async (createRules = false) => {
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
            
            // Create vendor rules if requested
            if (createRules && vendorRulePromptData) {
                try {
                    await vendorRuleService.createVendorRulesForVendors(
                        vendorRulePromptData.vendors,
                        vendorRulePromptData.categoryId,
                        true // is_persistent
                    );
                } catch (ruleError) {
                    console.error("Error creating vendor rules:", ruleError);
                    // Continue with categorization even if rule creation fails
                    setSubmitError(ruleError.message || 'Vendor rules could not be created, but transactions will still be categorized.');
                }
            }
            
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

    const handleAutoCategorizeSelected = async () => {
        if (selectedTransactionIds.size === 0) return;
        
        setIsAutoCategorizingSelected(true);
        setAutoCategorizeError(null);
        setAutoCategorizeResults(null);
        
        try {
            const transactionIdsArray = Array.from(selectedTransactionIds);
            const result = await transactionService.autoCategorizeTransactions(transactionIdsArray);
            
            setAutoCategorizeResults(result);
            
            if (result.categorized_count > 0) {
                // Remove categorized transactions from the view
                const categorizedIds = new Set(
                    result.results
                        .filter(r => r.status === 'categorized')
                        .map(r => r.transaction_id)
                );
                
                setGroupedTransactions(prev => {
                    return prev.map(group => ({
                        ...group,
                        transaction_ids: group.transaction_ids.filter(id => !categorizedIds.has(id)),
                        previews: group.previews.filter(preview => !categorizedIds.has(preview.id)),
                        count: group.transaction_ids.filter(id => !categorizedIds.has(id)).length
                    })).filter(group => group.count > 0); // Remove empty groups
                });
                
                // Update selection to remove categorized transactions
                setSelectedTransactionIds(prev => {
                    const newSet = new Set(prev);
                    categorizedIds.forEach(id => newSet.delete(id));
                    return newSet;
                });
            }
            
        } catch (err) {
            console.error("Error auto-categorizing selected transactions:", err);
            setAutoCategorizeError(err.message || 'Failed to auto-categorize selected transactions.');
        } finally {
            setIsAutoCategorizingSelected(false);
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

             {autoCategorizeError && (
                <div className="categorization-error error-message">
                   <FiAlertCircle /> {autoCategorizeError}
                </div>
             )}

             {autoCategorizeResults && (
                <div className="auto-categorize-results success-message">
                   <FiCheck />
                   <div className="results-content">
                       <p>
                           <strong>Auto-categorization completed:</strong> {autoCategorizeResults.categorized_count} categorized, 
                           {' '}{autoCategorizeResults.skipped_count} skipped, {autoCategorizeResults.error_count} errors
                       </p>
                       {autoCategorizeResults.error_count > 0 && (
                           <details className="error-details">
                               <summary>View errors ({autoCategorizeResults.error_count})</summary>
                               <ul>
                                   {autoCategorizeResults.results
                                       .filter(r => r.status === 'error')
                                       .map(error => (
                                           <li key={error.transaction_id}>
                                               Transaction {error.transaction_id}: {error.reason}
                                           </li>
                                       ))
                                   }
                               </ul>
                           </details>
                       )}
                   </div>
                   <button 
                       className="dismiss-results-button" 
                       onClick={() => setAutoCategorizeResults(null)}
                       title="Dismiss results"
                   >
                       <FiX />
                   </button>
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
                        className="auto-categorize-button"
                        onClick={handleAutoCategorizeSelected}
                        disabled={isAutoCategorizingSelected || selectedTransactionIds.size === 0}
                        title="Use AI to automatically categorize selected transactions based on vendor rules"
                    >
                        {isAutoCategorizingSelected ? <FiLoader className="spinner-inline" /> : <FiTag />}
                        Auto-Categorize Selected
                    </button>
                    
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

            {/* Vendor Rule Prompt Modal */}
            {vendorRulePromptData && (
                <VendorRulePromptModal
                    isOpen={isVendorRulePromptOpen}
                    onClose={handleVendorRulePromptClose}
                    onDismiss={handleVendorRulePromptDismiss}
                    vendors={vendorRulePromptData.vendors}
                    category={vendorRulePromptData.category}
                    onConfirm={handleVendorRulePromptConfirm}
                />
            )}

            {/* Vendor Rename Modal */}
            {vendorToRename && (
                <VendorRenameModal
                    isOpen={isVendorRenameModalOpen}
                    onClose={handleVendorRenameModalClose}
                    vendor={vendorToRename.currentName}
                    onSuccess={handleVendorRenameSuccess}
                />
            )}
        </div>
    );
};

export default CategoriseTransactionsPage; 