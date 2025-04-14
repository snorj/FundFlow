from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from .serializers import UserSerializer, RegisterSerializer
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken


User = get_user_model()

# Use built-in SimpleJWT view for token creation if possible
# class LoginAPIView(TokenObtainPairView):
#     pass # You already use TokenObtainPairView in urls.py, so no change needed here unless custom login needed

# User Registration View
class RegisterAPIView(generics.CreateAPIView):
    """
    API endpoint for user registration
    """
    serializer_class = RegisterSerializer
    permission_classes = [permissions.AllowAny]  # Allow anyone to register


# Get User Info View (authenticated endpoint)
class UserInfoAPIView(generics.RetrieveAPIView):
    """
    API endpoint to get authenticated user information
    """
    serializer_class = UserSerializer
    permission_classes = [permissions.IsAuthenticated]  # Only authenticated users

    def get_object(self):
        # Return the current user
        return self.request.user


# Logout View (Implement Token Blacklisting)
class LogoutAPIView(APIView):
    """
    API endpoint for logging out (blacklisting refresh tokens)
    """
    permission_classes = [permissions.IsAuthenticated] # Requires authentication

    def post(self, request):
        try:
            refresh_token_str = request.data.get("refresh")
            if not refresh_token_str:
                 return Response({"detail": "Refresh token is required."}, status=status.HTTP_400_BAD_REQUEST) # <-- Added check

            # Attempt to get the RefreshToken instance
            refresh_token = RefreshToken(refresh_token_str)

            # Add the token to the blacklist
            refresh_token.blacklist()

            # Alternative: if you want to blacklist OutstandingToken instead of directly blacklisting RefreshToken string
            # try:
            #    outstanding_token = OutstandingToken.objects.get(token=str(refresh_token))
            #    BlacklistedToken.objects.create(token=outstanding_token)
            # except OutstandingToken.DoesNotExist:
            #    # Handle case where token is not found (already blacklisted or invalid)
            #    pass # Can just return success if token wasn't found

            return Response(status=status.HTTP_204_NO_CONTENT) # Standard for successful deletion/invalidation

        except TokenError as e:
            # Handle invalid or expired refresh tokens provided in the body
            return Response({"detail": str(e)}, status=status.HTTP_400_BAD_REQUEST) # Use 400 for invalid token in request body
        except Exception as e:
             # Catch any other unexpected errors
            return Response({"detail": "An error occurred during logout."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)