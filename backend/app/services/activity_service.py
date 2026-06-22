import json
from html import escape
from typing import Any

from fastapi import BackgroundTasks, Request
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal, execute, rows
from app.services.email_service import send_email


def _json(value: Any) -> str | None:
    return json.dumps(value, default=str) if value is not None else None


def audit(
    db: Session,
    *,
    actor_user_id: int | None,
    action: str,
    entity_type: str,
    entity_id: int | None = None,
    old_value: Any = None,
    new_value: Any = None,
    request: Request | None = None,
) -> None:
    execute(
        db,
        """
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
        VALUES (:actorUserId, :action, :entityType, :entityId, :oldValue, :newValue, :ipAddress, :userAgent)
        """,
        {
            "actorUserId": actor_user_id,
            "action": action,
            "entityType": entity_type,
            "entityId": entity_id,
            "oldValue": _json(old_value),
            "newValue": _json(new_value),
            "ipAddress": request.client.host if request and request.client else None,
            "userAgent": request.headers.get("user-agent") if request else None,
        },
    )


def _recipient_email(db: Session, user_id: int | None) -> str | None:
    if not user_id:
        return None
    result = rows(db, "SELECT email FROM users WHERE id = :id", {"id": user_id})
    return result[0]["email"] if result else None


def _request_email_context(db: Session, request_id: int | None) -> dict | None:
    if not request_id:
        return None
    result = rows(
        db,
        """
        SELECT r.id, r.request_number, r.title, r.priority, r.status,
               requester.full_name AS requester_name,
               d.name AS department_name,
               dh.full_name AS department_head_name,
               it.full_name AS it_head_name,
               pm.full_name AS project_manager_name,
               assignee.full_name AS current_assignee_name
        FROM requests r
        JOIN users requester ON requester.id = r.requester_user_id
        JOIN departments d ON d.id = r.requester_department_id
        LEFT JOIN users dh ON dh.id = r.department_head_user_id
        LEFT JOIN users it ON it.id = r.it_head_user_id
        LEFT JOIN users pm ON pm.id = r.project_manager_user_id
        LEFT JOIN users assignee ON assignee.id = r.current_assignee_user_id
        WHERE r.id = :requestId
        LIMIT 1
        """,
        {"requestId": request_id},
    )
    return result[0] if result else None


def _format_status(value: str | None) -> str:
    return str(value or "-").replace("_", " ").title()


def _default_request_email_text(*, title: str, message: str, request_row: dict | None) -> str:
    if not request_row:
        return message
    request_url = f"{settings.public_app_base_url}/requests/{request_row['id']}"
    return f"""{message}

Request Information
Request ID: {request_row.get('request_number') or '-'}
Request Title: {request_row.get('title') or '-'}
Status: {_format_status(request_row.get('status'))}
Priority: {_format_status(request_row.get('priority'))}
Requester: {request_row.get('requester_name') or '-'}
Department: {request_row.get('department_name') or '-'}
Department HOD: {request_row.get('department_head_name') or '-'}
IT HOD: {request_row.get('it_head_name') or '-'}
Project Manager: {request_row.get('project_manager_name') or '-'}
Pending With: {request_row.get('current_assignee_name') or '-'}

Open RequestOps: {request_url}
"""


def _default_request_email_html(*, title: str, message: str, request_row: dict | None) -> str | None:
    if not request_row:
        return None
    request_url = f"{settings.public_app_base_url}/requests/{request_row['id']}"
    details = [
        ("Request ID", request_row.get("request_number")),
        ("Request Title", request_row.get("title")),
        ("Status", _format_status(request_row.get("status"))),
        ("Priority", _format_status(request_row.get("priority"))),
        ("Requester", request_row.get("requester_name")),
        ("Department", request_row.get("department_name")),
        ("Department HOD", request_row.get("department_head_name")),
        ("IT HOD", request_row.get("it_head_name")),
        ("Project Manager", request_row.get("project_manager_name")),
        ("Pending With", request_row.get("current_assignee_name")),
    ]
    rows_html = "\n".join(
        f"""
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#64748b;font-size:13px;font-weight:700;width:34%;vertical-align:top;">{escape(label)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;color:#0f172a;font-size:13px;font-weight:600;vertical-align:top;">{escape(str(value or '-'))}</td>
        </tr>
        """
        for label, value in details
    )
    return f"""
    <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.65;">{escape(message)}</p>
    <div style="margin:18px 0 20px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <div style="padding:12px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;">
        <p style="margin:0;color:#0f172a;font-size:14px;font-weight:800;">Request Information</p>
      </div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
        {rows_html}
      </table>
    </div>
    <p style="margin:0;">
      <a href="{escape(request_url)}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:800;">Open RequestOps</a>
    </p>
    """


