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
          out_of_scope, assumptions, dependencies, status, created_by_user_id
        )
        VALUES (
          :requestId, :scopeTitle, :scopeDescription, :businessObjectives, :inScope,
          :outOfScope, :assumptions, :dependencies, :status, :createdByUserId
        )
        """,
        {
            "requestId": request_id,
            "createdByUserId": created_by_user_id,
            "scopeTitle": payload.get("scopeTitle"),
            "scopeDescription": payload.get("scopeDescription"),
            "businessObjectives": payload.get("businessObjectives"),
            "inScope": payload.get("inScope"),
            "outOfScope": payload.get("outOfScope"),
            "assumptions": payload.get("assumptions"),
            "dependencies": payload.get("dependencies"),
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
            out_of_scope = :outOfScope,
            assumptions = :assumptions,
            dependencies = :dependencies
        WHERE id = :scopeId
        """,
        {
            "scopeId": scope_id,
            "scopeTitle": payload.get("scopeTitle"),
            "scopeDescription": payload.get("scopeDescription"),
            "businessObjectives": payload.get("businessObjectives"),
            "inScope": payload.get("inScope"),
            "outOfScope": payload.get("outOfScope"),
            "assumptions": payload.get("assumptions"),
            "dependencies": payload.get("dependencies"),
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
          estimated_hours, actual_hours, status, created_by_user_id
        )
        VALUES (
          :requestId, :sprintName, :goal, :startDate, :endDate,
          :estimatedHours, :actualHours, :status, :createdByUserId
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
            "status": payload.get("status") or "PLANNED",
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
            actual_hours = :actualHours
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
        },
    )
    return get_sprint(db, sprint_id)


def update_sprint_status(db: Session, sprint_id: int, status: str) -> dict | None:
    timestamp_fragment = ""
    if status == "ACTIVE":
        timestamp_fragment = ", started_at = COALESCE(started_at, CURRENT_TIMESTAMP)"
    elif status == "COMPLETED":
        timestamp_fragment = ", completed_at = COALESCE(completed_at, CURRENT_TIMESTAMP)"
    execute(
        db,
        f"UPDATE sprints SET status = :status{timestamp_fragment} WHERE id = :sprintId",
        {"sprintId": sprint_id, "status": status},
    )
    return get_sprint(db, sprint_id)


def list_sprints(db: Session, request_id: int) -> list[dict]:
    return rows(
        db,
        """
        SELECT sprint.*, creator.full_name AS created_by_name
        FROM sprints sprint
        JOIN users creator ON creator.id = sprint.created_by_user_id
        WHERE sprint.request_id = :requestId
        ORDER BY sprint.created_at DESC, sprint.id DESC
        """,
        {"requestId": request_id},
    )


def create_sprint_task(db: Session, sprint_id: int, payload: dict) -> dict | None:
    result = execute(
        db,
        """
        INSERT INTO sprint_tasks (
          sprint_id, user_story_id, title, description, assigned_developer_user_id,
          estimate_hours, actual_hours, priority, status
        )
        VALUES (
          :sprintId, :userStoryId, :title, :description, :assignedDeveloperUserId,
          :estimateHours, :actualHours, :priority, :status
        )
        """,
        {
            "sprintId": sprint_id,
            "userStoryId": payload.get("userStoryId"),
            "title": payload.get("title"),
            "description": payload.get("description"),
            "assignedDeveloperUserId": payload.get("assignedDeveloperUserId"),
            "estimateHours": payload.get("estimateHours"),
            "actualHours": payload.get("actualHours"),
            "priority": payload.get("priority") or "MEDIUM",
            "status": payload.get("status") or "TODO",
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
            title = :title,
            description = :description,
            assigned_developer_user_id = :assignedDeveloperUserId,
            estimate_hours = :estimateHours,
            actual_hours = :actualHours,
            priority = :priority,
            status = :status
        WHERE id = :sprintTaskId
        """,
        {
            "sprintTaskId": sprint_task_id,
            "userStoryId": payload.get("userStoryId"),
            "title": payload.get("title"),
            "description": payload.get("description"),
            "assignedDeveloperUserId": payload.get("assignedDeveloperUserId"),
            "estimateHours": payload.get("estimateHours"),
            "actualHours": payload.get("actualHours"),
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


def update_sprint_task_status(db: Session, sprint_task_id: int, status: str, actual_hours: float | None = None) -> dict | None:
    execute(
        db,
        """
        UPDATE sprint_tasks
        SET status = :status,
            actual_hours = COALESCE(:actualHours, actual_hours)
        WHERE id = :sprintTaskId
        """,
        {"sprintTaskId": sprint_task_id, "status": status, "actualHours": actual_hours},
    )
    return get_sprint_task(db, sprint_task_id)


def list_sprint_tasks(db: Session, sprint_id: int) -> list[dict]:
    return rows(
        db,
        """
        SELECT task.*, story.story_key, story.title AS user_story_title, developer.full_name AS assigned_developer_name
        FROM sprint_tasks task
        LEFT JOIN user_stories story ON story.id = task.user_story_id
        LEFT JOIN users developer ON developer.id = task.assigned_developer_user_id
        WHERE task.sprint_id = :sprintId
        ORDER BY task.created_at DESC, task.id DESC
        """,
        {"sprintId": sprint_id},
    )
