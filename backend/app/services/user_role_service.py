from sqlalchemy.orm import Session

from app.core.database import execute, one, rows
from app.utils.http import ApiError

REQUESTABLE_ROLE_CODES = frozenset({
    "EMPLOYEE",
    "DEPARTMENT_HEAD",
    "IT_HEAD",
    "PROJECT_MANAGER",
    "DEVELOPER",
    "QA",
    "UAT_APPROVER",
})


def get_user_roles(db: Session, user_id: int) -> list[dict]:
    return rows(
        db,
        """
        SELECT r.id, r.code, r.name, r.description,
               CASE WHEN u.role_id = r.id THEN TRUE ELSE FALSE END AS is_primary
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        JOIN users u ON u.id = ur.user_id
        WHERE ur.user_id = :userId AND r.is_active = TRUE
        ORDER BY is_primary DESC, r.name
        """,
        {"userId": user_id},
    )


def user_has_role(db: Session, user_id: int, role_code: str) -> bool:
    result = one(
        db,
        """
        SELECT 1 AS allowed
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = :userId AND r.code = :roleCode AND r.is_active = TRUE
        LIMIT 1
        """,
        {"userId": user_id, "roleCode": role_code},
    )
    return bool(result)


def resolve_active_role(db: Session, user_id: int, role_code: str | None) -> dict:
    roles = get_user_roles(db, user_id)
    if not roles:
        raise ApiError(403, "No roles are assigned to this account.")
    if role_code:
        match = next((role for role in roles if role["code"] == role_code), None)
        if not match:
            raise ApiError(403, "You do not have access to the selected role.")
        return match
    primary = next((role for role in roles if role.get("is_primary")), roles[0])
    return primary


def grant_user_role(db: Session, user_id: int, role_id: int, granted_by_user_id: int | None = None) -> None:
    execute(
        db,
        """
        INSERT INTO user_roles (user_id, role_id, granted_by_user_id)
        VALUES (:userId, :roleId, :grantedByUserId)
        ON DUPLICATE KEY UPDATE granted_by_user_id = COALESCE(granted_by_user_id, VALUES(granted_by_user_id))
        """,
        {"userId": user_id, "roleId": role_id, "grantedByUserId": granted_by_user_id},
    )


def create_role_access_request(db: Session, user_id: int, requested_role_code: str, reason: str | None) -> dict:
    if requested_role_code not in REQUESTABLE_ROLE_CODES:
        raise ApiError(400, "Choose a valid role.")
    role = one(db, "SELECT id, code, name FROM roles WHERE code = :code AND is_active = TRUE", {"code": requested_role_code})
    if not role:
        raise ApiError(400, "Choose a valid role.")
    if user_has_role(db, user_id, requested_role_code):
        raise ApiError(409, "You already have access to this role.")
    pending = one(
        db,
        """
        SELECT id FROM role_access_requests
        WHERE user_id = :userId AND requested_role_id = :roleId AND status = 'PENDING'
        LIMIT 1
        """,
        {"userId": user_id, "roleId": role["id"]},
    )
    if pending:
        raise ApiError(409, "You already have a pending request for this role.")
    result = execute(
        db,
        """
        INSERT INTO role_access_requests (user_id, requested_role_id, reason)
        VALUES (:userId, :roleId, :reason)
        """,
        {"userId": user_id, "roleId": role["id"], "reason": reason},
    )
    return one(db, "SELECT * FROM role_access_requests WHERE id = :id", {"id": result.lastrowid})


def list_role_access_requests(db: Session, status: str = "PENDING") -> list[dict]:
    return rows(
        db,
        """
        SELECT rar.id, rar.user_id, rar.reason, rar.status, rar.created_at, rar.reviewed_at,
               u.employee_id, u.full_name, u.email, u.designation,
               d.name AS department_name,
               rr.id AS requested_role_id, rr.code AS requested_role_code, rr.name AS requested_role_name,
               (
                 SELECT GROUP_CONCAT(DISTINCT r2.name ORDER BY r2.name SEPARATOR ', ')
                 FROM user_roles ur2
                 JOIN roles r2 ON r2.id = ur2.role_id
                 WHERE ur2.user_id = u.id
               ) AS existing_role_names,
               (
                 SELECT GROUP_CONCAT(DISTINCT r2.code ORDER BY r2.name SEPARATOR ',')
                 FROM user_roles ur2
                 JOIN roles r2 ON r2.id = ur2.role_id
                 WHERE ur2.user_id = u.id
               ) AS existing_role_codes
        FROM role_access_requests rar
        JOIN users u ON u.id = rar.user_id
        JOIN roles rr ON rr.id = rar.requested_role_id
        LEFT JOIN departments d ON d.id = u.department_id
        WHERE (:status = '' OR rar.status = :status)
        ORDER BY rar.created_at DESC
        """,
        {"status": status},
    )


def get_role_access_request(db: Session, request_id: int) -> dict | None:
    rows_result = list_role_access_requests(db, status="")
    return next((row for row in rows_result if row["id"] == request_id), None)


def get_pending_role_request_codes(db: Session, user_id: int) -> list[str]:
    rows_result = rows(
        db,
        """
        SELECT r.code
        FROM role_access_requests rar
        JOIN roles r ON r.id = rar.requested_role_id
        WHERE rar.user_id = :userId AND rar.status = 'PENDING'
        """,
        {"userId": user_id},
    )
    return [row["code"] for row in rows_result]


def _assert_can_review_role_access_request(request_row: dict) -> None:
    if request_row.get("status") != "PENDING":
        raise ApiError(409, "This role access request has already been reviewed.")


def approve_role_access_request(db: Session, request_id: int, reviewer_user_id: int) -> dict:
    request_row = one(db, "SELECT * FROM role_access_requests WHERE id = :id", {"id": request_id})
    if not request_row:
        raise ApiError(404, "Role access request not found.")
    _assert_can_review_role_access_request(request_row)
    requested_role = one(db, "SELECT code FROM roles WHERE id = :id", {"id": request_row["requested_role_id"]})
    if requested_role and user_has_role(db, request_row["user_id"], requested_role["code"]):
        raise ApiError(409, "User already has the requested role.")
    grant_user_role(db, request_row["user_id"], request_row["requested_role_id"], reviewer_user_id)
    execute(
        db,
        """
        UPDATE role_access_requests
        SET status = 'APPROVED', reviewed_by_user_id = :reviewedBy, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = :id
        """,
        {"id": request_id, "reviewedBy": reviewer_user_id},
    )
    return one(db, "SELECT * FROM role_access_requests WHERE id = :id", {"id": request_id})


def reject_role_access_request(db: Session, request_id: int, reviewer_user_id: int) -> dict:
    request_row = one(db, "SELECT * FROM role_access_requests WHERE id = :id", {"id": request_id})
    if not request_row:
        raise ApiError(404, "Role access request not found.")
    _assert_can_review_role_access_request(request_row)
    execute(
        db,
        """
        UPDATE role_access_requests
        SET status = 'REJECTED', reviewed_by_user_id = :reviewedBy, reviewed_at = CURRENT_TIMESTAMP
        WHERE id = :id
        """,
        {"id": request_id, "reviewedBy": reviewer_user_id},
    )
    return one(db, "SELECT * FROM role_access_requests WHERE id = :id", {"id": request_id})
