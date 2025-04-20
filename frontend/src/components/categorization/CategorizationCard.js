import React, { useState, useEffect, forwardRef } from 'react'; // Import forwardRef
import PropTypes from 'prop-types';
import './CategorizationCard.css';
import { FiTag, FiChevronDown, FiChevronUp, FiCheck, FiLoader } from 'react-icons/fi'; // Removed unused icons
import categoryService from '../../services/categories';

// --- Helper Functions ---
// Assuming these are defined correctly elsewhere or here
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
  const options = { style: 'currency', currency: 'EUR' }; // Use appropriate currency
  const formatted = Math.abs(numAmount).toLocaleString(undefined, options);
  return direction === 'DEBIT' ? `- ${formatted}` : `+ ${formatted}`;
};
// --- End Helper Functions ---

const CREATE_NEW_VALUE = "CREATE_NEW";

// Wrap component definition in forwardRef
const CategorizationCard = forwardRef(({ group, onCategorize, onSkip, availableCategories = [], isLoading = false }, ref) => {
    const [selectedCategoryId, setSelectedCategoryId] = useState('');
    const [showIndividual, setShowIndividual] = useState(false); // Still keeping for potential future use
    const [isCreatingCategory, setIsCreatingCategory] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryParentId, setNewCategoryParentId] = useState('');
    const [createCategoryError, setCreateCategoryError] = useState(null);
    const [isSubmittingCreate, setIsSubmittingCreate] = useState(false);

    useEffect(() => {
        setSelectedCategoryId('');
        setShowIndividual(false);
        setIsCreatingCategory(false);
        setNewCategoryName('');
        setNewCategoryParentId('');
        setCreateCategoryError(null);
    }, [group]);

    // Main component return check (should ideally not happen if parent filters empty groups)
    if (!group || !group.description || !group.transaction_ids || group.transaction_ids.length === 0) {
        console.warn("CategorizationCard received invalid group prop:", group);
        return <div className="categorization-card loading">Invalid group data...</div>;
    }

    const handleCategoryChange = (event) => {
        const value = event.target.value;
        setSelectedCategoryId(value);
        setCreateCategoryError(null);
        if (value === CREATE_NEW_VALUE) {
            setIsCreatingCategory(true);
            setNewCategoryParentId('');
        } else {
            setIsCreatingCategory(false);
            setNewCategoryName('');
        }
    };

    const handleNewCategoryNameChange = (event) => {
        setNewCategoryName(event.target.value);
        setCreateCategoryError(null);
    }

    const handleNewCategoryParentChange = (event) => {
        setNewCategoryParentId(event.target.value === "null" ? null : event.target.value);
    }

    const handleApplyCategory = async () => {
        setCreateCategoryError(null);
        let categoryIdToApply = selectedCategoryId;

        if (selectedCategoryId === CREATE_NEW_VALUE) {
            if (!newCategoryName.trim()) {
                setCreateCategoryError("Please enter a name for the new category.");
                return;
            }
            setIsSubmittingCreate(true);
            try {
                const newCategoryData = {
                    name: newCategoryName.trim(),
                    parent: newCategoryParentId ? parseInt(newCategoryParentId, 10) : null
                };
                const createdCategory = await categoryService.createCategory(newCategoryData);
                categoryIdToApply = createdCategory.id;
                setIsCreatingCategory(false);
                setNewCategoryName('');
                setNewCategoryParentId('');
            } catch (creationError) {
                setCreateCategoryError(creationError.message || "Could not create category.");
                setIsSubmittingCreate(false);
                return;
            } finally {
                setIsSubmittingCreate(false);
            }
        }

        if (!categoryIdToApply || isLoading || isSubmittingCreate) return;

        console.log(`Applying Category ID: ${categoryIdToApply} to ${group.count} transactions with description: ${group.description}`);
        console.log("Applying category - Group data:", group);
        console.log("Applying category - Transaction IDs:", group.transaction_ids);
        console.log("Applying category - Category ID to apply:", categoryIdToApply);

        onCategorize(group.transaction_ids, parseInt(categoryIdToApply, 10));
    };

    const handleSkip = () => {
        onSkip(group.transaction_ids);
    }

    // Filter categories for the parent selection dropdown (only system or own top-level/simple parents for now)
    const parentCategoryOptions = availableCategories.filter(cat => cat.user === null || !cat.parent); // Simplification: only top-level user cats as parents for now

    return (
        // Attach the forwarded ref to the main div
        <div ref={ref} className={`categorization-card ${isLoading || isSubmittingCreate ? 'is-loading' : ''}`}>
            <h3 className="card-description">
                <FiTag className="icon" /> {group.description}
            </h3>
            <p className="card-meta">
                {group.count} transaction(s)
                {/* Only show date range if preview dates exist */}
                {group.previews?.[0]?.date && group.previews?.[group.previews.length - 1]?.date &&
                 ` between ${formatDate(group.earliest_date)} and ${formatDate(group.previews[group.previews.length - 1].date)}`
                }
            </p>

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
                {group.count > group.previews.length && (
                    <button className="view-all-btn" onClick={() => setShowIndividual(!showIndividual)}>
                        {showIndividual ? <FiChevronUp /> : <FiChevronDown />} View All / Edit Individually ({group.count})
                    </button>
                )}
            </div>

            {showIndividual && (
                <div className="individual-transactions-area">
                    <p><em>Individual editing UI will go here.</em></p>
                </div>
            )}

            {!showIndividual && (
                <div className="categorization-action-area">
                    <label htmlFor={`category-select-${group.transaction_ids[0]}`}>Assign Category:</label>
                    <select
                        id={`category-select-${group.transaction_ids[0]}`}
                        value={selectedCategoryId}
                        onChange={handleCategoryChange}
                        disabled={isLoading || isSubmittingCreate}
                    >
                        <option value="" disabled>-- Select or Create Category --</option>
                        <option value={CREATE_NEW_VALUE}>-- Create New Category --</option>
                        <optgroup label="System Categories">
                            {availableCategories.filter(cat => !cat.is_custom).map(cat => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.parent ? '\u00A0\u00A0\u00A0\u00A0↳ ' : ''}{cat.name}
                                </option>
                            ))}
                        </optgroup>
                        <optgroup label="Your Categories">
                            {availableCategories.filter(cat => cat.is_custom).map(cat => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.parent ? '\u00A0\u00A0\u00A0\u00A0↳ ' : ''}{cat.name}
                                </option>
                            ))}
                        </optgroup>
                    </select>

                    {isCreatingCategory && (
                        <div className="create-category-form">
                            <div className="form-row">
                                <div className="form-group">
                                    <label htmlFor={`new-cat-name-${group.transaction_ids[0]}`}>New Category Name:</label>
                                    <input
                                        type="text"
                                        id={`new-cat-name-${group.transaction_ids[0]}`}
                                        value={newCategoryName}
                                        onChange={handleNewCategoryNameChange}
                                        placeholder="e.g., 'Birthday Gifts'"
                                        disabled={isSubmittingCreate}
                                    />
                                </div>
                                <div className="form-group">
                                    <label htmlFor={`new-cat-parent-${group.transaction_ids[0]}`}>Parent (Optional):</label>
                                    <select
                                        id={`new-cat-parent-${group.transaction_ids[0]}`}
                                        value={newCategoryParentId}
                                        onChange={handleNewCategoryParentChange}
                                        disabled={isSubmittingCreate}
                                    >
                                        <option value="null">-- No Parent (Top Level) --</option>
                                        <optgroup label="System Categories">
                                            {parentCategoryOptions.filter(cat => !cat.is_custom).map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                                            ))}
                                        </optgroup>
                                        <optgroup label="Your Categories">
                                            {parentCategoryOptions.filter(cat => cat.is_custom).map(cat => (
                                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                                            ))}
                                        </optgroup>
                                    </select>
                                </div>
                            </div>
                            {createCategoryError && <p className="error-text">{createCategoryError}</p>}
                        </div>
                    )}

                    <div className="card-buttons">
                        <button onClick={handleSkip} className="skip-button" disabled={isLoading || isSubmittingCreate}>Skip</button>
                        <button
                            onClick={handleApplyCategory}
                            className="apply-button"
                            disabled={
                                (!selectedCategoryId) ||
                                (selectedCategoryId === CREATE_NEW_VALUE && !newCategoryName.trim()) ||
                                isLoading || isSubmittingCreate
                            }
                        >
                           {isSubmittingCreate ? <FiLoader className="spinner-inline"/> : <FiCheck />}
                           {selectedCategoryId === CREATE_NEW_VALUE ? 'Create & Apply' : 'Apply to All'}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}); // Close forwardRef

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
  })),
  isLoading: PropTypes.bool,
};

export default CategorizationCard;