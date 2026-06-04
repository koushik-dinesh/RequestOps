import { Card, CardContent, Grid, Skeleton, Stack } from '@mui/material';

export function PageSkeleton() {
  return (
    <Stack spacing={3}>
      <Skeleton variant="rounded" height={180} sx={{ borderRadius: 4 }} />
      <Grid container spacing={2}>
        {[1, 2, 3, 4].map((item) => (
          <Grid size={{ xs: 12, md: 3 }} key={item}>
            <Card sx={{ borderRadius: 4 }}>
              <CardContent>
                <Skeleton width="55%" />
                <Skeleton height={48} width="35%" />
                <Skeleton />
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>
      <Skeleton variant="rounded" height={360} sx={{ borderRadius: 4 }} />
    </Stack>
  );
}

export function TableSkeleton({ rows = 6 }) {
  return (
    <Stack spacing={1} sx={{ p: 2 }}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} variant="rounded" height={46} sx={{ borderRadius: 2 }} />
      ))}
    </Stack>
  );
}
