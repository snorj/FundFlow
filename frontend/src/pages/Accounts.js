import React, { useState, useEffect, useCallback } from 'react';
import MainLayout from '../components/layout/MainLayout';
import PlaidLink from '../components/plaid/PlaidLink';
import ConnectedAccounts from '../components/plaid/ConnectedAccounts';
import plaidService from '../services/plaid';
import './Accounts.css';
import { stateResetManager } from '../utils/StateResetUtil'; // Add this import

const Accounts = () => {
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [accountLinkSuccess, setAccountLinkSuccess] = useState(null);

  // Function to reset component state
  const resetComponentState = useCallback(() => {
    setAccounts([]);
    setSelectedAccount(null);
    setIsLoading(false);
    setError(null);
    setAccountLinkSuccess(null);
  }, []);

  // Register with state reset manager
  useEffect(() => {
    const unregister = stateResetManager.addResetListener(resetComponentState);
    
    // Clean up when component unmounts
    return () => {
      unregister();
      resetComponentState();
    };
  }, [resetComponentState]);

  // Fetch accounts when the component mounts
  useEffect(() => {
    fetchAccounts();
    
    // Clean up when component unmounts
    return () => {
      setAccounts([]);
      setSelectedAccount(null);
    };
  }, []);

  const fetchAccounts = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await plaidService.getAccounts();
      setAccounts(data);
      
      // Select the first account by default if none is selected
      if (data.length > 0 && !selectedAccount) {
        setSelectedAccount(data[0]);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
      setError('Failed to load accounts. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccount]);

  // Handle a new account connection
  const handleAccountConnected = useCallback((response) => {
    setAccountLinkSuccess({
      message: `Successfully connected to ${response.institution_name}`,
      timestamp: new Date()
    });
    
    // Clear success message after 5 seconds
    setTimeout(() => {
      setAccountLinkSuccess(null);
    }, 5000);
    
    // Refresh accounts list
    fetchAccounts();
  }, [fetchAccounts]);

  // Format currency amount
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Get CSS class for account type
  const getAccountTypeClass = (type) => {
    switch (type) {
      case 'credit': return 'account-type-credit';
      case 'loan': return 'account-type-loan';
      case 'investment': return 'account-type-investment';
      case 'depository': 
      default: return 'account-type-depository';
    }
  };

  return (
    <MainLayout title="Accounts">
      <div className="accounts-page-container">
        <div className="accounts-header">
          <h1 className="accounts-title">Your Financial Accounts</h1>
          <PlaidLink 
            onAccountConnected={handleAccountConnected} 
            className="account-link-wrapper"
          />
        </div>
        
        {accountLinkSuccess && (
          <div className="account-link-success">
            <span>{accountLinkSuccess.message}</span>
          </div>
        )}
        
        <ConnectedAccounts onRefreshComplete={fetchAccounts} />
        
        {isLoading && accounts.length === 0 ? (
          <div className="accounts-loading">Loading your accounts...</div>
        ) : error ? (
          <div className="accounts-error">{error}</div>
        ) : accounts.length === 0 ? (
          <div className="accounts-empty">
            <p>You don't have any connected accounts yet.</p>
            <p>Click "Connect a bank account" to add your first account.</p>
          </div>
        ) : (
          <div className="accounts-content">
            <div className="accounts-sidebar">
              <h3 className="accounts-sidebar-title">Your Accounts</h3>
              <ul className="accounts-list">
                {accounts.map(account => (
                  <li 
                    key={account.id} 
                    className={`account-item ${selectedAccount && selectedAccount.id === account.id ? 'account-item-selected' : ''}`}
                    onClick={() => setSelectedAccount(account)}
                  >
                    <div className="account-item-content">
                      <div className="account-item-type">
                        <span className={`account-type-indicator ${getAccountTypeClass(account.account_type)}`}></span>
                      </div>
                      <div className="account-item-details">
                        <div className="account-item-name">{account.name}</div>
                        <div className="account-item-mask">
                          {account.mask ? `•••• ${account.mask}` : ''}
                        </div>
                      </div>
                      <div className="account-item-balance">
                        {account.available_balance !== null
                          ? formatCurrency(account.available_balance)
                          : formatCurrency(account.current_balance || 0)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="account-details">
              {selectedAccount ? (
                <>
                  <div className="account-details-header">
                    <h2 className="account-details-name">
                      {selectedAccount.name}
                      {selectedAccount.official_name && selectedAccount.official_name !== selectedAccount.name && (
                        <span className="account-details-official-name">
                          {selectedAccount.official_name}
                        </span>
                      )}
                    </h2>
                    <div className={`account-details-type ${getAccountTypeClass(selectedAccount.account_type)}`}>
                      {selectedAccount.account_type}
                      {selectedAccount.account_subtype && ` - ${selectedAccount.account_subtype}`}
                    </div>
                  </div>
                  
                  <div className="account-details-balances">
                    <div className="balance-item">
                      <div className="balance-label">Current Balance</div>
                      <div className="balance-value">
                        {formatCurrency(selectedAccount.current_balance || 0)}
                      </div>
                    </div>
                    
                    {selectedAccount.available_balance !== null && (
                      <div className="balance-item">
                        <div className="balance-label">Available Balance</div>
                        <div className="balance-value">
                          {formatCurrency(selectedAccount.available_balance)}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <div className="account-details-actions">
                    <button className="account-action-button">
                      View Transactions
                    </button>
                  </div>
                </>
              ) : (
                <div className="no-account-selected">
                  Select an account to view details
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
};

export default Accounts;