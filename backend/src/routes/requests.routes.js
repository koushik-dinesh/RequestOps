const express = require('express');
const multer = require('multer');
const path = require('path');
const { z } = require('zod');
const env = require('../config/env');
const { query, transaction } = require('../config/database');
const { audit, notify } = require('../lib/activity');
const { getRequestById, transitionRequest } = require('../lib/workflow');
const { ApiError, asyncHandler, ok } = require('../lib/http');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

const missingReportingAuthorityMessage = 'No person found to report at this level. Please contact the System Administrator to configure a reporting authority for your department.';

const storage = multer.diskStorage({
  destination: env.uploadDir,
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}${path.extname(file.originalname)}`);
  },
});

const clarificationBodySchema = z.object({
  reasonCategory: z.enum([
    'MISSING_BUSINESS_JUSTIFICATION',
    'MISSING_REQUIREMENTS',
    'MISSING_BENEFITS',
    'MISSING_ATTACHMENT',
    'TECHNICAL_CLARIFICATION',
    'OTHER',
  ]),
  note: z.string().min(5),
});

const upload = multer({
  storage,
  limits: { fileSize: env.maxUploadMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.ms-excel',
      'image/png',
      'image/jpeg',
      'image/webp',
    ];
    cb(null, allowed.includes(file.mimetype));
  },
});

function isAdminOrIT(user) {
  return ['SYSTEM_ADMIN', 'IT_HEAD'].includes(user.role_code);
}

async function assertCanView(req, request) {
  if (isAdminOrIT(req.user)) return;
  if (request.requester_user_id === req.user.id) return;
  if (request.requester_department_id === req.user.department_id) return;
  if (request.department_head_user_id === req.user.id) return;
  if (request.current_assignee_user_id === req.user.id) return;

  const assignments = await query(
    `SELECT id FROM assignments
     WHERE request_id = :requestId AND is_active = TRUE
       AND (developer_user_id = :userId OR qa_user_id = :userId)`,
    { requestId: request.id, userId: req.user.id },
  );
  if (assignments.length) return;
  throw new ApiError(403, 'You do not have access to this request.');
}

async function assertRequestAccess(req, requestId, roles = []) {
  const request = await getRequestById(requestId);
  if (!request) throw new ApiError(404, 'Request not found.');
  await assertCanView(req, request);
  if (roles.length && req.user.role_code !== 'SYSTEM_ADMIN' && !roles.includes(req.user.role_code)) {
    throw new ApiError(403, 'You do not have permission for this workflow action.');
  }
  return request;
}

async function getCurrentDepartmentHeadId(departmentId) {
  const rows = await query(
    `SELECT department_head_user_id
     FROM departments
     WHERE id = :departmentId AND status = 'ACTIVE'`,
    { departmentId },
  );
  return rows[0]?.department_head_user_id || null;
}

async function getActiveUserWithRole(userId, roleCode) {
  if (!userId) return null;
  const rows = await query(
    `SELECT u.id, u.full_name, u.email, r.code AS role_code
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = :userId AND r.code = :roleCode AND u.status = 'ACTIVE'`,
    { userId, roleCode },
  );
  return rows[0] || null;
}

async function resolveSingleActiveRoleOwner(roleCode, label) {
  const candidates = await query(
    `SELECT u.id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.code = :roleCode AND u.status = 'ACTIVE'
     ORDER BY u.employee_id, u.id`,
    { roleCode },
  );
  if (!candidates.length) throw new ApiError(409, `No active ${label} is configured.`);
  return candidates[0].id;
}

async function resolveRequestItHeadId(request) {
  const existingOwner = await getActiveUserWithRole(request.it_head_user_id, 'IT_HEAD');
  if (existingOwner) return existingOwner.id;
  const currentOwner = await getActiveUserWithRole(request.current_assignee_user_id, 'IT_HEAD');
  if (currentOwner) return currentOwner.id;
  return resolveSingleActiveRoleOwner('IT_HEAD', 'IT HOD');
}

async function resolveRequestUatApproverId(request) {
  const currentOwner = await getActiveUserWithRole(request.current_assignee_user_id, 'UAT_APPROVER');
  if (currentOwner) return currentOwner.id;
  const departmentCandidates = await query(
    `SELECT u.id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.code = 'UAT_APPROVER'
       AND u.status = 'ACTIVE'
       AND u.department_id = :departmentId`,
    { departmentId: request.requester_department_id },
  );
  if (departmentCandidates.length === 1) return departmentCandidates[0].id;
  if (departmentCandidates.length > 1) throw new ApiError(409, 'Multiple active UAT approvers are configured for this department.');
  return resolveSingleActiveRoleOwner('UAT_APPROVER', 'UAT approver');
}

async function assertCanActAsDepartmentHead(req, request) {
  const currentDepartmentHeadId = await getCurrentDepartmentHeadId(request.requester_department_id);

  if (!currentDepartmentHeadId && !request.department_head_user_id) {
    throw new ApiError(409, missingReportingAuthorityMessage);
  }

  if (req.user.role_code === 'SYSTEM_ADMIN') {
    return currentDepartmentHeadId || request.department_head_user_id;
  }

  const allowedHeadIds = new Set([
    request.department_head_user_id,
    currentDepartmentHeadId,
  ].filter(Boolean).map(Number));

  if (!allowedHeadIds.has(Number(req.user.id))) {
    throw new ApiError(403, 'Only the current department head can act on this request.');
  }

  return currentDepartmentHeadId || request.department_head_user_id;
}

async function addComment(requestId, userId, commentType, commentText, isInternal = false) {
  if (!commentText) return null;
  const result = await query(
    `INSERT INTO request_comments (request_id, user_id, comment_type, comment_text, is_internal)
     VALUES (:requestId, :userId, :commentType, :commentText, :isInternal)`,
    { requestId, userId, commentType, commentText, isInternal },
  );
  return result.insertId;
}

async function getActiveAssignment(requestId) {
  const rows = await query(
    `SELECT a.*,
            developer.full_name AS developer_name,
            qa.full_name AS qa_name
     FROM assignments a
     LEFT JOIN users developer ON developer.id = a.developer_user_id
     LEFT JOIN users qa ON qa.id = a.qa_user_id
     WHERE a.request_id = :requestId AND a.is_active = TRUE
     LIMIT 1`,
    { requestId },
  );
  return rows[0];
}

async function getProgressStakeholderIds(request, assignment) {
  const admins = await query(
    `SELECT u.id
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.code = 'SYSTEM_ADMIN' AND u.status = 'ACTIVE'`,
  );
  return [...new Set([
    request.requester_user_id,
    request.department_head_user_id,
    request.it_head_user_id,
    assignment?.developer_user_id,
    assignment?.qa_user_id,
    ...admins.map((admin) => admin.id),
  ].filter(Boolean))];
}

function crossedProgressMilestones(previousProgress, nextProgress) {
  return [25, 50, 75, 100].filter((milestone) => previousProgress < milestone && nextProgress >= milestone);
}

async function createClarificationRequest({ request, actorUserId, reasonCategory, note, returnStatus, returnAssigneeUserId, req, patch = {} }) {
  await query(
    `INSERT INTO request_clarifications
      (request_id, requested_by_user_id, stage_status, return_status, return_assignee_user_id, reason_category, note)
     VALUES (:requestId, :requestedBy, :stageStatus, :returnStatus, :returnAssignee, :reasonCategory, :note)`,
    {
      requestId: request.id,
      requestedBy: actorUserId,
      stageStatus: request.status,
      returnStatus,
      returnAssignee: returnAssigneeUserId || null,
      reasonCategory,
      note,
    },
  );

  const comment = `Clarification requested. Reason: ${reasonCategory.replaceAll('_', ' ')}. Note: ${note}`;
  const updated = await transitionRequest({
    requestId: request.id,
    toStatus: 'CLARIFICATION_REQUESTED',
    actorUserId,
    comment,
    req,
    patch: { ...patch, current_assignee_user_id: request.requester_user_id },
  });

  await notify({
    recipientUserId: request.requester_user_id,
    requestId: request.id,
    type: 'CLARIFICATION_REQUESTED',
    title: 'Clarification requested',
    message: `${request.request_number} needs more information: ${reasonCategory.replaceAll('_', ' ').toLowerCase()}.`,
  });
  await audit({
    actorUserId,
    action: 'REQUEST_CLARIFICATION_REQUESTED',
    entityType: 'REQUEST',
    entityId: request.id,
    newValue: { reasonCategory, note, returnStatus },
    req,
  });

  return updated;
}

router.get('/', asyncHandler(async (req, res) => {
  const { status = '', priority = '', type = '', departmentId = '', assigneeId = '', search = '', mine = '' } = req.query;
  const role = req.user.role_code;
  const filters = [
    role === 'QA' && status === 'IN_TESTING'
      ? "(:status = '' OR r.status = :status OR (r.status = 'IN_DEVELOPMENT' AND r.progress_percentage = 100))"
      : "(:status = '' OR r.status = :status)",
    "(:priority = '' OR r.priority = :priority)",
    "(:type = '' OR r.request_type = :type)",
    "(:departmentId = '' OR r.requester_department_id = :departmentId)",
    "(:assigneeId = '' OR r.current_assignee_user_id = :assigneeId)",
    "(:search = '' OR r.request_number LIKE CONCAT('%', :search, '%') OR r.title LIKE CONCAT('%', :search, '%'))",
  ];
  const params = { status, priority, type, departmentId, assigneeId, search, userId: req.user.id, userDepartmentId: req.user.department_id };

  if (mine === 'true') {
    filters.push('r.requester_user_id = :userId');
  } else if (!isAdminOrIT(req.user)) {
    if (role === 'DEPARTMENT_HEAD') {
      filters.push('(r.department_head_user_id = :userId OR r.requester_department_id = :userDepartmentId)');
    } else if (role === 'PROJECT_MANAGER') {
      filters.push('r.project_manager_user_id = :userId');
    } else if (role === 'DEVELOPER') {
      filters.push('a.developer_user_id = :userId');
    } else if (role === 'QA') {
      filters.push('a.qa_user_id = :userId');
    } else if (role === 'UAT_APPROVER') {
      filters.push("(r.current_assignee_user_id = :userId OR r.status = 'UAT_PENDING')");
    } else {
      filters.push('r.requester_department_id = :userDepartmentId');
    }
  }

  const rows = await query(
    `SELECT r.*, requester.full_name AS requester_name, d.name AS department_name,
            dh.full_name AS department_head_name,
            COALESCE(dh.full_name, current_dh.full_name) AS reported_to_name,
            COALESCE(r.department_head_user_id, d.department_head_user_id) AS reported_to_user_id,
            assignee.full_name AS current_assignee_name,
            dev.full_name AS developer_name, qa.full_name AS qa_name
     FROM requests r
     JOIN users requester ON requester.id = r.requester_user_id
     JOIN departments d ON d.id = r.requester_department_id
     LEFT JOIN users dh ON dh.id = r.department_head_user_id
     LEFT JOIN users current_dh ON current_dh.id = d.department_head_user_id
     LEFT JOIN users assignee ON assignee.id = r.current_assignee_user_id
     LEFT JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE
     LEFT JOIN users dev ON dev.id = a.developer_user_id
     LEFT JOIN users qa ON qa.id = a.qa_user_id
     WHERE ${filters.join(' AND ')}
     ORDER BY r.updated_at DESC
     LIMIT 200`,
    params,
  );
  ok(res, rows);
}));

router.post('/', asyncHandler(async (req, res) => {
  const body = z.object({
    title: z.string().min(5),
    requestType: z.enum(['NEW_FEATURE', 'ENHANCEMENT', 'BUG_FIX', 'AUTOMATION', 'INTEGRATION', 'REPORT', 'OTHER']),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    businessJustification: z.string().min(5),
    description: z.string().min(10),
    expectedBenefits: z.string().optional().nullable(),
  }).parse(req.body);

  if (!req.user.department_id) throw new ApiError(400, 'Your profile must have a department before creating requests.');
  const departments = await query('SELECT * FROM departments WHERE id = :id AND status = "ACTIVE"', { id: req.user.department_id });
  const department = departments[0];
  const reportingAuthorityUserId = req.user.reporting_manager_user_id || department?.department_head_user_id;
  const reportingAuthorityRows = reportingAuthorityUserId
    ? await query('SELECT id FROM users WHERE id = :id AND status = "ACTIVE"', { id: reportingAuthorityUserId })
    : [];
  if (!reportingAuthorityRows[0]) throw new ApiError(409, missingReportingAuthorityMessage);

  const created = await transaction(async (connection) => {
    const [counterRows] = await connection.execute(
      "SELECT COALESCE(MAX(CAST(SUBSTRING(request_number, 4) AS UNSIGNED)), 0) + 1 AS next_number FROM requests WHERE request_number REGEXP '^RQ-[0-9]{3}$'",
    );
    const requestNumber = `RQ-${String(counterRows[0].next_number).padStart(3, '0')}`;
    const [result] = await connection.execute(
      `INSERT INTO requests
        (request_number, title, request_type, priority, business_justification, description, expected_benefits,
         status, requester_user_id, requester_department_id, department_head_user_id, current_assignee_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'DEPARTMENT_APPROVAL_PENDING', ?, ?, ?, ?)`,
      [
        requestNumber,
        body.title,
        body.requestType,
        body.priority,
        body.businessJustification,
        body.description,
        body.expectedBenefits || null,
        req.user.id,
        req.user.department_id,
        reportingAuthorityUserId,
        reportingAuthorityUserId,
      ],
    );
    await connection.execute(
      `INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
       VALUES (?, NULL, 'SUBMITTED', ?, 'Request submitted.'),
              (?, 'SUBMITTED', 'DEPARTMENT_APPROVAL_PENDING', ?, 'Routed to department head.')`,
      [result.insertId, req.user.id, result.insertId, req.user.id],
    );
    return { id: result.insertId, requestNumber };
  });

  await notify({
    recipientUserId: reportingAuthorityUserId,
    requestId: created.id,
    type: 'REQUEST_AWAITING_APPROVAL',
    title: 'Request awaiting department approval',
    message: `${created.requestNumber} is awaiting your approval.`,
  });
  await audit({ actorUserId: req.user.id, action: 'REQUEST_CREATED', entityType: 'REQUEST', entityId: created.id, newValue: body, req });
  ok(res, created, 201);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const rows = await query(
    `SELECT r.*, requester.full_name AS requester_name, requester.email AS requester_email,
            d.name AS department_name, dh.full_name AS department_head_name,
            COALESCE(dh.full_name, current_dh.full_name) AS reported_to_name,
            COALESCE(r.department_head_user_id, d.department_head_user_id) AS reported_to_user_id,
            it.full_name AS it_head_name, assignee.full_name AS current_assignee_name,
            active_assignment.id AS active_assignment_id,
            active_assignment.assigned_at AS active_assignment_assigned_at,
            active_assignment.assigned_by_user_id AS active_assignment_assigned_by_user_id,
            assignment_developer.id AS active_developer_user_id,
            assignment_developer.full_name AS active_developer_name,
            assignment_qa.id AS active_qa_user_id,
            assignment_qa.full_name AS active_qa_name,
            assignment_owner.full_name AS active_assignment_assigned_by_name,
            latest_progress.id AS latest_progress_update_id,
            latest_progress.progress_percentage AS latest_progress_percentage,
            latest_progress.update_notes AS latest_progress_notes,
            latest_progress.created_at AS latest_progress_updated_at,
            latest_progress_developer.full_name AS latest_progress_updated_by_name
     FROM requests r
     JOIN users requester ON requester.id = r.requester_user_id
     JOIN departments d ON d.id = r.requester_department_id
     LEFT JOIN users dh ON dh.id = r.department_head_user_id
     LEFT JOIN users current_dh ON current_dh.id = d.department_head_user_id
     LEFT JOIN users it ON it.id = r.it_head_user_id
     LEFT JOIN users assignee ON assignee.id = r.current_assignee_user_id
     LEFT JOIN assignments active_assignment ON active_assignment.request_id = r.id AND active_assignment.is_active = TRUE
     LEFT JOIN users assignment_developer ON assignment_developer.id = active_assignment.developer_user_id
     LEFT JOIN users assignment_qa ON assignment_qa.id = active_assignment.qa_user_id
     LEFT JOIN users assignment_owner ON assignment_owner.id = active_assignment.assigned_by_user_id
     LEFT JOIN development_updates latest_progress
       ON latest_progress.id = (
         SELECT du.id
         FROM development_updates du
         WHERE du.request_id = r.id
         ORDER BY du.created_at DESC, du.id DESC
         LIMIT 1
       )
     LEFT JOIN users latest_progress_developer ON latest_progress_developer.id = latest_progress.developer_user_id
     WHERE r.id = :id`,
    { id: req.params.id },
  );
  const request = rows[0];
  if (!request) throw new ApiError(404, 'Request not found.');
  await assertCanView(req, request);
  ok(res, request);
}));

async function updateRequestDetails(req, res) {
  const request = await assertRequestAccess(req, req.params.id);
  if (request.requester_user_id !== req.user.id && req.user.role_code !== 'SYSTEM_ADMIN') {
    throw new ApiError(403, 'Only the requester can update request details.');
  }
  if (!['SUBMITTED', 'DEPARTMENT_APPROVAL_PENDING', 'CLARIFICATION_REQUESTED'].includes(request.status)) {
    throw new ApiError(409, 'Request details can only be edited before review progresses beyond department approval.');
  }
  const body = z.object({
    title: z.string().min(5),
    businessJustification: z.string().min(5),
    description: z.string().min(10),
    expectedBenefits: z.string().optional().nullable(),
  }).parse(req.body);
  await query(
    `UPDATE requests
     SET title = :title,
         business_justification = :businessJustification,
         description = :description,
         expected_benefits = :expectedBenefits
     WHERE id = :requestId`,
    {
      requestId: request.id,
      title: body.title,
      businessJustification: body.businessJustification,
      description: body.description,
      expectedBenefits: body.expectedBenefits || null,
    },
  );
  await audit({
    actorUserId: req.user.id,
    action: 'REQUEST_DETAILS_UPDATED',
    entityType: 'REQUEST',
    entityId: request.id,
    oldValue: {
      title: request.title,
      businessJustification: request.business_justification,
      description: request.description,
      expectedBenefits: request.expected_benefits,
    },
    newValue: { ...body, status: request.status },
    req,
  });
  ok(res, await getRequestById(request.id));
}

router.patch('/:id/details', asyncHandler(updateRequestDetails));
router.post('/:id/details', asyncHandler(updateRequestDetails));

router.get('/:id/timeline', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id);
  const rows = await query(
    `SELECT h.*, u.full_name AS changed_by_name, u.email AS changed_by_email
     FROM request_status_history h
     JOIN users u ON u.id = h.changed_by_user_id
     WHERE h.request_id = :requestId
     ORDER BY h.changed_at`,
    { requestId: request.id },
  );
  ok(res, rows);
}));

router.get('/:id/comments', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id);
  const rows = await query(
    `SELECT c.*, u.full_name AS user_name, u.email AS user_email
     FROM request_comments c
     JOIN users u ON u.id = c.user_id
     WHERE c.request_id = :requestId
     ORDER BY c.created_at DESC`,
    { requestId: request.id },
  );
  ok(res, rows);
}));

router.get('/:id/development-updates', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id);
  const rows = await query(
    `SELECT du.*,
            developer.full_name AS developer_name,
            developer.email AS developer_email,
            attachment.original_file_name AS attachment_name,
            attachment.mime_type AS attachment_mime_type,
            attachment.file_size_bytes AS attachment_size_bytes
     FROM development_updates du
     JOIN users developer ON developer.id = du.developer_user_id
     LEFT JOIN request_attachments attachment ON attachment.id = du.attachment_id
     WHERE du.request_id = :requestId
     ORDER BY du.created_at DESC, du.id DESC`,
    { requestId: request.id },
  );
  ok(res, rows);
}));

router.get('/:id/clarifications', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id);
  const rows = await query(
    `SELECT c.*, requested_by.full_name AS requested_by_name, requested_by.email AS requested_by_email,
            responded_by.full_name AS responded_by_name
     FROM request_clarifications c
     JOIN users requested_by ON requested_by.id = c.requested_by_user_id
     LEFT JOIN users responded_by ON responded_by.id = c.responded_by_user_id
     WHERE c.request_id = :requestId
     ORDER BY c.requested_at DESC`,
    { requestId: request.id },
  );
  ok(res, rows);
}));

router.post('/:id/comments', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id);
  const body = z.object({
    commentText: z.string().min(1),
    commentType: z.enum(['GENERAL', 'CLARIFICATION', 'APPROVAL', 'REJECTION', 'DEVELOPMENT', 'TESTING', 'UAT']).default('GENERAL'),
    isInternal: z.boolean().default(false),
  }).parse(req.body);
  const id = await addComment(request.id, req.user.id, body.commentType, body.commentText, body.isInternal);
  await audit({ actorUserId: req.user.id, action: 'REQUEST_COMMENT_ADDED', entityType: 'REQUEST', entityId: request.id, newValue: body, req });
  ok(res, { id }, 201);
}));

router.get('/:id/attachments', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id);
  const rows = await query(
    `SELECT a.*, u.full_name AS uploaded_by_name
     FROM request_attachments a
     JOIN users u ON u.id = a.uploaded_by_user_id
     WHERE a.request_id = :requestId
     ORDER BY a.uploaded_at DESC`,
    { requestId: request.id },
  );
  ok(res, rows);
}));

router.post('/:id/attachments', upload.single('file'), asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id);
  if (!req.file) throw new ApiError(400, 'Attachment file is required.');
  const result = await query(
    `INSERT INTO request_attachments
      (request_id, uploaded_by_user_id, file_name, original_file_name, mime_type, file_size_bytes, storage_path)
     VALUES (:requestId, :uploadedBy, :fileName, :originalFileName, :mimeType, :fileSize, :storagePath)`,
    {
      requestId: request.id,
      uploadedBy: req.user.id,
      fileName: req.file.filename,
      originalFileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size,
      storagePath: req.file.path,
    },
  );
  await audit({ actorUserId: req.user.id, action: 'REQUEST_ATTACHMENT_UPLOADED', entityType: 'REQUEST', entityId: request.id, newValue: { attachmentId: result.insertId }, req });
  ok(res, { id: result.insertId }, 201);
}));

router.get('/:id/attachments/:attachmentId/preview', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id);
  const rows = await query('SELECT * FROM request_attachments WHERE id = :attachmentId AND request_id = :requestId', {
    attachmentId: req.params.attachmentId,
    requestId: request.id,
  });
  const attachment = rows[0];
  if (!attachment) throw new ApiError(404, 'Attachment not found.');
  res.setHeader('Content-Type', attachment.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${attachment.original_file_name}"`);
  res.sendFile(path.resolve(attachment.storage_path));
}));

