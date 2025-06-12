# transactions/urls.py
from django.urls import path
from .views import (
    CategoryListCreateView,
    CategoryDetailView,
    VendorListCreateView,
    VendorDetailView,
    VendorRuleListCreateView,
    VendorRuleDetailView,
    VendorRuleConflictResolveView,
    TransactionCSVUploadView,
    TransactionListView,
    TransactionCreateView,
    TransactionUpdateView,
    TransactionDestroyView,
    UncategorizedTransactionGroupView,
    BatchCategorizeTransactionView,
    DashboardBalanceView,
    TransactionSearchView
)

urlpatterns = [
    # Category URLs
    path('categories/', CategoryListCreateView.as_view(), name='category-list-create'),
    path('categories/<int:pk>/', CategoryDetailView.as_view(), name='category-detail'),

    # Vendor URLs
    path('vendors/', VendorListCreateView.as_view(), name='vendor-list-create'),
    path('vendors/<int:pk>/', VendorDetailView.as_view(), name='vendor-detail'),

    # VendorRule URLs
    path('vendor-rules/', VendorRuleListCreateView.as_view(), name='vendor-rule-list-create'),
    path('vendor-rules/<str:pk>/', VendorRuleDetailView.as_view(), name='vendor-rule-detail'),
    path('vendor-rules/resolve-conflict/', VendorRuleConflictResolveView.as_view(), name='vendor-rule-conflict-resolve'),

    # Transaction URLs
    path('transactions/upload/', TransactionCSVUploadView.as_view(), name='transaction-csv-upload'),
    path('transactions/search/', TransactionSearchView.as_view(), name='transaction-search'),
    path('transactions/', TransactionListView.as_view(), name='transaction-list'),
    path('transactions/create/', TransactionCreateView.as_view(), name='transaction-create'),
    path('transactions/<int:pk>/', TransactionUpdateView.as_view(), name='transaction-detail-update'),
    path('transactions/uncategorized-groups/', UncategorizedTransactionGroupView.as_view(), name='transaction-uncategorized-groups'),
    path('transactions/batch-categorize/', BatchCategorizeTransactionView.as_view(), name='transaction-batch-categorize'),
    
    # Dashboard URLs
    path('dashboard/balance/', DashboardBalanceView.as_view(), name='dashboard-balance'),
]