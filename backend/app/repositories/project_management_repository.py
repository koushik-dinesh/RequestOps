from sqlalchemy.orm import Session

from app.core.database import execute, one, rows


def assign_project_manager(db: Session, request_id: int, project_manager_user_id: int) -> dict | None:
    execute(
        db,
        """
        UPDATE requests
        SET project_manager_user_id = :projectManagerUserId,
            current_assignee_user_id = :projectManagerUserId
        WHERE id = :requestId
        """,
        {"requestId": request_id, "projectManagerUserId": project_manager_user_id},
    )
    return one(db, "SELECT * FROM requests WHERE id = :requestId", {"requestId": request_id})


def create_project_scope(db: Session, request_id: int, created_by_user_id: int, payload: dict) -> dict | None:
    result = execute(
        db,
        """
        INSERT INTO project_scopes (
          request_id, scope_title, scope_description, business_objectives, in_scope,
          out_of_scope, status, created_by_user_id
        )
        VALUES (
          :requestId, :scopeTitle, :scopeDescription, :businessObjectives, :inScope,
          :outOfScope, :status, :createdByUserId
        )
        """,
        {
            "requestId": request_id,
            "createdByUserId": created_by_user_id,
            "scopeTitle": payload.get("scopeTitle"),
            "scopeDescription": payload.get("scopeDescription") or "",
            "businessObjectives": payload.get("businessObjectives"),
            "inScope": payload.get("inScope"),
            "outOfScope": payload.get("outOfScope"),
            "status": payload.get("status") or "DRAFT",
        },
    )
    return get_project_scope(db, int(result.lastrowid))


def get_project_scope(db: Session, scope_id: int) -> dict | None:
    return one(db, "SELECT * FROM project_scopes WHERE id = :scopeId", {"scopeId": scope_id})


def update_project_scope(db: Session, scope_id: int, payload: dict) -> dict | None:
    execute(
        db,
        """
        UPDATE project_scopes
        SET scope_title = :scopeTitle,
            scope_description = :scopeDescription,
            business_objectives = :businessObjectives,
            in_scope = :inScope,
            out_of_scope = :outOfScope
        WHERE id = :scopeId
        """,
        {
            "scopeId": scope_id,
            "scopeTitle": payload.get("scopeTitle"),
            "scopeDescription": payload.get("scopeDescription") or "",
            "businessObjectives": payload.get("businessObjectives"),
            "inScope": payload.get("inScope"),
            "outOfScope": payload.get("outOfScope"),
        },
    )
    return get_project_scope(db, scope_id)


def list_project_scopes(db: Session, request_id: int) -> list[dict]:
    return rows(
        db,
        """
        SELECT scope.*, creator.full_name AS created_by_name, reviewer.full_name AS reviewed_by_name
        FROM project_scopes scope
        JOIN users creator ON creator.id = scope.created_by_user_id
        LEFT JOIN users reviewer ON reviewer.id = scope.reviewed_by_user_id
        WHERE scope.request_id = :requestId
        ORDER BY scope.created_at DESC, scope.id DESC
        """,
        {"requestId": request_id},
    )


def review_project_scope(db: Session, scope_id: int, reviewed_by_user_id: int, status: str, review_comments: str | None) -> dict | None:
    execute(
        db,
        """
        UPDATE project_scopes
        SET status = :status,
            reviewed_by_user_id = :reviewedByUserId,
            review_comments = :reviewComments,
            reviewed_at = CURRENT_TIMESTAMP
        WHERE id = :scopeId
        """,
        {"scopeId": scope_id, "status": status, "reviewedByUserId": reviewed_by_user_id, "reviewComments": review_comments},
    )
    return get_project_scope(db, scope_id)


def create_user_story(db: Session, request_id: int, created_by_user_id: int, payload: dict) -> dict | None:
    result = execute(
        db,
        """
        INSERT INTO user_stories (
          request_id, story_key, title, description, acceptance_criteria,
          priority, status, created_by_user_id
        )
        VALUES (
          :requestId, :storyKey, :title, :description, :acceptanceCriteria,
          :priority, :status, :createdByUserId
        )
        """,
        {
            "requestId": request_id,
            "createdByUserId": created_by_user_id,
            "storyKey": payload.get("storyKey"),
            "title": payload.get("title"),
            "description": payload.get("description"),
            "acceptanceCriteria": payload.get("acceptanceCriteria"),
            "priority": payload.get("priority") or "MEDIUM",
            "status": payload.get("status") or "DRAFT",
        },
    )
    return get_user_story(db, int(result.lastrowid))


def get_user_story(db: Session, user_story_id: int) -> dict | None:
    return one(db, "SELECT * FROM user_stories WHERE id = :userStoryId", {"userStoryId": user_story_id})


