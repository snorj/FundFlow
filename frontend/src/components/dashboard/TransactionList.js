import React from 'react';
import './TransactionList.css';

const TransactionList = ({ transactions, isLoading }) => {
  // Format currency amount
  const formatCurrency = (amount, isExpense = true) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(isExpense ? amount : -amount);
  };

  // Format date to a more readable format
  const formatDate = (dateString) => {
    const options = { month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('en-US', options);
  };

  // Get icon for transaction based on category or name
  const getTransactionIcon = (transaction) => {
    const category = transaction.category_string?.toLowerCase() || '';
    const name = transaction.name?.toLowerCase() || '';
    
    if (category.includes('food') || category.includes('restaurant') || name.includes('restaurant')) {
      return '🍽️';
    } else if (category.includes('grocery') || name.includes('grocery') || name.includes('market')) {
      return '🛒';
    } else if (category.includes('transport') || category.includes('travel') || name.includes('uber') || name.includes('lyft')) {
      return '🚗';
    } else if (category.includes('shopping') || name.includes('amazon') || name.includes('walmart')) {
      return '🛍️';
    } else if (category.includes('entertainment') || name.includes('netflix') || name.includes('spotify')) {
      return '🎬';
    } else if (category.includes('health') || category.includes('medical') || name.includes('pharmacy')) {
      return '💊';
    } else if (category.includes('utility') || category.includes('bill') || name.includes('electric') || name.includes('water')) {
      return '📱';
    } else if (!transaction.is_expense) {
      return '💰'; // Income
    } else {
      return '💳'; // Default
    }
  };

  if (isLoading) {
    return (
      <div className="transaction-list-loading">
        <div className="spinner"></div>
        <p>Loading transactions...</p>
      </div>
    );
  }

  if (!transactions || transactions.length === 0) {
    return (
      <div className="no-transactions">
        <p>No transactions found for this period.</p>
      </div>
    );
  }

  return (
    <div className="transaction-list">
      {transactions.map((transaction) => (
        <div 
          key={transaction.id || transaction.transaction_id} 
          className={`transaction-item ${!transaction.is_expense ? 'income' : ''}`}
        >
          <div className="transaction-icon">
            {getTransactionIcon(transaction)}
          </div>
          
          <div className="transaction-details">
            <div className="transaction-name">{transaction.name}</div>
            <div className="transaction-meta">
              <span className="transaction-date">{formatDate(transaction.date)}</span>
              {transaction.category_string && (
                <span className="transaction-category">{transaction.category_string}</span>
              )}
            </div>
          </div>
          
          <div className={`transaction-amount ${!transaction.is_expense ? 'income-amount' : ''}`}>
            {formatCurrency(transaction.amount, transaction.is_expense)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TransactionList;