import asyncio
import json
from datetime import date, datetime, time
from typing import Any

from sqlalchemy.exc import OperationalError, ProgrammingError
from sqlalchemy.orm import Session

from app.core.database import SessionLocal, execute, one, rows
from app.services.daily_progress_report_template import render_report_html
from app.services.email_service import send_email


OPEN_REQUEST_STATUSES = frozenset({
    "SUBMITTED",
    "DEPARTMENT_APPROVAL_PENDING",
    "CLARIFICATION_REQUESTED",
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
    "ASSIGNED",
})

IN_PROGRESS_REQUEST_STATUSES = frozenset({
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
    "UAT_APPROVED",
    "DEPLOYMENT_PENDING",
})

COMPLETED_REQUEST_STATUSES = frozenset({"DEPLOYED", "READY_FOR_COMPLETION"})

APPROVAL_STATUS_CHANGES = frozenset({
    "IT_REVIEW_PENDING",
    "REQUIREMENTS_APPROVED",
    "QA_PASSED",
    "UAT_APPROVED",
})

ASSIGNMENT_STATUS_CHANGES = frozenset({
    "PM_ASSIGNED",
    "DEVELOPER_ASSIGNED",
    "ASSIGNED",
    "SPRINT_ACTIVE",
    "IN_DEVELOPMENT",
})

WORK_COMPLETED_STATUS_CHANGES = frozenset({
    "DEVELOPMENT_COMPLETE",
    "QA_PASSED",
    "UAT_APPROVED",
    "DEPLOYED",
    "READY_FOR_COMPLETION",
})

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
DEFAULT_SCHEDULE_DAYS = [0, 1, 2, 3, 4, 5, 6]


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


def _parse_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value)).date()
    except ValueError:
        return None


def _due_indicator(target_date: date | None, report_date: date) -> tuple[str, bool, bool]:
    """Return display label, overdue flag, and due-today flag for a target date."""
    if not target_date:
        return "No target date", False, False
    delta = (target_date - report_date).days
    if delta < 0:
        days = abs(delta)
        label = f"{days} day{'s' if days != 1 else ''} overdue"
        return label, True, False
    if delta == 0:
        return "Due today", False, True
    return f"{delta} day{'s' if delta != 1 else ''} remaining", False, False


def _activity_item(kind: str, label: str, actor: str | None, occurred_at: Any, detail: str | None = None) -> dict:
    return {
        "kind": kind,
        "label": label,
        "actor": actor or "System",
        "occurredAt": _datetime_string(occurred_at),
        "detail": detail or "",
    }


def _quoted_status_list(statuses: frozenset[str]) -> str:
    return ", ".join(f"'{status}'" for status in sorted(statuses))


def _fetch_overall_status_counts(db: Session) -> dict:
    """Overall Request Status — aggregate counts across the full request lifecycle."""
    row = one(
        db,
        f"""
        SELECT
          COUNT(*) AS total_requests,
          SUM(CASE WHEN status IN ({_quoted_status_list(OPEN_REQUEST_STATUSES)}) THEN 1 ELSE 0 END) AS open_requests,
          SUM(CASE WHEN status IN ({_quoted_status_list(IN_PROGRESS_REQUEST_STATUSES)}) THEN 1 ELSE 0 END) AS in_progress_requests,
          SUM(CASE WHEN status IN ({_quoted_status_list(COMPLETED_REQUEST_STATUSES)}) THEN 1 ELSE 0 END) AS completed_requests,
          SUM(CASE WHEN status = 'CLOSED' THEN 1 ELSE 0 END) AS closed_requests
        FROM requests
        """,
    ) or {}
    return {
        "totalRequests": int(row.get("total_requests") or 0),
        "openRequests": int(row.get("open_requests") or 0),
        "inProgressRequests": int(row.get("in_progress_requests") or 0),
        "completedRequests": int(row.get("completed_requests") or 0),
        "closedRequests": int(row.get("closed_requests") or 0),
    }


