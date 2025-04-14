import React, { useContext } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { AuthContext } from './AuthContext';

// Loading spinner component
const LoadingSpinner = () => (
  <div className="loading-container">
    <div className="loading-spinner"></div>
    <p>Loading...</p>
  </div>
);

const PrivateRoute = () => {
  const { isAuthenticated, isLoading } = useContext(AuthContext);

  // Log the state received from context *every time* PrivateRoute renders
  console.log(`PrivateRoute Rendering: isLoading=${isLoading}, isAuthenticated=${isAuthenticated}`);

  if (isLoading) {
    console.log("PrivateRoute: Returning LoadingSpinner."); // <-- ADD
    return <LoadingSpinner />;
  }

  if (isAuthenticated) {
      console.log("PrivateRoute: Returning Outlet (Authenticated)."); // <-- ADD
      return <Outlet />;
  } else {
      console.log("PrivateRoute: Returning Navigate to /login (Not Authenticated)."); // <-- ADD
      return <Navigate to="/login" replace />;
  }
};

export default PrivateRoute;