def update_user_story(db: Session, user_story_id: int, payload: dict) -> dict | None:
    execute(
        db,
        """
        UPDATE user_stories
        SET story_key = :storyKey,
            title = :title,
            description = :description,
            acceptance_criteria = :acceptanceCriteria,
            priority = :priority
        WHERE id = :userStoryId
        """,
        {
            "userStoryId": user_story_id,
            "storyKey": payload.get("storyKey"),
            "title": payload.get("title"),
            "description": payload.get("description"),
            "acceptanceCriteria": payload.get("acceptanceCriteria"),
            "priority": payload.get("priority") or "MEDIUM",
        },
    )
    return get_user_story(db, user_story_id)


def list_user_stories(db: Session, request_id: int) -> list[dict]:
    return rows(
        db,
        """
        SELECT story.*, creator.full_name AS created_by_name, reviewer.full_name AS reviewed_by_name
        FROM user_stories story
        JOIN users creator ON creator.id = story.created_by_user_id
        LEFT JOIN users reviewer ON reviewer.id = story.reviewed_by_user_id
        WHERE story.request_id = :requestId
        ORDER BY story.created_at DESC, story.id DESC
        """,
        {"requestId": request_id},
    )


def review_user_story(db: Session, user_story_id: int, reviewed_by_user_id: int, status: str, review_comments: str | None) -> dict | None:
    execute(
        db,
        """
        UPDATE user_stories
        SET status = :status,
            reviewed_by_user_id = :reviewedByUserId,
            review_comments = :reviewComments,
            reviewed_at = CURRENT_TIMESTAMP
        WHERE id = :userStoryId
        """,
        {"userStoryId": user_story_id, "status": status, "reviewedByUserId": reviewed_by_user_id, "reviewComments": review_comments},
    )
    return get_user_story(db, user_story_id)


def create_sprint(db: Session, request_id: int, created_by_user_id: int, payload: dict) -> dict | None:
    result = execute(
        db,
        """
        INSERT INTO sprints (
          request_id, sprint_name, goal, start_date, end_date,
          estimated_hours, actual_hours, notes, status, assigned_developer_user_id, created_by_user_id
        )
        VALUES (
          :requestId, :sprintName, :goal, :startDate, :endDate,
          :estimatedHours, :actualHours, :notes, :status, :assignedDeveloperUserId, :createdByUserId
        )
        """,
        {
            "requestId": request_id,
            "createdByUserId": created_by_user_id,
            "sprintName": payload.get("sprintName"),
            "goal": payload.get("goal"),
            "startDate": payload.get("startDate"),
            "endDate": payload.get("endDate"),
            "estimatedHours": payload.get("estimatedHours"),
            "actualHours": payload.get("actualHours"),
            "notes": payload.get("notes"),
            "status": payload.get("status") or "PLANNED",
            "assignedDeveloperUserId": payload.get("assignedDeveloperUserId"),
        },
    )
    return get_sprint(db, int(result.lastrowid))


def get_sprint(db: Session, sprint_id: int) -> dict | None:
    return one(db, "SELECT * FROM sprints WHERE id = :sprintId", {"sprintId": sprint_id})


def update_sprint(db: Session, sprint_id: int, payload: dict) -> dict | None:
    execute(
        db,
        """
        UPDATE sprints
        SET sprint_name = :sprintName,
            goal = :goal,
            start_date = :startDate,
            end_date = :endDate,
            estimated_hours = :estimatedHours,
            actual_hours = :actualHours,
            notes = :notes,
            assigned_developer_user_id = :assignedDeveloperUserId
        WHERE id = :sprintId
        """,
        {
            "sprintId": sprint_id,
            "sprintName": payload.get("sprintName"),
            "goal": payload.get("goal"),
            "startDate": payload.get("startDate"),
            "endDate": payload.get("endDate"),
            "estimatedHours": payload.get("estimatedHours"),
            "actualHours": payload.get("actualHours"),
            "notes": payload.get("notes"),
            "assignedDeveloperUserId": payload.get("assignedDeveloperUserId"),
        },
    )
    return get_sprint(db, sprint_id)


def update_sprint_status(db: Session, sprint_id: int, status: str) -> dict | None:
    timestamp_fragment = ""
    if status == "ACTIVE":
        timestamp_fragment = ", started_at = COALESCE(started_at, CURRENT_TIMESTAMP), completed_at = NULL"
    elif status == "COMPLETED":
        timestamp_fragment = ", completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)"
    execute(
        db,
        f"UPDATE sprints SET status = :status{timestamp_fragment} WHERE id = :sprintId",
        {"sprintId": sprint_id, "status": status},
    )
    return get_sprint(db, sprint_id)


