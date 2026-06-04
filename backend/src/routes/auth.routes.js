const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const env = require('../config/env');
const { query } = require('../config/database');
const { audit, notifyRole } = require('../lib/activity');
const { ApiError, asyncHandler, ok } = require('../lib/http');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const registerSchema = z.object({
  fullName: z.string().min(2),
  employeeId: z.string().min(2),
  email: z.string().email(),
  mobileNumber: z.string().min(5).optional().nullable(),
  designation: z.string().min(2),
  departmentId: z.coerce.number().int().positive(),
  password: z.string().min(8),
  confirmPassword: z.string().min(8),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match.',
  path: ['confirmPassword'],
});

function signTokens(user) {
  const payload = {
    sub: user.id,
    role: user.role_code,
    email: user.email,
  };

  return {
    accessToken: jwt.sign(payload, env.jwt.accessSecret, { expiresIn: env.jwt.accessExpiresIn }),
    refreshToken: jwt.sign(payload, env.jwt.refreshSecret, { expiresIn: env.jwt.refreshExpiresIn }),
  };
}

router.get('/providers', (_req, res) => {
  ok(res, [
    { code: 'LOCAL', name: 'Email and password', enabled: true },
    { code: 'MICROSOFT_ENTRA', name: 'Microsoft Entra ID', enabled: false },
  ]);
});

router.get('/designations', asyncHandler(async (_req, res) => {
  ok(res, [
    'System Admin / Head / CEO',
    'IT Head',
    'IT Manager',
    'Developer',
    'QA',
    'Department Head',
    'Employee',
  ]);
}));

router.post('/register', asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);
  const existingUsers = await query(
    'SELECT id FROM users WHERE email = :email OR employee_id = :employeeId',
    { email: body.email, employeeId: body.employeeId },
  );
  if (existingUsers.length) throw new ApiError(409, 'A user already exists with this email or employee ID.');

  const existingRegistrations = await query(
    `SELECT id FROM user_registrations
     WHERE (email = :email OR employee_id = :employeeId) AND status = 'PENDING_APPROVAL'`,
    { email: body.email, employeeId: body.employeeId },
  );
  if (existingRegistrations.length) throw new ApiError(409, 'Registration is already pending approval.');

  const passwordHash = await bcrypt.hash(body.password, 10);
  const result = await query(
    `INSERT INTO user_registrations
      (employee_id, full_name, email, mobile_number, designation, requested_department_id, password_hash)
     VALUES (:employeeId, :fullName, :email, :mobileNumber, :designation, :departmentId, :passwordHash)`,
    {
      employeeId: body.employeeId,
      fullName: body.fullName,
      email: body.email,
      mobileNumber: body.mobileNumber || null,
      designation: body.designation,
      departmentId: body.departmentId,
      passwordHash,
    },
  );

  await notifyRole('SYSTEM_ADMIN', {
    type: 'REGISTRATION_PENDING',
    title: 'Registration pending approval',
    message: `${body.fullName} has requested access to RequestOps.`,
  });

  await audit({
    actorUserId: null,
    action: 'REGISTRATION_SUBMITTED',
    entityType: 'USER_REGISTRATION',
    entityId: result.insertId,
    newValue: { email: body.email, requestedDepartmentId: body.departmentId },
    req,
  });

  ok(res, { id: result.insertId, status: 'PENDING_APPROVAL' }, 201);
}));

router.post('/login', asyncHandler(async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }).parse(req.body);

  const rows = await query(
    `SELECT u.*, r.code AS role_code, r.name AS role_name, d.name AS department_name, d.code AS department_code,
            COALESCE(rm.id, dh.id) AS department_head_id,
            COALESCE(rm.full_name, dh.full_name) AS department_head_name,
            COALESCE(rm.email, dh.email) AS department_head_email
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN departments d ON d.id = u.department_id
     LEFT JOIN users rm ON rm.id = u.reporting_manager_user_id
     LEFT JOIN users dh ON dh.id = d.department_head_user_id
     WHERE u.email = :email`,
    { email: body.email },
  );
  const user = rows[0];

  if (!user || user.status !== 'ACTIVE' || !user.password_hash) {
    await audit({ actorUserId: user?.id, action: 'LOGIN_FAILED', entityType: 'USER', entityId: user?.id, req });
    throw new ApiError(401, 'Invalid credentials or inactive account.');
  }

  const validPassword = await bcrypt.compare(body.password, user.password_hash);
  if (!validPassword) {
    await audit({ actorUserId: user.id, action: 'LOGIN_FAILED', entityType: 'USER', entityId: user.id, req });
    throw new ApiError(401, 'Invalid credentials or inactive account.');
  }

  await query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = :id', { id: user.id });
  await audit({ actorUserId: user.id, action: 'LOGIN_SUCCESS', entityType: 'USER', entityId: user.id, req });

  const tokens = signTokens(user);
  ok(res, {
    ...tokens,
    user: {
      id: user.id,
      employeeId: user.employee_id,
      fullName: user.full_name,
      email: user.email,
      roleCode: user.role_code,
      roleName: user.role_name,
      departmentId: user.department_id,
      departmentName: user.department_name,
      departmentHeadId: user.department_head_id,
      departmentHeadName: user.department_head_name,
      departmentHeadEmail: user.department_head_email,
    },
  });
}));

router.post('/refresh', asyncHandler(async (req, res) => {
  const body = z.object({ refreshToken: z.string().min(10) }).parse(req.body);
  const payload = jwt.verify(body.refreshToken, env.jwt.refreshSecret);
  const rows = await query(
    `SELECT u.id, u.email, r.code AS role_code
     FROM users u JOIN roles r ON r.id = u.role_id
     WHERE u.id = :id AND u.status = 'ACTIVE'`,
    { id: payload.sub },
  );
  if (!rows[0]) throw new ApiError(401, 'Refresh token is no longer valid.');
  ok(res, signTokens(rows[0]));
}));

router.get('/me', authenticate, (req, res) => {
  ok(res, {
    id: req.user.id,
    employeeId: req.user.employee_id,
    fullName: req.user.full_name,
    email: req.user.email,
    mobileNumber: req.user.mobile_number,
    designation: req.user.designation,
    roleCode: req.user.role_code,
    roleName: req.user.role_name,
    departmentId: req.user.department_id,
    departmentName: req.user.department_name,
    departmentCode: req.user.department_code,
    departmentHeadId: req.user.department_head_id,
    departmentHeadName: req.user.department_head_name,
    departmentHeadEmail: req.user.department_head_email,
  });
});

router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  await audit({ actorUserId: req.user.id, action: 'LOGOUT', entityType: 'USER', entityId: req.user.id, req });
  ok(res, { success: true });
}));

module.exports = router;
