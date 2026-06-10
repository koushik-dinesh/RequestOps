import asyncio
import json
from datetime import date, datetime, time
from html import escape
from typing import Any

from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, execute, one, rows
from app.services.email_service import send_email


ACTIVE_REPORT_STATUSES = [
    "ASSIGNED",
    "IT_REVIEW_PENDING",
    "ASSIGNMENT_PENDING",
    "PM_ASSIGNED",
    "SCOPE_REVIEW",
    "USER_STORY_REVIEW",
    "REQUIREMENTS_DEPARTMENT_REVIEW",
    "REQUIREMENTS_PM_REVIEW",
    "REQUIREMENTS_IT_REVIEW",
    "REQUIREMENTS_CLARIFICATION_REQUESTED",
    "REQUIREMENTS_APPROVED",
    "DEVELOPER_ASSIGNED",
    "SPRINT_PLANNING",
    "SPRINT_CREATED",
    "SPRINT_ACTIVE",
    "IN_DEVELOPMENT",
    "DEVELOPMENT_COMPLETE",
    "QA_PENDING",
    "QA_FAILED",
    "QA_PASSED",
    "IN_TESTING",
    "TEST_FAILED",
    "UAT_PENDING",
    "UAT_FAILED",
    "DEPLOYMENT_PENDING",
    "DEPLOYED",
    "READY_FOR_COMPLETION",
]

PENDING_ACTIONS = {
    "IT_REVIEW_PENDING": ("IT Head", "Waiting for internal feasibility review."),
    "ASSIGNMENT_PENDING": ("IT Head", "Waiting for project manager assignment."),
    "PM_ASSIGNED": ("Project Manager", "Waiting for analysis and scope preparation."),
    "SCOPE_REVIEW": ("IT Head", "Waiting for scope review."),
    "USER_STORY_REVIEW": ("Department HOD", "Waiting for user story review."),
    "REQUIREMENTS_DEPARTMENT_REVIEW": ("Department HOD", "Waiting for requirements approval."),
    "REQUIREMENTS_PM_REVIEW": ("Project Manager", "Waiting for project manager requirements review."),
    "REQUIREMENTS_IT_REVIEW": ("IT Head", "Waiting for IT requirements review."),
    "REQUIREMENTS_CLARIFICATION_REQUESTED": ("Project Manager", "Waiting for clarification response."),
    "REQUIREMENTS_APPROVED": ("Project Manager", "Waiting for sprint planning."),
    "DEVELOPER_ASSIGNED": ("Project Manager", "Waiting for sprint planning."),
    "SPRINT_PLANNING": ("Project Manager", "Waiting for sprint creation."),
    "SPRINT_CREATED": ("Project Manager", "Waiting for sprint start."),
    "SPRINT_ACTIVE": ("Assigned Developer", "Sprint work is active."),
    "IN_DEVELOPMENT": ("Assigned Developer", "Development work is in progress."),
    "DEVELOPMENT_COMPLETE": ("Project Manager", "Waiting to route completed work for QA review."),
    "QA_PENDING": ("QA", "Waiting for QA validation."),
    "QA_FAILED": ("Assigned Developer", "Waiting for QA fixes."),
    "QA_PASSED": ("Project Manager", "Waiting to send for requester testing."),
    "IN_TESTING": ("QA", "Review and validation in progress."),
    "TEST_FAILED": ("Assigned Developer", "Waiting for test fixes."),
    "UAT_PENDING": ("Requester", "Waiting for requester testing approval."),
    "UAT_FAILED": ("Assigned Developer", "Waiting for UAT fixes."),
    "DEPLOYMENT_PENDING": ("Project Manager", "Waiting for deployment."),
    "DEPLOYED": ("Requester", "Waiting for completion confirmation."),
    "READY_FOR_COMPLETION": ("Requester", "Waiting for closure confirmation."),
}

_scheduler_task: asyncio.Task | None = None
_scheduler_stop_event: asyncio.Event | None = None


def _json_default(value: Any) -> str:
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    return str(value)


def _json_dumps(value: Any) -> str:
    return json.dumps(value, default=_json_default)


def _json_loads(value: Any, fallback: Any) -> Any:
    if value is None:
        return fallback
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return fallback


def _time_to_string(value: Any) -> str:
    if isinstance(value, time):
        return value.strftime("%H:%M")
    return str(value or "19:00:00")[:5]


def _date_string(value: Any) -> str:
    if isinstance(value, (datetime, date)):
        return value.strftime("%d %b %Y")
    if not value:
        return "-"
    try:
        return datetime.fromisoformat(str(value)).strftime("%d %b %Y")
    except ValueError:
        return str(value)


