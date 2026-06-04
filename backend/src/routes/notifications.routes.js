const express = require('express');
const { query } = require('../config/database');
const { asyncHandler, ok } = require('../lib/http');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { isRead = '' } = req.query;
  const rows = await query(
    `SELECT n.*, r.request_number, r.title AS request_title
     FROM notifications n
     LEFT JOIN requests r ON r.id = n.request_id
     WHERE n.recipient_user_id = :userId
       AND (:isRead = '' OR n.is_read = :isRead)
     ORDER BY n.created_at DESC
     LIMIT 100`,
    { userId: req.user.id, isRead },
  );
  ok(res, rows);
}));

router.post('/:id/read', asyncHandler(async (req, res) => {
  await query(
    `UPDATE notifications
     SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
     WHERE id = :id AND recipient_user_id = :userId`,
    { id: req.params.id, userId: req.user.id },
  );
  ok(res, { id: Number(req.params.id), isRead: true });
}));

router.post('/read-all', asyncHandler(async (req, res) => {
  await query(
    `UPDATE notifications
     SET is_read = TRUE, read_at = CURRENT_TIMESTAMP
     WHERE recipient_user_id = :userId AND is_read = FALSE`,
    { userId: req.user.id },
  );
  ok(res, { success: true });
}));

module.exports = router;
