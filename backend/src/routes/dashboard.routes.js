const express = require('express');
const { query } = require('../config/database');
const { asyncHandler, ok } = require('../lib/http');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

async function scalar(sql, params) {
  const rows = await query(sql, params);
  return Number(Object.values(rows[0] || { count: 0 })[0] || 0);
}

router.get('/me', asyncHandler(async (req, res) => {
  const params = { userId: req.user.id, departmentId: req.user.department_id };
  const role = req.user.role_code;
  const cards = [];

  if (role === 'SYSTEM_ADMIN') {
    cards.push(
      { label: 'Total Requests', value: await scalar('SELECT COUNT(*) AS count FROM requests', params) },
      { label: 'Pending Approval', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'DEPARTMENT_APPROVAL_PENDING'", params) },
      { label: 'Internal Review', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'IT_REVIEW_PENDING'", params) },
      { label: 'Waiting For Assignment', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'ASSIGNMENT_PENDING'", params) },
      { label: 'Team Assigned', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'ASSIGNED'", params) },
      { label: 'Requests In Progress', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status IN ('IN_DEVELOPMENT','DEVELOPMENT_COMPLETE')", params) },
      { label: 'Review & Validation', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'IN_TESTING'", params) },
      { label: 'Final Approval', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'UAT_PENDING'", params) },
      { label: 'Completed', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'CLOSED'", params) },
    );
  } else if (role === 'DEPARTMENT_HEAD') {
    cards.push(
      { label: 'Department Requests', value: await scalar('SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId', params) },
      { label: 'Pending Approval', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'DEPARTMENT_APPROVAL_PENDING'", params) },
      { label: 'Approved By Department', value: await scalar("SELECT COUNT(*) AS count FROM request_status_history WHERE changed_by_user_id = :userId AND to_status = 'IT_REVIEW_PENDING'", params) },
      { label: 'Waiting For More Information', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'CLARIFICATION_REQUESTED'", params) },
      { label: 'Waiting For Assignment', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'ASSIGNMENT_PENDING'", params) },
      { label: 'Team Assigned', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'ASSIGNED'", params) },
      { label: 'Requests In Progress', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status IN ('IN_DEVELOPMENT','DEVELOPMENT_COMPLETE')", params) },
      { label: 'Review & Validation', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'IN_TESTING'", params) },
      { label: 'Completed', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE requester_department_id = :departmentId AND status = 'CLOSED'", params) },
    );
  } else if (role === 'IT_HEAD') {
    cards.push(
      { label: 'Pending Internal Review', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'IT_REVIEW_PENDING'", params) },
      { label: 'Waiting For Assignment', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'ASSIGNMENT_PENDING'", params) },
      { label: 'Team Assigned', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'ASSIGNED'", params) },
      { label: 'Requests In Progress', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'IN_DEVELOPMENT'", params) },
      { label: 'Average Completion %', value: await scalar("SELECT COALESCE(ROUND(AVG(progress_percentage)), 0) AS count FROM requests WHERE status IN ('ASSIGNED','IN_DEVELOPMENT','DEVELOPMENT_COMPLETE')", params) },
      { label: 'Requests Behind Schedule', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'IN_DEVELOPMENT' AND progress_percentage < 75 AND updated_at < DATE_SUB(NOW(), INTERVAL 5 DAY)", params) },
      { label: 'Review & Validation', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'IN_TESTING'", params) },
      { label: 'Final Approval', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'UAT_PENDING'", params) },
      { label: 'Completed', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'CLOSED' AND it_head_user_id IS NOT NULL", params) },
    );
  } else if (role === 'DEVELOPER') {
    cards.push(
      { label: 'Assigned Requests', value: await scalar('SELECT COUNT(*) AS count FROM assignments WHERE developer_user_id = :userId AND is_active = TRUE', params) },
      { label: 'Work In Progress', value: await scalar("SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.developer_user_id = :userId AND r.status = 'IN_DEVELOPMENT'", params) },
      { label: 'Ready To Start', value: await scalar("SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.developer_user_id = :userId AND r.status = 'ASSIGNED'", params) },
      { label: 'Overdue', value: 0 },
      { label: 'Completed', value: await scalar("SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.developer_user_id = :userId AND r.status IN ('DEVELOPMENT_COMPLETE','IN_TESTING','UAT_PENDING','CLOSED')", params) },
    );
  } else if (role === 'QA') {
    cards.push(
      { label: 'Pending Review', value: await scalar("SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.qa_user_id = :userId AND r.status = 'IN_TESTING'", params) },
      { label: 'In Review', value: await scalar("SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.qa_user_id = :userId AND r.status = 'IN_TESTING'", params) },
      { label: 'Failed', value: await scalar("SELECT COUNT(*) AS count FROM test_results WHERE qa_user_id = :userId AND result IN ('FAIL','RETEST_REQUIRED')", params) },
      { label: 'Passed', value: await scalar("SELECT COUNT(*) AS count FROM test_results WHERE qa_user_id = :userId AND result = 'PASS'", params) },
      { label: 'Pending Final Approval', value: await scalar("SELECT COUNT(*) AS count FROM requests r JOIN assignments a ON a.request_id = r.id AND a.is_active = TRUE WHERE a.qa_user_id = :userId AND r.status = 'UAT_PENDING'", params) },
    );
  } else if (role === 'UAT_APPROVER') {
    cards.push(
      { label: 'Pending Final Approval', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'UAT_PENDING'", params) },
      { label: 'Approved', value: await scalar("SELECT COUNT(*) AS count FROM uat_approvals WHERE uat_approver_user_id = :userId AND decision = 'APPROVED'", params) },
      { label: 'Rejected', value: await scalar("SELECT COUNT(*) AS count FROM uat_approvals WHERE uat_approver_user_id = :userId AND decision = 'REJECTED'", params) },
      { label: 'Returned for Changes', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE status = 'UAT_REJECTED'", params) },
    );
  } else {
    cards.push(
      { label: 'My Requests', value: await scalar('SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId', params) },
      { label: 'Pending Approval', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status IN ('DEPARTMENT_APPROVAL_PENDING','IT_REVIEW_PENDING')", params) },
      { label: 'Waiting For Assignment', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status = 'ASSIGNMENT_PENDING'", params) },
      { label: 'Waiting For More Information', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status = 'CLARIFICATION_REQUESTED'", params) },
      { label: 'In Progress', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status IN ('ASSIGNED','IN_DEVELOPMENT','DEVELOPMENT_COMPLETE','IN_TESTING','UAT_PENDING')", params) },
      { label: 'Completed', value: await scalar("SELECT COUNT(*) AS count FROM requests WHERE requester_user_id = :userId AND status = 'CLOSED'", params) },
    );
  }

  const recentActivity = await query(
    `SELECT r.id, r.request_number, r.title, r.status, r.updated_at
     FROM requests r
     WHERE (:role IN ('SYSTEM_ADMIN', 'IT_HEAD')
        OR r.requester_user_id = :userId
        OR r.department_head_user_id = :userId
        OR r.current_assignee_user_id = :userId)
     ORDER BY r.updated_at DESC
     LIMIT 8`,
    { ...params, role },
  );

  ok(res, { role, cards, recentActivity });
}));

module.exports = router;
