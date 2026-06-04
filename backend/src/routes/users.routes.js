const express = require('express');
const { z } = require('zod');
const { query, transaction } = require('../config/database');
const { audit } = require('../lib/activity');
const { ApiError, asyncHandler, ok } = require('../lib/http');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const activeRequestStatuses = [
  'DEPARTMENT_APPROVAL_PENDING',
  'CLARIFICATION_REQUESTED',
  'IT_REVIEW_PENDING',
  'ASSIGNMENT_PENDING',
  'ASSIGNED',
  'IN_DEVELOPMENT',
  'DEVELOPMENT_COMPLETE',
  'IN_TESTING',
  'TEST_FAILED',
  'UAT_PENDING',
  'UAT_REJECTED',
];

const lifecycleRoleCodes = ['SYSTEM_ADMIN', 'DEPARTMENT_HEAD', 'EMPLOYEE'];

function activeStatusSql() {
  return activeRequestStatuses.map((status) => `'${status}'`).join(', ');
}

function hasActiveResponsibilities(summary) {
  return summary.items.some((item) => item.count > 0);
}

async function getUserWithRole(userId) {
  const rows = await query(
    `SELECT u.*, r.code AS role_code, r.name AS role_name, d.name AS department_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN departments d ON d.id = u.department_id
     WHERE u.id = :userId`,
    { userId },
  );
  return rows[0];
}

async function getRoleById(roleId) {
  const rows = await query('SELECT id, code, name FROM roles WHERE id = :roleId AND is_active = TRUE', { roleId });
  return rows[0];
}

async function assertActiveUser(userId, label, { allowSelfId = null, requiredRoleCodes = [] } = {}) {
  if (!userId) return null;
  const user = await getUserWithRole(userId);
  if (!user || user.status !== 'ACTIVE') {
    throw new ApiError(400, `${label} must be an active employee.`);
  }
  if (allowSelfId && Number(user.id) === Number(allowSelfId)) {
    throw new ApiError(400, `${label} cannot be the same employee.`);
  }
  if (requiredRoleCodes.length && !requiredRoleCodes.includes(user.role_code)) {
    throw new ApiError(400, `${label} must have one of these roles: ${requiredRoleCodes.join(', ')}.`);
  }
  return user;
}

async function assertNoCircularReporting(employeeId, reportingManagerUserId) {
  if (!reportingManagerUserId) return;
  if (Number(employeeId) === Number(reportingManagerUserId)) {
    throw new ApiError(400, 'An employee cannot report to themselves.');
  }

  let nextManagerId = reportingManagerUserId;
  const visited = new Set();
  while (nextManagerId) {
    if (Number(nextManagerId) === Number(employeeId)) {
      throw new ApiError(400, 'Circular reporting relationships are not allowed.');
    }
    if (visited.has(Number(nextManagerId))) return;
    visited.add(Number(nextManagerId));
    const rows = await query('SELECT reporting_manager_user_id FROM users WHERE id = :id', { id: nextManagerId });
    nextManagerId = rows[0]?.reporting_manager_user_id || null;
  }
}

