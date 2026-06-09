from datetime import date, datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, Date, DateTime, DECIMAL, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.mysql import ENUM, JSON as MySQLJSON, TINYINT
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    department_head_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    status: Mapped[str] = mapped_column(ENUM("ACTIVE", "INACTIVE"), nullable=False, server_default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    employee_id: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    mobile_number: Mapped[Optional[str]] = mapped_column(String(30))
    designation: Mapped[Optional[str]] = mapped_column(String(150))
    department_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("departments.id"))
    reporting_manager_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    role_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("roles.id"), nullable=False)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    auth_provider: Mapped[str] = mapped_column(ENUM("LOCAL", "MICROSOFT_ENTRA"), nullable=False, server_default="LOCAL")
    external_auth_id: Mapped[Optional[str]] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(ENUM("PENDING_APPROVAL", "ACTIVE", "INACTIVE", "REJECTED"), nullable=False, server_default="PENDING_APPROVAL")
    employment_status: Mapped[str] = mapped_column(ENUM("ACTIVE", "LEFT_ORGANIZATION"), nullable=False, server_default="ACTIVE")
    exit_date: Mapped[Optional[date]] = mapped_column(Date)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)

    role = relationship("Role")
    department = relationship("Department", foreign_keys=[department_id])


class UserRegistration(Base):
    __tablename__ = "user_registrations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    employee_id: Mapped[str] = mapped_column(String(50), nullable=False)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    mobile_number: Mapped[Optional[str]] = mapped_column(String(30))
    designation: Mapped[Optional[str]] = mapped_column(String(150))
    requested_department_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("departments.id"), nullable=False)
    approved_department_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("departments.id"))
    assigned_role_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("roles.id"))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(ENUM("PENDING_APPROVAL", "APPROVED", "REJECTED"), nullable=False, server_default="PENDING_APPROVAL")
    reviewed_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text)
    created_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class Request(Base):
    __tablename__ = "requests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    request_type: Mapped[str] = mapped_column(String(50), nullable=False)
    priority: Mapped[str] = mapped_column(String(20), nullable=False, server_default="MEDIUM")
    business_justification: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    expected_benefits: Mapped[Optional[str]] = mapped_column(Text)
    roi_type: Mapped[Optional[str]] = mapped_column(ENUM("TIME_SAVINGS", "COST_SAVINGS"))
    roi_hours_saved_per_employee_per_month: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2))
    roi_users_impacted: Mapped[Optional[int]] = mapped_column(Integer)
    roi_time_saved_per_task: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2))
    roi_time_saved_unit: Mapped[Optional[str]] = mapped_column(ENUM("MINUTES", "HOURS"))
    roi_occurrences_per_month: Mapped[Optional[int]] = mapped_column(Integer)
    roi_employees_benefited: Mapped[Optional[int]] = mapped_column(Integer)
    roi_estimated_hourly_cost_inr: Mapped[Optional[float]] = mapped_column(DECIMAL(14, 2))
    roi_estimated_revenue_impact_inr: Mapped[Optional[float]] = mapped_column(DECIMAL(14, 2))
    roi_business_impact_category: Mapped[Optional[str]] = mapped_column(ENUM("PRODUCTIVITY_IMPROVEMENT", "COST_REDUCTION", "REVENUE_INCREASE", "PROCESS_AUTOMATION", "COMPLIANCE", "QUALITY_IMPROVEMENT", "CUSTOMER_SATISFACTION"))
    roi_monthly_cost_savings_inr: Mapped[Optional[float]] = mapped_column(DECIMAL(14, 2))
    status: Mapped[str] = mapped_column(String(80), nullable=False, server_default="SUBMITTED")
    requester_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    requester_department_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("departments.id"), nullable=False)
    department_head_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    it_head_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    project_manager_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    current_assignee_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    progress_percentage: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, server_default="0")
    feasibility_notes: Mapped[Optional[str]] = mapped_column(Text)
    complexity: Mapped[Optional[str]] = mapped_column(String(20))
    estimated_effort: Mapped[Optional[str]] = mapped_column(String(100))
    priority_confirmation: Mapped[Optional[str]] = mapped_column(String(20))
    submitted_at: Mapped[datetime] = mapped_column(DateTime)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class Assignment(Base):
    __tablename__ = "assignments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    developer_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    qa_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    assigned_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    qa_assigned_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    assigned_at: Mapped[datetime] = mapped_column(DateTime)
    qa_assigned_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("1"))
    notes: Mapped[Optional[str]] = mapped_column(Text)


