import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../utils/AuthContext';
import { 
  FiHome, 
  FiUpload, 
  FiTag, 
  FiBarChart,
  FiSettings, 
  FiLogOut, 
  FiUsers,
  FiCpu
} from 'react-icons/fi';
import './Sidebar.css';

const Sidebar = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', icon: FiHome, label: 'Dashboard' },
    { path: '/upload', icon: FiUpload, label: 'Upload' },
    { path: '/categorise', icon: FiTag, label: 'Categorise' },
    { path: '/visualise', icon: FiBarChart, label: 'Visualise' },
    { path: '/vendor-rules', icon: FiCpu, label: 'Vendor Rules' },
    { path: '/admin', icon: FiUsers, label: 'Admin' },
    { path: '/settings', icon: FiSettings, label: 'Settings' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">FundFlow</h1>
      </div>
      
      <nav className="sidebar-nav">
        <ul>
          {navItems.map((item) => (
            <li key={item.path}>
              <NavLink
                to={item.path}
                className={({ isActive }) => 
                  `sidebar-link ${isActive ? 'active' : ''}`
                }
              >
                <span className="sidebar-icon">
                  <item.icon size={20} />
                </span>
                <span className="sidebar-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
        
        <div className="sidebar-footer">
          <button
            onClick={handleLogout}
            className="sidebar-link logout"
          >
            <span className="sidebar-icon">
              <FiLogOut size={20} />
            </span>
            <span className="sidebar-label">Logout</span>
          </button>
        </div>
      </nav>
    </div>
  );
};

export default Sidebar; 