def _datetime_string(value: Any) -> str:
    if isinstance(value, datetime):
        return value.strftime("%d %b %Y, %I:%M %p")
    if isinstance(value, date):
        return value.strftime("%d %b %Y")
    if not value:
        return "-"
    try:
        return datetime.fromisoformat(str(value)).strftime("%d %b %Y, %I:%M %p")
    except ValueError:
        return str(value)


def _format_status(status: str | None) -> str:
    return (status or "UNKNOWN").replace("_", " ").title()


def _format_priority(priority: str | None) -> str:
    return (priority or "MEDIUM").replace("_", " ").title()


def _activity_item(kind: str, label: str, actor: str | None, occurred_at: Any, detail: str | None = None) -> dict:
    return {
        "kind": kind,
        "label": label,
        "actor": actor or "System",
        "occurredAt": _datetime_string(occurred_at),
        "detail": detail or "",
    }


def ensure_default_config(db: Session) -> dict:
    config = one(db, "SELECT * FROM daily_progress_report_config WHERE id = 1")
    if config:
        return config
    execute(
        db,
        """
        INSERT INTO daily_progress_report_config
          (id, is_enabled, report_time, recipient_user_ids, stale_threshold_days, overdue_threshold_days)
        VALUES (1, TRUE, '19:00:00', NULL, 3, 7)
        """,
    )
    db.commit()
    return one(db, "SELECT * FROM daily_progress_report_config WHERE id = 1") or {}


def get_report_config(db: Session) -> dict:
    config = ensure_default_config(db)
    return {
        "isEnabled": bool(config.get("is_enabled")),
        "reportTime": _time_to_string(config.get("report_time")),
        "recipientUserIds": _json_loads(config.get("recipient_user_ids"), []),
        "staleThresholdDays": int(config.get("stale_threshold_days") or 3),
        "overdueThresholdDays": int(config.get("overdue_threshold_days") or 7),
        "updatedAt": _datetime_string(config.get("updated_at")),
    }


def update_report_config(db: Session, payload: dict, actor_user_id: int) -> dict:
    recipient_ids = payload.get("recipientUserIds") or []
    execute(
        db,
        """
        INSERT INTO daily_progress_report_config
          (id, is_enabled, report_time, recipient_user_ids, stale_threshold_days, overdue_threshold_days, updated_by_user_id)
        VALUES
          (1, :isEnabled, :reportTime, :recipientUserIds, :staleThresholdDays, :overdueThresholdDays, :actorUserId)
        ON DUPLICATE KEY UPDATE
          is_enabled = VALUES(is_enabled),
          report_time = VALUES(report_time),
          recipient_user_ids = VALUES(recipient_user_ids),
          stale_threshold_days = VALUES(stale_threshold_days),
          overdue_threshold_days = VALUES(overdue_threshold_days),
          updated_by_user_id = VALUES(updated_by_user_id)
        """,
        {
            "isEnabled": bool(payload.get("isEnabled", True)),
            "reportTime": payload.get("reportTime") or "19:00",
            "recipientUserIds": _json_dumps([int(value) for value in recipient_ids]) if recipient_ids else None,
            "staleThresholdDays": int(payload.get("staleThresholdDays") or 3),
            "overdueThresholdDays": int(payload.get("overdueThresholdDays") or 7),
            "actorUserId": actor_user_id,
        },
    )
    db.commit()
    return get_report_config(db)


def resolve_report_recipients(db: Session, config: dict | None = None) -> list[dict]:
    config = config or ensure_default_config(db)
    recipient_ids = _json_loads(config.get("recipient_user_ids"), [])
    if recipient_ids:
        placeholders = ", ".join(f":id{index}" for index, _ in enumerate(recipient_ids))
        params = {f"id{index}": int(value) for index, value in enumerate(recipient_ids)}
        return rows(
            db,
            f"""
            SELECT u.id, u.full_name, u.email, r.code AS role_code
            FROM users u
            JOIN roles r ON r.id = u.role_id
            WHERE u.status = 'ACTIVE'
              AND u.email IS NOT NULL
              AND u.id IN ({placeholders})
            ORDER BY FIELD(r.code, 'IT_HEAD', 'PROJECT_MANAGER', 'SYSTEM_ADMIN'), u.full_name
            """,
            params,
        )
    return rows(
        db,
        """
        SELECT u.id, u.full_name, u.email, r.code AS role_code
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.status = 'ACTIVE'
          AND r.code IN ('IT_HEAD', 'PROJECT_MANAGER')
          AND u.email IS NOT NULL
        ORDER BY FIELD(r.code, 'IT_HEAD', 'PROJECT_MANAGER'), u.full_name
        """,
    )


