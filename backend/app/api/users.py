from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import execute, get_db, one, rows
from app.middleware.auth import get_current_user, require_roles
from app.schemas.payloads import (
    ChangeDepartmentPayload,
    ChangeReportingManagerPayload,
    ChangeRolePayload,
    ReactivatePayload,
    ReassignResponsibilitiesPayload,
    UserPatchPayload,
)
from app.services.activity_service import audit
from app.services.user_role_service import grant_user_role
from app.utils.http import ApiError, ok
from app.utils.routing import collection_route


router = APIRouter(prefix="/users", tags=["users"], dependencies=[Depends(get_current_user)])

ACTIVE_REQUEST_STATUSES = [
    "DEPARTMENT_APPROVAL_PENDING",
    "CLARIFICATION_REQUESTED",
    "IT_REVIEW_PENDING",
    "ASSIGNMENT_PENDING",
    "PM_ASSIGNED",
    "SCOPE_REVIEW",
    "USER_STORY_REVIEW",
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
    "UAT_APPROVED",
    "UAT_REJECTED",
    "DEPLOYMENT_PENDING",
    "DEPLOYED",
    "READY_FOR_COMPLETION",
]
LIFECYCLE_ROLE_CODES = ["SYSTEM_ADMIN", "DEPARTMENT_HEAD", "PROJECT_MANAGER", "EMPLOYEE"]


def active_status_sql() -> str:
    return ", ".join(f"'{status}'" for status in ACTIVE_REQUEST_STATUSES)


def get_user_with_role(db: Session, user_id: int) -> dict | None:
    return one(
        db,
        """
        SELECT u.*, r.code AS role_code, r.name AS role_name, d.name AS department_name
        FROM users u
        JOIN roles r ON r.id = u.role_id
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE u.id = :userId
        """,
        {"userId": user_id},
    )


def get_role_by_id(db: Session, role_id: int) -> dict | None:
    return one(db, "SELECT id, code, name FROM roles WHERE id = :roleId AND is_active = TRUE", {"roleId": role_id})


def assert_active_user(db: Session, user_id: int | None, label: str, allow_self_id: int | None = None, required_role_codes: list[str] | None = None):
    if not user_id:
        return None
    user = get_user_with_role(db, user_id)
    if not user or user["status"] != "ACTIVE":
        raise ApiError(400, f"{label} must be an active employee.")
    if allow_self_id and int(user["id"]) == int(allow_self_id):
        raise ApiError(400, f"{label} cannot be the same employee.")
    if required_role_codes and user["role_code"] not in required_role_codes:
        raise ApiError(400, f"{label} must have one of these roles: {', '.join(required_role_codes)}.")
    return user


def assert_no_circular_reporting(db: Session, employee_id: int, reporting_manager_user_id: int | None):
    if not reporting_manager_user_id:
        return
    if int(employee_id) == int(reporting_manager_user_id):
        raise ApiError(400, "An employee cannot report to themselves.")
    next_manager_id = reporting_manager_user_id
    visited: set[int] = set()
    while next_manager_id:
        if int(next_manager_id) == int(employee_id):
            raise ApiError(400, "Circular reporting relationships are not allowed.")
        if int(next_manager_id) in visited:
            return
        visited.add(int(next_manager_id))
        manager = one(db, "SELECT reporting_manager_user_id FROM users WHERE id = :id", {"id": next_manager_id})
        next_manager_id = manager.get("reporting_manager_user_id") if manager else None


