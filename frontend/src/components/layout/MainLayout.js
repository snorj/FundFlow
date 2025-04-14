import React, { useContext } from 'react'; // Removed useState, useEffect
import { Outlet, Link, useNavigate } from 'react-router-dom'; // Removed useLocation
import { AuthContext } from '../../utils/AuthContext'; // Verify path
import './MainLayout.css';

// Import your light logo
import logoLight from '../../assets/logoLight.svg'; // Adjust path if needed

// Import Logout Icon
const LogoutIcon = () => ( <svg xmlns="http://www.w3.org/2000/svg" width="var(--header-icon-size)" height="var(--header-icon-size)" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg> );

const MainLayout = () => {
  // Remove sidebar state and related hooks/logic
  // const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024);
  const { logout } = useContext(AuthContext);
  // const location = useLocation(); // No longer needed for header title or active nav
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login'); // Navigate after logout context update
  };

  // Remove toggleSidebar, closeSidebarOnMobile functions
  // Remove navItems array

  return (
    // Container class might not be strictly needed anymore, but can keep for structure
    <div className="app-container-no-sidebar">

      {/* Remove Sidebar <aside> element entirely */}

      {/* Main content area now takes full width */}
      <main className="main-content-full-width">
        {/* --- REVISED HEADER --- */}
        <header className="main-header">
          {/* Left side: Logo */}
          <div className="header-left">
            <Link to="/dashboard" className="header-logo-link" title="Go to Dashboard">
               <img src={logoLight} alt="FundFlow Logo" className="header-logo" />
            </Link>
          </div>

          {/* Right side: Logout Button */}
          <div className="header-right">
             <button
               onClick={handleLogout}
               className="header-action-button header-logout-button" // Use a specific class
               title="Logout"
             >
               <LogoutIcon />
               {/* Optional: Add text for larger screens */}
               <span className="logout-text">Logout</span>
            </button>
          </div>
        </header>
        {/* --- END OF REVISED HEADER --- */}

        {/* Content Area - Renders the specific page component */}
        <div className="content-container">
          <Outlet />
        </div>
      </main>

      {/* Remove Sidebar overlay */}
    </div>
  );
};

export default MainLayout;