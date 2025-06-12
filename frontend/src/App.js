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
import TreeEditorTestPage from './pages/TreeEditorTestPage';
import TransactionSearchPage from './pages/TransactionSearchPage';
import MainLayout from './components/layout/MainLayout';

const Settings = () => <div style={{ padding: '20px' }}>Settings Page Content</div>;
const Admin = () => <div style={{ padding: '20px' }}>Admin Page Content</div>;

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
            <Route element={<MainLayout />}>
              <Route path="/dashboard" element={<NewDashboardPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/categorise" element={<CategorisePage />} />
              <Route path="/categorise/transactions" element={<CategoriseTransactionsPage />} />
              <Route path="/visualise" element={<VisualisePage />} />
              <Route path="/search" element={<TransactionSearchPage />} />
              <Route path="/tree-editor-test" element={<TreeEditorTestPage />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/admin" element={<Admin />} />
            </Route>
          </Route>
          
          {/* Default redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;