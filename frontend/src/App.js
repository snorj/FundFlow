import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './utils/AuthContext';
import PrivateRoute from './utils/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MainLayout from './components/layout/MainLayout';
import CategorizeTransactions from './pages/CategorizeTransactions';

const Settings = () => <div style={{ padding: '20px' }}>Settings Page Content</div>;
const AddTransaction = () => <div style={{ padding: '20px' }}>Add Transaction Manually Page</div>;

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes */}
          <Route element={<PrivateRoute />}>
            <Route path="/" element={<MainLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="settings" element={<Settings />} />
                <Route path="add-transaction" element={<AddTransaction />} />
                <Route path="categorize" element={<CategorizeTransactions />} />
            </Route>
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />

        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;