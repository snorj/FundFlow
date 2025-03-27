from django.shortcuts import render
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from .services.plaid_service import PlaidService
from django.db import transaction as db_transaction
from .models import PlaidItem, Account, Transaction, Category
from .serializers import PlaidItemSerializer, AccountSerializer, TransactionSerializer, CategorySerializer
from rest_framework.pagination import PageNumberPagination
from django.db import models
from django.http import Http404

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

class TransactionFetchView(APIView):
    """
    Fetch and store transactions for a Plaid item
    """
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        item_id = request.data.get('item_id')
        
        if not item_id:
            return Response({'error': 'Item ID is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # Get the Plaid item
            plaid_item = PlaidItem.objects.get(item_id=item_id, user=request.user)
            
            # Initialize the Plaid service
            plaid_service = PlaidService()
            
            # Get transactions for the last 30 days by default
            # You can customize this by passing start_date and end_date to process_transactions
            processed_data = plaid_service.process_transactions(
                plaid_item.access_token,
                item_id=item_id
            )
            
            if not processed_data:
                return Response(
                    {'error': 'Failed to fetch transactions'}, 
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
            # Update account balances
            with db_transaction.atomic():
                # Store the transactions
                transactions_created = 0
                
                for transaction_data in processed_data['transactions']:
                    account_id = transaction_data.pop('account_id')
                    
                    try:
                        # Get the account
                        account = Account.objects.get(account_id=account_id, plaid_item=plaid_item)
                        
                        # Check if transaction already exists
                        transaction_id = transaction_data['transaction_id']
                        transaction, created = Transaction.objects.update_or_create(
                            transaction_id=transaction_id,
                            defaults={
                                'account': account,
                                **transaction_data
                            }
                        )
                        
                        if created:
                            transactions_created += 1
                    
                    except Account.DoesNotExist:
                        # Log this error but continue processing other transactions
                        print(f"Account with ID {account_id} not found for item {item_id}")
                
                # Update account balances
                for account_id, account_data in processed_data['accounts'].items():
                    try:
                        account = Account.objects.get(account_id=account_id, plaid_item=plaid_item)
                        account.current_balance = account_data['balances']['current']
                        account.available_balance = account_data['balances']['available']
                        account.save()
                    except Account.DoesNotExist:
                        # Log this error but continue processing other accounts
                        print(f"Account with ID {account_id} not found for item {item_id}")
            
            return Response({
                'success': True,
                'message': f'Successfully fetched transactions. {transactions_created} new transactions.',
                'transactions_count': transactions_created
            })
            
        except PlaidItem.DoesNotExist:
            return Response(
                {'error': 'Plaid item not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        except Exception as e:
            # Log the error
            print(f"Error fetching transactions: {str(e)}")
            return Response(
                {'error': 'An error occurred while fetching transactions'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class TransactionsView(APIView):
    """
    List transactions for the authenticated user with filtering options
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Get query parameters for filtering
        account_id = request.query_params.get('account_id')
        start_date = request.query_params.get('start_date')
        end_date = request.query_params.get('end_date')
        category = request.query_params.get('category')
        amount_min = request.query_params.get('amount_min')
        amount_max = request.query_params.get('amount_max')
        
        # Base queryset - all transactions from user's accounts
        transactions = Transaction.objects.filter(
            account__plaid_item__user=request.user
        )
        
        # Apply filters if provided
        if account_id:
            transactions = transactions.filter(account__account_id=account_id)
        
        if start_date:
            transactions = transactions.filter(date__gte=start_date)
        
        if end_date:
            transactions = transactions.filter(date__lte=end_date)
        
        if category:
            transactions = transactions.filter(category__icontains=category)
        
        if amount_min:
            transactions = transactions.filter(amount__gte=float(amount_min))
        
        if amount_max:
            transactions = transactions.filter(amount__lte=float(amount_max))
        
        # Paginate results
        paginator = PageNumberPagination()
        paginator.page_size = 25  # Adjust as needed
        paginated_transactions = paginator.paginate_queryset(transactions, request)
        
        serializer = TransactionSerializer(paginated_transactions, many=True)
        return paginator.get_paginated_response(serializer.data)
    
class CategoryListCreateView(APIView):
    """
    List all categories or create a new category
    """
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        # Get system categories and user's custom categories
        categories = Category.objects.filter(
            models.Q(user=request.user) | models.Q(user__isnull=True)
        )
        serializer = CategorySerializer(categories, many=True)
        return Response(serializer.data)
    
    def post(self, request):
        # Create a new custom category for the user
        serializer = CategorySerializer(data=request.data)
        if serializer.is_valid():
            category = serializer.save(user=request.user, is_custom=True)
            return Response(CategorySerializer(category).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class CategoryDetailView(APIView):
    """
    Retrieve, update or delete a category
    """
    permission_classes = [IsAuthenticated]
    
    def get_object(self, pk, user):
        try:
            # Can only access system categories or own custom categories
            return Category.objects.get(
                models.Q(id=pk),
                models.Q(user=user) | models.Q(user__isnull=True)
            )
        except Category.DoesNotExist:
            raise Http404
    
    def get(self, request, pk):
        category = self.get_object(pk, request.user)
        serializer = CategorySerializer(category)
        return Response(serializer.data)
    
    def put(self, request, pk):
        category = self.get_object(pk, request.user)
        
        # Only allow updates to custom categories owned by the user
        if not category.is_custom or category.user != request.user:
            return Response(
                {"error": "Cannot modify system categories or categories owned by other users"}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        serializer = CategorySerializer(category, data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, pk):
        category = self.get_object(pk, request.user)
        
        # Only allow deletion of custom categories owned by the user
        if not category.is_custom or category.user != request.user:
            return Response(
                {"error": "Cannot delete system categories or categories owned by other users"}, 
                status=status.HTTP_403_FORBIDDEN
            )
        
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)