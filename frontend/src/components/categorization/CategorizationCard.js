// frontend/src/components/categorization/CategorizationCard.js
import React, { useState, useEffect, useMemo, forwardRef } from 'react'; // Import forwardRef
import PropTypes from 'prop-types';
import './CategorizationCard.css';
import { FiTag, FiChevronDown, FiChevronUp, FiCheck, FiLoader } from 'react-icons/fi'; // Adjusted imports

// --- Import the REAL Modal ---
import CategorySelectorModal from './CategorySelectorModal';

// --- Helper Functions ---
const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
        const options = { year: 'numeric', month: 'short', day: 'numeric' };
        return new Date(dateString + 'T00:00:00').toLocaleDateString(undefined, options);
    } catch (e) { return dateString; }
};
const formatCurrency = (amount, direction) => {
    const numAmount = Number(amount);
    if (isNaN(numAmount)) return 'N/A';
    const options = { style: 'currency', currency: 'EUR' };
    const formatted = Math.abs(numAmount).toLocaleString(undefined, options);
    return direction === 'DEBIT' ? `- ${formatted}` : `+ ${formatted}`;
};

// Wrap component in forwardRef if needed by parent transition library
const CategorizationCard = forwardRef(({ group, onCategorize, onSkip, availableCategories = [], isLoading = false }, ref) => {
    const [selectedCategoryId, setSelectedCategoryId] = useState('');
    const [showIndividual, setShowIndividual] = useState(false);
    const [isModalOpen, setIsModalOpen] = useState(false);

    useEffect(() => {
        setSelectedCategoryId('');
        setShowIndividual(false);
        setIsModalOpen(false);
    }, [group]);

    if (!group || !group.description) {
        return <div ref={ref} className="categorization-card loading">Loading group...</div>; // Add ref here too
    }

    const openCategoryModal = () => setIsModalOpen(true);
    const closeCategoryModal = () => setIsModalOpen(false);

    const handleCategorySelected = (categoryId) => {
        console.log(`Category selected via modal: ID = ${categoryId}`);
        setSelectedCategoryId(categoryId ? categoryId.toString() : '');
        closeCategoryModal();
    };

    const handleApplyCategory = async () => {
        if (!selectedCategoryId || isLoading) { return; }
        console.log(`Applying Category ID: ${selectedCategoryId} to ${group.count} transactions.`);
        onCategorize(group.transaction_ids, parseInt(selectedCategoryId, 10));
    };

    const handleSkip = () => {
        console.log(`Skipping group: ${group.description}`);
        setSelectedCategoryId('');
        onSkip(group.transaction_ids);
    }

    const selectedCategoryName = useMemo(() => {
        if (!selectedCategoryId) return "Uncategorized";
        const selectedIdNum = parseInt(selectedCategoryId, 10);
        const foundCategory = availableCategories.find(cat => cat.id === selectedIdNum);
        return foundCategory ? foundCategory.name : "Unknown";
    }, [selectedCategoryId, availableCategories]);

    return (
        <>
            {/* Attach ref to the main card div */}
            <div ref={ref} className={`categorization-card ${isLoading ? 'is-loading' : ''}`}>
                <h3 className="card-description"><FiTag className="icon" /> {group.description}</h3>
                <p className="card-meta">
                    {group.count} transaction(s) between {formatDate(group.earliest_date)} and {formatDate(group.previews[group.previews.length - 1]?.date || group.earliest_date)}
                </p>

                <div className="transaction-previews">
                    <p><strong>Recent transactions in this group:</strong></p>
                    <ul>{group.previews.map(tx => (<li key={tx.id}><span className="preview-date">{formatDate(tx.date)}</span><span className={`preview-amount amount-${tx.direction?.toLowerCase()}`}>{formatCurrency(tx.amount, tx.direction)}</span></li>))}</ul>
                    {group.count > group.previews.length && (<button className="view-all-btn" onClick={() => setShowIndividual(!showIndividual)}>{showIndividual ? <FiChevronUp /> : <FiChevronDown />} View All / Edit Individually ({group.count})</button>)}
                </div>

                {showIndividual && (<div className="individual-transactions-area"><p><em>Individual editing UI will go here.</em></p></div>)}

                {!showIndividual && (
                    <div className="categorization-action-area">
                        <div className="category-selection-display">
                            <span className="category-label">Selected Category:</span>
                            <span className={`selected-category-name ${!selectedCategoryId ? 'is-uncategorized' : ''}`}>{selectedCategoryName}</span>
                            <button onClick={openCategoryModal} className="select-category-button" disabled={isLoading}>
                                {selectedCategoryId ? 'Change' : 'Select'} Category
                            </button>
                        </div>
                        <div className="card-buttons">
                            <button onClick={handleSkip} className="skip-button" disabled={isLoading}>Skip</button>
                            <button onClick={handleApplyCategory} className="apply-button" disabled={!selectedCategoryId || isLoading}>
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
                onSelectCategory={handleCategorySelected} // Pass handler to receive selected ID
                availableCategories={availableCategories}
                currentSelectedId={selectedCategoryId || null} // Pass current selection
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
      user: PropTypes.number, // Include user ID for filtering parents later maybe
  })),
  isLoading: PropTypes.bool,
};


export default CategorizationCard;