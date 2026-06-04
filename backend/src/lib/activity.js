const { query } = require('../config/database');

async function audit({ actorUserId, action, entityType, entityId, oldValue, newValue, req }) {
  await query(
    `INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, old_value, new_value, ip_address, user_agent)
     VALUES (:actorUserId, :action, :entityType, :entityId, :oldValue, :newValue, :ipAddress, :userAgent)`,
    {
      actorUserId: actorUserId || null,
      action,
      entityType,
      entityId: entityId || null,
      oldValue: oldValue ? JSON.stringify(oldValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      ipAddress: req?.ip || null,
      userAgent: req?.headers?.['user-agent'] || null,
    },
  );
}

async function notify({ recipientUserId, requestId = null, type, title, message }) {
  if (!recipientUserId) return;
  await query(
    `INSERT INTO notifications (recipient_user_id, request_id, type, title, message)
     VALUES (:recipientUserId, :requestId, :type, :title, :message)`,
    { recipientUserId, requestId, type, title, message },
  );
}

async function notifyRole(roleCode, payload) {
  const users = await query(
    `SELECT u.id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.code = :roleCode AND u.status = 'ACTIVE'`,
    { roleCode },
  );

  await Promise.all(users.map((user) => notify({ ...payload, recipientUserId: user.id })));
}

module.exports = {
  audit,
  notify,
  notifyRole,
};
