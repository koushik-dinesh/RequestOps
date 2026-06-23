export const roleLabels = {
  SYSTEM_ADMIN: 'System Admin',
  EMPLOYEE: 'Employee',
  DEPARTMENT_HEAD: 'Department Head',
  IT_HEAD: 'IT Head',
  PROJECT_MANAGER: 'Project Manager',
  DEVELOPER: 'Assigned Team Member',
  QA: 'Reviewer',
  UAT_APPROVER: 'Final Approver',
};

/** Roles users may request via profile → New Role Access Request (excludes System Admin). */
export const requestableRoleCodes = [
  'EMPLOYEE',
  'DEPARTMENT_HEAD',
  'IT_HEAD',
  'PROJECT_MANAGER',
  'DEVELOPER',
  'QA',
  'UAT_APPROVER',
];

/** Friendly labels for the role access request dropdown. */
export const roleRequestLabels = {
  ...roleLabels,
  DEVELOPER: 'Developer',
};

/** System console route and API prefix (CloudFront-safe; avoids "admin" in URLs). */
export const panelRoute = '/panel';
export const panelApiPrefix = '/panel';

/** Request statuses where workflow actions are no longer allowed. */
export const terminalRequestStatuses = ['CLOSED', 'DEPARTMENT_REJECTED', 'IT_REJECTED', 'WITHDRAWN'];

export const requestTypes = [
  'NEW_FEATURE',
  'ENHANCEMENT',
  'BUG_FIX',
  'AUTOMATION',
  'INTEGRATION',
  'REPORT',
  'OTHER',
];

export const priorities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const missingReportingAuthorityText = 'No person found to report at this level';

export const statusLabels = {
  SUBMITTED: 'Submitted',
  DEPARTMENT_APPROVAL_PENDING: 'Department Approval Pending',
  CLARIFICATION_REQUESTED: 'Waiting For More Information',
  DEPARTMENT_REJECTED: 'Department Rejected',
  IT_REVIEW_PENDING: 'Internal Review Pending',
  IT_REJECTED: 'Internal Review Rejected',
  WITHDRAWN: 'Withdrawn',
  DEFERRED: 'Deferred',
  ASSIGNMENT_PENDING: 'Waiting For Assignment',
  PM_ASSIGNED: 'Project Manager Assigned',
  SCOPE_REVIEW: 'Scope Review',
  USER_STORY_REVIEW: 'User Story Review',
  REQUIREMENTS_DEPARTMENT_REVIEW: 'Department HOD Review',
  REQUIREMENTS_PM_REVIEW: 'Project Manager Review',
  REQUIREMENTS_IT_REVIEW: 'IT HOD Review',
  REQUIREMENTS_CLARIFICATION_REQUESTED: 'Requirements Clarification',
  REQUIREMENTS_APPROVED: 'Requirements Approved',
  DEVELOPER_ASSIGNED: 'Developer Assigned',
  SPRINT_PLANNING: 'Sprint Planning',
  SPRINT_CREATED: 'Sprint Created',
  SPRINT_ACTIVE: 'Sprint Active',
  ASSIGNED: 'Team Assigned',
  IN_DEVELOPMENT: 'Work In Progress',
  DEVELOPMENT_COMPLETE: 'Ready For Review',
  QA_PENDING: 'QA Pending',
  QA_FAILED: 'QA Failed',
  QA_PASSED: 'QA Passed',
  IN_TESTING: 'Review & Validation',
  TEST_FAILED: 'Review Returned',
  UAT_PENDING: 'Requester UAT for Pre-Deployment',
  UAT_FAILED: 'Requester UAT for Pre-Deployment Failed',
  UAT_APPROVED: 'Requester UAT Approved',
  UAT_REJECTED: 'Requester UAT Returned',
  DEPLOYMENT_PENDING: 'Final Deployment Pending',
  DEPLOYED: 'Deployed',
  READY_FOR_COMPLETION: 'Ready For Completion',
  CLOSED: 'Sign-Off',
  DRAFT: 'Draft',
  APPROVED: 'Approved',
  REWORK_REQUIRED: 'Rework Required',
  PLANNED: 'Planned',
  CREATED: 'Created',
  ACTIVE: 'Active',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  BLOCKED: 'Blocked',
  DONE: 'Done',
};

export const requestTypeLabels = {
  NEW_FEATURE: 'New Capability',
  ENHANCEMENT: 'Improvement',
  BUG_FIX: 'Issue Resolution',
  AUTOMATION: 'Automation',
  INTEGRATION: 'Integration',
  REPORT: 'Report',
  OTHER: 'Other',
};

export function formatEnum(value) {
  return statusLabels[value] || roleLabels[value] || requestTypeLabels[value] || String(value || '').replaceAll('_', ' ');
}
