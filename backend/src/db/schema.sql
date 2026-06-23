CREATE TABLE IF NOT EXISTS roles (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description VARCHAR(255),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS departments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  description TEXT,
  department_head_user_id BIGINT UNSIGNED NULL,
  status ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_departments_status (status)
);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  employee_id VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  mobile_number VARCHAR(30),
  designation VARCHAR(150),
  department_id BIGINT UNSIGNED NULL,
  reporting_manager_user_id BIGINT UNSIGNED NULL,
  role_id BIGINT UNSIGNED NOT NULL,
  password_hash VARCHAR(255) NULL,
  auth_provider ENUM('LOCAL', 'MICROSOFT_ENTRA') NOT NULL DEFAULT 'LOCAL',
  external_auth_id VARCHAR(255) NULL,
  status ENUM('PENDING_APPROVAL', 'ACTIVE', 'INACTIVE', 'REJECTED') NOT NULL DEFAULT 'PENDING_APPROVAL',
  employment_status ENUM('ACTIVE', 'LEFT_ORGANIZATION') NOT NULL DEFAULT 'ACTIVE',
  exit_date DATE NULL,
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_users_department FOREIGN KEY (department_id) REFERENCES departments(id),
  CONSTRAINT fk_users_reporting_manager FOREIGN KEY (reporting_manager_user_id) REFERENCES users(id),
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles(id),
  INDEX idx_users_department (department_id),
  INDEX idx_users_reporting_manager (reporting_manager_user_id),
  INDEX idx_users_role (role_id),
  INDEX idx_users_status (status),
  INDEX idx_users_auth_provider (auth_provider, external_auth_id)
);

ALTER TABLE users
  ADD COLUMN reporting_manager_user_id BIGINT UNSIGNED NULL;

ALTER TABLE users
  ADD COLUMN employment_status ENUM('ACTIVE', 'LEFT_ORGANIZATION') NOT NULL DEFAULT 'ACTIVE';

ALTER TABLE users
  ADD COLUMN exit_date DATE NULL;

ALTER TABLE users
  ADD CONSTRAINT fk_users_reporting_manager FOREIGN KEY (reporting_manager_user_id) REFERENCES users(id);

ALTER TABLE users
  ADD INDEX idx_users_reporting_manager (reporting_manager_user_id);

ALTER TABLE departments
  ADD CONSTRAINT fk_departments_head
  FOREIGN KEY (department_head_user_id) REFERENCES users(id);

