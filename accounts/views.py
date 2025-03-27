from django.contrib.auth import login, authenticate, logout
from django.contrib.auth.decorators import login_required
from django.shortcuts import render, redirect
from django.contrib import messages
from .forms import UserRegistrationForm, UserLoginForm  # We'll create these forms next

def register_view(request):
    """View for user registration."""
    if request.method == 'POST':
        form = UserRegistrationForm(request.POST)
        if form.is_valid():
            # Create the user but don't save to database yet
            user = form.save(commit=False)
            # You can set additional fields here if needed
            user.save()
            # Log the user in after registration
            login(request, user)
            messages.success(request, "Registration successful!")
            return redirect('dashboard')  # Redirect to dashboard or home page
        else:
            # Form not valid, show error messages
            messages.error(request, "Registration failed. Please correct the errors.")
    else:
        # GET request, show empty form
        form = UserRegistrationForm()
    
    return render(request, 'accounts/register.html', {'form': form})

def login_view(request):
    """View for user login."""
    if request.method == 'POST':
        form = UserLoginForm(request.POST)
        if form.is_valid():
            username = form.cleaned_data.get('username')
            password = form.cleaned_data.get('password')
            user = authenticate(username=username, password=password)
            if user is not None:
                login(request, user)
                messages.success(request, f"Welcome back, {username}!")
                # Redirect to next URL if provided, otherwise dashboard
                next_url = request.GET.get('next', 'dashboard')
                return redirect(next_url)
            else:
                messages.error(request, "Invalid username or password.")
        else:
            messages.error(request, "Invalid form submission.")
    else:
        form = UserLoginForm()
    
    return render(request, 'accounts/login.html', {'form': form})

@login_required
def logout_view(request):
    """View for user logout."""
    logout(request)
    messages.info(request, "You have successfully logged out.")
    return redirect('login')

@login_required
def profile_view(request):
    """View for user profile."""
    return render(request, 'accounts/profile.html', {'user': request.user})