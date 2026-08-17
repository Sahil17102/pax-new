import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Typography,
  alpha,
} from '@mui/material'
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { FiChevronDown, FiPlus, FiRefreshCw, FiTrash2 } from 'react-icons/fi'
import {
  FaBoxOpen,
  FaClipboardList,
  FaMapMarkedAlt,
  FaTruckLoading,
  FaUserAlt,
} from 'react-icons/fa'
import { useNavigate } from 'react-router-dom'
import { fetchAvailableCouriers, type Courier } from '../../../api/courier'
import { lookupPincodeLocation, normalizePincode } from '../../../api/locations'
import { toast } from '../../UI/Toast'
import { useCreateShipment } from '../../../hooks/Orders/useOrders'
import { usePickupAddresses } from '../../../hooks/Pickup/usePickupAddresses'
import { useKycVerification } from '../../../hooks/User/useKycVerification'
import type { HydratedPickup, IAddress } from '../../../types/generic.types'
import {
  B2C_MIN_CHARGEABLE_WEIGHT_GRAMS,
  B2C_MIN_CHARGEABLE_WEIGHT_KG,
} from '../../../utils/constants'

const ACCENT = '#3F4A9B'
const ACCENT_SOFT = '#EEF1FF'
const BORDER = 'rgba(63, 74, 155, 0.14)'
const TEXT_PRIMARY = '#16203B'
const TEXT_SECONDARY = '#667085'

const RETURN_REASONS = [
  'Damaged item',
  'Wrong item received',
  'Customer changed mind',
  'Quality issue',
  'Size or fit issue',
  'Replacement request',
]

const SUPPORTED_REVERSE_PROVIDERS = new Set(['delhivery', 'shadowfax', 'xpressbees', 'ekart'])

type ReverseItemForm = {
  name: string
  sku: string
  qty: string
  price: string
  discount: string
  tax_rate: string
  hsn: string
}

type ReverseFormState = {
  reverseOrderNumber: string
  returnRequestDate: string
  originalReference: string
  reason: string
  sellerReference: string
  notes: string
  containsFragile: boolean
  pickupDate: string
  pickupTime: string
  selectedPickupId: string
  preferredProvider: string
  customer: {
    name: string
    phone: string
    email: string
    pincode: string
    city: string
    state: string
    address: string
  }
  package: {
    weight: string
    length: string
    breadth: string
    height: string
  }
  items: ReverseItemForm[]
}

type ReverseCourierOption = Courier & {
  integration_type?: string | null
  integrationType?: string | null
  service_provider?: string | null
  serviceProvider?: string | null
  localRates?: {
    reverse_pickup?: {
      rate?: number | null
      total_charges_with_gst?: number | null
      total_charges?: number | null
      chargeable_weight?: number | null
      gst_percent?: number | null
      gst_amount?: number | null
      wallet_debit_amount?: number | null
    } | null
    rto?: {
      rate?: number | null
      total_charges_with_gst?: number | null
      total_charges?: number | null
      chargeable_weight?: number | null
      gst_percent?: number | null
      gst_amount?: number | null
      wallet_debit_amount?: number | null
    } | null
  } | null
  approxZone?: {
    id?: string
    code?: string
    name?: string
  } | null
}

const createEmptyItem = (): ReverseItemForm => ({
  name: '',
  sku: '',
  qty: '1',
  price: '0',
  discount: '0',
  tax_rate: '0',
  hsn: '',
})

const getTodayDate = () => new Date().toISOString().slice(0, 10)

