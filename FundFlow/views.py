from django.shortcuts import render
from django.http import JsonResponse, HttpResponse
from django.conf import settings
import os
from pathlib import Path


def health_check(request):
    """Health check endpoint for monitoring"""
    return JsonResponse({'status': 'healthy'})


def index(request):
    """Serve the compiled React index and inject demo banner if enabled."""
    react_index_path = Path(settings.REACT_BUILD_DIR) / 'index.html'

    html = None
    if react_index_path.exists():
        try:
            html = react_index_path.read_text(encoding='utf-8')
        except Exception:
            html = None

    if html is None:
        # Fallback to Django template (useful in dev) to avoid 500s
        return render(request, 'index.html', {'demo_script': ''})

    demo_mode = os.getenv('DEMO_MODE', 'false').lower() == 'true'
    if demo_mode:
        demo_script = (
            "<script>document.addEventListener('DOMContentLoaded',function(){"
            "const b=document.createElement('div');"
            "b.innerHTML='🧪 Demo Mode - Don\\'t use real financial data • Data resets daily • "
            "<a href=\\"https://fundflow.dev\\" style=\\"color: white; text-decoration: underline;\\">Download FundFlow</a>';"
            "b.style.cssText='background:linear-gradient(90deg,#ff9500,#ff6b00);color:white;text-align:center;padding:8px;font-size:14px;font-weight:500;box-shadow:0 2px 4px rgba(0,0,0,0.1);position:fixed;top:0;left:0;right:0;z-index:1000;margin:0;';"
            "document.body.style.paddingTop='40px';"
            "document.body.insertBefore(b,document.body.firstChild);"
            "});</script>"
        )
        if '</body>' in html:
            html = html.replace('</body>', f"{demo_script}</body>")
        else:
            html += demo_script

    return HttpResponse(html) 