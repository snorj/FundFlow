import React, { useState, useEffect } from 'react';
import './Transactions.css';

// Placeholder for API data fetching
const fetchTransactions = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        transactions: [
          { id: 101, date: '2025-03-28', description: 'Grocery Store', amount: -85.45, category: 'Groceries', account: 'Checking' },
          { id: 102, date: '2025-03-27', description: 'Salary Deposit', amount: 3200.00, category: 'Income', account: 'Checking' },
          { id: 103, date: '2025-03-26', description: 'Electric Bill', amount: -142.33, category: 'Utilities', account: 'Checking' },
          { id: 104, date: '2025-03-24', description: 'Restaurant', amount: -56.22, category: 'Dining', account: 'Credit Card' },
          { id: 105, date: '2025-03-22', description: 'Gas Station', amount: -48.15, category: 'Transportation', account: 'Credit Card' },
          { id: 106, date: '2025-03-20', description: 'Online Shopping', amount: -95.99, category: 'Shopping', account: 'Credit Card' },
          { id: 107, date: '2025-03-18', description: 'Internet Bill', amount: -79.99, category: 'Utilities', account: 'Checking' },
          { id: 108, date: '2025-03-15', description: 'ATM Withdrawal', amount: -100.00, category: 'Cash', account: 'Checking' },
          { id: 109, date: '2025-03-15', description: 'Interest Payment', amount: 5.23, category: 'Income', account: 'Savings' },
          { id: 110, date: '2025-03-12', description: 'Subscription Service', amount: -14.99, category: 'Entertainment', account: 'Credit Card' },
        ],
        categories: [
          'All Categories', 'Income', 'Groceries', 'Dining', 'Utilities', 
          'Transportation', 'Shopping', 'Entertainment', 'Cash'
        ],
        accounts: ['All Accounts', 'Checking', 'Savings', 'Credit Card']
      });
    }, 800);
  });
};

const Transactions = () => {
  const [transactionsData, setTransactionsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    category: 'All Categories',
    account: 'All Accounts',
    searchTerm: '',
    dateRange: 'last30'
  });
  
  useEffect(() => {
    const loadTransactions = async () => {
      try {
        setIsLoading(true);
        const data = await fetchTransactions();
        setTransactionsData(data);
        setIsLoading(false);
      } catch (err) {
        setError('Failed to load transactions. Please try again later.');
        setIsLoading(false);
      }
    };

    loadTransactions();
  }, []);

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Format date
  const formatDate = (dateString) => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  // Handle filter changes
  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters({
      ...filters,
      [name]: value
    });
  };

  // Filter transactions
  const filteredTransactions = transactionsData?.transactions.filter(transaction => {
    // Filter by category
    if (filters.category !== 'All Categories' && transaction.category !== filters.category) {
      return false;
    }
    
    // Filter by account
    if (filters.account !== 'All Accounts' && transaction.account !== filters.account) {
      return false;
    }
    
    // Filter by search term
    if (filters.searchTerm && !transaction.description.toLowerCase().includes(filters.searchTerm.toLowerCase())) {
      return false;
    }
    
    // Simple date range filter (in a real app, you'd implement proper date filtering)
    if (filters.dateRange === 'last7') {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      return new Date(transaction.date) >= sevenDaysAgo;
    }
    
    return true;
  });

  // Loading state
  if (isLoading) {
    return (
      <div className="transactions-loading">
        <div className="loading-spinner"></div>
        <p>Loading transactions...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="transactions-error">
        <h2>Oops!</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Try Again</button>
      </div>
    );
  }

  return (
    <div className="transactions-page">
      <h1 className="page-title">Transactions</h1>
      
      {/* Filters */}
      <div className="transactions-filters">
        <div className="filter-group">
          <label htmlFor="dateRange">Date Range</label>
          <select 
            id="dateRange" 
            name="dateRange" 
            value={filters.dateRange}
            onChange={handleFilterChange}
          >
            <option value="last30">Last 30 days</option>
            <option value="last7">Last 7 days</option>
            <option value="all">All time</option>
          </select>
        </div>
        
        <div className="filter-group">
          <label htmlFor="category">Category</label>
          <select 
            id="category" 
            name="category" 
            value={filters.category}
            onChange={handleFilterChange}
          >
            {transactionsData.categories.map((category, index) => (
              <option key={index} value={category}>{category}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group">
          <label htmlFor="account">Account</label>
          <select 
            id="account" 
            name="account" 
            value={filters.account}
            onChange={handleFilterChange}
          >
            {transactionsData.accounts.map((account, index) => (
              <option key={index} value={account}>{account}</option>
            ))}
          </select>
        </div>
        
        <div className="filter-group search">
          <label htmlFor="searchTerm">Search</label>
          <input
            type="text"
            id="searchTerm"
            name="searchTerm"
            value={filters.searchTerm}
            onChange={handleFilterChange}
            placeholder="Search transactions..."
          />
        </div>
      </div>
      
      {/* Transactions table */}
      <div className="transactions-table-container">
        <table className="transactions-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Description</th>
              <th>Category</th>
              <th>Account</th>
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {filteredTransactions && filteredTransactions.length > 0 ? (
              filteredTransactions.map(transaction => (
                <tr key={transaction.id}>
                  <td>{formatDate(transaction.date)}</td>
                  <td>{transaction.description}</td>
                  <td>
                    <span className="category-tag">{transaction.category}</span>
                  </td>
                  <td>{transaction.account}</td>
                  <td className={`amount ${transaction.amount >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(transaction.amount)}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="no-transactions">
                  No transactions found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Transactions;