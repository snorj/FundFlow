import React, { useState, useEffect, useMemo, forwardRef } from 'react';
import PropTypes from 'prop-types';
import './CategorizationCard.css';
// Import necessary icons
import { FiTag, FiChevronDown, FiChevronUp, FiCheck, FiLoader } from 'react-icons/fi';
// Import the Modal component
import CategorySelectorModal from './CategorySelectorModal';

// Helper Functions
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    // Ensure date parsing is robust, adding time avoids timezone shifts from midnight UTC
    return new Date(dateString + 'T00:00:00').toLocaleDateString(undefined, options);
  } catch (e) {
    console.warn("Error formatting date:", dateString, e);
    return dateString;
  }
};

const formatCurrency = (amount, direction) => {
  const numAmount = Number(amount);
  if (isNaN(numAmount)) return 'N/A';
  // Consider making currency dynamic later ('USD', 'EUR', etc.)
  const options = { style: 'currency', currency: 'EUR' };
  const formatted = Math.abs(numAmount).toLocaleString(undefined, options);
  // Ensure direction is handled case-insensitively and defaults reasonably
  return direction?.toUpperCase() === 'DEBIT' ? `- ${formatted}` : `+ ${formatted}`;
};


// Wrap component in forwardRef for react-transition-group nodeRef
const CategorizationCard = forwardRef(({ group, onCategorize, onSkip, availableCategories = [], isLoading = false, onCategoriesUpdate }, ref) => {
    const [selectedCategoryId, setSelectedCategoryId] = useState('');
    const [showIndividual, setShowIndividual] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // --- Calculate selectedCategoryName BEFORE early return ---
    const selectedCategoryName = useMemo(() => {
        if (!selectedCategoryId) return "Uncategorized";
        const selectedIdNum = parseInt(selectedCategoryId, 10);
        // Use optional chaining just in case availableCategories is momentarily null/undefined
        const foundCategory = availableCategories?.find(cat => cat.id === selectedIdNum);
        // Provide more context if category ID exists but isn't in the list (e.g., deleted category)
        return foundCategory ? foundCategory.name : `Unknown (ID: ${selectedIdNum})`;
    }, [selectedCategoryId, availableCategories]);


    // Reset local state when the main group prop changes
    useEffect(() => {
        setSelectedCategoryId('');
        setShowIndividual(false);
        setIsModalOpen(false); // Ensure modal is closed if group changes
    }, [group]); // Dependency on the group object

    // --- Early return if group is invalid ---
    if (!group || !group.description || !group.transaction_ids || group.transaction_ids.length === 0) {
        console.warn("CategorizationCard received invalid or empty group prop:", group);
        // Attach ref here because forwardRef needs it attached to a DOM element returned
        return <div ref={ref} className="categorization-card loading">Loading group...</div>;
    }


    // --- Modal Control Functions ---
    const openCategoryModal = () => setIsModalOpen(true);
    const closeCategoryModal = () => setIsModalOpen(false);

    // --- Callback for Modal Selection ---
    const handleCategorySelected = (categoryId) => {
        console.log(`Card: Category selected via modal: ID = ${categoryId}`);
        setSelectedCategoryId(categoryId ? categoryId.toString() : '');
        closeCategoryModal(); // Close modal after selection
    };


    // --- Handle Apply Action ---
    const handleApplyCategory = async () => {
        if (!selectedCategoryId || isLoading) {
            console.warn("Apply clicked but no category selected or already loading.");
            return;
        }
        console.log(`Card: Applying Category ID: ${selectedCategoryId} to ${group.count} transactions.`);
        // Call the parent's handler, passing the final category ID (number)
        onCategorize(group.transaction_ids, parseInt(selectedCategoryId, 10));
    };


    // --- Handle Skip ---
    const handleSkip = () => {
        console.log(`Card: Skipping group: ${group.description}`);
        setSelectedCategoryId(''); // Clear selection on skip
        onSkip(group.transaction_ids);
    }


    // Component JSX
    return (
        <>
            {/* Attach ref to the main card div */}
            <div ref={ref} className={`categorization-card ${isLoading ? 'is-loading' : ''}`}>
                {/* Header */}
                <h3 className="card-description"><FiTag className="icon" /> {group.description}</h3>
                <p className="card-meta">
                    {group.count} transaction(s)
                    {/* Add date range only if dates are valid */}
                    {group.earliest_date && ` between ${formatDate(group.earliest_date)} and ${formatDate(group.previews[group.previews.length - 1]?.date || group.earliest_date)}`}
                </p>

                {/* Transaction Previews */}
                <div className="transaction-previews">
                    <p><strong>Recent transactions in this group:</strong></p>
                    <ul>
                        {group.previews.map(tx => (
                            <li key={tx.id}>
                                <span className="preview-date">{formatDate(tx.date)}</span>
                                <span className={`preview-amount amount-${tx.direction?.toLowerCase()}`}>
                                    {formatCurrency(tx.amount, tx.direction)}
                                </span>
                            </li>
                        ))}
                    </ul>
                    {/* Only show button if there are more transactions than previews */}
                    {group.count > group.previews.length && (
                        <button className="view-all-btn" onClick={() => setShowIndividual(!showIndividual)}>
                            {showIndividual ? <FiChevronUp /> : <FiChevronDown />} View All / Edit Individually ({group.count})
                        </button>
                    )}
                </div>

                {/* Placeholder for individual editing */}
                {showIndividual && (
                    <div className="individual-transactions-area">
                        <p><em>Individual editing UI will go here.</em></p>
                    </div>
                )}

                {/* Action area shown only if not editing individually */}
                {!showIndividual && (
                    <div className="categorization-action-area">
                        {/* Display Current Selection & Button to Change */}
                        <div className="category-selection-display">
                            <span className="category-label">Selected Category:</span>
                            <span className={`selected-category-name ${!selectedCategoryId ? 'is-uncategorized' : ''}`}>
                                {selectedCategoryName}
                            </span>
                            <button onClick={openCategoryModal} className="select-category-button" disabled={isLoading}>
                                {selectedCategoryId ? 'Change' : 'Select'} Category
                            </button>
                        </div>

                        {/* Apply/Skip Buttons */}
                        <div className="card-buttons">
                            <button onClick={handleSkip} className="skip-button" disabled={isLoading}>Skip</button>
                            <button
                                onClick={handleApplyCategory}
                                className="apply-button"
                                disabled={!selectedCategoryId || isLoading} // Disable if no category selected or parent is loading
                            >
                                {isLoading ? <FiLoader className="spinner-inline" /> : <FiCheck />}
                                Apply to All
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* --- Render the ACTUAL Modal --- */}
            <CategorySelectorModal
                isOpen={isModalOpen}
                onClose={closeCategoryModal}
                onSelectCategory={handleCategorySelected}
                availableCategories={availableCategories}
                onCategoriesUpdate={onCategoriesUpdate} // <-- *** PROP IS NOW PASSED ***
                currentSelectedId={selectedCategoryId || null} // Pass current selection as string or null
            />
            {/* --- End Modal --- */}
        </>
    );
}); // Close forwardRef

// Define PropTypes for validation
CategorizationCard.propTypes = {
    group: PropTypes.shape({
        description: PropTypes.string.isRequired,
        earliest_date: PropTypes.string,
        transaction_ids: PropTypes.arrayOf(PropTypes.number).isRequired,
        previews: PropTypes.arrayOf(PropTypes.shape({
            id: PropTypes.number.isRequired,
            date: PropTypes.string,
            amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
            direction: PropTypes.string,
            signed_amount: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
        })).isRequired,
        count: PropTypes.number.isRequired,
    }).isRequired,
    onCategorize: PropTypes.func.isRequired,
    onSkip: PropTypes.func.isRequired,
    availableCategories: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.number.isRequired,
        name: PropTypes.string.isRequired,
        parent: PropTypes.number,
        is_custom: PropTypes.bool,
        user: PropTypes.number,
    })),
    isLoading: PropTypes.bool,
    onCategoriesUpdate: PropTypes.func.isRequired, // Ensure PropType is defined
};

export default CategorizationCard;