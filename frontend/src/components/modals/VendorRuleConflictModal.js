import React, { useState } from 'react';
import vendorRuleService from '../../services/vendorRules';
import './VendorRuleConflictModal.css';

const VendorRuleConflictModal = ({ 
    isOpen, 
    onClose, 
    conflictData, 
    onResolved 
}) => {
    const [isResolving, setIsResolving] = useState(false);
    const [error, setError] = useState(null);

    if (!isOpen || !conflictData) return null;

    const { existing_rule, requested_rule, message } = conflictData;

    const handleResolve = async (action) => {
        setIsResolving(true);
        setError(null);

        try {
            const result = await vendorRuleService.resolveConflict(
                action,
                existing_rule.id,
                requested_rule
            );

            if (onResolved) {
                onResolved(result);
            }

            onClose();
        } catch (err) {
            console.error('Error resolving conflict:', err);
            setError(err.response?.data?.error || 'Failed to resolve conflict');
        } finally {
            setIsResolving(false);
        }
    };

    const handleKeep = () => handleResolve('keep');
    const handleReplace = () => handleResolve('replace');

    return (
        <div className="vendor-rule-conflict-modal-overlay" onClick={onClose}>
            <div className="vendor-rule-conflict-modal" onClick={(e) => e.stopPropagation()}>
                <div className="vendor-rule-conflict-modal-header">
                    <h3>Vendor Rule Conflict</h3>
                    <button 
                        className="vendor-rule-conflict-modal-close"
                        onClick={onClose}
                        disabled={isResolving}
                    >
                        ×
                    </button>
                </div>

                <div className="vendor-rule-conflict-modal-content">
                    <div className="conflict-message">
                        <p>{message}</p>
                    </div>

                    <div className="conflict-details">
                        <div className="existing-rule">
                            <h4>Existing Rule</h4>
                            <div className="rule-info">
                                <p><strong>Vendor:</strong> {existing_rule.vendor_name}</p>
                                <p><strong>Category:</strong> {existing_rule.category_name}</p>
                                <p><strong>Priority:</strong> {existing_rule.priority}</p>
                                <p><strong>Persistent:</strong> {existing_rule.is_persistent ? 'Yes' : 'No'}</p>
                            </div>
                        </div>

                        <div className="vs-divider">
                            <span>VS</span>
                        </div>

                        <div className="new-rule">
                            <h4>New Rule</h4>
                            <div className="rule-info">
                                <p><strong>Vendor:</strong> {existing_rule.vendor_name}</p>
                                <p><strong>Category:</strong> (New category)</p>
                                <p><strong>Priority:</strong> {requested_rule.priority}</p>
                                <p><strong>Persistent:</strong> {requested_rule.is_persistent ? 'Yes' : 'No'}</p>
                            </div>
                        </div>
                    </div>

                    {error && (
                        <div className="conflict-error">
                            <p>{error}</p>
                        </div>
                    )}
                </div>

                <div className="vendor-rule-conflict-modal-actions">
                    <button
                        className="btn btn-secondary"
                        onClick={onClose}
                        disabled={isResolving}
                    >
                        Cancel
                    </button>
                    <button
                        className="btn btn-outline"
                        onClick={handleKeep}
                        disabled={isResolving}
                    >
                        {isResolving ? 'Processing...' : 'Keep Existing'}
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleReplace}
                        disabled={isResolving}
                    >
                        {isResolving ? 'Processing...' : 'Replace with New'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default VendorRuleConflictModal; 