def _active_requests(db: Session) -> list[dict]:
    status_params = {f"status{index}": status for index, status in enumerate(ACTIVE_REPORT_STATUSES)}
    status_sql = ", ".join(f":status{index}" for index, _ in enumerate(ACTIVE_REPORT_STATUSES))
    return rows(
        db,
        f"""
        SELECT
          r.id,
          r.request_number,
          r.title,
          r.priority,
          r.status,
          r.created_at,
          r.updated_at,
          d.name AS department_name,
          COALESCE(assignment_dev.full_name, sprint_dev.full_name) AS assigned_developer_name,
          pm.full_name AS project_manager_name,
          qa.full_name AS qa_name,
          assignee_user.full_name AS current_assignee_name,
          status_marker.last_status_at,
          open_sprint.next_sprint_end_date,
          open_task.next_task_due_date,
          COALESCE(blocked.blocked_count, 0) AS blocked_count
        FROM requests r
        LEFT JOIN departments d ON d.id = r.requester_department_id
        LEFT JOIN users pm ON pm.id = r.project_manager_user_id
        LEFT JOIN users assignee_user ON assignee_user.id = r.current_assignee_user_id
        LEFT JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE
        LEFT JOIN users assignment_dev ON assignment_dev.id = a.developer_user_id
        LEFT JOIN users qa ON qa.id = a.qa_user_id
        LEFT JOIN (
          SELECT s.request_id, MIN(s.end_date) AS next_sprint_end_date, MIN(s.assigned_developer_user_id) AS assigned_developer_user_id
          FROM sprints s
          WHERE s.status NOT IN ('COMPLETED', 'CANCELLED')
          GROUP BY s.request_id
        ) open_sprint ON open_sprint.request_id = r.id
        LEFT JOIN users sprint_dev ON sprint_dev.id = open_sprint.assigned_developer_user_id
        LEFT JOIN (
          SELECT s.request_id, MIN(t.due_date) AS next_task_due_date
          FROM sprint_tasks t
          JOIN sprints s ON s.id = t.sprint_id
          WHERE t.status NOT IN ('DONE', 'CANCELLED') AND t.due_date IS NOT NULL
          GROUP BY s.request_id
        ) open_task ON open_task.request_id = r.id
        LEFT JOIN (
          SELECT request_id, to_status, MAX(changed_at) AS last_status_at
          FROM request_status_history
          GROUP BY request_id, to_status
        ) status_marker ON status_marker.request_id = r.id AND status_marker.to_status = r.status
        LEFT JOIN (
          SELECT s.request_id, COUNT(*) AS blocked_count
          FROM sprint_tasks t
          JOIN sprints s ON s.id = t.sprint_id
          WHERE t.status = 'BLOCKED'
          GROUP BY s.request_id
        ) blocked ON blocked.request_id = r.id
        WHERE r.status IN ({status_sql})
        ORDER BY FIELD(r.priority, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'), r.updated_at ASC
        """,
        status_params,
    )


