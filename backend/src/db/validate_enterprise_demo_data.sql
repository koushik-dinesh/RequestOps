-- RequestOps enterprise demo validation and expected dashboard metrics.
-- Run after:
--   backend/src/db/reset_enterprise_demo_data.sql
--   backend/src/db/seed_enterprise_demo_data.sql

-- 1. User population validation.
SELECT
  'Demo users by role' AS check_name,
  r.code AS role_code,
  COUNT(*) AS actual_count
FROM users u
JOIN roles r ON r.id = u.role_id
WHERE u.employee_id REGEXP '^ROD-'
GROUP BY r.code
ORDER BY r.code;

-- Expected:
-- SYSTEM_ADMIN = 1
-- DEPARTMENT_HEAD = 2
-- IT_HEAD = 1
-- PROJECT_MANAGER = 3
-- DEVELOPER = 5
-- QA = 3
-- UAT_APPROVER = 2
-- EMPLOYEE = 15

-- 2. Department validation.
SELECT
  'Demo departments' AS check_name,
  code,
  name,
  status,
  department_head_user_id
FROM departments
WHERE code IN ('FIN', 'HR', 'OPS', 'SAL', 'IT')
ORDER BY code;

-- 3. Request status distribution.
SELECT
  'Request status distribution' AS check_name,
  status,
  COUNT(*) AS actual_count
FROM requests
WHERE request_number LIKE 'REQ-2026-DEMO-%'
GROUP BY status
ORDER BY FIELD(
  status,
  'DEPARTMENT_APPROVAL_PENDING',
  'IT_REVIEW_PENDING',
  'PM_ASSIGNED',
  'SCOPE_REVIEW',
  'USER_STORY_REVIEW',
  'DEVELOPER_ASSIGNED',
  'SPRINT_PLANNING',
  'IN_DEVELOPMENT',
  'QA_PENDING',
  'QA_FAILED',
  'UAT_PENDING',
  'UAT_APPROVED',
  'DEPLOYMENT_PENDING',
  'DEPLOYED'
);

-- Expected:
-- DEPARTMENT_APPROVAL_PENDING = 10
-- IT_REVIEW_PENDING = 5
-- PM_ASSIGNED = 5
-- SCOPE_REVIEW = 5
-- USER_STORY_REVIEW = 5
-- DEVELOPER_ASSIGNED = 5
-- SPRINT_PLANNING = 5
-- IN_DEVELOPMENT = 5
-- QA_PENDING = 5
-- QA_FAILED = 5
-- UAT_PENDING = 5
-- UAT_APPROVED = 5
-- DEPLOYMENT_PENDING = 5
-- DEPLOYED = 10
-- Total requests = 80

-- 4. Workflow module data validation.
SELECT 'Total demo requests' AS metric, COUNT(*) AS value FROM requests WHERE request_number LIKE 'REQ-2026-DEMO-%'
UNION ALL
SELECT 'Assignments', COUNT(*) FROM assignments a JOIN requests r ON r.id = a.request_id WHERE r.request_number LIKE 'REQ-2026-DEMO-%'
UNION ALL
SELECT 'Project scopes', COUNT(*) FROM project_scopes ps JOIN requests r ON r.id = ps.request_id WHERE r.request_number LIKE 'REQ-2026-DEMO-%'
UNION ALL
SELECT 'User stories', COUNT(*) FROM user_stories us JOIN requests r ON r.id = us.request_id WHERE r.request_number LIKE 'REQ-2026-DEMO-%'
UNION ALL
SELECT 'Sprints', COUNT(*) FROM sprints s JOIN requests r ON r.id = s.request_id WHERE r.request_number LIKE 'REQ-2026-DEMO-%'
UNION ALL
SELECT 'Sprint tasks', COUNT(*) FROM sprint_tasks st JOIN sprints s ON s.id = st.sprint_id JOIN requests r ON r.id = s.request_id WHERE r.request_number LIKE 'REQ-2026-DEMO-%'
UNION ALL
SELECT 'Development updates', COUNT(*) FROM development_updates du JOIN requests r ON r.id = du.request_id WHERE r.request_number LIKE 'REQ-2026-DEMO-%'
UNION ALL
SELECT 'Test results', COUNT(*) FROM test_results tr JOIN requests r ON r.id = tr.request_id WHERE r.request_number LIKE 'REQ-2026-DEMO-%'
UNION ALL
SELECT 'UAT approvals', COUNT(*) FROM uat_approvals ua JOIN requests r ON r.id = ua.request_id WHERE r.request_number LIKE 'REQ-2026-DEMO-%'
UNION ALL
SELECT 'Notifications', COUNT(*) FROM notifications n JOIN requests r ON r.id = n.request_id WHERE r.request_number LIKE 'REQ-2026-DEMO-%'
UNION ALL
SELECT 'Audit logs', COUNT(*) FROM audit_logs al WHERE al.user_agent = 'RequestOps demo seed';

-- Expected workflow module counts:
-- Assignments = 50
-- Project scopes = 65
-- User stories = 330
-- Sprints = 45
-- Sprint tasks = 225
-- Development updates = 40
-- Test results = 30
-- UAT approvals = 20

