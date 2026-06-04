import { useEffect, useState } from 'react';
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

const fallbackDesignations = [
  'System Admin / Head / CEO',
  'IT Head',
  'IT Manager',
  'Developer',
  'QA',
  'Department Head',
  'Employee',
];

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [departments, setDepartments] = useState([]);
  const [designations, setDesignations] = useState(fallbackDesignations);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/departments?status=ACTIVE').then(setDepartments).catch(() => setDepartments([]));
    setDesignations(fallbackDesignations);
  }, []);

  function update(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await register({ ...form, departmentId: Number(form.departmentId) });
      setForm(emptyForm);
      setMessage('Registration submitted. A System Admin must approve and confirm your department before login.');
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
          <Stack component="form" spacing={2} onSubmit={handleSubmit}>
            {message && <Alert severity="success">{message}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Full Name" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} fullWidth required />
              <TextField label="Employee ID" value={form.employeeId} onChange={(e) => update('employeeId', e.target.value)} fullWidth required />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Company Email" value={form.email} onChange={(e) => update('email', e.target.value)} fullWidth required />
              <TextField label="Mobile Number" value={form.mobileNumber} onChange={(e) => update('mobileNumber', e.target.value)} fullWidth />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField select label="Designation" value={form.designation} onChange={(e) => update('designation', e.target.value)} fullWidth required>
                {designations.map((designation) => (
                  <MenuItem key={designation} value={designation}>{designation}</MenuItem>
                ))}
              </TextField>
              <TextField select label="Requested Department" value={form.departmentId} onChange={(e) => update('departmentId', e.target.value)} fullWidth required>
                {departments.map((department) => (
                  <MenuItem key={department.id} value={department.id}>{department.name}</MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <TextField label="Password" type="password" value={form.password} onChange={(e) => update('password', e.target.value)} fullWidth required />
              <TextField label="Confirm Password" type="password" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} fullWidth required />
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
