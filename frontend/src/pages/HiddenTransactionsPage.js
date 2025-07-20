import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import transactionService from '../services/transactions';
import TransactionDetailsModal from '../components/transactions/TransactionDetailsModal';
import VendorRenameModal from '../components/transactions/VendorRenameModal';
import './CategoriseTransactions.css';
import { FiLoader, FiInbox, FiAlertCircle, FiCheck, FiEye, FiSquare, FiCheckSquare, FiInfo, FiEdit3, FiX, FiArrowLeft } from 'react-icons/fi';
import { formatDate, formatCurrency } from '../utils/formatting';

const HiddenTransactionsPage = () => {
    const [groupedTransactions, setGroupedTransactions] = useState([]);
    const [selectedTransactionIds, setSelectedTransactionIds] = useState(new Set());
    const [isLoadingGroups, setIsLoadingGroups] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [submitError, setSubmitError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [isTransactionDetailsOpen, setIsTransactionDetailsOpen] = useState(false);
    const [isUpdatingVendor, setIsUpdatingVendor] = useState(false);
    const [isVendorRenameModalOpen, setIsVendorRenameModalOpen] = useState(false);
    const [vendorToRename, setVendorToRename] = useState(null);

    const navigate = useNavigate();

    const fetchData = useCallback(async () => {
        setIsLoadingGroups(true);
        setError(null);
        setSubmitError(null);
        try {
            const groupsData = await transactionService.getHiddenGroups();
            setGroupedTransactions(groupsData || []);
        } catch (err) {
            console.error("Error fetching hidden transactions:", err);
            setError(err.message || 'Failed to load hidden transactions.');
        } finally {
            setIsLoadingGroups(false);
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
            
            // Re-fetch the transaction groups to show the updated/merged data
            await fetchData();
            
            console.log('Successfully refreshed hidden transaction groups after vendor merge');
            
        } catch (error) {
            console.error('Error refreshing hidden transaction groups after vendor rename:', error);
            setSubmitError('Vendor was updated but failed to refresh the display. Please refresh the page to see changes.');
        } finally {
            setIsLoadingGroups(false);
        }
    };

    const handleUnhideSelected = async () => {
        if (selectedTransactionIds.size === 0) return;
        
        setIsSubmitting(true);
        setSubmitError(null);
        
        try {
            await transactionService.batchHideTransactions(Array.from(selectedTransactionIds), 'unhide');
            
            // Remove unhidden transactions from the view
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
            
            setSuccessMessage(`Successfully unhid ${selectedTransactionIds.size} transaction(s).`);
            setTimeout(() => setSuccessMessage(null), 5000);
            
        } catch (err) {
            console.error("Error unhiding transactions:", err);
            setSubmitError(err.message || 'Failed to unhide transactions. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const isLoading = isLoadingGroups;
    const totalTransactions = groupedTransactions.reduce((sum, group) => sum + group.count, 0);
    const allTransactionIds = groupedTransactions.flatMap(group => group.transaction_ids);
    const allSelected = allTransactionIds.length > 0 && allTransactionIds.every(id => selectedTransactionIds.has(id));

    if (isLoading) {
        return (
            <div className="categorization-page loading-state">
                <FiLoader className="spinner" />
                <p>Loading hidden transactions...</p>
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
                 <h2>No Hidden Transactions</h2>
                 <p>There are no hidden transactions to display.</p>
                 <div className="empty-state-actions">
                     <button onClick={() => navigate('/categorise/transactions')} className="action-button teal-button">
                         Back to Review Page
                     </button>
                 </div>
            </div>
         );
    }

    return (
        <div className="categorization-page">
            <div className="categorization-header">
                <div className="header-with-back">
                    <button 
                        onClick={() => navigate('/categorise/transactions')} 
                        className="back-button"
                        disabled={isSubmitting}
                    >
                        <FiArrowLeft className="button-icon"/> Back to Review
                    </button>
                    <div className="header-content">
                        <h1>Hidden Transactions</h1> 
                        <p className="transaction-count">{totalTransactions} transactions in {groupedTransactions.length} groups</p>
                    </div>
                </div>
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
                        className="unhide-button"
                        onClick={handleUnhideSelected}
                        disabled={isSubmitting || selectedTransactionIds.size === 0}
                    >
                        {isSubmitting ? <FiLoader className="spinner-inline" /> : <FiEye />}
                        Unhide Selected
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

            {/* Transaction Details Modal */}
            <TransactionDetailsModal
                isOpen={isTransactionDetailsOpen}
                onClose={() => setIsTransactionDetailsOpen(false)}
                transaction={selectedTransaction}
            />

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

export default HiddenTransactionsPage; 