-- 5. Sprint status validation.
SELECT
  'Sprint status distribution' AS check_name,
  s.status,
  COUNT(*) AS actual_count
FROM sprints s
JOIN requests r ON r.id = s.request_id
WHERE r.request_number LIKE 'REQ-2026-DEMO-%'
GROUP BY s.status
ORDER BY s.status;

-- Expected:
-- PLANNED = 5
-- ACTIVE = 10
-- COMPLETED = 30

-- 6. Sprint task board validation.
SELECT
  'Sprint task status distribution' AS check_name,
  st.status,
  COUNT(*) AS actual_count
FROM sprint_tasks st
JOIN sprints s ON s.id = st.sprint_id
JOIN requests r ON r.id = s.request_id
WHERE r.request_number LIKE 'REQ-2026-DEMO-%'
GROUP BY st.status
ORDER BY st.status;

-- Expected:
-- TODO > 0
-- IN_PROGRESS > 0
-- BLOCKED > 0
-- DONE > 0

-- 7. ROI validation.
SELECT
  'ROI type distribution' AS check_name,
  roi_type,
  COUNT(*) AS request_count,
  SUM(CASE WHEN roi_type = 'TIME_SAVINGS' THEN roi_hours_saved_per_employee_per_month * roi_employees_benefited * 12 ELSE 0 END) AS annual_hours_saved,
  SUM(CASE WHEN roi_type = 'COST_SAVINGS' THEN roi_monthly_cost_savings_inr * 12 ELSE 0 END) AS annual_cost_savings_inr
FROM requests
WHERE request_number LIKE 'REQ-2026-DEMO-%'
GROUP BY roi_type;

-- Expected:
-- TIME_SAVINGS = 40 requests with positive annual_hours_saved
-- COST_SAVINGS = 40 requests with positive annual_cost_savings_inr

-- 8. Dashboard goal metrics.
SELECT 'Admin Dashboard - Total Requests' AS dashboard_metric, COUNT(*) AS value FROM requests WHERE request_number LIKE 'REQ-2026-DEMO-%'
UNION ALL
SELECT 'Admin Dashboard - Pending Department Approval', COUNT(*) FROM requests WHERE request_number LIKE 'REQ-2026-DEMO-%' AND status = 'DEPARTMENT_APPROVAL_PENDING'
UNION ALL
SELECT 'IT HOD Dashboard - Pending IT Review', COUNT(*) FROM requests WHERE request_number LIKE 'REQ-2026-DEMO-%' AND status = 'IT_REVIEW_PENDING'
UNION ALL
SELECT 'Project Manager Dashboard - PM Owned Requests', COUNT(*) FROM requests WHERE request_number LIKE 'REQ-2026-DEMO-%' AND project_manager_user_id IS NOT NULL
UNION ALL
SELECT 'Developer Dashboard - Active Developer Assignments', COUNT(*) FROM assignments a JOIN requests r ON r.id = a.request_id WHERE r.request_number LIKE 'REQ-2026-DEMO-%' AND a.is_active = TRUE
UNION ALL
SELECT 'QA Dashboard - QA Pending', COUNT(*) FROM requests WHERE request_number LIKE 'REQ-2026-DEMO-%' AND status = 'QA_PENDING'
UNION ALL
SELECT 'Requester Dashboard - Non Closed Requests', COUNT(*) FROM requests WHERE request_number LIKE 'REQ-2026-DEMO-%' AND status <> 'CLOSED'
UNION ALL
SELECT 'Department HOD Dashboard - Pending User Story Review', COUNT(*) FROM requests WHERE request_number LIKE 'REQ-2026-DEMO-%' AND status = 'USER_STORY_REVIEW';

-- 9. Referential integrity spot checks.
SELECT
  'Requests missing requester' AS check_name,
  COUNT(*) AS issue_count
FROM requests r
LEFT JOIN users u ON u.id = r.requester_user_id
WHERE r.request_number LIKE 'REQ-2026-DEMO-%' AND u.id IS NULL
UNION ALL
SELECT
  'Requests missing department HOD',
  COUNT(*)
FROM requests r
WHERE r.request_number LIKE 'REQ-2026-DEMO-%' AND r.department_head_user_id IS NULL
UNION ALL
SELECT
  'PM-owned requests missing PM',
  COUNT(*)
FROM requests r
WHERE r.request_number LIKE 'REQ-2026-DEMO-%' AND r.status IN ('PM_ASSIGNED','SCOPE_REVIEW','USER_STORY_REVIEW','DEVELOPER_ASSIGNED','SPRINT_PLANNING','IN_DEVELOPMENT','QA_PENDING','QA_FAILED','UAT_PENDING','UAT_APPROVED','DEPLOYMENT_PENDING','CLOSED') AND r.project_manager_user_id IS NULL
UNION ALL
SELECT
  'Sprint tasks missing developer',
  COUNT(*)
FROM sprint_tasks st
JOIN sprints s ON s.id = st.sprint_id
JOIN requests r ON r.id = s.request_id
WHERE r.request_number LIKE 'REQ-2026-DEMO-%' AND st.assigned_developer_user_id IS NULL;

-- Expected issue_count values above: 0.
