from django.shortcuts import render
from django.http import JsonResponse, HttpResponse, FileResponse, Http404
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
            """
<script>document.addEventListener('DOMContentLoaded',function(){
  const b=document.createElement('div');
  b.innerHTML="🧪 Demo Mode - Don't use real financial data • Data resets daily • <a href=\"https://fundflow.dev\" style=\"color: white; text-decoration: underline;\">Download FundFlow</a>";
  b.style.cssText="background:linear-gradient(90deg,#ff9500,#ff6b00);color:white;text-align:center;padding:8px;font-size:14px;font-weight:500;box-shadow:0 2px 4px rgba(0,0,0,0.1);position:fixed;top:0;left:0;right:0;z-index:1000;margin:0;";
  document.body.style.paddingTop="40px";
  document.body.insertBefore(b,document.body.firstChild);
});</script>
            """.strip()
        )
        if '</body>' in html:
            html = html.replace('</body>', f"{demo_script}</body>")
        else:
            html += demo_script

    return HttpResponse(html) 


def raw_index(request):
    """Serve the React build index.html without any injection (for debugging)."""
    react_index_path = Path(settings.REACT_BUILD_DIR) / 'index.html'
    if react_index_path.exists():
        try:
            return HttpResponse(react_index_path.read_text(encoding='utf-8'))
        except Exception as exc:
            return JsonResponse({"error": "failed_to_read_index", "detail": str(exc)}, status=500)
    return JsonResponse({"error": "index_not_found", "path": str(react_index_path)}, status=404)

def _serve_build_file(filename: str):
    path = Path(settings.REACT_BUILD_DIR) / filename
    if not path.exists():
        raise Http404(f"{filename} not found")
    # Use FileResponse for efficient file serving via WhiteNoise/Gunicorn
    return FileResponse(open(path, 'rb'))

def manifest(request):
    return _serve_build_file('manifest.json')

def favicon(request):
    return _serve_build_file('favicon.ico')

def logo192(request):
    return _serve_build_file('logo192.png')

def logo512(request):
    return _serve_build_file('logo512.png')
