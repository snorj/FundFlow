from django.shortcuts import render
from django.http import HttpResponse
from django.conf import settings
import os

def serve_react_app(request):
    """
    Serve the React app's index.html for client-side routing
    """
    try:
        # Path to the React build index.html
        index_path = os.path.join(settings.REACT_BUILD_DIR, 'index.html')
        
        with open(index_path, 'r') as f:
            html_content = f.read()
        
        return HttpResponse(html_content, content_type='text/html')
    except FileNotFoundError:
        return HttpResponse(
            "<h1>FundFlow</h1><p>React build not found. Please build the frontend first.</p>", 
            content_type='text/html',
            status=404
        ) 