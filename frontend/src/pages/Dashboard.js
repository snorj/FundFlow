// frontend/src/pages/Dashboard.js
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';
// Add/update icons
import { FiUpload, FiLink, FiLoader, FiCheckCircle, FiAlertCircle, FiInbox, FiEdit, FiTrash2, FiRefreshCw, FiKey } from 'react-icons/fi';
import transactionService from '../services/transactions';
import integrationsService from '../services/integrations'; // <-- Import new service
import { formatDate, formatCurrency } from '../utils/formatting'; // Corrected path

const Dashboard = () => {
  // --- Existing State ---
  const [transactions, setTransactions] = useState([]);
  const [hasUncategorized, setHasUncategorized] = useState(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoadingUpload, setIsLoadingUpload] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  // State for account base currency selection
  const [accountBaseCurrency, setAccountBaseCurrency] = useState('EUR');
  const availableCurrencies = ['AUD', 'EUR', 'USD', 'GBP', 'CAD', 'CHF', 'JPY'];

  // --- State for Up Integration ---
  const [isUpLinked, setIsUpLinked] = useState(false);
  const [isLoadingUpStatus, setIsLoadingUpStatus] = useState(true);
  const [upPatInput, setUpPatInput] = useState('');
  const [isSavingPat, setIsSavingPat] = useState(false);
  const [savePatError, setSavePatError] = useState(null);
  const [savePatSuccess, setSavePatSuccess] = useState(null);
  const [isRemovingLink, setIsRemovingLink] = useState(false);
  // Sync state will be used in Stage 6
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState(null);
  // --- End Integration State ---

  const navigate = useNavigate();

  // --- Combined Data Loading ---
  const loadDashboardData = useCallback(async (showLoading = true) => {
    console.log("Loading dashboard data (transactions & uncategorized check)...");
    if (showLoading) {
        setIsLoadingTransactions(true);
    }
    setFetchError(null);
    setHasUncategorized(false); // Initial reset

    try {
      // checkResponse will be TRUE or FALSE directly from the service
      const [categorizedData, checkResponse] = await Promise.all([
        transactionService.getTransactions({ status: 'categorized' }),
        transactionService.checkUncategorizedExists()
      ]);

      // --- FIX: Use checkResponse directly ---
      const uncategorizedExists = checkResponse; // It's already the boolean we need!

      // Log the actual value received and the (now correct) calculated value
      console.log(`[loadDashboardData] checkResponse value from Promise.all:`, checkResponse);
      console.log(`[loadDashboardData] Calculated uncategorizedExists: ${uncategorizedExists}`);

      setTransactions(categorizedData || []);
      setHasUncategorized(uncategorizedExists); // Use the correct boolean value
      console.log(`[loadDashboardData] State *after* setHasUncategorized(${uncategorizedExists})`);

    } catch (err) {
      console.error("Fetch Dashboard Data Error:", err);
      setFetchError(err.message || 'Could not load dashboard data.');
      setTransactions([]);
      setHasUncategorized(false);
      console.log("[loadDashboardData] State set to FALSE due to error.");
    } finally {
      if (showLoading) {
          setIsLoadingTransactions(false);
      }
      console.log("[loadDashboardData] FINALLY block reached.");
    }
  }, []); // Keep dependencies as they were

  // --- Fetch Up Link Status ---
  const checkLinkStatus = useCallback(async () => {
      setIsLoadingUpStatus(true);
      setSavePatError(null); setSavePatSuccess(null); setSyncError(null); setSyncSuccessMessage(null); // Clear messages
      try {
          const statusResult = await integrationsService.checkUpLinkStatus();
          setIsUpLinked(statusResult?.is_linked || false);
      } catch (error) {
          setIsUpLinked(false);
          // Display a persistent error? Maybe not on initial check unless critical
          console.error("Error checking Up link status:", error);
      } finally {
          setIsLoadingUpStatus(false);
      }
  }, []);

  // Initial Data Load on Mount
  useEffect(() => {
    loadDashboardData();
    checkLinkStatus();
  }, [loadDashboardData, checkLinkStatus]); // Add checkLinkStatus dependency

  // --- Existing Upload Logic (Keep as is) ---
  const handleFileChange = (event) => { /* ... */ setSelectedFile(event.target.files[0]); setUploadError(null); setUploadSuccess(null); };
  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsLoadingUpload(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const response = await transactionService.uploadTransactions(selectedFile, accountBaseCurrency);
      setUploadSuccess(response);
      setSelectedFile(null);
      if (document.getElementById('csv-upload-input')) document.getElementById('csv-upload-input').value = '';
      loadDashboardData(false); // Refresh dashboard data without full page loader
    } catch (err) {
       console.error("Upload error:", err);
       setUploadError(err.response?.data?.error || err.message || 'Upload failed.');
    } finally { setIsLoadingUpload(false); }
  };

  // --- Existing Navigation Handler ---
  const goToCategorize = () => navigate('/categorize');

  // --- NEW Up Integration Handlers ---
  const handlePatInputChange = (event) => {
      setUpPatInput(event.target.value);
      setSavePatError(null); // Clear errors when user types
      setSavePatSuccess(null);
  };

  const handleSavePat = async () => {
      if (!upPatInput.trim()) {
          setSavePatError("Personal Access Token cannot be empty.");
          return;
      }
      setIsSavingPat(true);
      setSavePatError(null);
      setSavePatSuccess(null);
      try {
          await integrationsService.saveUpToken(upPatInput);
          setIsUpLinked(true); // Update linked status
          setUpPatInput(''); // Clear input field
          setSavePatSuccess("Up Bank token saved and verified successfully!");
          // Optionally clear success message after a few seconds
          setTimeout(() => setSavePatSuccess(null), 5000);
      } catch (error) {
          console.error("Error saving PAT:", error);
          setIsUpLinked(false); // Assume not linked if save fails
          // Try to get specific error from backend response
          const backendError = error.response?.data?.error;
          setSavePatError(backendError || "Failed to save or verify token. Please check the token and try again.");
      } finally {
          setIsSavingPat(false);
      }
  };

  const handleRemoveLink = async () => {
      if (!window.confirm("Are you sure you want to remove the link to your Up Bank account? This will delete the stored access token.")) { return; }
      setIsRemovingLink(true);
      setSavePatError(null); setSavePatSuccess(null); setSyncError(null); setSyncSuccessMessage(null); // Clear all messages
      try {
          await integrationsService.removeUpLink();
          setIsUpLinked(false); // Update state
          // Optionally add a temporary success message for removal
          setSavePatSuccess("Up Bank link removed.");
          setTimeout(() => setSavePatSuccess(null), 5000);
      } catch (error) {
           setSavePatError(error.response?.data?.error || "Could not remove Up Bank link.");
      } finally {
           setIsRemovingLink(false);
      }
  };

  // --- FINAL Up Integration Sync Handler ---
  const handleTriggerSync = async () => {
    setIsSyncing(true); // Show loading state
    setSyncError(null); // Clear previous messages
    setSyncSuccessMessage(null);
    console.log("Sync Triggered! Calling backend API...");

    try {
        // Call the actual API service function
        const result = await integrationsService.triggerUpSync();

        // Display success message from backend response
        setSyncSuccessMessage(result.message || "Sync completed successfully."); // Use backend message
        console.log("Sync successful:", result);

        // Refresh dashboard data (transactions and uncategorized check)
        // to show any newly imported transactions and update the prompt.
        // Pass false to prevent the main transaction list from showing a loading spinner.
        await loadDashboardData(false);

        // Optional: Clear success message after a delay
        setTimeout(() => setSyncSuccessMessage(null), 8000);

    } catch (error) {
         console.error("Error triggering sync:", error);
         // Extract specific error message from backend if available
         const backendError = error.response?.data?.error;
         setSyncError(backendError || "Sync failed. Please try again later.");

         // Specific handling if the token became invalid during the sync attempt
         if (error.response?.status === 401) {
              // Token is invalid, force user to relink
              setIsUpLinked(false); // Update UI to show "Not Linked" state
              // Display error message near the PAT input area now
              setSavePatError("Your Up Bank token is invalid or expired. Please link again.");
              // Clear sync-specific messages as the main issue is the link now
              setSyncError(null);
              setSyncSuccessMessage(null);
         }
         // Optional: Clear error message after a delay? Or keep it until next action?
         // setTimeout(() => setSyncError(null), 10000);
    } finally {
         setIsSyncing(false); // Hide loading state regardless of outcome
    }
};
// --- End Sync Handler ---


  // --- Render Logic ---
  const hasCategorizedData = transactions.length > 0;
  // Combine loading states for overall dashboard busy state if needed
  const isPageLoading = isLoadingTransactions || isLoadingUpStatus;

  return (
    <div className="dashboard-page">
      {/* --- Upload Section --- */}
      <div className="upload-section card-style">
        <h2 className="section-title">Import Transactions</h2>
         <div className="upload-controls">
           <div className="currency-selection" style={{ marginBottom: '15px' }}>
             <label htmlFor="currency-selector" style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
               What currency is this bank account denominated in?
             </label>
             <select
               id="currency-selector"
               value={accountBaseCurrency}
               onChange={(e) => setAccountBaseCurrency(e.target.value)}
               disabled={isLoadingUpload}
               style={{ 
                 padding: '10px', 
                 borderRadius: '6px', 
                 border: '1px solid #ccc', 
                 fontSize: '14px',
                 minWidth: '120px'
               }}
             >
               {availableCurrencies.map((currency) => (
                 <option key={currency} value={currency}>
                   {currency}
                 </option>
               ))}
             </select>
             <div style={{ 
               fontSize: '12px', 
               color: '#666', 
               marginTop: '5px',
               lineHeight: '1.4'
             }}>
               Select the base currency of the bank account these transactions are from.<br/>
               (e.g., EUR for ING Bank Europe, USD for Chase Bank USA, AUD for Australian banks)
             </div>
           </div>
           
           <label htmlFor="csv-upload-input" className="file-input-label">Choose CSV File</label>
           <input id="csv-upload-input" type="file" accept=".csv" onChange={handleFileChange} disabled={isLoadingUpload} />
           {selectedFile && <span className="file-name">{selectedFile.name}</span>}
           <button onClick={handleUpload} disabled={!selectedFile || isLoadingUpload} className="action-button teal-button upload-button">
             {isLoadingUpload ? (<><FiLoader className="button-icon spinner"/> Uploading...</>) : (<><FiUpload className="button-icon"/> Upload File</>)}
           </button>
         </div>
         {uploadError && (<div className="upload-feedback error-message"><FiAlertCircle /> {uploadError}</div>)}
         {uploadSuccess && (<div className="upload-feedback success-message"><FiCheckCircle /> {uploadSuccess.message}</div>)}
      </div>

       {/* --- NEW Bank Connections Section --- */}
       <div className="bank-connection-section card-style">
         <h2 className="section-title"><FiLink className="title-icon"/> Bank Connections</h2>
         {isLoadingUpStatus ? (
             <div className="loading-state"><FiLoader className="spinner"/> Checking connection status...</div>
         ) : isUpLinked ? (
             // --- Linked State ---
             <div className="connection-status linked">
                 <div className="status-indicator">
                     <FiCheckCircle className="icon-success"/>
                     <span>Up Bank Account Linked</span>
                 </div>
                 {/* Display general success/error messages related to this section */}
                 {savePatSuccess && !isRemovingLink && <div className="pat-feedback success-message"><FiCheckCircle /> {savePatSuccess}</div>}
                 {savePatError && !isRemovingLink && <div className="pat-feedback error-message"><FiAlertCircle /> {savePatError}</div>}
                 {syncSuccessMessage && <div className="sync-feedback success-message"><FiCheckCircle /> {syncSuccessMessage}</div>}
                 {syncError && <div className="sync-feedback error-message"><FiAlertCircle /> {syncError}</div>}

                 <div className="connection-actions">
                     {/* Sync Button - Placeholder Action for now */}
                     <button onClick={handleTriggerSync} className="action-button teal-button sync-button" disabled={isSyncing || isRemovingLink}>
                         {isSyncing ? <FiLoader className="button-icon spinner"/> : <FiRefreshCw className="button-icon"/>}
                         Sync Now
                     </button>
                     {/* Remove Link Button */}
                     <button onClick={handleRemoveLink} className="action-button plain-button remove-button" disabled={isSyncing || isRemovingLink}>
                         {isRemovingLink ? <FiLoader className="button-icon spinner"/> : <FiTrash2 className="button-icon"/>}
                         Remove Link
                     </button>
                 </div>
             </div>
         ) : (
             // --- Not Linked State ---
             <div className="connection-status not-linked">
                 <p>Connect your Up Bank account using a Personal Access Token to automatically sync transactions.</p>
                 <a href="https://api.up.com.au/getting_started" target="_blank" rel="noopener noreferrer" className="external-link">How to get your Up token?</a>
                 <div className="pat-input-area">
                     <FiKey className="input-icon"/>
                     <input
                         type="password"
                         placeholder="Paste your Up Personal Access Token here"
                         value={upPatInput}
                         onChange={handlePatInputChange}
                         disabled={isSavingPat}
                         className="pat-input"
                     />
                     <button onClick={handleSavePat} disabled={isSavingPat || !upPatInput.trim()} className="action-button teal-button">
                         {isSavingPat ? <FiLoader className="button-icon spinner"/> : <FiLink className="button-icon"/>}
                         Link Account
                     </button>
                 </div>
                 {/* PAT Save Feedback */}
                 {savePatError && <div className="pat-feedback error-message"><FiAlertCircle /> {savePatError}</div>}
                 {savePatSuccess && <div className="pat-feedback success-message"><FiCheckCircle /> {savePatSuccess}</div>}
             </div>
         )}
       </div>
       {/* --- End NEW Section --- */}


      {/* --- Categorization Prompt (Keep as is) --- */}
      {hasUncategorized && !isLoadingTransactions && (
          <div className="categorization-prompt card-style">
              <FiEdit className="prompt-icon"/>
              <div className="prompt-text">
                 <p><strong>You have uncategorized transactions!</strong></p>
                 <p>Review them now to complete your financial picture.</p>
              </div>
              <button onClick={goToCategorize} className="action-button teal-button">
                  Review Now
              </button>
          </div>
      )}


      {/* --- Transaction Display Section (Keep as is) --- */}
      <div className="transactions-section card-style">
         <h2 className="section-title">Transaction History (Categorized)</h2>
         {isPageLoading ? ( // Use combined loading state
           <div className="loading-transactions"><FiLoader className="spinner"/> Loading...</div>
         ) : fetchError ? (
           <div className="error-message"><FiAlertCircle /> Error: {fetchError}</div>
         ) : !hasCategorizedData && !hasUncategorized ? (
           <div className="empty-state-container minimal">
             <FiInbox />
             <p className="empty-state-text">
               No transactions found. Upload a CSV or link your bank account.
             </p>
           </div>
         ) : !hasCategorizedData && hasUncategorized ? (
           <div className="empty-state-container minimal">
              <p className="empty-state-text">
                  No categorized transactions to display yet. Please review your items using the prompt above.
              </p>
           </div>
         ) : (
           <div className="transaction-table-container">
             <table className="transaction-table">
               <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
               <tbody>
                 {transactions.map((tx) => (
                   <tr key={tx.id}>
                     <td>{formatDate(tx.transaction_date)}</td>
                     <td>{tx.description}</td>
                     <td>{tx.category_name || 'N/A'}</td>
                     <td className={`amount-${tx.direction?.toLowerCase()}`}>
                        {formatCurrency(tx.amount, tx.direction)}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
         )}
       </div>
     </div>
   );
 };

 export default Dashboard;