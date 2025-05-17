import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './utils/AuthContext';
import PrivateRoute from './utils/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import NewDashboardPage from './pages/NewDashboardPage';
import UploadPage from './pages/UploadPage';
import CategorisePage from './pages/CategorisePage';
import CategoriseTransactionsPage from './pages/CategoriseTransactionsPage';
import VisualisePage from './pages/VisualisePage';
import MainLayout from './components/layout/MainLayout';

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

          {/* Protected routes with MainLayout (includes Sidebar) */}
          <Route element={<PrivateRoute />}>
            <Route path="/" element={<MainLayout />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<NewDashboardPage />} />
                <Route path="upload" element={<UploadPage />} />
                <Route path="categorise" element={<CategorisePage />} />
                <Route path="categorise/transactions" element={<CategoriseTransactionsPage />} />
                <Route path="visualise" element={<VisualisePage />} />
                <Route path="settings" element={<Settings />} />
                <Route path="add-transaction" element={<AddTransaction />} />
            </Route>
          </Route>

          {/* Fallback for any other unmatched routes, redirect to dashboard */}
          {/* This also handles the initial / redirect before PrivateRoute logic kicks in fully if needed */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />

        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;