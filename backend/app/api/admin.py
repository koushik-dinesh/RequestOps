from fastapi import APIRouter, BackgroundTasks, Depends, Query, Request
from sqlalchemy.orm import Session

from app.core.database import execute, get_db, one, rows
from app.core.security import hash_password
from app.middleware.auth import require_roles
from app.schemas.payloads import PasswordPayload, RegistrationApprovePayload, RejectPayload
from app.services.activity_service import audit, notify
from app.utils.http import ApiError, ok


router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_roles("SYSTEM_ADMIN"))])


@router.get("/registrations")
def registrations(
    status: str = "",
    search: str = "",
    departmentId: str = "",
    db: Session = Depends(get_db),
):
    return ok(rows(
        db,
        """
        SELECT ur.id, ur.employee_id, ur.full_name, ur.email, ur.mobile_number, ur.designation,
               ur.status, ur.created_at, ur.reviewed_at, ur.rejection_reason,
               rd.name AS requested_department_name, ad.name AS approved_department_name,
               ar.name AS assigned_role_name, reviewer.full_name AS reviewed_by_name
        FROM user_registrations ur
        JOIN departments rd ON rd.id = ur.requested_department_id
        LEFT JOIN departments ad ON ad.id = ur.approved_department_id
        LEFT JOIN roles ar ON ar.id = ur.assigned_role_id
        LEFT JOIN users reviewer ON reviewer.id = ur.reviewed_by_user_id
        WHERE (:status = '' OR ur.status = :status)
          AND (:departmentId = '' OR ur.requested_department_id = :departmentId)
          AND (:search = '' OR ur.full_name LIKE CONCAT('%', :search, '%') OR ur.email LIKE CONCAT('%', :search, '%') OR ur.employee_id LIKE CONCAT('%', :search, '%'))
        ORDER BY ur.created_at DESC
        """,
        {"status": status, "search": search, "departmentId": departmentId},
    ))


@router.get("/registrations/{registration_id}")
def registration_detail(registration_id: int, db: Session = Depends(get_db)):
    registration = one(db, "SELECT * FROM user_registrations WHERE id = :id", {"id": registration_id})
    if not registration:
        raise ApiError(404, "Registration not found.")
    return ok(registration)


@router.post("/registrations/{registration_id}/approve")
def approve_registration(
    registration_id: int,
    payload: RegistrationApprovePayload,
    request: Request,
    background_tasks: BackgroundTasks,
    user: dict = Depends(require_roles("SYSTEM_ADMIN")),
    db: Session = Depends(get_db),
):
    registration = one(db, "SELECT * FROM user_registrations WHERE id = :id", {"id": registration_id})
    if not registration:
        raise ApiError(404, "Registration not found.")
    if registration["status"] != "PENDING_APPROVAL":
        raise ApiError(409, "Registration has already been reviewed.")
    department = one(db, "SELECT department_head_user_id FROM departments WHERE id = :departmentId", {"departmentId": payload.departmentId})
    reporting_manager_user_id = department.get("department_head_user_id") if department else None
    created = execute(
        db,
        """
        INSERT INTO users
          (employee_id, full_name, email, mobile_number, designation, department_id, reporting_manager_user_id, role_id, password_hash, status)
        VALUES (:employeeId, :fullName, :email, :mobileNumber, :designation, :departmentId, :reportingManagerUserId, :roleId, :passwordHash, 'ACTIVE')
        """,
        {
            "employeeId": registration["employee_id"],
            "fullName": registration["full_name"],
            "email": registration["email"],
            "mobileNumber": registration["mobile_number"],
            "designation": registration["designation"],
            "departmentId": payload.departmentId,
            "reportingManagerUserId": reporting_manager_user_id,
            "roleId": payload.roleId,
            "passwordHash": registration["password_hash"],
        },
    )
    created_user_id = created.lastrowid
    execute(
        db,
        """
        UPDATE user_registrations
        SET status = 'APPROVED', approved_department_id = :departmentId, assigned_role_id = :roleId,
            reviewed_by_user_id = :reviewedBy, reviewed_at = CURRENT_TIMESTAMP, created_user_id = :createdUserId
        WHERE id = :id
        """,
        {
            "departmentId": payload.departmentId,
            "roleId": payload.roleId,
            "reviewedBy": user["id"],
            "createdUserId": created_user_id,
            "id": registration_id,
        },
    )
    notify(
        db,
        recipient_user_id=created_user_id,
        type="REGISTRATION_APPROVED",
        title="Registration approved",
        message="Your RequestOps account is active.",
        background_tasks=background_tasks,
    )
    audit(db, actor_user_id=user["id"], action="REGISTRATION_APPROVED", entity_type="USER_REGISTRATION", entity_id=registration_id, new_value={"createdUserId": created_user_id, "departmentId": payload.departmentId, "roleId": payload.roleId}, request=request)
    audit(db, actor_user_id=user["id"], action="EMPLOYEE_CREATED", entity_type="USER", entity_id=created_user_id, new_value={"departmentId": payload.departmentId, "roleId": payload.roleId, "reportingManagerUserId": reporting_manager_user_id}, request=request)
    db.commit()
    return ok({"id": registration_id, "createdUserId": created_user_id, "status": "APPROVED"})


