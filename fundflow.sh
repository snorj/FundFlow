#!/bin/bash

# =============================================================================
# FundFlow - Personal Finance Management
# One-command setup and management script
# =============================================================================

set -e  # Exit on any error
set -o pipefail

# Script configuration
SCRIPT_VERSION="1.0.0"
FUNDFLOW_PORT="${FUNDFLOW_PORT:-8000}"
COMPOSE_PROJECT_NAME="fundflow"
LOG_FILE="$HOME/.fundflow.log"
DOCKER_IMAGE="${DOCKER_IMAGE:-fundfl0w/fundflow:latest}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# =============================================================================
# Utility Functions
# =============================================================================

log() {
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1" >> "$LOG_FILE"
}

print_header() {
    echo -e "${BLUE}${BOLD}"
    echo "╔════════════════════════════════════════╗"
    echo "║            🏦 FundFlow v$SCRIPT_VERSION            ║"
    echo "║     Personal Finance Management        ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
    log "SUCCESS: $1"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    log "ERROR: $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    log "WARNING: $1"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
    log "INFO: $1"
}

# =============================================================================
# System Checks
# =============================================================================

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        echo ""
        echo "📥 Please install Docker first:"
        echo "   • Linux: https://docs.docker.com/engine/install/"
        echo "   • macOS: https://docs.docker.com/desktop/mac/"
        echo "   • Windows: https://docs.docker.com/desktop/windows/"
        echo ""
        exit 1
    fi

    if ! docker info &> /dev/null; then
        print_error "Docker is not running"
        echo ""
        echo "🚀 Please start Docker and try again:"
        echo "   • Linux: sudo systemctl start docker"
        echo "   • macOS/Windows: Start Docker Desktop"
        echo ""
        exit 1
    fi

    # Check for docker compose (new) or docker-compose (legacy)
    if docker compose version &> /dev/null; then
        DOCKER_COMPOSE="docker compose"
    elif command -v docker-compose &> /dev/null; then
        DOCKER_COMPOSE="docker-compose"
    else
        print_error "Docker Compose is not available"
        echo "Please install Docker Compose or update Docker to a newer version"
        exit 1
    fi

    print_success "Docker is ready ($DOCKER_COMPOSE)"
}

find_available_port() {
    local start_port=${1:-8000}
    local port=$start_port
    
    for ((i=0; i<10; i++)); do
        if ! nc -z localhost $port 2>/dev/null && ! ss -tln | grep -q ":$port "; then
            FUNDFLOW_PORT=$port
            return 0
        fi
        ((port++))
    done
    
    print_error "No available ports found between $start_port and $((start_port + 9))"
    exit 1
}

check_port() {
    if nc -z localhost $FUNDFLOW_PORT 2>/dev/null || ss -tln | grep -q ":$FUNDFLOW_PORT "; then
        print_warning "Port $FUNDFLOW_PORT is in use, finding alternative..."
        find_available_port $((FUNDFLOW_PORT + 1))
        print_info "Will use port $FUNDFLOW_PORT instead"
    fi
}

# =============================================================================
# Environment Setup
# =============================================================================

generate_secrets() {
    # Generate Django secret key using URL-safe characters (no $ to avoid compose expansion)
    DJANGO_SECRET=$(python3 - <<'PY' 2>/dev/null || true
import secrets
print(secrets.token_urlsafe(64))
PY
)
    if [ -z "${DJANGO_SECRET}" ]; then
        DJANGO_SECRET=$(openssl rand -base64 48 | tr '+/' '-_' | tr -d '=' | cut -c1-86)
    fi
    
    # Generate database password
    DB_PASSWORD=$(python3 - <<'PY' 2>/dev/null || true
import secrets, string
alphabet = string.ascii_letters + string.digits
print(''.join(secrets.choice(alphabet) for _ in range(24)))
PY
)
    if [ -z "${DB_PASSWORD}" ]; then
        DB_PASSWORD=$(openssl rand -base64 24 | tr -d '=+/' | cut -c1-24)
    fi
    
    # Generate Fernet key
    FERNET_KEY=$(python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())" 2>/dev/null || \
                openssl rand -base64 32)
}

