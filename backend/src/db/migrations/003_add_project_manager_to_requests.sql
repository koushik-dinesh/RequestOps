ALTER TABLE requests
  ADD COLUMN project_manager_user_id BIGINT UNSIGNED NULL AFTER it_head_user_id,
  ADD CONSTRAINT fk_requests_project_manager
    FOREIGN KEY (project_manager_user_id) REFERENCES users(id),
  ADD INDEX idx_requests_project_manager (project_manager_user_id);
