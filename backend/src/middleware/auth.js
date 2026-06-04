const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { query } = require('../config/database');
const { ApiError } = require('../lib/http');

async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : req.query.token;
    if (!token) throw new ApiError(401, 'Authentication required.');

    const payload = jwt.verify(token, env.jwt.accessSecret);
    const rows = await query(
      `SELECT u.id, u.employee_id, u.full_name, u.email, u.mobile_number, u.designation,
              u.department_id, u.reporting_manager_user_id, u.status, r.code AS role_code, r.name AS role_name,
              d.name AS department_name, d.code AS department_code,
              COALESCE(rm.id, dh.id) AS department_head_id,
              COALESCE(rm.full_name, dh.full_name) AS department_head_name,
              COALESCE(rm.email, dh.email) AS department_head_email
       FROM users u
       JOIN roles r ON r.id = u.role_id
       LEFT JOIN departments d ON d.id = u.department_id
       LEFT JOIN users rm ON rm.id = u.reporting_manager_user_id
       LEFT JOIN users dh ON dh.id = d.department_head_user_id
       WHERE u.id = :id`,
      { id: payload.sub },
    );

    const user = rows[0];
    if (!user || user.status !== 'ACTIVE') throw new ApiError(401, 'Account is not active.');
    req.user = user;
    next();
  } catch (error) {
    next(error.statusCode ? error : new ApiError(401, 'Invalid or expired token.'));
  }
}

function authorize(...roleCodes) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required.'));
    if (req.user.role_code === 'SYSTEM_ADMIN' || roleCodes.includes(req.user.role_code)) {
      return next();
    }
    return next(new ApiError(403, 'You do not have permission to perform this action.'));
  };
}

module.exports = {
  authenticate,
  authorize,
};
