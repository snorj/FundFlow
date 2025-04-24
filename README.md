# FundFlow

A personal finance application built with React and Django to aggregate transactions, provide flexible categorization, and offer financial insights.

## Problem

Managing finances across multiple accounts and currencies can be difficult with standard banking apps lacking detailed categorization and analysis tools.

## Solution

FundFlow centralizes financial data from CSV uploads (and potentially bank APIs later), allowing users to:

*   Clean up transaction descriptions using custom rules.
*   Categorize spending with a flexible hierarchical system.
*   Visualize spending patterns (planned feature).
*   Manage budgets (planned feature).

## Tech Stack

*   **Frontend:** React, React Router, Axios, CSS
*   **Backend:** Django, Django REST Framework (DRF), Python
*   **Database:** PostgreSQL (or SQLite for basic local dev)
*   **Authentication:** JWT (SimpleJWT)

## Key Features Implemented

*   User Registration & Login (JWT)
*   CSV Transaction Upload
*   Hierarchical Category Management (API)
*   Description Mapping/Renaming Rule Creation (API)
*   Interactive Categorization UI (Card-based flow with modal tree selector)
*   Backend API Tests (Authentication, Categories, Batch Categorize)

## Getting Started (Local Development)

**Prerequisites:** Python 3.10+, Node.js 18+, npm/yarn, PostgreSQL (optional)

**1. Backend:**

```bash
# Clone repo, cd fundflow
python -m venv venv
source venv/bin/activate  # Or `venv\Scripts\activate` on Windows
pip install -r requirements.txt
# Create a .env file (see .env.example or README-FULL.md for vars)
# Setup database (create DB/User if using PostgreSQL)
python manage.py migrate
python manage.py runserver
```

**2. Frontend:**

```bash
# (In a separate terminal)
cd frontend
npm install   # or yarn install
npm start     # or yarn start
```

Access the app at `http://localhost:3000`.

## TODO / Future Work

*   Direct Bank API Integration
*   Budgeting Module
*   Spending Analysis Visualizations
*   Rule Management UI
*   Individual Transaction Editing
