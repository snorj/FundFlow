import React, { useEffect, useId } from 'react';
import { usePlaidLink } from '../../utils/PlaidLinkContext';
import ScriptManager from '../../utils/ScriptManager';
import './PlaidLink.css';

// Global variable for Plaid Link instance
let plaidLinkInstance = null;

// Script configuration
const PLAID_SCRIPT = {
  id: 'plaid-link-script',
  src: 'https://cdn.plaid.com/link/v2/stable/link-initialize.js'
};

const PlaidLink = ({ onAccountConnected, className }) => {
  const { 
    linkToken,
    isLoading, 
    error,
    registerCallback,
    handleSuccess,
    handleExit
  } = usePlaidLink();
  
  // Generate a unique ID for this component instance
  const id = useId();
  
  // Register callback on mount
  useEffect(() => {
    return registerCallback(id, onAccountConnected);
  }, [id, onAccountConnected, registerCallback]);
  
  // Function to open Plaid Link
  const openPlaidLink = async () => {
    // Load script if needed
    if (!ScriptManager.isScriptLoaded(PLAID_SCRIPT.id)) {
      try {
        await ScriptManager.loadScript(PLAID_SCRIPT.src, PLAID_SCRIPT.id);
      } catch (error) {
        console.error('Failed to load Plaid script:', error);
        return;
      }
    }
    
    // Check if window.Plaid is available
    if (!window.Plaid) {
      console.error('Plaid is not available');
      return;
    }
    
    // Only initialize if we have a link token
    if (!linkToken) {
      console.error('Cannot open Plaid Link: missing token');
      return;
    }
    
    try {
      // Destroy existing instance if any
      if (plaidLinkInstance) {
        try {
          plaidLinkInstance.destroy();
        } catch (e) {
          console.error('Error destroying Plaid Link:', e);
        }
        plaidLinkInstance = null;
      }
      
      // Create new instance
      plaidLinkInstance = window.Plaid.create({
        token: linkToken,
        onSuccess: (public_token, metadata) => {
          handleSuccess(public_token, metadata);
        },
        onExit: (err, metadata) => {
          handleExit(err, metadata);
        },
        onLoad: () => {
          console.log('Plaid Link loaded');
        },
        onEvent: (eventName, metadata) => {
          console.log('Plaid Link event:', eventName, metadata);
        }
      });
      
      // Open Plaid Link
      plaidLinkInstance.open();
    } catch (err) {
      console.error('Error creating Plaid Link:', err);
    }
  };

  return (
    <div className={`plaid-link-container ${className || ''}`}>
      {error && <div className="plaid-link-error">{error}</div>}
      
      {isLoading ? (
        <div className="plaid-link-loading">
          <div className="spinner"></div>
          <span>Connecting to your bank...</span>
        </div>
      ) : (
        <button 
          onClick={openPlaidLink} 
          className="plaid-link-button"
        >
          Connect a bank account
        </button>
      )}
    </div>
  );
};

export default PlaidLink;