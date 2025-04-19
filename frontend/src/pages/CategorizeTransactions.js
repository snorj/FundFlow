import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import CategorizationCard from '../components/categorization/CategorizationCard';
import transactionService from '../services/transactions'; // Use real service
import categoryService from '../services/categories'; // Use real service
import './CategorizeTransactions.css';
import { FiLoader, FiInbox, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

// Remove Mock Category Service
// --- End Remove Mock ---


const CategorizeTransactions = () => {
    const [groupedTransactions, setGroupedTransactions] = useState([]);
    const [availableCategories, setAvailableCategories] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isLoadingGroups, setIsLoadingGroups] = useState(true);
    const [isLoadingCategories, setIsLoadingCategories] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState(null); // For general loading errors
    const [submitError, setSubmitError] = useState(null); // For submission errors
    const navigate = useNavigate();

    // Fetch initial data
    const fetchData = useCallback(async () => {
        setIsLoadingGroups(true);
        setIsLoadingCategories(true);
        setError(null);
        setSubmitError(null); // Clear submission errors too
        try {
            const [groupsData, categoriesData] = await Promise.all([
                transactionService.getUncategorizedGroups(),
                categoryService.getCategories() // Use real service now
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

    // --- Handlers for CategorizationCard ---
    const handleCategorizeGroup = async (transactionIds, categoryId) => {
        if (!categoryId) {
            setSubmitError("Please select a category."); // Basic validation
            return;
        }
        console.log(`Parent: Attempting to categorize IDs: ${transactionIds} with Category ID: ${categoryId}`);
        setIsSubmitting(true);
        setSubmitError(null); // Clear previous submission errors
        try {
             // --- Use the real service function ---
             const response = await transactionService.batchUpdateCategory(transactionIds, parseInt(categoryId, 10)); // Ensure categoryId is number
             console.log("Batch categorize response:", response);
             // --- End Use real service ---

             // Move to the next card or finish
             handleNextCard();

        } catch (err) {
             console.error("Error submitting categorization:", err);
             // Display specific error from backend if available, otherwise generic
             setSubmitError(err.message || err.error || 'Failed to save category. Please try again.');
             // Don't advance card on error
        } finally {
             setIsSubmitting(false);
        }
    };

    const handleSkipGroup = (transactionIds) => {
        console.log(`Parent: Skipping IDs: ${transactionIds}`);
        setSubmitError(null); // Clear errors when skipping
        handleNextCard();
    };

    const handleNextCard = () => {
        if (currentIndex < groupedTransactions.length - 1) {
            setCurrentIndex(prevIndex => prevIndex + 1);
        } else {
            console.log("Categorization complete!");
            navigate('/dashboard'); // Navigate back after finishing
        }
    };

    // --- Render Logic ---
    const currentGroup = groupedTransactions[currentIndex];
    const totalGroups = groupedTransactions.length;
    const isLoading = isLoadingGroups || isLoadingCategories;

    if (isLoading) { /* ... loading state ... */ }
    if (error && !isLoading) { /* ... error state ... */ } // Show general load error only if not loading
    if (!isLoading && totalGroups === 0) { /* ... empty state ... */ }

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

             {/* Error display for submission errors */}
             {submitError && ( // Display specific submission errors here
                <div className="categorization-error error-message">
                   <FiAlertCircle /> {submitError}
                </div>
             )}

            {/* Render the current card */}
            {currentGroup ? (
                <CategorizationCard
                    key={currentGroup.transaction_ids[0]}
                    group={currentGroup}
                    onCategorize={handleCategorizeGroup}
                    onSkip={handleSkipGroup}
                    availableCategories={availableCategories}
                    isLoading={isSubmitting}
                />
            ) : (
                // Should only show if initial fetch brings 0 groups, handled above
                !isLoading && <p>No groups left to categorize.</p>
            )}
        </div>
    );
};

export default CategorizeTransactions;