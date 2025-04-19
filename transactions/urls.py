from django.urls import path
from .views import (
    CategoryListCreateView,
    CategoryDetailView,
    TransactionCSVUploadView,
    TransactionListView # <-- Import the new view
)

urlpatterns = [
    # Category URLs
    path('categories/', CategoryListCreateView.as_view(), name='category-list-create'),
    path('categories/<int:pk>/', CategoryDetailView.as_view(), name='category-detail'),
    

    # Transaction URLs
    path('transactions/upload/', TransactionCSVUploadView.as_view(), name='transaction-csv-upload'), 
    path('transactions/', TransactionListView.as_view(), name='transaction-list'),
]