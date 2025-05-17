import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import CategorizationCard from '../components/categorization/CategorizationCard';
import transactionService from '../services/transactions';
import categoryService from '../services/categories';
import './CategoriseTransactions.css'; // Assuming CSS file is named this or similar
import { FiLoader, FiInbox, FiAlertCircle } from 'react-icons/fi';

// Renamed component to CategoriseTransactionsPage
const CategoriseTransactionsPage = () => {
    const [groupedTransactions, setGroupedTransactions] = useState([]);
    const [availableCategories, setAvailableCategories] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoadingGroups, setIsLoadingGroups] = useState(true);
    const [isLoadingCategories, setIsLoadingCategories] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [submitError, setSubmitError] = useState(null);
    const navigate = useNavigate();
    const nodeRef = useRef(null);

    const handleCategoriesUpdate = useCallback(async () => {
        console.log("Refreshing categories list after update...");
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
            setCurrentIndex(0);
            if (!groupsData || groupsData.length === 0) {
                console.log("No uncategorized groups found.");
            }
        } catch (err) {
            console.error("Error fetching data for categorization:", err);
            setError(err.message || 'Failed to load data needed for categorization.');
        } finally {
            setIsLoadingGroups(false);
            setIsLoadingCategories(false);
        }
    }, [handleCategoriesUpdate]); // ensure handleCategoriesUpdate is stable or included if it changes

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCategorizeGroup = async (transactionIds, categoryId, originalDescription, editedDescription) => {
        if (!categoryId) return;
        console.log(`Parent: Attempting to categorize IDs: ${transactionIds} with Category ID: ${categoryId}, OrigDesc: ${originalDescription}, EditedDesc: ${editedDescription}`);
        setIsSubmitting(true);
        setSubmitError(null);
        try {
             const response = await transactionService.batchUpdateCategory(
                 transactionIds,
                 parseInt(categoryId, 10),
                 originalDescription,
                 editedDescription
                );
             console.log("Batch categorize response:", response);
             handleNextCard();
        } catch (err) {
             console.error("Error submitting categorization:", err);
             setSubmitError(err.message || err.error || 'Failed to save category. Please try again.');
        } finally {
             setIsSubmitting(false);
        }
    };
    
    const handleSkipGroup = (transactionIds) => {
        console.log(`Parent: Skipping IDs: ${transactionIds}`);
        setSubmitError(null);
        handleNextCard();
    };

    const handleNextCard = () => {
        console.log(`handleNextCard called. Current Index: ${currentIndex}, Total Groups: ${groupedTransactions.length}`);
        if (currentIndex < groupedTransactions.length - 1) {
            setCurrentIndex(prevIndex => {
                const nextIndex = prevIndex + 1;
                console.log(`Setting next index to: ${nextIndex}`);
                return nextIndex;
            });
        } else {
            console.log("Categorization complete! Navigating...");
            // Consider navigating to a different page or showing a success message here
            // For now, it navigates to the new dashboard page.
            navigate('/dashboard'); 
        }
    };

    const currentGroup = groupedTransactions[currentIndex];
    const totalGroups = groupedTransactions.length;
    const isLoading = isLoadingGroups || isLoadingCategories;
    const animationTimeout = 300;

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

    if (!isLoading && !error && totalGroups === 0) {
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
                {/* Title can be adjusted if this page is only for processing */}
                <h1>Review Uncategorized Transactions</h1> 
                {totalGroups > 0 && currentGroup && (
                    <span className="progress-indicator">
                        Group {currentIndex + 1} of {totalGroups}
                    </span>
                )}
            </div>

             {submitError && (
                <div className="categorization-error error-message">
                   <FiAlertCircle /> {submitError}
                </div>
             )}

            <TransitionGroup className="categorization-card-container">
                {currentGroup && (
                    <CSSTransition
                        key={currentGroup.description + '-' + currentGroup.transaction_ids[0]}
                        timeout={animationTimeout}
                        classNames="card-transition"
                        unmountOnExit
                        nodeRef={nodeRef}
                    >
                        <CategorizationCard
                            ref={nodeRef}
                            group={currentGroup}
                            onCategorize={handleCategorizeGroup}
                            onSkip={handleSkipGroup}
                            availableCategories={availableCategories}
                            isLoading={isSubmitting}
                            onCategoriesUpdate={handleCategoriesUpdate}
                        />
                    </CSSTransition>
                )}
            </TransitionGroup>
        </div>
    );
};

export default CategoriseTransactionsPage; // Renamed export 