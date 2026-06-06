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
  DEFERRED: 'Deferred',
  ASSIGNMENT_PENDING: 'Waiting For Assignment',
  PM_ASSIGNED: 'Project Manager Assigned',
  SCOPE_REVIEW: 'Scope Review',
  USER_STORY_REVIEW: 'User Story Review',
  DEVELOPER_ASSIGNED: 'Developer Assigned',
  SPRINT_PLANNING: 'Sprint Planning',
  ASSIGNED: 'Team Assigned',
  IN_DEVELOPMENT: 'Work In Progress',
  DEVELOPMENT_COMPLETE: 'Ready For Review',
  QA_PENDING: 'QA Pending',
  QA_FAILED: 'QA Failed',
  QA_PASSED: 'QA Passed',
  IN_TESTING: 'Review & Validation',
  TEST_FAILED: 'Review Returned',
  UAT_PENDING: 'Final Approval Pending',
  UAT_FAILED: 'Final Approval Failed',
  UAT_APPROVED: 'Final Approval Approved',
  UAT_REJECTED: 'Final Approval Returned',
  DEPLOYMENT_PENDING: 'Deployment Pending',
  DEPLOYED: 'Deployed',
  CLOSED: 'Completed',
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
