import { Alert, AlertTitle, Box, Button, Container, LinearProgress, Stack, Typography, alpha } from '@mui/material'
import type { ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMerchantReadiness } from '../../../hooks/useMerchantReadiness'
import FullScreenLoader from '../../UI/loader/FullScreenLoader'

const BRAND_PRIMARY = '#062A5B'
const BRAND_ACCENT = '#ED1C24'

export default function RequireMerchantReady({ children }: { children: ReactNode }) {
  const { isReady, isLoading, checklist, progress, firstIncompleteStep, assignedPlanName, assignedPlanId } =
    useMerchantReadiness()
  const location = useLocation()
  const navigate = useNavigate()
  const assignedPlanLabel = isLoading
    ? 'Checking assigned plan...'
    : assignedPlanName || assignedPlanId || 'Not assigned'

  if (isLoading) return <FullScreenLoader />

  if (isReady) {
    return <>{children}</>
  }

  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Stack spacing={2.5}>
        <Alert
          severity="warning"
          sx={{
            borderRadius: 3,
            border: `1px solid ${alpha(BRAND_ACCENT, 0.28)}`,
          }}
        >
          <AlertTitle>Merchant Setup Incomplete</AlertTitle>
          Order creation is locked until all readiness checks are complete.
        </Alert>

        <Box
          sx={{
            p: { xs: 2.2, md: 2.8 },
            borderRadius: 3,
            border: `1px solid ${alpha(BRAND_PRIMARY, 0.14)}`,
            bgcolor: '#fff',
            boxShadow: `0 10px 28px ${alpha(BRAND_PRIMARY, 0.08)}`,
          }}
        >
          <Stack spacing={2}>
            <Box>
              <Typography sx={{ fontSize: '1.1rem', fontWeight: 800, color: '#17171A' }}>
                Readiness Progress
              </Typography>
              <Typography sx={{ mt: 0.5, color: '#496189', fontSize: '0.9rem' }}>
                Complete these checks before creating your first order.
              </Typography>
              <Typography sx={{ mt: 0.75, color: '#17171A', fontSize: '0.84rem', fontWeight: 700 }}>
                Assigned Plan: {assignedPlanLabel}
              </Typography>
            </Box>

            <Box>
              <LinearProgress
                variant="determinate"
                value={progress}
                sx={{
                  height: 10,
                  borderRadius: 999,
                  bgcolor: alpha(BRAND_PRIMARY, 0.12),
                  '& .MuiLinearProgress-bar': {
                    borderRadius: 999,
                    background: BRAND_PRIMARY,
                  },
                }}
              />
              <Typography sx={{ mt: 0.8, fontSize: '12px', fontWeight: 700, color: '#496189' }}>
                {progress}% complete
              </Typography>
            </Box>

            <Box
              sx={{
                p: 1.6,
                borderRadius: 2.2,
                border: `1px solid ${alpha(BRAND_ACCENT, 0.24)}`,
                bgcolor: alpha(BRAND_ACCENT, 0.07),
              }}
            >
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                alignItems={{ xs: 'flex-start', sm: 'center' }}
                justifyContent="space-between"
                gap={1.2}
              >
                <Box>
                  <Typography sx={{ fontSize: '0.94rem', fontWeight: 800, color: '#17171A' }}>
                    Want a Custom Plan?
                  </Typography>
                  <Typography sx={{ mt: 0.35, fontSize: '0.82rem', color: '#496189' }}>
                    Contact our admin team for customised pricing, higher shipment volume support,
                    or enterprise setup.
                  </Typography>
                </Box>
                <Button
                  variant="contained"
                  onClick={() => navigate('/support/tickets', { state: { from: location } })}
                  sx={{
                    borderRadius: 2,
                    textTransform: 'none',
                    fontWeight: 700,
                    bgcolor: BRAND_PRIMARY,
                    '&:hover': { bgcolor: '#0A2A66' },
                  }}
                >
                  Contact Admin Team
                </Button>
              </Stack>
            </Box>

            <Stack spacing={1.1}>
              {checklist.map((item) => (
                <Box
                  key={item.key}
                  sx={{
                    p: 1.4,
                    borderRadius: 2,
                    border: `1px solid ${item.done ? alpha(BRAND_PRIMARY, 0.24) : alpha(BRAND_ACCENT, 0.24)}`,
                    bgcolor: item.done ? alpha(BRAND_PRIMARY, 0.05) : alpha(BRAND_ACCENT, 0.06),
                  }}
                >
                  <Stack
                    direction={{ xs: 'column', sm: 'row' }}
                    alignItems={{ xs: 'flex-start', sm: 'center' }}
                    justifyContent="space-between"
                    gap={1.2}
                  >
                    <Box>
                      <Typography sx={{ fontSize: '0.92rem', fontWeight: 700, color: '#17171A' }}>
                        {item.title}
                      </Typography>
                      <Typography sx={{ fontSize: '0.82rem', color: '#496189', mt: 0.4 }}>
                        {item.description}
                      </Typography>
                    </Box>
                    <Button
                      size="small"
                      variant={item.done ? 'outlined' : 'contained'}
                      onClick={() => navigate(item.path, { state: { from: location } })}
                      sx={{
                        borderRadius: 2,
                        textTransform: 'none',
                        fontWeight: 700,
                        ...(item.done
                          ? {
                              color: BRAND_PRIMARY,
                              borderColor: alpha(BRAND_PRIMARY, 0.35),
                            }
                          : {
                              bgcolor: BRAND_ACCENT,
                              '&:hover': { bgcolor: '#D95C00' },
                            }),
                      }}
                    >
                      {item.done ? 'Review' : item.actionLabel}
                    </Button>
                  </Stack>
                </Box>
              ))}
            </Stack>

            {firstIncompleteStep && (
              <Button
                variant="contained"
                onClick={() => navigate(firstIncompleteStep.path, { state: { from: location } })}
                sx={{
                  alignSelf: 'flex-start',
                  borderRadius: 2,
                  textTransform: 'none',
                  fontWeight: 700,
                  bgcolor: BRAND_PRIMARY,
                  '&:hover': { bgcolor: '#0A2A66' },
                }}
              >
                Continue Setup
              </Button>
            )}
          </Stack>
        </Box>
      </Stack>
    </Container>
  )
}
