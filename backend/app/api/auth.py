import re

from fastapi import APIRouter, BackgroundTasks, Depends, Request
from sqlalchemy.orm import Session

from app.core.database import execute, get_db, one, rows
from app.core.security import decode_refresh_token, hash_password, sign_tokens, verify_password
from app.middleware.auth import get_current_user
from app.schemas.payloads import LoginPayload, RefreshPayload, RegisterPayload
from app.services.activity_service import audit, notify_role
from app.utils.http import ApiError, ok


router = APIRouter(prefix="/auth", tags=["auth"])

NON_IT_DEPARTMENT_DESIGNATIONS = {"Department Head", "Employee"}
IT_DEPARTMENT_DESIGNATIONS = {"Department Head", "Project Manager", "QA", "Developer"}


def next_employee_id(db: Session) -> str:
    result = one(
        db,
        """
        SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next_number
        FROM (
            SELECT CAST(SUBSTRING(employee_id, 5) AS UNSIGNED) AS sequence_number
            FROM users
            WHERE employee_id REGEXP '^VIO-[0-9]{4}$'
            UNION ALL
            SELECT CAST(SUBSTRING(employee_id, 5) AS UNSIGNED) AS sequence_number
            FROM user_registrations
            WHERE employee_id REGEXP '^VIO-[0-9]{4}$'
        ) employee_sequences
        """,
    )
    return f"VIO-{int(result['next_number']):04d}"


def normalize_employee_id(db: Session, employee_id: str | None) -> str:
    normalized = (employee_id or "").strip().upper()
    if not normalized:
        return next_employee_id(db)
    if not re.fullmatch(r"VIO-\d{4}", normalized):
        raise ApiError(400, "Employee ID must use the VIO-0001 format.")
    return normalized


def allowed_designations_for_department(department: dict) -> set[str]:
    is_it_department = str(department.get("code") or "").upper() == "IT" or str(department.get("name") or "").strip().upper() == "IT"
    return IT_DEPARTMENT_DESIGNATIONS if is_it_department else NON_IT_DEPARTMENT_DESIGNATIONS


@router.get("/providers")
def providers():
    return ok([
        {"code": "LOCAL", "name": "Email and password", "enabled": True},
        {"code": "MICROSOFT_ENTRA", "name": "Microsoft Entra ID", "enabled": False},
    ])


@router.get("/designations")
def designations():
    return ok([
        "Department Head",
        "Employee",
        "Project Manager",
        "QA",
        "Developer",
    ])


@router.get("/next-employee-id")
def next_employee_id_endpoint(db: Session = Depends(get_db)):
    return ok({"employeeId": next_employee_id(db)})


