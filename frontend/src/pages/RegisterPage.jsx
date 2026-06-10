import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Stack,
  TextField,
  Typography,
  Link,
} from '@mui/material';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import { Link as RouterLink } from 'react-router-dom';
import api from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { useToast } from '../components/ToastProvider';

const emptyForm = {
  fullName: '',
  employeeId: '',
  email: '',
  mobileNumber: '',
  designation: '',
  departmentId: '',
  password: '',
  confirmPassword: '',
};

const nonItDepartmentDesignations = ['Department Head', 'Employee'];
const itDepartmentDesignations = ['Department Head', 'Project Manager', 'QA', 'Developer'];

function isItDepartment(department) {
  return String(department?.code || '').toUpperCase() === 'IT'
    || String(department?.name || '').trim().toUpperCase() === 'IT';
}

function designationOptionsForDepartment(department) {
  if (!department) return [];
  return isItDepartment(department) ? itDepartmentDesignations : nonItDepartmentDesignations;
}

function validateRegistrationForm(form, departments) {
  const errors = {};
  const selectedDepartment = departments.find((department) => String(department.id) === String(form.departmentId));
  const designationOptions = designationOptionsForDepartment(selectedDepartment);
  if (form.fullName.trim().length < 3) errors.fullName = 'Full name must be at least 3 characters.';
  if (!form.employeeId.trim()) errors.employeeId = 'Employee ID is required.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errors.email = 'Enter a valid company email.';
  if (!form.departmentId) errors.departmentId = 'Requested department is required.';
  if (form.departmentId && !form.designation) errors.designation = 'Designation is required.';
  if (form.designation && !designationOptions.includes(form.designation)) errors.designation = 'Choose a valid designation for the selected department.';
  if (form.password.length < 8) errors.password = 'Password must be at least 8 characters.';
  if (form.confirmPassword !== form.password) errors.confirmPassword = 'Passwords do not match.';
  return errors;
}

export default function RegisterPage() {
  const { register } = useAuth();
  const { showToast } = useToast();
  const formRef = useRef(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState({});
  const [departments, setDepartments] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const selectedDepartment = useMemo(
    () => departments.find((department) => String(department.id) === String(form.departmentId)),
    [departments, form.departmentId],
  );
  const designations = useMemo(() => designationOptionsForDepartment(selectedDepartment), [selectedDepartment]);

  useEffect(() => {
    api.get('/departments?status=ACTIVE').then(setDepartments).catch(() => setDepartments([]));
    api.get('/auth/next-employee-id')
      .then((result) => setForm((current) => ({ ...current, employeeId: result.employeeId || '' })))
      .catch(() => {});
  }, []);

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'departmentId' ? { designation: '' } : {}),
    }));
    setFieldErrors((current) => ({
      ...current,
      [field]: '',
      ...(field === 'departmentId' ? { designation: '' } : {}),
    }));
  }

  function focusFirstInvalidField(errors) {
    const firstField = Object.keys(errors).find((field) => errors[field]);
    if (!firstField) return;
    requestAnimationFrame(() => formRef.current?.querySelector(`[name="${firstField}"]`)?.focus());
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    const validationErrors = validateRegistrationForm(form, departments);
    if (Object.keys(validationErrors).length) {
      const summary = Object.values(validationErrors).filter(Boolean).join(' ');
      setFieldErrors(validationErrors);
      setError(summary);
      showToast(summary, { severity: 'error', autoHideDuration: 5200 });
      focusFirstInvalidField(validationErrors);
      return;
    }
    try {
      const result = await register({ ...form, departmentId: Number(form.departmentId) });
      const nextId = await api.get('/auth/next-employee-id').catch(() => null);
      setForm({ ...emptyForm, employeeId: nextId?.employeeId || '' });
      setMessage(`Registration submitted for ${result.employeeId || form.employeeId}. A System Admin must approve and confirm your department before login.`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p: { xs: 1.5, sm: 3 } }}>
      <Card sx={{ width: '100%', maxWidth: 780, borderRadius: { xs: 3, md: 5 } }}>
        <CardContent sx={{ p: { xs: 2, sm: 3, md: 4 } }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, mb: 3 }}>
            <Box sx={{ width: 52, height: 52, borderRadius: 3.5, display: 'grid', placeItems: 'center', bgcolor: 'primary.light', color: 'primary.main' }}>
              <HowToRegIcon />
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Chip label="Admin approval required" size="small" sx={{ mb: 0.8 }} />
              <Typography variant="h4" sx={{ fontSize: { xs: 28, md: 34 } }}>Employee Registration</Typography>
              <Typography color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>Request access to Violin RequestOps. Your department will be confirmed by an administrator.</Typography>
            </Box>
          </Stack>
          <Stack component="form" ref={formRef} spacing={2} onSubmit={handleSubmit}>
            {message && <Alert severity="success">{message}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField name="fullName" label="Full Name" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} fullWidth required error={Boolean(fieldErrors.fullName)} helperText={fieldErrors.fullName} />
              <TextField name="employeeId" label="Employee ID" value={form.employeeId} onChange={(e) => update('employeeId', e.target.value.toUpperCase())} helperText={fieldErrors.employeeId || 'Uses the VIO-0001 format.'} fullWidth required error={Boolean(fieldErrors.employeeId)} />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField name="email" label="Company Email" value={form.email} onChange={(e) => update('email', e.target.value)} fullWidth required error={Boolean(fieldErrors.email)} helperText={fieldErrors.email} />
              <TextField name="mobileNumber" label="Mobile Number" value={form.mobileNumber} onChange={(e) => update('mobileNumber', e.target.value)} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField name="departmentId" select label="Requested Department" value={form.departmentId} onChange={(e) => update('departmentId', e.target.value)} fullWidth required error={Boolean(fieldErrors.departmentId)} helperText={fieldErrors.departmentId}>
                {departments.map((department) => (
                  <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>
                ))}
              </TextField>
              <TextField
                name="designation"
                select
                label="Designation"
                value={form.designation}
                onChange={(e) => update('designation', e.target.value)}
                fullWidth
                required
                disabled={!form.departmentId}
                error={Boolean(fieldErrors.designation)}
                helperText={fieldErrors.designation || (!form.departmentId ? 'Select department first.' : 'Choose the role applicable to the selected department.')}
              >
                {designations.map((designation) => (
                  <MenuItem key={designation} value={designation}>{designation}</MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField name="password" label="Password" type="password" value={form.password} onChange={(e) => update('password', e.target.value)} fullWidth required error={Boolean(fieldErrors.password)} helperText={fieldErrors.password} />
              <TextField name="confirmPassword" label="Confirm Password" type="password" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} fullWidth required error={Boolean(fieldErrors.confirmPassword)} helperText={fieldErrors.confirmPassword} />
            </Stack>
            <Button type="submit" variant="contained" size="large">Submit Access Request</Button>
            <Typography variant="body2" textAlign="center">
              Already approved? <Link component={RouterLink} to="/login">Back to login</Link>
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