async function buildResponsibilitySummary(userId) {
  const params = { userId };
  const [
    departmentRows,
    reportedRows,
    currentAssigneeRows,
    itRows,
    developerRows,
    qaRows,
    clarificationRows,
    managerRows,
  ] = await Promise.all([
    query("SELECT id, name FROM departments WHERE department_head_user_id = :userId AND status = 'ACTIVE'", params),
    query(`SELECT id, request_number, title, status FROM requests WHERE department_head_user_id = :userId AND status IN (${activeStatusSql()})`, params),
    query(`SELECT id, request_number, title, status FROM requests WHERE current_assignee_user_id = :userId AND status IN (${activeStatusSql()})`, params),
    query(`SELECT id, request_number, title, status FROM requests WHERE it_head_user_id = :userId AND status IN (${activeStatusSql()})`, params),
    query(
      `SELECT r.id, r.request_number, r.title, r.status
       FROM assignments a
       JOIN requests r ON r.id = a.request_id
       WHERE a.developer_user_id = :userId AND a.is_active = TRUE AND r.status IN (${activeStatusSql()})`,
      params,
    ),
    query(
      `SELECT r.id, r.request_number, r.title, r.status
       FROM assignments a
       JOIN requests r ON r.id = a.request_id
       WHERE a.qa_user_id = :userId AND a.is_active = TRUE AND r.status IN (${activeStatusSql()})`,
      params,
    ),
    query("SELECT id, request_id, return_status FROM request_clarifications WHERE return_assignee_user_id = :userId AND status = 'OPEN'", params),
    query("SELECT id, full_name, email FROM users WHERE reporting_manager_user_id = :userId AND status = 'ACTIVE'", params),
  ]);

  const items = [
    { key: 'departmentHead', label: 'Department Head', count: departmentRows.length, records: departmentRows },
    { key: 'reportedTo', label: 'Reported To', count: reportedRows.length, records: reportedRows },
    { key: 'currentAssignee', label: 'Workflow Responsibility', count: currentAssigneeRows.length, records: currentAssigneeRows },
    { key: 'itHead', label: 'Internal Review Owner', count: itRows.length, records: itRows },
    { key: 'developer', label: 'Assigned Employee', count: developerRows.length, records: developerRows },
    { key: 'qa', label: 'QA Owner', count: qaRows.length, records: qaRows },
    { key: 'clarificationReturn', label: 'Clarification Return Owner', count: clarificationRows.length, records: clarificationRows },
    { key: 'reportingManager', label: 'Reporting Manager', count: managerRows.length, records: managerRows },
  ];

  return {
    userId: Number(userId),
    total: items.reduce((sum, item) => sum + item.count, 0),
    items,
  };
}

function requireReplacement(summary, key, value, label) {
  const item = summary.items.find((entry) => entry.key === key);
  if (item?.count > 0 && !value) {
    throw new ApiError(400, `${label} is required because this employee currently owns ${item.count} active responsibility record(s).`);
  }
}

router.get('/roles', asyncHandler(async (_req, res) => {
  ok(res, await query('SELECT id, code, name, description FROM roles WHERE is_active = TRUE ORDER BY name'));
}));

router.get('/directory', asyncHandler(async (_req, res) => {
  const rows = await query(
    `SELECT u.id, u.employee_id, u.full_name, u.email, u.mobile_number, u.designation,
            u.status, u.employment_status, u.exit_date, u.created_at, u.last_login_at,
            d.id AS department_id, d.name AS department_name, d.code AS department_code,
            COALESCE(rm.id, dh.id) AS manager_id,
            COALESCE(rm.full_name, dh.full_name) AS manager_name,
            COALESCE(rm.email, dh.email) AS manager_email,
            r.id AS role_id, r.code AS role_code, r.name AS role_name,
            CASE WHEN d.department_head_user_id = u.id THEN TRUE ELSE FALSE END AS is_department_head
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN departments d ON d.id = u.department_id
     LEFT JOIN users rm ON rm.id = u.reporting_manager_user_id
     LEFT JOIN users dh ON dh.id = d.department_head_user_id
     WHERE u.status = 'ACTIVE'
     ORDER BY d.name, is_department_head DESC, u.full_name`,
  );
  ok(res, rows);
}));

router.get('/', authorize('SYSTEM_ADMIN', 'IT_HEAD'), asyncHandler(async (req, res) => {
  const { search = '', role = '', departmentId = '', status = '' } = req.query;
  const rows = await query(
    `SELECT u.id, u.employee_id, u.full_name, u.email, u.mobile_number, u.designation,
            u.status, u.employment_status, u.exit_date, u.last_login_at, u.created_at, u.updated_at,
            d.id AS department_id, d.name AS department_name,
            COALESCE(rm.id, dh.id) AS reporting_manager_user_id,
            COALESCE(rm.full_name, dh.full_name) AS reporting_manager_name,
            COALESCE(rm.email, dh.email) AS reporting_manager_email,
            r.id AS role_id, r.code AS role_code, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN departments d ON d.id = u.department_id
     LEFT JOIN users rm ON rm.id = u.reporting_manager_user_id
     LEFT JOIN users dh ON dh.id = d.department_head_user_id
     WHERE (:search = '' OR u.full_name LIKE CONCAT('%', :search, '%') OR u.email LIKE CONCAT('%', :search, '%') OR u.employee_id LIKE CONCAT('%', :search, '%'))
       AND (:role = '' OR r.code = :role)
       AND (:departmentId = '' OR u.department_id = :departmentId)
       AND (:status = '' OR u.status = :status)
     ORDER BY u.full_name`,
    { search, role, departmentId, status },
  );
  ok(res, rows);
}));

