# integrations/views.py
import logging
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated

# Core sync function
from .logic import sync_up_transactions_for_user
# Model for checking/managing link
from .models import UpIntegration
# Utilities for PAT handling
from .utils import encrypt_token, decrypt_token
# Service for verifying token with Up API
from .services import verify_token

logger = logging.getLogger(__name__)

# --- View for Managing the Integration Link/PAT ---
class UpIntegrationSetupView(APIView):
    """
    API endpoint to manage the Up Bank integration setup for a user.
    GET: Checks if integration exists.
    POST: Saves/updates the Personal Access Token.
    DELETE: Removes the integration link.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        """Checks if an integration exists for the requesting user."""
        user = request.user
        exists = UpIntegration.objects.filter(user=user).exists()
        logger.info(f"[API Setup GET] Checked link status for user {user.id}. Exists: {exists}")
        return Response({"is_linked": exists}, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        """Saves/Updates the Up Personal Access Token for the user."""
        user = request.user
        token = request.data.get('personal_access_token')

        if not token or not isinstance(token, str) or not token.strip():
            logger.warning(f"[API Setup POST] User {user.id} submitted empty token.")
            return Response({"error": "Personal Access Token cannot be empty."}, status=status.HTTP_400_BAD_REQUEST)

        token = token.strip()

        logger.info(f"[API Setup POST] Verifying submitted token for user {user.id}...")
        is_valid = verify_token(token) # Verify with Up API

        if not is_valid:
            logger.warning(f"[API Setup POST] User {user.id} submitted invalid token.")
            # Up API ping returns 401 for invalid tokens, so verify_token returns False
            return Response({"error": "Invalid or expired Up Personal Access Token. Please check the token and try again."}, status=status.HTTP_400_BAD_REQUEST) # Return 400 for bad user input

        logger.info(f"[API Setup POST] Token verified for user {user.id}. Proceeding to save.")
        try:
            encrypted_token = encrypt_token(token)
            integration, created = UpIntegration.objects.update_or_create(
                user=user,
                defaults={
                    'personal_access_token_encrypted': encrypted_token,
                    'last_synced_at': None # Reset sync time when token changes
                }
            )
            action = "created" if created else "updated"
            logger.info(f"[API Setup POST] Successfully {action} Up integration for user {user.id}.")
            return Response(
                {"message": f"Up Bank token saved and verified successfully."},
                status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
            )
        except ValueError as ve: # Catch encryption error
             logger.error(f"[API Setup POST] Token encryption failed for user {user.id}: {ve}")
             return Response({"error": "Failed to secure token."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        except Exception as e:
             logger.exception(f"[API Setup POST] Unexpected error saving integration for user {user.id}: {e}")
             return Response({"error": "An unexpected error occurred while saving integration."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

    def delete(self, request, *args, **kwargs):
        """Removes the Up Bank integration for the requesting user."""
        user = request.user
        deleted_count, _ = UpIntegration.objects.filter(user=user).delete()

        if deleted_count > 0:
            logger.info(f"[API Setup DELETE] Removed Up integration for user {user.id}.")
        else:
            logger.warning(f"[API Setup DELETE] Attempted to remove non-existent integration for user {user.id}.")
        # Return 204 regardless of whether it existed, as the desired state is achieved
        return Response(status=status.HTTP_204_NO_CONTENT)

# --- View for Triggering the Sync ---
class UpSyncTriggerView(APIView):
    """
    API endpoint for triggering a manual transaction sync with Up Bank
    for the authenticated user.
    """
    permission_classes = [IsAuthenticated] # Ensure user is logged in

    def post(self, request, *args, **kwargs):
        """Handles POST request to initiate the sync process."""
        user = request.user
        logger.info(f"[API Sync Trigger] Received sync request for user {user.id} ({user.username})")

        try:
            integration = UpIntegration.objects.get(user=user)
        except UpIntegration.DoesNotExist:
            logger.warning(f"[API Sync Trigger] User {user.id} has no Up integration linked.")
            return Response(
                {"error": "Up Bank account not linked. Please link your account first."},
                status=status.HTTP_400_BAD_REQUEST
            )

        is_initial_sync = integration.last_synced_at is None
        logger.info(f"[API Sync Trigger] Calling sync logic for user {user.id}. Initial sync: {is_initial_sync}")

        try:
            # Call the core logic function from logic.py
            sync_result = sync_up_transactions_for_user(user.id, initial_sync=is_initial_sync)

            # Process the result dictionary
            if sync_result.get('success'):
                logger.info(f"[API Sync Trigger] Sync successful for user {user.id}. Result: {sync_result}")
                # Return relevant counts and message to frontend
                return Response(
                    {
                        "message": sync_result.get('message', 'Sync completed successfully.'),
                        "created_count": sync_result.get('created_count', 0),
                        "duplicate_count": sync_result.get('duplicate_count', 0),
                        "skipped_conversion_error": sync_result.get('skipped_conversion_error', 0),
                    },
                    status=status.HTTP_200_OK
                )
            else:
                # Sync logic indicated failure
                error_code = sync_result.get('error')
                error_message = sync_result.get('message', 'Sync failed.')
                logger.error(f"[API Sync Trigger] Sync failed for user {user.id}. Error code: {error_code}, Message: {error_message}")

                # Determine appropriate HTTP status for the frontend
                response_status = status.HTTP_500_INTERNAL_SERVER_ERROR # Default internal error
                if error_code == 'invalid_token': response_status = status.HTTP_401_UNAUTHORIZED # Use 401 for token issues
                elif error_code == 'integration_not_found': response_status = status.HTTP_400_BAD_REQUEST
                elif error_code in ['api_http_error', 'api_network_error']: response_status = status.HTTP_503_SERVICE_UNAVAILABLE
                elif error_code == 'db_bulk_create_error': response_status = status.HTTP_500_INTERNAL_SERVER_ERROR

                return Response({"error": error_message}, status=response_status)

        except Exception as e:
            # Catch any unexpected exceptions during the sync call itself
            logger.exception(f"[API Sync Trigger] Unexpected exception occurred calling sync logic for user {user.id}: {e}")
            return Response(
                {"error": "An unexpected server error occurred while trying to sync."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )