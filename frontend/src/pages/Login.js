// frontend/src/pages/Login.js
import React, { useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm';
import { AuthContext } from '../utils/AuthContext';
import '../styles/auth.css'; // Ensure auth styles are imported here
// import logo from '../assets/logo.svg'; // Assuming you have a logo file

const Login = () => {
  const { isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();

  // Redirect to dashboard if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="auth-page-container">
      <div className="auth-split-layout">
        {/* Left Column: Form */}
        <div className="auth-form-column">
          <div className="auth-form-container">
            {/* <img src={logo} alt="FundFlow Logo" className="auth-logo" /> */}
            <h1 className="auth-main-heading">Login to Your Account</h1>
            <p className="auth-sub-heading">Welcome back! Manage your finances efficiently.</p>
            <LoginForm />
            <div className="auth-form-footer">
                Need an account? <Link to="/register">Sign Up Here</Link>
            </div>
          </div>
        </div>

        {/* Right Column: Promo / Signup */}
        <div className="auth-promo-column">
          <div className="auth-promo-content">
            <h2 className="auth-promo-heading">New Here?</h2>
            <p className="auth-promo-text">
              Join FundFlow today to gain clarity on your spending, set budgets,
              and achieve your financial goals.
            </p>
            <Link to="/register" className="auth-promo-button">
              Sign Up
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;