class RequestComment(Base):
    __tablename__ = "request_comments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    comment_type: Mapped[str] = mapped_column(String(40), nullable=False, server_default="GENERAL")
    comment_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_internal: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    created_at: Mapped[datetime] = mapped_column(DateTime)


class RequestClarification(Base):
    __tablename__ = "request_clarifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    requested_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    responded_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    stage_status: Mapped[str] = mapped_column(String(60), nullable=False)
    return_status: Mapped[str] = mapped_column(String(60), nullable=False)
    return_assignee_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    reason_category: Mapped[str] = mapped_column(String(80), nullable=False)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    response_note: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="OPEN")
    requested_at: Mapped[datetime] = mapped_column(DateTime)
    responded_at: Mapped[Optional[datetime]] = mapped_column(DateTime)


class RequestAttachment(Base):
    __tablename__ = "request_attachments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    uploaded_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    comment_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("request_comments.id"))
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    original_file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(150), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime)


class RequestStatusHistory(Base):
    __tablename__ = "request_status_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    from_status: Mapped[Optional[str]] = mapped_column(String(80))
    to_status: Mapped[str] = mapped_column(String(80), nullable=False)
    changed_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text)
    changed_at: Mapped[datetime] = mapped_column(DateTime)


class ProjectScope(Base):
    __tablename__ = "project_scopes"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    scope_title: Mapped[str] = mapped_column(String(255), nullable=False)
    scope_description: Mapped[str] = mapped_column(Text, nullable=False)
    business_objectives: Mapped[Optional[str]] = mapped_column(Text)
    in_scope: Mapped[Optional[str]] = mapped_column(Text)
    out_of_scope: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(ENUM("DRAFT", "SUBMITTED", "APPROVED", "REWORK_REQUIRED"), nullable=False, server_default="DRAFT")
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    reviewed_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    review_comments: Mapped[Optional[str]] = mapped_column(Text)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class UserStory(Base):
    __tablename__ = "user_stories"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    story_key: Mapped[Optional[str]] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    acceptance_criteria: Mapped[str] = mapped_column(Text, nullable=False)
    priority: Mapped[str] = mapped_column(ENUM("LOW", "MEDIUM", "HIGH", "CRITICAL"), nullable=False, server_default="MEDIUM")
    status: Mapped[str] = mapped_column(ENUM("DRAFT", "SUBMITTED", "APPROVED", "REWORK_REQUIRED"), nullable=False, server_default="DRAFT")
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    reviewed_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    review_comments: Mapped[Optional[str]] = mapped_column(Text)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class Sprint(Base):
    __tablename__ = "sprints"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    sprint_name: Mapped[str] = mapped_column(String(180), nullable=False)
    goal: Mapped[Optional[str]] = mapped_column(Text)
    start_date: Mapped[Optional[date]] = mapped_column(Date)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    estimated_hours: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2))
    actual_hours: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    status: Mapped[str] = mapped_column(ENUM("PLANNED", "CREATED", "ACTIVE", "BLOCKED", "COMPLETED", "CANCELLED"), nullable=False, server_default="PLANNED")
    assigned_developer_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class SprintTask(Base):
    __tablename__ = "sprint_tasks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    sprint_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("sprints.id"), nullable=False)
    user_story_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("user_stories.id"))
    task_key: Mapped[Optional[str]] = mapped_column(String(80))
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    assigned_developer_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    estimate_hours: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2))
    actual_hours: Mapped[Optional[float]] = mapped_column(DECIMAL(10, 2))
    progress_percentage: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False, server_default="0")
    blocked_reason: Mapped[Optional[str]] = mapped_column(Text)
    due_date: Mapped[Optional[date]] = mapped_column(Date)
    priority: Mapped[str] = mapped_column(ENUM("LOW", "MEDIUM", "HIGH", "CRITICAL"), nullable=False, server_default="MEDIUM")
    status: Mapped[str] = mapped_column(ENUM("TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"), nullable=False, server_default="TODO")
    created_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class SprintTaskStatusHistory(Base):
    __tablename__ = "sprint_task_status_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("sprint_tasks.id"), nullable=False)
    from_status: Mapped[Optional[str]] = mapped_column(ENUM("TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"))
    to_status: Mapped[str] = mapped_column(ENUM("TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELLED"), nullable=False)
    changed_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text)
    changed_at: Mapped[datetime] = mapped_column(DateTime)