router.get('/:id', authorize('SYSTEM_ADMIN', 'IT_HEAD'), asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT u.*, d.name AS department_name,
            COALESCE(rm.full_name, dh.full_name) AS reporting_manager_name,
            COALESCE(rm.email, dh.email) AS reporting_manager_email,
            r.code AS role_code, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN departments d ON d.id = u.department_id
     LEFT JOIN users rm ON rm.id = u.reporting_manager_user_id
     LEFT JOIN users dh ON dh.id = d.department_head_user_id
     WHERE u.id = :id`,
    { id: req.params.id },
  );
  if (!rows[0]) throw new ApiError(404, 'User not found.');
  ok(res, rows[0]);
}));

router.patch('/:id', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  const body = z.object({
    fullName: z.string().min(2).optional(),
    mobileNumber: z.string().optional().nullable(),
    designation: z.string().optional().nullable(),
    departmentId: z.coerce.number().int().positive().optional().nullable(),
    reportingManagerUserId: z.coerce.number().int().positive().optional().nullable(),
    roleId: z.coerce.number().int().positive().optional(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'PENDING_APPROVAL', 'REJECTED']).optional(),
  }).parse(req.body);

  const existing = await query('SELECT * FROM users WHERE id = :id', { id: req.params.id });
  if (!existing[0]) throw new ApiError(404, 'User not found.');

  if (body.reportingManagerUserId !== undefined) {
    await assertActiveUser(body.reportingManagerUserId, 'Reporting manager', {
      allowSelfId: req.params.id,
      requiredRoleCodes: ['DEPARTMENT_HEAD', 'SYSTEM_ADMIN'],
    });
    await assertNoCircularReporting(req.params.id, body.reportingManagerUserId);
  }

  const updates = {
    full_name: body.fullName,
    mobile_number: body.mobileNumber,
    designation: body.designation,
    department_id: body.departmentId,
    reporting_manager_user_id: body.reportingManagerUserId,
    role_id: body.roleId,
    status: body.status,
  };
  const set = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (!set.length) return ok(res, existing[0]);

  await query(
    `UPDATE users SET ${set.map(([key]) => `${key} = :${key}`).join(', ')} WHERE id = :id`,
    { id: req.params.id, ...Object.fromEntries(set) },
  );
  await audit({
    actorUserId: req.user.id,
    action: 'USER_UPDATED',
    entityType: 'USER',
    entityId: req.params.id,
    oldValue: existing[0],
    newValue: body,
    req,
  });
  ok(res, { id: Number(req.params.id), ...body });
}));

router.get('/:id/responsibilities', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  const existing = await getUserWithRole(req.params.id);
  if (!existing) throw new ApiError(404, 'User not found.');
  ok(res, await buildResponsibilitySummary(req.params.id));
}));

router.post('/:id/reassign-responsibilities', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  const body = z.object({
    departmentHeadUserId: z.coerce.number().int().positive().optional().nullable(),
    currentAssigneeUserId: z.coerce.number().int().positive().optional().nullable(),
    itHeadUserId: z.coerce.number().int().positive().optional().nullable(),
    developerUserId: z.coerce.number().int().positive().optional().nullable(),
    qaUserId: z.coerce.number().int().positive().optional().nullable(),
    reportingManagerUserId: z.coerce.number().int().positive().optional().nullable(),
  }).parse(req.body);

  const existing = await getUserWithRole(req.params.id);
  if (!existing) throw new ApiError(404, 'User not found.');
  const summary = await buildResponsibilitySummary(req.params.id);

  requireReplacement(summary, 'departmentHead', body.departmentHeadUserId, 'New department head');
  requireReplacement(summary, 'reportedTo', body.departmentHeadUserId, 'New reported-to authority');
  requireReplacement(summary, 'currentAssignee', body.currentAssigneeUserId, 'New workflow owner');
  requireReplacement(summary, 'itHead', body.itHeadUserId, 'New internal review owner');
  requireReplacement(summary, 'developer', body.developerUserId, 'New assigned employee');
  requireReplacement(summary, 'qa', body.qaUserId, 'New QA owner');
  requireReplacement(summary, 'clarificationReturn', body.currentAssigneeUserId, 'New clarification return owner');
  requireReplacement(summary, 'reportingManager', body.reportingManagerUserId, 'New reporting manager');

  await Promise.all([
    assertActiveUser(body.departmentHeadUserId, 'New department head', { allowSelfId: req.params.id, requiredRoleCodes: ['DEPARTMENT_HEAD', 'SYSTEM_ADMIN'] }),
    assertActiveUser(body.currentAssigneeUserId, 'New workflow owner', { allowSelfId: req.params.id }),
    assertActiveUser(body.itHeadUserId, 'New internal review owner', { allowSelfId: req.params.id, requiredRoleCodes: ['IT_HEAD', 'SYSTEM_ADMIN'] }),
    assertActiveUser(body.developerUserId, 'New assigned employee', { allowSelfId: req.params.id, requiredRoleCodes: ['DEVELOPER', 'SYSTEM_ADMIN'] }),
    assertActiveUser(body.qaUserId, 'New QA owner', { allowSelfId: req.params.id, requiredRoleCodes: ['QA', 'SYSTEM_ADMIN'] }),
    assertActiveUser(body.reportingManagerUserId, 'New reporting manager', {
      allowSelfId: req.params.id,
      requiredRoleCodes: ['DEPARTMENT_HEAD', 'SYSTEM_ADMIN'],
    }),
  ]);

  await transaction(async (connection) => {
    const auditEntries = [];
    const executeTransfer = async ({ key, label, sql, params, replacementUserId }) => {
      const item = summary.items.find((entry) => entry.key === key);
      if (!item?.count) return;
      const [result] = await connection.execute(sql, params);
      auditEntries.push({ key, label, count: result.affectedRows || item.count, replacementUserId });
    };

    await executeTransfer({
      key: 'departmentHead',
      label: 'Department Head',
      sql: 'UPDATE departments SET department_head_user_id = ? WHERE department_head_user_id = ? AND status = "ACTIVE"',
      params: [body.departmentHeadUserId, req.params.id],
      replacementUserId: body.departmentHeadUserId,
    });
    await executeTransfer({
      key: 'reportedTo',
      label: 'Reported To',
      sql: `UPDATE requests SET department_head_user_id = ? WHERE department_head_user_id = ? AND status IN (${activeStatusSql()})`,
      params: [body.departmentHeadUserId, req.params.id],
      replacementUserId: body.departmentHeadUserId,
    });
    await executeTransfer({
      key: 'currentAssignee',
      label: 'Workflow Responsibility',
      sql: `UPDATE requests SET current_assignee_user_id = ? WHERE current_assignee_user_id = ? AND status IN (${activeStatusSql()})`,
      params: [body.currentAssigneeUserId, req.params.id],
      replacementUserId: body.currentAssigneeUserId,
    });
    await executeTransfer({
      key: 'itHead',
      label: 'Internal Review Owner',
      sql: `UPDATE requests SET it_head_user_id = ? WHERE it_head_user_id = ? AND status IN (${activeStatusSql()})`,
      params: [body.itHeadUserId, req.params.id],
      replacementUserId: body.itHeadUserId,
    });
    await executeTransfer({
      key: 'developer',
      label: 'Assigned Employee',
      sql: `UPDATE assignments a JOIN requests r ON r.id = a.request_id SET a.developer_user_id = ? WHERE a.developer_user_id = ? AND a.is_active = TRUE AND r.status IN (${activeStatusSql()})`,
      params: [body.developerUserId, req.params.id],
      replacementUserId: body.developerUserId,
    });
    await executeTransfer({
      key: 'qa',
      label: 'QA Owner',
      sql: `UPDATE assignments a JOIN requests r ON r.id = a.request_id SET a.qa_user_id = ? WHERE a.qa_user_id = ? AND a.is_active = TRUE AND r.status IN (${activeStatusSql()})`,
      params: [body.qaUserId, req.params.id],
      replacementUserId: body.qaUserId,
    });
    await executeTransfer({
      key: 'clarificationReturn',
      label: 'Clarification Return Owner',
      sql: 'UPDATE request_clarifications SET return_assignee_user_id = ? WHERE return_assignee_user_id = ? AND status = "OPEN"',
      params: [body.currentAssigneeUserId, req.params.id],
      replacementUserId: body.currentAssigneeUserId,
    });
    await executeTransfer({
      key: 'reportingManager',
      label: 'Reporting Manager',
      sql: 'UPDATE users SET reporting_manager_user_id = ? WHERE reporting_manager_user_id = ? AND status = "ACTIVE"',
      params: [body.reportingManagerUserId, req.params.id],
      replacementUserId: body.reportingManagerUserId,
    });

    await Promise.all(auditEntries.map((entry) => audit({
      actorUserId: req.user.id,
      action: 'RESPONSIBILITY_REASSIGNED',
      entityType: 'USER',
      entityId: req.params.id,
      oldValue: { employeeId: Number(req.params.id), responsibility: entry.label },
      newValue: { replacementUserId: entry.replacementUserId, count: entry.count },
      req,
    })));
  });

  ok(res, await buildResponsibilitySummary(req.params.id));
}));

router.post('/:id/change-role', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  const body = z.object({
    roleId: z.coerce.number().int().positive(),
    replacementDepartmentHeadUserId: z.coerce.number().int().positive().optional().nullable(),
  }).parse(req.body);
  const existing = await getUserWithRole(req.params.id);
  if (!existing) throw new ApiError(404, 'User not found.');
  const role = await getRoleById(body.roleId);
  if (!role || !lifecycleRoleCodes.includes(role.code)) {
    throw new ApiError(400, 'Role can only be changed to System Admin, Department Head, or Employee.');
  }

  const headedDepartments = await query("SELECT id FROM departments WHERE department_head_user_id = :userId AND status = 'ACTIVE'", { userId: req.params.id });
  if (existing.role_code === 'DEPARTMENT_HEAD' && role.code !== 'DEPARTMENT_HEAD' && headedDepartments.length) {
    if (!body.replacementDepartmentHeadUserId) {
      throw new ApiError(400, 'Select a replacement Department Head before changing this role.');
    }
    await assertActiveUser(body.replacementDepartmentHeadUserId, 'Replacement Department Head', {
      allowSelfId: req.params.id,
      requiredRoleCodes: ['DEPARTMENT_HEAD', 'SYSTEM_ADMIN'],
    });
  }

  await transaction(async (connection) => {
    if (body.replacementDepartmentHeadUserId) {
      await connection.execute('UPDATE departments SET department_head_user_id = ? WHERE department_head_user_id = ?', [body.replacementDepartmentHeadUserId, req.params.id]);
    }
    await connection.execute('UPDATE users SET role_id = ? WHERE id = ?', [role.id, req.params.id]);
    if (role.code === 'DEPARTMENT_HEAD' && existing.department_id) {
      await connection.execute('UPDATE departments SET department_head_user_id = ? WHERE id = ?', [req.params.id, existing.department_id]);
    }
  });

  await audit({
    actorUserId: req.user.id,
    action: 'ROLE_CHANGED',
    entityType: 'USER',
    entityId: req.params.id,
    oldValue: { roleId: existing.role_id, roleCode: existing.role_code, roleName: existing.role_name },
    newValue: { roleId: role.id, roleCode: role.code, roleName: role.name, replacementDepartmentHeadUserId: body.replacementDepartmentHeadUserId || null },
    req,
  });
  ok(res, { id: Number(req.params.id), roleId: role.id, roleCode: role.code, roleName: role.name });
}));

router.post('/:id/change-department', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  const body = z.object({
    departmentId: z.coerce.number().int().positive(),
    reportingManagerUserId: z.coerce.number().int().positive(),
    replacementDepartmentHeadUserId: z.coerce.number().int().positive().optional().nullable(),
  }).parse(req.body);
  const existing = await getUserWithRole(req.params.id);
  if (!existing) throw new ApiError(404, 'User not found.');
  const departmentRows = await query('SELECT id, name FROM departments WHERE id = :id AND status = "ACTIVE"', { id: body.departmentId });
  if (!departmentRows[0]) throw new ApiError(400, 'Choose an active department.');
  await assertActiveUser(body.reportingManagerUserId, 'Reported To employee', {
    allowSelfId: req.params.id,
    requiredRoleCodes: ['DEPARTMENT_HEAD', 'SYSTEM_ADMIN'],
  });
  await assertNoCircularReporting(req.params.id, body.reportingManagerUserId);

  const oldHeadRows = await query('SELECT id FROM departments WHERE department_head_user_id = :userId AND status = "ACTIVE"', { userId: req.params.id });
  if (oldHeadRows.length && Number(existing.department_id) !== Number(body.departmentId)) {
    if (!body.replacementDepartmentHeadUserId) {
      throw new ApiError(400, 'Select a replacement Department Head before moving this employee.');
    }
    await assertActiveUser(body.replacementDepartmentHeadUserId, 'Replacement Department Head', {
      allowSelfId: req.params.id,
      requiredRoleCodes: ['DEPARTMENT_HEAD', 'SYSTEM_ADMIN'],
    });
  }

  await transaction(async (connection) => {
    if (body.replacementDepartmentHeadUserId) {
      await connection.execute('UPDATE departments SET department_head_user_id = ? WHERE department_head_user_id = ?', [body.replacementDepartmentHeadUserId, req.params.id]);
    }
    await connection.execute('UPDATE users SET department_id = ?, reporting_manager_user_id = ? WHERE id = ?', [body.departmentId, body.reportingManagerUserId, req.params.id]);
    if (existing.role_code === 'DEPARTMENT_HEAD') {
      await connection.execute('UPDATE departments SET department_head_user_id = ? WHERE id = ?', [req.params.id, body.departmentId]);
    }
  });

  await audit({
    actorUserId: req.user.id,
    action: 'DEPARTMENT_CHANGED',
    entityType: 'USER',
    entityId: req.params.id,
    oldValue: { departmentId: existing.department_id, reportingManagerUserId: existing.reporting_manager_user_id },
    newValue: { departmentId: body.departmentId, reportingManagerUserId: body.reportingManagerUserId, replacementDepartmentHeadUserId: body.replacementDepartmentHeadUserId || null },
    req,
  });
  ok(res, { id: Number(req.params.id), departmentId: body.departmentId, reportingManagerUserId: body.reportingManagerUserId });
}));

router.post('/:id/change-reporting-manager', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  const body = z.object({ reportingManagerUserId: z.coerce.number().int().positive() }).parse(req.body);
  const existing = await getUserWithRole(req.params.id);
  if (!existing) throw new ApiError(404, 'User not found.');
  await assertActiveUser(body.reportingManagerUserId, 'Reported To employee', {
    allowSelfId: req.params.id,
    requiredRoleCodes: ['DEPARTMENT_HEAD', 'SYSTEM_ADMIN'],
  });
  await assertNoCircularReporting(req.params.id, body.reportingManagerUserId);
  await query('UPDATE users SET reporting_manager_user_id = :reportingManagerUserId WHERE id = :id', {
    id: req.params.id,
    reportingManagerUserId: body.reportingManagerUserId,
  });
  await audit({
    actorUserId: req.user.id,
    action: 'REPORTING_MANAGER_CHANGED',
    entityType: 'USER',
    entityId: req.params.id,
    oldValue: { reportingManagerUserId: existing.reporting_manager_user_id },
    newValue: { reportingManagerUserId: body.reportingManagerUserId },
    req,
  });
  ok(res, { id: Number(req.params.id), reportingManagerUserId: body.reportingManagerUserId });
}));

router.post('/:id/reactivate', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  const body = z.object({
    departmentId: z.coerce.number().int().positive(),
    roleId: z.coerce.number().int().positive(),
    reportingManagerUserId: z.coerce.number().int().positive(),
  }).parse(req.body);
  const existing = await getUserWithRole(req.params.id);
  if (!existing) throw new ApiError(404, 'User not found.');
  const departmentRows = await query('SELECT id FROM departments WHERE id = :departmentId AND status = "ACTIVE"', { departmentId: body.departmentId });
  if (!departmentRows[0]) throw new ApiError(400, 'Choose an active department.');
  const role = await getRoleById(body.roleId);
  if (!role) throw new ApiError(400, 'Choose an active role.');
  await assertActiveUser(body.reportingManagerUserId, 'Reported To employee', {
    allowSelfId: req.params.id,
    requiredRoleCodes: ['DEPARTMENT_HEAD', 'SYSTEM_ADMIN'],
  });
  await assertNoCircularReporting(req.params.id, body.reportingManagerUserId);

  await query(
    `UPDATE users
     SET status = 'ACTIVE', employment_status = 'ACTIVE', exit_date = NULL,
         department_id = :departmentId, role_id = :roleId, reporting_manager_user_id = :reportingManagerUserId
     WHERE id = :id`,
    { id: req.params.id, departmentId: body.departmentId, roleId: body.roleId, reportingManagerUserId: body.reportingManagerUserId },
  );
  await audit({
    actorUserId: req.user.id,
    action: 'EMPLOYEE_REACTIVATED',
    entityType: 'USER',
    entityId: req.params.id,
    oldValue: { status: existing.status, employmentStatus: existing.employment_status, exitDate: existing.exit_date },
    newValue: { status: 'ACTIVE', employmentStatus: 'ACTIVE', departmentId: body.departmentId, roleId: body.roleId, reportingManagerUserId: body.reportingManagerUserId },
    req,
  });
  ok(res, { id: Number(req.params.id), status: 'ACTIVE', employmentStatus: 'ACTIVE' });
}));

router.post('/:id/deactivate', authorize('SYSTEM_ADMIN'), asyncHandler(async (req, res) => {
  const existing = await getUserWithRole(req.params.id);
  if (!existing) throw new ApiError(404, 'User not found.');
  if (Number(existing.id) === Number(req.user.id)) throw new ApiError(400, 'You cannot deactivate your own account.');
  const summary = await buildResponsibilitySummary(req.params.id);
  if (hasActiveResponsibilities(summary)) {
    throw new ApiError(409, 'Transfer active responsibilities before deactivation.', summary);
  }
  await query(
    "UPDATE users SET status = 'INACTIVE', employment_status = 'LEFT_ORGANIZATION', exit_date = CURRENT_DATE WHERE id = :id",
    { id: req.params.id },
  );
  await audit({
    actorUserId: req.user.id,
    action: 'EMPLOYEE_DEACTIVATED',
    entityType: 'USER',
    entityId: req.params.id,
    oldValue: { status: existing.status, employmentStatus: existing.employment_status, exitDate: existing.exit_date },
    newValue: { status: 'INACTIVE', employmentStatus: 'LEFT_ORGANIZATION', exitDate: new Date().toISOString().slice(0, 10) },
    req,
  });
  ok(res, { id: Number(req.params.id), status: 'INACTIVE', employmentStatus: 'LEFT_ORGANIZATION' });
}));

module.exports = router;
