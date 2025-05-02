# integrations/utils.py
import os
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

# Load the key from settings (which should load from .env)
# Ensure the key is loaded as bytes
try:
    ENCRYPTION_KEY = os.getenv('DJANGO_FERNET_KEY')
    if not ENCRYPTION_KEY:
        raise ValueError("DJANGO_FERNET_KEY not found in environment variables.")
    FERNET_INSTANCE = Fernet(ENCRYPTION_KEY.encode()) # Key must be bytes
except Exception as e:
    logger.error(f"Failed to initialize Fernet encryption: {e}. Ensure DJANGO_FERNET_KEY is set correctly in .env and is a valid Fernet key.")
    # Raise the error or handle it such that the app won't run without a key
    raise ValueError("Encryption key setup failed.") from e

def encrypt_token(token: str) -> str:
    """Encrypts a plain text token using Fernet."""
    if not token:
        return ""
    try:
        # Token must be bytes for encryption
        encrypted_token_bytes = FERNET_INSTANCE.encrypt(token.encode())
        # Store the result as a string (Fernet output is URL-safe base64)
        return encrypted_token_bytes.decode()
    except Exception as e:
        logger.error(f"Encryption failed: {e}")
        # Depending on context, you might want to raise an error here
        # or return a specific value indicating failure.
        # Raising an error is generally safer during setup/saving.
        raise ValueError("Token encryption failed.") from e


def decrypt_token(encrypted_token: str) -> str | None:
    """Decrypts an encrypted token string using Fernet. Returns None if decryption fails."""
    if not encrypted_token:
        return None
    try:
        # Encrypted token needs to be bytes for decryption
        decrypted_token_bytes = FERNET_INSTANCE.decrypt(encrypted_token.encode())
        return decrypted_token_bytes.decode()
    except InvalidToken:
        logger.error("Decryption failed: Invalid token provided.")
        return None # Indicate failure clearly
    except Exception as e:
        logger.error(f"Decryption failed with unexpected error: {e}")
        return None # Indicate failure