def _today_activity(db: Session, request_id: int, report_date: date) -> dict:
    params = {"requestId": request_id, "reportDate": report_date.isoformat()}
    status_changes = rows(
        db,
        """
        SELECT h.from_status, h.to_status, h.comment, h.changed_at, u.full_name AS actor_name
        FROM request_status_history h
        JOIN users u ON u.id = h.changed_by_user_id
        WHERE h.request_id = :requestId AND DATE(h.changed_at) = :reportDate
        ORDER BY h.changed_at
        """,
        params,
    )
    comments = rows(
        db,
        """
        SELECT c.comment_type, c.comment_text, c.created_at, u.full_name AS actor_name
        FROM request_comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.request_id = :requestId AND DATE(c.created_at) = :reportDate
        ORDER BY c.created_at
        """,
        params,
    )
    assignments = rows(
        db,
        """
        SELECT a.assigned_at, a.qa_assigned_at, a.notes, dev.full_name AS developer_name, qa.full_name AS qa_name, assigner.full_name AS actor_name
        FROM assignments a
        LEFT JOIN users dev ON dev.id = a.developer_user_id
        LEFT JOIN users qa ON qa.id = a.qa_user_id
        LEFT JOIN users assigner ON assigner.id = a.assigned_by_user_id
        WHERE a.request_id = :requestId
          AND (DATE(a.assigned_at) = :reportDate OR DATE(a.qa_assigned_at) = :reportDate)
        ORDER BY COALESCE(a.qa_assigned_at, a.assigned_at)
        """,
        params,
    )
    development_updates = rows(
        db,
        """
        SELECT du.progress_percentage, du.update_notes, du.created_at, u.full_name AS actor_name
        FROM development_updates du
        JOIN users u ON u.id = du.developer_user_id
        WHERE du.request_id = :requestId AND DATE(du.created_at) = :reportDate
        ORDER BY du.created_at
        """,
        params,
    )
    qa_updates = rows(
        db,
        """
        SELECT tr.result, tr.test_summary, tr.defects_found, tr.tested_at, u.full_name AS actor_name
        FROM test_results tr
        JOIN users u ON u.id = tr.qa_user_id
        WHERE tr.request_id = :requestId AND DATE(tr.tested_at) = :reportDate
        ORDER BY tr.tested_at
        """,
        params,
    )
    uat_updates = rows(
        db,
        """
        SELECT ua.decision, ua.comments, ua.decided_at, u.full_name AS actor_name
        FROM uat_approvals ua
        JOIN users u ON u.id = ua.uat_approver_user_id
        WHERE ua.request_id = :requestId AND DATE(ua.decided_at) = :reportDate
        ORDER BY ua.decided_at
        """,
        params,
    )
    sprint_updates = rows(
        db,
        """
        SELECT th.from_status, th.to_status, th.comment, th.changed_at, u.full_name AS actor_name, t.title AS task_title
        FROM sprint_task_status_history th
        JOIN sprint_tasks t ON t.id = th.task_id
        JOIN sprints s ON s.id = t.sprint_id
        JOIN users u ON u.id = th.changed_by_user_id
        WHERE s.request_id = :requestId AND DATE(th.changed_at) = :reportDate
        ORDER BY th.changed_at
        """,
        params,
    )
    audit_logs = rows(
        db,
        """
        SELECT al.action, al.created_at, u.full_name AS actor_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        WHERE al.entity_type = 'REQUEST'
          AND al.entity_id = :requestId
          AND DATE(al.created_at) = :reportDate
        ORDER BY al.created_at
        """,
        params,
    )
    items = []
    for item in status_changes:
        items.append(_activity_item("Status", f"{_format_status(item.get('from_status'))} -> {_format_status(item.get('to_status'))}", item.get("actor_name"), item.get("changed_at"), item.get("comment")))
    for item in comments:
        items.append(_activity_item("Comment", _format_status(item.get("comment_type")), item.get("actor_name"), item.get("created_at"), item.get("comment_text")))
    for item in assignments:
        target = ", ".join(value for value in [item.get("developer_name"), item.get("qa_name")] if value)
        items.append(_activity_item("Assignment", f"Assigned {target or 'delivery owner'}", item.get("actor_name"), item.get("qa_assigned_at") or item.get("assigned_at"), item.get("notes")))
    for item in development_updates:
        items.append(_activity_item("Development", f"Progress updated to {item.get('progress_percentage')}%", item.get("actor_name"), item.get("created_at"), item.get("update_notes")))
    for item in qa_updates:
        items.append(_activity_item("QA", f"QA result: {_format_status(item.get('result'))}", item.get("actor_name"), item.get("tested_at"), item.get("defects_found") or item.get("test_summary")))
    for item in uat_updates:
        items.append(_activity_item("UAT", f"UAT {_format_status(item.get('decision'))}", item.get("actor_name"), item.get("decided_at"), item.get("comments")))
    for item in sprint_updates:
        items.append(_activity_item("Sprint Task", f"{item.get('task_title')}: {_format_status(item.get('from_status'))} -> {_format_status(item.get('to_status'))}", item.get("actor_name"), item.get("changed_at"), item.get("comment")))
    for item in audit_logs:
        items.append(_activity_item("Audit", _format_status(item.get("action")), item.get("actor_name"), item.get("created_at")))
    return {
        "items": items,
        "counts": {
            "statusChanges": len(status_changes),
            "comments": len(comments),
            "assignments": len(assignments),
            "developmentUpdates": len(development_updates),
            "qaUpdates": len(qa_updates),
            "uatUpdates": len(uat_updates),
            "sprintUpdates": len(sprint_updates),
            "auditLogs": len(audit_logs),
            "total": len(items),
        },
    }


