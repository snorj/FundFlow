# FundFlow Setup Scripts

This document explains the setup scripts created for easy FundFlow deployment.

## 📋 Overview

FundFlow provides two setup scripts for different use cases:

1. **`fundflow.sh`** - Main management script with full functionality
2. **`run.sh`** - One-command installer for new users

## 🚀 Quick Start (One Command)

For new users who want to try FundFlow immediately:

```bash
curl -sSL https://fundflow.app/run.sh | bash
```

This command will:
- ✅ Check system requirements (Docker, curl)
- ✅ Download all necessary files to `~/fundflow/`
- ✅ Build and start FundFlow automatically
- ✅ Open browser to `http://localhost:8000`
- ✅ Provide next-step instructions

## 🛠️ Management Script (`fundflow.sh`)

Once installed, use the main script for all operations:

### Commands

```bash
./fundflow.sh start       # Start FundFlow
./fundflow.sh stop        # Stop FundFlow
./fundflow.sh restart     # Restart FundFlow
./fundflow.sh status      # Show running status
./fundflow.sh logs        # View application logs
./fundflow.sh update      # Update to latest version
./fundflow.sh uninstall   # Remove FundFlow and all data
./fundflow.sh help        # Show help message
```

### Environment Variables

```bash
FUNDFLOW_PORT=8080 ./fundflow.sh start   # Run on custom port
```

## 🔧 Technical Features

### Automatic Port Detection
- **Default port**: 8000
- **Conflict resolution**: Auto-finds available port (8001, 8002, etc.)
- **Custom ports**: Set via `FUNDFLOW_PORT` environment variable

### Docker Integration
- **Auto-detection**: Supports both `docker compose` and `docker-compose`
- **Health checks**: Waits for services to be ready before proceeding
- **Volume management**: Uses Docker volumes for data persistence

### Security Features
- **Random secrets**: Generates secure Django SECRET_KEY and database passwords
- **Local access**: Binds to localhost only by default
- **Environment isolation**: Each installation gets unique credentials

### Cross-Platform Support
- **Linux**: Native bash support
- **macOS**: Native bash support
- **Windows**: Works with Git Bash or WSL

### Error Handling
- **Docker checks**: Verifies Docker is installed and running
- **Port conflicts**: Automatically resolves port conflicts
- **Cleanup**: Removes partial installations on failure
- **Logging**: Comprehensive logging to `~/.fundflow.log`

## 📂 File Structure

After installation in `~/fundflow/`:

```
~/fundflow/
├── fundflow.sh              # Main management script
├── docker-compose.yml       # Docker orchestration
├── Dockerfile               # Container build instructions
├── .env                     # Environment configuration (auto-generated)
├── [Full FundFlow codebase] # All application files
└── docker-compose.override.yml # Port overrides (if needed)
```

## 🔍 Troubleshooting

### Common Issues

**Docker not installed:**
```bash
❌ Docker is not installed
```
→ Follow provided installation links for your platform

**Docker not running:**
```bash
❌ Docker is not running
```
→ Start Docker Desktop (macOS/Windows) or `sudo systemctl start docker` (Linux)

**Port conflicts:**
```bash
⚠️ Port 8000 is in use, finding alternative...
ℹ️ Will use port 8001 instead
```
→ Script automatically handles this

**Service startup timeout:**
```bash
❌ Services did not start within expected time
```
→ Check logs: `./fundflow.sh logs`

### Log Files

- **Main log**: `~/.fundflow.log`
- **Docker logs**: `./fundflow.sh logs`

## 🔄 Update Process

To update FundFlow:

```bash
./fundflow.sh update
```

This will:
1. Pull latest code changes (if in git repo)
2. Rebuild Docker image with updates
3. Restart services with new version
4. Preserve all user data

## 🗑️ Uninstallation

To completely remove FundFlow:

```bash
./fundflow.sh uninstall
```

**⚠️ Warning**: This removes ALL data including:
- Docker containers and images
- PostgreSQL database with all transactions
- Configuration files
- Log files

## 💾 Data Persistence

FundFlow uses Docker volumes for data storage:

- **Volume name**: `fundflow_postgres_data`
- **Location**: Managed by Docker (typically `/var/lib/docker/volumes/`)
- **Persistence**: Data survives container restarts and updates
- **Backup**: Use Docker volume backup tools or database export features

## 🔐 Security Notes

- **Local only**: Default configuration binds to localhost
- **Random credentials**: Each installation generates unique passwords
- **No external access**: Not exposed to internet by default
- **HTTPS**: Not configured (suitable for local use)

## 🎯 Production Deployment

For production deployment:

1. **Custom domain**: Update `ALLOWED_HOSTS` in `.env`
2. **HTTPS**: Configure reverse proxy (nginx, Traefik)
3. **External database**: Override `DATABASE_URL` in `.env`
4. **Backup strategy**: Implement regular database backups
5. **Monitoring**: Add application monitoring tools

## 📞 Support

If you encounter issues:

1. Check logs: `./fundflow.sh logs`
2. Check status: `./fundflow.sh status`
3. Review: `~/.fundflow.log`
4. GitHub Issues: [Link to be added]
5. Documentation: [Link to be added] 