import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
// Import Transition components
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import CategorizationCard from '../components/categorization/CategorizationCard';
import transactionService from '../services/transactions';
import categoryService from '../services/categories';
import './CategorizeTransactions.css'; // Ensure CSS is imported
import { FiLoader, FiInbox, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

const CategorizeTransactions = () => {
    const [groupedTransactions, setGroupedTransactions] = useState([]);
    const [availableCategories, setAvailableCategories] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoadingGroups, setIsLoadingGroups] = useState(true);
    const [isLoadingCategories, setIsLoadingCategories] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null);
    const [submitError, setSubmitError] = useState(null);
    const navigate = useNavigate();

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
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleCategorizeGroup = async (transactionIds, categoryId) => {
        if (!categoryId) {
            setSubmitError("Please select a category.");
            return;
        }
        setIsSubmitting(true);
        setSubmitError(null);
        try {
             const response = await transactionService.batchUpdateCategory(transactionIds, parseInt(categoryId, 10));
             console.log("Batch categorize response:", response);
             handleNextCard(); // Advance only on success
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
        if (currentIndex < groupedTransactions.length - 1) {
            setCurrentIndex(prevIndex => prevIndex + 1);
        } else {
            console.log("Categorization complete!");
            navigate('/dashboard');
        }
    };

    const currentGroup = groupedTransactions[currentIndex];
    const totalGroups = groupedTransactions.length;
    const isLoading = isLoadingGroups || isLoadingCategories;

    // Define animation timeout duration (should match CSS)
    const animationTimeout = 300; // milliseconds

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

    if (!isLoading && totalGroups === 0) {
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
                <h1>Categorize Transactions</h1>
                {totalGroups > 0 && (
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

            {/* --- Animation Wrapper --- */}
            <TransitionGroup className="categorization-card-container">
                {/* Render CSSTransition ONLY if currentGroup exists */}
                {currentGroup && (
                    <CSSTransition
                        key={currentGroup.transaction_ids[0]} // Unique key based on current group
                        timeout={animationTimeout}
                        classNames="card-transition" // Prefix for CSS classes
                        unmountOnExit // Remove card from DOM after exit animation
                    >
                         {/* The Card component itself */}
                        <CategorizationCard
                            group={currentGroup}
                            onCategorize={handleCategorizeGroup}
                            onSkip={handleSkipGroup}
                            availableCategories={availableCategories}
                            isLoading={isSubmitting}
                        />
                    </CSSTransition>
                )}
            </TransitionGroup>
            {/* --- End Animation Wrapper --- */}

        </div>
    );
};

export default CategorizeTransactions;