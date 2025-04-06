// frontend/src/components/auth/LoginForm.js
import React, { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AuthContext } from '../../utils/AuthContext';
import AuthService from '../../services/auth';
// No need to import auth.css here if Login.js imports it

// Import icons (example using react-icons, install with: npm install react-icons)
import { FiEye, FiEyeOff } from 'react-icons/fi';

const LoginForm = () => {
  const [formData, setFormData] = useState({
    username: '', // Or email, depending on your backend setup
    password: ''
  });
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [showPassword, setShowPassword] = useState(false); // State for password visibility

  const { setAuthState } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    if (apiError) setApiError(''); // Clear API error on change
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const validateForm = () => {
    const newErrors = {};
    // Assuming login uses username, change 'username' to 'email' if needed
    if (!formData.username.trim()) {
      newErrors.username = 'Username or Email is required';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setApiError('');
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      // Ensure your AuthService.login takes 'username' or 'email' as needed
      const response = await AuthService.login({
        username: formData.username,
        password: formData.password
      });
      localStorage.setItem('access_token', response.access);
      localStorage.setItem('refresh_token', response.refresh);
      setAuthState({
        isAuthenticated: true,
        accessToken: response.access,
        refreshToken: response.refresh
      });
      navigate('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      if (error.response && error.response.status === 401) {
        setApiError('Invalid credentials. Please try again.');
      } else if (error.response && error.response.data) {
         // Use a generic message for other potential server errors on login
         setApiError(error.response.data.detail || 'Login failed. Please try again later.');
      } else {
        setApiError('Network error or unable to reach server.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      {/* Display API Error */}
      {apiError && (
        <div className="auth-error-message login-api-error">
          {apiError}
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        {/* Username/Email Field */}
        <div className="form-group">
          <label htmlFor="username">Username or Email</label>
          <input
            type="text" // Use "email" if your backend expects email specifically
            id="username"
            name="username"
            value={formData.username}
            onChange={handleChange}
            placeholder="Enter your username or email"
            className={errors.username ? 'input-error' : ''}
            autoComplete="username"
          />
          {errors.username && <div className="field-error">{errors.username}</div>}
        </div>

        {/* Password Field with Toggle */}
        <div className="form-group password-group">
          <label htmlFor="password">Password</label>
          <input
            type={showPassword ? 'text' : 'password'}
            id="password"
            name="password"
            value={formData.password}
            onChange={handleChange}
            placeholder="Enter your password"
            className={errors.password ? 'input-error' : ''}
            autoComplete="current-password"
          />
          <button
            type="button"
            onClick={togglePasswordVisibility}
            className="password-toggle-btn"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <FiEyeOff /> : <FiEye />}
          </button>
          {errors.password && <div className="field-error">{errors.password}</div>}
        </div>

        {/* Forgot Password Link */}
        <div className="forgot-password login-forgot-link">
          <Link to="/reset-password">Forgot password?</Link>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="auth-button login-submit-btn"
          disabled={isLoading}
        >
          {isLoading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>
    </>
  );
};

export default LoginForm;