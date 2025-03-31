import React from 'react';
import './AccountSummary.css';

const AccountSummary = ({ accounts, totalBalance }) => {
  // Format currency amount
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Count accounts by type
  const getAccountTypeCount = () => {
    const typeCounts = {
      checking: 0,
      savings: 0,
      credit: 0,
      investment: 0,
      loan: 0,
      other: 0
    };

    accounts.forEach(account => {
      if (account.account_type === 'depository') {
        if (account.account_subtype === 'checking') {
          typeCounts.checking++;
        } else if (account.account_subtype === 'savings') {
          typeCounts.savings++;
        } else {
          typeCounts.other++;
        }
      } else if (account.account_type === 'credit') {
        typeCounts.credit++;
      } else if (account.account_type === 'investment') {
        typeCounts.investment++;
      } else if (account.account_type === 'loan') {
        typeCounts.loan++;
      } else {
        typeCounts.other++;
      }
    });

    return typeCounts;
  };

  const accountTypeCounts = getAccountTypeCount();

  return (
    <div className="account-summary">
      <div className="account-summary-card total-balance">
        <div className="card-label">Total Balance</div>
        <div className="card-value">{formatCurrency(totalBalance)}</div>
        <div className="card-subtext">Across {accounts.length} accounts</div>
      </div>

      <div className="account-summary-details">
        <div className="account-summary-card account-breakdown">
          <div className="card-label">Account Breakdown</div>
          <div className="account-types">
            {accountTypeCounts.checking > 0 && (
              <div className="account-type-item">
                <div className="account-type-dot checking"></div>
                <div className="account-type-label">Checking</div>
                <div className="account-type-count">{accountTypeCounts.checking}</div>
              </div>
            )}
            {accountTypeCounts.savings > 0 && (
              <div className="account-type-item">
                <div className="account-type-dot savings"></div>
                <div className="account-type-label">Savings</div>
                <div className="account-type-count">{accountTypeCounts.savings}</div>
              </div>
            )}
            {accountTypeCounts.credit > 0 && (
              <div className="account-type-item">
                <div className="account-type-dot credit"></div>
                <div className="account-type-label">Credit</div>
                <div className="account-type-count">{accountTypeCounts.credit}</div>
              </div>
            )}
            {accountTypeCounts.investment > 0 && (
              <div className="account-type-item">
                <div className="account-type-dot investment"></div>
                <div className="account-type-label">Investment</div>
                <div className="account-type-count">{accountTypeCounts.investment}</div>
              </div>
            )}
            {accountTypeCounts.loan > 0 && (
              <div className="account-type-item">
                <div className="account-type-dot loan"></div>
                <div className="account-type-label">Loan</div>
                <div className="account-type-count">{accountTypeCounts.loan}</div>
              </div>
            )}
            {accountTypeCounts.other > 0 && (
              <div className="account-type-item">
                <div className="account-type-dot other"></div>
                <div className="account-type-label">Other</div>
                <div className="account-type-count">{accountTypeCounts.other}</div>
              </div>
            )}
          </div>
        </div>

        <div className="account-summary-card last-update">
          <div className="card-label">Last Update</div>
          <div className="card-value-medium">{new Date().toLocaleDateString()}</div>
          <div className="card-subtext">Account data is refreshed automatically</div>
        </div>
      </div>
    </div>
  );
};

export default AccountSummary;