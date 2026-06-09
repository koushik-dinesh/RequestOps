-- RequestOps clean compact demo dataset.
-- Corrected user model:
--   - 12 departments
--   - 1 Department HOD per department
--   - 2 Employee/Requester users per department
--   - 2 users each for System Admin, IT HOD, Project Manager, Developer, QA, and UAT Approver
--
-- Identifiers:
--   Users:    VIO-0001 ... VIO-0048
--   Requests: RQ-001 ... RQ-024

START TRANSACTION;

SET @demo_password = '$2b$10$iJG8PLVADbjsnvOD8mjCVeq9YFh0nxPx0fVh5lYz7TXhwak10E2qu';

INSERT INTO roles (code, name, description) VALUES
  ('SYSTEM_ADMIN', 'System Admin', 'Owns system configuration, users, departments, and audit visibility.'),
  ('EMPLOYEE', 'Employee', 'Creates and tracks software requests.'),
  ('DEPARTMENT_HEAD', 'Department Head', 'Approves or rejects requests for a department.'),
  ('IT_HEAD', 'IT Head', 'Reviews feasibility, prioritizes, and assigns work owners.'),
  ('PROJECT_MANAGER', 'Project Manager', 'Owns scope definition, user stories, sprint planning, developer assignment, and delivery tracking.'),
  ('DEVELOPER', 'Assigned Team Member', 'Works on assigned requests and records progress.'),
  ('QA', 'Reviewer', 'Performs review and validation before final approval.'),
  ('UAT_APPROVER', 'Final Approver', 'Performs final business approval before completion.')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), is_active = TRUE;

INSERT INTO departments (name, code, description, status) VALUES
  ('Administration', 'ADM', 'Administration and workplace services.', 'ACTIVE'),
  ('Business Development', 'BD', 'Business development and partnerships.', 'ACTIVE'),
  ('Engineering', 'ENG', 'Engineering and product operations.', 'ACTIVE'),
  ('Finance', 'FIN', 'Finance and accounting operations.', 'ACTIVE'),
  ('Human Resources', 'HR', 'Human resources and employee operations.', 'ACTIVE'),
  ('IT', 'IT', 'Internal technology and software delivery.', 'ACTIVE'),
  ('Operations', 'OPS', 'Business operations.', 'ACTIVE'),
  ('Procurement', 'PRC', 'Procurement and vendor management.', 'ACTIVE'),
  ('Production', 'PRD', 'Production and manufacturing operations.', 'ACTIVE'),
  ('Quality', 'QLT', 'Quality review and compliance operations.', 'ACTIVE'),
  ('Sales & Marketing', 'SAM', 'Sales, marketing, and customer accounts.', 'ACTIVE'),
  ('Supply Chain', 'SCM', 'Supply chain and logistics operations.', 'ACTIVE')
ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), status = VALUES(status);

DROP TEMPORARY TABLE IF EXISTS demo_departments;
CREATE TEMPORARY TABLE demo_departments (
  seq INT PRIMARY KEY,
  code VARCHAR(20) NOT NULL,
  hod_name VARCHAR(150) NOT NULL,
  emp1_name VARCHAR(150) NOT NULL,
  emp2_name VARCHAR(150) NOT NULL
);

INSERT INTO demo_departments VALUES
  (1, 'ADM', 'Meera Nair', 'Anand Rao', 'Pooja Kulkarni'),
  (2, 'BD', 'Siddharth Kapoor', 'Rhea Malhotra', 'Kabir Sethi'),
  (3, 'ENG', 'Ananya Iyer', 'Ravi Narayan', 'Diya Shah'),
  (4, 'FIN', 'Priya Raman', 'Neha Gupta', 'Arjun Bose'),
  (5, 'HR', 'Aisha Khan', 'Maya Nambiar', 'Karan Mehta'),
  (6, 'IT', 'Omar Khan', 'Devika Nair', 'Ishan Patel'),
  (7, 'OPS', 'Rahul Menon', 'Balaji Krishnan', 'Harini Subramanian'),
  (8, 'PRC', 'Deepak Rao', 'Tanvi Desai', 'Nikhil Verma'),
  (9, 'PRD', 'Suresh Babu', 'Kavya Nandakumar', 'Sameer Khan'),
  (10, 'QLT', 'Harish Quality', 'Manoj Pillai', 'Divya Suresh'),
  (11, 'SAM', 'Rohan Mehta', 'Isha Malhotra', 'Vivek Narayan'),
  (12, 'SCM', 'Kavita Singh', 'Ritu Chawla', 'Farhan Ali');

