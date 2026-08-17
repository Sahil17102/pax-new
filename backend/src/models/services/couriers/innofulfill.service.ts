import axios, { type AxiosInstance } from 'axios'
import { HttpError } from '../../../utils/classes'
import {
  getEffectiveCourierConfig,
  updateInnofulfillTokenCache,
  type InnofulfillConfig,
} from '../courierCredentials.service'

const DEFAULT_API_BASE = 'https://apis.innofulfill.com'
const ECOMM_CARRIER_ID = 'dee69b40-c0f3-4a44-879a-8b6f6849efaa'
const ECOMM_CARRIER_NAME = 'innofulfill_ecomm'
const HYPERLOCAL_CARRIER_NAME = 'innofulfillHyperlocal'

const normalizeBase = (value?: string | null) =>
  String(value || DEFAULT_API_BASE)
    .trim()
    .replace(/\/+$/, '')

const normalizeText = (value: unknown, fallback = '') => {
  const normalized = String(value ?? '').trim()
  return normalized || fallback
}

const toNumber = (value: unknown, fallback = 0) => {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}

const normalizePhone = (value: unknown) => {
  const digits = String(value ?? '').replace(/\D/g, '')
  return digits.length > 10 ? digits.slice(-10) : digits
}

const normalizeWeightKg = (value: unknown, fallback = 0.5) => {
  const numeric = toNumber(value, fallback)
  if (!Number.isFinite(numeric) || numeric <= 0) return fallback
  return numeric > 50 ? Number((numeric / 1000).toFixed(3)) : numeric
}

const buildAddressName = (address: any) =>
  [
    address?.address,
    address?.address_2,
    address?.landmark,
    address?.city,
    address?.state,
    address?.pincode,
  ]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(', ')

const extractProviderData = (payload: any) => payload?.data ?? payload?.payload ?? payload

const extractOrderId = (payload: any) => {
  const data = extractProviderData(payload)
  return (
    normalizeText(data?.orderId) ||
    normalizeText(data?.order_id) ||
    normalizeText(data?.id) ||
    normalizeText(payload?.orderId) ||
    normalizeText(payload?.order_id)
  )
}

const extractAwb = (payload: any) => {
  const data = extractProviderData(payload)
  const shipment = Array.isArray(data?.shipments) ? data.shipments[0] : data?.shipments
  return (
    normalizeText(data?.awbNumber) ||
    normalizeText(data?.awb_number) ||
    normalizeText(shipment?.awbNumber) ||
    normalizeText(shipment?.awb_number) ||
    normalizeText(payload?.awbNumber) ||
    normalizeText(payload?.awb_number)
  )
}

const readBoolean = (value: unknown) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const normalized = String(value ?? '').trim().toLowerCase()
  if (['true', '1', 'yes', 'y', 'serviceable', 'success', 'ok'].includes(normalized)) return true
  if (['false', '0', 'no', 'n', 'not_serviceable', 'failed'].includes(normalized)) return false
  return undefined
}

export type InnofulfillServiceabilityResult = {
  serviceable: boolean
  codAvailable: boolean
  prepaidAvailable: boolean
  carriers: Array<{
    carrier: string
    serviceable: boolean
    reason: string
  }>
  fromPincode: number | null
  toPincode: number | null
  paymentMode: string
  operationType: string
  fromPincodeMetadata: any
  toPincodeMetadata: any
  pickupAddress: any
  shippingAddress: any
  pickupPincodeMetadata: any
  shippingPincodeMetadata: any
  account: any
  configuration: any
  distanceMeters: number | null
  distanceText: string
  durationSeconds: number | null
  durationText: string
  tat: number | null
  raw: any
}

export type InnofulfillEcommRateResult = {
  baseRate: number | null
  totalAmount: number | null
  baseAmount: number | null
  marginAmount: number | null
  chargesAmount: number | null
  discountsAmount: number | null
  taxesAmount: number | null
  charges: any[]
  taxSummary: any
  weightCalculation: any
  pincodeDetails: any
  zoneResolution: any
  deliveryMode: string
  serviceType: string
  productType: string
  raw: any
}

export type InnofulfillHyperlocalRateResult = InnofulfillEcommRateResult & {
  distance: number
}

export type InnofulfillOrderListQuery = {
  page?: number | string
  limit?: number | string
  sortOrder?: string
  orderId?: string
  referenceId?: string
  orderStatus?: string
  orderType?: string
  parcelCategory?: string
  deliveryMode?: string
  deliveryPromise?: string
  carrierName?: string
  awbNumber?: string
  phone?: string
  paymentType?: string
  startDate?: string
  endDate?: string
  manifested?: boolean | string
  autoManifest?: boolean | string
  returnable?: boolean | string
  filterByCurrentUser?: boolean | string
  bulkId?: string
  destinationCity?: string
  destinationZip?: string
  'addresses.type'?: string
  'addresses.state'?: string
  'addresses.city'?: string
  'addresses.zip'?: string
  'addresses.country'?: string
}

export type InnofulfillOrderListResult = {
  orders: any[]
  count: number
  page: number
  limit: number
  totalPages: number
  currentPage: number
  traceId: string
  raw: any
}

export type InnofulfillCreateOrderResult = {
  orderId: string
  referenceId: string
  awbNumber: string
  orderStatus: string
  parcelCategory: string
  deliveryMode: string
  carrierName: string
  carrierId: string
  raw: any
}

export type InnofulfillOrderDetailsResult = InnofulfillCreateOrderResult & {
  id: number | string | null
  orderType: string
  deliveryPromise: string
  expectedDeliveryDate: string
  addresses: any[]
  shipments: any[]
  payment: any
  taxes: any[]
  discounts: any[]
  documents: any[]
}

export type InnofulfillManifestOrdersResult = {
  queued: boolean
  message: string
  orderIds: string[]
  traceId: string
  raw: any
}

export type InnofulfillCancelOrderInput = {
  orderId: string
  reason: string
}

export type InnofulfillCancelOrdersResult = {
  cancelledCount: number
  orderIds: string[]
  message: string
  traceId: string
  raw: any
}

export type InnofulfillShippingLabelResult = {
  orderId: string
  tenantId: string
  userId: string
  contentType: string
  contentLength: number
  isPdf: boolean
  isBase64: boolean
  labelData: string
  message: string
  raw: any
}

export type InnofulfillInvoiceResult = {
  orderId: string
  type: string
  level: string
  contentType: string
  contentLength: number
  isPdf: boolean
  isBase64: boolean
  invoiceData: string
  message: string
  raw: any
}

export type InnofulfillTrackingResult = {
  awbNumber: string
  orderId: string
  currentStatus: string
  deliveryPartnerName: string
  sourceCity: string
  destinationCity: string
  bookingDate: string
  shipmentType: string
  movementType: string
  statuses: any[]
  latestStatus: any
  traceId: string
  raw: any
}