@router.post("/register")
def register(payload: RegisterPayload, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    employee_id = normalize_employee_id(db, payload.employeeId)
    existing_users = rows(
        db,
        "SELECT id FROM users WHERE email = :email OR employee_id = :employeeId",
        {"email": payload.email, "employeeId": employee_id},
    )
    if existing_users:
        raise ApiError(409, "A user already exists with this email or employee ID.")
    existing_registrations = rows(
        db,
        """
        SELECT id FROM user_registrations
        WHERE (email = :email OR employee_id = :employeeId) AND status = 'PENDING_APPROVAL'
        """,
        {"email": payload.email, "employeeId": employee_id},
    )
    if existing_registrations:
        raise ApiError(409, "Registration is already pending approval.")
    department = one(db, 'SELECT id, name, code FROM departments WHERE id = :departmentId AND status = "ACTIVE"', {"departmentId": payload.departmentId})
    if not department:
        raise ApiError(400, "Choose an active department.")
    allowed_designations = allowed_designations_for_department(department)
    if payload.designation not in allowed_designations:
        raise ApiError(400, "Choose a valid designation for the selected department.")
    result = execute(
        db,
        """
        INSERT INTO user_registrations
          (employee_id, full_name, email, mobile_number, designation, requested_department_id, password_hash)
        VALUES (:employeeId, :fullName, :email, :mobileNumber, :designation, :departmentId, :passwordHash)
        """,
        {
            "employeeId": employee_id,
            "fullName": payload.fullName,
            "email": payload.email,
            "mobileNumber": payload.mobileNumber,
            "designation": payload.designation,
            "departmentId": payload.departmentId,
            "passwordHash": hash_password(payload.password),
        },
    )
    registration_id = result.lastrowid
    notify_role(
        db,
        "SYSTEM_ADMIN",
        type="REGISTRATION_PENDING",
        title="Registration pending approval",
        message=f"{payload.fullName} has requested access to RequestOps.",
        background_tasks=background_tasks,
    )
    audit(
        db,
        actor_user_id=None,
        action="REGISTRATION_SUBMITTED",
        entity_type="USER_REGISTRATION",
        entity_id=registration_id,
        new_value={"email": payload.email, "requestedDepartmentId": payload.departmentId},
        request=request,
    )
    db.commit()
    return ok({"id": registration_id, "employeeId": employee_id, "status": "PENDING_APPROVAL"}, 201)


@router.post("/login")
def login(payload: LoginPayload, request: Request, db: Session = Depends(get_db)):
    user = one(
        db,
        """
        SELECT u.*, r.code AS role_code, r.name AS role_name, d.name AS department_name, d.code AS department_code,
               COALESCE(rm.id, dh.id) AS department_head_id,
               COALESCE(rm.full_name, dh.full_name) AS department_head_name,
               COALESCE(rm.email, dh.email) AS department_head_email
        FROM users u
        JOIN roles r ON r.id = u.role_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN users rm ON rm.id = u.reporting_manager_user_id
        LEFT JOIN users dh ON dh.id = d.department_head_user_id
        WHERE u.email = :email
        """,
        {"email": payload.email},
    )
    if not user or user.get("status") != "ACTIVE" or not user.get("password_hash"):
        audit(db, actor_user_id=user.get("id") if user else None, action="LOGIN_FAILED", entity_type="USER", entity_id=user.get("id") if user else None, request=request)
        db.commit()
        raise ApiError(401, "Invalid credentials or inactive account.")
    if not verify_password(payload.password, user["password_hash"]):
        audit(db, actor_user_id=user["id"], action="LOGIN_FAILED", entity_type="USER", entity_id=user["id"], request=request)
        db.commit()
        raise ApiError(401, "Invalid credentials or inactive account.")
    execute(db, "UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id", {"id": user["id"]})
    audit(db, actor_user_id=user["id"], action="LOGIN_SUCCESS", entity_type="USER", entity_id=user["id"], request=request)
    db.commit()
    tokens = sign_tokens(user)
    return ok({
        **tokens,
        "user": {
            "id": user["id"],
            "employeeId": user["employee_id"],
            "fullName": user["full_name"],
            "email": user["email"],
            "roleCode": user["role_code"],
            "roleName": user["role_name"],
            "departmentId": user["department_id"],
            "departmentName": user["department_name"],
            "departmentHeadId": user["department_head_id"],
            "departmentHeadName": user["department_head_name"],
            "departmentHeadEmail": user["department_head_email"],
        },
    })


@router.post("/refresh")
def refresh(payload: RefreshPayload, db: Session = Depends(get_db)):
    decoded = decode_refresh_token(payload.refreshToken)
    user = one(
        db,
        """
        SELECT u.id, u.email, r.code AS role_code
        FROM users u JOIN roles r ON r.id = u.role_id
        WHERE u.id = :id AND u.status = 'ACTIVE'
        """,
        {"id": decoded.get("sub")},
    )
    if not user:
        raise ApiError(401, "Refresh token is no longer valid.")
    return ok(sign_tokens(user))


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return ok({
        "id": user["id"],
        "employeeId": user["employee_id"],
        "fullName": user["full_name"],
        "email": user["email"],
        "mobileNumber": user["mobile_number"],
        "designation": user["designation"],
        "roleCode": user["role_code"],
        "roleName": user["role_name"],
        "departmentId": user["department_id"],
        "departmentName": user["department_name"],
        "departmentCode": user["department_code"],
        "departmentHeadId": user["department_head_id"],
        "departmentHeadName": user["department_head_name"],
        "departmentHeadEmail": user["department_head_email"],
    })


@router.post("/logout")
def logout(request: Request, user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    audit(db, actor_user_id=user["id"], action="LOGOUT", entity_type="USER", entity_id=user["id"], request=request)
    db.commit()
    return ok({"success": True})
