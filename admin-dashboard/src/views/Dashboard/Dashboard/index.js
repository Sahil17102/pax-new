import {
  Badge,
  Box,
  Button,
  Container,
  Flex,
  Grid,
  Heading,
  HStack,
  Progress,
  SimpleGrid,
  Spinner,
  Stack,
  Text,
  VStack,
  useColorModeValue,
} from '@chakra-ui/react'
import {
  IconAlertTriangle,
  IconCheck,
  IconCoinRupee,
  IconMapPin,
  IconPackageExport,
  IconRefresh,
  IconTruck,
  IconUsers,
} from '@tabler/icons-react'
import MetricTile from 'components/Admin/MetricTile'
import PageHeader from 'components/Admin/PageHeader'
import Card from 'components/Card/Card'
import CardBody from 'components/Card/CardBody'
import CardHeader from 'components/Card/CardHeader'
import OrdersLineChart from 'components/Charts/OrdersLineChart'
import RevenueBarChart from 'components/Charts/RevenueBarChart'
import { useDashboardStats } from 'hooks/useDashboardStats'
import { useMemo } from 'react'
import { useHistory } from 'react-router-dom'
import { BRAND, brandGradient } from '../../../constants/brand'
import OpsAnalytics from '../../Ops/OpsAnalytics'

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0)

const toNum = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const toTitleCase = (value = '') =>
  String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())

function SectionCard({ title, subtitle, children, panelBg, borderColor, headerAction }) {
  const textPrimary = useColorModeValue('gray.800', 'gray.100')
  const textSecondary = useColorModeValue('gray.600', 'gray.400')

  return (
    <Card bg={panelBg} borderWidth="1px" borderColor={borderColor} borderRadius="18px" h="full">
      <CardHeader p={5} pb={children ? 2 : 5}>
        <Flex align="flex-start" justify="space-between" gap={3}>
          <Box>
            <Heading size="sm" color={textPrimary}>
              {title}
            </Heading>
            {subtitle ? (
              <Text fontSize="sm" color={textSecondary} mt={1}>
                {subtitle}
              </Text>
            ) : null}
          </Box>
          {headerAction}
        </Flex>
      </CardHeader>
      {children ? <CardBody p={5} pt={2}>{children}</CardBody> : null}
    </Card>
  )
}

function MetricInfoTile({ label, value, helper, tone = 'teal', panelBg, borderColor }) {
  const textPrimary = useColorModeValue('gray.800', 'gray.100')
  const textSecondary = useColorModeValue('gray.600', 'gray.400')
  const accentMap = {
    teal: 'rgba(6,42,91,0.10)',
    orange: 'rgba(237,28,36,0.10)',
    blue: 'rgba(62,106,168,0.12)',
    green: 'rgba(22,163,74,0.10)',
    red: 'rgba(239,68,68,0.10)',
  }

  return (
    <Box
      p={4}
      borderRadius="14px"
      borderWidth="1px"
      borderColor={borderColor}
      bg={panelBg}
      boxShadow="0 10px 30px rgba(15,23,42,0.04)"
    >
      <Box
        w="34px"
        h="34px"
        borderRadius="10px"
        bg={accentMap[tone] || accentMap.teal}
        mb={3}
      />
      <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" color={textSecondary} fontWeight="700">
        {label}
      </Text>
      <Text mt={1.5} fontSize="2xl" fontWeight="800" color={textPrimary}>
        {value}
      </Text>
      <Text mt={1} fontSize="sm" color={textSecondary}>
        {helper}
      </Text>
    </Box>
  )
}

