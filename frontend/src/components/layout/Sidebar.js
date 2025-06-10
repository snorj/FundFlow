import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../utils/AuthContext';
import { 
  Home, 
  Upload, 
  Tag, 
  BarChart3,
  Settings, 
  LogOut, 
  Users
} from 'lucide-react';
import './Sidebar.css';

const Sidebar = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { path: '/dashboard', icon: Home, label: 'Dashboard' },
    { path: '/upload', icon: Upload, label: 'Upload' },
    { path: '/categorise', icon: Tag, label: 'Categorise' },
    { path: '/visualise', icon: BarChart3, label: 'Visualise' },
    { path: '/admin', icon: Users, label: 'Admin' },
    { path: '/settings', icon: Settings, label: 'Settings' },
  ];

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1 className="sidebar-title">FundFlow</h1>
      </div>
      
      <nav className="sidebar-nav">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => 
              `sidebar-item ${isActive ? 'active' : ''}`
            }
          >
            <item.icon className="sidebar-icon" size={20} />
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        ))}
        
        <button
          onClick={handleLogout}
          className="sidebar-item logout"
        >
          <LogOut className="sidebar-icon" size={20} />
          <span className="sidebar-label">Logout</span>
        </button>
      </nav>
    </div>
  );
};

export default Sidebar; 