const { expect } = require('@playwright/test');

/**
 * Page Object Model for Login Page
 */
class LoginPage {
  constructor(page) {
    this.page = page;
    
    // Selectors
    this.usernameInput = 'input[name="username"], input[type="email"]';
    this.passwordInput = 'input[name="password"], input[type="password"]';
    this.loginButton = 'button[type="submit"], button:has-text("Sign In")';
    this.signUpLink = 'a:has-text("Sign Up"), link:has-text("Sign Up")';
    this.forgotPasswordLink = 'a:has-text("Forgot"), link:has-text("Forgot")';
    this.showPasswordButton = 'button:has-text("Show password")';
    this.errorMessage = '.error, [data-testid="error"], .alert-error';
    this.form = 'form';
    this.logo = 'img[alt*="Logo"], img[alt*="FundFlow"]';
  }

  /**
   * Navigate to login page
   */
  async goto() {
    await this.page.goto('/login');
    await this.waitForPageLoad();
  }

  /**
   * Wait for login page to load completely
   */
  async waitForPageLoad() {
    await this.page.waitForSelector(this.usernameInput);
    await this.page.waitForSelector(this.passwordInput);
    await this.page.waitForSelector(this.loginButton);
  }

  /**
   * Fill username/email field
   */
  async fillUsername(username) {
    await this.page.fill(this.usernameInput, username);
  }

  /**
   * Fill password field
   */
  async fillPassword(password) {
    await this.page.fill(this.passwordInput, password);
  }

  /**
   * Click login button
   */
  async clickLogin() {
    await this.page.click(this.loginButton);
  }

  /**
   * Perform complete login process
   */
  async login(username, password) {
    await this.fillUsername(username);
    await this.fillPassword(password);
    await this.clickLogin();
    
    // Wait for navigation
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Click sign up link
   */
  async clickSignUp() {
    await this.page.click(this.signUpLink);
  }

  /**
   * Click forgot password link
   */
  async clickForgotPassword() {
    await this.page.click(this.forgotPasswordLink);
  }

  /**
   * Toggle password visibility
   */
  async togglePasswordVisibility() {
    if (await this.page.isVisible(this.showPasswordButton)) {
      await this.page.click(this.showPasswordButton);
    }
  }

  /**
   * Get error message text
   */
  async getErrorMessage() {
    if (await this.page.isVisible(this.errorMessage)) {
      return await this.page.textContent(this.errorMessage);
    }
    return null;
  }

  /**
   * Check if error message is displayed
   */
  async hasError() {
    return await this.page.isVisible(this.errorMessage);
  }

  /**
   * Verify login page elements are present
   */
  async verifyPageElements() {
    await expect(this.page.locator(this.usernameInput)).toBeVisible();
    await expect(this.page.locator(this.passwordInput)).toBeVisible();
    await expect(this.page.locator(this.loginButton)).toBeVisible();
    await expect(this.page.locator(this.signUpLink)).toBeVisible();
  }

  /**
   * Get current URL
   */
  async getCurrentURL() {
    return this.page.url();
  }

  /**
   * Check if currently on login page
   */
  async isOnLoginPage() {
    return this.page.url().includes('/login');
  }

  /**
   * Wait for successful login (redirect away from login page)
   */
  async waitForLoginSuccess() {
    await this.page.waitForFunction(() => 
      !window.location.pathname.includes('/login')
    );
  }

  /**
   * Clear form fields
   */
  async clearForm() {
    await this.page.fill(this.usernameInput, '');
    await this.page.fill(this.passwordInput, '');
  }

  /**
   * Check form validation state
   */
  async isFormValid() {
    const usernameValue = await this.page.inputValue(this.usernameInput);
    const passwordValue = await this.page.inputValue(this.passwordInput);
    return usernameValue.length > 0 && passwordValue.length > 0;
  }

  /**
   * Get login button state
   */
  async isLoginButtonEnabled() {
    return await this.page.isEnabled(this.loginButton);
  }

  /**
   * Take screenshot of login page
   */
  async takeScreenshot(name = 'login-page') {
    await this.page.screenshot({ 
      path: `test-results/screenshots/${name}.png`,
      fullPage: true 
    });
  }
}

module.exports = { LoginPage }; 