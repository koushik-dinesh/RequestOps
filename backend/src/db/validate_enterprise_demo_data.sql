-- RequestOps compact demo validation.
-- Run after reset + cleanup + seed.

-- 1. Demo users by role.
SELECT
  'Demo users by role' AS check_name,
  r.code AS role_code,
  COUNT(*) AS actual_count,
  CASE r.code
    WHEN 'DEPARTMENT_HEAD' THEN 12
    WHEN 'EMPLOYEE' THEN 24
    ELSE 2
  END AS expected_count,
  CASE
    WHEN r.code = 'DEPARTMENT_HEAD' AND COUNT(*) = 12 THEN 'PASS'
    WHEN r.code = 'EMPLOYEE' AND COUNT(*) = 24 THEN 'PASS'
    WHEN r.code NOT IN ('DEPARTMENT_HEAD', 'EMPLOYEE') AND COUNT(*) = 2 THEN 'PASS'
    ELSE 'FAIL'
  END AS result
FROM users u
JOIN roles r ON r.id = u.role_id
WHERE u.employee_id REGEXP '^VIO-[0-9]{4}$'
GROUP BY r.code
ORDER BY FIELD(r.code, 'SYSTEM_ADMIN', 'DEPARTMENT_HEAD', 'IT_HEAD', 'PROJECT_MANAGER', 'DEVELOPER', 'QA', 'UAT_APPROVER', 'EMPLOYEE');

-- 2. Department staffing. Expected: every department has 1 HOD and 2 employees.
SELECT
  'Department staffing' AS check_name,
  d.code,
  d.name,
  SUM(CASE WHEN r.code = 'DEPARTMENT_HEAD' THEN 1 ELSE 0 END) AS department_heads,
  SUM(CASE WHEN r.code = 'EMPLOYEE' THEN 1 ELSE 0 END) AS employees,
  CASE
    WHEN SUM(CASE WHEN r.code = 'DEPARTMENT_HEAD' THEN 1 ELSE 0 END) = 1
     AND SUM(CASE WHEN r.code = 'EMPLOYEE' THEN 1 ELSE 0 END) = 2
     AND d.department_head_user_id IS NOT NULL
    THEN 'PASS'
    ELSE 'FAIL'
  END AS result
FROM departments d
LEFT JOIN users u ON u.department_id = d.id AND u.employee_id REGEXP '^VIO-[0-9]{4}$'
LEFT JOIN roles r ON r.id = u.role_id
WHERE d.code IN ('ADM','BD','ENG','FIN','HR','IT','OPS','PRC','PRD','QLT','SAM','SCM')
GROUP BY d.id, d.code, d.name, d.department_head_user_id
ORDER BY FIELD(d.code, 'ADM','BD','ENG','FIN','HR','IT','OPS','PRC','PRD','QLT','SAM','SCM');

-- 3. Identifier validation. Expected: all issue counts are 0.
SELECT 'Invalid demo employee IDs' AS check_name, COUNT(*) AS issue_count
FROM users
WHERE email LIKE '%.demo@requestops.local'
  AND employee_id NOT REGEXP '^VIO-[0-9]{4}$'
UNION ALL
SELECT 'Old employee ID prefixes still present', COUNT(*)
FROM users
WHERE employee_id REGEXP '^(ROD-|EMP-|DEV-|QA-|PM-)'
UNION ALL
SELECT 'Invalid demo request numbers', COUNT(*)
FROM requests
WHERE request_number NOT REGEXP '^RQ-[0-9]{3}$'
UNION ALL
SELECT 'Old demo request numbers still present', COUNT(*)
FROM requests
WHERE request_number LIKE 'REQ-2026-DEMO-%';

-- 4. Request status distribution. Expected: each listed status = 2, total = 24.
SELECT
  'Request status distribution' AS check_name,
  status,
  COUNT(*) AS actual_count,
  2 AS expected_count,
  CASE WHEN COUNT(*) = 2 THEN 'PASS' ELSE 'FAIL' END AS result
FROM requests
WHERE request_number LIKE 'RQ-%'
GROUP BY status
ORDER BY FIELD(
  status,
  'DEPARTMENT_APPROVAL_PENDING',
  'IT_REVIEW_PENDING',
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
  'IN_DEVELOPMENT',
  'QA_PENDING',
  'UAT_PENDING',
  'DEPLOYMENT_PENDING',
  'DEPLOYED'
);

SELECT
  'Total compact demo requests' AS metric,
  COUNT(*) AS actual_count,
  24 AS expected_count,
  CASE WHEN COUNT(*) = 24 THEN 'PASS' ELSE 'FAIL' END AS result
FROM requests
WHERE request_number LIKE 'RQ-%';

