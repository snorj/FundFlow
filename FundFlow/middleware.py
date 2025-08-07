"""
Middleware for FundFlow
Handles demo mode indicators and other request processing
"""

from django.conf import settings
from django.utils.deprecation import MiddlewareMixin


class DemoModeMiddleware(MiddlewareMixin):
    """
    Middleware to handle demo mode functionality
    """
    
    def process_response(self, request, response):
        """
        Add demo mode headers to all responses
        """
        if getattr(settings, 'DEMO_MODE', False):
            response['X-Demo-Mode'] = 'true'
            response['X-Demo-Reset-Schedule'] = getattr(settings, 'DEMO_RESET_SCHEDULE', '')
            
            # Do not mutate HTML content here; banner is injected in the view layer
            # to avoid breaking SPA markup or hydration.
        
        return response 