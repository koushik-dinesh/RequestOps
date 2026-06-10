from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.database import get_db, rows
from app.middleware.auth import get_current_user
from app.utils.http import ok


router = APIRouter(prefix="/developer-workload", tags=["developer-workload"], dependencies=[Depends(get_current_user)])

ACTIVE_WORK_STATUSES = [
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
    "READY_FOR_COMPLETION",
]
WORKLOAD_THRESHOLDS = {
    "availableMax": 3,
    "moderateMax": 6,
}


def workload_status(active_count: int) -> str:
    if active_count <= WORKLOAD_THRESHOLDS["availableMax"]:
        return "AVAILABLE"
    if active_count <= WORKLOAD_THRESHOLDS["moderateMax"]:
        return "MODERATE"
    return "OVERLOADED"


def active_status_sql() -> str:
    return ", ".join(f"'{status}'" for status in ACTIVE_WORK_STATUSES)


@router.get("/")
def list_developer_workload(_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    developers = rows(db, f"""
        SELECT
            u.id,
            u.employee_id,
            u.full_name,
            u.email,
            u.department_id,
            d.name AS department_name,
            COUNT(task.id) AS active_request_count,
            SUM(CASE WHEN task.status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_development_count,
            SUM(CASE WHEN task.status = 'BLOCKED' THEN 1 ELSE 0 END) AS in_testing_count,
            SUM(CASE WHEN r.status = 'DEVELOPMENT_COMPLETE' THEN 1 ELSE 0 END) AS qa_pending_count
        FROM users u
        JOIN roles role ON role.id = u.role_id
        LEFT JOIN departments d ON d.id = u.department_id
        LEFT JOIN sprint_tasks task ON task.assigned_developer_user_id = u.id AND task.status IN ('TODO', 'IN_PROGRESS', 'BLOCKED')
        LEFT JOIN sprints sprint ON sprint.id = task.sprint_id
        LEFT JOIN requests r ON r.id = sprint.request_id AND r.status IN ({active_status_sql()})
        WHERE role.code = 'DEVELOPER' AND u.status = 'ACTIVE'
        GROUP BY u.id, u.employee_id, u.full_name, u.email, u.department_id, d.name
        ORDER BY active_request_count DESC, u.full_name
    """)

    developer_ids = [row["id"] for row in developers]
    assignment_rows = rows(db, f"""
        SELECT
            task.assigned_developer_user_id AS developer_user_id,
            task.created_at AS assigned_at,
            r.id AS request_id,
            r.request_number,
            r.title,
            r.status,
            r.priority,
            r.updated_at,
            task.task_key,
            task.title AS task_title,
            task.status AS task_status,
            qa.full_name AS qa_name
        FROM sprint_tasks task
        JOIN sprints sprint ON sprint.id = task.sprint_id
        JOIN requests r ON r.id = sprint.request_id
        LEFT JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE
        LEFT JOIN users qa ON qa.id = a.qa_user_id
        WHERE task.assigned_developer_user_id IS NOT NULL
          AND task.status IN ('TODO', 'IN_PROGRESS', 'BLOCKED')
          AND r.status IN ({active_status_sql()})
        ORDER BY task.created_at DESC, r.updated_at DESC
    """) if developer_ids else []

    assignments_by_developer: dict[int, list[dict]] = {}
    for assignment in assignment_rows:
        assignments_by_developer.setdefault(int(assignment["developer_user_id"]), []).append(assignment)

    rows_with_status = []
    for developer in developers:
        active_count = int(developer.get("active_request_count") or 0)
        status = workload_status(active_count)
        rows_with_status.append({
            **developer,
            "active_request_count": active_count,
            "in_development_count": int(developer.get("in_development_count") or 0),
            "in_testing_count": int(developer.get("in_testing_count") or 0),
            "qa_pending_count": int(developer.get("qa_pending_count") or 0),
            "workload_status": status,
            "assignments": assignments_by_developer.get(int(developer["id"]), []),
        })

    summary = {
        "totalDevelopers": len(rows_with_status),
        "available": sum(1 for item in rows_with_status if item["workload_status"] == "AVAILABLE"),
        "moderate": sum(1 for item in rows_with_status if item["workload_status"] == "MODERATE"),
        "overloaded": sum(1 for item in rows_with_status if item["workload_status"] == "OVERLOADED"),
        "activeAssignedRequests": sum(item["active_request_count"] for item in rows_with_status),
    }

    return ok({
        "thresholds": WORKLOAD_THRESHOLDS,
        "activeStatuses": ACTIVE_WORK_STATUSES,
        "summary": summary,
        "developers": rows_with_status,
    })
