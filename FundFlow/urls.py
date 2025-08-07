"""
URL configuration for FundFlow project.
"""
from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
# Remove: from finance.views import dashboard_view
# Import the specific URL lists from accounts.urls
from accounts.urls import api_urlpatterns as accounts_api_urls
from accounts.urls import password_urls as accounts_password_urls
from .views import index, health_check, raw_index, manifest, favicon, logo192, logo512

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
    
    # Health check endpoint
    path('api/health/', health_check, name='health-check'),

    # Debug endpoint to view raw React index without injection
    path('debug/raw-index', raw_index, name='raw-index'),

    # Ensure CRA public assets resolve at root (avoid 404/HTML for JSON)
    path('manifest.json', manifest, name='manifest'),
    path('favicon.ico', favicon, name='favicon'),
    path('logo192.png', logo192, name='logo192'),
    path('logo512.png', logo512, name='logo512'),
    
    # Catch-all route to serve React app for client-side routing
    # This should be last to avoid overriding API routes
    re_path(r'^.*/$', index, name='react-app'),
    path('', index, name='react-app-root'),
]

# Add static file serving (WhiteNoise handles this in production)
if settings.DEBUG:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
else:
    # In production, ensure static files are properly configured for WhiteNoise
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)