def next_sprint_task_key(db: Session, sprint_id: int) -> str:
    result = one(db, "SELECT COUNT(*) AS count FROM sprint_tasks WHERE sprint_id = :sprintId", {"sprintId": sprint_id})
    return f"TASK-{int(result['count'] or 0) + 1:03d}"


def list_sprints(db: Session, request_id: int) -> list[dict]:
    return rows(
        db,
        """
        SELECT sprint.*, creator.full_name AS created_by_name,
               developer.full_name AS assigned_developer_name
        FROM sprints sprint
        JOIN users creator ON creator.id = sprint.created_by_user_id
        LEFT JOIN users developer ON developer.id = sprint.assigned_developer_user_id
        WHERE sprint.request_id = :requestId
        ORDER BY sprint.created_at DESC, sprint.id DESC
        """,
        {"requestId": request_id},
    )


def delete_sprint(db: Session, sprint_id: int) -> None:
    execute(db, "DELETE FROM sprint_task_comments WHERE task_id IN (SELECT id FROM sprint_tasks WHERE sprint_id = :sprintId)", {"sprintId": sprint_id})
    execute(db, "DELETE FROM sprint_task_status_history WHERE task_id IN (SELECT id FROM sprint_tasks WHERE sprint_id = :sprintId)", {"sprintId": sprint_id})
    execute(db, "DELETE FROM sprint_tasks WHERE sprint_id = :sprintId", {"sprintId": sprint_id})
    execute(db, "DELETE FROM sprints WHERE id = :sprintId", {"sprintId": sprint_id})


def create_sprint_task(db: Session, sprint_id: int, payload: dict, created_by_user_id: int | None = None) -> dict | None:
    task_key = payload.get("taskKey") or next_sprint_task_key(db, sprint_id)
    result = execute(
        db,
        """
        INSERT INTO sprint_tasks (
          sprint_id, user_story_id, task_key, title, description, assigned_developer_user_id,
          estimate_hours, actual_hours, progress_percentage, blocked_reason, due_date,
          priority, status, created_by_user_id
        )
        VALUES (
          :sprintId, :userStoryId, :taskKey, :title, :description, :assignedDeveloperUserId,
          :estimateHours, :actualHours, :progressPercentage, :blockedReason, :dueDate,
          :priority, :status, :createdByUserId
        )
        """,
        {
            "sprintId": sprint_id,
            "userStoryId": payload.get("userStoryId"),
            "taskKey": task_key,
            "title": payload.get("title"),
            "description": payload.get("description"),
            "assignedDeveloperUserId": payload.get("assignedDeveloperUserId"),
            "estimateHours": payload.get("estimateHours"),
            "actualHours": payload.get("actualHours"),
            "progressPercentage": payload.get("progressPercentage") or 0,
            "blockedReason": payload.get("blockedReason"),
            "dueDate": payload.get("dueDate"),
            "priority": payload.get("priority") or "MEDIUM",
            "status": payload.get("status") or "TODO",
            "createdByUserId": created_by_user_id,
        },
    )
    return get_sprint_task(db, int(result.lastrowid))


def get_sprint_task(db: Session, sprint_task_id: int) -> dict | None:
    return one(db, "SELECT * FROM sprint_tasks WHERE id = :sprintTaskId", {"sprintTaskId": sprint_task_id})


def update_sprint_task(db: Session, sprint_task_id: int, payload: dict) -> dict | None:
    execute(
        db,
        """
        UPDATE sprint_tasks
        SET user_story_id = :userStoryId,
            task_key = :taskKey,
            title = :title,
            description = :description,
            assigned_developer_user_id = :assignedDeveloperUserId,
            estimate_hours = :estimateHours,
            actual_hours = :actualHours,
            progress_percentage = :progressPercentage,
            blocked_reason = :blockedReason,
            due_date = :dueDate,
            priority = :priority,
            status = :status
        WHERE id = :sprintTaskId
        """,
        {
            "sprintTaskId": sprint_task_id,
            "userStoryId": payload.get("userStoryId"),
            "taskKey": payload.get("taskKey"),
            "title": payload.get("title"),
            "description": payload.get("description"),
            "assignedDeveloperUserId": payload.get("assignedDeveloperUserId"),
            "estimateHours": payload.get("estimateHours"),
            "actualHours": payload.get("actualHours"),
            "progressPercentage": payload.get("progressPercentage") or 0,
            "blockedReason": payload.get("blockedReason"),
            "dueDate": payload.get("dueDate"),
            "priority": payload.get("priority") or "MEDIUM",
            "status": payload.get("status") or "TODO",
        },
    )
    return get_sprint_task(db, sprint_task_id)


