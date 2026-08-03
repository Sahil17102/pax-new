import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  DialogActions,
  Divider,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  alpha,
} from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import Papa from 'papaparse'
import { useMemo, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { FiDownload, FiUploadCloud } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { type Courier } from '../../../api/courier'
import {
  checkOrderNumberAvailability,
  createBulkShipments,
  type CreateShipmentParams,
} from '../../../api/order.service'
import { useAvailableCouriersMutation } from '../../../hooks/Integrations/useCouriers'
import { usePickupAddresses } from '../../../hooks/Pickup/usePickupAddresses'
import type { HydratedPickup } from '../../../types/generic.types'
import AddPickupAddressForm from '../../pickups/AddPickupAddressForm'
import CustomDrawer from '../../UI/drawer/CustomDrawer'
import { toast } from '../../UI/Toast'

const ACCENT = '#062A5B'
const TEXT_PRIMARY = '#17171A'
const TEXT_MUTED = '#5B7094'

type CsvRow = Record<string, string>

type BulkLineItem = {
  name: string
  sku: string
  hsnCode: string
  price: number
  quantity: number
  discount: number
  taxRate: number
}

type BulkUploadRow = {
  rowNumber: number
  warehouseName: string
  pickupDate: string
  pickupTime: string
  orderId: string
  orderDate: string
  buyerName: string
  buyerPhone: string
  buyerEmail: string
  address: string
  address2: string
  city: string
  state: string
  pincode: string
  orderType: 'cod' | 'prepaid'
  products: BulkLineItem[]
  weight: number
  length: number
  breadth: number
  height: number
  shippingCharges: number
  prepaidAmount: number
  giftWrap: number
  transactionFee: number
  orderDiscount: number
  matchedPickup: HydratedPickup | null
  validationError: string | null
  orderIdError: string | null
  availableCouriers: CourierSelection[]
  selectedCourier: CourierSelection | null
  courierError: string | null
  importStatus: 'pending' | 'ready' | 'created' | 'failed'
  importMessage: string | null
}

type EditableBulkLineItem = {
  name: string
  sku: string
  hsnCode: string
  price: string
  quantity: string
  discount: string
  taxRate: string
}

type EditableBulkUploadRow = {
  warehouseName: string
  pickupDate: string
  pickupTime: string
  orderId: string
  orderDate: string
  buyerName: string
  buyerPhone: string
  buyerEmail: string
  address: string
  address2: string
  city: string
  state: string
  pincode: string
  orderType: 'cod' | 'prepaid'
  products: EditableBulkLineItem[]
  weight: string
  length: string
  breadth: string
  height: string
  shippingCharges: string
  prepaidAmount: string
  giftWrap: string
  transactionFee: string
  orderDiscount: string
}

type CourierSelection = {
  id: number
  name: string
  integrationType?: string | null
  courierOptionKey?: string | null
  shadowfaxForwardMode?: 'marketplace' | 'warehouse' | null
  shadowfaxServiceMode?: 'regular' | 'surface' | null
  rate?: number | null
  courierCostEstimate?: number | null
  displayPrice?: number | null
  codCharges?: number | null
  otherCharges?: number | null
  chargeableWeight?: number | null
  volumetricWeight?: number | null
  slabs?: number | null
  maxSlabWeight?: number | null
  zoneId?: string | null
  zoneName?: string | null
}

const sampleRows = [
  {
    warehouse_name: 'Pax Logistics Jaipur Hub',
    pickup_date: new Date().toISOString().split('T')[0],
    pickup_time: '10:00',
    order_id: 'B2C-1001',
    order_date: new Date().toISOString().split('T')[0],
    buyer_name: 'Rohit Sharma',
    buyer_phone: '9876543210',
    buyer_email: 'rohit@example.com',
    address: '221, Green Residency, MG Road',
    address_2: 'Near Metro Station',
    city: 'Jaipur',
    state: 'Rajasthan',
    pincode: '302017',
    order_type: 'prepaid',
    product_1_name: 'Cotton T-Shirt',
    product_1_sku: 'TSHIRT-001',
    product_1_hsn_code: '61091000',
    product_1_price: '799',
    product_1_quantity: '1',
    product_1_discount: '0',
    product_1_tax_rate: '5',
    product_2_name: 'Blue Cap',
    product_2_sku: 'CAP-002',
    product_2_hsn_code: '65050090',
    product_2_price: '299',
    product_2_quantity: '1',
    product_2_discount: '0',
    product_2_tax_rate: '12',
    weight: '500',
    length: '22',
    breadth: '18',
    height: '3',
    shipping_charges: '0',
    prepaid_amount: '799',
    gift_wrap: '0',
    transaction_fee: '0',
    order_discount: '0',
  },
]

const parseNumber = (value: string | number | undefined, fallback = 0) => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback
  if (typeof value !== 'string') return fallback
  const normalized = value.trim()
  if (!normalized) return fallback
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : fallback
}

const cleanText = (value: unknown) => String(value ?? '').trim()

const getPickupLabel = (pickup: HydratedPickup) =>
  cleanText(pickup.pickup?.addressNickname || pickup.pickup?.contactName || pickup.pickupId)

const normalizeWarehouseName = (value: string) => cleanText(value).toLowerCase()

const getProductFieldValue = (
  row: CsvRow,
  index: number,
  field: 'name' | 'sku' | 'hsn_code' | 'price' | 'quantity' | 'discount' | 'tax_rate',
) => {
  const indexedKey = `product_${index}_${field}`
  if (cleanText(row[indexedKey])) return cleanText(row[indexedKey])

  if (index === 1) {
    const fallbackKeyMap: Record<typeof field, string> = {
      name: 'product_name',
      sku: 'sku',
      hsn_code: 'hsn_code',
      price: 'product_price',
      quantity: 'quantity',
      discount: 'product_discount',
      tax_rate: 'tax_rate',
    }
    return cleanText(row[fallbackKeyMap[field]])
  }

  return ''
}

const extractProductsFromCsv = (row: CsvRow): BulkLineItem[] => {
  const indexedKeys = Object.keys(row)
    .map((key) => {
      const match = key.match(
        /^product_(\d+)_(name|sku|hsn_code|price|quantity|discount|tax_rate)$/i,
      )
      return match ? Number(match[1]) : null
    })
    .filter((value): value is number => value !== null)

  const maxIndex = indexedKeys.length ? Math.max(...indexedKeys) : 1
  const products: BulkLineItem[] = []

  for (let index = 1; index <= maxIndex; index += 1) {
    const name = getProductFieldValue(row, index, 'name')
    const sku = getProductFieldValue(row, index, 'sku')
    const hsnCode = getProductFieldValue(row, index, 'hsn_code')
    const price = parseNumber(getProductFieldValue(row, index, 'price'))
    const quantity = Math.max(parseNumber(getProductFieldValue(row, index, 'quantity'), 1), 1)
    const discount = parseNumber(getProductFieldValue(row, index, 'discount'))
    const taxRate = parseNumber(getProductFieldValue(row, index, 'tax_rate'))

    const hasAnyValue = [name, sku, hsnCode].some(Boolean) || price > 0 || discount > 0
    if (!hasAnyValue) continue

    products.push({
      name,
      sku,
      hsnCode,
      price,
      quantity,
      discount,
      taxRate,
    })
  }

  return products
}

const getProductsSubtotal = (products: BulkLineItem[]) =>
  products.reduce((sum, product) => sum + product.price * product.quantity - product.discount, 0)

const getProductsSummary = (products: BulkLineItem[]) =>
  products
    .map((product) => {
      const qty = product.quantity > 1 ? ` x${product.quantity}` : ''
      return `${product.name || 'Unnamed item'}${qty}`
    })
    .join(', ')

const findPickupByWarehouseName = (warehouseName: string, pickupAddresses: HydratedPickup[]) => {
  const normalizedWarehouseName = normalizeWarehouseName(warehouseName)
  if (!normalizedWarehouseName) return null

  return (
    pickupAddresses.find(
      (pickup) => normalizeWarehouseName(getPickupLabel(pickup)) === normalizedWarehouseName,
    ) ?? null
  )
}