-- 5. Workflow module counts.
SELECT 'Assignments' AS metric, COUNT(*) AS actual_count, 14 AS expected_count, CASE WHEN COUNT(*) = 14 THEN 'PASS' ELSE 'FAIL' END AS result
FROM assignments a JOIN requests r ON r.id = a.request_id WHERE r.request_number LIKE 'RQ-%'
UNION ALL
SELECT 'Project scopes', COUNT(*), 20, CASE WHEN COUNT(*) = 20 THEN 'PASS' ELSE 'FAIL' END
FROM project_scopes ps JOIN requests r ON r.id = ps.request_id WHERE r.request_number LIKE 'RQ-%'
UNION ALL
SELECT 'User stories', COUNT(*), 32, CASE WHEN COUNT(*) = 32 THEN 'PASS' ELSE 'FAIL' END
FROM user_stories us JOIN requests r ON r.id = us.request_id WHERE r.request_number LIKE 'RQ-%'
UNION ALL
SELECT 'Sprints', COUNT(*), 12, CASE WHEN COUNT(*) = 12 THEN 'PASS' ELSE 'FAIL' END
FROM sprints s JOIN requests r ON r.id = s.request_id WHERE r.request_number LIKE 'RQ-%'
UNION ALL
SELECT 'Sprint tasks', COUNT(*), 36, CASE WHEN COUNT(*) = 36 THEN 'PASS' ELSE 'FAIL' END
FROM sprint_tasks st JOIN sprints s ON s.id = st.sprint_id JOIN requests r ON r.id = s.request_id WHERE r.request_number LIKE 'RQ-%'
UNION ALL
SELECT 'Development updates', COUNT(*), 10, CASE WHEN COUNT(*) = 10 THEN 'PASS' ELSE 'FAIL' END
FROM development_updates du JOIN requests r ON r.id = du.request_id WHERE r.request_number LIKE 'RQ-%'
UNION ALL
SELECT 'Test results', COUNT(*), 6, CASE WHEN COUNT(*) = 6 THEN 'PASS' ELSE 'FAIL' END
FROM test_results tr JOIN requests r ON r.id = tr.request_id WHERE r.request_number LIKE 'RQ-%'
UNION ALL
SELECT 'UAT approvals', COUNT(*), 4, CASE WHEN COUNT(*) = 4 THEN 'PASS' ELSE 'FAIL' END
FROM uat_approvals ua JOIN requests r ON r.id = ua.request_id WHERE r.request_number LIKE 'RQ-%'
UNION ALL
SELECT 'Notifications', COUNT(*), 24, CASE WHEN COUNT(*) = 24 THEN 'PASS' ELSE 'FAIL' END
FROM notifications n JOIN requests r ON r.id = n.request_id WHERE r.request_number LIKE 'RQ-%'
UNION ALL
SELECT 'Audit logs', COUNT(*), 24, CASE WHEN COUNT(*) = 24 THEN 'PASS' ELSE 'FAIL' END
FROM audit_logs al WHERE al.user_agent = 'RequestOps compact demo seed';

-- 6. Referential integrity spot checks. Expected: all issue_count values are 0.
SELECT 'Requests missing requester' AS check_name, COUNT(*) AS issue_count
FROM requests r LEFT JOIN users u ON u.id = r.requester_user_id
WHERE r.request_number LIKE 'RQ-%' AND u.id IS NULL
UNION ALL
SELECT 'Requests missing Department HOD', COUNT(*)
FROM requests r
WHERE r.request_number LIKE 'RQ-%' AND r.department_head_user_id IS NULL
UNION ALL
SELECT 'IT review and later missing IT HOD', COUNT(*)
FROM requests r
WHERE r.request_number LIKE 'RQ-%'
  AND r.status IN ('IT_REVIEW_PENDING','PM_ASSIGNED','SCOPE_REVIEW','USER_STORY_REVIEW','REQUIREMENTS_DEPARTMENT_REVIEW','REQUIREMENTS_PM_REVIEW','REQUIREMENTS_IT_REVIEW','REQUIREMENTS_CLARIFICATION_REQUESTED','REQUIREMENTS_APPROVED','DEVELOPER_ASSIGNED','SPRINT_PLANNING','SPRINT_CREATED','SPRINT_ACTIVE','IN_DEVELOPMENT','QA_PENDING','UAT_PENDING','DEPLOYMENT_PENDING','DEPLOYED')
  AND r.it_head_user_id IS NULL
UNION ALL
SELECT 'PM-owned requests missing PM', COUNT(*)
FROM requests r
WHERE r.request_number LIKE 'RQ-%'
  AND r.status IN ('PM_ASSIGNED','SCOPE_REVIEW','USER_STORY_REVIEW','REQUIREMENTS_DEPARTMENT_REVIEW','REQUIREMENTS_PM_REVIEW','REQUIREMENTS_IT_REVIEW','REQUIREMENTS_CLARIFICATION_REQUESTED','REQUIREMENTS_APPROVED','DEVELOPER_ASSIGNED','SPRINT_PLANNING','SPRINT_CREATED','SPRINT_ACTIVE','IN_DEVELOPMENT','QA_PENDING','UAT_PENDING','DEPLOYMENT_PENDING','DEPLOYED')
  AND r.project_manager_user_id IS NULL
UNION ALL
SELECT 'Sprint tasks missing developer', COUNT(*)
FROM sprint_tasks st
JOIN sprints s ON s.id = st.sprint_id
JOIN requests r ON r.id = s.request_id
WHERE r.request_number LIKE 'RQ-%' AND st.assigned_developer_user_id IS NULL;
