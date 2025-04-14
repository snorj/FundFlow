import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './utils/AuthContext';
// Remove: import { PlaidLinkProvider } from './utils/PlaidLinkContext';
import PrivateRoute from './utils/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MainLayout from './components/layout/MainLayout';
import Transactions from './pages/Transactions';
import Accounts from './pages/Accounts';

const Settings = () => <div style={{ padding: '20px' }}>Settings Page Content</div>;
// Remove: const ConnectBank = () => <div style={{ padding: '20px' }}>Connect Bank Account Page</div>; // Plaid-related
const AddTransaction = () => <div style={{ padding: '20px' }}>Add Transaction Manually Page</div>;
const Budget = () => <div style={{ padding: '20px' }}>Budget Page Content</div>;


function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes with MainLayout */}
          <Route element={
              <PrivateRoute>
                  {/* Remove PlaidLinkProvider wrapper */}
                  <MainLayout />
              </PrivateRoute>
          }>
              {/* Define routes that use MainLayout */}
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/budget" element={<Budget />} />
              <Route path="/settings" element={<Settings />} />
              {/* Remove: <Route path="/connect-bank" element={<ConnectBank />} /> */}
              <Route path="/add-transaction" element={<AddTransaction />} />
              <Route index element={<Navigate to="/dashboard" replace />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;