@router.post("/registrations/{registration_id}/reject")
def reject_registration(registration_id: int, payload: RejectPayload, request: Request, user: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    result = execute(
        db,
        """
        UPDATE user_registrations
        SET status = 'REJECTED', rejection_reason = :reason, reviewed_by_user_id = :reviewedBy,
            reviewed_at = CURRENT_TIMESTAMP
        WHERE id = :id AND status = 'PENDING_APPROVAL'
        """,
        {"id": registration_id, "reason": payload.reason, "reviewedBy": user["id"]},
    )
    if result.rowcount == 0:
        raise ApiError(404, "Pending registration not found.")
    audit(db, actor_user_id=user["id"], action="REGISTRATION_REJECTED", entity_type="USER_REGISTRATION", entity_id=registration_id, new_value={"reason": payload.reason}, request=request)
    db.commit()
    return ok({"id": registration_id, "status": "REJECTED"})


@router.get("/audit-logs")
def audit_logs(
    action: str = "",
    entityType: str = "",
    userId: str = "",
    dateFrom: str = "",
    dateTo: str = "",
    db: Session = Depends(get_db),
):
    return ok(rows(
        db,
        """
        SELECT al.*, u.full_name AS actor_name, u.email AS actor_email
        FROM audit_logs al
        LEFT JOIN users u ON u.id = al.actor_user_id
        WHERE (:action = '' OR al.action = :action)
          AND (:entityType = '' OR al.entity_type = :entityType)
          AND (:userId = '' OR al.actor_user_id = :userId)
          AND (:dateFrom = '' OR al.created_at >= :dateFrom)
          AND (:dateTo = '' OR al.created_at <= :dateTo)
        ORDER BY al.created_at DESC
        LIMIT 200
        """,
        {"action": action, "entityType": entityType, "userId": userId, "dateFrom": dateFrom, "dateTo": dateTo},
    ))


@router.post("/users/{user_id}/reset-password")
def reset_password(user_id: int, payload: PasswordPayload, request: Request, user: dict = Depends(require_roles("SYSTEM_ADMIN")), db: Session = Depends(get_db)):
    result = execute(db, "UPDATE users SET password_hash = :passwordHash WHERE id = :id", {"id": user_id, "passwordHash": hash_password(payload.password)})
    if result.rowcount == 0:
        raise ApiError(404, "User not found.")
    audit(db, actor_user_id=user["id"], action="USER_PASSWORD_RESET", entity_type="USER", entity_id=user_id, request=request)
    db.commit()
    return ok({"success": True})
