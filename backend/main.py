from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import admin, auth, daily_progress_reports, dashboard, departments, developer_workload, notifications, requests, users
from app.core.config import settings
from app.core.database import engine
from app.middleware.error_handler import register_exception_handlers
from app.services.daily_progress_report_service import start_daily_progress_report_scheduler, stop_daily_progress_report_scheduler


app = FastAPI(
    title="RequestOps API",
    version="1.0.0",
    description="FastAPI backend for RequestOps internal software request management.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.client_origin],
    allow_credentials=True,
    allow_methods=["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

register_exception_handlers(app)


@app.on_event("startup")
async def startup_event():
    start_daily_progress_report_scheduler()


@app.on_event("shutdown")
async def shutdown_event():
    await stop_daily_progress_report_scheduler()


@app.get("/health")
def health():
    try:
        with engine.connect() as connection:
            connection.execute(text("SELECT 1"))
        return {"status": "ok", "database": "ok"}
    except Exception:
        from fastapi.responses import JSONResponse

        return JSONResponse(status_code=503, content={"status": "degraded", "database": "unavailable"})


app.include_router(auth.router, prefix="/api/v1")
app.include_router(admin.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(departments.router, prefix="/api/v1")
app.include_router(requests.router, prefix="/api/v1")
app.include_router(dashboard.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(developer_workload.router, prefix="/api/v1")
app.include_router(daily_progress_reports.router, prefix="/api/v1")
