from sqlalchemy.orm import Session

from app.core.database import execute, one
from app.services.activity_service import audit
from app.utils.http import ApiError


TRANSITIONS = {
    "DEPARTMENT_APPROVAL_PENDING": ["CLARIFICATION_REQUESTED", "DEPARTMENT_REJECTED", "IT_REVIEW_PENDING"],
    "CLARIFICATION_REQUESTED": ["DEPARTMENT_APPROVAL_PENDING", "IT_REVIEW_PENDING", "IN_TESTING", "QA_PENDING", "UAT_PENDING"],
    "IT_REVIEW_PENDING": ["CLARIFICATION_REQUESTED", "IT_REJECTED", "DEFERRED", "ASSIGNMENT_PENDING"],
    "DEFERRED": ["IT_REVIEW_PENDING"],
    "ASSIGNMENT_PENDING": ["PM_ASSIGNED", "ASSIGNED"],
    "PM_ASSIGNED": ["SCOPE_REVIEW", "USER_STORY_REVIEW", "REQUIREMENTS_DEPARTMENT_REVIEW"],
    "SCOPE_REVIEW": ["USER_STORY_REVIEW", "PM_ASSIGNED", "REQUIREMENTS_DEPARTMENT_REVIEW"],
    "USER_STORY_REVIEW": ["PM_ASSIGNED", "SCOPE_REVIEW", "REQUIREMENTS_DEPARTMENT_REVIEW"],
    "REQUIREMENTS_DEPARTMENT_REVIEW": ["REQUIREMENTS_PM_REVIEW", "REQUIREMENTS_CLARIFICATION_REQUESTED", "REQUIREMENTS_APPROVED"],
    "REQUIREMENTS_PM_REVIEW": ["REQUIREMENTS_DEPARTMENT_REVIEW", "REQUIREMENTS_APPROVED"],
    "REQUIREMENTS_IT_REVIEW": ["REQUIREMENTS_DEPARTMENT_REVIEW", "REQUIREMENTS_CLARIFICATION_REQUESTED", "REQUIREMENTS_APPROVED"],
    "REQUIREMENTS_CLARIFICATION_REQUESTED": ["REQUIREMENTS_DEPARTMENT_REVIEW", "REQUIREMENTS_PM_REVIEW", "REQUIREMENTS_IT_REVIEW"],
    "REQUIREMENTS_APPROVED": ["DEVELOPER_ASSIGNED", "SPRINT_PLANNING"],
    "DEVELOPER_ASSIGNED": ["SPRINT_PLANNING"],
    "SPRINT_PLANNING": ["SPRINT_CREATED"],
    "SPRINT_CREATED": ["SPRINT_ACTIVE"],
    "SPRINT_ACTIVE": ["IN_DEVELOPMENT"],
    "ASSIGNED": ["IN_DEVELOPMENT"],
    "IN_DEVELOPMENT": ["DEVELOPMENT_COMPLETE", "QA_PENDING"],
    "DEVELOPMENT_COMPLETE": ["IN_DEVELOPMENT", "IN_TESTING", "QA_PENDING"],
    "IN_TESTING": ["CLARIFICATION_REQUESTED", "TEST_FAILED", "UAT_PENDING", "QA_FAILED", "QA_PASSED"],
    "TEST_FAILED": ["IN_DEVELOPMENT"],
    "QA_PENDING": ["CLARIFICATION_REQUESTED", "QA_FAILED", "QA_PASSED"],
    "QA_FAILED": ["IN_DEVELOPMENT"],
    "QA_PASSED": ["DEPLOYMENT_PENDING", "UAT_PENDING"],
    "UAT_PENDING": ["CLARIFICATION_REQUESTED", "UAT_REJECTED", "UAT_FAILED", "UAT_APPROVED", "CLOSED"],
    "UAT_REJECTED": ["IN_DEVELOPMENT"],
    "UAT_FAILED": ["IN_DEVELOPMENT"],
    "UAT_APPROVED": ["DEPLOYMENT_PENDING"],
    "DEPLOYMENT_PENDING": ["DEPLOYED"],
    "DEPLOYED": ["READY_FOR_COMPLETION", "CLOSED"],
    "READY_FOR_COMPLETION": ["CLOSED"],
}


def get_request_by_id(db: Session, request_id: int) -> dict | None:
    return one(db, "SELECT * FROM requests WHERE id = :requestId", {"requestId": request_id})


def assert_transition(from_status: str, to_status: str) -> None:
    allowed = TRANSITIONS.get(from_status, [])
    if to_status != from_status and to_status not in allowed:
        raise ApiError(409, f"Cannot transition request from {from_status} to {to_status}.")


def transition_request(
    db: Session,
    *,
    request_id: int,
    to_status: str,
    actor_user_id: int,
    comment: str | None = None,
    request_context=None,
    patch: dict | None = None,
) -> dict:
    current = get_request_by_id(db, request_id)
    if not current:
        raise ApiError(404, "Request not found.")
    assert_transition(current["status"], to_status)

    patch = patch or {}
    set_fragments = ["status = :toStatus"]
    params = {"requestId": request_id, "toStatus": to_status}
    for key, value in patch.items():
        set_fragments.append(f"{key} = :{key}")
        params[key] = value
    if to_status == "CLOSED":
        set_fragments.append("closed_at = CURRENT_TIMESTAMP")
    execute(db, f"UPDATE requests SET {', '.join(set_fragments)} WHERE id = :requestId", params)
    execute(
        db,
        """
        INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
        VALUES (:requestId, :fromStatus, :toStatus, :actorUserId, :comment)
        """,
        {
            "requestId": request_id,
            "fromStatus": current["status"],
            "toStatus": to_status,
            "actorUserId": actor_user_id,
            "comment": comment,
        },
    )
    audit(
        db,
        actor_user_id=actor_user_id,
        action="REQUEST_STATUS_CHANGED",
        entity_type="REQUEST",
        entity_id=request_id,
        old_value={"status": current["status"]},
        new_value={"status": to_status, **patch},
        request=request_context,
    )
    return get_request_by_id(db, request_id)
