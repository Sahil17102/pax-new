'use client'

import {
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  FormControl,
  FormHelperText,
  Grid,
  List,
  ListItem,
  ListItemIcon,
  ListItemText,
  Stack,
  Typography,
} from '@mui/material'
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { FaBoxOpen, FaEnvelopeOpenText, FaHashtag, FaPhoneAlt, FaReceipt, FaSearch, FaShieldAlt } from 'react-icons/fa'
import { MdLocationOn, MdSchedule } from 'react-icons/md'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { TrackingHistory } from '../../api/tracking.service'
import AWBLink from '../../components/UI/AWBLink'
import CustomInput from '../../components/UI/inputs/CustomInput'
import { DelhiveryLifecycleAdapter } from '../../components/tracking/DelhiveryLifecycleAdapter'
import PublicToolStorySections from '../../components/tools/PublicToolStorySections'
import PublicToolsHeader from '../../components/tools/PublicToolsHeader'
import { SmartTabs } from '../../components/UI/tab/Tabs'
import { useTracking } from '../../hooks/Orders/useTracking'
import { getAwbTrackingPath, getClientAwbTrackingPath, isValidAwb, normalizeAwb } from '../../utils/awb'

type FormValues = {
  awb: string
  orderNumber: string
  contact: string
}

const formatTrackingEventTime = (value: string) =>
  new Date(value).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

