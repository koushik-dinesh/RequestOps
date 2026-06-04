const { query } = require('../config/database');
const { audit } = require('./activity');
const { ApiError } = require('./http');

const transitions = {
  DEPARTMENT_APPROVAL_PENDING: ['CLARIFICATION_REQUESTED', 'DEPARTMENT_REJECTED', 'IT_REVIEW_PENDING'],
  CLARIFICATION_REQUESTED: ['DEPARTMENT_APPROVAL_PENDING', 'IT_REVIEW_PENDING', 'IN_TESTING', 'UAT_PENDING'],
  IT_REVIEW_PENDING: ['CLARIFICATION_REQUESTED', 'IT_REJECTED', 'DEFERRED', 'ASSIGNMENT_PENDING'],
  ASSIGNMENT_PENDING: ['ASSIGNED'],
  ASSIGNED: ['IN_DEVELOPMENT'],
  IN_DEVELOPMENT: ['DEVELOPMENT_COMPLETE'],
  DEVELOPMENT_COMPLETE: ['IN_TESTING'],
  IN_TESTING: ['CLARIFICATION_REQUESTED', 'TEST_FAILED', 'UAT_PENDING'],
  TEST_FAILED: ['IN_DEVELOPMENT'],
  UAT_PENDING: ['CLARIFICATION_REQUESTED', 'UAT_REJECTED', 'CLOSED'],
  UAT_REJECTED: ['IN_DEVELOPMENT'],
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