def build_responsibility_summary(db: Session, user_id: int) -> dict:
    params = {"userId": user_id}
    department_rows = rows(db, "SELECT id, name FROM departments WHERE department_head_user_id = :userId AND status = 'ACTIVE'", params)
    reported_rows = rows(db, f"SELECT id, request_number, title, status FROM requests WHERE department_head_user_id = :userId AND status IN ({active_status_sql()})", params)
    current_assignee_rows = rows(db, f"SELECT id, request_number, title, status FROM requests WHERE current_assignee_user_id = :userId AND status IN ({active_status_sql()})", params)
    it_rows = rows(db, f"SELECT id, request_number, title, status FROM requests WHERE it_head_user_id = :userId AND status IN ({active_status_sql()})", params)
    pm_rows = rows(db, f"SELECT id, request_number, title, status FROM requests WHERE project_manager_user_id = :userId AND status IN ({active_status_sql()})", params)
    developer_rows = rows(db, f"""
        SELECT DISTINCT r.id, r.request_number, r.title, r.status
        FROM sprint_tasks task
        JOIN sprints sprint ON sprint.id = task.sprint_id
        JOIN requests r ON r.id = sprint.request_id
        WHERE task.assigned_developer_user_id = :userId
          AND task.status IN ('TODO', 'IN_PROGRESS', 'BLOCKED')
          AND r.status IN ({active_status_sql()})
    """, params)
    qa_rows = rows(db, f"""
        SELECT r.id, r.request_number, r.title, r.status
        FROM assignments a JOIN requests r ON r.id = a.request_id
        WHERE a.qa_user_id = :userId AND a.is_active = TRUE AND r.status IN ({active_status_sql()})
    """, params)
    clarification_rows = rows(db, "SELECT id, request_id, return_status FROM request_clarifications WHERE return_assignee_user_id = :userId AND status = 'OPEN'", params)
    manager_rows = rows(db, "SELECT id, full_name, email FROM users WHERE reporting_manager_user_id = :userId AND status = 'ACTIVE'", params)
    items = [
        {"key": "departmentHead", "label": "Department Head", "count": len(department_rows), "records": department_rows},
        {"key": "reportedTo", "label": "Department Approval Owner", "count": len(reported_rows), "records": reported_rows},
        {"key": "currentAssignee", "label": "Workflow Responsibility", "count": len(current_assignee_rows), "records": current_assignee_rows},
        {"key": "itHead", "label": "Internal Review Owner", "count": len(it_rows), "records": it_rows},
        {"key": "projectManager", "label": "Project Manager", "count": len(pm_rows), "records": pm_rows},
        {"key": "developer", "label": "Sprint Task Owner", "count": len(developer_rows), "records": developer_rows},
        {"key": "qa", "label": "QA Owner", "count": len(qa_rows), "records": qa_rows},
        {"key": "clarificationReturn", "label": "Clarification Return Owner", "count": len(clarification_rows), "records": clarification_rows},
        {"key": "reportingManager", "label": "Reporting Manager", "count": len(manager_rows), "records": manager_rows},
    ]
    return {"userId": int(user_id), "total": sum(item["count"] for item in items), "items": items}


def require_replacement(summary: dict, key: str, value: int | None, label: str):
    item = next((entry for entry in summary["items"] if entry["key"] == key), None)
    if item and item["count"] > 0 and not value:
        raise ApiError(400, f"{label} is required because this employee currently owns {item['count']} active responsibility record(s).")


@router.get("/roles")
def roles(db: Session = Depends(get_db)):
    return ok(rows(db, "SELECT id, code, name, description FROM roles WHERE is_active = TRUE ORDER BY name"))


@router.get("/directory")
def directory(db: Session = Depends(get_db)):
    return ok(rows(db, """
        SELECT u.id, u.employee_id, u.full_name, u.email, u.mobile_number, u.designation,
               u.status, u.employment_status, u.exit_date, u.created_at, u.last_login_at,
               d.id AS department_id, d.name AS department_name, d.code AS department_code,
               COALESCE(rm.id, dh.id) AS manager_id,
               COALESCE(rm.full_name, dh.full_name) AS manager_name,
               COALESCE(rm.email, dh.email) AS manager_email,
               r.id AS role_id, r.code AS role_code, r.name AS role_name,
               (
                 SELECT GROUP_CONCAT(DISTINCT r2.code ORDER BY r2.name SEPARATOR ',')
                 FROM user_roles ur2
                 JOIN roles r2 ON r2.id = ur2.role_id
                 WHERE ur2.user_id = u.id
               ) AS role_codes,
               CASE WHEN d.department_head_user_id = u.id THEN TRUE ELSE FALSE END AS is_department_head
        FROM users u
        JOIN roles r ON r.id = u.role_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN users rm ON rm.id = u.reporting_manager_user_id
        LEFT JOIN users dh ON dh.id = d.department_head_user_id
        WHERE u.status = 'ACTIVE'
        ORDER BY d.name, is_department_head DESC, u.full_name
    """))


