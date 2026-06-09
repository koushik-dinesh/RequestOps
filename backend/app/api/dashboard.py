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
            {"label": "PM Assignment", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'ASSIGNMENT_PENDING'", params)},
            {"label": "Planning", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('PM_ASSIGNED','SCOPE_REVIEW','USER_STORY_REVIEW','REQUIREMENTS_DEPARTMENT_REVIEW','REQUIREMENTS_PM_REVIEW','REQUIREMENTS_IT_REVIEW','REQUIREMENTS_CLARIFICATION_REQUESTED','REQUIREMENTS_APPROVED','DEVELOPER_ASSIGNED','SPRINT_PLANNING','SPRINT_CREATED','SPRINT_ACTIVE')", params)},
            {"label": "Requests In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('IN_DEVELOPMENT','DEVELOPMENT_COMPLETE')", params)},
            {"label": "QA", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('QA_PENDING','QA_FAILED','QA_PASSED','IN_TESTING')", params)},
            {"label": "Final Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('UAT_PENDING','UAT_FAILED','UAT_APPROVED')", params)},
            {"label": "Completed", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'CLOSED'", params)},
        ])
    elif role == "DEPARTMENT_HEAD":
        cards.extend([
            {"label": "Department Requests", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId", params)},
            {"label": "Pending Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'DEPARTMENT_APPROVAL_PENDING'", params)},
            {"label": "Approved By Department", "value": scalar(db, "SELECT COUNT(*) AS count FROM request_status_history WHERE changed_by_user_id = :userId AND to_status = 'IT_REVIEW_PENDING'", params)},
            {"label": "Waiting For More Information", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'CLARIFICATION_REQUESTED'", params)},
            {"label": "Requirements Review", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status IN ('REQUIREMENTS_DEPARTMENT_REVIEW','REQUIREMENTS_PM_REVIEW','REQUIREMENTS_IT_REVIEW','REQUIREMENTS_CLARIFICATION_REQUESTED')", params)},
            {"label": "Team Assigned", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status IN ('ASSIGNED','DEVELOPER_ASSIGNED')", params)},
            {"label": "Requests In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status IN ('IN_DEVELOPMENT','DEVELOPMENT_COMPLETE')", params)},
            {"label": "Review & Validation", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status IN ('QA_PENDING','IN_TESTING')", params)},
            {"label": "Completed", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'CLOSED'", params)},
        ])
    elif role == "IT_HEAD":
        cards.extend([
            {"label": "Pending Internal Review", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'IT_REVIEW_PENDING'", params)},
            {"label": "PM Assignment", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'ASSIGNMENT_PENDING'", params)},
            {"label": "Planning", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('PM_ASSIGNED','SCOPE_REVIEW','USER_STORY_REVIEW','REQUIREMENTS_DEPARTMENT_REVIEW','REQUIREMENTS_IT_REVIEW','REQUIREMENTS_CLARIFICATION_REQUESTED','REQUIREMENTS_APPROVED','DEVELOPER_ASSIGNED','SPRINT_PLANNING','SPRINT_CREATED','SPRINT_ACTIVE')", params)},
            {"label": "Requests In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'IN_DEVELOPMENT'", params)},
            {"label": "Average Completion %", "value": scalar(db, "SELECT COALESCE(ROUND(AVG(progress_percentage)), 0) AS count FROM requests WHERE status IN ('DEVELOPER_ASSIGNED','SPRINT_PLANNING','SPRINT_CREATED','SPRINT_ACTIVE','ASSIGNED','IN_DEVELOPMENT','DEVELOPMENT_COMPLETE')", params)},
            {"label": "Requests Behind Schedule", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'IN_DEVELOPMENT' AND progress_percentage < 75 AND updated_at < DATE_SUB(NOW(), INTERVAL 5 DAY)", params)},
            {"label": "Review & Validation", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('QA_PENDING','IN_TESTING')", params)},
            {"label": "Final Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('UAT_PENDING','UAT_APPROVED')", params)},
            {"label": "Completed", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'CLOSED' AND it_head_user_id IS NOT NULL", params)},
        ])
    elif role == "PROJECT_MANAGER":
        cards.extend([
            {"label": "Assigned Projects", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE project_manager_user_id = :userId", params)},
            {"label": "Scope / Story Planning", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE project_manager_user_id = :userId AND status IN ('PM_ASSIGNED','SCOPE_REVIEW','USER_STORY_REVIEW','REQUIREMENTS_DEPARTMENT_REVIEW','REQUIREMENTS_IT_REVIEW','REQUIREMENTS_CLARIFICATION_REQUESTED')", params)},
            {"label": "Ready For Developer", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE project_manager_user_id = :userId AND status = 'REQUIREMENTS_APPROVED'", params)},
            {"label": "Sprint Planning", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE project_manager_user_id = :userId AND status IN ('DEVELOPER_ASSIGNED','SPRINT_PLANNING','SPRINT_CREATED')", params)},
            {"label": "Sprint Progress", "value": scalar(db, "SELECT COALESCE(ROUND(AVG(t.progress_percentage)), 0) AS count FROM sprint_tasks t JOIN sprints s ON s.id = t.sprint_id JOIN requests r ON r.id = s.request_id WHERE r.project_manager_user_id = :userId AND s.status = 'ACTIVE'", params)},
            {"label": "Tasks In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks t JOIN sprints s ON s.id = t.sprint_id JOIN requests r ON r.id = s.request_id WHERE r.project_manager_user_id = :userId AND t.status = 'IN_PROGRESS'", params)},
            {"label": "Tasks Blocked", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks t JOIN sprints s ON s.id = t.sprint_id JOIN requests r ON r.id = s.request_id WHERE r.project_manager_user_id = :userId AND t.status = 'BLOCKED'", params)},
            {"label": "Developer Workload", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks t JOIN sprints s ON s.id = t.sprint_id JOIN requests r ON r.id = s.request_id WHERE r.project_manager_user_id = :userId AND t.assigned_developer_user_id IS NOT NULL AND t.status IN ('TODO','IN_PROGRESS','BLOCKED')", params)},
            {"label": "In Development", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE project_manager_user_id = :userId AND status = 'IN_DEVELOPMENT'", params)},
            {"label": "QA / UAT", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE project_manager_user_id = :userId AND status IN ('QA_PENDING','QA_FAILED','QA_PASSED','UAT_PENDING','UAT_FAILED','UAT_APPROVED')", params)},
        ])
    elif role == "DEVELOPER":
        cards.extend([
            {"label": "Assigned Requests", "value": scalar(db, "SELECT COUNT(DISTINCT s.request_id) AS count FROM sprint_tasks t JOIN sprints s ON s.id = t.sprint_id WHERE t.assigned_developer_user_id = :userId AND t.status IN ('TODO','IN_PROGRESS','BLOCKED')", params)},
            {"label": "Work In Progress", "value": scalar(db, "SELECT COUNT(DISTINCT s.request_id) AS count FROM sprint_tasks t JOIN sprints s ON s.id = t.sprint_id JOIN requests r ON r.id = s.request_id WHERE t.assigned_developer_user_id = :userId AND r.status = 'IN_DEVELOPMENT'", params)},
            {"label": "Ready To Start", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks t JOIN sprints s ON s.id = t.sprint_id WHERE t.assigned_developer_user_id = :userId AND s.status = 'ACTIVE' AND t.status = 'TODO'", params)},
            {"label": "My Sprint Tasks", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks WHERE assigned_developer_user_id = :userId AND status IN ('TODO','IN_PROGRESS','BLOCKED')", params)},
            {"label": "Tasks In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks WHERE assigned_developer_user_id = :userId AND status = 'IN_PROGRESS'", params)},
            {"label": "Tasks Blocked", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks WHERE assigned_developer_user_id = :userId AND status = 'BLOCKED'", params)},
            {"label": "Completed", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks WHERE assigned_developer_user_id = :userId AND status = 'DONE'", params)},
        ])
    elif role == "QA":
        cards.extend([
            {"label": "Pending Review", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.qa_user_id = :userId AND r.status IN ('QA_PENDING','IN_TESTING')", params)},
            {"label": "In Review", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.qa_user_id = :userId AND r.status = 'QA_PENDING'", params)},
            {"label": "Failed", "value": scalar(db, "SELECT COUNT(*) AS count FROM test_results WHERE qa_user_id = :userId AND result IN ('FAIL','RETEST_REQUIRED')", params)},
            {"label": "Passed", "value": scalar(db, "SELECT COUNT(*) AS count FROM test_results WHERE qa_user_id = :userId AND result = 'PASS'", params)},
            {"label": "Pending Final Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.qa_user_id = :userId AND r.status = 'UAT_PENDING'", params)},
        ])
    elif role == "UAT_APPROVER":
        cards.extend([
            {"label": "Pending Final Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'UAT_PENDING'", params)},
            {"label": "Approved", "value": scalar(db, "SELECT COUNT(*) AS count FROM uat_approvals WHERE uat_approver_user_id = :userId AND decision = 'APPROVED'", params)},
            {"label": "Rejected", "value": scalar(db, "SELECT COUNT(*) AS count FROM uat_approvals WHERE uat_approver_user_id = :userId AND decision = 'REJECTED'", params)},
            {"label": "Returned for Changes", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('UAT_REJECTED','UAT_FAILED')", params)},
        ])
    else:
        cards.extend([
            {"label": "My Requests", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId", params)},
            {"label": "Pending Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status IN ('DEPARTMENT_APPROVAL_PENDING','IT_REVIEW_PENDING')", params)},
            {"label": "Planning", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status IN ('ASSIGNMENT_PENDING','PM_ASSIGNED','SCOPE_REVIEW','USER_STORY_REVIEW','DEVELOPER_ASSIGNED','SPRINT_PLANNING')", params)},
            {"label": "Waiting For More Information", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status = 'CLARIFICATION_REQUESTED'", params)},
            {"label": "In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status IN ('ASSIGNED','DEVELOPER_ASSIGNED','SPRINT_PLANNING','IN_DEVELOPMENT','DEVELOPMENT_COMPLETE','QA_PENDING','QA_PASSED','IN_TESTING','UAT_PENDING','DEPLOYMENT_PENDING','DEPLOYED','READY_FOR_COMPLETION')", params)},
            {"label": "Completed", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status = 'CLOSED'", params)},
        ])

    recent_activity = rows(db, """
        SELECT r.id, r.request_number, r.title, r.status, r.updated_at
        FROM requests r
        WHERE (:role IN ('SYSTEM_ADMIN', 'IT_HEAD')
           OR r.requester_user_id = :userId
           OR r.department_head_user_id = :userId
           OR r.project_manager_user_id = :userId
           OR r.current_assignee_user_id = :userId)
        ORDER BY r.updated_at DESC
        LIMIT 8
    """, {**params, "role": role})
    return ok({"role": role, "cards": cards, "recentActivity": recent_activity})
