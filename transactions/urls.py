# transactions/urls.py
from django.urls import path
from .views import (
    CategoryListCreateView,
    CategoryDetailView,
    TransactionCSVUploadView,
    TransactionListView,
    TransactionUpdateView,
    TransactionDestroyView,
    UncategorizedTransactionGroupView,
    BatchCategorizeTransactionView,
    DashboardBalanceView
)

urlpatterns = [
    # Category URLs
    path('categories/', CategoryListCreateView.as_view(), name='category-list-create'),
    path('categories/<int:pk>/', CategoryDetailView.as_view(), name='category-detail'),

    # Transaction URLs
    path('transactions/upload/', TransactionCSVUploadView.as_view(), name='transaction-csv-upload'),
    path('transactions/', TransactionListView.as_view(), name='transaction-list'),
    path('transactions/<int:pk>/', TransactionUpdateView.as_view(), name='transaction-detail-update'),
    path('transactions/uncategorized-groups/', UncategorizedTransactionGroupView.as_view(), name='transaction-uncategorized-groups'),
    path('transactions/batch-categorize/', BatchCategorizeTransactionView.as_view(), name='transaction-batch-categorize'),
    
    # Dashboard URLs
    path('dashboard/balance/', DashboardBalanceView.as_view(), name='dashboard-balance'),
]