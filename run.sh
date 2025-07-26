#!/bin/bash

# =============================================================================
# FundFlow One-Command Installer
# curl -sSL https://fundflow.app/run.sh | bash
# =============================================================================

set -e  # Exit on any error

# Configuration
FUNDFLOW_REPO="https://raw.githubusercontent.com/yourusername/fundflow/main"  # Will be updated
INSTALL_DIR="$HOME/fundflow"
SCRIPT_NAME="fundflow.sh"

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
    echo "║     🏦 FundFlow Quick Install 🚀       ║"
    echo "║   Personal Finance Management          ║"
    echo "╚════════════════════════════════════════╝"
    echo -e "${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# =============================================================================
# Installation Functions
# =============================================================================

check_requirements() {
    print_info "Checking system requirements..."
    
    # Check if curl is available (should be, since we're running via curl)
    if ! command -v curl &> /dev/null; then
        print_error "curl is required but not installed"
        exit 1
    fi
    
    # Check if we can create the install directory
    if ! mkdir -p "$INSTALL_DIR" 2>/dev/null; then
        print_error "Cannot create directory: $INSTALL_DIR"
        print_info "You may need to run: mkdir -p $INSTALL_DIR"
        exit 1
    fi
    
    print_success "System requirements met"
}

download_files() {
    print_info "Downloading FundFlow setup files..."
    
    cd "$INSTALL_DIR"
    
    # Download main script (for now, copy from current directory)
    # In production, this would download from GitHub
    if [ -f "/home/peter/Desktop/Projects/FundFlow/fundflow.sh" ]; then
        print_info "Copying fundflow.sh from local development..."
        cp "/home/peter/Desktop/Projects/FundFlow/fundflow.sh" .
        cp "/home/peter/Desktop/Projects/FundFlow/docker-compose.yml" .
        cp "/home/peter/Desktop/Projects/FundFlow/Dockerfile" .
        cp "/home/peter/Desktop/Projects/FundFlow/.dockerignore" .
        
        # Copy entire project structure for now (in production, this would be a git clone or Docker image)
        print_info "Setting up FundFlow directory structure..."
        rsync -av --exclude='.git' --exclude='venv' --exclude='node_modules' --exclude='__pycache__' \
              /home/peter/Desktop/Projects/FundFlow/ ./ 2>/dev/null || {
            print_warning "Could not copy full project structure"
            print_info "Continuing with basic setup..."
        }
    else
        print_error "Development files not found"
        print_info "In production, this would download from GitHub"
        exit 1
    fi
    
    # Make script executable
    chmod +x fundflow.sh
    
    print_success "Files downloaded successfully"
}

run_installation() {
    print_info "Starting FundFlow installation..."
    
    # Run the main installation script
    if ./fundflow.sh start; then
        print_success "FundFlow installation completed!"
    else
        print_error "Installation failed"
        print_info "Check logs at: ~/.fundflow.log"
        print_info "Or run: $INSTALL_DIR/fundflow.sh logs"
        exit 1
    fi
}

cleanup_on_error() {
    print_warning "Installation failed, cleaning up..."
    cd "$HOME"
    rm -rf "$INSTALL_DIR" 2>/dev/null || true
}

# =============================================================================
# Main Installation Process
# =============================================================================

main() {
    print_header
    
    echo "🎯 This will install FundFlow on your computer"
    echo "📂 Installation directory: $INSTALL_DIR"
    echo "🐳 Requires: Docker (will check and guide if missing)"
    echo ""
    
    # Set up error handling
    trap cleanup_on_error ERR
    
    # Run installation steps
    check_requirements
    download_files
    run_installation
    
    echo ""
    print_success "🎉 FundFlow is now installed and running!"
    echo ""
    echo "📋 Quick Commands:"
    echo "   cd $INSTALL_DIR"
    echo "   ./fundflow.sh status    # Check status"
    echo "   ./fundflow.sh stop      # Stop FundFlow"
    echo "   ./fundflow.sh restart   # Restart FundFlow"
    echo "   ./fundflow.sh help      # Show all commands"
    echo ""
    echo "💡 Tip: Add $INSTALL_DIR to your PATH to run 'fundflow.sh' from anywhere"
    echo ""
}

# Run installation
main "$@" 