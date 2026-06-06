-- RequestOps fresh enterprise demo dataset.
-- Run order:
--   1. backend/src/db/reset_enterprise_demo_data.sql
--   2. backend/src/db/seed_enterprise_demo_data.sql
--   3. backend/src/db/validate_enterprise_demo_data.sql
--
-- Preserves schema, migrations, roles, existing departments, admin accounts, and system configuration.
-- Creates a complete workflow dataset in the ROD-* demo namespace.

START TRANSACTION;

SET @demo_password = '$2b$10$iJG8PLVADbjsnvOD8mjCVeq9YFh0nxPx0fVh5lYz7TXhwak10E2qu';

-- Ensure required roles exist and remain active.
INSERT INTO roles (code, name, description) VALUES
  ('SYSTEM_ADMIN', 'System Admin', 'Owns system configuration, users, departments, and audit visibility.'),
  ('EMPLOYEE', 'Employee', 'Creates and tracks software requests.'),
  ('DEPARTMENT_HEAD', 'Department Head', 'Approves or rejects requests for a department.'),
  ('IT_HEAD', 'IT Head', 'Reviews feasibility, prioritizes, and assigns work owners.'),
  ('PROJECT_MANAGER', 'Project Manager', 'Owns scope definition, user stories, sprint planning, developer assignment, and delivery tracking.'),
  ('DEVELOPER', 'Assigned Team Member', 'Works on assigned requests and records progress.'),
  ('QA', 'Reviewer', 'Performs review and validation before final approval.'),
  ('UAT_APPROVER', 'Final Approver', 'Performs final business approval before completion.')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  is_active = TRUE;

