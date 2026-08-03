import {
  Alert,
  alpha,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Grid,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import type { Theme } from '@mui/material/styles'
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { MdRefresh, MdAnalytics, MdOutlineCalendarMonth } from 'react-icons/md'
import {
  type MerchantOpsAnalyticsData,
  type MerchantOpsAnalyticsFilters,
} from '../../api/dashboard.api'
import { useMerchantOpsAnalytics } from '../../hooks/useOpsAnalytics'
import { BRAND } from '../../config/brand'

const today = new Date()
const defaultFromDate = new Date(today)
defaultFromDate.setDate(defaultFromDate.getDate() - 30)

const formatInputDate = (date: Date) => date.toISOString().slice(0, 10)

const defaultFilters: MerchantOpsAnalyticsFilters = {
  fromDate: formatInputDate(defaultFromDate),
  toDate: formatInputDate(today),
  courier: '',
  zone: '',
  search: '',
  accountId: '',
}

const formatPercent = (value?: number | null) => `${Number(value || 0).toFixed(1)}%`
const formatDays = (value?: number | null) => `${Number(value || 0).toFixed(1)} days`
const formatNumber = (value?: number | null) => Number(value || 0).toLocaleString('en-IN')

const chartColors = ['#062A5B', '#ED1C24', '#1E88E5', '#8E24AA', '#E53935', '#43A047']
const tableHeaderBackground = alpha(BRAND.colors.teal, 0.075)

export default function OpsAnalyticsSection() {
  const theme = useTheme()
  const [ChartComponent, setChartComponent] = useState<
    typeof import('react-apexcharts').default | null
  >(null)
  const [draftFilters, setDraftFilters] = useState<MerchantOpsAnalyticsFilters>(defaultFilters)
  const [appliedFilters, setAppliedFilters] = useState<MerchantOpsAnalyticsFilters>(defaultFilters)

  useEffect(() => {
    let mounted = true

    if (typeof window !== 'undefined') {
      import('react-apexcharts').then((mod) => {
        if (mounted) {
          setChartComponent(() => mod.default)
        }
      })
    }

    return () => {
      mounted = false
    }
  }, [])

  const { data, isLoading, error, refetch, isRefetching, isFetching } =
    useMerchantOpsAnalytics(appliedFilters)

  const analytics = data || ({} as MerchantOpsAnalyticsData)
  const summary = analytics.summary || {}
  const zoneOverview = analytics.zoneOverview || []
  const zoneMatrix = analytics.zoneCourierMatrix || { zones: [], couriers: [], rows: [] }
  const zoneRtoAnalytics = analytics.zoneRtoAnalytics || []
  const zoneSpeed = analytics.zoneSpeed || []
  const ndrAnalytics = analytics.ndrAnalytics || []
  const courierPerformance = analytics.courierPerformance || []
  const highRiskPincodes = analytics.highRiskPincodes || []
  const pincodeCourierComparison = analytics.pincodeCourierComparison || []
  const codFriendlyPincodes = analytics.codFriendlyPincodes || []
  const prepaidRecommendedPincodes = analytics.prepaidRecommendedPincodes || []
  const weightDistribution = analytics.weightDistribution || []
  const colorWiseRto = analytics.colorWiseRto || []
  const priceWiseRto = analytics.priceWiseRto || []
  const courierRtoByWeight = analytics.courierRtoByWeight || []
  const productWiseRto = analytics.productWiseRto || []
  const categoryWiseRto = analytics.categoryWiseRto || []
  const skuWiseRto = analytics.skuWiseRto || []
  const sizeWiseRto = analytics.sizeWiseRto || []
  const dispatchDelay = analytics.dispatchDelay || []
  const guidance = analytics.guidance || []

  const heatmapSeries = useMemo(
    () =>
      zoneMatrix.rows.map((row) => ({
        name: row.courier,
        data: zoneMatrix.zones.map((zoneName) => {
          const cell = row.zones.find((item) => item.zone === zoneName)
          return Number(cell?.deliveryRate || 0)
        }),
      })),
    [zoneMatrix],
  )

  const ndrSeries = useMemo(() => ndrAnalytics.map((item) => Number(item.share || 0)), [ndrAnalytics])
  const ndrLabels = useMemo(() => ndrAnalytics.map((item) => item.reason), [ndrAnalytics])
  const weightSeries = useMemo(
    () => weightDistribution.map((item) => Number(item.orders || 0)),
    [weightDistribution],
  )
  const weightLabels = useMemo(
    () => weightDistribution.map((item) => item.label),
    [weightDistribution],
  )
  const dispatchLabels = useMemo(
    () => dispatchDelay.map((item) => item.dispatchTime),
    [dispatchDelay],
  )
  const dispatchSeries = useMemo(
    () => [
      {
        name: 'Delivery %',
        data: dispatchDelay.map((item) => Number(item.deliveryRate || 0)),
      },
      {
        name: 'RTO %',
        data: dispatchDelay.map((item) => Number(item.rtoRate || 0)),
      },
    ],
    [dispatchDelay],
  )

  const handleApplyFilters = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setAppliedFilters(draftFilters)
  }

  const handleResetFilters = () => {
    setDraftFilters(defaultFilters)
    setAppliedFilters(defaultFilters)
  }

  const tableHeaders = {
    zoneOverview: ['Zone', 'Orders', 'Delivery %', 'RTO %', 'Avg Delivery Days', 'Best Courier'],
    zoneRto: ['Zone', 'COD RTO', 'Prepaid RTO'],
    zoneSpeed: ['Zone', 'Best Courier', 'Avg Days'],
    ndr: ['Reason', 'Share'],
    courierPerformance: ['Courier', 'Orders', 'Delivered %', 'Avg Days', 'RTO %'],
    highRisk: ['Pincode', 'Orders', 'RTO %'],
    pincode: ['Pincode', 'Courier', 'Delivery %', 'RTO %', 'Avg Days'],
    cod: ['Pincode', 'COD Delivery %'],
    prepaid: ['Pincode', 'COD RTO'],
    weight: ['Courier', '0-500 gm', '500-1000 gm', '1-2 Kg', '2+ Kg'],
    product: ['Product', 'Orders', 'Delivered', 'RTO', 'RTO %'],
    category: ['Category', 'RTO %'],
    sku: ['SKU', 'Product', 'RTO %'],
    size: ['Size', 'RTO %'],
    dispatch: ['Dispatch Time', 'Orders', 'Delivery %', 'RTO %'],
    color: ['Color', 'RTO %'],
    price: ['Price Range', 'RTO %'],
  }

  if (isLoading) {
    return (
      <Card
        sx={{
          borderRadius: 3,
          boxShadow: '0 10px 32px rgba(15, 23, 42, 0.08)',
          border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
        }}
      >
        <CardContent sx={{ minHeight: 320, display: 'grid', placeItems: 'center' }}>
          <Stack spacing={1.5} alignItems="center">
            <MdAnalytics size={28} color={theme.palette.primary.main} />
            <Typography fontWeight={700} color="text.secondary">
              Loading seller analytics...
            </Typography>
          </Stack>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      id="ops-analytics"
      sx={{
        borderRadius: 3,
        boxShadow: '0 10px 32px rgba(15, 23, 42, 0.08)',
        border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
        overflow: 'hidden',
      }}
    >
      <CardContent sx={{ p: { xs: 2, md: 3 } }}>
        <Stack spacing={2.5}>
          {error ? (
            <Alert
              severity="warning"
              action={
                <Button
                  size="small"
                  onClick={() => refetch()}
                  sx={{ textTransform: 'none', fontWeight: 800 }}
                >
                  Retry
                </Button>
              }
              sx={{ borderRadius: 2 }}
            >
              Operations analytics is temporarily unavailable. Showing empty states until the
              data source responds.
            </Alert>
          ) : null}

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'center' }}
            gap={2}
          >
            <Box>
              <Typography
                variant="overline"
                sx={{
                  color: theme.palette.primary.main,
                  fontWeight: 800,
                  letterSpacing: '0.14em',
                }}
              >
                Seller analytics
              </Typography>
              <Typography variant="h5" fontWeight={900} color="text.primary" sx={{ mt: 0.5 }}>
                Operations intelligence for courier, zone and pincode decisions
              </Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5, maxWidth: 900 }}>
                A single dashboard section for range-based ops analysis, built for the seller
                workspace and ready for future multi-account filtering.
              </Typography>
            </Box>

            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              <Button
                startIcon={<MdRefresh size={18} />}
                variant="outlined"
                onClick={() => refetch()}
                disabled={isRefetching || isFetching}
                sx={{
                  textTransform: 'none',
                  borderRadius: 2,
                  fontWeight: 700,
                }}
              >
                {isRefetching || isFetching ? 'Refreshing' : 'Refresh'}
              </Button>
            </Stack>
          </Stack>

          <Box
            component="form"
            onSubmit={handleApplyFilters}
            sx={{
              p: { xs: 2, md: 2.5 },
              borderRadius: 3,
              background: `linear-gradient(180deg, ${alpha(BRAND.colors.surface, 0.92)} 0%, ${alpha(
                BRAND.colors.paper,
                0.98,
              )} 100%)`,
              border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
            }}
          >
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6, xl: 2 }}>
                <TextField
                  label="From"
                  type="date"
                  fullWidth
                  value={draftFilters.fromDate || ''}
                  onChange={(event) =>
                    setDraftFilters((prev) => ({ ...prev, fromDate: event.target.value }))
                  }
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6, xl: 2 }}>
                <TextField
                  label="To"
                  type="date"
                  fullWidth
                  value={draftFilters.toDate || ''}
                  onChange={(event) =>
                    setDraftFilters((prev) => ({ ...prev, toDate: event.target.value }))
                  }
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6, xl: 2 }}>
                <TextField
                  label="Courier"
                  placeholder="Delhivery"
                  fullWidth
                  value={draftFilters.courier || ''}
                  onChange={(event) =>
                    setDraftFilters((prev) => ({ ...prev, courier: event.target.value }))
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6, xl: 2 }}>
                <TextField
                  label="Zone"
                  placeholder="West"
                  fullWidth
                  value={draftFilters.zone || ''}
                  onChange={(event) =>
                    setDraftFilters((prev) => ({ ...prev, zone: event.target.value }))
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6, xl: 2 }}>
                <TextField
                  label="Search"
                  placeholder="Order, AWB, buyer, pincode"
                  fullWidth
                  value={draftFilters.search || ''}
                  onChange={(event) =>
                    setDraftFilters((prev) => ({ ...prev, search: event.target.value }))
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6, xl: 2 }}>
                <TextField
                  label="Account ID (future-ready)"
                  placeholder="Current seller account"
                  fullWidth
                  value={draftFilters.accountId || ''}
                  onChange={(event) =>
                    setDraftFilters((prev) => ({ ...prev, accountId: event.target.value }))
                  }
                  helperText="Reserved for multi-account analytics"
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="flex-end">
                  <Button
                    type="button"
                    variant="text"
                    onClick={handleResetFilters}
                    sx={{ textTransform: 'none', fontWeight: 700 }}
                  >
                    Reset
                  </Button>
                  <Button
                    type="submit"
                    variant="contained"
                    startIcon={<MdOutlineCalendarMonth size={18} />}
                    sx={{
                      textTransform: 'none',
                      fontWeight: 800,
                      borderRadius: 2,
                      bgcolor: BRAND.colors.teal,
                      '&:hover': { bgcolor: BRAND.colors.tealDark },
                    }}
                  >
                    Apply range
                  </Button>
                </Stack>
              </Grid>
            </Grid>
          </Box>

          <Grid container spacing={2}>
            <Grid size={{ xs: 6, md: 3 }}>
              <SummaryTile label="Orders" value={formatNumber(summary.totalOrders)} helper="Selected range" />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <SummaryTile
                label="Delivery rate"
                value={formatPercent(summary.deliveryRate)}
                helper={`Avg ${formatDays(summary.avgDeliveryDays)}`}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <SummaryTile
                label="RTO rate"
                value={formatPercent(summary.rtoRate)}
                helper={`Dispatch ${formatDays(summary.avgDispatchDays)}`}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <SummaryTile
                label="Best courier"
                value={summary.bestCourier?.label || summary.bestCourier?.courier || 'Unknown'}
                helper={summary.bestZone?.label ? `Best zone: ${summary.bestZone.label}` : 'Zone ranking ready'}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2.5}>
            <Grid size={{ xs: 12, xl: 6 }}>
              <AnalyticsCard title="Overall Zone Dashboard" subtitle="Zone-level performance and seller guidance">
                <CompactTable
                  headers={tableHeaders.zoneOverview}
                  rows={zoneOverview}
                  emptyMessage="No zone performance data for this range."
                  renderRow={(row) => (
                    <TableRow key={`${row.label}-${row.zone}`}>
                      <TableCell sx={{ fontWeight: 800 }}>{row.label}</TableCell>
                      <TableCell>{formatNumber(row.orders)}</TableCell>
                      <TableCell>{formatPercent(row.deliveryRate)}</TableCell>
                      <TableCell>{formatPercent(row.rtoRate)}</TableCell>
                      <TableCell>{formatDays(row.avgDeliveryDays)}</TableCell>
                      <TableCell>
                        <Chip
                          label={row.bestCourier || 'Unknown'}
                          size="small"
                          variant="outlined"
                          sx={{ fontWeight: 700 }}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                />

                <Box
                  sx={{
                    mt: 2,
                    p: 1.6,
                    borderRadius: 2.5,
                    border: `1px solid ${alpha(BRAND.colors.teal, 0.1)}`,
                    backgroundColor: alpha(BRAND.colors.tealSoft, 0.56),
                  }}
                >
                  <Typography
                    variant="overline"
                    sx={{
                      display: 'block',
                      mb: 1,
                      color: BRAND.colors.teal,
                      fontWeight: 900,
                      letterSpacing: '0.1em',
                    }}
                  >
                    Seller guidance
                  </Typography>
                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {guidance.map((line) => (
                      <Chip
                        key={line}
                        label={line.replace(/\s*->\s*/g, ' → ')}
                        variant="outlined"
                        sx={{
                          bgcolor: BRAND.colors.paper,
                          borderColor: alpha(BRAND.colors.teal, 0.22),
                          color: BRAND.colors.ink,
                          fontWeight: 750,
                        }}
                      />
                    ))}
                  </Stack>
                </Box>
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, xl: 6 }}>
              <AnalyticsCard title="Courier vs Zone Matrix" subtitle="Courier delivery rate by zone">
                <ChartPanel height={320}>
                  {ChartComponent && heatmapSeries.length > 0 ? (
                    <ChartComponent options={buildHeatmapOptions(theme, zoneMatrix.zones)} series={heatmapSeries} type="heatmap" height={320} />
                  ) : (
                    <EmptyPanel text="No courier-zone data available for the selected range." />
                  )}
                </ChartPanel>
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <AnalyticsCard title="Zone Wise RTO Analytics" subtitle="COD RTO vs prepaid RTO">
                <CompactTable
                  headers={tableHeaders.zoneRto}
                  rows={zoneRtoAnalytics}
                  emptyMessage="No zone RTO data available."
                  renderRow={(row) => (
                    <TableRow key={row.zone}>
                      <TableCell sx={{ fontWeight: 800 }}>{row.zone}</TableCell>
                      <TableCell>{formatPercent(row.codRto)}</TableCell>
                      <TableCell>{formatPercent(row.prepaidRto)}</TableCell>
                    </TableRow>
                  )}
                />
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <AnalyticsCard title="Zone Wise Delivery Speed" subtitle="Best courier and average days by zone">
                <CompactTable
                  headers={tableHeaders.zoneSpeed}
                  rows={zoneSpeed}
                  emptyMessage="No zone speed data available."
                  renderRow={(row) => (
                    <TableRow key={row.zone}>
                      <TableCell sx={{ fontWeight: 800 }}>{row.zone}</TableCell>
                      <TableCell>{row.bestCourier}</TableCell>
                      <TableCell>{formatDays(row.avgDays)}</TableCell>
                    </TableRow>
                  )}
                />
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 5 }}>
              <AnalyticsCard title="NDR Analytics" subtitle="Reason-wise summary">
                <ChartPanel height={280}>
                  {ChartComponent && ndrSeries.length > 0 ? (
                    <ChartComponent options={buildRadialOptions(theme, ndrLabels)} series={ndrSeries} type="radialBar" height={280} />
                  ) : (
                    <EmptyPanel text="No NDR reason data for the selected range." />
                  )}
                </ChartPanel>

                <Box sx={{ mt: 2 }}>
                  <CompactTable
                    headers={tableHeaders.ndr}
                    rows={ndrAnalytics}
                    emptyMessage="No NDR reasons available."
                    renderRow={(row) => (
                      <TableRow key={row.reason}>
                        <TableCell sx={{ fontWeight: 800 }}>{row.reason}</TableCell>
                        <TableCell>{formatPercent(row.share)}</TableCell>
                      </TableRow>
                    )}
                  />
                </Box>
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 7 }}>
              <AnalyticsCard title="Courier Performance Analytics" subtitle="Courier benchmarking">
                <CompactTable
                  headers={tableHeaders.courierPerformance}
                  rows={courierPerformance}
                  emptyMessage="No courier performance data available."
                  renderRow={(row) => (
                    <TableRow key={row.courier}>
                      <TableCell sx={{ fontWeight: 800 }}>{row.courier}</TableCell>
                      <TableCell>{formatNumber(row.orders)}</TableCell>
                      <TableCell>{formatPercent(row.deliveryRate)}</TableCell>
                      <TableCell>{formatDays(row.avgDeliveryDays)}</TableCell>
                      <TableCell>{formatPercent(row.rtoRate)}</TableCell>
                    </TableRow>
                  )}
                />
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <AnalyticsCard title="High Risk Pincode Analytics" subtitle="Risky delivery areas">
                <CompactTable
                  headers={tableHeaders.highRisk}
                  rows={highRiskPincodes}
                  emptyMessage="No high-risk pincodes found."
                  renderRow={(row) => (
                    <TableRow key={row.pincode}>
                      <TableCell sx={{ fontWeight: 800 }}>{row.pincode}</TableCell>
                      <TableCell>{formatNumber(row.orders)}</TableCell>
                      <TableCell>{formatPercent(row.rtoRate)}</TableCell>
                    </TableRow>
                  )}
                />

                <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
                  <Typography fontWeight={800}>Seller warning</Typography>
                  <Typography variant="body2">High RTO Zone</Typography>
                </Alert>
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <AnalyticsCard title="Pincode Intelligence Analytics" subtitle="Courier-wise pincode comparison">
                <CompactTable
                  headers={tableHeaders.pincode}
                  rows={pincodeCourierComparison}
                  emptyMessage="No pincode intelligence data available."
                  renderRow={(row) => (
                    <TableRow key={`${row.pincode}-${row.courier}`}>
                      <TableCell sx={{ fontWeight: 800 }}>{row.pincode}</TableCell>
                      <TableCell>{row.courier}</TableCell>
                      <TableCell>{formatPercent(row.deliveryRate)}</TableCell>
                      <TableCell>{formatPercent(row.rtoRate)}</TableCell>
                      <TableCell>{formatDays(row.avgDeliveryDays)}</TableCell>
                    </TableRow>
                  )}
                />
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <AnalyticsCard title="COD Friendly Pincode Analytics" subtitle="Where COD can be allowed">
                <CompactTable
                  headers={tableHeaders.cod}
                  rows={codFriendlyPincodes}
                  emptyMessage="No COD-friendly pincodes found."
                  renderRow={(row) => (
                    <TableRow key={row.pincode}>
                      <TableCell sx={{ fontWeight: 800 }}>{row.pincode}</TableCell>
                      <TableCell>{formatPercent(row.codDelivery)}</TableCell>
                    </TableRow>
                  )}
                />

                <Alert severity="success" sx={{ mt: 2, borderRadius: 2 }}>
                  <Typography fontWeight={800}>AI Suggestion</Typography>
                  <Typography variant="body2">COD Allowed</Typography>
                </Alert>
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <AnalyticsCard title="Prepaid Recommended Pincode" subtitle="Where COD should be avoided">
                <CompactTable
                  headers={tableHeaders.prepaid}
                  rows={prepaidRecommendedPincodes}
                  emptyMessage="No prepaid-only pincodes found."
                  renderRow={(row) => (
                    <TableRow key={row.pincode}>
                      <TableCell sx={{ fontWeight: 800 }}>{row.pincode}</TableCell>
                      <TableCell>{formatPercent(row.codRto)}</TableCell>
                    </TableRow>
                  )}
                />

                <Alert severity="warning" sx={{ mt: 2, borderRadius: 2 }}>
                  <Typography fontWeight={800}>Warning</Typography>
                  <Typography variant="body2">Suggest Prepaid Only</Typography>
                </Alert>
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <AnalyticsCard title="Order Distribution by Weight" subtitle="What weight buckets dominate the mix">
                <ChartPanel height={320}>
                  {ChartComponent && weightSeries.length > 0 ? (
                    <ChartComponent
                      options={buildDonutOptions(theme, weightLabels)}
                      series={weightSeries}
                      type="donut"
                      height={320}
                    />
                  ) : (
                    <EmptyPanel text="No weight data available." />
                  )}
                </ChartPanel>
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <AnalyticsCard title="Color Wise RTO + Price Wise RTO" subtitle="Product attribute risk analysis">
                <Stack spacing={2}>
                  <CompactTable
                    headers={tableHeaders.color}
                    rows={colorWiseRto}
                    emptyMessage="No color risk data available."
                    renderRow={(row) => (
                      <TableRow key={row.color}>
                        <TableCell sx={{ fontWeight: 800 }}>{row.color}</TableCell>
                        <TableCell>{formatPercent(row.rto)}</TableCell>
                      </TableRow>
                    )}
                  />

                  <CompactTable
                    headers={tableHeaders.price}
                    rows={priceWiseRto}
                    emptyMessage="No price risk data available."
                    renderRow={(row) => (
                      <TableRow key={row.priceRange}>
                        <TableCell sx={{ fontWeight: 800 }}>{row.priceRange}</TableCell>
                        <TableCell>{formatPercent(row.rto)}</TableCell>
                      </TableRow>
                    )}
                  />
                </Stack>
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <AnalyticsCard title="Courier RTO by Weight" subtitle="Courier reliability across parcel slabs">
                <CompactTable
                  headers={tableHeaders.weight}
                  rows={courierRtoByWeight}
                  emptyMessage="No courier weight matrix data available."
                  renderRow={(row) => (
                    <TableRow key={row.courier}>
                      <TableCell sx={{ fontWeight: 800 }}>{row.courier}</TableCell>
                      <TableCell>{formatPercent(row['0-500 gm'] as number)}</TableCell>
                      <TableCell>{formatPercent((row['501-1000 gm'] as number) ?? (row['500-1000 gm'] as number))}</TableCell>
                      <TableCell>{formatPercent((row['1001-2000 gm'] as number) ?? (row['1-2 Kg'] as number))}</TableCell>
                      <TableCell>{formatPercent((row['2000+ gm'] as number) ?? (row['2+ Kg'] as number))}</TableCell>
                    </TableRow>
                  )}
                />
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <AnalyticsCard title="Product Wise RTO Analytics + Category Wise RTO" subtitle="SKU-level and category-level risk">
                <Stack spacing={2}>
                  <CompactTable
                    headers={tableHeaders.product}
                    rows={productWiseRto}
                    emptyMessage="No product analytics available."
                    renderRow={(row) => (
                      <TableRow key={row.product}>
                        <TableCell sx={{ fontWeight: 800 }}>{row.product}</TableCell>
                        <TableCell>{formatNumber(row.orders)}</TableCell>
                        <TableCell>{formatNumber(row.delivered)}</TableCell>
                        <TableCell>{formatNumber(row.rto)}</TableCell>
                        <TableCell>{formatPercent(row.rtoRate)}</TableCell>
                      </TableRow>
                    )}
                  />

                  <CompactTable
                    headers={tableHeaders.category}
                    rows={categoryWiseRto}
                    emptyMessage="No category analytics available."
                    renderRow={(row) => (
                      <TableRow key={row.category}>
                        <TableCell sx={{ fontWeight: 800 }}>{row.category}</TableCell>
                        <TableCell>{formatPercent(row.rtoRate)}</TableCell>
                      </TableRow>
                    )}
                  />
                </Stack>
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <AnalyticsCard title="SKU Wise RTO + Size Wise RTO" subtitle="Specific SKU and size risk">
                <Stack spacing={2}>
                  <CompactTable
                    headers={tableHeaders.sku}
                    rows={skuWiseRto}
                    emptyMessage="No SKU analytics available."
                    renderRow={(row) => (
                      <TableRow key={row.sku}>
                        <TableCell sx={{ fontWeight: 800 }}>{row.sku}</TableCell>
                        <TableCell>{row.product}</TableCell>
                        <TableCell>{formatPercent(row.rtoRate)}</TableCell>
                      </TableRow>
                    )}
                  />

                  <CompactTable
                    headers={tableHeaders.size}
                    rows={sizeWiseRto}
                    emptyMessage="No size analytics available."
                    renderRow={(row) => (
                      <TableRow key={row.size}>
                        <TableCell sx={{ fontWeight: 800 }}>{row.size}</TableCell>
                        <TableCell>{formatPercent(row.rtoRate)}</TableCell>
                      </TableRow>
                    )}
                  />
                </Stack>
              </AnalyticsCard>
            </Grid>

            <Grid size={{ xs: 12 }}>
              <AnalyticsCard title="Dispatch Delay Analytics" subtitle="Dispatch SLA dashboard">
                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12, xl: 7 }}>
                    <ChartPanel height={320}>
                      {ChartComponent && dispatchSeries[0].data.length > 0 ? (
                        <ChartComponent
                          options={buildAreaOptions(theme, dispatchLabels)}
                          series={dispatchSeries}
                          type="area"
                          height={320}
                        />
                      ) : (
                        <EmptyPanel text="No dispatch delay data available." />
                      )}
                    </ChartPanel>
                  </Grid>
                  <Grid size={{ xs: 12, xl: 5 }}>
                    <CompactTable
                      headers={tableHeaders.dispatch}
                      rows={dispatchDelay}
                      emptyMessage="No dispatch delay analytics available."
                      renderRow={(row) => (
                        <TableRow key={row.dispatchTime}>
                          <TableCell sx={{ fontWeight: 800 }}>{row.dispatchTime}</TableCell>
                          <TableCell>{formatNumber(row.orders)}</TableCell>
                          <TableCell>{formatPercent(row.deliveryRate)}</TableCell>
                          <TableCell>{formatPercent(row.rtoRate)}</TableCell>
                        </TableRow>
                      )}
                    />
                  </Grid>
                </Grid>
              </AnalyticsCard>
            </Grid>
          </Grid>
        </Stack>
      </CardContent>
    </Card>
  )
}

