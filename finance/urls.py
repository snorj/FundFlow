from django.urls import path
from .views import (
    LinkTokenView, AccessTokenExchangeView, PlaidItemsView, 
    AccountsView, TransactionFetchView, TransactionsView
)

urlpatterns = [
    path('link-token/', LinkTokenView.as_view(), name='link-token'),
    path('exchange-token/', AccessTokenExchangeView.as_view(), name='exchange-token'),
    path('plaid-items/', PlaidItemsView.as_view(), name='plaid-items'),
    path('accounts/', AccountsView.as_view(), name='accounts'),
    path('fetch-transactions/', TransactionFetchView.as_view(), name='fetch-transactions'),
    path('transactions/', TransactionsView.as_view(), name='transactions'),
]