-- Ensure five business departments exist.
INSERT INTO departments (name, code, description, status) VALUES
  ('Finance', 'FIN', 'Finance, accounting, controls, and budget operations.', 'ACTIVE'),
  ('Human Resources', 'HR', 'People operations, hiring, payroll, and employee lifecycle.', 'ACTIVE'),
  ('Operations', 'OPS', 'Business operations, service delivery, and process excellence.', 'ACTIVE'),
  ('Sales', 'SAL', 'Sales operations, customer engagement, and revenue support.', 'ACTIVE'),
  ('IT', 'IT', 'Internal technology, software delivery, and platform operations.', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  status = VALUES(status);

-- Demo users: 1 admin, 2 HODs, 1 IT HOD, 3 PMs, 5 developers, 3 QA, 2 UAT users, 15 employees.
INSERT INTO users (employee_id, full_name, email, mobile_number, designation, department_id, role_id, password_hash, status, employment_status)
VALUES
  ('ROD-ADM-001', 'Nandita Rao', 'nandita.rao.demo@requestops.local', '+91-91000-00001', 'System Admin', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'SYSTEM_ADMIN'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-HOD-001', 'Arvind Rao', 'arvind.rao.demo@requestops.local', '+91-91000-00002', 'Department Head', (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-HOD-002', 'Rahul Menon', 'rahul.menon.demo@requestops.local', '+91-91000-00003', 'Department Head', (SELECT id FROM departments WHERE code = 'OPS'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-ITH-001', 'Meera Iyer', 'meera.iyer.demo@requestops.local', '+91-91000-00004', 'IT Head', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'IT_HEAD'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-PM-001', 'Karthik Menon', 'karthik.menon.demo@requestops.local', '+91-91000-00005', 'Project Manager', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'PROJECT_MANAGER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-PM-002', 'Anjali Nair', 'anjali.nair.demo@requestops.local', '+91-91000-00006', 'Project Manager', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'PROJECT_MANAGER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-PM-003', 'Siddharth Kapoor', 'siddharth.kapoor.demo@requestops.local', '+91-91000-00007', 'Project Manager', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'PROJECT_MANAGER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-DEV-001', 'Ananya Krishnan', 'ananya.krishnan.demo@requestops.local', '+91-91000-00008', 'Developer', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'DEVELOPER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-DEV-002', 'Vikram Reddy', 'vikram.reddy.demo@requestops.local', '+91-91000-00009', 'Developer', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'DEVELOPER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-DEV-003', 'Farhan Ali', 'farhan.ali.demo@requestops.local', '+91-91000-00010', 'Developer', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'DEVELOPER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-DEV-004', 'Sneha Patil', 'sneha.patil.demo@requestops.local', '+91-91000-00011', 'Developer', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'DEVELOPER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-DEV-005', 'Rohit Sharma', 'rohit.sharma.demo@requestops.local', '+91-91000-00012', 'Developer', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'DEVELOPER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-QA-001', 'Rahul Varma', 'rahul.varma.demo@requestops.local', '+91-91000-00013', 'QA', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'QA'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-QA-002', 'Divya Suresh', 'divya.suresh.demo@requestops.local', '+91-91000-00014', 'QA', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'QA'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-QA-003', 'Manoj Pillai', 'manoj.pillai.demo@requestops.local', '+91-91000-00015', 'QA', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'QA'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-UAT-001', 'Priya Sharma', 'priya.sharma.demo@requestops.local', '+91-91000-00016', 'Business User', (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM roles WHERE code = 'UAT_APPROVER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-UAT-002', 'Suresh Babu', 'suresh.babu.demo@requestops.local', '+91-91000-00017', 'Business User', (SELECT id FROM departments WHERE code = 'OPS'), (SELECT id FROM roles WHERE code = 'UAT_APPROVER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-001', 'Devika Nair', 'devika.nair.demo@requestops.local', '+91-91000-00018', 'Employee', (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-002', 'Amit Joshi', 'amit.joshi.demo@requestops.local', '+91-91000-00019', 'Employee', (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-003', 'Kavya Nandakumar', 'kavya.nandakumar.demo@requestops.local', '+91-91000-00020', 'Employee', (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-004', 'Neha Gupta', 'neha.gupta.demo@requestops.local', '+91-91000-00021', 'Employee', (SELECT id FROM departments WHERE code = 'HR'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-005', 'Vivek Narayan', 'vivek.narayan.demo@requestops.local', '+91-91000-00022', 'Employee', (SELECT id FROM departments WHERE code = 'HR'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-006', 'Ritu Chawla', 'ritu.chawla.demo@requestops.local', '+91-91000-00023', 'Employee', (SELECT id FROM departments WHERE code = 'HR'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-007', 'Balaji Krishnan', 'balaji.krishnan.demo@requestops.local', '+91-91000-00024', 'Employee', (SELECT id FROM departments WHERE code = 'OPS'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-008', 'Harini Subramanian', 'harini.subramanian.demo@requestops.local', '+91-91000-00025', 'Employee', (SELECT id FROM departments WHERE code = 'OPS'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-009', 'Nikhil Verma', 'nikhil.verma.demo@requestops.local', '+91-91000-00026', 'Employee', (SELECT id FROM departments WHERE code = 'OPS'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-010', 'Isha Malhotra', 'isha.malhotra.demo@requestops.local', '+91-91000-00027', 'Employee', (SELECT id FROM departments WHERE code = 'SAL'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-011', 'Rohan Mehta', 'rohan.mehta.demo@requestops.local', '+91-91000-00028', 'Employee', (SELECT id FROM departments WHERE code = 'SAL'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-012', 'Tanvi Desai', 'tanvi.desai.demo@requestops.local', '+91-91000-00029', 'Employee', (SELECT id FROM departments WHERE code = 'SAL'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-013', 'Arjun Bose', 'arjun.bose.demo@requestops.local', '+91-91000-00030', 'Employee', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-014', 'Pooja Kulkarni', 'pooja.kulkarni.demo@requestops.local', '+91-91000-00031', 'Employee', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('ROD-EMP-015', 'Sameer Khan', 'sameer.khan.demo@requestops.local', '+91-91000-00032', 'Employee', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  mobile_number = VALUES(mobile_number),
  designation = VALUES(designation),
  department_id = VALUES(department_id),
  role_id = VALUES(role_id),
  password_hash = VALUES(password_hash),
  status = 'ACTIVE',
  employment_status = 'ACTIVE',
  exit_date = NULL;

-- Variables for common actors.
SET @admin_id = (SELECT id FROM users WHERE employee_id = 'ROD-ADM-001');
SET @finance_hod_id = (SELECT id FROM users WHERE employee_id = 'ROD-HOD-001');
SET @operations_hod_id = (SELECT id FROM users WHERE employee_id = 'ROD-HOD-002');
SET @it_hod_id = (SELECT id FROM users WHERE employee_id = 'ROD-ITH-001');
SET @pm1_id = (SELECT id FROM users WHERE employee_id = 'ROD-PM-001');
SET @pm2_id = (SELECT id FROM users WHERE employee_id = 'ROD-PM-002');
SET @pm3_id = (SELECT id FROM users WHERE employee_id = 'ROD-PM-003');
SET @dev1_id = (SELECT id FROM users WHERE employee_id = 'ROD-DEV-001');
SET @dev2_id = (SELECT id FROM users WHERE employee_id = 'ROD-DEV-002');
SET @dev3_id = (SELECT id FROM users WHERE employee_id = 'ROD-DEV-003');
SET @dev4_id = (SELECT id FROM users WHERE employee_id = 'ROD-DEV-004');
SET @dev5_id = (SELECT id FROM users WHERE employee_id = 'ROD-DEV-005');
SET @qa1_id = (SELECT id FROM users WHERE employee_id = 'ROD-QA-001');
SET @qa2_id = (SELECT id FROM users WHERE employee_id = 'ROD-QA-002');
SET @qa3_id = (SELECT id FROM users WHERE employee_id = 'ROD-QA-003');
SET @uat1_id = (SELECT id FROM users WHERE employee_id = 'ROD-UAT-001');
SET @uat2_id = (SELECT id FROM users WHERE employee_id = 'ROD-UAT-002');

-- Department routing. Two HODs intentionally head the five demo departments.
UPDATE departments SET department_head_user_id = @finance_hod_id WHERE code IN ('FIN', 'HR', 'SAL');
UPDATE departments SET department_head_user_id = @operations_hod_id WHERE code IN ('OPS', 'IT');

UPDATE users
SET reporting_manager_user_id = CASE
  WHEN department_id IN (SELECT id FROM departments WHERE code IN ('FIN', 'HR', 'SAL')) THEN @finance_hod_id
  ELSE @operations_hod_id
END
WHERE employee_id REGEXP '^ROD-EMP-';

DROP TEMPORARY TABLE IF EXISTS demo_numbers;
CREATE TEMPORARY TABLE demo_numbers (n INT PRIMARY KEY);
INSERT INTO demo_numbers (n) VALUES
  (1),(2),(3),(4),(5),(6),(7),(8),(9),(10),
  (11),(12),(13),(14),(15),(16),(17),(18),(19),(20),
  (21),(22),(23),(24),(25),(26),(27),(28),(29),(30),
  (31),(32),(33),(34),(35),(36),(37),(38),(39),(40),
  (41),(42),(43),(44),(45),(46),(47),(48),(49),(50),
  (51),(52),(53),(54),(55),(56),(57),(58),(59),(60),
  (61),(62),(63),(64),(65),(66),(67),(68),(69),(70),
  (71),(72),(73),(74),(75),(76),(77),(78),(79),(80);

DROP TEMPORARY TABLE IF EXISTS demo_request_plan;
CREATE TEMPORARY TABLE demo_request_plan AS
SELECT
  n,
  CONCAT('REQ-2026-DEMO-', LPAD(n, 3, '0')) AS request_number,
  CASE
    WHEN n BETWEEN 1 AND 10 THEN 'DEPARTMENT_APPROVAL_PENDING'
    WHEN n BETWEEN 11 AND 15 THEN 'IT_REVIEW_PENDING'
    WHEN n BETWEEN 16 AND 20 THEN 'PM_ASSIGNED'
    WHEN n BETWEEN 21 AND 25 THEN 'SCOPE_REVIEW'
    WHEN n BETWEEN 26 AND 30 THEN 'USER_STORY_REVIEW'
    WHEN n BETWEEN 31 AND 35 THEN 'DEVELOPER_ASSIGNED'
    WHEN n BETWEEN 36 AND 40 THEN 'SPRINT_PLANNING'
    WHEN n BETWEEN 41 AND 45 THEN 'IN_DEVELOPMENT'
    WHEN n BETWEEN 46 AND 50 THEN 'QA_PENDING'
    WHEN n BETWEEN 51 AND 55 THEN 'QA_FAILED'
    WHEN n BETWEEN 56 AND 60 THEN 'UAT_PENDING'
    WHEN n BETWEEN 61 AND 65 THEN 'UAT_APPROVED'
    WHEN n BETWEEN 66 AND 70 THEN 'DEPLOYMENT_PENDING'
    ELSE 'DEPLOYED'
  END AS status,
  CASE MOD(n, 10)
    WHEN 1 THEN 'Employee Leave Automation'
    WHEN 2 THEN 'Vendor Management Portal'
    WHEN 3 THEN 'Purchase Approval Workflow'
    WHEN 4 THEN 'Asset Tracking System'
    WHEN 5 THEN 'Employee Exit Management'
    WHEN 6 THEN 'Budget Approval System'
    WHEN 7 THEN 'Customer Feedback Dashboard'
    WHEN 8 THEN 'Sales Incentive Calculator'
    WHEN 9 THEN 'IT Access Request Workflow'
    ELSE 'Operations Compliance Tracker'
  END AS base_title,
  CASE MOD(n, 7)
    WHEN 1 THEN 'AUTOMATION'
    WHEN 2 THEN 'NEW_FEATURE'
    WHEN 3 THEN 'ENHANCEMENT'
    WHEN 4 THEN 'INTEGRATION'
    WHEN 5 THEN 'REPORT'
    WHEN 6 THEN 'BUG_FIX'
    ELSE 'OTHER'
  END AS request_type,
  CASE MOD(n, 4)
    WHEN 0 THEN 'CRITICAL'
    WHEN 1 THEN 'HIGH'
    WHEN 2 THEN 'MEDIUM'
    ELSE 'LOW'
  END AS priority,
  CASE MOD(n - 1, 15) + 1
    WHEN 1 THEN 'ROD-EMP-001'
    WHEN 2 THEN 'ROD-EMP-002'
    WHEN 3 THEN 'ROD-EMP-003'
    WHEN 4 THEN 'ROD-EMP-004'
    WHEN 5 THEN 'ROD-EMP-005'
    WHEN 6 THEN 'ROD-EMP-006'
    WHEN 7 THEN 'ROD-EMP-007'
    WHEN 8 THEN 'ROD-EMP-008'
    WHEN 9 THEN 'ROD-EMP-009'
    WHEN 10 THEN 'ROD-EMP-010'
    WHEN 11 THEN 'ROD-EMP-011'
    WHEN 12 THEN 'ROD-EMP-012'
    WHEN 13 THEN 'ROD-EMP-013'
    WHEN 14 THEN 'ROD-EMP-014'
    ELSE 'ROD-EMP-015'
  END AS requester_employee_id,
  CASE MOD(n, 3)
    WHEN 0 THEN @pm1_id
    WHEN 1 THEN @pm2_id
    ELSE @pm3_id
  END AS pm_id,
  CASE MOD(n, 5)
    WHEN 0 THEN @dev1_id
    WHEN 1 THEN @dev2_id
    WHEN 2 THEN @dev3_id
    WHEN 3 THEN @dev4_id
    ELSE @dev5_id
  END AS developer_id,
  CASE MOD(n, 3)
    WHEN 0 THEN @qa1_id
    WHEN 1 THEN @qa2_id
    ELSE @qa3_id
  END AS qa_id,
  CASE MOD(n, 2)
    WHEN 0 THEN @uat1_id
    ELSE @uat2_id
  END AS uat_id,
  CASE WHEN MOD(n, 2) = 0 THEN 'TIME_SAVINGS' ELSE 'COST_SAVINGS' END AS roi_type,
  CAST(2 + MOD(n, 7) AS DECIMAL(10,2)) AS roi_hours,
  12 + MOD(n, 38) AS roi_employees,
  CAST((25000 + (MOD(n, 12) * 7500)) AS DECIMAL(14,2)) AS roi_monthly_cost
FROM demo_numbers;

-- Insert 80 requests across all requested workflow buckets.
INSERT INTO requests (
  request_number, title, request_type, priority, business_justification, description, expected_benefits,
  roi_type, roi_hours_saved_per_employee_per_month, roi_employees_benefited, roi_monthly_cost_savings_inr,
  status, requester_user_id, requester_department_id, department_head_user_id, it_head_user_id,
  project_manager_user_id, current_assignee_user_id, progress_percentage, feasibility_notes, complexity,
  estimated_effort, priority_confirmation, closed_at
)
SELECT
  p.request_number,
  CONCAT(p.base_title, ' - ', LPAD(p.n, 3, '0')),
  p.request_type,
  p.priority,
  CONCAT('The ', p.base_title, ' initiative reduces manual work, approval delays, and reporting gaps for enterprise teams.'),
  CONCAT('Implement ', p.base_title, ' with workflow tracking, role-based approvals, audit visibility, notifications, and management reporting.'),
  'Improves productivity, governance, SLA visibility, compliance tracking, and business accountability.',
  p.roi_type,
  CASE WHEN p.roi_type = 'TIME_SAVINGS' THEN p.roi_hours ELSE NULL END,
  CASE WHEN p.roi_type = 'TIME_SAVINGS' THEN p.roi_employees ELSE NULL END,
  CASE WHEN p.roi_type = 'COST_SAVINGS' THEN p.roi_monthly_cost ELSE NULL END,
  p.status,
  requester.id,
  requester.department_id,
  dept.department_head_user_id,
  CASE WHEN p.n >= 11 THEN @it_hod_id ELSE NULL END,
  CASE WHEN p.n >= 16 THEN p.pm_id ELSE NULL END,
  CASE
    WHEN p.status = 'DEPARTMENT_APPROVAL_PENDING' THEN dept.department_head_user_id
    WHEN p.status = 'IT_REVIEW_PENDING' THEN @it_hod_id
    WHEN p.status IN ('PM_ASSIGNED', 'SPRINT_PLANNING', 'DEPLOYMENT_PENDING', 'DEPLOYED') THEN p.pm_id
    WHEN p.status = 'SCOPE_REVIEW' THEN @it_hod_id
    WHEN p.status = 'USER_STORY_REVIEW' THEN dept.department_head_user_id
    WHEN p.status IN ('DEVELOPER_ASSIGNED', 'IN_DEVELOPMENT', 'QA_FAILED') THEN p.developer_id
    WHEN p.status = 'QA_PENDING' THEN p.qa_id
    WHEN p.status IN ('UAT_PENDING', 'UAT_APPROVED') THEN p.uat_id
    ELSE NULL
  END,
  CASE
    WHEN p.status IN ('DEPARTMENT_APPROVAL_PENDING', 'IT_REVIEW_PENDING', 'PM_ASSIGNED', 'SCOPE_REVIEW', 'USER_STORY_REVIEW', 'DEVELOPER_ASSIGNED', 'SPRINT_PLANNING') THEN 0
    WHEN p.status = 'IN_DEVELOPMENT' THEN 35 + MOD(p.n, 55)
    ELSE 100
  END,
  CASE WHEN p.n >= 11 THEN 'Feasible using existing RequestOps platform services and internal APIs.' ELSE NULL END,
  CASE MOD(p.n, 4) WHEN 0 THEN 'VERY_HIGH' WHEN 1 THEN 'HIGH' WHEN 2 THEN 'MEDIUM' ELSE 'LOW' END,
  CASE MOD(p.n, 4) WHEN 0 THEN '4 sprints' WHEN 1 THEN '3 sprints' WHEN 2 THEN '2 sprints' ELSE '1 sprint' END,
  p.priority,
  NULL
FROM demo_request_plan p
JOIN users requester ON requester.employee_id = p.requester_employee_id
JOIN departments dept ON dept.id = requester.department_id;

-- Active and historical assignments for developer-owned stages.
INSERT INTO assignments (request_id, developer_user_id, qa_user_id, assigned_by_user_id, is_active, notes)
SELECT r.id, p.developer_id, p.qa_id, p.pm_id, TRUE,
       CONCAT('Demo assignment for ', p.base_title, '.')
FROM demo_request_plan p
JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 31;

-- Status history showing each request's path to its current stage.
INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, NULL, 'SUBMITTED', requester.id, 'Request submitted.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number JOIN users requester ON requester.employee_id = p.requester_employee_id;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'SUBMITTED', 'DEPARTMENT_APPROVAL_PENDING', requester.id, 'Routed to Department HOD.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number JOIN users requester ON requester.employee_id = p.requester_employee_id
WHERE p.n >= 1;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'DEPARTMENT_APPROVAL_PENDING', 'IT_REVIEW_PENDING', dept.department_head_user_id, 'Department HOD approved.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number JOIN users requester ON requester.employee_id = p.requester_employee_id JOIN departments dept ON dept.id = requester.department_id
WHERE p.n >= 11;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'IT_REVIEW_PENDING', 'ASSIGNMENT_PENDING', @it_hod_id, 'IT HOD approved. Project Manager assignment required.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 16;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'ASSIGNMENT_PENDING', 'PM_ASSIGNED', @it_hod_id, 'Project Manager assigned.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 16;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'PM_ASSIGNED', 'SCOPE_REVIEW', p.pm_id, 'Scope submitted for IT HOD review.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 21;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'SCOPE_REVIEW', 'PM_ASSIGNED', @it_hod_id, 'Scope approved and returned to PM for user stories.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 26;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'PM_ASSIGNED', 'USER_STORY_REVIEW', p.pm_id, 'User stories submitted for Department HOD review.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 26;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'USER_STORY_REVIEW', 'DEVELOPER_ASSIGNED', p.pm_id, 'Developer and QA assigned after story approval.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 31;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'DEVELOPER_ASSIGNED', 'SPRINT_PLANNING', p.pm_id, 'Sprint created and delivery planning completed.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 36;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'SPRINT_PLANNING', 'IN_DEVELOPMENT', p.pm_id, 'Sprint started and development began.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 41;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'IN_DEVELOPMENT', 'QA_PENDING', p.developer_id, 'Development completed and routed to QA.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 46;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'QA_PENDING', 'QA_FAILED', p.qa_id, 'QA found issues and returned the request.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.status = 'QA_FAILED';

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'QA_PENDING', 'QA_PASSED', p.qa_id, 'QA passed.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 56;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'QA_PASSED', 'UAT_PENDING', p.qa_id, 'Routed to business UAT.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 56;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'UAT_PENDING', 'UAT_APPROVED', p.uat_id, 'Business UAT approved.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 61;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'UAT_APPROVED', 'DEPLOYMENT_PENDING', p.uat_id, 'Ready for deployment.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 66;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'DEPLOYMENT_PENDING', 'DEPLOYED', p.pm_id, 'Deployment completed.'
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.status = 'DEPLOYED';

-- Project scopes for all PM-owned projects.
INSERT INTO project_scopes (
  request_id, scope_title, scope_description, business_objectives, in_scope, out_of_scope,
  assumptions, dependencies, status, created_by_user_id, reviewed_by_user_id, review_comments, reviewed_at
)
SELECT
  r.id,
  CONCAT(p.base_title, ' Scope'),
  CONCAT('Define delivery boundaries, user groups, workflow controls, reporting needs, and implementation plan for ', p.base_title, '.'),
  'Reduce manual work, improve approval control, and provide role-based operational visibility.',
  'Workflow screens, backend APIs, notifications, audit history, request reporting, and user role controls.',
  'Third-party commercial product procurement and native mobile apps.',
  'Business users will review requirements within agreed SLA.',
  'Existing RequestOps authentication, departments, roles, and notification services.',
  CASE WHEN p.n BETWEEN 16 AND 20 THEN 'DRAFT' WHEN p.n BETWEEN 21 AND 25 THEN 'SUBMITTED' ELSE 'APPROVED' END,
  p.pm_id,
  CASE WHEN p.n >= 26 THEN @it_hod_id ELSE NULL END,
  CASE WHEN p.n >= 26 THEN 'Scope approved for delivery.' ELSE NULL END,
  CASE WHEN p.n >= 26 THEN CURRENT_TIMESTAMP ELSE NULL END
FROM demo_request_plan p
JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 16;

DROP TEMPORARY TABLE IF EXISTS demo_story_numbers;
CREATE TEMPORARY TABLE demo_story_numbers (n INT PRIMARY KEY);
INSERT INTO demo_story_numbers (n) VALUES (1),(2),(3),(4),(5),(6);

-- Six user stories for all projects at user-story stage and beyond.
INSERT INTO user_stories (
  request_id, story_key, title, description, acceptance_criteria, priority, status,
  created_by_user_id, reviewed_by_user_id, review_comments, reviewed_at
)
SELECT
  r.id,
  CONCAT('US-', LPAD(sn.n, 2, '0')),
  CASE sn.n
    WHEN 1 THEN CONCAT('Submit ', p.base_title, ' request')
    WHEN 2 THEN CONCAT('Review ', p.base_title, ' approval workflow')
    WHEN 3 THEN CONCAT('Track ', p.base_title, ' implementation progress')
    WHEN 4 THEN CONCAT('Validate ', p.base_title, ' outcomes')
    WHEN 5 THEN CONCAT('Report ', p.base_title, ' ROI and status')
    ELSE CONCAT('Notify stakeholders for ', p.base_title)
  END,
  CASE sn.n
    WHEN 1 THEN 'As a requester, I can submit the request with required business context and ROI details.'
    WHEN 2 THEN 'As an approver, I can approve, reject, or return the request with comments.'
    WHEN 3 THEN 'As a project team member, I can update progress and sprint task status.'
    WHEN 4 THEN 'As QA or business user, I can validate delivery before deployment.'
    WHEN 5 THEN 'As leadership, I can view ROI, workflow status, and activity history.'
    ELSE 'As a stakeholder, I receive clear notifications when action is needed.'
  END,
  CASE sn.n
    WHEN 1 THEN 'Given complete mandatory fields, when submitted, then the request is routed to the correct Department HOD.'
    WHEN 2 THEN 'Given a request awaiting action, when a decision is made, then status history and notifications are recorded.'
    WHEN 3 THEN 'Given assigned delivery work, when progress is updated, then stakeholders see current completion.'
    WHEN 4 THEN 'Given completed development, when QA and UAT pass, then deployment can proceed.'
    WHEN 5 THEN 'Given ROI input, when values change, then annual ROI is calculated and audited.'
    ELSE 'Given workflow movement, when assignees change, then relevant users receive notifications.'
  END,
  CASE sn.n WHEN 1 THEN 'HIGH' WHEN 2 THEN 'HIGH' WHEN 3 THEN 'MEDIUM' WHEN 4 THEN 'HIGH' WHEN 5 THEN 'MEDIUM' ELSE 'LOW' END,
  CASE WHEN p.n BETWEEN 26 AND 30 THEN 'SUBMITTED' ELSE 'APPROVED' END,
  p.pm_id,
  CASE WHEN p.n >= 31 THEN (SELECT department_head_user_id FROM departments d JOIN users u ON u.department_id = d.id WHERE u.employee_id = p.requester_employee_id LIMIT 1) ELSE NULL END,
  CASE WHEN p.n >= 31 THEN 'Approved for delivery.' ELSE NULL END,
  CASE WHEN p.n >= 31 THEN CURRENT_TIMESTAMP ELSE NULL END
FROM demo_request_plan p
JOIN requests r ON r.request_number = p.request_number
JOIN demo_story_numbers sn
WHERE p.n >= 26;

-- Sprints for sprint planning and later.
INSERT INTO sprints (
  request_id, sprint_name, goal, start_date, end_date, estimated_hours, actual_hours,
  status, created_by_user_id, started_at, completed_at
)
SELECT
  r.id,
  CONCAT('Sprint ', 1 + MOD(p.n, 3), ' - ', p.base_title),
  CONCAT('Deliver core workflow, validation, and reporting capabilities for ', p.base_title, '.'),
  DATE_SUB(CURRENT_DATE, INTERVAL (80 - p.n) DAY),
  DATE_ADD(DATE_SUB(CURRENT_DATE, INTERVAL (80 - p.n) DAY), INTERVAL 14 DAY),
  56 + MOD(p.n, 5) * 8,
  CASE WHEN p.n >= 51 THEN 52 + MOD(p.n, 7) * 6 ELSE NULL END,
  CASE WHEN p.n BETWEEN 36 AND 40 THEN 'PLANNED' WHEN p.n BETWEEN 41 AND 50 THEN 'ACTIVE' ELSE 'COMPLETED' END,
  p.pm_id,
  CASE WHEN p.n >= 41 THEN DATE_SUB(CURRENT_TIMESTAMP, INTERVAL (80 - p.n) DAY) ELSE NULL END,
  CASE WHEN p.n >= 51 THEN DATE_SUB(CURRENT_TIMESTAMP, INTERVAL (65 - p.n) DAY) ELSE NULL END
FROM demo_request_plan p
JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 36;

DROP TEMPORARY TABLE IF EXISTS demo_task_numbers;
CREATE TEMPORARY TABLE demo_task_numbers (n INT PRIMARY KEY);
INSERT INTO demo_task_numbers (n) VALUES (1),(2),(3),(4),(5);

-- Sprint tasks across todo, in progress, blocked, and completed states.
INSERT INTO sprint_tasks (
  sprint_id, user_story_id, title, description, assigned_developer_user_id,
  estimate_hours, actual_hours, priority, status
)
SELECT
  s.id,
  (SELECT us.id FROM user_stories us WHERE us.request_id = r.id AND us.story_key = CONCAT('US-', LPAD(LEAST(tn.n, 5), 2, '0')) LIMIT 1),
  CASE tn.n
    WHEN 1 THEN 'Design workflow and validation rules'
    WHEN 2 THEN 'Build API and data persistence'
    WHEN 3 THEN 'Build responsive frontend screens'
    WHEN 4 THEN 'Add audit, notifications, and reporting'
    ELSE 'QA fixes and release readiness'
  END,
  CONCAT('Task for ', p.base_title, ' request ', p.request_number, '.'),
  p.developer_id,
  8 + tn.n * 3,
  CASE WHEN s.status = 'COMPLETED' THEN 8 + tn.n * 3 ELSE NULL END,
  CASE tn.n WHEN 1 THEN 'HIGH' WHEN 2 THEN 'HIGH' WHEN 3 THEN 'MEDIUM' WHEN 4 THEN 'MEDIUM' ELSE 'LOW' END,
  CASE
    WHEN s.status = 'PLANNED' THEN 'TODO'
    WHEN s.status = 'ACTIVE' AND tn.n = 1 THEN 'DONE'
    WHEN s.status = 'ACTIVE' AND tn.n = 2 THEN 'IN_PROGRESS'
    WHEN s.status = 'ACTIVE' AND tn.n = 3 THEN 'BLOCKED'
    WHEN s.status = 'ACTIVE' THEN 'TODO'
    ELSE 'DONE'
  END
FROM demo_request_plan p
JOIN requests r ON r.request_number = p.request_number
JOIN sprints s ON s.request_id = r.id
JOIN demo_task_numbers tn
WHERE p.n >= 36;

-- Development updates, QA results, and UAT approvals.
INSERT INTO development_updates (request_id, developer_user_id, progress_percentage, update_notes)
SELECT r.id, p.developer_id,
  CASE WHEN p.status = 'IN_DEVELOPMENT' THEN 35 + MOD(p.n, 55) ELSE 100 END,
  CONCAT('Development update for ', p.base_title, '.')
FROM demo_request_plan p
JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 41;

INSERT INTO test_results (request_id, qa_user_id, result, test_summary, defects_found)
SELECT r.id, p.qa_id,
  CASE WHEN p.status = 'QA_FAILED' THEN 'FAIL' ELSE 'PASS' END,
  CASE WHEN p.status = 'QA_FAILED' THEN 'QA found validation defects requiring rework.' ELSE 'QA passed with all critical scenarios validated.' END,
  CASE WHEN p.status = 'QA_FAILED' THEN 'Validation mismatch in approval routing and missing edge case coverage.' ELSE NULL END
FROM demo_request_plan p
JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 51;

INSERT INTO uat_approvals (request_id, uat_approver_user_id, decision, comments)
SELECT r.id, p.uat_id, 'APPROVED', CONCAT('Business UAT approved for ', p.base_title, '.')
FROM demo_request_plan p
JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 61;

-- Comments for active and closed requests.
INSERT INTO request_comments (request_id, user_id, comment_type, comment_text, is_internal)
SELECT r.id, p.pm_id, 'GENERAL', CONCAT('Project management note for ', p.base_title, '.'), TRUE
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 16;

INSERT INTO request_comments (request_id, user_id, comment_type, comment_text, is_internal)
SELECT r.id, p.qa_id, 'TESTING', CONCAT('QA review comments for ', p.base_title, '.'), TRUE
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 46;

INSERT INTO request_comments (request_id, user_id, comment_type, comment_text, is_internal)
SELECT r.id, p.uat_id, 'UAT', CONCAT('Business review comment for ', p.base_title, '.'), FALSE
FROM demo_request_plan p JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 56;

-- Clarifications for a few in-flight requests to populate clarification views.
INSERT INTO request_clarifications (
  request_id, requested_by_user_id, responded_by_user_id, stage_status, return_status,
  return_assignee_user_id, reason_category, note, response_note, status, responded_at
)
SELECT r.id, dept.department_head_user_id, requester.id, 'DEPARTMENT_APPROVAL_PENDING', 'DEPARTMENT_APPROVAL_PENDING',
       dept.department_head_user_id, 'MISSING_REQUIREMENTS',
       'Please clarify expected approval thresholds and reporting frequency.',
       'Thresholds and reporting needs added by requester.', 'RESOLVED', CURRENT_TIMESTAMP
FROM demo_request_plan p
JOIN requests r ON r.request_number = p.request_number
JOIN users requester ON requester.employee_id = p.requester_employee_id
JOIN departments dept ON dept.id = requester.department_id
WHERE p.n IN (7, 12, 22, 37, 57);

-- Notifications for current action owners and dashboard unread states.
INSERT INTO notifications (recipient_user_id, request_id, type, title, message, is_read)
SELECT
  r.current_assignee_user_id,
  r.id,
  CASE r.status
    WHEN 'DEPARTMENT_APPROVAL_PENDING' THEN 'REQUEST_AWAITING_APPROVAL'
    WHEN 'IT_REVIEW_PENDING' THEN 'REQUEST_IT_REVIEW_PENDING'
    WHEN 'SCOPE_REVIEW' THEN 'SCOPE_SUBMITTED'
    WHEN 'USER_STORY_REVIEW' THEN 'USER_STORIES_REVIEW_PENDING'
    WHEN 'QA_PENDING' THEN 'TESTING_PENDING'
    WHEN 'UAT_PENDING' THEN 'UAT_PENDING'
    WHEN 'DEPLOYMENT_PENDING' THEN 'DEPLOYMENT_PENDING'
    ELSE 'REQUEST_AWAITING_ACTION'
  END,
  CASE r.status
    WHEN 'DEPARTMENT_APPROVAL_PENDING' THEN 'Department approval pending'
    WHEN 'IT_REVIEW_PENDING' THEN 'Internal review pending'
    WHEN 'SCOPE_REVIEW' THEN 'Scope review pending'
    WHEN 'USER_STORY_REVIEW' THEN 'User story review pending'
    WHEN 'QA_PENDING' THEN 'QA review pending'
    WHEN 'UAT_PENDING' THEN 'Final approval pending'
    WHEN 'DEPLOYMENT_PENDING' THEN 'Deployment pending'
    ELSE 'Request awaiting action'
  END,
  CONCAT(r.request_number, ' requires action for ', r.title, '.'),
  FALSE
FROM requests r
WHERE r.current_assignee_user_id IS NOT NULL;

-- Audit logs for admin dashboard/activity visibility.
INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
SELECT requester.id, 'REQUEST_CREATED', 'REQUEST', r.id, NULL,
       JSON_OBJECT('requestNumber', r.request_number, 'status', r.status, 'priority', r.priority),
       '127.0.0.1', 'RequestOps demo seed'
FROM demo_request_plan p
JOIN requests r ON r.request_number = p.request_number
JOIN users requester ON requester.employee_id = p.requester_employee_id;

INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
SELECT p.pm_id, 'PROJECT_DEMO_DATA_SEEDED', 'REQUEST', r.id, NULL,
       JSON_OBJECT('scopeCreated', p.n >= 16, 'storiesCreated', p.n >= 26, 'sprintCreated', p.n >= 36),
       '127.0.0.1', 'RequestOps demo seed'
FROM demo_request_plan p
JOIN requests r ON r.request_number = p.request_number
WHERE p.n >= 16;

COMMIT;
