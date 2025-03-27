from django.shortcuts import render
from django.contrib.auth.decorators import login_required

@login_required
def dashboard_view(request):
    """View for the main dashboard."""
    return render(request, 'finance/dashboard.html')