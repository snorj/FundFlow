# =============================================================================
# Multi-stage Dockerfile for FundFlow (Django + React)
# Stage 1: Build React frontend
# Stage 2: Python backend with Django + Gunicorn
# =============================================================================

# =============================================================================
# Stage 1: Frontend Builder - Build React application
# =============================================================================
FROM node:22-alpine AS frontend-builder

# Allow overriding the npm registry during build (helps in CI or with mirrors)
ARG NPM_REGISTRY=https://registry.npmjs.org

# Set working directory for frontend build
WORKDIR /frontend

# Copy package files first (for better layer caching)
COPY frontend/package*.json ./

# Install npm dependencies using a resilient strategy
# - Explicitly set registry
# - Use npm ci for deterministic installs
# - Retry on transient registry failures (e.g., 503)
RUN npm config set registry "$NPM_REGISTRY" && \
    npm config set fetch-retry-mintimeout 20000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    npm config set fetch-retries 5 && \
    sh -c 'for i in 1 2 3 4 5; do \
      npm ci --no-audit --no-fund --network-timeout=600000 && exit 0; \
      echo "npm ci failed (attempt $i), retrying in 10s..."; \
      sleep 10; \
    done; \
    echo "npm ci failed after multiple attempts" >&2; \
    exit 1'

# Copy frontend source code
COPY frontend/ ./

# Build React application for production
RUN npm run build

# =============================================================================
# Stage 2: Backend - Django application with Gunicorn
# =============================================================================
FROM python:3.10-slim AS backend

# Build arguments for version tracking
ARG BUILD_DATE
ARG GIT_COMMIT

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    BUILD_DATE=${BUILD_DATE} \
    GIT_COMMIT=${GIT_COMMIT}

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
RUN pip install --no-cache-dir --timeout 1000 --retries 3 -r requirements.txt

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