def _fetch_daily_summary_counts(db: Session, report_date: date) -> dict:
    """Daily Summary — count lifecycle events recorded on the report date."""
    params = {"reportDate": report_date.isoformat()}
    submitted = one(
        db,
        """
        SELECT COUNT(DISTINCT request_id) AS count
        FROM request_status_history
        WHERE DATE(changed_at) = :reportDate AND to_status = 'SUBMITTED'
        """,
        params,
    ) or {}
    created = one(
        db,
        """
        SELECT COUNT(*) AS count
        FROM requests
        WHERE DATE(created_at) = :reportDate
        """,
        params,
    ) or {}
    status_rows = rows(
        db,
        """
        SELECT to_status, COUNT(DISTINCT request_id) AS count
        FROM request_status_history
        WHERE DATE(changed_at) = :reportDate
        GROUP BY to_status
        """,
        params,
    )
    assignment_count = one(
        db,
        """
        SELECT COUNT(DISTINCT request_id) AS count
        FROM assignments
        WHERE DATE(assigned_at) = :reportDate OR DATE(qa_assigned_at) = :reportDate
        """,
        params,
    ) or {}
    status_map = {row["to_status"]: int(row["count"]) for row in status_rows}
    approved = sum(status_map.get(status, 0) for status in APPROVAL_STATUS_CHANGES)
    assigned = sum(status_map.get(status, 0) for status in ASSIGNMENT_STATUS_CHANGES)
    assigned = max(assigned, int(assignment_count.get("count") or 0))
    completed = sum(status_map.get(status, 0) for status in WORK_COMPLETED_STATUS_CHANGES)
    closed = status_map.get("CLOSED", 0)
    new_submitted = max(int(submitted.get("count") or 0), int(created.get("count") or 0))
    return {
        "newRequestsSubmitted": new_submitted,
        "requestsApproved": approved,
        "requestsAssigned": assigned,
        "requestsCompleted": completed,
        "requestsClosed": closed,
    }


def _fetch_enriched_requests(db: Session) -> list[dict]:
    """Shared request enrichment used by pending, sprint, and legacy report sections."""
    return rows(
        db,
        """
        SELECT
          r.id,
          r.request_number,
          r.title,
          r.priority,
          r.status,
          r.created_at,
          r.updated_at,
          r.closed_at,
          d.name AS department_name,
          COALESCE(assignment_dev.full_name, sprint_dev.full_name) AS assigned_developer_name,
          pm.full_name AS project_manager_name,
          qa.full_name AS qa_name,
          assignee_user.full_name AS current_assignee_name,
          status_marker.last_status_at,
          open_sprint.next_sprint_end_date,
          open_sprint.sprint_completed_at,
          open_task.next_task_due_date,
          COALESCE(blocked.blocked_count, 0) AS blocked_count,
          latest_comment.comment_text AS latest_remark
        FROM requests r
        LEFT JOIN departments d ON d.id = r.requester_department_id
        LEFT JOIN users pm ON pm.id = r.project_manager_user_id
        LEFT JOIN users assignee_user ON assignee_user.id = r.current_assignee_user_id
        LEFT JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE
        LEFT JOIN users assignment_dev ON assignment_dev.id = a.developer_user_id
        LEFT JOIN users qa ON qa.id = a.qa_user_id
        LEFT JOIN (
          SELECT
            s.request_id,
            MIN(s.end_date) AS next_sprint_end_date,
            MIN(s.assigned_developer_user_id) AS assigned_developer_user_id,
            MAX(s.completed_at) AS sprint_completed_at
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
        LEFT JOIN (
          SELECT c.request_id, c.comment_text
          FROM request_comments c
          JOIN (
            SELECT request_id, MAX(id) AS latest_id
            FROM request_comments
            GROUP BY request_id
          ) latest ON latest.latest_id = c.id
        ) latest_comment ON latest_comment.request_id = r.id
        ORDER BY FIELD(r.priority, 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'), r.updated_at ASC
        """,
    )


def _target_date_for_row(row: dict) -> date | None:
    return _parse_date(row.get("next_sprint_end_date")) or _parse_date(row.get("next_task_due_date"))


def _completed_date_for_row(row: dict) -> str:
    if row.get("status") == "CLOSED" and row.get("closed_at"):
        return _datetime_string(row.get("closed_at"))
    if row.get("sprint_completed_at"):
        return _datetime_string(row.get("sprint_completed_at"))
    return "-"