const normalizeCsvRow = (
  row: CsvRow,
  index: number,
  pickupAddresses: HydratedPickup[],
): BulkUploadRow => {
  const orderType = cleanText(row.order_type).toLowerCase() === 'cod' ? 'cod' : 'prepaid'
  const warehouseName = cleanText(row.warehouse_name || row.pickup_address || row.pickup_location)
  const matchedPickup = findPickupByWarehouseName(warehouseName, pickupAddresses)
  const products = extractProductsFromCsv(row)
  const normalized: BulkUploadRow = {
    rowNumber: index + 2,
    warehouseName,
    pickupDate: cleanText(row.pickup_date) || new Date().toISOString().split('T')[0],
    pickupTime: cleanText(row.pickup_time) || '10:00',
    orderId: cleanText(row.order_id || row.order_number),
    orderDate: cleanText(row.order_date) || new Date().toISOString().split('T')[0],
    buyerName: cleanText(row.buyer_name),
    buyerPhone: cleanText(row.buyer_phone),
    buyerEmail: cleanText(row.buyer_email),
    address: cleanText(row.address),
    address2: cleanText(row.address_2),
    city: cleanText(row.city),
    state: cleanText(row.state),
    pincode: cleanText(row.pincode),
    orderType,
    products,
    weight: parseNumber(row.weight),
    length: parseNumber(row.length),
    breadth: parseNumber(row.breadth),
    height: parseNumber(row.height),
    shippingCharges: parseNumber(row.shipping_charges),
    prepaidAmount: parseNumber(row.prepaid_amount),
    giftWrap: parseNumber(row.gift_wrap),
    transactionFee: parseNumber(row.transaction_fee),
    orderDiscount: parseNumber(row.order_discount),
    matchedPickup,
    validationError: null,
    orderIdError: null,
    availableCouriers: [],
    selectedCourier: null,
    courierError: null,
    importStatus: 'pending',
    importMessage: null,
  }

  const errors: string[] = []
  if (!normalized.warehouseName) errors.push('missing warehouse_name')
  if (normalized.warehouseName && !matchedPickup) {
    errors.push('warehouse_name does not match any added warehouse')
  }
  if (!normalized.pickupDate) errors.push('missing pickup_date')
  if (!normalized.pickupTime) errors.push('missing pickup_time')
  if (!normalized.orderId) errors.push('missing order ID')
  if (!normalized.buyerName) errors.push('missing buyer name')
  if (!/^\d{10,15}$/.test(normalized.buyerPhone)) errors.push('buyer phone should be 10-15 digits')
  if (!normalized.address) errors.push('missing address')
  if (!normalized.city) errors.push('missing city')
  if (!normalized.state) errors.push('missing state')
  if (!/^\d{6}$/.test(normalized.pincode)) errors.push('pincode should be 6 digits')
  if (!normalized.products.length) {
    errors.push(
      'add at least one product using columns like product_1_name, product_1_price, product_1_quantity',
    )
  }
  normalized.products.forEach((product, productIndex) => {
    const label = `product ${productIndex + 1}`
    if (!product.name) errors.push(`${label} name is missing`)
    if (product.price <= 0) errors.push(`${label} price should be greater than 0`)
    if (product.quantity <= 0) errors.push(`${label} quantity should be greater than 0`)
  })
  if (normalized.weight <= 0) errors.push('weight should be greater than 0')
  if (normalized.length <= 0 || normalized.breadth <= 0 || normalized.height <= 0) {
    errors.push('package dimensions should be greater than 0')
  }
  if (normalized.orderType === 'prepaid' && normalized.prepaidAmount <= 0) {
    errors.push('prepaid amount should be greater than 0 for prepaid orders')
  }

  normalized.validationError = errors.length
    ? `Row ${normalized.rowNumber}: ${errors.join(', ')}`
    : null
  return normalized
}

const getCourierForwardRate = (courier: Courier & Record<string, unknown>) =>
  parseNumber(
    (courier.rate ??
      (courier.localRates as { forward?: { rate?: number | string } } | undefined)?.forward
        ?.rate) as number | string | undefined,
    0,
  )

const buildCourierSelection = (courier: Courier & Record<string, unknown>): CourierSelection => ({
  id: Number(courier.id ?? courier.courier_id ?? 0),
  name: String(courier.displayName || courier.name || 'Courier'),
  integrationType:
    String(
      courier.integration_type || courier.serviceProvider || courier.service_provider || '',
    ).trim() || null,
  courierOptionKey: String(courier.courier_option_key || '').trim() || null,
  shadowfaxForwardMode:
    (String(
      (courier as { provider_serviceability?: { mode?: string; shipping_mode?: string } })
        .provider_serviceability?.mode ||
        (courier as { provider_serviceability?: { mode?: string; shipping_mode?: string } })
          .provider_serviceability?.shipping_mode ||
        courier.mode ||
        '',
    )
      .trim()
      .toLowerCase() as 'marketplace' | 'warehouse') || null,
  shadowfaxServiceMode:
    (String(
      (courier as { provider_serviceability?: { service_mode?: string } }).provider_serviceability
        ?.service_mode ||
        courier.service_mode ||
        '',
    )
      .trim()
      .toLowerCase() as 'regular' | 'surface') || null,
  rate: getCourierForwardRate(courier),
  courierCostEstimate: parseNumber(
    (courier.courier_cost_estimate ??
      (courier as { rateEstimate?: number | string }).rateEstimate ??
      (courier as { freight_charges?: number | string }).freight_charges ??
      (courier as { charge?: number | string }).charge ??
      (courier as { cost?: number | string }).cost) as number | string | undefined,
    0,
  ),
  displayPrice: parseNumber(
    (courier.courier_cost_estimate ??
      (courier as { rateEstimate?: number | string }).rateEstimate ??
      getCourierForwardRate(courier) ??
      (courier as { freight_charges?: number | string }).freight_charges ??
      (courier as { charge?: number | string }).charge ??
      (courier as { cost?: number | string }).cost) as number | string | undefined,
    0,
  ),
  codCharges: parseNumber(
    (courier.localRates as { forward?: { cod_charges?: number | string } } | undefined)?.forward
      ?.cod_charges as number | string | undefined,
    0,
  ),
  otherCharges: parseNumber(
    (courier.localRates as { forward?: { other_charges?: number | string } } | undefined)?.forward
      ?.other_charges as number | string | undefined,
    0,
  ),
  chargeableWeight:
    parseNumber(courier.chargeable_weight as number | string | undefined, 0) || null,
  volumetricWeight:
    parseNumber(courier.volumetric_weight as number | string | undefined, 0) || null,
  slabs: parseNumber(courier.slabs as number | string | undefined, 0) || null,
  maxSlabWeight: parseNumber(courier.max_slab_weight as number | string | undefined, 0) || null,
  zoneId: String((courier.approxZone as { id?: string } | undefined)?.id || '').trim() || null,
  zoneName:
    String(
      (courier.approxZone as { name?: string; code?: string } | undefined)?.name || '',
    ).trim() ||
    String(
      (courier.approxZone as { name?: string; code?: string } | undefined)?.code || '',
    ).trim() ||
    null,
})

const pickBestCourier = (couriers: Courier[]) => {
  const ranked = [...couriers].sort((a, b) => {
    const aCost = Number(
      a.courier_cost_estimate ??
        (a as { rateEstimate?: number | string }).rateEstimate ??
        getCourierForwardRate(a as Courier & Record<string, unknown>) ??
        Number.MAX_SAFE_INTEGER,
    )
    const bCost = Number(
      b.courier_cost_estimate ??
        (b as { rateEstimate?: number | string }).rateEstimate ??
        getCourierForwardRate(b as Courier & Record<string, unknown>) ??
        Number.MAX_SAFE_INTEGER,
    )
    return aCost - bCost
  })
  return ranked[0] ? buildCourierSelection(ranked[0] as Courier & Record<string, unknown>) : null
}

const formatCurrency = (value: number) => `Rs ${value.toFixed(2)}`

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const getErrorMessage = (error: unknown) => {
  if (typeof error === 'string') return error
  if (error && typeof error === 'object') {
    const anyError = error as {
      message?: string
      code?: string
      response?: { data?: { message?: string; error?: string } }
    }
    return (
      anyError.response?.data?.message || anyError.response?.data?.error || anyError.message || ''
    )
  }
  return ''
}

const isRetryableTransientError = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase()
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: string }).code || '').toLowerCase()
      : ''

  return (
    code === 'econnaborted' ||
    message.includes('timeout') ||
    message.includes('network error') ||
    message.includes('failed to fetch') ||
    message.includes('socket hang up') ||
    message.includes('gateway timeout') ||
    message.includes('temporarily unavailable')
  )
}

const withRetry = async <T,>(
  task: () => Promise<T>,
  options: {
    retries?: number
    baseDelayMs?: number
  } = {},
): Promise<T> => {
  const retries = options.retries ?? 2
  const baseDelayMs = options.baseDelayMs ?? 1200
  let attempt = 0

  while (true) {
    try {
      return await task()
    } catch (error) {
      if (attempt >= retries || !isRetryableTransientError(error)) {
        throw error
      }

      await sleep(baseDelayMs * (attempt + 1))
      attempt += 1
    }
  }
}

const buildCsvDuplicateMap = (rows: BulkUploadRow[]) => {
  const counts = new Map<string, number>()
  rows.forEach((row) => {
    const key = cleanText(row.orderId).toLowerCase()
    if (!key) return
    counts.set(key, (counts.get(key) ?? 0) + 1)
  })
  return counts
}

const isSameCourier = (left?: CourierSelection | null, right?: CourierSelection | null) => {
  const leftKey = String(left?.courierOptionKey || left?.id || '').trim()
  const rightKey = String(right?.courierOptionKey || right?.id || '').trim()
  return Boolean(leftKey) && Boolean(rightKey) && leftKey === rightKey
}

