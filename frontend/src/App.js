import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './utils/AuthContext';
import { PlaidLinkProvider } from './utils/PlaidLinkContext'; // Keep if Plaid is used within layout routes
import PrivateRoute from './utils/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MainLayout from './components/layout/MainLayout';
import Transactions from './pages/Transactions';
import Accounts from './pages/Accounts';
import './App.css'; // Keep global app styles if any

// Import placeholder components or simple divs for new routes
const Settings = () => <div style={{ padding: '20px' }}>Settings Page Content</div>;
const ConnectBank = () => <div style={{ padding: '20px' }}>Connect Bank Account Page</div>;
const AddTransaction = () => <div style={{ padding: '20px' }}>Add Transaction Manually Page</div>;
const Budget = () => <div style={{ padding: '20px' }}>Budget Page Content</div>; // Placeholder for Budget

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes with MainLayout */}
          {/* Wrap MainLayout with Plaid provider only if PlaidLink needs context available across all layout pages */}
          <Route element={
              <PrivateRoute>
                  <PlaidLinkProvider>
                      <MainLayout />
                  </PlaidLinkProvider>
              </PrivateRoute>
          }>
              {/* Define routes that use MainLayout */}
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/budget" element={<Budget />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/connect-bank" element={<ConnectBank />} />
              <Route path="/add-transaction" element={<AddTransaction />} />

              {/* Add more routes as needed */}
              {/* Redirect base path within protected area to dashboard */}
               <Route index element={<Navigate to="/dashboard" replace />} />
          </Route>

          {/* Redirect root to dashboard if authenticated (handled by PrivateRoute/index route), or login if not */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Optional: A specific 404 page */}
          {/* <Route path="*" element={<NotFound />} /> */}

          {/* Catch all - redirect to dashboard (might hide underlying issues) */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;