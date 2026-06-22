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
    redirect_slashes=False,
)

API_PREFIX = "/api/v1"
SRT_API_PREFIX = "/srt/api/v1"


@app.middleware("http")
async def rewrite_srt_api_prefix(request, call_next):
    path = request.scope.get("path", "")
    if path == "/srt/health":
        request.scope["path"] = "/health"
    elif path == SRT_API_PREFIX or path.startswith(f"{SRT_API_PREFIX}/"):
        request.scope["path"] = f"{API_PREFIX}{path[len(SRT_API_PREFIX):]}"
    return await call_next(request)


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


app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(admin.router, prefix=API_PREFIX)
app.include_router(users.router, prefix=API_PREFIX)
app.include_router(departments.router, prefix=API_PREFIX)
app.include_router(requests.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(notifications.router, prefix=API_PREFIX)
app.include_router(developer_workload.router, prefix=API_PREFIX)
app.include_router(daily_progress_reports.router, prefix=API_PREFIX)
