from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.database import execute, one, rows
from app.repositories.project_management_repository import delete_sprint
from app.services.activity_service import audit
from app.utils.http import ApiError

NON_WITHDRAWABLE_STATUSES = frozenset({
    "CLOSED",
    "DEPARTMENT_REJECTED",
    "IT_REJECTED",
    "WITHDRAWN",
})


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
    if from_status == "WITHDRAWN":
        raise ApiError(409, "This request has been withdrawn and cannot be updated.")
    allowed = TRANSITIONS.get(from_status, [])
    if to_status != from_status and to_status not in allowed:
        raise ApiError(409, f"Cannot transition request from {from_status} to {to_status}.")


def can_requester_withdraw(request_row: dict, user_id: int) -> bool:
    if int(request_row.get("requester_user_id") or 0) != int(user_id):
        return False
    return request_row.get("status") not in NON_WITHDRAWABLE_STATUSES


def withdraw_request(
    db: Session,
    *,
    request_id: int,
    actor_user_id: int,
    comment: str | None = None,
    request_context=None,
) -> dict:
    current = get_request_by_id(db, request_id)
    if not current:
        raise ApiError(404, "Request not found.")
    if not can_requester_withdraw(current, actor_user_id):
        if int(current.get("requester_user_id") or 0) != int(actor_user_id):
            raise ApiError(403, "Only the original requester can withdraw this request.")
        raise ApiError(409, "This request can no longer be withdrawn.")
    from_status = current["status"]
    execute(
        db,
        """
        UPDATE requests
        SET status = 'WITHDRAWN', current_assignee_user_id = NULL
        WHERE id = :requestId
        """,
        {"requestId": request_id},
    )
    execute(
        db,
        """
        INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
        VALUES (:requestId, :fromStatus, 'WITHDRAWN', :actorUserId, :comment)
        """,
        {
            "requestId": request_id,
            "fromStatus": from_status,
            "actorUserId": actor_user_id,
            "comment": comment or "Request withdrawn by requester.",
        },
    )
    audit(
        db,
        actor_user_id=actor_user_id,
        action="REQUEST_WITHDRAWN",
        entity_type="REQUEST",
        entity_id=request_id,
        old_value={"status": from_status},
        new_value={"status": "WITHDRAWN", "comment": comment},
        request=request_context,
    )
    return get_request_by_id(db, request_id)


def delete_request(
    db: Session,
    *,
    request_id: int,
    actor_user_id: int,
    comment: str | None = None,
    request_context=None,
) -> None:
    current = get_request_by_id(db, request_id)
    if not current:
        raise ApiError(404, "Request not found.")

    snapshot = {
        "id": current["id"],
        "requestNumber": current.get("request_number"),
        "title": current.get("title"),
        "status": current.get("status"),
        "requesterUserId": current.get("requester_user_id"),
        "departmentId": current.get("requester_department_id"),
        "priority": current.get("priority"),
        "createdAt": current.get("created_at"),
    }
    attachments = rows(
        db,
        "SELECT id, storage_path FROM request_attachments WHERE request_id = :requestId",
        {"requestId": request_id},
    )
    sprint_ids = rows(db, "SELECT id FROM sprints WHERE request_id = :requestId", {"requestId": request_id})
    for sprint in sprint_ids:
        delete_sprint(db, int(sprint["id"]))

    execute(
        db,
        "UPDATE requirement_reviews SET invalidated_by_revision_id = NULL WHERE request_id = :requestId",
        {"requestId": request_id},
    )
    execute(db, "DELETE FROM requirement_change_logs WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM requirement_reviews WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM requirement_artifact_snapshots WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM requirement_revisions WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM development_updates WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM test_results WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM uat_approvals WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM request_attachments WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM request_clarifications WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM request_comments WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM request_status_history WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM assignments WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM project_scopes WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM user_stories WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM notifications WHERE request_id = :requestId", {"requestId": request_id})
    execute(db, "DELETE FROM requests WHERE id = :requestId", {"requestId": request_id})

    deleted_at = datetime.now(timezone.utc).isoformat()
    audit(
        db,
        actor_user_id=actor_user_id,
        action="REQUEST_DELETED",
        entity_type="REQUEST",
        entity_id=request_id,
        old_value=snapshot,
        new_value={"deleted": True, "comment": comment, "deletedAt": deleted_at},
        request=request_context,
    )

    for attachment in attachments:
        Path(attachment["storage_path"]).unlink(missing_ok=True)


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