class SprintTaskComment(Base):
    __tablename__ = "sprint_task_comments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("sprint_tasks.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    comment_type: Mapped[str] = mapped_column(ENUM("GENERAL", "PROGRESS", "BLOCKER", "COMPLETION"), nullable=False, server_default="GENERAL")
    comment_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class RequirementRevision(Base):
    __tablename__ = "requirement_revisions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(ENUM("DRAFT", "UNDER_DEPARTMENT_REVIEW", "UNDER_PM_REVIEW", "UNDER_IT_REVIEW", "CLARIFICATION_REQUESTED", "APPROVED", "SUPERSEDED"), nullable=False, server_default="DRAFT")
    pending_reviewer_role_code: Mapped[Optional[str]] = mapped_column(ENUM("DEPARTMENT_HEAD", "IT_HEAD", "PROJECT_MANAGER"))
    created_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    submitted_by_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    submitted_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    approved_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    superseded_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    change_summary: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class RequirementArtifactSnapshot(Base):
    __tablename__ = "requirement_artifact_snapshots"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    revision_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requirement_revisions.id"), nullable=False)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    artifact_type: Mapped[str] = mapped_column(ENUM("SCOPE", "USER_STORY"), nullable=False)
    artifact_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    content_json: Mapped[dict] = mapped_column(MySQLJSON, nullable=False)
    content_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class RequirementReview(Base):
    __tablename__ = "requirement_reviews"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    revision_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requirement_revisions.id"), nullable=False)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    reviewer_role_code: Mapped[str] = mapped_column(ENUM("DEPARTMENT_HEAD", "PROJECT_MANAGER", "IT_HEAD"), nullable=False)
    reviewer_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    decision: Mapped[str] = mapped_column(ENUM("PENDING", "APPROVED", "CHANGES_REQUESTED"), nullable=False, server_default="PENDING")
    comments: Mapped[Optional[str]] = mapped_column(Text)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    invalidated_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    invalidated_by_revision_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("requirement_revisions.id"))
    is_current: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("1"))
    created_at: Mapped[datetime] = mapped_column(DateTime)
    updated_at: Mapped[datetime] = mapped_column(DateTime)


class RequirementChangeLog(Base):
    __tablename__ = "requirement_change_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    revision_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requirement_revisions.id"), nullable=False)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    artifact_type: Mapped[str] = mapped_column(ENUM("SCOPE", "USER_STORY", "REQUIREMENTS"), nullable=False)
    artifact_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    changed_by_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    change_type: Mapped[str] = mapped_column(ENUM("CREATED", "UPDATED", "SUBMITTED", "APPROVED", "CHANGES_REQUESTED", "CLARIFICATION_REQUESTED", "CLARIFICATION_RESPONDED", "INVALIDATED"), nullable=False)
    field_name: Mapped[Optional[str]] = mapped_column(String(100))
    old_value: Mapped[Optional[str]] = mapped_column(Text)
    new_value: Mapped[Optional[str]] = mapped_column(Text)
    change_summary: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class DevelopmentUpdate(Base):
    __tablename__ = "development_updates"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    developer_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    progress_percentage: Mapped[int] = mapped_column(TINYINT(unsigned=True), nullable=False)
    update_notes: Mapped[str] = mapped_column(Text, nullable=False)
    attachment_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("request_attachments.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime)


class TestResult(Base):
    __tablename__ = "test_results"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    qa_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    result: Mapped[str] = mapped_column(String(30), nullable=False)
    test_summary: Mapped[str] = mapped_column(Text, nullable=False)
    defects_found: Mapped[Optional[str]] = mapped_column(Text)
    tested_at: Mapped[datetime] = mapped_column(DateTime)


class UatApproval(Base):
    __tablename__ = "uat_approvals"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("requests.id"), nullable=False)
    uat_approver_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    decision: Mapped[str] = mapped_column(String(20), nullable=False)
    comments: Mapped[Optional[str]] = mapped_column(Text)
    decided_at: Mapped[datetime] = mapped_column(DateTime)


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    recipient_user_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("users.id"), nullable=False)
    request_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("requests.id"))
    type: Mapped[str] = mapped_column(String(80), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=text("0"))
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime)


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_user_id: Mapped[Optional[int]] = mapped_column(BigInteger, ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[Optional[int]] = mapped_column(BigInteger)
    old_value: Mapped[Optional[dict]] = mapped_column(MySQLJSON)
    new_value: Mapped[Optional[dict]] = mapped_column(MySQLJSON)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45))
    user_agent: Mapped[Optional[str]] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime)
