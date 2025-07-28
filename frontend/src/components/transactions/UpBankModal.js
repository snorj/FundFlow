import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import './AddTransactionModal.css'; // Reuse existing modal styles
import { 
  FiX, FiLoader, FiCheckCircle, FiAlertCircle, FiKey, FiLink, 
  FiRefreshCw, FiTrash2, FiClock, FiCalendar
} from 'react-icons/fi';
import integrationsService from '../../services/integrations';

// Helper to get date strings in YYYY-MM-DD format
const toYYYYMMDD = (date) => {
  return date.toISOString().split('T')[0];
};

const UpBankModal = ({
  isOpen,
  onClose,
  onSuccess,
  modalTitle = 'UP Bank Integration'
}) => {
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
  const [conversionFailures, setConversionFailures] = useState([]);

  // Date range selection state
  const [selectedRangeType, setSelectedRangeType] = useState('last_7_days');
  const [syncSinceDate, setSyncSinceDate] = useState('');
  const [syncUntilDate, setSyncUntilDate] = useState('');

  const checkLinkStatus = async () => {
    setIsLoadingUpStatus(true);
    setSavePatError(null);
    setSavePatSuccess(null);
    setSyncError(null);
    setSyncSuccessMessage(null);
    setConversionFailures([]);
    
    try {
      const statusResult = await integrationsService.checkUpLinkStatus();
      setIsUpLinked(statusResult?.is_linked || false);
    } catch (error) {
      setIsUpLinked(false);
      console.error("Error checking Up link status:", error);
    } finally {
      setIsLoadingUpStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkLinkStatus();
    }
  }, [isOpen]);

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
    if (!window.confirm("Are you sure you want to remove the link to your Up Bank account? This will delete the stored access token.")) {
      return;
    }
    
    setIsRemovingLink(true);
    setSavePatError(null);
    setSavePatSuccess(null);
    setSyncError(null);
    setSyncSuccessMessage(null);
    setConversionFailures([]);
    
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
    setConversionFailures([]);

    // Date range logic
    let since = null;
    let until = null;

    if (selectedRangeType !== 'custom') {
      const now = new Date();
      const dayMap = {
        'last_7_days': 7,
        'last_30_days': 30,
        'last_90_days': 90,
      };
      const days = dayMap[selectedRangeType];
      if (days) {
        const sinceDate = new Date(now);
        sinceDate.setDate(sinceDate.getDate() - days);
        since = toYYYYMMDD(sinceDate);
      }
    } else {
      since = syncSinceDate || null;
      until = syncUntilDate || null;
    }

    if (selectedRangeType === 'custom' && since && !until) {
      until = toYYYYMMDD(new Date());
    }

    try {
      const result = await integrationsService.triggerUpSync(since, until);
      setSyncSuccessMessage(result.message || "Sync completed successfully.");
      
      if (result.conversion_failures && result.conversion_failures.length > 0) {
        setConversionFailures(result.conversion_failures);
      }
      
      // Call success callback and close modal after sync
      setTimeout(() => {
        onSuccess && onSuccess(result);
        onClose();
      }, 2000);
      
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

  const handleClose = () => {
    if (!isSavingPat && !isSyncing && !isRemovingLink) {
      // Reset state when closing
      setUpPatInput('');
      setSavePatError(null);
      setSavePatSuccess(null);
      setSyncError(null);
      setSyncSuccessMessage(null);
      setConversionFailures([]);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="transaction-modal-overlay" onClick={handleClose}>
      <div 
        className="transaction-modal-content transaction-modal--lg" 
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
            background: 'linear-gradient(135deg, #ff6900 0%, #fcb900 100%)',
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
            top: '-30%',
            left: '-10%',
            width: '150px',
            height: '150px',
            background: 'rgba(255,255,255,0.1)',
            borderRadius: '50%',
            pointerEvents: 'none'
          }} />
          <div style={{
            position: 'absolute',
            bottom: '-40%',
            right: '-15%',
            width: '180px',
            height: '180px',
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '50%',
            pointerEvents: 'none'
          }} />
          
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
              <FiLink style={{ marginRight: '12px', fontSize: '24px' }} />
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
              Connect and sync your UP Bank account
            </p>
          </div>
          
          <button 
            className="transaction-modal-close" 
            onClick={handleClose}
            disabled={isSavingPat || isSyncing || isRemovingLink}
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
              cursor: isSavingPat || isSyncing || isRemovingLink ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              zIndex: 2,
              opacity: isSavingPat || isSyncing || isRemovingLink ? 0.5 : 1
            }}
            onMouseEnter={(e) => {
              if (!(isSavingPat || isSyncing || isRemovingLink)) {
                e.target.style.background = 'rgba(255,255,255,0.3)';
                e.target.style.transform = 'scale(1.1)';
              }
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
          {isLoadingUpStatus ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '40px 20px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '15px'
            }}>
              <FiLoader style={{
                fontSize: '32px',
                color: 'var(--teal)',
                animation: 'spin 1s linear infinite'
              }}/>
              <div style={{
                fontSize: '16px',
                color: '#6b7280',
                fontWeight: '500'
              }}>
                Checking connection status...
              </div>
            </div>
          ) : isUpLinked ? (
            // Linked State
            <div className="connection-status linked">
              <div style={{ 
                padding: '20px',
                backgroundColor: '#f0fdf4',
                border: '2px solid #bbf7d0',
                borderRadius: '16px',
                marginBottom: '25px',
                display: 'flex',
                alignItems: 'center',
                gap: '15px'
              }}>
                <div style={{
                  width: '50px',
                  height: '50px',
                  borderRadius: '50%',
                  backgroundColor: '#16a34a',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <FiCheckCircle style={{ color: 'white', fontSize: '24px' }}/>
                </div>
                <div>
                  <div style={{ 
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#15803d',
                    marginBottom: '4px'
                  }}>
                    UP Bank Account Connected
                  </div>
                  <div style={{ 
                    fontSize: '14px',
                    color: '#166534'
                  }}>
                    Your account is ready for transaction syncing
                  </div>
                </div>
              </div>

              {/* Success/Error Messages */}
              {savePatSuccess && !isRemovingLink && (
                <div style={{ 
                  marginBottom: '20px',
                  padding: '16px 20px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <FiCheckCircle style={{ color: '#16a34a', fontSize: '18px' }} />
                  <span style={{ color: '#15803d', fontSize: '14px' }}>{savePatSuccess}</span>
                </div>
              )}
              
              {savePatError && !isRemovingLink && (
                <div style={{ 
                  marginBottom: '20px',
                  padding: '16px 20px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <FiAlertCircle style={{ color: '#dc2626', fontSize: '18px' }} />
                  <span style={{ color: '#991b1b', fontSize: '14px' }}>{savePatError}</span>
                </div>
              )}
              
              {syncSuccessMessage && (
                <div style={{ 
                  marginBottom: '20px',
                  padding: '16px 20px',
                  backgroundColor: '#f0fdf4',
                  border: '1px solid #bbf7d0',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <FiCheckCircle style={{ color: '#16a34a', fontSize: '18px' }} />
                  <span style={{ color: '#15803d', fontSize: '14px' }}>{syncSuccessMessage}</span>
                </div>
              )}
              
              {syncError && (
                <div style={{ 
                  marginBottom: '20px',
                  padding: '16px 20px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px'
                }}>
                  <FiAlertCircle style={{ color: '#dc2626', fontSize: '18px' }} />
                  <span style={{ color: '#991b1b', fontSize: '14px' }}>{syncError}</span>
                </div>
              )}

              {/* Currency Conversion Failures Display */}
              {conversionFailures.length > 0 && (
                <div style={{ 
                  marginBottom: '25px',
                  padding: '20px', 
                  backgroundColor: '#fffbeb', 
                  border: '2px solid #fed7aa', 
                  borderRadius: '16px' 
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', marginBottom: '15px' }}>
                    <FiAlertCircle style={{ color: '#d97706', marginRight: '10px', fontSize: '20px' }} />
                    <div>
                      <div style={{ 
                        fontWeight: '600',
                        color: '#d97706',
                        fontSize: '16px'
                      }}>
                        Currency Conversion Issues
                      </div>
                      <div style={{ 
                        color: '#92400e',
                        fontSize: '14px',
                        marginTop: '2px'
                      }}>
                        Some transactions couldn't be converted to AUD
                      </div>
                    </div>
                  </div>
                  <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                    {conversionFailures.map((failure, index) => (
                      <div key={index} style={{ 
                        padding: '12px 16px', 
                        margin: '8px 0', 
                        backgroundColor: 'white', 
                        border: '1px solid #fed7aa', 
                        borderRadius: '8px',
                        fontSize: '14px'
                      }}>
                        <div style={{ fontWeight: '600', color: '#1f2937', marginBottom: '4px' }}>
                          {failure.amount} {failure.currency} on {failure.date}
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '13px', marginBottom: '4px' }}>
                          {failure.description}
                        </div>
                        <div style={{ color: '#92400e', fontSize: '12px' }}>
                          {failure.reason === 'missing_exchange_rate' 
                            ? `Exchange rate not available for ${failure.currency}`
                            : failure.reason === 'data_parsing_error'
                            ? 'Unable to parse transaction data'
                            : `Reason: ${failure.reason}`
                          }
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Date Range Selection for Sync */}
              <div style={{ 
                marginBottom: '25px',
                padding: '25px',
                backgroundColor: '#f8f9fa',
                borderRadius: '16px',
                border: '1px solid #e9ecef'
              }}>
                <div style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: '20px'
                }}>
                  <FiClock style={{ 
                    marginRight: '10px', 
                    fontSize: '20px',
                    color: 'var(--deep-navy)'
                  }} />
                  <h4 style={{ 
                    margin: 0,
                    fontSize: '18px', 
                    fontWeight: '600',
                    color: 'var(--deep-navy)'
                  }}>
                    Sync Options
                  </h4>
                </div>
                
                <div style={{ marginBottom: '20px' }}>
                  <label htmlFor="rangeType" style={{ 
                    display: 'block',
                    marginBottom: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: 'var(--deep-navy)'
                  }}>
                    Time Period
                  </label>
                  <select 
                    id="rangeType" 
                    value={selectedRangeType} 
                    onChange={(e) => setSelectedRangeType(e.target.value)}
                    disabled={isSyncing || isRemovingLink}
                    style={{ 
                      width: '100%',
                      padding: '12px 16px', 
                      borderRadius: '8px', 
                      border: '2px solid #e1e5e9',
                      fontSize: '14px',
                      fontWeight: '500',
                      backgroundColor: 'white',
                      cursor: 'pointer',
                      transition: 'border-color 0.2s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#ff6900';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e1e5e9';
                    }}
                  >
                    <option value="last_7_days">Last 7 days</option>
                    <option value="last_30_days">Last 30 days</option>
                    <option value="last_90_days">Last 90 days</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>

                {selectedRangeType === 'custom' && (
                  <div style={{ 
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '15px',
                    marginBottom: '15px'
                  }}>
                    <div>
                      <label htmlFor="syncSinceDate" style={{ 
                        display: 'block', 
                        marginBottom: '8px', 
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'var(--deep-navy)'
                      }}>
                        <FiCalendar style={{ marginRight: '6px' }} />
                        From Date
                      </label>
                      <input 
                        type="date" 
                        id="syncSinceDate" 
                        value={syncSinceDate} 
                        onChange={(e) => setSyncSinceDate(e.target.value)} 
                        disabled={isSyncing || isRemovingLink}
                        style={{ 
                          width: '100%',
                          padding: '12px 16px', 
                          borderRadius: '8px', 
                          border: '2px solid #e1e5e9',
                          fontSize: '14px',
                          backgroundColor: 'white'
                        }}
                      />
                    </div>
                    <div>
                      <label htmlFor="syncUntilDate" style={{ 
                        display: 'block', 
                        marginBottom: '8px', 
                        fontSize: '14px',
                        fontWeight: '600',
                        color: 'var(--deep-navy)'
                      }}>
                        <FiCalendar style={{ marginRight: '6px' }} />
                        To Date
                      </label>
                      <input 
                        type="date" 
                        id="syncUntilDate" 
                        value={syncUntilDate} 
                        onChange={(e) => setSyncUntilDate(e.target.value)} 
                        disabled={isSyncing || isRemovingLink}
                        style={{ 
                          width: '100%',
                          padding: '12px 16px', 
                          borderRadius: '8px', 
                          border: '2px solid #e1e5e9',
                          fontSize: '14px',
                          backgroundColor: 'white'
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '15px' }}>
                <button 
                  onClick={handleTriggerSync} 
                  disabled={isSyncing || isRemovingLink}
                  style={{ 
                    flex: 1,
                    padding: '16px 24px',
                    background: isSyncing || isRemovingLink
                      ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
                      : 'linear-gradient(135deg, #ff6900 0%, #fcb900 100%)',
                    border: 'none',
                    borderRadius: '12px',
                    color: 'white',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: isSyncing || isRemovingLink ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    transition: 'all 0.2s ease',
                    boxShadow: isSyncing || isRemovingLink
                      ? 'none'
                      : '0 4px 15px rgba(255, 105, 0, 0.3)'
                  }}
                  onMouseEnter={(e) => {
                    if (!(isSyncing || isRemovingLink)) {
                      e.target.style.transform = 'translateY(-2px)';
                      e.target.style.boxShadow = '0 6px 20px rgba(255, 105, 0, 0.4)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = isSyncing || isRemovingLink
                      ? 'none'
                      : '0 4px 15px rgba(255, 105, 0, 0.3)';
                  }}
                >
                  {isSyncing ? (
                    <>
                      <FiLoader style={{ 
                        animation: 'spin 1s linear infinite',
                        fontSize: '18px'
                      }}/> 
                      Syncing...
                    </>
                  ) : (
                    <>
                      <FiRefreshCw style={{ fontSize: '18px' }}/>
                      Sync Transactions
                    </>
                  )}
                </button>
                
                <button 
                  onClick={handleRemoveLink} 
                  disabled={isSyncing || isRemovingLink}
                  style={{ 
                    flex: 1,
                    padding: '16px 24px',
                    background: 'transparent',
                    border: '2px solid #dc2626',
                    borderRadius: '12px',
                    color: '#dc2626',
                    fontSize: '16px',
                    fontWeight: '600',
                    cursor: isSyncing || isRemovingLink ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    transition: 'all 0.2s ease',
                    opacity: isSyncing || isRemovingLink ? 0.5 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!(isSyncing || isRemovingLink)) {
                      e.target.style.backgroundColor = '#dc2626';
                      e.target.style.color = 'white';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'transparent';
                    e.target.style.color = '#dc2626';
                  }}
                >
                  {isRemovingLink ? (
                    <>
                      <FiLoader style={{ 
                        animation: 'spin 1s linear infinite',
                        fontSize: '18px'
                      }}/> 
                      Removing...
                    </>
                  ) : (
                    <>
                      <FiTrash2 style={{ fontSize: '18px' }}/>
                      Remove Connection
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : (
            // Not Linked State
            <div className="connection-status not-linked">
              <div style={{
                textAlign: 'center',
                marginBottom: '30px'
              }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  borderRadius: '50%',
                  backgroundColor: '#f3f4f6',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px',
                  border: '3px solid #e5e7eb'
                }}>
                  <FiLink style={{ fontSize: '32px', color: '#6b7280' }} />
                </div>
                <h3 style={{
                  fontSize: '20px',
                  fontWeight: '600',
                  color: 'var(--deep-navy)',
                  marginBottom: '10px'
                }}>
                  Connect Your UP Bank Account
                </h3>
                <p style={{ 
                  fontSize: '16px',
                  color: '#6b7280', 
                  lineHeight: '1.5',
                  maxWidth: '400px',
                  margin: '0 auto'
                }}>
                  Use your Personal Access Token to automatically sync transactions from your UP Bank account.
                </p>
              </div>
              
              <div style={{
                padding: '20px',
                backgroundColor: '#f8f9fa',
                borderRadius: '12px',
                marginBottom: '25px'
              }}>
                <a 
                  href="https://api.up.com.au/getting_started" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ 
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#ff6900',
                    textDecoration: 'none',
                    fontSize: '14px',
                    fontWeight: '600',
                    padding: '8px 12px',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#ff6900';
                    e.target.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = 'white';
                    e.target.style.color = '#ff6900';
                  }}
                >
                  📚 How to get your UP token
                </a>
              </div>
              
              <div className="form-group" style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  marginBottom: '12px',
                  fontSize: '16px',
                  fontWeight: '600',
                  color: 'var(--deep-navy)'
                }}>
                  Personal Access Token
                </label>
                <div style={{ position: 'relative' }}>
                  <FiKey style={{ 
                    position: 'absolute', 
                    left: '16px', 
                    top: '50%', 
                    transform: 'translateY(-50%)',
                    color: '#6b7280',
                    fontSize: '18px'
                  }}/>
                  <input
                    type="password"
                    placeholder="Paste your UP Personal Access Token here"
                    value={upPatInput}
                    onChange={handlePatInputChange}
                    disabled={isSavingPat}
                    style={{
                      width: '100%',
                      padding: '16px 20px 16px 50px',
                      border: '2px solid #e1e5e9',
                      borderRadius: '12px',
                      fontSize: '16px',
                      fontFamily: 'monospace',
                      backgroundColor: 'white',
                      transition: 'border-color 0.2s ease'
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = '#ff6900';
                      e.target.style.boxShadow = '0 0 0 3px rgba(255, 105, 0, 0.1)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = '#e1e5e9';
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>
              
              <button 
                onClick={handleSavePat} 
                disabled={isSavingPat || !upPatInput.trim()} 
                style={{ 
                  width: '100%',
                  padding: '16px 24px',
                  background: isSavingPat || !upPatInput.trim()
                    ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
                    : 'linear-gradient(135deg, #ff6900 0%, #fcb900 100%)',
                  border: 'none',
                  borderRadius: '12px',
                  color: 'white',
                  fontSize: '16px',
                  fontWeight: '600',
                  cursor: isSavingPat || !upPatInput.trim() ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '12px',
                  transition: 'all 0.2s ease',
                  boxShadow: isSavingPat || !upPatInput.trim()
                    ? 'none'
                    : '0 4px 15px rgba(255, 105, 0, 0.3)'
                }}
                onMouseEnter={(e) => {
                  if (!(isSavingPat || !upPatInput.trim())) {
                    e.target.style.transform = 'translateY(-2px)';
                    e.target.style.boxShadow = '0 6px 20px rgba(255, 105, 0, 0.4)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.target.style.transform = 'translateY(0)';
                  e.target.style.boxShadow = isSavingPat || !upPatInput.trim()
                    ? 'none'
                    : '0 4px 15px rgba(255, 105, 0, 0.3)';
                }}
              >
                {isSavingPat ? (
                  <>
                    <FiLoader style={{ 
                      animation: 'spin 1s linear infinite',
                      fontSize: '18px'
                    }}/> 
                    Connecting...
                  </>
                ) : (
                  <>
                    <FiLink style={{ fontSize: '18px' }}/>
                    Connect Account
                  </>
                )}
              </button>
              
              {savePatError && (
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
                      Connection Failed
                    </div>
                    <div style={{ 
                      color: '#991b1b',
                      fontSize: '14px',
                      lineHeight: '1.5'
                    }}>
                      {savePatError}
                    </div>
                  </div>
                </div>
              )}
              
              {savePatSuccess && (
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
                      Connection Successful!
                    </div>
                    <div style={{ 
                      color: '#15803d',
                      fontSize: '14px',
                      lineHeight: '1.5'
                    }}>
                      {savePatSuccess}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

UpBankModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSuccess: PropTypes.func,
  modalTitle: PropTypes.string,
};

export default UpBankModal; 