CREATE TABLE IF NOT EXISTS user_registrations (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  employee_id VARCHAR(50) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL,
  mobile_number VARCHAR(30),
  designation VARCHAR(150),
  requested_department_id BIGINT UNSIGNED NOT NULL,
  approved_department_id BIGINT UNSIGNED NULL,
  assigned_role_id BIGINT UNSIGNED NULL,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('PENDING_APPROVAL', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING_APPROVAL',
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at TIMESTAMP NULL,
  rejection_reason TEXT,
  created_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_reg_requested_department FOREIGN KEY (requested_department_id) REFERENCES departments(id),
  CONSTRAINT fk_reg_approved_department FOREIGN KEY (approved_department_id) REFERENCES departments(id),
  CONSTRAINT fk_reg_assigned_role FOREIGN KEY (assigned_role_id) REFERENCES roles(id),
  CONSTRAINT fk_reg_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_reg_created_user FOREIGN KEY (created_user_id) REFERENCES users(id),
  UNIQUE KEY uq_user_registrations_email_status (email, status),
  INDEX idx_registrations_status (status),
  INDEX idx_registrations_requested_department (requested_department_id)
);

CREATE TABLE IF NOT EXISTS requests (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_number VARCHAR(50) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  request_type ENUM('NEW_FEATURE', 'ENHANCEMENT', 'BUG_FIX', 'AUTOMATION', 'INTEGRATION', 'REPORT', 'OTHER') NOT NULL,
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  business_justification TEXT NOT NULL,
  description TEXT NOT NULL,
  expected_benefits TEXT,
  roi_type ENUM('TIME_SAVINGS', 'COST_SAVINGS') NULL,
  roi_hours_saved_per_employee_per_month DECIMAL(10,2) NULL,
  roi_users_impacted INT UNSIGNED NULL,
  roi_time_saved_per_task DECIMAL(10,2) NULL,
  roi_time_saved_unit ENUM('MINUTES', 'HOURS') NULL,
  roi_occurrences_per_month INT UNSIGNED NULL,
  roi_employees_benefited INT UNSIGNED NULL,
  roi_estimated_hourly_cost_inr DECIMAL(14,2) NULL,
  roi_estimated_revenue_impact_inr DECIMAL(14,2) NULL,
  roi_business_impact_category ENUM('PRODUCTIVITY_IMPROVEMENT', 'COST_REDUCTION', 'REVENUE_INCREASE', 'PROCESS_AUTOMATION', 'COMPLIANCE', 'QUALITY_IMPROVEMENT', 'CUSTOMER_SATISFACTION') NULL,
  roi_monthly_cost_savings_inr DECIMAL(14,2) NULL,
  status ENUM(
    'SUBMITTED',
    'DEPARTMENT_APPROVAL_PENDING',
    'CLARIFICATION_REQUESTED',
    'DEPARTMENT_REJECTED',
    'IT_REVIEW_PENDING',
    'IT_REJECTED',
    'DEFERRED',
    'ASSIGNMENT_PENDING',
    'ASSIGNED',
    'IN_DEVELOPMENT',
    'DEVELOPMENT_COMPLETE',
    'IN_TESTING',
    'TEST_FAILED',
    'UAT_PENDING',
    'UAT_REJECTED',
    'CLOSED',
    'PM_ASSIGNED',
    'SCOPE_REVIEW',
    'USER_STORY_REVIEW',
    'REQUIREMENTS_DEPARTMENT_REVIEW',
    'REQUIREMENTS_PM_REVIEW',
    'REQUIREMENTS_IT_REVIEW',
    'REQUIREMENTS_CLARIFICATION_REQUESTED',
    'REQUIREMENTS_APPROVED',
    'DEVELOPER_ASSIGNED',
    'SPRINT_PLANNING',
    'SPRINT_CREATED',
    'SPRINT_ACTIVE',
    'QA_PENDING',
    'QA_FAILED',
    'QA_PASSED',
    'UAT_FAILED',
    'UAT_APPROVED',
    'DEPLOYMENT_PENDING',
    'DEPLOYED',
    'READY_FOR_COMPLETION',
    'WITHDRAWN'
  ) NOT NULL DEFAULT 'SUBMITTED',
  requester_user_id BIGINT UNSIGNED NOT NULL,
  requester_department_id BIGINT UNSIGNED NOT NULL,
  department_head_user_id BIGINT UNSIGNED NULL,
  it_head_user_id BIGINT UNSIGNED NULL,
  project_manager_user_id BIGINT UNSIGNED NULL,
  current_assignee_user_id BIGINT UNSIGNED NULL,
  progress_percentage TINYINT UNSIGNED NOT NULL DEFAULT 0,
  feasibility_notes TEXT,
  complexity ENUM('LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH') NULL,
  estimated_effort VARCHAR(100) NULL,
  priority_confirmation ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_requests_requester FOREIGN KEY (requester_user_id) REFERENCES users(id),
  CONSTRAINT fk_requests_department FOREIGN KEY (requester_department_id) REFERENCES departments(id),
  CONSTRAINT fk_requests_department_head FOREIGN KEY (department_head_user_id) REFERENCES users(id),
  CONSTRAINT fk_requests_it_head FOREIGN KEY (it_head_user_id) REFERENCES users(id),
  CONSTRAINT fk_requests_project_manager FOREIGN KEY (project_manager_user_id) REFERENCES users(id),
  CONSTRAINT fk_requests_current_assignee FOREIGN KEY (current_assignee_user_id) REFERENCES users(id),
  INDEX idx_requests_status (status),
  INDEX idx_requests_requester (requester_user_id),
  INDEX idx_requests_department (requester_department_id),
  INDEX idx_requests_project_manager (project_manager_user_id),
  INDEX idx_requests_current_assignee (current_assignee_user_id),
  INDEX idx_requests_priority_status (priority, status),
  FULLTEXT INDEX ft_requests_search (request_number, title, description)
);

ALTER TABLE requests
  MODIFY status ENUM(
    'SUBMITTED',
    'DEPARTMENT_APPROVAL_PENDING',
    'CLARIFICATION_REQUESTED',
    'DEPARTMENT_REJECTED',
    'IT_REVIEW_PENDING',
    'IT_REJECTED',
    'DEFERRED',
    'ASSIGNMENT_PENDING',
    'ASSIGNED',
    'IN_DEVELOPMENT',
    'DEVELOPMENT_COMPLETE',
    'IN_TESTING',
    'TEST_FAILED',
    'UAT_PENDING',
    'UAT_REJECTED',
    'CLOSED',
    'PM_ASSIGNED',
    'SCOPE_REVIEW',
    'USER_STORY_REVIEW',
    'REQUIREMENTS_DEPARTMENT_REVIEW',
    'REQUIREMENTS_PM_REVIEW',
    'REQUIREMENTS_IT_REVIEW',
    'REQUIREMENTS_CLARIFICATION_REQUESTED',
    'REQUIREMENTS_APPROVED',
    'DEVELOPER_ASSIGNED',
    'SPRINT_PLANNING',
    'SPRINT_CREATED',
    'SPRINT_ACTIVE',
    'QA_PENDING',
    'QA_FAILED',
    'QA_PASSED',
    'UAT_FAILED',
    'UAT_APPROVED',
    'DEPLOYMENT_PENDING',
    'DEPLOYED',
    'READY_FOR_COMPLETION',
    'WITHDRAWN'
  ) NOT NULL DEFAULT 'SUBMITTED';

ALTER TABLE requests
  ADD COLUMN roi_type ENUM('TIME_SAVINGS', 'COST_SAVINGS') NULL;

ALTER TABLE requests
  ADD COLUMN roi_hours_saved_per_employee_per_month DECIMAL(10,2) NULL;

ALTER TABLE requests
  ADD COLUMN roi_users_impacted INT UNSIGNED NULL;

ALTER TABLE requests
  ADD COLUMN roi_time_saved_per_task DECIMAL(10,2) NULL;

ALTER TABLE requests
  ADD COLUMN roi_time_saved_unit ENUM('MINUTES', 'HOURS') NULL;

ALTER TABLE requests
  ADD COLUMN roi_occurrences_per_month INT UNSIGNED NULL;

ALTER TABLE requests
  ADD COLUMN roi_employees_benefited INT UNSIGNED NULL;

ALTER TABLE requests
  ADD COLUMN roi_estimated_hourly_cost_inr DECIMAL(14,2) NULL;

ALTER TABLE requests
  ADD COLUMN roi_estimated_revenue_impact_inr DECIMAL(14,2) NULL;

ALTER TABLE requests
  ADD COLUMN roi_business_impact_category ENUM('PRODUCTIVITY_IMPROVEMENT', 'COST_REDUCTION', 'REVENUE_INCREASE', 'PROCESS_AUTOMATION', 'COMPLIANCE', 'QUALITY_IMPROVEMENT', 'CUSTOMER_SATISFACTION') NULL;

ALTER TABLE requests
  ADD COLUMN roi_monthly_cost_savings_inr DECIMAL(14,2) NULL;

CREATE TABLE IF NOT EXISTS assignments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  developer_user_id BIGINT UNSIGNED NULL,
  qa_user_id BIGINT UNSIGNED NULL,
  assigned_by_user_id BIGINT UNSIGNED NOT NULL,
  qa_assigned_by_user_id BIGINT UNSIGNED NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  qa_assigned_at TIMESTAMP NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  CONSTRAINT fk_assignments_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_assignments_developer FOREIGN KEY (developer_user_id) REFERENCES users(id),
  CONSTRAINT fk_assignments_qa FOREIGN KEY (qa_user_id) REFERENCES users(id),
  CONSTRAINT fk_assignments_assigned_by FOREIGN KEY (assigned_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_assignments_qa_assigned_by FOREIGN KEY (qa_assigned_by_user_id) REFERENCES users(id),
  INDEX idx_assignments_request (request_id),
  INDEX idx_assignments_developer (developer_user_id),
  INDEX idx_assignments_qa (qa_user_id),
  INDEX idx_assignments_active (is_active)
);

CREATE TABLE IF NOT EXISTS request_comments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  comment_type ENUM('GENERAL', 'CLARIFICATION', 'APPROVAL', 'REJECTION', 'DEVELOPMENT', 'TESTING', 'UAT') NOT NULL DEFAULT 'GENERAL',
  comment_text TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_comments_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_comments_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_comments_request_created (request_id, created_at),
  INDEX idx_comments_user (user_id)
);

