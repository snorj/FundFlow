import React, { useContext } from 'react';
import { Outlet, Link, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../utils/AuthContext';
import Sidebar from './Sidebar'; // Import the new Sidebar
import './MainLayout.css';
import logoLight from '../../assets/logoLight.svg';

// Import Logout Icon
const LogoutIcon = () => ( 
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
    <polyline points="16 17 21 12 16 7"></polyline>
    <line x1="21" y1="12" x2="9" y2="12"></line>
  </svg>
);

const MainLayout = () => {
  const { logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-container-with-sidebar"> {/* Updated class name */}
      <Sidebar /> {/* Add the Sidebar component here */}

      {/* main-content-area will now be to the right of the sidebar */}
      <div className="main-content-area"> 
        <header className="main-header">
          {/* Header content can remain, or be simplified if sidebar takes over some branding/nav */}
          {/* For now, keeping the logo in the header as well, can be removed if redundant with sidebar */}
          <div className="header-left">
            {/* Optionally, keep a breadcrumb or page title here if logo moves to sidebar permanently */}
            {/* <Link to="/dashboard" className="header-logo-link" title="Go to Dashboard">
               <img src={logoLight} alt="FundFlow Logo" className="header-logo" />
            </Link> */}
            {/* Example: Simple text or dynamic title based on route could go here */}
             <span className="header-page-title"></span> {/* Placeholder for dynamic title if needed */}
          </div>

          <div className="header-right">
             <button
               onClick={handleLogout}
               className="header-action-button header-logout-button"
               title="Logout"
             >
               <LogoutIcon />
               <span className="logout-text">Logout</span>
            </button>
          </div>
        </header>

        <main className="page-content"> {/* Renamed for clarity */}
        <div className="content-container">
          <Outlet />
        </div>
      </main>
      </div>
    </div>
  );
};

export default MainLayout;