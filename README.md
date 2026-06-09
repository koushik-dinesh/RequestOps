# RequestOps

RequestOps is an enterprise workflow management platform developed for Violin Technologies to streamline software requirement requests, approvals, development tracking, testing, deployment, and closure processes.

The platform provides a centralized workflow for managing requests across departments while maintaining complete auditability, approval history, notifications, reporting, and ROI tracking.

## Features

- Software Request Management
- Multi-Level Approval Workflow
- Department & Role Management
- IT Review & Assignment
- Sprint & Development Tracking
- QA & UAT Management
- Deployment Tracking
- ROI & Business Impact Tracking
- Email Notifications
- Audit Logs & Activity Tracking
- ISMS Project Closure Reports
- Role-Based Access Control

## Technology Stack

### Frontend
- React.js
- Material UI
- Vite

### Backend
- FastAPI
- JWT Authentication

### Database
- MySQL

## Prerequisites

- Node.js 18+
- Python 3.11+
- MySQL 8+

## Installation

bash cp .env.example .env npm install npm run db:migrate npm run db:seed npm run dev 

## Database Setup

bash npm run db:migrate npm run db:seed 

The seed process initializes required master data including roles, departments, workflow configurations, and application settings.

## Core Workflow

Employee Request Submission

→ Department Head Review

→ IT Review

→ Resource Assignment

→ Requirements Approval

→ Sprint Planning

→ Development

→ QA Testing

→ User Acceptance Testing (UAT)

→ Deployment

→ Request Closure

→ ISMS Report Generation

## Key Scripts

- npm run dev
- npm run build
- npm run db:migrate
- npm run db:seed

## Security

- JWT Authentication
- Role-Based Access Control
- Audit Logging
- Attachment Security
- Email Verification & Notifications

## Reporting

- Request Lifecycle Tracking
- ROI & Business Impact Reporting
- Approval History
- ISMS Project Closure Reports
- Audit Trail Reporting

## Developed For

Violin Technologies

RequestOps Workflow Management Platform