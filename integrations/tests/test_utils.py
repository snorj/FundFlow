# integrations/tests.py (or integrations/test_utils.py)

import os
from django.test import SimpleTestCase
from django.test import override_settings
from cryptography.fernet import Fernet

# Import the functions to test
from ..utils import encrypt_token, decrypt_token, FERNET_INSTANCE # Import FERNET_INSTANCE if needed for specific tests

# Generate a known key JUST for testing purposes.
# DO NOT use your real production key here.
TEST_FERNET_KEY = Fernet.generate_key()

# Override settings ONLY for this test module/class
@override_settings(DJANGO_FERNET_KEY=TEST_FERNET_KEY.decode())
class EncryptionUtilsTests(SimpleTestCase):

    def setUp(self):
        # Ensure the module reloads utils with the overridden setting if necessary
        # This might not always be needed depending on how utils loads the key,
        # but can help ensure the test key is used.
        # Alternatively, directly mock os.getenv within tests.
        # from . import utils
        # import importlib
        # importlib.reload(utils)
        # self.encrypt_token = utils.encrypt_token
        # self.decrypt_token = utils.decrypt_token
        # If the module-level FERNET_INSTANCE is used directly, we rely on @override_settings
        pass


    def test_encryption_decryption_cycle(self):
        """Test that encrypting and then decrypting returns the original token."""
        original_token = "up:yeah:123456789abcdef"
        encrypted = encrypt_token(original_token)
        self.assertIsInstance(encrypted, str)
        self.assertNotEqual(encrypted, original_token)

        decrypted = decrypt_token(encrypted)
        self.assertEqual(decrypted, original_token)

    def test_decrypt_invalid_token_format(self):
        """Test decrypting a string that isn't valid Fernet format."""
        invalid_encrypted_token = "this-is-not-a-valid-fernet-token"
        decrypted = decrypt_token(invalid_encrypted_token)
        self.assertIsNone(decrypted, "Decrypting invalid format should return None")

    def test_decrypt_tampered_token(self):
        """Test decrypting a token that might have been slightly altered."""
        original_token = "secure_token_abc"
        encrypted = encrypt_token(original_token)
        # Simulate tampering by slightly changing the encrypted string
        # (Note: This might not always trigger InvalidToken, depending on the change)
        tampered = encrypted[:-1] + 'X' if len(encrypted) > 0 else "tampered"
        if tampered == encrypted: # Ensure it actually changed
             tampered = encrypted + 'X'

        decrypted = decrypt_token(tampered)
        self.assertIsNone(decrypted, "Decrypting tampered token should return None")

    def test_decrypt_different_key(self):
        """Test decrypting a token encrypted with a different key."""
        original_token = "other_key_token"
        other_key = Fernet.generate_key()
        other_fernet = Fernet(other_key)
        encrypted_with_other_key = other_fernet.encrypt(original_token.encode()).decode()

        # Decrypt using the default FERNET_INSTANCE (configured via settings)
        decrypted = decrypt_token(encrypted_with_other_key)
        self.assertIsNone(decrypted, "Decrypting with wrong key should return None")


    def test_encrypt_empty_string(self):
        """Test encrypting an empty string."""
        encrypted = encrypt_token("")
        self.assertEqual(encrypted, "")

    def test_decrypt_empty_string(self):
        """Test decrypting an empty string."""
        decrypted = decrypt_token("")
        self.assertIsNone(decrypted)

    def test_decrypt_none(self):
        """Test decrypting None."""
        decrypted = decrypt_token(None)
        self.assertIsNone(decrypted)