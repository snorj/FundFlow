import React, { useState, useEffect, useCallback } from 'react';
// Removed Link as we only use buttons now for upload/connect placeholders
import './Dashboard.css';
import { FiUpload, FiLink, FiLoader, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';
import transactionService from '../services/transactions'; // Import the new service

// Helper to format date
const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  try {
    // Assuming dateString is YYYY-MM-DD from the backend serializer
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString + 'T00:00:00').toLocaleDateString(undefined, options); // Add time part to avoid timezone issues
  } catch (e) {
    return dateString; // Return original if formatting fails
  }
};

// Helper to format currency
const formatCurrency = (amount, direction) => {
  const numAmount = Number(amount);
  if (isNaN(numAmount)) return 'N/A';

  const options = { style: 'currency', currency: 'EUR' }; // Assuming EUR based on CSV example
  const formatted = Math.abs(numAmount).toLocaleString(undefined, options);

  return direction === 'DEBIT' ? `- ${formatted}` : `+ ${formatted}`;
};


const Dashboard = () => {
  // --- State Variables ---
  // Transactions
  const [transactions, setTransactions] = useState([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true); // Start loading initially
  const [fetchError, setFetchError] = useState(null);

  // CSV Upload
  const [selectedFile, setSelectedFile] = useState(null);
  const [isLoadingUpload, setIsLoadingUpload] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null); // Store success message { message, imported_count, total_rows_processed, errors }


  // --- Fetching Logic ---
  const fetchTransactions = useCallback(async () => {
    console.log("Attempting to fetch transactions...");
    setIsLoadingTransactions(true);
    setFetchError(null);
    try {
      const data = await transactionService.getTransactions();
      console.log("Transactions fetched:", data);
      setTransactions(data || []); // Ensure it's an array
    } catch (err) {
      console.error("Fetch Transactions Error:", err);
      setFetchError(err.message || 'Could not fetch transactions.');
      setTransactions([]); // Clear transactions on error
    } finally {
      setIsLoadingTransactions(false);
    }
  }, []);

  // Fetch transactions on component mount
  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // --- Upload Logic ---
  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setUploadError(null); // Clear previous errors/success on new file selection
    setUploadSuccess(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setUploadError('Please select a CSV file first.');
      return;
    }

    setIsLoadingUpload(true);
    setUploadError(null);
    setUploadSuccess(null);

    try {
      const response = await transactionService.uploadTransactions(selectedFile);
      console.log("Upload response:", response);
      setUploadSuccess(response); // Store the full response object
      setSelectedFile(null); // Clear file input after successful upload
      // Clear the actual input element value (requires ref or specific technique)
      if (document.getElementById('csv-upload-input')) {
        document.getElementById('csv-upload-input').value = '';
      }
      fetchTransactions(); // Refresh the transaction list after upload
    } catch (err) {
      console.error("Upload Error:", err);
      setUploadError(err.message || err.error || 'File upload failed. Please check the file format and try again.');
    } finally {
      setIsLoadingUpload(false);
    }
  };

  // --- Render Logic ---

  // Placeholder handler for connect bank
  const handleConnectBankClick = () => {
    alert('Connect Bank Account - Placeholder Action (Integration removed)');
  };

  // Determine if *any* data exists (for conditional rendering)
  const hasData = transactions.length > 0;

  return (
    <div className="dashboard-page">
      {/* --- Upload Section --- */}
      <div className="upload-section card-style">
        <h2 className="section-title">Import Transactions</h2>
        <div className="upload-controls">
          <input
            type="file"
            id="csv-upload-input" // ID for potential clearing
            accept=".csv"
            onChange={handleFileChange}
            disabled={isLoadingUpload}
          />
          <button
            onClick={handleUpload}
            disabled={!selectedFile || isLoadingUpload}
            className="action-button teal-button upload-button"
          >
            {isLoadingUpload ? (
              <>
                <FiLoader className="button-icon spinner" /> Uploading...
              </>
            ) : (
              <>
                <FiUpload className="button-icon" /> Upload File
              </>
            )}
          </button>
        </div>
        {/* Upload Feedback */}
        {uploadError && (
          <div className="upload-feedback error-message">
            <FiAlertCircle /> {uploadError}
          </div>
        )}
        {uploadSuccess && (
          <div className="upload-feedback success-message">
             <FiCheckCircle /> {uploadSuccess.message}
             {/* Optionally show more details or errors */}
             {uploadSuccess.errors && uploadSuccess.errors.length > 0 && (
                <ul className="upload-row-errors">
                    {uploadSuccess.errors.slice(0, 5).map((err, index) => <li key={index}>{err}</li>)}
                    {uploadSuccess.errors.length > 5 && <li>...and {uploadSuccess.errors.length - 5} more errors.</li>}
                </ul>
             )}
          </div>
        )}
      </div>

      {/* --- Transaction Display Section --- */}
      <div className="transactions-section card-style">
         <h2 className="section-title">Recent Transactions</h2>
         {isLoadingTransactions ? (
           <div className="loading-transactions">
             <FiLoader className="spinner" /> Loading transactions...
           </div>
         ) : fetchError ? (
           <div className="error-message">
             <FiAlertCircle /> Error: {fetchError}
           </div>
         ) : !hasData ? (
           // --- Modified Empty State ---
           <div className="empty-state-container minimal">
             <p className="empty-state-text">
               No transactions found. Upload a CSV file above or use another method to get started.
             </p>
             {/* Keep placeholder connect button if desired */}
             <div className="action-buttons">
               <button
                 type="button"
                 className="action-button teal-button"
                 onClick={handleConnectBankClick}
                 >
                 <FiLink className="button-icon" />
                 Connect Bank Account (Placeholder)
               </button>
             </div>
           </div>
           // --- End Modified Empty State ---
         ) : (
           // --- Transaction Table ---
           <div className="transaction-table-container">
             <table className="transaction-table">
               <thead>
                 <tr>
                   <th>Date</th>
                   <th>Description</th>
                   <th>Category</th>
                   <th>Amount</th>
                 </tr>
               </thead>
               <tbody>
                 {transactions.map((tx) => (
                   <tr key={tx.id}>
                     <td>{formatDate(tx.transaction_date)}</td>
                     <td>{tx.description}</td>
                     <td>{tx.category_name || <span className="uncategorized">Uncategorized</span>}</td>
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