router.get('/:id/attachments/:attachmentId/download', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id);
  const rows = await query('SELECT * FROM request_attachments WHERE id = :attachmentId AND request_id = :requestId', {
    attachmentId: req.params.attachmentId,
    requestId: request.id,
  });
  const attachment = rows[0];
  if (!attachment) throw new ApiError(404, 'Attachment not found.');
  res.download(attachment.storage_path, attachment.original_file_name);
}));

router.post('/:id/department-approval/approve', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['DEPARTMENT_HEAD']);
  const departmentHeadUserId = await assertCanActAsDepartmentHead(req, request);
  const itHeadUserId = await resolveRequestItHeadId(request);
  const body = z.object({ comment: z.string().optional() }).parse(req.body);
  await addComment(request.id, req.user.id, 'APPROVAL', body.comment);
  const updated = await transitionRequest({
    requestId: request.id,
    toStatus: 'IT_REVIEW_PENDING',
    actorUserId: req.user.id,
    comment: body.comment || 'Department approved.',
    req,
    patch: { department_head_user_id: departmentHeadUserId, it_head_user_id: itHeadUserId, current_assignee_user_id: itHeadUserId },
  });
  await notify({
    recipientUserId: itHeadUserId,
    requestId: request.id,
    type: 'REQUEST_IT_REVIEW_PENDING',
    title: 'Request awaiting internal review',
    message: `${request.request_number} has been approved by the department and is ready for internal review.`,
  });
  ok(res, updated);
}));

