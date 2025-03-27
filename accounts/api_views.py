# accounts/api_views.py
from rest_framework import generics, permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView
from django.contrib.auth import get_user_model
from .serializers import UserSerializer, RegisterSerializer

User = get_user_model()

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


# Logout View (for token blacklisting if you implement that later)
class LogoutAPIView(APIView):
    """
    API endpoint for logging out (invalidating tokens)
    This is optional and would require token blacklisting
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # For a basic implementation, the frontend simply discards the tokens
        # For additional security, you could implement token blacklisting
        return Response({"detail": "Successfully logged out."}, 
                        status=status.HTTP_200_OK)