CREATE TABLE IF NOT EXISTS request_clarifications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  requested_by_user_id BIGINT UNSIGNED NOT NULL,
  responded_by_user_id BIGINT UNSIGNED NULL,
  stage_status VARCHAR(60) NOT NULL,
  return_status VARCHAR(60) NOT NULL,
  return_assignee_user_id BIGINT UNSIGNED NULL,
  reason_category ENUM(
    'MISSING_BUSINESS_JUSTIFICATION',
    'MISSING_REQUIREMENTS',
    'MISSING_BENEFITS',
    'MISSING_ATTACHMENT',
    'TECHNICAL_CLARIFICATION',
    'OTHER'
  ) NOT NULL,
  note TEXT NOT NULL,
  response_note TEXT NULL,
  status ENUM('OPEN', 'RESOLVED') NOT NULL DEFAULT 'OPEN',
  requested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP NULL,
  CONSTRAINT fk_clarifications_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_clarifications_requested_by FOREIGN KEY (requested_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_clarifications_responded_by FOREIGN KEY (responded_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_clarifications_return_assignee FOREIGN KEY (return_assignee_user_id) REFERENCES users(id),
  INDEX idx_clarifications_request_status (request_id, status),
  INDEX idx_clarifications_requested_by (requested_by_user_id)
);

CREATE TABLE IF NOT EXISTS request_attachments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  uploaded_by_user_id BIGINT UNSIGNED NOT NULL,
  comment_id BIGINT UNSIGNED NULL,
  file_name VARCHAR(255) NOT NULL,
  original_file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(150) NOT NULL,
  file_size_bytes BIGINT UNSIGNED NOT NULL,
  storage_path VARCHAR(500) NOT NULL,
  uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_attachments_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_attachments_user FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_attachments_comment FOREIGN KEY (comment_id) REFERENCES request_comments(id),
  INDEX idx_attachments_request (request_id),
  INDEX idx_attachments_uploaded_by (uploaded_by_user_id)
);

