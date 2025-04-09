import React, { useState, useContext, useEffect } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../../utils/AuthContext'; // Verify path
import './MainLayout.css';

// Import your light logo
import logoLight from '../../assets/logoLight.svg'; // Adjust path if needed

// Using inline SVGs provided previously - Consider using react-icons for consistency
// Import specific icons you need from react-icons, e.g.:
// import { FiGrid, FiList, FiCreditCard, FiPieChart, FiSettings, FiMenu, FiLogOut, FiX } from 'react-icons/fi';

// Using provided SVG components - Ensure they are styled appropriately via CSS if needed
const DashboardIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="var(--sidebar-icon-size)" height="var(--sidebar-icon-size)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9"></rect><rect x="14" y="3" width="7" height="5"></rect><rect x="14" y="12" width="7" height="9"></rect><rect x="3" y="16" width="7" height="5"></rect></svg> );
const TransactionsIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="var(--sidebar-icon-size)" height="var(--sidebar-icon-size)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg> );
const AccountsIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="var(--sidebar-icon-size)" height="var(--sidebar-icon-size)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line></svg> );
const BudgetIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="var(--sidebar-icon-size)" height="var(--sidebar-icon-size)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg> /* Updated Budget Icon */ );
const SettingsIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="var(--header-icon-size)" height="var(--header-icon-size)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg> );
const MenuIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="var(--header-icon-size)" height="var(--header-icon-size)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg> );
const LogoutIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="var(--sidebar-icon-size)" height="var(--sidebar-icon-size)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg> );
const CloseIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> );


const MainLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const { logout } = useContext(AuthContext); // Removed user for now, as it wasn't used here
  const location = useLocation();
  const navigate = useNavigate();

  // Close sidebar on initial mobile load
  useEffect(() => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
    // Optional: Add resize listener if needed
  }, []);


  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: <DashboardIcon /> },
    { path: '/transactions', label: 'Transactions', icon: <TransactionsIcon /> },
    { path: '/accounts', label: 'Accounts', icon: <AccountsIcon /> },
    { path: '/budget', label: 'Budget', icon: <BudgetIcon /> },
    // Settings moved to header icon
  ];

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className={`sidebar ${isSidebarOpen ? 'open' : 'closed'}`}>
        {/* Sidebar content remains similar, styling adjusted in CSS */}
        <div className="sidebar-header">
          {/* Simple Title or Small Logo in Sidebar Header */}
          <h2 className="sidebar-app-title">Fund Flow</h2>
          <button
            className="close-sidebar-btn"
            onClick={toggleSidebar}
            aria-label="Close sidebar"
          >
            <CloseIcon />
          </button>
        </div>

        <nav className="sidebar-nav">
          <ul>
            {navItems.map((item) => (
              <li key={item.path} className={location.pathname.startsWith(item.path) ? 'active' : ''}>
                <Link to={item.path} onClick={closeSidebarOnMobile}>
                  <span className="nav-icon">{item.icon}</span>
                  <span className="nav-label">{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="sidebar-footer">
          <button onClick={handleLogout} className="logout-btn">
             <LogoutIcon />
             <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className={`main-content ${isSidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
        {/* --- MODIFIED HEADER --- */}
        <header className="main-header">
          {/* Left side: Menu toggle (mobile) & Settings Icon (always) */}
          <div className="header-left">
            <button
              className="menu-toggle"
              onClick={toggleSidebar}
              aria-label="Toggle menu"
            >
              <MenuIcon />
            </button>
            {/* Moved Settings Icon Here */}
            <Link to="/settings" className="header-icon-link header-settings-link" title="Settings">
               <SettingsIcon />
            </Link>
          </div>

          {/* Right side: Logo */}
          <div className="header-right">
            <Link to="/dashboard" className="header-logo-link" title="Go to Dashboard">
               <img src={logoLight} alt="FundFlow Logo" className="header-logo" />
            </Link>
          </div>
        </header>
        {/* --- END OF MODIFIED HEADER --- */}

        <div className="content-container">
          {/* This is where the routed component (e.g., Dashboard) renders */}
          <Outlet />
        </div>
      </main>

      {/* Sidebar overlay for mobile */}
      {isSidebarOpen && window.innerWidth < 1024 && (
        <div className="sidebar-overlay" onClick={toggleSidebar}></div>
      )}
    </div>
  );
};

export default MainLayout;