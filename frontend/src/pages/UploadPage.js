import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css'; // We can reuse the dashboard CSS for now or create a new one
import { FiUpload, FiLink, FiLoader, FiCheckCircle, FiAlertCircle, FiEdit, FiKey, FiRefreshCw, FiTrash2, FiPlus } from 'react-icons/fi';
import transactionService from '../services/transactions';
import integrationsService from '../services/integrations';
import AddTransactionModal from '../components/transactions/AddTransactionModal';
// NOTE: formatDate and formatCurrency are not used in this component anymore.
// import { formatDate, formatCurrency } from '../utils/formatting'; 

// Helper to get date strings in YYYY-MM-DD format
const toYYYYMMDD = (date) => {
  return date.toISOString().split('T')[0];
};

const UploadPage = () => { // Changed component name
  // --- State related to transaction display is removed ---
  // const [transactions, setTransactions] = useState([]); 
  const [hasUncategorized, setHasUncategorized] = useState(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true); // Still used for uncategorized check
  // const [fetchError, setFetchError] = useState(null); // Not directly used for display, but loadDashboardData sets it
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoadingUpload, setIsLoadingUpload] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  const [isUpLinked, setIsUpLinked] = useState(false);
  const [isLoadingUpStatus, setIsLoadingUpStatus] = useState(true);
  const [upPatInput, setUpPatInput] = useState('');
  const [isSavingPat, setIsSavingPat] = useState(false);
  const [savePatError, setSavePatError] = useState(null);
  const [savePatSuccess, setSavePatSuccess] = useState(null);
  const [isRemovingLink, setIsRemovingLink] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(null);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState(null);

  // New state for date range selection
  const [selectedRangeType, setSelectedRangeType] = useState('last_7_days'); // Default range
  const [syncSinceDate, setSyncSinceDate] = useState('');
  const [syncUntilDate, setSyncUntilDate] = useState('');

  // State for AddTransactionModal
  const [isAddTransactionModalOpen, setIsAddTransactionModalOpen] = useState(false);

  const navigate = useNavigate();

  // --- Modified Data Loading ---
  // This function now primarily checks for uncategorized transactions and loads categorized ones (though not displayed).
  // We could optimize this to only check for uncategorized if categorized data is not needed.
  const loadUploadPageData = useCallback(async (showLoading = true) => {
    console.log("Loading upload page data (uncategorized check)...");
    if (showLoading) {
        setIsLoadingTransactions(true); // This state now primarily reflects loading for uncategorized check
    }
    // setFetchError(null); // Keep setFetchError from original Dashboard.js in case of error during checkUncategorizedExists
    setHasUncategorized(false);

    try {
      // Only check for uncategorized transactions existence
      const uncategorizedExists = await transactionService.checkUncategorizedExists();
      setHasUncategorized(uncategorizedExists);
      console.log(`[loadUploadPageData] Uncategorized exists: ${uncategorizedExists}`);

      // We still call getTransactions to ensure any newly uploaded transactions are processed
      // by the backend if it triggers any post-upload logic. This part might be skippable
      // if the backend handles all processing immediately upon upload.
      // For now, keeping it ensures data consistency if other parts rely on this.
      // Consider removing if `transactionService.getTransactions({ status: 'categorized' })`
      // is not essential after an upload for this page's direct functionality.
      await transactionService.getTransactions({ status: 'categorized' });


    } catch (err) {
      console.error("Fetch Upload Page Data Error:", err);
      // setFetchError(err.message || 'Could not load page data.'); // Keep setFetchError
      setHasUncategorized(false);
    } finally {
      if (showLoading) {
          setIsLoadingTransactions(false);
      }
    }
  }, []);

  const checkLinkStatus = useCallback(async () => {
      setIsLoadingUpStatus(true);
      setSavePatError(null); setSavePatSuccess(null); setSyncError(null); setSyncSuccessMessage(null);
      try {
          const statusResult = await integrationsService.checkUpLinkStatus();
          setIsUpLinked(statusResult?.is_linked || false);
      } catch (error) {
          setIsUpLinked(false);
          console.error("Error checking Up link status:", error);
      } finally {
          setIsLoadingUpStatus(false);
      }
  }, []);

  useEffect(() => {
    loadUploadPageData();
    checkLinkStatus();
  }, [loadUploadPageData, checkLinkStatus]);

  const handleFileChange = (event) => { setSelectedFile(event.target.files[0]); setUploadError(null); setUploadSuccess(null); };
  const handleUpload = async () => {
    if (!selectedFile) return;
    setIsLoadingUpload(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const response = await transactionService.uploadTransactions(selectedFile);
      setUploadSuccess(response);
      setSelectedFile(null);
      if (document.getElementById('csv-upload-input')) document.getElementById('csv-upload-input').value = '';
      loadUploadPageData(false); 
    } catch (err) {
       console.error("Upload error:", err);
       setUploadError(err.response?.data?.error || err.message || 'Upload failed.');
    } finally { setIsLoadingUpload(false); }
  };

  // --- Updated Navigation Handler ---
  const goToCategorizeTransactions = () => navigate('/categorise/transactions'); // Changed navigation path

  // --- AddTransactionModal Handlers ---
  const handleOpenAddTransactionModal = () => {
    setIsAddTransactionModalOpen(true);
  };

  const handleCloseAddTransactionModal = () => {
    setIsAddTransactionModalOpen(false);
  };

  const handleTransactionSuccess = () => {
    console.log('Manual transaction created successfully');
    // Refresh uncategorized check since new transaction might need categorization
    loadUploadPageData(false);
  };

  const handlePatInputChange = (event) => {
      setUpPatInput(event.target.value);
      setSavePatError(null); 
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
          setIsUpLinked(true); 
          setUpPatInput(''); 
          setSavePatSuccess("Up Bank token saved and verified successfully!");
          setTimeout(() => setSavePatSuccess(null), 5000);
      } catch (error) {
          console.error("Error saving PAT:", error);
          setIsUpLinked(false); 
          const backendError = error.response?.data?.error;
          setSavePatError(backendError || "Failed to save or verify token. Please check the token and try again.");
      } finally {
          setIsSavingPat(false);
      }
  };

  const handleRemoveLink = async () => {
      if (!window.confirm("Are you sure you want to remove the link to your Up Bank account? This will delete the stored access token.")) { return; }
      setIsRemovingLink(true);
      setSavePatError(null); setSavePatSuccess(null); setSyncError(null); setSyncSuccessMessage(null);
      try {
          await integrationsService.removeUpLink();
          setIsUpLinked(false); 
          setSavePatSuccess("Up Bank link removed.");
          setTimeout(() => setSavePatSuccess(null), 5000);
      } catch (error) {
           setSavePatError(error.response?.data?.error || "Could not remove Up Bank link.");
      } finally {
           setIsRemovingLink(false);
      }
  };

  const handleTriggerSync = async () => {
    setIsSyncing(true); 
    setSyncError(null); 
    setSyncSuccessMessage(null);
    console.log("Sync Triggered! Calling backend API...");

    let since = null;
    let until = null;

    const today = new Date();
    switch (selectedRangeType) {
        case 'last_7_days':
            since = new Date(today);
            since.setDate(today.getDate() - 7);
            since = toYYYYMMDD(since);
            break;
        case 'last_30_days':
            since = new Date(today);
            since.setDate(today.getDate() - 30);
            since = toYYYYMMDD(since);
            break;
        case 'last_90_days':
            since = new Date(today);
            since.setDate(today.getDate() - 90);
            since = toYYYYMMDD(since);
            break;
        case 'custom':
            if (syncSinceDate) since = syncSinceDate;
            if (syncUntilDate) until = syncUntilDate; // Optional: backend might default to today if not provided
            break;
        default:
            // Default to last 7 days or handle as an error/no specific range
            const defaultSince = new Date(today);
            defaultSince.setDate(today.getDate() - 7);
            since = toYYYYMMDD(defaultSince);
            break;
    }
    
    // If 'custom' and 'until' is not set, we can default it to today
    if (selectedRangeType === 'custom' && since && !until) {
        until = toYYYYMMDD(new Date());
    }


    console.log(`Requesting sync with since: ${since}, until: ${until}`);

    try {
        const result = await integrationsService.triggerUpSync(since, until); // Pass dates to service
        setSyncSuccessMessage(result.message || "Sync completed successfully."); 
        console.log("Sync successful:", result);
        loadUploadPageData(false); 
        setTimeout(() => setSyncSuccessMessage(null), 8000);

    } catch (error) {
         console.error("Error triggering sync:", error);
         const backendError = error.response?.data?.error;
         setSyncError(backendError || "Sync failed. Please try again later.");
         if (error.response?.status === 401) {
              setIsUpLinked(false); 
              setSavePatError("Your Up Bank token is invalid or expired. Please link again.");
              setSyncError(null);
              setSyncSuccessMessage(null);
         }
    } finally {
         setIsSyncing(false); 
    }
};

  // const isPageLoading = isLoadingTransactions || isLoadingUpStatus; // isLoadingTransactions now for uncategorized check

  return (
    <div className="dashboard-page"> {/* Consider renaming class or using a generic one */}
      <div className="upload-section card-style">
        <h2 className="section-title">Import Transactions</h2>
         <div className="upload-controls">
           <label htmlFor="csv-upload-input" className="file-input-label">Choose CSV File</label>
           <input id="csv-upload-input" type="file" accept=".csv" onChange={handleFileChange} disabled={isLoadingUpload} />
           {selectedFile && <span className="file-name">{selectedFile.name}</span>}
           <button onClick={handleUpload} disabled={!selectedFile || isLoadingUpload} className="action-button teal-button upload-button">
             {isLoadingUpload ? (<><FiLoader className="button-icon spinner"/> Uploading...</>) : (<><FiUpload className="button-icon"/> Upload File</>)}
           </button>
         </div>
         {uploadError && (<div className="upload-feedback error-message"><FiAlertCircle /> {uploadError}</div>)}
         {uploadSuccess && (<div className="upload-feedback success-message"><FiCheckCircle /> {uploadSuccess.message}</div>)}
         
         {/* Manual Transaction Section */}
         <div className="manual-transaction-section" style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #eee' }}>
           <h3 style={{ margin: '0 0 10px 0', fontSize: '1em', color: '#333' }}>Manual Entry</h3>
           <p style={{ margin: '0 0 15px 0', color: '#666', fontSize: '0.9em' }}>Add transactions manually if you don't have a CSV file or want to record a quick transaction.</p>
           <button 
             onClick={handleOpenAddTransactionModal} 
             className="action-button plain-button add-transaction-button"
             style={{ 
               display: 'flex', 
               alignItems: 'center', 
               gap: '8px',
               padding: '10px 16px',
               backgroundColor: '#f8f9fa',
               border: '2px dashed #ddd',
               borderRadius: '6px',
               color: '#333',
               transition: 'all 0.2s ease'
             }}
           >
             <FiPlus className="button-icon" />
             Add Manual Transaction
           </button>
         </div>
      </div>

       <div className="bank-connection-section card-style">
         <h2 className="section-title"><FiLink className="title-icon"/> Bank Connections</h2>
         {isLoadingUpStatus ? (
             <div className="loading-state"><FiLoader className="spinner"/> Checking connection status...</div>
         ) : isUpLinked ? (
             <div className="connection-status linked">
                 <div className="status-indicator">
                     <FiCheckCircle className="icon-success"/>
                     <span>Up Bank Account Linked</span>
                 </div>
                 {savePatSuccess && !isRemovingLink && <div className="pat-feedback success-message"><FiCheckCircle /> {savePatSuccess}</div>}
                 {savePatError && !isRemovingLink && <div className="pat-feedback error-message"><FiAlertCircle /> {savePatError}</div>}
                 {syncSuccessMessage && <div className="sync-feedback success-message"><FiCheckCircle /> {syncSuccessMessage}</div>}
                 {syncError && <div className="sync-feedback error-message"><FiAlertCircle /> {syncError}</div>}

                 {/* Date Range Selection for Sync */}
                 <div className="sync-date-range-section" style={{ marginTop: '20px', marginBottom: '15px', borderTop: '1px solid #eee', paddingTop: '15px' }}>
                     <h4 style={{ marginTop: '0', marginBottom: '10px', fontSize: '1em' }}>Sync Options</h4>
                     <div style={{ marginBottom: '10px' }}>
                         <label htmlFor="rangeType" style={{ marginRight: '10px', fontWeight: 'normal' }}>Period:</label>
                         <select 
                             id="rangeType" 
                             value={selectedRangeType} 
                             onChange={(e) => setSelectedRangeType(e.target.value)}
                             disabled={isSyncing || isRemovingLink}
                             style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                         >
                             <option value="last_7_days">Last 7 days</option>
                             <option value="last_30_days">Last 30 days</option>
                             <option value="last_90_days">Last 90 days</option>
                             <option value="custom">Custom Range</option>
                         </select>
                     </div>

                     {selectedRangeType === 'custom' && (
                         <div style={{ display: 'flex', gap: '15px', marginBottom: '10px', alignItems: 'flex-end' }}>
                             <div>
                                 <label htmlFor="syncSinceDate" style={{ display: 'block', marginBottom: '5px', fontWeight: 'normal' }}>From:</label>
                                 <input 
                                     type="date" 
                                     id="syncSinceDate" 
                                     value={syncSinceDate} 
                                     onChange={(e) => setSyncSinceDate(e.target.value)} 
                                     disabled={isSyncing || isRemovingLink}
                                     style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                                 />
                             </div>
                             <div>
                                 <label htmlFor="syncUntilDate" style={{ display: 'block', marginBottom: '5px', fontWeight: 'normal' }}>To:</label>
                                 <input 
                                     type="date" 
                                     id="syncUntilDate" 
                                     value={syncUntilDate} 
                                     onChange={(e) => setSyncUntilDate(e.target.value)} 
                                     disabled={isSyncing || isRemovingLink}
                                     style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                                 />
                             </div>
                         </div>
                     )}
                 </div>

                 <div className="connection-actions">
                     <button onClick={handleTriggerSync} className="action-button teal-button sync-button" disabled={isSyncing || isRemovingLink}>
                         {isSyncing ? <FiLoader className="button-icon spinner"/> : <FiRefreshCw className="button-icon"/>}
                         Sync Now
                     </button>
                     <button onClick={handleRemoveLink} className="action-button plain-button remove-button" disabled={isSyncing || isRemovingLink}>
                         {isRemovingLink ? <FiLoader className="button-icon spinner"/> : <FiTrash2 className="button-icon"/>}
                         Remove Link
                     </button>
                 </div>
             </div>
         ) : (
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
                 {savePatError && <div className="pat-feedback error-message"><FiAlertCircle /> {savePatError}</div>}
                 {savePatSuccess && <div className="pat-feedback success-message"><FiCheckCircle /> {savePatSuccess}</div>}
             </div>
         )}
       </div>

      {/* --- Categorization Prompt --- */}
      {/* The button now navigates to /categorise/transactions */}
      {hasUncategorized && !isLoadingTransactions && ( // isLoadingTransactions reflects check for uncategorized
          <div className="categorization-prompt card-style">
              <FiEdit className="prompt-icon"/>
              <div className="prompt-text">
                 <p><strong>You have uncategorized transactions!</strong></p>
                 <p>Review them now to complete your financial picture.</p>
              </div>
              <button onClick={goToCategorizeTransactions} className="action-button teal-button">
                  Review Now 
              </button>
          </div>
      )}

      {/* --- Transaction Display Section (REMOVED) --- */}
      {/* The entire "transactions-section card-style" div has been removed */}
      
      {/* AddTransactionModal */}
      <AddTransactionModal 
        isOpen={isAddTransactionModalOpen}
        onClose={handleCloseAddTransactionModal}
        onSuccess={handleTransactionSuccess}
        size="lg"
      />
     </div>
   );
 };

 export default UploadPage; // Changed export name 