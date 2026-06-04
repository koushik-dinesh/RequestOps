export const roleLabels = {
  SYSTEM_ADMIN: 'System Admin',
  EMPLOYEE: 'Employee',
  DEPARTMENT_HEAD: 'Department Head',
  IT_HEAD: 'IT Head',
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
  ASSIGNED: 'Team Assigned',
  IN_DEVELOPMENT: 'Work In Progress',
  DEVELOPMENT_COMPLETE: 'Ready For Review',
  IN_TESTING: 'Review & Validation',
  TEST_FAILED: 'Review Returned',
  UAT_PENDING: 'Final Approval Pending',
  UAT_REJECTED: 'Final Approval Returned',
  CLOSED: 'Completed',
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
