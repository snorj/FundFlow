from django.urls import path
from .views import CategoryListCreateView, CategoryDetailView

# Define app_name if you want to namespace URLs, e.g., 'transactions:category-list'
# app_name = 'transactions'

urlpatterns = [
    path('categories/', CategoryListCreateView.as_view(), name='category-list-create'),
    path('categories/<int:pk>/', CategoryDetailView.as_view(), name='category-detail'),
]