const validateExistingRow = (
  row: BulkUploadRow,
  pickupAddresses: HydratedPickup[],
  duplicateMap: Map<string, number>,
): BulkUploadRow => {
  const matchedPickup = findPickupByWarehouseName(row.warehouseName, pickupAddresses)
  const errors: string[] = []

  if (!row.warehouseName) errors.push('missing warehouse_name')
  if (row.warehouseName && !matchedPickup) {
    errors.push('warehouse_name does not match any added warehouse')
  }
  if (!row.pickupDate) errors.push('missing pickup_date')
  if (!row.pickupTime) errors.push('missing pickup_time')
  if (!row.orderId) errors.push('missing order ID')
  if (!row.buyerName) errors.push('missing buyer name')
  if (!/^\d{10,15}$/.test(row.buyerPhone)) errors.push('buyer phone should be 10-15 digits')
  if (!row.address) errors.push('missing address')
  if (!row.city) errors.push('missing city')
  if (!row.state) errors.push('missing state')
  if (!/^\d{6}$/.test(row.pincode)) errors.push('pincode should be 6 digits')
  if (!row.products.length) {
    errors.push('add at least one product before validating this row')
  }
  row.products.forEach((product, productIndex) => {
    const label = `product ${productIndex + 1}`
    if (!product.name) errors.push(`${label} name is missing`)
    if (product.price <= 0) errors.push(`${label} price should be greater than 0`)
    if (product.quantity <= 0) errors.push(`${label} quantity should be greater than 0`)
  })
  if (row.weight <= 0) errors.push('weight should be greater than 0')
  if (row.length <= 0 || row.breadth <= 0 || row.height <= 0) {
    errors.push('package dimensions should be greater than 0')
  }
  if (row.orderType === 'prepaid' && row.prepaidAmount <= 0) {
    errors.push('prepaid amount should be greater than 0 for prepaid orders')
  }

  const duplicateCount = duplicateMap.get(cleanText(row.orderId).toLowerCase()) ?? 0

  return {
    ...row,
    matchedPickup,
    validationError: errors.length ? `Row ${row.rowNumber}: ${errors.join(', ')}` : null,
    orderIdError:
      duplicateCount > 1 ? `Row ${row.rowNumber}: order ID is duplicated in this file.` : null,
    availableCouriers: row.importStatus === 'created' ? row.availableCouriers : [],
    selectedCourier: row.importStatus === 'created' ? row.selectedCourier : null,
    courierError: null,
    importStatus: row.importStatus === 'created' ? 'created' : 'pending',
    importMessage: row.importStatus === 'created' ? row.importMessage : null,
  }
}

const getPickupDetails = (pickup: HydratedPickup) => ({
  pickup_location_id: pickup.pickupId,
  pickup: {
    warehouse_name: pickup.pickup?.addressNickname || '',
    address: pickup.pickup?.addressLine1 || '',
    address_2: pickup.pickup?.addressLine2 || '',
    city: pickup.pickup?.city || '',
    state: pickup.pickup?.state || '',
    pincode: pickup.pickup?.pincode || '',
    phone: pickup.pickup?.contactPhone || '',
    name: pickup.pickup?.contactName || '',
  },
  is_rto_different: pickup.isRTOSame ? ('no' as const) : ('yes' as const),
  rto: pickup.isRTOSame
    ? undefined
    : pickup.rto
      ? {
          warehouse_name: pickup.rto.addressNickname || '',
          address: pickup.rto.addressLine1 || '',
          address_2: pickup.rto.addressLine2 || '',
          city: pickup.rto.city || '',
          state: pickup.rto.state || '',
          pincode: pickup.rto.pincode || '',
          phone: pickup.rto.contactPhone || '',
          name: pickup.rto.contactName || '',
        }
      : undefined,
})

