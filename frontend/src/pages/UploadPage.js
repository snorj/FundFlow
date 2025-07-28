import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css'; // We can reuse the dashboard CSS for now or create a new one
import { FiEdit, FiPlus, FiCheckCircle } from 'react-icons/fi';
import transactionService from '../services/transactions';
import integrationsService from '../services/integrations';
import AddTransactionModal from '../components/transactions/AddTransactionModal';
import CSVUploadModal from '../components/transactions/CSVUploadModal';
import UpBankModal from '../components/transactions/UpBankModal';

// Import bank logos
import ingLogo from '../assets/bank_logos/ing.png';
import upBankLogo from '../assets/bank_logos/upBank.png';
import commBankLogo from '../assets/bank_logos/Commonwealth Bank of Australia_idow7DUGyL_1.png';
import westpacLogo from '../assets/bank_logos/westpac.png';
import anzLogo from '../assets/bank_logos/ANZ_idgCH6o_Ov_1.png';
import nabLogo from '../assets/bank_logos/National Australia Bank - NAB_idE9SSUJFU_1.png';
import revolutLogo from '../assets/bank_logos/revolut.png';
import paypalLogo from '../assets/bank_logos/PayPal_Symbol_Alternative_1.png';
import wiseLogo from '../assets/bank_logos/Wise_Logo_1.png';