router.post('/:id/department-approval/reject', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['DEPARTMENT_HEAD']);
  const departmentHeadUserId = await assertCanActAsDepartmentHead(req, request);
  const body = z.object({ comment: z.string().min(3) }).parse(req.body);
  await addComment(request.id, req.user.id, 'REJECTION', body.comment);
  const updated = await transitionRequest({
    requestId: request.id,
    toStatus: 'DEPARTMENT_REJECTED',
    actorUserId: req.user.id,
    comment: body.comment,
    req,
    patch: { department_head_user_id: departmentHeadUserId },
  });
  await notify({ recipientUserId: request.requester_user_id, requestId: request.id, type: 'REQUEST_REJECTED', title: 'Request rejected', message: `${request.request_number} was rejected by the department.` });
  ok(res, updated);
}));

router.post('/:id/department-approval/request-clarification', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['DEPARTMENT_HEAD']);
  const departmentHeadUserId = await assertCanActAsDepartmentHead(req, request);
  if (request.status !== 'DEPARTMENT_APPROVAL_PENDING') throw new ApiError(409, 'Clarification can only be requested during department approval.');
  const body = clarificationBodySchema.parse(req.body);
  const updated = await createClarificationRequest({
    request,
    actorUserId: req.user.id,
    reasonCategory: body.reasonCategory,
    note: body.note,
    returnStatus: 'DEPARTMENT_APPROVAL_PENDING',
    returnAssigneeUserId: departmentHeadUserId,
    req,
    patch: { department_head_user_id: departmentHeadUserId },
  });
  ok(res, updated);
}));