def _pending_action(row: dict) -> dict:
    owner_type, bottleneck = PENDING_ACTIONS.get(row.get("status"), ("Current Assignee", "Waiting for the next workflow action."))
    next_person = row.get("current_assignee_name")
    if not next_person and owner_type == "Project Manager":
        next_person = row.get("project_manager_name")
    if not next_person and owner_type == "Assigned Developer":
        next_person = row.get("assigned_developer_name")
    if not next_person and owner_type == "QA":
        next_person = row.get("qa_name")
    return {
        "ownerType": owner_type,
        "nextResponsiblePerson": next_person or owner_type,
        "currentBottleneck": bottleneck,
    }


def _is_before_report_date(value: Any, report_date: date) -> bool:
    if not value:
        return False
    if isinstance(value, datetime):
        return value.date() < report_date
    if isinstance(value, date):
        return value < report_date
    try:
        return datetime.fromisoformat(str(value)).date() < report_date
    except ValueError:
        return False


def _days_since(value: Any, report_date: date) -> int:
    if isinstance(value, datetime):
        value_date = value.date()
    elif isinstance(value, date):
        value_date = value
    elif value:
        try:
            value_date = datetime.fromisoformat(str(value)).date()
        except ValueError:
            return 0
    else:
        return 0
    return max((report_date - value_date).days, 0)


def _request_highlights(row: dict, activity_count: int, report_date: date, stale_threshold: int, overdue_threshold: int) -> list[str]:
    highlights = []
    if activity_count == 0:
        highlights.append("No Activity Today")
    status_age = _days_since(row.get("last_status_at") or row.get("created_at"), report_date)
    if status_age > stale_threshold:
        highlights.append("Stale Request")
    request_age = _days_since(row.get("created_at"), report_date)
    if (
        _is_before_report_date(row.get("next_sprint_end_date"), report_date)
        or _is_before_report_date(row.get("next_task_due_date"), report_date)
        or request_age > overdue_threshold
    ):
        highlights.append("Overdue Request")
    if row.get("priority") in ("HIGH", "CRITICAL"):
        highlights.append("High Priority")
    if int(row.get("blocked_count") or 0) > 0 or row.get("status") in {
        "DEPARTMENT_APPROVAL_PENDING",
        "IT_REVIEW_PENDING",
        "ASSIGNMENT_PENDING",
        "REQUIREMENTS_DEPARTMENT_REVIEW",
        "REQUIREMENTS_IT_REVIEW",
        "REQUIREMENTS_CLARIFICATION_REQUESTED",
        "QA_PENDING",
        "UAT_PENDING",
        "QA_FAILED",
        "UAT_FAILED",
        "TEST_FAILED",
    }:
        highlights.append("Blocked / Waiting")
    return highlights


def build_report_payload(db: Session, report_date: date, config: dict | None = None) -> dict:
    config = config or ensure_default_config(db)
    stale_threshold = int(config.get("stale_threshold_days") or 3)
    overdue_threshold = int(config.get("overdue_threshold_days") or 7)
    request_rows = _active_requests(db)
    report_requests = []
    for row in request_rows:
        activity = _today_activity(db, int(row["id"]), report_date)
        highlights = _request_highlights(row, activity["counts"]["total"], report_date, stale_threshold, overdue_threshold)
        report_requests.append({
            "id": row["id"],
            "requestId": row.get("request_number"),
            "title": row.get("title"),
            "department": row.get("department_name") or "Not assigned",
            "assignedDeveloper": row.get("assigned_developer_name") or "Not assigned",
            "projectManager": row.get("project_manager_name") or "Not assigned",
            "priority": row.get("priority"),
            "priorityLabel": _format_priority(row.get("priority")),
            "status": row.get("status"),
            "statusLabel": _format_status(row.get("status")),
            "createdDate": _date_string(row.get("created_at")),
            "lastUpdatedDate": _datetime_string(row.get("updated_at")),
            "todayActivity": activity,
            "pendingAction": _pending_action(row),
            "highlights": highlights,
        })
    summary = {
        "totalActiveRequests": len(report_requests),
        "requestsUpdatedToday": sum(1 for item in report_requests if item["todayActivity"]["counts"]["total"] > 0),
        "requestsWithNoActivityToday": sum(1 for item in report_requests if "No Activity Today" in item["highlights"]),
        "requestsPendingAction": sum(1 for item in report_requests if item["pendingAction"]["currentBottleneck"]),
        "highPriorityRequests": sum(1 for item in report_requests if item["priority"] in ("HIGH", "CRITICAL")),
        "overdueRequests": sum(1 for item in report_requests if "Overdue Request" in item["highlights"]),
    }
    risks = []
    for risk_label in ["Overdue Request", "Stale Request", "No Activity Today", "Blocked / Waiting", "High Priority"]:
        matching = [request for request in report_requests if risk_label in request["highlights"]]
        if matching:
            risks.append({
                "label": risk_label,
                "count": len(matching),
                "requests": [request["requestId"] for request in matching[:8]],
            })
    return {
        "reportDate": report_date.isoformat(),
        "generatedAt": datetime.now().isoformat(),
        "summary": summary,
        "requests": report_requests,
        "keyRisks": risks,
    }


