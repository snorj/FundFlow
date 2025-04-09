import React from 'react';
import { Link } from 'react-router-dom';
import './Dashboard.css'; // We'll create this CSS file next

// Import icons from react-icons
import { FiPlusCircle, FiUpload, FiLink } from 'react-icons/fi'; // Example icons

const Dashboard = () => {
  // Placeholder: In the future, check if the user has data
  const hasData = false; // Set to true later to show actual dashboard

  return (
    <div className="dashboard-page">
      {/* Conditional Rendering: Show empty state or the actual dashboard */}
      {hasData ? (
        <div>
          {/* Placeholder for the actual dashboard content (Charts, Summaries etc.) */}
          <h1>Your Financial Dashboard</h1>
          <p>Data will go here...</p>
        </div>
      ) : (
        // Empty State Content
        <div className="empty-state-container">
          <h2 className="empty-state-heading">Welcome to Fund Flow!</h2>
          <p className="empty-state-text">
            To get started, add your financial data using one of the options below:
          </p>
          <div className="action-buttons">
            <Link to="/connect-bank" className="action-button teal-button">
              <FiLink className="button-icon" />
              Connect Bank Account
            </Link>
            {/* Consider making upload a component/page later */}
            <button type="button" className="action-button teal-button" onClick={() => alert('Upload CSV - Placeholder Action')}>
              <FiUpload className="button-icon" />
              Upload .csv File
            </button>
            <Link to="/add-transaction" className="action-button teal-button">
              <FiPlusCircle className="button-icon" />
              Add Manually
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;