router.post('/:id/clarification/respond', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id);
  if (request.requester_user_id !== req.user.id && req.user.role_code !== 'SYSTEM_ADMIN') throw new ApiError(403, 'Only the requester can respond to clarification.');
  if (request.status !== 'CLARIFICATION_REQUESTED') throw new ApiError(409, 'This request is not awaiting clarification.');
  const body = z.object({ comment: z.string().min(3) }).parse(req.body);
  const openClarifications = await query(
    `SELECT * FROM request_clarifications
     WHERE request_id = :requestId AND status = 'OPEN'
     ORDER BY requested_at DESC
     LIMIT 1`,
    { requestId: request.id },
  );
  const clarification = openClarifications[0];
  if (!clarification) throw new ApiError(409, 'No open clarification request was found.');
  await query(
    `UPDATE request_clarifications
     SET status = 'RESOLVED', responded_by_user_id = :respondedBy, response_note = :responseNote, responded_at = CURRENT_TIMESTAMP
     WHERE id = :id`,
    { id: clarification.id, respondedBy: req.user.id, responseNote: body.comment },
  );
  const updated = await transitionRequest({
    requestId: request.id,
    toStatus: clarification.return_status,
    actorUserId: req.user.id,
    comment: `Clarification response submitted. ${body.comment}`,
    req,
    patch: { current_assignee_user_id: clarification.return_assignee_user_id },
  });
  await notify({ recipientUserId: clarification.requested_by_user_id, requestId: request.id, type: 'CLARIFICATION_RESPONDED', title: 'Clarification received', message: `${request.request_number} has been resubmitted with clarification.` });
  await audit({ actorUserId: req.user.id, action: 'REQUEST_CLARIFICATION_RESPONDED', entityType: 'REQUEST', entityId: request.id, newValue: { clarificationId: clarification.id, responseNote: body.comment }, req });
  ok(res, updated);
}));

