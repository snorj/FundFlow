"""
Context processors for FundFlow
Provides demo mode and other global template context
"""

from django.conf import settings


def demo_mode(request):
    """
    Add demo mode information to template context
    """
    return {
        'DEMO_MODE': getattr(settings, 'DEMO_MODE', False),
        'DEMO_RESET_SCHEDULE': getattr(settings, 'DEMO_RESET_SCHEDULE', ''),
        'DEMO_DATA_RETENTION_HOURS': getattr(settings, 'DEMO_DATA_RETENTION_HOURS', 24),
        'ENABLE_USER_REGISTRATION': getattr(settings, 'ENABLE_USER_REGISTRATION', False),
    } 