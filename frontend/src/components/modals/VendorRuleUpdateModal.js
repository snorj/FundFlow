import React, { useState } from 'react';
import vendorRuleService from '../../services/vendorRules';
import './VendorRuleUpdateModal.css';

const VendorRuleUpdateModal = ({ 
    isOpen, 
    onClose, 
    vendorName,
    oldCategoryName,
    newCategoryName,
    existingRule,
    newCategoryId,
    onRuleUpdated,
    isChecking = false
}) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);

    if (!isOpen) return null;

    // Show loading state while checking for rules
    if (isChecking) {
        return (
            <div className="vendor-rule-update-modal-overlay">
                <div className="vendor-rule-update-modal" onClick={(e) => e.stopPropagation()}>
                    <div className="vendor-rule-update-modal-header">
                        <h3>Checking Vendor Rules</h3>
                    </div>
                    <div className="vendor-rule-update-modal-content">
                        <div className="checking-state">
                            <div className="loading-spinner"></div>
                            <p>Checking for existing vendor rules...</p>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Don't render the main modal if no existing rule
    if (!existingRule) return null;

    const handleUpdateRule = async () => {
        setIsProcessing(true);
        setError(null);

        try {
            const updatedRule = await vendorRuleService.updateVendorRule(existingRule.id, {
                category: newCategoryId,
                priority: existingRule.priority,
                is_persistent: existingRule.is_persistent
            });

            setSuccess(true);
            
            if (onRuleUpdated) {
                onRuleUpdated({
                    action: 'updated',
                    rule: updatedRule,
                    message: `Updated vendor rule for ${vendorName}`
                });
            }

            // Auto-close after success
            setTimeout(() => {
                handleClose();
            }, 1500);

        } catch (err) {
            console.error('Error updating vendor rule:', err);
            setError(err.response?.data?.error || 'Failed to update vendor rule');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleKeepRule = () => {
        if (onRuleUpdated) {
            onRuleUpdated({
                action: 'kept',
                rule: existingRule,
                message: `Kept existing vendor rule for ${vendorName}`
            });
        }
        handleClose();
    };

    const handleRemoveRule = async () => {
        setIsProcessing(true);
        setError(null);

        try {
            await vendorRuleService.deleteVendorRule(existingRule.id);

            setSuccess(true);
            
            if (onRuleUpdated) {
                onRuleUpdated({
                    action: 'removed',
                    rule: existingRule,
                    message: `Removed vendor rule for ${vendorName}`
                });
            }

            // Auto-close after success
            setTimeout(() => {
                handleClose();
            }, 1500);

        } catch (err) {
            console.error('Error removing vendor rule:', err);
            setError(err.response?.data?.error || 'Failed to remove vendor rule');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClose = () => {
        setSuccess(false);
        setError(null);
        setIsProcessing(false);
        onClose();
    };

    return (
        <div className="vendor-rule-update-modal-overlay" onClick={handleClose}>
            <div className="vendor-rule-update-modal" onClick={(e) => e.stopPropagation()}>
                <div className="vendor-rule-update-modal-header">
                    <h3>Update Vendor Rule</h3>
                    <button 
                        className="vendor-rule-update-modal-close"
                        onClick={handleClose}
                        disabled={isProcessing}
                    >
                        ×
                    </button>
                </div>

                <div className="vendor-rule-update-modal-content">
                    {success ? (
                        <div className="success-state">
                            <div className="success-icon">✓</div>
                            <p>Vendor rule updated successfully!</p>
                        </div>
                    ) : (
                        <>
                            <div className="rule-update-question">
                                <p>
                                    <strong>{vendorName}</strong> was moved from <strong>{oldCategoryName}</strong> to <strong>{newCategoryName}</strong>.
                                </p>
                                <p>
                                    An auto-assignment rule exists for this vendor. What would you like to do?
                                </p>
                            </div>

                            <div className="existing-rule-info">
                                <h4>Current Rule:</h4>
                                <div className="rule-details">
                                    <p><strong>Vendor:</strong> {vendorName}</p>
                                    <p><strong>Category:</strong> {oldCategoryName}</p>
                                    <p><strong>Priority:</strong> {existingRule.priority}</p>
                                    <p><strong>Persistent:</strong> {existingRule.is_persistent ? 'Yes' : 'No'}</p>
                                </div>
                            </div>

                            {error && (
                                <div className="error-message">
                                    <p>{error}</p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {!success && (
                    <div className="vendor-rule-update-modal-actions">
                        <button
                            className="btn btn-secondary"
                            onClick={handleClose}
                            disabled={isProcessing}
                        >
                            Cancel
                        </button>
                        <button
                            className="btn btn-warning"
                            onClick={handleRemoveRule}
                            disabled={isProcessing}
                        >
                            {isProcessing ? 'Removing...' : 'Remove Rule'}
                        </button>
                        <button
                            className="btn btn-secondary"
                            onClick={handleKeepRule}
                            disabled={isProcessing}
                        >
                            Keep Old Rule
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={handleUpdateRule}
                            disabled={isProcessing}
                        >
                            {isProcessing ? 'Updating...' : 'Update to New Category'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VendorRuleUpdateModal; 