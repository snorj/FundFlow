"""
URL configuration for FundFlow project.
"""
from django.contrib import admin
from django.urls import path, include
# Remove: from finance.views import dashboard_view
# Import the specific URL lists from accounts.urls
from accounts.urls import api_urlpatterns as accounts_api_urls
from accounts.urls import password_urls as accounts_password_urls

urlpatterns = [
    path('admin/', admin.site.urls),

    # Include password reset/change URLs under '/accounts/'
    path('accounts/', include(accounts_password_urls)),

    # Include JWT/API Auth URLs under '/api/auth/'
    path('api/auth/', include(accounts_api_urls)),

    # Include Transaction/Category API URLs under '/api/'
    path('api/', include('transactions.urls')), 
]

# Note: You might want a catch-all route later to serve your React app's index.html
# for client-side routing to work correctly on page refresh, but that depends
# on your deployment setup (often handled by webserver config or Django middleware).
# For development with separate frontend/backend servers, this is usually okay.