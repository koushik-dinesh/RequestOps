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


def department_scoped_cards(db: Session, params: dict) -> list[dict]:
    scope = "requester_department_id = :departmentId"
    return [
        {"label": "Department Requests", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope}", params), "href": "/requests"},
        {"label": "Pending Approval", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status = 'DEPARTMENT_APPROVAL_PENDING'", params), "href": "/requests?status=DEPARTMENT_APPROVAL_PENDING"},
        {"label": "Approved By Department", "value": scalar(db, "SELECT COUNT(*) AS count FROM request_status_history WHERE changed_by_user_id = :userId AND to_status = 'IT_REVIEW_PENDING'", params)},
        {"label": "Waiting For More Information", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status = 'CLARIFICATION_REQUESTED'", params), "href": "/requests?status=CLARIFICATION_REQUESTED"},
        {"label": "Requirements Review", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status IN ('REQUIREMENTS_DEPARTMENT_REVIEW','REQUIREMENTS_PM_REVIEW','REQUIREMENTS_IT_REVIEW','REQUIREMENTS_CLARIFICATION_REQUESTED')", params), "href": "/requests?status=REQUIREMENTS_DEPARTMENT_REVIEW"},
        {"label": "Team Assigned", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status IN ('ASSIGNED','DEVELOPER_ASSIGNED')", params), "href": "/requests?status=ASSIGNED"},
        {"label": "In Progress", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status IN ('IN_DEVELOPMENT','DEVELOPMENT_COMPLETE')", params), "href": "/requests?status=IN_DEVELOPMENT"},
        {"label": "Review & Validation", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status IN ('QA_PENDING','IN_TESTING')", params), "href": "/requests?status=IN_TESTING"},
        {"label": "Sign-Off", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status = 'CLOSED'", params), "href": "/requests?status=CLOSED"},
    ]


def requester_scoped_cards(db: Session, params: dict) -> list[dict]:
    scope = "requester_user_id = :userId"
    return [
        {"label": "My Requests", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope}", params), "href": "/requests"},
        {"label": "Pending Approval", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status IN ('DEPARTMENT_APPROVAL_PENDING','IT_REVIEW_PENDING')", params), "href": "/requests?status=DEPARTMENT_APPROVAL_PENDING"},
        {"label": "Planning", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status IN ('ASSIGNMENT_PENDING','PM_ASSIGNED','SCOPE_REVIEW','USER_STORY_REVIEW','DEVELOPER_ASSIGNED','SPRINT_PLANNING','REQUIREMENTS_DEPARTMENT_REVIEW','REQUIREMENTS_PM_REVIEW','REQUIREMENTS_IT_REVIEW','REQUIREMENTS_CLARIFICATION_REQUESTED','REQUIREMENTS_APPROVED')", params), "href": "/requests?status=ASSIGNMENT_PENDING"},
        {"label": "Waiting For More Information", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status = 'CLARIFICATION_REQUESTED'", params), "href": "/requests?status=CLARIFICATION_REQUESTED"},
        {"label": "In Progress", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status IN ('ASSIGNED','DEVELOPER_ASSIGNED','SPRINT_PLANNING','SPRINT_CREATED','SPRINT_ACTIVE','IN_DEVELOPMENT','DEVELOPMENT_COMPLETE','QA_PENDING','QA_PASSED','IN_TESTING','DEPLOYMENT_PENDING','DEPLOYED','READY_FOR_COMPLETION')", params), "href": "/requests?status=IN_DEVELOPMENT"},
        {"label": "Requester UAT for Pre-Deployment", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status IN ('UAT_PENDING','UAT_FAILED','UAT_APPROVED')", params), "href": "/requests?status=UAT_PENDING"},
        {"label": "Sign-Off", "value": scalar(db, f"SELECT COUNT(*) AS count FROM requests WHERE {scope} AND status = 'CLOSED'", params), "href": "/requests?status=CLOSED"},
    ]


@router.get("/me")
def dashboard_me(user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    params = {"userId": user["id"], "departmentId": user.get("department_id")}
    role = user["role_code"]
    cards = []
    overview_note = ""

    if role in ("SYSTEM_ADMIN", "IT_HEAD"):
        cards.extend([
            {"label": "Total Requests", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests", params), "href": "/requests"},
            {"label": "Pending Approval", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'DEPARTMENT_APPROVAL_PENDING'", params), "href": "/requests?status=DEPARTMENT_APPROVAL_PENDING"},
            {"label": "Internal Review", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'IT_REVIEW_PENDING'", params), "href": "/requests?status=IT_REVIEW_PENDING"},
            {"label": "PM Assignment", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'ASSIGNMENT_PENDING'", params), "href": "/requests?status=ASSIGNMENT_PENDING"},
            {"label": "Planning", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('PM_ASSIGNED','SCOPE_REVIEW','USER_STORY_REVIEW','REQUIREMENTS_DEPARTMENT_REVIEW','REQUIREMENTS_PM_REVIEW','REQUIREMENTS_IT_REVIEW','REQUIREMENTS_CLARIFICATION_REQUESTED','REQUIREMENTS_APPROVED','DEVELOPER_ASSIGNED','SPRINT_PLANNING','SPRINT_CREATED','SPRINT_ACTIVE')", params), "href": "/requests?status=PM_ASSIGNED"},
            {"label": "Requests In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('IN_DEVELOPMENT','DEVELOPMENT_COMPLETE')", params), "href": "/requests?status=IN_DEVELOPMENT"},
            {"label": "QA", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('QA_PENDING','QA_FAILED','QA_PASSED','IN_TESTING')", params), "href": "/requests?status=IN_TESTING"},
            {"label": "Requester UAT for Pre-Deployment", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('UAT_PENDING','UAT_FAILED','UAT_APPROVED')", params), "href": "/requests?status=UAT_PENDING"},
            {"label": "Sign-Off", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'CLOSED'", params), "href": "/requests?status=CLOSED"},
        ])
        overview_note = "Overview of all organization requests is shown below."
    elif role == "DEPARTMENT_HEAD":
        cards.extend(department_scoped_cards(db, params))
        overview_note = "Metrics below reflect requests raised by your department."
    elif role == "EMPLOYEE":
        cards.extend(requester_scoped_cards(db, params))
        overview_note = "Metrics below reflect only requests you have raised."
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
            {"label": "QA / UAT", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE project_manager_user_id = :userId AND status IN ('QA_PENDING','QA_FAILED','QA_PASSED','UAT_PENDING','UAT_FAILED','UAT_APPROVED')", params), "href": "/requests?status=QA_PENDING"},
        ])
        overview_note = "Metrics below reflect only requests assigned to you as Project Manager."
    elif role == "DEVELOPER":
        cards.extend([
            {"label": "Assigned Requests", "value": scalar(db, "SELECT COUNT(DISTINCT s.request_id) AS count FROM sprint_tasks t JOIN sprints s ON s.id = t.sprint_id WHERE t.assigned_developer_user_id = :userId AND t.status IN ('TODO','IN_PROGRESS','BLOCKED')", params)},
            {"label": "Work In Progress", "value": scalar(db, "SELECT COUNT(DISTINCT s.request_id) AS count FROM sprint_tasks t JOIN sprints s ON s.id = t.sprint_id JOIN requests r ON r.id = s.request_id WHERE t.assigned_developer_user_id = :userId AND r.status = 'IN_DEVELOPMENT'", params)},
            {"label": "Ready To Start", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks t JOIN sprints s ON s.id = t.sprint_id WHERE t.assigned_developer_user_id = :userId AND s.status = 'ACTIVE' AND t.status = 'TODO'", params)},
            {"label": "My Sprint Tasks", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks WHERE assigned_developer_user_id = :userId AND status IN ('TODO','IN_PROGRESS','BLOCKED')", params)},
            {"label": "Tasks In Progress", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks WHERE assigned_developer_user_id = :userId AND status = 'IN_PROGRESS'", params)},
            {"label": "Tasks Blocked", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks WHERE assigned_developer_user_id = :userId AND status = 'BLOCKED'", params)},
            {"label": "Sign-Off", "value": scalar(db, "SELECT COUNT(*) AS count FROM sprint_tasks WHERE assigned_developer_user_id = :userId AND status = 'DONE'", params), "href": "/requests?status=IN_DEVELOPMENT"},
        ])
        overview_note = "Metrics below reflect only requests and sprint tasks assigned to you."
    elif role == "QA":
        cards.extend([
            {"label": "Pending Review", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.qa_user_id = :userId AND r.status IN ('QA_PENDING','IN_TESTING')", params)},
            {"label": "In Review", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.qa_user_id = :userId AND r.status = 'QA_PENDING'", params)},
            {"label": "Failed", "value": scalar(db, "SELECT COUNT(*) AS count FROM test_results WHERE qa_user_id = :userId AND result IN ('FAIL','RETEST_REQUIRED')", params)},
            {"label": "Passed", "value": scalar(db, "SELECT COUNT(*) AS count FROM test_results WHERE qa_user_id = :userId AND result = 'PASS'", params)},
            {"label": "Requester UAT for Pre-Deployment", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.qa_user_id = :userId AND r.status = 'UAT_PENDING'", params), "href": "/requests?status=UAT_PENDING"},
        ])
        overview_note = "Metrics below reflect only requests assigned to you for review."
    elif role == "UAT_APPROVER":
        cards.extend([
            {"label": "Requester UAT for Pre-Deployment", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status = 'UAT_PENDING'", params), "href": "/requests?status=UAT_PENDING"},
            {"label": "Approved", "value": scalar(db, "SELECT COUNT(*) AS count FROM uat_approvals WHERE uat_approver_user_id = :userId AND decision = 'APPROVED'", params)},
            {"label": "Rejected", "value": scalar(db, "SELECT COUNT(*) AS count FROM uat_approvals WHERE uat_approver_user_id = :userId AND decision = 'REJECTED'", params)},
            {"label": "Returned for Changes", "value": scalar(db, "SELECT COUNT(*) AS count FROM requests WHERE status IN ('UAT_REJECTED','UAT_FAILED')", params)},
        ])
        overview_note = "Metrics below reflect requests in requester pre-deployment UAT and sign-off."

    if role in ("SYSTEM_ADMIN", "IT_HEAD"):
        recent_activity_filter = "1=1"
    elif role == "EMPLOYEE":
        recent_activity_filter = "r.requester_user_id = :userId"
    elif role == "DEPARTMENT_HEAD":
        recent_activity_filter = "(r.department_head_user_id = :userId OR r.requester_department_id = :departmentId OR d.department_head_user_id = :userId)"
    else:
        recent_activity_filter = """
            (r.requester_user_id = :userId
               OR r.department_head_user_id = :userId
               OR r.project_manager_user_id = :userId
               OR r.current_assignee_user_id = :userId
               OR EXISTS (
                 SELECT 1 FROM sprint_tasks t
                 JOIN sprints s ON s.id = t.sprint_id
                 WHERE s.request_id = r.id AND t.assigned_developer_user_id = :userId
               )
               OR EXISTS (
                 SELECT 1 FROM assignments a
                 WHERE a.request_id = r.id AND a.is_active = TRUE AND a.qa_user_id = :userId
               ))
        """
    recent_activity = rows(db, f"""
        SELECT r.id, r.request_number, r.title, r.status, r.updated_at,
               assignee.full_name AS current_assignee_name
        FROM requests r
        LEFT JOIN departments d ON d.id = r.requester_department_id
        LEFT JOIN users assignee ON assignee.id = r.current_assignee_user_id
        WHERE {recent_activity_filter}
        ORDER BY r.updated_at DESC
        LIMIT 8
    """, {**params, "role": role})
    return ok({"role": role, "cards": cards, "recentActivity": recent_activity, "overviewNote": overview_note})
