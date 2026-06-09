import hashlib
import json
from typing import Any

from sqlalchemy.orm import Session

from app.core.database import execute, one, rows
from app.utils.http import ApiError


REQUIREMENT_REVIEW_STATUSES = [
    "REQUIREMENTS_DEPARTMENT_REVIEW",
    "REQUIREMENTS_PM_REVIEW",
    "REQUIREMENTS_APPROVED",
]

REQUIREMENT_APPROVAL_ROLES = ["PROJECT_MANAGER", "DEPARTMENT_HEAD"]


def _json(value: Any) -> str:
    return json.dumps(value, default=str, sort_keys=True)


def _hash(value: Any) -> str:
    return hashlib.sha256(_json(value).encode("utf-8")).hexdigest()


def _scope_snapshot(scope: dict) -> dict:
    return {
        "id": scope["id"],
        "scopeTitle": scope.get("scope_title"),
        "scopeDescription": scope.get("scope_description"),
        "businessObjectives": scope.get("business_objectives"),
        "inScope": scope.get("in_scope"),
        "outOfScope": scope.get("out_of_scope"),
        "status": scope.get("status"),
        "updatedAt": scope.get("updated_at"),
    }


def _story_snapshot(story: dict) -> dict:
    return {
        "id": story["id"],
        "storyKey": story.get("story_key"),
        "title": story.get("title"),
        "description": story.get("description"),
        "acceptanceCriteria": story.get("acceptance_criteria"),
        "priority": story.get("priority"),
        "status": story.get("status"),
        "updatedAt": story.get("updated_at"),
    }


def get_latest_requirement_revision(db: Session, request_id: int) -> dict | None:
    return one(
        db,
        """
        SELECT rev.*, creator.full_name AS created_by_name, submitter.full_name AS submitted_by_name
        FROM requirement_revisions rev
        JOIN users creator ON creator.id = rev.created_by_user_id
        LEFT JOIN users submitter ON submitter.id = rev.submitted_by_user_id
        WHERE rev.request_id = :requestId
        ORDER BY rev.revision_number DESC, rev.id DESC
        LIMIT 1
        """,
        {"requestId": request_id},
    )


def get_requirement_revision_reviews(db: Session, revision_id: int) -> list[dict]:
    return rows(
        db,
        """
        SELECT review.*, reviewer.full_name AS reviewer_name
        FROM requirement_reviews review
        LEFT JOIN users reviewer ON reviewer.id = review.reviewer_user_id
        WHERE review.revision_id = :revisionId
        ORDER BY FIELD(review.reviewer_role_code, 'PROJECT_MANAGER', 'DEPARTMENT_HEAD', 'IT_HEAD')
        """,
        {"revisionId": revision_id},
    )


def get_requirement_review_package(db: Session, request_id: int) -> dict:
    revision = get_latest_requirement_revision(db, request_id)
    revisions = rows(
        db,
        """
        SELECT rev.*, creator.full_name AS created_by_name
        FROM requirement_revisions rev
        JOIN users creator ON creator.id = rev.created_by_user_id
        WHERE rev.request_id = :requestId
        ORDER BY rev.revision_number DESC, rev.id DESC
        """,
        {"requestId": request_id},
    )
    if not revision:
        return {
            "currentRevision": None,
            "reviews": [],
            "changeLog": [],
            "revisionHistory": revisions,
            "timeline": [],
        }

    return {
        "currentRevision": revision,
        "reviews": get_requirement_revision_reviews(db, revision["id"]),
        "changeLog": list_requirement_change_logs(db, request_id, revision["id"]),
        "revisionHistory": revisions,
        "timeline": list_requirement_timeline(db, request_id),
    }


