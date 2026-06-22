import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Grid,
  InputAdornment,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { CheckCircle2, CircleHelp, Route, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { Page } from '../components/LayoutPrimitives';
import PageHeader from '../components/PageHeader';
import { roleLabels } from '../utils/constants';

const statusGuide = [
  { status: 'Draft', description: 'Request is being prepared and not yet submitted.' },
  { status: 'Submitted', description: 'Request has been submitted for approval.' },
  { status: 'Department Approved', description: 'Department Head approved the request.' },
  { status: 'IT Review', description: 'IT team is evaluating feasibility and requirements.' },
  { status: 'Assigned', description: 'Request has been assigned to a developer or team.' },
  { status: 'In Analysis', description: 'Requirements are being analyzed.' },
  { status: 'In Development', description: 'Development work is in progress.' },
  { status: 'Testing', description: 'Testing activities are underway.' },
  { status: 'Deployed', description: 'Solution has been deployed.' },
  { status: 'Closed', description: 'Request has been completed and accepted.' },
  { status: 'Rejected', description: 'Request has been rejected.' },
  { status: 'Deferred', description: 'Request has been postponed for future consideration.' },
];

const workflowStages = [
  'Draft',
  'Submitted',
  'Department Approved',
  'IT Review',
  'Assigned',
  'In Analysis',
  'In Development',
  'Testing',
  'Deployed',
  'Closed',
];

const alternateEndStates = [
  { label: 'Rejected', tone: 'error', description: 'Request is stopped because it cannot proceed.' },
  { label: 'Deferred', tone: 'warning', description: 'Request is postponed for future consideration.' },
];

const baseSections = [
  {
    id: 'workflow',
    title: 'Workflow Visualization',
    summary: 'Understand the standard request lifecycle and alternate end states.',
    type: 'workflow',
  },
  {
    id: 'status-guide',
    title: 'Request Status Guide',
    summary: 'Use this table to understand what each request status means.',
    type: 'statusGuide',
  },
];

const manualByRole = {
  EMPLOYEE: {
    title: 'Employee Manual',
    subtitle: 'Create requests, track progress, and collaborate with approvers and delivery teams.',
    sections: [
      {
        id: 'employee-actions',
        title: 'What Can I Do?',
        summary: 'Daily actions available to employees.',
        items: [
          'Create new requests',
          'View my requests',
          'Edit draft requests',
          'Track request progress',
          'Add comments and attachments',
          'Close completed requests',
        ],
      },
      ...baseSections,
    ],
  },
  DEPARTMENT_HEAD: {
    title: 'Department Head Manual',
    subtitle: 'Review department submissions, make approval decisions, and track implementation.',
    sections: [
      {
        id: 'department-head-actions',
        title: 'What Can I Do?',
        summary: 'Actions available to department approvers.',
        items: [
          'Review submitted requests',
          'Approve requests',
          'Reject requests',
          'Request clarification',
          'View all requests from my department',
          'Close completed requests',
        ],
      },
      {
        id: 'approval-process',
        title: 'Approval Process',
        summary: 'Standard department approval flow.',
        steps: [
          'Employee submits request',
          'Department Head reviews request',
          'Approve, Reject, or Request Clarification',
          'Track implementation progress',
          'Close request after successful deployment',
        ],
      },
      ...baseSections,
    ],
  },
  IT_HEAD: {
    title: 'IT Manager Manual',
    subtitle: 'Evaluate feasibility, prioritize approved requests, and coordinate delivery resources.',
    sections: [
      {
        id: 'it-manager-actions',
        title: 'What Can I Do?',
        summary: 'Actions available to IT Heads and IT Managers.',
        items: [
          'Review approved requests',
          'Evaluate feasibility',
          'Assign resources',
          'Set priorities',
          'Monitor development progress',
          'Manage workloads',
        ],
      },
      ...baseSections,
    ],
  },
  PROJECT_MANAGER: {
    title: 'Project Manager Manual',
    subtitle: 'Own scope, user stories, sprint planning, developer coordination, and delivery tracking.',
    sections: [
      {
        id: 'project-manager-actions',
        title: 'What Can I Do?',
        summary: 'Actions available to Project Managers.',
        items: [
          'Review assigned requests',
          'Define scope and user stories',
          'Plan and manage sprints',
          'Assign developers to sprint tasks',
          'Track delivery progress and blockers',
          'Submit work for QA and requester testing',
          'Complete deployment and closure steps',
        ],
      },
      {
        id: 'project-manager-workflow',
        title: 'Typical Workflow',
        summary: 'Common delivery path for assigned projects.',
        steps: [
          'Project Manager assigned',
          'Scope and user story planning',
          'Requirements approval',
          'Sprint planning and execution',
          'QA and requester testing',
          'Deployment and sign-off',
        ],
      },
      ...baseSections,
    ],
  },
  DEVELOPER: {
    title: 'Developer Manual',
    subtitle: 'Work through assigned requests, update progress, and provide implementation evidence.',
    sections: [
      {
        id: 'developer-actions',
        title: 'What Can I Do?',
        summary: 'Actions available to assigned delivery team members.',
        items: [
          'View assigned requests',
          'Update request status',
          'Add implementation notes',
          'Upload supporting documents',
          'Mark work as completed',
        ],
      },
      {
        id: 'developer-workflow',
        title: 'Typical Workflow',
        summary: 'Common delivery path for assigned work.',
        steps: ['Assigned', 'In Analysis', 'In Development', 'Testing', 'Deployed'],
      },
      ...baseSections,
    ],
  },
  QA: {
    title: 'QA Manual',
    subtitle: 'Validate completed work, record results, and return requests when issues remain.',
    sections: [
      {
        id: 'qa-actions',
        title: 'What Can I Do?',
        summary: 'Actions available to reviewers.',
        items: [
          'View requests ready for testing',
          'Review implementation notes and attachments',
          'Record test summary',
          'Pass requests to final approval',
          'Return requests for changes',
          'Request clarification when information is missing',
        ],
      },
      ...baseSections,
    ],
  },
  UAT_APPROVER: {
    title: 'Final Approver Manual',
    subtitle: 'Perform final business acceptance before requests are closed.',
    sections: [
      {
        id: 'final-approval-actions',
        title: 'What Can I Do?',
        summary: 'Actions available during final approval.',
        items: [
          'View requests awaiting final approval',
          'Review delivered outcome',
          'Approve and close accepted requests',
          'Return requests for changes',
          'Request clarification when acceptance details are unclear',
        ],
      },
      ...baseSections,
    ],
  },
  SYSTEM_ADMIN: {
    title: 'System Admin Manual',
    subtitle: 'Administer users, departments, workflow visibility, and operational governance.',
    sections: [
      {
        id: 'admin-actions',
        title: 'What Can I Do?',
        summary: 'Administrative capabilities available to system administrators.',
        items: [
          'Manage users',
          'Manage departments',
          'Configure workflow settings',
          'View analytics and reports',
          'Audit user actions',
          'Reopen requests if necessary',
        ],
      },
      ...baseSections,
    ],
  },
};

function normalize(value = '') {
  return value.toLowerCase().trim();
}

function sectionMatches(section, query) {
  if (!query) return true;
  const searchable = [
    section.title,
    section.summary,
    ...(section.items || []),
    ...(section.steps || []),
    section.type === 'statusGuide' ? statusGuide.map((row) => `${row.status} ${row.description}`).join(' ') : '',
    section.type === 'workflow' ? [...workflowStages, ...alternateEndStates.map((state) => state.label)].join(' ') : '',
  ].join(' ');
  return normalize(searchable).includes(query);
}

export default function UserManualPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const manual = manualByRole[user?.roleCode] || manualByRole.EMPLOYEE;
  const query = normalize(search);
  const filteredSections = useMemo(
    () => manual.sections.filter((section) => sectionMatches(section, query)),
    [manual.sections, query],
  );

  return (
    <Page maxWidth={1480}>
      <Stack spacing={2.5}>
        <PageHeader
          eyebrow="USER MANUAL"
          title={manual.title}
          description={manual.subtitle}
          actions={(
            <TextField
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search manual content..."
              sx={{ width: { xs: '100%', md: 360 } }}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Search size={17} />
                  </InputAdornment>
                ),
              }}
            />
          )}
        />

        <Grid container spacing={2.25} sx={{ alignItems: 'flex-start' }}>
          <Grid size={{ xs: 12, lg: 8 }}>
            <Stack spacing={1.5}>
              {filteredSections.length === 0 ? (
                <ManualCard>
                  <Typography variant="subtitle1" fontWeight={850}>No manual sections found</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                    Try searching for a status, workflow step, or action such as approval, assignment, testing, or comments.
                  </Typography>
                </ManualCard>
              ) : filteredSections.map((section, index) => (
                <ManualSection key={section.id} section={section} defaultExpanded={index === 0} />
              ))}
            </Stack>
          </Grid>

          <Grid size={{ xs: 12, lg: 4 }}>
            <Stack spacing={1.5} sx={{ position: { lg: 'sticky' }, top: { lg: 84 } }}>
              <QuickHelpCard roleCode={user?.roleCode} />
              <ManualCard>
                <Stack direction="row" spacing={1.2} sx={{ alignItems: 'center', mb: 1.25 }}>
                  <Box sx={{ color: 'primary.main' }}><Route size={20} /></Box>
                  <Box>
                    <Typography variant="subtitle2" fontWeight={900}>Workflow Snapshot</Typography>
                    <Typography variant="caption" color="text.secondary">Standard flow at a glance</Typography>
                  </Box>
                </Stack>
                <CompactWorkflow />
              </ManualCard>
            </Stack>
          </Grid>
        </Grid>
      </Stack>
    </Page>
  );
}

