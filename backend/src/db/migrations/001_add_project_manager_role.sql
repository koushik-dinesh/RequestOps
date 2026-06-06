INSERT INTO roles (code, name, description)
VALUES (
  'PROJECT_MANAGER',
  'Project Manager',
  'Owns scope definition, user stories, sprint planning, developer assignment, and delivery tracking.'
)
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  description = VALUES(description),
  is_active = TRUE;