export default function OrderTrackingForm() {
  const BRAND_PRIMARY = '#062A5B'
  const BRAND_ACCENT = '#ED1C24'
  const shellCardStyles = {
    borderRadius: { xs: 3, md: 4 },
    border: `1px solid ${alpha('#07142F', 0.12)}`,
    boxShadow: '0 24px 70px rgba(7, 20, 47, 0.1)',
    background: 'rgba(255, 255, 255, 0.92)',
    backdropFilter: 'blur(18px)',
  }

  const navigate = useNavigate()
  const location = useLocation()
  const { awb: awbParam } = useParams<{ awb?: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [mode, setMode] = useState<'awb' | 'order'>('awb')
  const [error, setError] = useState('')

  const routeAwb = normalizeAwb(awbParam)
  const queryAwb = normalizeAwb(searchParams.get('awb'))
  const activeAwb = routeAwb || queryAwb
  const activeOrder = searchParams.get('orderNumber')
  const activeContact = searchParams.get('contact')
  const isClientTrackingRoute = location.pathname.startsWith('/tools/order_tracking')
  const trackingBasePath = isClientTrackingRoute ? '/tools/order_tracking' : '/tracking'

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    defaultValues: {
      awb: '',
      orderNumber: '',
      contact: '',
    },
  })

  const formValues = watch()
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formValues.contact)
  const isPhone = /^[0-9+\-\s()]{7,}$/.test(formValues.contact)
  const isContactValid = !formValues.contact || isEmail || isPhone

  const {
    data: tracking,
    isFetching: trackingLoading,
    isError: trackingError,
    error: trackingErrorObj,
    isSuccess,
  } = useTracking(isValidAwb(activeAwb) ? activeAwb : null, activeOrder ?? null, activeContact ?? null)

  useEffect(() => {
    if (activeAwb) {
      setMode('awb')
      reset({
        awb: activeAwb,
        orderNumber: '',
        contact: '',
      })
      if (!isValidAwb(activeAwb)) {
        setError('Invalid AWB')
      }
      return
    }

    if (activeOrder || activeContact) {
      setMode('order')
      reset({
        awb: '',
        orderNumber: activeOrder || '',
        contact: activeContact || '',
      })
      return
    }

    reset({
      awb: '',
      orderNumber: '',
      contact: '',
    })
  }, [activeAwb, activeContact, activeOrder, reset])

  useEffect(() => {
    if (activeAwb && !isValidAwb(activeAwb)) {
      setError('Invalid AWB')
      return
    }

    if (trackingError) {
      setError(trackingErrorObj instanceof Error ? trackingErrorObj.message : 'Failed to fetch tracking')
    } else if (isSuccess) {
      setError('')
    }
  }, [activeAwb, isSuccess, trackingError, trackingErrorObj])

  const canSubmit =
    mode === 'awb'
      ? isValidAwb(formValues.awb)
      : formValues.orderNumber.trim().length > 2 && formValues.contact.trim().length > 3 && isContactValid

  const onSubmit = (data: FormValues) => {
    if (!canSubmit) return
    setError('')

    if (mode === 'awb') {
      const normalizedAwb = normalizeAwb(data.awb)
      if (!isValidAwb(normalizedAwb)) {
        setError('Invalid AWB')
        return
      }
      navigate(isClientTrackingRoute ? getClientAwbTrackingPath(normalizedAwb) : getAwbTrackingPath(normalizedAwb))
      return
    }

    const params = new URLSearchParams({
      orderNumber: data.orderNumber.trim(),
      contact: data.contact.trim(),
    })

    navigate(`${trackingBasePath}?${params.toString()}`)
  }

  const sortedHistory = useMemo<TrackingHistory[]>(() => {
    if (!tracking?.history) return []
    return [...tracking.history].sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime())
  }, [tracking])

  const resetResults = () => {
    setError('')
    setSearchParams({})
  }

  const hasTrackingQuery = Boolean(activeAwb || (activeOrder && activeContact))
  const recentTracks = [
    {
      awb: 'EM1234567890',
      route: 'Bengaluru, KA -> Mumbai, MH',
      status: 'In Transit',
      time: 'May 14, 02:15 PM',
      color: BRAND_PRIMARY,
      bg: alpha(BRAND_PRIMARY, 0.08),
    },
    {
      awb: 'EM9876543210',
      route: 'Delhi, DL -> Hyderabad, TG',
      status: 'Delivered',
      time: 'May 12, 11:20 AM',
      color: '#0F7A5A',
      bg: alpha('#0F7A5A', 0.09),
    },
    {
      awb: 'EM1122334455',
      route: 'Chennai, TN -> Coimbatore, TN',
      status: 'Picked Up',
      time: 'May 13, 09:15 AM',
      color: BRAND_ACCENT,
      bg: alpha(BRAND_ACCENT, 0.08),
    },
  ]

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 82% 12%, rgba(237,28,36,0.13), transparent 28%), radial-gradient(circle at 12% 24%, rgba(6,42,91,0.12), transparent 28%), linear-gradient(180deg, #ffffff 0%, #F5F8FC 45%, #EEF4FB 100%)',
      }}
    >
      {!isClientTrackingRoute && <PublicToolsHeader />}
      <Stack
        component="main"
        sx={{
          width: '100%',
          maxWidth: isClientTrackingRoute ? '100%' : 1580,
          mx: 'auto',
          px: { xs: 1.5, sm: 2.5, md: isClientTrackingRoute ? 0 : 4 },
          py: { xs: 2.5, md: isClientTrackingRoute ? 1.5 : 4 },
        }}
        spacing={{ xs: 2.5, md: 3.5 }}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: '1fr',
              lg: 'minmax(0,0.9fr) minmax(640px,1.1fr)',
            },
            gap: { xs: 2.4, md: 3.5 },
            alignItems: 'stretch',
          }}
        >
          <Box
            sx={{
              position: 'relative',
              overflow: 'hidden',
              minHeight: { xs: 560, md: 760 },
              borderRadius: { xs: 4, md: 5 },
              border: `1px solid ${alpha('#07142F', 0.13)}`,
              p: { xs: 3, md: 5 },
              background:
                'linear-gradient(rgba(6,42,91,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(6,42,91,0.055) 1px, transparent 1px), #FFFFFF',
              backgroundSize: '44px 44px',
              boxShadow: '0 30px 90px rgba(7,20,47,0.12)',
            }}
          >
            <Typography
              sx={{
                color: BRAND_ACCENT,
                fontSize: '0.78rem',
                fontWeight: 900,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
              }}
            >
              Shipment visibility
            </Typography>
            <Typography
              component="h1"
              sx={{
                mt: 2.5,
                maxWidth: 660,
                color: '#07142F',
                fontSize: { xs: '3rem', md: '5.45rem' },
                fontWeight: 950,
                letterSpacing: '-0.06em',
                lineHeight: 0.94,
              }}
            >
              Track every move.
              <Box component="span" sx={{ display: 'block', color: BRAND_PRIMARY }}>
                Know every handoff.
              </Box>
            </Typography>
            <Typography
              sx={{
                mt: 3,
                maxWidth: 570,
                color: '#31415B',
                fontSize: { xs: '1rem', md: '1.12rem' },
                fontWeight: 600,
                lineHeight: 1.8,
              }}
            >
              Search by AWB or order reference and get a clean Pax Logistics delivery view with courier status, key
              milestones, and event history.
            </Typography>
            <Box
              sx={{
                display: 'none',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                gap: 1.4,
                mt: 4,
              }}
            >
              {[
                ['Live events', 'Courier scans'],
                ['Order lookup', 'AWB or contact'],
                ['ETA context', 'Delivery view'],
              ].map(([value, label]) => (
                <Box
                  key={value}
                  sx={{
                    border: `1px solid ${alpha('#07142F', 0.12)}`,
                    borderRadius: 3,
                    bgcolor: 'rgba(255,255,255,0.76)',
                    p: 2,
                  }}
                >
                  <Typography
                    sx={{
                      color: '#07142F',
                      fontSize: '1.25rem',
                      fontWeight: 900,
                    }}
                  >
                    {value}
                  </Typography>
                  <Typography
                    sx={{
                      mt: 0.4,
                      color: '#64748B',
                      fontSize: '0.78rem',
                      fontWeight: 800,
                    }}
                  >
                    {label}
                  </Typography>
                </Box>
              ))}
            </Box>
            <Box
              aria-hidden="true"
              sx={{
                position: 'absolute',
                left: { xs: -42, md: -28 },
                right: { xs: -42, md: -28 },
                bottom: { xs: -4, md: -12 },
                height: { xs: 270, md: 365 },
              }}
            >
              <Box
                component="img"
                src="/images/tracking-tool-3d.webp"
                loading="lazy"
                decoding="async"
                alt=""
                sx={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'contain',
                  objectPosition: 'center bottom',
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  top: '15%',
                  right: '24%',
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  bgcolor: BRAND_ACCENT,
                  boxShadow: `0 0 0 10px ${alpha(BRAND_ACCENT, 0.12)}`,
                }}
              />
              <Box
                sx={{
                  position: 'absolute',
                  left: '17%',
                  bottom: '28%',
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  bgcolor: BRAND_PRIMARY,
                  boxShadow: `0 0 0 10px ${alpha(BRAND_PRIMARY, 0.12)}`,
                }}
              />
            </Box>
          </Box>

          <Box
            component="form"
            onSubmit={handleSubmit(onSubmit)}
            sx={{
              alignSelf: 'center',
              p: { xs: 2.4, md: 4 },
              ...shellCardStyles,
            }}
          >
            <Typography
              sx={{
                color: BRAND_ACCENT,
                fontSize: '0.76rem',
                fontWeight: 900,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              Tracking console
            </Typography>
            <Typography
              sx={{
                mt: 1.2,
                fontSize: { xs: '1.7rem', md: '2.35rem' },
                fontWeight: 950,
                letterSpacing: '-0.04em',
                color: '#07142F',
                lineHeight: 1,
              }}
            >
              Track your shipment
            </Typography>
            <Typography
              variant="body2"
              sx={{
                color: '#4B5870',
                mt: 1.4,
                mb: 2.3,
                fontSize: '0.94rem',
                lineHeight: 1.7,
              }}
            >
              Enter your AWB number or Order ID to get real-time updates.
            </Typography>

            <SmartTabs
              onChange={(value) => {
                const nextMode = value as 'awb' | 'order'
                setMode(nextMode)
                reset({
                  awb: '',
                  orderNumber: '',
                  contact: '',
                })
                setError('')
                resetResults()
                if (nextMode === 'order' && location.pathname.startsWith('/tracking/')) {
                  navigate(trackingBasePath)
                }
              }}
              tabs={[
                { label: 'Track By AWB', value: 'awb' },
                { label: 'Track By Order ID', value: 'order' },
              ]}
              value={mode}
            />

            {mode === 'awb' ? (
              <FormControl fullWidth sx={{ mb: 1.6 }}>
                <Controller
                  name="awb"
                  control={control}
                  render={({ field }) => (
                    <CustomInput
                      {...field}
                      id="awb"
                      placeholder="e.g. 1234567890"
                      prefix={<FaHashtag />}
                      error={!!errors.awb}
                      helperText={errors.awb?.message || 'Click any AWB in the app to jump here instantly'}
                      label="AWB Number"
                      value={field.value ?? ''}
                      onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                    />
                  )}
                  rules={{
                    required: 'AWB number is required',
                    validate: (value) => isValidAwb(value) || 'Invalid AWB',
                  }}
                />
                {errors.awb && <FormHelperText error>{errors.awb.message}</FormHelperText>}
              </FormControl>
            ) : (
              <>
                <FormControl fullWidth sx={{ mb: 1.6 }}>
                  <Controller
                    name="orderNumber"
                    control={control}
                    render={({ field }) => (
                      <CustomInput
                        {...field}
                        id="orderNumber"
                        placeholder="e.g. ORD-2025-0001"
                        prefix={<FaReceipt />}
                        error={!!errors.orderNumber}
                        label="Order ID"
                      />
                    )}
                    rules={{ required: 'Order ID is required' }}
                  />
                  {errors.orderNumber && <FormHelperText error>{errors.orderNumber.message}</FormHelperText>}
                </FormControl>

                <FormControl fullWidth sx={{ mb: 1.6 }}>
                  <Controller
                    name="contact"
                    control={control}
                    render={({ field }) => (
                      <CustomInput
                        {...field}
                        id="contact"
                        placeholder="you@example.com or +91 98765 43210"
                        prefix={isEmail ? <FaEnvelopeOpenText /> : <FaPhoneAlt />}
                        error={!isContactValid}
                        label="Email or Phone"
                      />
                    )}
                    rules={{ required: 'Email or Phone is required' }}
                  />
                  {!isContactValid && <FormHelperText error>Enter a valid email or phone number</FormHelperText>}
                </FormControl>
              </>
            )}

            {error && (
              <Typography
                variant="body2"
                mb={2}
                sx={{
                  color: '#B42318',
                  bgcolor: 'rgba(180,35,24,0.06)',
                  border: '1px solid rgba(180,35,24,0.12)',
                  borderRadius: 2,
                  px: 1.6,
                  py: 0.9,
                }}
              >
                {error}
              </Typography>
            )}

            <Box display="flex" gap={1.2} alignItems="center" flexWrap="wrap">
              <Button
                type="submit"
                variant="contained"
                startIcon={trackingLoading ? <CircularProgress size={18} /> : <FaSearch />}
                disabled={!canSubmit || trackingLoading}
                sx={{
                  borderRadius: 2.5,
                  minHeight: 50,
                  px: 3,
                  py: 1.1,
                  bgcolor: '#07142F',
                  textTransform: 'none',
                  fontWeight: 900,
                  boxShadow: '0 16px 34px rgba(7,20,47,0.18)',
                  '&:hover': { bgcolor: BRAND_PRIMARY },
                }}
              >
                {trackingLoading ? 'Tracking...' : 'Track Shipment'}
              </Button>
              <Button
                type="button"
                variant="text"
                color="inherit"
                onClick={() => {
                  reset({
                    awb: '',
                    orderNumber: '',
                    contact: '',
                  })
                  resetResults()
                  if (location.pathname.startsWith('/tracking')) {
                    navigate(trackingBasePath)
                  }
                }}
                sx={{
                  borderRadius: 2.5,
                  color: '#4B5870',
                  textTransform: 'none',
                  fontWeight: 900,
                }}
              >
                Reset
              </Button>
            </Box>

            {!hasTrackingQuery && (
              <>
                <Box
                  sx={{
                    mt: 2.4,
                    display: 'grid',
                    gridTemplateColumns: '38px 1fr',
                    gap: 1.35,
                    alignItems: 'center',
                    border: `1px solid ${alpha(BRAND_PRIMARY, 0.12)}`,
                    borderRadius: 3,
                    background: `linear-gradient(135deg, ${alpha(BRAND_PRIMARY, 0.055)}, ${alpha(
                      BRAND_ACCENT,
                      0.055
                    )})`,
                    p: 1.7,
                  }}
                >
                  <Box
                    sx={{
                      width: 38,
                      height: 38,
                      borderRadius: 2.4,
                      display: 'grid',
                      placeItems: 'center',
                      color: BRAND_PRIMARY,
                      bgcolor: alpha(BRAND_PRIMARY, 0.08),
                      fontSize: 18,
                    }}
                  >
                    <FaShieldAlt />
                  </Box>
                  <Box>
                    <Typography
                      sx={{
                        color: '#07142F',
                        fontSize: '0.86rem',
                        fontWeight: 950,
                      }}
                    >
                      100% Secure & Private
                    </Typography>
                    <Typography
                      sx={{
                        mt: 0.25,
                        color: '#64748B',
                        fontSize: '0.76rem',
                        fontWeight: 700,
                      }}
                    >
                      We never share your tracking information.
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ mt: 2.6 }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2}>
                    <Typography
                      sx={{
                        color: '#07142F',
                        fontSize: '0.92rem',
                        fontWeight: 950,
                      }}
                    >
                      Recent Tracks
                    </Typography>
                    <Button
                      type="button"
                      size="small"
                      onClick={() => navigate('/tracking')}
                      sx={{
                        color: BRAND_PRIMARY,
                        textTransform: 'none',
                        fontWeight: 950,
                        minWidth: 'auto',
                        px: 0,
                      }}
                    >
                      View all
                    </Button>
                  </Stack>
                  <Stack sx={{ mt: 0.8 }}>
                    {recentTracks.map((track) => (
                      <Box
                        key={track.awb}
                        sx={{
                          display: 'grid',
                          gridTemplateColumns: {
                            xs: '1fr',
                            sm: '1fr auto auto',
                          },
                          gap: { xs: 0.5, sm: 1.4 },
                          alignItems: 'center',
                          borderTop: `1px solid ${alpha('#07142F', 0.08)}`,
                          py: 1.35,
                        }}
                      >
                        <Box sx={{ minWidth: 0 }}>
                          <Typography
                            sx={{
                              color: '#07142F',
                              fontSize: '0.78rem',
                              fontWeight: 950,
                            }}
                          >
                            {track.awb}
                          </Typography>
                          <Typography
                            sx={{
                              color: '#64748B',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                            }}
                          >
                            {track.route}
                          </Typography>
                        </Box>
                        <Chip
                          label={track.status}
                          size="small"
                          sx={{
                            justifySelf: { xs: 'start', sm: 'end' },
                            height: 22,
                            borderRadius: 999,
                            color: track.color,
                            bgcolor: track.bg,
                            fontSize: '0.66rem',
                            fontWeight: 950,
                          }}
                        />
                        <Typography
                          sx={{
                            color: '#64748B',
                            fontSize: '0.72rem',
                            fontWeight: 750,
                          }}
                        >
                          {track.time}
                        </Typography>
                      </Box>
                    ))}
                  </Stack>
                </Box>
              </>
            )}
          </Box>
        </Box>

        {!isClientTrackingRoute && !hasTrackingQuery && (
          <PublicToolStorySections
            eyebrow="Shipment journey"
            title="Every handoff, in one clear timeline"
            description="Track the shipment from order confirmation to final delivery without switching between courier websites."
            steps={[
              {
                icon: <FaReceipt />,
                title: 'Order confirmed',
                description: 'Shipment details and AWB are recorded for tracking.',
              },
              {
                icon: <FaBoxOpen />,
                title: 'Picked and in transit',
                description: 'Courier scans show movement through the network.',
              },
              {
                icon: <MdLocationOn />,
                title: 'Out for delivery',
                description: 'See the latest location context before arrival.',
              },
              {
                icon: <FaShieldAlt />,
                title: 'Delivered',
                description: 'The final delivery event completes the journey.',
              },
            ]}
            features={[
              {
                icon: <MdLocationOn />,
                title: 'Real-time events',
                description: 'Get live courier scan context.',
              },
              {
                icon: <FaReceipt />,
                title: 'All-in-one lookup',
                description: 'Search by AWB or order details.',
              },
              {
                icon: <MdSchedule />,
                title: 'Accurate timeline',
                description: 'Review every milestone in order.',
              },
              {
                icon: <FaShieldAlt />,
                title: 'Secure and private',
                description: 'Tracking data stays protected.',
              },
            ]}
            ctaTitle="Know where it is. Ready for the next shipment?"
            ctaDescription="Sign in to book, manage and track every courier from one Pax Logistics dashboard."
            primaryLabel="Login to dashboard"
            primaryPath="/login"
            secondaryLabel="Calculate shipment rate"
            secondaryPath="/rate-calculator"
          />
        )}

        {isSuccess && tracking && (activeAwb || (activeOrder && activeContact)) && (
          <Stack spacing={1.5} mt={1.5}>
            <Card sx={shellCardStyles}>
              <CardContent>
                <Typography variant="h6" fontWeight={800} gutterBottom color="#17171A">
                  Shipment Overview
                </Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      AWB Number
                    </Typography>
                    <Typography fontWeight={600}>
                      {tracking.awb_number ? <AWBLink awb={tracking.awb_number} /> : '-'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Order Number
                    </Typography>
                    <Typography fontWeight={600}>{tracking.order_number || '-'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Courier
                    </Typography>
                    <Typography fontWeight={600}>{tracking.courier_name || '-'}</Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Status
                    </Typography>
                    <Chip
                      label={tracking.status || 'Unknown'}
                      color={(() => {
                        const normalized = (tracking.status || '').toLowerCase()
                        if (normalized.includes('deliver')) return 'success'
                        if (normalized.includes('transit')) return 'info'
                        if (normalized.includes('cancel')) return 'error'
                        if (normalized.includes('rto')) return 'warning'
                        return 'default'
                      })()}
                      size="small"
                      sx={{ fontWeight: 700, borderRadius: '999px' }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Payment Type
                    </Typography>
                    <Typography fontWeight={600} textTransform="uppercase">
                      {tracking.payment_type || '-'}
                    </Typography>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      Estimated Delivery
                    </Typography>
                    <Typography fontWeight={600}>
                      {tracking.edd ? new Date(tracking.edd).toLocaleDateString() : '-'}
                    </Typography>
                  </Grid>
                </Grid>
                {tracking.shipment_info && (
                  <Box mt={3}>
                    <Typography variant="body2" color="text.secondary" gutterBottom fontWeight={700}>
                      Shipment Info
                    </Typography>
                    <Typography fontSize={14}>{tracking.shipment_info}</Typography>
                  </Box>
                )}
              </CardContent>
            </Card>

            <DelhiveryLifecycleAdapter
              courierName={tracking.courier_name}
              integrationType={tracking.integration_type}
            />

            <Card sx={shellCardStyles}>
              <CardContent>
                <Stack
                  direction={{ xs: 'column', md: 'row' }}
                  justifyContent="space-between"
                  alignItems={{ xs: 'flex-start', md: 'center' }}
                  spacing={1}
                  mb={1}
                >
                  <Typography variant="h6" fontWeight={800} color="#17171A">
                    Tracking Timeline
                  </Typography>
                  <Chip
                    label={`${sortedHistory.length} event${sortedHistory.length === 1 ? '' : 's'}`}
                    sx={{
                      bgcolor: alpha(BRAND_ACCENT, 0.1),
                      color: BRAND_ACCENT,
                      borderRadius: '999px',
                      fontWeight: 800,
                    }}
                  />
                </Stack>
                <Divider sx={{ mb: 1.5 }} />
                <Typography variant="h6" fontWeight={700} gutterBottom sx={{ display: 'none' }}>
                  Tracking Timeline
                </Typography>
                {sortedHistory.length === 0 ? (
                  <Typography color="text.secondary">No tracking events available yet.</Typography>
                ) : (
                  <List>
                    {sortedHistory.map((event, idx) => (
                      <Fragment key={`${event.event_time}-${idx}`}>
                        <ListItem alignItems="flex-start" sx={{ px: 0 }}>
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            {idx === 0 ? (
                              <FaBoxOpen color="#062A5B" size={20} />
                            ) : (
                              <MdLocationOn color="#6B7280" size={20} />
                            )}
                          </ListItemIcon>
                          <ListItemText
                            primary={
                              <Stack direction="row" spacing={1} alignItems="center">
                                <Typography fontWeight={600}>{event.message || event.status_code}</Typography>
                                <Chip
                                  size="small"
                                  label={event.status_code}
                                  color={idx === 0 ? 'primary' : 'default'}
                                  sx={{
                                    borderRadius: '999px',
                                    fontWeight: 700,
                                  }}
                                />
                              </Stack>
                            }
                            secondary={
                              <Stack
                                direction={{ xs: 'column', sm: 'row' }}
                                spacing={1}
                                mt={0.5}
                                alignItems={{ sm: 'center' }}
                              >
                                <Stack direction="row" spacing={0.5} alignItems="center">
                                  <MdSchedule size={16} />
                                  <Typography variant="caption">{formatTrackingEventTime(event.event_time)}</Typography>
                                </Stack>
                                {event.location && (
                                  <Typography variant="caption" color="text.secondary">
                                    {event.location}
                                  </Typography>
                                )}
                              </Stack>
                            }
                          />
                        </ListItem>
                        {idx !== sortedHistory.length - 1 && <Divider component="li" />}
                      </Fragment>
                    ))}
                  </List>
                )}
              </CardContent>
            </Card>
          </Stack>
        )}
      </Stack>
    </Box>
  )
}