@collection_route(router, "get")
def list_users(search: str = "", role: str = "", departmentId: str = "", status: str = "", _user: dict = Depends(require_roles("SYSTEM_ADMIN", "IT_HEAD", "PROJECT_MANAGER")), db: Session = Depends(get_db)):
    return ok(rows(db, """
        SELECT u.id, u.employee_id, u.full_name, u.email, u.mobile_number, u.designation,
               u.status, u.employment_status, u.exit_date, u.last_login_at, u.created_at, u.updated_at,
               d.id AS department_id, d.name AS department_name,
               COALESCE(rm.id, dh.id) AS reporting_manager_user_id,
               COALESCE(rm.full_name, dh.full_name) AS reporting_manager_name,
               COALESCE(rm.email, dh.email) AS reporting_manager_email,
               r.id AS role_id, r.code AS role_code, r.name AS role_name
        FROM users u
        JOIN roles r ON r.id = u.role_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN users rm ON rm.id = u.reporting_manager_user_id
        LEFT JOIN users dh ON dh.id = d.department_head_user_id
        WHERE (:search = '' OR u.full_name LIKE CONCAT('%', :search, '%') OR u.email LIKE CONCAT('%', :search, '%') OR u.employee_id LIKE CONCAT('%', :search, '%'))
          AND (:role = '' OR r.code = :role)
          AND (:departmentId = '' OR u.department_id = :departmentId)
          AND (:status = '' OR u.status = :status)
        ORDER BY u.full_name
    """, {"search": search, "role": role, "departmentId": departmentId, "status": status}))


@router.get("/{user_id}")
def user_detail(user_id: int, _user: dict = Depends(require_roles("SYSTEM_ADMIN", "IT_HEAD")), db: Session = Depends(get_db)):
    user = one(db, """
        SELECT u.*, d.name AS department_name,
               COALESCE(rm.full_name, dh.full_name) AS reporting_manager_name,
               COALESCE(rm.email, dh.email) AS reporting_manager_email,
               r.code AS role_code, r.name AS role_name
        FROM users u
        JOIN roles r ON r.id = u.role_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN users rm ON rm.id = u.reporting_manager_user_id
        LEFT JOIN users dh ON dh.id = d.department_head_user_id
        WHERE u.id = :id
    """, {"id": user_id})
    if not user:
        raise ApiError(404, "User not found.")
    return ok(user)


