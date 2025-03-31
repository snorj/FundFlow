import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import AccountSummary from '../components/dashboard/AccountSummary';
import SpendingChart from '../components/dashboard/SpendingChart';
import TransactionList from '../components/dashboard/TransactionList';
import PlaidLink from '../components/plaid/PlaidLink';
import plaidService from '../services/plaid';
import './Dashboard.css';

const Dashboard = () => {
  console.log('Dashboard component rendering!'); // Add this to check if the component is rendering
  
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [accountLinkSuccess, setAccountLinkSuccess] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Fetch accounts
      const accountsData = await plaidService.getAccounts();
      setAccounts(accountsData);
      
      // Fetch recent transactions (last 30 days)
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      
      const transactionsData = await plaidService.getTransactions({
        start_date: thirtyDaysAgo.toISOString().split('T')[0],
        end_date: today.toISOString().split('T')[0],
      });
      
      setTransactions(transactionsData.results || []);
    } catch (err) {
      console.error('Error fetching dashboard data:', err);
      setError('Failed to load your financial data. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle successful account connection
  const handleAccountConnected = (response) => {
    setAccountLinkSuccess({
      message: `Successfully connected to ${response.institution_name}`,
      timestamp: new Date()
    });
    
    // Clear success message after 5 seconds
    setTimeout(() => {
      setAccountLinkSuccess(null);
    }, 5000);
    
    // Refresh data
    fetchData();
  };

  // Calculate total balances
  const calculateTotalBalance = () => {
    if (!accounts || accounts.length === 0) return 0;
    
    return accounts.reduce((total, account) => {
      // For deposit accounts, use available balance, or current balance if available balance is null
      if (account.account_type === 'depository') {
        return total + (account.available_balance !== null ? account.available_balance : account.current_balance || 0);
      }
      // For credit accounts, subtract the balance
      else if (account.account_type === 'credit') {
        return total - (account.current_balance || 0);
      }
      // For other types, just use current balance
      return total + (account.current_balance || 0);
    }, 0);
  };

  // Group transactions by category for chart
  const getCategoryData = () => {
    if (!transactions || transactions.length === 0) return [];
    
    const categories = {};
    
    transactions.forEach(transaction => {
      // Skip pending transactions and income (negative amounts in Plaid)
      if (transaction.pending || transaction.amount <= 0) return;
      
      const category = transaction.category_string || 'Uncategorized';
      
      if (!categories[category]) {
        categories[category] = 0;
      }
      
      categories[category] += transaction.amount;
    });
    
    // Convert to array and sort by amount
    return Object.entries(categories)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
  };

  return (
    <div className="dashboard-container">
      {isLoading ? (
        <div className="dashboard-loading">
          <div className="spinner-large"></div>
          <p>Loading your financial dashboard...</p>
        </div>
      ) : error ? (
        <div className="dashboard-error">
          <p>{error}</p>
          <button onClick={fetchData} className="retry-button">Try Again</button>
        </div>
      ) : (
        <>
          {accountLinkSuccess && (
            <div className="account-link-success">
              <span>{accountLinkSuccess.message}</span>
            </div>
          )}
          
          {accounts.length === 0 ? (
            <div className="no-accounts-container">
              <h2>Welcome to Fund Flow!</h2>
              <p>To get started, connect your bank accounts using Plaid's secure connection.</p>
              <div className="plaid-link-container-centered">
                <PlaidLink onAccountConnected={handleAccountConnected} />
              </div>
              <p className="plaid-security-note">
                <strong>Your security is our priority:</strong> Fund Flow uses Plaid's secure API to connect to your financial institutions. Your credentials are never stored on our servers.
              </p>
            </div>
          ) : (
            <>
              <div className="dashboard-header">
                <div className="welcome-section">
                  <h1 className="dashboard-title">Your Financial Overview</h1>
                  <p className="dashboard-subtitle">
                    Here's a snapshot of your finances as of {new Date().toLocaleDateString()}
                  </p>
                </div>
                <div className="dashboard-actions">
                  <PlaidLink 
                    onAccountConnected={handleAccountConnected} 
                    className="dashboard-plaid-link"
                  />
                </div>
              </div>
              
              <div className="dashboard-summary">
                <AccountSummary 
                  accounts={accounts}
                  totalBalance={calculateTotalBalance()}
                />
              </div>
              
              <div className="dashboard-content">
                <div className="dashboard-left">
                  <div className="dashboard-section">
                    <div className="section-header">
                      <h2 className="section-title">Recent Transactions</h2>
                      <Link to="/transactions" className="section-link">View All</Link>
                    </div>
                    <div className="section-content">
                      <TransactionList 
                        transactions={transactions.slice(0, 5)} 
                        isLoading={false}
                      />
                    </div>
                  </div>
                </div>
                
                <div className="dashboard-right">
                  <div className="dashboard-section">
                    <div className="section-header">
                      <h2 className="section-title">Spending by Category</h2>
                    </div>
                    <div className="section-content">
                      <SpendingChart data={getCategoryData()} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default Dashboard;