create_env_file() {
    print_info "Creating environment configuration..."
    
    generate_secrets
    
    cat > .env << EOF
# FundFlow Configuration - Generated $(date)
# Django Core Settings
SECRET_KEY=${DJANGO_SECRET}
DEBUG=False
ALLOWED_HOSTS=localhost,127.0.0.1,0.0.0.0

# Database Configuration (PostgreSQL with Docker)
DATABASE_URL=postgresql://fundflow_user:${DB_PASSWORD}@db:5432/fundflow_db
DATABASE_NAME=fundflow_db
DATABASE_USER=fundflow_user
DATABASE_PASSWORD=${DB_PASSWORD}

# Static Files
STATIC_URL=/static/
STATIC_ROOT=/app/staticfiles

# CORS Settings
CORS_ALLOWED_ORIGINS=http://localhost:${FUNDFLOW_PORT},http://127.0.0.1:${FUNDFLOW_PORT}

# Application Settings
DJANGO_SETTINGS_MODULE=FundFlow.settings
DJANGO_FERNET_KEY=${FERNET_KEY}
EOF

    print_success "Environment configured with secure random secrets"
}

# =============================================================================
# Docker Operations
# =============================================================================

pull_image() {
    print_info "Pulling FundFlow Docker image from Docker Hub..."
    
    if docker pull "$DOCKER_IMAGE"; then
        print_success "Docker image pulled successfully"
    else
        print_error "Failed to pull Docker image: $DOCKER_IMAGE"
        print_info "This might be a network issue or the image doesn't exist yet."
        print_info "You can build locally by running: docker compose build"
        exit 1
    fi
}

build_image_fallback() {
    print_warning "Falling back to local build..."
    print_info "Building FundFlow Docker image (this may take a few minutes)..."
    
    if $DOCKER_COMPOSE build --no-cache; then
        print_success "Docker image built successfully"
    else
        print_error "Failed to build Docker image"
        exit 1
    fi
}

start_services() {
    print_info "Starting FundFlow services..."
    
    # Write override file for host port mapping (base compose does not map host port)
    print_info "Configuring custom port: $FUNDFLOW_PORT"
    cat > docker-compose.override.yml << EOF
services:
  web:
    ports:
      - "${FUNDFLOW_PORT}:8000"
EOF
    
    if $DOCKER_COMPOSE up -d; then
        print_success "Services started"
        wait_for_services
    else
        print_error "Failed to start services"
        exit 1
    fi
}

wait_for_services() {
    print_info "Waiting for services to become ready..."
    
    local max_attempts=60
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:$FUNDFLOW_PORT/api/ > /dev/null 2>&1; then
            print_success "FundFlow is ready!"
            return 0
        fi
        
        echo -ne "\r⏳ Waiting for services... ($attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done
    
    echo ""
    print_error "Services did not start within expected time"
    print_info "Check logs with: $0 logs"
    exit 1
}

stop_services() {
    print_info "Stopping FundFlow services..."
    
    if $DOCKER_COMPOSE down; then
        print_success "Services stopped"
    else
        print_warning "Some services may still be running"
    fi
}

# =============================================================================
# Browser Integration
# =============================================================================

open_browser() {
    local url="http://localhost:$FUNDFLOW_PORT"
    
    print_info "Opening FundFlow in your browser..."
    
    # Cross-platform browser opening
    if command -v xdg-open > /dev/null; then
        xdg-open "$url" 2>/dev/null &
    elif command -v open > /dev/null; then
        open "$url" 2>/dev/null &
    elif command -v start > /dev/null; then
        start "$url" 2>/dev/null &
    else
        print_warning "Could not auto-open browser"
        echo "Please visit: $url"
        return 1
    fi
    
    sleep 2
    print_success "Browser opened to $url"
}

