import React from 'react';
import { NavLink } from 'react-router-dom';
import { FiGrid, FiUpload, FiEdit, FiBarChart2, FiSettings } from 'react-icons/fi';
import './Sidebar.css';
import logoLight from '../../assets/logoLight.svg'; // Assuming logo is here

const Sidebar = () => {
  const navItems = [
    { to: '/dashboard', icon: <FiGrid />, label: 'Dashboard' },
    { to: '/upload', icon: <FiUpload />, label: 'Import' }, // Changed from 'Upload' to 'Import' for clarity
    { to: '/categorise', icon: <FiEdit />, label: 'Categorise' },
    { to: '/visualise', icon: <FiBarChart2 />, label: 'Visualise' },
    { to: '/settings', icon: <FiSettings />, label: 'Settings' }, // Kept settings as it was in App.js
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <img src={logoLight} alt="FundFlow Logo" className="sidebar-logo" />
        {/* <span className="sidebar-title">FundFlow</span> */}
      </div>
      <nav className="sidebar-nav">
        <ul>
          {navItems.map((item) => (
            <li key={item.to}>
              <NavLink
                to={item.to}
                className={({ isActive }) => isActive ? 'sidebar-link active' : 'sidebar-link'}
              >
                <span className="sidebar-icon">{item.icon}</span>
                <span className="sidebar-label">{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      {/* Add a footer or other elements if needed */}
      {/* <div className="sidebar-footer">User Profile / Logout</div> */}
    </aside>
  );
};

export default Sidebar; 