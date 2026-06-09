from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import execute, get_db, one, rows
from app.middleware.auth import get_current_user, require_roles
from app.schemas.payloads import DepartmentHeadPayload, DepartmentPayload
from app.services.activity_service import audit
from app.utils.http import ApiError, ok


router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("/")
def list_departments(status: str = "", search: str = "", db: Session = Depends(get_db)):
    return ok(rows(db, """
        SELECT d.id, d.name, d.code, d.description, d.status, d.department_head_user_id,
               u.full_name AS department_head_name, u.email AS department_head_email
        FROM departments d
        LEFT JOIN users u ON u.id = d.department_head_user_id
        WHERE (:status = '' OR d.status = :status)
          AND (:search = '' OR d.name LIKE CONCAT('%', :search, '%') OR d.code LIKE CONCAT('%', :search, '%'))
        ORDER BY d.name
    """, {"status": status, "search": search}))


@router.get("/directory", dependencies=[Depends(get_current_user)])
def directory(db: Session = Depends(get_db)):
    return ok(rows(db, """
        SELECT d.id, d.name, d.code, d.description, d.status, d.department_head_user_id,
               head.full_name AS department_head_name, head.email AS department_head_email,
               COUNT(DISTINCT active_users.id) AS employee_count,
               COUNT(DISTINCT pending_requests.id) AS pending_request_count
        FROM departments d
        LEFT JOIN users head ON head.id = d.department_head_user_id
        LEFT JOIN users active_users ON active_users.department_id = d.id AND active_users.status = 'ACTIVE'
        LEFT JOIN requests pending_requests
          ON pending_requests.requester_department_id = d.id
         AND pending_requests.status IN ('DEPARTMENT_APPROVAL_PENDING', 'CLARIFICATION_REQUESTED', 'IT_REVIEW_PENDING', 'ASSIGNMENT_PENDING', 'PM_ASSIGNED', 'SCOPE_REVIEW', 'USER_STORY_REVIEW', 'DEVELOPER_ASSIGNED', 'SPRINT_PLANNING', 'ASSIGNED', 'IN_DEVELOPMENT', 'QA_PENDING', 'QA_FAILED', 'QA_PASSED', 'IN_TESTING', 'UAT_PENDING', 'UAT_FAILED', 'UAT_APPROVED', 'DEPLOYMENT_PENDING', 'DEPLOYED', 'READY_FOR_COMPLETION')
        WHERE d.status = 'ACTIVE'
        GROUP BY d.id, d.name, d.code, d.description, d.status, d.department_head_user_id, head.full_name, head.email
        ORDER BY d.name
    """))


@router.post("/")
def create_department(payload: DepartmentPayload, request: Request, user: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    if not payload.name or not payload.code:
        raise ApiError(400, "Validation failed.")
    result = execute(db, """
        INSERT INTO departments (name, code, description, department_head_user_id, status)
        VALUES (:name, :code, :description, :departmentHeadUserId, :status)
    """, {
        "name": payload.name,
        "code": payload.code.upper(),
        "description": payload.description,
        "departmentHeadUserId": payload.departmentHeadUserId,
        "status": payload.status or "ACTIVE",
    })
    audit(db, actor_user_id=user["id"], action="DEPARTMENT_CREATED", entity_type="DEPARTMENT", entity_id=result.lastrowid, new_value=payload.model_dump(), request=request)
    db.commit()
    return ok({"id": result.lastrowid, **payload.model_dump()}, 201)


@router.get("/{department_id}", dependencies=[Depends(get_current_user)])
def department_detail(department_id: int, db: Session = Depends(get_db)):
    department = one(db, "SELECT * FROM departments WHERE id = :id", {"id": department_id})
    if not department:
        raise ApiError(404, "Department not found.")
    return ok(department)


@router.patch("/{department_id}")
def update_department(department_id: int, payload: DepartmentPayload, request: Request, user: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    existing = one(db, "SELECT * FROM departments WHERE id = :id", {"id": department_id})
    if not existing:
        raise ApiError(404, "Department not found.")
    body = payload.model_dump(exclude_unset=True)
    updates = {
        "name": body.get("name"),
        "code": body.get("code").upper() if body.get("code") else None,
        "description": body.get("description"),
        "department_head_user_id": body.get("departmentHeadUserId"),
        "status": body.get("status"),
    }
    set_items = [(key, value) for key, value in updates.items() if value is not None or key in {"description", "department_head_user_id"} and key in body]
    if not set_items:
        return ok(existing)
    execute(db, f"UPDATE departments SET {', '.join(f'{key} = :{key}' for key, _ in set_items)} WHERE id = :id", {"id": department_id, **dict(set_items)})
    audit(db, actor_user_id=user["id"], action="DEPARTMENT_UPDATED", entity_type="DEPARTMENT", entity_id=department_id, old_value=existing, new_value=body, request=request)
    db.commit()
    return ok({"id": department_id, **body})


@router.patch("/{department_id}/head")
def change_head(department_id: int, payload: DepartmentHeadPayload, request: Request, user: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    execute(db, "UPDATE departments SET department_head_user_id = :head WHERE id = :id", {"id": department_id, "head": payload.departmentHeadUserId})
    audit(db, actor_user_id=user["id"], action="DEPARTMENT_HEAD_CHANGED", entity_type="DEPARTMENT", entity_id=department_id, new_value=payload.model_dump(), request=request)
    db.commit()
    return ok({"id": department_id, **payload.model_dump()})


@router.post("/{department_id}/activate")
def activate_department(department_id: int, request: Request, user: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    execute(db, "UPDATE departments SET status = 'ACTIVE' WHERE id = :id", {"id": department_id})
    audit(db, actor_user_id=user["id"], action="DEPARTMENT_ACTIVATED", entity_type="DEPARTMENT", entity_id=department_id, request=request)
    db.commit()
    return ok({"id": department_id, "status": "ACTIVE"})


@router.post("/{department_id}/deactivate")
def deactivate_department(department_id: int, request: Request, user: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    execute(db, "UPDATE departments SET status = 'INACTIVE' WHERE id = :id", {"id": department_id})
    audit(db, actor_user_id=user["id"], action="DEPARTMENT_DEACTIVATED", entity_type="DEPARTMENT", entity_id=department_id, request=request)
    db.commit()
    return ok({"id": department_id, "status": "INACTIVE"})
