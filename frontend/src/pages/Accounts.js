import React, { useState, useEffect } from 'react';
import './Accounts.css';

// Placeholder for API data fetching
const fetchAccounts = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        accounts: [
          { 
            id: 1, 
            name: 'Primary Checking', 
            type: 'checking',
            accountNumber: 'xxxx1234',
            institution: 'Chase Bank',
            currentBalance: 2543.87,
            availableBalance: 2343.87,
            transactions: [
              { date: '2025-03-28', description: 'Grocery Store', amount: -85.45 },
              { date: '2025-03-27', description: 'Salary Deposit', amount: 3200.00 },
              { date: '2025-03-26', description: 'Electric Bill', amount: -142.33 }
            ]
          },
          { 
            id: 2, 
            name: 'Savings Account', 
            type: 'savings',
            accountNumber: 'xxxx5678',
            institution: 'Chase Bank',
            currentBalance: 12750.52,
            availableBalance: 12750.52,
            transactions: [
              { date: '2025-03-15', description: 'Interest Payment', amount: 5.23 },
              { date: '2025-03-10', description: 'Transfer from Checking', amount: 500.00 },
              { date: '2025-02-15', description: 'Interest Payment', amount: 4.95 }
            ]
          },
          { 
            id: 3, 
            name: 'Visa Credit Card', 
            type: 'credit',
            accountNumber: 'xxxx9012',
            institution: 'Capital One',
            currentBalance: -430.21,
            availableCredit: 4569.79,
            creditLimit: 5000.00,
            dueDate: '2025-04-15',
            minimumPayment: 25.00,
            transactions: [
              { date: '2025-03-24', description: 'Restaurant', amount: -56.22 },
              { date: '2025-03-22', description: 'Gas Station', amount: -48.15 },
              { date: '2025-03-20', description: 'Online Shopping', amount: -95.99 }
            ]
          }
        ]
      });
    }, 800);
  });
};

const Accounts = () => {
  const [accountsData, setAccountsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeAccount, setActiveAccount] = useState(null);
  
  useEffect(() => {
    const loadAccounts = async () => {
      try {
        setIsLoading(true);
        const data = await fetchAccounts();
        setAccountsData(data);
        setActiveAccount(data.accounts[0].id);
        setIsLoading(false);
      } catch (err) {
        setError('Failed to load account data. Please try again later.');
        setIsLoading(false);
      }
    };

    loadAccounts();
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
    const options = { month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  // Handle account selection
  const handleAccountSelect = (accountId) => {
    setActiveAccount(accountId);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="accounts-loading">
        <div className="loading-spinner"></div>
        <p>Loading your accounts...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="accounts-error">
        <h2>Oops!</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Try Again</button>
      </div>
    );
  }

  // Get the selected account
  const selectedAccount = accountsData.accounts.find(account => account.id === activeAccount);

  return (
    <div className="accounts-page">
      <h1 className="page-title">Your Accounts</h1>

      {/* Connect Account Button */}
      <div className="connect-account-section">
        <button className="connect-account-btn">
          <span className="connect-icon">+</span>
          Connect a New Account
        </button>
      </div>
      
      <div className="accounts-content">
        {/* Accounts Sidebar */}
        <div className="accounts-sidebar">
          <h2 className="sidebar-title">Your Accounts</h2>
          <ul className="accounts-list">
            {accountsData.accounts.map(account => (
              <li 
                key={account.id} 
                className={activeAccount === account.id ? 'active' : ''}
                onClick={() => handleAccountSelect(account.id)}
              >
                <div className="account-icon">
                  {account.type === 'checking' ? 'C' : 
                   account.type === 'savings' ? 'S' : 'CC'}
                </div>
                <div className="sidebar-account-info">
                  <h3>{account.name}</h3>
                  <p>{account.institution}</p>
                  <p className={`balance ${account.currentBalance >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(account.currentBalance)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
        
        {/* Account Details */}
        <div className="account-details">
          <div className="account-header">
            <h2>{selectedAccount.name}</h2>
            <p className="institution">{selectedAccount.institution}</p>
            <p className="account-number">Account: {selectedAccount.accountNumber}</p>
          </div>
          
          <div className="account-balance-cards">
            <div className="balance-card">
              <h3>Current Balance</h3>
              <p className={`amount ${selectedAccount.currentBalance >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(selectedAccount.currentBalance)}
              </p>
            </div>
            
            {selectedAccount.type === 'credit' ? (
              <>
                <div className="balance-card">
                  <h3>Available Credit</h3>
                  <p className="amount">{formatCurrency(selectedAccount.availableCredit)}</p>
                </div>
                <div className="balance-card">
                  <h3>Payment Due</h3>
                  <div>
                    <p className="amount negative">{formatCurrency(selectedAccount.minimumPayment)}</p>
                    <p className="due-date">Due on {selectedAccount.dueDate}</p>
                  </div>
                </div>
              </>
            ) : (
              <div className="balance-card">
                <h3>Available Balance</h3>
                <p className="amount">{formatCurrency(selectedAccount.availableBalance)}</p>
              </div>
            )}
          </div>
          
          <div className="account-transactions">
            <h3>Recent Transactions</h3>
            <div className="transactions-list">
              {selectedAccount.transactions.map((transaction, index) => (
                <div key={index} className="transaction-item">
                  <div className="transaction-date">
                    {formatDate(transaction.date)}
                  </div>
                  <div className="transaction-description">
                    {transaction.description}
                  </div>
                  <div className={`transaction-amount ${transaction.amount >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(transaction.amount)}
                  </div>
                </div>
              ))}
            </div>
            <div className="view-all">
              <a href="/transactions">View All Transactions</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Accounts;