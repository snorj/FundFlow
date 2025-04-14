import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './utils/AuthContext';
import PrivateRoute from './utils/PrivateRoute'; // Renders <Outlet/> if authenticated
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import MainLayout from './components/layout/MainLayout'; // Contains its own <Outlet/>
import Transactions from './pages/Transactions';
import Accounts from './pages/Accounts';

const Settings = () => <div style={{ padding: '20px' }}>Settings Page Content</div>;
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

          {/* === CORRECTED Protected Routes Structure === */}
          <Route element={<PrivateRoute />}> {/* 1. Guard Route: Renders <Outlet/> if auth */}
            {/* 2. Layout Route: Defines the layout, path defaults to '/' relative to parent */}
            <Route path="/" element={<MainLayout />}>
                {/* 3. Child routes rendered inside MainLayout's <Outlet/> */}
                {/* Index route for the default view within the layout */}
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="transactions" element={<Transactions />} />
                <Route path="accounts" element={<Accounts />} />
                <Route path="budget" element={<Budget />} />
                <Route path="settings" element={<Settings />} />
                <Route path="add-transaction" element={<AddTransaction />} />
                {/* Add more routes inside the layout here */}
            </Route>
          </Route>
          {/* === End of Corrected Structure === */}

          {/* Redirect root if user directly lands on '/' before protected routes handle it */}
          {/* This might be redundant now depending on how PrivateRoute handles non-auth */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Catch-all / 404 */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} /> {/* Or a proper 404 component */}

        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;