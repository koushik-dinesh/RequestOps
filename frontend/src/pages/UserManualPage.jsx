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

const alternateEndStates = [
  { label: 'Rejected', tone: 'error', description: 'Request is stopped because it cannot proceed.' },
  { label: 'Withdrawn', tone: 'warning', description: 'The original requester withdrew the request before sign-off.' },
];

function workflowSection({ summary, stages }) {
  return {
    id: 'workflow',
    title: 'Workflow Visualization',
    summary,
    type: 'workflow',
    stages,
    alternateEndStates,
  };
}

function statusGuideSection({ summary, rows }) {
  return {
    id: 'status-guide',
    title: 'Request Status Guide',
    summary,
    type: 'statusGuide',
    rows,
  };
}

const manualByRole = {
  EMPLOYEE: {
    title: 'Employee Manual',
    subtitle: 'Create requests, track progress, perform pre-deployment UAT, and sign off completed work.',
    workflowSnapshot: ['Submitted', 'Department Approved', 'IT Review', 'In Development', 'Review & Validation', 'Requester UAT for Pre-Deployment'],
    sections: [
      {
        id: 'employee-actions',
        title: 'What Can I Do?',
        summary: 'Daily actions available to employees.',
        items: [
          'Create and submit new requests',
          'View and track my requests',
          'Edit draft requests before submission',
          'Add comments and attachments',
          'Withdraw my request while it is still in progress',
          'Perform Requester UAT for Pre-Deployment when prompted',
          'Confirm sign-off after final deployment',
        ],
      },
      workflowSection({
        summary: 'Lifecycle of a request you submit, from intake through sign-off.',
        stages: [
          { label: 'Submitted', description: 'You submit the request for department approval.' },
          { label: 'Department Approved', description: 'Your department head approves and forwards the request to IT.' },
          { label: 'IT Review', description: 'IT evaluates feasibility and prioritizes the work.' },
          { label: 'Assigned & In Development', description: 'A delivery team implements the solution.' },
          { label: 'Review & Validation', description: 'QA validates the build before you test it.' },
          { label: 'Requester UAT for Pre-Deployment', description: 'You validate the deployed solution before final production release.' },
          { label: 'Final Deployment Pending', description: 'IT completes the final production deployment.' },
          { label: 'Sign-Off', description: 'You confirm acceptance and the request is closed.' },
        ],
      }),
      statusGuideSection({
        summary: 'Statuses you are most likely to see on your own requests.',
        rows: [
          { status: 'Submitted', description: 'Waiting for department head approval.' },
          { status: 'Department Approval Pending', description: 'Your department head has not yet decided.' },
          { status: 'IT Review Pending', description: 'IT is evaluating feasibility and scope.' },
          { status: 'In Development', description: 'Delivery work is underway.' },
          { status: 'Review & Validation', description: 'QA is validating the implementation.' },
          { status: 'Requester UAT for Pre-Deployment', description: 'Your turn to test the deployed solution before final release.' },
          { status: 'Final Deployment Pending', description: 'Awaiting final production deployment after your UAT.' },
          { status: 'Sign-Off', description: 'Request is closed after your final confirmation.' },
          { status: 'Withdrawn', description: 'You withdrew the request; no further action is required.' },
        ],
      }),
    ],
  },
  DEPARTMENT_HEAD: {
    title: 'Department Head Manual',
    subtitle: 'Review department submissions, approve or reject requests, and monitor delivery through sign-off.',
    workflowSnapshot: ['Submitted', 'Department Approval', 'IT Review', 'In Development', 'Sign-Off'],
    sections: [
      {
        id: 'department-head-actions',
        title: 'What Can I Do?',
        summary: 'Actions available to department approvers.',
        items: [
          'Review submitted requests from my department',
          'Approve, reject, or request clarification',
          'Monitor implementation progress for approved requests',
          'View department request volume and status on the dashboard',
        ],
      },
      {
        id: 'approval-process',
        title: 'Approval Process',
        summary: 'Your role in the department approval gate.',
        steps: [
          'Employee submits a request',
          'You review scope, priority, and business justification',
          'Approve to send to IT review, reject to stop, or request clarification',
          'Track progress through delivery, pre-deployment UAT, and sign-off',
        ],
      },
      workflowSection({
        summary: 'Where department approval fits in the overall lifecycle.',
        stages: [
          { label: 'Submitted', description: 'Request awaits your decision.' },
          { label: 'Department Approved', description: 'You approved; request moves to IT review.' },
          { label: 'IT Review & Assignment', description: 'IT evaluates and assigns delivery resources.' },
          { label: 'Delivery & QA', description: 'Team builds and validates the solution.' },
          { label: 'Requester UAT for Pre-Deployment', description: 'Requester validates before final deployment.' },
          { label: 'Sign-Off', description: 'Requester confirms completion; request closes.' },
        ],
      }),
      statusGuideSection({
        summary: 'Statuses relevant when approving and tracking department requests.',
        rows: [
          { status: 'Department Approval Pending', description: 'Awaiting your approve, reject, or clarification decision.' },
          { status: 'Clarification Requested', description: 'You asked the requester for more information.' },
          { status: 'IT Review Pending', description: 'Approved by you; IT is reviewing feasibility.' },
          { status: 'Department Rejected', description: 'You rejected the request at the department gate.' },
          { status: 'In Development', description: 'Approved request is being implemented.' },
          { status: 'Requester UAT for Pre-Deployment', description: 'Requester is validating before final deployment.' },
          { status: 'Sign-Off', description: 'Request completed and closed.' },
        ],
      }),
    ],
  },
  IT_HEAD: {
    title: 'IT Manager Manual',
    subtitle: 'Evaluate feasibility, assign resources, oversee delivery, and coordinate final deployment.',
    workflowSnapshot: ['IT Review', 'Assignment', 'In Development', 'Final Deployment Pending', 'Sign-Off'],
    sections: [
      {
        id: 'it-manager-actions',
        title: 'What Can I Do?',
        summary: 'Actions available to IT Heads and IT Managers.',
        items: [
          'Review department-approved requests for feasibility',
          'Approve, reject, defer, or request clarification',
          'Assign project managers and delivery teams',
          'Monitor workloads, progress, and blockers',
          'Coordinate final deployment after requester pre-deployment UAT',
        ],
      },
      workflowSection({
        summary: 'IT ownership from internal review through final deployment.',
        stages: [
          { label: 'IT Review', description: 'Assess feasibility, effort, and priority.' },
          { label: 'Assignment', description: 'Assign PM, developers, and QA.' },
          { label: 'Planning & Development', description: 'Scope, sprints, and implementation.' },
          { label: 'Review & Validation', description: 'QA validates before requester UAT.' },
          { label: 'Requester UAT for Pre-Deployment', description: 'Requester validates the deployed build.' },
          { label: 'Final Deployment Pending', description: 'Production release after UAT approval.' },
          { label: 'Sign-Off', description: 'Requester confirms; request closes.' },
        ],
      }),
      statusGuideSection({
        summary: 'Statuses you manage during internal review and delivery oversight.',
        rows: [
          { status: 'IT Review Pending', description: 'Awaiting your feasibility decision.' },
          { status: 'Assignment Pending', description: 'Approved; waiting for team assignment.' },
          { status: 'Assigned', description: 'Delivery team assigned; work can begin.' },
          { status: 'In Development', description: 'Active implementation in progress.' },
          { status: 'Review & Validation', description: 'QA review before requester UAT.' },
          { status: 'Final Deployment Pending', description: 'Ready for final production deployment.' },
          { status: 'Sign-Off', description: 'Request closed after requester confirmation.' },
          { status: 'IT Rejected', description: 'Rejected during IT review.' },
        ],
      }),
    ],
  },
  PROJECT_MANAGER: {
    title: 'Project Manager Manual',
    subtitle: 'Own scope, sprint planning, developer coordination, QA handoff, and deployment readiness.',
    workflowSnapshot: ['Assigned', 'Sprint Planning', 'In Development', 'QA', 'Pre-Deployment UAT'],
    sections: [
      {
        id: 'project-manager-actions',
        title: 'What Can I Do?',
        summary: 'Actions available to Project Managers.',
        items: [
          'Define scope, user stories, and acceptance criteria',
          'Plan and manage sprints and task assignments',
          'Track delivery progress and remove blockers',
          'Submit work for QA and requester pre-deployment UAT',
          'Mark deployment readiness after UAT approval',
        ],
      },
      {
        id: 'project-manager-workflow',
        title: 'Typical Delivery Path',
        summary: 'Common path for requests assigned to you.',
        steps: [
          'Receive assignment from IT Head',
          'Plan scope, user stories, and sprints',
          'Coordinate development and QA',
          'Support requester UAT for Pre-Deployment',
          'Prepare for final deployment and sign-off',
        ],
      },
      workflowSection({
        summary: 'Delivery workflow from assignment through deployment readiness.',
        stages: [
          { label: 'Assigned', description: 'You own delivery for this request.' },
          { label: 'Scope & Sprint Planning', description: 'Break down work and schedule sprints.' },
          { label: 'In Development', description: 'Developers implement sprint tasks.' },
          { label: 'Review & Validation', description: 'QA validates the build.' },
          { label: 'Requester UAT for Pre-Deployment', description: 'Requester tests before final release.' },
          { label: 'Final Deployment Pending', description: 'Awaiting production deployment.' },
          { label: 'Sign-Off', description: 'Requester confirms completion.' },
        ],
      }),
      statusGuideSection({
        summary: 'Statuses you update and monitor during delivery.',
        rows: [
          { status: 'Assigned', description: 'Ready for planning and sprint setup.' },
          { status: 'Sprint Active', description: 'A sprint is in progress.' },
          { status: 'In Development', description: 'Implementation work is underway.' },
          { status: 'Development Complete', description: 'Build ready for QA.' },
          { status: 'Review & Validation', description: 'QA is testing the deliverable.' },
          { status: 'Requester UAT for Pre-Deployment', description: 'Requester is performing pre-deployment validation.' },
          { status: 'Final Deployment Pending', description: 'UAT passed; awaiting production deploy.' },
          { status: 'Sign-Off', description: 'Delivery complete; request closed.' },
        ],
      }),
    ],
  },
  DEVELOPER: {
    title: 'Developer Manual',
    subtitle: 'Execute assigned sprint tasks, update progress, and hand off completed work for review.',
    workflowSnapshot: ['Assigned', 'Sprint Tasks', 'In Development', 'QA Handoff'],
    sections: [
      {
        id: 'developer-actions',
        title: 'What Can I Do?',
        summary: 'Actions available to assigned delivery team members.',
        items: [
          'View assigned requests and sprint tasks',
          'Update task status and implementation notes',
          'Upload supporting documents and evidence',
          'Mark sprint tasks complete for PM and QA review',
        ],
      },
      {
        id: 'developer-workflow',
        title: 'Typical Workflow',
        summary: 'Your path from assignment through QA handoff.',
        steps: [
          'Receive sprint task assignment',
          'Implement and document your work',
          'Mark tasks complete',
          'PM submits the build for QA and requester UAT',
        ],
      },
      workflowSection({
        summary: 'Where your work fits in the delivery pipeline.',
        stages: [
          { label: 'Assigned', description: 'You are on the delivery team.' },
          { label: 'Sprint Active', description: 'Work through your sprint tasks.' },
          { label: 'In Development', description: 'Active coding and implementation.' },
          { label: 'Development Complete', description: 'Your tasks are done; QA reviews next.' },
          { label: 'Review & Validation', description: 'QA validates the combined build.' },
          { label: 'Requester UAT for Pre-Deployment', description: 'Requester tests before final deployment.' },
        ],
      }),
      statusGuideSection({
        summary: 'Statuses that affect your assigned work.',
        rows: [
          { status: 'Assigned', description: 'Team assigned; sprint planning may be in progress.' },
          { status: 'Sprint Active', description: 'Sprint tasks are being executed.' },
          { status: 'In Development', description: 'Implementation is in progress.' },
          { status: 'Development Complete', description: 'Build handed off for QA.' },
          { status: 'Review & Validation', description: 'QA is reviewing your deliverable.' },
          { status: 'QA Failed', description: 'Issues found; more development may be needed.' },
        ],
      }),
    ],
  },
  QA: {
    title: 'QA Manual',
    subtitle: 'Validate completed builds, record test results, and release work to requester pre-deployment UAT.',
    workflowSnapshot: ['QA Pending', 'Testing', 'Pass to UAT', 'Sign-Off'],
    sections: [
      {
        id: 'qa-actions',
        title: 'What Can I Do?',
        summary: 'Actions available to reviewers.',
        items: [
          'Review requests ready for validation',
          'Record test results and findings',
          'Pass builds to requester UAT for Pre-Deployment',
          'Return requests to development when issues remain',
          'Request clarification when acceptance criteria are unclear',
        ],
      },
      workflowSection({
        summary: 'QA stage from development complete through UAT handoff.',
        stages: [
          { label: 'Development Complete', description: 'Build is ready for your review.' },
          { label: 'Review & Validation', description: 'You execute test cases and record results.' },
          { label: 'QA Passed', description: 'Build approved for requester UAT.' },
          { label: 'Requester UAT for Pre-Deployment', description: 'Requester validates before final deployment.' },
          { label: 'Sign-Off', description: 'Request closed after final deployment and confirmation.' },
        ],
      }),
      statusGuideSection({
        summary: 'Statuses you act on during quality review.',
        rows: [
          { status: 'QA Pending', description: 'Awaiting your test execution.' },
          { status: 'In Testing', description: 'Testing is actively in progress.' },
          { status: 'QA Passed', description: 'You approved; moving to requester UAT.' },
          { status: 'QA Failed', description: 'Issues found; returned for fixes.' },
          { status: 'Requester UAT for Pre-Deployment', description: 'Requester is validating the deployment.' },
          { status: 'UAT Failed', description: 'Requester found issues during pre-deployment UAT.' },
          { status: 'Sign-Off', description: 'Request completed and closed.' },
        ],
      }),
    ],
  },
  UAT_APPROVER: {
    title: 'Final Approver Manual',
    subtitle: 'Support final acceptance workflows and monitor requests approaching sign-off.',
    workflowSnapshot: ['Requester UAT', 'Final Deployment', 'Sign-Off'],
    sections: [
      {
        id: 'final-approval-actions',
        title: 'What Can I Do?',
        summary: 'Actions available during final acceptance.',
        items: [
          'View requests in requester UAT for Pre-Deployment',
          'Review delivered outcomes and acceptance evidence',
          'Support requester decisions on approve or return for changes',
          'Monitor requests through final deployment and sign-off',
        ],
      },
      workflowSection({
        summary: 'Final acceptance path after QA through sign-off.',
        stages: [
          { label: 'Requester UAT for Pre-Deployment', description: 'Requester validates the deployed solution.' },
          { label: 'Final Deployment Pending', description: 'Production deployment after UAT approval.' },
          { label: 'Ready for Completion', description: 'Awaiting requester final confirmation.' },
          { label: 'Sign-Off', description: 'Request is closed.' },
        ],
      }),
      statusGuideSection({
        summary: 'Statuses at the end of the lifecycle.',
        rows: [
          { status: 'Requester UAT for Pre-Deployment', description: 'Requester is testing before final deployment.' },
          { status: 'UAT Approved', description: 'Requester approved pre-deployment UAT.' },
          { status: 'UAT Rejected', description: 'Returned for changes after UAT.' },
          { status: 'Final Deployment Pending', description: 'Awaiting final production release.' },
          { status: 'Deployed', description: 'Solution deployed to production.' },
          { status: 'Ready for Completion', description: 'Awaiting requester sign-off.' },
          { status: 'Sign-Off', description: 'Request closed.' },
        ],
      }),
    ],
  },
  SYSTEM_ADMIN: {
    title: 'System Admin Manual',
    subtitle: 'Administer users, departments, workflow visibility, audits, and operational governance.',
    workflowSnapshot: ['All Stages', 'User Management', 'Audit', 'Sign-Off'],
    sections: [
      {
        id: 'admin-actions',
        title: 'What Can I Do?',
        summary: 'Administrative capabilities available to system administrators.',
        items: [
          'Manage users, roles, and departments',
          'Approve registration and role access requests',
          'View organization-wide analytics and dashboards',
          'Audit user actions and request history',
          'Delete requests when required for data governance',
        ],
      },
      workflowSection({
        summary: 'Full request lifecycle you can observe across the organization.',
        stages: [
          { label: 'Intake & Approval', description: 'Department and IT approval gates.' },
          { label: 'Assignment & Delivery', description: 'PM, developer, and sprint execution.' },
          { label: 'Review & Validation', description: 'QA testing before UAT.' },
          { label: 'Requester UAT for Pre-Deployment', description: 'Pre-production validation by requester.' },
          { label: 'Final Deployment Pending', description: 'Final production release.' },
          { label: 'Sign-Off', description: 'Closed requests across all departments.' },
        ],
      }),
      statusGuideSection({
        summary: 'Complete status reference for administrators.',
        rows: [
          { status: 'Submitted', description: 'New request awaiting department approval.' },
          { status: 'IT Review Pending', description: 'Awaiting IT feasibility review.' },
          { status: 'Assigned / In Development', description: 'Active delivery in progress.' },
          { status: 'Review & Validation', description: 'QA testing stage.' },
          { status: 'Requester UAT for Pre-Deployment', description: 'Pre-deployment requester validation.' },
          { status: 'Final Deployment Pending', description: 'Awaiting final production deployment.' },
          { status: 'Sign-Off', description: 'Request closed successfully.' },
          { status: 'Withdrawn', description: 'Withdrawn by the original requester.' },
          { status: 'Rejected', description: 'Stopped at department or IT approval.' },
        ],
      }),
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
    ...(section.rows || []).map((row) => `${row.status} ${row.description}`),
    ...(section.stages || []).map((stage) => `${stage.label} ${stage.description}`),
    ...(section.alternateEndStates || []).map((state) => `${state.label} ${state.description}`),
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
                <CompactWorkflow stages={manual.workflowSnapshot || []} />
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
        {section.type === 'statusGuide' ? <StatusGuideTable rows={section.rows || []} /> : null}
        {section.type === 'workflow' ? <WorkflowTimeline stages={section.stages || []} alternateEndStates={section.alternateEndStates || []} /> : null}
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

function StatusGuideTable({ rows }) {
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
          {rows.map((row) => (
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

function WorkflowTimeline({ stages, alternateEndStates: endStates }) {
  return (
    <Stack spacing={1.1}>
      {stages.map((stage, index) => (
        <Stack key={stage.label} direction="row" spacing={1.2} sx={{ alignItems: 'stretch' }}>
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
            {index < stages.length - 1 && (
              <Box sx={{ width: 2, flex: 1, minHeight: 18, bgcolor: (theme) => theme.custom.semantic.borderSoft }} />
            )}
          </Stack>
          <Box sx={{ flex: 1, minWidth: 0, pb: index < stages.length - 1 ? 0.5 : 0 }}>
            <Typography variant="body2" fontWeight={850}>{stage.label}</Typography>
            <Typography variant="caption" color="text.secondary">{stage.description}</Typography>
          </Box>
        </Stack>
      ))}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ pt: 1 }}>
        {endStates.map((state) => (
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

function CompactWorkflow({ stages }) {
  return (
    <Stack spacing={0.8}>
      {stages.map((stage) => (
        <Stack key={stage} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Box sx={{ width: 7, height: 7, borderRadius: '50%', bgcolor: 'primary.main', flexShrink: 0 }} />
          <Typography variant="caption" fontWeight={760}>{stage}</Typography>
        </Stack>
      ))}
      <Typography variant="caption" color="text.secondary">Stages shown are the most relevant for your role.</Typography>
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