def render_report_html(payload: dict) -> str:
    summary = payload["summary"]
    cards = [
        ("Total Active Requests", summary["totalActiveRequests"]),
        ("Updated Today", summary["requestsUpdatedToday"]),
        ("No Activity Today", summary["requestsWithNoActivityToday"]),
        ("Pending Action", summary["requestsPendingAction"]),
        ("High Priority", summary["highPriorityRequests"]),
        ("Overdue", summary["overdueRequests"]),
    ]
    card_cells = [
        f"""
        <td style="width:33.33%;padding:6px;">
          <div style="border:1px solid #dbe4f0;border-radius:14px;padding:14px;background:#f8fafc;">
            <div style="font-size:11px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:.5px;">{escape(label)}</div>
            <div style="margin-top:8px;font-size:24px;line-height:1;font-weight:900;color:#0f172a;">{value}</div>
          </div>
        </td>
        """
        for label, value in cards
    ]
    rows_html = ""
    for request in payload["requests"]:
        activity_items = request["todayActivity"]["items"][:4]
        activity_html = "<br />".join(
            f"<strong>{escape(item['kind'])}</strong>: {escape(item['label'])} <span style=\"color:#64748b;\">({escape(item['actor'])})</span>"
            for item in activity_items
        ) or '<span style="color:#b45309;font-weight:800;">No activity recorded today</span>'
        if request["todayActivity"]["counts"]["total"] > 4:
            activity_html += f"<br /><span style=\"color:#64748b;\">+{request['todayActivity']['counts']['total'] - 4} more activity item(s)</span>"
        highlight_html = " ".join(
            f'<span style="display:inline-block;margin:2px 4px 2px 0;padding:4px 8px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:800;">{escape(label)}</span>'
            for label in request["highlights"]
        )
        rows_html += f"""
        <tr>
          <td style="padding:14px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
            <div style="font-weight:900;color:#0f172a;">{escape(request['requestId'] or '-')}</div>
            <div style="margin-top:3px;color:#334155;">{escape(request['title'] or '-')}</div>
            <div style="margin-top:5px;color:#64748b;font-size:12px;">{escape(request['department'])}</div>
          </td>
          <td style="padding:14px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
            <div style="font-weight:800;color:#0f172a;">{escape(request['statusLabel'])}</div>
            <div style="margin-top:5px;color:#64748b;font-size:12px;">Priority: {escape(request['priorityLabel'])}</div>
            <div style="margin-top:5px;color:#64748b;font-size:12px;">Updated: {escape(request['lastUpdatedDate'])}</div>
          </td>
          <td style="padding:14px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
            <div style="font-size:12px;color:#334155;">{activity_html}</div>
          </td>
          <td style="padding:14px 12px;border-bottom:1px solid #e2e8f0;vertical-align:top;">
            <div style="font-weight:800;color:#0f172a;">{escape(request['pendingAction']['nextResponsiblePerson'])}</div>
            <div style="margin-top:5px;color:#64748b;font-size:12px;">{escape(request['pendingAction']['currentBottleneck'])}</div>
            <div style="margin-top:8px;">{highlight_html}</div>
          </td>
        </tr>
        """
    risks_html = "".join(
        f"""
        <li style="margin:0 0 8px;color:#334155;">
          <strong>{escape(risk['label'])}</strong>: {risk['count']} request(s)
          <span style="color:#64748b;">{escape(', '.join(risk['requests']))}</span>
        </li>
        """
        for risk in payload["keyRisks"]
    ) or '<li style="color:#16a34a;font-weight:800;">No major risks identified for active requests.</li>'
    return f"""
    <div style="font-family:Arial,Helvetica,sans-serif;">
      <p style="margin:0 0 16px;color:#334155;font-size:14px;line-height:1.6;">
        Daily consolidated progress report for <strong>{escape(payload['reportDate'])}</strong>. This report is automatically generated from RequestOps workflow, assignment, activity, and audit data.
      </p>

      <h2 style="margin:22px 0 10px;color:#0f172a;font-size:18px;">Executive Summary</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>{''.join(card_cells[:3])}</tr>
        <tr>{''.join(card_cells[3:])}</tr>
      </table>

      <h2 style="margin:26px 0 10px;color:#0f172a;font-size:18px;">Request Breakdown</h2>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th align="left" style="padding:10px 12px;color:#475569;font-size:11px;text-transform:uppercase;">Request</th>
            <th align="left" style="padding:10px 12px;color:#475569;font-size:11px;text-transform:uppercase;">Status</th>
            <th align="left" style="padding:10px 12px;color:#475569;font-size:11px;text-transform:uppercase;">Today's Activity</th>
            <th align="left" style="padding:10px 12px;color:#475569;font-size:11px;text-transform:uppercase;">Pending Action</th>
          </tr>
        </thead>
        <tbody>{rows_html}</tbody>
      </table>

      <h2 style="margin:26px 0 10px;color:#0f172a;font-size:18px;">Key Risks & Bottlenecks</h2>
      <ul style="margin:0;padding-left:18px;">{risks_html}</ul>
    </div>
    """


