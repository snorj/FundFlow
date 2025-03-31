import React, { useState, useCallback, useEffect, useRef } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import plaidService from '../../services/plaid';
import './PlaidLink.css';

// Create a global script loader flag
let plaidScriptLoaded = false;

const PlaidLinkButton = ({ onSuccess, onExit, linkToken }) => {
  const config = {
    token: linkToken,
    onSuccess: (public_token, metadata) => {
      console.log('Link success:', metadata);
      onSuccess(public_token, metadata);
    },
    onExit: (err, metadata) => {
      console.log('Link exit:', err, metadata);
      if (onExit) onExit(err, metadata);
    },
  };

  const { open, ready } = usePlaidLink(config);

  return (
    <button 
      onClick={() => open()} 
      disabled={!ready} 
      className="plaid-link-button"
    >
      Connect a bank account
    </button>
  );
};

const PlaidLink = ({ onAccountConnected, className }) => {
  const [linkToken, setLinkToken] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const scriptLoadedInThisInstance = useRef(false);

  // Get a link token when the component mounts
  useEffect(() => {
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

    // Only load the Plaid script once across all instances
    if (!plaidScriptLoaded) {
      plaidScriptLoaded = true;
      scriptLoadedInThisInstance.current = true;
    }

    getLinkToken();

    // Cleanup
    return () => {
      // Only remove the script if this instance loaded it and component is unmounting
      if (scriptLoadedInThisInstance.current) {
        // Reset the flag if this component loaded the script and is being unmounted
        // This allows the script to be loaded again if needed
        plaidScriptLoaded = false;
      }
    };
  }, []);

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
      
      // Notify the parent component
      if (onAccountConnected) {
        onAccountConnected(exchangeResponse);
      }
    } catch (err) {
      console.error('Error exchanging token:', err);
      setError('Failed to complete bank connection. Please try again later.');
    } finally {
      setIsLoading(false);
    }
  }, [onAccountConnected]);

  // Handle Plaid Link exit
  const handleExit = useCallback((err, metadata) => {
    if (err != null) {
      console.error('Link error:', err, metadata);
      setError('There was a problem connecting to your bank. Please try again.');
    }
  }, []);

  return (
    <div className={`plaid-link-container ${className || ''}`}>
      {error && <div className="plaid-link-error">{error}</div>}
      
      {isLoading ? (
        <div className="plaid-link-loading">
          <div className="spinner"></div>
          <span>Connecting to your bank...</span>
        </div>
      ) : (
        linkToken && <PlaidLinkButton 
          linkToken={linkToken} 
          onSuccess={handleSuccess} 
          onExit={handleExit} 
        />
      )}
    </div>
  );
};

export default PlaidLink;