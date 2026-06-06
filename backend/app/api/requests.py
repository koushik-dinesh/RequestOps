from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Request as FastAPIRequest, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

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
    ProjectScopePayload,
    ProjectScopeReviewPayload,
    RequestCreatePayload,
    RequestDetailsPayload,
    RequiredCommentPayload,
    RoiPayload,
    SprintPayload,
    SprintTaskAssignPayload,
    SprintTaskPayload,
    SprintTaskStatusPayload,
    TestResultPayload,
    UatApprovePayload,
    UatRejectPayload,
    UserStoryPayload,
    UserStoryReviewPayload,
)
from app.repositories.project_management_repository import (
    assign_project_manager,
    assign_sprint_task_developer,
    create_project_scope,
    create_sprint,
    create_sprint_task,
    create_user_story,
    get_project_scope,
    get_sprint,
    get_sprint_task,
    get_user_story,
    list_project_scopes,
    list_sprint_tasks,
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
from app.services.activity_service import audit, notify, notify_role
from app.services.upload_service import save_upload
from app.utils.http import ApiError, ok
from app.workflows.request_workflow import get_request_by_id, transition_request


router = APIRouter(prefix="/requests", tags=["requests"], dependencies=[Depends(get_current_user)])

MISSING_REPORTING_AUTHORITY_MESSAGE = "No person found to report at this level. Please contact the System Administrator to configure a reporting authority for your department."
WORKLOAD_AVAILABLE_MAX = 3
WORKLOAD_MODERATE_MAX = 6
WORKLOAD_ACTIVE_STATUSES = [
    "DEVELOPER_ASSIGNED",
    "SPRINT_PLANNING",
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


def get_progress_stakeholder_ids(db: Session, request_row: dict, assignment: dict | None) -> list[int]:
    admins = rows(db, """
        SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id
        WHERE r.code = 'SYSTEM_ADMIN' AND u.status = 'ACTIVE'
    """)
    ids = [
        request_row.get("requester_user_id"),
        request_row.get("department_head_user_id"),
        request_row.get("it_head_user_id"),
        request_row.get("project_manager_user_id"),
        assignment.get("developer_user_id") if assignment else None,
        assignment.get("qa_user_id") if assignment else None,
        *[admin["id"] for admin in admins],
    ]
    return list(dict.fromkeys([int(item) for item in ids if item]))


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
        SELECT COUNT(DISTINCT r.id) AS count
        FROM assignments a
        JOIN requests r ON r.id = a.request_id
        WHERE a.developer_user_id = :developerUserId
          AND a.is_active = TRUE
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


def crossed_progress_milestones(previous_progress: int, next_progress: int) -> list[int]:
    return [milestone for milestone in [25, 50, 75, 100] if previous_progress < milestone <= next_progress]


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
    notify(db, recipient_user_id=request_row["requester_user_id"], request_id=request_row["id"], type="CLARIFICATION_REQUESTED", title="Clarification requested", message=f"{request_row['request_number']} needs more information: {reason_category.replace('_', ' ').lower()}.", background_tasks=background_tasks)
    audit(db, actor_user_id=actor_user_id, action="REQUEST_CLARIFICATION_REQUESTED", entity_type="REQUEST", entity_id=request_row["id"], new_value={"reasonCategory": reason_category, "note": note, "returnStatus": return_status}, request=request_context)
    return updated


def roi_snapshot(request_row: dict) -> dict:
    snapshot = {
        "roiType": request_row.get("roi_type"),
        "roiHoursSavedPerEmployeePerMonth": request_row.get("roi_hours_saved_per_employee_per_month"),
        "roiEmployeesBenefited": request_row.get("roi_employees_benefited"),
        "roiMonthlyCostSavingsInr": request_row.get("roi_monthly_cost_savings_inr"),
    }
    return {**snapshot, **roi_calculation(snapshot)}


def roi_calculation(roi: dict) -> dict:
    if roi.get("roiType") == "TIME_SAVINGS":
        monthly_hours = float(roi.get("roiHoursSavedPerEmployeePerMonth") or 0) * int(roi.get("roiEmployeesBenefited") or 0)
        annual_hours = monthly_hours * 12
        return {
            "roiMonthlyProductiveHoursSaved": monthly_hours,
            "roiAnnualProductiveHoursSaved": annual_hours,
            "roiAnnualCostSavingsInr": None,
            "roiCalculatedAnnualValue": annual_hours,
            "roiCalculatedAnnualUnit": "HOURS",
        }
    if roi.get("roiType") == "COST_SAVINGS":
        annual_cost = float(roi.get("roiMonthlyCostSavingsInr") or 0) * 12
        return {
            "roiMonthlyProductiveHoursSaved": None,
            "roiAnnualProductiveHoursSaved": None,
            "roiAnnualCostSavingsInr": annual_cost,
            "roiCalculatedAnnualValue": annual_cost,
            "roiCalculatedAnnualUnit": "INR",
        }
    return {
        "roiMonthlyProductiveHoursSaved": None,
        "roiAnnualProductiveHoursSaved": None,
        "roiAnnualCostSavingsInr": None,
        "roiCalculatedAnnualValue": None,
        "roiCalculatedAnnualUnit": None,
    }


def request_with_roi_calculation(request_row: dict | None) -> dict | None:
    if not request_row:
        return None
    roi = {
        "roiType": request_row.get("roi_type"),
        "roiHoursSavedPerEmployeePerMonth": request_row.get("roi_hours_saved_per_employee_per_month"),
        "roiEmployeesBenefited": request_row.get("roi_employees_benefited"),
        "roiMonthlyCostSavingsInr": request_row.get("roi_monthly_cost_savings_inr"),
    }
    return {**request_row, **roi_calculation(roi)}


def annual_roi_summary(roi: dict) -> str:
    calculated = roi_calculation(roi)
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
            filters.append("a.developer_user_id = :userId")
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
               dev.full_name AS developer_name, qa.full_name AS qa_name
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
        WHERE {' AND '.join(filters)}
        ORDER BY r.updated_at DESC
        LIMIT 200
    """, params)
    return ok([request_with_roi_calculation(item) for item in request_rows])


@router.post("/")
def create_request(payload: RequestCreatePayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.get("department_id"):
        raise ApiError(400, "Your profile must have a department before creating requests.")
    department = one(db, 'SELECT * FROM departments WHERE id = :id AND status = "ACTIVE"', {"id": user["department_id"]})
    reporting_authority_user_id = user.get("reporting_manager_user_id") or (department.get("department_head_user_id") if department else None)
    authority = one(db, 'SELECT id FROM users WHERE id = :id AND status = "ACTIVE"', {"id": reporting_authority_user_id}) if reporting_authority_user_id else None
    if not authority:
        raise ApiError(409, MISSING_REPORTING_AUTHORITY_MESSAGE)
    year_row = one(db, "SELECT YEAR(CURRENT_DATE) AS year")
    year = year_row["year"]
    counter = one(
        db,
        """
        SELECT COALESCE(MAX(CAST(SUBSTRING_INDEX(request_number, '-', -1) AS UNSIGNED)), 0) + 1 AS next_number
        FROM requests
        WHERE request_number LIKE :prefix
        """,
        {"prefix": f"REQ-{year}-%"},
    )
    request_number = f"REQ-{year}-{int(counter['next_number']):06d}"
    result = execute(db, """
        INSERT INTO requests
          (request_number, title, request_type, priority, business_justification, description, expected_benefits,
           roi_type, roi_hours_saved_per_employee_per_month, roi_employees_benefited, roi_monthly_cost_savings_inr,
           status, requester_user_id, requester_department_id, department_head_user_id, current_assignee_user_id)
        VALUES (:requestNumber, :title, :requestType, :priority, :businessJustification, :description, :expectedBenefits,
                :roiType, :roiHoursSavedPerEmployeePerMonth, :roiEmployeesBenefited, :roiMonthlyCostSavingsInr,
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
        "roiEmployeesBenefited": payload.roiEmployeesBenefited if payload.roiType == "TIME_SAVINGS" else None,
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
    notify(db, recipient_user_id=reporting_authority_user_id, request_id=request_id, type="REQUEST_AWAITING_APPROVAL", title="Request awaiting department approval", message=f"{request_number} is awaiting your approval.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="REQUEST_CREATED", entity_type="REQUEST", entity_id=request_id, new_value=payload.model_dump(), request=request_context)
    if payload.roiType:
        created_roi = {
            "roiType": payload.roiType,
            "roiHoursSavedPerEmployeePerMonth": payload.roiHoursSavedPerEmployeePerMonth,
            "roiEmployeesBenefited": payload.roiEmployeesBenefited,
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
    if request_row["requester_user_id"] != user["id"] and user["role_code"] != "SYSTEM_ADMIN":
        raise ApiError(403, "Only the requester can update request details.")
    if request_row["status"] != "CLARIFICATION_REQUESTED":
        raise ApiError(409, "Request details can only be updated while clarification is requested.")
    execute(db, """
        UPDATE requests
        SET title = :title, business_justification = :businessJustification,
            description = :description, expected_benefits = :expectedBenefits
        WHERE id = :requestId
    """, {"requestId": request_id, **payload.model_dump()})
    audit(db, actor_user_id=user["id"], action="REQUEST_DETAILS_UPDATED_FOR_CLARIFICATION", entity_type="REQUEST", entity_id=request_id, new_value=payload.model_dump(), request=request_context)
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
    request_row = assert_request_access(db, user, request_id, ["DEPARTMENT_HEAD"])
    assert_can_act_as_department_head(db, user, request_row)
    previous = roi_snapshot(request_row)
    next_roi = payload.model_dump()
    next_roi = {
        "roiType": next_roi.get("roiType"),
        "roiHoursSavedPerEmployeePerMonth": next_roi.get("roiHoursSavedPerEmployeePerMonth") if next_roi.get("roiType") == "TIME_SAVINGS" else None,
        "roiEmployeesBenefited": next_roi.get("roiEmployeesBenefited") if next_roi.get("roiType") == "TIME_SAVINGS" else None,
        "roiMonthlyCostSavingsInr": next_roi.get("roiMonthlyCostSavingsInr") if next_roi.get("roiType") == "COST_SAVINGS" else None,
    }
    next_roi = {**next_roi, **roi_calculation(next_roi)}
    execute(db, """
        UPDATE requests
        SET roi_type = :roiType,
            roi_hours_saved_per_employee_per_month = :roiHoursSavedPerEmployeePerMonth,
            roi_employees_benefited = :roiEmployeesBenefited,
            roi_monthly_cost_savings_inr = :roiMonthlyCostSavingsInr
        WHERE id = :requestId
    """, {
        "requestId": request_id,
        "roiType": next_roi.get("roiType"),
        "roiHoursSavedPerEmployeePerMonth": next_roi.get("roiHoursSavedPerEmployeePerMonth"),
        "roiEmployeesBenefited": next_roi.get("roiEmployeesBenefited"),
        "roiMonthlyCostSavingsInr": next_roi.get("roiMonthlyCostSavingsInr"),
    })
    execute(db, """
        INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
        VALUES (:requestId, :status, :status, :actorUserId, :comment)
    """, {
        "requestId": request_id,
        "status": request_row["status"],
        "actorUserId": user["id"],
        "comment": f"ROI Updated by Department Head. Previous: {annual_roi_summary(previous)}. Updated: {annual_roi_summary(next_roi)}.",
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
    add_comment(db, request_row["id"], user["id"], "APPROVAL", payload.comment)
    updated = transition_request(db, request_id=request_row["id"], to_status="IT_REVIEW_PENDING", actor_user_id=user["id"], comment=payload.comment or "Department approved.", request_context=request_context, patch={"department_head_user_id": head_id, "current_assignee_user_id": None})
    notify_role(db, "IT_HEAD", request_id=request_row["id"], type="REQUEST_IT_REVIEW_PENDING", title="Request awaiting internal review", message=f"{request_row['request_number']} has been approved by the department and is ready for internal review.", background_tasks=background_tasks)
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
def it_review_defer(request_id: int, payload: RequiredCommentPayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["IT_HEAD"])
    add_comment(db, request_row["id"], user["id"], "GENERAL", payload.comment, True)
    updated = transition_request(db, request_id=request_row["id"], to_status="DEFERRED", actor_user_id=user["id"], comment=payload.comment, request_context=request_context)
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
    if request_row["status"] not in ["PM_ASSIGNED", "SCOPE_REVIEW"]:
        raise ApiError(409, "Scope can only be created after Project Manager assignment.")
    scope = create_project_scope(db, request_row["id"], user["id"], {**payload.model_dump(), "status": "DRAFT"})
    audit(db, actor_user_id=user["id"], action="PROJECT_SCOPE_CREATED", entity_type="REQUEST", entity_id=request_row["id"], new_value=scope, request=request_context)
    db.commit()
    return ok(scope, 201)


@router.put("/{request_id}/scopes/{scope_id}")
def update_scope(request_id: int, scope_id: int, payload: ProjectScopePayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    existing = assert_scope_belongs_to_request(db, scope_id, request_row["id"])
    if existing["status"] == "APPROVED":
        raise ApiError(409, "Approved scope definitions cannot be edited.")
    updated = update_project_scope(db, scope_id, payload.model_dump())
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
    updated = transition_request(db, request_id=request_row["id"], to_status="SCOPE_REVIEW", actor_user_id=user["id"], comment=f"Scope submitted: {scope['scope_title']}.", request_context=request_context, patch={"current_assignee_user_id": request_row.get("it_head_user_id")})
    notify(db, recipient_user_id=request_row.get("it_head_user_id"), request_id=request_row["id"], type="SCOPE_SUBMITTED", title="Scope submitted", message=f"{request_row['request_number']} has a submitted scope definition.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="PROJECT_SCOPE_SUBMITTED", entity_type="PROJECT_SCOPE", entity_id=scope_id, new_value={"status": "SUBMITTED"}, request=request_context)
    db.commit()
    return ok(updated)


def process_scope_review(request_id: int, scope_id: int, decision: str, review_comments: str | None, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict, db: Session):
    request_row = assert_request_access(db, user, request_id, ["IT_HEAD"])
    scope = assert_scope_belongs_to_request(db, scope_id, request_row["id"])
    if request_row["status"] != "SCOPE_REVIEW" or scope["status"] != "SUBMITTED":
        raise ApiError(409, "Scope can only be reviewed after it has been submitted.")
    next_status = "APPROVED" if decision == "APPROVED" else "REWORK_REQUIRED"
    reviewed = review_project_scope(db, scope_id, user["id"], next_status, review_comments)
    pm_id = request_row.get("project_manager_user_id")
    updated = transition_request(
        db,
        request_id=request_row["id"],
        to_status="PM_ASSIGNED",
        actor_user_id=user["id"],
        comment=review_comments or ("Scope approved." if next_status == "APPROVED" else "Scope rejected and returned for rework."),
        request_context=request_context,
        patch={"current_assignee_user_id": pm_id},
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
    if request_row["status"] not in ["PM_ASSIGNED", "SCOPE_REVIEW", "USER_STORY_REVIEW"]:
        raise ApiError(409, "User stories can only be created by the assigned Project Manager before developer assignment.")
    ensure_approved_scope(db, request_row["id"])
    story = create_user_story(db, request_row["id"], user["id"], {**payload.model_dump(), "status": "DRAFT"})
    audit(db, actor_user_id=user["id"], action="USER_STORY_CREATED", entity_type="USER_STORY", entity_id=story["id"] if story else None, new_value=story, request=request_context)
    db.commit()
    return ok(story, 201)


@router.put("/{request_id}/user-stories/{story_id}")
def update_story(request_id: int, story_id: int, payload: UserStoryPayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    existing = assert_story_belongs_to_request(db, story_id, request_row["id"])
    if existing["status"] == "APPROVED":
        raise ApiError(409, "Approved user stories cannot be edited.")
    updated = update_user_story(db, story_id, payload.model_dump())
    audit(db, actor_user_id=user["id"], action="USER_STORY_UPDATED", entity_type="USER_STORY", entity_id=story_id, old_value=existing, new_value=updated, request=request_context)
    db.commit()
    return ok(updated)


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
            execute(db, "UPDATE requests SET current_assignee_user_id = :pmId WHERE id = :requestId", {"pmId": pm_id, "requestId": request_row["id"]})
            notify(db, recipient_user_id=pm_id, request_id=request_row["id"], type="USER_STORIES_APPROVED", title="User stories approved", message=f"All user stories for {request_row['request_number']} are approved. Developer assignment is now available.", background_tasks=background_tasks)
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


@router.post("/{request_id}/sprints")
def create_request_sprint(request_id: int, payload: SprintPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] not in ["DEVELOPER_ASSIGNED", "SPRINT_PLANNING"]:
        raise ApiError(409, "Sprint can only be created after developer assignment.")
    assignment = get_active_assignment(db, request_row["id"])
    if not assignment:
        raise ApiError(409, "Developer and QA assignment is required before sprint planning.")
    sprint = create_sprint(db, request_row["id"], user["id"], payload.model_dump())
    updated = transition_request(db, request_id=request_row["id"], to_status="SPRINT_PLANNING", actor_user_id=user["id"], comment=f"Sprint created: {payload.sprintName}.", request_context=request_context, patch={"current_assignee_user_id": assignment.get("developer_user_id")})
    notify(db, recipient_user_id=assignment.get("developer_user_id"), request_id=request_row["id"], type="SPRINT_CREATED", title="Sprint ready", message=f"A sprint has been created for {request_row['request_number']}. Development can begin.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_CREATED", entity_type="SPRINT", entity_id=sprint["id"] if sprint else None, new_value=sprint, request=request_context)
    db.commit()
    return ok(updated)


@router.put("/{request_id}/sprints/{sprint_id}")
def update_request_sprint(request_id: int, sprint_id: int, payload: SprintPayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    existing = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if existing["status"] == "COMPLETED":
        raise ApiError(409, "Completed sprints cannot be edited.")
    updated = update_sprint(db, sprint_id, payload.model_dump())
    audit(db, actor_user_id=user["id"], action="SPRINT_UPDATED", entity_type="SPRINT", entity_id=sprint_id, old_value=existing, new_value=updated, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/sprints/{sprint_id}/start")
def start_request_sprint(request_id: int, sprint_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if sprint["status"] not in ["PLANNED", "CREATED"]:
        raise ApiError(409, "Only planned or created sprints can be started.")
    assignment = get_active_assignment(db, request_row["id"])
    if not assignment:
        raise ApiError(409, "Developer and QA assignment is required before starting a sprint.")
    started = update_sprint_status(db, sprint_id, "ACTIVE")
    if request_row["status"] in ["DEVELOPER_ASSIGNED", "SPRINT_PLANNING"]:
        updated_request = transition_request(db, request_id=request_row["id"], to_status="IN_DEVELOPMENT", actor_user_id=user["id"], comment=payload.comment or f"Sprint started: {sprint['sprint_name']}.", request_context=request_context, patch={"current_assignee_user_id": assignment.get("developer_user_id")})
    else:
        updated_request = get_request_by_id(db, request_row["id"])
    notify(db, recipient_user_id=assignment.get("developer_user_id"), request_id=request_row["id"], type="SPRINT_STARTED", title="Sprint started", message=f"Sprint {sprint['sprint_name']} has started for {request_row['request_number']}.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_STARTED", entity_type="SPRINT", entity_id=sprint_id, old_value=sprint, new_value=started, request=request_context)
    db.commit()
    return ok({"request": updated_request, "sprint": started})


@router.post("/{request_id}/sprints/{sprint_id}/complete")
def complete_request_sprint(request_id: int, sprint_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if sprint["status"] != "ACTIVE":
        raise ApiError(409, "Only active sprints can be completed.")
    completed = update_sprint_status(db, sprint_id, "COMPLETED")
    assignment = get_active_assignment(db, request_row["id"])
    notify(db, recipient_user_id=assignment.get("developer_user_id") if assignment else None, request_id=request_row["id"], type="SPRINT_COMPLETED", title="Sprint completed", message=f"Sprint {sprint['sprint_name']} has been completed.", background_tasks=background_tasks)
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


@router.post("/{request_id}/sprints/{sprint_id}/tasks")
def create_task(request_id: int, sprint_id: int, payload: SprintTaskPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if sprint["status"] == "COMPLETED":
        raise ApiError(409, "Tasks cannot be added to completed sprints.")
    if payload.userStoryId:
        assert_story_belongs_to_request(db, payload.userStoryId, request_row["id"])
    if payload.assignedDeveloperUserId:
        assert_active_role_user(db, payload.assignedDeveloperUserId, "DEVELOPER", "Assigned developer")
    task = create_sprint_task(db, sprint_id, payload.model_dump())
    notify(db, recipient_user_id=payload.assignedDeveloperUserId, request_id=request_row["id"], type="SPRINT_TASK_ASSIGNED", title="Sprint task assigned", message=f"You have a sprint task for {request_row['request_number']}.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_TASK_CREATED", entity_type="SPRINT_TASK", entity_id=task["id"] if task else None, new_value=task, request=request_context)
    db.commit()
    return ok(task, 201)


@router.put("/{request_id}/sprints/{sprint_id}/tasks/{task_id}")
def update_task(request_id: int, sprint_id: int, task_id: int, payload: SprintTaskPayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    sprint = assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    if sprint["status"] == "COMPLETED":
        raise ApiError(409, "Completed sprint tasks cannot be edited.")
    existing = assert_task_belongs_to_sprint(db, task_id, sprint_id)
    if payload.userStoryId:
        assert_story_belongs_to_request(db, payload.userStoryId, request_row["id"])
    if payload.assignedDeveloperUserId:
        assert_active_role_user(db, payload.assignedDeveloperUserId, "DEVELOPER", "Assigned developer")
    updated = update_sprint_task(db, task_id, payload.model_dump())
    audit(db, actor_user_id=user["id"], action="SPRINT_TASK_UPDATED", entity_type="SPRINT_TASK", entity_id=task_id, old_value=existing, new_value=updated, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/sprints/{sprint_id}/tasks/{task_id}/assign-developer")
def assign_task_developer(request_id: int, sprint_id: int, task_id: int, payload: SprintTaskAssignPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    existing = assert_task_belongs_to_sprint(db, task_id, sprint_id)
    developer = assert_active_role_user(db, payload.developerUserId, "DEVELOPER", "Assigned developer")
    updated = assign_sprint_task_developer(db, task_id, payload.developerUserId)
    notify(db, recipient_user_id=payload.developerUserId, request_id=request_row["id"], type="SPRINT_TASK_ASSIGNED", title="Sprint task assigned", message=f"{existing['title']} has been assigned to you.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="SPRINT_TASK_DEVELOPER_ASSIGNED", entity_type="SPRINT_TASK", entity_id=task_id, old_value=existing, new_value={"developerUserId": payload.developerUserId, "developerName": developer["full_name"]}, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/sprints/{sprint_id}/tasks/{task_id}/status")
def update_task_status(request_id: int, sprint_id: int, task_id: int, payload: SprintTaskStatusPayload, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER", "DEVELOPER"])
    assert_sprint_belongs_to_request(db, sprint_id, request_row["id"])
    existing = assert_task_belongs_to_sprint(db, task_id, sprint_id)
    if user["role_code"] == "PROJECT_MANAGER":
        assert_can_act_as_project_manager(user, request_row)
    elif user["role_code"] != "SYSTEM_ADMIN" and int(existing.get("assigned_developer_user_id") or 0) != int(user["id"]):
        raise ApiError(403, "Only the assigned developer can update this sprint task status.")
    updated = update_sprint_task_status(db, task_id, payload.status, payload.actualHours)
    audit(db, actor_user_id=user["id"], action="SPRINT_TASK_STATUS_UPDATED", entity_type="SPRINT_TASK", entity_id=task_id, old_value=existing, new_value=updated, request=request_context)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/assign")
def assign(request_id: int, payload: AssignPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER"])
    assert_can_act_as_project_manager(user, request_row)
    if request_row["status"] not in ["USER_STORY_REVIEW", "DEVELOPER_ASSIGNED"]:
        raise ApiError(409, "Developer assignment is available only after Department HOD approves user stories.")
    ensure_approved_user_stories(db, request_row["id"])
    previous = get_active_assignment(db, request_row["id"])
    assignees = rows(db, """
        SELECT u.id, u.full_name, r.code AS role_code
        FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id IN (:developerUserId, :qaUserId) AND u.status = 'ACTIVE'
    """, {"developerUserId": payload.developerUserId, "qaUserId": payload.qaUserId})
    developer = next((a for a in assignees if int(a["id"]) == int(payload.developerUserId)), None)
    qa = next((a for a in assignees if int(a["id"]) == int(payload.qaUserId)), None)
    if not developer or developer["role_code"] != "DEVELOPER":
        raise ApiError(400, "Assigned team member must be an active developer.")
    if not qa or qa["role_code"] != "QA":
        raise ApiError(400, "Reviewer must be an active QA employee.")
    changes = []
    if previous and previous.get("developer_user_id") != payload.developerUserId:
        changes.append(f"Assigned team member changed from {previous.get('developer_name') or 'previous team member'} to {developer['full_name']}.")
    if previous and previous.get("qa_user_id") != payload.qaUserId:
        changes.append(f"Reviewer changed from {previous.get('qa_name') or 'previous reviewer'} to {qa['full_name']}.")
    assignment_comment = f"Assignment updated. {' '.join(changes)}" if previous and changes else ("Assignment updated." if previous else f"Developer assigned. Developer {developer['full_name']}. Reviewer {qa['full_name']}.")
    previous_developer_id = previous.get("developer_user_id") if previous else None
    previous_developer_count_before = developer_active_request_count(db, previous_developer_id)
    next_developer_count_before = developer_active_request_count(db, payload.developerUserId)
    execute(db, "UPDATE assignments SET is_active = FALSE WHERE request_id = :requestId", {"requestId": request_row["id"]})
    execute(db, """
        INSERT INTO assignments (request_id, developer_user_id, qa_user_id, assigned_by_user_id, notes)
        VALUES (:requestId, :developerUserId, :qaUserId, :assignedBy, :notes)
    """, {"requestId": request_row["id"], "developerUserId": payload.developerUserId, "qaUserId": payload.qaUserId, "assignedBy": user["id"], "notes": payload.notes})
    transition_request(
        db,
        request_id=request_row["id"],
        to_status="DEVELOPER_ASSIGNED",
        actor_user_id=user["id"],
        comment=payload.notes or assignment_comment,
        request_context=request_context,
        patch={"current_assignee_user_id": payload.developerUserId},
    )
    notify(db, recipient_user_id=payload.developerUserId, request_id=request_row["id"], type="REQUEST_ASSIGNED", title="Request assigned", message=f"{request_row['request_number']} has been assigned to you for work.", background_tasks=background_tasks)
    notify(db, recipient_user_id=payload.qaUserId, request_id=request_row["id"], type="REQUEST_ASSIGNED_QA", title="Review assigned", message=f"{request_row['request_number']} has been assigned to you for review and validation.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="REQUEST_REASSIGNED" if previous else "REQUEST_ASSIGNED", entity_type="REQUEST", entity_id=request_row["id"], old_value=previous, new_value=payload.model_dump(), request=request_context)
    if previous_developer_id and int(previous_developer_id) != int(payload.developerUserId):
        audit_workload_status_change(db, request_context, user["id"], previous_developer_id, previous_developer_count_before, developer_active_request_count(db, previous_developer_id))
    audit_workload_status_change(db, request_context, user["id"], payload.developerUserId, next_developer_count_before, developer_active_request_count(db, payload.developerUserId))
    db.commit()
    return ok(get_request_by_id(db, request_row["id"]))


@router.post("/{request_id}/development/start")
def development_start(request_id: int, request_context: FastAPIRequest, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEVELOPER"])
    assignment = get_active_assignment(db, request_row["id"])
    if (not assignment or assignment.get("developer_user_id") != user["id"]) and user["role_code"] != "SYSTEM_ADMIN":
        raise ApiError(403, "Only the assigned team member can start work.")
    updated = transition_request(db, request_id=request_row["id"], to_status="IN_DEVELOPMENT", actor_user_id=user["id"], comment="Work started.", request_context=request_context, patch={"current_assignee_user_id": user["id"]})
    db.commit()
    return ok(updated)


@router.post("/{request_id}/development/update")
def development_update(
    request_id: int,
    request_context: FastAPIRequest,
    background_tasks: BackgroundTasks,
    progressPercentage: int = Form(...),
    updateNotes: str = Form(...),
    attachment: UploadFile | None = File(default=None),
    user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if progressPercentage < 0 or progressPercentage > 100 or len(updateNotes) < 3:
        raise ApiError(400, "Validation failed.")
    request_row = assert_request_access(db, user, request_id, ["DEVELOPER"])
    assignment = get_active_assignment(db, request_row["id"])
    if (not assignment or assignment.get("developer_user_id") != user["id"]) and user["role_code"] != "SYSTEM_ADMIN":
        raise ApiError(403, "Only the assigned team member can update progress.")
    previous_progress = int(request_row.get("progress_percentage") or 0)
    attachment_id = None
    if attachment:
        attachment_id = insert_attachment(db, request_row["id"], user["id"], save_upload(attachment))
    execute(db, """
        INSERT INTO development_updates (request_id, developer_user_id, progress_percentage, update_notes, attachment_id)
        VALUES (:requestId, :developerUserId, :progressPercentage, :updateNotes, :attachmentId)
    """, {"requestId": request_row["id"], "developerUserId": user["id"], "progressPercentage": progressPercentage, "updateNotes": updateNotes, "attachmentId": attachment_id})
    execute(db, "UPDATE requests SET progress_percentage = :progress WHERE id = :requestId", {"requestId": request_row["id"], "progress": progressPercentage})
    add_comment(db, request_row["id"], user["id"], "DEVELOPMENT", updateNotes, True)
    execute(db, """
        INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
        VALUES (:requestId, :fromStatus, :toStatus, :actorUserId, :comment)
    """, {"requestId": request_row["id"], "fromStatus": request_row["status"], "toStatus": request_row["status"], "actorUserId": user["id"], "comment": f"Progress Updated: {previous_progress}% → {progressPercentage}%. {updateNotes}"})
    if crossed_progress_milestones(previous_progress, progressPercentage):
        for recipient in get_progress_stakeholder_ids(db, request_row, assignment):
            notify(db, recipient_user_id=recipient, request_id=request_row["id"], type="DEVELOPMENT_READY_FOR_TESTING" if progressPercentage >= 100 else "DEVELOPMENT_PROGRESS_UPDATED", title="Ready for review" if progressPercentage >= 100 else "Progress updated", message=f"{request_row['request_number']} is now {progressPercentage}% complete.", background_tasks=background_tasks)
    audit(db, actor_user_id=user["id"], action="DEVELOPMENT_UPDATED", entity_type="REQUEST", entity_id=request_row["id"], old_value={"progressPercentage": previous_progress}, new_value={"progressPercentage": progressPercentage, "updateNotes": updateNotes, "attachmentId": attachment_id}, request=request_context)
    db.commit()
    return ok(get_request_by_id(db, request_row["id"]))


@router.post("/{request_id}/development/complete")
def development_complete(request_id: int, payload: OptionalCommentPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["DEVELOPER"])
    assignment = get_active_assignment(db, request_row["id"])
    add_comment(db, request_row["id"], user["id"], "DEVELOPMENT", payload.comment or "Work complete.", True)
    updated = transition_request(db, request_id=request_row["id"], to_status="QA_PENDING", actor_user_id=user["id"], comment=payload.comment or "Work complete. Routed to QA.", request_context=request_context, patch={"progress_percentage": 100, "current_assignee_user_id": assignment.get("qa_user_id") if assignment else None})
    notify(db, recipient_user_id=assignment.get("qa_user_id") if assignment else None, request_id=request_row["id"], type="TESTING_PENDING", title="Review pending", message=f"{request_row['request_number']} is ready for review and validation.", background_tasks=background_tasks)
    db.commit()
    return ok(updated)


@router.post("/{request_id}/testing/result")
def testing_result(request_id: int, payload: TestResultPayload, request_context: FastAPIRequest, background_tasks: BackgroundTasks, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    request_row = assert_request_access(db, user, request_id, ["QA"])
    if request_row["status"] not in ["QA_PENDING", "IN_TESTING"]:
        raise ApiError(409, "QA result can only be submitted during QA review.")
    execute(db, """
        INSERT INTO test_results (request_id, qa_user_id, result, test_summary, defects_found)
        VALUES (:requestId, :qaUserId, :result, :testSummary, :defectsFound)
    """, {"requestId": request_row["id"], "qaUserId": user["id"], "result": payload.result, "testSummary": payload.testSummary, "defectsFound": payload.defectsFound})
    add_comment(db, request_row["id"], user["id"], "TESTING", payload.testSummary, True)
    if payload.result == "PASS":
        uat = one(db, "SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE r.code = 'UAT_APPROVER' AND u.status = 'ACTIVE' ORDER BY u.id LIMIT 1")
        uat_user_id = uat.get("id") if uat else None
        transition_request(db, request_id=request_row["id"], to_status="QA_PASSED", actor_user_id=user["id"], comment=payload.testSummary, request_context=request_context, patch={"current_assignee_user_id": uat_user_id})
        updated = transition_request(db, request_id=request_row["id"], to_status="UAT_PENDING", actor_user_id=user["id"], comment="QA passed. Routed to final approval.", request_context=request_context, patch={"current_assignee_user_id": uat_user_id})
        notify(db, recipient_user_id=uat_user_id, request_id=request_row["id"], type="UAT_PENDING", title="Final approval pending", message=f"{request_row['request_number']} is ready for final approval.", background_tasks=background_tasks)
        db.commit()
        return ok(updated)
    assignment = get_active_assignment(db, request_row["id"])
    failed = transition_request(db, request_id=request_row["id"], to_status="QA_FAILED", actor_user_id=user["id"], comment=payload.testSummary, request_context=request_context, patch={"current_assignee_user_id": assignment.get("developer_user_id") if assignment else None})
    notify(db, recipient_user_id=assignment.get("developer_user_id") if assignment else None, request_id=request_row["id"], type="TESTING_FAILED", title="Review returned", message=f"{request_row['request_number']} needs changes after review.", background_tasks=background_tasks)
    db.commit()
    return ok(failed)


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
    request_row = assert_request_access(db, user, request_id, ["UAT_APPROVER"])
    execute(db, "INSERT INTO uat_approvals (request_id, uat_approver_user_id, decision, comments) VALUES (:requestId, :userId, 'APPROVED', :comments)", {"requestId": request_row["id"], "userId": user["id"], "comments": payload.comments})
    add_comment(db, request_row["id"], user["id"], "UAT", payload.comments or "Final approval completed.")
    deployment_owner_id = request_row.get("project_manager_user_id") or request_row.get("it_head_user_id")
    transition_request(db, request_id=request_row["id"], to_status="UAT_APPROVED", actor_user_id=user["id"], comment=payload.comments or "Final approval completed.", request_context=request_context, patch={"current_assignee_user_id": deployment_owner_id})
    updated = transition_request(db, request_id=request_row["id"], to_status="DEPLOYMENT_PENDING", actor_user_id=user["id"], comment="Ready for deployment.", request_context=request_context, patch={"current_assignee_user_id": deployment_owner_id})
    notify(db, recipient_user_id=deployment_owner_id, request_id=request_row["id"], type="DEPLOYMENT_PENDING", title="Deployment pending", message=f"{request_row['request_number']} is approved and ready for deployment.", background_tasks=background_tasks)
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
    request_row = assert_request_access(db, user, request_id, ["PROJECT_MANAGER", "IT_HEAD"])
    if request_row["status"] != "DEPLOYMENT_PENDING":
        raise ApiError(409, "Deployment can only be completed when deployment is pending.")
    updated = transition_request(db, request_id=request_row["id"], to_status="DEPLOYED", actor_user_id=user["id"], comment=payload.comment or "Deployment completed.", request_context=request_context, patch={"current_assignee_user_id": request_row["requester_user_id"]})
    notify(db, recipient_user_id=request_row["requester_user_id"], request_id=request_row["id"], type="REQUEST_DEPLOYED", title="Request deployed", message=f"{request_row['request_number']} has been deployed.", background_tasks=background_tasks)
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
