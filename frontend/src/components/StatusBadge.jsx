import { Chip } from '@mui/material';
import { formatEnum } from '../utils/constants';

const stylesByValue = {
  CRITICAL: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  HIGH: { color: '#C2410C', bg: '#FFEDD5', border: '#FDBA74' },
  MEDIUM: { color: '#1D4ED8', bg: '#DBEAFE', border: '#93C5FD' },
  LOW: { color: '#475569', bg: '#F1F5F9', border: '#CBD5E1' },
  SUBMITTED: { color: '#475569', bg: '#F8FAFC', border: '#CBD5E1' },
  DEPARTMENT_APPROVAL_PENDING: { color: '#7C3AED', bg: '#F3E8FF', border: '#C4B5FD' },
  CLARIFICATION_REQUESTED: { color: '#B45309', bg: '#FEF3C7', border: '#FCD34D' },
  IT_REVIEW_PENDING: { color: '#0369A1', bg: '#E0F2FE', border: '#7DD3FC' },
  ASSIGNMENT_PENDING: { color: '#B45309', bg: '#FEF3C7', border: '#FCD34D' },
  ASSIGNED: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  IN_DEVELOPMENT: { color: '#0F766E', bg: '#CCFBF1', border: '#5EEAD4' },
  DEVELOPMENT_COMPLETE: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  IN_TESTING: { color: '#A16207', bg: '#FEF9C3', border: '#FDE68A' },
  UAT_PENDING: { color: '#BE185D', bg: '#FCE7F3', border: '#F9A8D4' },
  CLOSED: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  DEPARTMENT_REJECTED: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  IT_REJECTED: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  TEST_FAILED: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  UAT_REJECTED: { color: '#B91C1C', bg: '#FEE2E2', border: '#FCA5A5' },
  DEFERRED: { color: '#92400E', bg: '#FEF3C7', border: '#FCD34D' },
  ACTIVE: { color: '#15803D', bg: '#DCFCE7', border: '#86EFAC' },
  INACTIVE: { color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' },
  PENDING_APPROVAL: { color: '#7C3AED', bg: '#F3E8FF', border: '#C4B5FD' },
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
