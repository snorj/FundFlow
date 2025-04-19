import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types'; // For defining prop types
import './CategorizationCard.css';
import { FiCalendar, FiDollarSign, FiTag, FiChevronDown, FiChevronUp, FiCheck } from 'react-icons/fi'; // Example icons

// --- Helper Functions (reuse from Dashboard if needed) ---
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


const CategorizationCard = ({ group, onCategorize, onSkip, availableCategories = [], isLoading = false }) => {
  // State for the selected category ID for this group
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  // State for showing individual transaction editing (future use)
  const [showIndividual, setShowIndividual] = useState(false);
  // State for potentially creating a new category (future use)
  const [newCategoryName, setNewCategoryName] = useState('');


  // Reset local state when the group prop changes
  useEffect(() => {
      setSelectedCategoryId('');
      setShowIndividual(false);
      setNewCategoryName('');
  }, [group]);

  if (!group || !group.description) {
    // Handle case where group data is missing or invalid
    return <div className="categorization-card loading">Loading group...</div>;
  }

  const handleCategoryChange = (event) => {
    setSelectedCategoryId(event.target.value);
    // If implementing create-new, check if 'create-new' value is selected
  };

  // Placeholder for submitting the category for the group
  const handleApplyCategory = () => {
    if (!selectedCategoryId || isLoading) return;
    // In the next step, this will call the backend API
    console.log(`Applying Category ID: ${selectedCategoryId} to ${group.count} transactions with description: ${group.description}`);
    onCategorize(group.transaction_ids, selectedCategoryId); // Pass IDs and category ID up
  };

  // Placeholder for skipping this group for now
  const handleSkip = () => {
      console.log(`Skipping group: ${group.description}`);
      onSkip(group.transaction_ids); // Notify parent component
  }

  return (
    <div className={`categorization-card ${isLoading ? 'is-loading' : ''}`}>
      {/* 1. Group Description */}
      <h3 className="card-description">
        <FiTag className="icon" /> {group.description}
      </h3>
      <p className="card-meta">
        {group.count} transaction(s) between {formatDate(group.earliest_date)} and {formatDate(group.previews[group.previews.length - 1]?.date || group.earliest_date)}
      </p>

      {/* 2. Transaction Previews */}
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

      {/* 3. Individual Transaction Editing Area (Future) */}
      {showIndividual && (
          <div className="individual-transactions-area">
              <p><em>Individual editing UI will go here.</em></p>
              {/* Map through all transaction_ids, fetch details maybe, show inputs */}
          </div>
      )}


      {/* 4. Categorization Input */}
      {!showIndividual && ( // Only show group categorization if not editing individually
        <div className="categorization-action-area">
          <label htmlFor={`category-select-${group.transaction_ids[0]}`}>Assign Category:</label>
          <select
            id={`category-select-${group.transaction_ids[0]}`} // Unique ID based on group
            value={selectedCategoryId}
            onChange={handleCategoryChange}
            disabled={isLoading}
          >
            <option value="" disabled>-- Select or Type Category --</option>
            {/* Add option group for system categories */}
            <optgroup label="System Categories">
                {availableCategories.filter(cat => !cat.is_custom && !cat.parent).map(cat => ( // Top level system
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
                 {/* Basic nesting example - improve later */}
                 {availableCategories.filter(cat => !cat.is_custom && cat.parent).map(cat => (
                    <option key={cat.id} value={cat.id}>   - {cat.name}</option>
                ))}
            </optgroup>
             {/* Add option group for user categories */}
            <optgroup label="Your Categories">
                 {availableCategories.filter(cat => cat.is_custom && !cat.parent).map(cat => ( // Top level custom
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
                {/* Basic nesting example - improve later */}
                {availableCategories.filter(cat => cat.is_custom && cat.parent).map(cat => (
                    <option key={cat.id} value={cat.id}>   - {cat.name}</option>
                ))}
            </optgroup>
            {/* Option to create new category */}
            {/* <option value="create-new">-- Create New Category --</option> */}
          </select>

          {/* TODO: Add input for creating new category if 'create-new' is selected */}

          <div className="card-buttons">
              <button
                  onClick={handleSkip}
                  className="skip-button"
                  disabled={isLoading}
                  title="Categorize later"
              >
                  Skip
              </button>
              <button
                  onClick={handleApplyCategory}
                  className="apply-button"
                  disabled={!selectedCategoryId || selectedCategoryId === 'create-new' || isLoading}
                  title={`Apply selected category to all ${group.count} transactions`}
              >
                  <FiCheck /> Apply to All
              </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Define PropTypes for validation
CategorizationCard.propTypes = {
  group: PropTypes.shape({
    description: PropTypes.string.isRequired,
    earliest_date: PropTypes.string, // Assuming date comes as string
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
  onCategorize: PropTypes.func.isRequired, // Function to call when category applied
  onSkip: PropTypes.func.isRequired,       // Function to call when skipping
  availableCategories: PropTypes.arrayOf(PropTypes.shape({ // List of categories for dropdown
      id: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      parent: PropTypes.number, // ID of parent or null
      is_custom: PropTypes.bool,
  })),
  isLoading: PropTypes.bool, // To disable controls during API calls
};

export default CategorizationCard;