# integrations/utils.py
import os
from cryptography.fernet import Fernet, InvalidToken
# No need to import django.conf.settings here if we directly use os.getenv
import logging

logger = logging.getLogger(__name__)

# Attempt to load the key and initialize Fernet
# This will run when this module is first imported by Django.
try:
    # Load the key directly from environment variables
    key_string = os.getenv('DJANGO_FERNET_KEY')
    if not key_string:
        # Log prominently and raise an error if the key is missing
        # This will prevent the application from starting without the key.
        logger.critical("CRITICAL: DJANGO_FERNET_KEY not found in environment variables. Application cannot proceed securely.")
        raise ValueError("DJANGO_FERNET_KEY is not set in the environment. This key is required for data encryption.")
    
    ENCRYPTION_KEY_BYTES = key_string.encode() # Fernet key must be bytes
    FERNET_INSTANCE = Fernet(ENCRYPTION_KEY_BYTES)
    logger.info("Fernet encryption utility initialized successfully.")

except Exception as e:
    # Catch any other error during Fernet initialization (e.g., invalid key format)
    logger.critical(f"CRITICAL: Failed to initialize Fernet encryption: {e}. Ensure DJANGO_FERNET_KEY is a valid Fernet key.", exc_info=True)
    # Re-raise to prevent app startup with a broken encryption setup.
    raise ValueError(f"Fernet encryption key setup failed: {e}") from e


def encrypt_token(token: str) -> str:
    """Encrypts a plain text token string using Fernet. Returns the encrypted string."""
    if not isinstance(token, str):
        raise TypeError("Token to encrypt must be a string.")
    if not token: # Handle empty string explicitly if desired, or let it encrypt to something
        # logger.warning("Attempted to encrypt an empty token string.")
        # return "" # Or raise error, or encrypt it (Fernet can encrypt empty bytes)
        pass # Let Fernet handle empty string (it encrypts empty bytes)

    try:
        encrypted_token_bytes = FERNET_INSTANCE.encrypt(token.encode('utf-8'))
        return encrypted_token_bytes.decode('utf-8') # Fernet output is URL-safe base64
    except Exception as e:
        logger.exception(f"Token encryption failed for token (first 5 chars): {token[:5]}...")
        # It's crucial not to log the full token here if encryption fails.
        # Depending on the application's needs, re-raise or return an indicator of failure.
        raise ValueError("Token encryption failed.") from e


def decrypt_token(encrypted_token_str: str) -> str | None:
    """
    Decrypts an encrypted token string using Fernet.
    Returns the decrypted string, or None if decryption fails (e.g., invalid token, tampered).
    """
    if not isinstance(encrypted_token_str, str):
        # logger.error("Invalid type for encrypted_token_str: expected str.")
        return None # Or raise TypeError
    if not encrypted_token_str:
        # logger.warning("Attempted to decrypt an empty encrypted_token_str.")
        return None

    try:
        decrypted_token_bytes = FERNET_INSTANCE.decrypt(encrypted_token_str.encode('utf-8'))
        return decrypted_token_bytes.decode('utf-8')
    except InvalidToken:
        # This is expected if the token is incorrect, tampered, or encrypted with a different key.
        logger.warning("Decryption failed: Invalid or tampered token provided.")
        return None
    except Exception as e:
        # Catch any other unexpected decryption errors.
        logger.exception(f"Decryption failed with unexpected error for encrypted_token (first 10 chars): {encrypted_token_str[:10]}...")
        return None