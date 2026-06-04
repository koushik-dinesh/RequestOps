const express = require('express');
const { z } = require('zod');
const { query } = require('../config/database');
const { audit } = require('../lib/activity');
const { ApiError, asyncHandler, ok } = require('../lib/http');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  const { status = '', search = '' } = req.query;
  const rows = await query(
    `SELECT d.id, d.name, d.code, d.description, d.status, d.department_head_user_id,
            u.full_name AS department_head_name, u.email AS department_head_email
     FROM departments d
     LEFT JOIN users u ON u.id = d.department_head_user_id
     WHERE (:status = '' OR d.status = :status)
       AND (:search = '' OR d.name LIKE CONCAT('%', :search, '%') OR d.code LIKE CONCAT('%', :search, '%'))
     ORDER BY d.name`,
    { status, search },
  );
  ok(res, rows);
}));

router.use(authenticate);

router.get('/directory', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT d.id, d.name, d.code, d.description, d.status, d.department_head_user_id,
            head.full_name AS department_head_name, head.email AS department_head_email,
            COUNT(DISTINCT active_users.id) AS employee_count,
            COUNT(DISTINCT pending_requests.id) AS pending_request_count
     FROM departments d
     LEFT JOIN users head ON head.id = d.department_head_user_id
     LEFT JOIN users active_users ON active_users.department_id = d.id AND active_users.status = 'ACTIVE'
     LEFT JOIN requests pending_requests
       ON pending_requests.requester_department_id = d.id
      AND pending_requests.status IN ('DEPARTMENT_APPROVAL_PENDING', 'CLARIFICATION_REQUESTED', 'IT_REVIEW_PENDING', 'ASSIGNMENT_PENDING', 'ASSIGNED', 'IN_DEVELOPMENT', 'IN_TESTING', 'UAT_PENDING')
     WHERE d.status = 'ACTIVE'
     GROUP BY d.id, d.name, d.code, d.description, d.status, d.department_head_user_id, head.full_name, head.email
     ORDER BY d.name`,
  );
  ok(res, rows);
}));

router.post('/', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string().min(2),
    code: z.string().min(2).max(20),
    description: z.string().optional().nullable(),
    departmentHeadUserId: z.coerce.number().int().positive().optional().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']).default('ACTIVE'),
  }).parse(req.body);

  const result = await query(
    `INSERT INTO departments (name, code, description, department_head_user_id, status)
     VALUES (:name, :code, :description, :departmentHeadUserId, :status)`,
    {
      name: body.name,
      code: body.code.toUpperCase(),
      description: body.description || null,
      departmentHeadUserId: body.departmentHeadUserId || null,
      status: body.status,
    },
  );
  await audit({ actorUserId: req.user.id, action: 'DEPARTMENT_CREATED', entityType: 'DEPARTMENT', entityId: result.insertId, newValue: body, req });
  ok(res, { id: result.insertId, ...body }, 201);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const rows = await query('SELECT * FROM departments WHERE id = :id', { id: req.params.id });
  if (!rows[0]) throw new ApiError(404, 'Department not found.');
  ok(res, rows[0]);
}));

router.patch('/:id', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  const body = z.object({
    name: z.string().min(2).optional(),
    code: z.string().min(2).max(20).optional(),
    description: z.string().optional().nullable(),
    departmentHeadUserId: z.coerce.number().int().positive().optional().nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  }).parse(req.body);

  const existing = await query('SELECT * FROM departments WHERE id = :id', { id: req.params.id });
  if (!existing[0]) throw new ApiError(404, 'Department not found.');

  const updates = {
    name: body.name,
    code: body.code?.toUpperCase(),
    description: body.description,
    department_head_user_id: body.departmentHeadUserId,
    status: body.status,
  };
  const set = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (!set.length) return ok(res, existing[0]);

  await query(
    `UPDATE departments SET ${set.map(([key]) => `${key} = :${key}`).join(', ')} WHERE id = :id`,
    { id: req.params.id, ...Object.fromEntries(set) },
  );
  await audit({ actorUserId: req.user.id, action: 'DEPARTMENT_UPDATED', entityType: 'DEPARTMENT', entityId: req.params.id, oldValue: existing[0], newValue: body, req });
  ok(res, { id: Number(req.params.id), ...body });
}));

router.patch('/:id/head', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  const body = z.object({ departmentHeadUserId: z.coerce.number().int().positive().nullable() }).parse(req.body);
  await query('UPDATE departments SET department_head_user_id = :departmentHeadUserId WHERE id = :id', {
    id: req.params.id,
    departmentHeadUserId: body.departmentHeadUserId,
  });
  await audit({ actorUserId: req.user.id, action: 'DEPARTMENT_HEAD_CHANGED', entityType: 'DEPARTMENT', entityId: req.params.id, newValue: body, req });
  ok(res, { id: Number(req.params.id), ...body });
}));

router.post('/:id/activate', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  await query("UPDATE departments SET status = 'ACTIVE' WHERE id = :id", { id: req.params.id });
  await audit({ actorUserId: req.user.id, action: 'DEPARTMENT_ACTIVATED', entityType: 'DEPARTMENT', entityId: req.params.id, req });
  ok(res, { id: Number(req.params.id), status: 'ACTIVE' });
}));

router.post('/:id/deactivate', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  await query("UPDATE departments SET status = 'INACTIVE' WHERE id = :id", { id: req.params.id });
  await audit({ actorUserId: req.user.id, action: 'DEPARTMENT_DEACTIVATED', entityType: 'DEPARTMENT', entityId: req.params.id, req });
  ok(res, { id: Number(req.params.id), status: 'INACTIVE' });
}));

module.exports = router;
