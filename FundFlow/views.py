from django.shortcuts import render
from django.http import JsonResponse
from django.conf import settings
import os

def health_check(request):
    """Health check endpoint for monitoring"""
    return JsonResponse({'status': 'healthy'})

def index(request):
    """Serves the React app"""
    # Add demo mode banner via JavaScript injection if demo mode is enabled
    demo_mode = os.getenv('DEMO_MODE', 'false').lower() == 'true'
    
    if demo_mode:
        # Inject demo banner script
        demo_script = """
        <script>
        document.addEventListener('DOMContentLoaded', function() {
            const banner = document.createElement('div');
            banner.innerHTML = '🧪 Demo Mode - Don\\'t use real financial data • Data resets daily • <a href="https://fundflow.dev" style="color: white; text-decoration: underline;">Download FundFlow</a>';
            banner.style.cssText = 'background: linear-gradient(90deg, #ff9500, #ff6b00); color: white; text-align: center; padding: 8px; font-size: 14px; font-weight: 500; box-shadow: 0 2px 4px rgba(0,0,0,0.1); position: fixed; top: 0; left: 0; right: 0; z-index: 1000; margin: 0;';
            document.body.style.paddingTop = '40px';
            document.body.insertBefore(banner, document.body.firstChild);
        });
        </script>
        """
        
        context = {'demo_script': demo_script}
    else:
        context = {'demo_script': ''}
    
    return render(request, 'index.html', context) 