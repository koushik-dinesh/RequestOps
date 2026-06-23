"""Workflow action visibility and email deep-link helpers for request notifications."""

from __future__ import annotations

from html import escape
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.workflows.request_permissions import NON_WITHDRAWABLE_STATUSES, can_requester_withdraw
from app.core.database import one, rows
from app.services.user_role_service import get_user_roles


ACTION_TONES = {
    "success": ("#ffffff", "#16a34a"),
    "warning": ("#ffffff", "#d97706"),
    "error": ("#ffffff", "#dc2626"),
    "neutral": ("#0f172a", "#e2e8f0"),
}


def _is_admin(role_code: str | None) -> bool:
    return role_code == "SYSTEM_ADMIN"



def _request_url(request_id: int) -> str:
    return f"{settings.public_app_base_url.rstrip('/')}/requests/{request_id}"


def _action_url(request_id: int, action_id: str) -> str:
    """Email buttons open the request in RequestOps; actions run only in the app."""
    return _request_url(request_id)


def _is_department_head_for_request(request_row: dict, user_id: int) -> bool:
    head_ids = {
        int(value)
        for value in [request_row.get("department_head_user_id"), request_row.get("reported_to_user_id")]
        if value
    }
    return int(user_id) in head_ids


def _is_assigned_project_manager(request_row: dict, user_id: int) -> bool:
    return int(request_row.get("project_manager_user_id") or 0) == int(user_id)


def _is_requester(request_row: dict, user_id: int) -> bool:
    return int(request_row.get("requester_user_id") or 0) == int(user_id)


def _can_review_requirements(request_row: dict, role_code: str, user_id: int, is_admin: bool) -> bool:
    status = request_row.get("status")
    if status == "REQUIREMENTS_DEPARTMENT_REVIEW":
        return is_admin or (role_code == "DEPARTMENT_HEAD" and _is_department_head_for_request(request_row, user_id))
    if status == "REQUIREMENTS_PM_REVIEW":
        return is_admin or (role_code == "PROJECT_MANAGER" and _is_assigned_project_manager(request_row, user_id))
    return False


def _fetch_request_for_actions(db: Session, request_id: int) -> dict | None:
    return one(
        db,
        """
        SELECT
          r.*,
          active_assignment.id AS active_assignment_id,
          assignment_dev.id AS active_developer_user_id,
          assignment_qa.id AS active_qa_user_id
        FROM requests r
        LEFT JOIN assignments active_assignment
          ON active_assignment.request_id = r.id AND active_assignment.is_active = TRUE
        LEFT JOIN users assignment_dev ON assignment_dev.id = active_assignment.developer_user_id
        LEFT JOIN users assignment_qa ON assignment_qa.id = active_assignment.qa_user_id
        WHERE r.id = :requestId
        """,
        {"requestId": request_id},
    )


def _recipient_role_codes(db: Session, user_id: int) -> list[str]:
    roles = get_user_roles(db, user_id)
    if roles:
        return [role["code"] for role in roles]
    fallback = one(
        db,
        """
        SELECT r.code AS role_code
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.id = :userId
        """,
        {"userId": user_id},
    )
    return [fallback["role_code"]] if fallback else []


def _developer_tasks_complete(db: Session, request_id: int, developer_user_id: int) -> bool:
    tasks = rows(
        db,
        """
        SELECT t.status, s.status AS sprint_status
        FROM sprint_tasks t
        JOIN sprints s ON s.id = t.sprint_id
        WHERE s.request_id = :requestId
          AND t.assigned_developer_user_id = :developerId
          AND t.status != 'CANCELLED'
          AND (s.status IS NULL OR s.status IN ('ACTIVE', 'COMPLETED'))
        """,
        {"requestId": request_id, "developerId": developer_user_id},
    )
    if not tasks:
        return False
    return all(task["status"] == "DONE" for task in tasks)


