import json
from typing import Any

from fastapi import BackgroundTasks, Request
from sqlalchemy.orm import Session

from app.core.database import execute, rows
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


def notify(
    db: Session,
    *,
    recipient_user_id: int | None,
    request_id: int | None = None,
    type: str,
    title: str,
    message: str,
    background_tasks: BackgroundTasks | None = None,
) -> None:
    if not recipient_user_id:
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
    if background_tasks:
        background_tasks.add_task(send_email, email, title, message)
    else:
        send_email(email, title, message)


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