# =============================================================================
# Main Commands
# =============================================================================

cmd_start() {
    print_header
    print_info "Starting FundFlow..."
    
    # Always operate from the script directory so compose finds files
    local script_dir
    script_dir="$(cd "$(dirname "$0")" && pwd)"
    cd "$script_dir"
    export COMPOSE_PROJECT_NAME

    check_docker
    check_port
    
    # Create .env if it doesn't exist
    if [ ! -f .env ]; then
        # Detect existing data volume; abort to avoid password mismatch
        if docker volume inspect fundflow_postgres_data >/dev/null 2>&1; then
            print_error "Existing database volume 'fundflow_postgres_data' detected."
            echo "This indicates a previous FundFlow install with its own DB password."
            echo "To proceed, either:"
            echo "  1) Remove old data (irreversible):"
            echo "     docker compose down && docker volume rm fundflow_postgres_data"
            echo "  2) Restore the previous .env used with that volume and rerun start."
            exit 1
        fi
        create_env_file
    fi
    
    # Pull image if it doesn't exist locally
    if ! docker image inspect "$DOCKER_IMAGE" > /dev/null 2>&1; then
        # Try to pull from Docker Hub first
        if ! pull_image 2>/dev/null; then
            # If pull fails, check if we have docker-compose.yml for local build
            if [ -f "docker-compose.yml" ] && [ -f "Dockerfile" ]; then
                print_warning "Could not pull pre-built image, building locally instead"
                export DOCKER_IMAGE="fundflow-web"  # Use local build name
                build_image_fallback
            else
                print_error "Cannot pull image and no local build files found"
                exit 1
            fi
        fi
    else
        print_info "Using existing Docker image: $DOCKER_IMAGE"
    fi
    
    start_services
    
    echo ""
    print_success "🎉 FundFlow is running!"
    echo ""
    echo "📱 Web Interface: http://localhost:$FUNDFLOW_PORT"
    echo "💾 Data Storage: Docker volume 'fundflow_postgres_data'"
    echo "📋 Commands:"
    echo "   • Stop:      $0 stop"
    echo "   • Restart:   $0 restart"
    echo "   • Status:    $0 status"
    echo "   • Logs:      $0 logs"
    echo ""
    
    open_browser
}

cmd_stop() {
    print_header
    print_info "Stopping FundFlow..."
    
    stop_services
    
    # Remove override file if it exists
    [ -f docker-compose.override.yml ] && rm -f docker-compose.override.yml
    
    print_success "FundFlow stopped"
}

cmd_restart() {
    print_header
    print_info "Restarting FundFlow..."
    
    cmd_stop
    sleep 2
    cmd_start
}

cmd_status() {
    print_header
    
    if ! command -v docker &> /dev/null; then
        print_error "Docker not installed"
        return 1
    fi
    
    echo "🔍 FundFlow Status:"
    echo ""
    
    # Check if containers are running
    if $DOCKER_COMPOSE ps | grep -q "Up"; then
        print_success "Services are running"
        
        # Get port info
        local web_port=$($DOCKER_COMPOSE ps | grep "web" | grep -o "0.0.0.0:[0-9]*" | cut -d: -f2)
        if [ -n "$web_port" ]; then
            echo "📱 Web Interface: http://localhost:$web_port"
        fi
        
        echo ""
        echo "Container Status:"
        $DOCKER_COMPOSE ps
        
    else
        print_warning "Services are not running"
        echo "Use '$0 start' to start FundFlow"
    fi
    
    echo ""
    echo "💾 Data Volumes:"
    docker volume ls | grep fundflow || echo "No FundFlow volumes found"
}

cmd_logs() {
    if $DOCKER_COMPOSE ps | grep -q "Up"; then
        echo "📋 FundFlow Logs (last 50 lines):"
        echo "Press Ctrl+C to exit"
        echo ""
        $DOCKER_COMPOSE logs --tail=50 -f
    else
        print_warning "Services are not running"
        echo "Use '$0 start' to start FundFlow first"
    fi
}

