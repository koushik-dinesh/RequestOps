-- RequestOps Demo 2 seed dataset.
-- Engine: MySQL
-- Safe to run repeatedly in development.
-- Common demo password for every user: Password123!

START TRANSACTION;

SET @demo2_password_hash = '$2b$10$iJG8PLVADbjsnvOD8mjCVeq9YFh0nxPx0fVh5lYz7TXhwak10E2qu';

INSERT INTO roles (code, name, description, is_active) VALUES
  ('SYSTEM_ADMIN', 'System Admin', 'Owns system configuration, users, departments, and audit visibility.', TRUE),
  ('EMPLOYEE', 'Employee', 'Creates and tracks software requests.', TRUE),
  ('DEPARTMENT_HEAD', 'Department Head', 'Approves or rejects requests for a department.', TRUE),
  ('IT_HEAD', 'IT Head', 'Reviews feasibility, prioritizes, and assigns work owners.', TRUE),
  ('PROJECT_MANAGER', 'Project Manager', 'Owns scope definition, user stories, sprint planning, developer assignment, and delivery tracking.', TRUE),
  ('DEVELOPER', 'Developer', 'Works on assigned delivery tasks and resolves blockers.', TRUE),
  ('QA', 'QA Engineer', 'Reviews and validates completed delivery work.', TRUE)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  is_active = TRUE;

