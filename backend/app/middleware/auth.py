from collections.abc import Callable

from fastapi import Depends, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db, one
from app.core.security import decode_access_token
from app.utils.http import ApiError


bearer = HTTPBearer(auto_error=False)


USER_SELECT = """
SELECT u.id, u.employee_id, u.full_name, u.email, u.mobile_number, u.designation,
       u.department_id, u.reporting_manager_user_id, u.status, r.code AS role_code, r.name AS role_name,
       d.name AS department_name, d.code AS department_code,
       COALESCE(rm.id, dh.id) AS department_head_id,
       COALESCE(rm.full_name, dh.full_name) AS department_head_name,
       COALESCE(rm.email, dh.email) AS department_head_email
FROM users u
JOIN roles r ON r.id = u.role_id
LEFT JOIN departments d ON d.id = u.department_id
LEFT JOIN users rm ON rm.id = u.reporting_manager_user_id
LEFT JOIN users dh ON dh.id = d.department_head_user_id
WHERE u.id = :id
"""


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer),
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict:
    raw_token = credentials.credentials if credentials else token
    if not raw_token:
        raise ApiError(401, "Authentication required.")
    payload = decode_access_token(raw_token)
    user = one(db, USER_SELECT, {"id": payload.get("sub")})
    if not user or user.get("status") != "ACTIVE":
        raise ApiError(401, "Account is not active.")
    request.state.user = user
    return user


def require_roles(*role_codes: str) -> Callable:
    def dependency(user: dict = Depends(get_current_user)) -> dict:
        if user.get("role_code") == "SYSTEM_ADMIN" or user.get("role_code") in role_codes:
            return user
        raise ApiError(403, "You do not have permission to perform this action.")

    return dependency