function ManualSection({ section, defaultExpanded }) {
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      sx={{
        borderRadius: '16px !important',
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.elevated,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
        overflow: 'hidden',
        '&:before': { display: 'none' },
      }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 2, py: 0.75, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={900}>{section.title}</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{section.summary}</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ p: { xs: 1.5, md: 2 } }}>
        {section.type === 'statusGuide' ? <StatusGuideTable /> : null}
        {section.type === 'workflow' ? <WorkflowTimeline /> : null}
        {section.items ? <BulletList items={section.items} /> : null}
        {section.steps ? <StepList steps={section.steps} /> : null}
      </AccordionDetails>
    </Accordion>
  );
}

function ManualCard({ children }) {
  return (
    <Box
      sx={{
        p: 2,
        borderRadius: 2.25,
        border: (theme) => `1px solid ${theme.custom.semantic.borderSoft}`,
        bgcolor: (theme) => theme.custom.semantic.elevated,
        boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}
    >
      {children}
    </Box>
  );
}

function BulletList({ items }) {
  return (
    <Grid container spacing={1}>
      {items.map((item) => (
        <Grid key={item} size={{ xs: 12, md: 6 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', p: 1.2, borderRadius: 1.5, bgcolor: (theme) => theme.custom.semantic.paperSoft }}>
            <CheckCircle2 size={17} color="#16A34A" style={{ marginTop: 2, flexShrink: 0 }} />
            <Typography variant="body2" fontWeight={700}>{item}</Typography>
          </Stack>
        </Grid>
      ))}
    </Grid>
  );
}

function StepList({ steps }) {
  return (
    <Stack spacing={1}>
      {steps.map((step, index) => (
        <Stack key={step} direction="row" spacing={1.25} sx={{ alignItems: 'flex-start' }}>
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              bgcolor: 'primary.main',
              color: '#FFFFFF',
              fontSize: 12,
              fontWeight: 900,
              flexShrink: 0,
            }}
          >
            {index + 1}
          </Box>
          <Typography variant="body2" sx={{ pt: 0.25 }}>{step}</Typography>
        </Stack>
      ))}
    </Stack>
  );
}

function StatusGuideTable() {
  return (
    <TableContainer sx={{ borderRadius: 2, border: '1px solid', borderColor: 'divider', overflowX: 'auto' }}>
      <Table size="small" sx={{ minWidth: 680 }}>
        <TableHead>
          <TableRow>
            <TableCell>Status</TableCell>
            <TableCell>Description</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {statusGuide.map((row) => (
            <TableRow key={row.status} hover>
              <TableCell sx={{ width: 220 }}>
                <Chip size="small" label={row.status} sx={{ borderRadius: 1, fontWeight: 850 }} />
              </TableCell>
              <TableCell>
                <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{row.description}</Typography>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

function WorkflowTimeline() {
  return (
    <Stack spacing={1.1}>
      {workflowStages.map((stage, index) => (
        <Stack key={stage} direction="row" spacing={1.2} sx={{ alignItems: 'stretch' }}>
          <Stack sx={{ alignItems: 'center', width: 28, flexShrink: 0 }}>
            <Box
              sx={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                bgcolor: index === 0 ? 'primary.main' : (theme) => theme.custom.semantic.paperSoft,
                border: (theme) => `1px solid ${index === 0 ? theme.palette.primary.main : theme.custom.semantic.borderSoft}`,
                color: index === 0 ? '#FFFFFF' : 'text.secondary',
                fontSize: 11,
                fontWeight: 900,
              }}
            >
              {index + 1}
            </Box>
            {index < workflowStages.length - 1 && (
              <Box sx={{ width: 2, flex: 1, minHeight: 18, bgcolor: (theme) => theme.custom.semantic.borderSoft }} />
            )}
          </Stack>
          <Box sx={{ flex: 1, minWidth: 0, pb: index < workflowStages.length - 1 ? 0.5 : 0 }}>
            <Typography variant="body2" fontWeight={850}>{stage}</Typography>
            <Typography variant="caption" color="text.secondary">{statusGuide.find((row) => row.status === stage)?.description || 'Workflow stage'}</Typography>
          </Box>
        </Stack>
      ))}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pt: 1 }}>
        {alternateEndStates.map((state) => (
          <Box
            key={state.label}
            sx={{
              flex: 1,
              p: 1.25,
              borderRadius: 1.5,
              border: (theme) => `1px solid ${state.tone === 'error' ? theme.palette.error.main : theme.palette.warning.main}`,
              bgcolor: (theme) => state.tone === 'error' ? theme.palette.error.light : theme.palette.warning.light,
            }}
          >
            <Typography variant="body2" fontWeight={900}>{state.label}</Typography>
            <Typography variant="caption" color="text.secondary">{state.description}</Typography>
          </Box>
        ))}
      </Stack>
    </Stack>
  );
}

function CompactWorkflow() {
  return (
    <Stack spacing={0.8}>
      {workflowStages.slice(0, 6).map((stage) => (
        <Stack key={stage} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
          <Typography variant="caption" fontWeight={760}>{stage}</Typography>
        </Stack>
      ))}
      <Typography variant="caption" color="text.secondary">Continues through development, testing, deployment, and closure.</Typography>
    </Stack>
  );
}

function QuickHelpCard({ roleCode }) {
  return (
    <ManualCard>
      <Stack direction="row" spacing={1.2} sx={{ alignItems: 'flex-start' }}>
        <Box sx={{ color: 'primary.main', mt: 0.2 }}><ShieldCheck size={20} /></Box>
        <Box sx={{ minWidth: 0 }}>
          <Typography variant="subtitle2" fontWeight={900}>Role-Based Guidance</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.4, overflowWrap: 'anywhere' }}>
            This manual is tailored for {roleLabels[roleCode] || 'your role'}. As your role changes, the guidance on this page changes automatically.
          </Typography>
        </Box>
      </Stack>
      <Stack direction="row" spacing={1} sx={{ mt: 1.5, alignItems: 'center' }}>
        <CircleHelp size={17} />
        <Typography variant="caption" color="text.secondary">
          Search for actions, statuses, or workflow stages.
        </Typography>
      </Stack>
    </ManualCard>
  );
}
