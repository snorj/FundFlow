#!/bin/bash

# =============================================================================
# FundFlow Startup Script
# One-command startup for the complete FundFlow application
# =============================================================================

set -e  # Exit on any error

echo "🚀 Starting FundFlow Application..."
echo "======================================="

# Check if Docker is running
if ! docker info >/dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "📝 Creating .env file from template..."
    if [ -f ".env.example" ]; then
        cp .env.example .env
        echo "✅ Created .env file. You can customize it if needed."
    else
        echo "❌ .env.example file not found. Please create a .env file manually."
        exit 1
    fi
fi

echo "🐳 Starting Docker containers..."
docker compose up -d

echo ""
echo "⏳ Waiting for services to be ready..."

# Wait for services to be healthy
max_attempts=60
attempt=0

while [ $attempt -lt $max_attempts ]; do
    if docker compose ps | grep -q "healthy"; then
        echo ""
        echo "✅ FundFlow is ready!"
        echo "======================================="
        echo "🌐 Application: http://localhost:8000"
        echo "🗄️  Database: localhost:5433"
        echo ""
        echo "📋 Useful commands:"
        echo "   • View logs: docker compose logs -f"
        echo "   • Stop app: docker compose down"
        echo "   • Restart: docker compose restart"
        echo ""
        break
    fi
    
    attempt=$((attempt + 1))
    echo -n "."
    sleep 2
done

if [ $attempt -eq $max_attempts ]; then
    echo ""
    echo "⚠️  Services are taking longer than expected to start."
    echo "   Check logs with: docker compose logs"
    echo "   Try accessing: http://localhost:8000"
fi 