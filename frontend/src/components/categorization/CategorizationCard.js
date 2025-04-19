import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './CategorizationCard.css';
import { FiCalendar, FiDollarSign, FiTag, FiChevronDown, FiChevronUp, FiCheck, FiPlus, FiLoader } from 'react-icons/fi'; // Added FiPlus, FiLoader
import categoryService from '../../services/categories'; // Import category service

// --- Helper Functions (Keep formatDate, formatCurrency) ---
const formatDate = (dateString) => { /* ... */ };
const formatCurrency = (amount, direction) => { /* ... */ };

const CREATE_NEW_VALUE = "CREATE_NEW"; // Constant for the special value

const CategorizationCard = ({ group, onCategorize, onSkip, availableCategories = [], isLoading = false }) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [showIndividual, setShowIndividual] = useState(false);
  // --- NEW State for creating category ---
  const [isCreatingCategory, setIsCreatingCategory] = useState(false); // Track if create mode active
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newCategoryParentId, setNewCategoryParentId] = useState(''); // Store parent ID if creating nested
  const [createCategoryError, setCreateCategoryError] = useState(null);
  const [isSubmittingCreate, setIsSubmittingCreate] = useState(false); // Loading state for creation API call
  // --- End NEW State ---


  // Reset local state when the group prop changes
  useEffect(() => {
      setSelectedCategoryId('');
      setShowIndividual(false);
      setIsCreatingCategory(false); // Reset create mode
      setNewCategoryName('');
      setNewCategoryParentId('');
      setCreateCategoryError(null);
  }, [group]);

  if (!group || !group.description) {
    return <div className="categorization-card loading">Loading group...</div>;
  }

  const handleCategoryChange = (event) => {
    const value = event.target.value;
    setSelectedCategoryId(value);
    setCreateCategoryError(null); // Clear errors on change
    // Toggle create input visibility
    if (value === CREATE_NEW_VALUE) {
        setIsCreatingCategory(true);
        setNewCategoryParentId(''); // Reset parent selection for new category
    } else {
        setIsCreatingCategory(false);
        setNewCategoryName('');
    }
  };

  // Handle input change for the new category name
  const handleNewCategoryNameChange = (event) => {
      setNewCategoryName(event.target.value);
      setCreateCategoryError(null); // Clear errors on typing
  }

  // Handle selecting a parent for the new category
  const handleNewCategoryParentChange = (event) => {
      setNewCategoryParentId(event.target.value === "null" ? null : event.target.value); // Handle 'null' string value
  }

  // Handle Applying/Creating Category
  const handleApplyCategory = async () => {
    setCreateCategoryError(null); // Clear previous errors
    let categoryIdToApply = selectedCategoryId;

    // --- Logic for Creating New Category ---
    if (selectedCategoryId === CREATE_NEW_VALUE) {
        if (!newCategoryName.trim()) {
            setCreateCategoryError("Please enter a name for the new category.");
            return;
        }
        setIsSubmittingCreate(true); // Start create loading
        try {
            console.log(`Creating new category: ${newCategoryName}, Parent ID: ${newCategoryParentId || 'None'}`);
            const newCategoryData = {
                name: newCategoryName.trim(),
                parent: newCategoryParentId ? parseInt(newCategoryParentId, 10) : null // Send null or parsed ID
            };
            const createdCategory = await categoryService.createCategory(newCategoryData);
            console.log("New category created:", createdCategory);
            categoryIdToApply = createdCategory.id; // Get the ID of the newly created category

            // Optionally: Add the new category to the availableCategories list in the parent
            // state so it appears immediately in the next card's dropdown. This requires
            // passing a handler down from CategorizeTransactions page.
            // For now, it will be available on next page load/refresh.

            // Reset create fields
            setIsCreatingCategory(false);
            setNewCategoryName('');
            setNewCategoryParentId('');

        } catch (creationError) {
            console.error("Error creating category:", creationError);
            setCreateCategoryError(creationError.message || "Could not create category.");
            setIsSubmittingCreate(false); // Stop loading on error
            return; // Stop the process if category creation failed
        } finally {
             setIsSubmittingCreate(false); // Stop loading
        }
    }
    // --- End Create Logic ---


    // Proceed to apply the category (either selected existing or newly created)
    if (!categoryIdToApply || isLoading || isSubmittingCreate) return; // Ensure we have an ID and aren't loading

    console.log(`Applying Category ID: ${categoryIdToApply} to ${group.count} transactions with description: ${group.description}`);
    // Call the parent's handler, passing the final category ID (number)
    onCategorize(group.transaction_ids, parseInt(categoryIdToApply, 10));
  };

  const handleSkip = () => { /* ... keep existing skip logic ... */ }

  // Filter categories for the parent selection dropdown (only system or own top-level)
  const parentCategoryOptions = availableCategories.filter(cat => cat.user === null || !cat.parent);

  return (
    <div className={`categorization-card ${isLoading || isSubmittingCreate ? 'is-loading' : ''}`}>
      {/* ... (description, meta, previews remain the same) ... */}
       <h3 className="card-description"><FiTag className="icon" /> {group.description}</h3>
       {/* ... card-meta ... */}
       {/* ... transaction-previews ... */}
       {/* ... individual transactions area (hidden) ... */}

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
            {/* --- Add "Create New" Option --- */}
            <option value={CREATE_NEW_VALUE}>-- Create New Category --</option>
            {/* --- System Categories --- */}
            <optgroup label="System Categories">
                 {/* Render hierarchical options maybe using recursion or padding later */}
                 {availableCategories.filter(cat => !cat.is_custom).map(cat => (
                    <option key={cat.id} value={cat.id}>
                        {cat.parent ? '\u00A0\u00A0\u00A0\u00A0↳ ' : ''}{cat.name} {/* Basic indent */}
                    </option>
                 ))}
            </optgroup>
             {/* --- Your Categories --- */}
            <optgroup label="Your Categories">
                 {availableCategories.filter(cat => cat.is_custom).map(cat => (
                    <option key={cat.id} value={cat.id}>
                        {cat.parent ? '\u00A0\u00A0\u00A0\u00A0↳ ' : ''}{cat.name} {/* Basic indent */}
                    </option>
                 ))}
            </optgroup>
          </select>

          {/* --- Conditional Input for Creating New Category --- */}
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
                         {/* System Categories */}
                         <optgroup label="System Categories">
                            {parentCategoryOptions.filter(cat => !cat.is_custom).map(cat => (
                                <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                         </optgroup>
                         {/* Your Categories */}
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
          {/* --- End Create New Category Input --- */}


          {/* --- Card Buttons --- */}
          <div className="card-buttons">
              <button onClick={handleSkip} className="skip-button" disabled={isLoading || isSubmittingCreate}>Skip</button>
              <button
                  onClick={handleApplyCategory}
                  className="apply-button"
                  // Disable if no category selected OR if creating new but name is empty
                  disabled={(!selectedCategoryId || selectedCategoryId === CREATE_NEW_VALUE && !newCategoryName.trim()) || isLoading || isSubmittingCreate}
              >
                 {isSubmittingCreate ? <FiLoader className="spinner-inline"/> : <FiCheck />}
                 {selectedCategoryId === CREATE_NEW_VALUE ? 'Create & Apply' : 'Apply to All'}
              </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Keep PropTypes ---
CategorizationCard.propTypes = { /* ... */ };

export default CategorizationCard;