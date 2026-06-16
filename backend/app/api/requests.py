from datetime import datetime
from html import escape
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Request as FastAPIRequest, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import execute, get_db, one, rows
from app.middleware.auth import get_current_user
from app.schemas.payloads import (
    AssignPayload,
    ClarificationPayload,
    ClarificationResponsePayload,
    CommentPayload,
    ItReviewApprovePayload,
    OptionalCommentPayload,
    ProjectManagerAssignPayload,
    QaReworkPayload,
    RequirementPackageUpdatePayload,
    ProjectScopePayload,
    ProjectScopeReviewPayload,
    RequestCreatePayload,
    RequestDetailsPayload,
    RequiredCommentPayload,
    RoiPayload,
    SprintPayload,
    SprintTaskAssignPayload,
    SprintTaskBlockerPayload,
    SprintTaskCommentPayload,
    SprintTaskPayload,
    SprintTaskStatusPayload,
    SubmitForQaPayload,
    TestResultPayload,
    UatApprovePayload,
    UatRejectPayload,
    UserStoryPayload,
    UserStoryReviewPayload,
)
from app.repositories.project_management_repository import (
    assign_project_manager,
    assign_sprint_developer,
    assign_sprint_task_developer,
    add_sprint_task_comment,
    add_sprint_task_status_history,
    create_project_scope,
    create_sprint,
    create_sprint_task,
    create_user_story,
    delete_sprint,
    get_project_scope,
    get_sprint,
    get_sprint_task,
    get_user_story,
    list_project_scopes,
    list_sprint_tasks,
    list_request_sprint_tasks,
    list_sprints,
    list_user_stories,
    review_project_scope,
    review_user_story,
    update_project_scope,
    update_sprint,
    update_sprint_status,
    update_sprint_task,
    update_sprint_task_status,
    update_user_story,
)
from app.repositories.requirements_repository import (
    REQUIREMENT_REVIEW_STATUSES,
    create_requirement_revision,
    ensure_requirements_approved,
    get_latest_requirement_revision,
    get_requirement_review_package,
    get_requirement_revision_reviews,
    latest_revision_has_final_approval,
    record_requirement_change,
    record_requirement_review_decision,
    update_requirement_revision_status,
)
from app.services.activity_service import audit, notify
from app.services.upload_service import save_upload
from app.utils.http import ApiError, ok
from app.workflows.request_workflow import get_request_by_id, transition_request


READ_ONLY_REQUEST_METHODS = {"GET", "HEAD", "OPTIONS"}


def prevent_completed_request_mutations(request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    if request_context.method in READ_ONLY_REQUEST_METHODS:
        return
    request_id = request_context.path_params.get("request_id")
    if not request_id:
        return
    if request_context.url.path.endswith("/report/audit"):
        return
    request_row = one(db, "SELECT status FROM requests WHERE id = :requestId", {"requestId": request_id})
    if request_row and request_row["status"] == "CLOSED":
        raise ApiError(409, "Completed requests are locked and cannot be edited.")


router = APIRouter(prefix="/requests", tags=["requests"], dependencies=[Depends(get_current_user), Depends(prevent_completed_request_mutations)])

MISSING_REPORTING_AUTHORITY_MESSAGE = "No person found to report at this level. Please contact the System Administrator to configure a reporting authority for your department."
WORKLOAD_AVAILABLE_MAX = 3
WORKLOAD_MODERATE_MAX = 6
WORKLOAD_ACTIVE_STATUSES = [
    "DEVELOPER_ASSIGNED",
    "SPRINT_PLANNING",
    "SPRINT_CREATED",
    "SPRINT_ACTIVE",
    "ASSIGNED",
    "IN_DEVELOPMENT",
    "DEVELOPMENT_COMPLETE",
    "QA_PENDING",
    "QA_FAILED",
    "QA_PASSED",
    "IN_TESTING",
    "TEST_FAILED",
    "UAT_PENDING",
    "UAT_FAILED",
    "UAT_REJECTED",
    "DEPLOYMENT_PENDING",
    "DEPLOYED",
    "READY_FOR_COMPLETION",
]


def is_admin_or_it(user: dict) -> bool:
    return user["role_code"] in ["SYSTEM_ADMIN", "IT_HEAD"]


def add_comment(db: Session, request_id: int, user_id: int, comment_type: str, comment_text: str | None, is_internal: bool = False) -> int | None:
    if not comment_text:
        return None
    result = execute(
        db,
        """
        INSERT INTO request_comments (request_id, user_id, comment_type, comment_text, is_internal)
        VALUES (:requestId, :userId, :commentType, :commentText, :isInternal)
        """,
        {"requestId": request_id, "userId": user_id, "commentType": comment_type, "commentText": comment_text, "isInternal": is_internal},
    )
    return result.lastrowid


def get_active_assignment(db: Session, request_id: int) -> dict | None:
    return one(db, """
        SELECT a.*, developer.full_name AS developer_name, qa.full_name AS qa_name
        FROM assignments a
        LEFT JOIN users developer ON developer.id = a.developer_user_id
        LEFT JOIN users qa ON qa.id = a.qa_user_id
        WHERE a.request_id = :requestId AND a.is_active = TRUE
        LIMIT 1
    """, {"requestId": request_id})


def assert_can_view(db: Session, user: dict, request_row: dict) -> None:
    if is_admin_or_it(user):
        return
    if request_row["requester_user_id"] == user["id"]:
        return
    if request_row["requester_department_id"] == user.get("department_id"):
        return
    if request_row.get("department_head_user_id") == user["id"]:
        return
    if request_row.get("current_assignee_user_id") == user["id"]:
        return
    if request_row.get("project_manager_user_id") == user["id"]:
        return
    assignments = rows(db, """
        SELECT id FROM assignments
        WHERE request_id = :requestId AND is_active = TRUE
          AND (developer_user_id = :userId OR qa_user_id = :userId)
    """, {"requestId": request_row["id"], "userId": user["id"]})
    if assignments:
        return
    task_access = rows(db, """
        SELECT sprint.id
        FROM sprints sprint
        LEFT JOIN sprint_tasks task ON task.sprint_id = sprint.id
        WHERE sprint.request_id = :requestId
          AND (sprint.assigned_developer_user_id = :userId OR task.assigned_developer_user_id = :userId)
        LIMIT 1
    """, {"requestId": request_row["id"], "userId": user["id"]})
    if task_access:
        return
    raise ApiError(403, "You do not have access to this request.")


def assert_request_access(db: Session, user: dict, request_id: int, roles: list[str] | None = None) -> dict:
    request_row = get_request_by_id(db, request_id)
    if not request_row:
        raise ApiError(404, "Request not found.")
    assert_can_view(db, user, request_row)
    if roles and user["role_code"] != "SYSTEM_ADMIN" and user["role_code"] not in roles:
        raise ApiError(403, "You do not have permission for this workflow action.")
    return request_row


def get_current_department_head_id(db: Session, department_id: int | None) -> int | None:
    if not department_id:
        return None
    row = one(db, "SELECT department_head_user_id FROM departments WHERE id = :departmentId AND status = 'ACTIVE'", {"departmentId": department_id})
    return row.get("department_head_user_id") if row else None


def assert_can_act_as_department_head(db: Session, user: dict, request_row: dict) -> int:
    current_head_id = get_current_department_head_id(db, request_row.get("requester_department_id"))
    if not current_head_id and not request_row.get("department_head_user_id"):
        raise ApiError(409, MISSING_REPORTING_AUTHORITY_MESSAGE)
    if user["role_code"] == "SYSTEM_ADMIN":
        return current_head_id or request_row.get("department_head_user_id")
    allowed = {int(value) for value in [request_row.get("department_head_user_id"), current_head_id] if value}
    if int(user["id"]) not in allowed:
        raise ApiError(403, "Only the current department head can act on this request.")
    return current_head_id or request_row.get("department_head_user_id")


def assert_can_act_as_it_head(db: Session, user: dict, request_row: dict) -> int:
    it_head_id = resolve_request_it_head_id(db, request_row)
    if user["role_code"] == "SYSTEM_ADMIN":
        return int(it_head_id)
    if user["role_code"] != "IT_HEAD" or int(user["id"]) != int(it_head_id):
        raise ApiError(403, "Only the assigned IT HOD can act on this request.")
    return int(it_head_id)


def requirements_reviewer_role_for_status(status: str) -> str | None:
    if status == "REQUIREMENTS_DEPARTMENT_REVIEW":
        return "DEPARTMENT_HEAD"
    if status == "REQUIREMENTS_PM_REVIEW":
        return "PROJECT_MANAGER"
    if status == "REQUIREMENTS_IT_REVIEW":
        return "IT_HEAD"
    return None


def assert_can_review_requirements(db: Session, user: dict, request_row: dict) -> tuple[str, int]:
    reviewer_role = requirements_reviewer_role_for_status(request_row["status"])
    if not reviewer_role:
        raise ApiError(409, "Requirements are not awaiting reviewer approval.")
    if reviewer_role == "DEPARTMENT_HEAD":
        return reviewer_role, int(assert_can_act_as_department_head(db, user, request_row))
    if reviewer_role == "PROJECT_MANAGER":
        return reviewer_role, int(assert_can_act_as_project_manager(user, request_row))
    return reviewer_role, int(assert_can_act_as_it_head(db, user, request_row))


def next_requirements_reviewer_role(current_reviewer_role: str) -> str:
    return "PROJECT_MANAGER" if current_reviewer_role == "DEPARTMENT_HEAD" else "DEPARTMENT_HEAD"


def status_for_requirements_reviewer(reviewer_role: str) -> str:
    if reviewer_role == "PROJECT_MANAGER":
        return "REQUIREMENTS_PM_REVIEW"
    return "REQUIREMENTS_IT_REVIEW" if reviewer_role == "IT_HEAD" else "REQUIREMENTS_DEPARTMENT_REVIEW"


def assignee_for_requirements_role(db: Session, request_row: dict, reviewer_role: str) -> int | None:
    if reviewer_role == "PROJECT_MANAGER":
        return request_row.get("project_manager_user_id")
    if reviewer_role == "IT_HEAD":
        return resolve_request_it_head_id(db, request_row)
    return get_request_department_head_id(db, request_row)


def route_after_requirements_approval(
    db: Session,
    *,
    request_row: dict,
    revision: dict,
    actor_user_id: int,
    current_reviewer_role: str,
    comment: str | None,
    request_context: FastAPIRequest,
    background_tasks: BackgroundTasks,
) -> dict:
    reviews = get_requirement_revision_reviews(db, revision["id"])
    decisions = {review["reviewer_role_code"]: review["decision"] for review in reviews if review["is_current"]}
    pm_id = request_row.get("project_manager_user_id")
    if decisions.get("DEPARTMENT_HEAD") == "APPROVED" and decisions.get("PROJECT_MANAGER") == "APPROVED":
        update_requirement_revision_status(db, revision_id=revision["id"], status="APPROVED", pending_reviewer_role_code=None)
        updated = transition_request(
            db,
            request_id=request_row["id"],
            to_status="REQUIREMENTS_APPROVED",
            actor_user_id=actor_user_id,
            comment=comment or "Requirements approved by Department HOD and Project Manager.",
            request_context=request_context,
            patch={"current_assignee_user_id": pm_id},
        )
        for recipient_id in unique_recipient_ids(pm_id, request_row.get("department_head_user_id")):
            notify(db, recipient_user_id=recipient_id, request_id=request_row["id"], type="REQUIREMENTS_FULLY_APPROVED", title="Requirements fully approved", message=f"{request_row['request_number']} requirements are approved and ready for assignment.", background_tasks=background_tasks)
        return updated

    next_role = next_requirements_reviewer_role(current_reviewer_role)
    next_status = status_for_requirements_reviewer(next_role)
    next_assignee_id = assignee_for_requirements_role(db, request_row, next_role)
    update_requirement_revision_status(db, revision_id=revision["id"], status="UNDER_PM_REVIEW" if next_role == "PROJECT_MANAGER" else "UNDER_DEPARTMENT_REVIEW", pending_reviewer_role_code=next_role)
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status=next_status,
        actor_user_id=actor_user_id,
        comment=comment or f"Requirements routed to {format_role_label(next_role)} review.",
        request_context=request_context,
        patch={"current_assignee_user_id": next_assignee_id},
    )
    notify(db, recipient_user_id=next_assignee_id, request_id=request_row["id"], type="REQUIREMENTS_REVIEW_PENDING", title="Requirements review pending", message=f"{request_row['request_number']} requirements are awaiting your review.", background_tasks=background_tasks)
    return updated


def format_role_label(role_code: str) -> str:
    if role_code == "DEPARTMENT_HEAD":
        return "Department HOD"
    if role_code == "PROJECT_MANAGER":
        return "Project Manager"
    return "IT HOD"


def format_enum_for_audit(value: str | None) -> str:
    if not value:
        return "requirements"
    return value.replace("_", " ").replace("-", " ").title()


def changed_fields(existing: dict, next_values: dict, field_map: dict[str, str]) -> list[tuple[str, object, object]]:
    changes = []
    for payload_key, db_key in field_map.items():
        old_value = existing.get(db_key) or ""
        new_value = next_values.get(payload_key) or ""
        if str(old_value) != str(new_value):
            changes.append((payload_key, old_value, new_value))
    return changes


def create_revision_after_reviewer_edit(
    db: Session,
    *,
    request_row: dict,
    user: dict,
    reviewer_role: str,
    artifact_type: str,
    artifact_id: int,
    field_changes: list[tuple[str, object, object]],
    reviewer_comment: str | None,
    request_context: FastAPIRequest,
    background_tasks: BackgroundTasks | None = None,
) -> dict:
    if not field_changes:
        return get_request_by_id(db, request_row["id"])
    if not reviewer_comment or len(reviewer_comment.strip()) < 3:
        raise ApiError(400, "Reviewer comment is required when changing requirements.")
    next_role = next_requirements_reviewer_role(reviewer_role)
    next_status = status_for_requirements_reviewer(next_role)
    next_assignee_id = assignee_for_requirements_role(db, request_row, next_role)
    if not next_assignee_id:
        raise ApiError(409, f"{format_role_label(next_role)} must be assigned before sending updated requirements.")
    reviewer_id = int(user["id"]) if user["role_code"] != "SYSTEM_ADMIN" else assignee_for_requirements_role(db, request_row, reviewer_role)
    revision = create_requirement_revision(
        db,
        request_id=request_row["id"],
        actor_user_id=user["id"],
        status="UNDER_PM_REVIEW" if next_role == "PROJECT_MANAGER" else "UNDER_DEPARTMENT_REVIEW",
        pending_reviewer_role_code=next_role,
        change_summary=f"{format_role_label(reviewer_role)} updated requirements and sent revision to {format_role_label(next_role)}.",
        seed_review_role_code=reviewer_role,
        seed_review_user_id=reviewer_id,
        seed_review_comments=reviewer_comment,
    )
    for field_name, old_value, new_value in field_changes:
        record_requirement_change(
            db,
            request_id=request_row["id"],
            revision_id=revision["id"],
            actor_user_id=user["id"],
            artifact_type=artifact_type,
            artifact_id=artifact_id,
            change_type="UPDATED",
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            change_summary=f"{format_role_label(reviewer_role)} updated {field_name}. {reviewer_comment}",
        )
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status=next_status,
        actor_user_id=user["id"],
        comment=f"{format_role_label(reviewer_role)} updated requirements and sent revision {revision['revision_number']} to {format_role_label(next_role)}. {reviewer_comment}",
        request_context=request_context,
        patch={"current_assignee_user_id": next_assignee_id},
    )
    revision_actor = user.get("full_name") or format_role_label(reviewer_role)
    revision_subject = f"Requirement Revision Review Needed - {request_row['request_number']}"
    revision_details = [
        ("Request ID", request_row.get("request_number")),
        ("Request Title", request_row.get("title")),
        ("Revision Comments", reviewer_comment),
        ("Who Requested Revision", f"{revision_actor} ({format_role_label(reviewer_role)})"),
    ]
    for recipient_id in unique_recipient_ids(next_assignee_id, request_row.get("project_manager_user_id"), request_row.get("department_head_user_id")):
        notify(
            db,
            recipient_user_id=recipient_id,
            request_id=request_row["id"],
            type="REQUIREMENTS_APPROVAL_INVALIDATED",
            title=revision_subject,
            message=f"{request_row['request_number']} revision {revision['revision_number']} was updated by {format_role_label(reviewer_role)} and is pending with {format_role_label(next_role)}. {reviewer_comment}",
            background_tasks=background_tasks,
            email_subject=revision_subject,
            email_body=workflow_email_text(
                greeting="Reviewer",
                intro=f"A requirements revision is awaiting {format_role_label(next_role)} review.",
                details=revision_details,
                action_url=app_request_url(request_row["id"]),
                action_label="Review Requirements",
                next_steps="Please open RequestOps, review the updated scope and user stories, then approve or edit the requirements as needed.",
            ),
            email_html_body=workflow_email_html(
                greeting="Reviewer",
                intro=f"A requirements revision is awaiting {format_role_label(next_role)} review.",
                details=revision_details,
                action_url=app_request_url(request_row["id"]),
                action_label="Review Requirements",
                next_steps="Please open RequestOps, review the updated scope and user stories, then approve or edit the requirements as needed.",
            ),
            email_actor_user_id=user["id"],
            audit_email=True,
        )
    return updated


def assert_active_role_user(db: Session, user_id: int | None, role_code: str, label: str) -> dict:
    if not user_id:
        raise ApiError(400, f"{label} is required.")
    role_user = one(db, """
        SELECT u.id, u.full_name, u.email, r.code AS role_code
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.id = :userId AND u.status = 'ACTIVE'
    """, {"userId": user_id})
    if not role_user or role_user["role_code"] != role_code:
        raise ApiError(400, f"{label} must be an active {role_code.replace('_', ' ').title()}.")
    return role_user


def assert_can_act_as_project_manager(user: dict, request_row: dict) -> int:
    project_manager_id = request_row.get("project_manager_user_id")
    if not project_manager_id:
        raise ApiError(409, "Project Manager must be assigned before this action.")
    if user["role_code"] == "SYSTEM_ADMIN":
        return int(project_manager_id)
    if user["role_code"] != "PROJECT_MANAGER" or int(user["id"]) != int(project_manager_id):
        raise ApiError(403, "Only the assigned Project Manager can perform this action.")
    return int(project_manager_id)


def ensure_approved_user_stories(db: Session, request_id: int) -> list[dict]:
    stories = rows(db, "SELECT id, status FROM user_stories WHERE request_id = :requestId", {"requestId": request_id})
    if not stories:
        raise ApiError(409, "At least one approved user story is required before assigning a developer.")
    not_approved = [story for story in stories if story["status"] != "APPROVED"]
    if not_approved:
        raise ApiError(409, "All user stories must be approved before assigning a developer.")
    return stories


def ensure_approved_scope(db: Session, request_id: int) -> dict:
    scope = one(db, """
        SELECT * FROM project_scopes
        WHERE request_id = :requestId AND status = 'APPROVED'
        ORDER BY created_at DESC, id DESC
        LIMIT 1
    """, {"requestId": request_id})
    if not scope:
        raise ApiError(409, "An approved scope definition is required before creating user stories.")
    return scope


def assert_scope_belongs_to_request(db: Session, scope_id: int, request_id: int) -> dict:
    scope = get_project_scope(db, scope_id)
    if not scope or int(scope["request_id"]) != int(request_id):
        raise ApiError(404, "Scope definition not found.")
    return scope


def assert_story_belongs_to_request(db: Session, story_id: int, request_id: int) -> dict:
    story = get_user_story(db, story_id)
    if not story or int(story["request_id"]) != int(request_id):
        raise ApiError(404, "User story not found.")
    return story


def assert_sprint_belongs_to_request(db: Session, sprint_id: int, request_id: int) -> dict:
    sprint = get_sprint(db, sprint_id)
    if not sprint or int(sprint["request_id"]) != int(request_id):
        raise ApiError(404, "Sprint not found.")
    return sprint


def assert_task_belongs_to_sprint(db: Session, task_id: int, sprint_id: int) -> dict:
    task = get_sprint_task(db, task_id)
    if not task or int(task["sprint_id"]) != int(sprint_id):
        raise ApiError(404, "Sprint task not found.")
    return task


