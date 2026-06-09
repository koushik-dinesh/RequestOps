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
    'DEPLOYED'
  ) NOT NULL DEFAULT 'SUBMITTED';

ALTER TABLE sprints
  ADD COLUMN notes TEXT NULL;

ALTER TABLE sprint_tasks
  ADD COLUMN task_key VARCHAR(80) NULL;

ALTER TABLE sprint_tasks
  ADD COLUMN progress_percentage TINYINT UNSIGNED NOT NULL DEFAULT 0;

ALTER TABLE sprint_tasks
  ADD COLUMN blocked_reason TEXT NULL;

ALTER TABLE sprint_tasks
  ADD COLUMN due_date DATE NULL;

ALTER TABLE sprint_tasks
  ADD COLUMN created_by_user_id BIGINT UNSIGNED NULL;

ALTER TABLE sprint_tasks
  ADD COLUMN started_at TIMESTAMP NULL;

ALTER TABLE sprint_tasks
  ADD COLUMN completed_at TIMESTAMP NULL;

ALTER TABLE sprint_tasks
  ADD CONSTRAINT fk_sprint_tasks_created_by FOREIGN KEY (created_by_user_id) REFERENCES users(id);

ALTER TABLE sprint_tasks
  ADD UNIQUE KEY uq_sprint_tasks_task_key (sprint_id, task_key);

ALTER TABLE sprint_tasks
  ADD INDEX idx_sprint_tasks_developer_status (assigned_developer_user_id, status);

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
