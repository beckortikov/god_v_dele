# План–Факт: Supabase Setup Guide

## 📋 Overview

This document provides instructions for setting up the Supabase database for the План–Факт financial platform.

### Supabase Credentials
- **URL**: https://eomplkylimclahqhnqsm.supabase.co
- **Publishable Key**: sb_publishable_NlJe991Ux_H-HOYCmuKNxw_XIzAXzJ9

---

## 🗄️ Database Schema

The application uses the following tables:

### 1. **programs** - Training Programs
```typescript
- id: UUID (Primary Key)
- name: TEXT (unique)
- description: TEXT
- price_per_month: NUMERIC
- duration_months: INTEGER (default: 12)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### 2. **participants** - Participants
```typescript
- id: UUID (Primary Key)
- name: TEXT
- email: TEXT
- phone: TEXT
- program_id: UUID (Foreign Key → programs)
- start_date: DATE
- status: TEXT (active | completed | archived)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### 3. **monthly_payments** - Monthly Payment Records
```typescript
- id: UUID (Primary Key)
- participant_id: UUID (Foreign Key → participants)
- program_id: UUID (Foreign Key → programs)
- payment_month: TEXT (e.g., 'Январь')
- month_number: INTEGER (1-12)
- year: INTEGER
- plan_amount: NUMERIC (planned payment)
- fact_amount: NUMERIC (actual payment)
- status: TEXT (paid | partial | overdue | pending)
- due_date: DATE
- paid_date: DATE
- notes: TEXT
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### 4. **offline_events** - Offline Events
```typescript
- id: UUID (Primary Key)
- name: TEXT
- description: TEXT
- event_date: DATE
- location: TEXT
- budget: NUMERIC (planned budget)
- actual_cost: NUMERIC (actual cost)
- participants_count: INTEGER
- revenue: NUMERIC
- status: TEXT (planned | completed | cancelled)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### 5. **expenses** - Expenses
```typescript
- id: UUID (Primary Key)
- name: TEXT
- amount: NUMERIC
- category: TEXT (Marketing | Operations | Personnel)
- event_id: UUID (Foreign Key → offline_events, nullable)
- expense_date: DATE
- description: TEXT
- status: TEXT (pending | approved | rejected)
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

### 6. **monthly_forecasts** - Monthly Forecasts
```typescript
- id: UUID (Primary Key)
- month_number: INTEGER (1-12)
- year: INTEGER
- planned_income: NUMERIC
- planned_expenses: NUMERIC
- optimistic_income: NUMERIC
- pessimistic_income: NUMERIC
- confidence_level: NUMERIC (0-1)
- notes: TEXT
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

---

## 🚀 Setup Instructions

### Step 1: Navigate to Supabase Dashboard
1. Go to https://app.supabase.com
2. Select your project (or create a new one)
3. Click on **SQL Editor** in the left sidebar

### Step 2: Create Tables
1. Click **New Query**
2. Copy the entire SQL schema from `/scripts/database-schema.sql`
3. Paste into the query editor
4. Click **Run** to execute the schema

### Step 3: Enable Row Level Security (RLS)
For each table, enable RLS in the Authentication section:

```bash
# In Supabase Dashboard:
1. Go to Authentication → Policies
2. For each table, enable RLS
3. Create policies as needed (or use public access for demo)
```

### Step 4: Test Connection
Run this query to verify the setup:
```sql
SELECT * FROM programs;
```

---

## 🔐 Environment Variables

Add to your `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=https://eomplkylimclahqhnqsm.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=sb_publishable_NlJe991Ux_H-HOYCmuKNxw_XIzAXzJ9
```

These are already configured in `/lib/supabase.ts`

---

## 📊 Data Structure Summary

### Year-Long Program with Monthly Payments
- Each participant enrolls in a 12-month program
- Monthly payments are recorded in `monthly_payments` table
- Status tracked for each month: paid, partial, or overdue
- Plan vs. Fact comparison enables accurate forecasting

### Financial Tracking
1. **Participants**: Track who is enrolled and their status
2. **Monthly Payments**: Record planned vs actual revenue by month
3. **Expenses**: Track all business expenses by category
4. **Forecasts**: Plan future income/expenses with confidence levels
5. **Events**: Manage offline events and ROI

### Key Features
✅ Monthly plan-fact analysis per participant
✅ Overdue payment tracking
✅ Multi-program support
✅ Event ROI calculation
✅ Financial forecasting with scenarios
✅ Expense categorization

---

## 🔗 API Endpoints (to be implemented)

- `GET /api/participants` - List all participants
- `POST /api/participants` - Create new participant
- `GET /api/payments/:participantId` - Get payment history
- `PUT /api/payments/:paymentId` - Update payment status
- `GET /api/forecast/:month` - Get monthly forecast
- `GET /api/analytics/plan-fact` - Plan-fact analysis

---

## 📝 Notes

- The schema includes sample programs on first run
- All timestamps are automatically managed by the database
- Foreign keys ensure data integrity
- Indexes optimize query performance for filtering and sorting

For questions or support, contact the development team.
