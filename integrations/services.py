# integrations/services.py
import requests
import os
import logging
from urllib.parse import urljoin, urlparse, parse_qs, urlencode
from django.conf import settings
from requests.exceptions import RequestException, HTTPError

logger = logging.getLogger(__name__)

# Load base URL from settings (derived from .env)
UP_API_BASE_URL = os.getenv('UP_API_BASE_URL', 'https://api.up.com.au/api/v1/') # Provide default

def _make_up_request(method: str, endpoint_path: str, token: str, params: dict = None, data: dict = None, full_url: str = None):
    """
    Helper function to make requests to the Up API.

    Args:
        method (str): HTTP method (GET, POST, etc.).
        endpoint_path (str): API endpoint path (e.g., '/accounts'). Required if full_url is None.
        token (str): The decrypted Personal Access Token.
        params (dict, optional): Query parameters. Defaults to None.
        data (dict, optional): JSON body for POST/PATCH etc. Defaults to None.
        full_url (str, optional): Use this full URL instead of constructing from base + path.

    Returns:
        dict: The JSON response from the API.

    Raises:
        HTTPError: If the API returns a 4xx or 5xx status code.
        RequestException: For network or other request-related errors.
        ValueError: If token is missing or base URL/path is invalid.
    """
    if not token:
        raise ValueError("Up Personal Access Token is required.")

    if full_url:
        url = full_url
    elif endpoint_path:
        # Ensure base URL ends with / and endpoint path doesn't start with / for urljoin
        clean_base = UP_API_BASE_URL.rstrip('/') + '/'
        clean_path = endpoint_path.lstrip('/')
        url = urljoin(clean_base, clean_path)
    else:
         raise ValueError("Either endpoint_path or full_url must be provided.")

    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/json',
        'Content-Type': 'application/json' # Needed for POST/PATCH with data
    }

    logger.debug(f"Making Up API request: {method} {url} Params: {params}")
    try:
        response = requests.request(
            method,
            url,
            headers=headers,
            params=params,
            json=data # requests handles JSON encoding
        )
        # Raise an exception for bad status codes (4xx or 5xx)
        response.raise_for_status()
        # Check if response body is actually JSON before trying to decode
        if 'application/json' in response.headers.get('Content-Type', ''):
            return response.json()
        else:
            # Handle cases where the response isn't JSON (though Up API usually is)
            logger.warning(f"Up API response was not JSON for {method} {url}. Status: {response.status_code}")
            return {"raw_content": response.text, "status_code": response.status_code}

    except HTTPError as http_err:
        # Log specific HTTP errors
        error_body = http_err.response.text # Try to get error details from body
        logger.error(f"HTTP error occurred: {http_err}. Status: {http_err.response.status_code}. Body: {error_body}")
        # Re-raise the specific HTTPError
        raise http_err
    except RequestException as req_err:
        # Log other request errors (network, DNS, etc.)
        logger.error(f"Request failed: {req_err}")
        raise req_err # Re-raise the original exception


def verify_token(token: str) -> bool:
    """Verifies if the Up PAT is valid by pinging the API."""
    try:
        response = _make_up_request('GET', '/util/ping', token)
        # Check for expected structure in success response
        is_valid = isinstance(response, dict) and 'meta' in response and 'id' in response['meta']
        if is_valid:
             logger.info(f"Up token verified successfully for user ID: {response['meta']['id']}")
        else:
             logger.warning(f"Up token ping response structure unexpected: {response}")
        return is_valid
    except (HTTPError, RequestException):
        # Errors during ping mean the token is likely invalid or API is unreachable
        logger.warning(f"Up token verification failed.")
        return False
    except ValueError as ve: # Catch missing token error from helper
         logger.error(f"Token verification value error: {ve}")
         return False


def get_accounts(token: str) -> list:
    """Fetches all accounts associated with the token."""
    try:
        response = _make_up_request('GET', '/accounts', token)
        accounts = response.get('data', [])
        logger.info(f"Fetched {len(accounts)} accounts for token.")
        return accounts
    except (HTTPError, RequestException) as e:
        logger.error(f"Failed to fetch Up accounts: {e}")
        return [] # Return empty list on failure


def get_transactions(token: str, since_iso: str = None, until_iso: str = None, page_size: int = 100) -> list:
    """
    Fetches transactions, handling pagination.

    Args:
        token (str): Decrypted Up PAT.
        since_iso (str, optional): ISO 8601 timestamp for filtering start date.
        until_iso (str, optional): ISO 8601 timestamp for filtering end date.
        page_size (int, optional): Number of records per page (max 100 for Up).

    Returns:
        list: A list of all transaction data dictionaries fetched.
    """
    all_transactions = []
    endpoint = '/transactions' # Base endpoint
    params = {'page[size]': min(page_size, 100)} # Use API max if requested size > 100

    # Add time filters if provided
    if since_iso:
        params['filter[since]'] = since_iso
    if until_iso:
        params['filter[until]'] = until_iso

    # Construct initial URL (easier than managing params across pagination links)
    base = UP_API_BASE_URL.rstrip('/') + endpoint
    next_url = f"{base}?{urlencode(params)}"

    logger.info(f"Starting transaction fetch. Initial URL: {next_url}")

    while next_url:
        try:
            logger.debug(f"Fetching transactions from: {next_url}")
            # Use the full_url parameter for pagination links
            response = _make_up_request('GET', endpoint_path=None, token=token, full_url=next_url)

            transactions_page = response.get('data', [])
            if transactions_page: # Only extend if list is not empty
                all_transactions.extend(transactions_page)
                logger.debug(f"Fetched {len(transactions_page)} transactions. Total so far: {len(all_transactions)}")
            else:
                 logger.debug("Fetched an empty page of transactions.")

            # Get the next URL from the links object
            next_url = response.get('links', {}).get('next')
            if next_url:
                logger.debug(f"Next pagination URL found: {next_url}")
            else:
                logger.info("No next pagination URL found. Fetch complete.")

        except (HTTPError, RequestException) as e:
            logger.error(f"Failed to fetch transaction page ({next_url}): {e}")
            # Decide on failure strategy: return partial list or raise error?
            # Returning partial list might be better for user experience.
            logger.warning(f"Returning partial transaction list ({len(all_transactions)} items) due to error.")
            break # Exit loop on error
        except ValueError as e:
            logger.error(f"Value error during transaction fetch: {e}")
            break

    logger.info(f"Finished transaction fetch. Total transactions retrieved: {len(all_transactions)}")
    return all_transactions