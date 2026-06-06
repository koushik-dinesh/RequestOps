import { Chip } from '@mui/material';
import { formatEnum } from '../utils/constants';

const stylesByValue = {
  CRITICAL: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  HIGH: { color: '#C2410C', bg: '#FFEDD5', border: '#FDBA74' },
  MEDIUM: { color: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD' },
  LOW: { color: '#475569', bg: '#F1F5F9', border: '#CBD5E1' },
  SUBMITTED: { color: '#475569', bg: '#F8FAFC', border: '#CBD5E1' },
  DRAFT: { color: '#475569', bg: '#F8FAFC', border: '#CBD5E1' },
  APPROVED: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  REWORK_REQUIRED: { color: '#B45309', bg: '#FEF3C7', border: '#FCD34D' },
  DEPARTMENT_APPROVAL_PENDING: { color: '#7C3AED', bg: '#F3E8FF', border: '#C4B5FD' },
  CLARIFICATION_REQUESTED: { color: '#B45309', bg: '#FEF3C7', border: '#FCD34D' },
  IT_REVIEW_PENDING: { color: '#0369A1', bg: '#E0F2FE', border: '#7DD3FC' },
  ASSIGNMENT_PENDING: { color: '#B45309', bg: '#FEF3C7', border: '#FCD34D' },
  PM_ASSIGNED: { color: '#0369A1', bg: '#E0F2FE', border: '#7DD3FC' },
  SCOPE_REVIEW: { color: '#7C3AED', bg: '#F3E8FF', border: '#C4B5FD' },
  USER_STORY_REVIEW: { color: '#7C3AED', bg: '#F3E8FF', border: '#C4B5FD' },
  DEVELOPER_ASSIGNED: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  SPRINT_PLANNING: { color: '#0F766E', bg: '#CCFBF1', border: '#5EEAD4' },
  ASSIGNED: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  IN_DEVELOPMENT: { color: '#0F766E', bg: '#CCFBF1', border: '#5EEAD4' },
  DEVELOPMENT_COMPLETE: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  QA_PENDING: { color: '#A16207', bg: '#FEF9C3', border: '#FDE68A' },
  QA_FAILED: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  QA_PASSED: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  IN_TESTING: { color: '#A16207', bg: '#FEF9C3', border: '#FDE68A' },
  UAT_PENDING: { color: '#BE185D', bg: '#FCE7F3', border: '#F9A8D4' },
  UAT_FAILED: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  UAT_APPROVED: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  DEPLOYMENT_PENDING: { color: '#0369A1', bg: '#E0F2FE', border: '#7DD3FC' },
  DEPLOYED: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  CLOSED: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  DEPARTMENT_REJECTED: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  IT_REJECTED: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  TEST_FAILED: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  UAT_REJECTED: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  DEFERRED: { color: '#92400E', bg: '#FEF3C7', border: '#FCD34D' },
  ACTIVE: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  INACTIVE: { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
  PENDING_APPROVAL: { color: '#7C3AED', bg: '#F3E8FF', border: '#C4B5FD' },
  PLANNED: { color: '#0369A1', bg: '#E0F2FE', border: '#7DD3FC' },
  CREATED: { color: '#7C3AED', bg: '#F3E8FF', border: '#C4B5FD' },
  COMPLETED: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  CANCELLED: { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
  TODO: { color: '#475569', bg: '#F8FAFC', border: '#CBD5E1' },
  IN_PROGRESS: { color: '#0F766E', bg: '#CCFBF1', border: '#5EEAD4' },
  BLOCKED: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  DONE: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
};

export default function StatusBadge({ value, size = 'small' }) {
  const styles = stylesByValue[value] || { color: '#334155', bg: '#F1F5F9', border: '#CBD5E1' };

  return (
    <Chip
      label={formatEnum(value)}
      size={size}
      sx={{
        color: styles.color,
        bgcolor: styles.bg,
        border: `1px solid ${styles.border}`,
        '& .MuiChip-label': {
          px: 1.15,
        },
      }}
    />
  );
}