CREATE TABLE IF NOT EXISTS request_status_history (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  from_status VARCHAR(80) NULL,
  to_status VARCHAR(80) NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NOT NULL,
  comment TEXT,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_status_history_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_status_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id),
  INDEX idx_status_history_request_changed (request_id, changed_at),
  INDEX idx_status_history_to_status (to_status)
);

CREATE TABLE IF NOT EXISTS project_scopes (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  scope_title VARCHAR(255) NOT NULL,
  scope_description TEXT NOT NULL,
  business_objectives TEXT NULL,
  in_scope TEXT NULL,
  out_of_scope TEXT NULL,
  status ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REWORK_REQUIRED') NOT NULL DEFAULT 'DRAFT',
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  review_comments TEXT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_project_scopes_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_project_scopes_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_project_scopes_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id),
  INDEX idx_project_scopes_request_status (request_id, status),
  INDEX idx_project_scopes_created_by (created_by_user_id),
  INDEX idx_project_scopes_reviewed_by (reviewed_by_user_id)
);

CREATE TABLE IF NOT EXISTS user_stories (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  story_key VARCHAR(80) NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  acceptance_criteria TEXT NOT NULL,
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  status ENUM('DRAFT', 'SUBMITTED', 'APPROVED', 'REWORK_REQUIRED') NOT NULL DEFAULT 'DRAFT',
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  review_comments TEXT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_user_stories_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_user_stories_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_user_stories_reviewed_by FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_user_stories_request_story_key (request_id, story_key),
  INDEX idx_user_stories_request_status (request_id, status),
  INDEX idx_user_stories_created_by (created_by_user_id),
  INDEX idx_user_stories_reviewed_by (reviewed_by_user_id)
);

CREATE TABLE IF NOT EXISTS sprints (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  sprint_name VARCHAR(180) NOT NULL,
  goal TEXT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  estimated_hours DECIMAL(10,2) NULL,
  actual_hours DECIMAL(10,2) NULL,
  notes TEXT NULL,
  status ENUM('PLANNED', 'CREATED', 'ACTIVE', 'BLOCKED', 'COMPLETED', 'CANCELLED') NOT NULL DEFAULT 'PLANNED',
  assigned_developer_user_id BIGINT UNSIGNED NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sprints_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_sprints_assigned_developer FOREIGN KEY (assigned_developer_user_id) REFERENCES users(id),
  CONSTRAINT fk_sprints_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  INDEX idx_sprints_request_status (request_id, status),
  INDEX idx_sprints_assigned_developer (assigned_developer_user_id),
  INDEX idx_sprints_created_by (created_by_user_id),
  INDEX idx_sprints_dates (start_date, end_date)
);