function SummaryTile({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: string
}) {
  const theme = useTheme()
  return (
    <Box
      sx={{
        height: '100%',
        p: { xs: 1.8, md: 2.2 },
        borderRadius: 3,
        background: `linear-gradient(135deg, ${alpha(BRAND.colors.surface, 0.95)} 0%, ${alpha(
          theme.palette.background.paper,
          0.95,
        )} 100%)`,
        border: `1px solid ${alpha(theme.palette.divider, 0.12)}`,
      }}
    >
      <Typography
        variant="overline"
        sx={{
          fontWeight: 800,
          letterSpacing: '0.14em',
          color: theme.palette.text.secondary,
        }}
      >
        {label}
      </Typography>
      <Typography variant="h5" fontWeight={900} sx={{ mt: 0.8, color: theme.palette.text.primary }}>
        {value}
      </Typography>
      {helper ? (
        <Typography variant="body2" sx={{ mt: 0.4, color: theme.palette.text.secondary }}>
          {helper}
        </Typography>
      ) : null}
    </Box>
  )
}

function AnalyticsCard({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <Card
      sx={{
        position: 'relative',
        alignSelf: 'flex-start',
        width: '100%',
        borderRadius: 3,
        overflow: 'hidden',
        backgroundColor: BRAND.colors.paper,
        boxShadow: '0 12px 34px rgba(6, 42, 91, 0.065)',
        border: `1px solid ${alpha(BRAND.colors.teal, 0.12)}`,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1.4,
          px: { xs: 2, md: 2.4 },
          py: { xs: 1.7, md: 2 },
          backgroundColor: alpha(BRAND.colors.tealSoft, 0.58),
          borderBottom: `1px solid ${alpha(BRAND.colors.teal, 0.1)}`,
        }}
      >
        <Box
          sx={{
            width: 38,
            height: 38,
            flexShrink: 0,
            display: 'grid',
            placeItems: 'center',
            borderRadius: 2,
            color: BRAND.colors.teal,
            bgcolor: BRAND.colors.paper,
            border: `1px solid ${alpha(BRAND.colors.teal, 0.13)}`,
            boxShadow: '0 5px 14px rgba(6, 42, 91, 0.07)',
          }}
        >
          <MdAnalytics size={21} />
        </Box>
        <Box minWidth={0}>
          <Typography variant="h6" fontWeight={850} color="text.primary" lineHeight={1.25}>
            {title}
          </Typography>
          {subtitle ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {subtitle}
            </Typography>
          ) : null}
        </Box>
      </Box>
      <CardContent sx={{ p: { xs: 1.8, md: 2.2 }, '&:last-child': { pb: { xs: 1.8, md: 2.2 } } }}>
        <Stack spacing={1.6}>
          {children}
        </Stack>
      </CardContent>
    </Card>
  )
}

