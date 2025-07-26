# =============================================================================
# Multi-stage Dockerfile for FundFlow (Django + React)
# Stage 1: Build React frontend
# Stage 2: Python backend with Django + Gunicorn
# =============================================================================

# =============================================================================
# Stage 1: Frontend Builder - Build React application
# =============================================================================
FROM node:22-alpine AS frontend-builder

# Set working directory for frontend build
WORKDIR /frontend

# Copy package files first (for better layer caching)
COPY frontend/package*.json ./

# Install npm dependencies
RUN npm ci --only=production --silent

# Copy frontend source code
COPY frontend/ ./

# Build React application for production
RUN npm run build

# =============================================================================
# Stage 2: Backend - Django application with Gunicorn
# =============================================================================
FROM python:3.10-slim AS backend

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Create app directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    postgresql-client \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Django application code
COPY . .

# Copy React build from frontend stage
COPY --from=frontend-builder /frontend/build ./frontend/build

# Create necessary directories and set permissions
RUN mkdir -p /app/staticfiles /app/media \
    && chown -R appuser:appuser /app

# Collect static files (includes React build)
RUN python manage.py collectstatic --noinput --settings=FundFlow.settings

# Change to non-root user
USER appuser

# Expose port 8000
EXPOSE 8000

# Health check - simple check if Gunicorn is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost:8000/ || exit 1

# Default command - run Gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8000", "--workers", "4", "--timeout", "120", "FundFlow.wsgi:application"] 