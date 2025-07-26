# transactions/urls.py
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CategoryListCreateView,
    CategoryDetailView,
    CategoryNamesSearchView,
    VendorListCreateView,
    VendorDetailView,
    VendorNamesSearchView,
    VendorRuleListCreateView,
    VendorRuleDetailView,
    VendorMappingViewSet,
    TransactionCSVUploadView,
    TransactionListView,
    TransactionCreateView,
    TransactionUpdateView,
    TransactionDestroyView,
    UncategorizedTransactionGroupView,
    BatchCategorizeTransactionView,
    DashboardBalanceView,
    AutoCategorizeTransactionsView,
    AutoCategorizeSingleTransactionView,
    CategorizationSuggestionsView,
    HiddenTransactionGroupView,
    BatchHideTransactionView
)

# Create a router and register our ViewSets with it
router = DefaultRouter()
router.register(r'vendor-mappings', VendorMappingViewSet, basename='vendor-mappings')

urlpatterns = [
    # Include the router URLs
    path('', include(router.urls)),
    
    # Category URLs
    path('categories/', CategoryListCreateView.as_view(), name='category-list-create'),
    path('categories/search_names/', CategoryNamesSearchView.as_view(), name='category-names-search'),
    path('categories/<int:pk>/', CategoryDetailView.as_view(), name='category-detail'),

    # Vendor URLs
    path('vendors/', VendorListCreateView.as_view(), name='vendor-list-create'),
    path('vendors/search_names/', VendorNamesSearchView.as_view(), name='vendor-names-search'),
    path('vendors/<int:pk>/', VendorDetailView.as_view(), name='vendor-detail'),
    
    # Vendor Rule URLs
    path('vendor-rules/', VendorRuleListCreateView.as_view(), name='vendor-rule-list-create'),
    path('vendor-rules/<str:pk>/', VendorRuleDetailView.as_view(), name='vendor-rule-detail'),

    # Transaction URLs
    path('transactions/upload/', TransactionCSVUploadView.as_view(), name='transaction-csv-upload'),
    path('transactions/', TransactionListView.as_view(), name='transaction-list'),
    path('transactions/create/', TransactionCreateView.as_view(), name='transaction-create'),
    path('transactions/<int:pk>/', TransactionUpdateView.as_view(), name='transaction-detail-update'),
    path('transactions/uncategorized-groups/', UncategorizedTransactionGroupView.as_view(), name='transaction-uncategorized-groups'),
    path('transactions/hidden-groups/', HiddenTransactionGroupView.as_view(), name='transaction-hidden-groups'),
    path('transactions/debug-vendor-mapping/', UncategorizedTransactionGroupView.as_view(), name='debug-vendor-mapping'),
    path('transactions/batch-categorize/', BatchCategorizeTransactionView.as_view(), name='transaction-batch-categorize'),
    path('transactions/batch-hide/', BatchHideTransactionView.as_view(), name='transaction-batch-hide'),
    
    # Auto-Categorization URLs
    path('transactions/auto-categorize/', AutoCategorizeTransactionsView.as_view(), name='auto-categorize-transactions'),
    path('transactions/<int:pk>/auto-categorize/', AutoCategorizeSingleTransactionView.as_view(), name='auto-categorize-single-transaction'),
    path('transactions/<int:pk>/suggestions/', CategorizationSuggestionsView.as_view(), name='categorization-suggestions'),
    
    # Dashboard URLs
    path('dashboard/balance/', DashboardBalanceView.as_view(), name='dashboard-balance'),
]