function ChartPanel({ children, height }: { children: ReactNode; height: number }) {
  return (
    <Box
      sx={{
        minHeight: height,
        borderRadius: 2.5,
        p: 1.2,
        border: `1px solid ${alpha(BRAND.colors.teal, 0.1)}`,
        backgroundColor: alpha(BRAND.colors.surface, 0.72),
      }}
    >
      {children}
    </Box>
  )
}

function EmptyPanel({ text, compact = false }: { text: string; compact?: boolean }) {
  return (
    <Box
      sx={{
        minHeight: compact ? 126 : 292,
        px: 2.5,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 1,
        textAlign: 'center',
        borderRadius: 2.2,
        border: `1px dashed ${alpha(BRAND.colors.teal, 0.2)}`,
        color: BRAND.colors.muted,
        backgroundColor: alpha(BRAND.colors.tealSoft, 0.38),
      }}
    >
      <Box
        sx={{
          width: 34,
          height: 34,
          display: 'grid',
          placeItems: 'center',
          borderRadius: '50%',
          color: BRAND.colors.teal,
          bgcolor: BRAND.colors.paper,
          border: `1px solid ${alpha(BRAND.colors.teal, 0.12)}`,
        }}
      >
        <MdAnalytics size={18} />
      </Box>
      <Typography variant="body2" fontWeight={750} sx={{ maxWidth: 420 }}>
        {text}
      </Typography>
    </Box>
  )
}