CREATE TABLE IF NOT EXISTS sprint_tasks (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  sprint_id BIGINT UNSIGNED NOT NULL,
  user_story_id BIGINT UNSIGNED NULL,
  task_key VARCHAR(80) NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  assigned_developer_user_id BIGINT UNSIGNED NULL,
  estimate_hours DECIMAL(10,2) NULL,
  actual_hours DECIMAL(10,2) NULL,
  progress_percentage TINYINT UNSIGNED NOT NULL DEFAULT 0,
  blocked_reason TEXT NULL,
  due_date DATE NULL,
  priority ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  status ENUM('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED') NOT NULL DEFAULT 'TODO',
  created_by_user_id BIGINT UNSIGNED NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_sprint_tasks_sprint FOREIGN KEY (sprint_id) REFERENCES sprints(id),
  CONSTRAINT fk_sprint_tasks_user_story FOREIGN KEY (user_story_id) REFERENCES user_stories(id),
  CONSTRAINT fk_sprint_tasks_developer FOREIGN KEY (assigned_developer_user_id) REFERENCES users(id),
  CONSTRAINT fk_sprint_tasks_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_sprint_tasks_task_key (sprint_id, task_key),
  INDEX idx_sprint_tasks_sprint_status (sprint_id, status),
  INDEX idx_sprint_tasks_story (user_story_id),
  INDEX idx_sprint_tasks_developer (assigned_developer_user_id),
  INDEX idx_sprint_tasks_developer_status (assigned_developer_user_id, status)
);

CREATE TABLE IF NOT EXISTS sprint_task_status_history (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  from_status ENUM('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED') NULL,
  to_status ENUM('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE', 'CANCELLED') NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NOT NULL,
  comment TEXT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sprint_task_history_task FOREIGN KEY (task_id) REFERENCES sprint_tasks(id),
  CONSTRAINT fk_sprint_task_history_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id),
  INDEX idx_sprint_task_history_task (task_id, changed_at),
  INDEX idx_sprint_task_history_user (changed_by_user_id)
);

CREATE TABLE IF NOT EXISTS sprint_task_comments (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  task_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  comment_type ENUM('GENERAL', 'PROGRESS', 'BLOCKER', 'COMPLETION') NOT NULL DEFAULT 'GENERAL',
  comment_text TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sprint_task_comments_task FOREIGN KEY (task_id) REFERENCES sprint_tasks(id),
  CONSTRAINT fk_sprint_task_comments_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_sprint_task_comments_task (task_id, created_at),
  INDEX idx_sprint_task_comments_user (user_id)
);

CREATE TABLE IF NOT EXISTS requirement_revisions (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  revision_number INT UNSIGNED NOT NULL,
  status ENUM('DRAFT', 'UNDER_DEPARTMENT_REVIEW', 'UNDER_PM_REVIEW', 'UNDER_IT_REVIEW', 'CLARIFICATION_REQUESTED', 'APPROVED', 'SUPERSEDED') NOT NULL DEFAULT 'DRAFT',
  pending_reviewer_role_code ENUM('DEPARTMENT_HEAD', 'IT_HEAD', 'PROJECT_MANAGER') NULL,
  created_by_user_id BIGINT UNSIGNED NOT NULL,
  submitted_by_user_id BIGINT UNSIGNED NULL,
  submitted_at TIMESTAMP NULL,
  approved_at TIMESTAMP NULL,
  superseded_at TIMESTAMP NULL,
  change_summary TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_requirement_revisions_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_requirement_revisions_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id),
  CONSTRAINT fk_requirement_revisions_submitted_by FOREIGN KEY (submitted_by_user_id) REFERENCES users(id),
  UNIQUE KEY uq_requirement_revisions_request_number (request_id, revision_number),
  INDEX idx_requirement_revisions_request_status (request_id, status),
  INDEX idx_requirement_revisions_pending_role (pending_reviewer_role_code)
);

