-- RequestOps clean demo reset script.
-- Purpose:
--   - Clear all request/workflow transactional data.
--   - Remove generated demo users from old and new demo namespaces.
--   - Preserve schema, migrations, roles, departments, and non-demo admin/configuration records.
--
-- File storage cleanup:
--   Run `node backend/src/db/cleanup_demo_uploads.js` after this SQL script to remove files
--   from the configured upload directory. SQL can clear attachment metadata but cannot unlink files.

START TRANSACTION;

-- Delete request/workflow data first. These tables are intentionally fully cleared
-- because the clean demo dataset starts from a fresh request workspace.
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'notifications'), 'DELETE FROM notifications', 'SELECT ''Skipping missing table notifications''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'audit_logs'), 'DELETE FROM audit_logs', 'SELECT ''Skipping missing table audit_logs''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'development_updates'), 'DELETE FROM development_updates', 'SELECT ''Skipping missing table development_updates''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'request_attachments'), 'DELETE FROM request_attachments', 'SELECT ''Skipping missing table request_attachments''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'request_comments'), 'DELETE FROM request_comments', 'SELECT ''Skipping missing table request_comments''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'request_clarifications'), 'DELETE FROM request_clarifications', 'SELECT ''Skipping missing table request_clarifications''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'request_status_history'), 'DELETE FROM request_status_history', 'SELECT ''Skipping missing table request_status_history''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'test_results'), 'DELETE FROM test_results', 'SELECT ''Skipping missing table test_results''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'uat_approvals'), 'DELETE FROM uat_approvals', 'SELECT ''Skipping missing table uat_approvals''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'sprint_tasks'), 'DELETE FROM sprint_tasks', 'SELECT ''Skipping missing table sprint_tasks''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'sprints'), 'DELETE FROM sprints', 'SELECT ''Skipping missing table sprints''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'user_stories'), 'DELETE FROM user_stories', 'SELECT ''Skipping missing table user_stories''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_scopes'), 'DELETE FROM project_scopes', 'SELECT ''Skipping missing table project_scopes''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'assignments'), 'DELETE FROM assignments', 'SELECT ''Skipping missing table assignments''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'requests'), 'DELETE FROM requests', 'SELECT ''Skipping missing table requests''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- Remove generated demo users only. This catches both the old cluttered namespaces
-- and the new clean VIO namespace without touching real/admin configuration users.
DROP TEMPORARY TABLE IF EXISTS demo_users_to_delete;
CREATE TEMPORARY TABLE demo_users_to_delete AS
SELECT id
FROM users
WHERE employee_id REGEXP '^(VIO-[0-9]{4}|ROD-|EMP-|DEV-|QA-|PM-)'
   OR email LIKE '%.demo@requestops.local';

UPDATE departments d
JOIN demo_users_to_delete demo_user ON demo_user.id = d.department_head_user_id
SET d.department_head_user_id = NULL;

UPDATE users u
JOIN demo_users_to_delete demo_user ON demo_user.id = u.reporting_manager_user_id
SET u.reporting_manager_user_id = NULL;

UPDATE user_registrations ur
JOIN demo_users_to_delete demo_user ON demo_user.id = ur.reviewed_by_user_id
SET ur.reviewed_by_user_id = NULL;

UPDATE user_registrations ur
JOIN demo_users_to_delete demo_user ON demo_user.id = ur.created_user_id
SET ur.created_user_id = NULL;

DELETE ur
FROM user_registrations ur
WHERE ur.employee_id REGEXP '^(VIO-[0-9]{4}|ROD-|EMP-|DEV-|QA-|PM-)'
   OR ur.email LIKE '%.demo@requestops.local';

DELETE u
FROM users u
JOIN demo_users_to_delete demo_user ON demo_user.id = u.id;

DROP TEMPORARY TABLE IF EXISTS demo_users_to_delete;

-- Reset auto-increment values on cleared transactional tables for easier demos.
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'requests'), 'ALTER TABLE requests AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for requests''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'assignments'), 'ALTER TABLE assignments AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for assignments''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'request_status_history'), 'ALTER TABLE request_status_history AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for request_status_history''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'request_comments'), 'ALTER TABLE request_comments AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for request_comments''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'request_clarifications'), 'ALTER TABLE request_clarifications AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for request_clarifications''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'request_attachments'), 'ALTER TABLE request_attachments AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for request_attachments''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'development_updates'), 'ALTER TABLE development_updates AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for development_updates''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'test_results'), 'ALTER TABLE test_results AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for test_results''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'uat_approvals'), 'ALTER TABLE uat_approvals AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for uat_approvals''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'notifications'), 'ALTER TABLE notifications AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for notifications''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'audit_logs'), 'ALTER TABLE audit_logs AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for audit_logs''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'project_scopes'), 'ALTER TABLE project_scopes AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for project_scopes''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'user_stories'), 'ALTER TABLE user_stories AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for user_stories''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'sprints'), 'ALTER TABLE sprints AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for sprints''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
SET @sql = IF(EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = 'sprint_tasks'), 'ALTER TABLE sprint_tasks AUTO_INCREMENT = 1', 'SELECT ''Skipping auto-increment reset for sprint_tasks''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

COMMIT;
