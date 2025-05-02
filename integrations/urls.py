# integrations/urls.py
from django.urls import path
# Import BOTH views now
from .views import UpSyncTriggerView, UpIntegrationSetupView

app_name = 'integrations'

urlpatterns = [
    # URL for triggering sync
    path('up/sync/', UpSyncTriggerView.as_view(), name='up-sync-trigger'),

    # --- NEW: URL for managing PAT (GET, POST, DELETE) ---
    path('up/setup/', UpIntegrationSetupView.as_view(), name='up-integration-setup'),
]