def create_requirement_revision(
    db: Session,
    *,
    request_id: int,
    actor_user_id: int,
    status: str,
    pending_reviewer_role_code: str | None,
    change_summary: str,
    submitted: bool = True,
    seed_review_role_code: str | None = None,
    seed_review_user_id: int | None = None,
    seed_review_comments: str | None = None,
) -> dict:
    previous = get_latest_requirement_revision(db, request_id)
    revision_number = int(previous["revision_number"]) + 1 if previous else 1

    if previous:
        execute(
            db,
            """
            UPDATE requirement_revisions
            SET status = 'SUPERSEDED', superseded_at = CURRENT_TIMESTAMP, pending_reviewer_role_code = NULL
            WHERE id = :revisionId
            """,
            {"revisionId": previous["id"]},
        )
        execute(
            db,
            """
            UPDATE requirement_reviews
            SET is_current = FALSE,
                invalidated_at = CURRENT_TIMESTAMP,
                invalidated_by_revision_id = NULL
            WHERE revision_id = :revisionId AND is_current = TRUE
            """,
            {"revisionId": previous["id"]},
        )

    submitted_at_sql = "CURRENT_TIMESTAMP" if submitted else "NULL"
    result = execute(
        db,
        f"""
        INSERT INTO requirement_revisions
          (request_id, revision_number, status, pending_reviewer_role_code, created_by_user_id,
           submitted_by_user_id, submitted_at, change_summary)
        VALUES
          (:requestId, :revisionNumber, :status, :pendingReviewerRoleCode, :actorUserId,
           :submittedByUserId, {submitted_at_sql}, :changeSummary)
        """,
        {
            "requestId": request_id,
            "revisionNumber": revision_number,
            "status": status,
            "pendingReviewerRoleCode": pending_reviewer_role_code,
            "actorUserId": actor_user_id,
            "submittedByUserId": actor_user_id if submitted else None,
            "changeSummary": change_summary,
        },
    )
    revision_id = int(result.lastrowid)
    if previous:
        execute(
            db,
            """
            UPDATE requirement_reviews
            SET invalidated_by_revision_id = :newRevisionId
            WHERE revision_id = :previousRevisionId AND invalidated_at IS NOT NULL
            """,
            {"newRevisionId": revision_id, "previousRevisionId": previous["id"]},
        )
    for reviewer_role in REQUIREMENT_APPROVAL_ROLES:
        seed_decision = "APPROVED" if seed_review_role_code == reviewer_role else "PENDING"
        decided_at_sql = "CURRENT_TIMESTAMP" if seed_decision == "APPROVED" else "NULL"
        execute(
            db,
            f"""
            INSERT INTO requirement_reviews
              (revision_id, request_id, reviewer_role_code, reviewer_user_id, decision, comments, decided_at, is_current)
            VALUES
              (:revisionId, :requestId, :reviewerRoleCode, :reviewerUserId, :decision, :comments,
               {decided_at_sql}, TRUE)
            """,
            {
                "revisionId": revision_id,
                "requestId": request_id,
                "reviewerRoleCode": reviewer_role,
                "reviewerUserId": seed_review_user_id if seed_review_role_code == reviewer_role else None,
                "decision": seed_decision,
                "comments": seed_review_comments if seed_review_role_code == reviewer_role else None,
            },
        )

    snapshot_requirement_artifacts(db, request_id=request_id, revision_id=revision_id)
    record_requirement_change(
        db,
        request_id=request_id,
        revision_id=revision_id,
        actor_user_id=actor_user_id,
        artifact_type="REQUIREMENTS",
        artifact_id=None,
        change_type="SUBMITTED" if submitted else "CREATED",
        change_summary=change_summary,
    )
    return one(db, "SELECT * FROM requirement_revisions WHERE id = :revisionId", {"revisionId": revision_id})


def snapshot_requirement_artifacts(db: Session, *, request_id: int, revision_id: int) -> None:
    scopes = rows(db, "SELECT * FROM project_scopes WHERE request_id = :requestId ORDER BY id", {"requestId": request_id})
    stories = rows(db, "SELECT * FROM user_stories WHERE request_id = :requestId ORDER BY id", {"requestId": request_id})
    for scope in scopes:
        content = _scope_snapshot(scope)
        execute(
            db,
            """
            INSERT INTO requirement_artifact_snapshots
              (revision_id, request_id, artifact_type, artifact_id, content_json, content_hash)
            VALUES (:revisionId, :requestId, 'SCOPE', :artifactId, :contentJson, :contentHash)
            """,
            {
                "revisionId": revision_id,
                "requestId": request_id,
                "artifactId": scope["id"],
                "contentJson": _json(content),
                "contentHash": _hash(content),
            },
        )
    for story in stories:
        content = _story_snapshot(story)
        execute(
            db,
            """
            INSERT INTO requirement_artifact_snapshots
              (revision_id, request_id, artifact_type, artifact_id, content_json, content_hash)
            VALUES (:revisionId, :requestId, 'USER_STORY', :artifactId, :contentJson, :contentHash)
            """,
            {
                "revisionId": revision_id,
                "requestId": request_id,
                "artifactId": story["id"],
                "contentJson": _json(content),
                "contentHash": _hash(content),
            },
        )


