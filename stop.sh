#!/bin/bash

# =============================================================================
# FundFlow Shutdown Script
# Gracefully stop the FundFlow application
# =============================================================================

echo "🛑 Stopping FundFlow Application..."
echo "======================================="

# Stop and remove containers
docker compose down

echo ""
echo "✅ FundFlow has been stopped."
echo ""
echo "📋 Your data is preserved in Docker volumes."
echo "   • To restart: ./start.sh"
echo "   • To remove all data: docker compose down -v"
echo "" 