router.post('/:id/it-review/approve', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['IT_HEAD']);
  const body = z.object({
    feasibilityNotes: z.string().min(3),
    complexity: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']),
    estimatedEffort: z.string().min(1),
    priorityConfirmation: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    comment: z.string().optional(),
  }).parse(req.body);
  await addComment(request.id, req.user.id, 'APPROVAL', body.comment || body.feasibilityNotes, true);
  const updated = await transitionRequest({
    requestId: request.id,
    toStatus: 'ASSIGNMENT_PENDING',
    actorUserId: req.user.id,
    comment: body.comment || 'Internal review approved. Project Manager assignment is required.',
    req,
    patch: {
      it_head_user_id: req.user.id,
      current_assignee_user_id: req.user.id,
      feasibility_notes: body.feasibilityNotes,
      complexity: body.complexity,
      estimated_effort: body.estimatedEffort,
      priority_confirmation: body.priorityConfirmation,
      priority: body.priorityConfirmation,
    },
  });
  await notify({
    recipientUserId: req.user.id,
    requestId: request.id,
    type: 'PROJECT_MANAGER_ASSIGNMENT_PENDING',
    title: 'Project Manager assignment required',
    message: `${request.request_number} is approved by IT and needs a Project Manager.`,
  });
  ok(res, updated);
}));

