// src/components/plaid/PlaidLink.js
import React, { useState, useEffect, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import plaidService from '../../services/plaid';

const PlaidLinkButton = ({ onSuccess, onExit }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchLinkToken = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await plaidService.createLinkToken();
      setLinkToken(response.link_token);
    } catch (err) {
      console.error('Error fetching link token:', err);
      setError('Failed to initialize Plaid Link. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLinkToken();
  }, [fetchLinkToken]);

  const onPlaidSuccess = useCallback(async (publicToken, metadata) => {
    try {
      // Exchange the publicToken for an accessToken
      const exchangeResponse = await plaidService.exchangePublicToken(publicToken);
      
      // Call the onSuccess callback with the result
      if (onSuccess) {
        onSuccess(exchangeResponse, metadata);
      }
    } catch (err) {
      console.error('Error exchanging public token:', err);
      setError('Failed to connect your account. Please try again.');
    }
  }, [onSuccess]);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess: (public_token, metadata) => onPlaidSuccess(public_token, metadata),
    onExit: (err, metadata) => {
      if (err) {
        console.error('Plaid Link error:', err);
      }
      if (onExit) {
        onExit(err, metadata);
      }
    },
  });

  return (
    <div className="plaid-link-container">
      {error && <div className="error-message">{error}</div>}
      <button 
        onClick={() => open()} 
        disabled={!ready || isLoading}
        className="plaid-link-button"
      >
        {isLoading ? 'Loading...' : 'Connect a Bank Account'}
      </button>
      
      {/* Retry button if there was an error */}
      {error && (
        <button 
          onClick={fetchLinkToken} 
          disabled={isLoading}
          className="plaid-link-retry"
        >
          Try Again
        </button>
      )}
    </div>
  );
};

export default PlaidLinkButton;