const getDefaultPickupTime = () => {
  const now = new Date()
  now.setMinutes(Math.ceil(now.getMinutes() / 15) * 15)
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

const generateReverseOrderNumber = () => `REV-${Date.now()}`

const numberOrZero = (value: string | number | undefined | null) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const toKg = (grams: number) => grams / 1000

const formatWeight = (grams: number) => {
  if (!Number.isFinite(grams) || grams <= 0) return '-'
  if (grams < 1000) return `${Math.round(grams)} g`
  return `${(grams / 1000).toFixed(2)} kg`
}

const formatCurrency = (value: number | string | null | undefined) => `₹${Number(value || 0).toFixed(2)}`

const sectionStyles = {
  borderRadius: 3,
  border: `1px solid ${BORDER}`,
  backgroundColor: '#FFFFFF',
  boxShadow: '0 10px 30px rgba(15, 23, 42, 0.04)',
}

const fieldStyles = {
  '& .MuiOutlinedInput-root': {
    borderRadius: 1.5,
    backgroundColor: '#FFFFFF',
    minHeight: 40,
  },
  '& .MuiInputBase-input': {
    fontSize: '0.9rem',
  },
  '& .MuiFormHelperText-root': {
    mx: 0,
  },
}

const buildPickupLabel = (pickup: HydratedPickup) => {
  const address = pickup.pickup
  const primaryLabel = address.addressNickname || address.contactName || 'Return warehouse'
  return `${primaryLabel} - ${address.pincode || 'No pincode'}`
}

const buildAddressLine = (address?: IAddress | null) =>
  [address?.addressLine1, address?.addressLine2, address?.city, address?.state, address?.pincode]
    .filter(Boolean)
    .join(', ')

const getReturnAddress = (pickup?: HydratedPickup | null) => {
  if (!pickup) return null
  if (pickup.isRTOSame) return pickup.pickup
  return pickup.rto || pickup.pickup
}

const getProviderKey = (courier: Partial<ReverseCourierOption>) => {
  const candidates = [
    courier.integration_type,
    courier.integrationType,
    courier.service_provider,
    courier.serviceProvider,
    courier.name,
    courier.displayName,
  ]

  const normalized = candidates
    .map((value) => String(value || '').trim().toLowerCase())
    .find(Boolean)

  if (!normalized) return ''
  if (normalized.includes('shadowfax')) return 'shadowfax'
  if (normalized.includes('xpress')) return 'xpressbees'
  if (normalized.includes('ekart')) return 'ekart'
  if (normalized.includes('innofulfill') || normalized.includes('innofulfil')) return 'innofulfill'
  if (normalized.includes('delhivery')) return 'delhivery'
  return normalized
}

const getCourierOptionKey = (courier: Partial<ReverseCourierOption>) =>
  String(courier.courier_option_key || courier.id || courier.name || '')

const getReverseRate = (courier?: ReverseCourierOption | null) =>
  Number(
    courier?.localRates?.reverse_pickup?.rate ??
      courier?.localRates?.rto?.rate ??
      courier?.rate ??
      0,
  )

const getReverseWalletDebit = (courier?: ReverseCourierOption | null) =>
  Number(
    courier?.localRates?.reverse_pickup?.wallet_debit_amount ??
      courier?.localRates?.reverse_pickup?.total_charges_with_gst ??
      courier?.localRates?.rto?.wallet_debit_amount ??
      courier?.localRates?.rto?.total_charges_with_gst ??
      courier?.wallet_debit_amount ??
      courier?.total_charges_with_gst ??
      0,
  )

const getChargeableWeight = (courier?: ReverseCourierOption | null) =>
  Number(
    courier?.localRates?.reverse_pickup?.chargeable_weight ??
      courier?.localRates?.rto?.chargeable_weight ??
      courier?.chargeable_weight ??
      0,
  )

const sanitizeTagValue = (value: string) =>
  value.trim().replace(/,/g, ' ').replace(/\s+/g, '_').slice(0, 60)

const buildReverseTags = (form: ReverseFormState) => {
  const tags = ['reverse_pickup']

  if (form.reason.trim()) {
    tags.push(`reason=${sanitizeTagValue(form.reason)}`)
  }
  if (form.containsFragile) {
    tags.push('fragile_or_liquid')
  }
  if (form.originalReference.trim()) {
    tags.push(`original_reference=${sanitizeTagValue(form.originalReference)}`)
  }
  if (form.sellerReference.trim()) {
    tags.push(`merchant_reference=${sanitizeTagValue(form.sellerReference)}`)
  }

  return tags.join(',')
}

const SectionCard = ({
  title,
  icon,
  children,
}: {
  title: string
  icon: ReactNode
  children: ReactNode
}) => (
  <Paper elevation={0} sx={{ ...sectionStyles, p: { xs: 1.2, md: 1.35 } }}>
    <Stack spacing={1.2}>
      <Stack direction="row" spacing={1} alignItems="center">
        <Box sx={{ color: ACCENT, display: 'flex', alignItems: 'center' }}>{icon}</Box>
        <Typography sx={{ fontWeight: 800, color: TEXT_PRIMARY, fontSize: '0.94rem' }}>
          {title}
        </Typography>
      </Stack>
      {children}
    </Stack>
  </Paper>
)

type ReversePickupFormProps = {
  onSwitchToForward?: () => void
  onSwitchToReverse?: () => void
}

export default function ReversePickupForm({
  onSwitchToForward,
  onSwitchToReverse,
}: ReversePickupFormProps) {
  const navigate = useNavigate()
  const { checkKycBeforeAction } = useKycVerification()
  const createShipment = useCreateShipment(() => navigate('/orders/list?status=pending'))
  const { data: pickupResponse } = usePickupAddresses()

  const pickupAddresses = (pickupResponse?.pickupAddresses || []) as HydratedPickup[]
  const primaryPickup = pickupAddresses.find((address) => address.isPrimary) || pickupAddresses[0] || null

  const [form, setForm] = useState<ReverseFormState>({
    reverseOrderNumber: generateReverseOrderNumber(),
    returnRequestDate: getTodayDate(),
    originalReference: '',
    reason: '',
    sellerReference: '',
    notes: '',
    containsFragile: false,
    pickupDate: getTodayDate(),
    pickupTime: getDefaultPickupTime(),
    selectedPickupId: '',
    preferredProvider: '',
    customer: {
      name: '',
      phone: '',
      email: '',
      pincode: '',
      city: '',
      state: '',
      address: '',
    },
    package: {
      weight: '',
      length: '',
      breadth: '',
      height: '',
    },
    items: [createEmptyItem()],
  })
  const [formError, setFormError] = useState<string | null>(null)
  const [reverseOptionsOpen, setReverseOptionsOpen] = useState(false)
  const [reverseOptions, setReverseOptions] = useState<ReverseCourierOption[]>([])
  const [selectedCourierKey, setSelectedCourierKey] = useState('')
  const [loadingReverseOptions, setLoadingReverseOptions] = useState(false)

  useEffect(() => {
    if (!form.selectedPickupId && primaryPickup?.id) {
      setForm((prev) => ({ ...prev, selectedPickupId: primaryPickup.id }))
    }
  }, [form.selectedPickupId, primaryPickup])

  const quoteDependencyKey = [
    form.selectedPickupId,
    form.customer.pincode,
    form.customer.city,
    form.customer.state,
    form.customer.address,
    form.package.weight,
    form.package.length,
    form.package.breadth,
    form.package.height,
    form.preferredProvider,
    form.items
      .map((item) => `${item.name}:${item.qty}:${item.price}:${item.discount}`)
      .join('|'),
  ].join('::')

  useEffect(() => {
    setReverseOptions([])
    setSelectedCourierKey('')
    setReverseOptionsOpen(false)
    setFormError(null)
  }, [quoteDependencyKey])

  const normalizedCustomerPincode = normalizePincode(form.customer.pincode)

  useEffect(() => {
    if (!/^\d{6}$/.test(normalizedCustomerPincode)) return

    let active = true
    lookupPincodeLocation(normalizedCustomerPincode)
      .then((location) => {
        if (!active || !location) return
        setForm((prev) => ({
          ...prev,
          customer: {
            ...prev.customer,
            pincode: normalizedCustomerPincode,
            city: location.city || prev.customer.city,
            state: location.state || prev.customer.state,
          },
        }))
      })
      .catch(() => {})

    return () => {
      active = false
    }
  }, [normalizedCustomerPincode])

  const selectedPickup = useMemo(
    () => pickupAddresses.find((pickup) => pickup.id === form.selectedPickupId) || null,
    [pickupAddresses, form.selectedPickupId],
  )
  const returnAddress = getReturnAddress(selectedPickup)

  const actualWeightGrams = numberOrZero(form.package.weight)
  const volumetricWeightKg =
    (numberOrZero(form.package.length) *
      numberOrZero(form.package.breadth) *
      numberOrZero(form.package.height)) /
    5000
  const volumetricWeightGrams = Math.max(0, Math.round(volumetricWeightKg * 1000))
  const chargeableWeightGrams = Math.max(
    actualWeightGrams,
    volumetricWeightGrams,
    B2C_MIN_CHARGEABLE_WEIGHT_GRAMS,
  )

  const normalizedItems = useMemo(
    () =>
      form.items
        .map((item) => ({
          name: item.name.trim(),
          sku: item.sku.trim() || 'NA',
          qty: Math.max(0, numberOrZero(item.qty)),
          price: Math.max(0, numberOrZero(item.price)),
          discount: Math.max(0, numberOrZero(item.discount)),
          tax_rate: Math.max(0, numberOrZero(item.tax_rate)),
          hsn: item.hsn.trim(),
        }))
        .filter((item) => item.name.length > 0),
    [form.items],
  )

  const orderAmount = normalizedItems.reduce(
    (sum, item) => sum + item.price * item.qty - item.discount,
    0,
  )

  const selectedCourier = useMemo(
    () =>
      reverseOptions.find((courier) => getCourierOptionKey(courier) === selectedCourierKey) || null,
    [reverseOptions, selectedCourierKey],
  )

  const updateCustomer = (
    field: keyof ReverseFormState['customer'],
    value: string,
  ) => {
    setForm((prev) => ({
      ...prev,
      customer: {
        ...prev.customer,
        [field]: field === 'pincode' ? normalizePincode(value) : value,
      },
    }))
  }

  const updatePackage = (
    field: keyof ReverseFormState['package'],
    value: string,
  ) => {
    setForm((prev) => ({
      ...prev,
      package: {
        ...prev.package,
        [field]: value,
      },
    }))
  }

  const updateItem = (index: number, field: keyof ReverseItemForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, currentIndex) =>
        currentIndex === index ? { ...item, [field]: value } : item,
      ),
    }))
  }

  const addItem = () => {
    setForm((prev) => ({ ...prev, items: [...prev.items, createEmptyItem()] }))
  }

  const removeItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, itemIndex) => itemIndex !== index) : prev.items,
    }))
  }

  const validateBaseForm = () => {
    if (!form.reverseOrderNumber.trim()) return 'Reverse order number is required.'
    if (!form.returnRequestDate) return 'Return request date is required.'
    if (!form.customer.name.trim()) return 'Customer name is required.'
    if (!form.customer.phone.trim()) return 'Customer phone is required.'
    if (!/^\d{6}$/.test(normalizedCustomerPincode)) return 'Enter a valid 6-digit customer pincode.'
    if (!form.customer.city.trim()) return 'Customer city is required.'
    if (!form.customer.state.trim()) return 'Customer state is required.'
    if (!form.customer.address.trim()) return 'Customer address is required.'
    if (!selectedPickup || !returnAddress) return 'Select a return location before continuing.'
    if (actualWeightGrams <= 0) return 'Package weight is required.'
    if (numberOrZero(form.package.length) <= 0) return 'Package length is required.'
    if (numberOrZero(form.package.breadth) <= 0) return 'Package breadth is required.'
    if (numberOrZero(form.package.height) <= 0) return 'Package height is required.'
    if (!normalizedItems.length) return 'Add at least one return item.'
    const invalidItem = normalizedItems.find((item) => item.qty <= 0 || item.price < 0)
    if (invalidItem) return 'Each return item needs quantity greater than zero and a valid price.'
    return null
  }

  const fetchReverseCourierOptions = async () => {
    const validationError = validateBaseForm()
    if (validationError) {
      setFormError(validationError)
      return
    }

    if (!selectedPickup || !returnAddress) return

    setLoadingReverseOptions(true)
    setFormError(null)

    try {
      const response = (await fetchAvailableCouriers({
        origin: normalizedCustomerPincode,
        destination: String(returnAddress.pincode || ''),
        pickupName: form.customer.name.trim(),
        pickupAddress: form.customer.address.trim(),
        pickupCity: form.customer.city.trim(),
        pickupState: form.customer.state.trim(),
        deliveryName: returnAddress.contactName || returnAddress.addressNickname || 'Return Warehouse',
        deliveryPhone: returnAddress.contactPhone || '',
        deliveryAddress: buildAddressLine(returnAddress),
        deliveryCity: returnAddress.city || '',
        deliveryState: returnAddress.state || '',
        payment_type: 'reverse',
        order_amount: Math.max(orderAmount, 1),
        cod: 0,
        weight: actualWeightGrams,
        length: numberOrZero(form.package.length),
        breadth: numberOrZero(form.package.breadth),
        height: numberOrZero(form.package.height),
        shipment_type: 'b2c',
        isReverse: true,
        context: 'shipment_courier_selection',
      })) as ReverseCourierOption[]

      const filteredOptions = response
        .filter((courier) => SUPPORTED_REVERSE_PROVIDERS.has(getProviderKey(courier)))
        .filter((courier) =>
          form.preferredProvider ? getProviderKey(courier) === form.preferredProvider : true,
        )
        .sort((left, right) => getReverseWalletDebit(left) - getReverseWalletDebit(right))

      if (!filteredOptions.length) {
        setReverseOptionsOpen(true)
        setReverseOptions([])
        setSelectedCourierKey('')
        setFormError(
          form.preferredProvider
            ? `No reverse courier options are available for ${form.preferredProvider}. Try changing the preferred carrier.`
            : 'No reverse courier options are available for this route and package.',
        )
        return
      }

      setReverseOptions(filteredOptions)
      setSelectedCourierKey(getCourierOptionKey(filteredOptions[0]))
      setReverseOptionsOpen(true)
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch reverse pickup options.'
      setReverseOptionsOpen(true)
      setReverseOptions([])
      setSelectedCourierKey('')
      setFormError(message)
    } finally {
      setLoadingReverseOptions(false)
    }
  }

  const handleCreateReversePickup = () => {
    const validationError = validateBaseForm()
    if (validationError) {
      setFormError(validationError)
      return
    }

    if (!selectedCourier || !selectedPickup || !returnAddress) {
      setFormError('Choose a reverse courier before creating the shipment.')
      setReverseOptionsOpen(true)
      return
    }

    const providerKey = getProviderKey(selectedCourier)
    const reverseCharge = getReverseRate(selectedCourier)

    if (!providerKey) {
      setFormError('Selected reverse courier is missing a provider mapping.')
      return
    }

    if (!Number.isFinite(reverseCharge) || reverseCharge <= 0) {
      setFormError('Selected reverse courier does not have a valid reverse rate.')
      return
    }

    const payload = {
      order_number: form.reverseOrderNumber.trim(),
      payment_type: 'reverse' as const,
      order_amount: orderAmount,
      order_date: form.returnRequestDate,
      package_weight: actualWeightGrams,
      package_length: numberOrZero(form.package.length),
      package_breadth: numberOrZero(form.package.breadth),
      package_height: numberOrZero(form.package.height),
      shipping_charges: reverseCharge,
      freight_charges: reverseCharge,
      courier_cost: getReverseWalletDebit(selectedCourier) || reverseCharge,
      prepaid_amount: 0,
      is_rto_different: 'no' as const,
      discount: 0,
      integration_type: providerKey as
        | 'delhivery'
        | 'ekart'
        | 'shadowfax'
        | 'xpressbees'
        | 'innofulfill',
      transaction_fee: 0,
      gift_wrap: 0,
      courier_id: Number(selectedCourier.id),
      courier_partner: selectedCourier.displayName || selectedCourier.name,
      courier_option_key: getCourierOptionKey(selectedCourier),
      selected_max_slab_weight:
        selectedCourier.max_slab_weight !== undefined && selectedCourier.max_slab_weight !== null
          ? Number(selectedCourier.max_slab_weight)
          : undefined,
      pickup_date: form.pickupDate,
      pickup_time: form.pickupTime,
      pickup: {
        warehouse_name: form.customer.name.trim(),
        address: form.customer.address.trim(),
        name: form.customer.name.trim(),
        phone: form.customer.phone.trim(),
        city: form.customer.city.trim(),
        state: form.customer.state.trim(),
        pincode: normalizedCustomerPincode,
        pickup_date: form.pickupDate,
        pickup_time: form.pickupTime,
      },
      consignee: {
        name: returnAddress.contactName || returnAddress.addressNickname || 'Return Warehouse',
        address: buildAddressLine(returnAddress),
        city: returnAddress.city || '',
        state: returnAddress.state || '',
        pincode: String(returnAddress.pincode || ''),
        email: returnAddress.contactEmail || '',
        phone: returnAddress.contactPhone || '',
      },
      order_items: normalizedItems.map((item) => ({
        name: item.name,
        sku: item.sku,
        qty: item.qty,
        price: item.price,
        hsn: item.hsn,
        discount: item.discount,
        tax_rate: item.tax_rate,
      })),
      tags: buildReverseTags(form),
      delivery_location: selectedCourier.approxZone?.name || undefined,
      zone_id: selectedCourier.approxZone?.id || undefined,
      chargedWeight: getChargeableWeight(selectedCourier) || chargeableWeightGrams,
      volumetricWeight: Number(volumetricWeightKg.toFixed(3)),
    }

    setFormError(null)
    checkKycBeforeAction(() => {
      createShipment.mutate(payload as any, {
        onSuccess: () => {
          toast.open({
            message: 'Reverse pickup created successfully',
            severity: 'success',
          })
        },
      })
    })
  }

  if (!pickupAddresses.length) {
    return (
      <Stack spacing={2}>
        <Alert severity="warning" sx={{ borderRadius: 3 }}>
          Add at least one pickup or return address before creating a reverse pickup.
        </Alert>
        <Box>
          <Button
            variant="contained"
            sx={{ textTransform: 'none', fontWeight: 700 }}
            onClick={() => navigate('/settings/manage_pickups')}
          >
            Manage Pickup Addresses
          </Button>
        </Box>
      </Stack>
    )
  }

  return (
    <Stack
      spacing={1.4}
      sx={{
        height: '100%',
        minHeight: 0,
        overflow: 'auto',
        pr: { xs: 0, md: 0.2 },
      }}
    >
      <Box>
        <Stack
          direction={{ xs: 'column', lg: 'row' }}
          spacing={1}
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', lg: 'center' }}
        >
          <Box>
            <Typography sx={{ fontSize: '1rem', fontWeight: 800, color: TEXT_PRIMARY }}>
              Create Reverse Order
            </Typography>
            <Typography sx={{ color: TEXT_SECONDARY, mt: 0.35, fontSize: '0.83rem' }}>
              DTO flow: pickup from customer, then return to your selected warehouse.
            </Typography>
          </Box>

          <Stack
            direction="row"
            spacing={1}
            sx={{
              p: 0.45,
              borderRadius: 999,
              backgroundColor: '#F3F4FB',
              border: `1px solid ${alpha(ACCENT, 0.08)}`,
            }}
          >
            <Button
              variant="text"
              onClick={onSwitchToForward}
              sx={{
                textTransform: 'none',
                fontWeight: 700,
                borderRadius: 999,
                px: 2,
                color: TEXT_PRIMARY,
                minWidth: 0,
              }}
            >
              Forward Order
            </Button>
            <Button
              variant="contained"
              onClick={onSwitchToReverse}
              sx={{
                textTransform: 'none',
                fontWeight: 800,
                borderRadius: 999,
                px: 2,
                boxShadow: 'none',
                minWidth: 0,
              }}
            >
              Reverse Pickup
            </Button>
          </Stack>
        </Stack>
      </Box>

      {formError ? (
        <Alert severity="error" sx={{ borderRadius: 2.5 }}>
          {formError}
        </Alert>
      ) : null}

      <Grid container spacing={1.4} alignItems="flex-start">
        <Grid size={{ xs: 12, xl: 8 }}>
          <Stack spacing={1.4}>
            <SectionCard title="Reverse Order Details" icon={<FaClipboardList size={14} />}>
              <Grid container spacing={1}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="Reverse Order Number"
                    value={form.reverseOrderNumber}
                    required
                    fullWidth
                    size="small"
                    sx={fieldStyles}
                    helperText="Reverse order number is available."
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, reverseOrderNumber: event.target.value }))
                    }
                    InputProps={{
                      endAdornment: (
                        <IconButton
                          size="small"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              reverseOrderNumber: generateReverseOrderNumber(),
                            }))
                          }
                        >
                          <FiRefreshCw size={14} />
                        </IconButton>
                      ),
                    }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <TextField
                    label="Return Request Date"
                    type="date"
                    value={form.returnRequestDate}
                    required
                    fullWidth
                    size="small"
                    sx={fieldStyles}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, returnRequestDate: event.target.value }))
                    }
                    InputLabelProps={{ shrink: true }}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 3 }}>
                  <TextField
                    label="Reference Number / Original AWB"
                    value={form.originalReference}
                    fullWidth
                    size="small"
                    sx={fieldStyles}
                    helperText="Optional. Use the original shipment AWB or channel reference."
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, originalReference: event.target.value }))
                    }
                  />
                </Grid>
              </Grid>
            </SectionCard>

            <SectionCard title="Customer Pickup Details" icon={<FaUserAlt size={14} />}>
              <Grid container spacing={1}>
                <Grid size={{ xs: 12, md: 4, lg: 3 }}>
                  <TextField
                    label="Name"
                    required
                    fullWidth
                    size="small"
                    sx={fieldStyles}
                    value={form.customer.name}
                    onChange={(event) => updateCustomer('name', event.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4, lg: 3 }}>
                  <TextField
                    label="Phone"
                    required
                    fullWidth
                    size="small"
                    sx={fieldStyles}
                    value={form.customer.phone}
                    onChange={(event) => updateCustomer('phone', event.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4, lg: 3 }}>
                  <TextField
                    label="Email"
                    fullWidth
                    size="small"
                    sx={fieldStyles}
                    value={form.customer.email}
                    onChange={(event) => updateCustomer('email', event.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4, lg: 3 }}>
                  <TextField
                    label="Pincode"
                    required
                    fullWidth
                    size="small"
                    sx={fieldStyles}
                    value={form.customer.pincode}
                    onChange={(event) => updateCustomer('pincode', event.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4, lg: 3 }}>
                  <TextField
                    label="City"
                    required
                    fullWidth
                    size="small"
                    sx={fieldStyles}
                    value={form.customer.city}
                    onChange={(event) => updateCustomer('city', event.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 4, lg: 3 }}>
                  <TextField
                    label="State"
                    required
                    fullWidth
                    size="small"
                    sx={fieldStyles}
                    value={form.customer.state}
                    onChange={(event) => updateCustomer('state', event.target.value)}
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Address"
                    required
                    fullWidth
                    multiline
                    minRows={3}
                    sx={fieldStyles}
                    value={form.customer.address}
                    onChange={(event) => updateCustomer('address', event.target.value)}
                  />
                </Grid>
              </Grid>
            </SectionCard>

            <SectionCard title="Item Details" icon={<FaBoxOpen size={14} />}>
              <Stack spacing={1.1}>
                {form.items.map((item, index) => (
                  <Paper
                    key={`reverse-item-${index}`}
                    elevation={0}
                    sx={{
                      p: 1.2,
                      borderRadius: 2,
                      border: `1px solid ${alpha(ACCENT, 0.12)}`,
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <Stack spacing={1}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography sx={{ fontWeight: 800, fontSize: '0.88rem', color: TEXT_PRIMARY }}>
                          Return Item {index + 1}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={() => removeItem(index)}
                          disabled={form.items.length === 1}
                          sx={{
                            color: '#EF4444',
                            border: `1px solid ${alpha('#EF4444', 0.25)}`,
                            backgroundColor: alpha('#EF4444', 0.04),
                          }}
                        >
                          <FiTrash2 size={14} />
                        </IconButton>
                      </Stack>

                      <Grid container spacing={1}>
                        <Grid size={{ xs: 12, md: 3 }}>
                          <TextField
                            label="Name"
                            required
                            fullWidth
                            size="small"
                            sx={fieldStyles}
                            value={item.name}
                            onChange={(event) => updateItem(index, 'name', event.target.value)}
                          />
                        </Grid>
                        <Grid size={{ xs: 6, md: 1.5 }}>
                          <TextField
                            label="Price ₹"
                            required
                            fullWidth
                            size="small"
                            type="number"
                            sx={fieldStyles}
                            value={item.price}
                            onChange={(event) => updateItem(index, 'price', event.target.value)}
                          />
                        </Grid>
                        <Grid size={{ xs: 6, md: 1.5 }}>
                          <TextField
                            label="Quantity"
                            required
                            fullWidth
                            size="small"
                            type="number"
                            sx={fieldStyles}
                            value={item.qty}
                            onChange={(event) => updateItem(index, 'qty', event.target.value)}
                          />
                        </Grid>
                        <Grid size={{ xs: 6, md: 1.5 }}>
                          <TextField
                            label="Discount ₹"
                            fullWidth
                            size="small"
                            type="number"
                            sx={fieldStyles}
                            value={item.discount}
                            onChange={(event) => updateItem(index, 'discount', event.target.value)}
                          />
                        </Grid>
                        <Grid size={{ xs: 6, md: 1.5 }}>
                          <TextField
                            label="Tax Rate %"
                            fullWidth
                            size="small"
                            type="number"
                            sx={fieldStyles}
                            value={item.tax_rate}
                            onChange={(event) => updateItem(index, 'tax_rate', event.target.value)}
                          />
                        </Grid>
                        <Grid size={{ xs: 6, md: 1.5 }}>
                          <TextField
                            label="HSN Code"
                            fullWidth
                            size="small"
                            sx={fieldStyles}
                            value={item.hsn}
                            onChange={(event) => updateItem(index, 'hsn', event.target.value)}
                          />
                        </Grid>
                        <Grid size={{ xs: 6, md: 1.5 }}>
                          <TextField
                            label="SKU"
                            fullWidth
                            size="small"
                            sx={fieldStyles}
                            value={item.sku}
                            onChange={(event) => updateItem(index, 'sku', event.target.value)}
                          />
                        </Grid>
                      </Grid>
                    </Stack>
                  </Paper>
                ))}

                <Box>
                  <Button
                    variant="outlined"
                    startIcon={<FiPlus />}
                    onClick={addItem}
                    sx={{
                      borderRadius: 999,
                      textTransform: 'none',
                      fontWeight: 700,
                      borderColor: alpha(ACCENT, 0.35),
                      color: ACCENT,
                    }}
                  >
                    Add Return Item
                  </Button>
                </Box>

                <FormControlLabel
                  control={
                    <Checkbox
                      checked={form.containsFragile}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, containsFragile: event.target.checked }))
                      }
                    />
                  }
                  label="My package contains fragile or liquid items"
                />
              </Stack>
            </SectionCard>

            <SectionCard title="Other Details" icon={<FaTruckLoading size={14} />}>
              <Grid container spacing={1}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    select
                    label="Reason for Return"
                    fullWidth
                    size="small"
                    sx={fieldStyles}
                    value={form.reason}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, reason: event.target.value }))
                    }
                    helperText="Choose the return trigger."
                  >
                    <MenuItem value="">Select a reason</MenuItem>
                    {RETURN_REASONS.map((reason) => (
                      <MenuItem key={reason} value={reason}>
                        {reason}
                      </MenuItem>
                    ))}
                  </TextField>
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    label="Reference Number"
                    fullWidth
                    size="small"
                    sx={fieldStyles}
                    value={form.sellerReference}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, sellerReference: event.target.value }))
                    }
                    helperText="Original AWB or marketplace return reference."
                  />
                </Grid>
                <Grid size={{ xs: 12 }}>
                  <TextField
                    label="Notes for Field Executive"
                    fullWidth
                    multiline
                    minRows={4}
                    sx={fieldStyles}
                    value={form.notes}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, notes: event.target.value }))
                    }
                    helperText="Optional instructions for pickup handling."
                  />
                </Grid>
              </Grid>
            </SectionCard>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, xl: 4 }}>
          <Stack spacing={1.4} sx={{ position: { xl: 'sticky' }, top: { xl: 4 } }}>
            <SectionCard title="Return Location" icon={<FaMapMarkedAlt size={14} />}>
              <Stack spacing={1}>
                <TextField
                  select
                  label="Select Return Location"
                  value={form.selectedPickupId}
                  fullWidth
                  size="small"
                  sx={fieldStyles}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, selectedPickupId: event.target.value }))
                  }
                >
                  {pickupAddresses.map((pickup) => (
                    <MenuItem key={pickup.id} value={pickup.id}>
                      {buildPickupLabel(pickup)}
                    </MenuItem>
                  ))}
                </TextField>
                <Typography sx={{ fontSize: '0.75rem', color: TEXT_SECONDARY }}>
                  This is where the reverse shipment will be delivered.
                </Typography>

                {returnAddress ? (
                  <Paper
                    elevation={0}
                    sx={{
                      p: 1.2,
                      borderRadius: 2.2,
                      border: `1px solid ${alpha(ACCENT, 0.14)}`,
                      backgroundColor: alpha(ACCENT, 0.03),
                    }}
                  >
                    <Typography sx={{ fontWeight: 800, color: TEXT_PRIMARY }}>
                      {returnAddress.addressNickname || returnAddress.contactName || 'Return warehouse'}
                    </Typography>
                    <Typography sx={{ color: TEXT_SECONDARY, mt: 0.7, fontSize: '0.84rem' }}>
                      {buildAddressLine(returnAddress)}
                    </Typography>
                    <Typography sx={{ color: TEXT_SECONDARY, mt: 0.4, fontSize: '0.82rem' }}>
                      {returnAddress.contactName || 'Warehouse contact'} | {returnAddress.contactPhone || 'No phone'}
                    </Typography>
                  </Paper>
                ) : null}

                <Grid container spacing={1}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Preferred Pickup Date"
                      type="date"
                      fullWidth
                      size="small"
                      value={form.pickupDate}
                      sx={fieldStyles}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, pickupDate: event.target.value }))
                      }
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Preferred Pickup Time"
                      type="time"
                      fullWidth
                      size="small"
                      value={form.pickupTime}
                      sx={fieldStyles}
                      onChange={(event) =>
                        setForm((prev) => ({ ...prev, pickupTime: event.target.value }))
                      }
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </Grid>

                <Box
                  sx={{
                    p: 1.1,
                    borderRadius: 2,
                    border: `1px dashed ${alpha(ACCENT, 0.25)}`,
                    color: TEXT_SECONDARY,
                    fontSize: '0.8rem',
                  }}
                >
                  Reverse flow: courier picks up from the customer first, then delivers back to
                  this return location.
                </Box>
              </Stack>
            </SectionCard>

            <SectionCard title="Box Details" icon={<FaBoxOpen size={14} />}>
              <Stack spacing={1}>
                <Alert
                  severity="info"
                  sx={{
                    py: 0.15,
                    px: 0.8,
                    borderRadius: 2,
                    backgroundColor: alpha(ACCENT, 0.05),
                    border: `1px solid ${alpha(ACCENT, 0.14)}`,
                  }}
                >
                  Note: The minimum chargeable weight is {B2C_MIN_CHARGEABLE_WEIGHT_KG.toFixed(2)} Kg
                </Alert>

                <Grid container spacing={1}>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Weight (g)"
                      required
                      type="number"
                      fullWidth
                      size="small"
                      sx={fieldStyles}
                      value={form.package.weight}
                      onChange={(event) => updatePackage('weight', event.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Length (cm)"
                      required
                      type="number"
                      fullWidth
                      size="small"
                      sx={fieldStyles}
                      value={form.package.length}
                      onChange={(event) => updatePackage('length', event.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Breadth (cm)"
                      required
                      type="number"
                      fullWidth
                      size="small"
                      sx={fieldStyles}
                      value={form.package.breadth}
                      onChange={(event) => updatePackage('breadth', event.target.value)}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Height (cm)"
                      required
                      type="number"
                      fullWidth
                      size="small"
                      sx={fieldStyles}
                      value={form.package.height}
                      onChange={(event) => updatePackage('height', event.target.value)}
                    />
                  </Grid>
                </Grid>

                <Paper
                  elevation={0}
                  sx={{
                    p: 1.1,
                    borderRadius: 2.2,
                    border: `1px solid ${alpha(ACCENT, 0.14)}`,
                    backgroundColor: '#FFFFFF',
                  }}
                >
                  <Typography sx={{ fontWeight: 800, color: TEXT_PRIMARY, fontSize: '0.88rem' }}>
                    Package Weight Summary
                  </Typography>
                  <Typography sx={{ mt: 0.35, fontSize: '0.74rem', color: TEXT_SECONDARY }}>
                    Chargeable weight is calculated as max of actual, volumetric, or minimum
                    weight ({B2C_MIN_CHARGEABLE_WEIGHT_GRAMS} g)
                  </Typography>

                  <Grid container spacing={1} sx={{ mt: 0.3 }}>
                    {[
                      {
                        label: 'Actual Weight',
                        value: formatWeight(actualWeightGrams),
                        note: `${toKg(actualWeightGrams).toFixed(2)} kg`,
                      },
                      {
                        label: 'Volumetric Weight',
                        value: formatWeight(volumetricWeightGrams),
                        note: 'L×B×H ÷ 5000',
                      },
                      {
                        label: 'Chargeable Weight',
                        value: formatWeight(chargeableWeightGrams),
                        note:
                          chargeableWeightGrams === B2C_MIN_CHARGEABLE_WEIGHT_GRAMS
                            ? 'Minimum weight applied'
                            : 'Calculated for pricing',
                        accent: true,
                      },
                    ].map((summary) => (
                      <Grid key={summary.label} size={{ xs: 12, md: 4 }}>
                        <Paper
                          elevation={0}
                          sx={{
                            p: 1,
                            borderRadius: 2,
                            border: `1px solid ${alpha(ACCENT, summary.accent ? 0.35 : 0.12)}`,
                            backgroundColor: summary.accent ? ACCENT_SOFT : '#FFFFFF',
                            height: '100%',
                          }}
                        >
                          <Stack spacing={0.45}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                              <Typography
                                sx={{
                                  fontSize: '0.7rem',
                                  letterSpacing: '0.04em',
                                  textTransform: 'uppercase',
                                  fontWeight: 800,
                                  color: summary.accent ? ACCENT : TEXT_SECONDARY,
                                }}
                              >
                                {summary.label}
                              </Typography>
                              {summary.accent ? <Chip size="small" label="MIN" sx={{ height: 20 }} /> : null}
                            </Stack>
                            <Typography sx={{ fontWeight: 900, color: TEXT_PRIMARY, fontSize: '1rem' }}>
                              {summary.value}
                            </Typography>
                            <Typography sx={{ fontSize: '0.74rem', color: TEXT_SECONDARY }}>
                              {summary.note}
                            </Typography>
                          </Stack>
                        </Paper>
                      </Grid>
                    ))}
                  </Grid>
                </Paper>
              </Stack>
            </SectionCard>
          </Stack>
        </Grid>
      </Grid>

      <Accordion
        expanded={reverseOptionsOpen}
        onChange={(_, expanded) => setReverseOptionsOpen(expanded)}
        disableGutters
        sx={{
          ...sectionStyles,
          '&:before': { display: 'none' },
        }}
      >
        <AccordionSummary
          expandIcon={<FiChevronDown color={ACCENT} />}
          sx={{
            px: 1.4,
            minHeight: 48,
            backgroundColor: alpha(ACCENT, 0.03),
            '& .MuiAccordionSummary-content': {
              my: 1.1,
            },
          }}
        >
          <Stack spacing={0.2}>
            <Typography sx={{ fontWeight: 800, color: TEXT_PRIMARY }}>
              Reverse Pickup Details
            </Typography>
            <Typography sx={{ color: TEXT_SECONDARY, fontSize: '0.78rem' }}>
              Generate reverse courier options and complete the booking.
            </Typography>
          </Stack>
        </AccordionSummary>

        <AccordionDetails sx={{ px: 1.4, py: 1.3 }}>
          <Stack spacing={1.2}>
            <Grid container spacing={1}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  select
                  label="Preferred Reverse Carrier"
                  value={form.preferredProvider}
                  fullWidth
                  size="small"
                  sx={fieldStyles}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, preferredProvider: event.target.value }))
                  }
                >
                  <MenuItem value="">Best available</MenuItem>
                  <MenuItem value="innofulfill">Innofulfill</MenuItem>
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 8 }}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="flex-end"
                  spacing={1}
                  sx={{ height: '100%' }}
                >
                  <Button
                    variant="outlined"
                    startIcon={<FiRefreshCw />}
                    onClick={fetchReverseCourierOptions}
                    disabled={loadingReverseOptions}
                    sx={{ textTransform: 'none', fontWeight: 700, borderRadius: 2 }}
                  >
                    {loadingReverseOptions ? 'Refreshing...' : 'Refresh Reverse Options'}
                  </Button>
                  <Button
                    variant="contained"
                    onClick={handleCreateReversePickup}
                    disabled={
                      loadingReverseOptions ||
                      createShipment.isPending ||
                      !selectedCourier ||
                      reverseOptions.length === 0
                    }
                    sx={{ textTransform: 'none', fontWeight: 800, borderRadius: 2 }}
                  >
                    {createShipment.isPending ? 'Creating...' : 'Create Reverse Pickup'}
                  </Button>
                </Stack>
              </Grid>
            </Grid>

            {reverseOptions.length > 0 ? (
              <Grid container spacing={1}>
                {reverseOptions.map((courier) => {
                  const optionKey = getCourierOptionKey(courier)
                  const selected = optionKey === selectedCourierKey
                  const provider = getProviderKey(courier)
                  return (
                    <Grid key={optionKey} size={{ xs: 12, md: 6, xl: 4 }}>
                      <Paper
                        elevation={0}
                        onClick={() => setSelectedCourierKey(optionKey)}
                        sx={{
                          p: 1.25,
                          borderRadius: 2.3,
                          border: `1px solid ${alpha(ACCENT, selected ? 0.35 : 0.12)}`,
                          backgroundColor: selected ? ACCENT_SOFT : '#FFFFFF',
                          cursor: 'pointer',
                          transition: 'all 140ms ease',
                        }}
                      >
                        <Stack spacing={0.8}>
                          <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
                            <Box>
                              <Typography sx={{ fontWeight: 800, color: TEXT_PRIMARY }}>
                                {courier.displayName || courier.name || 'Reverse Courier'}
                              </Typography>
                              <Typography sx={{ fontSize: '0.76rem', color: TEXT_SECONDARY, mt: 0.2 }}>
                                {provider.toUpperCase()} • {courier.approxZone?.name || 'Rate card zone'}
                              </Typography>
                            </Box>
                            {selected ? <Chip size="small" color="primary" label="Selected" /> : null}
                          </Stack>

                          <Divider />

                          <Grid container spacing={0.8}>
                            <Grid size={{ xs: 6 }}>
                              <Typography sx={{ fontSize: '0.72rem', color: TEXT_SECONDARY }}>
                                Reverse Freight
                              </Typography>
                              <Typography sx={{ fontWeight: 800, color: TEXT_PRIMARY }}>
                                {formatCurrency(getReverseRate(courier))}
                              </Typography>
                            </Grid>
                            <Grid size={{ xs: 6 }}>
                              <Typography sx={{ fontSize: '0.72rem', color: TEXT_SECONDARY }}>
                                Wallet Debit
                              </Typography>
                              <Typography sx={{ fontWeight: 800, color: TEXT_PRIMARY }}>
                                {formatCurrency(getReverseWalletDebit(courier))}
                              </Typography>
                            </Grid>
                            <Grid size={{ xs: 6 }}>
                              <Typography sx={{ fontSize: '0.72rem', color: TEXT_SECONDARY }}>
                                Chargeable Weight
                              </Typography>
                              <Typography sx={{ fontWeight: 700, color: TEXT_PRIMARY }}>
                                {formatWeight(getChargeableWeight(courier))}
                              </Typography>
                            </Grid>
                            <Grid size={{ xs: 6 }}>
                              <Typography sx={{ fontSize: '0.72rem', color: TEXT_SECONDARY }}>
                                EDD
                              </Typography>
                              <Typography sx={{ fontWeight: 700, color: TEXT_PRIMARY }}>
                                {courier.edd || 'Live'}
                              </Typography>
                            </Grid>
                          </Grid>
                        </Stack>
                      </Paper>
                    </Grid>
                  )
                })}
              </Grid>
            ) : (
              <Typography sx={{ color: TEXT_SECONDARY, fontSize: '0.82rem' }}>
                Reverse courier options will appear here after you validate the form and continue.
              </Typography>
            )}
          </Stack>
        </AccordionDetails>
      </Accordion>

      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="contained"
          onClick={fetchReverseCourierOptions}
          disabled={loadingReverseOptions || createShipment.isPending}
          sx={{
            minWidth: 124,
            textTransform: 'none',
            fontWeight: 800,
            borderRadius: 999,
            px: 3,
            py: 1,
          }}
        >
          {loadingReverseOptions ? 'Loading...' : reverseOptionsOpen ? 'Refresh' : 'Next'}
        </Button>
      </Stack>
    </Stack>
  )
}
