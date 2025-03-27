from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .services.plaid_service import PlaidService
from .models import PlaidItem, Account
from .serializers import PlaidItemSerializer, AccountSerializer

class LinkTokenView(APIView):
    """
    Create a link token for initializing Plaid Link
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Initialize the Plaid service
        plaid_service = PlaidService()
        
        # Create a link token for the user
        link_token = plaid_service.create_link_token(request.user.id)
        
        if link_token:
            return Response({'link_token': link_token}, status=status.HTTP_200_OK)
        else:
            return Response({'error': 'Failed to create link token'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class AccessTokenExchangeView(APIView):
    """
    Exchange a public token for an access token and save the Plaid item
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        # Get the public token from the request
        public_token = request.data.get('public_token')
        institution_id = request.data.get('institution_id')
        institution_name = request.data.get('institution_name')
        
        if not public_token:
            return Response({'error': 'Public token is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        # Initialize the Plaid service
        plaid_service = PlaidService()
        
        # Exchange the public token for an access token
        exchange_result = plaid_service.exchange_public_token(public_token)
        
        if not exchange_result:
            return Response({'error': 'Failed to exchange public token'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        # Get the access token and item ID
        access_token = exchange_result['access_token']
        item_id = exchange_result['item_id']
        
        # Save the Plaid item
        plaid_item = PlaidItem.objects.create(
            user=request.user,
            item_id=item_id,
            access_token=access_token,
            institution_id=institution_id,
            institution_name=institution_name
        )
        
        # Fetch accounts associated with this item
        accounts_data = plaid_service.get_accounts(access_token)
        
        if accounts_data:
            # Create Account objects for each account
            for account_data in accounts_data:
                Account.objects.create(
                    plaid_item=plaid_item,
                    account_id=account_data.account_id,
                    name=account_data.name,
                    official_name=account_data.official_name,
                    account_type=account_data.type,
                    account_subtype=account_data.subtype,
                    current_balance=account_data.balances.current if hasattr(account_data.balances, 'current') else None,
                    available_balance=account_data.balances.available if hasattr(account_data.balances, 'available') else None,
                    mask=account_data.mask
                )
        
        # Return success response
        return Response({
            'success': True,
            'message': 'Account successfully connected',
            'institution_name': institution_name
        }, status=status.HTTP_201_CREATED)

class PlaidItemsView(APIView):
    """
    List all Plaid items for the authenticated user
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        plaid_items = PlaidItem.objects.filter(user=request.user)
        serializer = PlaidItemSerializer(plaid_items, many=True)
        return Response(serializer.data)

class AccountsView(APIView):
    """
    List all accounts for the authenticated user
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        accounts = Account.objects.filter(plaid_item__user=request.user)
        serializer = AccountSerializer(accounts, many=True)
        return Response(serializer.data)
    
def dashboard_view(request):
    """
    Render the main dashboard view
    """
    return render(request, 'finance/dashboard.html', {
        'title': 'Dashboard',
    })