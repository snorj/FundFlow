import os
import plaid
from plaid.api import plaid_api
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest
from plaid.model.products import Products
from plaid.model.country_code import CountryCode
from plaid.model.transactions_get_request import TransactionsGetRequest
from plaid.model.accounts_get_request import AccountsGetRequest
from datetime import datetime, timedelta
from django.conf import settings

class PlaidService:
    def __init__(self):
        # Configure the Plaid client
        configuration = plaid.Configuration(
            host=plaid.Environment.Sandbox,  # Change to Development or Production when ready
            api_key={
                'clientId': os.getenv('PLAID_CLIENT_ID'),
                'secret': os.getenv('PLAID_SECRET'),
            }
        )
        api_client = plaid.ApiClient(configuration)
        self.client = plaid_api.PlaidApi(api_client)
    
    def create_link_token(self, user_id):
        """
        Create a link token for initializing Plaid Link
        
        Args:
            user_id: The ID of the user for whom the token is being created
            
        Returns:
            A link token that can be used to initialize Plaid Link
        """
        try:
            request = LinkTokenCreateRequest(
                user=LinkTokenCreateRequestUser(
                    client_user_id=str(user_id)
                ),
                client_name="Fund Flow",
                products=[Products("transactions")],
                country_codes=[CountryCode("US")],
                language='en',
                webhook='https://yourdomain.com/plaid/webhook/'  # Update with your actual webhook URL
            )
            response = self.client.link_token_create(request)
            return response.link_token
        except plaid.ApiException as e:
            print(f"Error creating link token: {e}")
            return None
    
    def exchange_public_token(self, public_token):
        """
        Exchange a public token for an access token
        
        Args:
            public_token: The public token received from Plaid Link
            
        Returns:
            The access token and item ID
        """
        try:
            request = ItemPublicTokenExchangeRequest(public_token=public_token)
            response = self.client.item_public_token_exchange(request)
            return {
                'access_token': response.access_token,
                'item_id': response.item_id
            }
        except plaid.ApiException as e:
            print(f"Error exchanging public token: {e}")
            return None
    
    def get_accounts(self, access_token):
        """
        Get accounts associated with an access token
        
        Args:
            access_token: The access token for the item
            
        Returns:
            Account data
        """
        try:
            request = AccountsGetRequest(access_token=access_token)
            response = self.client.accounts_get(request)
            return response.accounts
        except plaid.ApiException as e:
            print(f"Error getting accounts: {e}")
            return None
    
    def get_transactions(self, access_token, start_date=None, end_date=None):
        """
        Get transactions for a date range
        
        Args:
            access_token: The access token for the item
            start_date: The start date for transactions (defaults to 30 days ago)
            end_date: The end date for transactions (defaults to today)
            
        Returns:
            Transaction data
        """
        try:
            # Set default date range if not provided
            if start_date is None:
                start_date = (datetime.now() - timedelta(days=30)).date()
            if end_date is None:
                end_date = datetime.now().date()
                
            # Convert dates to strings
            start_date_str = start_date.strftime('%Y-%m-%d')
            end_date_str = end_date.strftime('%Y-%m-%d')
            
            request = TransactionsGetRequest(
                access_token=access_token,
                start_date=start_date_str,
                end_date=end_date_str,
                options={
                    'count': 100,  # Adjust as needed
                    'offset': 0
                }
            )
            response = self.client.transactions_get(request)
            
            # Pagination handling (if needed)
            transactions = response.transactions
            total_transactions = response.total_transactions
            
            # If there are more transactions than what was returned in the first request
            while len(transactions) < total_transactions:
                # Update the offset to fetch the next batch
                request.options['offset'] = len(transactions)
                response = self.client.transactions_get(request)
                transactions.extend(response.transactions)
                
            return {
                'transactions': transactions,
                'accounts': response.accounts
            }
        except plaid.ApiException as e:
            print(f"Error getting transactions: {e}")
            return None
    
    def sync_transactions(self, access_token):
        """
        Sync transactions for an item
        This would be used for regular updates after initial fetch
        
        Args:
            access_token: The access token for the item
            
        Returns:
            New, modified, and removed transactions
        """
        # This would be implemented using the transactions/sync endpoint
        # For MVP, you can start with the get_transactions method above
        # and implement this later when needed
        pass

    def process_transactions(self, access_token, start_date=None, end_date=None, item_id=None):
        """
        Fetch transactions and format them for storage
        
        Args:
            access_token: The access token for the item
            start_date: The start date for transactions (defaults to 30 days ago)
            end_date: The end date for transactions (defaults to today)
            item_id: The ID of the Plaid item (for reference)
            
        Returns:
            Processed transaction data ready for database storage
        """
        # Get raw transactions from Plaid
        transaction_data = self.get_transactions(access_token, start_date, end_date)
        
        if not transaction_data:
            return None
        
        # Extract data
        transactions = transaction_data['transactions']
        accounts = transaction_data['accounts']
        
        # Create a mapping of account_id to Account object
        account_mapping = {}
        for account in accounts:
            account_mapping[account.account_id] = {
                'account_id': account.account_id,
                'name': account.name,
                'mask': account.mask,
                'official_name': account.official_name,
                'type': account.type,
                'subtype': account.subtype,
                'balances': {
                    'current': account.balances.current,
                    'available': account.balances.available,
                    'limit': getattr(account.balances, 'limit', None)
                }
            }
        
        # Process transactions
        processed_transactions = []
        for transaction in transactions:
            # Extract location data if available
            location = getattr(transaction, 'location', {})
            
            # Format the transaction for our database
            processed_transaction = {
                'transaction_id': transaction.transaction_id,
                'account_id': transaction.account_id,
                'date': transaction.date,
                'name': transaction.name,
                'amount': abs(transaction.amount),  # Store as positive amount
                'is_expense': transaction.amount > 0,  # Flag for expense vs. income
                'category': ', '.join(transaction.category) if hasattr(transaction, 'category') and transaction.category else None,
                'category_id': transaction.category_id,
                'pending': transaction.pending,
                'payment_channel': transaction.payment_channel,
                'address': getattr(location, 'address', None),
                'city': getattr(location, 'city', None),
                'country': getattr(location, 'country', None),
                'postal_code': getattr(location, 'postal_code', None),
                'region': getattr(location, 'region', None),
                'merchant_name': transaction.merchant_name if hasattr(transaction, 'merchant_name') else None,
            }
            
            processed_transactions.append(processed_transaction)
        
        return {
            'transactions': processed_transactions,
            'accounts': account_mapping
        }