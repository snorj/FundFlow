# integrations/tests/test_services.py
import os
from unittest import mock # For mocking requests
from django.test import TestCase, override_settings
from requests.exceptions import HTTPError, RequestException

# Assuming your services are in integrations.services
from ..services import (
    _make_up_request,
    verify_token,
    get_accounts,
    get_transactions,
    UP_API_BASE_URL # Import this to potentially override for testing
)

# Define a consistent test token
TEST_UP_PAT = "fake_personal_access_token_for_testing"

# Override UP_API_BASE_URL for tests to avoid hitting the real API by accident
# and to have a predictable base.
@override_settings(UP_API_BASE_URL=os.getenv('UP_API_BASE_URL', 'https://api.up.com.au/api/v1/')) # Keep your default
class UpApiServiceTests(TestCase):

    # === Tests for _make_up_request ===
    @mock.patch('integrations.services.requests.request') # Target where 'requests' is used
    def test_make_up_request_success(self, mock_request):
        mock_response = mock.Mock()
        mock_response.status_code = 200
        mock_response.json.return_value = {"data": "success"}
        mock_response.headers = {'Content-Type': 'application/json'}
        mock_request.return_value = mock_response

        response = _make_up_request('GET', 'test/endpoint', TEST_UP_PAT)
        self.assertEqual(response, {"data": "success"})
        mock_request.assert_called_once_with(
            'GET',
            f"{UP_API_BASE_URL}test/endpoint", # Ensure UP_API_BASE_URL is correctly used
            headers={'Authorization': f'Bearer {TEST_UP_PAT}', 'Accept': 'application/json'},
            params=None,
            json=None
        )

    @mock.patch('integrations.services.requests.request')
    def test_make_up_request_http_error(self, mock_request):
        mock_response = mock.Mock()
        mock_response.status_code = 401
        mock_response.raise_for_status.side_effect = HTTPError(response=mock_response)
        mock_response.text = '{"error": "Unauthorized"}' # Example error body
        mock_request.return_value = mock_response

        with self.assertRaises(HTTPError):
            _make_up_request('GET', 'test/endpoint', TEST_UP_PAT)

    @mock.patch('integrations.services.requests.request')
    def test_make_up_request_network_error(self, mock_request):
        mock_request.side_effect = RequestException("Network error")
        with self.assertRaises(RequestException):
            _make_up_request('GET', 'test/endpoint', TEST_UP_PAT)

    def test_make_up_request_no_token(self):
        with self.assertRaisesRegex(ValueError, "Up Personal Access Token is required."):
            _make_up_request('GET', 'test/endpoint', "") # Empty token

    def test_make_up_request_no_path_or_full_url(self):
        with self.assertRaisesRegex(ValueError, "Either endpoint_path or full_url must be provided."):
            _make_up_request('GET', None, TEST_UP_PAT, full_url=None)


    # === Tests for verify_token ===
    @mock.patch('integrations.services._make_up_request') # Mock our internal helper
    def test_verify_token_success(self, mock_make_request):
        mock_make_request.return_value = {"meta": {"id": "user123"}}
        self.assertTrue(verify_token(TEST_UP_PAT))
        mock_make_request.assert_called_once_with('GET', 'util/ping', TEST_UP_PAT)

    @mock.patch('integrations.services._make_up_request')
    def test_verify_token_failure_http_error(self, mock_make_request):
        mock_make_request.side_effect = HTTPError # Simulate an HTTP error from Up
        self.assertFalse(verify_token(TEST_UP_PAT))

    @mock.patch('integrations.services._make_up_request')
    def test_verify_token_failure_bad_response(self, mock_make_request):
        mock_make_request.return_value = {"error": "bad data"} # Not the expected structure
        self.assertFalse(verify_token(TEST_UP_PAT))


    # === Tests for get_accounts ===
    @mock.patch('integrations.services._make_up_request')
    def test_get_accounts_success(self, mock_make_request):
        mock_make_request.return_value = {"data": [{"id": "acc1"}, {"id": "acc2"}]}
        accounts = get_accounts(TEST_UP_PAT)
        self.assertEqual(len(accounts), 2)
        self.assertEqual(accounts[0]['id'], "acc1")
        mock_make_request.assert_called_once_with('GET', 'accounts', TEST_UP_PAT)

    @mock.patch('integrations.services._make_up_request')
    def test_get_accounts_failure(self, mock_make_request):
        mock_make_request.side_effect = HTTPError
        accounts = get_accounts(TEST_UP_PAT)
        self.assertEqual(accounts, []) # Expect empty list on failure


    # === Tests for get_transactions (including pagination) ===
    @mock.patch('integrations.services._make_up_request')
    def test_get_transactions_single_page(self, mock_make_request):
        # Simulate a single page of results
        mock_make_request.return_value = {
            "data": [{"id": "tx1"}, {"id": "tx2"}],
            "links": {"next": None}
        }
        transactions = get_transactions(TEST_UP_PAT, since_iso="2023-01-01T00:00:00Z", page_size=50)
        self.assertEqual(len(transactions), 2)
        mock_make_request.assert_called_once_with(
            method='GET',
            endpoint_path='transactions',
            token=TEST_UP_PAT,
            params={'page[size]': 50, 'filter[since]': '2023-01-01T00:00:00Z'}
        )

    @mock.patch('integrations.services._make_up_request')
    def test_get_transactions_multiple_pages(self, mock_make_request):
        # Simulate two pages of results
        next_page_url = f"{UP_API_BASE_URL}transactions?page[after]=cursor123&page[size]=2"
        mock_make_request.side_effect = [
            { # Response for first page
                "data": [{"id": "tx1"}, {"id": "tx2"}],
                "links": {"next": next_page_url}
            },
            { # Response for second page
                "data": [{"id": "tx3"}],
                "links": {"next": None}
            }
        ]
        transactions = get_transactions(TEST_UP_PAT, page_size=2)
        self.assertEqual(len(transactions), 3)
        self.assertEqual(transactions[2]['id'], "tx3")

        # Check calls: first with endpoint_path & params, second with full_url
        expected_calls = [
            mock.call(method='GET', endpoint_path='transactions', token=TEST_UP_PAT, params={'page[size]': 2}),
            mock.call(method='GET', endpoint_path=None, token=TEST_UP_PAT, full_url=next_page_url)
        ]
        self.assertEqual(mock_make_request.call_args_list, expected_calls)

    @mock.patch('integrations.services._make_up_request')
    def test_get_transactions_api_error_during_pagination(self, mock_make_request):
        next_page_url = f"{UP_API_BASE_URL}transactions?page[after]=cursor123&page[size]=2"
        mock_make_request.side_effect = [
            { # Response for first page
                "data": [{"id": "tx1"}, {"id": "tx2"}],
                "links": {"next": next_page_url}
            },
            HTTPError # Simulate error on fetching the second page
        ]
        transactions = get_transactions(TEST_UP_PAT, page_size=2)
        # Should return partially fetched transactions
        self.assertEqual(len(transactions), 2)
        self.assertEqual(transactions[0]['id'], 'tx1')