cmd_update() {
    print_header
    print_info "Updating FundFlow to latest version..."
    
    # Stop current services
    print_info "Stopping current services..."
    $DOCKER_COMPOSE down 2>/dev/null || true
    
    # Remove old image to force fresh pull
    print_info "Removing old image..."
    docker rmi "$DOCKER_IMAGE" 2>/dev/null || true
    
    # Pull latest image from Docker Hub
    print_info "Pulling latest image from Docker Hub..."
    if docker pull "$DOCKER_IMAGE"; then
        print_success "Latest image downloaded successfully"
    else
        print_error "Failed to pull latest image"
        print_info "Falling back to current version..."
        return 1
    fi
    
    # Restart services with new image
    print_info "Starting services with updated image..."
    start_services
    
    wait_for_services
    print_success "🎉 FundFlow updated to latest version!"
    
    # Show version info if available
    docker image inspect "$DOCKER_IMAGE" --format '{{range .Config.Env}}{{if eq (index (split . "=") 0) "BUILD_DATE"}}Build Date: {{index (split . "=") 1}}{{end}}{{end}}' 2>/dev/null || true
}

cmd_uninstall() {
    print_header
    print_warning "This will remove FundFlow and ALL your data!"
    echo ""
    read -p "Are you sure? Type 'yes' to confirm: " confirm
    
    if [ "$confirm" = "yes" ]; then
        print_info "Removing FundFlow..."
        
        # Stop services
        $DOCKER_COMPOSE down -v 2>/dev/null || true
        
        # Remove images (both Docker Hub and local fallback versions)
        docker rmi "$DOCKER_IMAGE" 2>/dev/null || true
        docker rmi "fundflow-web" 2>/dev/null || true  # Local build fallback
        docker rmi "fundfl0w/fundflow:latest" 2>/dev/null || true
        docker rmi postgres:15-alpine 2>/dev/null || true
        
        # Remove volumes
        docker volume rm fundflow_postgres_data 2>/dev/null || true
        
        # Remove files
        rm -f .env docker-compose.override.yml
        rm -f "$LOG_FILE"
        
        print_success "FundFlow uninstalled"
        print_info "You can remove this script manually if desired"
    else
        print_info "Uninstall cancelled"
    fi
}

cmd_help() {
    print_header
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  start       Start FundFlow (downloads & configures if needed)"
    echo "  stop        Stop FundFlow"
    echo "  restart     Restart FundFlow"
    echo "  status      Show running status"
    echo "  logs        View application logs"
    echo "  update      Update FundFlow to latest version"
    echo "  uninstall   Remove FundFlow and all data"
    echo "  help        Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  FUNDFLOW_PORT    Port to run on (default: 8000)"
    echo ""
    echo "Examples:"
    echo "  $0 start                    # Start FundFlow on port 8000"
    echo "  FUNDFLOW_PORT=8080 $0 start # Start FundFlow on port 8080"
    echo ""
}

# =============================================================================
# Main Entry Point
# =============================================================================

main() {
    # Create log file if it doesn't exist
    touch "$LOG_FILE"
    log "FundFlow script started with command: ${1:-help}"
    
    case "${1:-help}" in
        "start")
            cmd_start
            ;;
        "stop")
            cmd_stop
            ;;
        "restart")
            cmd_restart
            ;;
        "status")
            cmd_status
            ;;
        "logs")
            cmd_logs
            ;;
        "update")
            cmd_update
            ;;
        "uninstall")
            cmd_uninstall
            ;;
        "help"|"-h"|"--help")
            cmd_help
            ;;
        *)
            print_error "Unknown command: $1"
            echo ""
            cmd_help
            exit 1
            ;;
    esac
}

# Run main function with all arguments
main "$@" 