INSERT INTO departments (name, code, description, status) VALUES
  ('IT', 'IT', 'Internal technology and software delivery.', 'ACTIVE')
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  status = VALUES(status);
