export const roles = {
  ADMIN: 'SYSTEM_ADMIN',
  EMPLOYEE: 'EMPLOYEE',
  DEPARTMENT_HEAD: 'DEPARTMENT_HEAD',
  IT_HEAD: 'IT_HEAD',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  DEVELOPER: 'DEVELOPER',
  QA: 'QA',
  UAT: 'UAT_APPROVER',
};

export const routePermissions = {
  '/': ['*'],
  '/requests': ['*'],
  '/requests/new': [roles.EMPLOYEE],
  '/organization': ['*'],
  '/project-manager': [roles.ADMIN, roles.IT_HEAD, roles.PROJECT_MANAGER, roles.DEPARTMENT_HEAD],
  '/project-scopes': [roles.ADMIN, roles.IT_HEAD, roles.PROJECT_MANAGER],
  '/user-stories': [roles.ADMIN, roles.PROJECT_MANAGER, roles.DEPARTMENT_HEAD],
  '/sprints': [roles.ADMIN, roles.PROJECT_MANAGER],
  '/development': [roles.IT_HEAD, roles.PROJECT_MANAGER, roles.DEVELOPER, roles.ADMIN],
  '/developer-workload': ['*'],
  '/daily-progress-reports': [roles.ADMIN],
  '/testing': [roles.IT_HEAD, roles.PROJECT_MANAGER, roles.QA, roles.ADMIN],
  '/uat': [roles.PROJECT_MANAGER, roles.UAT, roles.ADMIN],
  '/notifications': ['*'],
  '/manual': ['*'],
  '/panel': [roles.ADMIN],
};

export function canAccess(roleCode, allowedRoles = []) {
  return allowedRoles.includes('*') || allowedRoles.includes(roleCode);
}

export function canCreateRequest(roleCode) {
  return roleCode === roles.EMPLOYEE;
}

export function canUseAdminConsole(roleCode) {
  return roleCode === roles.ADMIN;
}

export function canUseRequestScopeTabs(roleCode) {
  return [roles.ADMIN, roles.IT_HEAD, roles.PROJECT_MANAGER, roles.DEPARTMENT_HEAD].includes(roleCode);
}

export function getDefaultRequestScope(roleCode) {
  return roleCode === roles.EMPLOYEE ? 'mine' : 'department';
}