CREATE TABLE IF NOT EXISTS requirement_artifact_snapshots (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  revision_id BIGINT UNSIGNED NOT NULL,
  request_id BIGINT UNSIGNED NOT NULL,
  artifact_type ENUM('SCOPE', 'USER_STORY') NOT NULL,
  artifact_id BIGINT UNSIGNED NOT NULL,
  content_json JSON NOT NULL,
  content_hash CHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_requirement_snapshots_revision FOREIGN KEY (revision_id) REFERENCES requirement_revisions(id),
  CONSTRAINT fk_requirement_snapshots_request FOREIGN KEY (request_id) REFERENCES requests(id),
  UNIQUE KEY uq_requirement_snapshots_artifact (revision_id, artifact_type, artifact_id),
  INDEX idx_requirement_snapshots_request (request_id),
  INDEX idx_requirement_snapshots_hash (content_hash)
);

CREATE TABLE IF NOT EXISTS requirement_reviews (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  revision_id BIGINT UNSIGNED NOT NULL,
  request_id BIGINT UNSIGNED NOT NULL,
  reviewer_role_code ENUM('DEPARTMENT_HEAD', 'PROJECT_MANAGER', 'IT_HEAD') NOT NULL,
  reviewer_user_id BIGINT UNSIGNED NULL,
  decision ENUM('PENDING', 'APPROVED', 'CHANGES_REQUESTED') NOT NULL DEFAULT 'PENDING',
  comments TEXT NULL,
  decided_at TIMESTAMP NULL,
  invalidated_at TIMESTAMP NULL,
  invalidated_by_revision_id BIGINT UNSIGNED NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_requirement_reviews_revision FOREIGN KEY (revision_id) REFERENCES requirement_revisions(id),
  CONSTRAINT fk_requirement_reviews_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_requirement_reviews_reviewer FOREIGN KEY (reviewer_user_id) REFERENCES users(id),
  CONSTRAINT fk_requirement_reviews_invalidated_by FOREIGN KEY (invalidated_by_revision_id) REFERENCES requirement_revisions(id),
  UNIQUE KEY uq_requirement_reviews_revision_role (revision_id, reviewer_role_code),
  INDEX idx_requirement_reviews_request_current (request_id, is_current),
  INDEX idx_requirement_reviews_decision (decision)
);

CREATE TABLE IF NOT EXISTS requirement_change_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  revision_id BIGINT UNSIGNED NOT NULL,
  request_id BIGINT UNSIGNED NOT NULL,
  artifact_type ENUM('SCOPE', 'USER_STORY', 'REQUIREMENTS') NOT NULL,
  artifact_id BIGINT UNSIGNED NULL,
  changed_by_user_id BIGINT UNSIGNED NOT NULL,
  change_type ENUM('CREATED', 'UPDATED', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'CLARIFICATION_REQUESTED', 'CLARIFICATION_RESPONDED', 'INVALIDATED') NOT NULL,
  field_name VARCHAR(100) NULL,
  old_value TEXT NULL,
  new_value TEXT NULL,
  change_summary TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_requirement_changes_revision FOREIGN KEY (revision_id) REFERENCES requirement_revisions(id),
  CONSTRAINT fk_requirement_changes_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_requirement_changes_user FOREIGN KEY (changed_by_user_id) REFERENCES users(id),
  INDEX idx_requirement_changes_revision (revision_id, created_at),
  INDEX idx_requirement_changes_request (request_id, created_at),
  INDEX idx_requirement_changes_user (changed_by_user_id)
);

CREATE TABLE IF NOT EXISTS development_updates (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  developer_user_id BIGINT UNSIGNED NOT NULL,
  progress_percentage TINYINT UNSIGNED NOT NULL,
  update_notes TEXT NOT NULL,
  attachment_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_dev_updates_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_dev_updates_developer FOREIGN KEY (developer_user_id) REFERENCES users(id),
  CONSTRAINT fk_dev_updates_attachment FOREIGN KEY (attachment_id) REFERENCES request_attachments(id),
  INDEX idx_dev_updates_request_created (request_id, created_at),
  INDEX idx_dev_updates_developer (developer_user_id)
);

ALTER TABLE development_updates
  ADD COLUMN attachment_id BIGINT UNSIGNED NULL;

ALTER TABLE development_updates
  ADD CONSTRAINT fk_dev_updates_attachment FOREIGN KEY (attachment_id) REFERENCES request_attachments(id);

