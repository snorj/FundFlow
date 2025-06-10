import React from 'react';
import { FiX, FiDollarSign, FiCalendar, FiTag, FiUser, FiCreditCard } from 'react-icons/fi';
import { formatDate, formatCurrency } from '../../utils/formatting';
import './TransactionDetailsModal.css';

const TransactionDetailsModal = ({ 
    isOpen, 
    onClose, 
    transaction
}) => {

    if (!isOpen || !transaction) return null;

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="transaction-details-modal" onClick={e => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Transaction Details</h2>
                    <button className="close-button" onClick={onClose}>
                        <FiX />
                    </button>
                </div>

                <div className="modal-content">
                    {/* Primary Information */}
                    <div className="detail-section">
                        <div className="detail-row">
                            <div className="detail-label">
                                <FiUser />
                                <span>Vendor/Description</span>
                            </div>
                            <div className="detail-value">
                                {transaction.description}
                            </div>
                        </div>

                        <div className="detail-row">
                            <div className="detail-label">
                                <FiDollarSign />
                                <span>Amount</span>
                            </div>
                            <div className="detail-value">
                                <span className={`amount amount-${transaction.direction?.toLowerCase()}`}>
                                    {formatCurrency(transaction.amount || transaction.original_amount, transaction.direction, transaction.currency || transaction.original_currency)}
                                </span>
                            </div>
                        </div>

                        <div className="detail-row">
                            <div className="detail-label">
                                <FiCalendar />
                                <span>Date</span>
                            </div>
                            <div className="detail-value">
                                {formatDate(transaction.date || transaction.transaction_date)}
                            </div>
                        </div>

                        {(transaction.category || transaction.category_id) && (
                            <div className="detail-row">
                                <div className="detail-label">
                                    <FiTag />
                                    <span>Category</span>
                                </div>
                                <div className="detail-value">
                                    {transaction.category?.name || 'Categorized'}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* More Info Section */}
                    <div className="detail-section">
                        <h3 className="section-title">More Info</h3>
                        
                        <div className="detail-row">
                            <div className="detail-label">
                                <FiCreditCard />
                                <span>Currency</span>
                            </div>
                            <div className="detail-value">
                                {transaction.currency || transaction.original_currency || 'AUD'}
                            </div>
                        </div>

                        {transaction.original_amount && transaction.original_amount !== transaction.amount && (
                            <div className="detail-row">
                                <div className="detail-label">
                                    <FiDollarSign />
                                    <span>Original Amount</span>
                                </div>
                                <div className="detail-value">
                                    {transaction.original_amount} {transaction.original_currency}
                                </div>
                            </div>
                        )}

                        {transaction.signed_amount && (
                            <div className="detail-row">
                                <div className="detail-label">
                                    <span>Signed Amount</span>
                                </div>
                                <div className="detail-value">
                                    {transaction.signed_amount}
                                </div>
                            </div>
                        )}

                        {(transaction.source_account || transaction.source_account_identifier) && (
                            <div className="detail-row">
                                <div className="detail-label">
                                    <span>Source Account</span>
                                </div>
                                <div className="detail-value">
                                    {transaction.source_account || transaction.source_account_identifier}
                                </div>
                            </div>
                        )}

                        {(transaction.counterparty || transaction.counterparty_identifier) && (
                            <div className="detail-row">
                                <div className="detail-label">
                                    <span>Counterparty</span>
                                </div>
                                <div className="detail-value">
                                    {transaction.counterparty || transaction.counterparty_identifier}
                                </div>
                            </div>
                        )}

                        {(transaction.code || transaction.source_code) && (
                            <div className="detail-row">
                                <div className="detail-label">
                                    <span>Code</span>
                                </div>
                                <div className="detail-value">
                                    {transaction.code || transaction.source_code}
                                </div>
                            </div>
                        )}

                        {(transaction.type || transaction.source_type) && (
                            <div className="detail-row">
                                <div className="detail-label">
                                    <span>Type</span>
                                </div>
                                <div className="detail-value">
                                    {transaction.type || transaction.source_type}
                                </div>
                            </div>
                        )}

                        {(transaction.notifications || transaction.source_notifications) && (
                            <div className="detail-row">
                                <div className="detail-label">
                                    <span>Notifications</span>
                                </div>
                                <div className="detail-value">
                                    {transaction.notifications || transaction.source_notifications}
                                </div>
                            </div>
                        )}

                        {transaction.direction && (
                            <div className="detail-row">
                                <div className="detail-label">
                                    <span>Direction</span>
                                </div>
                                <div className="detail-value">
                                    {transaction.direction}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="close-modal-button" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export default TransactionDetailsModal; 