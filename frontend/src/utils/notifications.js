export const notificationFilters = [
  { id: 'ALL', label: 'All' },
  { id: 'UNREAD', label: 'Unread' },
  { id: 'APPROVALS', label: 'Approvals' },
  { id: 'ASSIGNMENTS', label: 'Assignments' },
  { id: 'CLARIFICATIONS', label: 'Clarifications' },
  { id: 'COMMENTS', label: 'Comments' },
  { id: 'SYSTEM', label: 'System' },
];

const notificationTypeRules = [
  { match: ['APPROVAL', 'AWAITING_APPROVAL', 'IT_REVIEW_PENDING', 'UAT_PENDING'], label: 'Approval Required', category: 'APPROVALS', tone: 'warning' },
  { match: ['APPROVED', 'CLOSED'], label: 'Approved', category: 'APPROVALS', tone: 'success' },
  { match: ['REJECTED', 'FAILED'], label: 'Rejected', category: 'APPROVALS', tone: 'error' },
  { match: ['CLARIFICATION'], label: 'Clarification Received', category: 'CLARIFICATIONS', tone: 'info' },
  { match: ['ASSIGNED', 'ASSIGNMENT'], label: 'Developer Assigned', category: 'ASSIGNMENTS', tone: 'primary' },
  { match: ['COMMENT'], label: 'Comment Added', category: 'COMMENTS', tone: 'neutral' },
  { match: ['STATUS', 'PROGRESS', 'DEVELOPMENT', 'TESTING', 'UAT'], label: 'Status Changed', category: 'SYSTEM', tone: 'primary' },
];

export function getNotificationMeta(notification = {}) {
  const source = `${notification.type || ''} ${notification.title || ''}`.toUpperCase();
  const rule = notificationTypeRules.find((item) => item.match.some((token) => source.includes(token)));
  return rule || { label: notification.title || 'System Notification', category: 'SYSTEM', tone: 'neutral' };
}

export function formatNotificationDate(value) {
  if (!value) return 'Not available';
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value)).replace(',', ' •');
}

export function formatRelativeTime(value) {
  if (!value) return 'Just now';
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return 'Recently';
  const seconds = Math.max(0, Math.floor((Date.now() - date) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatNotificationDate(value);
}

export function groupNotificationsByDate(notifications) {
  const now = new Date();
  const today = now.toDateString();
  const yesterdayDate = new Date(now);
  yesterdayDate.setDate(now.getDate() - 1);
  const yesterday = yesterdayDate.toDateString();

  return notifications.reduce((groups, notification) => {
    const date = new Date(notification.created_at);
    const key = date.toDateString() === today
      ? 'Today'
      : date.toDateString() === yesterday
        ? 'Yesterday'
        : 'Older';
    if (!groups[key]) groups[key] = [];
    groups[key].push(notification);
    return groups;
  }, {});
}

export function filterNotifications(notifications, activeFilter, query) {
  const search = query.trim().toLowerCase();
  return notifications.filter((notification) => {
    const meta = getNotificationMeta(notification);
    const matchesFilter = activeFilter === 'ALL'
      || (activeFilter === 'UNREAD' && !notification.is_read)
      || meta.category === activeFilter;
    const haystack = [
      notification.request_number,
      notification.title,
      notification.message,
      notification.request_title,
      meta.label,
    ].filter(Boolean).join(' ').toLowerCase();
    return matchesFilter && (!search || haystack.includes(search));
  });
}
