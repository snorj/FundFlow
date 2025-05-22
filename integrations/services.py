# integrations/services.py
from decimal import Decimal
import requests
import os
import logging
from urllib.parse import urljoin, urlencode # Removed unused urlparse, parse_qs
# from django.conf import settings # Not strictly needed if using os.getenv directly
from requests.exceptions import RequestException, HTTPError
from datetime import datetime

logger = logging.getLogger(__name__)

# Load base URL from environment variables, with a fallback for safety during development
UP_API_BASE_URL = os.getenv('UP_API_BASE_URL', 'https://api.up.com.au/api/v1/')
if not UP_API_BASE_URL.endswith('/'): # Ensure it ends with a slash
    UP_API_BASE_URL += '/'

def _make_up_request(method: str, endpoint_path: str | None, token: str, params: dict = None, data: dict = None, full_url: str = None):
    """
    Helper function to make requests to the Up API.

    Args:
        method (str): HTTP method (GET, POST, etc.).
        endpoint_path (str | None): API endpoint path (e.g., 'accounts'). Required if full_url is None.
                                  Should NOT start with a slash.
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
        logger.error("Up Personal Access Token is missing for API request.")
        raise ValueError("Up Personal Access Token is required.")

    if full_url:
        url = full_url
    elif endpoint_path is not None: # Check specifically for None, as empty string could be intentional for base
        url = urljoin(UP_API_BASE_URL, endpoint_path)
    else:
         logger.error("Either endpoint_path or full_url must be provided for API request.")
         raise ValueError("Either endpoint_path or full_url must be provided.")

    headers = {
        'Authorization': f'Bearer {token}',
        'Accept': 'application/json',
    }
    # Only add Content-Type if there's data to send
    if data is not None:
        headers['Content-Type'] = 'application/json'


    logger.debug(f"Making Up API request: {method} {url} Params: {params} Data: {data is not None}")
    try:
        response = requests.request(
            method.upper(), # Ensure method is uppercase
            url,
            headers=headers,
            params=params,
            json=data # requests handles JSON encoding if data is a dict
        )
        response.raise_for_status() # Raise an exception for bad status codes (4xx or 5xx)

        if 'application/json' in response.headers.get('Content-Type', ''):
            return response.json()
        else:
            logger.warning(f"Up API response was not JSON for {method} {url}. Status: {response.status_code}, Content: {response.text[:200]}")
            # Depending on API behavior, this might be an error or expected for some endpoints
            return {"raw_content": response.text, "status_code": response.status_code, "is_non_json": True}

    except HTTPError as http_err:
        error_body_preview = http_err.response.text[:500] if hasattr(http_err.response, 'text') else "No response body"
        logger.error(f"HTTP error occurred: {http_err}. Status: {http_err.response.status_code}. URL: {url}. Body preview: {error_body_preview}")
        raise http_err
    except RequestException as req_err:
        logger.error(f"Request failed for URL {url}: {req_err}")
        raise req_err


def verify_token(token: str) -> bool:
    """Verifies if the Up PAT is valid by pinging the API."""
    try:
        # Pass endpoint_path as 'util/ping' (no leading slash for urljoin with base ending in /)
        response = _make_up_request('GET', 'util/ping', token)
        is_valid = isinstance(response, dict) and 'meta' in response and 'id' in response['meta']
        if is_valid:
             logger.info(f"Up token verified successfully. User meta ID from ping: {response['meta'].get('id')}")
        else:
             logger.warning(f"Up token ping response structure unexpected or non-JSON: {response}")
        return is_valid
    except (HTTPError, RequestException, ValueError) as e: # Catch ValueError from _make_up_request too
        logger.warning(f"Up token verification failed: {type(e).__name__} - {e}")
        return False


def get_accounts(token: str) -> list:
    """Fetches all accounts associated with the token."""
    try:
        response = _make_up_request('GET', 'accounts', token)
        accounts = response.get('data', []) if isinstance(response, dict) else []
        logger.info(f"Fetched {len(accounts)} accounts for token.")
        return accounts
    except (HTTPError, RequestException, ValueError) as e:
        logger.error(f"Failed to fetch Up accounts: {type(e).__name__} - {e}")
        return []


def get_transactions(token: str, since_iso: str = None, until_iso: str = None, page_size: int = 100) -> list:
    """
    Fetches transactions from the Up API, handling pagination.

    Args:
        token (str): Decrypted Up PAT.
        since_iso (str, optional): ISO 8601 timestamp for filtering start date (filter[since]).
        until_iso (str, optional): ISO 8601 timestamp for filtering end date (filter[until]).
        page_size (int, optional): Number of records per page (max 100 for Up).

    Returns:
        list: A list of all transaction data dictionaries fetched.
    """
    all_transactions = []
    params = {'page[size]': min(page_size, 100)} # Up API max page size is 100

    if since_iso:
        params['filter[since]'] = since_iso
    if until_iso:
        params['filter[until]'] = until_iso

    # Construct initial URL using urljoin and urlencode for params
    # Pass endpoint_path='transactions' to _make_up_request for the first call
    next_url = None # Will be set by the first response or if no params

    current_endpoint_path = 'transactions'
    current_params = params.copy()


    logger.info(f"Starting Up transaction fetch. Initial params: {current_params}")

    while True: # Loop will be controlled by presence of next_url or breaking on error
        try:
            if next_url: # For subsequent pages, use the full URL from API response
                logger.debug(f"Fetching transactions from paginated URL: {next_url}")
                response = _make_up_request(method='GET', endpoint_path=None, token=token, full_url=next_url)
            else: # For the first page
                logger.debug(f"Fetching first page of transactions. Path: {current_endpoint_path}, Params: {current_params}")
                response = _make_up_request(method='GET', endpoint_path=current_endpoint_path, token=token, params=current_params)

            if not isinstance(response, dict): # Check if response is a dict (expected JSON)
                logger.error(f"Unexpected response type from Up API: {type(response)}. Content: {str(response)[:200]}")
                break # Cannot process further

            transactions_page = response.get('data', [])
            if transactions_page:
                all_transactions.extend(transactions_page)
                logger.debug(f"Fetched {len(transactions_page)} transactions this page. Total so far: {len(all_transactions)}")
            else:
                 logger.debug("Fetched an empty page of transactions (or no 'data' key).")

            next_url = response.get('links', {}).get('next')
            if not next_url:
                logger.info("No next pagination URL found. Transaction fetch complete.")
                break # Exit loop if no more pages

        except (HTTPError, RequestException, ValueError) as e:
            logger.error(f"Failed to fetch a transaction page: {type(e).__name__} - {e}")
            logger.warning(f"Returning partial transaction list ({len(all_transactions)} items) due to error.")
            break # Exit loop on error

    logger.info(f"Finished transaction fetch. Total transactions retrieved: {len(all_transactions)}")
    return all_transactions

# --- NEW: Currency Exchange Rate Service ---
# Base URL for the Fawazahmed0 Currency API (using a CDN link)
# Using 'latest' in the path will ensure we always point to the most recent API version available at this CDN.
CURRENCY_API_BASE_URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/"

def get_historical_exchange_rate(date_str: str, from_currency: str, to_currency: str) -> Decimal | None:
    """
    Fetches the historical exchange rate for a given date, from_currency, and to_currency.
    Uses the Fawazahmed0 Currency API.

    Args:
        date_str (str): The date for the historical rate in 'YYYY-MM-DD' format.
        from_currency (str): The ISO 4217 currency code to convert from (e.g., 'EUR').
        to_currency (str): The ISO 4217 currency code to convert to (e.g., 'AUD').

    Returns:
        Decimal | None: The exchange rate (how many units of `to_currency` for one unit of `from_currency`),
                        or None if the rate cannot be fetched.
    """
    # --- ADDED: Future date check --- 
    try:
        request_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        today = datetime.now().date()
        if request_date > today:
            logger.warning(f"Attempted to fetch exchange rate for a future date: {date_str}. Returning None.")
            return None
    except ValueError:
        logger.error(f"Invalid date format provided to get_historical_exchange_rate: {date_str}. Expected YYYY-MM-DD.")
        return None
    # --- END: Future date check ---

    if from_currency.upper() == to_currency.upper():
        return Decimal("1.0") # Rate is 1 if currencies are the same

    # API endpoint format: /{date}/currencies/{from_currency_lowercase}.json
    # The API returns rates *relative to* the from_currency.
    # So, we need to get the rate of to_currency_lowercase based on from_currency_lowercase.
    endpoint = f"{date_str}/currencies/{from_currency.lower()}.json"
    url = urljoin(CURRENCY_API_BASE_URL, endpoint)

    logger.debug(f"Fetching exchange rate: {from_currency} to {to_currency} for date {date_str} from {url}")

    try:
        response = requests.get(url, timeout=10) # Add a timeout
        response.raise_for_status() # Check for HTTP errors
        data = response.json()

        # The actual rates are nested under the 'from_currency' key in the response
        # e.g. if from_currency is 'eur', data['eur']['aud'] gives EUR to AUD rate
        rate_value = data.get(from_currency.lower(), {}).get(to_currency.lower())

        if rate_value is not None:
            try:
                rate = Decimal(str(rate_value)) # Convert to Decimal robustly
                logger.info(f"Fetched rate {from_currency}->{to_currency} on {date_str}: {rate}")
                return rate
            except Exception: # Handle potential conversion error for rate_value
                logger.error(f"Could not convert rate value '{rate_value}' to Decimal.")
                return None
        else:
            logger.warning(f"Rate for {to_currency.lower()} not found in response for base {from_currency.lower()} on {date_str}. Response data: {data}")
            return None

    except RequestException as e:
        logger.error(f"Network error fetching exchange rate for {date_str}, {from_currency}->{to_currency}: {e}")
        return None
    except HTTPError as e:
        logger.error(f"HTTP error fetching exchange rate for {date_str}, {from_currency}->{to_currency}: {e.response.status_code} - {e.response.text[:200]}")
        return None
    except Exception as e: # Catch any other errors like JSONDecodeError
        logger.exception(f"Unexpected error fetching exchange rate for {date_str}, {from_currency}->{to_currency}: {e}")
        return None