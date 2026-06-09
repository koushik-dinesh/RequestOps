ALTER TABLE assignments
  MODIFY developer_user_id BIGINT UNSIGNED NULL;

ALTER TABLE assignments
  MODIFY qa_user_id BIGINT UNSIGNED NULL;

ALTER TABLE assignments
  ADD COLUMN qa_assigned_by_user_id BIGINT UNSIGNED NULL;

ALTER TABLE assignments
  ADD COLUMN qa_assigned_at TIMESTAMP NULL;

ALTER TABLE assignments
  ADD CONSTRAINT fk_assignments_qa_assigned_by FOREIGN KEY (qa_assigned_by_user_id) REFERENCES users(id);

CREATE INDEX idx_assignments_qa_active ON assignments (qa_user_id, is_active);