def _fetch_today_status_timeline(db: Session, report_date: date) -> list[dict]:
    """Activity Log — chronological status changes across all requests today."""
    timeline_rows = rows(
        db,
        """
        SELECT
          h.from_status,
          h.to_status,
          h.comment,
          h.changed_at,
          u.full_name AS actor_name,
          r.request_number,
          r.title
        FROM request_status_history h
        JOIN requests r ON r.id = h.request_id
        JOIN users u ON u.id = h.changed_by_user_id
        WHERE DATE(h.changed_at) = :reportDate
        ORDER BY h.changed_at ASC
        """,
        {"reportDate": report_date.isoformat()},
    )
    items = []
    for row in timeline_rows:
        to_status = row.get("to_status")
        from_status = row.get("from_status")
        label = _format_status(to_status)
        if from_status:
            label = f"{_format_status(from_status)} → {_format_status(to_status)}"
        items.append({
            "requestId": row.get("request_number"),
            "title": row.get("title"),
            "toStatus": to_status,
            "statusLabel": label,
            "eventLabel": _format_status(to_status),
            "actor": row.get("actor_name") or "System",
            "occurredAt": _datetime_string(row.get("changed_at")),
            "detail": row.get("comment") or "",
        })
    return items


def _fetch_bulk_today_activity(db: Session, report_date: date) -> dict[int, dict]:
    """Fetch per-request activity for the report date in bulk to avoid N+1 queries."""
    params = {"reportDate": report_date.isoformat()}
    grouped: dict[int, list[dict]] = {}

    def add_item(request_id: int, item: dict) -> None:
        grouped.setdefault(int(request_id), []).append(item)

    status_changes = rows(
        db,
        """
        SELECT h.request_id, h.from_status, h.to_status, h.comment, h.changed_at, u.full_name AS actor_name
        FROM request_status_history h
        JOIN users u ON u.id = h.changed_by_user_id
        WHERE DATE(h.changed_at) = :reportDate
        ORDER BY h.changed_at
        """,
        params,
    )
    for item in status_changes:
        add_item(
            int(item["request_id"]),
            _activity_item(
                "Status",
                f"{_format_status(item.get('from_status'))} -> {_format_status(item.get('to_status'))}",
                item.get("actor_name"),
                item.get("changed_at"),
                item.get("comment"),
            ),
        )

    comments = rows(
        db,
        """
        SELECT c.request_id, c.comment_type, c.comment_text, c.created_at, u.full_name AS actor_name
        FROM request_comments c
        JOIN users u ON u.id = c.user_id
        WHERE DATE(c.created_at) = :reportDate
        ORDER BY c.created_at
        """,
        params,
    )
    for item in comments:
        add_item(
            int(item["request_id"]),
            _activity_item("Comment", _format_status(item.get("comment_type")), item.get("actor_name"), item.get("created_at"), item.get("comment_text")),
        )

    assignments = rows(
        db,
        """
        SELECT a.request_id, a.assigned_at, a.qa_assigned_at, a.notes,
               dev.full_name AS developer_name, qa.full_name AS qa_name, assigner.full_name AS actor_name
        FROM assignments a
        LEFT JOIN users dev ON dev.id = a.developer_user_id
        LEFT JOIN users qa ON qa.id = a.qa_user_id
        LEFT JOIN users assigner ON assigner.id = a.assigned_by_user_id
        WHERE DATE(a.assigned_at) = :reportDate OR DATE(a.qa_assigned_at) = :reportDate
        ORDER BY COALESCE(a.qa_assigned_at, a.assigned_at)
        """,
        params,
    )
    for item in assignments:
        target = ", ".join(value for value in [item.get("developer_name"), item.get("qa_name")] if value)
        add_item(
            int(item["request_id"]),
            _activity_item("Assignment", f"Assigned {target or 'delivery owner'}", item.get("actor_name"), item.get("qa_assigned_at") or item.get("assigned_at"), item.get("notes")),
        )

    development_updates = rows(
        db,
        """
        SELECT du.request_id, du.progress_percentage, du.update_notes, du.created_at, u.full_name AS actor_name
        FROM development_updates du
        JOIN users u ON u.id = du.developer_user_id
        WHERE DATE(du.created_at) = :reportDate
        ORDER BY du.created_at
        """,
        params,
    )
    for item in development_updates:
        add_item(
            int(item["request_id"]),
            _activity_item("Development", f"Progress updated to {item.get('progress_percentage')}%", item.get("actor_name"), item.get("created_at"), item.get("update_notes")),
        )

    qa_updates = rows(
        db,
        """
        SELECT tr.request_id, tr.result, tr.test_summary, tr.defects_found, tr.tested_at, u.full_name AS actor_name
        FROM test_results tr
        JOIN users u ON u.id = tr.qa_user_id
        WHERE DATE(tr.tested_at) = :reportDate
        ORDER BY tr.tested_at
        """,
        params,
    )
    for item in qa_updates:
        add_item(
            int(item["request_id"]),
            _activity_item("QA", f"QA result: {_format_status(item.get('result'))}", item.get("actor_name"), item.get("tested_at"), item.get("defects_found") or item.get("test_summary")),
        )

    uat_updates = rows(
        db,
        """
        SELECT ua.request_id, ua.decision, ua.comments, ua.decided_at, u.full_name AS actor_name
        FROM uat_approvals ua
        JOIN users u ON u.id = ua.uat_approver_user_id
        WHERE DATE(ua.decided_at) = :reportDate
        ORDER BY ua.decided_at
        """,
        params,
    )
    for item in uat_updates:
        add_item(
            int(item["request_id"]),
            _activity_item("UAT", f"UAT {_format_status(item.get('decision'))}", item.get("actor_name"), item.get("decided_at"), item.get("comments")),
        )

    sprint_updates = rows(
        db,
        """
        SELECT s.request_id, th.from_status, th.to_status, th.comment, th.changed_at, u.full_name AS actor_name, t.title AS task_title
        FROM sprint_task_status_history th
        JOIN sprint_tasks t ON t.id = th.task_id
        JOIN sprints s ON s.id = t.sprint_id
        JOIN users u ON u.id = th.changed_by_user_id
        WHERE DATE(th.changed_at) = :reportDate
        ORDER BY th.changed_at
        """,
        params,
    )
    for item in sprint_updates:
        add_item(
            int(item["request_id"]),
            _activity_item(
                "Sprint Task",
                f"{item.get('task_title')}: {_format_status(item.get('from_status'))} -> {_format_status(item.get('to_status'))}",
                item.get("actor_name"),
                item.get("changed_at"),
                item.get("comment"),
            ),
        )

    audit_logs = rows(
        db,
        """
        SELECT al.entity_id AS request_id, al.action, al.created_at, u.full_name AS actor_name
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        WHERE al.entity_type = 'REQUEST'
          AND DATE(al.created_at) = :reportDate
        ORDER BY al.created_at
        """,
        params,
    )
    for item in audit_logs:
        add_item(
            int(item["request_id"]),
            _activity_item("Audit", _format_status(item.get("action")), item.get("actor_name"), item.get("created_at")),
        )

    result: dict[int, dict] = {}
    for request_id, items in grouped.items():
        result[request_id] = {
            "items": items,
            "counts": {
                "statusChanges": sum(1 for item in items if item["kind"] == "Status"),
                "comments": sum(1 for item in items if item["kind"] == "Comment"),
                "assignments": sum(1 for item in items if item["kind"] == "Assignment"),
                "developmentUpdates": sum(1 for item in items if item["kind"] == "Development"),
                "qaUpdates": sum(1 for item in items if item["kind"] == "QA"),
                "uatUpdates": sum(1 for item in items if item["kind"] == "UAT"),
                "sprintUpdates": sum(1 for item in items if item["kind"] == "Sprint Task"),
                "auditLogs": sum(1 for item in items if item["kind"] == "Audit"),
                "total": len(items),
            },
        }
    return result