def record_requirement_change(
    db: Session,
    *,
    request_id: int,
    revision_id: int,
    actor_user_id: int,
    artifact_type: str,
    artifact_id: int | None,
    change_type: str,
    field_name: str | None = None,
    old_value: Any = None,
    new_value: Any = None,
    change_summary: str | None = None,
) -> None:
    execute(
        db,
        """
        INSERT INTO requirement_change_logs
          (revision_id, request_id, artifact_type, artifact_id, changed_by_user_id, change_type,
           field_name, old_value, new_value, change_summary)
        VALUES
          (:revisionId, :requestId, :artifactType, :artifactId, :actorUserId, :changeType,
           :fieldName, :oldValue, :newValue, :changeSummary)
        """,
        {
            "revisionId": revision_id,
            "requestId": request_id,
            "artifactType": artifact_type,
            "artifactId": artifact_id,
            "actorUserId": actor_user_id,
            "changeType": change_type,
            "fieldName": field_name,
            "oldValue": None if old_value is None else str(old_value),
            "newValue": None if new_value is None else str(new_value),
            "changeSummary": change_summary,
        },
    )


def list_requirement_change_logs(db: Session, request_id: int, revision_id: int | None = None) -> list[dict]:
    filters = ["log.request_id = :requestId"]
    params = {"requestId": request_id}
    if revision_id:
        filters.append("log.revision_id = :revisionId")
        params["revisionId"] = revision_id
    return rows(
        db,
        f"""
        SELECT log.*, user.full_name AS changed_by_name
        FROM requirement_change_logs log
        JOIN users user ON user.id = log.changed_by_user_id
        WHERE {' AND '.join(filters)}
        ORDER BY log.created_at DESC, log.id DESC
        LIMIT 100
        """,
        params,
    )


def list_requirement_timeline(db: Session, request_id: int) -> list[dict]:
    return rows(
        db,
        """
        SELECT log.*, user.full_name AS changed_by_name, rev.revision_number
        FROM requirement_change_logs log
        JOIN users user ON user.id = log.changed_by_user_id
        JOIN requirement_revisions rev ON rev.id = log.revision_id
        WHERE log.request_id = :requestId
        ORDER BY log.created_at ASC, log.id ASC
        """,
        {"requestId": request_id},
    )


def update_requirement_revision_status(
    db: Session,
    *,
    revision_id: int,
    status: str,
    pending_reviewer_role_code: str | None,
) -> dict:
    approved_at_sql = "CURRENT_TIMESTAMP" if status == "APPROVED" else "approved_at"
    execute(
        db,
        f"""
        UPDATE requirement_revisions
        SET status = :status,
            pending_reviewer_role_code = :pendingReviewerRoleCode,
            approved_at = {approved_at_sql}
        WHERE id = :revisionId
        """,
        {"revisionId": revision_id, "status": status, "pendingReviewerRoleCode": pending_reviewer_role_code},
    )
    return one(db, "SELECT * FROM requirement_revisions WHERE id = :revisionId", {"revisionId": revision_id})


def record_requirement_review_decision(
    db: Session,
    *,
    revision_id: int,
    request_id: int,
    reviewer_role_code: str,
    reviewer_user_id: int,
    decision: str,
    comments: str | None,
) -> dict:
    execute(
        db,
        """
        INSERT INTO requirement_reviews
          (revision_id, request_id, reviewer_role_code, reviewer_user_id, decision, comments, decided_at, is_current)
        VALUES
          (:revisionId, :requestId, :reviewerRoleCode, :reviewerUserId, :decision, :comments, CURRENT_TIMESTAMP, TRUE)
        ON DUPLICATE KEY UPDATE
          reviewer_user_id = VALUES(reviewer_user_id),
          decision = VALUES(decision),
          comments = VALUES(comments),
          decided_at = VALUES(decided_at),
          is_current = TRUE
        """,
        {
            "revisionId": revision_id,
            "requestId": request_id,
            "reviewerUserId": reviewer_user_id,
            "decision": decision,
            "comments": comments,
            "reviewerRoleCode": reviewer_role_code,
        },
    )
    return one(
        db,
        """
        SELECT * FROM requirement_reviews
        WHERE revision_id = :revisionId AND reviewer_role_code = :reviewerRoleCode
        """,
        {"revisionId": revision_id, "reviewerRoleCode": reviewer_role_code},
    )


def latest_revision_has_final_approval(db: Session, request_id: int) -> bool:
    revision = get_latest_requirement_revision(db, request_id)
    if not revision or revision["status"] != "APPROVED":
        return False
    reviews = get_requirement_revision_reviews(db, revision["id"])
    decisions = {review["reviewer_role_code"]: review["decision"] for review in reviews if review["is_current"]}
    return decisions.get("DEPARTMENT_HEAD") == "APPROVED" and decisions.get("PROJECT_MANAGER") == "APPROVED"


def ensure_requirements_approved(db: Session, request_id: int) -> dict:
    revision = get_latest_requirement_revision(db, request_id)
    if not revision or not latest_revision_has_final_approval(db, request_id):
        raise ApiError(409, "Requirements must be approved by both Project Manager and Department HOD before this action.")
    return revision
