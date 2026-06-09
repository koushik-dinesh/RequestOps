ALTER TABLE sprints
  ADD COLUMN assigned_developer_user_id BIGINT UNSIGNED NULL AFTER status;

ALTER TABLE sprints
  ADD CONSTRAINT fk_sprints_assigned_developer FOREIGN KEY (assigned_developer_user_id) REFERENCES users(id);

ALTER TABLE sprints
  ADD INDEX idx_sprints_assigned_developer (assigned_developer_user_id);