INSERT INTO departments (name, code, description, status) VALUES
  ('IT', 'IT', 'Technology, delivery, QA, and application administration.', 'ACTIVE'),
  ('Finance', 'FIN', 'Finance and accounting operations.', 'ACTIVE'),
  ('HR', 'HR', 'Human resources and employee operations.', 'ACTIVE'),
  ('Operations', 'OPS', 'Business operations and execution teams.', 'ACTIVE'),
  ('Sales', 'SALES', 'Sales and customer-facing business operations.', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  status = 'ACTIVE';

DROP TEMPORARY TABLE IF EXISTS demo2_users;
CREATE TEMPORARY TABLE demo2_users (
  employee_id VARCHAR(50) PRIMARY KEY,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  mobile_number VARCHAR(30) NULL,
  designation VARCHAR(150) NOT NULL,
  department_code VARCHAR(50) NOT NULL,
  role_code VARCHAR(50) NOT NULL,
  reporting_manager_email VARCHAR(255) NULL
);

INSERT INTO demo2_users
  (employee_id, full_name, email, mobile_number, designation, department_code, role_code, reporting_manager_email)
VALUES
  ('D2-0001', 'Admin 059 Kumar', 'otherusage059@gmail.com', '+91-93000-00001', 'System Admin', 'IT', 'SYSTEM_ADMIN', 'ddurai@gmail.com'),
  ('D2-0002', 'Admin Rajesh Sharma', 'random@gmail.com', '+91-93000-00002', 'System Admin', 'IT', 'SYSTEM_ADMIN', 'ddurai@gmail.com'),
  ('D2-0003', 'Dinesh Durai', 'ddurai@gmail.com', '+91-93000-00003', 'IT Head', 'IT', 'IT_HEAD', NULL),
  ('D2-0004', 'Koushik Dinesh', 'hello2koushik@gmail.com', '+91-93000-00004', 'Project Manager', 'IT', 'PROJECT_MANAGER', 'ddurai@gmail.com'),
  ('D2-0005', 'Sarika Dinesh', 'sarikakoushik4coding@gmail.com', '+91-93000-00005', 'QA Engineer', 'IT', 'QA', 'ddurai@gmail.com'),
  ('D2-0006', 'Arjun Developer', 'developer1@requestops.demo', '+91-93000-00006', 'Developer', 'IT', 'DEVELOPER', 'ddurai@gmail.com'),
  ('D2-0007', 'Priya Developer', 'developer2@requestops.demo', '+91-93000-00007', 'Developer', 'IT', 'DEVELOPER', 'ddurai@gmail.com'),
  ('D2-0008', 'Finance Head', 'finance.head@requestops.demo', '+91-93000-00008', 'Department Head', 'FIN', 'DEPARTMENT_HEAD', NULL),
  ('D2-0009', 'Finance Employee 058', 'otherusage058@gmail.com', '+91-93000-00009', 'Employee', 'FIN', 'EMPLOYEE', 'finance.head@requestops.demo'),
  ('D2-0010', 'Meera Nair', 'finance.emp2@requestops.demo', '+91-93000-00010', 'Employee', 'FIN', 'EMPLOYEE', 'finance.head@requestops.demo'),
  ('D2-0011', 'Anita Rao', 'hr.head@requestops.demo', '+91-93000-00011', 'Department Head', 'HR', 'DEPARTMENT_HEAD', NULL),
  ('D2-0012', 'Rahul Verma', 'hr.emp1@requestops.demo', '+91-93000-00012', 'Employee', 'HR', 'EMPLOYEE', 'hr.head@requestops.demo'),
  ('D2-0013', 'Kavya Menon', 'hr.emp2@requestops.demo', '+91-93000-00013', 'Employee', 'HR', 'EMPLOYEE', 'hr.head@requestops.demo'),
  ('D2-0014', 'Sathya Dinesh', 'sathyadinesh82@gmail.com', '+91-93000-00014', 'Department Head', 'OPS', 'DEPARTMENT_HEAD', NULL),
  ('D2-0015', 'Naveen Reddy', 'operations.emp1@requestops.demo', '+91-93000-00015', 'Employee', 'OPS', 'EMPLOYEE', 'sathyadinesh82@gmail.com'),
  ('D2-0016', 'Pooja Singh', 'operations.emp2@requestops.demo', '+91-93000-00016', 'Employee', 'OPS', 'EMPLOYEE', 'sathyadinesh82@gmail.com'),
  ('D2-0017', 'Vikram Shah', 'sales.head@requestops.demo', '+91-93000-00017', 'Department Head', 'SALES', 'DEPARTMENT_HEAD', NULL),
  ('D2-0018', 'Akash Kumar', 'sales.emp1@requestops.demo', '+91-93000-00018', 'Employee', 'SALES', 'EMPLOYEE', 'sales.head@requestops.demo'),
  ('D2-0019', 'Neha Joshi', 'sales.emp2@requestops.demo', '+91-93000-00019', 'Employee', 'SALES', 'EMPLOYEE', 'sales.head@requestops.demo');

INSERT INTO users (
  employee_id,
  full_name,
  email,
  mobile_number,
  designation,
  department_id,
  reporting_manager_user_id,
  role_id,
  password_hash,
  auth_provider,
  status,
  employment_status,
  exit_date
)
SELECT
  demo.employee_id,
  demo.full_name,
  demo.email,
  demo.mobile_number,
  demo.designation,
  department.id,
  NULL,
  role.id,
  @demo2_password_hash,
  'LOCAL',
  'ACTIVE',
  'ACTIVE',
  NULL
FROM demo2_users demo
JOIN departments department ON department.code = demo.department_code
JOIN roles role ON role.code = demo.role_code
ON DUPLICATE KEY UPDATE
  employee_id = VALUES(employee_id),
  full_name = VALUES(full_name),
  email = VALUES(email),
  mobile_number = VALUES(mobile_number),
  designation = VALUES(designation),
  department_id = VALUES(department_id),
  role_id = VALUES(role_id),
  password_hash = VALUES(password_hash),
  auth_provider = 'LOCAL',
  status = 'ACTIVE',
  employment_status = 'ACTIVE',
  exit_date = NULL;

UPDATE users target
JOIN demo2_users demo ON demo.email = target.email
LEFT JOIN users manager ON manager.email = demo.reporting_manager_email
SET target.reporting_manager_user_id = manager.id;

UPDATE departments department
JOIN users head ON head.email = CASE department.code
  WHEN 'IT' THEN 'ddurai@gmail.com'
  WHEN 'FIN' THEN 'finance.head@requestops.demo'
  WHEN 'HR' THEN 'hr.head@requestops.demo'
  WHEN 'OPS' THEN 'sathyadinesh82@gmail.com'
  WHEN 'SALES' THEN 'sales.head@requestops.demo'
END
SET department.department_head_user_id = head.id
WHERE department.code IN ('IT', 'FIN', 'HR', 'OPS', 'SALES');

COMMIT;

SELECT
  seeded_user.full_name AS user_name,
  seeded_user.email,
  department.name AS department,
  role.name AS role
FROM users seeded_user
JOIN demo2_users demo ON demo.email = seeded_user.email
JOIN departments department ON department.id = seeded_user.department_id
JOIN roles role ON role.id = seeded_user.role_id
ORDER BY demo.employee_id;
