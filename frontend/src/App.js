import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './utils/AuthContext';
import { PlaidLinkProvider } from './utils/PlaidLinkContext';
import PrivateRoute from './utils/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MainLayout from './components/layout/MainLayout';
import Transactions from './pages/Transactions';
import Accounts from './pages/Accounts';

import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          
          {/* Protected routes with MainLayout */}
          <Route element={<PrivateRoute />}>
            <Route element={
              <PlaidLinkProvider>
                <MainLayout />
              </PlaidLinkProvider>
            }>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/accounts" element={<Accounts />} />
              {/* Add more routes as needed */}
            </Route>
          </Route>
          
          {/* Redirect root to dashboard or login depending on auth state */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          
          {/* Catch all - redirect to dashboard */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;