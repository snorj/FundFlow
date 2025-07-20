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
import { FiLoader, FiInbox, FiAlertCircle, FiCheck, FiTag, FiSquare, FiCheckSquare, FiInfo, FiEdit3, FiX, FiEye, FiArrowRight } from 'react-icons/fi';
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
    const [successMessage, setSuccessMessage] = useState(null);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [isTransactionDetailsOpen, setIsTransactionDetailsOpen] = useState(false);
    const [isUpdatingVendor, setIsUpdatingVendor] = useState(false);
    const [isVendorRenameModalOpen, setIsVendorRenameModalOpen] = useState(false);
    const [vendorToRename, setVendorToRename] = useState(null);

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

    const handleVendorRenameSuccess = async (result) => {
        if (!vendorToRename) return;
        
        try {
            console.log('Vendor renamed/merged successfully:', result);
            
            // Close the modal and clear the state
            setIsVendorRenameModalOpen(false);
            setVendorToRename(null);
            
            // Show loading state while refreshing
            setIsLoadingGroups(true);
            
            // Add a small delay to ensure backend has processed the vendor mapping
            await new Promise(resolve => setTimeout(resolve, 500));
            
            console.log('About to refresh transaction groups after vendor merge...');
            
            // Check if this was a merge operation and if the target vendor has rules
            if (result && result.operation === 'merge' && result.targetVendor) {
                console.log(`Vendor merge detected: "${result.originalVendor}" merged into "${result.targetVendor}". Checking for existing rules...`);
                
                try {
                    // Check if the target vendor has existing rules
                    const vendorRules = await vendorRuleService.getVendorRulesByVendor(result.targetVendor);
                    
                    if (vendorRules && vendorRules.length > 0) {
                        console.log(`Found ${vendorRules.length} vendor rule(s) for "${result.targetVendor}". Applying to merged transactions...`);
                        
                        // Get the affected transaction IDs from the vendor group before refresh
                        const affectedTransactionIds = vendorToRename.group?.transaction_ids || [];
                        
                        console.log('Vendor group data:', vendorToRename.group);
                        console.log('Affected transaction IDs:', affectedTransactionIds);
                        
                        if (affectedTransactionIds.length > 0) {
                            // Apply the vendor rules to the affected transactions
                            for (const rule of vendorRules) {
                                try {
                                    console.log('Attempting to categorize transactions with params:', {
                                        transactionIds: affectedTransactionIds,
                                        categoryId: rule.category_id,
                                        originalDescription: result.targetVendor
                                    });
                                    
                                    await transactionService.batchCategorizeTransactions(
                                        affectedTransactionIds,
                                        rule.category_id,
                                        result.targetVendor // Use target vendor name for rule tracking
                                    );
                                    
                                    console.log(`Applied rule: categorized ${affectedTransactionIds.length} transactions from "${result.originalVendor}" to category ${rule.category_id}`);
                                    break; // Only apply the first rule (vendors should typically have one primary category)
                                } catch (ruleError) {
                                    console.error('Error applying vendor rule:', ruleError);
                                    console.error('Error response data:', ruleError.response?.data);
                                }
                            }
                        } else {
                            console.log('No transaction IDs found to apply rules to');
                        }
                    } else {
                        console.log(`No vendor rules found for "${result.targetVendor}"`);
                    }
                } catch (ruleError) {
                    console.error('Error checking/applying vendor rules:', ruleError);
                    // Continue with normal flow even if rule application fails
                }
            }
            
            // Re-fetch the transaction groups to show the updated/merged data
            // This ensures that merged vendors are properly grouped together and categorized transactions are removed
            await fetchData();
            
            console.log('Successfully refreshed transaction groups after vendor merge');
            
            // If transactions were auto-categorized, show success message
            if (result && result.operation === 'merge' && result.targetVendor) {
                try {
                    const vendorRules = await vendorRuleService.getVendorRulesByVendor(result.targetVendor);
                    if (vendorRules && vendorRules.length > 0) {
                        const rule = vendorRules[0]; // Get first rule for category info
                        const category = availableCategories.find(cat => cat.id === rule.category_id);
                        const categoryName = category ? category.name : `Category ${rule.category_id}`;
                        
                        setSubmitError(null); // Clear any existing errors
                        const message = `✅ Vendor merged successfully! ${vendorToRename.group?.count || 0} transactions automatically categorized to "${categoryName}".`;
                        setSuccessMessage(message);
                        
                        // Clear the success message after 5 seconds
                        setTimeout(() => setSuccessMessage(null), 5000);
                    }
                } catch (navError) {
                    console.log('Error showing success message:', navError);
                }
            }
            
        } catch (error) {
            console.error('Error refreshing transaction groups after vendor rename:', error);
            setSubmitError('Vendor was updated but failed to refresh the display. Please refresh the page to see changes.');
        } finally {
            setIsLoadingGroups(false);
        }
    };

    const handleVendorRulePromptConfirm = async (selectedVendors) => {
        setIsCreatingVendorRules(true);
        try {
            // Create vendor rules and then perform categorization
            await performCategorization(true, selectedVendors);
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

    const handleHideSelected = async () => {
        if (selectedTransactionIds.size === 0) return;

        setIsSubmitting(true);
        setSubmitError(null);

        try {
            await transactionService.batchHideTransactions(Array.from(selectedTransactionIds), 'hide');
            
            // Remove hidden transactions from the view
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
            
            setSuccessMessage(`Successfully hid ${selectedTransactionIds.size} transaction(s).`);
            setTimeout(() => setSuccessMessage(null), 5000);
            
        } catch (err) {
            console.error("Error hiding transactions:", err);
            setSubmitError(err.message || 'Failed to hide transactions. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const performCategorization = async (createRules = false, selectedVendors = null) => {
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
                    // Use selectedVendors if provided, otherwise fall back to all vendors
                    const vendorsToCreateRulesFor = selectedVendors || vendorRulePromptData.vendors;
                    
                    if (vendorsToCreateRulesFor.length > 0) {
                        await vendorRuleService.createVendorRulesForVendors(
                            vendorsToCreateRulesFor,
                            vendorRulePromptData.categoryId,
                            true // is_persistent
                        );
                    }
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
                 <div className="empty-state-actions">
                     <button onClick={() => navigate('/dashboard')} className="action-button teal-button">
                         Back to Dashboard
                     </button>
                     <button onClick={() => navigate('/categorise/hidden')} className="action-button secondary-button">
                         <FiEye className="button-icon"/> Hidden Transactions
                     </button>
                 </div>
            </div>
         );
    }

    return (
        <div className="categorization-page">
            <div className="categorization-header">
                <h1>Review Uncategorized Transactions</h1> 
                <p className="transaction-count">{totalTransactions} transactions in {groupedTransactions.length} groups</p>
                <button onClick={() => navigate('/categorise/hidden')} className="action-button teal-button navigate-button" disabled={isSubmitting}>
                    <FiEye className="button-icon"/> View Hidden Transactions <FiArrowRight className="button-icon-right"/>
                </button>
            </div>

             {submitError && (
                <div className="categorization-error error-message">
                   <FiAlertCircle /> {submitError}
                </div>
             )}

             {successMessage && (
                <div className="categorization-success success-message">
                   <FiCheck /> {successMessage}
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

                    <button
                        className="hide-button"
                        onClick={handleHideSelected}
                        disabled={isSubmitting || selectedTransactionIds.size === 0}
                    >
                        {isSubmitting ? <FiLoader className="spinner-inline" /> : <FiX />}
                        Hide Transactions
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