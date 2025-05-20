import React, { useState, useEffect, useCallback } from 'react';
import dashboardService from '../services/dashboardService'; // Changed to default import

const NewDashboardPage = () => {
  const [balance, setBalance] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState('AUD'); // Default to AUD

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
            <p style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {balance.total_balance_in_target_currency !== undefined 
                ? `${parseFloat(balance.total_balance_in_target_currency).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${selectedCurrency}` 
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

      <p>This page will eventually display an overview of all transactions and balances.</p>
      {/* Placeholder content for transactions list will go here */}
    </div>
  );
};

export default NewDashboardPage; 