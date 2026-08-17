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
    const body = {
      fromPincode: Number(params.fromPincode ?? params.origin ?? params.pickupPincode),
      toPincode: Number(params.toPincode ?? params.destination ?? params.dropPincode),
      serviceType: params.serviceType || 'ECOMM',
      productType: params.productType || 'ECOMM',
      weight: toNumber(params.weight ?? params.package_weight, 0.5),
      length: toNumber(params.length ?? params.package_length, 10),
      height: toNumber(params.height ?? params.package_height, 10),
      width: toNumber(params.width ?? params.breadth ?? params.package_breadth, 10),
      includeDefaultCharges: params.includeDefaultCharges ?? false,
      userOptions: {
        insurance: {
          enabled: Boolean(params.insurance?.enabled ?? params.is_insurance),
          amount: toNumber(params.insurance?.amount ?? params.order_amount, 0),
        },
        cod: String(params.payment_type || params.paymentMode || '').toLowerCase() === 'cod',
      },
      filters: {
        delivery_mode: params.deliveryMode || params.delivery_mode || 'SURFACE',
      },
    }

    try {
      const client = await this.getClient()
      const { data } = await client.post(
        '/gateway/ure/api/external/rate-calculation/calculate/v2',
        body,
      )
      return data
    } catch (error: any) {
      this.handleError(error, 'Innofulfill rate calculation failed')
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

  async getOrder(orderId: string) {
    try {
      const client = await this.getClient()
      const { data } = await client.get(`/gateway/booking-service/orders/${encodeURIComponent(orderId)}`)
      return data
    } catch (error: any) {
      this.handleError(error, 'Innofulfill get-order request failed')
    }
  }

  async manifestOrders(orderIds: string[]) {
    try {
      const client = await this.getClient()
      const { data } = await client.post('/gateway/booking-service/orders/manifest/bulk', { orderIds })
      return data
    } catch (error: any) {
      this.handleError(error, 'Innofulfill bulk manifest failed')
    }
  }

  async cancelOrders(orderIds: string[]) {
    try {
      const client = await this.getClient()
      const { data } = await client.post('/gateway/booking-service/orders/cancel/bulk', { orderIds })
      return data
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
    const { data } = await client.post('/gateway/pdf-generator/shipping-label', {
      orderId: payload.orderId,
      tenantId: payload.tenantId || config?.tenantId,
      userId: payload.userId || config?.userId,
    })
    return data
  }

  async downloadInvoice(orderId: string, params: { type?: string; level?: string } = {}) {
    const client = await this.getClient()
    const { data } = await client.get(`/gateway/pdf-generator/invoice/${encodeURIComponent(orderId)}`, {
      params: {
        type: params.type || 'domestic',
        level: params.level || 'product',
      },
    })
    return data
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