CREATE TABLE IF NOT EXISTS test_results (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  qa_user_id BIGINT UNSIGNED NOT NULL,
  result ENUM('PASS', 'FAIL', 'RETEST_REQUIRED') NOT NULL,
  test_summary TEXT NOT NULL,
  defects_found TEXT,
  tested_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_test_results_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_test_results_qa FOREIGN KEY (qa_user_id) REFERENCES users(id),
  INDEX idx_test_results_request_tested (request_id, tested_at),
  INDEX idx_test_results_qa (qa_user_id),
  INDEX idx_test_results_result (result)
);

CREATE TABLE IF NOT EXISTS uat_approvals (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  request_id BIGINT UNSIGNED NOT NULL,
  uat_approver_user_id BIGINT UNSIGNED NOT NULL,
  decision ENUM('APPROVED', 'REJECTED') NOT NULL,
  comments TEXT,
  decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_uat_request FOREIGN KEY (request_id) REFERENCES requests(id),
  CONSTRAINT fk_uat_approver FOREIGN KEY (uat_approver_user_id) REFERENCES users(id),
  INDEX idx_uat_request_decided (request_id, decided_at),
  INDEX idx_uat_approver (uat_approver_user_id),
  INDEX idx_uat_decision (decision)
);

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  recipient_user_id BIGINT UNSIGNED NOT NULL,
  request_id BIGINT UNSIGNED NULL,
  type VARCHAR(80) NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_user_id) REFERENCES users(id),
  CONSTRAINT fk_notifications_request FOREIGN KEY (request_id) REFERENCES requests(id),
  INDEX idx_notifications_recipient_read (recipient_user_id, is_read),
  INDEX idx_notifications_created (created_at),
  INDEX idx_notifications_request (request_id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  old_value JSON NULL,
  new_value JSON NULL,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id),
  INDEX idx_audit_actor_created (actor_user_id, created_at),
  INDEX idx_audit_entity (entity_type, entity_id),
  INDEX idx_audit_action_created (action, created_at)
);

CREATE TABLE IF NOT EXISTS daily_progress_report_config (
  id TINYINT UNSIGNED PRIMARY KEY DEFAULT 1,
  is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  report_time TIME NOT NULL DEFAULT '19:00:00',
  schedule_days JSON NULL,
  recipient_user_ids JSON NULL,
  stale_threshold_days INT UNSIGNED NOT NULL DEFAULT 3,
  overdue_threshold_days INT UNSIGNED NOT NULL DEFAULT 7,
  updated_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_daily_report_config_singleton CHECK (id = 1),
  CONSTRAINT fk_daily_report_config_updated_by FOREIGN KEY (updated_by_user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS daily_progress_reports (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  report_date DATE NOT NULL,
  generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  generated_by_user_id BIGINT UNSIGNED NULL,
  generation_source ENUM('SCHEDULED', 'MANUAL', 'RESEND') NOT NULL DEFAULT 'SCHEDULED',
  report_status ENUM('GENERATED', 'SENT', 'PARTIAL_FAILURE', 'FAILED') NOT NULL DEFAULT 'GENERATED',
  summary_json JSON NOT NULL,
  report_payload JSON NOT NULL,
  html_body LONGTEXT NOT NULL,
  recipients_json JSON NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_daily_reports_generated_by FOREIGN KEY (generated_by_user_id) REFERENCES users(id),
  INDEX idx_daily_reports_report_date (report_date),
  INDEX idx_daily_reports_generated_at (generated_at),
  INDEX idx_daily_reports_status (report_status)
);

CREATE TABLE IF NOT EXISTS daily_progress_report_deliveries (
  id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
  report_id BIGINT UNSIGNED NOT NULL,
  recipient_user_id BIGINT UNSIGNED NULL,
  recipient_name VARCHAR(150) NULL,
  recipient_email VARCHAR(255) NOT NULL,
  delivery_status ENUM('PENDING', 'SENT', 'FAILED') NOT NULL DEFAULT 'PENDING',
  error_message TEXT NULL,
  sent_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_daily_report_deliveries_report FOREIGN KEY (report_id) REFERENCES daily_progress_reports(id) ON DELETE CASCADE,
  CONSTRAINT fk_daily_report_deliveries_user FOREIGN KEY (recipient_user_id) REFERENCES users(id),
  INDEX idx_daily_report_deliveries_report (report_id),
  INDEX idx_daily_report_deliveries_status (delivery_status),
  INDEX idx_daily_report_deliveries_email (recipient_email)
);
