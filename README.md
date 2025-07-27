# FundFlow 💰

**Personal Finance Management Made Simple**

A modern, self-hosted personal finance application for transaction management, intelligent categorization, and financial insights. Built with React and Django, containerised for easy deployment.

---

## 🚀 **Try it Live**

**✨ [Live Demo](https://app.fundflow.dev)** - Experience FundFlow instantly  
**🌐 [Homepage](https://fundflow.dev)** - Download sample data and installation guide

*Demo resets daily at 12:00 AM UTC - Don't use real financial data*

---

## 📦 **One-Command Installation**

Get FundFlow running on your server in under 2 minutes:

```bash
curl -sSL https://fundflow.dev/install | bash
```

**That's it!** FundFlow will be running at `http://localhost:8000`

### Requirements
- Docker must be installed.

---

## ✨ **What Makes FundFlow Special**

### 🎯 **Smart Financial Management**
- **Intelligent Vendor Mapping**: Automatically merge duplicate vendors
- **Auto-Categorisation**: ML-powered transaction categorisation  
- **Hierarchical Categories**: Organize expenses your way
- **Multi-Currency Support**: Handle multiple currencies seamlessly
- **Bulk Operations**: Process hundreds of transactions efficiently

### 🛡️ **Privacy & Control**
- **100% Self-Hosted**: Your data never leaves your server
- **No Tracking**: Zero analytics or external connections
- **Open Source**: Full transparency and customization
- **Docker-Based**: Isolated, secure, and portable

### 🚀 **Production Ready**
- **One-Command Setup**: From zero to running in minutes  
- **Automatic Updates**: Built-in update mechanism
- **Health Monitoring**: Integrated status checks
- **Sample Data**: Realistic test data included

---

## 🏗️ **Architecture**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   React SPA     │◄──►│  Django API     │◄──►│  PostgreSQL     │
│   (Frontend)    │    │   (Backend)     │    │   (Database)    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │ Docker Compose  │
                    │  Orchestration  │
                    └─────────────────┘
```

**Tech Stack:**
- **Frontend**: React 18, React Router, Axios
- **Backend**: Django 4.2, Django REST Framework
- **Database**: PostgreSQL 15
- **Deployment**: Docker, Docker Compose
- **Authentication**: JWT with automatic refresh

---

## 🎮 **Quick Start Guide**

### 1. **Experience the Demo**
Visit [app.fundflow.dev](https://app.fundflow.dev) to try FundFlow with realistic sample data.

### 2. **Download Sample Data**
Get realistic CSV files from [fundflow.dev](https://fundflow.dev) to test with your own installation.

### 3. **Self-Host FundFlow**
```bash
# Install FundFlow
curl -sSL https://fundflow.dev/install | bash

# Start FundFlow
./fundflow.sh start

# Check status
./fundflow.sh status

# View logs
./fundflow.sh logs

# Update to latest version
./fundflow.sh update
```

### 4. **Import Your Data**
1. Export transactions from your bank as CSV
2. Upload via the web interface at `http://localhost:8000`
3. Review and categorise transactions
4. Enjoy organised financial insights!

---

## 🔧 **Management Commands**

FundFlow includes a powerful management script:

```bash
./fundflow.sh start     # Start all services
./fundflow.sh stop      # Stop all services  
./fundflow.sh restart   # Restart all services
./fundflow.sh status    # Show service status
./fundflow.sh logs      # View application logs
./fundflow.sh update    # Update to latest version
./fundflow.sh uninstall # Remove FundFlow completely
```

---

## 🔒 **Security & Privacy**

- **Local Processing**: All data processing happens on your server
- **No External Calls**: Zero tracking, analytics, or external dependencies
- **Secure by Default**: HTTPS ready, security headers included
- **Isolated Environment**: Docker containers provide strong isolation
- **Regular Updates**: Automatic security updates via Docker Hub

---

## 🛠️ **For Developers**

### Local Development
```bash
git clone https://github.com/snorj/FundFlow.git
cd fundflow
docker compose up --build
```

### Deployment Pipeline
```bash
# Build and deploy everything
./deploy.sh

# Individual commands
./deploy.sh build    # Build Docker image
./deploy.sh test     # Test image
./deploy.sh push     # Push to Docker Hub  
./deploy.sh fly      # Deploy to demo site
```

### Project Structure
```
FundFlow/
├── frontend/          # React application
├── FundFlow/          # Django project settings
├── accounts/          # User authentication
├── transactions/      # Transaction management
├── integrations/      # Data import/export
├── docker-compose.yml # Production orchestration
├── Dockerfile         # Multi-stage build
├── fundflow.sh       # Management script
└── deploy.sh         # Deployment automation
```

---

## 📊 **Sample Data**

Included sample datasets for testing:
- **Checking Account** (USD): Daily expenses, 2 months
- **Credit Card** (EUR): Mixed transactions, 2 months  
- **Savings Account** (USD): Transfers and interest
- **Investment Account** (EUR): Portfolio transactions

Download from [fundflow.dev](https://fundflow.dev)

---

## 🤝 **Contributing**

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Links
- **Issues**: [Report bugs or request features](https://github.com/snorj/FundFlow/issues)
- **Discussions**: [Community discussions](https://github.com/snorj/FundFlow/discussions)
- **Security**: [Report security issues](SECURITY.md)

---

## 📜 **License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🌟 **Why FundFlow?**

> *"I wanted a personal finance app that I could trust with my data, customise to my needs, and host myself. After trying dozens of commercial solutions, I built FundFlow to be the tool I wished existed."*

**Built for privacy-conscious individuals who want:**
- Complete control over their financial data
- Professional-grade features without subscription fees
- The ability to customise and extend functionality
- Peace of mind knowing where their data lives

---

**⭐ If FundFlow helps manage your finances, please star this repository!**

[**🚀 Try Live Demo**](https://app.fundflow.dev) • [**📥 Download**](https://fundflow.dev) • [**📚 Documentation**](https://github.com/snorj/FundFlow/wiki)
