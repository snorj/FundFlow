import React, { useState, useEffect, useCallback } from 'react';
import dashboardService from '../services/dashboardService'; // Changed to default import
import transactionService from '../services/transactions'; // Corrected import path
import EditTransactionModal from '../components/transactions/EditTransactionModal'; // Import the modal
import TransactionSearchBar from '../components/dashboard/TransactionSearchBar';

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

// Helper function to group transactions by year and month
const groupTransactionsByPeriod = (transactions) => {
  const groups = {};
  
  transactions.forEach(tx => {
    const date = new Date(tx.transaction_date);
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    const key = `${year}-${month}`;
    
    if (!groups[key]) {
      groups[key] = {
        year,
        month,
        monthName: date.toLocaleString('default', { month: 'long' }),
        transactions: [],
        totalAmount: 0,
        totalDebit: 0,
        totalCredit: 0,
        count: 0
      };
    }
    
    groups[key].transactions.push(tx);
    groups[key].count++;
    
    // Calculate totals for summary
    const amount = parseFloat(tx.original_amount) || 0;
    if (tx.direction === 'DEBIT') {
      groups[key].totalDebit += amount;
    } else {
      groups[key].totalCredit += amount;
    }
    groups[key].totalAmount = groups[key].totalCredit - groups[key].totalDebit;
  });
  
  // Sort groups by year and month (newest first)
  const sortedGroups = Object.values(groups).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
  
  // Sort transactions within each group by date (newest first)
  sortedGroups.forEach(group => {
    group.transactions.sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
  });
  
  return sortedGroups;
};

