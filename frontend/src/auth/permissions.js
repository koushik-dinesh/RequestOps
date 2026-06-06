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
  '/development': [roles.IT_HEAD, roles.DEVELOPER, roles.ADMIN],
  '/developer-workload': [roles.ADMIN, roles.IT_HEAD, roles.PROJECT_MANAGER, roles.DEVELOPER, roles.QA],
  '/testing': [roles.IT_HEAD, roles.QA, roles.ADMIN],
  '/uat': [roles.UAT, roles.ADMIN],
  '/notifications': ['*'],
  '/manual': ['*'],
  '/admin': [roles.ADMIN],
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
  return [roles.ADMIN, roles.IT_HEAD, roles.DEPARTMENT_HEAD].includes(roleCode);
}

export function getDefaultRequestScope(roleCode) {
  return roleCode === roles.EMPLOYEE ? 'mine' : 'department';
}
