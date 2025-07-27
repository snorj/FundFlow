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
            
            # Add demo mode warning to HTML responses
            if (response.get('Content-Type', '').startswith('text/html') and 
                hasattr(response, 'content')):
                
                demo_banner = '''
                <div id="demo-mode-banner" style="
                    background: linear-gradient(90deg, #ff9500, #ff6b00);
                    color: white;
                    text-align: center;
                    padding: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    position: relative;
                    z-index: 1000;
                ">
                    🧪 Demo Mode - Don't use real financial data • Data resets daily • <a href="https://fundflow.dev" style="color: white; text-decoration: underline;">Download FundFlow</a>
                </div>
                '''
                
                # Insert demo banner after opening body tag
                content = response.content.decode('utf-8')
                if '<body' in content:
                    content = content.replace('<body>', f'<body>{demo_banner}', 1)
                    response.content = content.encode('utf-8')
        
        return response 