def _today_activity_from_bulk(bulk: dict[int, dict], request_id: int) -> dict:
    return bulk.get(request_id) or {"items": [], "counts": {"total": 0, "statusChanges": 0, "comments": 0, "assignments": 0, "developmentUpdates": 0, "qaUpdates": 0, "uatUpdates": 0, "sprintUpdates": 0, "auditLogs": 0}}


def _build_pending_requests(enriched_rows: list[dict], report_date: date) -> list[dict]:
    """Pending Requests — all non-closed requests with due-date indicators."""
    pending = []
    for row in enriched_rows:
        if row.get("status") == "CLOSED":
            continue
        target = _target_date_for_row(row)
        due_label, is_overdue, due_today = _due_indicator(target, report_date)
        pending.append({
            "id": row["id"],
            "requestId": row.get("request_number"),
            "title": row.get("title"),
            "status": row.get("status"),
            "statusLabel": _format_status(row.get("status")),
            "targetDate": _date_string(target),
            "assignedDeveloper": row.get("assigned_developer_name") or "Not assigned",
            "dueIndicator": due_label,
            "isOverdue": is_overdue,
            "dueToday": due_today,
        })
    return pending


def _build_daily_sprint_activity(enriched_rows: list[dict], bulk_activity: dict[int, dict]) -> list[dict]:
    """Daily Sprint Activity — requests with any recorded activity today."""
    active_ids = {request_id for request_id, activity in bulk_activity.items() if activity["counts"]["total"] > 0}
    items = []
    for row in enriched_rows:
        request_id = int(row["id"])
        if request_id not in active_ids:
            continue
        remarks = row.get("latest_remark") or ""
        activity_items = bulk_activity[request_id]["items"]
        status_remarks = next((item.get("detail") for item in reversed(activity_items) if item.get("detail")), "")
        items.append({
            "id": request_id,
            "requestId": row.get("request_number"),
            "title": row.get("title"),
            "status": row.get("status"),
            "statusLabel": _format_status(row.get("status")),
            "targetDate": _date_string(_target_date_for_row(row)),
            "completedDate": _completed_date_for_row(row),
            "remarks": status_remarks or remarks,
            "todayActivity": bulk_activity[request_id],
        })
    return items


