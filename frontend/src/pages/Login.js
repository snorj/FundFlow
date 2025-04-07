// Example: frontend/src/pages/Login.js (Structure might vary)
import React, { useContext, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import LoginForm from '../components/auth/LoginForm'; // Assuming you have this
import { AuthContext } from '../utils/AuthContext';
import '../styles/auth.css'; // Make sure auth.css is imported
import logoDark from '../assets/logoDark.svg';

const Login = () => {
  const { isAuthenticated } = useContext(AuthContext);
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  return (
    // *** Use the main page container ***
    <div className="auth-page-container">
      {/* *** Use the split layout container *** */}
      <div className="auth-split-layout">

        {/* --- Left Column: Form --- */}
        <div className="auth-form-column">
          <img src={logoDark} alt="FundFlow Logo" className="auth-page-logo" /> 

          {/* Container within the column to center/max-width the form */}
          <div className="auth-form-container">

             <h1 className="auth-main-heading">Welcome Back!</h1>
             <p className="auth-sub-heading">Login to manage your finances.</p>

             {/* Render the actual Login Form component here */}
             <LoginForm />

             {/* Optional: Footer links within the form container */}
             <div className="auth-form-footer">
                <p>Need an account? <Link to="/register">Sign Up</Link></p>
             </div>
          </div>
        </div>

        {/* --- Right Column: Promotional Content --- */}
        <div className="auth-promo-column">
          <div className="auth-promo-content">
            <h2 className="auth-promo-heading">New Here? Take Control of Your Finances</h2>
            <p className="auth-promo-text">
              Join Fund Flow today and gain clear insights into your spending and savings.
              Effortless budgeting starts here.
            </p>
            {/* Optional button linking to register or features page */}
            <Link to="/register" className="auth-promo-button">
              Get Started
            </Link>
          </div>
        </div>

      </div> {/* End auth-split-layout */}
    </div> // End auth-page-container
  );
};

export default Login;