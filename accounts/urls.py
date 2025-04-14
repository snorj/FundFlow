from django.urls import path
from django.contrib.auth import views as auth_views
# Remove: from . import views (No longer exists)
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)
from . import api_views # Keep API views import

# Keep password reset/change URLs
password_urls = [
    path('password_reset/', auth_views.PasswordResetView.as_view(
        template_name='accounts/password_reset.html',
        email_template_name='accounts/password_reset_email.html',
        subject_template_name='accounts/password_reset_subject.txt'
    ), name='password_reset'),
    path('password_reset/done/', auth_views.PasswordResetDoneView.as_view(
        template_name='accounts/password_reset_done.html'
    ), name='password_reset_done'),
    path('reset/<uidb64>/<token>/', auth_views.PasswordResetConfirmView.as_view(
        template_name='accounts/password_reset_confirm.html'
    ), name='password_reset_confirm'),
    path('reset/done/', auth_views.PasswordResetCompleteView.as_view(
        template_name='accounts/password_reset_complete.html'
    ), name='password_reset_complete'),
    path('password_change/', auth_views.PasswordChangeView.as_view(
        template_name='accounts/password_change.html'
    ), name='password_change'),
    path('password_change/done/', auth_views.PasswordChangeDoneView.as_view(
        template_name='accounts/password_change_done.html'
    ), name='password_change_done'),
]

# API endpoints for JWT authentication and user info
api_urlpatterns = [
    path('token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('register/', api_views.RegisterAPIView.as_view(), name='api_register'),
    path('me/', api_views.UserInfoAPIView.as_view(), name='api_user_info'),
    path('logout/', api_views.LogoutAPIView.as_view(), name='api_logout'),
]

# Combine remaining patterns (you can structure this differently if preferred)
# We'll expose password URLs under /accounts/ and API under /api/auth/ in the main urls.py
# So, we just need to define them here.
urlpatterns = password_urls # Keep the original variable name if FundFlow/urls.py uses it directly

# Or rename api_urlpatterns to urlpatterns if FundFlow/urls.py includes 'accounts.urls' under 'api/auth/'
# For clarity, let's keep them distinct for now and adjust FundFlow/urls.py