router.post('/:id/it-review/reject', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['IT_HEAD']);
  const body = z.object({ comment: z.string().min(3) }).parse(req.body);
  await addComment(request.id, req.user.id, 'REJECTION', body.comment, true);
  const updated = await transitionRequest({ requestId: request.id, toStatus: 'IT_REJECTED', actorUserId: req.user.id, comment: body.comment, req });
  await notify({ recipientUserId: request.requester_user_id, requestId: request.id, type: 'REQUEST_REJECTED', title: 'Request rejected by IT', message: `${request.request_number} was rejected by IT.` });
  ok(res, updated);
}));

router.post('/:id/it-review/request-clarification', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['IT_HEAD']);
  if (request.status !== 'IT_REVIEW_PENDING') throw new ApiError(409, 'Clarification can only be requested during internal review.');
  const body = clarificationBodySchema.parse(req.body);
  const updated = await createClarificationRequest({
    request,
    actorUserId: req.user.id,
    reasonCategory: body.reasonCategory,
    note: body.note,
    returnStatus: 'IT_REVIEW_PENDING',
    returnAssigneeUserId: req.user.id,
    req,
  });
  ok(res, updated);
}));

router.post('/:id/it-review/defer', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['IT_HEAD']);
  const body = z.object({ comment: z.string().min(3) }).parse(req.body);
  await addComment(request.id, req.user.id, 'GENERAL', body.comment, true);
  const updated = await transitionRequest({ requestId: request.id, toStatus: 'DEFERRED', actorUserId: req.user.id, comment: body.comment, req });
  ok(res, updated);
}));

router.post('/:id/project-manager/assign', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['IT_HEAD']);
  if (!['ASSIGNMENT_PENDING', 'PM_ASSIGNED'].includes(request.status)) {
    throw new ApiError(409, 'Project Manager can only be assigned after IT HOD approval.');
  }
  const body = z.object({
    projectManagerUserId: z.coerce.number().int().positive(),
    notes: z.string().optional(),
  }).parse(req.body);
  const projectManager = await getActiveUserWithRole(body.projectManagerUserId, 'PROJECT_MANAGER');
  if (!projectManager) {
    throw new ApiError(400, 'Project Manager must be an active Project Manager.');
  }
  const previousProjectManagerUserId = request.project_manager_user_id || null;
  const updated = await transitionRequest({
    requestId: request.id,
    toStatus: 'PM_ASSIGNED',
    actorUserId: req.user.id,
    comment: body.notes || `Project Manager assigned: ${projectManager.full_name}.`,
    req,
    patch: {
      project_manager_user_id: body.projectManagerUserId,
      current_assignee_user_id: body.projectManagerUserId,
    },
  });
  await notify({
    recipientUserId: body.projectManagerUserId,
    requestId: request.id,
    type: 'PROJECT_MANAGER_ASSIGNED',
    title: 'Project assigned to you',
    message: `${request.request_number} is assigned to you for scope and delivery planning.`,
  });
  await audit({
    actorUserId: req.user.id,
    action: 'PROJECT_MANAGER_ASSIGNED',
    entityType: 'REQUEST',
    entityId: request.id,
    oldValue: { projectManagerUserId: previousProjectManagerUserId },
    newValue: { projectManagerUserId: body.projectManagerUserId },
    req,
  });
  ok(res, updated);
}));

router.post('/:id/assign', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['IT_HEAD']);
  if (!['ASSIGNMENT_PENDING', 'ASSIGNED'].includes(request.status)) {
    throw new ApiError(409, 'Resources can only be assigned while assignment is pending or already completed.');
  }
  const body = z.object({
    developerUserId: z.coerce.number().int().positive(),
    qaUserId: z.coerce.number().int().positive(),
    notes: z.string().optional(),
  }).parse(req.body);
  const previousAssignment = await getActiveAssignment(request.id);
  const nextAssignees = await query(
    `SELECT u.id, u.full_name, r.code AS role_code
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id IN (:developerUserId, :qaUserId) AND u.status = 'ACTIVE'`,
    { developerUserId: body.developerUserId, qaUserId: body.qaUserId },
  );
  const selectedDeveloper = nextAssignees.find((assignee) => Number(assignee.id) === Number(body.developerUserId));
  const selectedQa = nextAssignees.find((assignee) => Number(assignee.id) === Number(body.qaUserId));
  if (!selectedDeveloper || selectedDeveloper.role_code !== 'DEVELOPER') throw new ApiError(400, 'Assigned team member must be an active developer.');
  if (!selectedQa || selectedQa.role_code !== 'QA') throw new ApiError(400, 'Reviewer must be an active QA employee.');
  const nextDeveloperName = selectedDeveloper.full_name;
  const nextQaName = selectedQa.full_name;
  const assignmentChanges = [];
  if (previousAssignment?.developer_user_id && previousAssignment.developer_user_id !== body.developerUserId) {
    assignmentChanges.push(`Assigned team member changed from ${previousAssignment.developer_name || 'previous team member'} to ${nextDeveloperName}.`);
  }
  if (previousAssignment?.qa_user_id && previousAssignment.qa_user_id !== body.qaUserId) {
    assignmentChanges.push(`Reviewer changed from ${previousAssignment.qa_name || 'previous reviewer'} to ${nextQaName}.`);
  }
  const assignmentComment = previousAssignment
    ? assignmentChanges.length > 0
      ? `Assignment updated. ${assignmentChanges.join(' ')}`
      : 'Assignment updated.'
    : `Team assigned. Assigned team member ${nextDeveloperName}. Reviewer ${nextQaName}. Status changed to Team Assigned.`;

  await query('UPDATE assignments SET is_active = FALSE WHERE request_id = :requestId', { requestId: request.id });
  await query(
    `INSERT INTO assignments (request_id, developer_user_id, qa_user_id, assigned_by_user_id, notes)
     VALUES (:requestId, :developerUserId, :qaUserId, :assignedBy, :notes)`,
    { requestId: request.id, developerUserId: body.developerUserId, qaUserId: body.qaUserId, assignedBy: req.user.id, notes: body.notes || null },
  );
  await query(
    "UPDATE requests SET status = 'ASSIGNED', current_assignee_user_id = :developerUserId, it_head_user_id = :itHeadUserId WHERE id = :requestId",
    { requestId: request.id, developerUserId: body.developerUserId, itHeadUserId: req.user.id },
  );
  await query(
    `INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
     VALUES (:requestId, :fromStatus, 'ASSIGNED', :actorUserId, :comment)`,
    {
      requestId: request.id,
      fromStatus: request.status,
      actorUserId: req.user.id,
      comment: body.notes || assignmentComment,
    },
  );
  await notify({ recipientUserId: body.developerUserId, requestId: request.id, type: 'REQUEST_ASSIGNED', title: 'Request assigned', message: `${request.request_number} has been assigned to you for work.` });
  await notify({ recipientUserId: body.qaUserId, requestId: request.id, type: 'REQUEST_ASSIGNED_QA', title: 'Review assigned', message: `${request.request_number} has been assigned to you for review and validation.` });
  await audit({
    actorUserId: req.user.id,
    action: previousAssignment ? 'REQUEST_REASSIGNED' : 'REQUEST_ASSIGNED',
    entityType: 'REQUEST',
    entityId: request.id,
    oldValue: previousAssignment || null,
    newValue: body,
    req,
  });
  ok(res, await getRequestById(request.id));
}));

