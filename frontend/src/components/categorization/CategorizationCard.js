import React, { useState, useEffect, useMemo, forwardRef } from 'react';
import PropTypes from 'prop-types';
import './CategorizationCard.css';
// Add Edit/Save/Cancel icons
import { FiTag, FiChevronDown, FiChevronUp, FiCheck, FiLoader, FiEdit2, FiSave, FiXCircle } from 'react-icons/fi';
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
    const [isModalOpen, setIsModalOpen] = useState(false);
    // --- NEW: State for Description Editing ---
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [editedDescription, setEditedDescription] = useState('');
    // --- End New State ---

    // --- Calculate selectedCategoryName BEFORE early return ---
    const selectedCategoryName = useMemo(() => {
        if (!selectedCategoryId) return "Uncategorized";
        const selectedIdNum = parseInt(selectedCategoryId, 10);
        // Use optional chaining just in case availableCategories is momentarily null/undefined
        const foundCategory = availableCategories?.find(cat => cat.id === selectedIdNum);
        // Provide more context if category ID exists but isn't in the list (e.g., deleted category)
        return foundCategory ? foundCategory.name : `Unknown (ID: ${selectedIdNum})`;
    }, [selectedCategoryId, availableCategories]);


    useEffect(() => {
        setSelectedCategoryId('');
        setIsModalOpen(false);
        setIsEditingDescription(false);
        setEditedDescription(group?.description || '');
    }, [group]);

    if (!group || !group.description || !group.transaction_ids || group.transaction_ids.length === 0) {
        return <div ref={ref} className="categorization-card loading">Loading group...</div>;
    }

    // --- Description Edit Handlers ---
    const handleEditDescriptionClick = () => {
        setEditedDescription(group.description); // Start editing with original value
        setIsEditingDescription(true);
    };

    const handleDescriptionChange = (event) => {
        setEditedDescription(event.target.value);
    };

    const handleSaveDescription = () => {
        // Basic validation: don't save if empty
        if (!editedDescription.trim()) {
            // Maybe show an error message briefly?
            return;
        }
        // Here we just save the state locally. The actual 'saving' happens
        // when the category is applied, sending the editedDescription.
        console.log(`Description locally updated to: "${editedDescription.trim()}"`);
        setIsEditingDescription(false);
        // We don't need to trim the state variable itself yet, trim when sending
    };

    const handleCancelEditDescription = () => {
        setIsEditingDescription(false);
        setEditedDescription(group.description); // Reset to original
    };
    // --- End Description Edit Handlers ---


    // --- Modal Control Functions ---
    const openCategoryModal = () => setIsModalOpen(true);
    const closeCategoryModal = () => setIsModalOpen(false);

    // --- Callback for Modal Selection ---
    const handleCategorySelected = (categoryId) => {
        console.log(`Card: Category selected via modal: ID = ${categoryId}`);
        setSelectedCategoryId(categoryId ? categoryId.toString() : '');
        closeCategoryModal(); // Close modal after selection
    };


    // --- Handle Apply Action (UPDATED) ---
    const handleApplyCategory = async () => {
        if (!selectedCategoryId || isLoading) { return; }

        // Determine if description was actually changed
        const finalCleanName = editedDescription.trim();
        const originalDesc = group.description;
        const cleanNameToSend = (finalCleanName && finalCleanName !== originalDesc) ? finalCleanName : null;

        console.log(`Applying Category ID: ${selectedCategoryId} to ${group.count} transactions.`);
        console.log(`Original Desc: "${originalDesc}", Clean Name to Send: "${cleanNameToSend || 'N/A'}"`);

        // Pass original description and potentially edited clean name to parent
        onCategorize(
            group.transaction_ids,
            parseInt(selectedCategoryId, 10),
            originalDesc, // Always pass the original description for matching rule
            cleanNameToSend // Pass the edited name only if it changed, otherwise null
        );
    };
    // --- End Apply Action ---


    // --- Handle Skip ---
    const handleSkip = () => {
        console.log(`Card: Skipping group: ${group.description}`);
        setSelectedCategoryId(''); // Clear selection on skip
        onSkip(group.transaction_ids);
    }


    // Component JSX
    return (
        <>
            {/* Main Card Div */}
            <div ref={ref} className={`categorization-card ${isLoading ? 'is-loading' : ''}`}>
                {/* Header with Editable Description */}
                <div className="card-header">
                    {/* Display mode */}
                    {!isEditingDescription ? (
                        <>
                            <h3 className="card-description">
                                <FiTag className="icon" />
                                {/* Show edited description if available, otherwise original */}
                                {editedDescription || group.description}
                            </h3>
                            <button
                                onClick={handleEditDescriptionClick}
                                className="edit-description-button"
                                title="Edit description/vendor name"
                                disabled={isLoading} // Disable if parent is loading
                            >
                                <FiEdit2 size="16"/>
                            </button>
                        </>
                    ) : (
                    // Editing mode
                        <div className="description-edit-input-area">
                            <input
                                type="text"
                                value={editedDescription}
                                onChange={handleDescriptionChange}
                                autoFocus
                                // Save on Enter, Cancel on Escape
                                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveDescription(); else if (e.key === 'Escape') handleCancelEditDescription();}}
                                disabled={isLoading} // Disable if parent is loading
                            />
                            <button
                                onClick={handleSaveDescription}
                                title="Save Description"
                                disabled={!editedDescription.trim() || isLoading} // Disable if empty or parent loading
                            >
                                <FiSave size="16"/>
                            </button>
                            <button
                                onClick={handleCancelEditDescription}
                                title="Cancel Edit"
                                disabled={isLoading} // Disable if parent is loading
                            >
                                <FiXCircle size="16"/>
                            </button>
                        </div>
                    )}
                </div>
                {/* End Header */}

                {/* Meta Info */}
                <p className="card-meta">
                    {group.count} transaction(s)
                    {group.earliest_date && ` between ${formatDate(group.earliest_date)} and ${formatDate(group.previews[group.previews.length - 1]?.date || group.earliest_date)}`}
                </p>

                {/* Scrollable Transaction List */}
                <div className="transaction-list-scrollable">
                     <p className="list-title">Transactions in this group:</p>
                     <ul>
                        {group.previews.map(tx => (
                            <li key={tx.id}>
                                <span className="tx-date">{formatDate(tx.date)}</span>
                                <span className={`tx-amount amount-${tx.direction?.toLowerCase()}`}>
                                    {formatCurrency(tx.amount, tx.direction)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
                {/* End Scrollable List */}

                {/* Categorization Action Area (Always shown now) */}
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
                {/* End Categorization Action Area */}

            </div> {/* End categorization-card div */}

            {/* Modal */}
            <CategorySelectorModal
                isOpen={isModalOpen}
                onClose={closeCategoryModal}
                onSelectCategory={handleCategorySelected}
                availableCategories={availableCategories}
                onCategoriesUpdate={onCategoriesUpdate}
                currentSelectedId={selectedCategoryId || null}
            />
            {/* End Modal */}
        </> // End Fragment
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