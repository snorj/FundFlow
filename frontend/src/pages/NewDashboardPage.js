import React, { useState, useEffect, useCallback } from 'react';
import dashboardService from '../services/dashboardService'; // Changed to default import
import transactionService from '../services/transactions'; // Corrected import path
import EditTransactionModal from '../components/transactions/EditTransactionModal'; // Import the modal

// Helper function to get currency symbols
const getCurrencySymbol = (currencyCode) => {
  const symbols = {
    AUD: 'A$',
    USD: 'US$',
    GBP: '£',
    EUR: '€',
  };
  return symbols[currencyCode] || currencyCode; // Fallback to code if symbol not found
};

const NewDashboardPage = () => {
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState('AUD'); // Default to AUD

  const [transactions, setTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [pageSize, setPageSize] = useState(10); // Assuming a page size, or get from API

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);

  const availableCurrencies = ['AUD', 'USD', 'GBP', 'EUR']; // Define available currencies

  const fetchBalanceData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await dashboardService.getBalance(selectedCurrency);
      setBalance(data);
    } catch (err) {
      setError(err.message || 'Failed to fetch balance. Please try again.');
      setBalance(null); // Clear previous balance on error
    } finally {
      setIsLoading(false);
    }
  }, [selectedCurrency]);

  useEffect(() => {
    fetchBalanceData();
  }, [fetchBalanceData]);

  const fetchTransactionsData = useCallback(async (page) => {
    setTransactionsLoading(true);
    setTransactionsError(null);
    try {
      const response = await transactionService.getTransactions({ page: page });
      setTransactions(response.results || []); // Ensure it's an array
      // Calculate total pages: DRF provides 'count' (total items)
      // If using default DRF PageNumberPagination, response.count is total items
      if (response.count) {
        setTotalPages(Math.ceil(response.count / pageSize)); 
      } else {
        // Fallback if count is not directly available, or if using a different pagination style
        // This might need adjustment based on API (e.g., if it sends total_pages directly)
        if (response.next && !response.previous) setTotalPages(2); // crude guess if on page 1 and there's a next
        else if (!response.next && response.previous) setTotalPages(currentPage); // on last page
        else if (response.next && response.previous) setTotalPages(currentPage +1); // crude guess mid-way
        else setTotalPages(1); // Default to 1 page if no info
      }

    } catch (err) {
      setTransactionsError(err.message || 'Failed to fetch transactions. Please try again.');
      setTransactions([]);
      setTotalPages(0);
    } finally {
      setTransactionsLoading(false);
    }
  }, [pageSize, currentPage]); // Added currentPage to dependencies to re-evaluate totalPages crude guess if needed

  useEffect(() => {
    fetchTransactionsData(currentPage);
  }, [fetchTransactionsData, currentPage]);

  const handleEditTransaction = (transactionId) => {
    // Find the transaction from the list
    const transactionToEdit = transactions.find(tx => tx.id === transactionId);
    if (transactionToEdit) {
      setEditingTransaction(transactionToEdit);
      setIsEditModalOpen(true);
    } else {
      console.error("Transaction not found for editing:", transactionId);
    }
  };

  const handleDeleteTransaction = async (transactionId) => {
    if (window.confirm("Are you sure you want to delete this transaction?")) {
      try {
        await transactionService.deleteTransaction(transactionId);
        // Refresh the transaction list
        fetchTransactionsData(currentPage); 
        // Potentially show a success message
      } catch (err) {
        console.error("Failed to delete transaction:", err);
        // Potentially show an error message to the user
        setTransactionsError(err.message || 'Failed to delete transaction.');
      }
    }
  };

  const handleSaveTransaction = async (id, updatedData) => {
    try {
      await transactionService.updateTransaction(id, updatedData);
      setIsEditModalOpen(false);
      setEditingTransaction(null);
      fetchTransactionsData(currentPage); // Refresh transactions
      // Optionally, show a success message
    } catch (err) {
      console.error("Failed to update transaction:", err);
      // Optionally, display error within the modal or on the page
      // For now, error is logged, modal remains open or user can try again.
      // You might want to pass an error handler to the modal or set an error state here.
      alert(`Failed to update transaction: ${err.message || 'Server error'}`); // Simple alert for now
    }
  };

  const handleCurrencyChange = (event) => {
    setSelectedCurrency(event.target.value);
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Dashboard</h1>
      
      {/* Balance Display Section */}
      <div style={{ marginBottom: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '5px' }}>
        <h2>Total Balance</h2>
        <div>
          <label htmlFor="currency-select" style={{ marginRight: '10px' }}>Select Currency:</label>
          <select 
            id="currency-select" 
            value={selectedCurrency} 
            onChange={handleCurrencyChange}
            disabled={isLoading}
            style={{ padding: '5px', borderRadius: '3px' }}
          >
            {availableCurrencies.map(currency => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </div>

        {isLoading && <p>Loading balance...</p>}
        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        {balance !== null && !isLoading && (
          <div>
            <p style={{
              fontSize: '24px', 
              fontWeight: 'bold', 
              color: balance.total_balance_in_target_currency < 0 ? 'red' : 'inherit' 
            }}>
              {balance.total_balance_in_target_currency !== undefined 
                ? `${getCurrencySymbol(selectedCurrency)}${parseFloat(balance.total_balance_in_target_currency).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` 
                : 'Balance data not available.'}
            </p>
            {balance.warning && <p style={{ color: 'orange' }}>Note: {balance.warning}</p>}
            <p style={{ fontSize: '12px', color: 'gray' }}>
              Based on {balance.converted_transactions_count} out of {balance.total_transactions_count} transactions. 
              {balance.unconverted_transactions_count > 0 && 
               ` ${balance.unconverted_transactions_count} transaction(s) could not be converted to ${selectedCurrency}.`}
            </p>
          </div>
        )}
         {balance === null && !isLoading && !error && <p>No balance data to display.</p>}
      </div>

      {/* Transaction List Section */}
      <div style={{ marginTop: '30px' }}>
        <h2>Recent Transactions</h2>
        {transactionsLoading && <p>Loading transactions...</p>}
        {transactionsError && <p style={{ color: 'red' }}>Error: {transactionsError}</p>}
        {!transactionsLoading && !transactionsError && transactions.length === 0 && (
          <p>No transactions found.</p>
        )}
        {!transactionsLoading && !transactionsError && transactions.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #ddd' }}>
                <th style={{ padding: '8px', textAlign: 'left' }}>Date</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '8px', textAlign: 'right' }}>Amount</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Category</th>
                <th style={{ padding: '8px', textAlign: 'left' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map(tx => (
                <tr key={tx.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '8px' }}>{new Date(tx.transaction_date).toLocaleDateString()}</td>
                  <td style={{ padding: '8px' }}>{tx.description}</td>
                  <td style={{
                    padding: '8px', 
                    textAlign: 'right', 
                    color: tx.direction === 'DEBIT' ? 'red' : 'green' 
                  }}>
                    {tx.original_amount && tx.original_currency ? 
                     `${tx.direction === 'DEBIT' ? '-' : ''}${getCurrencySymbol(tx.original_currency)}${parseFloat(tx.original_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 
                     'N/A'}
                  </td>
                  <td style={{ padding: '8px' }}>{tx.category ? tx.category.name : 'Uncategorized'}</td>
                  <td style={{ padding: '8px' }}>
                    <button 
                      onClick={() => handleEditTransaction(tx.id)} 
                      style={{ marginRight: '5px' }}
                    >
                      Edit
                    </button>
                    <button onClick={() => handleDeleteTransaction(tx.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {/* Pagination Controls */}
        {!transactionsLoading && !transactionsError && totalPages > 0 && (
          <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            <button 
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              style={{ marginRight: '10px' }}
            >
              Previous
            </button>
            <span>Page {currentPage} of {totalPages}</span>
            <button 
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              style={{ marginLeft: '10px' }}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {editingTransaction && (
        <EditTransactionModal
          isOpen={isEditModalOpen}
          onClose={() => {
            setIsEditModalOpen(false);
            setEditingTransaction(null);
          }}
          transaction={editingTransaction}
          onSave={handleSaveTransaction}
        />
      )}
    </div>
  );
};

export default NewDashboardPage; 