def _actions_for_role(db: Session, request_row: dict, role_code: str, user_id: int) -> list[dict]:
    status = request_row.get("status")
    if status in NON_WITHDRAWABLE_STATUSES:
        return []
    is_admin = _is_admin(role_code)
    request_id = int(request_row["id"])
    actions: list[dict] = []

    def add(action_id: str, label: str, tone: str) -> None:
        actions.append({
            "id": action_id,
            "label": label,
            "tone": tone,
            "url": _action_url(request_id, action_id),
        })

    if status == "DEPARTMENT_APPROVAL_PENDING" and (
        is_admin or (role_code == "DEPARTMENT_HEAD" and _is_department_head_for_request(request_row, user_id))
    ):
        add("department-approve", "Approve", "success")
        add("department-clarify", "Request Details", "warning")
        add("department-reject", "Reject", "error")

    if status == "CLARIFICATION_REQUESTED" and _is_requester(request_row, user_id):
        add("clarification-respond", "Respond and Resubmit", "success")

    if status == "IT_REVIEW_PENDING" and (role_code == "IT_HEAD" or is_admin):
        add("it-approve", "Approve", "success")
        add("it-clarify", "Request Clarification", "warning")
        add("it-reject", "Reject", "error")
        add("it-defer", "Defer", "neutral")

    if status == "DEFERRED" and (role_code == "IT_HEAD" or is_admin):
        add("it-resume", "Resume Deferred Request", "success")

    if status in {"ASSIGNMENT_PENDING", "PM_ASSIGNED"} and (role_code == "IT_HEAD" or is_admin):
        label = "Change Project Manager" if request_row.get("project_manager_user_id") else "Assign Project Manager"
        add("assign-project-manager", label, "success")

    if status in {"PM_ASSIGNED", "REQUIREMENTS_CLARIFICATION_REQUESTED"} and (
        is_admin or (role_code == "PROJECT_MANAGER" and _is_assigned_project_manager(request_row, user_id))
    ):
        add("open-scope-management", "Create / Edit Scope", "neutral")
        add("open-story-management", "Create / Edit User Stories", "neutral")

    if _can_review_requirements(request_row, role_code, user_id, is_admin):
        if status == "REQUIREMENTS_DEPARTMENT_REVIEW":
            add("requirements-approve", "Approve Requirements", "success")
            add("requirements-request-clarification", "Request Clarification From PM", "warning")
        else:
            add("requirements-approve", "Approve Revision", "success")

    if status == "IN_DEVELOPMENT":
        developer_complete = _developer_tasks_complete(db, request_id, user_id)
        if (role_code == "DEVELOPER" and developer_complete) or (is_admin and int(request_row.get("progress_percentage") or 0) >= 100):
            add("submit-development-review", "Submit For Review", "success")

    if status == "DEVELOPMENT_COMPLETE" and (role_code == "PROJECT_MANAGER" or is_admin):
        add("submit-for-qa", "Submit For QA", "success")

    if status == "QA_FAILED" and (role_code == "PROJECT_MANAGER" or is_admin):
        add("send-qa-rework", "Send Back To Developer", "warning")

    if status == "QA_PENDING" and (role_code == "QA" or is_admin):
        if is_admin or int(request_row.get("active_qa_user_id") or 0) == user_id:
            add("qa-pass", "Approve", "success")
            add("qa-fail", "Reject", "error")

    if status == "QA_PASSED" and (role_code == "PROJECT_MANAGER" or is_admin):
        add("send-requester-testing", "Send To Requester Testing", "success")

    if status == "UAT_PENDING" and (is_admin or _is_requester(request_row, user_id)):
        add("uat-approve", "Approve User Testing", "success")

    if status in {"UAT_APPROVED", "DEPLOYMENT_PENDING"} and (role_code == "PROJECT_MANAGER" or is_admin):
        add("complete-deployment", "Complete Deployment", "success")

    if status == "READY_FOR_COMPLETION" and (is_admin or _is_requester(request_row, user_id)):
        add("requester-complete", "Complete Request", "success")

    if status == "DEPLOYED" and (role_code in {"PROJECT_MANAGER", "IT_HEAD"} or is_admin):
        add("close-request", "Close Request", "success")

    if can_requester_withdraw(request_row, user_id):
        add("withdraw-request", "Withdraw Request", "error")

    return actions


def get_workflow_actions_for_recipient(db: Session, recipient_user_id: int, request_id: int) -> list[dict]:
    """Return union of workflow actions available to a recipient across their assigned roles."""
    request_row = _fetch_request_for_actions(db, request_id)
    if not request_row:
        return []
    merged: dict[str, dict] = {}
    for role_code in _recipient_role_codes(db, recipient_user_id):
        for action in _actions_for_role(db, request_row, role_code, recipient_user_id):
            merged[action["id"]] = action
    return list(merged.values())


def get_workflow_actions_for_user(db: Session, user: dict, request_id: int) -> list[dict]:
    """Return workflow actions for the user's active session role."""
    request_row = _fetch_request_for_actions(db, request_id)
    if not request_row:
        return []
    role_code = user.get("role_code")
    if not role_code:
        return []
    return _actions_for_role(db, request_row, role_code, int(user["id"]))


def render_workflow_action_buttons_html(request_id: int, actions: list[dict]) -> str:
    if not actions:
        return ""
    buttons = []
    for action in actions:
        text_color, bg_color = ACTION_TONES.get(action.get("tone") or "neutral", ACTION_TONES["neutral"])
        buttons.append(
            f"""
            <td style="padding:0 8px 8px 0;vertical-align:top;">
              <a href="{escape(action['url'])}" style="display:inline-block;padding:11px 16px;background:{bg_color};color:{text_color};text-decoration:none;border-radius:8px;font-size:13px;font-weight:800;white-space:nowrap;">
                {escape(action['label'])}
              </a>
            </td>
            """
        )
    rows = []
    for index in range(0, len(buttons), 2):
        chunk = buttons[index:index + 2]
        while len(chunk) < 2:
            chunk.append('<td style="padding:0 8px 8px 0;"></td>')
        rows.append(f"<tr>{''.join(chunk)}</tr>")
    return f"""
    <div style="margin:20px 0 6px;">
      <p style="margin:0 0 10px;color:#0f172a;font-size:14px;font-weight:800;">Available Workflow Actions</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        {''.join(rows)}
      </table>
      <p style="margin:10px 0 0;color:#64748b;font-size:12px;line-height:1.55;">
        Open the request in RequestOps to review details and complete your decision. You may be asked to sign in first. Workflow actions are completed only inside the application.
      </p>
    </div>
    """


def append_workflow_actions_text(body: str, actions: list[dict]) -> str:
    if not actions:
        return body
    lines = "\n".join(f"- {action['label']}: {action['url']}" for action in actions)
    return f"{body.rstrip()}\n\nAvailable Workflow Actions\n{lines}\n"


def enrich_request_email_html(db: Session, html_body: str | None, request_id: int | None, recipient_user_id: int | None) -> str | None:
    if not html_body or not request_id or not recipient_user_id:
        return html_body
    actions = get_workflow_actions_for_recipient(db, recipient_user_id, request_id)
    buttons = render_workflow_action_buttons_html(request_id, actions)
    if not buttons:
        return html_body
    return f"{html_body.rstrip()}{buttons}"


def enrich_request_email_text(db: Session, body: str, request_id: int | None, recipient_user_id: int | None) -> str:
    if not request_id or not recipient_user_id:
        return body
    actions = get_workflow_actions_for_recipient(db, recipient_user_id, request_id)
    return append_workflow_actions_text(body, actions)