export default function Dashboard() {
  const history = useHistory()
  const { data: statsData, isLoading, error, refetch, isRefetching } = useDashboardStats()

  const pageBg = useColorModeValue(
    brandGradient,
    'radial-gradient(circle at 100% 0%, rgba(62,106,168,0.12), transparent 28%), linear-gradient(180deg, #020D1F 0%, #041A38 48%, #020D1F 100%)',
  )
  const panelBg = useColorModeValue('white', '#101D36')
  const softPanelBg = useColorModeValue('rgba(238, 244, 251, 0.72)', 'rgba(134,168,211,0.08)')
  const borderColor = useColorModeValue('rgba(181,202,232,0.72)', 'rgba(134,168,211,0.2)')
  const textPrimary = useColorModeValue('gray.800', 'gray.100')
  const textSecondary = useColorModeValue('gray.600', 'gray.400')
  const tileBg = useColorModeValue('gray.50', 'rgba(148,163,184,0.1)')

  const stats = statsData?.data || {}
  const todayOps = stats.todayOperations || {}
  const financial = stats.financial || {}
  const operational = stats.operational || {}
  const alerts = stats.alerts || {}
  const couriers = stats.couriers || {}
  const geographic = stats.geographic || {}
  const users = stats.users || {}
  const charts = stats.charts || {}
  const orderStatusCounts = stats.orderStatusCounts || {}
  const recentOrders = stats.recentOrders || []
  const recentTickets = stats.recentTickets || []

  const topCouriers = useMemo(
    () =>
      Object.entries(couriers.performance || {})
        .map(([name, value]) => ({
          name,
          count: toNum(value?.count),
          deliveryRate: toNum(value?.deliveryRate),
          revenue: toNum(value?.revenue),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5),
    [couriers.performance],
  )

  const sellerMetrics = useMemo(
    () => [
      {
        label: 'Total sellers',
        value: toNum(users.total).toLocaleString(),
        helper: `${toNum(users.active).toLocaleString()} active in the last 30 days`,
        tone: 'teal',
      },
      {
        label: 'New today',
        value: toNum(users.today).toLocaleString(),
        helper: `${toNum(users.lastWeek).toLocaleString()} onboarded this week`,
        tone: 'blue',
      },
      {
        label: 'Very active',
        value: toNum(users.veryActive).toLocaleString(),
        helper: 'Sellers shipping in the last 7 days',
        tone: 'green',
      },
      {
        label: 'Pending KYC',
        value: toNum(users.pendingKyc || alerts.pendingKyc).toLocaleString(),
        helper: 'Accounts blocked in verification',
        tone: 'orange',
      },
    ],
    [alerts.pendingKyc, users],
  )

  const performanceMetrics = useMemo(
    () => [
      {
        label: 'Delivery success',
        value: toNum(operational.deliverySuccessRate),
        colorScheme: 'green',
      },
      {
        label: 'NDR rate',
        value: toNum(operational.ndrRate),
        colorScheme: 'orange',
      },
      {
        label: 'RTO rate',
        value: toNum(operational.rtoRate),
        colorScheme: 'red',
      },
    ],
    [operational],
  )

  const statusBreakdown = useMemo(
    () =>
      Object.entries(orderStatusCounts)
        .map(([status, count]) => ({
          status: toTitleCase(status),
          count: toNum(count),
          share:
            toNum(operational.totalOrders) > 0
              ? Math.round((toNum(count) / toNum(operational.totalOrders)) * 100)
              : 0,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6),
    [operational.totalOrders, orderStatusCounts],
  )

  const actionItems = useMemo(
    () => [
      {
        title: 'Open Tickets',
        value: toNum(alerts.openTickets),
        note: toNum(alerts.overdueTickets)
          ? `${toNum(alerts.overdueTickets)} overdue`
          : 'Support triage',
        route: '/admin/support',
        colorScheme: 'red',
      },
      {
        title: 'Pending KYC',
        value: toNum(alerts.pendingKyc),
        note: 'Verification queue',
        route: '/admin/users-management',
        colorScheme: 'orange',
      },
      {
        title: 'Weight Disputes',
        value: toNum(alerts.weightDiscrepancies),
        note: 'Review reconciliation',
        route: '/admin/weight-reconciliation',
        colorScheme: 'brand',
      },
    ],
    [alerts],
  )

  const insights = useMemo(() => {
    const notes = []

    if (toNum(operational.deliverySuccessRate) >= 90) {
      notes.push({
        tone: 'green.500',
        title: 'Delivery health is strong',
        note: `${toNum(operational.deliverySuccessRate)}% delivery success across the active order base.`,
      })
    } else {
      notes.push({
        tone: 'orange.500',
        title: 'Delivery health needs attention',
        note: `Success rate is ${toNum(operational.deliverySuccessRate)}%, so courier allocation and NDR handling should be reviewed.`,
      })
    }

    if (toNum(alerts.pendingKyc) > 0) {
      notes.push({
        tone: 'orange.500',
        title: 'Seller onboarding queue is building',
        note: `${toNum(alerts.pendingKyc)} seller accounts are waiting on KYC review.`,
      })
    }

    if (toNum(financial.codRemittanceDue) > 0) {
      notes.push({
        tone: 'blue.500',
        title: 'COD cash movement requires follow-up',
        note: `${formatCurrency(financial.codRemittanceDue)} is still pending remittance.`,
      })
    }

    if (toNum(todayOps.pending) > 0) {
      notes.push({
        tone: 'red.500',
        title: 'Today dispatch queue is still open',
        note: `${toNum(todayOps.pending)} orders placed today are still pending dispatch.`,
      })
    }

    return notes.slice(0, 4)
  }, [alerts.pendingKyc, financial.codRemittanceDue, operational.deliverySuccessRate, todayOps.pending])

  if (isLoading) {
    return (
      <Flex justify="center" align="center" minH="65vh">
        <VStack spacing={4}>
          <Spinner size="xl" color="brand.500" thickness="4px" />
          <Text color={textSecondary}>Loading dashboard...</Text>
        </VStack>
      </Flex>
    )
  }

  if (error) {
    return (
      <Flex justify="center" align="center" minH="65vh">
        <VStack spacing={3}>
          <Text color="red.500" fontWeight="700" fontSize="lg">
            Failed to load dashboard data
          </Text>
          <Button size="sm" onClick={() => refetch()} leftIcon={<IconRefresh size={16} />}>
            Retry
          </Button>
        </VStack>
      </Flex>
    )
  }

  return (
    <Box minH="100vh" pb={8} bg={pageBg}>
      <Container maxW="full" pt={0} px={{ base: 0, md: 6 }}>
        <Box mb={6}>
          <PageHeader
            eyebrow={`${BRAND.name} Admin`}
            title="Control tower for operations, support, sellers and revenue"
            description="The admin home now mirrors the richer seller-facing analytics experience, with a cleaner, more balanced layout for daily decision-making."
            meta={[
              { label: 'Today orders', value: toNum(todayOps.orders).toLocaleString() },
              { label: 'Active sellers', value: toNum(users.active).toLocaleString() },
              { label: 'Net revenue', value: formatCurrency(financial.totalRevenue) },
            ]}
            actions={
              <Stack direction={{ base: 'column', md: 'row' }} spacing={3} w="100%" justify={{ xl: 'flex-end' }}>
                <Button
                  size="sm"
                  leftIcon={isRefetching ? <Spinner size="sm" /> : <IconRefresh size={16} />}
                  isLoading={isRefetching}
                  onClick={() => refetch()}
                  bg="brand.500"
                  color="white"
                  borderRadius="14px"
                  px={5}
                  w={{ base: '100%', md: 'auto' }}
                  _hover={{ bg: 'brand.600' }}
                >
                  Refresh data
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  borderColor={borderColor}
                  borderRadius="14px"
                  w={{ base: '100%', md: 'auto' }}
                  onClick={() => history.push('/admin/orders')}
                >
                  View orders
                </Button>
              </Stack>
            }
          />
        </Box>

        <SimpleGrid columns={{ base: 1, md: 2, xl: 4 }} spacing={4} mb={6}>
          <MetricTile
            label="Today orders"
            value={toNum(todayOps.orders).toLocaleString()}
            muted={`${toNum(todayOps.pending)} of today's orders pending dispatch`}
            icon={<IconPackageExport size={18} />}
            accent="brand.500"
          />
          <MetricTile
            label="Delivery success"
            value={`${toNum(operational.deliverySuccessRate)}%`}
            muted={`${toNum(operational.deliveredOrders)} delivered out of ${toNum(operational.totalOrders)} orders`}
            icon={<IconCheck size={18} />}
            accent="green.500"
          />
          <MetricTile
            label="NDR rate"
            value={`${toNum(operational.ndrRate)}%`}
            muted={`${toNum(operational.ndrOrders)} active NDR orders`}
            icon={<IconAlertTriangle size={18} />}
            accent="orange.500"
          />
          <MetricTile
            label="Net revenue"
            value={formatCurrency(financial.totalRevenue)}
            muted={`Today ${formatCurrency(financial.todayRevenue)} | Freight - courier cost`}
            icon={<IconCoinRupee size={18} />}
            accent="secondary.500"
          />
        </SimpleGrid>

        <Grid templateColumns={{ base: '1fr', xl: '1.45fr 1fr' }} gap={6} mb={6}>
          <SectionCard
            title="Orders Trend (7 days)"
            subtitle="Shipment volume by day"
            panelBg={panelBg}
            borderColor={borderColor}
          >
            <Box h={{ base: '240px', md: '320px' }}>
              <OrdersLineChart data={charts.ordersByDate || []} />
            </Box>
          </SectionCard>

          <SectionCard
            title="Action Queue"
            subtitle="Operational items needing attention"
            panelBg={panelBg}
            borderColor={borderColor}
          >
            <VStack spacing={3} align="stretch">
              {actionItems.map((item) => (
                <Flex
                  key={item.title}
                  p={3.5}
                  borderRadius="12px"
                  borderWidth="1px"
                  borderColor={`${item.colorScheme}.200`}
                  bg={`${item.colorScheme}.50`}
                  justify="space-between"
                  align="center"
                  cursor="pointer"
                  onClick={() => history.push(item.route)}
                  _hover={{ transform: 'translateY(-1px)' }}
                  transition="all 0.2s"
                >
                  <Box>
                    <Text fontSize="sm" fontWeight="700" color={textPrimary}>
                      {item.title}
                    </Text>
                    <Text fontSize="xs" color={textSecondary}>
                      {item.note}
                    </Text>
                  </Box>
                  <Badge colorScheme={item.colorScheme} borderRadius="full">
                    {item.value}
                  </Badge>
                </Flex>
              ))}
            </VStack>
          </SectionCard>
        </Grid>

        <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6} mb={6}>
          <SectionCard
            title="Seller Analytics"
            subtitle="Mirror of the client-side seller summary, now visible for admins"
            panelBg={panelBg}
            borderColor={borderColor}
            headerAction={
              <Badge colorScheme="brand" variant="subtle" borderRadius="full" px={3} py={1}>
                <HStack spacing={1}>
                  <IconUsers size={14} />
                  <Text fontSize="xs" fontWeight="700">
                    {toNum(users.total).toLocaleString()} sellers
                  </Text>
                </HStack>
              </Badge>
            }
          >
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
              {sellerMetrics.map((metric) => (
                <MetricInfoTile
                  key={metric.label}
                  label={metric.label}
                  value={metric.value}
                  helper={metric.helper}
                  tone={metric.tone}
                  panelBg={softPanelBg}
                  borderColor={borderColor}
                />
              ))}
            </SimpleGrid>
          </SectionCard>

          <SectionCard
            title="Performance Metrics"
            subtitle="Operational health with the same quick-read rhythm as the client dashboard"
            panelBg={panelBg}
            borderColor={borderColor}
          >
            <VStack spacing={4} align="stretch">
              {performanceMetrics.map((metric) => (
                <Box key={metric.label}>
                  <HStack justify="space-between" mb={2}>
                    <Text fontSize="sm" color={textSecondary}>
                      {metric.label}
                    </Text>
                    <Text fontSize="sm" fontWeight="700" color={textPrimary}>
                      {metric.value}%
                    </Text>
                  </HStack>
                  <Progress
                    value={metric.value}
                    colorScheme={metric.colorScheme}
                    size="sm"
                    borderRadius="full"
                  />
                </Box>
              ))}
              <Box p={4} borderRadius="14px" borderWidth="1px" borderColor={borderColor} bg={tileBg}>
                <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.06em" color={textSecondary} fontWeight="700">
                  Average delivery time
                </Text>
                <Text mt={1.5} fontWeight="800" fontSize="2xl" color={textPrimary}>
                  {toNum(operational.avgDeliveryTime)} days
                </Text>
                <Text mt={1} fontSize="sm" color={textSecondary}>
                  Based on delivered shipments across the platform
                </Text>
              </Box>
            </VStack>
          </SectionCard>
        </Grid>

        <SectionCard
          title="Seller Ops Analytics"
          subtitle="The full zone, courier, pincode and RTO analytics stack is now visible directly on the admin dashboard."
          panelBg={panelBg}
          borderColor={borderColor}
        >
          <OpsAnalytics embedded />
        </SectionCard>

        <Box h={6} />

        <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6} mb={6}>
          <SectionCard
            title="Revenue Trend (7 days)"
            subtitle="Net revenue performance"
            panelBg={panelBg}
            borderColor={borderColor}
          >
            <Box h={{ base: '240px', md: '300px' }}>
              <RevenueBarChart data={charts.revenueByDate || []} />
            </Box>
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3} mt={4}>
              <Box p={3.5} borderRadius="12px" borderWidth="1px" borderColor={borderColor} bg={tileBg}>
                <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.45px" color={textSecondary} fontWeight="700">
                  COD Outstanding
                </Text>
                <Text mt={1} fontWeight="800" color={textPrimary}>
                  {formatCurrency(financial.codRemittanceDue)}
                </Text>
              </Box>
              <Box p={3.5} borderRadius="12px" borderWidth="1px" borderColor={borderColor} bg={tileBg}>
                <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.45px" color={textSecondary} fontWeight="700">
                  Total COD Value
                </Text>
                <Text mt={1} fontWeight="800" color={textPrimary}>
                  {formatCurrency(financial.codAmount)}
                </Text>
              </Box>
            </SimpleGrid>
          </SectionCard>

          <SectionCard
            title="Financial Health"
            subtitle="Core freight, cost and remittance signals"
            panelBg={panelBg}
            borderColor={borderColor}
          >
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <MetricInfoTile
                label="Shipping collected"
                value={formatCurrency(financial.totalShippingCharges)}
                helper="Seller-facing shipping charges"
                tone="teal"
                panelBg={softPanelBg}
                borderColor={borderColor}
              />
              <MetricInfoTile
                label="Freight billed"
                value={formatCurrency(financial.totalFreightCharges)}
                helper="Platform charges billed to sellers"
                tone="blue"
                panelBg={softPanelBg}
                borderColor={borderColor}
              />
              <MetricInfoTile
                label="Courier cost"
                value={formatCurrency(financial.totalCourierCosts)}
                helper="Actual payable to courier partners"
                tone="orange"
                panelBg={softPanelBg}
                borderColor={borderColor}
              />
              <MetricInfoTile
                label="Net margin / order"
                value={formatCurrency(
                  toNum(operational.totalOrders) > 0
                    ? toNum(financial.totalRevenue) / toNum(operational.totalOrders)
                    : 0,
                )}
                helper="Average revenue per order"
                tone="green"
                panelBg={softPanelBg}
                borderColor={borderColor}
              />
            </SimpleGrid>
          </SectionCard>
        </Grid>

        <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6} mb={6}>
          <SectionCard
            title="Today's Operations"
            subtitle="What moved today across the network"
            panelBg={panelBg}
            borderColor={borderColor}
          >
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              {[
                { label: 'Orders created', value: todayOps.orders, helper: 'New orders today', tone: 'teal' },
                { label: 'Pending dispatch', value: todayOps.pending, helper: 'Orders waiting to be processed', tone: 'orange' },
                { label: 'In transit', value: todayOps.inTransit, helper: 'Currently moving shipments', tone: 'blue' },
                { label: 'Delivered today', value: todayOps.delivered, helper: 'Orders closed successfully today', tone: 'green' },
              ].map((item) => (
                <MetricInfoTile
                  key={item.label}
                  label={item.label}
                  value={toNum(item.value).toLocaleString()}
                  helper={item.helper}
                  tone={item.tone}
                  panelBg={softPanelBg}
                  borderColor={borderColor}
                />
              ))}
            </SimpleGrid>
          </SectionCard>

          <SectionCard
            title="Order Status Snapshot"
            subtitle="Status distribution for the whole order base"
            panelBg={panelBg}
            borderColor={borderColor}
          >
            <VStack spacing={3} align="stretch">
              {statusBreakdown.length === 0 ? (
                <Text fontSize="sm" color={textSecondary}>
                  No order status data available.
                </Text>
              ) : (
                statusBreakdown.map((item) => (
                  <Box key={item.status} p={3.5} borderRadius="12px" borderWidth="1px" borderColor={borderColor} bg={tileBg}>
                    <HStack justify="space-between" mb={2}>
                      <Text fontSize="sm" fontWeight="700" color={textPrimary}>
                        {item.status}
                      </Text>
                      <Text fontSize="sm" color={textSecondary}>
                        {item.count} orders
                      </Text>
                    </HStack>
                    <Progress value={item.share} colorScheme="brand" size="sm" borderRadius="full" />
                    <Text mt={2} fontSize="xs" color={textSecondary}>
                      {item.share}% of all orders
                    </Text>
                  </Box>
                ))
              )}
            </VStack>
          </SectionCard>
        </Grid>

        <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6} mb={6}>
          <SectionCard
            title="Courier Snapshot"
            subtitle="Top couriers by volume and revenue contribution"
            panelBg={panelBg}
            borderColor={borderColor}
            headerAction={
              <Badge colorScheme="accent" variant="subtle" borderRadius="full" px={3} py={1}>
                <HStack spacing={1}>
                  <IconTruck size={14} />
                  <Text fontSize="xs" fontWeight="700">
                    {topCouriers.length} couriers tracked
                  </Text>
                </HStack>
              </Badge>
            }
          >
            <VStack spacing={3} align="stretch">
              {topCouriers.length === 0 ? (
                <Text fontSize="sm" color={textSecondary}>
                  No courier data available.
                </Text>
              ) : (
                topCouriers.map((courier, index) => (
                  <Box key={courier.name} p={3.5} borderRadius="12px" borderWidth="1px" borderColor={borderColor} bg={tileBg}>
                    <HStack justify="space-between" mb={2}>
                      <HStack spacing={2}>
                        <Badge borderRadius="full">{index + 1}</Badge>
                        <Text fontSize="sm" fontWeight="700" color={textPrimary}>
                          {courier.name}
                        </Text>
                      </HStack>
                      <Text fontSize="sm" color={textSecondary}>
                        {courier.count} orders
                      </Text>
                    </HStack>
                    <HStack justify="space-between" mb={2}>
                      <Text fontSize="xs" color={textSecondary}>
                        Delivery Rate
                      </Text>
                      <Text fontSize="xs" color={textSecondary}>
                        {courier.deliveryRate}%
                      </Text>
                    </HStack>
                    <Progress size="sm" borderRadius="full" value={courier.deliveryRate} colorScheme="green" mb={2} />
                    <Text fontSize="xs" color={textSecondary}>
                      Revenue: {formatCurrency(courier.revenue)}
                    </Text>
                  </Box>
                ))
              )}
            </VStack>
          </SectionCard>

          <SectionCard
            title="Recent Activity"
            subtitle="Latest orders and support events in one place"
            panelBg={panelBg}
            borderColor={borderColor}
          >
            <VStack spacing={3} align="stretch">
              {recentOrders.slice(0, 4).map((order, index) => {
                const label =
                  order.order_number ||
                  order.orderNumber ||
                  order.awb ||
                  order.awb_number ||
                  `Order ${index + 1}`
                const status = toTitleCase(order.order_status || order.orderStatus || 'Unknown')
                const courier = order.courier_partner || order.courierPartner || 'Courier pending'

                return (
                  <Box key={`${label}-${index}`} p={3.5} borderRadius="12px" borderWidth="1px" borderColor={borderColor} bg={tileBg}>
                    <HStack justify="space-between" mb={1.5}>
                      <Text fontSize="sm" fontWeight="700" color={textPrimary}>
                        {label}
                      </Text>
                      <Badge colorScheme="brand" borderRadius="full">
                        {status}
                      </Badge>
                    </HStack>
                    <Text fontSize="xs" color={textSecondary}>
                      {courier}
                    </Text>
                  </Box>
                )
              })}

              {recentTickets.slice(0, 2).map((ticket, index) => (
                <Box
                  key={`ticket-${ticket.id || index}`}
                  p={3.5}
                  borderRadius="12px"
                  borderWidth="1px"
                  borderColor="orange.200"
                  bg="orange.50"
                >
                  <HStack justify="space-between" mb={1.5}>
                    <Text fontSize="sm" fontWeight="700" color={textPrimary}>
                      {ticket.subject || `Support Ticket ${index + 1}`}
                    </Text>
                    <Badge colorScheme="orange" borderRadius="full">
                      {toTitleCase(ticket.status || 'Open')}
                    </Badge>
                  </HStack>
                  <Text fontSize="xs" color={textSecondary}>
                    {ticket.category ? `${toTitleCase(ticket.category)} issue` : 'Support request'}
                  </Text>
                </Box>
              ))}

              {recentOrders.length === 0 && recentTickets.length === 0 ? (
                <Text fontSize="sm" color={textSecondary}>
                  No recent activity available.
                </Text>
              ) : null}
            </VStack>
          </SectionCard>
        </Grid>

        <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6} mb={6}>
          <SectionCard
            title="Insights & Watchouts"
            subtitle="Auto-summarised platform signals for the day"
            panelBg={panelBg}
            borderColor={borderColor}
          >
            <VStack spacing={3} align="stretch">
              {insights.map((item) => (
                <Box key={item.title} p={3.5} borderRadius="12px" borderWidth="1px" borderColor={borderColor} bg={tileBg}>
                  <Text fontSize="sm" fontWeight="700" color={item.tone}>
                    {item.title}
                  </Text>
                  <Text mt={1} fontSize="sm" color={textSecondary}>
                    {item.note}
                  </Text>
                </Box>
              ))}
            </VStack>
          </SectionCard>

          <SectionCard
            title="Network Summary"
            subtitle="Cross-functional snapshot for support, sellers and shipments"
            panelBg={panelBg}
            borderColor={borderColor}
          >
            <SimpleGrid columns={{ base: 1, md: 2 }} spacing={3}>
              <MetricInfoTile
                label="Overdue tickets"
                value={toNum(alerts.overdueTickets).toLocaleString()}
                helper="Support cases past due date"
                tone="red"
                panelBg={softPanelBg}
                borderColor={borderColor}
              />
              <MetricInfoTile
                label="Weight disputes"
                value={toNum(alerts.weightDiscrepancies).toLocaleString()}
                helper="Shipment audits awaiting review"
                tone="orange"
                panelBg={softPanelBg}
                borderColor={borderColor}
              />
              <MetricInfoTile
                label="NDR orders"
                value={toNum(operational.ndrOrders).toLocaleString()}
                helper="Orders in delivery exception"
                tone="blue"
                panelBg={softPanelBg}
                borderColor={borderColor}
              />
              <MetricInfoTile
                label="RTO orders"
                value={toNum(operational.rtoOrders).toLocaleString()}
                helper="Returned-to-origin cases"
                tone="teal"
                panelBg={softPanelBg}
                borderColor={borderColor}
              />
            </SimpleGrid>
          </SectionCard>
        </Grid>

        <Grid templateColumns={{ base: '1fr', xl: '1fr 1fr' }} gap={6}>
          <SectionCard
            title="Origin Hotspots"
            subtitle="Pickup cities generating the most shipments"
            panelBg={panelBg}
            borderColor={borderColor}
          >
            <Stack spacing={2.5}>
              {(geographic.topOriginCities || []).length === 0 ? (
                <Text fontSize="sm" color={textSecondary}>
                  No origin city data yet.
                </Text>
              ) : (
                (geographic.topOriginCities || []).slice(0, 5).map((item) => (
                  <HStack
                    key={`origin-${item.city}`}
                    justify="space-between"
                    p={3}
                    borderRadius="10px"
                    borderWidth="1px"
                    borderColor={borderColor}
                    bg={tileBg}
                  >
                    <HStack spacing={2}>
                      <IconMapPin size={16} color={BRAND.colors.teal} />
                      <Text color={textPrimary} fontSize="sm">
                        {item.city}
                      </Text>
                    </HStack>
                    <Badge>{toNum(item.count)}</Badge>
                  </HStack>
                ))
              )}
            </Stack>
          </SectionCard>

          <SectionCard
            title="Destination Hotspots"
            subtitle="Top destination cities from the shipment mix"
            panelBg={panelBg}
            borderColor={borderColor}
          >
            <Stack spacing={2.5}>
              {(geographic.topDestinationCities || []).length === 0 ? (
                <Text fontSize="sm" color={textSecondary}>
                  No destination city data yet.
                </Text>
              ) : (
                (geographic.topDestinationCities || []).slice(0, 5).map((item) => (
                  <HStack
                    key={`dest-${item.city}`}
                    justify="space-between"
                    p={3}
                    borderRadius="10px"
                    borderWidth="1px"
                    borderColor={borderColor}
                    bg={tileBg}
                  >
                    <HStack spacing={2}>
                      <IconMapPin size={16} color={BRAND.colors.orange} />
                      <Text color={textPrimary} fontSize="sm">
                        {item.city}
                      </Text>
                    </HStack>
                    <Badge>{toNum(item.count)}</Badge>
                  </HStack>
                ))
              )}
            </Stack>
          </SectionCard>
        </Grid>
      </Container>
    </Box>
  )
}
