import React, { createContext, useState, useEffect, useCallback, useContext, useRef } from 'react';
import plaidService from '../services/plaid';
import { stateResetManager } from './StateResetUtil';

// Create the context
const PlaidLinkContext = createContext(null);

// Provider component
export const PlaidLinkProvider = ({ children }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [accountLinkSuccess, setAccountLinkSuccess] = useState(null);
  
  // Use refs to store callbacks to avoid re-renders
  const callbacksRef = useRef({});
  
  // Function to reset all state in this context
  const resetState = useCallback(() => {
    console.log('Resetting PlaidLinkContext state');
    setLinkToken(null);
    setIsLoading(false);
    setError(null);
    setAccountLinkSuccess(null);
    callbacksRef.current = {};
    
    // Get a fresh link token after reset
    getLinkToken();
  }, []);
  
  // Register with the state reset manager
  useEffect(() => {
    const unregister = stateResetManager.addResetListener(resetState);
    return unregister;
  }, [resetState]);
  
  // Get a link token when the provider mounts
  useEffect(() => {
    console.log("PlaidLinkProvider mounted");
    getLinkToken();
  }, []);

  // Function to get a new link token
  const getLinkToken = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await plaidService.getLinkToken();
      setLinkToken(response.link_token);
    } catch (err) {
      console.error('Error getting link token:', err);
      setError('Failed to initialize bank connection. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  };

  // Register a callback to be executed on success
  // This doesn't update state to avoid re-renders
  const registerCallback = useCallback((id, callback) => {
    callbacksRef.current[id] = callback;
    
    return () => {
      delete callbacksRef.current[id];
    };
  }, []);

  // Function to open Plaid Link - this will be manually implemented in PlaidLink.js
  const openPlaidLink = useCallback(() => {
    if (!window.Plaid) {
      console.error('Plaid not available');
      return;
    }
    
    // We will initialize Plaid here when needed
    try {
      if (!linkToken) {
        console.error('No link token available');
        return;
      }
      
      console.log('Initializing Plaid Link with token:', linkToken);
      
      // We will handle this in the PlaidLink component
      return linkToken;
    } catch (err) {
      console.error('Error opening Plaid Link:', err);
      setError('Failed to open bank connection. Please try again later.');
    }
  }, [linkToken]);

  // Handle successful Plaid Link connection
  const handleSuccess = useCallback(async (public_token, metadata) => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Exchange the public token for an access token
      const exchangeResponse = await plaidService.exchangePublicToken(
        public_token,
        metadata.institution.institution_id,
        metadata.institution.name
      );
      
      console.log('Exchange success:', exchangeResponse);
      
      // Set success message
      setAccountLinkSuccess({
        message: `Successfully connected to ${exchangeResponse.institution_name}`,
        timestamp: new Date()
      });
      
      // Clear success message after 5 seconds
      setTimeout(() => {
        setAccountLinkSuccess(null);
      }, 5000);
      
      // Execute all registered callbacks
      Object.values(callbacksRef.current).forEach(callback => {
        if (typeof callback === 'function') {
          callback(exchangeResponse);
        }
      });
      
      // Get a new link token for future connections
      getLinkToken();
    } catch (err) {
      console.error('Error exchanging token:', err);
      setError('Failed to complete bank connection. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle Plaid Link exit
  const handleExit = useCallback((err, metadata) => {
    if (err != null) {
      console.error('Link error:', err, metadata);
      setError('There was a problem connecting to your bank. Please try again.');
    }
  }, []);

  // Add resetState to context value
  const contextValue = {
    linkToken,
    isLoading,
    error,
    accountLinkSuccess,
    handleSuccess,
    handleExit,
    registerCallback,
    openPlaidLink,
    refreshLinkToken: getLinkToken,
    resetState, // Add reset function to context
  };

  return (
    <PlaidLinkContext.Provider value={contextValue}>
      {children}
    </PlaidLinkContext.Provider>
  );
};

// Custom hook to use the Plaid Link context
export const usePlaidLink = () => {
  const context = useContext(PlaidLinkContext);
  if (!context) {
    throw new Error('usePlaidLink must be used within a PlaidLinkProvider');
  }
  return context;
};