-- VIO-0001 ... VIO-0012: one Department HOD for every department.
INSERT INTO users (employee_id, full_name, email, mobile_number, designation, department_id, role_id, password_hash, status, employment_status)
SELECT
  CONCAT('VIO-', LPAD(seq, 4, '0')),
  hod_name,
  CONCAT(LOWER(REPLACE(hod_name, ' ', '.')), '.demo@requestops.local'),
  CONCAT('+91-92000-', LPAD(seq, 5, '0')),
  'Department Head',
  (SELECT id FROM departments WHERE code = dd.code),
  (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'),
  @demo_password,
  'ACTIVE',
  'ACTIVE'
FROM demo_departments dd
WHERE TRUE
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

-- VIO-0013 ... VIO-0036: two Employee/Requester users for every department.
INSERT INTO users (employee_id, full_name, email, mobile_number, designation, department_id, reporting_manager_user_id, role_id, password_hash, status, employment_status)
SELECT
  CONCAT('VIO-', LPAD(12 + ((seq - 1) * 2) + employee_slot, 4, '0')),
  CASE employee_slot WHEN 1 THEN emp1_name ELSE emp2_name END,
  CONCAT(LOWER(REPLACE(CASE employee_slot WHEN 1 THEN emp1_name ELSE emp2_name END, ' ', '.')), '.demo@requestops.local'),
  CONCAT('+91-92000-', LPAD(12 + ((seq - 1) * 2) + employee_slot, 5, '0')),
  'Employee',
  (SELECT id FROM departments WHERE code = dd.code),
  (SELECT id FROM users WHERE employee_id = CONCAT('VIO-', LPAD(seq, 4, '0'))),
  (SELECT id FROM roles WHERE code = 'EMPLOYEE'),
  @demo_password,
  'ACTIVE',
  'ACTIVE'
FROM demo_departments dd
CROSS JOIN (SELECT 1 AS employee_slot UNION ALL SELECT 2) slots
WHERE TRUE
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  mobile_number = VALUES(mobile_number),
  designation = VALUES(designation),
  department_id = VALUES(department_id),
  reporting_manager_user_id = VALUES(reporting_manager_user_id),
  role_id = VALUES(role_id),
  password_hash = VALUES(password_hash),
  status = 'ACTIVE',
  employment_status = 'ACTIVE',
  exit_date = NULL;

-- VIO-0037 ... VIO-0048: workflow specialists, two per non-department role.
INSERT INTO users (employee_id, full_name, email, mobile_number, designation, department_id, role_id, password_hash, status, employment_status)
VALUES
  ('VIO-0037', 'Aarav Mehta', 'aarav.mehta.demo@requestops.local', '+91-92000-00037', 'System Admin', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'SYSTEM_ADMIN'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('VIO-0038', 'Leela Iyer', 'leela.iyer.demo@requestops.local', '+91-92000-00038', 'System Admin', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'SYSTEM_ADMIN'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('VIO-0039', 'Meera Krishnan', 'meera.krishnan.demo@requestops.local', '+91-92000-00039', 'IT Head', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'IT_HEAD'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('VIO-0040', 'Vikram Rao', 'vikram.rao.demo@requestops.local', '+91-92000-00040', 'IT Head', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'IT_HEAD'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('VIO-0041', 'Anika Das', 'anika.das.demo@requestops.local', '+91-92000-00041', 'Project Manager', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'PROJECT_MANAGER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('VIO-0042', 'Rohan Sen', 'rohan.sen.demo@requestops.local', '+91-92000-00042', 'Project Manager', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'PROJECT_MANAGER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('VIO-0043', 'Arjun Pillai', 'arjun.pillai.demo@requestops.local', '+91-92000-00043', 'Developer', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'DEVELOPER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('VIO-0044', 'Nisha Kapoor', 'nisha.kapoor.demo@requestops.local', '+91-92000-00044', 'Developer', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'DEVELOPER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('VIO-0045', 'Kiran Babu', 'kiran.babu.demo@requestops.local', '+91-92000-00045', 'QA Engineer', (SELECT id FROM departments WHERE code = 'QLT'), (SELECT id FROM roles WHERE code = 'QA'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('VIO-0046', 'Maya Thomas', 'maya.thomas.demo@requestops.local', '+91-92000-00046', 'QA Engineer', (SELECT id FROM departments WHERE code = 'QLT'), (SELECT id FROM roles WHERE code = 'QA'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('VIO-0047', 'Kavya Menon', 'kavya.menon.demo@requestops.local', '+91-92000-00047', 'UAT Approver', (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM roles WHERE code = 'UAT_APPROVER'), @demo_password, 'ACTIVE', 'ACTIVE'),
  ('VIO-0048', 'Sanjay Bhat', 'sanjay.bhat.demo@requestops.local', '+91-92000-00048', 'UAT Approver', (SELECT id FROM departments WHERE code = 'OPS'), (SELECT id FROM roles WHERE code = 'UAT_APPROVER'), @demo_password, 'ACTIVE', 'ACTIVE')
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

-- Make each department point to its own HOD.
UPDATE departments d
JOIN demo_departments dd ON dd.code = d.code
JOIN users hod ON hod.employee_id = CONCAT('VIO-', LPAD(dd.seq, 4, '0'))
SET d.department_head_user_id = hod.id;

DROP TEMPORARY TABLE IF EXISTS demo_request_plan;
CREATE TEMPORARY TABLE demo_request_plan (
  n INT PRIMARY KEY,
  status VARCHAR(60) NOT NULL,
  base_title VARCHAR(120) NOT NULL,
  requester_employee_id VARCHAR(50) NOT NULL,
  pm_employee_id VARCHAR(50) NOT NULL,
  developer_employee_id VARCHAR(50) NOT NULL,
  qa_employee_id VARCHAR(50) NOT NULL,
  uat_employee_id VARCHAR(50) NOT NULL,
  it_employee_id VARCHAR(50) NOT NULL
);

INSERT INTO demo_request_plan VALUES
  (1,  'DEPARTMENT_APPROVAL_PENDING', 'Admin Visitor Pass Automation', 'VIO-0013', 'VIO-0041', 'VIO-0043', 'VIO-0045', 'VIO-0047', 'VIO-0039'),
  (2,  'DEPARTMENT_APPROVAL_PENDING', 'Business Pipeline Tracker', 'VIO-0015', 'VIO-0042', 'VIO-0044', 'VIO-0046', 'VIO-0048', 'VIO-0040'),
  (3,  'IT_REVIEW_PENDING', 'Engineering Change Log', 'VIO-0017', 'VIO-0041', 'VIO-0043', 'VIO-0045', 'VIO-0047', 'VIO-0039'),
  (4,  'IT_REVIEW_PENDING', 'Finance Exception Workflow', 'VIO-0019', 'VIO-0042', 'VIO-0044', 'VIO-0046', 'VIO-0048', 'VIO-0040'),
  (5,  'PM_ASSIGNED', 'HR Onboarding Checklist', 'VIO-0021', 'VIO-0041', 'VIO-0043', 'VIO-0045', 'VIO-0047', 'VIO-0039'),
  (6,  'PM_ASSIGNED', 'IT Access Review Board', 'VIO-0023', 'VIO-0042', 'VIO-0044', 'VIO-0046', 'VIO-0048', 'VIO-0040'),
  (7,  'SCOPE_REVIEW', 'Operations Dispatch Planner', 'VIO-0025', 'VIO-0041', 'VIO-0043', 'VIO-0045', 'VIO-0047', 'VIO-0039'),
  (8,  'SCOPE_REVIEW', 'Procurement Vendor Scorecard', 'VIO-0027', 'VIO-0042', 'VIO-0044', 'VIO-0046', 'VIO-0048', 'VIO-0040'),
  (9,  'USER_STORY_REVIEW', 'Production Shift Handover', 'VIO-0029', 'VIO-0041', 'VIO-0043', 'VIO-0045', 'VIO-0047', 'VIO-0039'),
  (10, 'USER_STORY_REVIEW', 'Quality Audit Evidence Hub', 'VIO-0031', 'VIO-0042', 'VIO-0044', 'VIO-0046', 'VIO-0048', 'VIO-0040'),
  (11, 'DEVELOPER_ASSIGNED', 'Sales Campaign Approval', 'VIO-0033', 'VIO-0041', 'VIO-0043', 'VIO-0045', 'VIO-0047', 'VIO-0039'),
  (12, 'DEVELOPER_ASSIGNED', 'Supply Chain Delay Alert', 'VIO-0035', 'VIO-0042', 'VIO-0044', 'VIO-0046', 'VIO-0048', 'VIO-0040'),
  (13, 'SPRINT_PLANNING', 'Admin Asset Desk', 'VIO-0014', 'VIO-0041', 'VIO-0043', 'VIO-0045', 'VIO-0047', 'VIO-0039'),
  (14, 'SPRINT_PLANNING', 'Business Proposal Tracker', 'VIO-0016', 'VIO-0042', 'VIO-0044', 'VIO-0046', 'VIO-0048', 'VIO-0040'),
  (15, 'IN_DEVELOPMENT', 'Engineering Release Notes', 'VIO-0018', 'VIO-0041', 'VIO-0043', 'VIO-0045', 'VIO-0047', 'VIO-0039'),
  (16, 'IN_DEVELOPMENT', 'Finance KPI Snapshot', 'VIO-0020', 'VIO-0042', 'VIO-0044', 'VIO-0046', 'VIO-0048', 'VIO-0040'),
  (17, 'QA_PENDING', 'HR Exit Checklist', 'VIO-0022', 'VIO-0041', 'VIO-0043', 'VIO-0045', 'VIO-0047', 'VIO-0039'),
  (18, 'QA_PENDING', 'IT License Renewal Tracker', 'VIO-0024', 'VIO-0042', 'VIO-0044', 'VIO-0046', 'VIO-0048', 'VIO-0040'),
  (19, 'UAT_PENDING', 'Operations SLA Monitor', 'VIO-0026', 'VIO-0041', 'VIO-0043', 'VIO-0045', 'VIO-0047', 'VIO-0039'),
  (20, 'UAT_PENDING', 'Procurement RFQ Workspace', 'VIO-0028', 'VIO-0042', 'VIO-0044', 'VIO-0046', 'VIO-0048', 'VIO-0040'),
  (21, 'DEPLOYMENT_PENDING', 'Production Downtime Report', 'VIO-0030', 'VIO-0041', 'VIO-0043', 'VIO-0045', 'VIO-0047', 'VIO-0039'),
  (22, 'DEPLOYMENT_PENDING', 'Quality NCR Workflow', 'VIO-0032', 'VIO-0042', 'VIO-0044', 'VIO-0046', 'VIO-0048', 'VIO-0040'),
  (23, 'DEPLOYED', 'Sales Incentive Calculator', 'VIO-0034', 'VIO-0041', 'VIO-0043', 'VIO-0045', 'VIO-0047', 'VIO-0039'),
  (24, 'DEPLOYED', 'Supply Chain Forecast Board', 'VIO-0036', 'VIO-0042', 'VIO-0044', 'VIO-0046', 'VIO-0048', 'VIO-0040');

INSERT INTO requests (
  request_number, title, request_type, priority, business_justification, description, expected_benefits,
  roi_type, roi_hours_saved_per_employee_per_month, roi_employees_benefited, roi_monthly_cost_savings_inr,
  status, requester_user_id, requester_department_id, department_head_user_id, it_head_user_id,
  project_manager_user_id, current_assignee_user_id, progress_percentage, feasibility_notes, complexity,
  estimated_effort, priority_confirmation, closed_at
)
SELECT
  CONCAT('RQ-', LPAD(p.n, 3, '0')),
  p.base_title,
  CASE MOD(p.n, 6) WHEN 0 THEN 'REPORT' WHEN 1 THEN 'AUTOMATION' WHEN 2 THEN 'NEW_FEATURE' WHEN 3 THEN 'ENHANCEMENT' WHEN 4 THEN 'INTEGRATION' ELSE 'OTHER' END,
  CASE MOD(p.n, 4) WHEN 0 THEN 'CRITICAL' WHEN 1 THEN 'HIGH' WHEN 2 THEN 'MEDIUM' ELSE 'LOW' END,
  CONCAT(p.base_title, ' will reduce manual tracking and improve ownership visibility for the department.'),
  CONCAT('Deliver a focused RequestOps workflow for ', p.base_title, ' with approvals, ownership, notifications, and status tracking.'),
  'Clear ownership, faster approvals, measurable productivity gains, and cleaner operational reporting.',
  CASE WHEN MOD(p.n, 2) = 0 THEN 'COST_SAVINGS' ELSE 'TIME_SAVINGS' END,
  CASE WHEN MOD(p.n, 2) = 1 THEN CAST(2 + MOD(p.n, 4) AS DECIMAL(10,2)) ELSE NULL END,
  CASE WHEN MOD(p.n, 2) = 1 THEN 8 + MOD(p.n, 6) ELSE NULL END,
  CASE WHEN MOD(p.n, 2) = 0 THEN CAST(18000 + (MOD(p.n, 5) * 6000) AS DECIMAL(14,2)) ELSE NULL END,
  p.status,
  requester.id,
  requester.department_id,
  dept.department_head_user_id,
  CASE WHEN p.n >= 3 THEN it_owner.id ELSE NULL END,
  CASE WHEN p.n >= 5 THEN pm_owner.id ELSE NULL END,
  CASE
    WHEN p.status = 'DEPARTMENT_APPROVAL_PENDING' THEN dept.department_head_user_id
    WHEN p.status = 'IT_REVIEW_PENDING' THEN it_owner.id
    WHEN p.status IN ('PM_ASSIGNED', 'DEPLOYMENT_PENDING') THEN pm_owner.id
    WHEN p.status = 'SCOPE_REVIEW' THEN it_owner.id
    WHEN p.status = 'USER_STORY_REVIEW' THEN dept.department_head_user_id
    WHEN p.status IN ('DEVELOPER_ASSIGNED', 'SPRINT_PLANNING', 'IN_DEVELOPMENT') THEN developer.id
    WHEN p.status = 'QA_PENDING' THEN qa.id
    WHEN p.status = 'UAT_PENDING' THEN uat.id
    WHEN p.status = 'DEPLOYED' THEN requester.id
    ELSE NULL
  END,
  CASE WHEN p.status = 'IN_DEVELOPMENT' THEN 55 WHEN p.status IN ('QA_PENDING', 'UAT_PENDING', 'DEPLOYMENT_PENDING', 'DEPLOYED') THEN 100 ELSE 0 END,
  CASE WHEN p.n >= 3 THEN 'Feasible using existing RequestOps platform capabilities.' ELSE NULL END,
  CASE MOD(p.n, 4) WHEN 0 THEN 'VERY_HIGH' WHEN 1 THEN 'HIGH' WHEN 2 THEN 'MEDIUM' ELSE 'LOW' END,
  CASE WHEN p.n >= 3 THEN CASE MOD(p.n, 3) WHEN 0 THEN '3 sprints' WHEN 1 THEN '2 sprints' ELSE '1 sprint' END ELSE NULL END,
  CASE WHEN p.n >= 3 THEN CASE MOD(p.n, 4) WHEN 0 THEN 'CRITICAL' WHEN 1 THEN 'HIGH' WHEN 2 THEN 'MEDIUM' ELSE 'LOW' END ELSE NULL END,
  NULL
FROM demo_request_plan p
JOIN users requester ON requester.employee_id = p.requester_employee_id
JOIN departments dept ON dept.id = requester.department_id
JOIN users it_owner ON it_owner.employee_id = p.it_employee_id
JOIN users pm_owner ON pm_owner.employee_id = p.pm_employee_id
JOIN users developer ON developer.employee_id = p.developer_employee_id
JOIN users qa ON qa.employee_id = p.qa_employee_id
JOIN users uat ON uat.employee_id = p.uat_employee_id;

INSERT INTO assignments (request_id, developer_user_id, qa_user_id, assigned_by_user_id, is_active, notes)
SELECT r.id, developer.id, qa.id, pm_owner.id, TRUE, CONCAT('Compact demo assignment for ', p.base_title, '.')
FROM demo_request_plan p
JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0'))
JOIN users developer ON developer.employee_id = p.developer_employee_id
JOIN users qa ON qa.employee_id = p.qa_employee_id
JOIN users pm_owner ON pm_owner.employee_id = p.pm_employee_id
WHERE p.n >= 11;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, NULL, 'SUBMITTED', requester.id, 'Request submitted.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) JOIN users requester ON requester.employee_id = p.requester_employee_id;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'SUBMITTED', 'DEPARTMENT_APPROVAL_PENDING', requester.id, 'Routed to Department HOD.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) JOIN users requester ON requester.employee_id = p.requester_employee_id;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'DEPARTMENT_APPROVAL_PENDING', 'IT_REVIEW_PENDING', r.department_head_user_id, 'Department HOD approved.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 3;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'IT_REVIEW_PENDING', 'ASSIGNMENT_PENDING', r.it_head_user_id, 'IT HOD approved. Project Manager assignment required.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 5;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'ASSIGNMENT_PENDING', 'PM_ASSIGNED', r.it_head_user_id, 'Project Manager assigned.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 5;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'PM_ASSIGNED', 'SCOPE_REVIEW', r.project_manager_user_id, 'Scope submitted for IT review.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 7;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'SCOPE_REVIEW', 'PM_ASSIGNED', r.it_head_user_id, 'Scope approved.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 9;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'PM_ASSIGNED', 'USER_STORY_REVIEW', r.project_manager_user_id, 'User stories submitted for Department HOD review.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 9;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'USER_STORY_REVIEW', 'DEVELOPER_ASSIGNED', r.project_manager_user_id, 'Developer and QA assigned after story approval.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 11;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'DEVELOPER_ASSIGNED', 'SPRINT_PLANNING', r.project_manager_user_id, 'Sprint planned.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 13;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'SPRINT_PLANNING', 'IN_DEVELOPMENT', r.project_manager_user_id, 'Sprint started and development began.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 15;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'IN_DEVELOPMENT', 'QA_PENDING', assignment.developer_user_id, 'Development completed and routed to QA.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) JOIN assignments assignment ON assignment.request_id = r.id AND assignment.is_active = TRUE WHERE p.n >= 17;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'QA_PENDING', 'QA_PASSED', assignment.qa_user_id, 'QA passed.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) JOIN assignments assignment ON assignment.request_id = r.id AND assignment.is_active = TRUE WHERE p.n >= 19;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'QA_PASSED', 'UAT_PENDING', assignment.qa_user_id, 'Routed to UAT approver.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) JOIN assignments assignment ON assignment.request_id = r.id AND assignment.is_active = TRUE WHERE p.n >= 19;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'UAT_PENDING', 'UAT_APPROVED', r.current_assignee_user_id, 'UAT approved.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 21;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'UAT_APPROVED', 'DEPLOYMENT_PENDING', r.current_assignee_user_id, 'Ready for deployment.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 21;

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, 'DEPLOYMENT_PENDING', 'DEPLOYED', r.project_manager_user_id, 'Deployment completed.'
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 23;

INSERT INTO project_scopes (
  request_id, scope_title, scope_description, business_objectives, in_scope, out_of_scope,
  status, created_by_user_id, reviewed_by_user_id, review_comments, reviewed_at
)
SELECT
  r.id, CONCAT(p.base_title, ' Scope'),
  CONCAT('Compact scope for ', p.base_title, ' covering workflow screens, routing, alerts, and reporting.'),
  'Improve control, reduce manual follow-up, and make ownership visible.',
  'Workflow setup, role permissions, notifications, audit trail, and dashboard visibility.',
  'External product procurement and native mobile application delivery.',
  CASE WHEN p.n BETWEEN 5 AND 6 THEN 'DRAFT' WHEN p.n BETWEEN 7 AND 8 THEN 'SUBMITTED' ELSE 'APPROVED' END,
  r.project_manager_user_id,
  CASE WHEN p.n >= 9 THEN r.it_head_user_id ELSE NULL END,
  CASE WHEN p.n >= 9 THEN 'Approved for user story definition.' ELSE NULL END,
  CASE WHEN p.n >= 9 THEN CURRENT_TIMESTAMP ELSE NULL END
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 5;

DROP TEMPORARY TABLE IF EXISTS demo_story_numbers;
CREATE TEMPORARY TABLE demo_story_numbers (n INT PRIMARY KEY);
INSERT INTO demo_story_numbers VALUES (1), (2);

INSERT INTO user_stories (
  request_id, story_key, title, description, acceptance_criteria, priority, status,
  created_by_user_id, reviewed_by_user_id, review_comments, reviewed_at
)
SELECT
  r.id,
  CONCAT('US-', LPAD(sn.n, 2, '0')),
  CASE sn.n WHEN 1 THEN CONCAT('Submit and route ', p.base_title) ELSE CONCAT('Track delivery for ', p.base_title) END,
  CASE sn.n WHEN 1 THEN 'As a requester, I can submit the request and route it to the correct approver.' ELSE 'As a stakeholder, I can track ownership, delivery progress, and review outcomes.' END,
  CASE sn.n WHEN 1 THEN 'Given complete details, when submitted, then the request is assigned to the right workflow owner.' ELSE 'Given an active request, when status changes, then timeline, notifications, and dashboards update.' END,
  CASE sn.n WHEN 1 THEN 'HIGH' ELSE 'MEDIUM' END,
  CASE WHEN p.n BETWEEN 9 AND 10 THEN 'SUBMITTED' ELSE 'APPROVED' END,
  r.project_manager_user_id,
  CASE WHEN p.n >= 11 THEN r.department_head_user_id ELSE NULL END,
  CASE WHEN p.n >= 11 THEN 'Approved for delivery.' ELSE NULL END,
  CASE WHEN p.n >= 11 THEN CURRENT_TIMESTAMP ELSE NULL END
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) CROSS JOIN demo_story_numbers sn WHERE p.n >= 9;

INSERT INTO sprints (
  request_id, sprint_name, goal, start_date, end_date, estimated_hours, actual_hours,
  status, created_by_user_id, started_at, completed_at
)
SELECT
  r.id,
  CONCAT('Sprint 1 - ', p.base_title),
  CONCAT('Deliver the core workflow and reporting capabilities for ', p.base_title, '.'),
  DATE_SUB(CURRENT_DATE, INTERVAL (30 - p.n) DAY),
  DATE_ADD(DATE_SUB(CURRENT_DATE, INTERVAL (30 - p.n) DAY), INTERVAL 14 DAY),
  48,
  CASE WHEN p.n >= 17 THEN 44 ELSE NULL END,
  CASE WHEN p.n BETWEEN 13 AND 14 THEN 'PLANNED' WHEN p.n BETWEEN 15 AND 16 THEN 'ACTIVE' ELSE 'COMPLETED' END,
  r.project_manager_user_id,
  CASE WHEN p.n >= 15 THEN DATE_SUB(CURRENT_TIMESTAMP, INTERVAL (30 - p.n) DAY) ELSE NULL END,
  CASE WHEN p.n >= 17 THEN DATE_SUB(CURRENT_TIMESTAMP, INTERVAL (18 - p.n) DAY) ELSE NULL END
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 13;

DROP TEMPORARY TABLE IF EXISTS demo_task_numbers;
CREATE TEMPORARY TABLE demo_task_numbers (n INT PRIMARY KEY);
INSERT INTO demo_task_numbers VALUES (1), (2), (3);

INSERT INTO sprint_tasks (
  sprint_id, user_story_id, title, description, assigned_developer_user_id,
  estimate_hours, actual_hours, priority, status
)
SELECT
  s.id,
  (SELECT us.id FROM user_stories us WHERE us.request_id = r.id ORDER BY us.id LIMIT 1),
  CASE tn.n WHEN 1 THEN 'Configure workflow routing' WHEN 2 THEN 'Build request workspace' ELSE 'Validate notification and reporting flow' END,
  CONCAT('Compact sprint task for ', p.base_title, '.'),
  assignment.developer_user_id,
  8 + (tn.n * 4),
  CASE WHEN s.status = 'COMPLETED' THEN 8 + (tn.n * 4) ELSE NULL END,
  CASE tn.n WHEN 1 THEN 'HIGH' WHEN 2 THEN 'MEDIUM' ELSE 'LOW' END,
  CASE
    WHEN s.status = 'PLANNED' THEN 'TODO'
    WHEN s.status = 'ACTIVE' AND tn.n = 1 THEN 'DONE'
    WHEN s.status = 'ACTIVE' AND tn.n = 2 THEN 'IN_PROGRESS'
    WHEN s.status = 'ACTIVE' THEN 'TODO'
    ELSE 'DONE'
  END
FROM demo_request_plan p
JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0'))
JOIN assignments assignment ON assignment.request_id = r.id AND assignment.is_active = TRUE
JOIN sprints s ON s.request_id = r.id
CROSS JOIN demo_task_numbers tn
WHERE p.n >= 13;

INSERT INTO development_updates (request_id, developer_user_id, progress_percentage, update_notes)
SELECT r.id, assignment.developer_user_id, CASE WHEN p.status = 'IN_DEVELOPMENT' THEN 55 ELSE 100 END, CONCAT('Development progress recorded for ', p.base_title, '.')
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) JOIN assignments assignment ON assignment.request_id = r.id AND assignment.is_active = TRUE WHERE p.n >= 15;

INSERT INTO test_results (request_id, qa_user_id, result, test_summary, defects_found)
SELECT r.id, assignment.qa_user_id, 'PASS', CONCAT('QA validation passed for ', p.base_title, '.'), NULL
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) JOIN assignments assignment ON assignment.request_id = r.id AND assignment.is_active = TRUE WHERE p.n >= 19;

INSERT INTO uat_approvals (request_id, uat_approver_user_id, decision, comments)
SELECT r.id, uat.id, 'APPROVED', CONCAT('Business approval completed for ', p.base_title, '.')
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) JOIN users uat ON uat.employee_id = p.uat_employee_id WHERE p.n >= 21;

INSERT INTO request_comments (request_id, user_id, comment_type, comment_text, is_internal)
SELECT r.id, r.project_manager_user_id, 'GENERAL', CONCAT('PM note for ', p.base_title, '.'), TRUE
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) WHERE p.n >= 5;

INSERT INTO request_comments (request_id, user_id, comment_type, comment_text, is_internal)
SELECT r.id, assignment.qa_user_id, 'TESTING', CONCAT('QA note for ', p.base_title, '.'), TRUE
FROM demo_request_plan p JOIN requests r ON r.request_number = CONCAT('RQ-', LPAD(p.n, 3, '0')) JOIN assignments assignment ON assignment.request_id = r.id AND assignment.is_active = TRUE WHERE p.n >= 17;

INSERT INTO notifications (recipient_user_id, request_id, type, title, message, is_read)
SELECT
  r.current_assignee_user_id,
  r.id,
  CASE r.status
    WHEN 'DEPARTMENT_APPROVAL_PENDING' THEN 'REQUEST_AWAITING_APPROVAL'
    WHEN 'IT_REVIEW_PENDING' THEN 'REQUEST_IT_REVIEW_PENDING'
    WHEN 'PM_ASSIGNED' THEN 'PROJECT_MANAGER_ASSIGNED'
    WHEN 'SCOPE_REVIEW' THEN 'SCOPE_SUBMITTED'
    WHEN 'USER_STORY_REVIEW' THEN 'USER_STORIES_REVIEW_PENDING'
    WHEN 'DEVELOPER_ASSIGNED' THEN 'REQUEST_ASSIGNED'
    WHEN 'SPRINT_PLANNING' THEN 'SPRINT_CREATED'
    WHEN 'IN_DEVELOPMENT' THEN 'DEVELOPMENT_PROGRESS_UPDATED'
    WHEN 'QA_PENDING' THEN 'TESTING_PENDING'
    WHEN 'UAT_PENDING' THEN 'UAT_PENDING'
    WHEN 'DEPLOYMENT_PENDING' THEN 'DEPLOYMENT_PENDING'
    WHEN 'DEPLOYED' THEN 'REQUEST_DEPLOYED'
    ELSE 'REQUEST_AWAITING_ACTION'
  END,
  CASE r.status
    WHEN 'DEPARTMENT_APPROVAL_PENDING' THEN 'Department approval pending'
    WHEN 'IT_REVIEW_PENDING' THEN 'Internal review pending'
    WHEN 'PM_ASSIGNED' THEN 'Project assigned'
    WHEN 'SCOPE_REVIEW' THEN 'Scope review pending'
    WHEN 'USER_STORY_REVIEW' THEN 'User story review pending'
    WHEN 'DEVELOPER_ASSIGNED' THEN 'Development assigned'
    WHEN 'SPRINT_PLANNING' THEN 'Sprint planning ready'
    WHEN 'IN_DEVELOPMENT' THEN 'Development in progress'
    WHEN 'QA_PENDING' THEN 'QA review pending'
    WHEN 'UAT_PENDING' THEN 'UAT pending'
    WHEN 'DEPLOYMENT_PENDING' THEN 'Deployment pending'
    WHEN 'DEPLOYED' THEN 'Request deployed'
    ELSE 'Request awaiting action'
  END,
  CONCAT(r.request_number, ' - ', r.title, ' is at ', REPLACE(r.status, '_', ' '), '.'),
  FALSE
FROM requests r
WHERE r.current_assignee_user_id IS NOT NULL AND r.request_number LIKE 'RQ-%';

INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
SELECT r.requester_user_id, 'REQUEST_CREATED', 'REQUEST', r.id, NULL, JSON_OBJECT('requestNumber', r.request_number, 'status', r.status, 'priority', r.priority), '127.0.0.1', 'RequestOps compact demo seed'
FROM requests r WHERE r.request_number LIKE 'RQ-%';

DROP TEMPORARY TABLE IF EXISTS demo_task_numbers;
DROP TEMPORARY TABLE IF EXISTS demo_story_numbers;
DROP TEMPORARY TABLE IF EXISTS demo_request_plan;
DROP TEMPORARY TABLE IF EXISTS demo_departments;

COMMIT;
