from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db, rows
from app.middleware.auth import get_current_user
from app.utils.http import ok


router = APIRouter(prefix="/dashboard", tags=["dashboard"], dependencies=[Depends(get_current_user)])


def scalar(db: Session, sql: str, params: dict) -> int:
    result = rows(db, sql, params)
    if not result:
        return 0
    return int(next(iter(result[0].values())) or 0)


@router.get("/me")
def dashboard_me(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    params = {"userId": user["id"], "departmentId": user.get("department_id")}
    role = user["role_code"]
    cards = []

    if role == "SYSTEM_ADMIN":
        cards.extend([
            {"label": "Total Requests", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests", params)},
            {"label": "Pending Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'DEPARTMENT_APPROVAL_PENDING'", params)},
            {"label": "Internal Review", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'IT_REVIEW_PENDING'", params)},
            {"label": "Waiting For Assignment", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'ASSIGNMENT_PENDING'", params)},
            {"label": "Team Assigned", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'ASSIGNED'", params)},
            {"label": "Requests In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('IN_DEVELOPMENT','DEVELOPMENT_COMPLETE')", params)},
            {"label": "Review & Validation", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'IN_TESTING'", params)},
            {"label": "Final Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'UAT_PENDING'", params)},
            {"label": "Completed", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'CLOSED'", params)},
        ])
    elif role == "DEPARTMENT_HEAD":
        cards.extend([
            {"label": "Department Requests", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId", params)},
            {"label": "Pending Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'DEPARTMENT_APPROVAL_PENDING'", params)},
            {"label": "Approved By Department", "value": scalar(db, "SELECT COUNT(*) AS count FROM request_status_history WHERE changed_by_user_id = :userId AND to_status = 'IT_REVIEW_PENDING'", params)},
            {"label": "Waiting For More Information", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'CLARIFICATION_REQUESTED'", params)},
            {"label": "Waiting For Assignment", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'ASSIGNMENT_PENDING'", params)},
            {"label": "Team Assigned", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'ASSIGNED'", params)},
            {"label": "Requests In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status IN ('IN_DEVELOPMENT','DEVELOPMENT_COMPLETE')", params)},
            {"label": "Review & Validation", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'IN_TESTING'", params)},
            {"label": "Completed", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'CLOSED'", params)},
        ])
    elif role == "IT_HEAD":
        cards.extend([
            {"label": "Pending Internal Review", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'IT_REVIEW_PENDING'", params)},
            {"label": "Waiting For Assignment", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'ASSIGNMENT_PENDING'", params)},
            {"label": "Team Assigned", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'ASSIGNED'", params)},
            {"label": "Requests In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'IN_DEVELOPMENT'", params)},
            {"label": "Average Completion %", "value": scalar(db, "SELECT COALESCE(ROUND(AVG(progress_percentage)), 0) AS count FROM requests WHERE status IN ('ASSIGNED','IN_DEVELOPMENT','DEVELOPMENT_COMPLETE')", params)},
            {"label": "Requests Behind Schedule", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'IN_DEVELOPMENT' AND progress_percentage < 75 AND updated_at < DATE_SUB(NOW(), INTERVAL 5 DAY)", params)},
            {"label": "Review & Validation", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'IN_TESTING'", params)},
            {"label": "Final Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'UAT_PENDING'", params)},
            {"label": "Completed", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'CLOSED' AND it_head_user_id IS NOT NULL", params)},
        ])
    elif role == "DEVELOPER":
        cards.extend([
            {"label": "Assigned Requests", "value": scalar(db, "SELECT COUNT(*) AS count FROM assignments WHERE developer_user_id = :userId AND is_active = TRUE", params)},
            {"label": "Work In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.developer_user_id = :userId AND r.status = 'IN_DEVELOPMENT'", params)},
            {"label": "Ready To Start", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.developer_user_id = :userId AND r.status = 'ASSIGNED'", params)},
            {"label": "Overdue", "value": 0},
            {"label": "Completed", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.developer_user_id = :userId AND r.status IN ('DEVELOPMENT_COMPLETE','IN_TESTING','UAT_PENDING','CLOSED')", params)},
        ])
    elif role == "QA":
        cards.extend([
            {"label": "Pending Review", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.qa_user_id = :userId AND r.status = 'IN_TESTING'", params)},
            {"label": "In Review", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.qa_user_id = :userId AND r.status = 'IN_TESTING'", params)},
            {"label": "Failed", "value": scalar(db, "SELECT COUNT(*) AS count FROM test_results WHERE qa_user_id = :userId AND result IN ('FAIL','RETEST_REQUIRED')", params)},
            {"label": "Passed", "value": scalar(db, "SELECT COUNT(*) AS count FROM test_results WHERE qa_user_id = :userId AND result = 'PASS'", params)},
            {"label": "Pending Final Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.qa_user_id = :userId AND r.status = 'UAT_PENDING'", params)},
        ])
    elif role == "UAT_APPROVER":
        cards.extend([
            {"label": "Pending Final Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'UAT_PENDING'", params)},
            {"label": "Approved", "value": scalar(db, "SELECT COUNT(*) AS count FROM uat_approvals WHERE uat_approver_user_id = :userId AND decision = 'APPROVED'", params)},
            {"label": "Rejected", "value": scalar(db, "SELECT COUNT(*) AS count FROM uat_approvals WHERE uat_approver_user_id = :userId AND decision = 'REJECTED'", params)},
            {"label": "Returned for Changes", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'UAT_REJECTED'", params)},
        ])
    else:
        cards.extend([
            {"label": "My Requests", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId", params)},
            {"label": "Pending Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status IN ('DEPARTMENT_APPROVAL_PENDING','IT_REVIEW_PENDING')", params)},
            {"label": "Waiting For Assignment", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status = 'ASSIGNMENT_PENDING'", params)},
            {"label": "Waiting For More Information", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status = 'CLARIFICATION_REQUESTED'", params)},
            {"label": "In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status IN ('ASSIGNED','IN_DEVELOPMENT','DEVELOPMENT_COMPLETE','IN_TESTING','UAT_PENDING')", params)},
            {"label": "Completed", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status = 'CLOSED'", params)},
        ])

    recent_activity = rows(db, """
        SELECT r.id, r.request_number, r.title, r.status, r.updated_at
        FROM requests r
        WHERE (:role IN ('SYSTEM_ADMIN', 'IT_HEAD')
           OR r.requester_user_id = :userId
           OR r.department_head_user_id = :userId
           OR r.current_assignee_user_id = :userId)
        ORDER BY r.updated_at DESC
        LIMIT 8
    """, {**params, "role": role})
    return ok({"role": role, "cards": cards, "recentActivity": recent_activity})
