const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { query, transaction } = require('../config/database');
const { audit, notify } = require('../lib/activity');
const { ApiError, asyncHandler, ok } = require('../lib/http');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, authorize('SYSTEM_ADMIN'));

router.get('/registrations', asyncHandler(async (req, res) => {
  const { status = '', search = '', departmentId = '' } = req.query;
  const rows = await query(
    `SELECT ur.id, ur.employee_id, ur.full_name, ur.email, ur.mobile_number, ur.designation,
            ur.status, ur.created_at, ur.reviewed_at, ur.rejection_reason,
            rd.name AS requested_department_name, ad.name AS approved_department_name,
            ar.name AS assigned_role_name, reviewer.full_name AS reviewed_by_name
     FROM user_registrations ur
     JOIN departments rd ON rd.id = ur.requested_department_id
     LEFT JOIN departments ad ON ad.id = ur.approved_department_id
     LEFT JOIN roles ar ON ar.id = ur.assigned_role_id
     LEFT JOIN users reviewer ON reviewer.id = ur.reviewed_by_user_id
     WHERE (:status = '' OR ur.status = :status)
       AND (:departmentId = '' OR ur.requested_department_id = :departmentId)
       AND (:search = '' OR ur.full_name LIKE CONCAT('%', :search, '%') OR ur.email LIKE CONCAT('%', :search, '%') OR ur.employee_id LIKE CONCAT('%', :search, '%'))
     ORDER BY ur.created_at DESC`,
    { status, search, departmentId },
  );
  ok(res, rows);
}));

router.get('/registrations/:id', asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM user_registrations WHERE id = :id', { id: req.params.id });
  if (!rows[0]) throw new ApiError(404, 'Registration not found.');
  ok(res, rows[0]);
}));

router.post('/registrations/:id/approve', asyncHandler(async (req, res) => {
  const body = z.object({
    departmentId: z.coerce.number().int().positive(),
    roleId: z.coerce.number().int().positive(),
  }).parse(req.body);

  const registrationRows = await query('SELECT * FROM user_registrations WHERE id = :id', { id: req.params.id });
  const registration = registrationRows[0];
  if (!registration) throw new ApiError(404, 'Registration not found.');
  if (registration.status !== 'PENDING_APPROVAL') throw new ApiError(409, 'Registration has already been reviewed.');
  const departmentRows = await query('SELECT department_head_user_id FROM departments WHERE id = :departmentId', { departmentId: body.departmentId });
  const reportingManagerUserId = departmentRows[0]?.department_head_user_id || null;

  const createdUserId = await transaction(async (connection) => {
    const [created] = await connection.execute(
      `INSERT INTO users
        (employee_id, full_name, email, mobile_number, designation, department_id, reporting_manager_user_id, role_id, password_hash, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')`,
      [
        registration.employee_id,
        registration.full_name,
        registration.email,
        registration.mobile_number,
        registration.designation,
        body.departmentId,
        reportingManagerUserId,
        body.roleId,
        registration.password_hash,
      ],
    );
    await connection.execute(
      `UPDATE user_registrations
       SET status = 'APPROVED', approved_department_id = ?, assigned_role_id = ?,
           reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP, created_user_id = ?
       WHERE id = ?`,
      [body.departmentId, body.roleId, req.user.id, created.insertId, req.params.id],
    );
    return created.insertId;
  });

  await notify({
    recipientUserId: createdUserId,
    type: 'REGISTRATION_APPROVED',
    title: 'Registration approved',
    message: 'Your RequestOps account is active.',
  });
  await audit({
    actorUserId: req.user.id,
    action: 'REGISTRATION_APPROVED',
    entityType: 'USER_REGISTRATION',
    entityId: registration.id,
    newValue: { createdUserId, departmentId: body.departmentId, roleId: body.roleId },
    req,
  });
  await audit({
    actorUserId: req.user.id,
    action: 'EMPLOYEE_CREATED',
    entityType: 'USER',
    entityId: createdUserId,
    newValue: { departmentId: body.departmentId, roleId: body.roleId, reportingManagerUserId },
    req,
  });

  ok(res, { id: registration.id, createdUserId, status: 'APPROVED' });
}));

router.post('/registrations/:id/reject', asyncHandler(async (req, res) => {
  const body = z.object({ reason: z.string().min(3) }).parse(req.body);
  const result = await query(
    `UPDATE user_registrations
     SET status = 'REJECTED', rejection_reason = :reason, reviewed_by_user_id = :reviewedBy,
         reviewed_at = CURRENT_TIMESTAMP
     WHERE id = :id AND status = 'PENDING_APPROVAL'`,
    { id: req.params.id, reason: body.reason, reviewedBy: req.user.id },
  );
  if (!result.affectedRows) throw new ApiError(404, 'Pending registration not found.');
  await audit({
    actorUserId: req.user.id,
    action: 'REGISTRATION_REJECTED',
    entityType: 'USER_REGISTRATION',
    entityId: req.params.id,
    newValue: { reason: body.reason },
    req,
  });
  ok(res, { id: Number(req.params.id), status: 'REJECTED' });
}));

router.get('/audit-logs', asyncHandler(async (req, res) => {
  const { action = '', entityType = '', userId = '', dateFrom = '', dateTo = '' } = req.query;
  const rows = await query(
    `SELECT al.*, u.full_name AS actor_name, u.email AS actor_email
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     WHERE (:action = '' OR al.action = :action)
       AND (:entityType = '' OR al.entity_type = :entityType)
       AND (:userId = '' OR al.actor_user_id = :userId)
       AND (:dateFrom = '' OR al.created_at >= :dateFrom)
       AND (:dateTo = '' OR al.created_at <= :dateTo)
     ORDER BY al.created_at DESC
     LIMIT 200`,
    { action, entityType, userId, dateFrom, dateTo },
  );
  ok(res, rows);
}));

router.post('/users/:id/reset-password', asyncHandler(async (req, res) => {
  const body = z.object({ password: z.string().min(8) }).parse(req.body);
  const passwordHash = await bcrypt.hash(body.password, 10);
  const result = await query('UPDATE users SET password_hash = :passwordHash WHERE id = :id', {
    id: req.params.id,
    passwordHash,
  });
  if (!result.affectedRows) throw new ApiError(404, 'User not found.');
  await audit({ actorUserId: req.user.id, action: 'USER_PASSWORD_RESET', entityType: 'USER', entityId: req.params.id, req });
  ok(res, { success: true });
}));

module.exports = router;
