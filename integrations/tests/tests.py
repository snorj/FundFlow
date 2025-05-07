# integrations/tests.py (or integrations/test_services.py)

import os
from django.test import TestCase, override_settings
# Note: Patch SimpleTestCase if not using DB
# from django.test import SimpleTestCase
from unittest.mock import patch, MagicMock, call # Import call for checking multiple calls
import requests # Import requests itself for exception types
from requests.exceptions import RequestException, HTTPError

# Import the functions/module to test
from .. import services

# Example data
MOCK_BASE_URL = "https://mockapi.test.com/api/v1/" # Base URL for testing
MOCK_TOKEN = "up:test:mocktoken123"

# Use override_settings if your service loads the URL from Django settings globally
# Patching directly in tests is often more reliable for module-level vars
# @override_settings(UP_API_BASE_URL=MOCK_BASE_URL) # Can likely remove this now
class UpApiServiceTests(TestCase): # Use TestCase if models might be involved later

    # Helper to create a mock response object (used for testing _make_up_request)
    def _create_mock_response(self, status_code, json_data=None, text_data=None, headers=None):
        mock_resp = MagicMock(spec=requests.Response)
        mock_resp.status_code = status_code
        mock_resp.headers = headers or {'Content-Type': 'application/json'}

        if json_data is not None:
            mock_resp.json.return_value = json_data
        elif text_data is not None:
             mock_resp.text = text_data
             if 'application/json' not in mock_resp.headers.get('Content-Type', ''):
                  mock_resp.json.side_effect = requests.exceptions.JSONDecodeError("Mock Error", "doc", 0)

        if status_code >= 400:
            # Create an instance of HTTPError to mimic requests raising it
            http_error = HTTPError(response=mock_resp)
            mock_resp.raise_for_status.side_effect = http_error
        else:
             mock_resp.raise_for_status.return_value = None

        return mock_resp

    # --- Tests for _make_up_request ---

    # Patch the module-level variable directly for this test
    @patch('integrations.services.UP_API_BASE_URL', MOCK_BASE_URL)
    @patch('integrations.services.requests.request')
    def test_make_request_success_get(self, mock_request):
        """Test a successful GET request."""
        endpoint = "/test"
        expected_url = MOCK_BASE_URL.rstrip('/') + endpoint
        mock_response_data = {"status": "ok"}
        # Configure the mock requests.request call to return our mock response object
        mock_request.return_value = self._create_mock_response(200, json_data=mock_response_data)

        # Call the function under test
        response = services._make_up_request('GET', endpoint, MOCK_TOKEN, params={'q': 'test'})

        # Assertions
        mock_request.assert_called_once_with(
            'GET',
            expected_url, # This should now match MOCK_BASE_URL
            headers={'Authorization': f'Bearer {MOCK_TOKEN}', 'Accept': 'application/json', 'Content-Type': 'application/json'},
            params={'q': 'test'},
            json=None
        )
        self.assertEqual(response, mock_response_data) # Should return the dictionary

    @patch('integrations.services.requests.request')
    def test_make_request_uses_full_url(self, mock_request):
        """Test that full_url overrides base/endpoint path."""
        full_url = "https://another.domain.com/api/path"
        mock_request.return_value = self._create_mock_response(200, json_data={"data": "value"})

        services._make_up_request('GET', endpoint_path='/ignored', token=MOCK_TOKEN, full_url=full_url)

        called_args, called_kwargs = mock_request.call_args
        self.assertEqual(called_args[1], full_url)

    @patch('integrations.services.requests.request')
    def test_make_request_http_error_401(self, mock_request):
        """Test handling of a 401 Unauthorized error."""
        # Setup the mock to return a 401 response object which raises HTTPError
        mock_response = self._create_mock_response(401, json_data={"errors": [{"title": "Not Authorized"}]})
        mock_request.return_value = mock_response

        with self.assertRaises(HTTPError) as cm:
            services._make_up_request('GET', '/protected', MOCK_TOKEN)
        # Check the exception itself contains the correct response info
        self.assertEqual(cm.exception.response.status_code, 401)


    @patch('integrations.services.requests.request')
    def test_make_request_network_error(self, mock_request):
        """Test handling of a network error."""
        mock_request.side_effect = RequestException("Connection timed out")

        with self.assertRaises(RequestException):
            services._make_up_request('GET', '/whatever', MOCK_TOKEN)

    def test_make_request_missing_token(self):
        """Test ValueError is raised if token is missing."""
        with self.assertRaisesRegex(ValueError, "Up Personal Access Token is required."):
            services._make_up_request('GET', '/ping', token="")
        with self.assertRaisesRegex(ValueError, "Up Personal Access Token is required."):
            services._make_up_request('GET', '/ping', token=None)

    # --- Tests for verify_token ---

    # Now we mock the _make_up_request helper directly
    @patch('integrations.services._make_up_request')
    def test_verify_token_success(self, mock_make_request):
        # Mock the dictionary response expected from _make_up_request
        mock_make_request.return_value = {"meta": {"id": "user-123", "statusEmoji": "⚡️"}}
        is_valid = services.verify_token(MOCK_TOKEN)
        self.assertTrue(is_valid)
        mock_make_request.assert_called_once_with('GET', '/util/ping', MOCK_TOKEN)

    @patch('integrations.services._make_up_request')
    def test_verify_token_failure_http_error(self, mock_make_request):
        # Mock _make_up_request raising an error
        mock_make_request.side_effect = HTTPError(response=MagicMock(status_code=401)) # Simple mock response needed for HTTPError
        is_valid = services.verify_token(MOCK_TOKEN)
        self.assertFalse(is_valid)

    @patch('integrations.services._make_up_request')
    def test_verify_token_failure_bad_response(self, mock_make_request):
        # Mock _make_up_request returning an unexpected dictionary
        mock_make_request.return_value = {"status": "error"} # Missing 'meta'
        is_valid = services.verify_token(MOCK_TOKEN)
        self.assertFalse(is_valid)

    # --- Tests for get_accounts ---

    @patch('integrations.services._make_up_request')
    def test_get_accounts_success(self, mock_make_request):
        mock_data = [{"id": "acc1", "type": "accounts"}, {"id": "acc2", "type": "accounts"}]
        # Mock the dictionary response
        mock_make_request.return_value = {"data": mock_data, "links": {}}
        accounts = services.get_accounts(MOCK_TOKEN)
        self.assertEqual(accounts, mock_data)
        mock_make_request.assert_called_once_with('GET', '/accounts', MOCK_TOKEN)

    @patch('integrations.services._make_up_request')
    def test_get_accounts_api_error(self, mock_make_request):
        # Mock _make_up_request raising an error
        mock_make_request.side_effect = HTTPError(response=MagicMock(status_code=500))
        accounts = services.get_accounts(MOCK_TOKEN)
        self.assertEqual(accounts, []) # Should return empty list on error

    # --- Tests for get_transactions ---

    # Patch the helper function AND the base URL variable used by the function
    @patch('integrations.services.UP_API_BASE_URL', MOCK_BASE_URL)
    @patch('integrations.services._make_up_request')
    def test_get_transactions_no_pagination(self, mock_make_request):
        mock_tx_data = [{"id": "tx1"}, {"id": "tx2"}]
        mock_make_request.return_value = {"data": mock_tx_data, "links": {"prev": None, "next": None}}

        transactions = services.get_transactions(MOCK_TOKEN, page_size=5)

        # Now the base URL used for construction should be the mocked one
        expected_initial_url = MOCK_BASE_URL + "transactions?page%5Bsize%5D=5"
        mock_make_request.assert_called_once_with('GET', endpoint_path=None, token=MOCK_TOKEN, full_url=expected_initial_url)
        self.assertEqual(transactions, mock_tx_data)

    @patch('integrations.services.UP_API_BASE_URL', MOCK_BASE_URL)
    @patch('integrations.services._make_up_request')
    def test_get_transactions_with_pagination(self, mock_make_request):
        mock_tx_page1 = [{"id": "tx1"}, {"id": "tx2"}]
        mock_tx_page2 = [{"id": "tx3"}]
        # Construct URLs using the MOCK base URL now
        initial_url_page1 = MOCK_BASE_URL + "transactions?page%5Bsize%5D=2"
        next_url_page2 = MOCK_BASE_URL + "transactions?page[after]=cursor123&page[size]=2"

        mock_make_request.side_effect = [
            {"data": mock_tx_page1, "links": {"next": next_url_page2}},
            {"data": mock_tx_page2, "links": {"next": None}},
        ]

        transactions = services.get_transactions(MOCK_TOKEN, page_size=2)

        self.assertEqual(mock_make_request.call_count, 2)
        expected_calls = [
            call('GET', endpoint_path=None, token=MOCK_TOKEN, full_url=initial_url_page1),
            call('GET', endpoint_path=None, token=MOCK_TOKEN, full_url=next_url_page2),
        ]
        mock_make_request.assert_has_calls(expected_calls)
        self.assertEqual(transactions, mock_tx_page1 + mock_tx_page2)

    @patch('integrations.services.UP_API_BASE_URL', MOCK_BASE_URL)
    @patch('integrations.services._make_up_request')
    def test_get_transactions_with_since_filter(self, mock_make_request):
        since_time = "2024-01-15T10:00:00Z"
        mock_make_request.return_value = {"data": [], "links": {"next": None}}

        services.get_transactions(MOCK_TOKEN, since_iso=since_time, page_size=10)

        # Construct expected URL with MOCK base and urlencoded filter
        expected_initial_url = MOCK_BASE_URL + f"transactions?page%5Bsize%5D=10&filter%5Bsince%5D={since_time}"
        # Note: Python's urlencode might encode the colon differently, adjust assertion if needed
        # e.g., replace ':' with '%3A' in the expected_initial_url if the test fails on encoding difference
        from urllib.parse import urlencode # Ensure imported
        encoded_params = urlencode({'page[size]': 10, 'filter[since]': since_time})
        expected_initial_url_encoded = MOCK_BASE_URL + f"transactions?{encoded_params}"

        mock_make_request.assert_called_once_with('GET', endpoint_path=None, token=MOCK_TOKEN, full_url=expected_initial_url_encoded)

    @patch('integrations.services.UP_API_BASE_URL', MOCK_BASE_URL)
    @patch('integrations.services._make_up_request')
    def test_get_transactions_error_during_pagination(self, mock_make_request):
        mock_tx_page1 = [{"id": "tx1"}]
        initial_url_page1 = MOCK_BASE_URL + "transactions?page%5Bsize%5D=1"
        next_url_page2 = MOCK_BASE_URL + "transactions?page[after]=cursor1&page[size]=1"

        mock_make_request.side_effect = [
            {"data": mock_tx_page1, "links": {"next": next_url_page2}},
            HTTPError(response=MagicMock(status_code=500)),
        ]

        transactions = services.get_transactions(MOCK_TOKEN, page_size=1)

        self.assertEqual(mock_make_request.call_count, 2)
        expected_calls = [
            call('GET', endpoint_path=None, token=MOCK_TOKEN, full_url=initial_url_page1),
            call('GET', endpoint_path=None, token=MOCK_TOKEN, full_url=next_url_page2),
        ]
        mock_make_request.assert_has_calls(expected_calls)
        self.assertEqual(transactions, mock_tx_page1)