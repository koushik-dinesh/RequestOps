export const AUTO_EXECUTE_WORKFLOW_ACTIONS = new Set([
  'department-approve',
  'it-resume',
  'uat-approve',
  'start-development',
  'requirements-approve',
]);

export const NAVIGATION_WORKFLOW_ACTIONS = {
  'open-scope-management': '/project-scopes',
  'open-story-management': '/user-stories',
};

export const WORKFLOW_ACTION_MESSAGES = {
  'department-approve': 'Department approval submitted from your email action.',
  'it-resume': 'Deferred request resumed from your email action.',
  'uat-approve': 'User testing approval submitted from your email action.',
  'start-development': 'Work started from your email action.',
  'requirements-approve': 'Requirements approval submitted from your email action.',
  'withdraw-request': 'Withdraw Request selected from your email. Add a reason and submit to withdraw this request.',
};
