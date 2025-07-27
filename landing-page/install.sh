#!/bin/bash

# =============================================================================
# FundFlow One-Command Installer
# curl -sSL https://fundflow.dev/install | bash
# =============================================================================

set -e  # Exit on any error

# Configuration
INSTALL_DIR="$HOME/fundflow"
SCRIPT_NAME="fundflow.sh"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}${BOLD}"
    echo "╔════════════════════════════════════════╗"
    echo "║     🏦 FundFlow Quick Install 🚀       ║"
    echo "║   Privacy-First Personal Finance       ║"
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

check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        echo ""
        echo "Please install Docker first:"
        echo "• Linux: curl -fsSL https://get.docker.com | sh"
        echo "• macOS: https://docs.docker.com/desktop/mac/install/"
        echo "• Windows: https://docs.docker.com/desktop/windows/install/"
        exit 1
    fi
    
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running"
        echo "Please start Docker and try again"
        exit 1
    fi
    
    print_success "Docker is available"
}

download_files() {
    print_info "Setting up FundFlow..."
    
    mkdir -p "$INSTALL_DIR"
    cd "$INSTALL_DIR"
    
    # Download main management script
    if ! curl -sSL -o fundflow.sh "https://raw.githubusercontent.com/fundfl0w/fundflow/main/fundflow.sh"; then
        print_error "Failed to download management script"
        exit 1
    fi
    
    # Download docker-compose configuration
    if ! curl -sSL -o docker-compose.yml "https://raw.githubusercontent.com/fundfl0w/fundflow/main/docker-compose.yml"; then
        print_error "Failed to download configuration"
        exit 1
    fi
    
    # Download environment template
    if ! curl -sSL -o .env.example "https://raw.githubusercontent.com/fundfl0w/fundflow/main/.env.example"; then
        print_error "Failed to download environment template"
        exit 1
    fi
    
    chmod +x fundflow.sh
    print_success "Files downloaded successfully"
}

main() {
    print_header
    echo "🎯 Installing FundFlow - Privacy-first personal finance"
    echo ""
    
    check_docker
    download_files
    
    echo ""
    print_success "🎉 FundFlow installation complete!"
    echo ""
    echo "📋 Next steps:"
    echo "   1. cd $INSTALL_DIR"
    echo "   2. ./fundflow.sh start"
    echo ""
    echo "📊 Sample data available at: https://fundflow.dev/#sample-data"
    echo "📚 Documentation: https://github.com/snorj/FundFlow"
    echo ""
    echo "🔒 Your financial data stays completely private and local."
}

main "$@" 