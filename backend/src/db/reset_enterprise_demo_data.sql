-- RequestOps enterprise demo reset script.
-- Purpose:
--   - Delete transactional/demo data.
--   - Preserve schema, migrations, roles, departments, admin accounts, and system configuration.
--   - Remove only previously generated non-admin users in the ROD-* demo namespace.
--
-- Run before:
--   backend/src/db/seed_enterprise_demo_data.sql

START TRANSACTION;

-- Clear child tables first to satisfy foreign-key dependencies.
DELETE FROM notifications;
DELETE FROM audit_logs;
DELETE FROM development_updates;
DELETE FROM request_attachments;
DELETE FROM request_comments;
DELETE FROM request_clarifications;
DELETE FROM request_status_history;
DELETE FROM test_results;
DELETE FROM uat_approvals;
DELETE FROM sprint_tasks;
DELETE FROM sprints;
DELETE FROM user_stories;
DELETE FROM project_scopes;
DELETE FROM assignments;
DELETE FROM requests;

-- Remove prior generated non-admin demo users only.
-- Admin accounts, roles, departments, registrations, and configuration are preserved.
DROP TEMPORARY TABLE IF EXISTS demo_users_to_delete;
CREATE TEMPORARY TABLE demo_users_to_delete AS
SELECT id
FROM users
WHERE employee_id REGEXP '^ROD-(HOD|ITH|PM|DEV|QA|UAT|EMP)-';

UPDATE departments
SET department_head_user_id = NULL
WHERE department_head_user_id IN (
  SELECT id FROM demo_users_to_delete
);

UPDATE users
SET reporting_manager_user_id = NULL
WHERE reporting_manager_user_id IN (
  SELECT id FROM demo_users_to_delete
);

-- Preserve registration records, but remove nullable FK references to generated demo users.
-- This prevents user deletion failures without modifying production users or deleting registrations.
UPDATE user_registrations
SET
  reviewed_by_user_id = CASE
    WHEN reviewed_by_user_id IN (SELECT id FROM demo_users_to_delete) THEN NULL
    ELSE reviewed_by_user_id
  END,
  created_user_id = CASE
    WHEN created_user_id IN (SELECT id FROM demo_users_to_delete) THEN NULL
    ELSE created_user_id
  END
WHERE reviewed_by_user_id IN (
  SELECT id FROM demo_users_to_delete
)
OR created_user_id IN (
  SELECT id FROM demo_users_to_delete
);

DELETE FROM users
WHERE id IN (
  SELECT id FROM demo_users_to_delete
);

DROP TEMPORARY TABLE IF EXISTS demo_users_to_delete;

-- Reset auto-increment values for clean demo IDs on transactional tables.
ALTER TABLE requests AUTO_INCREMENT = 1;
ALTER TABLE assignments AUTO_INCREMENT = 1;
ALTER TABLE request_status_history AUTO_INCREMENT = 1;
ALTER TABLE request_comments AUTO_INCREMENT = 1;
ALTER TABLE request_clarifications AUTO_INCREMENT = 1;
ALTER TABLE request_attachments AUTO_INCREMENT = 1;
ALTER TABLE development_updates AUTO_INCREMENT = 1;
ALTER TABLE test_results AUTO_INCREMENT = 1;
ALTER TABLE uat_approvals AUTO_INCREMENT = 1;
ALTER TABLE notifications AUTO_INCREMENT = 1;
ALTER TABLE audit_logs AUTO_INCREMENT = 1;
ALTER TABLE project_scopes AUTO_INCREMENT = 1;
ALTER TABLE user_stories AUTO_INCREMENT = 1;
ALTER TABLE sprints AUTO_INCREMENT = 1;
ALTER TABLE sprint_tasks AUTO_INCREMENT = 1;

COMMIT;
