#!/bin/bash

# =============================================================================
# FundFlow Production Startup Script
# Handles database setup, migrations, and exchange rate loading
# =============================================================================

set -e  # Exit on any error

echo "🚀 Starting FundFlow Production Setup..."

# Wait for database to be ready
echo "⏳ Waiting for database connection..."
until python manage.py migrate --check; do
    echo "Database not ready, waiting..."
    sleep 2
done

# Run database migrations
echo "🔄 Running database migrations..."
python manage.py migrate --noinput

# Load exchange rates (safe to run multiple times)
echo "💱 Loading exchange rates..."
if python manage.py load_ecb_rates; then
    echo "✅ Exchange rates loaded successfully"
else
    echo "⚠️  Exchange rates loading failed, but continuing startup..."
fi

# Collect static files
echo "📦 Collecting static files..."
python manage.py collectstatic --noinput

# Create superuser if needed (for production)
if [ "$CREATE_SUPERUSER" = "true" ]; then
    echo "👤 Creating superuser account..."
    python manage.py shell -c "
from django.contrib.auth import get_user_model
User = get_user_model()
if not User.objects.filter(username='admin').exists():
    User.objects.create_superuser('admin', 'admin@fundflow.dev', '${ADMIN_PASSWORD:-changeme123}')
    print('✅ Superuser created: admin')
else:
    print('ℹ️  Superuser already exists')
"
fi

echo "🎉 Setup completed successfully!"
echo "🌐 Starting Gunicorn server..."

# Start the application
exec gunicorn --bind 0.0.0.0:8000 --workers 4 --timeout 120 FundFlow.wsgi:application 