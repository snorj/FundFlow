import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import './Dashboard.css';
import { FiUpload, FiLink, FiLoader, FiCheckCircle, FiAlertCircle, FiInbox, FiEdit } from 'react-icons/fi'; // Added FiInbox, FiEdit
import transactionService from '../services/transactions';

// --- Keep Helper Functions (formatDate, formatCurrency) ---
const formatDate = (dateString) => { /* ... */ };
const formatCurrency = (amount, direction) => { /* ... */ };

const Dashboard = () => {
  // --- State Variables ---
  const [transactions, setTransactions] = useState([]); // Will hold ONLY categorized txns
  const [hasUncategorized, setHasUncategorized] = useState(false); // Flag for prompt
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoadingUpload, setIsLoadingUpload] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  const navigate = useNavigate(); // Hook for navigation

  // --- Fetching Logic ---
  const loadDashboardData = useCallback(async () => {
    console.log("Attempting to load dashboard data...");
    setIsLoadingTransactions(true);
    setFetchError(null);
    setHasUncategorized(false); // Reset check flag
    try {
      // Fetch categorized transactions AND check for uncategorized ones in parallel
      const [categorizedData, checkResponse] = await Promise.all([
        transactionService.getTransactions({ status: 'categorized' }), // Filter for categorized
        transactionService.checkUncategorizedExists() // Use new check function
      ]);

      console.log("Categorized Transactions fetched:", categorizedData);
      console.log("Check for uncategorized:", checkResponse);

      setTransactions(categorizedData || []);
      setHasUncategorized(checkResponse); // Set the flag based on check

    } catch (err) {
      console.error("Fetch Dashboard Data Error:", err);
      setFetchError(err.message || 'Could not load dashboard data.');
      setTransactions([]); // Clear transactions on error
      setHasUncategorized(false); // Assume none on error
    } finally {
      setIsLoadingTransactions(false);
    }
  }, []); // No dependencies needed if using static filters

  // Fetch data on component mount
  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // --- Upload Logic ---
  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setUploadError(null);
    setUploadSuccess(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) { /* ... */ return; }
    setIsLoadingUpload(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const response = await transactionService.uploadTransactions(selectedFile);
      console.log("Upload response:", response);
      setUploadSuccess(response);
      setSelectedFile(null);
      if (document.getElementById('csv-upload-input')) {
        document.getElementById('csv-upload-input').value = '';
      }
      // **Crucially, trigger navigation to categorization OR just refresh dashboard data**
      // Option A: Navigate directly
      // navigate('/categorize');

      // Option B: Refresh dashboard data - user clicks prompt manually
       loadDashboardData(); // Refresh to show prompt/updated categorized list

    } catch (err) { /* ... error handling ... */ }
    finally { setIsLoadingUpload(false); }
  };

  // --- Navigation Handler ---
  const goToCategorize = () => {
      navigate('/categorize');
  };

  // --- Render Logic ---
  // Determine if *categorized* data exists for table display
  const hasCategorizedData = transactions.length > 0;

  return (
    <div className="dashboard-page">
      {/* --- Upload Section (Keep as is) --- */}
      <div className="upload-section card-style">
        <h2 className="section-title">Import Transactions</h2>
        {/* ... upload controls and feedback ... */}
         <div className="upload-controls">
           <input id="csv-upload-input" type="file" accept=".csv" onChange={handleFileChange} disabled={isLoadingUpload} />
           <button onClick={handleUpload} disabled={!selectedFile || isLoadingUpload} className="action-button teal-button upload-button">
             {isLoadingUpload ? (<><FiLoader className="button-icon spinner"/> Uploading...</>) : (<><FiUpload className="button-icon"/> Upload File</>)}
           </button>
         </div>
         {uploadError && (<div className="upload-feedback error-message"><FiAlertCircle /> {uploadError}</div>)}
         {uploadSuccess && (<div className="upload-feedback success-message"><FiCheckCircle /> {uploadSuccess.message}</div>)}
      </div>

      {/* --- Categorization Prompt (NEW) --- */}
      {hasUncategorized && !isLoadingTransactions && ( // Show only if uncategorized exist and not loading
          <div className="categorization-prompt card-style">
              <FiEdit className="prompt-icon"/>
              <div className="prompt-text">
                 <p><strong>You have uncategorized transactions!</strong></p>
                 <p>Sort them now to get a complete financial picture.</p>
              </div>
              <button onClick={goToCategorize} className="action-button teal-button">
                  Categorize Now
              </button>
          </div>
      )}


      {/* --- Transaction Display Section (Shows ONLY Categorized) --- */}
      <div className="transactions-section card-style">
         <h2 className="section-title">Transaction History</h2>
         {isLoadingTransactions ? (
           <div className="loading-transactions"><FiLoader className="spinner"/> Loading...</div>
         ) : fetchError ? (
           <div className="error-message"><FiAlertCircle /> Error: {fetchError}</div>
         ) : !hasCategorizedData && !hasUncategorized ? ( // Show empty only if NO data at all
           <div className="empty-state-container minimal">
             <FiInbox />
             <p className="empty-state-text">
               Your transaction history is empty. Upload a CSV file to get started.
             </p>
           </div>
         ) : !hasCategorizedData && hasUncategorized ? ( // Show slightly different message if waiting for categorization
           <div className="empty-state-container minimal">
              <p className="empty-state-text">
                  No categorized transactions to display yet. Please categorize your uploaded items using the prompt above.
              </p>
           </div>
         ) : (
           // --- Transaction Table (Shows Categorized Only) ---
           <div className="transaction-table-container">
             <table className="transaction-table">
               {/* ... table head ... */}
               <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Amount</th></tr></thead>
               <tbody>
                 {transactions.map((tx) => ( // Only categorized txns are in this array now
                   <tr key={tx.id}>
                     <td>{formatDate(tx.transaction_date)}</td>
                     <td>{tx.description}</td>
                     {/* Category name should always exist now */}
                     <td>{tx.category_name || 'Error!'}</td>
                     <td className={`amount-${tx.direction?.toLowerCase()}`}>
                        {formatCurrency(tx.amount, tx.direction)}
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
           // --- End Transaction Table ---
         )}
       </div>
     </div>
   );
 };

 export default Dashboard;