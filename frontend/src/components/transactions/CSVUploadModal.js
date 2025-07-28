import React, { useState } from 'react';
import PropTypes from 'prop-types';
import './AddTransactionModal.css'; // Reuse existing modal styles
import { FiX, FiLoader, FiUpload, FiCheckCircle, FiAlertCircle, FiFileText } from 'react-icons/fi';
import transactionService from '../../services/transactions';

const CSVUploadModal = ({
  isOpen,
  onClose,
  onSuccess,
  bankName = 'Bank',
  defaultCurrency = 'EUR',
  modalTitle = 'Upload CSV'
}) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [accountBaseCurrency, setAccountBaseCurrency] = useState(defaultCurrency);
  const [isLoadingUpload, setIsLoadingUpload] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);

  const availableCurrencies = ['AUD', 'EUR', 'USD', 'GBP', 'CAD', 'CHF', 'JPY'];

  const handleFileChange = (event) => {
    setSelectedFile(event.target.files[0]);
    setUploadError(null);
    setUploadSuccess(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    
    setIsLoadingUpload(true);
    setUploadError(null);
    setUploadSuccess(null);
    
    try {
      const response = await transactionService.uploadTransactions(selectedFile, accountBaseCurrency);
      setUploadSuccess(response);
      setSelectedFile(null);
      
      // Clear file input
      const fileInput = document.getElementById('csv-upload-modal-input');
      if (fileInput) fileInput.value = '';
      
      // Call success callback after short delay to show success message
      setTimeout(() => {
        onSuccess && onSuccess(response);
        onClose();
      }, 1500);
      
    } catch (err) {
      console.error("Upload error:", err);
      setUploadError(err.response?.data?.error || err.message || 'Upload failed.');
    } finally {
      setIsLoadingUpload(false);
    }
  };

  const handleClose = () => {
    if (!isLoadingUpload) {
      // Reset state when closing
      setSelectedFile(null);
      setUploadError(null);
      setUploadSuccess(null);
      const fileInput = document.getElementById('csv-upload-modal-input');
      if (fileInput) fileInput.value = '';
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="transaction-modal-overlay" onClick={handleClose}>
      <div 
        className="transaction-modal-content transaction-modal--md" 
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
          border: '1px solid rgba(0,0,0,0.1)',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 5px 20px rgba(0,0,0,0.1)'
        }}
      >
        {/* Modal Header */}
        <div 
          className="transaction-modal-header"
          style={{
            background: 'linear-gradient(135deg, var(--teal) 0%, #20b2aa 100%)',
            color: 'white',
            padding: '25px 30px',
            borderRadius: '8px 8px 0 0',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Background decoration */}
          <div style={{
            position: 'absolute',
            top: '-50%',
            right: '-20%',
            width: '200px',
            height: '200px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '50%',
            pointerEvents: 'none'
          }} />
          
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <FiFileText style={{ marginRight: '12px', fontSize: '24px' }} />
              <h2 className="transaction-modal-title" style={{
                margin: 0,
                fontSize: '24px',
                fontWeight: '600',
                color: 'white'
              }}>
                {modalTitle}
              </h2>
            </div>
            <p style={{
              margin: 0,
              fontSize: '16px',
              opacity: 0.9,
              fontWeight: '400'
            }}>
              Upload transactions from {bankName}
            </p>
          </div>
          
          <button 
            className="transaction-modal-close" 
            onClick={handleClose}
            disabled={isLoadingUpload}
            style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '18px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              zIndex: 2
            }}
            onMouseEnter={(e) => {
              e.target.style.background = 'rgba(255,255,255,0.3)';
              e.target.style.transform = 'scale(1.1)';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'rgba(255,255,255,0.2)';
              e.target.style.transform = 'scale(1)';
            }}
          >
            <FiX />
          </button>
        </div>

        {/* Modal Body */}
        <div className="transaction-modal-body" style={{ padding: '35px 30px' }}>
          <div className="upload-controls-modal">
            {/* Currency Selection */}
            <div className="form-group" style={{ marginBottom: '30px' }}>
              <label 
                htmlFor="currency-selector-modal" 
                style={{ 
                  display: 'block', 
                  marginBottom: '12px', 
                  fontSize: '16px',
                  fontWeight: '600',
                  color: 'var(--deep-navy)',
                  letterSpacing: '-0.01em'
                }}
              >
                Account Currency
              </label>
              <div style={{ position: 'relative' }}>
                <select
                  id="currency-selector-modal"
                  value={accountBaseCurrency}
                  onChange={(e) => setAccountBaseCurrency(e.target.value)}
                  disabled={isLoadingUpload}
                  style={{ 
                    width: '100%',
                    padding: '16px 20px', 
                    borderRadius: '12px', 
                    border: '2px solid #e1e5e9', 
                    fontSize: '16px',
                    fontWeight: '500',
                    backgroundColor: 'white',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    appearance: 'none',
                    backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3e%3c/svg%3e")`,
                    backgroundPosition: 'right 16px center',
                    backgroundRepeat: 'no-repeat',
                    backgroundSize: '16px'
                  }}
                  onFocus={(e) => {
                    e.target.style.borderColor = 'var(--teal)';
                    e.target.style.boxShadow = '0 0 0 3px rgba(32, 178, 170, 0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '#e1e5e9';
                    e.target.style.boxShadow = 'none';
                  }}
                >
                  {availableCurrencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ 
                fontSize: '14px', 
                color: '#6b7280', 
                marginTop: '8px',
                lineHeight: '1.5'
              }}>
                Select the base currency of your {bankName} account
              </div>
            </div>

            {/* File Upload */}
            <div className="form-group" style={{ marginBottom: '30px' }}>
              <label 
                htmlFor="csv-upload-modal-input" 
                style={{ 
                  display: 'block', 
                  marginBottom: '12px', 
                  fontSize: '16px',
                  fontWeight: '600',
                  color: 'var(--deep-navy)',
                  letterSpacing: '-0.01em'
                }}
              >
                Transaction File
              </label>
              
              <div style={{ position: 'relative' }}>
                <input 
                  id="csv-upload-modal-input" 
                  type="file" 
                  accept=".csv" 
                  onChange={handleFileChange} 
                  disabled={isLoadingUpload}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    border: '2px dashed #e1e5e9',
                    borderRadius: '12px',
                    fontSize: '16px',
                    backgroundColor: '#f8f9fa',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoadingUpload) {
                      e.target.style.borderColor = 'var(--teal)';
                      e.target.style.backgroundColor = 'rgba(32, 178, 170, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.borderColor = '#e1e5e9';
                    e.target.style.backgroundColor = '#f8f9fa';
                  }}
                />
                
                {selectedFile && (
                  <div style={{ 
                    marginTop: '12px',
                    padding: '12px 16px',
                    backgroundColor: 'rgba(32, 178, 170, 0.1)',
                    border: '1px solid rgba(32, 178, 170, 0.2)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px'
                  }}>
                    <FiFileText style={{ color: 'var(--teal)', fontSize: '18px' }} />
                    <div>
                      <div style={{ 
                        fontSize: '14px', 
                        fontWeight: '600',
                        color: 'var(--teal-darkest)'
                      }}>
                        {selectedFile.name}
                      </div>
                      <div style={{ 
                        fontSize: '12px', 
                        color: '#6b7280'
                      }}>
                        {(selectedFile.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              <div style={{ 
                fontSize: '14px', 
                color: '#6b7280', 
                marginTop: '8px',
                lineHeight: '1.5'
              }}>
                Upload a CSV file exported from your {bankName} account
              </div>
            </div>

            {/* Upload Button */}
            <button 
              onClick={handleUpload} 
              disabled={!selectedFile || isLoadingUpload}
              style={{ 
                width: '100%',
                padding: '16px 24px',
                background: !selectedFile || isLoadingUpload 
                  ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
                  : 'linear-gradient(135deg, var(--teal) 0%, #20b2aa 100%)',
                border: 'none',
                borderRadius: '12px',
                color: 'white',
                fontSize: '16px',
                fontWeight: '600',
                cursor: !selectedFile || isLoadingUpload ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                transition: 'all 0.2s ease',
                boxShadow: !selectedFile || isLoadingUpload 
                  ? 'none'
                  : '0 4px 15px rgba(32, 178, 170, 0.3)'
              }}
              onMouseEnter={(e) => {
                if (!(!selectedFile || isLoadingUpload)) {
                  e.target.style.transform = 'translateY(-2px)';
                  e.target.style.boxShadow = '0 6px 20px rgba(32, 178, 170, 0.4)';
                }
              }}
              onMouseLeave={(e) => {
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = !selectedFile || isLoadingUpload 
                  ? 'none'
                  : '0 4px 15px rgba(32, 178, 170, 0.3)';
              }}
            >
              {isLoadingUpload ? (
                <>
                  <FiLoader className="button-icon" style={{ 
                    animation: 'spin 1s linear infinite',
                    fontSize: '18px'
                  }}/> 
                  Uploading...
                </>
              ) : (
                <>
                  <FiUpload className="button-icon" style={{ fontSize: '18px' }}/> 
                  Upload Transactions
                </>
              )}
            </button>
          </div>

          {/* Feedback Messages */}
          {uploadError && (
            <div style={{ 
              marginTop: '20px',
              padding: '16px 20px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <FiAlertCircle style={{ 
                color: '#dc2626', 
                fontSize: '20px',
                marginTop: '2px',
                flexShrink: 0
              }} />
              <div>
                <div style={{ 
                  fontWeight: '600',
                  color: '#dc2626',
                  marginBottom: '4px'
                }}>
                  Upload Failed
                </div>
                <div style={{ 
                  color: '#991b1b',
                  fontSize: '14px',
                  lineHeight: '1.5'
                }}>
                  {uploadError}
                </div>
              </div>
            </div>
          )}
          
          {uploadSuccess && (
            <div style={{ 
              marginTop: '20px',
              padding: '16px 20px',
              backgroundColor: '#f0fdf4',
              border: '1px solid #bbf7d0',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <FiCheckCircle style={{ 
                color: '#16a34a', 
                fontSize: '20px',
                marginTop: '2px',
                flexShrink: 0
              }} />
              <div>
                <div style={{ 
                  fontWeight: '600',
                  color: '#16a34a',
                  marginBottom: '4px'
                }}>
                  Upload Successful!
                </div>
                <div style={{ 
                  color: '#15803d',
                  fontSize: '14px',
                  lineHeight: '1.5'
                }}>
                  {uploadSuccess.message}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

CSVUploadModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
  bankName: PropTypes.string,
  defaultCurrency: PropTypes.string,
  modalTitle: PropTypes.string,
};

export default CSVUploadModal; 