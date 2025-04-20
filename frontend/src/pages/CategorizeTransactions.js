import React, { useState, useEffect, useCallback, useRef } from 'react'; // Import useRef
import { useNavigate } from 'react-router-dom';
import { TransitionGroup, CSSTransition } from 'react-transition-group';
import CategorizationCard from '../components/categorization/CategorizationCard';
import transactionService from '../services/transactions';
import categoryService from '../services/categories';
import './CategorizeTransactions.css';
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
    // --- Create refs for each potential card node ---
    // We need an array of refs if we preload cards, but for one card at a time,
    // one ref that gets reassigned is sufficient IF the key prop forces a remount.
    // Let's stick with one ref for now, as the key change should handle reset.
    const nodeRef = useRef(null);

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
    const animationTimeout = 300;

    // Assign the current group's potential node to the ref
    // Note: This might cause a ref mismatch if not careful, but CSSTransition
    // primarily uses it on mount/unmount based on the key.
    // A more robust way might involve an array of refs if preloading.
    useEffect(() => {
        // Ensure ref is updated if needed, although maybe not necessary
        // if CSSTransition uses it primarily on mount based on key change.
        // If animations glitch, consider creating refs dynamically.
    }, [currentIndex]);


    if (isLoading) { /* ... loading ... */ }
    if (error && !isLoading) { /* ... error ... */ }
    if (!isLoading && totalGroups === 0) { /* ... empty ... */ }

    // --- Inside the return statement ---
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

            {/* --- CORRECTED Submit Error Display --- */}
            {submitError && (
                <div className="categorization-error error-message">
                <FiAlertCircle /> {submitError}
                </div>
            )}
            {/* --- End Correction --- */}


            {/* --- Animation Wrapper --- */}
            <TransitionGroup className="categorization-card-container">
                {/* ... CSSTransition and CategorizationCard ... */}
                {currentGroup && (
                    <CSSTransition
                        key={`${currentIndex}-${currentGroup.transaction_ids[0]}`}
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
                        />
                    </CSSTransition>
                )}
            </TransitionGroup>
            {/* --- End Animation Wrapper --- */}

        </div>
    );
};

export default CategorizeTransactions;