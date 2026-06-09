-- RequestOps development database reset.
-- Engine: MySQL
-- Database: request_ops
--
-- This script preserves schema objects and clears application data only.
-- It is intended for development use and can be run repeatedly.

USE `request_ops`;

SET @OLD_FOREIGN_KEY_CHECKS = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE `assignments`;
ALTER TABLE `assignments` AUTO_INCREMENT = 1;

TRUNCATE TABLE `audit_logs`;
ALTER TABLE `audit_logs` AUTO_INCREMENT = 1;

TRUNCATE TABLE `departments`;
ALTER TABLE `departments` AUTO_INCREMENT = 1;

TRUNCATE TABLE `development_updates`;
ALTER TABLE `development_updates` AUTO_INCREMENT = 1;

TRUNCATE TABLE `notifications`;
ALTER TABLE `notifications` AUTO_INCREMENT = 1;

TRUNCATE TABLE `project_scopes`;
ALTER TABLE `project_scopes` AUTO_INCREMENT = 1;

TRUNCATE TABLE `request_attachments`;
ALTER TABLE `request_attachments` AUTO_INCREMENT = 1;

TRUNCATE TABLE `request_clarifications`;
ALTER TABLE `request_clarifications` AUTO_INCREMENT = 1;

TRUNCATE TABLE `request_comments`;
ALTER TABLE `request_comments` AUTO_INCREMENT = 1;

TRUNCATE TABLE `request_status_history`;
ALTER TABLE `request_status_history` AUTO_INCREMENT = 1;

TRUNCATE TABLE `requests`;
ALTER TABLE `requests` AUTO_INCREMENT = 1;

TRUNCATE TABLE `requirement_artifact_snapshots`;
ALTER TABLE `requirement_artifact_snapshots` AUTO_INCREMENT = 1;

TRUNCATE TABLE `requirement_change_logs`;
ALTER TABLE `requirement_change_logs` AUTO_INCREMENT = 1;

TRUNCATE TABLE `requirement_reviews`;
ALTER TABLE `requirement_reviews` AUTO_INCREMENT = 1;

TRUNCATE TABLE `requirement_revisions`;
ALTER TABLE `requirement_revisions` AUTO_INCREMENT = 1;

TRUNCATE TABLE `roles`;
ALTER TABLE `roles` AUTO_INCREMENT = 1;

TRUNCATE TABLE `sprint_task_comments`;
ALTER TABLE `sprint_task_comments` AUTO_INCREMENT = 1;

TRUNCATE TABLE `sprint_task_status_history`;
ALTER TABLE `sprint_task_status_history` AUTO_INCREMENT = 1;

TRUNCATE TABLE `sprint_tasks`;
ALTER TABLE `sprint_tasks` AUTO_INCREMENT = 1;

TRUNCATE TABLE `sprints`;
ALTER TABLE `sprints` AUTO_INCREMENT = 1;

TRUNCATE TABLE `test_results`;
ALTER TABLE `test_results` AUTO_INCREMENT = 1;

TRUNCATE TABLE `uat_approvals`;
ALTER TABLE `uat_approvals` AUTO_INCREMENT = 1;

TRUNCATE TABLE `user_registrations`;
ALTER TABLE `user_registrations` AUTO_INCREMENT = 1;

TRUNCATE TABLE `user_stories`;
ALTER TABLE `user_stories` AUTO_INCREMENT = 1;

TRUNCATE TABLE `users`;
ALTER TABLE `users` AUTO_INCREMENT = 1;

SET FOREIGN_KEY_CHECKS = @OLD_FOREIGN_KEY_CHECKS;

SELECT
  'assignments' AS table_name,
  COUNT(*) AS record_count
FROM `assignments`
UNION ALL SELECT 'audit_logs', COUNT(*) FROM `audit_logs`
UNION ALL SELECT 'departments', COUNT(*) FROM `departments`
UNION ALL SELECT 'development_updates', COUNT(*) FROM `development_updates`
UNION ALL SELECT 'notifications', COUNT(*) FROM `notifications`
UNION ALL SELECT 'project_scopes', COUNT(*) FROM `project_scopes`
UNION ALL SELECT 'request_attachments', COUNT(*) FROM `request_attachments`
UNION ALL SELECT 'request_clarifications', COUNT(*) FROM `request_clarifications`
UNION ALL SELECT 'request_comments', COUNT(*) FROM `request_comments`
UNION ALL SELECT 'request_status_history', COUNT(*) FROM `request_status_history`
UNION ALL SELECT 'requests', COUNT(*) FROM `requests`
UNION ALL SELECT 'requirement_artifact_snapshots', COUNT(*) FROM `requirement_artifact_snapshots`
UNION ALL SELECT 'requirement_change_logs', COUNT(*) FROM `requirement_change_logs`
UNION ALL SELECT 'requirement_reviews', COUNT(*) FROM `requirement_reviews`
UNION ALL SELECT 'requirement_revisions', COUNT(*) FROM `requirement_revisions`
UNION ALL SELECT 'roles', COUNT(*) FROM `roles`
UNION ALL SELECT 'sprint_task_comments', COUNT(*) FROM `sprint_task_comments`
UNION ALL SELECT 'sprint_task_status_history', COUNT(*) FROM `sprint_task_status_history`
UNION ALL SELECT 'sprint_tasks', COUNT(*) FROM `sprint_tasks`
UNION ALL SELECT 'sprints', COUNT(*) FROM `sprints`
UNION ALL SELECT 'test_results', COUNT(*) FROM `test_results`
UNION ALL SELECT 'uat_approvals', COUNT(*) FROM `uat_approvals`
UNION ALL SELECT 'user_registrations', COUNT(*) FROM `user_registrations`
UNION ALL SELECT 'user_stories', COUNT(*) FROM `user_stories`
UNION ALL SELECT 'users', COUNT(*) FROM `users`
ORDER BY table_name;

SELECT
  table_name AS table_name,
  auto_increment AS next_auto_increment
FROM information_schema.tables
WHERE table_schema = DATABASE()
  AND table_name IN (
    'assignments',
    'audit_logs',
    'departments',
    'development_updates',
    'notifications',
    'project_scopes',
    'request_attachments',
    'request_clarifications',
    'request_comments',
    'request_status_history',
    'requests',
    'requirement_artifact_snapshots',
    'requirement_change_logs',
    'requirement_reviews',
    'requirement_revisions',
    'roles',
    'sprint_task_comments',
    'sprint_task_status_history',
    'sprint_tasks',
    'sprints',
    'test_results',
    'uat_approvals',
    'user_registrations',
    'user_stories',
    'users'
  )
ORDER BY table_name;