def get_request_department_head_id(db: Session, request_row: dict) -> int | None:
    return get_current_department_head_id(db, request_row.get("requester_department_id")) or request_row.get("department_head_user_id")


def assert_planning_artifacts_ready(db: Session, request_id: int) -> tuple[list[dict], list[dict]]:
    scopes = list_project_scopes(db, request_id)
    stories = list_user_stories(db, request_id)
    if not scopes:
        raise ApiError(409, "Create at least one project scope before submitting for Department HOD review.")
    if not stories:
        raise ApiError(409, "Create at least one user story before submitting for Department HOD review.")
    return scopes, stories


def scope_review_target_status(db: Session, request_id: int) -> str:
    pending_scope = one(db, """
        SELECT id FROM project_scopes
        WHERE request_id = :requestId AND status <> 'APPROVED'
        LIMIT 1
    """, {"requestId": request_id})
    return "SCOPE_REVIEW" if pending_scope else "USER_STORY_REVIEW"


def get_active_user_with_role(db: Session, user_id: int | None, role_code: str) -> dict | None:
    if not user_id:
        return None
    return one(db, """
        SELECT u.id, u.full_name, u.email, r.code AS role_code
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE u.id = :userId AND r.code = :roleCode AND u.status = 'ACTIVE'
    """, {"userId": user_id, "roleCode": role_code})


def resolve_single_active_role_owner(db: Session, role_code: str, label: str) -> int:
    candidates = rows(db, """
        SELECT u.id
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE r.code = :roleCode AND u.status = 'ACTIVE'
        ORDER BY u.employee_id, u.id
    """, {"roleCode": role_code})
    if not candidates:
        raise ApiError(409, f"No active {label} is configured.")
    return candidates[0]["id"]


def resolve_request_it_head_id(db: Session, request_row: dict) -> int:
    existing_owner = get_active_user_with_role(db, request_row.get("it_head_user_id"), "IT_HEAD")
    if existing_owner:
        return existing_owner["id"]
    current_owner = get_active_user_with_role(db, request_row.get("current_assignee_user_id"), "IT_HEAD")
    if current_owner:
        return current_owner["id"]
    return resolve_single_active_role_owner(db, "IT_HEAD", "IT HOD")


def resolve_request_uat_approver_id(db: Session, request_row: dict) -> int:
    current_owner = get_active_user_with_role(db, request_row.get("current_assignee_user_id"), "UAT_APPROVER")
    if current_owner:
        return current_owner["id"]
    department_candidates = rows(db, """
        SELECT u.id
        FROM users u
        JOIN roles r ON r.id = u.role_id
        WHERE r.code = 'UAT_APPROVER'
          AND u.status = 'ACTIVE'
          AND u.department_id = :departmentId
    """, {"departmentId": request_row.get("requester_department_id")})
    if len(department_candidates) == 1:
        return department_candidates[0]["id"]
    if len(department_candidates) > 1:
        raise ApiError(409, "Multiple active UAT approvers are configured for this department.")
    return resolve_single_active_role_owner(db, "UAT_APPROVER", "UAT approver")


def unique_recipient_ids(*user_ids: int | None) -> list[int]:
    return list(dict.fromkeys([int(user_id) for user_id in user_ids if user_id]))


def app_request_url(request_id: int) -> str:
    return f"{settings.public_app_base_url}/requests/{request_id}"


def user_display_name(db: Session, user_id: int | None) -> str:
    if not user_id:
        return "RequestOps"
    user = one(db, "SELECT full_name FROM users WHERE id = :userId", {"userId": user_id})
    return user.get("full_name") if user else "RequestOps"


def workflow_email_html(*, greeting: str, intro: str, details: list[tuple[str, str | None]], action_url: str, action_label: str, next_steps: str) -> str:
    rows_html = "\n".join(
        f"<tr><td style=\"padding:8px;font-weight:700;vertical-align:top;\">{escape(label)}</td><td style=\"padding:8px;\">{escape(str(value or '-'))}</td></tr>"
        for label, value in details
    )
    return f"""
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.55;">
      <p>Hello {escape(greeting)},</p>
      <p>{escape(intro)}</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 680px; margin: 16px 0;">
        {rows_html}
      </table>
      <p>{escape(next_steps)}</p>
      <p>
        <a href="{escape(action_url)}" style="display:inline-block;padding:12px 18px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;">
          {escape(action_label)}
        </a>
      </p>
    </div>
    """


def workflow_email_text(*, greeting: str, intro: str, details: list[tuple[str, str | None]], action_url: str, action_label: str, next_steps: str) -> str:
    details_text = "\n".join(f"{label}: {value or '-'}" for label, value in details)
    return f"""Hello {greeting},

{intro}

{details_text}

{next_steps}

{action_label}: {action_url}
"""


def workload_status_for_count(active_count: int) -> str:
    if active_count <= WORKLOAD_AVAILABLE_MAX:
        return "AVAILABLE"
    if active_count <= WORKLOAD_MODERATE_MAX:
        return "MODERATE"
    return "OVERLOADED"


def developer_active_request_count(db: Session, developer_user_id: int | None) -> int:
    if not developer_user_id:
        return 0
    status_sql = ", ".join(f"'{status}'" for status in WORKLOAD_ACTIVE_STATUSES)
    result = one(db, f"""
        SELECT COUNT(*) AS count
        FROM sprint_tasks task
        JOIN sprints sprint ON sprint.id = task.sprint_id
        JOIN requests r ON r.id = sprint.request_id
        WHERE task.assigned_developer_user_id = :developerUserId
          AND task.status IN ('TODO', 'IN_PROGRESS', 'BLOCKED')
          AND r.status IN ({status_sql})
    """, {"developerUserId": developer_user_id})
    return int(result.get("count") or 0) if result else 0


def audit_workload_status_change(db: Session, request_context: FastAPIRequest, actor_user_id: int, developer_user_id: int | None, before_count: int, after_count: int):
    if not developer_user_id:
        return
    before_status = workload_status_for_count(before_count)
    after_status = workload_status_for_count(after_count)
    if before_status == after_status:
        return
    audit(
        db,
        actor_user_id=actor_user_id,
        action="DEVELOPER_WORKLOAD_STATUS_CHANGED",
        entity_type="USER",
        entity_id=developer_user_id,
        old_value={"activeRequestCount": before_count, "workloadStatus": before_status},
        new_value={"activeRequestCount": after_count, "workloadStatus": after_status},
        request=request_context,
    )


def create_clarification_request(
    db: Session,
    *,
    request_row: dict,
    actor_user_id: int,
    reason_category: str,
    note: str,
    return_status: str,
    return_assignee_user_id: int | None,
    request_context: FastAPIRequest,
    background_tasks: BackgroundTasks,
    patch: dict | None = None,
) -> dict:
    execute(db, """
        INSERT INTO request_clarifications
          (request_id, requested_by_user_id, stage_status, return_status, return_assignee_user_id, reason_category, note)
        VALUES (:requestId, :requestedBy, :stageStatus, :returnStatus, :returnAssignee, :reasonCategory, :note)
    """, {
        "requestId": request_row["id"],
        "requestedBy": actor_user_id,
        "stageStatus": request_row["status"],
        "returnStatus": return_status,
        "returnAssignee": return_assignee_user_id,
        "reasonCategory": reason_category,
        "note": note,
    })
    comment = f"Clarification requested. Reason: {reason_category.replace('_', ' ')}. Note: {note}"
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status="CLARIFICATION_REQUESTED",
        actor_user_id=actor_user_id,
        comment=comment,
        request_context=request_context,
        patch={**(patch or {}), "current_assignee_user_id": request_row["requester_user_id"]},
    )
    actor_name = user_display_name(db, actor_user_id)
    action_url = app_request_url(request_row["id"])
    details = [
        ("Request ID", request_row.get("request_number")),
        ("Request Title", request_row.get("title")),
        ("Clarification Comments", note),
        ("Requested By", actor_name),
    ]
    email_subject = f"Action Required: Clarification Needed for {request_row['request_number']}"
    email_intro = f"{actor_name} requested clarification on this request before the workflow can continue."
    notify(
        db,
        recipient_user_id=request_row["requester_user_id"],
        request_id=request_row["id"],
        type="CLARIFICATION_REQUESTED",
        title=email_subject,
        message=f"{request_row['request_number']} needs clarification from you. {note}",
        background_tasks=background_tasks,
        email_subject=email_subject,
        email_body=workflow_email_text(
            greeting=request_row.get("requester_name") or "Requester",
            intro=email_intro,
            details=details,
            action_url=action_url,
            action_label="Open RequestOps",
            next_steps="Please log in to RequestOps, review the comments, update the request details if needed, and submit your clarification response.",
        ),
        email_html_body=workflow_email_html(
            greeting=request_row.get("requester_name") or "Requester",
            intro=email_intro,
            details=details,
            action_url=action_url,
            action_label="Open RequestOps",
            next_steps="Please log in to RequestOps, review the comments, update the request details if needed, and submit your clarification response.",
        ),
        email_actor_user_id=actor_user_id,
        audit_email=True,
    )
    audit(db, actor_user_id=actor_user_id, action="REQUEST_CLARIFICATION_REQUESTED", entity_type="REQUEST", entity_id=request_row["id"], new_value={"reasonCategory": reason_category, "note": note, "returnStatus": return_status}, request=request_context)
    return updated


def roi_snapshot(request_row: dict) -> dict:
    snapshot = {
        "roiType": request_row.get("roi_type"),
        "roiHoursSavedPerEmployeePerMonth": request_row.get("roi_hours_saved_per_employee_per_month"),
        "roiUsersImpacted": request_row.get("roi_users_impacted"),
        "roiTimeSavedPerTask": request_row.get("roi_time_saved_per_task"),
        "roiTimeSavedUnit": request_row.get("roi_time_saved_unit"),
        "roiOccurrencesPerMonth": request_row.get("roi_occurrences_per_month"),
        "roiEmployeesBenefited": request_row.get("roi_employees_benefited"),
        "roiEstimatedHourlyCostInr": request_row.get("roi_estimated_hourly_cost_inr"),
        "roiEstimatedRevenueImpactInr": request_row.get("roi_estimated_revenue_impact_inr"),
        "roiBusinessImpactCategory": request_row.get("roi_business_impact_category"),
        "roiMonthlyCostSavingsInr": request_row.get("roi_monthly_cost_savings_inr"),
    }
    return {**snapshot, **roi_calculation(snapshot)}


def roi_calculation(roi: dict) -> dict:
    time_saved = float(roi.get("roiTimeSavedPerTask") or 0)
    unit = roi.get("roiTimeSavedUnit") or "MINUTES"
    time_saved_hours = time_saved if unit == "HOURS" else time_saved / 60
    occurrences = int(roi.get("roiOccurrencesPerMonth") or 0)
    employees = int(roi.get("roiEmployeesBenefited") or 0)
    hourly_cost = float(roi.get("roiEstimatedHourlyCostInr") or 0)
    revenue_impact = float(roi.get("roiEstimatedRevenueImpactInr") or 0)
    monthly_hours = time_saved_hours * occurrences * employees
    annual_hours = monthly_hours * 12
    annual_cost_savings = annual_hours * hourly_cost
    monthly_capacity = employees * 160
    automation_percentage = min(100, (monthly_hours / monthly_capacity) * 100) if monthly_capacity else 0
    estimated_roi = annual_cost_savings + revenue_impact
    if any([time_saved, occurrences, employees, hourly_cost, revenue_impact, roi.get("roiBusinessImpactCategory"), roi.get("roiUsersImpacted")]):
        return {
            "roiMonthlyProductiveHoursSaved": monthly_hours,
            "roiAnnualProductiveHoursSaved": annual_hours,
            "roiAnnualCostSavingsInr": annual_cost_savings,
            "roiAutomationPercentage": automation_percentage,
            "roiEstimatedRoiInr": estimated_roi,
            "roiCalculatedAnnualValue": estimated_roi,
            "roiCalculatedAnnualUnit": "INR",
        }
    if roi.get("roiType") == "TIME_SAVINGS":
        monthly_hours = float(roi.get("roiHoursSavedPerEmployeePerMonth") or 0) * int(roi.get("roiEmployeesBenefited") or 0)
        annual_hours = monthly_hours * 12
        return {
            "roiMonthlyProductiveHoursSaved": monthly_hours,
            "roiAnnualProductiveHoursSaved": annual_hours,
            "roiAnnualCostSavingsInr": None,
            "roiAutomationPercentage": None,
            "roiEstimatedRoiInr": None,
            "roiCalculatedAnnualValue": annual_hours,
            "roiCalculatedAnnualUnit": "HOURS",
        }
    if roi.get("roiType") == "COST_SAVINGS":
        annual_cost = float(roi.get("roiMonthlyCostSavingsInr") or 0) * 12
        return {
            "roiMonthlyProductiveHoursSaved": None,
            "roiAnnualProductiveHoursSaved": None,
            "roiAnnualCostSavingsInr": annual_cost,
            "roiAutomationPercentage": None,
            "roiEstimatedRoiInr": annual_cost,
            "roiCalculatedAnnualValue": annual_cost,
            "roiCalculatedAnnualUnit": "INR",
        }
    return {
        "roiMonthlyProductiveHoursSaved": None,
        "roiAnnualProductiveHoursSaved": None,
        "roiAnnualCostSavingsInr": None,
        "roiAutomationPercentage": None,
        "roiEstimatedRoiInr": None,
        "roiCalculatedAnnualValue": None,
        "roiCalculatedAnnualUnit": None,
    }


def request_with_roi_calculation(request_row: dict | None) -> dict | None:
    if not request_row:
        return None
    roi = {
        "roiType": request_row.get("roi_type"),
        "roiHoursSavedPerEmployeePerMonth": request_row.get("roi_hours_saved_per_employee_per_month"),
        "roiUsersImpacted": request_row.get("roi_users_impacted"),
        "roiTimeSavedPerTask": request_row.get("roi_time_saved_per_task"),
        "roiTimeSavedUnit": request_row.get("roi_time_saved_unit"),
        "roiOccurrencesPerMonth": request_row.get("roi_occurrences_per_month"),
        "roiEmployeesBenefited": request_row.get("roi_employees_benefited"),
        "roiEstimatedHourlyCostInr": request_row.get("roi_estimated_hourly_cost_inr"),
        "roiEstimatedRevenueImpactInr": request_row.get("roi_estimated_revenue_impact_inr"),
        "roiBusinessImpactCategory": request_row.get("roi_business_impact_category"),
        "roiMonthlyCostSavingsInr": request_row.get("roi_monthly_cost_savings_inr"),
    }
    return {**request_row, **roi_calculation(roi)}


def annual_roi_summary(roi: dict) -> str:
    calculated = roi_calculation(roi)
    if calculated.get("roiEstimatedRoiInr") is not None:
        return f"INR {calculated['roiEstimatedRoiInr']:g}/Year"
    if roi.get("roiType") == "TIME_SAVINGS":
        annual = calculated["roiAnnualProductiveHoursSaved"] or 0
        return f"{annual:g} Hours/Year"
    if roi.get("roiType") == "COST_SAVINGS":
        annual = calculated["roiAnnualCostSavingsInr"] or 0
        return f"INR {annual:g}/Year"
    return "Not specified"


