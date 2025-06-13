import React, { useState } from 'react';
import { FiX, FiCheck, FiLoader, FiAlertCircle, FiCheckCircle } from 'react-icons/fi';
import vendorRuleService from '../../services/vendorRules';
import vendorService from '../../services/vendors';
import VendorRuleConflictModal from './VendorRuleConflictModal';
import './VendorRuleModal.css';

const VendorRuleModal = ({ 
    isOpen, 
    onClose, 
    vendorName, 
    categoryName, 
    vendorId, 
    categoryId,
    onRuleCreated 
}) => {
    const [isCreating, setIsCreating] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const [conflictModal, setConflictModal] = useState({
        isOpen: false,
        conflictData: null
    });

    const handleConfirm = async () => {
        if (!categoryId) {
            setError('Missing category information');
            return;
        }

        if (!vendorName) {
            setError('Missing vendor name');
            return;
        }

        setIsCreating(true);
        setError(null);

        try {
            let finalVendorId = vendorId;

            // If vendorId is null, we need to create or find the vendor first
            if (!vendorId) {
                try {
                    // Try to create the vendor (API will handle duplicates)
                    const vendorResponse = await vendorService.createVendor({
                        name: vendorName
                    });
                    finalVendorId = vendorResponse.id;
                } catch (vendorError) {
                    // If vendor creation fails due to duplicate, try to find existing vendor
                    if (vendorError.message && vendorError.message.includes('already exists')) {
                        try {
                            const vendors = await vendorService.getVendors();
                            const existingVendor = vendors.find(v => v.name === vendorName);
                            if (existingVendor) {
                                finalVendorId = existingVendor.id;
                            } else {
                                throw new Error('Vendor creation failed and could not find existing vendor');
                            }
                        } catch (findError) {
                            throw new Error('Failed to create or find vendor: ' + findError.message);
                        }
                    } else {
                        throw vendorError;
                    }
                }
            }

            const ruleData = {
                vendor: finalVendorId,
                category: categoryId,
                is_persistent: true,
                priority: 1
            };

            const response = await vendorRuleService.createVendorRule(ruleData);
            
            setSuccess(true);
            
            // Call the callback to notify parent component
            if (onRuleCreated) {
                onRuleCreated(response);
            }

            // Auto-close after success
            setTimeout(() => {
                handleClose();
            }, 1500);

        } catch (err) {
            console.error('Error creating vendor rule:', err);
            
            // Check if this is a conflict (409) response
            if (err.response?.status === 409) {
                setConflictModal({
                    isOpen: true,
                    conflictData: err.response.data
                });
            } else {
                setError(err.response?.data?.error || err.message || 'Failed to create vendor rule');
            }
        } finally {
            setIsCreating(false);
        }
    };

    const handleClose = () => {
        setError(null);
        setSuccess(false);
        setIsCreating(false);
        setConflictModal({ isOpen: false, conflictData: null });
        onClose();
    };

    const handleCancel = () => {
        if (!isCreating) {
            handleClose();
        }
    };

    const handleConflictResolved = (result) => {
        setConflictModal({ isOpen: false, conflictData: null });
        
        if (result.action === 'replaced' || result.action === 'kept') {
            setSuccess(true);
            
            // Call the callback to notify parent component
            if (onRuleCreated) {
                onRuleCreated(result);
            }

            // Auto-close after success
            setTimeout(() => {
                handleClose();
            }, 1500);
        }
    };

    const handleConflictModalClose = () => {
        setConflictModal({ isOpen: false, conflictData: null });
    };

    if (!isOpen) return null;

    return (
        <>
            <div className="vendor-rule-modal-overlay" onClick={handleClose}>
                <div className="vendor-rule-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="vendor-rule-modal-header">
                        <h3>Create Vendor Rule</h3>
                        <button 
                            className="vendor-rule-modal-close"
                            onClick={handleCancel}
                            disabled={isCreating}
                        >
                            <FiX />
                        </button>
                    </div>

                    <div className="vendor-rule-modal-content">
                        {success ? (
                            <div className="vendor-rule-success">
                                <FiCheckCircle className="success-icon" />
                                <p>Vendor rule created successfully!</p>
                                <p className="success-details">
                                    <strong>{vendorName}</strong> will now be automatically assigned to <strong>{categoryName}</strong>
                                </p>
                            </div>
                        ) : (
                            <>
                                <div className="vendor-rule-question">
                                    <p>Should <strong>{vendorName}</strong> always be auto-assigned to <strong>{categoryName}</strong>?</p>
                                    <p className="vendor-rule-explanation">
                                        This will create a rule that automatically categorizes future transactions from this vendor.
                                    </p>
                                </div>

                                {error && (
                                    <div className="vendor-rule-error">
                                        <FiAlertCircle />
                                        <span>{error}</span>
                                    </div>
                                )}

                                <div className="vendor-rule-actions">
                                    <button 
                                        className="vendor-rule-cancel"
                                        onClick={handleCancel}
                                        disabled={isCreating}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        className="vendor-rule-confirm"
                                        onClick={handleConfirm}
                                        disabled={isCreating}
                                    >
                                        {isCreating ? (
                                            <>
                                                <FiLoader className="spinner" />
                                                Creating Rule...
                                            </>
                                        ) : (
                                            <>
                                                <FiCheck />
                                                Create Rule
                                            </>
                                        )}
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <VendorRuleConflictModal
                isOpen={conflictModal.isOpen}
                onClose={handleConflictModalClose}
                conflictData={conflictModal.conflictData}
                onResolved={handleConflictResolved}
            />
        </>
    );
};

export default VendorRuleModal; 