export default function BulkB2CUpload({ onClose }: { onClose?: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const availableCouriersMutation = useAvailableCouriersMutation()
  const {
    data: pickupData,
    isLoading: pickupLoading,
    refetch: refetchPickupAddresses,
  } = usePickupAddresses({
    isPickupEnabled: 'active' as unknown as boolean,
  })
  const [rows, setRows] = useState<BulkUploadRow[]>([])
  const [fileName, setFileName] = useState('')
  const [busyStage, setBusyStage] = useState<'idle' | 'validating' | 'creating'>('idle')
  const [warehouseDrawerOpen, setWarehouseDrawerOpen] = useState(false)
  const [warehouseDraftName, setWarehouseDraftName] = useState('')
  const [reviewMode, setReviewMode] = useState(false)
  const [editingRowNumber, setEditingRowNumber] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<EditableBulkUploadRow | null>(null)

  const pickupAddresses = pickupData?.pickupAddresses ?? []
  const warehouseNames = pickupAddresses.map((pickup) => getPickupLabel(pickup))
  const currentStep = !rows.length ? 1 : reviewMode ? 3 : 2

  const readyRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          !row.validationError &&
          !row.orderIdError &&
          row.selectedCourier &&
          row.importStatus !== 'created',
      ),
    [rows],
  )
  const failedRows = useMemo(
    () =>
      rows.filter(
        (row) =>
          row.validationError ||
          row.orderIdError ||
          row.courierError ||
          row.importStatus === 'failed',
      ),
    [rows],
  )
  const createdRows = useMemo(() => rows.filter((row) => row.importStatus === 'created'), [rows])
  const missingWarehouseNames = useMemo(
    () =>
      Array.from(
        new Set(
          rows
            .filter((row) => !row.matchedPickup && row.warehouseName)
            .map((row) => row.warehouseName),
        ),
      ),
    [rows],
  )

  const updateRow = (rowNumber: number, updater: (row: BulkUploadRow) => BulkUploadRow) => {
    setRows((currentRows) =>
      currentRows.map((row) => (row.rowNumber === rowNumber ? updater(row) : row)),
    )
  }

  const validateCourierForRow = async (row: BulkUploadRow) => {
    if (row.validationError || !row.matchedPickup) return
    if (row.orderIdError && row.orderIdError.includes('duplicated in this file')) return

    updateRow(row.rowNumber, (current) => ({
      ...current,
      availableCouriers: [],
      selectedCourier: null,
      orderIdError: current.validationError ? current.orderIdError : 'Checking order ID...',
      courierError: current.validationError ? null : 'Refreshing courier options...',
      importStatus: current.importStatus === 'created' ? 'created' : 'pending',
      importMessage: current.importStatus === 'created' ? current.importMessage : null,
    }))

    try {
      const orderIdCheck = await withRetry(() => checkOrderNumberAvailability(row.orderId))
      const available = Boolean(orderIdCheck?.data?.available)

      if (!available) {
        updateRow(row.rowNumber, (current) => ({
          ...current,
          orderIdError:
            orderIdCheck?.data?.message ||
            `Row ${row.rowNumber}: order ID already exists. Use a different order ID.`,
          courierError: null,
          selectedCourier: null,
          importStatus: 'pending',
          importMessage: null,
        }))
        return
      }

      const productSubtotal = getProductsSubtotal(row.products)
      const orderValue =
        productSubtotal +
        row.shippingCharges +
        row.giftWrap +
        row.transactionFee -
        row.orderDiscount

      const availableCouriers = await withRetry(() =>
        availableCouriersMutation.mutateAsync({
          pickupPincode: row.matchedPickup?.pickup?.pincode || '',
          pickupId: row.matchedPickup?.pickupId,
          pickupName: row.matchedPickup?.pickup?.addressNickname || '',
          deliveryPincode: row.pincode,
          weight: row.weight,
          length: row.length,
          breadth: row.breadth,
          height: row.height,
          cod: row.orderType === 'cod' ? 1 : 0,
          payment_type: row.orderType,
          orderAmount: Math.max(orderValue, productSubtotal),
          shipmentType: 'b2c',
        }),
      )

      const courierOptions = (availableCouriers as Courier[]).map((courier) =>
        buildCourierSelection(courier as Courier & Record<string, unknown>),
      )
      const bestCourier = pickBestCourier(availableCouriers as Courier[])

      updateRow(row.rowNumber, (current) => ({
        ...current,
        orderIdError: null,
        availableCouriers: courierOptions,
        selectedCourier: bestCourier,
        courierError: bestCourier ? null : 'No courier is serviceable for this row.',
        importStatus: bestCourier ? 'ready' : 'pending',
        importMessage: null,
      }))
    } catch (error: any) {
      updateRow(row.rowNumber, (current) => ({
        ...current,
        orderIdError: current.orderIdError === 'Checking order ID...' ? null : current.orderIdError,
        availableCouriers: [],
        selectedCourier: null,
        courierError: isRetryableTransientError(error)
          ? 'Courier refresh timed out after retries. Please try validation again.'
          : getErrorMessage(error) || 'Courier check failed for this row.',
        importStatus: 'pending',
        importMessage: null,
      }))
    }
  }

  const buildEditDraft = (row: BulkUploadRow): EditableBulkUploadRow => ({
    warehouseName: row.warehouseName,
    pickupDate: row.pickupDate,
    pickupTime: row.pickupTime,
    orderId: row.orderId,
    orderDate: row.orderDate,
    buyerName: row.buyerName,
    buyerPhone: row.buyerPhone,
    buyerEmail: row.buyerEmail,
    address: row.address,
    address2: row.address2,
    city: row.city,
    state: row.state,
    pincode: row.pincode,
    orderType: row.orderType,
    products: row.products.map((product) => ({
      name: product.name,
      sku: product.sku,
      hsnCode: product.hsnCode,
      price: String(product.price ?? ''),
      quantity: String(product.quantity ?? ''),
      discount: String(product.discount ?? ''),
      taxRate: String(product.taxRate ?? ''),
    })),
    weight: String(row.weight ?? ''),
    length: String(row.length ?? ''),
    breadth: String(row.breadth ?? ''),
    height: String(row.height ?? ''),
    shippingCharges: String(row.shippingCharges ?? ''),
    prepaidAmount: String(row.prepaidAmount ?? ''),
    giftWrap: String(row.giftWrap ?? ''),
    transactionFee: String(row.transactionFee ?? ''),
    orderDiscount: String(row.orderDiscount ?? ''),
  })

  const openEditRow = (row: BulkUploadRow) => {
    setEditingRowNumber(row.rowNumber)
    setEditDraft(buildEditDraft(row))
  }

  const closeEditRow = () => {
    setEditingRowNumber(null)
    setEditDraft(null)
  }

  const rematchRowsWithWarehouses = async () => {
    setReviewMode(false)
    const latest = await refetchPickupAddresses()
    const latestPickupAddresses = latest.data?.pickupAddresses ?? pickupAddresses
    setRows((currentRows) => {
      const duplicateMap = buildCsvDuplicateMap(currentRows)
      return currentRows.map((row) => validateExistingRow(row, latestPickupAddresses, duplicateMap))
    })
    toast.open({
      message: 'Warehouse list refreshed. Uploaded rows were rechecked.',
      severity: 'success',
    })
  }

  const handleDownloadSample = () => {
    const csv = Papa.unparse(sampleRows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = 'sample-b2c-bulk-upload.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    processCsvFile(file)
  }

  const processCsvFile = (file: File) => {
    if (!file) return

    setFileName(file.name)
    setReviewMode(false)
    Papa.parse<CsvRow>(file, {
      header: true,
      skipEmptyLines: 'greedy',
      complete: (result) => {
        if (!pickupAddresses.length) {
          toast.open({
            message: 'Add at least one pickup location, then upload the CSV.',
            severity: 'warning',
          })
          return
        }

        const normalizedRows = (result.data || [])
          .filter((row) =>
            Object.values(row || {}).some((value) => String(value ?? '').trim() !== ''),
          )
          .map((row, index) => normalizeCsvRow(row, index, pickupAddresses))

        const duplicateMap = buildCsvDuplicateMap(normalizedRows)
        const rowsWithDuplicateInfo = normalizedRows.map((row) =>
          validateExistingRow(row, pickupAddresses, duplicateMap),
        )

        setRows(rowsWithDuplicateInfo)

        if (!rowsWithDuplicateInfo.length) {
          toast.open({ message: 'The uploaded CSV is empty.', severity: 'error' })
          return
        }

        const invalidCount = rowsWithDuplicateInfo.filter(
          (row) => row.validationError || row.orderIdError,
        ).length
        toast.open({
          message:
            invalidCount > 0
              ? `${rowsWithDuplicateInfo.length} rows loaded. ${invalidCount} need fixes before import.`
              : `${rowsWithDuplicateInfo.length} rows loaded. Ready for order ID and courier checks.`,
          severity: invalidCount > 0 ? 'warning' : 'success',
        })
      },
      error: (error) => {
        toast.open({ message: error.message || 'Failed to read CSV file.', severity: 'error' })
      },
    })
  }

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'text/csv': ['.csv'] },
    multiple: false,
    onDrop: (acceptedFiles) => {
      const file = acceptedFiles[0]
      if (file) {
        processCsvFile(file)
      }
    },
  })

  const handleValidateAndSelectCouriers = async () => {
    if (!pickupAddresses.length) {
      toast.open({
        message: 'Add at least one pickup location before continuing.',
        severity: 'error',
      })
      return
    }

    const baseRows: BulkUploadRow[] = rows.map((row) => ({
      ...row,
      availableCouriers: [],
      selectedCourier: null,
      orderIdError: row.validationError ? row.orderIdError : 'Checking order ID...',
      courierError: row.validationError ? null : 'Waiting for order ID check...',
      importStatus: row.importStatus === 'created' ? 'created' : 'pending',
      importMessage: row.importStatus === 'created' ? row.importMessage : null,
    }))
    setRows(baseRows)
    setReviewMode(false)
    setBusyStage('validating')

    for (const row of baseRows) {
      if (row.validationError) continue
      if (row.orderIdError && row.orderIdError.includes('duplicated in this file')) continue
      if (!row.matchedPickup) continue

      try {
        const matchedPickup = row.matchedPickup
        if (!matchedPickup) {
          updateRow(row.rowNumber, (current) => ({
            ...current,
            availableCouriers: [],
            selectedCourier: null,
            courierError: 'Warehouse mapping is missing for this row.',
            importStatus: 'pending',
            importMessage: null,
          }))
          continue
        }

        const orderIdCheck = await withRetry(() => checkOrderNumberAvailability(row.orderId))
        const available = Boolean(orderIdCheck?.data?.available)

        if (!available) {
          updateRow(row.rowNumber, (current) => ({
            ...current,
            orderIdError:
              orderIdCheck?.data?.message ||
              `Row ${row.rowNumber}: order ID already exists. Use a different order ID.`,
            courierError: null,
            selectedCourier: null,
            importStatus: 'pending',
            importMessage: null,
          }))
          continue
        }

        const productSubtotal = getProductsSubtotal(row.products)
        const orderValue =
          productSubtotal +
          row.shippingCharges +
          row.giftWrap +
          row.transactionFee -
          row.orderDiscount

        const availableCouriers = await withRetry(() =>
          availableCouriersMutation.mutateAsync({
            pickupPincode: matchedPickup.pickup?.pincode || '',
            pickupId: matchedPickup.pickupId,
            pickupName: matchedPickup.pickup?.addressNickname || '',
            deliveryPincode: row.pincode,
            weight: row.weight,
            length: row.length,
            breadth: row.breadth,
            height: row.height,
            cod: row.orderType === 'cod' ? 1 : 0,
            payment_type: row.orderType,
            orderAmount: Math.max(orderValue, productSubtotal),
            shipmentType: 'b2c',
          }),
        )

        const courierOptions = (availableCouriers as Courier[]).map((courier) =>
          buildCourierSelection(courier as Courier & Record<string, unknown>),
        )
        const bestCourier = pickBestCourier(availableCouriers as Courier[])

        updateRow(row.rowNumber, (current) => ({
          ...current,
          orderIdError: null,
          availableCouriers: courierOptions,
          selectedCourier: bestCourier,
          courierError: bestCourier ? null : 'No courier is serviceable for this row.',
          importStatus: bestCourier ? 'ready' : 'pending',
          importMessage: null,
        }))
      } catch (error: any) {
        updateRow(row.rowNumber, (current) => ({
          ...current,
          orderIdError:
            current.orderIdError === 'Checking order ID...' ? null : current.orderIdError,
          availableCouriers: [],
          selectedCourier: null,
          courierError: isRetryableTransientError(error)
            ? 'Courier check timed out after retries. Please try validation again.'
            : getErrorMessage(error) || 'Courier check failed for this row.',
          importStatus: 'pending',
          importMessage: null,
        }))
      }
    }

    setBusyStage('idle')
    toast.open({
      message:
        'Validation completed. Rows with duplicate or already-used order IDs are blocked with clear messages.',
      severity: 'info',
    })
  }

  const handleCreateOrders = async () => {
    if (!reviewMode) {
      toast.open({
        message: 'Review the confirmation screen before final submit.',
        severity: 'warning',
      })
      return
    }

    if (!pickupAddresses.length) {
      toast.open({
        message: 'Add at least one pickup location before continuing.',
        severity: 'error',
      })
      return
    }

    const rowsToCreate = rows.filter(
      (row) =>
        !row.validationError &&
        !row.orderIdError &&
        !row.courierError &&
        row.selectedCourier &&
        row.importStatus !== 'created',
    )

    if (!rowsToCreate.length) {
      toast.open({ message: 'No ready rows found. Validate the file first.', severity: 'warning' })
      return
    }

    setBusyStage('creating')
    const bulkPayload: Array<CreateShipmentParams & { client_row_number: number }> =
      rowsToCreate.map((row) => {
        const orderAmount = Math.max(getProductsSubtotal(row.products), 0)
        const courier = row.selectedCourier as CourierSelection
        const matchedPickup = row.matchedPickup as HydratedPickup
        const pickupDetails = getPickupDetails(matchedPickup)

        return {
          client_row_number: row.rowNumber,
          order_number: row.orderId,
          payment_type: row.orderType,
          order_amount: orderAmount,
          order_date: row.orderDate,
          package_weight: row.weight,
          package_length: row.length,
          package_breadth: row.breadth,
          package_height: row.height,
          shipping_charges: row.shippingCharges,
          prepaid_amount: row.prepaidAmount,
          transaction_fee: row.transactionFee,
          gift_wrap: row.giftWrap,
          discount: row.orderDiscount,
          freight_charges: courier.rate ?? undefined,
          courier_cost: courier.courierCostEstimate ?? undefined,
          integration_type:
            (courier.integrationType as
              | 'delhivery'
              | 'ekart'
              | 'shadowfax'
              | 'xpressbees'
              | 'icarry'
              | undefined) ?? undefined,
          courier_id: courier.id,
          courier_option_key: courier.courierOptionKey ?? undefined,
          shadowfax_forward_mode: courier.shadowfaxForwardMode ?? undefined,
          shadowfax_service_mode: courier.shadowfaxServiceMode ?? undefined,
          selected_max_slab_weight: courier.maxSlabWeight ?? undefined,
          pickup_date: row.pickupDate,
          pickup_time: row.pickupTime,
          delivery_location: courier.zoneName ?? undefined,
          zone_id: courier.zoneId ?? undefined,
          consignee: {
            name: row.buyerName,
            address: row.address,
            address_2: row.address2 || undefined,
            city: row.city,
            state: row.state,
            email: row.buyerEmail || undefined,
            pincode: row.pincode,
            phone: row.buyerPhone,
          },
          ...pickupDetails,
          order_items: row.products.map((product) => ({
            name: product.name,
            sku: product.sku || 'NA',
            qty: product.quantity,
            price: product.price,
            hsn: product.hsnCode,
            discount: product.discount,
            tax_rate: product.taxRate,
          })),
        }
      })

    try {
      const response = await withRetry(() => createBulkShipments(bulkPayload), {
        retries: 1,
        baseDelayMs: 2000,
      })

      response.results.forEach((result) => {
        updateRow(result.rowNumber, (current) => ({
          ...current,
          importStatus: result.success ? 'created' : 'failed',
          importMessage: result.message,
        }))
      })

      await queryClient.invalidateQueries({ queryKey: ['b2cOrdersByUser'] })
      await queryClient.invalidateQueries({ queryKey: ['orders'] })
      setBusyStage('idle')

      toast.open({
        message: response.message,
        severity: response.summary.failedCount > 0 ? 'warning' : 'success',
        duration: 6000,
      })

      if (response.summary.successCount > 0 && response.summary.failedCount === 0 && onClose) {
        onClose()
      }
    } catch (error: any) {
      setBusyStage('idle')
      toast.open({
        message: isRetryableTransientError(error)
          ? 'Bulk order creation timed out after retry. Please try final submit again.'
          : getErrorMessage(error) || 'Bulk order creation failed.',
        severity: 'error',
        duration: 6000,
      })
    }
  }

  const handleSaveEdit = async () => {
    if (!editDraft || editingRowNumber === null) return

    let editedRowAfterValidation: BulkUploadRow | null = null

    setRows((currentRows) => {
      const updatedRows = currentRows.map((row) => {
        if (row.rowNumber !== editingRowNumber) return row
        return {
          ...row,
          warehouseName: cleanText(editDraft.warehouseName),
          pickupDate: cleanText(editDraft.pickupDate),
          pickupTime: cleanText(editDraft.pickupTime),
          orderId: cleanText(editDraft.orderId),
          orderDate: cleanText(editDraft.orderDate),
          buyerName: cleanText(editDraft.buyerName),
          buyerPhone: cleanText(editDraft.buyerPhone),
          buyerEmail: cleanText(editDraft.buyerEmail),
          address: cleanText(editDraft.address),
          address2: cleanText(editDraft.address2),
          city: cleanText(editDraft.city),
          state: cleanText(editDraft.state),
          pincode: cleanText(editDraft.pincode),
          orderType: editDraft.orderType,
          products: editDraft.products
            .map((product) => ({
              name: cleanText(product.name),
              sku: cleanText(product.sku),
              hsnCode: cleanText(product.hsnCode),
              price: parseNumber(product.price),
              quantity: Math.max(parseNumber(product.quantity, 1), 1),
              discount: parseNumber(product.discount),
              taxRate: parseNumber(product.taxRate),
            }))
            .filter(
              (product) =>
                product.name ||
                product.sku ||
                product.hsnCode ||
                product.price > 0 ||
                product.discount > 0,
            ),
          weight: parseNumber(editDraft.weight),
          length: parseNumber(editDraft.length),
          breadth: parseNumber(editDraft.breadth),
          height: parseNumber(editDraft.height),
          shippingCharges: parseNumber(editDraft.shippingCharges),
          prepaidAmount: parseNumber(editDraft.prepaidAmount),
          giftWrap: parseNumber(editDraft.giftWrap),
          transactionFee: parseNumber(editDraft.transactionFee),
          orderDiscount: parseNumber(editDraft.orderDiscount),
        }
      })

      const duplicateMap = buildCsvDuplicateMap(updatedRows)
      const validatedRows = updatedRows.map((row) =>
        validateExistingRow(row, pickupAddresses, duplicateMap),
      )
      editedRowAfterValidation =
        validatedRows.find((row) => row.rowNumber === editingRowNumber) ?? null
      return validatedRows
    })

    closeEditRow()

    const rowToRefresh = editedRowAfterValidation as BulkUploadRow | null

    if (rowToRefresh && !rowToRefresh.validationError) {
      await validateCourierForRow(rowToRefresh)
      toast.open({
        message: 'Row updated and courier options refreshed.',
        severity: 'success',
      })
      return
    }

    toast.open({
      message: 'Row updated. Fix the highlighted validation issues for this row.',
      severity: 'warning',
    })
  }

  const handleCourierChange = (rowNumber: number, selectedKey: string) => {
    updateRow(rowNumber, (current) => {
      const chosenCourier =
        current.availableCouriers.find(
          (courier) => String(courier.courierOptionKey || courier.id || '').trim() === selectedKey,
        ) ?? null

      return {
        ...current,
        selectedCourier: chosenCourier,
        courierError: chosenCourier ? null : 'Please select a courier for this row.',
        importStatus: chosenCourier ? 'ready' : 'pending',
        importMessage: null,
      }
    })
  }

  const applyCourierToCompatibleRows = (sourceRowNumber: number) => {
    const sourceRow = rows.find((row) => row.rowNumber === sourceRowNumber)
    if (!sourceRow?.selectedCourier) return

    let updatedCount = 0

    setRows((currentRows) =>
      currentRows.map((row) => {
        if (row.rowNumber === sourceRowNumber) return row
        if (row.validationError || row.orderIdError || row.importStatus === 'created') return row

        const matchingCourier = row.availableCouriers.find((courier) =>
          isSameCourier(courier, sourceRow.selectedCourier),
        )

        if (!matchingCourier) return row
        updatedCount += 1

        return {
          ...row,
          selectedCourier: matchingCourier,
          courierError: null,
          importStatus: 'ready',
          importMessage: null,
        }
      }),
    )

    toast.open({
      message: updatedCount
        ? `Applied ${sourceRow.selectedCourier.name} to ${updatedCount} compatible rows.`
        : 'No other compatible rows found for this courier.',
      severity: updatedCount ? 'success' : 'info',
    })
  }

  return (
    <Stack spacing={2.5}>
      <Paper
        elevation={0}
        sx={{
          p: { xs: 2.5, md: 3 },
          borderRadius: 4,
          border: `1px solid ${alpha(ACCENT, 0.18)}`,
          background:
            'radial-gradient(circle at top right, rgba(61,139,255,0.18), transparent 34%), linear-gradient(135deg, rgba(13,59,142,0.1), rgba(255,255,255,0.98) 58%)',
          boxShadow: '0 18px 40px rgba(13,59,142,0.08)',
          overflow: 'hidden',
        }}
      >
        <Stack spacing={2}>
          <Stack
            direction={{ xs: 'column', lg: 'row' }}
            spacing={1.25}
            sx={{ '& > *': { flex: 1 } }}
          >
            {[
              {
                step: '1',
                title: 'Upload CSV',
                caption: 'Use a flat CSV with pickup and product columns only.',
              },
              {
                step: '2',
                title: 'Validate Rows',
                caption: 'We check pickup names, order IDs, and serviceable couriers.',
              },
              {
                step: '3',
                title: 'Review And Submit',
                caption: 'Change couriers, edit rows, then send the clean batch.',
              },
            ].map((item, index) => {
              const active = currentStep === index + 1
              const completed = currentStep > index + 1
              return (
                <Paper
                  key={item.step}
                  elevation={0}
                  sx={{
                    p: 1.5,
                    borderRadius: 3,
                    border: `1px solid ${
                      active || completed ? alpha(ACCENT, 0.24) : 'rgba(148,163,184,0.3)'
                    }`,
                    bgcolor: active
                      ? alpha(ACCENT, 0.08)
                      : completed
                        ? 'rgba(34,197,94,0.08)'
                        : 'rgba(255,255,255,0.7)',
                  }}
                >
                  <Stack direction="row" spacing={1.25} alignItems="center">
                    <Box
                      sx={{
                        width: 34,
                        height: 34,
                        borderRadius: '50%',
                        display: 'grid',
                        placeItems: 'center',
                        fontWeight: 800,
                        color: completed || active ? '#fff' : TEXT_MUTED,
                        bgcolor: completed ? '#16A34A' : active ? ACCENT : '#E2E8F0',
                      }}
                    >
                      {completed ? '✓' : item.step}
                    </Box>
                    <Stack spacing={0.25}>
                      <Typography fontWeight={800} sx={{ color: TEXT_PRIMARY, lineHeight: 1.2 }}>
                        {item.title}
                      </Typography>
                      <Typography variant="caption" sx={{ color: TEXT_MUTED, lineHeight: 1.5 }}>
                        {item.caption}
                      </Typography>
                    </Stack>
                  </Stack>
                </Paper>
              )
            })}
          </Stack>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            alignItems={{ xs: 'flex-start', md: 'flex-end' }}
            gap={2}
          >
            <Stack spacing={1}>
              <Chip
                label="FAST BULK OPERATIONS"
                size="small"
                sx={{
                  width: 'fit-content',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  color: ACCENT,
                  bgcolor: alpha(ACCENT, 0.08),
                  border: `1px solid ${alpha(ACCENT, 0.18)}`,
                }}
              />
              <Typography variant="h5" fontWeight={900} sx={{ color: TEXT_PRIMARY }}>
                Bulk B2C Upload
              </Typography>
              <Typography
                variant="body2"
                sx={{ color: TEXT_MUTED, maxWidth: 760, lineHeight: 1.7 }}
              >
                Upload one simple CSV with plain columns only. Each row must include a
                `warehouse_name` that exactly matches an already added warehouse pickup address,
                plus its own `pickup_date` and `pickup_time`. One row can include multiple products
                using columns like `product_1_name`, `product_2_name`, and so on.
              </Typography>
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <Button
                variant="outlined"
                startIcon={<FiDownload />}
                onClick={handleDownloadSample}
                sx={{
                  textTransform: 'none',
                  borderColor: alpha(ACCENT, 0.28),
                  color: ACCENT,
                  px: 2.25,
                  py: 1.1,
                  borderRadius: 2.5,
                  bgcolor: '#fff',
                }}
              >
                Download Sample CSV
              </Button>
              <Button
                component="label"
                variant="contained"
                startIcon={<FiUploadCloud />}
                sx={{
                  textTransform: 'none',
                  backgroundColor: ACCENT,
                  px: 2.25,
                  py: 1.1,
                  borderRadius: 2.5,
                  boxShadow: '0 10px 24px rgba(13,59,142,0.22)',
                }}
              >
                Upload CSV
                <input hidden accept=".csv" type="file" onChange={handleFileChange} />
              </Button>
            </Stack>
          </Stack>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={1.25}
            sx={{ '& > *': { flex: 1 } }}
          >
            <Paper
              elevation={0}
              sx={{ p: 1.6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.82)' }}
            >
              <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                Rows Loaded
              </Typography>
              <Typography variant="h5" fontWeight={900} sx={{ color: TEXT_PRIMARY }}>
                {rows.length}
              </Typography>
            </Paper>
            <Paper elevation={0} sx={{ p: 1.6, borderRadius: 3, bgcolor: 'rgba(22,163,74,0.08)' }}>
              <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                Ready To Submit
              </Typography>
              <Typography variant="h5" fontWeight={900} sx={{ color: '#166534' }}>
                {readyRows.length}
              </Typography>
            </Paper>
            <Paper elevation={0} sx={{ p: 1.6, borderRadius: 3, bgcolor: 'rgba(239,68,68,0.08)' }}>
              <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                Need Attention
              </Typography>
              <Typography variant="h5" fontWeight={900} sx={{ color: '#991B1B' }}>
                {failedRows.length}
              </Typography>
            </Paper>
            <Paper
              elevation={0}
              sx={{ p: 1.6, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.82)' }}
            >
              <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                Current File
              </Typography>
              <Typography
                fontWeight={700}
                sx={{ color: TEXT_PRIMARY, overflow: 'hidden', textOverflow: 'ellipsis' }}
              >
                {fileName || 'No file uploaded yet'}
              </Typography>
            </Paper>
          </Stack>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E2E8F0' }}>
        <Stack spacing={2}>
          <Typography fontWeight={700} sx={{ color: TEXT_PRIMARY }}>
            Pickup Locations And File Format
          </Typography>

          {!pickupAddresses.length && !pickupLoading ? (
            <Alert severity="warning">
              Add a pickup location first. In your CSV, each row should use that exact name in the
              `warehouse_name` column.
            </Alert>
          ) : null}

          {pickupAddresses.length ? (
            <Alert severity="info">
              Use one of these exact names in the `warehouse_name` column:{' '}
              {warehouseNames.join(', ')}
            </Alert>
          ) : null}

          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
            <Paper
              elevation={0}
              sx={{ p: 1.5, borderRadius: 3, border: '1px solid #E2E8F0', flex: 1 }}
            >
              <Typography fontWeight={700} sx={{ color: TEXT_PRIMARY, mb: 0.5 }}>
                Must Match Exactly
              </Typography>
              <Typography variant="body2" sx={{ color: TEXT_MUTED, lineHeight: 1.6 }}>
                `warehouse_name` in the CSV must be the same as a saved pickup location name in your
                account.
              </Typography>
            </Paper>
            <Paper
              elevation={0}
              sx={{ p: 1.5, borderRadius: 3, border: '1px solid #E2E8F0', flex: 1 }}
            >
              <Typography fontWeight={700} sx={{ color: TEXT_PRIMARY, mb: 0.5 }}>
                Multi-Product Supported
              </Typography>
              <Typography variant="body2" sx={{ color: TEXT_MUTED, lineHeight: 1.6 }}>
                Keep products in normal CSV columns like `product_1_name`, `product_2_price`,
                `product_3_quantity`. No JSON field is needed anywhere.
              </Typography>
            </Paper>
            <Paper
              elevation={0}
              sx={{ p: 1.5, borderRadius: 3, border: '1px solid #E2E8F0', flex: 1 }}
            >
              <Typography fontWeight={700} sx={{ color: TEXT_PRIMARY, mb: 0.5 }}>
                Row-Level Control
              </Typography>
              <Typography variant="body2" sx={{ color: TEXT_MUTED, lineHeight: 1.6 }}>
                Each row can use its own pickup location, pickup slot, courier choice, and product
                list.
              </Typography>
            </Paper>
          </Stack>

          {!pickupAddresses.length ? (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
              <Button
                variant="contained"
                onClick={() => {
                  setWarehouseDraftName('')
                  setWarehouseDrawerOpen(true)
                }}
                sx={{ alignSelf: 'flex-start', textTransform: 'none', backgroundColor: ACCENT }}
              >
                Add Pickup Location
              </Button>
              <Button
                variant="outlined"
                onClick={() => navigate('/pickup-addresses')}
                sx={{
                  alignSelf: 'flex-start',
                  textTransform: 'none',
                  borderColor: alpha(ACCENT, 0.3),
                  color: ACCENT,
                }}
              >
                Open Pickup Locations Page
              </Button>
            </Stack>
          ) : null}

          {missingWarehouseNames.length ? (
            <Alert
              severity="warning"
              action={
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                  <Button
                    color="inherit"
                    size="small"
                    onClick={() => {
                      setWarehouseDraftName(missingWarehouseNames[0] || '')
                      setWarehouseDrawerOpen(true)
                    }}
                  >
                    Add Missing Warehouse
                  </Button>
                  <Button color="inherit" size="small" onClick={rematchRowsWithWarehouses}>
                    Refresh Matches
                  </Button>
                </Stack>
              }
            >
              These names from your file do not match any saved pickup location:{' '}
              {missingWarehouseNames.join(', ')}.
            </Alert>
          ) : null}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
            <Button
              variant="outlined"
              onClick={handleValidateAndSelectCouriers}
              disabled={!rows.length || !pickupAddresses.length || busyStage !== 'idle'}
              sx={{ textTransform: 'none', borderColor: alpha(ACCENT, 0.3), color: ACCENT }}
            >
              {busyStage === 'validating'
                ? 'Checking couriers...'
                : 'Validate & Auto-select Courier'}
            </Button>
            <Button
              variant="contained"
              onClick={() => setReviewMode((current) => !current)}
              disabled={!readyRows.length || busyStage !== 'idle'}
              sx={{ textTransform: 'none', backgroundColor: ACCENT }}
            >
              {reviewMode
                ? 'Back To Validation View'
                : `Review Couriers & Submit (${readyRows.length})`}
            </Button>
            <Button
              variant="contained"
              color="success"
              onClick={handleCreateOrders}
              disabled={!reviewMode || !readyRows.length || busyStage !== 'idle'}
              sx={{ textTransform: 'none' }}
            >
              {busyStage === 'creating' ? 'Submitting...' : `Final Submit (${readyRows.length})`}
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {reviewMode ? (
        <Alert severity="success">
          Review step is active. Best couriers are already selected for you, but every ready row can
          still be edited or switched to another available courier before final submit.
        </Alert>
      ) : rows.length ? (
        <Alert severity="info">
          Next step: validate the uploaded rows so we can check serviceability, block duplicate
          order IDs, and prepare courier options for review.
        </Alert>
      ) : null}

      {busyStage !== 'idle' ? (
        <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E2E8F0' }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <CircularProgress size={20} />
            <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
              {busyStage === 'validating'
                ? 'Checking serviceability and picking the best courier for each valid row.'
                : 'Creating orders one by one so the summary stays accurate.'}
            </Typography>
          </Stack>
        </Paper>
      ) : null}

      {rows.length ? (
        <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #E2E8F0' }}>
          <Stack spacing={1.5}>
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={1}
              alignItems={{ md: 'center' }}
            >
              <Typography fontWeight={700} sx={{ color: TEXT_PRIMARY }}>
                Review Orders
              </Typography>
              <Chip label={`${rows.length} rows`} />
              <Chip color="success" variant="outlined" label={`${readyRows.length} ready`} />
              <Chip
                color="error"
                variant="outlined"
                label={`${failedRows.length} need attention`}
              />
              <Chip color="info" variant="outlined" label={`${createdRows.length} created`} />
            </Stack>

            <Divider />

            <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.25}>
              <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3, bgcolor: '#F8FBFF', flex: 1 }}>
                <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                  Batch Progress
                </Typography>
                <Typography fontWeight={800} sx={{ color: TEXT_PRIMARY }}>
                  {createdRows.length} created, {readyRows.length} ready, {failedRows.length} need
                  fixes
                </Typography>
              </Paper>
              <Paper elevation={0} sx={{ p: 1.5, borderRadius: 3, bgcolor: '#F8FBFF', flex: 1 }}>
                <Typography variant="caption" sx={{ color: TEXT_MUTED }}>
                  Review Tip
                </Typography>
                <Typography fontWeight={700} sx={{ color: TEXT_PRIMARY }}>
                  Use Edit for row changes. Use courier dropdowns only for courier selection.
                </Typography>
              </Paper>
            </Stack>

            <TableContainer sx={{ border: '1px solid #E2E8F0', borderRadius: 2 }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Row</TableCell>
                    <TableCell>Warehouse</TableCell>
                    <TableCell>Pickup Slot</TableCell>
                    <TableCell>Order ID</TableCell>
                    <TableCell>Customer</TableCell>
                    <TableCell>Pincode</TableCell>
                    <TableCell>Amount</TableCell>
                    <TableCell>Courier Choice</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Message</TableCell>
                    <TableCell align="right">Action</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => {
                    const amount =
                      getProductsSubtotal(row.products) +
                      row.shippingCharges +
                      row.giftWrap +
                      row.transactionFee -
                      row.orderDiscount

                    return (
                      <TableRow key={`${row.rowNumber}-${row.orderId}`}>
                        <TableCell>{row.rowNumber}</TableCell>
                        <TableCell>{row.warehouseName || '-'}</TableCell>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography variant="body2">{row.pickupDate || '-'}</Typography>
                            <Typography variant="caption" color="text.secondary">
                              {row.pickupTime || '-'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>{row.orderId || '-'}</TableCell>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography variant="body2" fontWeight={600}>
                              {row.buyerName || '-'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {row.buyerPhone || '-'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>{row.pincode || '-'}</TableCell>
                        <TableCell>
                          <Stack spacing={0.25}>
                            <Typography variant="body2">
                              {formatCurrency(Math.max(amount, 0))}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {row.products.length} product{row.products.length === 1 ? '' : 's'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {getProductsSummary(row.products) || '-'}
                            </Typography>
                          </Stack>
                        </TableCell>
                        <TableCell>
                          {reviewMode && row.availableCouriers.length ? (
                            <Stack spacing={1}>
                              <Stack spacing={0.3}>
                                <Stack
                                  direction="row"
                                  spacing={0.75}
                                  alignItems="center"
                                  flexWrap="wrap"
                                >
                                  <Chip
                                    size="small"
                                    color="success"
                                    variant="outlined"
                                    label="Auto-selected best option"
                                  />
                                  <Typography variant="caption" color="text.secondary">
                                    {row.availableCouriers.length === 1
                                      ? 'Only 1 serviceable courier found for this row'
                                      : `${row.availableCouriers.length} courier options available`}
                                  </Typography>
                                </Stack>
                                {row.selectedCourier ? (
                                  <Stack spacing={0.25}>
                                    <Typography
                                      variant="body2"
                                      fontWeight={700}
                                      sx={{ color: TEXT_PRIMARY }}
                                    >
                                      {row.selectedCourier.name}
                                    </Typography>
                                    {row.selectedCourier.maxSlabWeight ? (
                                      <Typography variant="caption" color="text.secondary">
                                        Slab {Number(row.selectedCourier.maxSlabWeight).toFixed(2)}{' '}
                                        kg
                                      </Typography>
                                    ) : null}
                                  </Stack>
                                ) : null}
                              </Stack>
                              <TextField
                                select
                                size="small"
                                value={String(
                                  row.selectedCourier?.courierOptionKey ||
                                    row.selectedCourier?.id ||
                                    '',
                                )}
                                onChange={(event) =>
                                  handleCourierChange(row.rowNumber, event.target.value)
                                }
                                sx={{ minWidth: 220 }}
                              >
                                {row.availableCouriers.map((courier) => (
                                  <MenuItem
                                    key={String(courier.courierOptionKey || courier.id)}
                                    value={String(courier.courierOptionKey || courier.id)}
                                  >
                                    {courier.name} |{' '}
                                    {formatCurrency(
                                      Number(
                                        courier.displayPrice ??
                                          courier.courierCostEstimate ??
                                          courier.rate ??
                                          0,
                                      ),
                                    )}{' '}
                                    {courier.maxSlabWeight
                                      ? `| Slab ${Number(courier.maxSlabWeight).toFixed(2)} kg`
                                      : ''}
                                  </MenuItem>
                                ))}
                              </TextField>
                              <Button
                                size="small"
                                variant="text"
                                onClick={() => applyCourierToCompatibleRows(row.rowNumber)}
                                sx={{ alignSelf: 'flex-start' }}
                              >
                                Apply To Compatible Rows
                              </Button>
                            </Stack>
                          ) : row.selectedCourier ? (
                            <Stack spacing={0.25}>
                              <Stack
                                direction="row"
                                spacing={0.75}
                                alignItems="center"
                                flexWrap="wrap"
                              >
                                <Chip
                                  size="small"
                                  color="success"
                                  variant="outlined"
                                  label="Auto-selected"
                                />
                                {row.availableCouriers.length ? (
                                  <Typography variant="caption" color="text.secondary">
                                    {row.availableCouriers.length === 1
                                      ? 'Only 1 serviceable courier found'
                                      : `${row.availableCouriers.length} options available`}
                                  </Typography>
                                ) : null}
                              </Stack>
                              <Typography variant="body2" fontWeight={700}>
                                {row.selectedCourier.name}
                              </Typography>
                              {row.selectedCourier.maxSlabWeight ? (
                                <Typography variant="caption" color="text.secondary">
                                  Slab {Number(row.selectedCourier.maxSlabWeight).toFixed(2)} kg
                                </Typography>
                              ) : null}
                              <Typography variant="caption" color="text.secondary">
                                {formatCurrency(
                                  Number(
                                    row.selectedCourier.displayPrice ??
                                      row.selectedCourier.courierCostEstimate ??
                                      row.selectedCourier.rate ??
                                      0,
                                  ),
                                )}
                              </Typography>
                              {row.selectedCourier.chargeableWeight || row.selectedCourier.slabs ? (
                                <Typography variant="caption" color="text.secondary">
                                  {row.selectedCourier.chargeableWeight
                                    ? `Chargeable ${(Number(row.selectedCourier.chargeableWeight) / 1000).toFixed(2)} kg`
                                    : ''}
                                  {row.selectedCourier.chargeableWeight && row.selectedCourier.slabs
                                    ? ' • '
                                    : ''}
                                  {row.selectedCourier.slabs
                                    ? `${row.selectedCourier.slabs} slab${row.selectedCourier.slabs === 1 ? '' : 's'}`
                                    : ''}
                                </Typography>
                              ) : null}
                            </Stack>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            color={
                              row.importStatus === 'created'
                                ? 'success'
                                : row.importStatus === 'failed' ||
                                    row.validationError ||
                                    row.courierError
                                  ? 'error'
                                  : row.selectedCourier
                                    ? 'info'
                                    : 'default'
                            }
                            label={
                              row.importStatus === 'created'
                                ? 'Created'
                                : row.importStatus === 'failed'
                                  ? 'Failed'
                                  : row.selectedCourier
                                    ? 'Ready'
                                    : 'Pending'
                            }
                          />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 320 }}>
                          <Typography variant="caption" color="text.secondary">
                            {row.validationError ||
                              row.orderIdError ||
                              row.courierError ||
                              row.importMessage ||
                              'Looks good'}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Button size="small" variant="text" onClick={() => openEditRow(row)}>
                            Edit
                          </Button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Stack>
        </Paper>
      ) : (
        <Paper
          {...getRootProps()}
          elevation={0}
          sx={{
            p: { xs: 4, md: 5 },
            borderRadius: 4,
            border: isDragActive ? `2px dashed ${ACCENT}` : '1px dashed #CBD5E1',
            textAlign: 'center',
            color: TEXT_MUTED,
            cursor: 'pointer',
            background: isDragActive
              ? 'linear-gradient(135deg, rgba(13,59,142,0.08), rgba(61,139,255,0.08))'
              : 'linear-gradient(180deg, #ffffff, #f8fbff)',
            transition: 'all 0.2s ease',
            minHeight: 280,
            display: 'grid',
            placeItems: 'center',
            boxShadow: isDragActive ? '0 18px 40px rgba(13,59,142,0.12)' : 'none',
          }}
        >
          <input {...getInputProps()} />
          <Stack spacing={1.5} alignItems="center" sx={{ maxWidth: 520 }}>
            <Box
              sx={{
                width: 84,
                height: 84,
                borderRadius: '28px',
                display: 'grid',
                placeItems: 'center',
                fontSize: 34,
                fontWeight: 900,
                color: ACCENT,
                bgcolor: alpha(ACCENT, 0.08),
                border: `1px solid ${alpha(ACCENT, 0.14)}`,
              }}
            >
              CSV
            </Box>
            <Typography variant="h6" fontWeight={900} sx={{ color: TEXT_PRIMARY }}>
              {isDragActive ? 'Drop your CSV here' : 'Drag, Drop, or Click to Upload'}
            </Typography>
            <Typography variant="body1" sx={{ color: TEXT_MUTED, lineHeight: 1.7 }}>
              Upload your bulk B2C file here. This entire area is clickable and also supports
              drag-and-drop.
            </Typography>
            <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
              The sample template already contains the right columns. One row creates one B2C order
              with one or more products using plain CSV columns only.
            </Typography>

            <Button
              variant="contained"
              startIcon={<FiUploadCloud />}
              sx={{
                mt: 1,
                textTransform: 'none',
                backgroundColor: ACCENT,
                px: 2.5,
                py: 1.1,
                borderRadius: 2.5,
              }}
            >
              Choose CSV File
            </Button>
          </Stack>
        </Paper>
      )}

      <CustomDrawer
        width={980}
        open={warehouseDrawerOpen}
        onClose={() => setWarehouseDrawerOpen(false)}
        title="Add Warehouse"
      >
        <Alert severity="info" sx={{ mb: 2 }}>
          Save the warehouse here using the regular pickup-address API. After saving, the upload
          will refresh and try matching your CSV rows again automatically.
        </Alert>
        <AddPickupAddressForm
          setDrawer={(open) => {
            setWarehouseDrawerOpen(open)
            if (!open) {
              void rematchRowsWithWarehouses()
            }
          }}
          initialData={
            warehouseDraftName
              ? {
                  pickup: {
                    addressNickname: warehouseDraftName,
                  },
                }
              : undefined
          }
        />
      </CustomDrawer>

      <CustomDrawer
        width={1180}
        open={Boolean(editDraft)}
        onClose={closeEditRow}
        title={`Edit Row ${editingRowNumber ?? ''}`}
      >
        {editDraft ? (
          <Stack spacing={2}>
            <Alert severity="info">
              Save changes to update this row. After editing, courier and order-ID validation will
              run again before final submit.
            </Alert>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Warehouse Name"
                value={editDraft.warehouseName}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, warehouseName: event.target.value })
                }
              />
              <TextField
                fullWidth
                type="date"
                label="Pickup Date"
                InputLabelProps={{ shrink: true }}
                value={editDraft.pickupDate}
                onChange={(event) => setEditDraft({ ...editDraft, pickupDate: event.target.value })}
              />
              <TextField
                fullWidth
                type="time"
                label="Pickup Time"
                InputLabelProps={{ shrink: true }}
                value={editDraft.pickupTime}
                onChange={(event) => setEditDraft({ ...editDraft, pickupTime: event.target.value })}
              />
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Order ID"
                value={editDraft.orderId}
                onChange={(event) => setEditDraft({ ...editDraft, orderId: event.target.value })}
              />
              <TextField
                fullWidth
                type="date"
                label="Order Date"
                InputLabelProps={{ shrink: true }}
                value={editDraft.orderDate}
                onChange={(event) => setEditDraft({ ...editDraft, orderDate: event.target.value })}
              />
              <TextField
                select
                fullWidth
                label="Order Type"
                value={editDraft.orderType}
                onChange={(event) =>
                  setEditDraft({
                    ...editDraft,
                    orderType: event.target.value as 'cod' | 'prepaid',
                  })
                }
              >
                <MenuItem value="prepaid">Prepaid</MenuItem>
                <MenuItem value="cod">COD</MenuItem>
              </TextField>
            </Stack>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Buyer Name"
                value={editDraft.buyerName}
                onChange={(event) => setEditDraft({ ...editDraft, buyerName: event.target.value })}
              />
              <TextField
                fullWidth
                label="Buyer Phone"
                value={editDraft.buyerPhone}
                onChange={(event) => setEditDraft({ ...editDraft, buyerPhone: event.target.value })}
              />
              <TextField
                fullWidth
                label="Buyer Email"
                value={editDraft.buyerEmail}
                onChange={(event) => setEditDraft({ ...editDraft, buyerEmail: event.target.value })}
              />
            </Stack>
            <TextField
              fullWidth
              label="Address"
              value={editDraft.address}
              onChange={(event) => setEditDraft({ ...editDraft, address: event.target.value })}
            />
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Address 2"
                value={editDraft.address2}
                onChange={(event) => setEditDraft({ ...editDraft, address2: event.target.value })}
              />
              <TextField
                fullWidth
                label="City"
                value={editDraft.city}
                onChange={(event) => setEditDraft({ ...editDraft, city: event.target.value })}
              />
              <TextField
                fullWidth
                label="State"
                value={editDraft.state}
                onChange={(event) => setEditDraft({ ...editDraft, state: event.target.value })}
              />
              <TextField
                fullWidth
                label="Pincode"
                value={editDraft.pincode}
                onChange={(event) => setEditDraft({ ...editDraft, pincode: event.target.value })}
              />
            </Stack>
            <Paper elevation={0} sx={{ p: 2.25, borderRadius: 3, border: '1px solid #E2E8F0' }}>
              <Stack spacing={1.5}>
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  justifyContent="space-between"
                  spacing={1}
                >
                  <Stack spacing={0.5}>
                    <Typography fontWeight={700} sx={{ color: TEXT_PRIMARY }}>
                      Products
                    </Typography>
                    <Typography variant="body2" sx={{ color: TEXT_MUTED }}>
                      Each product now gets its own full row so it is easier to read and edit.
                    </Typography>
                  </Stack>
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() =>
                      setEditDraft({
                        ...editDraft,
                        products: [
                          ...editDraft.products,
                          {
                            name: '',
                            sku: '',
                            hsnCode: '',
                            price: '',
                            quantity: '1',
                            discount: '0',
                            taxRate: '0',
                          },
                        ],
                      })
                    }
                    sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                  >
                    Add Product
                  </Button>
                </Stack>

                {editDraft.products.map((product, index) => (
                  <Paper
                    key={`edit-product-${index}`}
                    elevation={0}
                    sx={{
                      p: 2,
                      borderRadius: 3,
                      border: '1px solid #D8E2F0',
                      bgcolor: '#F8FBFF',
                    }}
                  >
                    <Stack spacing={1.5}>
                      <Stack
                        direction={{ xs: 'column', sm: 'row' }}
                        justifyContent="space-between"
                        spacing={1}
                      >
                        <Typography fontWeight={700} sx={{ color: TEXT_PRIMARY }}>
                          Product {index + 1}
                        </Typography>
                        {editDraft.products.length > 1 ? (
                          <Button
                            size="small"
                            color="error"
                            onClick={() =>
                              setEditDraft({
                                ...editDraft,
                                products: editDraft.products.filter(
                                  (_, productIndex) => productIndex !== index,
                                ),
                              })
                            }
                            sx={{ alignSelf: 'flex-start', textTransform: 'none' }}
                          >
                            Remove
                          </Button>
                        ) : null}
                      </Stack>

                      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
                        <TextField
                          fullWidth
                          label="Product Name"
                          value={product.name}
                          onChange={(event) =>
                            setEditDraft({
                              ...editDraft,
                              products: editDraft.products.map((currentProduct, productIndex) =>
                                productIndex === index
                                  ? { ...currentProduct, name: event.target.value }
                                  : currentProduct,
                              ),
                            })
                          }
                        />
                        <TextField
                          fullWidth
                          label="SKU"
                          value={product.sku}
                          onChange={(event) =>
                            setEditDraft({
                              ...editDraft,
                              products: editDraft.products.map((currentProduct, productIndex) =>
                                productIndex === index
                                  ? { ...currentProduct, sku: event.target.value }
                                  : currentProduct,
                              ),
                            })
                          }
                        />
                        <TextField
                          fullWidth
                          label="HSN Code"
                          value={product.hsnCode}
                          onChange={(event) =>
                            setEditDraft({
                              ...editDraft,
                              products: editDraft.products.map((currentProduct, productIndex) =>
                                productIndex === index
                                  ? { ...currentProduct, hsnCode: event.target.value }
                                  : currentProduct,
                              ),
                            })
                          }
                        />
                      </Stack>

                      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                        <TextField
                          fullWidth
                          label="Price"
                          value={product.price}
                          onChange={(event) =>
                            setEditDraft({
                              ...editDraft,
                              products: editDraft.products.map((currentProduct, productIndex) =>
                                productIndex === index
                                  ? { ...currentProduct, price: event.target.value }
                                  : currentProduct,
                              ),
                            })
                          }
                        />
                        <TextField
                          fullWidth
                          label="Quantity"
                          value={product.quantity}
                          onChange={(event) =>
                            setEditDraft({
                              ...editDraft,
                              products: editDraft.products.map((currentProduct, productIndex) =>
                                productIndex === index
                                  ? { ...currentProduct, quantity: event.target.value }
                                  : currentProduct,
                              ),
                            })
                          }
                        />
                        <TextField
                          fullWidth
                          label="Product Discount"
                          value={product.discount}
                          onChange={(event) =>
                            setEditDraft({
                              ...editDraft,
                              products: editDraft.products.map((currentProduct, productIndex) =>
                                productIndex === index
                                  ? { ...currentProduct, discount: event.target.value }
                                  : currentProduct,
                              ),
                            })
                          }
                        />
                        <TextField
                          fullWidth
                          label="Tax Rate"
                          value={product.taxRate}
                          onChange={(event) =>
                            setEditDraft({
                              ...editDraft,
                              products: editDraft.products.map((currentProduct, productIndex) =>
                                productIndex === index
                                  ? { ...currentProduct, taxRate: event.target.value }
                                  : currentProduct,
                              ),
                            })
                          }
                        />
                      </Stack>
                    </Stack>
                  </Paper>
                ))}
              </Stack>
            </Paper>

            <Paper elevation={0} sx={{ p: 2.25, borderRadius: 3, border: '1px solid #E2E8F0' }}>
              <Stack spacing={1.5}>
                <Typography fontWeight={700} sx={{ color: TEXT_PRIMARY }}>
                  Package Details
                </Typography>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  <TextField
                    fullWidth
                    label="Weight (g)"
                    value={editDraft.weight}
                    onChange={(event) => setEditDraft({ ...editDraft, weight: event.target.value })}
                  />
                  <TextField
                    fullWidth
                    label="Length"
                    value={editDraft.length}
                    onChange={(event) => setEditDraft({ ...editDraft, length: event.target.value })}
                  />
                  <TextField
                    fullWidth
                    label="Breadth"
                    value={editDraft.breadth}
                    onChange={(event) =>
                      setEditDraft({ ...editDraft, breadth: event.target.value })
                    }
                  />
                  <TextField
                    fullWidth
                    label="Height"
                    value={editDraft.height}
                    onChange={(event) => setEditDraft({ ...editDraft, height: event.target.value })}
                  />
                </Stack>
              </Stack>
            </Paper>
            <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
              <TextField
                fullWidth
                label="Shipping Charges"
                value={editDraft.shippingCharges}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, shippingCharges: event.target.value })
                }
              />
              <TextField
                fullWidth
                label="Prepaid Amount"
                value={editDraft.prepaidAmount}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, prepaidAmount: event.target.value })
                }
              />
              <TextField
                fullWidth
                label="Gift Wrap"
                value={editDraft.giftWrap}
                onChange={(event) => setEditDraft({ ...editDraft, giftWrap: event.target.value })}
              />
              <TextField
                fullWidth
                label="Transaction Fee"
                value={editDraft.transactionFee}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, transactionFee: event.target.value })
                }
              />
              <TextField
                fullWidth
                label="Order Discount"
                value={editDraft.orderDiscount}
                onChange={(event) =>
                  setEditDraft({ ...editDraft, orderDiscount: event.target.value })
                }
              />
            </Stack>
            <DialogActions sx={{ px: 0 }}>
              <Button onClick={closeEditRow}>Cancel</Button>
              <Button variant="contained" onClick={handleSaveEdit} sx={{ backgroundColor: ACCENT }}>
                Save Changes
              </Button>
            </DialogActions>
          </Stack>
        ) : null}
      </CustomDrawer>
    </Stack>
  )
}
