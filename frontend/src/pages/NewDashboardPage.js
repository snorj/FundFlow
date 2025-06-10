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

// Helper function to format currency amounts nicely
const formatCurrencyAmount = (amount, currencyCode) => {
  const symbol = getCurrencySymbol(currencyCode);
  const numericAmount = parseFloat(amount);
  const formatted = numericAmount.toLocaleString(undefined, { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
  return `${symbol}${formatted}`;
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
      const response = await transactionService.getTransactions({ page: page, page_size: pageSize });
      console.log('📊 Dashboard: Fetched transaction response:', response);
      
      // Handle DRF paginated response properly
      if (response && response.results) {
        // Paginated response from DRF
        setTransactions(response.results || []); 
        setTotalPages(Math.ceil(response.count / pageSize));
        console.log('📋 Dashboard: Set', response.results.length, 'transactions, total pages:', Math.ceil(response.count / pageSize));
      } else if (Array.isArray(response)) {
        // Direct array response (non-paginated)
        setTransactions(response);
        setTotalPages(1);
        console.log('📋 Dashboard: Set', response.length, 'transactions (non-paginated)');
      } else {
        // Unexpected response format
        console.warn('⚠️ Dashboard: Unexpected response format:', response);
        setTransactions([]);
        setTotalPages(0);
      }

    } catch (err) {
      console.error('❌ Dashboard: Failed to fetch transactions:', err);
      setTransactionsError(err.message || 'Failed to fetch transactions. Please try again.');
      setTransactions([]);
      setTotalPages(0);
    } finally {
      setTransactionsLoading(false);
    }
  }, [pageSize]); // Removed currentPage from dependencies since it's passed as parameter

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
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>Dashboard</h1>
      
      {/* Balance Display Section */}
      <div style={{ marginBottom: '20px', padding: '20px', border: '1px solid #ccc', borderRadius: '8px', backgroundColor: '#f9f9f9' }}>
        <h2 style={{ marginBottom: '15px', color: '#333' }}>Your Balance</h2>
        
        <div style={{ marginBottom: '15px' }}>
          <label htmlFor="currency-select" style={{ marginRight: '10px', fontWeight: 'bold' }}>Display in:</label>
          <select 
            id="currency-select" 
            value={selectedCurrency} 
            onChange={handleCurrencyChange}
            disabled={isLoading}
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd', fontSize: '14px' }}
          >
            {availableCurrencies.map(currency => (
              <option key={currency} value={currency}>{currency}</option>
            ))}
          </select>
        </div>

        {isLoading && <p style={{ fontSize: '16px', color: '#666' }}>Loading balance...</p>}
        {error && <p style={{ color: 'red', fontSize: '16px' }}>Error: {error}</p>}
        
        {balance !== null && !isLoading && (
          <div>
            {/* Total Balance */}
            <div style={{ marginBottom: '20px' }}>
              <p style={{
                fontSize: '32px', 
                fontWeight: 'bold', 
                color: balance.total_balance_in_target_currency < 0 ? '#d32f2f' : '#2e7d32',
                margin: '10px 0'
              }}>
                {balance.total_balance_in_target_currency !== undefined 
                  ? formatCurrencyAmount(balance.total_balance_in_target_currency, selectedCurrency)
                  : 'Balance data not available.'}
              </p>
              <p style={{ fontSize: '14px', color: '#666', margin: '5px 0' }}>
                Total balance converted to {selectedCurrency}
              </p>
            </div>

            {/* Currency Holdings Breakdown */}
            {balance.holdings_breakdown && balance.holdings_breakdown.length > 0 && (
              <div style={{ 
                marginTop: '20px', 
                padding: '15px', 
                backgroundColor: 'white', 
                borderRadius: '6px', 
                border: '1px solid #e0e0e0' 
              }}>
                <h3 style={{ margin: '0 0 15px 0', color: '#333', fontSize: '18px' }}>Your Holdings by Currency</h3>
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
                  gap: '15px' 
                }}>
                  {balance.holdings_breakdown.map((holding) => (
                    <div key={holding.currency} style={{
                      padding: '15px',
                      backgroundColor: holding.is_target_currency ? '#e8f5e8' : '#f5f5f5',
                      borderRadius: '6px',
                      border: holding.is_target_currency ? '2px solid #4caf50' : '1px solid #ddd',
                      textAlign: 'center'
                    }}>
                      <div style={{
                        fontSize: '24px',
                        fontWeight: 'bold',
                        color: holding.holding_amount < 0 ? '#d32f2f' : '#2e7d32',
                        marginBottom: '5px'
                      }}>
                        {formatCurrencyAmount(holding.holding_amount, holding.currency)}
                      </div>
                      <div style={{
                        fontSize: '14px',
                        color: '#666',
                        marginBottom: '8px'
                      }}>
                        {holding.currency} Account
                        {holding.is_target_currency && ' (Display Currency)'}
                      </div>
                      <div style={{
                        fontSize: '12px',
                        color: '#888'
                      }}>
                        {holding.transaction_count} transaction{holding.transaction_count !== 1 ? 's' : ''}
                      </div>
                      {!holding.is_target_currency && (
                        <div style={{
                          fontSize: '12px',
                          color: '#666',
                          marginTop: '5px',
                          fontStyle: 'italic'
                        }}>
                          ≈ {formatCurrencyAmount(holding.converted_amount, selectedCurrency)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Additional Info */}
            <div style={{ marginTop: '15px', fontSize: '12px', color: '#666' }}>
              {balance.warning && <p style={{ color: '#f57c00', marginBottom: '5px' }}>⚠️ {balance.warning}</p>}
              <p style={{ margin: '0' }}>
                Based on {balance.converted_transactions_count} out of {balance.total_transactions_count} transactions.
                {balance.unconverted_transactions_count > 0 && 
                 ` ${balance.unconverted_transactions_count} transaction(s) could not be converted to ${selectedCurrency}.`}
              </p>
              {balance.account_count && (
                <p style={{ margin: '5px 0 0 0' }}>
                  Holdings across {balance.account_count} account currenc{balance.account_count !== 1 ? 'ies' : 'y'}.
                </p>
              )}
            </div>
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