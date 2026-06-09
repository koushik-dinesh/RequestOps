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

SET @demo_password = '$2b$10$iJG8PLVADbjsnvOD8mjCVeq9YFh0nxPx0fVh5lYz7TXhwak10E2qu';

INSERT INTO users (employee_id, full_name, email, mobile_number, designation, department_id, role_id, password_hash, status)
VALUES
  ('VIO-0001', 'Aarav Admin', 'admin@violin.local', '+91-90000-00001', 'System Admin / Head / CEO', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'SYSTEM_ADMIN'), @demo_password, 'ACTIVE'),
  ('VIO-0002', 'Fiona Finance', 'finance.head@violin.local', '+91-90000-00002', 'Department Head', (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE'),
  ('VIO-0003', 'Ishaan IT', 'it.head@violin.local', '+91-90000-00003', 'IT Head', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'IT_HEAD'), @demo_password, 'ACTIVE'),
  ('VIO-0004', 'Devika Team Member', 'developer@violin.local', '+91-90000-00004', 'Developer', (SELECT id FROM departments WHERE code = 'IT'), (SELECT id FROM roles WHERE code = 'DEVELOPER'), @demo_password, 'ACTIVE'),
  ('VIO-0005', 'Quinn Reviewer', 'qa@violin.local', '+91-90000-00005', 'QA', (SELECT id FROM departments WHERE code = 'QLT'), (SELECT id FROM roles WHERE code = 'QA'), @demo_password, 'ACTIVE'),
  ('VIO-0006', 'Uma Final Approver', 'uat@violin.local', '+91-90000-00006', 'Department Head', (SELECT id FROM departments WHERE code = 'OPS'), (SELECT id FROM roles WHERE code = 'UAT_APPROVER'), @demo_password, 'ACTIVE'),
  ('VIO-0007', 'John Smith', 'john.smith@violin.local', '+91-90000-00007', 'Employee', (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE'),
  ('VIO-0008', 'Harish Quality', 'quality.head@violin.local', '+91-90000-00008', 'Department Head', (SELECT id FROM departments WHERE code = 'QLT'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE'),
  ('VIO-0009', 'Rahul Menon', 'operations.head@violin.local', '+91-90000-00009', 'Department Head', (SELECT id FROM departments WHERE code = 'OPS'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE'),
  ('VIO-0010', 'Vivek Operations', 'vivek.operations@violin.local', '+91-90000-00010', 'Employee', (SELECT id FROM departments WHERE code = 'OPS'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE'),
  ('VIO-0011', 'Meera Nair', 'administration.head@violin.local', '+91-90000-00011', 'Department Head', (SELECT id FROM departments WHERE code = 'ADM'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE'),
  ('VIO-0012', 'Sneha Reddy', 'bd.head@violin.local', '+91-90000-00012', 'Department Head', (SELECT id FROM departments WHERE code = 'BD'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE'),
  ('VIO-0013', 'Ananya Iyer', 'engineering.head@violin.local', '+91-90000-00013', 'Department Head', (SELECT id FROM departments WHERE code = 'ENG'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE'),
  ('VIO-0014', 'Aisha Finance', 'aisha.finance@violin.local', '+91-90000-00014', 'Employee', (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM roles WHERE code = 'EMPLOYEE'), @demo_password, 'ACTIVE'),
  ('VIO-0015', 'Priya Sharma', 'hr.head@violin.local', '+91-90000-00015', 'Department Head', (SELECT id FROM departments WHERE code = 'HR'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE'),
  ('VIO-0016', 'Deepak Rao', 'procurement.head@violin.local', '+91-90000-00016', 'Department Head', (SELECT id FROM departments WHERE code = 'PRC'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE'),
  ('VIO-0017', 'Suresh Babu', 'production.head@violin.local', '+91-90000-00017', 'Department Head', (SELECT id FROM departments WHERE code = 'PRD'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE'),
  ('VIO-0018', 'Rohan Mehta', 'sales.marketing.head@violin.local', '+91-90000-00018', 'Department Head', (SELECT id FROM departments WHERE code = 'SAM'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE'),
  ('VIO-0019', 'Kavya Nandakumar', 'supply.chain.head@violin.local', '+91-90000-00019', 'Department Head', (SELECT id FROM departments WHERE code = 'SCM'), (SELECT id FROM roles WHERE code = 'DEPARTMENT_HEAD'), @demo_password, 'ACTIVE')
ON DUPLICATE KEY UPDATE
  full_name = VALUES(full_name),
  mobile_number = VALUES(mobile_number),
  designation = VALUES(designation),
  department_id = VALUES(department_id),
  role_id = VALUES(role_id),
  status = VALUES(status);

UPDATE departments SET department_head_user_id = (SELECT id FROM users WHERE email = 'finance.head@violin.local') WHERE code = 'FIN';
UPDATE departments SET department_head_user_id = (SELECT id FROM users WHERE email = 'it.head@violin.local') WHERE code = 'IT';
UPDATE departments SET department_head_user_id = (SELECT id FROM users WHERE email = 'operations.head@violin.local') WHERE code = 'OPS';
UPDATE departments SET department_head_user_id = (SELECT id FROM users WHERE email = 'quality.head@violin.local') WHERE code = 'QLT';
UPDATE departments SET department_head_user_id = (SELECT id FROM users WHERE email = 'administration.head@violin.local') WHERE code = 'ADM';
UPDATE departments SET department_head_user_id = (SELECT id FROM users WHERE email = 'bd.head@violin.local') WHERE code = 'BD';
UPDATE departments SET department_head_user_id = (SELECT id FROM users WHERE email = 'engineering.head@violin.local') WHERE code = 'ENG';
UPDATE departments SET department_head_user_id = (SELECT id FROM users WHERE email = 'hr.head@violin.local') WHERE code = 'HR';
UPDATE departments SET department_head_user_id = (SELECT id FROM users WHERE email = 'procurement.head@violin.local') WHERE code = 'PRC';
UPDATE departments SET department_head_user_id = (SELECT id FROM users WHERE email = 'production.head@violin.local') WHERE code = 'PRD';
UPDATE departments SET department_head_user_id = (SELECT id FROM users WHERE email = 'sales.marketing.head@violin.local') WHERE code = 'SAM';
UPDATE departments SET department_head_user_id = (SELECT id FROM users WHERE email = 'supply.chain.head@violin.local') WHERE code = 'SCM';

INSERT INTO user_registrations (
  employee_id, full_name, email, mobile_number, designation, requested_department_id, password_hash, status
) VALUES (
  'VIO-0020', 'Priya Pending', 'priya.pending@violin.local', '+91-90000-00099', 'Employee', (SELECT id FROM departments WHERE code = 'OPS'), @demo_password, 'PENDING_APPROVAL'
)
ON DUPLICATE KEY UPDATE designation = VALUES(designation), requested_department_id = VALUES(requested_department_id);

INSERT INTO requests (
  request_number, title, request_type, priority, business_justification, description, expected_benefits,
  status, requester_user_id, requester_department_id, department_head_user_id, it_head_user_id, current_assignee_user_id,
  progress_percentage, feasibility_notes, complexity, estimated_effort, priority_confirmation
) VALUES
  ('RQ-001', 'Automate vendor payment approval report', 'REPORT', 'HIGH', 'Manual reporting delays month-end closure.', 'Create an automated report for vendor payment approval aging and exception tracking.', 'Reduce manual work and improve compliance visibility.', 'DEPARTMENT_APPROVAL_PENDING', (SELECT id FROM users WHERE email = 'john.smith@violin.local'), (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM users WHERE email = 'finance.head@violin.local'), NULL, (SELECT id FROM users WHERE email = 'finance.head@violin.local'), 0, NULL, NULL, NULL, NULL),
  ('RQ-002', 'Integrate CRM lead source with finance dashboard', 'INTEGRATION', 'MEDIUM', 'Finance needs better revenue source attribution.', 'Sync CRM lead source data into the finance dashboard for pipeline analysis.', 'Improve forecast accuracy.', 'IN_DEVELOPMENT', (SELECT id FROM users WHERE email = 'john.smith@violin.local'), (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM users WHERE email = 'finance.head@violin.local'), (SELECT id FROM users WHERE email = 'it.head@violin.local'), (SELECT id FROM users WHERE email = 'developer@violin.local'), 45, 'Technically feasible using existing CRM API.', 'MEDIUM', '5 business days', 'MEDIUM'),
  ('RQ-003', 'Resolve invoice export rounding issue', 'BUG_FIX', 'CRITICAL', 'Incorrect rounding causes reconciliation effort.', 'Correct rounding logic in the invoice CSV export for tax-inclusive invoices.', 'Reduce reconciliation errors.', 'UAT_PENDING', (SELECT id FROM users WHERE email = 'john.smith@violin.local'), (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM users WHERE email = 'finance.head@violin.local'), (SELECT id FROM users WHERE email = 'it.head@violin.local'), (SELECT id FROM users WHERE email = 'uat@violin.local'), 100, 'Small isolated update in export service.', 'LOW', '1 business day', 'CRITICAL'),
  ('RQ-004', 'Standardize monthly accrual upload template', 'ENHANCEMENT', 'MEDIUM', 'Finance operations receives inconsistent accrual files from business teams.', 'Create a standard upload template with validation rules for monthly accrual submissions.', 'Reduce rework and improve close cycle accuracy.', 'DEPARTMENT_APPROVAL_PENDING', (SELECT id FROM users WHERE email = 'aisha.finance@violin.local'), (SELECT id FROM departments WHERE code = 'FIN'), (SELECT id FROM users WHERE email = 'finance.head@violin.local'), NULL, (SELECT id FROM users WHERE email = 'finance.head@violin.local'), 0, NULL, NULL, NULL, NULL)
ON DUPLICATE KEY UPDATE
  title = VALUES(title),
  status = VALUES(status),
  current_assignee_user_id = VALUES(current_assignee_user_id),
  progress_percentage = VALUES(progress_percentage);

INSERT INTO assignments (request_id, developer_user_id, qa_user_id, assigned_by_user_id, is_active, notes)
SELECT r.id, d.id, q.id, it.id, TRUE, 'Seed assignment for demo workflow.'
FROM requests r
JOIN users d ON d.email = 'developer@violin.local'
JOIN users q ON q.email = 'qa@violin.local'
JOIN users it ON it.email = 'it.head@violin.local'
WHERE r.request_number IN ('RQ-002', 'RQ-003')
AND NOT EXISTS (SELECT 1 FROM assignments a WHERE a.request_id = r.id AND a.is_active = TRUE);

INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
SELECT r.id, NULL, 'SUBMITTED', u.id, 'Request submitted for demo data.'
FROM requests r
JOIN users u ON u.id = r.requester_user_id
WHERE NOT EXISTS (SELECT 1 FROM request_status_history h WHERE h.request_id = r.id);

INSERT INTO notifications (recipient_user_id, request_id, type, title, message)
SELECT u.id, r.id, 'REQUEST_AWAITING_ACTION', 'Request awaiting action', CONCAT(r.request_number, ' is ready for your review.')
FROM requests r
JOIN users u ON u.id = r.current_assignee_user_id
WHERE r.current_assignee_user_id IS NOT NULL
AND NOT EXISTS (
  SELECT 1 FROM notifications n WHERE n.recipient_user_id = u.id AND n.request_id = r.id AND n.type = 'REQUEST_AWAITING_ACTION'
);
