import json
from django.urls import reverse
from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase
# Import if verifying blacklist directly (Optional)
# from rest_framework_simplejwt.token_blacklist.models import OutstandingToken

User = get_user_model()

class AuthAPITests(APITestCase):
    """
    Tests for the Authentication API endpoints (/api/auth/).
    """
    TEST_USER = 'testuser'
    TEST_PASSWORD = 'strongpassword123'
    TEST_EMAIL = 'test@example.com'
    TEST_FIRST_NAME = 'Test'
    TEST_LAST_NAME = 'User'

    REGISTER_DATA = {
        'username': 'newuser',
        'email': 'new@example.com',
        'password': 'newpassword123',
        'password2': 'newpassword123',
        'first_name': 'New',
        'last_name': 'User'
    }

    def setUp(self):
        self.user = User.objects.create_user(
            username=self.TEST_USER,
            password=self.TEST_PASSWORD,
            email=self.TEST_EMAIL,
            first_name=self.TEST_FIRST_NAME,
            last_name=self.TEST_LAST_NAME
        )
        self.register_url = reverse('api_register')
        self.token_url = reverse('token_obtain_pair')
        self.refresh_url = reverse('token_refresh')
        self.user_info_url = reverse('api_user_info')
        self.logout_url = reverse('api_logout')

    def get_tokens_for_user(self, username, password):
        response = self.client.post(self.token_url, {
            'username': username,
            'password': password
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK, "Helper login failed")
        return response.data['access'], response.data['refresh']

    # === Registration Tests ===

    def test_register_success(self):
        response = self.client.post(self.register_url, self.REGISTER_DATA, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username=self.REGISTER_DATA['username']).exists())
        self.assertEqual(response.data['username'], self.REGISTER_DATA['username'])
        self.assertEqual(response.data['email'], self.REGISTER_DATA['email'])
        self.assertEqual(response.data['first_name'], self.REGISTER_DATA['first_name'])
        self.assertEqual(response.data['last_name'], self.REGISTER_DATA['last_name'])
        self.assertNotIn('password', response.data)

    def test_register_fail_passwords_mismatch(self):
        invalid_data = self.REGISTER_DATA.copy()
        invalid_data['password2'] = 'differentpassword'
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username=invalid_data['username']).exists())
        self.assertIn('password', response.data)
        # Match the exact string from the serializer
        self.assertTrue(any("Password fields didn't match." in msg for msg in response.data.get('password', [])), f"Did not find expected password mismatch error in {response.data}")

    def test_register_fail_missing_fields(self):
        # Test missing username
        invalid_data = self.REGISTER_DATA.copy()
        del invalid_data['username']
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)

        # Test missing password
        invalid_data = self.REGISTER_DATA.copy()
        del invalid_data['password']
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password', response.data)

        # Test missing password2
        invalid_data = self.REGISTER_DATA.copy()
        del invalid_data['password2']
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('password2', response.data)

        # Test missing email
        invalid_data = self.REGISTER_DATA.copy()
        del invalid_data['email']
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)

        # Test missing first_name
        invalid_data = self.REGISTER_DATA.copy()
        del invalid_data['first_name']
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('first_name', response.data)

        # Test missing last_name
        invalid_data = self.REGISTER_DATA.copy()
        del invalid_data['last_name']
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('last_name', response.data)


    def test_register_fail_duplicate_username(self):
        invalid_data = self.REGISTER_DATA.copy()
        invalid_data['username'] = self.TEST_USER
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('username', response.data)
        self.assertTrue(any('already exists' in msg for msg in response.data['username']))

    def test_register_fail_duplicate_email(self):
        invalid_data = self.REGISTER_DATA.copy()
        invalid_data['email'] = self.TEST_EMAIL
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)
        self.assertTrue(any('already exists' in msg for msg in response.data['email']))

    def test_register_fail_invalid_email_format(self):
        invalid_data = self.REGISTER_DATA.copy()
        invalid_data['email'] = 'not-an-email'
        response = self.client.post(self.register_url, invalid_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('email', response.data)
        self.assertTrue(any('valid email address' in msg for msg in response.data['email']))

    # === Login Tests ===

    def test_login_success(self):
        data = {'username': self.TEST_USER, 'password': self.TEST_PASSWORD}
        response = self.client.post(self.token_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertIsNotNone(response.data['access'])
        self.assertIsNotNone(response.data['refresh'])

    def test_login_failure_invalid_password(self):
        data = {'username': self.TEST_USER, 'password': 'wrongpassword'}
        response = self.client.post(self.token_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn('access', response.data)
        self.assertIn('detail', response.data)

    def test_login_failure_invalid_username(self):
        data = {'username': 'nonexistentuser', 'password': self.TEST_PASSWORD}
        response = self.client.post(self.token_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertNotIn('access', response.data)
        self.assertIn('detail', response.data)

    # === Token Refresh Tests ===

    def test_token_refresh_success(self):
        _, refresh_token = self.get_tokens_for_user(self.TEST_USER, self.TEST_PASSWORD)
        response = self.client.post(self.refresh_url, {'refresh': refresh_token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIsNotNone(response.data['access'])
        self.assertNotIn('refresh', response.data)

    def test_token_refresh_fail_invalid_token(self):
        invalid_refresh_token = 'this.is.invalid'
        response = self.client.post(self.refresh_url, {'refresh': invalid_refresh_token}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertIn('detail', response.data)
        self.assertIn('code', response.data)
        self.assertEqual(response.data['code'], 'token_not_valid')

    # === User Info Tests ===

    def test_get_user_info_success(self):
        access_token, _ = self.get_tokens_for_user(self.TEST_USER, self.TEST_PASSWORD)
        auth_header = f'Bearer {access_token}'
        response = self.client.get(self.user_info_url, HTTP_AUTHORIZATION=auth_header)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], self.TEST_USER)
        self.assertEqual(response.data['email'], self.TEST_EMAIL)
        self.assertEqual(response.data['first_name'], self.TEST_FIRST_NAME)
        self.assertEqual(response.data['last_name'], self.TEST_LAST_NAME)
        self.assertIn('id', response.data)

    def test_get_user_info_fail_no_token(self):
        self.client.credentials() # Clear credentials
        response = self.client.get(self.user_info_url)
        # Expect 403 Forbidden due to IsAuthenticated permission check
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_get_user_info_fail_invalid_token(self):
        invalid_token = 'invalid.token.string'
        auth_header = f'Bearer {invalid_token}'
        response = self.client.get(self.user_info_url, HTTP_AUTHORIZATION=auth_header)
        # Expect 403 Forbidden due to IsAuthenticated permission check failing before auth backend raises 401
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    # === Logout Tests ===

    def test_logout_success(self):
        """
        Ensure a user can logout AND the refresh token is blacklisted.
        Requires 'rest_framework_simplejwt.token_blacklist' in INSTALLED_APPS and migrations run.
        """
        access_token, refresh_token = self.get_tokens_for_user(self.TEST_USER, self.TEST_PASSWORD)
        auth_header = f'Bearer {access_token}'
        response = self.client.post(self.logout_url, {'refresh': refresh_token}, format='json', HTTP_AUTHORIZATION=auth_header)

        # Check logout request itself was successful (204 No Content is expected from view)
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT, f"Logout endpoint failed with status {response.status_code}. Check view logic and ensure blacklist app is migrated.")

        # Verify blacklisting by attempting to use the refresh token again
        refresh_response = self.client.post(self.refresh_url, {'refresh': refresh_token}, format='json')
        self.assertEqual(refresh_response.status_code, status.HTTP_401_UNAUTHORIZED, "Refresh token was not blacklisted after successful logout.")
        self.assertEqual(refresh_response.data.get('code'), 'token_not_valid', "Refresh token blacklist check failed.")


    def test_logout_fail_no_auth(self):
        """
        Ensure logout fails if the user is not authenticated (permission check).
        """
        some_refresh_token = "dummy.refresh.token" # Need *some* value even if request fails before validation
        response = self.client.post(self.logout_url, {'refresh': some_refresh_token}, format='json')
        # Expect 403 Forbidden due to IsAuthenticated permission check
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_logout_fail_missing_refresh_token(self):
        """
        Ensure logout fails if the refresh token is not provided in the body.
        """
        access_token, _ = self.get_tokens_for_user(self.TEST_USER, self.TEST_PASSWORD)
        auth_header = f'Bearer {access_token}'
        response = self.client.post(self.logout_url, {}, format='json', HTTP_AUTHORIZATION=auth_header) # Empty body
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        # Check for the detail message returned by the improved view
        self.assertIn('detail', response.data)
        self.assertEqual(response.data['detail'], "Refresh token is required.")