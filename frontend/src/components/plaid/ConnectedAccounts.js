import React, { useState, useEffect } from 'react';
import plaidService from '../../services/plaid';
import './ConnectedAccounts.css';
import { stateResetManager } from '../../utils/StateResetUtil'; // Add this import

const ConnectedAccounts = ({ onRefreshComplete }) => {
  const [plaidItems, setPlaidItems] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshStatus, setRefreshStatus] = useState({});

  // Reset function to clear component state
  const resetComponentState = () => {
    setPlaidItems([]);
    setIsLoading(false);
    setError(null);
    setRefreshStatus({});
  };

  // Register reset handler with the state reset manager
  useEffect(() => {
    // Register this component for global state resets
    const unregister = stateResetManager.addResetListener(resetComponentState);
    
    // Return cleanup function
    return () => {
      unregister(); // Remove the listener when component unmounts
      resetComponentState(); // Also reset state on unmount
    };
  }, []);

  // Fetch connected institutions when the component mounts
  useEffect(() => {
    fetchPlaidItems();
    
    // Clean up when component unmounts
    return () => {
      setPlaidItems([]);
    };
  }, []);

  const fetchPlaidItems = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const items = await plaidService.getPlaidItems();
      setPlaidItems(items);
    } catch (err) {
      console.error('Error fetching Plaid items:', err);
      setError('Failed to load connected banks. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshTransactions = async (itemId) => {
    try {
      setRefreshStatus({
        ...refreshStatus,
        [itemId]: { loading: true, error: null }
      });
      
      const response = await plaidService.fetchTransactions(itemId);
      
      setRefreshStatus({
        ...refreshStatus,
        [itemId]: { 
          loading: false, 
          success: true,
          message: `Successfully refreshed: ${response.transactions_count} transactions`
        }
      });
      
      // Clear success message after 3 seconds
      setTimeout(() => {
        setRefreshStatus(prev => ({
          ...prev,
          [itemId]: { ...prev[itemId], success: false }
        }));
      }, 3000);
      
      // Notify parent component that data has been refreshed
      if (onRefreshComplete) {
        onRefreshComplete();
      }
    } catch (err) {
      console.error('Error refreshing transactions:', err);
      setRefreshStatus({
        ...refreshStatus,
        [itemId]: { 
          loading: false, 
          error: 'Failed to refresh transactions' 
        }
      });
    }
  };

  if (isLoading && plaidItems.length === 0) {
    return <div className="connected-accounts-loading">Loading connected accounts...</div>;
  }

  if (error) {
    return <div className="connected-accounts-error">{error}</div>;
  }

  if (plaidItems.length === 0) {
    return <div className="connected-accounts-empty">No connected accounts yet</div>;
  }

  return (
    <div className="connected-accounts-container">
      <h3 className="connected-accounts-title">Connected Financial Institutions</h3>
      
      <div className="connected-accounts-list">
        {plaidItems.map(item => (
          <div key={item.id} className="connected-account-item">
            <div className="connected-account-details">
              <div className="connected-account-name">
                {item.institution_name || 'Unknown Institution'}
              </div>
              <div className="connected-account-date">
                Connected on {new Date(item.created_at).toLocaleDateString()}
              </div>
            </div>
            
            <div className="connected-account-actions">
              {refreshStatus[item.id]?.loading ? (
                <div className="refresh-loading-indicator">
                  <div className="spinner-sm"></div>
                </div>
              ) : (
                <button 
                  onClick={() => handleRefreshTransactions(item.id)}
                  className="refresh-button"
                >
                  Refresh
                </button>
              )}
            </div>
            
            {refreshStatus[item.id]?.error && (
              <div className="refresh-error">
                {refreshStatus[item.id].error}
              </div>
            )}
            
            {refreshStatus[item.id]?.success && (
              <div className="refresh-success">
                {refreshStatus[item.id].message}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConnectedAccounts;