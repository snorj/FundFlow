import React, { useState, useEffect } from 'react';
// We'll need to import CategorySelectorModal or a similar component later for category selection

const EditTransactionModal = ({ isOpen, onClose, transaction, onSave }) => {
  const [formData, setFormData] = useState({});

  useEffect(() => {
    if (transaction) {
      // Pre-fill form data when a transaction is provided
      // Ensure date is formatted correctly if necessary for input type="date"
      const transactionDate = transaction.transaction_date 
        ? new Date(transaction.transaction_date).toISOString().split('T')[0] 
        : '';
      setFormData({
        ...transaction,
        transaction_date: transactionDate,
        category: transaction.category ? transaction.category.id : '', // Assuming category object has id
      });
    } else {
      setFormData({}); // Reset form if no transaction
    }
  }, [transaction]);

  if (!isOpen) {
    return null;
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Create a payload with only the fields the backend expects
    // Ensure amount is a number, category is an ID or null
    const payload = {
        description: formData.description,
        transaction_date: formData.transaction_date, // Ensure this is YYYY-MM-DD
        original_amount: parseFloat(formData.original_amount),
        original_currency: formData.original_currency?.toUpperCase(),
        direction: formData.direction,
        // Handle category: send category ID or null if unselected/cleared
        category: formData.category ? parseInt(formData.category) : null, 
        // Include other fields as necessary from your TransactionUpdateSerializer
        // For example, if you allow changing bank_transaction_id, source, etc. include them here
    };
    console.log("Submitting payload:", payload);
    onSave(transaction.id, payload);
  };
  
  // Basic modal styling - replace with proper CSS later
  const modalStyle = {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: 'white',
    padding: '20px',
    zIndex: 1000,
    border: '1px solid #ccc',
    borderRadius: '5px',
    boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
    width: '400px', // Adjust as needed
  };

  const backdropStyle = {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 999,
  };

  return (
    <>
      <div style={backdropStyle} onClick={onClose}></div>
      <div style={modalStyle}>
        <h2>Edit Transaction</h2>
        <form onSubmit={handleSubmit}>
          {/* Date Field */}
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="transaction_date" style={{ display: 'block', marginBottom: '5px' }}>Date:</label>
            <input
              type="date"
              id="transaction_date"
              name="transaction_date"
              value={formData.transaction_date || ''}
              onChange={handleChange}
              style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              required
            />
          </div>

          {/* Description Field */}
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="description" style={{ display: 'block', marginBottom: '5px' }}>Description:</label>
            <input
              type="text"
              id="description"
              name="description"
              value={formData.description || ''}
              onChange={handleChange}
              style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              required
            />
          </div>

          {/* Amount Field */}
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="original_amount" style={{ display: 'block', marginBottom: '5px' }}>Amount:</label>
            <input
              type="number"
              id="original_amount"
              name="original_amount"
              value={formData.original_amount || ''}
              onChange={handleChange}
              step="0.01"
              style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              required
            />
          </div>
          
          {/* Currency Field */}
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="original_currency" style={{ display: 'block', marginBottom: '5px' }}>Currency:</label>
            <input
              type="text"
              id="original_currency"
              name="original_currency"
              value={formData.original_currency || ''}
              onChange={handleChange}
              maxLength="3" // Typically 3-letter codes
              style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              required
            />
          </div>

          {/* Direction Field */}
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="direction" style={{ display: 'block', marginBottom: '5px' }}>Direction:</label>
            <select
              id="direction"
              name="direction"
              value={formData.direction || 'DEBIT'}
              onChange={handleChange}
              style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
              required
            >
              <option value="DEBIT">Debit</option>
              <option value="CREDIT">Credit</option>
            </select>
          </div>

          {/* Category Field - Simple select for now, replace with CategorySelector later */}
          <div style={{ marginBottom: '10px' }}>
            <label htmlFor="category" style={{ display: 'block', marginBottom: '5px' }}>Category:</label>
            {/* This will be replaced with a proper category selector component */}
            {/* For now, let's assume it's an ID or empty string */}
            <input
              type="text" 
              id="category"
              name="category"
              value={formData.category || ''}
              onChange={handleChange}
              placeholder="Category ID (or leave blank)"
              style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }}
            />
             {/* TODO: Fetch and display categories in a dropdown/selector */}
          </div>

          <div style={{ marginTop: '20px', textAlign: 'right' }}>
            <button type="button" onClick={onClose} style={{ marginRight: '10px' }}>Cancel</button>
            <button type="submit">Save Changes</button>
          </div>
        </form>
      </div>
    </>
  );
};

export default EditTransactionModal; 