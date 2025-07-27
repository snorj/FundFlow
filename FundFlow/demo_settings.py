"""
Demo-specific Django settings for FundFlow
Inherits from main settings but enables user registration and demo mode features
"""

from .settings import *
import os

# Demo mode flag
DEMO_MODE = True

# Allow user registration without email verification
ENABLE_USER_REGISTRATION = True
REQUIRE_EMAIL_VERIFICATION = False

# Demo-specific hosts and security
ALLOWED_HOSTS = ['app.fundflow.dev', 'fundflow-demo.fly.dev']
CORS_ALLOWED_ORIGINS = [
    'https://app.fundflow.dev',
    'https://fundflow-demo.fly.dev',
    'https://fundflow.dev',
]

# Demo database retention (24 hours)
DEMO_DATA_RETENTION_HOURS = 24
DEMO_RESET_SCHEDULE = "Daily at 12:00 AM UTC"

# Disable email sending in demo mode
EMAIL_BACKEND = 'django.core.mail.backends.dummy.EmailBackend'

# Demo-specific security settings
SECRET_KEY = os.getenv('DJANGO_SECRET_KEY', 'demo-secret-key-change-in-production')

# Demo-specific database settings (will be overridden by DATABASE_URL)
if 'DATABASE_URL' in os.environ:
    DATABASES = {
        'default': dj_database_url.config(
            default=os.environ['DATABASE_URL'],
            conn_max_age=600
        )
    }

# Demo-specific logging
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
    },
}

# Demo mode context processor
TEMPLATES[0]['OPTIONS']['context_processors'].append('FundFlow.context_processors.demo_mode')

# Demo-specific middleware for demo mode indicators
MIDDLEWARE.insert(0, 'FundFlow.middleware.DemoModeMiddleware')

print("🧪 FundFlow Demo Mode Enabled - Don't use real financial data!") 