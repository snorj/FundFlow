import React, { useState, useEffect } from 'react';
import './Dashboard.css';

// Placeholder for actual API data fetching
const fetchDashboardData = () => {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({
        accountSummary: [
          { id: 1, name: 'Checking', balance: 2543.87, type: 'bank' },
          { id: 2, name: 'Savings', balance: 12750.52, type: 'bank' },
          { id: 3, name: 'Credit Card', balance: -430.21, type: 'credit' },
        ],
        recentTransactions: [
          { id: 101, date: '2025-03-28', description: 'Grocery Store', amount: -85.45, category: 'Groceries' },
          { id: 102, date: '2025-03-27', description: 'Salary Deposit', amount: 3200.00, category: 'Income' },
          { id: 103, date: '2025-03-26', description: 'Electric Bill', amount: -142.33, category: 'Utilities' },
          { id: 104, date: '2025-03-24', description: 'Restaurant', amount: -56.22, category: 'Dining' },
          { id: 105, date: '2025-03-22', description: 'Gas Station', amount: -48.15, category: 'Transportation' },
        ],
        spendingByCategory: [
          { category: 'Housing', amount: 1250.00 },
          { category: 'Food', amount: 650.75 },
          { category: 'Transportation', amount: 325.45 },
          { category: 'Utilities', amount: 280.33 },
          { category: 'Entertainment', amount: 225.50 },
          { category: 'Healthcare', amount: 175.20 },
          { category: 'Shopping', amount: 320.10 },
        ]
      });
    }, 1000);
  });
};

// Dashboard Component
const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setIsLoading(true);
        const data = await fetchDashboardData();
        setDashboardData(data);
        setIsLoading(false);
      } catch (err) {
        setError('Failed to load dashboard data. Please try again later.');
        setIsLoading(false);
      }
    };

    loadDashboardData();
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

  // Calculate total balance
  const calculateTotalBalance = (accounts) => {
    return accounts.reduce((total, account) => total + account.balance, 0);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"></div>
        <p>Loading your financial overview...</p>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="dashboard-error">
        <h2>Oops!</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Try Again</button>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <h1 className="dashboard-title">Financial Overview</h1>

      {/* Connect Account Button */}
      <div className="connect-account-section">
        <button className="connect-account-btn">
          <span className="connect-icon">+</span>
          Connect a New Account
        </button>
      </div>

      {/* Account Summary Section */}
      <section className="dashboard-section">
        <h2 className="section-title">Account Summary</h2>
        <div className="account-summary">
          <div className="account-total">
            <h3>Total Balance</h3>
            <p className={`total-amount ${calculateTotalBalance(dashboardData.accountSummary) >= 0 ? 'positive' : 'negative'}`}>
              {formatCurrency(calculateTotalBalance(dashboardData.accountSummary))}
            </p>
          </div>
          <div className="accounts-list">
            {dashboardData.accountSummary.map((account) => (
              <div key={account.id} className="account-card">
                <div className="account-icon">
                  {account.type === 'bank' ? '$' : 'CC'}
                </div>
                <div className="account-details">
                  <h4>{account.name}</h4>
                  <p className={`account-balance ${account.balance >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(account.balance)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Recent Transactions Section */}
      <section className="dashboard-section">
        <div className="section-header">
          <h2 className="section-title">Recent Transactions</h2>
          <a href="/transactions" className="view-all-link">View All</a>
        </div>
        <div className="transactions-list">
          {dashboardData.recentTransactions.map((transaction) => (
            <div key={transaction.id} className="transaction-item">
              <div className="transaction-date">
                {formatDate(transaction.date)}
              </div>
              <div className="transaction-details">
                <h4>{transaction.description}</h4>
                <p className="transaction-category">{transaction.category}</p>
              </div>
              <div className={`transaction-amount ${transaction.amount >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(transaction.amount)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Spending by Category Section */}
      <section className="dashboard-section">
        <h2 className="section-title">Spending by Category</h2>
        <div className="spending-categories">
          {dashboardData.spendingByCategory.map((item, index) => (
            <div key={index} className="category-item">
              <div className="category-details">
                <h4>{item.category}</h4>
                <p>{formatCurrency(item.amount)}</p>
              </div>
              <div className="category-bar-container">
                <div 
                  className="category-bar" 
                  style={{ 
                    width: `${(item.amount / Math.max(...dashboardData.spendingByCategory.map(c => c.amount))) * 100}%` 
                  }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default Dashboard;