const UploadPage = () => {
  const [hasUncategorized, setHasUncategorized] = useState(false);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(true);
  
  // Modal states
  const [isAddTransactionModalOpen, setIsAddTransactionModalOpen] = useState(false);
  const [isCSVModalOpen, setIsCSVModalOpen] = useState(false);
  const [isUpModalOpen, setIsUpModalOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState(null);

  // Bank connection states
  const [connectedBanks, setConnectedBanks] = useState({
    up: false,
    ing: false,
    demo: false
  });
  const [bankUsageHistory, setBankUsageHistory] = useState({
    up: null,
    ing: null,
    demo: null
  });

  const navigate = useNavigate();

  // Available banks configuration
  const supportedBanks = [
    {
      id: 'ing',
      name: 'ING',
      logo: ingLogo,
      defaultCurrency: 'EUR',
      type: 'csv',
      isActive: true
    },
    {
      id: 'up',
      name: 'UP Bank',
      logo: upBankLogo,
      defaultCurrency: 'AUD',
      type: 'api',
      isActive: true
    },
    {
      id: 'demo',
      name: 'Demo',
      logo: null, // We'll use a placeholder for demo
      defaultCurrency: 'AUD',
      type: 'csv',
      isActive: true
    }
  ];

  const comingSoonBanks = [
    { id: 'commbank', name: 'CommBank', logo: commBankLogo },
    { id: 'westpac', name: 'Westpac', logo: westpacLogo },
    { id: 'anz', name: 'ANZ', logo: anzLogo },
    { id: 'nab', name: 'NAB', logo: nabLogo },
    { id: 'revolut', name: 'Revolut', logo: revolutLogo },
    { id: 'paypal', name: 'PayPal', logo: paypalLogo },
    { id: 'wise', name: 'Wise', logo: wiseLogo }
  ];

  // Load initial data
  const loadUploadPageData = useCallback(async (showLoading = true) => {
    console.log("Loading upload page data...");
    if (showLoading) {
      setIsLoadingTransactions(true);
    }
    setHasUncategorized(false);

    try {
      // Check for uncategorized transactions
      const uncategorizedExists = await transactionService.checkUncategorizedExists();
      setHasUncategorized(uncategorizedExists);
      
      // Check UP connection status
      try {
        const upStatus = await integrationsService.checkUpLinkStatus();
        setConnectedBanks(prev => ({ ...prev, up: upStatus?.is_linked || false }));
      } catch (error) {
        console.error("Error checking Up status:", error);
        setConnectedBanks(prev => ({ ...prev, up: false }));
      }

    } catch (err) {
      console.error("Fetch Upload Page Data Error:", err);
      setHasUncategorized(false);
    } finally {
      if (showLoading) {
        setIsLoadingTransactions(false);
      }
    }
  }, []);

  useEffect(() => {
    loadUploadPageData();
  }, [loadUploadPageData]);

  // Modal handlers
  const handleOpenAddTransactionModal = () => {
    setIsAddTransactionModalOpen(true);
  };

  const handleCloseAddTransactionModal = () => {
    setIsAddTransactionModalOpen(false);
  };

  const handleTransactionSuccess = () => {
    console.log('Manual transaction created successfully');
    loadUploadPageData(false);
  };

  // Bank selection handlers
  const handleBankClick = (bank) => {
    if (!bank.isActive) return;
    
    setSelectedBank(bank);
    
    if (bank.type === 'csv') {
      setIsCSVModalOpen(true);
    } else if (bank.type === 'api' && bank.id === 'up') {
      setIsUpModalOpen(true);
    }
  };

  const handleCSVUploadSuccess = (response) => {
    console.log('CSV upload successful:', response);
    // Mark bank as used
    setBankUsageHistory(prev => ({
      ...prev,
      [selectedBank.id]: {
        lastUpload: new Date().toISOString(),
        message: response.message
      }
    }));
    loadUploadPageData(false);
  };

  const handleUpBankSuccess = (result) => {
    console.log('UP Bank sync successful:', result);
    // Mark UP as connected and used
    setConnectedBanks(prev => ({ ...prev, up: true }));
    setBankUsageHistory(prev => ({
      ...prev,
      up: {
        lastSync: new Date().toISOString(),
        message: result.message
      }
    }));
    loadUploadPageData(false);
  };

  // Navigation handler
  const goToCategorizeTransactions = () => navigate('/categorise/transactions');

  return (
    <div className="dashboard-page">
      {/* Supported Banks Section */}
      <div className="upload-section card-style">
        <h2 className="section-title">Supported Banks</h2>
        <p style={{ 
          marginBottom: '25px', 
          color: '#666', 
          fontSize: '14px',
          lineHeight: '1.5'
        }}>
          Connect your bank account or upload transaction files from these supported institutions.
        </p>
        
        <div className="banks-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '20px',
          marginBottom: '30px'
        }}>
          {/* Active Banks */}
          {supportedBanks.map((bank) => (
            <div
              key={bank.id}
              className="bank-card"
              onClick={() => handleBankClick(bank)}
              style={{
                padding: '20px',
                border: '2px solid #e1e5e9',
                borderRadius: '12px',
                backgroundColor: 'white',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                textAlign: 'center',
                position: 'relative',
                ':hover': {
                  borderColor: 'var(--teal)',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 4px 15px rgba(0,0,0,0.1)'
                }
              }}
              onMouseEnter={(e) => {
                e.target.style.borderColor = 'var(--teal)';
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 4px 15px rgba(0,0,0,0.1)';
              }}
              onMouseLeave={(e) => {
                e.target.style.borderColor = '#e1e5e9';
                e.target.style.transform = 'translateY(0)';
                e.target.style.boxShadow = 'none';
              }}
            >
              {/* Connection/Usage Status Indicator */}
              {(connectedBanks[bank.id] || bankUsageHistory[bank.id]) && (
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  color: 'var(--teal)',
                  fontSize: '16px'
                }}>
                  <FiCheckCircle />
                </div>
              )}
              
              <div className="bank-logo" style={{
                height: '60px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '15px'
              }}>
                {bank.logo ? (
                  <img 
                    src={bank.logo} 
                    alt={`${bank.name} logo`}
                    style={{
                      maxHeight: '50px',
                      maxWidth: '120px',
                      objectFit: 'contain'
                    }}
                  />
                ) : (
                  <div style={{
                    width: '80px',
                    height: '50px',
                    backgroundColor: 'var(--light-gray)',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: 'var(--deep-navy)'
                  }}>
                    {bank.name}
                  </div>
                )}
              </div>
              
              <h3 style={{
                margin: '0 0 8px 0',
                fontSize: '16px',
                fontWeight: '600',
                color: 'var(--deep-navy)'
              }}>
                {bank.name}
              </h3>
              
              <p style={{
                margin: '0',
                fontSize: '12px',
                color: '#666'
              }}>
                {bank.type === 'csv' ? 'CSV Upload' : 'API Integration'}
              </p>

              {/* Usage History Display */}
              {bankUsageHistory[bank.id] && (
                <div style={{
                  marginTop: '10px',
                  padding: '8px',
                  backgroundColor: 'var(--teal-lighter)',
                  borderRadius: '6px',
                  fontSize: '11px',
                  color: 'var(--teal-darkest)'
                }}>
                  Last used: {new Date(
                    bankUsageHistory[bank.id].lastUpload || bankUsageHistory[bank.id].lastSync
                  ).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Coming Soon Banks */}
        <div style={{ marginTop: '40px' }}>
          <h3 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: 'var(--deep-navy)',
            marginBottom: '15px'
          }}>
            Coming Soon
          </h3>
          <div className="banks-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '15px'
          }}>
            {comingSoonBanks.map((bank) => (
              <div
                key={bank.id}
                className="bank-card coming-soon"
                style={{
                  padding: '15px',
                  border: '2px solid #f0f0f0',
                  borderRadius: '12px',
                  backgroundColor: '#fafafa',
                  textAlign: 'center',
                  opacity: '0.6',
                  cursor: 'not-allowed'
                }}
              >
                <div className="bank-logo" style={{
                  height: '40px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px'
                }}>
                  <img 
                    src={bank.logo} 
                    alt={`${bank.name} logo`}
                    style={{
                      maxHeight: '35px',
                      maxWidth: '80px',
                      objectFit: 'contain',
                      filter: 'grayscale(100%)'
                    }}
                  />
                </div>
                <h4 style={{
                  margin: '0 0 5px 0',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#999'
                }}>
                  {bank.name}
                </h4>
                <p style={{
                  margin: '0',
                  fontSize: '11px',
                  color: '#aaa'
                }}>
                  Coming Soon
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Manual Upload Section */}
      <div className="manual-upload-section card-style">
        <h2 className="section-title">Manual Upload</h2>
        <p style={{ 
          marginBottom: '20px', 
          color: '#666', 
          fontSize: '14px',
          lineHeight: '1.5'
        }}>
          Add transactions manually if you don't have a CSV file or want to record a quick transaction.
        </p>
        
        <button 
          onClick={handleOpenAddTransactionModal} 
          className="action-button plain-button add-transaction-button"
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            gap: '8px',
            padding: '15px 20px',
            backgroundColor: '#f8f9fa',
            border: '2px dashed #ddd',
            borderRadius: '8px',
            color: '#333',
            transition: 'all 0.2s ease',
            width: '100%',
            maxWidth: '300px',
            fontSize: '14px',
            fontWeight: '500'
          }}
          onMouseEnter={(e) => {
            e.target.style.borderColor = 'var(--teal)';
            e.target.style.backgroundColor = 'var(--teal-lighter)';
          }}
          onMouseLeave={(e) => {
            e.target.style.borderColor = '#ddd';
            e.target.style.backgroundColor = '#f8f9fa';
          }}
        >
          <FiPlus className="button-icon" />
          Add Manual Transaction
        </button>
      </div>

      {/* Categorization Prompt */}
      {hasUncategorized && !isLoadingTransactions && (
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

      {/* Modals */}
      <AddTransactionModal 
        isOpen={isAddTransactionModalOpen}
        onClose={handleCloseAddTransactionModal}
        onSuccess={handleTransactionSuccess}
        size="lg"
      />

      <CSVUploadModal
        isOpen={isCSVModalOpen}
        onClose={() => setIsCSVModalOpen(false)}
        onSuccess={handleCSVUploadSuccess}
        bankName={selectedBank?.name || 'Bank'}
        defaultCurrency={selectedBank?.defaultCurrency || 'EUR'}
        modalTitle="Upload CSV"
      />

      <UpBankModal
        isOpen={isUpModalOpen}
        onClose={() => setIsUpModalOpen(false)}
        onSuccess={handleUpBankSuccess}
        modalTitle="UP Bank Integration"
      />
    </div>
  );
};

export default UploadPage; 