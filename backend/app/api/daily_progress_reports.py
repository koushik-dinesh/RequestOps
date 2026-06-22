from datetime import date

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db, rows
from app.middleware.auth import require_roles
from app.schemas.payloads import DailyProgressReportConfigPayload
from app.services.daily_progress_report_service import (
    generate_daily_report,
    get_report,
    get_report_config,
    list_reports,
    resolve_report_recipients,
    send_report_email,
    update_report_config,
)
from app.utils.http import ApiError, ok
from app.utils.routing import collection_route


router = APIRouter(prefix="/daily-progress-reports", tags=["daily-progress-reports"])


def _require_system_admin(user: dict = Depends(require_roles())) -> dict:
    if user.get("role_code") != "SYSTEM_ADMIN":
        raise ApiError(403, "Only System Admin can access daily progress reports.")
    return user


@collection_route(router, "get")
def reports(
    dateFrom: str = "",
    dateTo: str = "",
    _user: dict = Depends(_require_system_admin),
    db: Session = Depends(get_db),
):
    return ok(list_reports(db, dateFrom, dateTo))


@router.get("/config")
def report_config(
    _user: dict = Depends(_require_system_admin),
    db: Session = Depends(get_db),
):
    return ok({
        "config": get_report_config(db),
        "defaultRecipients": resolve_report_recipients(db),
    })


@router.put("/config")
def save_report_config(
    payload: DailyProgressReportConfigPayload,
    user: dict = Depends(_require_system_admin),
    db: Session = Depends(get_db),
):
    return ok(update_report_config(db, payload.model_dump(), user["id"]))


@router.get("/recipient-options")
def recipient_options(
    _user: dict = Depends(_require_system_admin),
    db: Session = Depends(get_db),
):
    return ok(rows(
        db,
        """
        SELECT u.id, u.full_name, u.email, r.code AS role_code, r.name AS role_name
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.status = 'ACTIVE'
          AND r.code IN ('IT_HEAD', 'PROJECT_MANAGER', 'SYSTEM_ADMIN')
          AND u.email IS NOT NULL
        ORDER BY FIELD(r.code, 'IT_HEAD', 'PROJECT_MANAGER', 'SYSTEM_ADMIN'), u.full_name
        """,
    ))


@router.post("/generate")
def generate_report_now(
    user: dict = Depends(_require_system_admin),
    db: Session = Depends(get_db),
):
    report = generate_daily_report(db, date.today(), source="MANUAL", actor_user_id=user["id"], send_email_now=True)
    return ok(report)


@router.get("/{report_id}")
def report_detail(
    report_id: int,
    _user: dict = Depends(_require_system_admin),
    db: Session = Depends(get_db),
):
    report = get_report(db, report_id)
    if not report:
        raise ApiError(404, "Daily progress report not found.")
    return ok(report)


@router.post("/{report_id}/resend")
def resend_report(
    report_id: int,
    _user: dict = Depends(_require_system_admin),
    db: Session = Depends(get_db),
):
    report = get_report(db, report_id)
    if not report:
        raise ApiError(404, "Daily progress report not found.")
    return ok(send_report_email(db, report))
