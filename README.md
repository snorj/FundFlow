# FundFlow

A personal finance application built with React and Django for transaction management, intelligent categorization, and financial insights.

## Problem

Managing finances across multiple accounts and currencies is challenging with standard banking apps lacking detailed categorization and analysis tools.

## Solution

FundFlow centralizes financial data from CSV uploads, allowing users to:

*   **Smart Vendor Mapping**: Automatically map vendor names and merge duplicates
*   **Intelligent Categorization**: Auto-categorize transactions using vendor rules
*   **Flexible Category System**: Hierarchical category management with tree view
*   **Transaction Review**: Streamlined categorization workflow with bulk operations
*   **Vendor Rule Management**: Create and manage rules for automatic categorization

## Tech Stack

*   **Frontend:** React, React Router, Axios, CSS
*   **Backend:** Django, Django REST Framework, Python
*   **Database:** PostgreSQL (SQLite for development)
*   **Authentication:** JWT (SimpleJWT)

## Key Features

*   **User Authentication**: Registration, login, and JWT-based sessions
*   **CSV Transaction Upload**: Bulk import with automatic vendor mapping
*   **Vendor Management**: Rename, merge, and map vendor names
*   **Auto-Categorization**: Intelligent transaction categorization based on vendor rules
*   **Category Management**: Hierarchical categories with tree-based selection
*   **Transaction Review**: Interactive categorization with bulk operations
*   **Vendor Rules**: Create and manage automatic categorization rules

## Getting Started

**Prerequisites:** Python 3.10+, Node.js 18+, PostgreSQL (optional)

**Backend:**
```bash
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

Access the app at `http://localhost:3000`.

## Project Status

Core transaction management and categorization features are complete. The system provides intelligent vendor mapping, automatic categorization, and streamlined transaction review workflows.