def _insert_report(db: Session, payload: dict, html_body: str, recipients: list[dict], source: str, actor_user_id: int | None) -> dict:
    result = execute(
        db,
        """
        INSERT INTO daily_progress_reports
          (report_date, generated_by_user_id, generation_source, report_status, summary_json, report_payload, html_body, recipients_json)
        VALUES
          (:reportDate, :actorUserId, :source, 'GENERATED', :summaryJson, :payloadJson, :htmlBody, :recipientsJson)
        """,
        {
            "reportDate": payload["reportDate"],
            "actorUserId": actor_user_id,
            "source": source,
            "summaryJson": _json_dumps(payload["summary"]),
            "payloadJson": _json_dumps(payload),
            "htmlBody": html_body,
            "recipientsJson": _json_dumps(recipients),
        },
    )
    report_id = int(result.lastrowid)
    db.commit()
    return get_report(db, report_id) or {}


def _update_report_status(db: Session, report_id: int, status: str, error_message: str | None = None) -> None:
    execute(
        db,
        "UPDATE daily_progress_reports SET report_status = :status, error_message = :errorMessage WHERE id = :reportId",
        {"reportId": report_id, "status": status, "errorMessage": error_message},
    )


def send_report_email(db: Session, report: dict, recipients: list[dict] | None = None) -> dict:
    report_id = int(report["id"])
    payload = _json_loads(report.get("report_payload"), {})
    html_body = report.get("html_body") or render_report_html(payload)
    recipients = recipients or _json_loads(report.get("recipients_json"), []) or resolve_report_recipients(db)
    sent_count = 0
    failed_count = 0
    first_error = None
    for recipient in recipients:
        recipient_email = recipient.get("email")
        if not recipient_email:
            continue
        delivery_result = execute(
            db,
            """
            INSERT INTO daily_progress_report_deliveries
              (report_id, recipient_user_id, recipient_name, recipient_email, delivery_status)
            VALUES (:reportId, :recipientUserId, :recipientName, :recipientEmail, 'PENDING')
            """,
            {
                "reportId": report_id,
                "recipientUserId": recipient.get("id"),
                "recipientName": recipient.get("full_name"),
                "recipientEmail": recipient_email,
            },
        )
        delivery_id = int(delivery_result.lastrowid)
        try:
            send_email(
                recipient_email,
                f"RequestOps Daily Progress Report - {payload.get('reportDate', report.get('report_date'))}",
                "Your RequestOps daily progress report is attached below in HTML format.",
                html_body,
            )
            execute(
                db,
                """
                UPDATE daily_progress_report_deliveries
                SET delivery_status = 'SENT', sent_at = CURRENT_TIMESTAMP
                WHERE id = :deliveryId
                """,
                {"deliveryId": delivery_id},
            )
            sent_count += 1
        except Exception as exc:  # noqa: BLE001
            failed_count += 1
            first_error = first_error or str(exc)
            execute(
                db,
                """
                UPDATE daily_progress_report_deliveries
                SET delivery_status = 'FAILED', error_message = :errorMessage
                WHERE id = :deliveryId
                """,
                {"deliveryId": delivery_id, "errorMessage": str(exc)},
            )
    if failed_count and sent_count:
        status = "PARTIAL_FAILURE"
    elif failed_count:
        status = "FAILED"
    else:
        status = "SENT"
    _update_report_status(db, report_id, status, first_error)
    db.commit()
    return {"sent": sent_count, "failed": failed_count, "status": status}


