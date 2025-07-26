"""
URL configuration for FundFlow project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
# Remove: from finance.views import dashboard_view
# Import the specific URL lists from accounts.urls
from accounts.urls import api_urlpatterns as accounts_api_urls
from accounts.urls import password_urls as accounts_password_urls
from .views import serve_react_app

urlpatterns = [
    path('admin/', admin.site.urls),

    # Include password reset/change URLs under '/accounts/'
    path('accounts/', include(accounts_password_urls)),

    # Include JWT/API Auth URLs under '/api/auth/'
    path('api/auth/', include(accounts_api_urls)),

    # Include Transaction/Category API URLs under '/api/'
    path('api/', include('transactions.urls')), 

    # Include integration app URLs
    path('api/integrations/', include('integrations.urls')),
    
    # Catch-all route to serve React app for client-side routing
    # This should be last to avoid overriding API routes
    re_path(r'^.*/$', serve_react_app, name='react-app'),
    path('', serve_react_app, name='react-app-root'),
]