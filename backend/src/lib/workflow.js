const { query } = require('../config/database');
const { audit } = require('./activity');
const { ApiError } = require('./http');

const transitions = {
  DEPARTMENT_APPROVAL_PENDING: ['CLARIFICATION_REQUESTED', 'DEPARTMENT_REJECTED', 'IT_REVIEW_PENDING'],
  CLARIFICATION_REQUESTED: ['DEPARTMENT_APPROVAL_PENDING', 'IT_REVIEW_PENDING', 'IN_TESTING', 'UAT_PENDING'],
  IT_REVIEW_PENDING: ['CLARIFICATION_REQUESTED', 'IT_REJECTED', 'DEFERRED', 'ASSIGNMENT_PENDING'],
  ASSIGNMENT_PENDING: ['PM_ASSIGNED', 'ASSIGNED'],
  PM_ASSIGNED: ['SCOPE_REVIEW', 'USER_STORY_REVIEW'],
  SCOPE_REVIEW: ['USER_STORY_REVIEW', 'PM_ASSIGNED'],
  USER_STORY_REVIEW: ['PM_ASSIGNED', 'SCOPE_REVIEW', 'DEVELOPER_ASSIGNED'],
  DEVELOPER_ASSIGNED: ['SPRINT_PLANNING', 'IN_DEVELOPMENT'],
  SPRINT_PLANNING: ['IN_DEVELOPMENT'],
  ASSIGNED: ['IN_DEVELOPMENT'],
  IN_DEVELOPMENT: ['DEVELOPMENT_COMPLETE', 'QA_PENDING'],
  DEVELOPMENT_COMPLETE: ['IN_TESTING', 'QA_PENDING'],
  IN_TESTING: ['CLARIFICATION_REQUESTED', 'TEST_FAILED', 'UAT_PENDING', 'QA_FAILED', 'QA_PASSED'],
  TEST_FAILED: ['IN_DEVELOPMENT'],
  QA_PENDING: ['CLARIFICATION_REQUESTED', 'QA_FAILED', 'QA_PASSED'],
  QA_FAILED: ['IN_DEVELOPMENT'],
  QA_PASSED: ['UAT_PENDING'],
  UAT_PENDING: ['CLARIFICATION_REQUESTED', 'UAT_REJECTED', 'UAT_FAILED', 'UAT_APPROVED', 'CLOSED'],
  UAT_REJECTED: ['IN_DEVELOPMENT'],
  UAT_FAILED: ['IN_DEVELOPMENT'],
  UAT_APPROVED: ['DEPLOYMENT_PENDING'],
  DEPLOYMENT_PENDING: ['DEPLOYED'],
  DEPLOYED: ['CLOSED'],
};

async function getRequestById(requestId) {
  const rows = await query('SELECT * FROM requests WHERE id = :requestId', { requestId });
  return rows[0];
}

function assertTransition(fromStatus, toStatus) {
  const allowed = transitions[fromStatus] || [];
  if (!allowed.includes(toStatus) && fromStatus !== toStatus) {
    throw new ApiError(409, `Cannot transition request from ${fromStatus} to ${toStatus}.`);
  }
}

async function transitionRequest({ requestId, toStatus, actorUserId, comment, req, patch = {} }) {
  const current = await getRequestById(requestId);
  if (!current) throw new ApiError(404, 'Request not found.');

  assertTransition(current.status, toStatus);

  const setFragments = ['status = :toStatus'];
  const params = { requestId, toStatus };
  Object.entries(patch).forEach(([key, value]) => {
    setFragments.push(`${key} = :${key}`);
    params[key] = value;
  });

  if (toStatus === 'CLOSED') {
    setFragments.push('closed_at = CURRENT_TIMESTAMP');
  }

  await query(`UPDATE requests SET ${setFragments.join(', ')} WHERE id = :requestId`, params);
  await query(
    `INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
     VALUES (:requestId, :fromStatus, :toStatus, :actorUserId, :comment)`,
    {
      requestId,
      fromStatus: current.status,
      toStatus,
      actorUserId,
      comment: comment || null,
    },
  );
  await audit({
    actorUserId,
    action: 'REQUEST_STATUS_CHANGED',
    entityType: 'REQUEST',
    entityId: requestId,
    oldValue: { status: current.status },
    newValue: { status: toStatus, ...patch },
    req,
  });

  return getRequestById(requestId);
}

module.exports = {
  getRequestById,
  transitionRequest,
};