router.post('/:id/development/start', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['DEVELOPER']);
  const assignment = await getActiveAssignment(request.id);
  if (assignment?.developer_user_id !== req.user.id && req.user.role_code !== 'SYSTEM_ADMIN') throw new ApiError(403, 'Only the assigned team member can start work.');
  const updated = await transitionRequest({ requestId: request.id, toStatus: 'IN_DEVELOPMENT', actorUserId: req.user.id, comment: 'Work started.', req, patch: { current_assignee_user_id: req.user.id } });
  ok(res, updated);
}));

router.post('/:id/development/update', upload.single('attachment'), asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['DEVELOPER']);
  const assignment = await getActiveAssignment(request.id);
  if (assignment?.developer_user_id !== req.user.id && req.user.role_code !== 'SYSTEM_ADMIN') {
    throw new ApiError(403, 'Only the assigned team member can update progress.');
  }
  const body = z.object({ progressPercentage: z.coerce.number().int().min(0).max(100), updateNotes: z.string().min(3) }).parse(req.body);
  const previousProgress = Number(request.progress_percentage || 0);
  let attachmentId = null;

  if (req.file) {
    const attachment = await query(
      `INSERT INTO request_attachments
        (request_id, uploaded_by_user_id, file_name, original_file_name, mime_type, file_size_bytes, storage_path)
       VALUES (:requestId, :uploadedBy, :fileName, :originalFileName, :mimeType, :fileSize, :storagePath)`,
      {
        requestId: request.id,
        uploadedBy: req.user.id,
        fileName: req.file.filename,
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        storagePath: req.file.path,
      },
    );
    attachmentId = attachment.insertId;
  }

  await query(
    `INSERT INTO development_updates (request_id, developer_user_id, progress_percentage, update_notes, attachment_id)
     VALUES (:requestId, :developerUserId, :progressPercentage, :updateNotes, :attachmentId)`,
    { requestId: request.id, developerUserId: req.user.id, progressPercentage: body.progressPercentage, updateNotes: body.updateNotes, attachmentId },
  );
  await query('UPDATE requests SET progress_percentage = :progress WHERE id = :requestId', { requestId: request.id, progress: body.progressPercentage });
  await addComment(request.id, req.user.id, 'DEVELOPMENT', body.updateNotes, true);
  await query(
    `INSERT INTO request_status_history (request_id, from_status, to_status, changed_by_user_id, comment)
     VALUES (:requestId, :fromStatus, :toStatus, :actorUserId, :comment)`,
    {
      requestId: request.id,
      fromStatus: request.status,
      toStatus: request.status,
      actorUserId: req.user.id,
      comment: `Progress Updated: ${previousProgress}% → ${body.progressPercentage}%. ${body.updateNotes}`,
    },
  );

  const crossedMilestones = crossedProgressMilestones(previousProgress, body.progressPercentage);
  if (crossedMilestones.length) {
    const recipients = await getProgressStakeholderIds(request, assignment);
    await Promise.all(recipients.map((recipientUserId) => notify({
      recipientUserId,
      requestId: request.id,
      type: body.progressPercentage >= 100 ? 'DEVELOPMENT_READY_FOR_TESTING' : 'DEVELOPMENT_PROGRESS_UPDATED',
      title: body.progressPercentage >= 100 ? 'Ready for review' : 'Progress updated',
      message: `${request.request_number} is now ${body.progressPercentage}% complete.`,
    })));
  }

  await audit({
    actorUserId: req.user.id,
    action: 'DEVELOPMENT_UPDATED',
    entityType: 'REQUEST',
    entityId: request.id,
    oldValue: { progressPercentage: previousProgress },
    newValue: { ...body, attachmentId },
    req,
  });
  ok(res, await getRequestById(request.id));
}));

router.post('/:id/development/complete', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['DEVELOPER']);
  const assignment = await getActiveAssignment(request.id);
  const body = z.object({ comment: z.string().optional() }).parse(req.body);
  await addComment(request.id, req.user.id, 'DEVELOPMENT', body.comment || 'Work complete.', true);
  const updated = await transitionRequest({
    requestId: request.id,
    toStatus: 'DEVELOPMENT_COMPLETE',
    actorUserId: req.user.id,
    comment: body.comment || 'Work complete.',
    req,
    patch: { progress_percentage: 100, current_assignee_user_id: assignment?.qa_user_id || null },
  });
  await transitionRequest({ requestId: request.id, toStatus: 'IN_TESTING', actorUserId: req.user.id, comment: 'Routed to review and validation.', req, patch: { current_assignee_user_id: assignment?.qa_user_id || null } });
  await notify({ recipientUserId: assignment?.qa_user_id, requestId: request.id, type: 'TESTING_PENDING', title: 'Review pending', message: `${request.request_number} is ready for review and validation.` });
  ok(res, updated);
}));

