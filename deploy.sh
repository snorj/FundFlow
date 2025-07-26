#!/bin/bash

# =============================================================================
# FundFlow Docker Hub Deployment Script
# Builds and pushes images to Docker Hub for distribution
# =============================================================================

set -e  # Exit on any error

# Configuration
DOCKER_USERNAME="fundfl0w"
IMAGE_NAME="fundflow"
DOCKER_IMAGE="$DOCKER_USERNAME/$IMAGE_NAME"
BUILD_DATE=$(date '+%Y%m%d')
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

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

print_header() {
    echo -e "${BLUE}${BOLD}"
    echo "╔════════════════════════════════════════╗"
    echo "║         🐳 FundFlow Deployment         ║"
    echo "║        Docker Hub Image Builder        ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# =============================================================================
# Pre-flight Checks
# =============================================================================

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running"
        exit 1
    fi
    
    print_success "Docker is available and running"
}

check_docker_login() {
    print_info "Checking Docker Hub authentication..."
    
    if ! docker info | grep -q "Username: $DOCKER_USERNAME"; then
        print_warning "Not logged in to Docker Hub as $DOCKER_USERNAME"
        print_info "Please run: docker login --username $DOCKER_USERNAME"
        
        read -p "Continue with login now? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            docker login --username "$DOCKER_USERNAME"
        else
            print_error "Docker Hub login required for deployment"
            exit 1
        fi
    fi
    
    print_success "Docker Hub authentication verified"
}

check_git_status() {
    if [ -d ".git" ]; then
        if [ -n "$(git status --porcelain)" ]; then
            print_warning "Git working directory is not clean"
            git status --short
            echo
            read -p "Continue with uncommitted changes? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                print_info "Please commit your changes and try again"
                exit 1
            fi
        fi
    fi
}

# =============================================================================
# Build Functions
# =============================================================================

build_image() {
    print_info "Building FundFlow Docker image..."
    echo "📦 Image: $DOCKER_IMAGE"
    echo "🏗️  Build Date: $BUILD_DATE"
    echo "📝 Git Commit: $GIT_COMMIT"
    echo ""
    
    # Build with multiple tags
    docker build \
        --tag "$DOCKER_IMAGE:latest" \
        --tag "$DOCKER_IMAGE:$BUILD_DATE" \
        --tag "$DOCKER_IMAGE:$GIT_COMMIT" \
        --build-arg BUILD_DATE="$BUILD_DATE" \
        --build-arg GIT_COMMIT="$GIT_COMMIT" \
        --no-cache \
        .
    
    print_success "Image built successfully"
}

test_image() {
    print_info "Testing built image..."
    
    # Basic test - check if image runs and responds
    local container_id
    container_id=$(docker run -d -p 8001:8000 "$DOCKER_IMAGE:latest")
    
    print_info "Started test container: $container_id"
    
    # Wait for container to be ready
    sleep 10
    
    # Test if the application responds
    if curl -f -s http://localhost:8001/ > /dev/null; then
        print_success "Image test passed - application responds correctly"
    else
        print_error "Image test failed - application not responding"
        docker logs "$container_id"
        docker stop "$container_id" > /dev/null
        docker rm "$container_id" > /dev/null
        exit 1
    fi
    
    # Cleanup test container
    docker stop "$container_id" > /dev/null
    docker rm "$container_id" > /dev/null
    print_info "Test container cleaned up"
}

push_image() {
    print_info "Pushing images to Docker Hub..."
    
    # Push all tags
    docker push "$DOCKER_IMAGE:latest"
    docker push "$DOCKER_IMAGE:$BUILD_DATE"
    docker push "$DOCKER_IMAGE:$GIT_COMMIT"
    
    print_success "All images pushed successfully"
}

show_image_info() {
    echo ""
    echo "🎉 Deployment Complete!"
    echo ""
    echo "📊 Image Information:"
    echo "   Repository: https://hub.docker.com/r/$DOCKER_USERNAME/$IMAGE_NAME"
    echo "   Latest:     $DOCKER_IMAGE:latest"
    echo "   Date:       $DOCKER_IMAGE:$BUILD_DATE"
    echo "   Commit:     $DOCKER_IMAGE:$GIT_COMMIT"
    echo ""
    echo "🚀 Usage Commands:"
    echo "   docker pull $DOCKER_IMAGE:latest"
    echo "   docker run -p 8000:8000 $DOCKER_IMAGE:latest"
    echo ""
    echo "📋 Next Steps:"
    echo "   1. Update docker-compose.yml to use: $DOCKER_IMAGE:latest"
    echo "   2. Update fundflow.sh to pull instead of build"
    echo "   3. Test the updated setup"
    echo ""
}

# =============================================================================
# Main Deployment Function
# =============================================================================

deploy() {
    print_header
    
    print_info "Starting FundFlow deployment to Docker Hub..."
    echo ""
    
    # Pre-flight checks
    check_docker
    check_docker_login
    check_git_status
    
    echo ""
    
    # Build and test
    build_image
    test_image
    
    echo ""
    
    # Push to Docker Hub
    push_image
    
    # Show final information
    show_image_info
}

# =============================================================================
# Script Execution
# =============================================================================

case "${1:-deploy}" in
    "deploy")
        deploy
        ;;
    "build")
        print_header
        check_docker
        build_image
        print_success "Build complete (not pushed)"
        ;;
    "test")
        print_header
        check_docker
        if docker image inspect "$DOCKER_IMAGE:latest" &> /dev/null; then
            test_image
        else
            print_error "Image $DOCKER_IMAGE:latest not found. Run '$0 build' first."
            exit 1
        fi
        ;;
    "push")
        print_header
        check_docker
        check_docker_login
        if docker image inspect "$DOCKER_IMAGE:latest" &> /dev/null; then
            push_image
            show_image_info
        else
            print_error "Image $DOCKER_IMAGE:latest not found. Run '$0 build' first."
            exit 1
        fi
        ;;
    *)
        echo "Usage: $0 [deploy|build|test|push]"
        echo ""
        echo "Commands:"
        echo "  deploy  - Full deployment (build + test + push)"
        echo "  build   - Build image only"
        echo "  test    - Test existing image"
        echo "  push    - Push existing image to Docker Hub"
        exit 1
        ;;
esac 