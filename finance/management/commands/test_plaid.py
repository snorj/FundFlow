from django.core.management.base import BaseCommand
from plaid.model.link_token_create_request import LinkTokenCreateRequest
from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
from plaid.model.country_code import CountryCode
from plaid.model.products import Products
from plaid.api import plaid_api
from plaid.configuration import Configuration
from plaid.api_client import ApiClient
import plaid
import os
from django.conf import settings
import json

class Command(BaseCommand):
    help = 'Test Plaid API credentials by creating a link token'

    def handle(self, *args, **options):
        # Debug output
        self.stdout.write(f"PLAID_CLIENT_ID: '{settings.PLAID_CLIENT_ID}'")
        self.stdout.write(f"PLAID_SECRET: '{settings.PLAID_SECRET}'")
        self.stdout.write(f"PLAID_ENV: '{settings.PLAID_ENV}'")
        
        # Configure the Plaid client
        configuration = Configuration(
            host=plaid.Environment.Sandbox,
        )
        
        api_client = ApiClient(configuration)
        client = plaid_api.PlaidApi(api_client)
        
        # Create a link token
        try:
            request = LinkTokenCreateRequest(
                client_id=settings.PLAID_CLIENT_ID,
                secret=settings.PLAID_SECRET,
                user=LinkTokenCreateRequestUser(
                    client_user_id='test_user_id'
                ),
                client_name='Fund Flow App',
                products=[Products('transactions')],
                country_codes=[CountryCode('US')],
                language='en'
            )
            
            response = client.link_token_create(request)
            self.stdout.write(self.style.SUCCESS(f"Link token created successfully: {response.link_token}"))
            
        except plaid.ApiException as e:
            self.stdout.write(self.style.ERROR(f"Failed to create link token: {e}"))
            response = json.loads(e.body)
            self.stdout.write(self.style.ERROR(f"Error details: {response}"))