def assign_sprint_task_developer(db: Session, sprint_task_id: int, developer_user_id: int) -> dict | None:
    execute(
        db,
        """
        UPDATE sprint_tasks
        SET assigned_developer_user_id = :developerUserId
        WHERE id = :sprintTaskId
        """,
        {"sprintTaskId": sprint_task_id, "developerUserId": developer_user_id},
    )
    return get_sprint_task(db, sprint_task_id)


def assign_sprint_developer(db: Session, sprint_id: int, developer_user_id: int | None) -> dict | None:
    execute(
        db,
        """
        UPDATE sprints
        SET assigned_developer_user_id = :developerUserId
        WHERE id = :sprintId
        """,
        {"sprintId": sprint_id, "developerUserId": developer_user_id},
    )
    if developer_user_id:
        execute(
            db,
            """
            UPDATE sprint_tasks
            SET assigned_developer_user_id = :developerUserId
            WHERE sprint_id = :sprintId
              AND status NOT IN ('DONE', 'CANCELLED')
            """,
            {"sprintId": sprint_id, "developerUserId": developer_user_id},
        )
    return get_sprint(db, sprint_id)


def update_sprint_task_status(db: Session, sprint_task_id: int, status: str, actual_hours: float | None = None, progress_percentage: int | None = None, blocked_reason: str | None = None) -> dict | None:
    timestamp_fragment = ""
    if status == "IN_PROGRESS":
        timestamp_fragment = ", started_at = COALESCE(started_at, CURRENT_TIMESTAMP), completed_at = NULL"
    elif status in ["DONE", "CANCELLED"]:
        timestamp_fragment = ", completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)"
    elif status in ["TODO", "BLOCKED"]:
        timestamp_fragment = ", completed_at = NULL"
    execute(
        db,
        f"""
        UPDATE sprint_tasks
        SET status = :status,
            actual_hours = COALESCE(:actualHours, actual_hours),
            progress_percentage = COALESCE(:progressPercentage, progress_percentage),
            blocked_reason = :blockedReason
            {timestamp_fragment}
        WHERE id = :sprintTaskId
        """,
        {"sprintTaskId": sprint_task_id, "status": status, "actualHours": actual_hours, "progressPercentage": progress_percentage, "blockedReason": blocked_reason},
    )
    return get_sprint_task(db, sprint_task_id)


def add_sprint_task_status_history(db: Session, task_id: int, from_status: str | None, to_status: str, changed_by_user_id: int, comment: str | None = None) -> None:
    execute(
        db,
        """
        INSERT INTO sprint_task_status_history (task_id, from_status, to_status, changed_by_user_id, comment)
        VALUES (:taskId, :fromStatus, :toStatus, :changedByUserId, :comment)
        """,
        {"taskId": task_id, "fromStatus": from_status, "toStatus": to_status, "changedByUserId": changed_by_user_id, "comment": comment},
    )


def add_sprint_task_comment(db: Session, task_id: int, user_id: int, comment_text: str | None, comment_type: str = "GENERAL") -> int | None:
    if not comment_text:
        return None
    result = execute(
        db,
        """
        INSERT INTO sprint_task_comments (task_id, user_id, comment_type, comment_text)
        VALUES (:taskId, :userId, :commentType, :commentText)
        """,
        {"taskId": task_id, "userId": user_id, "commentType": comment_type, "commentText": comment_text},
    )
    return result.lastrowid


def list_sprint_tasks(db: Session, sprint_id: int) -> list[dict]:
    return rows(
        db,
        """
        SELECT task.*, story.story_key, story.title AS user_story_title,
               sprint.sprint_name, sprint.status AS sprint_status, sprint.request_id,
               developer.full_name AS assigned_developer_name
        FROM sprint_tasks task
        JOIN sprints sprint ON sprint.id = task.sprint_id
        LEFT JOIN user_stories story ON story.id = task.user_story_id
        LEFT JOIN users developer ON developer.id = task.assigned_developer_user_id
        WHERE task.sprint_id = :sprintId
        ORDER BY task.created_at ASC, task.id ASC
        """,
        {"sprintId": sprint_id},
    )


def list_request_sprint_tasks(db: Session, request_id: int) -> list[dict]:
    return rows(
        db,
        """
        SELECT task.*, story.story_key, story.title AS user_story_title,
               sprint.sprint_name, sprint.status AS sprint_status, sprint.request_id,
               developer.full_name AS assigned_developer_name
        FROM sprint_tasks task
        JOIN sprints sprint ON sprint.id = task.sprint_id
        LEFT JOIN user_stories story ON story.id = task.user_story_id
        LEFT JOIN users developer ON developer.id = task.assigned_developer_user_id
        WHERE sprint.request_id = :requestId
        ORDER BY sprint.created_at DESC, task.created_at ASC, task.id ASC
        """,
        {"requestId": request_id},
    )
