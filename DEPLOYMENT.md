# RequestOps Deployment Guide

This guide explains how to deploy RequestOps on a client server.

RequestOps contains:

- React frontend built with Vite
- FastAPI backend
- MySQL database
- Email notifications
- File uploads
- Scheduled daily progress reports

## 1. Server Requirements

Install the following on the server:

- Node.js 18 or later
- Python 3.10 or later
- MySQL 8 or later
- Nginx
- Git
- `systemd` based Linux server, such as Ubuntu

Recommended server layout:

```bash
/opt/requestops
```

## 2. Copy Project To Server

Clone or copy the project to the server:

```bash
cd /opt
git clone <repository-url> requestops
cd /opt/requestops
```

If the project is delivered as a zip file:

```bash
cd /opt
unzip requestops.zip -d requestops
cd /opt/requestops
```

Do not include local files such as:

- `.env`
- `node_modules`
- `backend/.venv`
- `dist`
- local uploaded files
- local database dumps

## 3. Install Node Dependencies

From the project root:

```bash
npm install
```

## 4. Create Python Virtual Environment

```bash
cd /opt/requestops
python3 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements.txt
```

## 5. Create MySQL User And Database

Login to MySQL as an administrator:

```bash
mysql -u root -p
```

Create database and user:

```sql
CREATE DATABASE requestops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'requestops_user'@'%' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON requestops.* TO 'requestops_user'@'%';
FLUSH PRIVILEGES;
EXIT;
```

Use a strong password and store it only in the server `.env` file.

## 6. Create Environment File

Create `.env` in the project root:

```bash
cd /opt/requestops
nano .env
```

Example production `.env`:

```env
NODE_ENV=production
PORT=4000
CLIENT_ORIGIN=https://requestops.client-domain.com

DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=requestops_user
DB_PASSWORD=REPLACE_WITH_STRONG_PASSWORD
DB_NAME=requestops

JWT_ACCESS_SECRET=REPLACE_WITH_LONG_RANDOM_SECRET
JWT_REFRESH_SECRET=REPLACE_WITH_ANOTHER_LONG_RANDOM_SECRET
JWT_ACCESS_EXPIRES_IN=30m
JWT_REFRESH_EXPIRES_IN=7d

UPLOAD_DIR=backend/src/uploads
MAX_UPLOAD_MB=15

EMAIL_MODE=smtp
EMAIL_LOG_PATH=backend/email.log
SMTP_HOST=smtp.client-domain.com
SMTP_PORT=587
SMTP_USER=notifications@client-domain.com
SMTP_PASSWORD=REPLACE_WITH_SMTP_PASSWORD
SMTP_FROM=notifications@client-domain.com
SMTP_TLS=true

EMAIL_LOGO_PATH=backend/app/assets/violin-technologies-logo.png

VITE_API_BASE_URL=https://requestops.client-domain.com/api/v1
```

Important:

- Do not reuse local development secrets.
- Do not commit `.env`.
- `CLIENT_ORIGIN` must match the frontend domain.
- `VITE_API_BASE_URL` must point to the public API URL.
- If frontend and backend are served from the same domain through Nginx, use `/api/v1` routing as shown later in this guide.

## 7. Create Database Tables

Run the schema setup from the project root:

```bash
cd /opt/requestops
npm run db:migrate
```

This runs:

```bash
node backend/src/db/run-sql.js backend/src/db/schema.sql
```

The SQL runner reads database connection values from `.env`.

## 8. Seed Required Master Data

Run:

```bash
npm run db:seed
```

This runs:

```bash
node backend/src/db/run-sql.js backend/src/db/seeds.sql
```

Before client production deployment, confirm `backend/src/db/seeds.sql` contains only required production master data:

- roles
- departments
- required initial admin/user records if agreed with the client

Do not seed demo users, demo passwords, or demo requests in production.

## 9. Apply Additional SQL Migrations If Needed

If the database was created from the latest `schema.sql`, the report tables are already included.

If the database existed before the daily progress report feature was added, run:

```bash
node backend/src/db/run-sql.js backend/src/db/migrations/017_create_daily_progress_reports.sql
node backend/src/db/run-sql.js backend/src/db/migrations/018_allow_manual_daily_report_runs.sql
```

## 10. Build Frontend

Build the React application:

```bash
npm run build
```

The frontend build output is generated at:

```bash
dist/frontend
```

## 11. Test Backend Locally On Server

Start backend manually once:

```bash
npm run start
```

In another terminal, check health:

```bash
curl http://127.0.0.1:4000/health
```

Expected response:

```json
{"status":"ok","database":"ok"}
```

Stop the manual server after the test.

## 12. Create Systemd Service

Create a service file:

```bash
sudo nano /etc/systemd/system/requestops.service
```

Paste:

