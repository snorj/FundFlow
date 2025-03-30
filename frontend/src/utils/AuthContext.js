import React, { createContext, useState, useEffect } from 'react';
import AuthService from '../services/auth';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    isAuthenticated: false,
    isLoading: true,
    user: null,
    accessToken: localStorage.getItem('access_token') || null,
    refreshToken: localStorage.getItem('refresh_token') || null,
  });

  useEffect(() => {
    const initializeAuth = async () => {
      // Check if tokens exist in localStorage
      const accessToken = localStorage.getItem('access_token');
      const refreshTokenValue = localStorage.getItem('refresh_token');
      
      if (!accessToken || !refreshTokenValue) {
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          accessToken: null,
          refreshToken: null,
        });
        return;
      }
      
      try {
        // Try to get user info with current access token
        const userInfo = await AuthService.getCurrentUser();
        
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user: userInfo,
          accessToken,
          refreshToken: refreshTokenValue,
        });
      } catch (error) {
        // If access token is expired, try to refresh it
        if (error.response && error.response.status === 401) {
          try {
            const response = await AuthService.refreshToken(refreshTokenValue);
            localStorage.setItem('access_token', response.access);
            
            // Get user info with new access token
            const userInfo = await AuthService.getCurrentUser();
            
            setAuthState({
              isAuthenticated: true,
              isLoading: false,
              user: userInfo,
              accessToken: response.access,
              refreshToken: refreshTokenValue,
            });
          } catch (refreshError) {
            // If refresh token is also invalid, log the user out
            AuthService.logout();
            
            setAuthState({
              isAuthenticated: false,
              isLoading: false,
              user: null,
              accessToken: null,
              refreshToken: null,
            });
          }
        } else {
          // For other types of errors
          setAuthState({
            isAuthenticated: false,
            isLoading: false,
            user: null,
            accessToken,
            refreshToken: refreshTokenValue,
          });
        }
      }
    };

    initializeAuth();
  }, []);

  const logout = () => {
    AuthService.logout();
    
    setAuthState({
      isAuthenticated: false,
      isLoading: false,
      user: null,
      accessToken: null,
      refreshToken: null,
    });
  };

  return (
    <AuthContext.Provider 
      value={{ 
        ...authState, 
        setAuthState, 
        logout 
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export default AuthProvider;