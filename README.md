# RequestOps

RequestOps is an internal Violin software requirement and change request management system. It includes a React/Material UI frontend, Express API, JWT authentication, MySQL schema, role-aware dashboards, request workflow, comments, attachments, notifications, and audit logs.

## Prerequisites

- Node.js 18+
- MySQL 8+

## Setup

```bash
cp .env.example .env
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Frontend: `http://localhost:5173`

Backend health check: `http://localhost:4000/health`

## Demo Users

All seeded users use password `Password123!`.

- `admin@violin.local` - System Admin
- `finance.head@violin.local` - Department Head
- `it.head@violin.local` - IT Head
- `developer@violin.local` - Developer
- `qa@violin.local` - QA
- `uat@violin.local` - UAT Approver
- `john.smith@violin.local` - Employee

## Key Scripts

- `npm run dev` - run API and web app together.
- `npm run dev:api` - run Express API only.
- `npm run dev:web` - run Vite frontend only.
- `npm run db:migrate` - create the MySQL database and schema.
- `npm run db:seed` - seed roles, departments, demo users, sample requests, notifications, and timeline data.
- `npm run build` - build the frontend bundle.

## Demo Flow

1. Login as `john.smith@violin.local` and create a request.
2. Login as `finance.head@violin.local` and approve or request clarification.
3. Login as `it.head@violin.local`, complete IT review, and assign Developer/QA.
4. Login as `developer@violin.local`, start development, update progress, and complete development.
5. Login as `qa@violin.local` and submit test results.
6. Login as `uat@violin.local` and approve UAT to close the request.
7. Login as `admin@violin.local` to review registrations, users, departments, notifications, and full request visibility.
