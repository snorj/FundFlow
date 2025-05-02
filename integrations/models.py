# integrations/models.py
from django.db import models
from django.conf import settings
# Note: Encryption is NOT handled automatically by this field definition.
# You will need to implement encryption/decryption logic in Stage 2
# using a library like cryptography or django-cryptography.

class UpIntegration(models.Model):
    """
    Stores details and credentials for a user's connection to Up Bank API.
    """
    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE, # Delete integration if user is deleted
        related_name='up_integration',
        primary_key=True # Makes the user the primary key, ensuring only one record per user
    )
    # Stores the *encrypted* Personal Access Token.
    # The actual encryption/decryption happens in code (Stage 2).
    personal_access_token_encrypted = models.TextField(
         help_text="Stores the encrypted Up Bank Personal Access Token."
    )
    last_synced_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="Timestamp of the last successful transaction sync completion."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "Up Bank Integration"
        verbose_name_plural = "Up Bank Integrations"

    def __str__(self):
        sync_status = f"Last synced: {self.last_synced_at.strftime('%Y-%m-%d %H:%M:%S')}" if self.last_synced_at else "Never synced"
        return f"Up Integration for {self.user.username} ({sync_status})"