const ORDER_LIST_QUERY_KEYS = [
  'page',
  'limit',
  'sortOrder',
  'orderId',
  'referenceId',
  'orderStatus',
  'orderType',
  'parcelCategory',
  'deliveryMode',
  'deliveryPromise',
  'carrierName',
  'awbNumber',
  'phone',
  'paymentType',
  'startDate',
  'endDate',
  'manifested',
  'autoManifest',
  'returnable',
  'filterByCurrentUser',
  'bulkId',
  'destinationCity',
  'destinationZip',
  'addresses.type',
  'addresses.state',
  'addresses.city',
  'addresses.zip',
  'addresses.country',
] as const

export class InnofulfillService {
  private config: InnofulfillConfig | null | undefined
  private token: string | null = null
  private tokenExpiresAt = 0

  constructor(config?: InnofulfillConfig | null) {
    this.config = config
  }

  private async getConfig() {
    if (this.config !== undefined) return this.config
    this.config = await getEffectiveCourierConfig<InnofulfillConfig>('innofulfill', 'b2c')
    return this.config
  }

  private async getClient(requireAuth = true): Promise<AxiosInstance> {
    const config = await this.getConfig()
    const client = axios.create({
      baseURL: normalizeBase(config?.apiBase || process.env.INNOFULFILL_API_BASE),
      timeout: Number(process.env.INNOFULFILL_REQUEST_TIMEOUT_MS || 30000),
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!requireAuth) return client

    const apiKey = normalizeText(config?.apiKey || process.env.INNOFULFILL_API_KEY)
    const tenantId = normalizeText(config?.tenantId || process.env.INNOFULFILL_TENANT_ID)
    if (apiKey) {
      client.defaults.headers.common['api-key'] = apiKey
      client.defaults.headers.common['Api-Key'] = apiKey
      if (tenantId) {
        client.defaults.headers.common.tenantid = tenantId
        client.defaults.headers.common.TenantId = tenantId
      }
      return client
    }

    const token = await this.getIdToken()
    client.defaults.headers.common.Authorization = `Bearer ${token}`
    if (tenantId) {
      client.defaults.headers.common.tenantid = tenantId
      client.defaults.headers.common.tenantId = tenantId
      client.defaults.headers.common.TenantId = tenantId
    }
    return client
  }

  private handleError(error: any, fallback: string): never {
    const status = error?.response?.status ?? error?.status ?? 502
    const data = error?.response?.data
    const message =
      data?.message ||
      data?.error?.message ||
      (Array.isArray(data?.errors) ? data.errors.map((e: any) => e?.message).filter(Boolean).join('; ') : '') ||
      error?.message ||
      fallback
    throw new HttpError(status, `${fallback}: ${message}`)
  }

  private buildOrderListQuery(params: InnofulfillOrderListQuery = {}) {
    const query: Record<string, string | number | boolean> = {}

    for (const key of ORDER_LIST_QUERY_KEYS) {
      const value = params[key]
      if (value === undefined || value === null || value === '') continue
      if (typeof value === 'string') {
        const normalized = value.trim()
        if (!normalized) continue
        query[key] = normalized
      } else {
        query[key] = value
      }
    }

    if (query.page !== undefined) {
      const page = Number(query.page)
      if (!Number.isInteger(page) || page < 1) {
        throw new HttpError(400, 'Innofulfill order list page must be a positive integer')
      }
      query.page = page
    }

    if (query.limit !== undefined) {
      const limit = Number(query.limit)
      if (!Number.isInteger(limit) || limit < 1) {
        throw new HttpError(400, 'Innofulfill order list limit must be a positive integer')
      }
      query.limit = limit
    }

    if (query.sortOrder !== undefined) {
      const sortOrder = String(query.sortOrder).toUpperCase()
      if (!['ASC', 'DESC'].includes(sortOrder)) {
        throw new HttpError(400, 'Innofulfill order list sortOrder must be ASC or DESC')
      }
      query.sortOrder = sortOrder
    }

    for (const key of ['orderStatus', 'orderType', 'parcelCategory', 'deliveryMode', 'paymentType'] as const) {
      if (query[key] !== undefined) query[key] = String(query[key]).toUpperCase()
    }

    return query
  }

  private buildEcommOrderPayload(params: any) {
    const body = params?.referenceId && Array.isArray(params?.shipments) ? { ...params } : this.buildOrderPayload(params)
    const deliveryMode = normalizeText(body.deliveryMode || params?.deliveryMode || params?.shipping_mode, 'SURFACE').toUpperCase()
    const orderType = normalizeText(body.orderType || params?.orderType || 'FORWARD').toUpperCase()
    const pickup = Array.isArray(body.addresses)
      ? body.addresses.find((address: any) => normalizeText(address?.type).toUpperCase() === 'PICKUP')
      : null
    const delivery = Array.isArray(body.addresses)
      ? body.addresses.find((address: any) => normalizeText(address?.type).toUpperCase() === 'DELIVERY')
      : null

    if (!['FORWARD', 'REVERSE'].includes(orderType)) {
      throw new HttpError(400, 'Innofulfill ECOMM orderType must be FORWARD or REVERSE')
    }
    if (!['SURFACE', 'AIR'].includes(deliveryMode)) {
      throw new HttpError(400, 'Innofulfill ECOMM deliveryMode must be SURFACE or AIR')
    }
    if (!pickup || !delivery) {
      throw new HttpError(400, 'Innofulfill ECOMM order requires PICKUP and DELIVERY addresses')
    }
    if (!Array.isArray(body.shipments) || body.shipments.length === 0) {
      throw new HttpError(400, 'Innofulfill ECOMM order requires at least one shipment')
    }

    return {
      ...body,
      referenceId: normalizeText(body.referenceId, `REF-${Date.now()}`),
      orderDate: normalizeText(body.orderDate, new Date().toISOString()),
      orderType,
      orderStatus: normalizeText(body.orderStatus, 'CONFIRMED').toUpperCase(),
      parcelCategory: 'ECOMM',
      autoManifest: body.autoManifest ?? true,
      eWaybills: Array.isArray(body.eWaybills) ? body.eWaybills.map((value: any) => normalizeText(value)).filter(Boolean) : [],
      deliveryPromise: 'ECOMM',
      deliveryMode,
      documentType: normalizeText(body.documentType),
      taxes: Array.isArray(body.taxes) ? body.taxes : [],
      discounts: Array.isArray(body.discounts) ? body.discounts : [],
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : { source: 'pax_backend' },
      documents: Array.isArray(body.documents) ? body.documents : [],
      carrierId: ECOMM_CARRIER_ID,
      carrierName: ECOMM_CARRIER_NAME,
      payment: {
        ...(body.payment && typeof body.payment === 'object' ? body.payment : {}),
        type: normalizeText(body.payment?.type || params?.paymentType || params?.payment_type, 'PREPAID').toUpperCase(),
        currency: normalizeText(body.payment?.currency, 'INR').toUpperCase(),
        paymentMethod: normalizeText(body.payment?.paymentMethod, 'ONLINE').toUpperCase(),
      },
    }
  }

  private buildHyperlocalOrderPayload(params: any) {
    const body = params?.referenceId && Array.isArray(params?.shipments) ? { ...params } : this.buildOrderPayload({
      ...params,
      parcelCategory: 'HYPERLOCAL',
    })
    const orderType = normalizeText(body.orderType || params?.orderType || 'FORWARD').toUpperCase()
    const pickup = Array.isArray(body.addresses)
      ? body.addresses.find((address: any) => normalizeText(address?.type).toUpperCase() === 'PICKUP')
      : null
    const delivery = Array.isArray(body.addresses)
      ? body.addresses.find((address: any) => normalizeText(address?.type).toUpperCase() === 'DELIVERY')
      : null

    if (!['FORWARD', 'REVERSE'].includes(orderType)) {
      throw new HttpError(400, 'Innofulfill HYPERLOCAL orderType must be FORWARD or REVERSE')
    }
    if (!pickup || !delivery) {
      throw new HttpError(400, 'Innofulfill HYPERLOCAL order requires PICKUP and DELIVERY addresses')
    }
    if (!Array.isArray(body.shipments) || body.shipments.length === 0) {
      throw new HttpError(400, 'Innofulfill HYPERLOCAL order requires at least one shipment')
    }

    const rest = { ...body }
    delete rest.carrierId
    delete rest.autoManifest
    return {
      ...rest,
      referenceId: normalizeText(body.referenceId, `REF-${Date.now()}`),
      orderDate: normalizeText(body.orderDate, new Date().toISOString()),
      orderType,
      orderStatus: normalizeText(body.orderStatus, 'CONFIRMED').toUpperCase(),
      parcelCategory: 'HYPERLOCAL',
      eWaybills: Array.isArray(body.eWaybills) ? body.eWaybills.map((value: any) => normalizeText(value)).filter(Boolean) : [],
      deliveryPromise: 'HYPERLOCAL',
      deliveryMode: '',
      documentType: normalizeText(body.documentType),
      taxes: Array.isArray(body.taxes) ? body.taxes : [],
      discounts: Array.isArray(body.discounts) ? body.discounts : [],
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : { source: 'pax_backend' },
      documents: Array.isArray(body.documents) ? body.documents : [],
      carrierName: HYPERLOCAL_CARRIER_NAME,
      payment: {
        ...(body.payment && typeof body.payment === 'object' ? body.payment : {}),
        type: normalizeText(body.payment?.type || params?.paymentType || params?.payment_type, 'PREPAID').toUpperCase(),
        currency: normalizeText(body.payment?.currency, 'INR').toUpperCase(),
        paymentMethod: normalizeText(body.payment?.paymentMethod, 'ONLINE').toUpperCase(),
      },
    }
  }

  private summarizeCreateOrder(payload: any): InnofulfillCreateOrderResult {
    const data = extractProviderData(payload) || {}
    return {
      orderId: extractOrderId(payload),
      referenceId: normalizeText(data?.referenceId || data?.reference_id),
      awbNumber: extractAwb(payload),
      orderStatus: normalizeText(data?.orderStatus || data?.status),
      parcelCategory: normalizeText(data?.parcelCategory),
      deliveryMode: normalizeText(data?.deliveryMode),
      carrierName: normalizeText(data?.carrierName),
      carrierId: normalizeText(data?.carrierId),
      raw: payload,
    }
  }

  private summarizeOrderDetails(payload: any): InnofulfillOrderDetailsResult {
    const data = extractProviderData(payload) || {}
    return {
      ...this.summarizeCreateOrder(payload),
      id: data?.id ?? null,
      orderType: normalizeText(data?.orderType),
      deliveryPromise: normalizeText(data?.deliveryPromise),
      expectedDeliveryDate: normalizeText(data?.expectedDeliveryDate),
      addresses: Array.isArray(data?.addresses) ? data.addresses : [],
      shipments: Array.isArray(data?.shipments) ? data.shipments : [],
      payment: data?.payment ?? null,
      taxes: Array.isArray(data?.taxes) ? data.taxes : [],
      discounts: Array.isArray(data?.discounts) ? data.discounts : [],
      documents: Array.isArray(data?.documents) ? data.documents : [],
    }
  }

  private normalizeOrderIds(orderIds: unknown) {
    const values = Array.isArray(orderIds)
      ? orderIds
      : String(orderIds ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
    const normalized = Array.from(new Set(values.map((value) => normalizeText(value)).filter(Boolean)))
    if (!normalized.length) {
      throw new HttpError(400, 'Innofulfill manifest requires at least one orderId')
    }
    return normalized
  }

  private normalizeCancelOrders(orders: unknown, defaultReason = 'Customer Request'): InnofulfillCancelOrderInput[] {
    const values = Array.isArray(orders)
      ? orders
      : String(orders ?? '')
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
    const seen = new Set<string>()
    const normalized: InnofulfillCancelOrderInput[] = []

    for (const item of values) {
      const orderId =
        typeof item === 'object' && item !== null
          ? normalizeText((item as any).orderId || (item as any).order_id)
          : normalizeText(item)
      const reason =
        typeof item === 'object' && item !== null
          ? normalizeText((item as any).reason, defaultReason)
          : normalizeText(defaultReason)

      if (!orderId || seen.has(orderId)) continue
      if (!reason) throw new HttpError(400, 'Innofulfill cancellation reason is required for each order')
      seen.add(orderId)
      normalized.push({ orderId, reason })
    }

    if (!normalized.length) {
      throw new HttpError(400, 'Innofulfill bulk cancel requires at least one order')
    }

    return normalized
  }

  private buildShippingLabelPayload(payload: { orderId?: string; tenantId?: string; userId?: string }, config?: InnofulfillConfig | null) {
    const orderId = normalizeText(payload?.orderId)
    const tenantId = normalizeText(payload?.tenantId || config?.tenantId)
    const userId = normalizeText(payload?.userId || config?.userId)

    if (!orderId) throw new HttpError(400, 'Innofulfill shipping label requires orderId')
    if (!tenantId) throw new HttpError(400, 'Innofulfill shipping label requires tenantId')
    if (!userId) throw new HttpError(400, 'Innofulfill shipping label requires userId')

    return { orderId, tenantId, userId }
  }

  private summarizeShippingLabel(responseData: any, headers: any, requestBody: { orderId: string; tenantId: string; userId: string }): InnofulfillShippingLabelResult {
    const contentType = normalizeText(headers?.['content-type'] || headers?.['Content-Type'])
    const buffer = Buffer.isBuffer(responseData)
      ? responseData
      : responseData instanceof ArrayBuffer
        ? Buffer.from(responseData)
        : null
    let raw: any = responseData
    let labelData = ''
    let message = ''
    let isPdf = contentType.toLowerCase().includes('pdf')
    let isBase64 = false

    if (buffer) {
      const text = buffer.toString('utf8').trim()
      const looksJson = contentType.toLowerCase().includes('json') || text.startsWith('{') || text.startsWith('[')
      if (looksJson) {
        try {
          raw = JSON.parse(text)
        } catch {
          raw = text
        }
      } else {
        labelData = buffer.toString('base64')
        isBase64 = true
        isPdf = isPdf || buffer.subarray(0, 4).toString('utf8') === '%PDF'
      }
    }

    const providerData = typeof raw === 'object' && raw !== null ? raw?.data : raw
    if (!labelData && typeof providerData === 'string') {
      labelData = providerData
      isBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(providerData) && providerData.replace(/\s/g, '').length > 32
    }

    message = typeof raw === 'object' && raw !== null ? normalizeText(raw?.message) : ''

    return {
      ...requestBody,
      contentType,
      contentLength: buffer ? buffer.length : labelData.length,
      isPdf,
      isBase64,
      labelData,
      message,
      raw,
    }
  }

  private buildInvoiceRequest(orderId: unknown, params: { type?: string; level?: string } = {}) {
    const normalizedOrderId = normalizeText(orderId)
    const type = normalizeText(params.type, 'domestic').toLowerCase()
    const level = normalizeText(params.level, 'product').toLowerCase()

    if (!normalizedOrderId) throw new HttpError(400, 'Innofulfill invoice download requires orderId')
    if (!type) throw new HttpError(400, 'Innofulfill invoice type is required')
    if (!['product', 'shipping'].includes(level)) {
      throw new HttpError(400, 'Innofulfill invoice level must be product or shipping')
    }

    return { orderId: normalizedOrderId, type, level }
  }

  private summarizeInvoice(responseData: any, headers: any, request: { orderId: string; type: string; level: string }): InnofulfillInvoiceResult {
    const contentType = normalizeText(headers?.['content-type'] || headers?.['Content-Type'])
    const buffer = Buffer.isBuffer(responseData)
      ? responseData
      : responseData instanceof ArrayBuffer
        ? Buffer.from(responseData)
        : null
    let raw: any = responseData
    let invoiceData = ''
    let message = ''
    let isPdf = contentType.toLowerCase().includes('pdf')
    let isBase64 = false

    if (buffer) {
      const text = buffer.toString('utf8').trim()
      const looksJson = contentType.toLowerCase().includes('json') || text.startsWith('{') || text.startsWith('[')
      if (looksJson) {
        try {
          raw = JSON.parse(text)
        } catch {
          raw = text
        }
      } else {
        invoiceData = buffer.toString('base64')
        isBase64 = true
        isPdf = isPdf || buffer.subarray(0, 4).toString('utf8') === '%PDF'
      }
    }

    const providerData = typeof raw === 'object' && raw !== null ? raw?.data : raw
    if (!invoiceData && typeof providerData === 'string') {
      invoiceData = providerData
      isBase64 = /^[A-Za-z0-9+/=\r\n]+$/.test(providerData) && providerData.replace(/\s/g, '').length > 32
    }

    message = typeof raw === 'object' && raw !== null ? normalizeText(raw?.message) : ''

    return {
      ...request,
      contentType,
      contentLength: buffer ? buffer.length : invoiceData.length,
      isPdf,
      isBase64,
      invoiceData,
      message,
      raw,
    }
  }

  private summarizeTracking(payload: any, awbNumber: string): InnofulfillTrackingResult {
    const orderInformation = payload?.orderInformation || payload?.data?.orderInformation || {}
    const statuses = Array.isArray(payload?.statuses)
      ? payload.statuses
      : Array.isArray(payload?.data?.statuses)
        ? payload.data.statuses
        : []
    return {
      awbNumber: normalizeText(
        orderInformation?.trackingId || orderInformation?.cAwbNumber || payload?.awbNumber,
        awbNumber,
      ),
      orderId: normalizeText(orderInformation?.orderId || payload?.orderId),
      currentStatus: normalizeText(orderInformation?.currentStatus || statuses.at(-1)?.status),
      deliveryPartnerName: normalizeText(orderInformation?.deliveryPartnerName),
      sourceCity: normalizeText(orderInformation?.sourceLocation?.city),
      destinationCity: normalizeText(orderInformation?.destinationLocation?.city),
      bookingDate: normalizeText(orderInformation?.bookingDate),
      shipmentType: normalizeText(orderInformation?.type),
      movementType: normalizeText(orderInformation?.movement_type || orderInformation?.movementType),
      statuses,
      latestStatus: statuses.at(-1) || null,
      traceId: normalizeText(payload?.trace_id || payload?.traceId || payload?.data?.trace_id),
      raw: payload,
    }
  }

  private async persistAuthTokens(payload: any) {
    const config = await this.getConfig()
    const idToken = normalizeText(payload?.id_token || payload?.idToken)
    const refreshToken = normalizeText(payload?.refresh_token || payload?.refreshToken)
    const expiresIn = Number(payload?.expires_in || 86400)
    const userId = normalizeText(payload?.user_id || payload?.userId || config?.userId)
    const tenantId = normalizeText(payload?.tenant_id || payload?.tenantId || config?.tenantId)

    if (!idToken && !refreshToken) return

    this.token = idToken || this.token
    if (idToken) {
      this.tokenExpiresAt = Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 86400) * 1000
    }
    this.config = {
      ...(config || {}),
      ...(idToken ? { idToken } : {}),
      ...(refreshToken ? { refreshToken } : {}),
      ...(this.tokenExpiresAt ? { idTokenExpiresAt: new Date(this.tokenExpiresAt).toISOString() } : {}),
      ...(userId ? { userId } : {}),
      ...(tenantId ? { tenantId } : {}),
    }

    await updateInnofulfillTokenCache({
      idToken,
      refreshToken,
      expiresIn,
      userId,
      tenantId,
    }).catch((err: any) => {
      console.warn('[Innofulfill] Failed to persist rotated auth token metadata:', err?.message || err)
    })
  }

  async login(payload?: { username?: string; password?: string; signinType?: string }) {
    const config = await this.getConfig()
    const username = normalizeText(payload?.username || config?.username || process.env.INNOFULFILL_USERNAME)
    const password = normalizeText(payload?.password || config?.password || process.env.INNOFULFILL_PASSWORD)
    if (!username || !password) {
      throw new HttpError(400, 'Innofulfill username and password are required')
    }

    try {
      const client = await this.getClient(false)
      const { data } = await client.post('/auth/login', {
        username,
        password,
        signinType: payload?.signinType || 'EMAIL',
      })
      await this.persistAuthTokens(data)
      return data
    } catch (error: any) {
      this.handleError(error, 'Innofulfill login failed')
    }
  }

  async refreshToken(payload?: { userId?: string; refreshToken?: string }) {
    const config = await this.getConfig()
    const userId = normalizeText(payload?.userId || config?.userId || process.env.INNOFULFILL_USER_ID)
    const refreshToken = normalizeText(
      payload?.refreshToken || config?.refreshToken || process.env.INNOFULFILL_REFRESH_TOKEN,
    )
    if (!userId || !refreshToken) {
      throw new HttpError(400, 'Innofulfill userId and refreshToken are required')
    }

    try {
      const client = await this.getClient(false)
      const { data } = await client.post('/auth/refresh-token', { userId, refreshToken })
      await this.persistAuthTokens({
        ...data,
        user_id: userId,
      })
      return data
    } catch (error: any) {
      this.handleError(error, 'Innofulfill refresh-token request failed')
    }
  }

  private async getIdToken() {
    if (this.token && Date.now() < this.tokenExpiresAt - 60000) return this.token
    const config = await this.getConfig()
    const storedToken = normalizeText(config?.idToken)
    const storedTokenExpiresAt = config?.idTokenExpiresAt
      ? new Date(config.idTokenExpiresAt).getTime()
      : 0
    if (storedToken && Number.isFinite(storedTokenExpiresAt) && Date.now() < storedTokenExpiresAt - 60000) {
      this.token = storedToken
      this.tokenExpiresAt = storedTokenExpiresAt
      return storedToken
    }

    if (normalizeText(config?.refreshToken) && normalizeText(config?.userId)) {
      try {
        const refreshed = await this.refreshToken()
        const refreshedToken = normalizeText(refreshed?.id_token)
        if (refreshedToken) return refreshedToken
      } catch (err: any) {
        const status = err?.statusCode || err?.response?.status || err?.status
        if (status !== 401 && status !== 400) throw err
        console.warn('[Innofulfill] Refresh token rejected; falling back to email login')
      }
    }

    const login = await this.login()
    const token = normalizeText(login?.id_token)
    if (!token) throw new HttpError(502, 'Innofulfill login did not return an id_token')
    return token
  }

  async checkEcommServiceability(params: any): Promise<InnofulfillServiceabilityResult> {
    const fromPincode = Number(params.fromPincode ?? params.origin ?? params.pickupPincode)
    const toPincode = Number(params.toPincode ?? params.destination ?? params.dropPincode)
    const paymentMode = String(params.paymentMode || params.payment_type || 'PREPAID').toUpperCase()
    if (!Number.isInteger(fromPincode) || !Number.isInteger(toPincode)) {
      throw new HttpError(400, 'Innofulfill ECOMM serviceability requires fromPincode and toPincode')
    }
    if (!['PREPAID', 'COD'].includes(paymentMode)) {
      throw new HttpError(400, 'Innofulfill paymentMode must be PREPAID or COD')
    }

    const body = {
      fromPincode,
      toPincode,
      paymentMode,
      operationType: params.operationType || 'PICKUP_DELIVERY',
      carriers: params.carriers || ['SMILE'],
    }

    try {
      const client = await this.getClient()
      const { data } = await client.post('/gateway/serviceability/ecomm', body)
      return this.summarizeServiceability(data)
    } catch (error: any) {
      this.handleError(error, 'Innofulfill ECOMM serviceability failed')
    }
  }

  async checkHyperlocalServiceability(params: any): Promise<InnofulfillServiceabilityResult> {
    const paymentMode = String(params.paymentMode || params.payment_type || 'PREPAID').toUpperCase()
    if (!params.pickupAddress || typeof params.pickupAddress !== 'object') {
      throw new HttpError(400, 'Innofulfill Hyperlocal serviceability requires pickupAddress')
    }
    if (!params.shippingAddress || typeof params.shippingAddress !== 'object') {
      throw new HttpError(400, 'Innofulfill Hyperlocal serviceability requires shippingAddress')
    }
    if (!['PREPAID', 'COD'].includes(paymentMode)) {
      throw new HttpError(400, 'Innofulfill paymentMode must be PREPAID or COD')
    }

    const body = {
      pickupAddress: params.pickupAddress,
      shippingAddress: params.shippingAddress,
      paymentMode,
      operationType: params.operationType || 'PICKUP_DELIVERY',
      carriers: params.carriers || ['SMILE'],
    }

    try {
      const client = await this.getClient()
      const { data } = await client.post('/gateway/serviceability/hyperlocal', body)
      return this.summarizeServiceability(data)
    } catch (error: any) {
      this.handleError(error, 'Innofulfill HYPERLOCAL serviceability failed')
    }
  }

  async calculateEcommRate(params: any) {
    const fromPincode = Number(params.fromPincode ?? params.origin ?? params.pickupPincode)
    const toPincode = Number(params.toPincode ?? params.destination ?? params.dropPincode)
    const serviceType = normalizeText(params.serviceType || 'ECOMM').toUpperCase()
    const productType = normalizeText(params.productType || 'ECOMM').toUpperCase()
    const weight = toNumber(params.weight ?? params.package_weight, 0.5)
    const length = toNumber(params.length ?? params.package_length, 10)
    const height = toNumber(params.height ?? params.package_height, 10)
    const width = toNumber(params.width ?? params.breadth ?? params.package_breadth, 10)
    const deliveryMode = normalizeText(
      params.filters?.delivery_mode || params.deliveryMode || params.delivery_mode,
      'SURFACE',
    ).toUpperCase()

    if (!Number.isInteger(fromPincode) || !Number.isInteger(toPincode)) {
      throw new HttpError(400, 'Innofulfill ECOMM rate calculation requires fromPincode and toPincode')
    }
    if (serviceType !== 'ECOMM' || productType !== 'ECOMM') {
      throw new HttpError(400, 'Innofulfill serviceType and productType must both be ECOMM')
    }
    if (![weight, length, height, width].every((value) => Number.isFinite(value) && value > 0)) {
      throw new HttpError(400, 'Innofulfill weight, length, height, and width must be positive numbers')
    }
    if (!['SURFACE', 'AIR'].includes(deliveryMode)) {
      throw new HttpError(400, 'Innofulfill delivery_mode must be SURFACE or AIR')
    }

    const body = {
      fromPincode,
      toPincode,
      serviceType,
      productType,
      weight,
      length,
      height,
      width,
      includeDefaultCharges: params.includeDefaultCharges ?? false,
      userOptions: {
        insurance: {
          enabled: Boolean(params.insurance?.enabled ?? params.is_insurance),
          amount: toNumber(params.insurance?.amount ?? params.order_amount, 0),
        },
        cod: String(params.payment_type || params.paymentMode || '').toLowerCase() === 'cod',
      },
      filters: {
        delivery_mode: deliveryMode,
      },
    }

    try {
      const client = await this.getClient()
      const { data } = await client.post(
        '/gateway/ure/api/external/rate-calculation/calculate/v2',
        body,
      )
      return this.summarizeEcommRate(data, body)
    } catch (error: any) {
      this.handleError(error, 'Innofulfill rate calculation failed')
    }
  }

  async calculateHyperlocalRate(params: any): Promise<InnofulfillHyperlocalRateResult> {
    const fromPincode = Number(params.fromPincode ?? params.origin ?? params.pickupPincode)
    const toPincode = Number(params.toPincode ?? params.destination ?? params.dropPincode)
    const serviceType = normalizeText(params.serviceType || 'HYPERLOCAL').toUpperCase()
    const productType = normalizeText(params.productType || 'HYPERLOCAL').toUpperCase()
    const weight = toNumber(params.weight ?? params.package_weight, 0.5)
    const length = toNumber(params.length ?? params.package_length, 10)
    const height = toNumber(params.height ?? params.package_height, 10)
    const width = toNumber(params.width ?? params.breadth ?? params.package_breadth, 10)
    const distance = toNumber(params.distance ?? params.distanceKm ?? params.distance_km, 0)

    if (!Number.isInteger(fromPincode) || !Number.isInteger(toPincode)) {
      throw new HttpError(400, 'Innofulfill Hyperlocal rate calculation requires fromPincode and toPincode')
    }
    if (serviceType !== 'HYPERLOCAL' || productType !== 'HYPERLOCAL') {
      throw new HttpError(400, 'Innofulfill serviceType and productType must both be HYPERLOCAL')
    }
    if (![weight, length, height, width, distance].every((value) => Number.isFinite(value) && value > 0)) {
      throw new HttpError(
        400,
        'Innofulfill weight, length, height, width, and distance must be positive numbers',
      )
    }

    const body = {
      fromPincode,
      toPincode,
      serviceType,
      productType,
      weight,
      length,
      height,
      width,
      distance,
      includeDefaultCharges: params.includeDefaultCharges ?? false,
      userOptions: {
        insurance: {
          enabled: Boolean(params.userOptions?.insurance?.enabled ?? params.insurance?.enabled ?? params.is_insurance),
          amount: toNumber(params.userOptions?.insurance?.amount ?? params.insurance?.amount ?? params.order_amount, 0),
        },
        cod:
          params.userOptions?.cod ??
          String(params.payment_type || params.paymentMode || '').toLowerCase() === 'cod',
      },
      filters: {},
    }

    try {
      const client = await this.getClient()
      const { data } = await client.post(
        '/gateway/ure/api/external/rate-calculation/calculate/v2',
        body,
      )
      return {
        ...this.summarizeEcommRate(data, body),
        distance,
      }
    } catch (error: any) {
      this.handleError(error, 'Innofulfill hyperlocal rate calculation failed')
    }
  }

  private summarizeEcommRate(payload: any, requestBody: any): InnofulfillEcommRateResult {
    const data = payload?.data ?? payload ?? {}
    const pricing = data?.pricing ?? {}
    const calculation = data?.calculation ?? {}
    return {
      baseRate: Number.isFinite(Number(pricing?.baseRate)) ? Number(pricing.baseRate) : null,
      totalAmount: Number.isFinite(Number(calculation?.totalAmount))
        ? Number(calculation.totalAmount)
        : null,
      baseAmount: Number.isFinite(Number(calculation?.baseAmount))
        ? Number(calculation.baseAmount)
        : null,
      marginAmount: Number.isFinite(Number(calculation?.marginAmount))
        ? Number(calculation.marginAmount)
        : null,
      chargesAmount: Number.isFinite(Number(calculation?.charges))
        ? Number(calculation.charges)
        : null,
      discountsAmount: Number.isFinite(Number(calculation?.discounts))
        ? Number(calculation.discounts)
        : null,
      taxesAmount: Number.isFinite(Number(calculation?.taxes)) ? Number(calculation.taxes) : null,
      charges: Array.isArray(pricing?.charges) ? pricing.charges : [],
      taxSummary: data?.taxSummary ?? null,
      weightCalculation: data?.weightCalculation ?? null,
      pincodeDetails: data?.pincodeDetails ?? null,
      zoneResolution: data?.zoneResolution ?? null,
      deliveryMode: normalizeText(requestBody?.filters?.delivery_mode),
      serviceType: normalizeText(requestBody?.serviceType),
      productType: normalizeText(requestBody?.productType),
      raw: payload,
    }
  }

  private summarizeServiceability(payload: any): InnofulfillServiceabilityResult {
    const rows = Array.isArray(payload?.data) ? payload.data : [payload?.data || payload]
    const carrierRows = rows.flatMap((row: any) =>
      Array.isArray(row?.carriers) ? row.carriers : row?.carrier ? [row] : [],
    )
    const carriers = carrierRows.map((row: any) => ({
      carrier: normalizeText(row?.carrier || row?.carrierName || row?.name),
      serviceable: readBoolean(row?.serviceable) === true,
      reason: normalizeText(row?.reason || row?.message || row?.remarks),
    }))
    const serviceable =
      carriers.length > 0
        ? carriers.some((row: { serviceable: boolean }) => row.serviceable === true)
        : readBoolean(payload?.serviceable ?? payload?.success) === true
    const firstRow = rows.find((row: any) => row && typeof row === 'object') || {}
    return {
      serviceable,
      codAvailable: serviceable,
      prepaidAvailable: serviceable,
      carriers,
      fromPincode: firstRow?.fromPincode ? Number(firstRow.fromPincode) : null,
      toPincode: firstRow?.toPincode ? Number(firstRow.toPincode) : null,
      paymentMode: normalizeText(firstRow?.paymentMode),
      operationType: normalizeText(firstRow?.operationType),
      fromPincodeMetadata: firstRow?.fromPincodeMetadata ?? null,
      toPincodeMetadata: firstRow?.toPincodeMetadata ?? null,
      pickupAddress: firstRow?.pickupAddress ?? null,
      shippingAddress: firstRow?.shippingAddress ?? null,
      pickupPincodeMetadata: firstRow?.pickupPincodeMetadata ?? null,
      shippingPincodeMetadata: firstRow?.shippingPincodeMetadata ?? null,
      account: firstRow?.account ?? null,
      configuration: firstRow?.configuration ?? null,
      distanceMeters: firstRow?.distanceMeters ? Number(firstRow.distanceMeters) : null,
      distanceText: normalizeText(firstRow?.distanceText),
      durationSeconds: firstRow?.durationSeconds ? Number(firstRow.durationSeconds) : null,
      durationText: normalizeText(firstRow?.durationText),
      tat: null,
      raw: payload,
    }
  }

  buildOrderPayload(params: any) {
    const isHyperlocal =
      String(params.parcel_category || params.parcelCategory || '').toLowerCase() === 'hyperlocal' ||
      String(params.innofulfill_service_type || '').toLowerCase() === 'hyperlocal'
    const category = isHyperlocal ? 'HYPERLOCAL' : 'ECOMM'
    const paymentType = String(params.payment_type || '').toLowerCase() === 'cod' ? 'COD' : 'PREPAID'
    const paymentMethod = paymentType === 'COD' ? 'CASH' : 'ONLINE'
    const weightKg = normalizeWeightKg(params.package_weight ?? params.weight)
    const length = toNumber(params.package_length ?? params.length, 10)
    const width = toNumber(params.package_breadth ?? params.breadth ?? params.width, 10)
    const height = toNumber(params.package_height ?? params.height, 10)
    const volumetricWeight = Number(((length * width * height) / 5000).toFixed(3))
    const pickup = params.pickup || {}
    const consignee = params.consignee || {}
    const rto = params.rto || pickup
    const items = Array.isArray(params.order_items) && params.order_items.length
      ? params.order_items
      : [
          {
            name: params.product_type || params.productType || 'Product',
            sku: params.order_number || 'SKU',
            qty: 1,
            price: toNumber(params.order_amount, 0),
            hsn: '',
            tax_rate: 0,
          },
        ]

    const makeAddress = (type: string, source: any, fallbackEmail?: string) => ({
      type,
      zip: normalizeText(source?.pincode),
      name: normalizeText(source?.name || source?.warehouse_name || params.company?.name, 'Customer'),
      phone: normalizePhone(source?.phone),
      email: normalizeText(source?.email || fallbackEmail),
      street: normalizeText(source?.address),
      landmark: normalizeText(source?.address_2 || source?.landmark),
      city: normalizeText(source?.city),
      state: normalizeText(source?.state),
      country: normalizeText(source?.country, 'India'),
      ...(source?.latitude !== undefined ? { latitude: toNumber(source.latitude) } : {}),
      ...(source?.longitude !== undefined ? { longitude: toNumber(source.longitude) } : {}),
      addressName: buildAddressName(source),
      GSTNumber: normalizeText(source?.gst_number || source?.gstin || params.company?.gst),
    })

    return {
      referenceId: normalizeText(params.order_number, `REF-${Date.now()}`),
      orderDate: params.order_date instanceof Date
        ? params.order_date.toISOString()
        : normalizeText(params.order_date, new Date().toISOString()),
      orderType: params.payment_type === 'reverse' || params.isReverse ? 'REVERSE' : 'FORWARD',
      orderStatus: 'CONFIRMED',
      parcelCategory: category,
      ...(category === 'ECOMM' ? { autoManifest: params.autoManifest ?? true } : {}),
      eWaybills: [
        params.ewaybill_number,
        params.ewbn_number,
        params.ewbn,
        params.ewb,
        ...(Array.isArray(params.eWaybills) ? params.eWaybills : []),
      ]
        .map((value) => normalizeText(value))
        .filter(Boolean),
      deliveryPromise: category,
      deliveryMode: category === 'ECOMM' ? normalizeText(params.deliveryMode || params.shipping_mode, 'SURFACE').toUpperCase() : '',
      documentType: normalizeText(params.documentType),
      taxes: [],
      discounts: [],
      metadata: {
        source: 'pax_backend',
        order_number: params.order_number,
      },
      documents: [],
      addresses: [
        makeAddress('PICKUP', pickup),
        makeAddress('DELIVERY', consignee, consignee?.email),
        makeAddress('BILLING', consignee, consignee?.email),
        makeAddress('RETURN', rto),
      ],
      shipments: [
        {
          dimensions: { length, width, height },
          shipmentStatus: 'CONFIRMED',
          awbNumber: normalizeText(params.awb_number),
          physicalWeight: weightKg,
          physicalWeightUnit: 'KG',
          volumetricWeight,
          note: normalizeText(params.note),
          items: items.map((item: any) => ({
            name: normalizeText(item?.name, 'Product'),
            quantity: toNumber(item?.quantity ?? item?.qty, 1),
            unitPrice: toNumber(item?.unitPrice ?? item?.price, 0),
            sku: normalizeText(item?.sku, 'SKU'),
            hsnCode: normalizeText(item?.hsnCode ?? item?.hsn),
            description: normalizeText(item?.description || item?.name, 'Product'),
          })),
        },
      ],
      ...(category === 'ECOMM'
        ? { carrierId: ECOMM_CARRIER_ID, carrierName: ECOMM_CARRIER_NAME }
        : { carrierName: HYPERLOCAL_CARRIER_NAME }),
      payment: {
        type: paymentType,
        currency: 'INR',
        paymentMethod,
      },
    }
  }

  async createOrder(params: any) {
    const body = params?.referenceId && params?.shipments ? params : this.buildOrderPayload(params)
    try {
      const client = await this.getClient()
      const { data } = await client.post('/gateway/booking-service/orders', body)
      return data
    } catch (error: any) {
      this.handleError(error, 'Innofulfill order creation failed')
    }
  }

  async createEcommOrder(params: any): Promise<InnofulfillCreateOrderResult> {
    const body = this.buildEcommOrderPayload(params)
    try {
      const client = await this.getClient()
      const { data } = await client.post('/gateway/booking-service/orders', body)
      return this.summarizeCreateOrder(data)
    } catch (error: any) {
      this.handleError(error, 'Innofulfill ECOMM order creation failed')
    }
  }

  async createHyperlocalOrder(params: any): Promise<InnofulfillCreateOrderResult> {
    const body = this.buildHyperlocalOrderPayload(params)
    try {
      const client = await this.getClient()
      const { data } = await client.post('/gateway/booking-service/orders', body)
      return this.summarizeCreateOrder(data)
    } catch (error: any) {
      this.handleError(error, 'Innofulfill HYPERLOCAL order creation failed')
    }
  }

  async getOrder(orderId: string) {
    try {
      const client = await this.getClient()
      const { data } = await client.get(`/gateway/booking-service/orders/${encodeURIComponent(orderId)}`)
      return data
    } catch (error: any) {
      this.handleError(error, 'Innofulfill get-order request failed')
    }
  }

  async getOrderDetails(orderId: string): Promise<InnofulfillOrderDetailsResult> {
    const normalizedOrderId = normalizeText(orderId)
    if (!normalizedOrderId) {
      throw new HttpError(400, 'Innofulfill get-order request requires orderId')
    }

    try {
      const client = await this.getClient()
      const { data } = await client.get(
        `/gateway/booking-service/orders/${encodeURIComponent(normalizedOrderId)}`,
        { headers: { accept: 'application/json' } },
      )
      return this.summarizeOrderDetails(data)
    } catch (error: any) {
      this.handleError(error, 'Innofulfill get-order request failed')
    }
  }

  async listOrders(params: InnofulfillOrderListQuery = {}): Promise<InnofulfillOrderListResult> {
    try {
      const client = await this.getClient()
      const query = this.buildOrderListQuery(params)
      const { data } = await client.get('/gateway/booking-service/orders', { params: query })
      return {
        orders: Array.isArray(data?.data) ? data.data : [],
        count: Number(data?.count || 0),
        page: Number(data?.page || query.page || 1),
        limit: Number(data?.limit || query.limit || 0),
        totalPages: Number(data?.totalPages || 0),
        currentPage: Number(data?.currentPage || data?.page || query.page || 1),
        traceId: normalizeText(data?.traceId || data?.trace_id),
        raw: data,
      }
    } catch (error: any) {
      this.handleError(error, 'Innofulfill list-orders request failed')
    }
  }

  async manifestOrders(orderIds: string[]) {
    try {
      const normalizedOrderIds = this.normalizeOrderIds(orderIds)
      const client = await this.getClient()
      const { data } = await client.post('/gateway/booking-service/orders/manifest/bulk', {
        orderIds: normalizedOrderIds,
      })
      return data
    } catch (error: any) {
      this.handleError(error, 'Innofulfill bulk manifest failed')
    }
  }

  async manifestOrdersBulk(orderIds: unknown): Promise<InnofulfillManifestOrdersResult> {
    const normalizedOrderIds = this.normalizeOrderIds(orderIds)
    try {
      const client = await this.getClient()
      const { data } = await client.post('/gateway/booking-service/orders/manifest/bulk', {
        orderIds: normalizedOrderIds,
      })
      return {
        queued: data?.statusCode === 200 || normalizeText(data?.status).toLowerCase() === 'success',
        message: normalizeText(data?.message || data?.data),
        orderIds: normalizedOrderIds,
        traceId: normalizeText(data?.traceId || data?.trace_id),
        raw: data,
      }
    } catch (error: any) {
      this.handleError(error, 'Innofulfill bulk manifest failed')
    }
  }

  async cancelOrders(orderIds: string[], reason = 'Customer Request') {
    try {
      const orders = this.normalizeCancelOrders(orderIds, reason)
      const client = await this.getClient()
      const { data } = await client.post('/gateway/booking-service/orders/cancel/bulk', { orders })
      return data
    } catch (error: any) {
      this.handleError(error, 'Innofulfill bulk cancel failed')
    }
  }

  async cancelOrdersBulk(orders: unknown, defaultReason = 'Customer Request'): Promise<InnofulfillCancelOrdersResult> {
    const normalizedOrders = this.normalizeCancelOrders(orders, defaultReason)
    try {
      const client = await this.getClient()
      const { data } = await client.post('/gateway/booking-service/orders/cancel/bulk', {
        orders: normalizedOrders,
      })
      const responseData = data?.data || {}
      const orderIds = Array.isArray(responseData?.orderIds)
        ? responseData.orderIds.map((value: any) => normalizeText(value)).filter(Boolean)
        : normalizedOrders.map((order) => order.orderId)
      return {
        cancelledCount: Number(responseData?.cancelledCount || orderIds.length || 0),
        orderIds,
        message: normalizeText(data?.message),
        traceId: normalizeText(data?.traceId || data?.trace_id),
        raw: data,
      }
    } catch (error: any) {
      this.handleError(error, 'Innofulfill bulk cancel failed')
    }
  }

  async trackAwb(awbNumber: string) {
    try {
      const client = await this.getClient()
      const { data } = await client.get(
        `/gateway/tracking-v2/api/tracking/awb/${encodeURIComponent(awbNumber)}`,
      )
      return data
    } catch (error: any) {
      this.handleError(error, 'Innofulfill tracking failed')
    }
  }

  async trackAwbDetails(awbNumber: unknown): Promise<InnofulfillTrackingResult> {
    const normalizedAwb = normalizeText(awbNumber)
    if (!normalizedAwb) throw new HttpError(400, 'Innofulfill tracking requires awbNumber')

    try {
      const client = await this.getClient()
      const { data } = await client.get(
        `/gateway/tracking-v2/api/tracking/awb/${encodeURIComponent(normalizedAwb)}`,
        { headers: { accept: 'application/json' } },
      )
      return this.summarizeTracking(data, normalizedAwb)
    } catch (error: any) {
      this.handleError(error, 'Innofulfill tracking failed')
    }
  }

  async getLabelConfigs() {
    const client = await this.getClient()
    const { data } = await client.get('/gateway/pdf-generator/label-configs')
    return data
  }

  async getInvoiceConfigs() {
    const client = await this.getClient()
    const { data } = await client.get('/gateway/pdf-generator/invoice-configs')
    return data
  }

  async downloadShippingLabel(payload: { orderId: string; tenantId?: string; userId?: string }) {
    const config = await this.getConfig()
    const client = await this.getClient()
    const body = this.buildShippingLabelPayload(payload, config)
    const { data } = await client.post('/gateway/pdf-generator/shipping-label', body)
    return data
  }

  async downloadShippingLabelDetails(payload: { orderId?: string; tenantId?: string; userId?: string }): Promise<InnofulfillShippingLabelResult> {
    const config = await this.getConfig()
    const body = this.buildShippingLabelPayload(payload, config)
    try {
      const client = await this.getClient()
      const { data, headers } = await client.post('/gateway/pdf-generator/shipping-label', body, {
        responseType: 'arraybuffer',
      })
      return this.summarizeShippingLabel(data, headers, body)
    } catch (error: any) {
      this.handleError(error, 'Innofulfill shipping label download failed')
    }
  }

  async downloadInvoice(orderId: string, params: { type?: string; level?: string } = {}) {
    const client = await this.getClient()
    const request = this.buildInvoiceRequest(orderId, params)
    const { data } = await client.get(`/gateway/pdf-generator/invoice/${encodeURIComponent(request.orderId)}`, {
      params: {
        type: request.type,
        level: request.level,
      },
    })
    return data
  }

  async downloadInvoiceDetails(orderId: unknown, params: { type?: string; level?: string } = {}): Promise<InnofulfillInvoiceResult> {
    const request = this.buildInvoiceRequest(orderId, params)
    try {
      const client = await this.getClient()
      const { data, headers } = await client.get(
        `/gateway/pdf-generator/invoice/${encodeURIComponent(request.orderId)}`,
        {
          params: {
            type: request.type,
            level: request.level,
          },
          responseType: 'arraybuffer',
        },
      )
      return this.summarizeInvoice(data, headers, request)
    } catch (error: any) {
      this.handleError(error, 'Innofulfill invoice download failed')
    }
  }

  normalizeBookingResponse(payload: any, params: any) {
    const data = extractProviderData(payload)
    const orderId = extractOrderId(payload)
    const awb = extractAwb(payload) || orderId
    return {
      shipment_id: orderId || awb || normalizeText(params.order_number),
      awb_number: awb,
      order_id: orderId,
      courier_name: data?.carrierDisplayName || data?.carrierName || 'Innofulfill',
      courier_id: params.courier_id ?? null,
      provider_reference: orderId || awb,
      provider_request_id: orderId || awb,
      raw: payload,
    }
  }
}
