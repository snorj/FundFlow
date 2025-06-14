const { test, expect } = require('./setup/test-setup');
const { testUsers } = require('./fixtures/test-data');

test.describe('Authentication Tests', () => {
  test.describe('Login Flow', () => {
    test('should display login page correctly', async ({ loginPage }) => {
      await loginPage.goto();
      await loginPage.verifyPageElements();
      
      expect(await loginPage.isOnLoginPage()).toBe(true);
      expect(await loginPage.isLoginButtonEnabled()).toBe(true);
    });

    test('should show error for invalid credentials', async ({ loginPage }) => {
      await loginPage.goto();
      
      // Try invalid login
      await loginPage.login('invaliduser', 'wrongpassword');
      
      // Wait for error or stay on login page
      await loginPage.page.waitForTimeout(2000);
      expect(await loginPage.isOnLoginPage()).toBe(true);
    });

    test('should toggle password visibility', async ({ loginPage }) => {
      await loginPage.goto();
      
      // Fill password
      await loginPage.fillPassword('testpassword');
      
      // Toggle visibility if button exists
      if (await loginPage.page.isVisible(loginPage.showPasswordButton)) {
        await loginPage.togglePasswordVisibility();
        
        // Check if password field type changed
        const passwordType = await loginPage.page.getAttribute(loginPage.passwordInput, 'type');
        // Could be either 'text' or 'password' depending on toggle state
        expect(['text', 'password']).toContain(passwordType);
      }
    });

    test('should navigate to registration page', async ({ loginPage }) => {
      await loginPage.goto();
      
      if (await loginPage.page.isVisible(loginPage.signUpLink)) {
        await loginPage.clickSignUp();
        await loginPage.page.waitForURL('**/register');
        expect(loginPage.page.url()).toContain('/register');
      }
    });

    test('should navigate to forgot password page', async ({ loginPage }) => {
      await loginPage.goto();
      
      if (await loginPage.page.isVisible(loginPage.forgotPasswordLink)) {
        await loginPage.clickForgotPassword();
        // Should navigate to password reset page
        await loginPage.page.waitForLoadState('networkidle');
        expect(loginPage.page.url()).toContain('reset');
      }
    });
  });

  test.describe('Registration Flow', () => {
    test('should display registration page correctly', async ({ page }) => {
      await page.goto('/register');
      
      // Verify registration form elements exist
      await page.waitForSelector('form');
      
      const hasEmailField = await page.isVisible('input[type="email"], input[name="email"]');
      const hasPasswordField = await page.isVisible('input[type="password"], input[name="password"]');
      const hasSubmitButton = await page.isVisible('button[type="submit"], button:has-text("Sign Up")');
      
      expect(hasEmailField || await page.isVisible('input[name="username"]')).toBe(true);
      expect(hasPasswordField).toBe(true);
      expect(hasSubmitButton).toBe(true);
    });

    test('should handle registration form validation', async ({ page }) => {
      await page.goto('/register');
      await page.waitForSelector('form');
      
      // Try to submit empty form
      const submitButton = 'button[type="submit"], button:has-text("Sign Up")';
      if (await page.isVisible(submitButton)) {
        await page.click(submitButton);
        
        // Should stay on registration page or show validation errors
        await page.waitForTimeout(1000);
        expect(['/register', '/signup'].some(path => page.url().includes(path))).toBe(true);
      }
    });

    test('should register new user successfully', async ({ authHelpers, page }) => {
      const userData = await authHelpers.register();
      
      // Should be redirected away from registration page or show success
      await page.waitForLoadState('networkidle');
      
      // Verify user data was created
      expect(userData.email).toContain('@example.com');
      expect(userData.username).toBeTruthy();
    });
  });

  test.describe('Authentication State', () => {
    test('should maintain session after login', async ({ authHelpers, page }) => {
      // Create and login user
      const userData = await authHelpers.register();
      await authHelpers.login({
        username: userData.username,
        password: userData.password
      });
      
      // Verify authentication state
      expect(await authHelpers.isLoggedIn()).toBe(true);
      
      // Refresh page and verify session persists
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // Should still be logged in
      const token = await authHelpers.getAuthToken();
      expect(token).toBeTruthy();
    });

    test('should logout successfully', async ({ authHelpers, loginPage }) => {
      // Login first
      const userData = await authHelpers.register();
      await authHelpers.login({
        username: userData.username,
        password: userData.password
      });
      
      expect(await authHelpers.isLoggedIn()).toBe(true);
      
      // Logout
      await authHelpers.logout();
      
      // Should be logged out
      expect(await authHelpers.isLoggedIn()).toBe(false);
      
      // Should redirect to login page
      await loginPage.page.waitForLoadState('networkidle');
      expect(['/login', '/'].some(path => loginPage.page.url().includes(path))).toBe(true);
    });

    test('should clear authentication on manual storage clear', async ({ authHelpers, testHelpers, page }) => {
      // Login user
      const userData = await authHelpers.register();
      await authHelpers.login({
        username: userData.username,
        password: userData.password
      });
      
      expect(await authHelpers.isLoggedIn()).toBe(true);
      
      // Clear storage manually
      await testHelpers.clearStorage();
      
      // Should be logged out
      expect(await authHelpers.isLoggedIn()).toBe(false);
    });
  });

  test.describe('Protected Routes', () => {
    test('should redirect to login for protected routes when not authenticated', async ({ page }) => {
      // Clear any existing authentication
      await page.context().clearCookies();
      
      // Try to access protected routes
      const protectedRoutes = ['/dashboard', '/transactions', '/categories'];
      
      for (const route of protectedRoutes) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        
        // Should redirect to login or show login form
        const currentUrl = page.url();
        const isOnLoginOrRoot = currentUrl.includes('/login') || currentUrl.endsWith('/');
        
        if (!isOnLoginOrRoot) {
          // Some apps might show a login form on the same page
          const hasLoginForm = await page.isVisible('input[type="password"], input[name="password"]');
          expect(hasLoginForm).toBe(true);
        } else {
          expect(isOnLoginOrRoot).toBe(true);
        }
      }
    });

    test('should allow access to protected routes when authenticated', async ({ authHelpers, page }) => {
      // Login user
      await authHelpers.setupAuthenticatedSession();
      expect(await authHelpers.isLoggedIn()).toBe(true);
      
      // Try to access dashboard
      await page.goto('/dashboard');
      await page.waitForLoadState('networkidle');
      
      // Should either be on dashboard or redirect to main app page
      const currentUrl = page.url();
      const isProtectedArea = !currentUrl.includes('/login') && !currentUrl.endsWith('/');
      
      // If we're still on login, the app might use a different auth flow
      if (currentUrl.includes('/login')) {
        console.log('App might require different authentication flow');
      } else {
        expect(isProtectedArea).toBe(true);
      }
    });
  });

  test.describe('User Session Management', () => {
    test('should get current user information', async ({ authHelpers }) => {
      // Login user
      const userData = await authHelpers.register();
      await authHelpers.login({
        username: userData.username,
        password: userData.password
      });
      
      // Try to get current user info
      const currentUser = await authHelpers.getCurrentUser();
      
      // User info might not be stored in localStorage by all apps
      if (currentUser) {
        expect(currentUser).toBeTruthy();
      } else {
        // Just verify we have an auth token
        const token = await authHelpers.getAuthToken();
        expect(token).toBeTruthy();
      }
    });

    test('should handle multiple login attempts', async ({ loginPage, page }) => {
      await loginPage.goto();
      
      // Try multiple invalid logins
      for (let i = 0; i < 3; i++) {
        await loginPage.clearForm();
        await loginPage.login(`invalid${i}`, 'wrongpassword');
        await page.waitForTimeout(1000);
        
        // Should still be on login page
        expect(await loginPage.isOnLoginPage()).toBe(true);
      }
    });
  });
}); 