def _audit_email_event(
    *,
    actor_user_id: int | None,
    recipient_user_id: int | None,
    request_id: int | None,
    action: str,
    subject: str,
    error: str | None = None,
) -> None:
    db = SessionLocal()
    try:
        audit(
            db,
            actor_user_id=actor_user_id,
            action=action,
            entity_type="EMAIL",
            entity_id=request_id,
            new_value={
                "recipientUserId": recipient_user_id,
                "requestId": request_id,
                "subject": subject,
                **({"error": error} if error else {}),
            },
        )
        db.commit()
    finally:
        db.close()


def _send_email_with_audit(
    *,
    to_email: str | None,
    subject: str,
    body: str,
    html_body: str | None,
    actor_user_id: int | None,
    recipient_user_id: int | None,
    request_id: int | None,
) -> None:
    try:
        send_email(to_email, subject, body, html_body)
        _audit_email_event(
            actor_user_id=actor_user_id,
            recipient_user_id=recipient_user_id,
            request_id=request_id,
            action="EMAIL_DELIVERED",
            subject=subject,
        )
    except Exception as exc:
        _audit_email_event(
            actor_user_id=actor_user_id,
            recipient_user_id=recipient_user_id,
            request_id=request_id,
            action="EMAIL_DELIVERY_FAILED",
            subject=subject,
            error=str(exc),
        )


def notify(
    db: Session,
    *,
    recipient_user_id: int | None,
    request_id: int | None = None,
    type: str,
    title: str,
    message: str,
    background_tasks: BackgroundTasks | None = None,
    email_subject: str | None = None,
    email_body: str | None = None,
    email_html_body: str | None = None,
    email_actor_user_id: int | None = None,
    audit_email: bool = False,
    dedupe: bool = False,
) -> None:
    if not recipient_user_id:
        return
    if dedupe and request_id:
        existing = rows(
            db,
            """
            SELECT id
            FROM notifications
            WHERE recipient_user_id = :recipientUserId
              AND request_id = :requestId
              AND type = :type
            LIMIT 1
            """,
            {"recipientUserId": recipient_user_id, "requestId": request_id, "type": type},
        )
        if existing:
            return
    execute(
        db,
        """
        INSERT INTO notifications (recipient_user_id, request_id, type, title, message)
        VALUES (:recipientUserId, :requestId, :type, :title, :message)
        """,
        {
            "recipientUserId": recipient_user_id,
            "requestId": request_id,
            "type": type,
            "title": title,
            "message": message,
        },
    )
    email = _recipient_email(db, recipient_user_id)
    subject = email_subject or title
    request_email_context = _request_email_context(db, request_id)
    body = email_body or _default_request_email_text(title=title, message=message, request_row=request_email_context)
    html_body = email_html_body if email_html_body is not None else _default_request_email_html(title=title, message=message, request_row=request_email_context)
    def send() -> None:
        try:
            if audit_email:
                _send_email_with_audit(
                    to_email=email,
                    subject=subject,
                    body=body,
                    html_body=html_body,
                    actor_user_id=email_actor_user_id,
                    recipient_user_id=recipient_user_id,
                    request_id=request_id,
                )
                return
            send_email(email, subject, body, html_body)
        except Exception as exc:
            print(f"[RequestOps] Notification email failed for user {recipient_user_id}: {exc}")

    if background_tasks:
        background_tasks.add_task(send)
    else:
        send()


def notify_role(
    db: Session,
    role_code: str,
    *,
    request_id: int | None = None,
    type: str,
    title: str,
    message: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    recipients = rows(
        db,
        """
        SELECT u.id
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE r.code = :roleCode AND u.status = 'ACTIVE'
        """,
        {"roleCode": role_code},
    )
    for recipient in recipients:
        notify(
            db,
            recipient_user_id=recipient["id"],
            request_id=request_id,
            type=type,
            title=title,
            message=message,
            background_tasks=background_tasks,
        )
