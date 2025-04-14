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
      const accessToken = localStorage.getItem('access_token');
      const refreshTokenValue = localStorage.getItem('refresh_token');

      // If no tokens, immediately set to not authenticated
      if (!accessToken || !refreshTokenValue) {
        console.log("AuthContext: No tokens found, setting unauthenticated.");
        setAuthState({
          isAuthenticated: false,
          isLoading: false,
          user: null,
          accessToken: null,
          refreshToken: null,
        });
        return;
      }

      // Tokens exist, try to validate them and fetch user
      try {
        console.log("AuthContext: Tokens found, attempting to get user info.");
        const userInfo = await AuthService.getCurrentUser();
        console.log("AuthContext: User info fetched successfully.", userInfo);

        // Successfully fetched user, update state
        setAuthState({
          isAuthenticated: true,
          isLoading: false,
          user: userInfo,
          accessToken, // Keep existing token from localStorage
          refreshToken: refreshTokenValue, // Keep existing token
        });

      } catch (error) {
        console.log("AuthContext: Error fetching user info.", error);
        // Check if it was a 401 Unauthorized (likely expired token)
        if (error.response && error.response.status === 401) {
          console.log("AuthContext: Access token likely expired, attempting refresh.");
          try {
            // Attempt to refresh the token
            await AuthService.refreshToken(refreshTokenValue); // This updates localStorage internally now
            console.log("AuthContext: Token refresh successful.");

            // Refetch user info with the new token
            const refreshedUserInfo = await AuthService.getCurrentUser();
            console.log("AuthContext: User info fetched successfully after refresh.", refreshedUserInfo);

            // Update state with new token and user info
            setAuthState({
              isAuthenticated: true,
              isLoading: false,
              user: refreshedUserInfo,
              accessToken: localStorage.getItem('access_token'), // Get the newly stored token
              refreshToken: refreshTokenValue,
            });

          } catch (refreshError) {
            // If refresh fails (e.g., refresh token also expired/invalid)
            console.log("AuthContext: Token refresh failed.", refreshError);
            handleLogout(); // Log the user out completely
          }
        } else {
          // Some other error occurred (network issue, server error)
          // Treat as unauthenticated for now, but keep tokens in case it's temporary
          console.log("AuthContext: Non-401 error during user fetch, setting unauthenticated.");
           setAuthState({
             isAuthenticated: false,
             isLoading: false, // Finished loading check
             user: null,
             accessToken: null, // Clear tokens from state as they didn't work
             refreshToken: null,
           });
           // Optionally clear localStorage here too if error persists
           // localStorage.removeItem('access_token');
           // localStorage.removeItem('refresh_token');
        }
      }
    };

    initializeAuth();
  }, [handleLogout]); // Include handleLogout in dependency array

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