```ini
[Unit]
Description=RequestOps FastAPI Backend
After=network.target mysql.service

[Service]
Type=simple
WorkingDirectory=/opt/requestops
EnvironmentFile=/opt/requestops/.env
ExecStart=/opt/requestops/backend/.venv/bin/python -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 4000
Restart=always
RestartSec=5
User=www-data
Group=www-data

[Install]
WantedBy=multi-user.target
```

Set ownership:

```bash
sudo chown -R www-data:www-data /opt/requestops
```

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable requestops
sudo systemctl start requestops
sudo systemctl status requestops
```

View backend logs:

```bash
sudo journalctl -u requestops -f
```

## 13. Configure Nginx

Create Nginx config:

```bash
sudo nano /etc/nginx/sites-available/requestops
```

Example:

```nginx
server {
    listen 80;
    server_name requestops.client-domain.com;

    root /opt/requestops/dist/frontend;
    index index.html;

    client_max_body_size 20M;

    location /api/v1/ {
        proxy_pass http://127.0.0.1:4000/api/v1/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:4000/health;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Enable site:

```bash
sudo ln -s /etc/nginx/sites-available/requestops /etc/nginx/sites-enabled/requestops
sudo nginx -t
sudo systemctl reload nginx
```

## 14. Enable HTTPS

Use Certbot:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d requestops.client-domain.com
```

After HTTPS is enabled, update `.env`:

```env
CLIENT_ORIGIN=https://requestops.client-domain.com
VITE_API_BASE_URL=https://requestops.client-domain.com/api/v1
```

Then rebuild frontend and restart backend:

```bash
npm run build
sudo systemctl restart requestops
sudo systemctl reload nginx
```

## 15. File Upload Directory

Ensure upload directory exists and is writable:

```bash
mkdir -p /opt/requestops/backend/src/uploads
sudo chown -R www-data:www-data /opt/requestops/backend/src/uploads
```

If the client wants uploads stored outside the project folder, update `.env`:

```env
UPLOAD_DIR=/var/lib/requestops/uploads
```

Then create and permission that folder:

```bash
sudo mkdir -p /var/lib/requestops/uploads
sudo chown -R www-data:www-data /var/lib/requestops/uploads
```

## 16. Email Setup

For production, use SMTP:

```env
EMAIL_MODE=smtp
SMTP_HOST=smtp.client-domain.com
SMTP_PORT=587
SMTP_USER=notifications@client-domain.com
SMTP_PASSWORD=REPLACE_WITH_SMTP_PASSWORD
SMTP_FROM=notifications@client-domain.com
SMTP_TLS=true
```

Restart backend after changing email settings:

```bash
sudo systemctl restart requestops
```

## 17. Daily Progress Report Scheduler

The backend starts the Daily Progress Report scheduler automatically.

Default time:

```text
7:00 PM
```

Report configuration is stored in:

```text
daily_progress_report_config
```

Reports are stored in:

```text
daily_progress_reports
daily_progress_report_deliveries
```

System Admin can configure report time, recipients, stale threshold, and overdue threshold from the Daily Progress Reports page.

## 18. Production Verification Checklist

After deployment, verify:

```bash
curl https://requestops.client-domain.com/health
```

Then check:

- Login page loads.
- System Admin can log in.
- Departments and users appear correctly.
- Employee registration works.
- Request creation works.
- Email notifications are sent.
- File upload and preview work.
- Daily Progress Reports page loads.
- System Admin can generate a test daily report.
- Nginx logs show no API proxy errors.
- `sudo journalctl -u requestops -f` shows no backend errors.

## 19. Restart Commands

Restart backend:

```bash
sudo systemctl restart requestops
```

Reload Nginx:

```bash
sudo systemctl reload nginx
```

Check backend status:

```bash
sudo systemctl status requestops
```

Check logs:

```bash
sudo journalctl -u requestops -f
```

## 20. Updating The Application

When deploying a new version:

```bash
cd /opt/requestops
git pull
npm install
backend/.venv/bin/pip install -r backend/requirements.txt
npm run build
sudo systemctl restart requestops
sudo systemctl reload nginx
```

If a new SQL migration is included, run it before restarting:

```bash
node backend/src/db/run-sql.js backend/src/db/migrations/<migration-file>.sql
```

## 21. Backup Recommendation

Before production updates, back up MySQL:

```bash
mysqldump -u requestops_user -p requestops > requestops_backup_$(date +%F).sql
```

Back up uploads:

```bash
tar -czf requestops_uploads_$(date +%F).tar.gz /opt/requestops/backend/src/uploads
```

## 22. Important Production Notes

- Do not deploy demo seed data.
- Do not expose `.env`.
- Do not use default/demo passwords.
- Do not delete `roles`, `departments`, or real users after setup.
- Do not delete the `IT` department. Deactivate departments instead of hard deleting them.
- Keep database backups before every update.
- Keep SMTP credentials private.
- Use HTTPS in production.
