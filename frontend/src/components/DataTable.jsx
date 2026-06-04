import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import EmptyState from './EmptyState';
import { TableSkeleton } from './LoadingState';

export default function DataTable({ columns, rows = [], empty = 'No records found.', loading = false, minWidth }) {
  const tableMinWidth = minWidth || Math.max(columns.length * 150, 720);

  return (
    <TableContainer
      sx={{
        borderRadius: 4,
        border: '1px solid',
        borderColor: 'divider',
        bgcolor: (theme) => theme.custom.semantic.elevated,
        overflowX: 'auto',
        overflowY: 'hidden',
        maxWidth: '100%',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)',
      }}
    >
      {loading ? (
        <TableSkeleton />
      ) : (
      <Table sx={{ minWidth: tableMinWidth }}>
        <TableHead>
          <TableRow>
            {columns.map((column) => (
              <TableCell key={column.key} sx={{ width: column.width, whiteSpace: 'nowrap' }}>{column.label}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} sx={{ p: 0 }}>
                <EmptyState title="Nothing to show" message={empty} />
              </TableCell>
            </TableRow>
          ) : rows.map((row) => (
            <TableRow
              hover
              key={row.id || row.request_number}
              sx={{
                transition: 'background-color 160ms ease, box-shadow 160ms ease',
                '&:hover': {
                  bgcolor: 'rgba(248,250,252,0.9)',
                  boxShadow: 'inset 3px 0 0 #1D4ED8',
                },
              }}
            >
              {columns.map((column) => (
                <TableCell key={column.key} sx={{ py: 1.95, verticalAlign: 'middle' }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
                    {column.render ? column.render(row) : row[column.key]}
                  </Box>
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      )}
    </TableContainer>
  );
}