def _build_sprint_health(enriched_rows: list[dict], report_date: date) -> dict:
    """Sprint Health — delivery timeline metrics for active sprint requests."""
    week_end = report_date.toordinal() + 7
    delivery_complete = COMPLETED_REQUEST_STATUSES | frozenset({"CLOSED"})
    sprint_rows = [
        row for row in enriched_rows
        if row.get("status") in IN_PROGRESS_REQUEST_STATUSES
        or row.get("status") in {"SPRINT_ACTIVE", "SPRINT_CREATED", "DEVELOPER_ASSIGNED", "SPRINT_PLANNING"}
        or row.get("next_sprint_end_date")
    ]
    total_active = len(sprint_rows)
    overdue = 0
    due_today = 0
    due_this_week = 0
    completed_on_time = 0
    delivered_count = 0
    for row in sprint_rows:
        target = _target_date_for_row(row)
        status = row.get("status")
        if status in delivery_complete:
            delivered_count += 1
        if not target:
            continue
        target_ordinal = target.toordinal()
        if target < report_date and status != "CLOSED":
            overdue += 1
        if target == report_date:
            due_today += 1
        if report_date.toordinal() <= target_ordinal <= week_end:
            due_this_week += 1
        closed_date = _parse_date(row.get("closed_at"))
        if status == "CLOSED" and closed_date and closed_date <= target:
            completed_on_time += 1
        elif status in COMPLETED_REQUEST_STATUSES and target >= report_date:
            completed_on_time += 1
    completion_pct = round((delivered_count / total_active) * 100) if total_active else 0
    return {
        "totalActiveSprintRequests": total_active,
        "completedWithinTargetDate": completed_on_time,
        "overdueRequests": overdue,
        "dueToday": due_today,
        "dueThisWeek": due_this_week,
        "sprintCompletionPercentage": completion_pct,
    }


def _normalize_schedule_days(value: Any) -> list[int]:
    days = _json_loads(value, DEFAULT_SCHEDULE_DAYS)
    if not isinstance(days, list):
        return DEFAULT_SCHEDULE_DAYS.copy()
    normalized: list[int] = []
    for day in days:
        try:
            day_int = int(day)
        except (TypeError, ValueError):
            continue
        if 0 <= day_int <= 6:
            normalized.append(day_int)
    return sorted(set(normalized)) or DEFAULT_SCHEDULE_DAYS.copy()


def _is_scheduled_for_date(config: dict, report_date: date) -> bool:
    """Return True when automated reports should run on the given date."""
    return report_date.weekday() in _normalize_schedule_days(config.get("schedule_days"))