function CompactTable<T extends Record<string, unknown>>({
  headers,
  rows,
  renderRow,
  emptyMessage,
}: {
  headers: string[]
  rows: T[]
  renderRow: (row: T) => ReactNode
  emptyMessage: string
}) {
  if (rows.length === 0) {
    return <EmptyPanel text={emptyMessage} compact />
  }

  return (
    <TableContainer
      sx={{
        borderRadius: 2.5,
        border: `1px solid ${alpha(BRAND.colors.teal, 0.12)}`,
        overflowX: 'auto',
      }}
    >
      <Table size="small" sx={{ minWidth: headers.length >= 5 ? 640 : '100%' }}>
        <TableHead>
          <TableRow
            sx={{
              backgroundColor: tableHeaderBackground,
            }}
          >
            {headers.map((header) => (
              <TableCell
                key={header}
                sx={{
                  fontWeight: 800,
                  whiteSpace: 'nowrap',
                  color: BRAND.colors.ink,
                  fontSize: '0.74rem',
                  letterSpacing: '0.055em',
                  borderBottomColor: alpha(BRAND.colors.teal, 0.12),
                }}
              >
                {header}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody
          sx={{
            '& .MuiTableRow-root:nth-of-type(even)': {
              backgroundColor: alpha(BRAND.colors.tealSoft, 0.38),
            },
            '& .MuiTableRow-root:hover': {
              backgroundColor: alpha(BRAND.colors.skySoft, 0.54),
            },
          }}
        >
          {rows.map((row, index) => <Fragment key={index}>{renderRow(row)}</Fragment>)}
        </TableBody>
      </Table>
    </TableContainer>
  )
}

function buildHeatmapOptions(theme: Theme, zones: string[]) {
  return {
    chart: {
      type: 'heatmap' as const,
      toolbar: { show: false },
      animations: { enabled: true, speed: 650 },
    },
    dataLabels: { enabled: false },
    stroke: { width: 2, colors: ['transparent'] },
    xaxis: {
      categories: zones,
      labels: {
        style: { colors: theme.palette.text.secondary },
      },
    },
    yaxis: {
      labels: {
        style: { colors: theme.palette.text.secondary },
      },
    },
    plotOptions: {
      heatmap: {
        shadeIntensity: 0.5,
        radius: 4,
        useFillColorAsStroke: true,
        colorScale: {
          ranges: [
            { from: 0, to: 69.9, color: '#FDECEA', name: 'Low' },
            { from: 70, to: 84.9, color: '#FDE7C8', name: 'Medium' },
            { from: 85, to: 100, color: '#DFF4E2', name: 'High' },
          ],
        },
      },
    },
    grid: {
      borderColor: alpha(theme.palette.divider, 0.08),
      strokeDashArray: 4,
    },
    legend: { show: false },
    tooltip: {
      theme: theme.palette.mode,
    },
  }
}

function buildRadialOptions(theme: Theme, labels: string[]) {
  return {
    chart: {
      type: 'radialBar' as const,
      toolbar: { show: false },
    },
    labels,
    colors: chartColors,
    plotOptions: {
      radialBar: {
        hollow: { size: '34%' },
        track: {
          background: alpha(theme.palette.divider, 0.12),
        },
        dataLabels: {
          name: {
            color: theme.palette.text.secondary,
          },
          value: {
            color: theme.palette.text.primary,
            fontSize: '18px',
            fontWeight: 800,
            formatter: (value: number) => `${Number(value).toFixed(1)}%`,
          },
          total: {
            show: true,
            label: 'NDR mix',
            color: theme.palette.text.primary,
            formatter: () => 'Reasons',
          },
        },
      },
    },
    tooltip: {
      theme: theme.palette.mode,
    },
    legend: {
      show: false,
    },
  }
}

function buildDonutOptions(theme: Theme, labels: string[]) {
  return {
    chart: {
      type: 'donut' as const,
      toolbar: { show: false },
    },
    labels,
    colors: chartColors,
    dataLabels: {
      enabled: false,
    },
    legend: {
      position: 'bottom' as const,
      labels: {
        colors: theme.palette.text.primary,
      },
    },
    plotOptions: {
      pie: {
        donut: {
          size: '68%',
        },
      },
    },
    tooltip: {
      theme: theme.palette.mode,
    },
  }
}

function buildAreaOptions(theme: Theme, labels: string[]) {
  return {
    chart: {
      type: 'area' as const,
      toolbar: { show: false },
      animations: { enabled: true, speed: 700 },
    },
    colors: ['#062A5B', '#ED1C24'],
    stroke: {
      curve: 'smooth' as const,
      width: 3,
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 0.4,
        opacityFrom: 0.28,
        opacityTo: 0.04,
        stops: [0, 90, 100],
      },
    },
    xaxis: {
      categories: labels,
      labels: {
        style: { colors: theme.palette.text.secondary },
      },
    },
    yaxis: {
      labels: {
        formatter: (value: number) => `${Math.round(value)}%`,
        style: { colors: theme.palette.text.secondary },
      },
    },
    grid: {
      borderColor: alpha(theme.palette.divider, 0.08),
      strokeDashArray: 4,
    },
    tooltip: {
      theme: theme.palette.mode,
    },
    legend: {
      position: 'top' as const,
      labels: {
        colors: theme.palette.text.primary,
      },
    },
  }
}