def generate_daily_report(db: Session, report_date: date | None = None, source: str = "MANUAL", actor_user_id: int | None = None, send_email_now: bool = True) -> dict:
    report_date = report_date or date.today()
    existing = one(
        db,
        """
        SELECT *
        FROM daily_progress_reports
        WHERE report_date = :reportDate
          AND generation_source = :source
        ORDER BY generated_at DESC
        LIMIT 1
        """,
        {"reportDate": report_date.isoformat(), "source": source},
    )
    if existing and source == "SCHEDULED":
        return get_report(db, int(existing["id"])) or existing
    config = ensure_default_config(db)
    payload = build_report_payload(db, report_date, config)
    html_body = render_report_html(payload)
    recipients = resolve_report_recipients(db, config)
    report = _insert_report(db, payload, html_body, recipients, source, actor_user_id)
    if send_email_now:
        send_report_email(db, report, recipients)
        report = get_report(db, int(report["id"])) or report
    return report


def get_report(db: Session, report_id: int) -> dict | None:
    report = one(
        db,
        """
        SELECT *
        FROM daily_progress_reports
        WHERE id = :reportId
        """,
        {"reportId": report_id},
    )
    if not report:
        return None
    deliveries = rows(
        db,
        """
        SELECT *
        FROM daily_progress_report_deliveries
        WHERE report_id = :reportId
        ORDER BY created_at DESC
        """,
        {"reportId": report_id},
    )
    report["summary"] = _json_loads(report.get("summary_json"), {})
    report["payload"] = _json_loads(report.get("report_payload"), {})
    report["recipients"] = _json_loads(report.get("recipients_json"), [])
    report["deliveries"] = deliveries
    return report


def list_reports(db: Session, date_from: str = "", date_to: str = "") -> list[dict]:
    date_from_param = date_from or None
    date_to_param = date_to or None
    reports = rows(
        db,
        """
        SELECT
          r.id,
          r.report_date,
          r.generated_at,
          r.generation_source,
          r.report_status,
          r.summary_json,
          COUNT(d.id) AS delivery_count,
          SUM(CASE WHEN d.delivery_status = 'SENT' THEN 1 ELSE 0 END) AS sent_count,
          SUM(CASE WHEN d.delivery_status = 'FAILED' THEN 1 ELSE 0 END) AS failed_count
        FROM daily_progress_reports r
        LEFT JOIN daily_progress_report_deliveries d ON d.report_id = r.id
        WHERE (:dateFrom IS NULL OR r.report_date >= :dateFrom)
          AND (:dateTo IS NULL OR r.report_date <= :dateTo)
        GROUP BY r.id
        ORDER BY r.report_date DESC, r.generated_at DESC
        LIMIT 180
        """,
        {"dateFrom": date_from_param, "dateTo": date_to_param},
    )
    for report in reports:
        report["summary"] = _json_loads(report.get("summary_json"), {})
    return reports


async def _scheduler_loop(stop_event: asyncio.Event) -> None:
    while not stop_event.is_set():
        try:
            with SessionLocal() as db:
                config = ensure_default_config(db)
                if bool(config.get("is_enabled")):
                    now = datetime.now()
                    report_time = config.get("report_time")
                    if isinstance(report_time, time):
                        due_time = report_time
                    else:
                        due_time = time.fromisoformat(str(report_time or "19:00:00")[:8])
                    already_generated = one(
                        db,
                        """
                        SELECT id
                        FROM daily_progress_reports
                        WHERE report_date = :reportDate
                          AND generation_source = 'SCHEDULED'
                        """,
                        {"reportDate": now.date().isoformat()},
                    )
                    if not already_generated and now.time() >= due_time:
                        generate_daily_report(db, now.date(), source="SCHEDULED", send_email_now=True)
        except (OperationalError, ProgrammingError):
            pass
        except Exception:
            pass
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=60)
        except asyncio.TimeoutError:
            continue


def start_daily_progress_report_scheduler() -> None:
    global _scheduler_task, _scheduler_stop_event
    if _scheduler_task and not _scheduler_task.done():
        return
    _scheduler_stop_event = asyncio.Event()
    _scheduler_task = asyncio.create_task(_scheduler_loop(_scheduler_stop_event))


async def stop_daily_progress_report_scheduler() -> None:
    global _scheduler_task, _scheduler_stop_event
    if _scheduler_stop_event:
        _scheduler_stop_event.set()
    if _scheduler_task:
        await _scheduler_task
    _scheduler_task = None
    _scheduler_stop_event = None
