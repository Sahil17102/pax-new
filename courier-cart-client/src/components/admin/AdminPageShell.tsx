import {
  alpha,
  Box,
  Button,
  Chip,
  Grid,
  Paper,
  Stack,
  Typography,
  type SxProps,
  type Theme,
} from '@mui/material'
import type { ReactNode } from 'react'

type Metric = {
  label: string
  value: string
  hint?: string
}

interface AdminPageShellProps {
  eyebrow?: string
  title: string
  description?: string
  badge?: string
  metrics?: Metric[]
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  children: ReactNode
  contentSx?: SxProps<Theme>
}

export default function AdminPageShell({
  eyebrow = 'Pax Logistics Admin',
  title,
  description,
  badge,
  metrics = [],
  primaryAction,
  secondaryAction,
  children,
  contentSx,
}: AdminPageShellProps) {
  return (
    <Stack spacing={2}>
      <Paper
        elevation={0}
        sx={{
          borderRadius: 4,
          overflow: 'hidden',
          border: '1px solid rgba(17, 17, 19, 0.08)',
          background:
            'linear-gradient(135deg, #FFF9F4 0%, #FFF4EE 56%, #FDE8E4 100%)',
          color: '#1C1C1F',
          boxShadow: '0 26px 60px rgba(17, 17, 19, 0.1)',
        }}
      >
        <Box
          sx={{
            px: { xs: 2, md: 3 },
            py: { xs: 2.2, md: 2.8 },
            background:
              'radial-gradient(circle at top right, rgba(217,4,22,0.08) 0%, transparent 28%), linear-gradient(180deg, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0) 100%)',
          }}
        >
          <Stack spacing={2}>
            <Stack
              direction={{ xs: 'column', lg: 'row' }}
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', lg: 'flex-start' }}
              gap={2}
            >
              <Stack spacing={1.05} sx={{ maxWidth: 860 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                  <Typography
                    sx={{
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      letterSpacing: '0.16em',
                      textTransform: 'uppercase',
                      color: alpha('#5F524F', 0.92),
                    }}
                  >
                    {eyebrow}
                  </Typography>
                  {badge ? (
                    <Chip
                      label={badge}
                      size="small"
                      sx={{
                        height: 24,
                        borderRadius: 1.5,
                        bgcolor: alpha('#FFFFFF', 0.58),
                        color: '#2D2321',
                        border: `1px solid ${alpha('#7F645E', 0.22)}`,
                        '& .MuiChip-label': {
                          px: 1,
                          fontWeight: 700,
                          fontSize: '0.72rem',
                        },
                      }}
                    />
                  ) : null}
                </Stack>

                <Typography
                  sx={{
                    fontSize: { xs: '1.55rem', md: '2.15rem' },
                    lineHeight: 1.08,
                    letterSpacing: '-0.04em',
                    fontWeight: 800,
                    color: '#17171A',
                  }}
                >
                  {title}
                </Typography>

                {description ? (
                  <Typography
                    sx={{
                      color: alpha('#302A29', 0.86),
                      fontSize: { xs: '0.98rem', md: '1.05rem' },
                      maxWidth: 760,
                      lineHeight: 1.72,
                    }}
                  >
                    {description}
                  </Typography>
                ) : null}
              </Stack>

              {(primaryAction || secondaryAction) && (
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  spacing={1}
                  sx={{ width: { xs: '100%', lg: 'auto' } }}
                >
                  {secondaryAction}
                  {primaryAction}
                </Stack>
              )}
            </Stack>

            {metrics.length > 0 && (
              <Grid container spacing={1.25}>
                {metrics.map((metric) => (
                  <Grid key={metric.label} size={{ xs: 12, sm: 6, lg: 3 }}>
                    <Paper
                      elevation={0}
                      sx={{
                        height: '100%',
                        p: 1.6,
                        borderRadius: 3,
                        color: '#1F1B1A',
                        background:
                          'linear-gradient(180deg, rgba(255,255,255,0.72) 0%, rgba(255,248,245,0.94) 100%)',
                        border: `1px solid ${alpha('#7F645E', 0.18)}`,
                        boxShadow:
                          'inset 0 1px 0 rgba(255,255,255,0.55), 0 10px 26px rgba(17,17,19,0.06)',
                        backdropFilter: 'blur(10px)',
                      }}
                    >
                      <Typography
                        sx={{
                          fontSize: '0.76rem',
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: alpha('#6C5D58', 0.92),
                          fontWeight: 700,
                          mb: 0.8,
                        }}
                      >
                        {metric.label}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: '1.45rem',
                          fontWeight: 800,
                          lineHeight: 1.1,
                          color: '#17171A',
                        }}
                      >
                        {metric.value}
                      </Typography>
                      {metric.hint ? (
                        <Typography
                          sx={{
                            mt: 0.7,
                            fontSize: '0.82rem',
                            color: alpha('#3B3432', 0.76),
                          }}
                        >
                          {metric.hint}
                        </Typography>
                      ) : null}
                    </Paper>
                  </Grid>
                ))}
              </Grid>
            )}
          </Stack>
        </Box>
      </Paper>

      <Paper
        elevation={0}
        sx={{
          borderRadius: 4,
          border: '1px solid rgba(17, 17, 19, 0.08)',
          backgroundColor: '#FFFFFF',
          boxShadow: '0 18px 40px rgba(17, 17, 19, 0.06)',
          ...contentSx,
        }}
      >
        {children}
      </Paper>
    </Stack>
  )
}

export function AdminGhostButton({
  children,
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outlined"
      sx={{
        minHeight: 44,
        borderRadius: 2,
        borderColor: alpha('#7F645E', 0.18),
        color: '#1C1C1F',
        backgroundColor: alpha('#FFFFFF', 0.62),
        '&:hover': {
          borderColor: alpha('#7F645E', 0.28),
          backgroundColor: alpha('#FFFFFF', 0.9),
        },
      }}
      {...props}
    >
      {children}
    </Button>
  )
}