@router.patch("/{user_id}")
def update_user(user_id: int, payload: UserPatchPayload, request: Request, admin: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    existing = one(db, "SELECT * FROM users WHERE id = :id", {"id": user_id})
    if not existing:
        raise ApiError(404, "User not found.")
    body = payload.model_dump(exclude_unset=True)
    if "reportingManagerUserId" in body:
        assert_active_user(db, body["reportingManagerUserId"], "Reporting manager", allow_self_id=user_id, required_role_codes=["DEPARTMENT_HEAD", "SYSTEM_ADMIN"])
        assert_no_circular_reporting(db, user_id, body["reportingManagerUserId"])
    updates = {
        "full_name": body.get("fullName"),
        "mobile_number": body.get("mobileNumber"),
        "designation": body.get("designation"),
        "department_id": body.get("departmentId"),
        "reporting_manager_user_id": body.get("reportingManagerUserId"),
        "role_id": body.get("roleId"),
        "status": body.get("status"),
    }
    set_items = [(key, value) for key, value in updates.items() if key in updates and value is not None or key in updates and key in ["mobile_number", "designation", "department_id", "reporting_manager_user_id"] and key.replace("_id", "Id") in body]
    set_items = [(key, value) for key, value in updates.items() if value is not None or key in {"mobile_number", "designation", "department_id", "reporting_manager_user_id"} and any(k in body for k in [key, "mobileNumber", "departmentId", "reportingManagerUserId"])]
    if not set_items:
        return ok(existing)
    params = {"id": user_id, **dict(set_items)}
    execute(db, f"UPDATE users SET {', '.join(f'{key} = :{key}' for key, _ in set_items)} WHERE id = :id", params)
    audit(db, actor_user_id=admin["id"], action="USER_UPDATED", entity_type="USER", entity_id=user_id, old_value=existing, new_value=body, request=request)
    db.commit()
    return ok({"id": user_id, **body})


@router.get("/{user_id}/responsibilities")
def responsibilities(user_id: int, _admin: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    if not get_user_with_role(db, user_id):
        raise ApiError(404, "User not found.")
    return ok(build_responsibility_summary(db, user_id))


@router.post("/{user_id}/reassign-responsibilities")
def reassign_responsibilities(user_id: int, payload: ReassignResponsibilitiesPayload, request: Request, admin: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    if not get_user_with_role(db, user_id):
        raise ApiError(404, "User not found.")
    body = payload.model_dump()
    summary = build_responsibility_summary(db, user_id)
    require_replacement(summary, "departmentHead", body.get("departmentHeadUserId"), "New department head")
    require_replacement(summary, "reportedTo", body.get("departmentHeadUserId"), "New department approval owner")
    require_replacement(summary, "currentAssignee", body.get("currentAssigneeUserId"), "New workflow owner")
    require_replacement(summary, "itHead", body.get("itHeadUserId"), "New internal review owner")
    require_replacement(summary, "projectManager", body.get("projectManagerUserId"), "New project manager")
    require_replacement(summary, "developer", body.get("developerUserId"), "New assigned employee")
    require_replacement(summary, "qa", body.get("qaUserId"), "New QA owner")
    require_replacement(summary, "clarificationReturn", body.get("currentAssigneeUserId"), "New clarification return owner")
    require_replacement(summary, "reportingManager", body.get("reportingManagerUserId"), "New reporting manager")
    assert_active_user(db, body.get("departmentHeadUserId"), "New department head", allow_self_id=user_id, required_role_codes=["DEPARTMENT_HEAD", "SYSTEM_ADMIN"])
    assert_active_user(db, body.get("currentAssigneeUserId"), "New workflow owner", allow_self_id=user_id)
    assert_active_user(db, body.get("itHeadUserId"), "New internal review owner", allow_self_id=user_id, required_role_codes=["IT_HEAD", "SYSTEM_ADMIN"])
    assert_active_user(db, body.get("projectManagerUserId"), "New project manager", allow_self_id=user_id, required_role_codes=["PROJECT_MANAGER", "SYSTEM_ADMIN"])
    assert_active_user(db, body.get("developerUserId"), "New assigned employee", allow_self_id=user_id, required_role_codes=["DEVELOPER", "SYSTEM_ADMIN"])
    assert_active_user(db, body.get("qaUserId"), "New QA owner", allow_self_id=user_id, required_role_codes=["QA", "SYSTEM_ADMIN"])
    assert_active_user(db, body.get("reportingManagerUserId"), "New reporting manager", allow_self_id=user_id, required_role_codes=["DEPARTMENT_HEAD", "SYSTEM_ADMIN"])

    transfers = [
        ("departmentHead", "Department Head", 'UPDATE departments SET department_head_user_id = :newId WHERE department_head_user_id = :oldId AND status = "ACTIVE"', body.get("departmentHeadUserId")),
        ("reportedTo", "Department Approval Owner", f"UPDATE requests SET department_head_user_id = :newId WHERE department_head_user_id = :oldId AND status IN ({active_status_sql()})", body.get("departmentHeadUserId")),
        ("currentAssignee", "Workflow Responsibility", f"UPDATE requests SET current_assignee_user_id = :newId WHERE current_assignee_user_id = :oldId AND status IN ({active_status_sql()})", body.get("currentAssigneeUserId")),
        ("itHead", "Internal Review Owner", f"UPDATE requests SET it_head_user_id = :newId WHERE it_head_user_id = :oldId AND status IN ({active_status_sql()})", body.get("itHeadUserId")),
        ("projectManager", "Project Manager", f"UPDATE requests SET project_manager_user_id = :newId WHERE project_manager_user_id = :oldId AND status IN ({active_status_sql()})", body.get("projectManagerUserId")),
        ("developer", "Assigned Sprint Tasks", f"UPDATE sprint_tasks task JOIN sprints sprint ON sprint.id = task.sprint_id JOIN requests r ON r.id = sprint.request_id SET task.assigned_developer_user_id = :newId WHERE task.assigned_developer_user_id = :oldId AND task.status IN ('TODO', 'IN_PROGRESS', 'BLOCKED') AND r.status IN ({active_status_sql()})", body.get("developerUserId")),
        ("qa", "QA Owner", f"UPDATE assignments a JOIN requests r ON r.id = a.request_id SET a.qa_user_id = :newId WHERE a.qa_user_id = :oldId AND a.is_active = TRUE AND r.status IN ({active_status_sql()})", body.get("qaUserId")),
        ("clarificationReturn", "Clarification Return Owner", 'UPDATE request_clarifications SET return_assignee_user_id = :newId WHERE return_assignee_user_id = :oldId AND status = "OPEN"', body.get("currentAssigneeUserId")),
        ("reportingManager", "Reporting Manager", 'UPDATE users SET reporting_manager_user_id = :newId WHERE reporting_manager_user_id = :oldId AND status = "ACTIVE"', body.get("reportingManagerUserId")),
    ]
    for key, label, sql, replacement in transfers:
        item = next((entry for entry in summary["items"] if entry["key"] == key), None)
        if item and item["count"] > 0:
            result = execute(db, sql, {"newId": replacement, "oldId": user_id})
            audit(db, actor_user_id=admin["id"], action="RESPONSIBILITY_REASSIGNED", entity_type="USER", entity_id=user_id, old_value={"employeeId": user_id, "responsibility": label}, new_value={"replacementUserId": replacement, "count": result.rowcount or item["count"]}, request=request)
    db.commit()
    return ok(build_responsibility_summary(db, user_id))


@router.post("/{user_id}/change-role")
def change_role(user_id: int, payload: ChangeRolePayload, request: Request, admin: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    existing = get_user_with_role(db, user_id)
    if not existing:
        raise ApiError(404, "User not found.")
    role = get_role_by_id(db, payload.roleId)
    if not role or role["code"] not in LIFECYCLE_ROLE_CODES:
        raise ApiError(400, "Role can only be changed to System Admin, Department Head, Project Manager, or Employee.")
    headed = rows(db, 'SELECT id FROM departments WHERE department_head_user_id = :userId AND status = "ACTIVE"', {"userId": user_id})
    if existing["role_code"] == "DEPARTMENT_HEAD" and role["code"] != "DEPARTMENT_HEAD" and headed:
        if not payload.replacementDepartmentHeadUserId:
            raise ApiError(400, "Select a replacement Department Head before changing this role.")
        assert_active_user(db, payload.replacementDepartmentHeadUserId, "Replacement Department Head", allow_self_id=user_id, required_role_codes=["DEPARTMENT_HEAD", "SYSTEM_ADMIN"])
    if payload.replacementDepartmentHeadUserId:
        execute(db, "UPDATE departments SET department_head_user_id = :replacement WHERE department_head_user_id = :userId", {"replacement": payload.replacementDepartmentHeadUserId, "userId": user_id})
    execute(db, "UPDATE users SET role_id = :roleId WHERE id = :userId", {"roleId": role["id"], "userId": user_id})
    grant_user_role(db, user_id, role["id"], admin["id"])
    if role["code"] == "DEPARTMENT_HEAD" and existing.get("department_id"):
        execute(db, "UPDATE departments SET department_head_user_id = :userId WHERE id = :departmentId", {"userId": user_id, "departmentId": existing["department_id"]})
    audit(db, actor_user_id=admin["id"], action="ROLE_CHANGED", entity_type="USER", entity_id=user_id, old_value={"roleId": existing["role_id"], "roleCode": existing["role_code"], "roleName": existing["role_name"]}, new_value={"roleId": role["id"], "roleCode": role["code"], "roleName": role["name"], "replacementDepartmentHeadUserId": payload.replacementDepartmentHeadUserId}, request=request)
    db.commit()
    return ok({"id": user_id, "roleId": role["id"], "roleCode": role["code"], "roleName": role["name"]})


@router.post("/{user_id}/change-department")
def change_department(user_id: int, payload: ChangeDepartmentPayload, request: Request, admin: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    existing = get_user_with_role(db, user_id)
    if not existing:
        raise ApiError(404, "User not found.")
    if not one(db, 'SELECT id, name FROM departments WHERE id = :id AND status = "ACTIVE"', {"id": payload.departmentId}):
        raise ApiError(400, "Choose an active department.")
    assert_active_user(db, payload.reportingManagerUserId, "Reporting Manager", allow_self_id=user_id, required_role_codes=["DEPARTMENT_HEAD", "SYSTEM_ADMIN"])
    assert_no_circular_reporting(db, user_id, payload.reportingManagerUserId)
    old_heads = rows(db, 'SELECT id FROM departments WHERE department_head_user_id = :userId AND status = "ACTIVE"', {"userId": user_id})
    if old_heads and int(existing.get("department_id") or 0) != int(payload.departmentId):
        if not payload.replacementDepartmentHeadUserId:
            raise ApiError(400, "Select a replacement Department Head before moving this employee.")
        assert_active_user(db, payload.replacementDepartmentHeadUserId, "Replacement Department Head", allow_self_id=user_id, required_role_codes=["DEPARTMENT_HEAD", "SYSTEM_ADMIN"])
    if payload.replacementDepartmentHeadUserId:
        execute(db, "UPDATE departments SET department_head_user_id = :replacement WHERE department_head_user_id = :userId", {"replacement": payload.replacementDepartmentHeadUserId, "userId": user_id})
    execute(db, "UPDATE users SET department_id = :departmentId, reporting_manager_user_id = :managerId WHERE id = :userId", {"departmentId": payload.departmentId, "managerId": payload.reportingManagerUserId, "userId": user_id})
    if existing["role_code"] == "DEPARTMENT_HEAD":
        execute(db, "UPDATE departments SET department_head_user_id = :userId WHERE id = :departmentId", {"userId": user_id, "departmentId": payload.departmentId})
    audit(db, actor_user_id=admin["id"], action="DEPARTMENT_CHANGED", entity_type="USER", entity_id=user_id, old_value={"departmentId": existing.get("department_id"), "reportingManagerUserId": existing.get("reporting_manager_user_id")}, new_value=payload.model_dump(), request=request)
    db.commit()
    return ok({"id": user_id, "departmentId": payload.departmentId, "reportingManagerUserId": payload.reportingManagerUserId})


@router.post("/{user_id}/change-reporting-manager")
def change_reporting_manager(user_id: int, payload: ChangeReportingManagerPayload, request: Request, admin: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    existing = get_user_with_role(db, user_id)
    if not existing:
        raise ApiError(404, "User not found.")
    assert_active_user(db, payload.reportingManagerUserId, "Reporting Manager", allow_self_id=user_id, required_role_codes=["DEPARTMENT_HEAD", "SYSTEM_ADMIN"])
    assert_no_circular_reporting(db, user_id, payload.reportingManagerUserId)
    execute(db, "UPDATE users SET reporting_manager_user_id = :managerId WHERE id = :userId", {"managerId": payload.reportingManagerUserId, "userId": user_id})
    audit(db, actor_user_id=admin["id"], action="REPORTING_MANAGER_CHANGED", entity_type="USER", entity_id=user_id, old_value={"reportingManagerUserId": existing.get("reporting_manager_user_id")}, new_value={"reportingManagerUserId": payload.reportingManagerUserId}, request=request)
    db.commit()
    return ok({"id": user_id, "reportingManagerUserId": payload.reportingManagerUserId})


@router.post("/{user_id}/reactivate")
def reactivate(user_id: int, payload: ReactivatePayload, request: Request, admin: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    existing = get_user_with_role(db, user_id)
    if not existing:
        raise ApiError(404, "User not found.")
    if not one(db, 'SELECT id FROM departments WHERE id = :departmentId AND status = "ACTIVE"', {"departmentId": payload.departmentId}):
        raise ApiError(400, "Choose an active department.")
    if not get_role_by_id(db, payload.roleId):
        raise ApiError(400, "Choose an active role.")
    assert_active_user(db, payload.reportingManagerUserId, "Reporting Manager", allow_self_id=user_id, required_role_codes=["DEPARTMENT_HEAD", "SYSTEM_ADMIN"])
    assert_no_circular_reporting(db, user_id, payload.reportingManagerUserId)
    execute(db, """
        UPDATE users
        SET status = 'ACTIVE', employment_status = 'ACTIVE', exit_date = NULL,
            department_id = :departmentId, role_id = :roleId, reporting_manager_user_id = :managerId
        WHERE id = :userId
    """, {"departmentId": payload.departmentId, "roleId": payload.roleId, "managerId": payload.reportingManagerUserId, "userId": user_id})
    audit(db, actor_user_id=admin["id"], action="EMPLOYEE_REACTIVATED", entity_type="USER", entity_id=user_id, old_value={"status": existing["status"], "employmentStatus": existing.get("employment_status"), "exitDate": existing.get("exit_date")}, new_value={"status": "ACTIVE", "employmentStatus": "ACTIVE", **payload.model_dump()}, request=request)
    db.commit()
    return ok({"id": user_id, "status": "ACTIVE", "employmentStatus": "ACTIVE"})


@router.post("/{user_id}/deactivate")
def deactivate(user_id: int, request: Request, admin: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    existing = get_user_with_role(db, user_id)
    if not existing:
        raise ApiError(404, "User not found.")
    if int(existing["id"]) == int(admin["id"]):
        raise ApiError(400, "You cannot deactivate your own account.")
    summary = build_responsibility_summary(db, user_id)
    if any(item["count"] > 0 for item in summary["items"]):
        raise ApiError(409, "Transfer active responsibilities before deactivation.", summary)
    execute(db, "UPDATE users SET status = 'INACTIVE', employment_status = 'LEFT_ORGANIZATION', exit_date = CURRENT_DATE WHERE id = :userId", {"userId": user_id})
    audit(db, actor_user_id=admin["id"], action="EMPLOYEE_DEACTIVATED", entity_type="USER", entity_id=user_id, old_value={"status": existing["status"], "employmentStatus": existing.get("employment_status"), "exitDate": existing.get("exit_date")}, new_value={"status": "INACTIVE", "employmentStatus": "LEFT_ORGANIZATION"}, request=request)
    db.commit()
    return ok({"id": user_id, "status": "INACTIVE", "employmentStatus": "LEFT_ORGANIZATION"})