def ensure_default_config(db: Session) -> dict:
    config = one(db, "SELECT * FROM daily_progress_report_config WHERE id = 1")
    if config:
        return config
    execute(
        db,
        """
        INSERT INTO daily_progress_report_config
          (id, is_enabled, report_time, schedule_days, recipient_user_ids, stale_threshold_days, overdue_threshold_days)
        VALUES (1, TRUE, '19:00:00', :scheduleDays, NULL, 3, 7)
        """,
        {"scheduleDays": _json_dumps(DEFAULT_SCHEDULE_DAYS)},
    )
    db.commit()
    return one(db, "SELECT * FROM daily_progress_report_config WHERE id = 1") or {}


def get_report_config(db: Session) -> dict:
    config = ensure_default_config(db)
    return {
        "isEnabled": bool(config.get("is_enabled")),
        "reportTime": _time_to_string(config.get("report_time")),
        "scheduleDays": _normalize_schedule_days(config.get("schedule_days")),
        "recipientUserIds": _json_loads(config.get("recipient_user_ids"), []),
        "staleThresholdDays": int(config.get("stale_threshold_days") or 3),
        "overdueThresholdDays": int(config.get("overdue_threshold_days") or 7),
        "updatedAt": _datetime_string(config.get("updated_at")),
    }


def update_report_config(db: Session, payload: dict, actor_user_id: int) -> dict:
    recipient_ids = payload.get("recipientUserIds") or []
    schedule_days = _normalize_schedule_days(payload.get("scheduleDays"))
    execute(
        db,
        """
        INSERT INTO daily_progress_report_config
          (id, is_enabled, report_time, schedule_days, recipient_user_ids, stale_threshold_days, overdue_threshold_days, updated_by_user_id)
        VALUES
          (1, :isEnabled, :reportTime, :scheduleDays, :recipientUserIds, :staleThresholdDays, :overdueThresholdDays, :actorUserId)
        ON DUPLICATE KEY UPDATE
          is_enabled = VALUES(is_enabled),
          report_time = VALUES(report_time),
          schedule_days = VALUES(schedule_days),
          recipient_user_ids = VALUES(recipient_user_ids),
          stale_threshold_days = VALUES(stale_threshold_days),
          overdue_threshold_days = VALUES(overdue_threshold_days),
          updated_by_user_id = VALUES(updated_by_user_id)
        """,
        {
            "isEnabled": bool(payload.get("isEnabled", True)),
            "reportTime": payload.get("reportTime") or "19:00",
            "scheduleDays": _json_dumps(schedule_days),
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

    # Section data — fetched with shared queries to avoid duplicate lookups.
    overall_status = _fetch_overall_status_counts(db)
    daily_summary = _fetch_daily_summary_counts(db, report_date)
    enriched_rows = _fetch_enriched_requests(db)
    bulk_activity = _fetch_bulk_today_activity(db, report_date)
    activity_log = _fetch_today_status_timeline(db, report_date)
    pending_requests = _build_pending_requests(enriched_rows, report_date)
    daily_sprint_activity = _build_daily_sprint_activity(enriched_rows, bulk_activity)
    sprint_health = _build_sprint_health(enriched_rows, report_date)

    # Legacy request breakdown — active pipeline requests for UI compatibility.
    active_rows = [row for row in enriched_rows if row.get("status") in ACTIVE_REPORT_STATUSES]
    report_requests = []
    for row in active_rows:
        activity = _today_activity_from_bulk(bulk_activity, int(row["id"]))
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
            "targetDate": _date_string(_target_date_for_row(row)),
            "completedDate": _completed_date_for_row(row),
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

    generated_at = datetime.now()
    return {
        "reportDate": report_date.isoformat(),
        "reportDateLabel": report_date.strftime("%d %b %Y"),
        "generatedAt": generated_at.isoformat(),
        "generatedAtLabel": generated_at.strftime("%d %b %Y, %I:%M %p"),
        "overallStatus": overall_status,
        "dailySummary": daily_summary,
        "dailySprintActivity": daily_sprint_activity,
        "activityLog": activity_log,
        "pendingRequests": pending_requests,
        "sprintHealth": sprint_health,
        "summary": summary,
        "requests": report_requests,
        "keyRisks": risks,
    }


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
                f"RequestOps Daily Activity Report - {payload.get('reportDateLabel') or payload.get('reportDate', report.get('report_date'))}",
                "Your RequestOps daily activity dashboard report is attached below in HTML format.",
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
                now = datetime.now()
                config = ensure_default_config(db)
                if bool(config.get("is_enabled")) and _is_scheduled_for_date(config, now.date()):
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
