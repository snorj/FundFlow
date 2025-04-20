import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
// Import Transition components
import { TransitionGroup, CSSTransition } from 'react-transition-group';
// Correctly import the Card component from its location
import CategorizationCard from '../components/categorization/CategorizationCard';
// Import services
import transactionService from '../services/transactions';
import categoryService from '../services/categories';
// Import this page's CSS
import './CategorizeTransactions.css';
// Import necessary icons
import { FiLoader, FiInbox, FiAlertCircle } from 'react-icons/fi';


const CategorizeTransactions = () => {
    const [groupedTransactions, setGroupedTransactions] = useState([]);
    const [availableCategories, setAvailableCategories] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoadingGroups, setIsLoadingGroups] = useState(true);
    const [isLoadingCategories, setIsLoadingCategories] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false); // Loading state for applying category
    const [error, setError] = useState(null); // For general loading errors
    const [submitError, setSubmitError] = useState(null); // For submission errors
    const navigate = useNavigate();
    const nodeRef = useRef(null); // Ref for CSSTransition

    // Callback passed down to modal (via card) to refresh category list
    const handleCategoriesUpdate = useCallback(async () => {
        console.log("Refreshing categories list after update...");
        // Optionally set a category-specific loading state here if needed
        try {
            const categoriesData = await categoryService.getCategories();
            setAvailableCategories(categoriesData || []);
        } catch (err) {
            console.error("Error refreshing categories:", err);
            // Set a general submit error or a specific category error state
            setSubmitError("Could not refresh category list after update.");
        }
    }, []); // Dependency array is empty as it relies on categoryService

    // Fetch initial data (groups and categories)
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
    // Include handleCategoriesUpdate here ONLY if fetchData *needs* the latest categories
    // which it doesn't currently, as it fetches them fresh.
    // }, [handleCategoriesUpdate]);
    }, []); // Keep dependency array empty for now

    // Fetch data on component mount
    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Handler for when the card signals to categorize a group
    const handleCategorizeGroup = async (transactionIds, categoryId) => {
        if (!categoryId) {
            setSubmitError("Please select a category.");
            return;
        }
        console.log(`Parent: Attempting to categorize IDs: ${transactionIds} with Category ID: ${categoryId}`);
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

    // Handler for when the card signals to skip a group
    const handleSkipGroup = (transactionIds) => {
        console.log(`Parent: Skipping IDs: ${transactionIds}`);
        setSubmitError(null);
        handleNextCard();
    };

    // Logic to advance to the next card or navigate away
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
            navigate('/dashboard'); // Navigate back to dashboard after finishing
        }
    };

    // --- Render Logic ---
    const currentGroup = groupedTransactions[currentIndex];
    const totalGroups = groupedTransactions.length;
    const isLoading = isLoadingGroups || isLoadingCategories;

    const animationTimeout = 300; // Matches CSS transition duration

    // Loading State
    if (isLoading) {
        return (
            <div className="categorization-page loading-state">
                <FiLoader className="spinner" />
                <p>Loading transactions to categorize...</p>
            </div>
        );
    }

    // General Error State (for initial data load)
    if (error && !isLoading) {
         return (
            <div className="categorization-page error-state">
                <FiAlertCircle />
                <p>Error loading data: {error}</p>
                <button onClick={fetchData} className="retry-button">Retry</button>
            </div>
        );
    }

    // All Done/Empty State (after loading, no errors)
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

    // Main Render: Show Header, Errors, and Animated Card
    return (
        <div className="categorization-page">
            <div className="categorization-header">
                <h1>Categorize Transactions</h1>
                {/* Show progress only if there are groups to process */}
                {totalGroups > 0 && currentGroup && (
                    <span className="progress-indicator">
                        Group {currentIndex + 1} of {totalGroups}
                    </span>
                )}
            </div>

             {/* Display submission errors (errors during categorization action) */}
             {submitError && (
                <div className="categorization-error error-message">
                   <FiAlertCircle /> {submitError}
                </div>
             )}

            {/* Animation Wrapper */}
            <TransitionGroup className="categorization-card-container">
                {/* Render CSSTransition ONLY if currentGroup exists */}
                {currentGroup && (
                    <CSSTransition
                        // Using a key that changes ensures animation triggers
                        key={currentGroup.description + '-' + currentGroup.transaction_ids[0]}
                        timeout={animationTimeout}
                        classNames="card-transition"
                        unmountOnExit
                        nodeRef={nodeRef} // Pass the ref for CSSTransition
                    >
                         {/* Pass ref and the category update handler down */}
                        <CategorizationCard
                            ref={nodeRef} // Assign the ref to the card
                            group={currentGroup}
                            onCategorize={handleCategorizeGroup}
                            onSkip={handleSkipGroup}
                            availableCategories={availableCategories}
                            isLoading={isSubmitting} // Pass submitting state for apply button
                            onCategoriesUpdate={handleCategoriesUpdate} // Pass the refresh function
                        />
                    </CSSTransition>
                )}
            </TransitionGroup>
        </div>
    );
};

export default CategorizeTransactions;