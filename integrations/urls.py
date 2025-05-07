# integrations/urls.py
from django.urls import path
from .views import UpSyncTriggerView, UpIntegrationSetupView # Import both views

app_name = 'integrations'

urlpatterns = [
    # URL for triggering sync (POST only)
    path('up/sync/', UpSyncTriggerView.as_view(), name='up-sync-trigger'),

    # URL for managing PAT setup (GET, POST, DELETE)
    path('up/setup/', UpIntegrationSetupView.as_view(), name='up-integration-setup'),
]