@router.get("/")
def list_requests(
    status: str = "",
    priority: str = "",
    type: str = "",
    departmentId: str = "",
    assigneeId: str = "",
    search: str = "",
    mine: str = "",
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = user["role_code"]
    filters = [
        "(:status = '' OR r.status = :status)" if not (role == "QA" and status == "IN_TESTING") else "(:status = '' OR r.status = :status OR (r.status = 'IN_DEVELOPMENT' AND r.progress_percentage = 100))",
        "(:priority = '' OR r.priority = :priority)",
        "(:type = '' OR r.request_type = :type)",
        "(:departmentId = '' OR r.requester_department_id = :departmentId)",
        "(:assigneeId = '' OR r.current_assignee_user_id = :assigneeId)",
        "(:search = '' OR r.request_number LIKE CONCAT('%', :search, '%') OR r.title LIKE CONCAT('%', :search, '%'))",
    ]
    params = {"status": status, "priority": priority, "type": type, "departmentId": departmentId, "assigneeId": assigneeId, "search": search, "userId": user["id"], "userDepartmentId": user.get("department_id")}
    if mine == "true":
        filters.append("r.requester_user_id = :userId")
    elif not is_admin_or_it(user):
        if role == "DEPARTMENT_HEAD":
            filters.append("(r.department_head_user_id = :userId OR r.requester_department_id = :userDepartmentId)")
        elif role == "PROJECT_MANAGER":
            filters.append("r.project_manager_user_id = :userId")
        elif role == "DEVELOPER":
            filters.append("EXISTS (SELECT 1 FROM sprints owned_sprint LEFT JOIN sprint_tasks owned_task ON owned_task.sprint_id = owned_sprint.id WHERE owned_sprint.request_id = r.id AND (owned_sprint.assigned_developer_user_id = :userId OR owned_task.assigned_developer_user_id = :userId))")
        elif role == "QA":
            filters.append("a.qa_user_id = :userId")
        elif role == "UAT_APPROVER":
            filters.append("(r.current_assignee_user_id = :userId OR r.status = 'UAT_PENDING')")
        else:
            filters.append("r.requester_department_id = :userDepartmentId")
    request_rows = rows(db, f"""
        SELECT r.*, requester.full_name AS requester_name, d.name AS department_name,
               dh.full_name AS department_head_name,
               COALESCE(dh.full_name, current_dh.full_name) AS reported_to_name,
               COALESCE(r.department_head_user_id, d.department_head_user_id) AS reported_to_user_id,
               pm.full_name AS project_manager_name,
               assignee.full_name AS current_assignee_name,
               COALESCE(dev.full_name, sprint_dev.full_name) AS developer_name, qa.full_name AS qa_name
        FROM requests r
        JOIN users requester ON requester.id = r.requester_user_id
        JOIN departments d ON d.id = r.requester_department_id
        LEFT JOIN users dh ON dh.id = r.department_head_user_id
        LEFT JOIN users current_dh ON current_dh.id = d.department_head_user_id
        LEFT JOIN users pm ON pm.id = r.project_manager_user_id
        LEFT JOIN users assignee ON assignee.id = r.current_assignee_user_id
        LEFT JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE
        LEFT JOIN users dev ON dev.id = a.developer_user_id
        LEFT JOIN users qa ON qa.id = a.qa_user_id
        LEFT JOIN users sprint_dev ON sprint_dev.id = (
          SELECT st.assigned_developer_user_id
          FROM sprint_tasks st
          JOIN sprints s ON s.id = st.sprint_id
          WHERE s.request_id = r.id AND st.assigned_developer_user_id IS NOT NULL
          ORDER BY st.updated_at DESC, st.id DESC
          LIMIT 1
        )
        WHERE {' AND '.join(filters)}
        ORDER BY r.updated_at DESC
        LIMIT 200
    """, params)
    return ok([request_with_roi_calculation(item) for item in request_rows])


@router.post("/")
def create_request(payload: RequestCreatePayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.get("department_id"):
        raise ApiError(400, "Your profile must have a department before creating requests.")
    department = one(db, """
        SELECT d.*, dh.full_name AS department_head_name, dh.email AS department_head_email
        FROM departments d
        LEFT JOIN users dh ON dh.id = d.department_head_user_id AND dh.status = 'ACTIVE'
        WHERE d.id = :id AND d.status = 'ACTIVE'
    """, {"id": user["department_id"]})
    reporting_authority_user_id = department.get("department_head_user_id") if department else None
    authority = one(db, 'SELECT id FROM users WHERE id = :id AND status = "ACTIVE"', {"id": reporting_authority_user_id}) if reporting_authority_user_id else None
    if not authority:
        raise ApiError(409, MISSING_REPORTING_AUTHORITY_MESSAGE)
    counter = one(
        db,
        """
        SELECT COALESCE(MAX(CAST(SUBSTRING(request_number, 4) AS UNSIGNED)), 0) + 1 AS next_number
        FROM requests
        WHERE request_number REGEXP '^RQ-[0-9]{3}$'
        """,
    )
    request_number = f"RQ-{int(counter['next_number']):03d}"
    result = execute(db, """
        INSERT INTO requests
          (request_number, title, request_type, priority, business_justification, description, expected_benefits,
           roi_type, roi_hours_saved_per_employee_per_month, roi_users_impacted, roi_time_saved_per_task,
           roi_time_saved_unit, roi_occurrences_per_month, roi_employees_benefited, roi_estimated_hourly_cost_inr,
           roi_estimated_revenue_impact_inr, roi_business_impact_category, roi_monthly_cost_savings_inr,
           status, requester_user_id, requester_department_id, department_head_user_id, current_assignee_user_id)
        VALUES (:requestNumber, :title, :requestType, :priority, :businessJustification, :description, :expectedBenefits,
                :roiType, :roiHoursSavedPerEmployeePerMonth, :roiUsersImpacted, :roiTimeSavedPerTask,
                :roiTimeSavedUnit, :roiOccurrencesPerMonth, :roiEmployeesBenefited, :roiEstimatedHourlyCostInr,
                :roiEstimatedRevenueImpactInr, :roiBusinessImpactCategory, :roiMonthlyCostSavingsInr,
                'DEPARTMENT_APPROVAL_PENDING', :requesterUserId, :requesterDepartmentId, :departmentHeadUserId, :currentAssigneeUserId)
    """, {
        "requestNumber": request_number,
        "title": payload.title,
        "requestType": payload.requestType,
        "priority": payload.priority,
        "businessJustification": payload.businessJustification,
        "description": payload.description,
        "expectedBenefits": payload.expectedBenefits,
        "roiType": payload.roiType,
        "roiHoursSavedPerEmployeePerMonth": payload.roiHoursSavedPerEmployeePerMonth if payload.roiType == "TIME_SAVINGS" else None,
        "roiUsersImpacted": payload.roiUsersImpacted,
        "roiTimeSavedPerTask": payload.roiTimeSavedPerTask,
        "roiTimeSavedUnit": payload.roiTimeSavedUnit,
        "roiOccurrencesPerMonth": payload.roiOccurrencesPerMonth,
        "roiEmployeesBenefited": payload.roiEmployeesBenefited,
        "roiEstimatedHourlyCostInr": payload.roiEstimatedHourlyCostInr,
        "roiEstimatedRevenueImpactInr": payload.roiEstimatedRevenueImpactInr,
        "roiBusinessImpactCategory": payload.roiBusinessImpactCategory,
        "roiMonthlyCostSavingsInr": payload.roiMonthlyCostSavingsInr if payload.roiType == "COST_SAVINGS" else None,
        "requesterUserId": user["id"],
        "requesterDepartmentId": user["department_id"],
        "departmentHeadUserId": reporting_authority_user_id,
        "currentAssigneeUserId": reporting_authority_user_id,
    })
    request_id = result.lastrowid
    execute(db, """
        INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
        VALUES (:id, NULL, 'SUBMITTED', :userId, 'Request submitted.'),
               (:id, 'SUBMITTED', 'DEPARTMENT_APPROVAL_PENDING', :userId, 'Routed to department head.')
    """, {"id": request_id, "userId": user["id"]})
    created_request = one(db, "SELECT created_at FROM requests WHERE id = :requestId", {"requestId": request_id})
    submitted_at = created_request.get("created_at") if created_request else datetime.now()
    submission_date = submitted_at.strftime("%Y-%m-%d %H:%M") if hasattr(submitted_at, "strftime") else str(submitted_at)
    request_type_label = payload.requestType.replace("_", " ").title()
    app_url = settings.public_app_base_url
    request_url = f"{app_url}/requests/{request_id}"
    email_subject = f"New Request Awaiting Your Approval – {request_number}"
    notification_message = (
        f"A new request has been submitted by {user['full_name']} and is awaiting your review and approval. "
        f"Request Number: {request_number}. Request Title: {payload.title}. Priority: {payload.priority}. Department: {department['name']}."
    )
    email_body = f"""Hello {department['department_head_name'] or 'Department Head'},

A new request has been submitted by {user['full_name']} and is awaiting your review and approval.

Request Number: {request_number}
Request Title: {payload.title}
Request Type: {request_type_label}
Priority: {payload.priority}
Requester Name: {user['full_name']}
Requester Employee ID: {user.get('employee_id') or 'N/A'}
Department: {department['name']}
Submission Date: {submission_date}

Please log in to RequestOps and review the request.

Open RequestOps: {request_url}
"""
    email_html_body = f"""
    <div style="font-family: Arial, sans-serif; color: #111827; line-height: 1.55;">
      <p>Hello {escape(department['department_head_name'] or 'Department Head')},</p>
      <p>A new request has been submitted by <strong>{escape(user['full_name'])}</strong> and is awaiting your review and approval.</p>
      <table style="border-collapse: collapse; width: 100%; max-width: 640px; margin: 16px 0;">
        <tr><td style="padding: 8px; font-weight: 700;">Request Number</td><td style="padding: 8px;">{escape(request_number)}</td></tr>
        <tr><td style="padding: 8px; font-weight: 700;">Request Title</td><td style="padding: 8px;">{escape(payload.title)}</td></tr>
        <tr><td style="padding: 8px; font-weight: 700;">Request Type</td><td style="padding: 8px;">{escape(request_type_label)}</td></tr>
        <tr><td style="padding: 8px; font-weight: 700;">Priority</td><td style="padding: 8px;">{escape(payload.priority)}</td></tr>
        <tr><td style="padding: 8px; font-weight: 700;">Requester Name</td><td style="padding: 8px;">{escape(user['full_name'])}</td></tr>
        <tr><td style="padding: 8px; font-weight: 700;">Requester Employee ID</td><td style="padding: 8px;">{escape(user.get('employee_id') or 'N/A')}</td></tr>
        <tr><td style="padding: 8px; font-weight: 700;">Department</td><td style="padding: 8px;">{escape(department['name'])}</td></tr>
        <tr><td style="padding: 8px; font-weight: 700;">Submission Date</td><td style="padding: 8px;">{escape(submission_date)}</td></tr>
      </table>
      <p>Please log in to RequestOps and review the request.</p>
      <p>
        <a href="{escape(request_url)}" style="display: inline-block; padding: 12px 18px; background: #2563eb; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 700;">
          Open RequestOps
        </a>
      </p>
    </div>
    """
    notify(
        db,
        recipient_user_id=reporting_authority_user_id,
        request_id=request_id,
        type="REQUEST_AWAITING_APPROVAL",
        title=email_subject,
        message=notification_message,
        background_tasks=background_tasks,
        email_subject=email_subject,
        email_body=email_body,
        email_html_body=email_html_body,
        email_actor_user_id=user["id"],
        audit_email=True,
        dedupe=True,
    )
    audit(db, actor_user_id=user["id"], action="REQUEST_CREATED", entity_type="REQUEST", entity_id=request_id, new_value=payload.model_dump(), request=request_context)
    if any([
        payload.roiType,
        payload.roiUsersImpacted,
        payload.roiTimeSavedPerTask,
        payload.roiOccurrencesPerMonth,
        payload.roiEmployeesBenefited,
        payload.roiEstimatedHourlyCostInr,
        payload.roiEstimatedRevenueImpactInr,
        payload.roiBusinessImpactCategory,
    ]):
        created_roi = {
            "roiType": payload.roiType,
            "roiHoursSavedPerEmployeePerMonth": payload.roiHoursSavedPerEmployeePerMonth,
            "roiUsersImpacted": payload.roiUsersImpacted,
            "roiTimeSavedPerTask": payload.roiTimeSavedPerTask,
            "roiTimeSavedUnit": payload.roiTimeSavedUnit,
            "roiOccurrencesPerMonth": payload.roiOccurrencesPerMonth,
            "roiEmployeesBenefited": payload.roiEmployeesBenefited,
            "roiEstimatedHourlyCostInr": payload.roiEstimatedHourlyCostInr,
            "roiEstimatedRevenueImpactInr": payload.roiEstimatedRevenueImpactInr,
            "roiBusinessImpactCategory": payload.roiBusinessImpactCategory,
            "roiMonthlyCostSavingsInr": payload.roiMonthlyCostSavingsInr,
        }
        created_roi = {**created_roi, **roi_calculation(created_roi)}
        execute(db, """
            INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
            VALUES (:requestId, 'DEPARTMENT_APPROVAL_PENDING', 'DEPARTMENT_APPROVAL_PENDING', :actorUserId, :comment)
        """, {
            "requestId": request_id,
            "actorUserId": user["id"],
            "comment": f"ROI Created. Calculated Annual ROI: {annual_roi_summary(created_roi)}.",
        })
        audit(db, actor_user_id=user["id"], action="ROI_CREATED", entity_type="REQUEST", entity_id=request_id, new_value=created_roi, request=request_context)
    db.commit()
    return ok({"id": request_id, "requestNumber": request_number}, 201)


@router.get("/{request_id}")
def request_detail(request_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = one(db, """
        SELECT r.*, requester.full_name AS requester_name, requester.email AS requester_email,
               d.name AS department_name, dh.full_name AS department_head_name,
               COALESCE(dh.full_name, current_dh.full_name) AS reported_to_name,
               COALESCE(r.department_head_user_id, d.department_head_user_id) AS reported_to_user_id,
               it.full_name AS it_head_name, pm.full_name AS project_manager_name,
               assignee.full_name AS current_assignee_name,
               active_assignment.id AS active_assignment_id,
               active_assignment.assigned_at AS active_assignment_assigned_at,
               active_assignment.assigned_by_user_id AS active_assignment_assigned_by_user_id,
               assignment_developer.id AS active_developer_user_id,
               assignment_developer.full_name AS active_developer_name,
               assignment_qa.id AS active_qa_user_id,
               assignment_qa.full_name AS active_qa_name,
               assignment_owner.full_name AS active_assignment_assigned_by_name,
               latest_progress.id AS latest_progress_update_id,
               latest_progress.progress_percentage AS latest_progress_percentage,
               latest_progress.update_notes AS latest_progress_notes,
               latest_progress.created_at AS latest_progress_updated_at,
               latest_progress_developer.full_name AS latest_progress_updated_by_name
        FROM requests r
        JOIN users requester ON requester.id = r.requester_user_id
        JOIN departments d ON d.id = r.requester_department_id
        LEFT JOIN users dh ON dh.id = r.department_head_user_id
        LEFT JOIN users current_dh ON current_dh.id = d.department_head_user_id
        LEFT JOIN users it ON it.id = r.it_head_user_id
        LEFT JOIN users pm ON pm.id = r.project_manager_user_id
        LEFT JOIN users assignee ON assignee.id = r.current_assignee_user_id
        LEFT JOIN assignments active_assignment ON active_assignment.request_id = r.id AND active_assignment.is_active = TRUE
        LEFT JOIN users assignment_developer ON assignment_developer.id = active_assignment.developer_user_id
        LEFT JOIN users assignment_qa ON assignment_qa.id = active_assignment.qa_user_id
        LEFT JOIN users assignment_owner ON assignment_owner.id = active_assignment.assigned_by_user_id
        LEFT JOIN development_updates latest_progress
          ON latest_progress.id = (SELECT du.id FROM development_updates du WHERE du.request_id = r.id ORDER BY du.created_at DESC, du.id DESC LIMIT 1)
        LEFT JOIN users latest_progress_developer ON latest_progress_developer.id = latest_progress.developer_user_id
        WHERE r.id = :id
    """, {"id": request_id})
    if not request_row:
        raise ApiError(404, "Request not found.")
    assert_can_view(db, user, request_row)
    return ok(request_with_roi_calculation(request_row))


def update_request_details_impl(request_id: int, payload: RequestDetailsPayload, request_context: FastAPIRequest, user: dict, db: Session):
    request_row = assert_request_access(db, user, request_id)
    editable_statuses = {"SUBMITTED", "DEPARTMENT_APPROVAL_PENDING", "CLARIFICATION_REQUESTED", "IT_REVIEW_PENDING"}
    if request_row["status"] not in editable_statuses:
        raise ApiError(409, "Request details can only be edited before review progresses beyond department approval.")
    is_requester_editor = int(request_row["requester_user_id"]) == int(user["id"])
    is_department_head_editor = (
        request_row["status"] == "DEPARTMENT_APPROVAL_PENDING"
        and user["role_code"] == "DEPARTMENT_HEAD"
        and int(request_row.get("reported_to_user_id") or request_row.get("department_head_user_id") or 0) == int(user["id"])
    )
    is_it_head_editor = False
    if request_row["status"] == "IT_REVIEW_PENDING" and user["role_code"] in ["IT_HEAD", "SYSTEM_ADMIN"]:
        assert_can_act_as_it_head(db, user, request_row)
        is_it_head_editor = True
    if not (is_requester_editor or is_department_head_editor or is_it_head_editor or user["role_code"] == "SYSTEM_ADMIN"):
        raise ApiError(403, "Only the requester, assigned Department HOD, or assigned IT HOD can update request details at this stage.")
    previous = {
        "title": request_row.get("title"),
        "businessJustification": request_row.get("business_justification"),
        "description": request_row.get("description"),
        "expectedBenefits": request_row.get("expected_benefits"),
    }
    execute(db, """
        UPDATE requests
        SET title = :title, business_justification = :businessJustification,
            description = :description, expected_benefits = :expectedBenefits
        WHERE id = :requestId
    """, {"requestId": request_id, **payload.model_dump()})
    audit(db, actor_user_id=user["id"], action="REQUEST_DETAILS_UPDATED", entity_type="REQUEST", entity_id=request_id, old_value=previous, new_value={**payload.model_dump(), "status": request_row["status"]}, request=request_context)
    db.commit()
    return ok(get_request_by_id(db, request_id))


@router.patch("/{request_id}/details")
def patch_details(request_id: int, payload: RequestDetailsPayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return update_request_details_impl(request_id, payload, request_context, user, db)


@router.post("/{request_id}/details")
def post_details(request_id: int, payload: RequestDetailsPayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return update_request_details_impl(request_id, payload, request_context, user, db)


@router.get("/{request_id}/timeline")
def timeline(request_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    return ok(rows(db, """
        SELECT h.*, u.full_name AS changed_by_name, u.email AS changed_by_email
        FROM request_status_history h
        JOIN users u ON u.id = h.changed_by_user_id
        WHERE h.request_id = :requestId
        ORDER BY h.changed_at
    """, {"requestId": request_row["id"]}))


@router.post("/{request_id}/roi")
def update_roi(request_id: int, payload: RoiPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEPARTMENT_HEAD", "IT_HEAD"])
    if user["role_code"] == "IT_HEAD":
        if request_row["status"] != "IT_REVIEW_PENDING":
            raise ApiError(409, "IT HOD can edit ROI only during internal review.")
        assert_can_act_as_it_head(db, user, request_row)
    else:
        assert_can_act_as_department_head(db, user, request_row)
    previous = roi_snapshot(request_row)
    next_roi = payload.model_dump()
    next_roi = {
        "roiType": next_roi.get("roiType"),
        "roiHoursSavedPerEmployeePerMonth": next_roi.get("roiHoursSavedPerEmployeePerMonth") if next_roi.get("roiType") == "TIME_SAVINGS" else None,
        "roiUsersImpacted": next_roi.get("roiUsersImpacted"),
        "roiTimeSavedPerTask": next_roi.get("roiTimeSavedPerTask"),
        "roiTimeSavedUnit": next_roi.get("roiTimeSavedUnit"),
        "roiOccurrencesPerMonth": next_roi.get("roiOccurrencesPerMonth"),
        "roiEmployeesBenefited": next_roi.get("roiEmployeesBenefited"),
        "roiEstimatedHourlyCostInr": next_roi.get("roiEstimatedHourlyCostInr"),
        "roiEstimatedRevenueImpactInr": next_roi.get("roiEstimatedRevenueImpactInr"),
        "roiBusinessImpactCategory": next_roi.get("roiBusinessImpactCategory"),
        "roiMonthlyCostSavingsInr": next_roi.get("roiMonthlyCostSavingsInr") if next_roi.get("roiType") == "COST_SAVINGS" else None,
    }
    next_roi = {**next_roi, **roi_calculation(next_roi)}
    execute(db, """
        UPDATE requests
        SET roi_type = :roiType,
            roi_hours_saved_per_employee_per_month = :roiHoursSavedPerEmployeePerMonth,
            roi_users_impacted = :roiUsersImpacted,
            roi_time_saved_per_task = :roiTimeSavedPerTask,
            roi_time_saved_unit = :roiTimeSavedUnit,
            roi_occurrences_per_month = :roiOccurrencesPerMonth,
            roi_employees_benefited = :roiEmployeesBenefited,
            roi_estimated_hourly_cost_inr = :roiEstimatedHourlyCostInr,
            roi_estimated_revenue_impact_inr = :roiEstimatedRevenueImpactInr,
            roi_business_impact_category = :roiBusinessImpactCategory,
            roi_monthly_cost_savings_inr = :roiMonthlyCostSavingsInr
        WHERE id = :requestId
    """, {
        "requestId": request_id,
        "roiType": next_roi.get("roiType"),
        "roiHoursSavedPerEmployeePerMonth": next_roi.get("roiHoursSavedPerEmployeePerMonth"),
        "roiUsersImpacted": next_roi.get("roiUsersImpacted"),
        "roiTimeSavedPerTask": next_roi.get("roiTimeSavedPerTask"),
        "roiTimeSavedUnit": next_roi.get("roiTimeSavedUnit"),
        "roiOccurrencesPerMonth": next_roi.get("roiOccurrencesPerMonth"),
        "roiEmployeesBenefited": next_roi.get("roiEmployeesBenefited"),
        "roiEstimatedHourlyCostInr": next_roi.get("roiEstimatedHourlyCostInr"),
        "roiEstimatedRevenueImpactInr": next_roi.get("roiEstimatedRevenueImpactInr"),
        "roiBusinessImpactCategory": next_roi.get("roiBusinessImpactCategory"),
        "roiMonthlyCostSavingsInr": next_roi.get("roiMonthlyCostSavingsInr"),
    })
    execute(db, """
        INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
        VALUES (:requestId, :status, :status, :actorUserId, :comment)
    """, {
        "requestId": request_id,
        "status": request_row["status"],
        "actorUserId": user["id"],
        "comment": f"ROI Updated by {user.get('role_code', 'Reviewer').replace('_', ' ').title()}. Previous: {annual_roi_summary(previous)}. Updated: {annual_roi_summary(next_roi)}.",
    })
    notify(db, recipient_user_id=request_row["requester_user_id"], request_id=request_id, type="ROI_UPDATED", title="ROI information updated", message=f"ROI was updated for {request_row['request_number']}. Calculated annual ROI: {annual_roi_summary(next_roi)}.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="ROI_UPDATED", entity_type="REQUEST", entity_id=request_id, old_value=previous, new_value=next_roi, request=request_context)
    db.commit()
    return ok(request_with_roi_calculation(get_request_by_id(db, request_id)))


@router.post("/{request_id}/report/audit")
def audit_report_view(request_id: int, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    audit(db, actor_user_id=user["id"], action="REQUEST_REPORT_GENERATED", entity_type="REQUEST", entity_id=request_row["id"], request=request_context)
    db.commit()
    return ok({"success": True})


@router.get("/{request_id}/comments")
def comments(request_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    return ok(rows(db, """
        SELECT c.*, u.full_name AS user_name, u.email AS user_email
        FROM request_comments c
        JOIN users u ON u.id = c.user_id
        WHERE c.request_id = :requestId
        ORDER BY c.created_at DESC
    """, {"requestId": request_row["id"]}))


@router.get("/{request_id}/development-updates")
def development_updates(request_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    return ok(rows(db, """
        SELECT du.*, developer.full_name AS developer_name, developer.email AS developer_email,
               attachment.original_file_name AS attachment_name,
               attachment.mime_type AS attachment_mime_type,
               attachment.file_size_bytes AS attachment_size_bytes
        FROM development_updates du
        JOIN users developer ON developer.id = du.developer_user_id
        LEFT JOIN request_attachments attachment ON attachment.id = du.attachment_id
        WHERE du.request_id = :requestId
        ORDER BY du.created_at DESC, du.id DESC
    """, {"requestId": request_row["id"]}))


@router.get("/{request_id}/clarifications")
def clarifications(request_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    return ok(rows(db, """
        SELECT c.*, requested_by.full_name AS requested_by_name, requested_by.email AS requested_by_email,
               responded_by.full_name AS responded_by_name
        FROM request_clarifications c
        JOIN users requested_by ON requested_by.id = c.requested_by_user_id
        LEFT JOIN users responded_by ON responded_by.id = c.responded_by_user_id
        WHERE c.request_id = :requestId
        ORDER BY c.requested_at DESC
    """, {"requestId": request_row["id"]}))


@router.post("/{request_id}/comments")
def create_comment(request_id: int, payload: CommentPayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    comment_id = add_comment(db, request_row["id"], user["id"], payload.commentType, payload.commentText, payload.isInternal)
    audit(db, actor_user_id=user["id"], action="REQUEST_COMMENT_ADDED", entity_type="REQUEST", entity_id=request_row["id"], new_value=payload.model_dump(), request=request_context)
    db.commit()
    return ok({"id": comment_id}, 201)


@router.get("/{request_id}/attachments")
def attachments(request_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    return ok(rows(db, """
        SELECT a.*, u.full_name AS uploaded_by_name
        FROM request_attachments a
        JOIN users u ON u.id = a.uploaded_by_user_id
        WHERE a.request_id = :requestId
        ORDER BY a.uploaded_at DESC
    """, {"requestId": request_row["id"]}))


def insert_attachment(db: Session, request_id: int, user_id: int, upload: dict) -> int:
    result = execute(db, """
        INSERT INTO request_attachments
          (request_id, uploaded_by_user_id, file_name, original_file_name, mime_type, file_size_bytes, storage_path)
        VALUES (:requestId, :uploadedBy, :fileName, :originalFileName, :mimeType, :fileSize, :storagePath)
    """, {
        "requestId": request_id,
        "uploadedBy": user_id,
        "fileName": upload["file_name"],
        "originalFileName": upload["original_file_name"],
        "mimeType": upload["mime_type"],
        "fileSize": upload["file_size_bytes"],
        "storagePath": upload["storage_path"],
    })
    return result.lastrowid


@router.post("/{request_id}/attachments")
def upload_attachment(request_id: int, request_context: FastAPIRequest, file: UploadFile = File(...), user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    if not file:
        raise ApiError(400, "Attachment file is required.")
    attachment_id = insert_attachment(db, request_row["id"], user["id"], save_upload(file))
    audit(db, actor_user_id=user["id"], action="REQUEST_ATTACHMENT_UPLOADED", entity_type="REQUEST", entity_id=request_row["id"], new_value={"attachmentId": attachment_id}, request=request_context)
    db.commit()
    return ok({"id": attachment_id}, 201)


def attachment_response(request_id: int, attachment_id: int, user: dict, db: Session, download: bool):
    request_row = assert_request_access(db, user, request_id)
    attachment = one(db, "SELECT * FROM request_attachments WHERE id = :attachmentId AND request_id = :requestId", {"attachmentId": attachment_id, "requestId": request_row["id"]})
    if not attachment:
        raise ApiError(404, "Attachment not found.")
    path = Path(attachment["storage_path"])
    if not path.exists():
        raise ApiError(404, "Attachment file not found.")
    disposition = "attachment" if download else "inline"
    return FileResponse(path, media_type=attachment.get("mime_type") or "application/octet-stream", filename=attachment["original_file_name"], headers={"Content-Disposition": f'{disposition}; filename="{attachment["original_file_name"]}"'})


@router.get("/{request_id}/attachments/{attachment_id}/preview")
def preview_attachment(request_id: int, attachment_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return attachment_response(request_id, attachment_id, user, db, False)


@router.get("/{request_id}/attachments/{attachment_id}/download")
def download_attachment(request_id: int, attachment_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return attachment_response(request_id, attachment_id, user, db, True)


@router.post("/{request_id}/department-approval/approve")
def department_approve(request_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEPARTMENT_HEAD"])
    head_id = assert_can_act_as_department_head(db, user, request_row)
    it_head_id = resolve_request_it_head_id(db, request_row)
    add_comment(db, request_row["id"], user["id"], "APPROVAL", payload.comment)
    updated = transition_request(db, request_id=request_row["id"], to_status="IT_REVIEW_PENDING", actor_user_id=user["id"], comment=payload.comment or "Department approved.", request_context=request_context, patch={"department_head_user_id": head_id, "it_head_user_id": it_head_id, "current_assignee_user_id": it_head_id})
    notify(db, recipient_user_id=it_head_id, request_id=request_row["id"], type="REQUEST_IT_REVIEW_PENDING", title="Request awaiting internal review", message=f"{request_row['request_number']} has been approved by the department and is ready for internal review.", background_tasks=background_tasks)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/department-approval/reject")
def department_reject(request_id: int, payload: RequiredCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEPARTMENT_HEAD"])
    head_id = assert_can_act_as_department_head(db, user, request_row)
    add_comment(db, request_row["id"], user["id"], "REJECTION", payload.comment)
    updated = transition_request(db, request_id=request_row["id"], to_status="DEPARTMENT_REJECTED", actor_user_id=user["id"], comment=payload.comment, request_context=request_context, patch={"department_head_user_id": head_id})
    notify(db, recipient_user_id=request_row["requester_user_id"], request_id=request_row["id"], type="REQUEST_REJECTED", title="Request rejected", message=f"{request_row['request_number']} was rejected by the department.", background_tasks=background_tasks)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/department-approval/request-clarification")
def department_clarification(request_id: int, payload: ClarificationPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEPARTMENT_HEAD"])
    head_id = assert_can_act_as_department_head(db, user, request_row)
    if request_row["status"] != "DEPARTMENT_APPROVAL_PENDING":
        raise ApiError(409, "Clarification can only be requested during department approval.")
    updated = create_clarification_request(db, request_row=request_row, actor_user_id=user["id"], reason_category=payload.reasonCategory, note=payload.note, return_status="DEPARTMENT_APPROVAL_PENDING", return_assignee_user_id=head_id, request_context=request_context, background_tasks=background_tasks, patch={"department_head_user_id": head_id})
    db.commit()
    return ok(updated)


@router.post("/{request_id}/clarification/respond")
def clarification_respond(request_id: int, payload: ClarificationResponsePayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    if request_row["requester_user_id"] != user["id"] and user["role_code"] != "SYSTEM_ADMIN":
        raise ApiError(403, "Only the requester can respond to clarification.")
    if request_row["status"] != "CLARIFICATION_REQUESTED":
        raise ApiError(409, "This request is not awaiting clarification.")
    clarification = one(db, """
        SELECT * FROM request_clarifications
        WHERE request_id = :requestId AND status = 'OPEN'
        ORDER BY requested_at DESC
        LIMIT 1
    """, {"requestId": request_row["id"]})
    if not clarification:
        raise ApiError(409, "No open clarification request was found.")
    execute(db, """
        UPDATE request_clarifications
        SET status = 'RESOLVED', responded_by_user_id = :respondedBy, response_note = :responseNote, responded_at = CURRENT_TIMESTAMP
        WHERE id = :id
    """, {"id": clarification["id"], "respondedBy": user["id"], "responseNote": payload.comment})
    updated = transition_request(db, request_id=request_row["id"], to_status=clarification["return_status"], actor_user_id=user["id"], comment=f"Clarification response submitted. {payload.comment}", request_context=request_context, patch={"current_assignee_user_id": clarification.get("return_assignee_user_id")})
    notify(db, recipient_user_id=clarification["requested_by_user_id"], request_id=request_row["id"], type="CLARIFICATION_RESPONDED", title="Clarification received", message=f"{request_row['request_number']} has been resubmitted with clarification.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="REQUEST_CLARIFICATION_RESPONDED", entity_type="REQUEST", entity_id=request_row["id"], new_value={"clarificationId": clarification["id"], "responseNote": payload.comment}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/it-review/approve")
def it_review_approve(request_id: int, payload: ItReviewApprovePayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["IT_HEAD"])
    add_comment(db, request_row["id"], user["id"], "APPROVAL", payload.comment or payload.feasibilityNotes, True)
    updated = transition_request(db, request_id=request_row["id"], to_status="ASSIGNMENT_PENDING", actor_user_id=user["id"], comment=payload.comment or "IT HOD approved. Project Manager assignment is required.", request_context=request_context, patch={"it_head_user_id": user["id"], "current_assignee_user_id": user["id"], "feasibility_notes": payload.feasibilityNotes, "complexity": payload.complexity, "estimated_effort": payload.estimatedEffort, "priority_confirmation": payload.priorityConfirmation, "priority": payload.priorityConfirmation})
    notify(db, recipient_user_id=user["id"], request_id=request_row["id"], type="PROJECT_MANAGER_ASSIGNMENT_PENDING", title="Project Manager assignment required", message=f"{request_row['request_number']} is approved by IT and needs a Project Manager.", background_tasks=background_tasks)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/it-review/reject")
def it_review_reject(request_id: int, payload: RequiredCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["IT_HEAD"])
    add_comment(db, request_row["id"], user["id"], "REJECTION", payload.comment, True)
    updated = transition_request(db, request_id=request_row["id"], to_status="IT_REJECTED", actor_user_id=user["id"], comment=payload.comment, request_context=request_context)
    notify(db, recipient_user_id=request_row["requester_user_id"], request_id=request_row["id"], type="REQUEST_REJECTED", title="Request rejected by IT", message=f"{request_row['request_number']} was rejected by IT.", background_tasks=background_tasks)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/it-review/request-clarification")
def it_review_clarification(request_id: int, payload: ClarificationPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["IT_HEAD"])
    if request_row["status"] != "IT_REVIEW_PENDING":
        raise ApiError(409, "Clarification can only be requested during internal review.")
    updated = create_clarification_request(db, request_row=request_row, actor_user_id=user["id"], reason_category=payload.reasonCategory, note=payload.note, return_status="IT_REVIEW_PENDING", return_assignee_user_id=user["id"], request_context=request_context, background_tasks=background_tasks)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/it-review/defer")
def it_review_defer(request_id: int, payload: RequiredCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["IT_HEAD"])
    add_comment(db, request_row["id"], user["id"], "GENERAL", payload.comment, True)
    updated = transition_request(db, request_id=request_row["id"], to_status="DEFERRED", actor_user_id=user["id"], comment=f"Request deferred. {payload.comment}", request_context=request_context)
    notify(db, recipient_user_id=request_row["requester_user_id"], request_id=request_row["id"], type="REQUEST_DEFERRED", title="Request deferred", message=f"{request_row['request_number']} was deferred by IT. Reason: {payload.comment}", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="REQUEST_DEFERRED", entity_type="REQUEST", entity_id=request_row["id"], new_value={"comment": payload.comment}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/it-review/resume")
def it_review_resume(request_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["IT_HEAD"])
    if request_row["status"] != "DEFERRED":
        raise ApiError(409, "Only deferred requests can be resumed.")
    it_head_id = resolve_request_it_head_id(db, request_row)
    if user["role_code"] != "SYSTEM_ADMIN" and int(user["id"]) != int(it_head_id):
        raise ApiError(403, "Only the assigned IT HOD can resume this deferred request.")
    comment = payload.comment or "Deferred request resumed for IT review."
    add_comment(db, request_row["id"], user["id"], "GENERAL", comment, True)
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status="IT_REVIEW_PENDING",
        actor_user_id=user["id"],
        comment=comment,
        request_context=request_context,
        patch={"it_head_user_id": it_head_id, "current_assignee_user_id": it_head_id},
    )
    for recipient_id in unique_recipient_ids(request_row["requester_user_id"], it_head_id):
        notify(db, recipient_user_id=recipient_id, request_id=request_row["id"], type="DEFERRED_REQUEST_RESUMED", title="Deferred request resumed", message=f"{request_row['request_number']} has been resumed and is back in IT review.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="DEFERRED_REQUEST_RESUMED", entity_type="REQUEST", entity_id=request_row["id"], new_value={"comment": comment, "itHeadUserId": it_head_id}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/project-manager/assign")
def project_manager_assign(request_id: int, payload: ProjectManagerAssignPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["IT_HEAD"])
    if request_row["status"] not in ["ASSIGNMENT_PENDING", "PM_ASSIGNED"]:
        raise ApiError(409, "Project Manager can only be assigned after IT HOD approval.")
    project_manager = assert_active_role_user(db, payload.projectManagerUserId, "PROJECT_MANAGER", "Project Manager")
    previous_pm = request_row.get("project_manager_user_id")
    assigned = assign_project_manager(db, request_row["id"], payload.projectManagerUserId)
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status="PM_ASSIGNED",
        actor_user_id=user["id"],
        comment=payload.notes or f"Project Manager assigned: {project_manager['full_name']}.",
        request_context=request_context,
        patch={"project_manager_user_id": payload.projectManagerUserId, "current_assignee_user_id": payload.projectManagerUserId},
    )
    notify(db, recipient_user_id=payload.projectManagerUserId, request_id=request_row["id"], type="PROJECT_MANAGER_ASSIGNED", title="Project assigned to you", message=f"{request_row['request_number']} is assigned to you for scope and delivery planning.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="PROJECT_MANAGER_ASSIGNED", entity_type="REQUEST", entity_id=request_row["id"], old_value={"projectManagerUserId": previous_pm}, new_value={"projectManagerUserId": payload.projectManagerUserId, "assigned": assigned}, request=request_context)
    db.commit()
    return ok(updated)


@router.get("/{request_id}/scopes")
def scopes(request_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    return ok(list_project_scopes(db, request_row["id"]))


@router.post("/{request_id}/scopes")
def create_scope(request_id: int, payload: ProjectScopePayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] not in ["PM_ASSIGNED", "REQUIREMENTS_CLARIFICATION_REQUESTED"]:
        raise ApiError(409, "Scope can only be created after Project Manager assignment.")
    if list_project_scopes(db, request_row["id"]):
        raise ApiError(409, "Only one scope definition can be created for a request.")
    scope = create_project_scope(db, request_row["id"], user["id"], {**payload.model_dump(), "status": "DRAFT"})
    audit(db, actor_user_id=user["id"], action="PROJECT_SCOPE_CREATED", entity_type="REQUEST", entity_id=request_row["id"], new_value=scope, request=request_context)
    db.commit()
    return ok(scope, 201)


@router.put("/{request_id}/scopes/{scope_id}")
def update_scope(request_id: int, scope_id: int, payload: ProjectScopePayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER", "DEPARTMENT_HEAD", "IT_HEAD"])
    existing = assert_scope_belongs_to_request(db, scope_id, request_row["id"])
    payload_dict = payload.model_dump()
    field_changes = changed_fields(existing, payload_dict, {
        "scopeTitle": "scope_title",
        "scopeDescription": "scope_description",
        "businessObjectives": "business_objectives",
        "inScope": "in_scope",
        "outOfScope": "out_of_scope",
    })
    reviewer_role = requirements_reviewer_role_for_status(request_row["status"])
    if reviewer_role:
        current_role, _ = assert_can_review_requirements(db, user, request_row)
        updated = update_project_scope(db, scope_id, payload_dict)
        request_update = create_revision_after_reviewer_edit(
            db,
            request_row=request_row,
            user=user,
            reviewer_role=current_role,
            artifact_type="SCOPE",
            artifact_id=scope_id,
            field_changes=field_changes,
            reviewer_comment=payload.reviewerComment,
            request_context=request_context,
            background_tasks=background_tasks,
        )
        audit(db, actor_user_id=user["id"], action="REQUIREMENTS_SCOPE_UPDATED_BY_REVIEWER", entity_type="PROJECT_SCOPE", entity_id=scope_id, old_value=existing, new_value=updated, request=request_context)
        db.commit()
        return ok(request_update if field_changes else updated)

    assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] not in ["PM_ASSIGNED", "REQUIREMENTS_CLARIFICATION_REQUESTED"]:
        raise ApiError(409, "Scope can only be edited while drafting or responding to requirements clarification.")
    if existing["status"] == "APPROVED" and request_row["status"] != "REQUIREMENTS_CLARIFICATION_REQUESTED":
        raise ApiError(409, "Approved scope definitions cannot be edited.")
    updated = update_project_scope(db, scope_id, payload_dict)
    if existing["status"] == "REWORK_REQUIRED":
        execute(db, """
            UPDATE project_scopes
            SET status = 'DRAFT', reviewed_by_user_id = NULL, review_comments = NULL, reviewed_at = NULL
            WHERE id = :scopeId
        """, {"scopeId": scope_id})
        updated = assert_scope_belongs_to_request(db, scope_id, request_row["id"])
    elif request_row["status"] == "REQUIREMENTS_CLARIFICATION_REQUESTED":
        execute(db, """
            UPDATE project_scopes
            SET status = 'DRAFT', reviewed_by_user_id = NULL, review_comments = NULL, reviewed_at = NULL
            WHERE id = :scopeId
        """, {"scopeId": scope_id})
        updated = assert_scope_belongs_to_request(db, scope_id, request_row["id"])
    audit(db, actor_user_id=user["id"], action="PROJECT_SCOPE_UPDATED", entity_type="PROJECT_SCOPE", entity_id=scope_id, old_value=existing, new_value=updated, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/scopes/{scope_id}/submit")
def submit_scope(request_id: int, scope_id: int, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    scope = assert_scope_belongs_to_request(db, scope_id, request_row["id"])
    if scope["status"] == "APPROVED":
        raise ApiError(409, "Approved scope definitions cannot be resubmitted.")
    execute(db, "UPDATE project_scopes SET status = 'SUBMITTED' WHERE id = :scopeId", {"scopeId": scope_id})
    head_id = get_request_department_head_id(db, request_row)
    updated = transition_request(db, request_id=request_row["id"], to_status="SCOPE_REVIEW", actor_user_id=user["id"], comment=f"Scope submitted: {scope['scope_title']}.", request_context=request_context, patch={"current_assignee_user_id": head_id})
    notify(db, recipient_user_id=head_id, request_id=request_row["id"], type="SCOPE_SUBMITTED", title="Scope submitted", message=f"{request_row['request_number']} has a submitted scope definition for Department HOD review.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="PROJECT_SCOPE_SUBMITTED", entity_type="PROJECT_SCOPE", entity_id=scope_id, new_value={"status": "SUBMITTED"}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/planning/submit")
def submit_planning_package(request_id: int, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    pm_id = assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] not in ["PM_ASSIGNED", "REQUIREMENTS_CLARIFICATION_REQUESTED"]:
        raise ApiError(409, "Planning package can only be submitted before developer assignment.")
    scopes, stories = assert_planning_artifacts_ready(db, request_row["id"])
    execute(db, """
        UPDATE project_scopes
        SET status = 'SUBMITTED'
        WHERE request_id = :requestId AND status IN ('DRAFT', 'REWORK_REQUIRED')
    """, {"requestId": request_row["id"]})
    execute(db, """
        UPDATE user_stories
        SET status = 'SUBMITTED'
        WHERE request_id = :requestId AND status IN ('DRAFT', 'REWORK_REQUIRED')
    """, {"requestId": request_row["id"]})
    head_id = get_request_department_head_id(db, request_row)
    revision = create_requirement_revision(
        db,
        request_id=request_row["id"],
        actor_user_id=user["id"],
        status="UNDER_DEPARTMENT_REVIEW",
        pending_reviewer_role_code="DEPARTMENT_HEAD",
        change_summary="Project Manager submitted requirements package for Department HOD review.",
        seed_review_role_code="PROJECT_MANAGER",
        seed_review_user_id=pm_id,
        seed_review_comments="Project Manager submitted and approved this revision for Department HOD review.",
    )
    open_clarification = one(db, """
        SELECT id FROM request_clarifications
        WHERE request_id = :requestId AND status = 'OPEN' AND stage_status = 'REQUIREMENTS_CLARIFICATION_REQUESTED'
        ORDER BY requested_at DESC
        LIMIT 1
    """, {"requestId": request_row["id"]})
    if open_clarification:
        execute(db, """
            UPDATE request_clarifications
            SET status = 'RESOLVED', responded_by_user_id = :respondedBy, response_note = 'Requirements updated and resubmitted.', responded_at = CURRENT_TIMESTAMP
            WHERE id = :id
        """, {"id": open_clarification["id"], "respondedBy": user["id"]})
    updated = transition_request(db, request_id=request_row["id"], to_status="REQUIREMENTS_DEPARTMENT_REVIEW", actor_user_id=user["id"], comment="Requirements package submitted for Department HOD review.", request_context=request_context, patch={"current_assignee_user_id": head_id})
    for recipient_id in unique_recipient_ids(head_id, pm_id):
        notify(db, recipient_user_id=recipient_id, request_id=request_row["id"], type="REQUIREMENTS_REVIEW_PENDING", title="Requirements revision submitted", message=f"{request_row['request_number']} revision {revision['revision_number']} is awaiting Department HOD review.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="REQUIREMENTS_SUBMITTED", entity_type="REQUEST", entity_id=request_row["id"], new_value={"revisionId": revision["id"], "revisionNumber": revision["revision_number"], "scopeCount": len(scopes), "storyCount": len(stories)}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/planning/return-to-pm")
def return_planning_to_pm(request_id: int, payload: RequiredCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEPARTMENT_HEAD"])
    assert_can_act_as_department_head(db, user, request_row)
    if request_row["status"] not in ["SCOPE_REVIEW", "USER_STORY_REVIEW"]:
        raise ApiError(409, "Planning can only be returned during Department HOD planning review.")
    pm_id = request_row.get("project_manager_user_id")
    if not pm_id:
        raise ApiError(409, "Project Manager must be assigned before returning planning for rework.")
    add_comment(db, request_row["id"], user["id"], "CLARIFICATION", payload.comment)
    updated = transition_request(db, request_id=request_row["id"], to_status="PM_ASSIGNED", actor_user_id=user["id"], comment=f"Planning returned to Project Manager. {payload.comment}", request_context=request_context, patch={"current_assignee_user_id": pm_id})
    notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="PLANNING_REWORK_REQUIRED", title="Planning returned for updates", message=f"{request_row['request_number']} planning needs updates: {payload.comment}", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="PLANNING_RETURNED_TO_PM", entity_type="REQUEST", entity_id=request_row["id"], new_value={"comment": payload.comment}, request=request_context)
    db.commit()
    return ok(updated)


@router.get("/{request_id}/requirements-review")
def requirements_review_package(request_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    return ok(get_requirement_review_package(db, request_row["id"]))


@router.post("/{request_id}/requirements-review/update-package")
def update_requirements_package(request_id: int, payload: RequirementPackageUpdatePayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEPARTMENT_HEAD", "PROJECT_MANAGER"])
    reviewer_role, _ = assert_can_review_requirements(db, user, request_row)
    scope = one(db, "SELECT * FROM project_scopes WHERE request_id = :requestId ORDER BY created_at DESC, id DESC LIMIT 1", {"requestId": request_row["id"]})
    if not scope:
        raise ApiError(409, "A scope document is required before requirements can be updated.")

    package_changes: list[tuple[str, int | None, str, object, object]] = []
    scope_payload = payload.scope.model_dump()
    scope_changes = changed_fields(scope, scope_payload, {
        "scopeTitle": "scope_title",
        "scopeDescription": "scope_description",
        "businessObjectives": "business_objectives",
        "inScope": "in_scope",
        "outOfScope": "out_of_scope",
    })
    if scope_changes:
        update_project_scope(db, scope["id"], scope_payload)
        package_changes.extend(("SCOPE", scope["id"], field_name, old_value, new_value) for field_name, old_value, new_value in scope_changes)

    existing_stories = {int(story["id"]): story for story in list_user_stories(db, request_row["id"])}
    for story_payload_model in payload.userStories:
        story_payload = story_payload_model.model_dump()
        story_id = story_payload.get("id")
        if story_payload_model.delete:
            if story_id and int(story_id) in existing_stories:
                existing_story = existing_stories[int(story_id)]
                execute(db, "DELETE FROM user_stories WHERE id = :storyId", {"storyId": story_id})
                package_changes.append(("USER_STORY", int(story_id), "deleted", existing_story.get("title"), "Deleted"))
            continue

        story_values = {
            "storyKey": story_payload.get("storyKey"),
            "title": story_payload.get("title") or "",
            "description": story_payload.get("description") or "",
            "acceptanceCriteria": story_payload.get("acceptanceCriteria") or "",
            "priority": story_payload.get("priority") or "MEDIUM",
            "status": "DRAFT",
        }
        if story_id and int(story_id) in existing_stories:
            existing_story = existing_stories[int(story_id)]
            story_changes = changed_fields(existing_story, story_values, {
                "storyKey": "story_key",
                "title": "title",
                "description": "description",
                "acceptanceCriteria": "acceptance_criteria",
                "priority": "priority",
            })
            if story_changes:
                update_user_story(db, int(story_id), story_values)
                package_changes.extend(("USER_STORY", int(story_id), field_name, old_value, new_value) for field_name, old_value, new_value in story_changes)
        else:
            created_story = create_user_story(db, request_row["id"], user["id"], story_values)
            if created_story:
                package_changes.append(("USER_STORY", int(created_story["id"]), "created", None, created_story.get("title")))

    if not package_changes:
        raise ApiError(400, "No requirement changes were found.")

    request_update = create_revision_after_reviewer_edit(
        db,
        request_row=request_row,
        user=user,
        reviewer_role=reviewer_role,
        artifact_type=package_changes[0][0],
        artifact_id=package_changes[0][1],
        field_changes=[(package_changes[0][2], package_changes[0][3], package_changes[0][4])],
        reviewer_comment=payload.changeJustification,
        request_context=request_context,
        background_tasks=background_tasks,
    )
    revision = get_latest_requirement_revision(db, request_row["id"])
    for artifact_type, artifact_id, field_name, old_value, new_value in package_changes[1:]:
        record_requirement_change(
            db,
            request_id=request_row["id"],
            revision_id=revision["id"],
            actor_user_id=user["id"],
            artifact_type=artifact_type,
            artifact_id=artifact_id,
            change_type="UPDATED",
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            change_summary=f"{format_role_label(reviewer_role)} updated {format_enum_for_audit(field_name)}. {payload.changeJustification}",
        )

    audit(db, actor_user_id=user["id"], action="REQUIREMENTS_PACKAGE_UPDATED", entity_type="REQUEST", entity_id=request_row["id"], new_value={"changeCount": len(package_changes), "comment": payload.changeJustification}, request=request_context)
    db.commit()
    return ok(request_update)


@router.post("/{request_id}/requirements-review/approve")
def approve_requirements(request_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEPARTMENT_HEAD", "PROJECT_MANAGER"])
    reviewer_role, reviewer_user_id = assert_can_review_requirements(db, user, request_row)
    revision = get_latest_requirement_revision(db, request_row["id"])
    if not revision or revision.get("status") == "APPROVED":
        raise ApiError(409, "No active requirements revision is awaiting approval.")
    if revision.get("pending_reviewer_role_code") and revision["pending_reviewer_role_code"] != reviewer_role:
        raise ApiError(409, f"Requirements are pending with {format_role_label(revision['pending_reviewer_role_code'])}.")
    review = record_requirement_review_decision(
        db,
        revision_id=revision["id"],
        request_id=request_row["id"],
        reviewer_role_code=reviewer_role,
        reviewer_user_id=reviewer_user_id,
        decision="APPROVED",
        comments=payload.comment,
    )
    record_requirement_change(
        db,
        request_id=request_row["id"],
        revision_id=revision["id"],
        actor_user_id=user["id"],
        artifact_type="REQUIREMENTS",
        artifact_id=None,
        change_type="APPROVED",
        change_summary=f"{format_role_label(reviewer_role)} approved revision {revision['revision_number']}.",
        new_value=payload.comment,
    )
    updated = route_after_requirements_approval(
        db,
        request_row=request_row,
        revision=revision,
        actor_user_id=user["id"],
        current_reviewer_role=reviewer_role,
        comment=payload.comment or f"{format_role_label(reviewer_role)} approved requirements.",
        request_context=request_context,
        background_tasks=background_tasks,
    )
    for recipient_id in unique_recipient_ids(request_row.get("project_manager_user_id"), request_row.get("department_head_user_id")):
        notify(db, recipient_user_id=recipient_id, request_id=request_row["id"], type="REQUIREMENTS_APPROVED_BY_REVIEWER", title="Requirements approval recorded", message=f"{format_role_label(reviewer_role)} approved {request_row['request_number']} revision {revision['revision_number']}.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="REQUIREMENTS_REVIEW_APPROVED", entity_type="REQUIREMENT_REVISION", entity_id=revision["id"], new_value=review, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/requirements-review/send-to-it")
def send_requirements_to_it(request_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEPARTMENT_HEAD"])
    if requirements_reviewer_role_for_status(request_row["status"]) != "DEPARTMENT_HEAD":
        raise ApiError(409, "Requirements can only be sent to IT HOD during Department HOD review.")
    return approve_requirements(request_id, payload, request_context, background_tasks, user, db)


@router.post("/{request_id}/requirements-review/return-to-department")
def return_requirements_to_department(request_id: int, payload: RequiredCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["IT_HEAD"])
    reviewer_role, reviewer_user_id = assert_can_review_requirements(db, user, request_row)
    if reviewer_role != "IT_HEAD":
        raise ApiError(409, "Only IT HOD can return requirements to Department HOD.")
    revision = get_latest_requirement_revision(db, request_row["id"])
    if not revision:
        raise ApiError(409, "No active requirements revision was found.")
    review = record_requirement_review_decision(
        db,
        revision_id=revision["id"],
        request_id=request_row["id"],
        reviewer_role_code="IT_HEAD",
        reviewer_user_id=reviewer_user_id,
        decision="CHANGES_REQUESTED",
        comments=payload.comment,
    )
    record_requirement_change(
        db,
        request_id=request_row["id"],
        revision_id=revision["id"],
        actor_user_id=user["id"],
        artifact_type="REQUIREMENTS",
        artifact_id=None,
        change_type="CHANGES_REQUESTED",
        change_summary=f"IT HOD returned revision {revision['revision_number']} to Department HOD.",
        new_value=payload.comment,
    )
    head_id = assignee_for_requirements_role(db, request_row, "DEPARTMENT_HEAD")
    update_requirement_revision_status(db, revision_id=revision["id"], status="UNDER_DEPARTMENT_REVIEW", pending_reviewer_role_code="DEPARTMENT_HEAD")
    updated = transition_request(db, request_id=request_row["id"], to_status="REQUIREMENTS_DEPARTMENT_REVIEW", actor_user_id=user["id"], comment=payload.comment, request_context=request_context, patch={"current_assignee_user_id": head_id})
    notify(db, recipient_user_id=head_id, request_id=request_row["id"], type="REQUIREMENTS_REVIEW_PENDING", title="Requirements returned for business review", message=f"{request_row['request_number']} requirements were returned by IT HOD.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="REQUIREMENTS_RETURNED_TO_DEPARTMENT", entity_type="REQUIREMENT_REVISION", entity_id=revision["id"], new_value=review, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/requirements-review/request-clarification")
def request_requirements_clarification(request_id: int, payload: ClarificationPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEPARTMENT_HEAD"])
    reviewer_role, reviewer_user_id = assert_can_review_requirements(db, user, request_row)
    revision = get_latest_requirement_revision(db, request_row["id"])
    if not revision:
        raise ApiError(409, "No active requirements revision was found.")
    pm_id = request_row.get("project_manager_user_id")
    if not pm_id:
        raise ApiError(409, "Project Manager must be assigned before requesting clarification.")
    execute(db, """
        INSERT INTO request_clarifications
          (request_id, requested_by_user_id, stage_status, return_status, return_assignee_user_id, reason_category, note)
        VALUES (:requestId, :requestedBy, 'REQUIREMENTS_CLARIFICATION_REQUESTED', :returnStatus, :returnAssignee, :reasonCategory, :note)
    """, {
        "requestId": request_row["id"],
        "requestedBy": user["id"],
        "returnStatus": request_row["status"],
        "returnAssignee": reviewer_user_id,
        "reasonCategory": payload.reasonCategory,
        "note": payload.note,
    })
    review = record_requirement_review_decision(
        db,
        revision_id=revision["id"],
        request_id=request_row["id"],
        reviewer_role_code=reviewer_role,
        reviewer_user_id=reviewer_user_id,
        decision="CHANGES_REQUESTED",
        comments=payload.note,
    )
    update_requirement_revision_status(db, revision_id=revision["id"], status="CLARIFICATION_REQUESTED", pending_reviewer_role_code="PROJECT_MANAGER")
    record_requirement_change(
        db,
        request_id=request_row["id"],
        revision_id=revision["id"],
        actor_user_id=user["id"],
        artifact_type="REQUIREMENTS",
        artifact_id=None,
        change_type="CLARIFICATION_REQUESTED",
        change_summary=f"{format_role_label(reviewer_role)} requested clarification.",
        new_value=payload.note,
    )
    updated = transition_request(db, request_id=request_row["id"], to_status="REQUIREMENTS_CLARIFICATION_REQUESTED", actor_user_id=user["id"], comment=payload.note, request_context=request_context, patch={"current_assignee_user_id": pm_id})
    notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="REQUIREMENTS_CLARIFICATION_REQUESTED", title="Requirements clarification requested", message=f"{request_row['request_number']} needs requirements clarification: {payload.note}", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="REQUIREMENTS_CLARIFICATION_REQUESTED", entity_type="REQUIREMENT_REVISION", entity_id=revision["id"], new_value=review, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/requirements-review/respond-clarification")
def respond_requirements_clarification(request_id: int, payload: ClarificationResponsePayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    pm_id = assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] != "REQUIREMENTS_CLARIFICATION_REQUESTED":
        raise ApiError(409, "Requirements are not awaiting Project Manager clarification.")
    open_clarification = one(db, """
        SELECT * FROM request_clarifications
        WHERE request_id = :requestId AND status = 'OPEN' AND stage_status = 'REQUIREMENTS_CLARIFICATION_REQUESTED'
        ORDER BY requested_at DESC
        LIMIT 1
    """, {"requestId": request_row["id"]})
    if open_clarification:
        execute(db, """
            UPDATE request_clarifications
            SET status = 'RESOLVED', responded_by_user_id = :respondedBy, response_note = :responseNote, responded_at = CURRENT_TIMESTAMP
            WHERE id = :id
        """, {"id": open_clarification["id"], "respondedBy": user["id"], "responseNote": payload.comment})
    scopes, stories = assert_planning_artifacts_ready(db, request_row["id"])
    revision = create_requirement_revision(
        db,
        request_id=request_row["id"],
        actor_user_id=user["id"],
        status="UNDER_DEPARTMENT_REVIEW",
        pending_reviewer_role_code="DEPARTMENT_HEAD",
        change_summary=payload.comment or "Project Manager responded to requirements clarification.",
        seed_review_role_code="PROJECT_MANAGER",
        seed_review_user_id=pm_id,
        seed_review_comments=payload.comment or "Project Manager responded to requirements clarification.",
    )
    head_id = get_request_department_head_id(db, request_row)
    record_requirement_change(
        db,
        request_id=request_row["id"],
        revision_id=revision["id"],
        actor_user_id=user["id"],
        artifact_type="REQUIREMENTS",
        artifact_id=None,
        change_type="CLARIFICATION_RESPONDED",
        change_summary=payload.comment,
    )
    updated = transition_request(db, request_id=request_row["id"], to_status="REQUIREMENTS_DEPARTMENT_REVIEW", actor_user_id=user["id"], comment=payload.comment or "Requirements clarification response submitted.", request_context=request_context, patch={"current_assignee_user_id": head_id})
    notify(db, recipient_user_id=head_id, request_id=request_row["id"], type="REQUIREMENTS_REVIEW_PENDING", title="Requirements resubmitted", message=f"{request_row['request_number']} revision {revision['revision_number']} was resubmitted after clarification.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="REQUIREMENTS_CLARIFICATION_RESPONDED", entity_type="REQUIREMENT_REVISION", entity_id=revision["id"], new_value={"scopeCount": len(scopes), "storyCount": len(stories), "comment": payload.comment}, request=request_context)
    db.commit()
    return ok(updated)


def process_scope_review(request_id: int, scope_id: int, decision: str, review_comments: str | None, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict, db: Session):
    request_row = assert_request_access(db, user, request_id, ["DEPARTMENT_HEAD"])
    head_id = assert_can_act_as_department_head(db, user, request_row)
    scope = assert_scope_belongs_to_request(db, scope_id, request_row["id"])
    if request_row["status"] != "SCOPE_REVIEW" or scope["status"] != "SUBMITTED":
        raise ApiError(409, "Scope can only be reviewed after it has been submitted.")
    next_status = "APPROVED" if decision == "APPROVED" else "REWORK_REQUIRED"
    reviewed = review_project_scope(db, scope_id, head_id, next_status, review_comments)
    pm_id = request_row.get("project_manager_user_id")
    next_request_status = "PM_ASSIGNED" if decision == "REWORK_REQUIRED" else scope_review_target_status(db, request_row["id"])
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status=next_request_status,
        actor_user_id=user["id"],
        comment=review_comments or ("Scope approved." if next_status == "APPROVED" else "Scope rejected and returned for rework."),
        request_context=request_context,
        patch={"current_assignee_user_id": pm_id if next_request_status == "PM_ASSIGNED" else head_id},
    )
    notify(
        db,
        recipient_user_id=pm_id,
        request_id=request_row["id"],
        type="SCOPE_APPROVED" if next_status == "APPROVED" else "SCOPE_REJECTED",
        title="Scope approved" if next_status == "APPROVED" else "Scope returned for rework",
        message=f"{request_row['request_number']} scope has been {'approved' if next_status == 'APPROVED' else 'returned for rework'}.",
        background_tasks=background_tasks,
    )
    audit(db, actor_user_id=user["id"], action="PROJECT_SCOPE_REVIEWED", entity_type="PROJECT_SCOPE", entity_id=scope_id, old_value=scope, new_value=reviewed, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/scopes/{scope_id}/review")
def review_scope(request_id: int, scope_id: int, payload: ProjectScopeReviewPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return process_scope_review(request_id, scope_id, payload.decision, payload.reviewComments, request_context, background_tasks, user, db)


@router.post("/{request_id}/scopes/{scope_id}/approve")
def approve_scope(request_id: int, scope_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return process_scope_review(request_id, scope_id, "APPROVED", payload.comment, request_context, background_tasks, user, db)


@router.post("/{request_id}/scopes/{scope_id}/reject")
def reject_scope(request_id: int, scope_id: int, payload: RequiredCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return process_scope_review(request_id, scope_id, "REWORK_REQUIRED", payload.comment, request_context, background_tasks, user, db)


@router.get("/{request_id}/user-stories")
def user_stories(request_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    return ok(list_user_stories(db, request_row["id"]))


@router.post("/{request_id}/user-stories")
def create_story(request_id: int, payload: UserStoryPayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] not in ["PM_ASSIGNED", "REQUIREMENTS_CLARIFICATION_REQUESTED"]:
        raise ApiError(409, "User stories can only be created by the assigned Project Manager before developer assignment.")
    story = create_user_story(db, request_row["id"], user["id"], {**payload.model_dump(), "status": "DRAFT"})
    audit(db, actor_user_id=user["id"], action="USER_STORY_CREATED", entity_type="USER_STORY", entity_id=story["id"] if story else None, new_value=story, request=request_context)
    db.commit()
    return ok(story, 201)


@router.put("/{request_id}/user-stories/{story_id}")
def update_story(request_id: int, story_id: int, payload: UserStoryPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER", "DEPARTMENT_HEAD", "IT_HEAD"])
    existing = assert_story_belongs_to_request(db, story_id, request_row["id"])
    payload_dict = payload.model_dump()
    field_changes = changed_fields(existing, payload_dict, {
        "storyKey": "story_key",
        "title": "title",
        "description": "description",
        "acceptanceCriteria": "acceptance_criteria",
        "priority": "priority",
    })
    reviewer_role = requirements_reviewer_role_for_status(request_row["status"])
    if reviewer_role:
        current_role, _ = assert_can_review_requirements(db, user, request_row)
        updated = update_user_story(db, story_id, payload_dict)
        request_update = create_revision_after_reviewer_edit(
            db,
            request_row=request_row,
            user=user,
            reviewer_role=current_role,
            artifact_type="USER_STORY",
            artifact_id=story_id,
            field_changes=field_changes,
            reviewer_comment=payload.reviewerComment,
            request_context=request_context,
            background_tasks=background_tasks,
        )
        audit(db, actor_user_id=user["id"], action="REQUIREMENTS_USER_STORY_UPDATED_BY_REVIEWER", entity_type="USER_STORY", entity_id=story_id, old_value=existing, new_value=updated, request=request_context)
        db.commit()
        return ok(request_update if field_changes else updated)

    assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] not in ["PM_ASSIGNED", "REQUIREMENTS_CLARIFICATION_REQUESTED"]:
        raise ApiError(409, "User stories can only be edited while drafting or responding to requirements clarification.")
    if existing["status"] == "APPROVED" and request_row["status"] != "REQUIREMENTS_CLARIFICATION_REQUESTED":
        raise ApiError(409, "Approved user stories cannot be edited.")
    updated = update_user_story(db, story_id, payload_dict)
    if existing["status"] == "REWORK_REQUIRED":
        execute(db, """
            UPDATE user_stories
            SET status = 'DRAFT', reviewed_by_user_id = NULL, review_comments = NULL, reviewed_at = NULL
            WHERE id = :storyId
        """, {"storyId": story_id})
        updated = assert_story_belongs_to_request(db, story_id, request_row["id"])
    elif request_row["status"] == "REQUIREMENTS_CLARIFICATION_REQUESTED":
        execute(db, """
            UPDATE user_stories
            SET status = 'DRAFT', reviewed_by_user_id = NULL, review_comments = NULL, reviewed_at = NULL
            WHERE id = :storyId
        """, {"storyId": story_id})
        updated = assert_story_belongs_to_request(db, story_id, request_row["id"])
    audit(db, actor_user_id=user["id"], action="USER_STORY_UPDATED", entity_type="USER_STORY", entity_id=story_id, old_value=existing, new_value=updated, request=request_context)
    db.commit()
    return ok(updated)


@router.delete("/{request_id}/user-stories/{story_id}")
def delete_story(request_id: int, story_id: int, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] not in ["PM_ASSIGNED", "REQUIREMENTS_CLARIFICATION_REQUESTED"]:
        raise ApiError(409, "User stories can only be deleted before developer assignment.")
    existing = assert_story_belongs_to_request(db, story_id, request_row["id"])
    if existing["status"] == "APPROVED":
        raise ApiError(409, "Approved user stories cannot be deleted.")
    execute(db, "DELETE FROM user_stories WHERE id = :storyId", {"storyId": story_id})
    audit(db, actor_user_id=user["id"], action="USER_STORY_DELETED", entity_type="USER_STORY", entity_id=story_id, old_value=existing, request=request_context)
    db.commit()
    return ok({"id": story_id})


@router.post("/{request_id}/user-stories/submit")
def submit_stories(request_id: int, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    ensure_approved_scope(db, request_row["id"])
    stories = list_user_stories(db, request_row["id"])
    if not stories:
        raise ApiError(409, "At least one user story is required before submitting for Department HOD review.")
    execute(db, """
        UPDATE user_stories
        SET status = 'SUBMITTED'
        WHERE request_id = :requestId AND status IN ('DRAFT', 'REWORK_REQUIRED')
    """, {"requestId": request_row["id"]})
    head_id = get_request_department_head_id(db, request_row)
    updated = transition_request(db, request_id=request_row["id"], to_status="USER_STORY_REVIEW", actor_user_id=user["id"], comment="User stories submitted for Department HOD review.", request_context=request_context, patch={"current_assignee_user_id": head_id})
    notify(db, recipient_user_id=head_id, request_id=request_row["id"], type="USER_STORIES_REVIEW_PENDING", title="User stories awaiting review", message=f"{request_row['request_number']} has user stories awaiting Department HOD review.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="USER_STORIES_SUBMITTED", entity_type="REQUEST", entity_id=request_row["id"], new_value={"storyCount": len(stories)}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/user-stories/{story_id}/submit")
def submit_story(request_id: int, story_id: int, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    ensure_approved_scope(db, request_row["id"])
    story = assert_story_belongs_to_request(db, story_id, request_row["id"])
    if story["status"] == "APPROVED":
        raise ApiError(409, "Approved user stories cannot be resubmitted.")
    execute(db, "UPDATE user_stories SET status = 'SUBMITTED' WHERE id = :storyId", {"storyId": story_id})
    head_id = get_request_department_head_id(db, request_row)
    updated = transition_request(db, request_id=request_row["id"], to_status="USER_STORY_REVIEW", actor_user_id=user["id"], comment=f"User story submitted for Department HOD review: {story['title']}.", request_context=request_context, patch={"current_assignee_user_id": head_id})
    notify(db, recipient_user_id=head_id, request_id=request_row["id"], type="USER_STORY_REVIEW_PENDING", title="User story awaiting review", message=f"{request_row['request_number']} has a user story awaiting review.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="USER_STORY_SUBMITTED", entity_type="USER_STORY", entity_id=story_id, old_value=story, new_value={"status": "SUBMITTED"}, request=request_context)
    db.commit()
    return ok(updated)


def process_story_review(request_id: int, story_id: int, decision: str, review_comments: str | None, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict, db: Session):
    request_row = assert_request_access(db, user, request_id, ["DEPARTMENT_HEAD"])
    head_id = assert_can_act_as_department_head(db, user, request_row)
    story = assert_story_belongs_to_request(db, story_id, request_row["id"])
    if request_row["status"] != "USER_STORY_REVIEW":
        raise ApiError(409, "User stories can only be reviewed during Department HOD user story review.")
    if story["status"] != "SUBMITTED":
        raise ApiError(409, "Only submitted user stories can be reviewed.")
    next_story_status = "APPROVED" if decision == "APPROVED" else "REWORK_REQUIRED"
    reviewed = review_user_story(db, story_id, head_id, next_story_status, review_comments)
    pm_id = request_row.get("project_manager_user_id")
    if decision == "REWORK_REQUIRED":
        updated = transition_request(db, request_id=request_row["id"], to_status="PM_ASSIGNED", actor_user_id=user["id"], comment=review_comments or f"User story returned for rework: {story['title']}.", request_context=request_context, patch={"current_assignee_user_id": pm_id})
        notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="USER_STORY_REWORK_REQUIRED", title="User story returned for rework", message=f"{request_row['request_number']} has a user story that needs rework.", background_tasks=background_tasks)
    else:
        remaining = rows(db, """
            SELECT id FROM user_stories
            WHERE request_id = :requestId AND status <> 'APPROVED'
        """, {"requestId": request_row["id"]})
        if not remaining:
            updated = transition_request(db, request_id=request_row["id"], to_status="DEVELOPER_ASSIGNED", actor_user_id=user["id"], comment="User stories approved. Request is ready for developer and QA assignment.", request_context=request_context, patch={"current_assignee_user_id": pm_id})
            notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="USER_STORIES_APPROVED", title="User stories approved", message=f"All user stories for {request_row['request_number']} are approved. Developer assignment is now available.", background_tasks=background_tasks)
        else:
            updated = get_request_by_id(db, request_row["id"])
    audit(db, actor_user_id=user["id"], action="USER_STORY_REVIEWED", entity_type="USER_STORY", entity_id=story_id, old_value=story, new_value=reviewed, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/user-stories/{story_id}/review")
def review_story(request_id: int, story_id: int, payload: UserStoryReviewPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return process_story_review(request_id, story_id, payload.decision, payload.reviewComments, request_context, background_tasks, user, db)


@router.post("/{request_id}/user-stories/{story_id}/approve")
def approve_story(request_id: int, story_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return process_story_review(request_id, story_id, "APPROVED", payload.comment, request_context, background_tasks, user, db)


@router.post("/{request_id}/user-stories/{story_id}/reject")
def reject_story(request_id: int, story_id: int, payload: RequiredCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    return process_story_review(request_id, story_id, "REWORK_REQUIRED", payload.comment, request_context, background_tasks, user, db)


@router.get("/{request_id}/sprints")
def request_sprints(request_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    return ok(list_sprints(db, request_row["id"]))


TASK_STATUS_TRANSITIONS = {
    "TODO": {"IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"},
    "IN_PROGRESS": {"BLOCKED", "DONE", "CANCELLED"},
    "BLOCKED": {"IN_PROGRESS", "DONE", "CANCELLED"},
    "DONE": {"TODO"},
    "CANCELLED": set(),
}


def sprint_readiness_reasons(db: Session, request_row: dict, sprint: dict) -> list[str]:
    reasons = []
    tasks = list_sprint_tasks(db, sprint["id"])
    if not tasks:
        reasons.append("Create at least one sprint task.")
    for task in tasks:
        label = task.get("task_key") or task.get("title") or f"Task {task.get('id')}"
        if not task.get("title"):
            reasons.append(f"{label} is missing a title.")
        if not task.get("assigned_developer_user_id"):
            reasons.append(f"{label} needs an assigned developer.")
        if task.get("status") in ["DONE", "CANCELLED"]:
            reasons.append(f"{label} is already {task.get('status').lower()} and cannot be used to start a sprint.")
    return reasons


def assert_task_status_transition(existing_status: str, next_status: str, user: dict) -> None:
    if existing_status == next_status:
        return
    if user["role_code"] in ["PROJECT_MANAGER", "SYSTEM_ADMIN"] and existing_status in ["DONE", "CANCELLED"]:
        return
    allowed = TASK_STATUS_TRANSITIONS.get(existing_status, set())
    if next_status not in allowed:
        raise ApiError(409, f"Task cannot move from {existing_status} to {next_status}.")


def calculate_task_progress(db: Session, request_id: int) -> int:
    summary = one(db, """
        SELECT COUNT(*) AS total_tasks,
               SUM(CASE WHEN task.status = 'DONE' THEN 1 ELSE 0 END) AS completed_tasks
        FROM sprint_tasks task
        JOIN sprints sprint ON sprint.id = task.sprint_id
        WHERE sprint.request_id = :requestId
          AND sprint.status IN ('ACTIVE', 'COMPLETED')
          AND task.status <> 'CANCELLED'
    """, {"requestId": request_id})
    total = int(summary.get("total_tasks") or 0) if summary else 0
    completed = int(summary.get("completed_tasks") or 0) if summary else 0
    if total == 0:
        return 0
    return int(round((completed / total) * 100))


def update_request_progress_from_tasks(db: Session, request_id: int) -> int:
    progress = calculate_task_progress(db, request_id)
    execute(db, "UPDATE requests SET progress_percentage = :progress WHERE id = :requestId", {"requestId": request_id, "progress": progress})
    return progress


def close_sprint_if_all_tasks_done(db: Session, sprint_id: int) -> dict | None:
    tasks = list_sprint_tasks(db, sprint_id)
    if tasks and all(task.get("status") == "DONE" for task in tasks):
        return update_sprint_status(db, sprint_id, "COMPLETED")
    return get_sprint(db, sprint_id)


def sprint_developer_recipient_ids(sprint: dict, tasks: list[dict]) -> list[int]:
    return unique_recipient_ids(
        sprint.get("assigned_developer_user_id"),
        *[task.get("assigned_developer_user_id") for task in tasks],
    )


def request_delivery_developer_ids(db: Session, request_id: int) -> list[int]:
    developers = rows(db, """
        SELECT DISTINCT developer_id
        FROM (
          SELECT assigned_developer_user_id AS developer_id
          FROM sprints
          WHERE request_id = :requestId
            AND assigned_developer_user_id IS NOT NULL
            AND status IN ('ACTIVE', 'COMPLETED', 'BLOCKED')
          UNION
          SELECT task.assigned_developer_user_id AS developer_id
          FROM sprint_tasks task
          JOIN sprints sprint ON sprint.id = task.sprint_id
          WHERE sprint.request_id = :requestId
            AND task.assigned_developer_user_id IS NOT NULL
            AND sprint.status IN ('ACTIVE', 'COMPLETED', 'BLOCKED')
        ) delivery_developers
    """, {"requestId": request_id})
    return [int(item["developer_id"]) for item in developers if item.get("developer_id")]


@router.post("/{request_id}/sprints")
def create_request_sprint(request_id: int, payload: SprintPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    ensure_requirements_approved(db, request_row["id"])
    if request_row["status"] not in ["REQUIREMENTS_APPROVED", "SPRINT_PLANNING", "SPRINT_CREATED", "SPRINT_ACTIVE", "IN_DEVELOPMENT"]:
        raise ApiError(409, "Sprint can only be created after requirements are fully approved and before QA submission.")
    if payload.assignedDeveloperUserId:
        assert_active_role_user(db, payload.assignedDeveloperUserId, "DEVELOPER", "Sprint owner")
    sprint = create_sprint(db, request_row["id"], user["id"], payload.model_dump())
    updated = get_request_by_id(db, request_row["id"])
    if request_row["status"] == "REQUIREMENTS_APPROVED":
        updated = transition_request(db, request_id=request_row["id"], to_status="SPRINT_PLANNING", actor_user_id=user["id"], comment=f"Project Workspace sprint planning started: {payload.sprintName}.", request_context=request_context, patch={"current_assignee_user_id": user["id"]})
    update_request_progress_from_tasks(db, request_row["id"])
    audit(db, actor_user_id=user["id"], action="SPRINT_CREATED", entity_type="SPRINT", entity_id=sprint["id"] if sprint else None, new_value=sprint, request=request_context)
    db.commit()
    return ok({"request": updated, "sprint": sprint})


@router.put("/{request_id}/sprints/{sprint_id}")
def update_request_sprint(request_id: int, sprint_id: int, payload: SprintPayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    existing = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if existing["status"] == "COMPLETED":
        raise ApiError(409, "Completed sprints cannot be edited.")
    if payload.assignedDeveloperUserId:
        assert_active_role_user(db, payload.assignedDeveloperUserId, "DEVELOPER", "Sprint owner")
    updated = update_sprint(db, sprint_id, payload.model_dump())
    audit(db, actor_user_id=user["id"], action="SPRINT_UPDATED", entity_type="SPRINT", entity_id=sprint_id, old_value=existing, new_value=updated, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/sprints/{sprint_id}/assign-developer")
def assign_sprint_owner(request_id: int, sprint_id: int, payload: SprintTaskAssignPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if sprint["status"] == "COMPLETED":
        raise ApiError(409, "Completed sprints cannot be reassigned.")
    developer = assert_active_role_user(db, payload.developerUserId, "DEVELOPER", "Sprint owner")
    updated = assign_sprint_developer(db, sprint_id, payload.developerUserId)
    notify(db, recipient_user_id=payload.developerUserId, request_id=request_row["id"], type="SPRINT_TASK_ASSIGNED", title="Sprint assigned", message=f"{sprint['sprint_name']} has been assigned to you.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_DEVELOPER_ASSIGNED", entity_type="SPRINT", entity_id=sprint_id, old_value=sprint, new_value={"developerUserId": payload.developerUserId, "developerName": developer["full_name"]}, request=request_context)
    db.commit()
    return ok(updated)


@router.delete("/{request_id}/sprints/{sprint_id}")
def delete_request_sprint(request_id: int, sprint_id: int, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if request_row["status"] in ["DEVELOPMENT_COMPLETE", "QA_PENDING", "IN_TESTING", "QA_FAILED", "QA_PASSED", "UAT_PENDING", "UAT_FAILED", "UAT_APPROVED", "DEPLOYMENT_PENDING", "DEPLOYED", "READY_FOR_COMPLETION", "CLOSED"]:
        raise ApiError(409, "This sprint cannot be deleted because work has already been completed or progressed beyond the planning stage.")
    if sprint["status"] == "COMPLETED":
        raise ApiError(409, "This sprint cannot be deleted because work has already been completed or progressed beyond the planning stage.")
    sprint_tasks = list_sprint_tasks(db, sprint_id)
    if any(task.get("status") == "DONE" for task in sprint_tasks):
        raise ApiError(409, "This sprint cannot be deleted because work has already been completed or progressed beyond the planning stage.")
    for recipient_id in sprint_developer_recipient_ids(sprint, sprint_tasks):
        notify(db, recipient_user_id=recipient_id, request_id=request_row["id"], type="SPRINT_DELETED", title="Sprint deleted", message=f"{sprint['sprint_name']} has been deleted by the Project Manager.", background_tasks=background_tasks)
    delete_sprint(db, sprint_id)
    progress = update_request_progress_from_tasks(db, request_row["id"])
    audit(db, actor_user_id=user["id"], action="SPRINT_DELETED", entity_type="SPRINT", entity_id=sprint_id, old_value={"sprint": sprint, "tasks": sprint_tasks, "progressPercentage": progress}, request=request_context)
    db.commit()
    return ok({"deleted": True, "sprintId": sprint_id, "progressPercentage": progress})


@router.post("/{request_id}/sprints/{sprint_id}/start")
def start_request_sprint(request_id: int, sprint_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    ensure_requirements_approved(db, request_row["id"])
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if sprint["status"] not in ["PLANNED", "CREATED"]:
        raise ApiError(409, "Only planned or created sprints can be started.")
    missing_reasons = sprint_readiness_reasons(db, request_row, sprint)
    if missing_reasons:
        raise ApiError(409, "Sprint is not ready to start.", {"reasons": missing_reasons})
    started = update_sprint_status(db, sprint_id, "ACTIVE")
    progress = update_request_progress_from_tasks(db, request_row["id"])
    active_request = request_row
    if request_row["status"] == "SPRINT_PLANNING":
        active_request = transition_request(db, request_id=request_row["id"], to_status="SPRINT_CREATED", actor_user_id=user["id"], comment="Sprint tasks are ready for start.", request_context=request_context, patch={"current_assignee_user_id": user["id"]})
    if active_request["status"] == "SPRINT_CREATED":
        active_request = transition_request(db, request_id=request_row["id"], to_status="SPRINT_ACTIVE", actor_user_id=user["id"], comment=payload.comment or f"Sprint started: {sprint['sprint_name']}.", request_context=request_context, patch={"current_assignee_user_id": user["id"], "progress_percentage": progress})
    updated_request = transition_request(db, request_id=request_row["id"], to_status="IN_DEVELOPMENT", actor_user_id=user["id"], comment="Sprint is active. Development work started.", request_context=request_context, patch={"current_assignee_user_id": user["id"], "progress_percentage": progress})
    for task in list_sprint_tasks(db, sprint_id):
        notify(db, recipient_user_id=task.get("assigned_developer_user_id"), request_id=request_row["id"], type="SPRINT_STARTED", title="Sprint started", message=f"{sprint['sprint_name']} has started. Your assigned task {task.get('task_key') or task.get('title')} is ready.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_STARTED", entity_type="SPRINT", entity_id=sprint_id, old_value=sprint, new_value=started, request=request_context)
    db.commit()
    return ok({"request": updated_request, "sprint": started})


@router.post("/{request_id}/sprints/{sprint_id}/stop")
def stop_request_sprint(request_id: int, sprint_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if sprint["status"] not in ["ACTIVE", "BLOCKED"]:
        raise ApiError(409, "Only started sprints can be stopped.")
    sprint_tasks = list_sprint_tasks(db, sprint_id)
    stopped = update_sprint_status(db, sprint_id, "CANCELLED")
    execute(db, """
        INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
        VALUES (:requestId, :status, :status, :actorUserId, :comment)
    """, {
        "requestId": request_row["id"],
        "status": request_row["status"],
        "actorUserId": user["id"],
        "comment": payload.comment or f"Sprint stopped: {sprint['sprint_name']}.",
    })
    for recipient_id in sprint_developer_recipient_ids(sprint, sprint_tasks):
        notify(db, recipient_user_id=recipient_id, request_id=request_row["id"], type="SPRINT_STOPPED", title="Sprint stopped", message=f"{sprint['sprint_name']} has been stopped by the Project Manager.", background_tasks=background_tasks)
    progress = update_request_progress_from_tasks(db, request_row["id"])
    audit(db, actor_user_id=user["id"], action="SPRINT_STOPPED", entity_type="SPRINT", entity_id=sprint_id, old_value=sprint, new_value=stopped, request=request_context)
    db.commit()
    return ok({"sprint": stopped, "progressPercentage": progress})


@router.post("/{request_id}/sprints/{sprint_id}/complete")
def complete_request_sprint(request_id: int, sprint_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if sprint["status"] not in ["ACTIVE", "BLOCKED"]:
        raise ApiError(409, "Only active or blocked sprints can be completed.")
    tasks = list_sprint_tasks(db, sprint_id)
    if not tasks:
        raise ApiError(409, "Sprint cannot be completed without tasks.")
    incomplete = [task for task in tasks if task.get("status") != "DONE"]
    if incomplete:
        raise ApiError(409, "All sprint tasks must be done before sprint completion.", {"tasks": [task.get("task_key") or task.get("title") for task in incomplete]})
    completed = update_sprint_status(db, sprint_id, "COMPLETED")
    progress = update_request_progress_from_tasks(db, request_row["id"])
    if request_row["status"] == "IN_DEVELOPMENT" and progress >= 100:
        transition_request(db, request_id=request_row["id"], to_status="DEVELOPMENT_COMPLETE", actor_user_id=user["id"], comment=payload.comment or "All sprints are complete. Development is ready for QA submission.", request_context=request_context, patch={"progress_percentage": progress, "current_assignee_user_id": request_row.get("project_manager_user_id")})
    elif request_row["status"] == "IN_DEVELOPMENT":
        transition_request(db, request_id=request_row["id"], to_status="IN_DEVELOPMENT", actor_user_id=user["id"], comment=payload.comment or f"Sprint complete. Project progress is now {progress}%.", request_context=request_context, patch={"progress_percentage": progress})
    notify(db, recipient_user_id=request_row.get("project_manager_user_id"), request_id=request_row["id"], type="SPRINT_COMPLETED", title="Sprint completed", message=f"Sprint {sprint['sprint_name']} is complete. Submit the request for QA when ready.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_COMPLETED", entity_type="SPRINT", entity_id=sprint_id, old_value=sprint, new_value=completed, request=request_context)
    db.commit()
    return ok(completed)


@router.get("/{request_id}/sprints/{sprint_id}/tasks")
def sprint_tasks(request_id: int, sprint_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    sprint = get_sprint(db, sprint_id)
    if not sprint or int(sprint["request_id"]) != int(request_row["id"]):
        raise ApiError(404, "Sprint not found.")
    return ok(list_sprint_tasks(db, sprint_id))


@router.get("/{request_id}/sprint-tasks")
def request_sprint_tasks(request_id: int, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    return ok(list_request_sprint_tasks(db, request_row["id"]))


@router.post("/{request_id}/sprints/{sprint_id}/tasks")
def create_task(request_id: int, sprint_id: int, payload: SprintTaskPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    ensure_requirements_approved(db, request_row["id"])
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if sprint["status"] == "COMPLETED":
        raise ApiError(409, "Tasks cannot be added to completed sprints.")
    if payload.userStoryId:
        assert_story_belongs_to_request(db, payload.userStoryId, request_row["id"])
    payload_data = payload.model_dump()
    if sprint.get("assigned_developer_user_id"):
        payload_data["assignedDeveloperUserId"] = sprint.get("assigned_developer_user_id")
    if payload_data.get("assignedDeveloperUserId"):
        assert_active_role_user(db, payload_data["assignedDeveloperUserId"], "DEVELOPER", "Assigned developer")
    task = create_sprint_task(db, sprint_id, payload_data, user["id"])
    add_sprint_task_status_history(db, task["id"], None, task["status"], user["id"], "Task created.")
    if sprint["status"] == "PLANNED":
        update_sprint_status(db, sprint_id, "CREATED")
    if request_row["status"] == "SPRINT_PLANNING":
        transition_request(db, request_id=request_row["id"], to_status="SPRINT_CREATED", actor_user_id=user["id"], comment="Sprint task breakdown created.", request_context=request_context, patch={"current_assignee_user_id": task.get("assigned_developer_user_id") or request_row.get("current_assignee_user_id")})
    update_request_progress_from_tasks(db, request_row["id"])
    notify(db, recipient_user_id=payload_data.get("assignedDeveloperUserId"), request_id=request_row["id"], type="SPRINT_TASK_ASSIGNED", title="Sprint task assigned", message=f"You have a sprint task for {request_row['request_number']}.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_TASK_CREATED", entity_type="SPRINT_TASK", entity_id=task["id"] if task else None, new_value=task, request=request_context)
    db.commit()
    return ok(task, 201)


@router.put("/{request_id}/sprints/{sprint_id}/tasks/{task_id}")
def update_task(request_id: int, sprint_id: int, task_id: int, payload: SprintTaskPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if sprint["status"] == "COMPLETED":
        raise ApiError(409, "Completed sprint tasks cannot be edited.")
    existing = assert_task_belongs_to_sprint(db, task_id, sprint_id)
    if payload.userStoryId:
        assert_story_belongs_to_request(db, payload.userStoryId, request_row["id"])
    if sprint.get("assigned_developer_user_id") and payload.assignedDeveloperUserId and int(payload.assignedDeveloperUserId) != int(sprint["assigned_developer_user_id"]):
        raise ApiError(409, "Task-level developer assignment is disabled because this sprint has an owner.")
    if payload.assignedDeveloperUserId:
        assert_active_role_user(db, payload.assignedDeveloperUserId, "DEVELOPER", "Assigned developer")
    if existing["status"] != payload.status:
        assert_task_status_transition(existing["status"], payload.status, user)
    payload_data = payload.model_dump()
    payload_data["taskKey"] = payload_data.get("taskKey") or existing.get("task_key")
    if sprint.get("assigned_developer_user_id"):
        payload_data["assignedDeveloperUserId"] = sprint.get("assigned_developer_user_id")
    updated = update_sprint_task(db, task_id, payload_data)
    if existing["status"] != updated["status"]:
        add_sprint_task_status_history(db, task_id, existing["status"], updated["status"], user["id"], "Task updated by project manager.")
    if payload.assignedDeveloperUserId and int(payload.assignedDeveloperUserId) != int(existing.get("assigned_developer_user_id") or 0):
        notify(db, recipient_user_id=payload.assignedDeveloperUserId, request_id=request_row["id"], type="SPRINT_TASK_ASSIGNED", title="Sprint task assigned", message=f"{updated['task_key'] or updated['title']} has been assigned to you.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_TASK_UPDATED", entity_type="SPRINT_TASK", entity_id=task_id, old_value=existing, new_value=updated, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/sprints/{sprint_id}/tasks/{task_id}/assign-developer")
def assign_task_developer(request_id: int, sprint_id: int, task_id: int, payload: SprintTaskAssignPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    ensure_requirements_approved(db, request_row["id"])
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    existing = assert_task_belongs_to_sprint(db, task_id, sprint_id)
    if sprint["status"] == "COMPLETED":
        raise ApiError(409, "Developer cannot be assigned to a completed sprint.")
    if sprint.get("assigned_developer_user_id"):
        raise ApiError(409, "Task-level developer assignment is disabled because this sprint has an owner.")
    if existing["status"] in ["DONE", "CANCELLED"]:
        raise ApiError(409, "Developer cannot be assigned to a closed sprint task.")
    developer = assert_active_role_user(db, payload.developerUserId, "DEVELOPER", "Assigned developer")
    updated = assign_sprint_task_developer(db, task_id, payload.developerUserId)
    notify(db, recipient_user_id=payload.developerUserId, request_id=request_row["id"], type="SPRINT_TASK_ASSIGNED", title="Sprint task assigned", message=f"{existing['title']} has been assigned to you.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_TASK_DEVELOPER_ASSIGNED", entity_type="SPRINT_TASK", entity_id=task_id, old_value=existing, new_value={"developerUserId": payload.developerUserId, "developerName": developer["full_name"]}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/sprints/{sprint_id}/tasks/{task_id}/status")
def update_task_status(request_id: int, sprint_id: int, task_id: int, payload: SprintTaskStatusPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER", "DEVELOPER"])
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    existing = assert_task_belongs_to_sprint(db, task_id, sprint_id)
    if user["role_code"] == "PROJECT_MANAGER":
        assert_can_act_as_project_manager(user, request_row)
    elif user["role_code"] != "SYSTEM_ADMIN" and int(existing.get("assigned_developer_user_id") or 0) != int(user["id"]):
        raise ApiError(403, "Only the assigned developer can update this sprint task status.")
    assert_task_status_transition(existing["status"], payload.status, user)
    if payload.status == "BLOCKED" and not (payload.blockedReason or payload.comment):
        raise ApiError(400, "Blocked tasks require a reason or comment.")
    next_progress = payload.progressPercentage
    if next_progress is None and payload.status == "DONE":
        next_progress = 100
    elif next_progress is None and existing["status"] == "DONE" and payload.status != "DONE":
        next_progress = 0
    updated = update_sprint_task_status(db, task_id, payload.status, payload.actualHours, next_progress, payload.blockedReason)
    add_sprint_task_status_history(db, task_id, existing["status"], payload.status, user["id"], payload.comment or payload.blockedReason)
    comment_type = "BLOCKER" if payload.status == "BLOCKED" else ("COMPLETION" if payload.status == "DONE" else "PROGRESS")
    add_sprint_task_comment(db, task_id, user["id"], payload.comment or payload.blockedReason, comment_type)
    if payload.status == "BLOCKED":
        update_sprint_status(db, sprint_id, "BLOCKED")
    elif payload.status == "DONE":
        close_sprint_if_all_tasks_done(db, sprint_id)
    elif existing["status"] == "DONE" and sprint["status"] == "COMPLETED":
        update_sprint_status(db, sprint_id, "ACTIVE")
    elif sprint["status"] == "BLOCKED":
        update_sprint_status(db, sprint_id, "ACTIVE")
    progress = update_request_progress_from_tasks(db, request_row["id"])
    if request_row["status"] == "IN_DEVELOPMENT" and progress >= 100:
        transition_request(db, request_id=request_row["id"], to_status="IN_DEVELOPMENT", actor_user_id=user["id"], comment="All active sprint tasks are complete. Developer can submit work to the Project Manager for QA routing.", request_context=request_context, patch={"progress_percentage": progress})
    elif request_row["status"] == "DEVELOPMENT_COMPLETE" and progress < 100:
        transition_request(db, request_id=request_row["id"], to_status="IN_DEVELOPMENT", actor_user_id=user["id"], comment=f"Sprint task reopened. Project progress is now {progress}%.", request_context=request_context, patch={"progress_percentage": progress, "current_assignee_user_id": user["id"]})
    elif request_row["status"] in ["SPRINT_CREATED", "SPRINT_ACTIVE"]:
        transition_request(db, request_id=request_row["id"], to_status="IN_DEVELOPMENT", actor_user_id=user["id"], comment=f"Sprint task updated. Project progress is now {progress}%.", request_context=request_context, patch={"progress_percentage": progress})
    elif request_row["status"] == "IN_DEVELOPMENT":
        transition_request(db, request_id=request_row["id"], to_status="IN_DEVELOPMENT", actor_user_id=user["id"], comment=f"Sprint task updated. Project progress is now {progress}%.", request_context=request_context, patch={"progress_percentage": progress})
    pm_id = request_row.get("project_manager_user_id")
    if payload.status == "BLOCKED":
        notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="SPRINT_TASK_BLOCKED", title="Sprint task blocked", message=f"{existing['title']} is blocked. {payload.blockedReason or payload.comment or ''}".strip(), background_tasks=background_tasks)
    elif payload.status == "DONE":
        notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="SPRINT_TASK_COMPLETED", title="Sprint task completed", message=f"{existing['title']} has been completed.", background_tasks=background_tasks)
    elif existing["status"] == "DONE":
        notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="SPRINT_TASK_REOPENED", title="Sprint task reopened", message=f"{existing['title']} has been marked incomplete.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_TASK_STATUS_UPDATED", entity_type="SPRINT_TASK", entity_id=task_id, old_value=existing, new_value=updated, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/sprints/{sprint_id}/tasks/{task_id}/blocker")
def raise_sprint_task_blocker(request_id: int, sprint_id: int, task_id: int, payload: SprintTaskBlockerPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEVELOPER"])
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    existing = assert_task_belongs_to_sprint(db, task_id, sprint_id)
    if sprint["status"] != "ACTIVE":
        raise ApiError(409, "Blockers can only be raised after the sprint starts.")
    if existing["status"] in ["DONE", "CANCELLED"]:
        raise ApiError(409, "Closed sprint tasks cannot be blocked.")
    if user["role_code"] != "SYSTEM_ADMIN" and int(existing.get("assigned_developer_user_id") or 0) != int(user["id"]):
        raise ApiError(403, "Only the assigned developer can raise a blocker for this sprint task.")
    blocker_note = "\n".join([
        f"Blocker: {payload.blockerTitle}",
        f"Severity: {payload.severity}",
        f"Description: {payload.description}",
        f"Additional Notes: {payload.additionalNotes}" if payload.additionalNotes else "",
    ]).strip()
    updated = update_sprint_task_status(db, task_id, "BLOCKED", None, existing.get("progress_percentage"), blocker_note)
    add_sprint_task_status_history(db, task_id, existing["status"], "BLOCKED", user["id"], blocker_note)
    add_sprint_task_comment(db, task_id, user["id"], blocker_note, "BLOCKER")
    transition_request(db, request_id=request_row["id"], to_status=request_row["status"], actor_user_id=user["id"], comment=f"Developer raised blocker: {payload.blockerTitle}", request_context=request_context)
    notify(db, recipient_user_id=request_row.get("project_manager_user_id"), request_id=request_row["id"], type="SPRINT_TASK_BLOCKED", title="Sprint blocker raised", message=f"{existing['title']} is blocked. Severity: {payload.severity}.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_TASK_BLOCKER_RAISED", entity_type="SPRINT_TASK", entity_id=task_id, old_value=existing, new_value=updated, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/sprints/{sprint_id}/blocker")
def raise_sprint_blocker(request_id: int, sprint_id: int, payload: SprintTaskBlockerPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEVELOPER"])
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if sprint["status"] in ["COMPLETED", "CANCELLED"]:
        raise ApiError(409, "Closed sprints cannot be blocked.")
    assigned_tasks = [
        task for task in list_sprint_tasks(db, sprint_id)
        if int(task.get("assigned_developer_user_id") or 0) == int(user["id"])
    ]
    if not assigned_tasks and user["role_code"] != "SYSTEM_ADMIN":
        raise ApiError(403, "Only a developer assigned to this sprint can raise a blocker.")
    blocker_note = "\n".join([
        f"Blocker: {payload.blockerTitle}",
        f"Severity: {payload.severity}",
        f"Description: {payload.description}",
        f"Notes: {payload.additionalNotes}" if payload.additionalNotes else "",
    ]).strip()
    updated_sprint = update_sprint_status(db, sprint_id, "BLOCKED")
    for task in assigned_tasks:
        if task["status"] not in ["DONE", "CANCELLED", "BLOCKED"]:
            updated_task = update_sprint_task_status(db, task["id"], "BLOCKED", None, task.get("progress_percentage"), blocker_note)
            add_sprint_task_status_history(db, task["id"], task["status"], "BLOCKED", user["id"], blocker_note)
            add_sprint_task_comment(db, task["id"], user["id"], blocker_note, "BLOCKER")
            audit(db, actor_user_id=user["id"], action="SPRINT_TASK_BLOCKER_RAISED", entity_type="SPRINT_TASK", entity_id=task["id"], old_value=task, new_value=updated_task, request=request_context)
    transition_request(db, request_id=request_row["id"], to_status=request_row["status"], actor_user_id=user["id"], comment=f"Developer raised sprint blocker: {payload.blockerTitle}", request_context=request_context)
    notify(db, recipient_user_id=request_row.get("project_manager_user_id"), request_id=request_row["id"], type="SPRINT_BLOCKED", title="Sprint blocker raised", message=f"{sprint['sprint_name']} is blocked. Severity: {payload.severity}.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_BLOCKER_RAISED", entity_type="SPRINT", entity_id=sprint_id, old_value=sprint, new_value=updated_sprint, request=request_context)
    db.commit()
    return ok(updated_sprint)


@router.post("/{request_id}/sprints/{sprint_id}/tasks/{task_id}/resolve-blocker")
def resolve_sprint_task_blocker(request_id: int, sprint_id: int, task_id: int, payload: RequiredCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    existing = assert_task_belongs_to_sprint(db, task_id, sprint_id)
    if existing["status"] != "BLOCKED":
        raise ApiError(409, "Only blocked tasks can be unblocked.")
    solution = f"PM unblocker solution: {payload.comment}"
    updated = update_sprint_task_status(db, task_id, "TODO", existing.get("actual_hours"), existing.get("progress_percentage"), solution)
    add_sprint_task_status_history(db, task_id, "BLOCKED", "TODO", user["id"], solution)
    add_sprint_task_comment(db, task_id, user["id"], solution, "PROGRESS")
    remaining_blocked = [
        task for task in list_sprint_tasks(db, sprint_id)
        if int(task.get("id") or 0) != int(task_id) and task.get("status") == "BLOCKED"
    ]
    updated_sprint = sprint
    if sprint["status"] == "BLOCKED" and not remaining_blocked:
        updated_sprint = update_sprint_status(db, sprint_id, "ACTIVE")
    progress = update_request_progress_from_tasks(db, request_row["id"])
    notify(db, recipient_user_id=existing.get("assigned_developer_user_id"), request_id=request_row["id"], type="SPRINT_TASK_UNBLOCKED", title="Blocker solution sent", message=f"Project Manager replied with a solution for {existing['title']}. You can continue work.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_TASK_BLOCKER_RESOLVED", entity_type="SPRINT_TASK", entity_id=task_id, old_value=existing, new_value={"task": updated, "sprint": updated_sprint, "solution": payload.comment, "progressPercentage": progress}, request=request_context)
    db.commit()
    return ok({"task": updated, "sprint": updated_sprint, "progressPercentage": progress})


@router.post("/{request_id}/sprints/{sprint_id}/developer-complete")
def complete_developer_sprint(request_id: int, sprint_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEVELOPER"])
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if sprint["status"] not in ["ACTIVE", "BLOCKED", "COMPLETED"]:
        raise ApiError(409, "Sprint can only be completed by a developer after it starts.")
    assigned_tasks = [
        task for task in list_sprint_tasks(db, sprint_id)
        if int(task.get("assigned_developer_user_id") or 0) == int(user["id"])
    ]
    if not assigned_tasks:
        raise ApiError(403, "No sprint tasks are assigned to you for this sprint.")
    for task in assigned_tasks:
        if task["status"] not in ["DONE", "CANCELLED"]:
            updated_task = update_sprint_task_status(db, task["id"], "DONE", None, 100, None)
            add_sprint_task_status_history(db, task["id"], task["status"], "DONE", user["id"], payload.comment or "Developer completed sprint work.")
            add_sprint_task_comment(db, task["id"], user["id"], payload.comment or "Developer completed sprint work.", "COMPLETION")
            audit(db, actor_user_id=user["id"], action="SPRINT_TASK_COMPLETED_BY_DEVELOPER", entity_type="SPRINT_TASK", entity_id=task["id"], old_value=task, new_value=updated_task, request=request_context)

    all_tasks = list_sprint_tasks(db, sprint_id)
    if all_tasks and all(task.get("status") == "DONE" for task in all_tasks):
        update_sprint_status(db, sprint_id, "COMPLETED")
    progress = update_request_progress_from_tasks(db, request_row["id"])
    if request_row["status"] == "IN_DEVELOPMENT" and progress >= 100:
        transition_request(db, request_id=request_row["id"], to_status="IN_DEVELOPMENT", actor_user_id=user["id"], comment=payload.comment or "Developer completed assigned work. Ready to submit to the Project Manager for QA routing.", request_context=request_context, patch={"progress_percentage": progress})
    else:
        transition_request(db, request_id=request_row["id"], to_status=request_row["status"], actor_user_id=user["id"], comment=payload.comment or f"Developer completed sprint work. Project progress is now {progress}%.", request_context=request_context, patch={"progress_percentage": progress})
    notify(db, recipient_user_id=request_row.get("project_manager_user_id"), request_id=request_row["id"], type="SPRINT_COMPLETED", title="Developer completed sprint work", message=f"{user.get('full_name') or 'Developer'} completed assigned work for {sprint['sprint_name']}. Project progress is {progress}%.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="DEVELOPER_SPRINT_COMPLETED", entity_type="SPRINT", entity_id=sprint_id, old_value=sprint, new_value={"progressPercentage": progress}, request=request_context)
    db.commit()
    return ok({"progressPercentage": progress, "sprintId": sprint_id})


@router.post("/{request_id}/development/submit-for-review")
def submit_development_for_review(request_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEVELOPER"])
    if request_row["status"] != "IN_DEVELOPMENT":
        raise ApiError(409, "Work can be submitted for QA review only while development is in progress.")
    assigned_summary = one(db, """
        SELECT COUNT(*) AS total_tasks,
               SUM(CASE WHEN task.status = 'DONE' THEN 1 ELSE 0 END) AS completed_tasks
        FROM sprint_tasks task
        JOIN sprints sprint ON sprint.id = task.sprint_id
        WHERE sprint.request_id = :requestId
          AND task.assigned_developer_user_id = :developerUserId
          AND sprint.status IN ('ACTIVE', 'COMPLETED')
          AND task.status <> 'CANCELLED'
    """, {"requestId": request_row["id"], "developerUserId": user["id"]})
    total_assigned = int(assigned_summary.get("total_tasks") or 0) if assigned_summary else 0
    completed_assigned = int(assigned_summary.get("completed_tasks") or 0) if assigned_summary else 0
    if total_assigned == 0:
        raise ApiError(403, "Only an assigned developer can submit this work for QA review.")
    if completed_assigned < total_assigned:
        raise ApiError(409, "All of your assigned active sprint tasks must be completed before submitting for review.", {"completedTasks": completed_assigned, "totalTasks": total_assigned})
    progress = update_request_progress_from_tasks(db, request_row["id"])
    pm_id = request_row.get("project_manager_user_id")
    if progress < 100:
        updated = transition_request(
            db,
            request_id=request_row["id"],
            to_status="IN_DEVELOPMENT",
            actor_user_id=user["id"],
            comment=payload.comment or "Developer submitted assigned work to the Project Manager for review.",
            request_context=request_context,
            patch={"progress_percentage": progress, "current_assignee_user_id": pm_id},
        )
        notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="DEVELOPER_WORK_SUBMITTED", title="Developer submitted work", message=f"{user.get('full_name') or 'Developer'} submitted assigned work for review. Overall progress is {progress}%.", background_tasks=background_tasks)
        audit(db, actor_user_id=user["id"], action="DEVELOPER_ASSIGNED_WORK_SUBMITTED_FOR_REVIEW", entity_type="REQUEST", entity_id=request_row["id"], new_value={"progressPercentage": progress, "completedTasks": completed_assigned, "totalTasks": total_assigned}, request=request_context)
        db.commit()
        return ok(updated)
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status="DEVELOPMENT_COMPLETE",
        actor_user_id=user["id"],
        comment=payload.comment or "Development completed and submitted to the Project Manager for QA routing.",
        request_context=request_context,
        patch={"progress_percentage": progress, "current_assignee_user_id": pm_id},
    )
    notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="DEVELOPMENT_READY_FOR_QA", title="Development ready for QA", message=f"{request_row['request_number']} is ready for QA assignment.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="DEVELOPMENT_SUBMITTED_FOR_QA_REVIEW", entity_type="REQUEST", entity_id=request_row["id"], new_value={"progressPercentage": progress, "projectManagerUserId": pm_id}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/sprints/{sprint_id}/tasks/{task_id}/comments")
def add_task_comment(request_id: int, sprint_id: int, task_id: int, payload: SprintTaskCommentPayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER", "DEVELOPER"])
    assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    task = assert_task_belongs_to_sprint(db, task_id, sprint_id)
    if user["role_code"] == "PROJECT_MANAGER":
        assert_can_act_as_project_manager(user, request_row)
    elif user["role_code"] != "SYSTEM_ADMIN" and int(task.get("assigned_developer_user_id") or 0) != int(user["id"]):
        raise ApiError(403, "Only the assigned developer can comment on this sprint task.")
    comment_id = add_sprint_task_comment(db, task_id, user["id"], payload.commentText, payload.commentType)
    audit(db, actor_user_id=user["id"], action="SPRINT_TASK_COMMENTED", entity_type="SPRINT_TASK", entity_id=task_id, new_value={"commentId": comment_id, "commentType": payload.commentType}, request=request_context)
    db.commit()
    return ok({"id": comment_id})


@router.post("/{request_id}/assign")
def assign(request_id: int, payload: AssignPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] not in ["REQUIREMENTS_APPROVED", "DEVELOPER_ASSIGNED"]:
        raise ApiError(409, "Developer assignment is available only after requirements are approved by Project Manager and Department HOD.")
    ensure_requirements_approved(db, request_row["id"])
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status="SPRINT_PLANNING",
        actor_user_id=user["id"],
        comment=payload.notes or "Project Workspace opened for sprint planning and task ownership.",
        request_context=request_context,
        patch={"current_assignee_user_id": user["id"]},
    )
    audit(db, actor_user_id=user["id"], action="PROJECT_WORKSPACE_OPENED", entity_type="REQUEST", entity_id=request_row["id"], new_value={"status": "SPRINT_PLANNING"}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/qa/submit")
def submit_for_qa(request_id: int, payload: SubmitForQaPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] != "DEVELOPMENT_COMPLETE":
        raise ApiError(409, "Submit For QA is available only after sprint development is complete.")
    qa = assert_active_role_user(db, payload.qaUserId, "QA", "QA engineer")
    previous = get_active_assignment(db, request_row["id"])
    if previous:
        execute(
            db,
            """
            UPDATE assignments
            SET qa_user_id = :qaUserId,
                qa_assigned_by_user_id = :assignedBy,
                qa_assigned_at = CURRENT_TIMESTAMP,
                notes = :notes
            WHERE id = :assignmentId
            """,
            {"assignmentId": previous["id"], "qaUserId": payload.qaUserId, "assignedBy": user["id"], "notes": payload.comment},
        )
    else:
        execute(
            db,
            """
            INSERT INTO assignments (
              request_id, developer_user_id, qa_user_id, assigned_by_user_id,
              qa_assigned_by_user_id, qa_assigned_at, notes
            )
            VALUES (
              :requestId, NULL, :qaUserId, :assignedBy,
              :assignedBy, CURRENT_TIMESTAMP, :notes
            )
            """,
            {"requestId": request_row["id"], "qaUserId": payload.qaUserId, "assignedBy": user["id"], "notes": payload.comment},
        )
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status="QA_PENDING",
        actor_user_id=user["id"],
        comment=payload.comment or f"Submitted for QA review. QA Engineer {qa['full_name']} assigned.",
        request_context=request_context,
        patch={"current_assignee_user_id": payload.qaUserId},
    )
    notify(db, recipient_user_id=payload.qaUserId, request_id=request_row["id"], type="TESTING_PENDING", title="QA review assigned", message=f"{request_row['request_number']} is ready for QA testing.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="QA_ASSIGNED", entity_type="REQUEST", entity_id=request_row["id"], old_value=previous, new_value={"qaUserId": payload.qaUserId, "qaName": qa["full_name"]}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/development/start")
def development_start(request_id: int, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEVELOPER"])
    ensure_requirements_approved(db, request_row["id"])
    if request_row["status"] != "IN_DEVELOPMENT":
        raise ApiError(409, "Development starts after the project manager starts a ready sprint.")
    assignment = get_active_assignment(db, request_row["id"])
    if (not assignment or assignment.get("developer_user_id") != user["id"]) and user["role_code"] != "SYSTEM_ADMIN":
        raise ApiError(403, "Only the assigned team member can start work.")
    updated = get_request_by_id(db, request_row["id"])
    db.commit()
    return ok(updated)


@router.post("/{request_id}/testing/result")
def testing_result(request_id: int, payload: TestResultPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["QA"])
    if request_row["status"] != "QA_PENDING":
        raise ApiError(409, "QA result can only be submitted during QA review.")
    assignment = get_active_assignment(db, request_row["id"])
    if (not assignment or int(assignment.get("qa_user_id") or 0) != int(user["id"])) and user["role_code"] != "SYSTEM_ADMIN":
        raise ApiError(403, "Only the assigned QA engineer can submit this review.")
    execute(db, """
        INSERT INTO test_results (request_id, qa_user_id, result, test_summary, defects_found)
        VALUES (:requestId, :qaUserId, :result, :testSummary, :defectsFound)
    """, {"requestId": request_row["id"], "qaUserId": user["id"], "result": payload.result, "testSummary": payload.testSummary, "defectsFound": payload.defectsFound})
    add_comment(db, request_row["id"], user["id"], "TESTING", payload.testSummary, True)
    if payload.result == "PASS":
        pm_id = request_row.get("project_manager_user_id")
        updated = transition_request(db, request_id=request_row["id"], to_status="QA_PASSED", actor_user_id=user["id"], comment=payload.testSummary, request_context=request_context, patch={"current_assignee_user_id": pm_id})
        notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="QA_PASSED", title="QA approved", message=f"{request_row['request_number']} passed QA. Send it to the requester for user testing.", background_tasks=background_tasks)
        db.commit()
        return ok(updated)
    pm_id = request_row.get("project_manager_user_id")
    failed = transition_request(db, request_id=request_row["id"], to_status="QA_FAILED", actor_user_id=user["id"], comment=payload.testSummary, request_context=request_context, patch={"current_assignee_user_id": pm_id})
    notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="TESTING_FAILED", title="QA rejected work", message=f"{request_row['request_number']} needs changes after QA review. Comments: {payload.testSummary}", background_tasks=background_tasks)
    db.commit()
    return ok(failed)


@router.post("/{request_id}/uat/send-to-requester")
def send_to_requester_testing(request_id: int, payload: RequiredCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] != "QA_PASSED":
        raise ApiError(409, "Requester testing can be started only after QA approval.")
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status="UAT_PENDING",
        actor_user_id=user["id"],
        comment=payload.comment,
        request_context=request_context,
        patch={"current_assignee_user_id": request_row["requester_user_id"]},
    )
    notify(db, recipient_user_id=request_row["requester_user_id"], request_id=request_row["id"], type="REQUESTER_TESTING_PENDING", title="User testing required", message=f"{request_row['request_number']} is ready for your testing. PM note: {payload.comment}", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SENT_TO_REQUESTER_TESTING", entity_type="REQUEST", entity_id=request_row["id"], new_value={"requesterUserId": request_row["requester_user_id"]}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/qa/send-to-developer")
def send_qa_rework_to_developer(request_id: int, payload: QaReworkPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] != "QA_FAILED":
        raise ApiError(409, "Developer rework can be assigned only after QA rejects the implementation.")
    developer_ids = request_delivery_developer_ids(db, request_row["id"])
    if not developer_ids:
        raise ApiError(409, "No assigned delivery developer was found for this request.")
    primary_developer_id = developer_ids[0]
    bugfix_sprint = create_sprint(db, request_row["id"], user["id"], {
        "sprintName": "Bug Fixing Sprint",
        "goal": "Resolve QA rejection items and prepare the work for another QA review.",
        "notes": payload.comment,
        "status": "PLANNED",
        "assignedDeveloperUserId": primary_developer_id,
    })
    bugfix_sprint = update_sprint_status(db, bugfix_sprint["id"], "ACTIVE")
    created_tasks = []
    for index, task_payload in enumerate(payload.tasks, start=1):
        task = create_sprint_task(db, bugfix_sprint["id"], {
            "title": task_payload.title,
            "description": task_payload.description or payload.comment,
            "assignedDeveloperUserId": primary_developer_id,
            "priority": task_payload.priority,
            "status": "TODO",
        }, user["id"])
        add_sprint_task_status_history(db, task["id"], None, task["status"], user["id"], f"QA bug-fix task {index} created.")
        created_tasks.append(task)
    progress = update_request_progress_from_tasks(db, request_row["id"])
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status="IN_DEVELOPMENT",
        actor_user_id=user["id"],
        comment=payload.comment or "QA changes assigned back to the developer.",
        request_context=request_context,
        patch={"current_assignee_user_id": primary_developer_id, "progress_percentage": progress},
    )
    notify(db, recipient_user_id=primary_developer_id, request_id=request_row["id"], type="QA_REWORK_ASSIGNED", title="QA bug-fix sprint assigned", message=f"{request_row['request_number']} was returned from QA. A Bug Fixing Sprint with {len(created_tasks)} task(s) has been assigned to you.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="QA_REWORK_SENT_TO_DEVELOPER", entity_type="REQUEST", entity_id=request_row["id"], new_value={"developerUserId": primary_developer_id, "sprint": bugfix_sprint, "tasks": created_tasks, "progressPercentage": progress}, request=request_context)
    db.commit()
    return ok({"request": updated, "sprint": bugfix_sprint, "tasks": created_tasks, "progressPercentage": progress})


@router.post("/{request_id}/testing/request-clarification")
def testing_clarification(request_id: int, payload: ClarificationPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["QA"])
    if request_row["status"] not in ["IN_TESTING", "QA_PENDING"]:
        raise ApiError(409, "Clarification can only be requested during review and validation.")
    assignment = get_active_assignment(db, request_row["id"])
    if (not assignment or assignment.get("qa_user_id") != user["id"]) and user["role_code"] != "SYSTEM_ADMIN":
        raise ApiError(403, "Only the assigned reviewer can request clarification.")
    updated = create_clarification_request(db, request_row=request_row, actor_user_id=user["id"], reason_category=payload.reasonCategory, note=payload.note, return_status=request_row["status"], return_assignee_user_id=user["id"], request_context=request_context, background_tasks=background_tasks)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/uat/approve")
def uat_approve(request_id: int, payload: UatApprovePayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    if request_row["status"] != "UAT_PENDING":
        raise ApiError(409, "Requester approval is available only during user testing.")
    if user["role_code"] != "SYSTEM_ADMIN" and int(user["id"]) != int(request_row["requester_user_id"]):
        raise ApiError(403, "Only the requester can approve user testing.")
    execute(db, "INSERT INTO uat_approvals (request_id, uat_approver_user_id, decision, comments) VALUES (:requestId, :userId, 'APPROVED', :comments)", {"requestId": request_row["id"], "userId": user["id"], "comments": payload.comments})
    add_comment(db, request_row["id"], user["id"], "UAT", payload.comments or "Requester testing approved.")
    pm_id = request_row.get("project_manager_user_id")
    updated = transition_request(db, request_id=request_row["id"], to_status="UAT_APPROVED", actor_user_id=user["id"], comment=payload.comments or "Requester testing approved. Ready for PM deployment.", request_context=request_context, patch={"current_assignee_user_id": pm_id})
    notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="REQUESTER_APPROVED", title="Requester approved testing", message=f"{request_row['request_number']} was approved by the requester and is ready for deployment.", background_tasks=background_tasks)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/uat/reject")
def uat_reject(request_id: int, payload: UatRejectPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["UAT_APPROVER"])
    assignment = get_active_assignment(db, request_row["id"])
    execute(db, "INSERT INTO uat_approvals (request_id, uat_approver_user_id, decision, comments) VALUES (:requestId, :userId, 'REJECTED', :comments)", {"requestId": request_row["id"], "userId": user["id"], "comments": payload.comments})
    add_comment(db, request_row["id"], user["id"], "UAT", payload.comments)
    rejected = transition_request(db, request_id=request_row["id"], to_status="UAT_FAILED", actor_user_id=user["id"], comment=payload.comments, request_context=request_context, patch={"current_assignee_user_id": assignment.get("developer_user_id") if assignment else None})
    notify(db, recipient_user_id=assignment.get("developer_user_id") if assignment else None, request_id=request_row["id"], type="UAT_REJECTED", title="Final approval returned", message=f"{request_row['request_number']} needs changes after final approval review.", background_tasks=background_tasks)
    db.commit()
    return ok(rejected)


@router.post("/{request_id}/uat/request-clarification")
def uat_clarification(request_id: int, payload: ClarificationPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["UAT_APPROVER"])
    if request_row["status"] != "UAT_PENDING":
        raise ApiError(409, "Clarification can only be requested during final approval.")
    if request_row.get("current_assignee_user_id") != user["id"] and user["role_code"] != "SYSTEM_ADMIN":
        raise ApiError(403, "Only the assigned final approver can request clarification.")
    updated = create_clarification_request(db, request_row=request_row, actor_user_id=user["id"], reason_category=payload.reasonCategory, note=payload.note, return_status="UAT_PENDING", return_assignee_user_id=user["id"], request_context=request_context, background_tasks=background_tasks)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/deployment/complete")
def deployment_complete(request_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] not in ["UAT_APPROVED", "DEPLOYMENT_PENDING"]:
        raise ApiError(409, "Deployment can only be completed after requester approval.")
    if request_row["status"] == "UAT_APPROVED":
        request_row = transition_request(db, request_id=request_row["id"], to_status="DEPLOYMENT_PENDING", actor_user_id=user["id"], comment=payload.comment or "Deployment started after requester approval.", request_context=request_context, patch={"current_assignee_user_id": user["id"]})
    request_row = transition_request(db, request_id=request_row["id"], to_status="DEPLOYED", actor_user_id=user["id"], comment=payload.comment or "Deployment completed.", request_context=request_context, patch={"current_assignee_user_id": request_row["requester_user_id"]})
    updated = transition_request(db, request_id=request_row["id"], to_status="READY_FOR_COMPLETION", actor_user_id=user["id"], comment=payload.comment or "Deployment completed. Requester confirmation is required before closure.", request_context=request_context, patch={"current_assignee_user_id": request_row["requester_user_id"]})
    details = [
        ("Request ID", request_row.get("request_number")),
        ("Request Title", request_row.get("title")),
        ("Deployment Note", payload.comment or "Deployment completed."),
        ("Next Step", "Review the final outcome and complete the request if everything is accepted."),
    ]
    notify(
        db,
        recipient_user_id=request_row["requester_user_id"],
        request_id=request_row["id"],
        type="REQUEST_READY_FOR_COMPLETION",
        title=f"Request Ready For Completion - {request_row['request_number']}",
        message=f"{request_row['request_number']} has been deployed. Please review the final outcome and complete the request.",
        background_tasks=background_tasks,
        email_subject=f"Request Ready For Completion - {request_row['request_number']}",
        email_body=workflow_email_text(
            greeting=request_row.get("requester_name") or "Requester",
            intro="Your request has been deployed and is ready for your final confirmation.",
            details=details,
            action_url=app_request_url(request_row["id"]),
            action_label="Review And Complete Request",
            next_steps="Please open RequestOps, review the final outcome and ISMS report, then click Complete Request when you are satisfied.",
        ),
        email_html_body=workflow_email_html(
            greeting=request_row.get("requester_name") or "Requester",
            intro="Your request has been deployed and is ready for your final confirmation.",
            details=details,
            action_url=app_request_url(request_row["id"]),
            action_label="Review And Complete Request",
            next_steps="Please open RequestOps, review the final outcome and ISMS report, then click Complete Request when you are satisfied.",
        ),
        email_actor_user_id=user["id"],
        audit_email=True,
    )
    audit(db, actor_user_id=user["id"], action="REQUEST_READY_FOR_COMPLETION", entity_type="REQUEST", entity_id=request_row["id"], new_value={"requesterUserId": request_row["requester_user_id"]}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/requester/complete")
def requester_complete_request(request_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id)
    if request_row["status"] != "READY_FOR_COMPLETION":
        raise ApiError(409, "Request can be completed only after deployment is ready for requester confirmation.")
    if user["role_code"] != "SYSTEM_ADMIN" and int(user["id"]) != int(request_row["requester_user_id"]):
        raise ApiError(403, "Only the original requester can complete this request.")
    comment = payload.comment or "Requester reviewed the final outcome and completed the request."
    add_comment(db, request_row["id"], user["id"], "APPROVAL", comment)
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status="CLOSED",
        actor_user_id=user["id"],
        comment=comment,
        request_context=request_context,
        patch={"current_assignee_user_id": None, "progress_percentage": 100},
    )
    for recipient_id in unique_recipient_ids(request_row.get("project_manager_user_id"), request_row.get("department_head_user_id"), request_row.get("it_head_user_id"), request_row.get("requester_user_id")):
        notify(db, recipient_user_id=recipient_id, request_id=request_row["id"], type="REQUEST_COMPLETED_BY_REQUESTER", title="Request completed by requester", message=f"{request_row['request_number']} has been completed by the requester.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="REQUEST_COMPLETED_BY_REQUESTER", entity_type="REQUEST", entity_id=request_row["id"], new_value={"comment": comment}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/close")
def close_request(request_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER", "IT_HEAD"])
    if request_row["status"] != "DEPLOYED":
        raise ApiError(409, "Only deployed requests can be closed.")
    updated = transition_request(db, request_id=request_row["id"], to_status="CLOSED", actor_user_id=user["id"], comment=payload.comment or "Request closed after deployment.", request_context=request_context, patch={"current_assignee_user_id": None})
    notify(db, recipient_user_id=request_row["requester_user_id"], request_id=request_row["id"], type="REQUEST_CLOSED", title="Request completed", message=f"{request_row['request_number']} has been completed.", background_tasks=background_tasks)
    db.commit()
    return ok(updated)