const NewDashboardPage = () => {
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState('AUD'); // Default to AUD

  const [transactions, setTransactions] = useState([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsError, setTransactionsError] = useState(null);
  // Removed pagination state since we now fetch all transactions in a scrollable container

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);

  // Search state
  const [searchParams, setSearchParams] = useState(null);
  const [totalResultsCount, setTotalResultsCount] = useState(0);

  // New state for group collapse/expand
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

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

  const fetchTransactionsData = useCallback(async (page, search = null) => {
    setTransactionsLoading(true);
    setTransactionsError(null);
    try {
      // Build query parameters - Always fetch all transactions for scrollable grouping
      const queryParams = {
        page: 1, // Always use page 1
        page_size: 10000, // Get all transactions (high limit)
      };

      // Add search parameters if provided
      if (search) {
        if (search.vendor) {
          queryParams.vendor__name__icontains = search.vendor;
        }
        if (search.category) {
          queryParams.category__name__icontains = search.category;
        }
        if (search.dateFrom) {
          queryParams.start_date = search.dateFrom;
        }
        if (search.dateTo) {
          queryParams.end_date = search.dateTo;
        }
      }

      console.log('📊 Dashboard: Fetching transactions with params:', queryParams);
      const response = await transactionService.getTransactions(queryParams);
      
      // Handle response - we're now fetching all transactions
      if (response && response.results) {
        // Paginated response from DRF
        setTransactions(response.results || []); 
        setTotalResultsCount(response.count || 0);
        console.log('📋 Dashboard: Loaded', response.results.length, 'transactions, total available:', response.count);
      } else if (Array.isArray(response)) {
        // Direct array response (non-paginated)
        setTransactions(response);
        setTotalResultsCount(response.length);
        console.log('📋 Dashboard: Loaded', response.length, 'transactions (non-paginated)');
      } else {
        // Unexpected response format
        console.warn('⚠️ Dashboard: Unexpected response format:', response);
        setTransactions([]);
        setTotalResultsCount(0);
      }

    } catch (err) {
      console.error('❌ Dashboard: Failed to fetch transactions:', err);
      setTransactionsError(err.message || 'Failed to fetch transactions. Please try again.');
      setTransactions([]);
      setTotalResultsCount(0);
    } finally {
      setTransactionsLoading(false);
    }
  }, []);

  // Initial load (no pagination needed since we fetch all transactions)
  useEffect(() => {
    if (!searchParams) {
      fetchTransactionsData(1, null);
    }
  }, [fetchTransactionsData, searchParams]);

  // Handle search
  const handleSearch = useCallback((newSearchParams) => {
    console.log('🔍 Dashboard: Search params:', newSearchParams);
    setSearchParams(newSearchParams);
    // Immediately fetch search results
    fetchTransactionsData(1, newSearchParams);
  }, [fetchTransactionsData]);

  // Handle clear search
  const handleClearSearch = useCallback(() => {
    console.log('🧹 Dashboard: Clearing search');
    setSearchParams(null);
    // Immediately fetch normal results
    fetchTransactionsData(1, null);
  }, [fetchTransactionsData]);

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
        fetchTransactionsData(1, searchParams); 
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
      fetchTransactionsData(1, searchParams); // Refresh transactions
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

  // Helper function to toggle group collapse/expand
  const toggleGroupCollapse = (groupKey) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
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
        <h2>{searchParams ? 'Search Results' : 'Recent Transactions'}</h2>
        
        {/* Search Bar */}
        <TransactionSearchBar 
          onSearch={handleSearch}
          onClear={handleClearSearch}
        />
        
        {/* Results Count */}
        {searchParams && (
          <div style={{ 
            marginBottom: '15px', 
            padding: '10px', 
            backgroundColor: '#e3f2fd', 
            borderRadius: '6px',
            fontSize: '14px',
            color: '#1565c0'
          }}>
            {transactionsLoading ? (
              'Searching...'
            ) : (
              <>
                <strong>Search Results:</strong> Found {totalResultsCount} transaction{totalResultsCount !== 1 ? 's' : ''} matching your search criteria
              </>
            )}
          </div>
        )}

        {transactionsLoading && <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>Loading transactions...</div>}
        {transactionsError && <div style={{ padding: '20px', color: '#d32f2f', backgroundColor: '#ffebee', borderRadius: '6px', marginBottom: '15px' }}>Error: {transactionsError}</div>}
        {!transactionsLoading && !transactionsError && transactions.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>No transactions found.</div>
        )}
        {!transactionsLoading && !transactionsError && transactions.length > 0 && (
          <div style={{ 
            border: '1px solid #e0e0e0', 
            borderRadius: '8px', 
            backgroundColor: 'white',
            maxHeight: '600px',
            overflowY: 'auto'
          }}>
            {groupTransactionsByPeriod(transactions).map(group => {
              const groupKey = `${group.year}-${group.month}`;
              const isCollapsed = collapsedGroups.has(groupKey);
              
              return (
                <div key={groupKey} style={{ borderBottom: '1px solid #f0f0f0' }}>
                  {/* Group Header */}
                  <div 
                    onClick={() => toggleGroupCollapse(groupKey)}
                    style={{
                      padding: '16px 20px',
                      backgroundColor: '#fafafa',
                      borderBottom: isCollapsed ? 'none' : '1px solid #e0e0e0',
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      userSelect: 'none',
                      ':hover': { backgroundColor: '#f5f5f5' }
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ 
                        fontSize: '18px',
                        transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)',
                        transition: 'transform 0.2s ease'
                      }}>
                        ▼
                      </span>
                      <div>
                        <div style={{ fontSize: '16px', fontWeight: '600', color: '#333' }}>
                          {group.monthName} {group.year}
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '2px' }}>
                          {group.count} transaction{group.count !== 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>
                    
                    {/* Summary when collapsed or always visible */}
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ 
                        fontSize: '16px', 
                        fontWeight: '600',
                        color: group.totalAmount >= 0 ? '#2e7d32' : '#d32f2f'
                      }}>
                        {group.totalAmount >= 0 ? '+' : ''}
                        {formatCurrencyAmount(Math.abs(group.totalAmount), selectedCurrency)}
                      </div>
                      {isCollapsed && (
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
                          In: {formatCurrencyAmount(group.totalCredit, selectedCurrency)} • 
                          Out: {formatCurrencyAmount(group.totalDebit, selectedCurrency)}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Group Content */}
                  {!isCollapsed && (
                    <div>
                      {group.transactions.map(tx => (
                        <div 
                          key={tx.id} 
                          style={{
                            padding: '12px 20px',
                            borderBottom: '1px solid #f5f5f5',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            ':hover': { backgroundColor: '#fafafa' }
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
                              <div style={{ fontSize: '14px', fontWeight: '500', color: '#333' }}>
                                {tx.description}
                              </div>
                              <div style={{ 
                                fontSize: '11px', 
                                color: '#666',
                                backgroundColor: '#f0f0f0',
                                padding: '2px 6px',
                                borderRadius: '3px'
                              }}>
                                {new Date(tx.transaction_date).toLocaleDateString()}
                              </div>
                            </div>
                            <div style={{ 
                              fontSize: '12px', 
                              color: '#666',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '8px'
                            }}>
                              <span>{tx.category ? tx.category.name : 'Uncategorised'}</span>
                            </div>
                          </div>
                          
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              fontSize: '14px',
                              fontWeight: '600',
                              color: tx.direction === 'DEBIT' ? '#d32f2f' : '#2e7d32',
                              minWidth: '80px',
                              textAlign: 'right'
                            }}>
                              {tx.original_amount && tx.original_currency ? 
                               `${tx.direction === 'DEBIT' ? '-' : '+'}${getCurrencySymbol(tx.original_currency)}${parseFloat(tx.original_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 
                               'N/A'}
                            </div>
                            
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button 
                                onClick={() => handleEditTransaction(tx.id)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  border: '1px solid #ddd',
                                  borderRadius: '4px',
                                  backgroundColor: 'white',
                                  color: '#666',
                                  cursor: 'pointer'
                                }}
                              >
                                Edit
                              </button>
                              <button 
                                onClick={() => handleDeleteTransaction(tx.id)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '11px',
                                  border: '1px solid #ffcdd2',
                                  borderRadius: '4px',
                                  backgroundColor: '#ffebee',
                                  color: '#d32f2f',
                                  cursor: 'pointer'
                                }}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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