router.post('/:id/testing/result', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['QA']);
  const body = z.object({
    result: z.enum(['PASS', 'FAIL', 'RETEST_REQUIRED']),
    testSummary: z.string().min(3),
    defectsFound: z.string().optional().nullable(),
  }).parse(req.body);
  await query(
    `INSERT INTO test_results (request_id, qa_user_id, result, test_summary, defects_found)
     VALUES (:requestId, :qaUserId, :result, :testSummary, :defectsFound)`,
    { requestId: request.id, qaUserId: req.user.id, result: body.result, testSummary: body.testSummary, defectsFound: body.defectsFound || null },
  );
  await addComment(request.id, req.user.id, 'TESTING', body.testSummary, true);
  if (body.result === 'PASS') {
    const uatUserId = await resolveRequestUatApproverId(request);
    const updated = await transitionRequest({ requestId: request.id, toStatus: 'UAT_PENDING', actorUserId: req.user.id, comment: body.testSummary, req, patch: { current_assignee_user_id: uatUserId } });
    await notify({ recipientUserId: uatUserId, requestId: request.id, type: 'UAT_PENDING', title: 'Final approval pending', message: `${request.request_number} is ready for final approval.` });
    return ok(res, updated);
  }

  const assignment = await getActiveAssignment(request.id);
  const failed = await transitionRequest({ requestId: request.id, toStatus: 'TEST_FAILED', actorUserId: req.user.id, comment: body.testSummary, req, patch: { current_assignee_user_id: assignment?.developer_user_id || null } });
  await transitionRequest({ requestId: request.id, toStatus: 'IN_DEVELOPMENT', actorUserId: req.user.id, comment: 'Returned for changes after review.', req, patch: { current_assignee_user_id: assignment?.developer_user_id || null } });
  await notify({ recipientUserId: assignment?.developer_user_id, requestId: request.id, type: 'TESTING_FAILED', title: 'Review returned', message: `${request.request_number} needs changes after review.` });
  ok(res, failed);
}));

router.post('/:id/testing/request-clarification', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['QA']);
  if (request.status !== 'IN_TESTING') throw new ApiError(409, 'Clarification can only be requested during review and validation.');
  const assignment = await getActiveAssignment(request.id);
  if (assignment?.qa_user_id !== req.user.id && req.user.role_code !== 'SYSTEM_ADMIN') throw new ApiError(403, 'Only the assigned reviewer can request clarification.');
  const body = clarificationBodySchema.parse(req.body);
  const updated = await createClarificationRequest({
    request,
    actorUserId: req.user.id,
    reasonCategory: body.reasonCategory,
    note: body.note,
    returnStatus: 'IN_TESTING',
    returnAssigneeUserId: req.user.id,
    req,
  });
  ok(res, updated);
}));

router.post('/:id/uat/approve', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['UAT_APPROVER']);
  const body = z.object({ comments: z.string().optional() }).parse(req.body);
  await query(
    `INSERT INTO uat_approvals (request_id, uat_approver_user_id, decision, comments)
     VALUES (:requestId, :userId, 'APPROVED', :comments)`,
    { requestId: request.id, userId: req.user.id, comments: body.comments || null },
  );
  await addComment(request.id, req.user.id, 'UAT', body.comments || 'Final approval completed.');
  const updated = await transitionRequest({ requestId: request.id, toStatus: 'CLOSED', actorUserId: req.user.id, comment: body.comments || 'Final approval completed and request completed.', req, patch: { current_assignee_user_id: null } });
  await notify({ recipientUserId: request.requester_user_id, requestId: request.id, type: 'REQUEST_CLOSED', title: 'Request completed', message: `${request.request_number} has been completed.` });
  ok(res, updated);
}));

router.post('/:id/uat/reject', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['UAT_APPROVER']);
  const body = z.object({ comments: z.string().min(3) }).parse(req.body);
  const assignment = await getActiveAssignment(request.id);
  await query(
    `INSERT INTO uat_approvals (request_id, uat_approver_user_id, decision, comments)
     VALUES (:requestId, :userId, 'REJECTED', :comments)`,
    { requestId: request.id, userId: req.user.id, comments: body.comments },
  );
  await addComment(request.id, req.user.id, 'UAT', body.comments);
  const rejected = await transitionRequest({ requestId: request.id, toStatus: 'UAT_REJECTED', actorUserId: req.user.id, comment: body.comments, req, patch: { current_assignee_user_id: assignment?.developer_user_id || null } });
  await transitionRequest({ requestId: request.id, toStatus: 'IN_DEVELOPMENT', actorUserId: req.user.id, comment: 'Returned for changes after final approval review.', req, patch: { current_assignee_user_id: assignment?.developer_user_id || null } });
  await notify({ recipientUserId: assignment?.developer_user_id, requestId: request.id, type: 'UAT_REJECTED', title: 'Final approval returned', message: `${request.request_number} needs changes after final approval review.` });
  ok(res, rejected);
}));

router.post('/:id/uat/request-clarification', asyncHandler(async (req, res) => {
  const request = await assertRequestAccess(req, req.params.id, ['UAT_APPROVER']);
  if (request.status !== 'UAT_PENDING') throw new ApiError(409, 'Clarification can only be requested during final approval.');
  if (request.current_assignee_user_id !== req.user.id && req.user.role_code !== 'SYSTEM_ADMIN') throw new ApiError(403, 'Only the assigned final approver can request clarification.');
  const body = clarificationBodySchema.parse(req.body);
  const updated = await createClarificationRequest({
    request,
    actorUserId: req.user.id,
    reasonCategory: body.reasonCategory,
    note: body.note,
    returnStatus: 'UAT_PENDING',
    returnAssigneeUserId: req.user.id,
    req,
  });
  ok(res, updated);
}));

module.exports = router;
