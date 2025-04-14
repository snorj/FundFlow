import React, { createContext, useState, useEffect, useCallback } from 'react'; // Added useCallback
import AuthService from '../services/auth';
// Remove: import { resetAllState } from './StateResetUtil'; // REMOVE THIS IMPORT

export const AuthContext = createContext(null); // Initialize with null

export const AuthProvider = ({ children }) => {
  const [authState, setAuthState] = useState({
    isAuthenticated: false,
    isLoading: true, // Start loading
    user: null, // Store user object here
    accessToken: null, // Initialize tokens as null
    refreshToken: null,
  });

  // Define logout function using useCallback to prevent recreation on every render
  const handleLogout = useCallback(() => {
    // Remove: resetAllState(); // REMOVE THIS CALL

    AuthService.logout(); // Call AuthService logout to clear localStorage

    // Update the auth state in context
    setAuthState({
      isAuthenticated: false,
      isLoading: false, // No longer loading after logout
      user: null,
      accessToken: null,
      refreshToken: null,
    });
     // Optional: Redirect here or let the component using the context handle redirect
     // window.location.href = '/login'; // Example immediate redirect
  }, []); // No dependencies needed for this version


  useEffect(() => {
    const initializeAuth = async () => {
      console.log("AuthContext: initializeAuth START"); // <-- ADD
      const accessToken = localStorage.getItem('access_token');
      const refreshTokenValue = localStorage.getItem('refresh_token');

      if (!accessToken || !refreshTokenValue) {
        console.log("AuthContext: No tokens found."); // <-- ADD
        setAuthState(prev => ({ ...prev, isAuthenticated: false, isLoading: false, user: null, accessToken: null, refreshToken: null }));
        return;
      }

      try {
        console.log("AuthContext: Tokens found, attempting getCurrentUser."); // <-- ADD
        const userInfo = await AuthService.getCurrentUser();
        console.log("AuthContext: getCurrentUser SUCCESS.", userInfo); // <-- ADD

        setAuthState(prev => ({ ...prev, isAuthenticated: true, isLoading: false, user: userInfo, accessToken, refreshToken: refreshTokenValue }));
        console.log("AuthContext: State set to AUTHENTICATED."); // <-- ADD

      } catch (error) {
        console.error("AuthContext: Error during initial getCurrentUser.", error); // <-- ADD

        if (error.response && error.response.status === 401) {
          console.log("AuthContext: Attempting token refresh."); // <-- ADD
          try {
            await AuthService.refreshToken(refreshTokenValue);
            console.log("AuthContext: Token refresh SUCCESS."); // <-- ADD
            const refreshedUserInfo = await AuthService.getCurrentUser();
            console.log("AuthContext: getCurrentUser after refresh SUCCESS.", refreshedUserInfo); // <-- ADD

            setAuthState(prev => ({ ...prev, isAuthenticated: true, isLoading: false, user: refreshedUserInfo, accessToken: localStorage.getItem('access_token'), refreshToken: refreshTokenValue }));
             console.log("AuthContext: State set to AUTHENTICATED after refresh."); // <-- ADD

          } catch (refreshError) {
            console.error("AuthContext: Token refresh FAILED.", refreshError); // <-- ADD
            handleLogout(); // This will set state to unauthenticated/not loading
          }
        } else {
          console.error("AuthContext: Non-401 error during init, setting unauthenticated."); // <-- ADD
          setAuthState(prev => ({ ...prev, isAuthenticated: false, isLoading: false, user: null, accessToken: null, refreshToken: null }));
          // Consider removing tokens if this happens persistently
          // localStorage.removeItem('access_token');
          // localStorage.removeItem('refresh_token');
        }
      }
    };

    initializeAuth();
  }, [handleLogout]); // Keep handleLogout dependency

  return (
    <AuthContext.Provider
      value={{
        // Provide state values directly
        isAuthenticated: authState.isAuthenticated,
        isLoading: authState.isLoading,
        user: authState.user,
        accessToken: authState.accessToken,
        refreshToken: authState.refreshToken,
        // Provide functions
        setAuthState, // Allow direct setting if needed elsewhere (use with caution)
        logout: handleLogout // Provide the stable logout function
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Removed the export default AuthProvider here, assuming it's default exported when used.
// If not, add: export default AuthProvider;