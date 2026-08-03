import axios, { type AxiosRequestConfig } from 'axios'
import qs from 'qs'
import { DelhiveryManifestError, HttpError } from '../../../utils/classes'
import {
  normalizeCourierId,
  resolveDelhiveryShippingMode,
} from '../../../utils/delhiveryCourier'
import { getDelhiveryCredentials } from '../delhiveryCredentials.service'
import { ShipmentParams } from '../shiprocket.service'

export type DelhiveryPincodeSummary = {
  pincode: string | null
  serviceable: boolean
  embargoed: boolean
  remark: string
  pickup: boolean
  prepaid: boolean
  cod: boolean
  reversePickup: boolean
}

export type DelhiveryHeavyPincodeSummary = {
  pincode: string | null
  productType: 'Heavy'
  serviceable: boolean
  nsz: boolean
  paymentTypes: string[]
  prepaid: boolean
  cod: boolean
  providerStatus: string
}

export const summarizeDelhiveryPincodeServiceability = (
  response: any,
): DelhiveryPincodeSummary => {
  const deliveryCodes = Array.isArray(response)
    ? response
    : Array.isArray(response?.delivery_codes)
      ? response.delivery_codes
      : []
  const postalCode = deliveryCodes[0]?.postal_code || null
  const remark = String(postalCode?.remark || '').trim()
  const embargoed = remark.toLowerCase().includes('embargo')

  return {
    pincode: postalCode?.pin ? String(postalCode.pin) : null,
    serviceable: Boolean(postalCode) && !embargoed,
    embargoed,
    remark,
    pickup: Boolean(postalCode) && !embargoed && postalCode.pickup === 'Y',
    prepaid: Boolean(postalCode) && !embargoed && postalCode.pre_paid === 'Y',
    cod: Boolean(postalCode) && !embargoed && postalCode.cod === 'Y',
    reversePickup: Boolean(postalCode) && !embargoed && postalCode.repl === 'Y',
  }
}

const isEnabledHeavyPaymentValue = (value: unknown) => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value > 0
  const normalized = String(value || '').trim().toLowerCase()
  return ['y', 'yes', 'true', '1', 'serviceable', 'available'].includes(normalized)
}

export const summarizeDelhiveryHeavyPincodeServiceability = (
  response: any,
): DelhiveryHeavyPincodeSummary => {
  const responseData = response?.data ?? response?.response ?? response
  const record = Array.isArray(responseData) ? responseData[0] ?? null : responseData
  const paymentValue =
    record?.payment_type ?? record?.payment_types ?? record?.paymentType ?? record?.payments ?? null
  const rawPaymentTypes = Array.isArray(paymentValue)
    ? paymentValue.map(String)
    : paymentValue && typeof paymentValue === 'object'
      ? Object.entries(paymentValue)
          .filter(([, value]) => isEnabledHeavyPaymentValue(value))
          .map(([key]) => key)
      : String(paymentValue || '').split(/[,|/]/)
  const paymentTypes = Array.from(
    new Set(
      rawPaymentTypes
        .map((value) => String(value).trim())
        .filter(Boolean)
        .map((value) => {
          const normalized = value.toLowerCase()
          if (normalized.includes('cod') || normalized.includes('cash')) return 'COD'
          if (normalized.includes('pre') || normalized.includes('ppd')) return 'Pre-paid'
          return value
        }),
    ),
  )
  const providerStatus = String(
    record?.status ??
      record?.serviceability ??
      record?.serviceable ??
      record?.message ??
      response?.status ??
      '',
  ).trim()
  const responseText = JSON.stringify(record ?? response ?? '').toLowerCase()
  const nsz = /(^|[^a-z])nsz([^a-z]|$)/i.test(responseText)
  const explicitServiceable =
    record?.serviceable === true ||
    ['y', 'yes', 'true', 'serviceable', 'available', 'success', 'sz'].includes(
      providerStatus.toLowerCase(),
    )

  return {
    pincode: record?.pincode || record?.pin ? String(record.pincode || record.pin) : null,
    productType: 'Heavy',
    serviceable: Boolean(record) && !nsz && (paymentTypes.length > 0 || explicitServiceable),
    nsz,
    paymentTypes,
    prepaid: paymentTypes.includes('Pre-paid'),
    cod: paymentTypes.includes('COD'),
    providerStatus,
  }
}

export type DelhiveryShippingCostParams = {
  originPincode: string
  destinationPincode: string
  weightGrams: number
  mode?: 'S' | 'E'
  status?: 'Delivered' | 'RTO'
  paymentType?: 'Pre-paid' | 'COD'
  codAmount?: number
}

export type DelhiveryTransportMode = 'S' | 'E' | 'N'
export type DelhiveryProductType = 'B2B' | 'B2C' | ''

export type DelhiveryExpectedTatSummary = {
  tatDays: number | null
  expectedDeliveryDate: string | null
  originPincode: string | null
  destinationPincode: string | null
  mode: DelhiveryTransportMode | null
  productType: DelhiveryProductType | null
  expectedPickupDate: string | null
}

export const summarizeDelhiveryExpectedTat = (
  response: any,
  request: {
    originPincode?: string
    destinationPincode?: string
    mode?: DelhiveryTransportMode
    productType?: DelhiveryProductType
    expectedPickupDate?: string
  } = {},
): DelhiveryExpectedTatSummary => {
  const responseData = response?.data ?? response?.response ?? response
  const record = Array.isArray(responseData) ? responseData[0] ?? {} : responseData ?? {}
  const rawTat = record?.tat ?? record?.expected_tat ?? record?.tat_days ?? record?.days ?? null
  const parsedTat =
    typeof rawTat === 'number'
      ? rawTat
      : String(rawTat || '').match(/\d+(?:\.\d+)?/)?.[0] ?? null
  const tatDays = parsedTat === null ? null : Number(parsedTat)

  return {
    tatDays: Number.isFinite(tatDays) ? tatDays : null,
    expectedDeliveryDate:
      record?.expected_delivery_date || record?.edd || record?.delivery_date || null,
    originPincode: String(
      record?.origin_pin || record?.origin_pincode || request.originPincode || '',
    ) || null,
    destinationPincode: String(
      record?.destination_pin || record?.destination_pincode || request.destinationPincode || '',
    ) || null,
    mode: (record?.mot || record?.mode || request.mode || null) as DelhiveryTransportMode | null,
    productType: (record?.pdt || record?.product_type || request.productType || null) as
      | DelhiveryProductType
      | null,
    expectedPickupDate:
      record?.expected_pickup_date || request.expectedPickupDate || null,
  }
}

export type DelhiveryShipmentUpdate = {
  name?: string
  phone?: string
  add?: string
  pin?: string
  products_desc?: string
  cod_amount?: number
  total_amount?: number
}

export type DelhiveryCredentialsOverride = {
  apiBase: string
  apiKey: string
  clientName: string
}

export type DelhiveryWaybillBatch = {
  requestedCount: number
  receivedCount: number
  waybills: string[]
}

export type DelhiverySingleWaybill = {
  waybill: string
}

export const normalizeDelhiveryWaybills = (response: unknown): string[] => {
  const candidates: string[] = []
  const append = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(append)
      return
    }
    if (typeof value === 'number' || typeof value === 'string') {
      String(value)
        .split(/[\s,]+/)
        .map((entry) => entry.trim())
        .filter(Boolean)
        .forEach((entry) => candidates.push(entry))
    }
  }

  if (Array.isArray(response) || typeof response === 'string' || typeof response === 'number') {
    append(response)
  } else if (response && typeof response === 'object') {
    const record = response as Record<string, unknown>
    append(record.waybills)
    append(record.waybill)

    const nested = record.data
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const nestedRecord = nested as Record<string, unknown>
      append(nestedRecord.waybills)
      append(nestedRecord.waybill)
    } else {
      append(nested)
    }
  }

  return Array.from(new Set(candidates))
}

const parseTimeout = (value: string | undefined, fallbackMs: number) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs
}

const extractProviderErrorMessage = (value: unknown): string | null => {
  if (!value) return null

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length > 0 ? normalized : null
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const message = extractProviderErrorMessage(entry)
      if (message) return message
    }
    return null
  }

  if (typeof value === 'object') {
    for (const nestedValue of Object.values(value as Record<string, unknown>)) {
      const message = extractProviderErrorMessage(nestedValue)
      if (message) return message
    }
  }

  return null
}

const isTimeoutError = (err: any) => {
  const message = String(err?.message || '')
    .trim()
    .toLowerCase()

  return (
    err?.code === 'ECONNABORTED' ||
    err?.code === 'ETIMEDOUT' ||
    message.includes('timeout') ||
    message.includes('timed out')
  )
}

const getExistingPickupRequestId = (message: unknown): string | null => {
  const normalized = String(message || '').trim()
  if (!normalized) return null

  const lower = normalized.toLowerCase()
  if (!lower.includes('pickup request') || !lower.includes('already exist')) {
    return null
  }

  return normalized.match(/pickup request\s+(\d+)/i)?.[1] || null
}

const normalizeDelhiveryWeightGrams = (value: unknown, fallbackGrams = 500) => {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return fallbackGrams

  // Shiplifi stores B2C weights in grams; older integrations may still send kg.
  return numericValue > 50 ? Math.round(numericValue) : Math.round(numericValue * 1000)
}

const delhiveryCancellationResponseText = (value: unknown) => {
  try {
    return JSON.stringify(value || {}).toLowerCase()
  } catch {
    return String(value || '').toLowerCase()
  }
}

const isDelhiveryAlreadyCancelledResponse = (value: unknown) => {
  const responseText = delhiveryCancellationResponseText(value)
  return responseText.includes('already cancelled') || responseText.includes('already canceled')
}

const getDelhiveryCancellationMessage = (value: unknown): string | null => {
  if (!value) return null

  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized ? normalized : null
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const message = getDelhiveryCancellationMessage(entry)
      if (message) return message
    }
    return null
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['message', 'remark', 'remarks', 'responseMsg', 'ReturnMessage']) {
      const direct = record[key]
      if (typeof direct === 'string' && direct.trim()) return direct.trim()
    }

    for (const key of ['packages', 'package', 'response', 'data']) {
      const nested = record[key]
      if (nested) {
        const message = getDelhiveryCancellationMessage(nested)
        if (message) return message
      }
    }
  }

  return null
}

export const isDelhiveryCancellationAccepted = (value: unknown) => {
  const result = value as any
  const responseText = delhiveryCancellationResponseText(value)
  const numericStatus = Number(result?.status ?? result?.responseCode ?? result?.code)
  const alreadyCancelled = isDelhiveryAlreadyCancelledResponse(value)
  const acceptedText =
    responseText.includes('cancelled') ||
    responseText.includes('canceled') ||
    responseText.includes('cancellation initiated') ||
    responseText.includes('cancellation accepted') ||
    responseText.includes('cancellation request accepted') ||
    responseText.includes('marked for cancellation')
  const rejectedText =
    responseText.includes('not accepted') ||
    responseText.includes('not found') ||
    responseText.includes('invalid') ||
    responseText.includes('failed') ||
    responseText.includes('failure') ||
    responseText.includes('error')

  return (
    alreadyCancelled ||
    result?.success === true ||
    result?.Success === true ||
    result?.status === true ||
    String(result?.status || '').toLowerCase() === 'success' ||
    String(result?.Status || '').toLowerCase() === 'success' ||
    (Number.isFinite(numericStatus) && numericStatus >= 200 && numericStatus < 300) ||
    result?.response?.status === true ||
    (acceptedText && !rejectedText)
  )
}

export class DelhiveryService {
  private apiBase = 'https://track.delhivery.com'
  private token = ''
  private clientName = ''
  private readonly credentialsOverride?: DelhiveryCredentialsOverride
  private readonly requestTimeoutMs = parseTimeout(process.env.DELHIVERY_REQUEST_TIMEOUT_MS, 30000)
  private readonly labelTimeoutMs = parseTimeout(process.env.DELHIVERY_LABEL_TIMEOUT_MS, 15000)

  constructor(credentialsOverride?: DelhiveryCredentialsOverride) {
    this.credentialsOverride = credentialsOverride
  }

  private async ensureCredentials() {
    if (this.credentialsOverride) {
      this.apiBase = this.credentialsOverride.apiBase.replace(/\/+$/, '')
      this.token = this.credentialsOverride.apiKey
      this.clientName = this.credentialsOverride.clientName
      return
    }
    const credentials = await getDelhiveryCredentials()
    this.apiBase = credentials.apiBase
    this.token = credentials.apiKey
    this.clientName = credentials.clientName
  }

  private get headers() {
    return {
      Authorization: `Token ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    }
  }

  private async postFormEncoded(path: string, payload: unknown) {
    await this.ensureCredentials()
    const encodedData = qs.stringify({
      format: 'json',
      data: JSON.stringify(payload),
    })

    return axios.post(`${this.apiBase}${path}`, encodedData, {
      headers: {
        Authorization: `Token ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: this.requestTimeoutMs,
    })
  }

  private async getWithTimeout(url: string, config: AxiosRequestConfig = {}, timeoutMs?: number) {
    return axios.get(url, {
      ...config,
      timeout: timeoutMs ?? this.requestTimeoutMs,
    })
  }

  private async postWithTimeout(
    url: string,
    data: unknown,
    config: AxiosRequestConfig = {},
    timeoutMs?: number,
  ) {
    return axios.post(url, data, {
      ...config,
      timeout: timeoutMs ?? this.requestTimeoutMs,
    })
  }

  // 🔹 1. Check Serviceability
  async checkServiceability(pincode: string) {
    const normalizedPincode = String(pincode || '').trim()
    if (!/^\d{6}$/.test(normalizedPincode)) {
      throw new HttpError(400, 'A valid 6-digit pincode is required')
    }

    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/c/api/pin-codes/json/?filter_codes=${encodeURIComponent(normalizedPincode)}`
      const res = await this.getWithTimeout(url, { headers: this.headers })
      const summary = summarizeDelhiveryPincodeServiceability(res.data)

      console.log('[Delhivery] Pincode serviceability checked', {
        pincode: normalizedPincode,
        status: res.status,
        serviceable: summary.serviceable,
        embargoed: summary.embargoed,
      })

      return res.data
    } catch (err: any) {
      if (err instanceof HttpError) throw err
      console.error('[Delhivery] Serviceability request failed', {
        pincode: normalizedPincode,
        status: err.response?.status,
        message: err.message,
      })
      throw new HttpError(
        typeof err.response?.status === 'number' ? err.response.status : 502,
        extractProviderErrorMessage(err.response?.data) ||
          'Failed to fetch Delhivery serviceability',
      )
    }
  }

  async checkHeavyServiceability(pincode: string, productType: 'Heavy' = 'Heavy') {
    const normalizedPincode = String(pincode || '').trim()
    if (!/^\d{6}$/.test(normalizedPincode)) {
      throw new HttpError(400, 'A valid 6-digit pincode is required')
    }
    if (productType !== 'Heavy') {
      throw new HttpError(400, 'product_type must be Heavy')
    }

    try {
      await this.ensureCredentials()
      const query = qs.stringify({ product_type: productType, pincode: normalizedPincode })
      const url = `${this.apiBase}/api/dc/fetch/serviceability/pincode?${query}`
      const res = await this.getWithTimeout(url, { headers: this.headers })
      const summary = summarizeDelhiveryHeavyPincodeServiceability(res.data)

      console.log('[Delhivery] Heavy pincode serviceability checked', {
        pincode: normalizedPincode,
        status: res.status,
        serviceable: summary.serviceable,
        nsz: summary.nsz,
        paymentTypes: summary.paymentTypes,
      })

      return res.data
    } catch (err: any) {
      if (err instanceof HttpError) throw err
      console.error('[Delhivery] Heavy serviceability request failed', {
        pincode: normalizedPincode,
        status: err.response?.status,
        message: err.message,
      })
      throw new HttpError(
        typeof err.response?.status === 'number' ? err.response.status : 502,
        extractProviderErrorMessage(err.response?.data) ||
          'Failed to fetch Delhivery Heavy serviceability',
      )
    }
  }

  // 🔹 2. Expected TAT (Transit Time)
  async getExpectedTATDetails(
    origin: string,
    destination: string,
    mot: DelhiveryTransportMode = 'S',
    pdt: DelhiveryProductType = 'B2C',
    expectedPickupDate?: string,
  ) {
    const originPincode = String(origin || '').trim()
    const destinationPincode = String(destination || '').trim()
    const normalizedMode = String(mot || '').trim().toUpperCase()
    const normalizedProductType = String(pdt ?? '').trim().toUpperCase()
    const normalizedPickupDate = String(expectedPickupDate || '').trim()

    if (!/^\d{6}$/.test(originPincode) || !/^\d{6}$/.test(destinationPincode)) {
      throw new HttpError(400, 'Valid 6-digit origin_pin and destination_pin are required')
    }
    if (!['S', 'E', 'N'].includes(normalizedMode)) {
      throw new HttpError(400, 'mot must be S, E, or N')
    }
    if (normalizedProductType && !['B2B', 'B2C'].includes(normalizedProductType)) {
      throw new HttpError(400, 'pdt must be B2B, B2C, or empty')
    }
    if (
      normalizedPickupDate &&
      !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(normalizedPickupDate)
    ) {
      throw new HttpError(
        400,
        'expected_pickup_date must use YYYY-MM-DD or YYYY-MM-DD HH:mm format',
      )
    }
    if (normalizedPickupDate) {
      const [datePart, timePart = '00:00'] = normalizedPickupDate.split(' ')
      const [year, month, day] = datePart.split('-').map(Number)
      const [hour, minute] = timePart.split(':').map(Number)
      const parsedPickupDate = new Date(Date.UTC(year, month - 1, day, hour, minute))
      if (
        Number.isNaN(parsedPickupDate.getTime()) ||
        parsedPickupDate.getUTCFullYear() !== year ||
        parsedPickupDate.getUTCMonth() !== month - 1 ||
        parsedPickupDate.getUTCDate() !== day ||
        parsedPickupDate.getUTCHours() !== hour ||
        parsedPickupDate.getUTCMinutes() !== minute
      ) {
        throw new HttpError(400, 'expected_pickup_date is not a valid calendar date')
      }
    }

    await this.ensureCredentials()
    const query = qs.stringify({
      origin_pin: originPincode,
      destination_pin: destinationPincode,
      mot: normalizedMode,
      ...(normalizedProductType ? { pdt: normalizedProductType } : {}),
      ...(normalizedPickupDate ? { expected_pickup_date: normalizedPickupDate } : {}),
    })
    const res = await this.getWithTimeout(`${this.apiBase}/api/dc/expected_tat?${query}`, {
      headers: this.headers,
    })
    return res.data
  }

  async getExpectedTAT(
    origin: string,
    destination: string,
    mot: DelhiveryTransportMode = 'S',
    pdt: DelhiveryProductType = 'B2C',
    expectedPickupDate?: string,
  ) {
    try {
      const response = await this.getExpectedTATDetails(
        origin,
        destination,
        mot,
        pdt,
        expectedPickupDate,
      )
      return summarizeDelhiveryExpectedTat(response).tatDays
    } catch (err: any) {
      console.error('[Delhivery] TAT request failed', {
        origin,
        destination,
        mode: mot,
        status: err.response?.status,
        message: err.message,
      })
      return null
    }
  }

  // 🔹 3. Fetch Waybills
  async fetchSingleWaybill(): Promise<DelhiverySingleWaybill> {
    try {
      await this.ensureCredentials()
      const query = qs.stringify({ token: this.token })
      const url = `${this.apiBase}/waybill/api/fetch/json/?${query}`
      const res = await this.getWithTimeout(url, {
        headers: { Accept: 'application/json' },
      })
      const waybill = normalizeDelhiveryWaybills(res.data)[0]

      if (!waybill) {
        throw new HttpError(
          502,
          extractProviderErrorMessage(res.data) || 'Delhivery returned no waybill',
        )
      }

      return { waybill }
    } catch (err: any) {
      if (err instanceof HttpError) throw err

      console.error('[Delhivery] Single waybill fetch failed', {
        status: err.response?.status,
        message: err.message,
      })
      throw new HttpError(
        Number(err.response?.status) || 502,
        extractProviderErrorMessage(err.response?.data) ||
          err.message ||
          'Failed to fetch a Delhivery waybill',
      )
    }
  }

  async fetchWaybills(count: number = 10): Promise<DelhiveryWaybillBatch> {
    const normalizedCount = Number(count)
    if (!Number.isInteger(normalizedCount) || normalizedCount < 1 || normalizedCount > 10000) {
      throw new HttpError(400, 'count must be an integer between 1 and 10000')
    }

    try {
      await this.ensureCredentials()
      const query = qs.stringify({
        token: this.token,
        count: normalizedCount,
      })
      const url = `${this.apiBase}/waybill/api/bulk/json/?${query}`
      const res = await this.getWithTimeout(url, {
        headers: { Accept: 'application/json' },
      })
      const waybills = normalizeDelhiveryWaybills(res.data)

      if (waybills.length === 0) {
        throw new HttpError(
          502,
          extractProviderErrorMessage(res.data) || 'Delhivery returned no waybills',
        )
      }

      return {
        requestedCount: normalizedCount,
        receivedCount: waybills.length,
        waybills,
      }
    } catch (err: any) {
      if (err instanceof HttpError) throw err

      console.error('[Delhivery] Bulk waybill fetch failed', {
        count: normalizedCount,
        status: err.response?.status,
        message: err.message,
      })
      throw new HttpError(
        Number(err.response?.status) || 502,
        extractProviderErrorMessage(err.response?.data) ||
          err.message ||
          'Failed to fetch Delhivery waybills',
      )
    }
  }

  // Calculate the provider charge without creating a shipment.
  async calculateShippingCost(params: DelhiveryShippingCostParams) {
    const originPincode = String(params.originPincode || '').trim()
    const destinationPincode = String(params.destinationPincode || '').trim()
    const weightGrams = Number(params.weightGrams)
    const codAmount = Number(params.codAmount || 0)

    if (!/^\d{6}$/.test(originPincode) || !/^\d{6}$/.test(destinationPincode)) {
      throw new HttpError(400, 'Valid 6-digit origin and destination pincodes are required')
    }
    if (!Number.isFinite(weightGrams) || weightGrams <= 0) {
      throw new HttpError(400, 'weightGrams must be a positive number')
    }
    if (!Number.isFinite(codAmount) || codAmount < 0) {
      throw new HttpError(400, 'codAmount must be a non-negative number')
    }

    await this.ensureCredentials()
    const query = qs.stringify({
      md: params.mode || 'S',
      ss: params.status || 'Delivered',
      d_pin: destinationPincode,
      o_pin: originPincode,
      cgm: Math.round(weightGrams),
      pt: params.paymentType || 'Pre-paid',
      ...(params.paymentType === 'COD' ? { cod: codAmount } : {}),
    })
    const res = await this.getWithTimeout(
      `${this.apiBase}/api/kinko/v1/invoice/charges/.json?${query}`,
      { headers: this.headers },
    )
    return res.data
  }

  // 🔹 4. Create Shipment (Manifestation)
  async createShipment(params: ShipmentParams, waybill?: string) {
    try {
      const input = params as ShipmentParams & Record<string, any>
      const normalizedCourierId = normalizeCourierId(params.courier_id)
      const requestedShippingMode =
        input.shipping_mode ?? input.shippingMode ?? input.courier_partner
      const shippingMode = resolveDelhiveryShippingMode({
        courierId: normalizedCourierId,
        mode: requestedShippingMode,
        courierName: params.courier_partner,
      }) || (!normalizedCourierId && !requestedShippingMode ? 'Surface' : null)
      if (shippingMode === null) {
        throw new HttpError(
          400,
          'shipping_mode must be Surface or Express, or courier_id must map to a Delhivery service.',
        )
      }

      const sanitizeString = (value?: string | null) => {
        if (!value) return ''
        return String(value).trim()
      }
      const sanitizePhone = (value?: string | null) => {
        const digits = String(value || '').replace(/\\D/g, '')
        return digits.length >= 10 ? digits.slice(-10) : digits
      }
      const sanitizePincode = (value?: string | number | null) => {
        if (value === undefined || value === null) return ''
        return String(value).trim()
      }
      const sanitizeBoolean = (value?: boolean | string | number | null) => {
        if (value === undefined || value === null) return undefined
        if (typeof value === 'boolean') return value
        const normalized = String(value).trim().toLowerCase()
        return ['true', '1', 'yes', 'y'].includes(normalized)
      }

      const nativePickupLocation =
        typeof input.pickup_location === 'string'
          ? input.pickup_location
          : input.pickup_location?.name
      const pickup = params.pickup || ({
        warehouse_name: nativePickupLocation,
        name: input.seller_name,
        address: input.seller_add,
        city: input.seller_city,
        state: input.seller_state,
        country: input.seller_country,
        pincode: input.seller_pin,
        phone: input.seller_phone,
      } as ShipmentParams['pickup'])
      const consignee = params.consignee || ({
        name: input.name,
        address: input.add,
        city: input.city,
        state: input.state,
        country: input.country,
        pincode: input.pin,
        phone: input.phone,
      } as ShipmentParams['consignee'])
      const boxes = Array.isArray(params.boxes) ? params.boxes : []
      const orderNumber = sanitizeString(params.order_number || input.order)
      const invoiceNumber = sanitizeString(params.invoice_number || input.seller_inv)
      const pickupDate = sanitizeString(params.pickup_date || pickup.pickup_date)
      const pickupTime = sanitizeString(params.pickup_time || pickup.pickup_time)
      const resolvedInvoiceNumber = invoiceNumber || orderNumber
      const orderAmount = Number(params.order_amount ?? input.total_amount ?? 0)
      const orderItems = Array.isArray(params.order_items) ? params.order_items : []
      const itemHsnCodes = Array.from(
        new Set(
          orderItems
            .map((item) => (item?.hsn || item?.hsnCode || '').toString().trim())
            .filter((code) => code.length > 0),
        ),
      )
      const directHsnCodes = Array.isArray(input.hsn_code)
        ? input.hsn_code
        : String(input.hsn_code || '').split(',')
      const hsnCodes = Array.from(
        new Set(
          [...itemHsnCodes, ...directHsnCodes.map(String)]
            .map((code) => code.trim())
            .filter(Boolean),
        ),
      )

      if (!orderNumber) {
        throw new HttpError(400, 'order/order_number is required to create a Delhivery shipment.')
      }
      if (!invoiceNumber) {
        console.warn(
          `ℹ️ Delhivery invoice_number missing for order ${orderNumber}; using order_number as fallback.`,
        )
      }
      // if (!invoiceNumber) {
      //   throw new HttpError(
      //     400,
      //     'invoice_number (invoice_reference) is mandatory for Delhivery B2C manifests. Please provide the seller invoice number.',
      //   )
      // }
      // if (!hsnCodes.length) {
      //   throw new HttpError(
      //     400,
      //     'Delhivery requires HSN/SAC codes for at least one of the products you are shipping. Attach HSN codes to your order items.',
      //   )
      // }
      if (!Number.isFinite(orderAmount) || orderAmount < 0) {
        throw new HttpError(
          400,
          'total_amount/order_amount must be a non-negative number.',
        )
      }
      const isMultiPiece = Boolean(params.mps || boxes.length > 1)
      if (isMultiPiece && boxes.length < 2) {
        throw new HttpError(
          400,
          'At least two boxes are required when mps is true.',
        )
      }
      if (isMultiPiece && boxes.some((box: any) => !sanitizeString(box?.waybill))) {
        throw new HttpError(400, 'Every Delhivery MPS box must have its own waybill.')
      }

      const pickupAddressParts = [
        sanitizeString(pickup.address),
        sanitizeString(pickup.address_2),
      ].filter((part) => part.length > 0)
      const pickupAddress =
        sanitizeString(input.seller_add) ||
        (pickupAddressParts.length > 0
          ? pickupAddressParts.join(', ')
          : sanitizeString(pickup.warehouse_name))

      const sellerName = sanitizeString(
        params.company?.name || input.seller_name || pickup.name || 'Shiplifi',
      )
      const sellerGst = sanitizeString(params.company?.gst || pickup.gst_number || '')
      const productNames = orderItems
        .map((item) => sanitizeString(item?.name))
        .filter((name) => name.length > 0)
      const productsDesc =
        sanitizeString(input.products_desc) ||
        (productNames.length ? productNames.join(', ') : 'General Merchandise')

      const consigneePhone = sanitizePhone(consignee.phone)
      const consigneeName = sanitizeString(consignee.name)
      const consigneeAddress = sanitizeString(consignee.address)
      const consigneePincode = sanitizePincode(consignee.pincode)
      if (!consigneeName) {
        throw new HttpError(400, 'Consignee name is required for Delhivery shipments.')
      }
      if (!consigneeAddress) {
        throw new HttpError(400, 'Consignee address is required for Delhivery shipments.')
      }
      if (!/^\d{6}$/.test(consigneePincode)) {
        throw new HttpError(400, 'Consignee pin must be a valid 6-digit pincode.')
      }
      if (consigneePhone.length !== 10) {
        throw new HttpError(
          400,
          'Consignee phone must contain at least 10 digits for Delhivery shipments.',
        )
      }
      const pickupPhone = sanitizePhone(pickup.phone)
      const pickupLocationName = sanitizeString(pickup.warehouse_name || nativePickupLocation)
      if (!pickupLocationName) {
        throw new HttpError(
          400,
          'pickup_location is required and must exactly match the registered warehouse name.',
        )
      }

      const orderDate =
        params.order_date instanceof Date
          ? params.order_date.toISOString().split('T')[0]
          : sanitizeString(params.order_date) || new Date().toISOString().split('T')[0]
      const invoiceDate =
        params.invoice_date && sanitizeString(params.invoice_date)
          ? sanitizeString(params.invoice_date)
          : orderDate
      const rawPaymentMode = sanitizeString(input.payment_mode || params.payment_type || 'prepaid')
        .toLowerCase()
      const paymentMode =
        rawPaymentMode === 'cod'
          ? 'COD'
          : ['pickup', 'reverse'].includes(rawPaymentMode)
            ? 'Pickup'
            : ['repl', 'replacement'].includes(rawPaymentMode)
              ? 'REPL'
              : rawPaymentMode === 'prepaid'
                ? 'Prepaid'
                : null
      if (!paymentMode) {
        throw new HttpError(400, 'payment_mode must be Pickup, COD, Prepaid, or REPL.')
      }
      if (isMultiPiece && paymentMode === 'REPL') {
        throw new HttpError(400, 'REPL shipments must use a single waybill.')
      }

      const rawCodAmount = Number(input.cod_amount ?? orderAmount)
      if (!Number.isFinite(rawCodAmount) || rawCodAmount < 0) {
        throw new HttpError(400, 'cod_amount must be a non-negative number.')
      }
      const codAmount = paymentMode === 'COD' ? rawCodAmount : 0
      const packageWeightGrams = normalizeDelhiveryWeightGrams(
        params.package_weight ?? input.weight,
      )
      const destinationCountry = sanitizeString(consignee.country || input.country) || 'India'
      const transportSpeed = sanitizeString(params.transport_speed || input.transport_speed)
        .toUpperCase()
      if (transportSpeed && !['F', 'D'].includes(transportSpeed)) {
        throw new HttpError(400, 'transport_speed must be F (NDD) or D (standard delivery).')
      }

      const manifestShipment: Record<string, any> = {
        order: orderNumber,
        order_date: orderDate,
        name: consigneeName,
        phone: consigneePhone,
        add: consigneeAddress,
        city: sanitizeString(consignee.city),
        state: sanitizeString(consignee.state),
        pin: consigneePincode,
        country: destinationCountry,
        payment_mode: paymentMode,
        cod_amount: codAmount,
        total_amount: orderAmount,
        products_desc: productsDesc,
        hsn_code: hsnCodes.join(', '),
        weight: packageWeightGrams,
        shipment_length: Number(params.package_length ?? input.shipment_length ?? 10),
        shipment_width: Number(params.package_breadth ?? input.shipment_width ?? 10),
        shipment_height: Number(params.package_height ?? input.shipment_height ?? 10),
        seller_name: sellerName,
        seller_add: pickupAddress,
        seller_city: sanitizeString(pickup.city),
        seller_state: sanitizeString(pickup.state),
        seller_pin: sanitizePincode(pickup.pincode),
        seller_phone: pickupPhone,
        seller_gst_tin: sellerGst,
        seller_inv: resolvedInvoiceNumber,
        invoice_reference: resolvedInvoiceNumber,
        invoice_date: invoiceDate,
        pickup_location: pickupLocationName,
        pickup_address: pickupAddress,
        pickup_city: sanitizeString(pickup.city),
        pickup_state: sanitizeString(pickup.state),
        pickup_pin: sanitizePincode(pickup.pincode),
        pickup_phone: pickupPhone,
        pickup_country: 'India',
        pickup_date: pickupDate || undefined,
        pickup_time: pickupTime || undefined,
        shipping_mode: shippingMode,
        product_type: params.product_type || params.productType || undefined,
        client_name: this.clientName || sellerName,
        client_gst_tin: sellerGst,
        waybill: waybill || sanitizeString(input.waybill) || undefined,
      }

      if (transportSpeed) {
        manifestShipment.transport_speed = transportSpeed
      }
      if (params.address_type) {
        manifestShipment.address_type = sanitizeString(params.address_type)
      }
      const ewbnValue =
        params.ewbn || params.ewb || params.ewbn_number || params.ewaybill_number || undefined
      if (ewbnValue) {
        manifestShipment.ewbn = sanitizeString(ewbnValue)
      }
      if (params.dangerous_good !== undefined) {
        manifestShipment.dangerous_good = sanitizeBoolean(params.dangerous_good)
      }
      if (params.fragile_shipment !== undefined) {
        manifestShipment.fragile_shipment = sanitizeBoolean(params.fragile_shipment)
      }
      if (params.plastic_packaging !== undefined) {
        manifestShipment.plastic_packaging = sanitizeBoolean(params.plastic_packaging)
      }
      const directQuantity = params.quantity ?? input.quantity
      if (directQuantity !== undefined && directQuantity !== null) {
        manifestShipment.quantity = sanitizeString(String(directQuantity))
      }

      const hasNativeReturnAddress = [
        input.return_name,
        input.return_add,
        input.return_address,
        input.return_city,
        input.return_state,
        input.return_pin,
        input.return_phone,
        input.return_country,
      ].some((value) => sanitizeString(value))
      const nativeReturnAddress = hasNativeReturnAddress
        ? {
            name: input.return_name,
            address: input.return_add || input.return_address,
            city: input.return_city,
            state: input.return_state,
            pincode: input.return_pin,
            phone: input.return_phone,
            country: input.return_country,
          }
        : null
      const explicitReturnAddress = params.rto || nativeReturnAddress
      const resolvedReturnAddress =
        explicitReturnAddress
          ? explicitReturnAddress
          : ['Pickup', 'REPL'].includes(paymentMode)
            ? pickup
            : null

      if (resolvedReturnAddress) {
        const usesRegisteredPickupAsReturn = resolvedReturnAddress === pickup
        Object.assign(manifestShipment, {
          return_name:
            sanitizeString(resolvedReturnAddress.name) ||
            (usesRegisteredPickupAsReturn ? pickupLocationName : ''),
          return_add:
            sanitizeString(resolvedReturnAddress.address) ||
            (usesRegisteredPickupAsReturn ? pickupAddress : ''),
          return_address:
            sanitizeString(resolvedReturnAddress.address) ||
            (usesRegisteredPickupAsReturn ? pickupAddress : ''),
          return_city: sanitizeString(resolvedReturnAddress.city),
          return_state: sanitizeString(resolvedReturnAddress.state),
          return_pin: sanitizePincode(resolvedReturnAddress.pincode),
          return_phone: sanitizePhone(resolvedReturnAddress.phone),
          return_country: sanitizeString(resolvedReturnAddress.country) || 'India',
        })
      }

      const manifestShipments: Record<string, any>[] = isMultiPiece
        ? boxes.map((box: any, index: number) => ({
            ...manifestShipment,
            order:
              sanitizeString(box?.order_number || box?.order) || `${orderNumber}-${index + 1}`,
            waybill: sanitizeString(box?.waybill),
            weight: normalizeDelhiveryWeightGrams(
              box?.weight ?? box?.package_weight ?? packageWeightGrams,
            ),
            shipment_length: Number(
              box?.shipment_length ?? box?.package_length ?? manifestShipment.shipment_length,
            ),
            shipment_width: Number(
              box?.shipment_width ?? box?.package_breadth ?? manifestShipment.shipment_width,
            ),
            shipment_height: Number(
              box?.shipment_height ?? box?.package_height ?? manifestShipment.shipment_height,
            ),
            products_desc: sanitizeString(box?.products_desc) || manifestShipment.products_desc,
            hsn_code: sanitizeString(box?.hsn_code) || manifestShipment.hsn_code,
            quantity:
              box?.quantity === undefined
                ? manifestShipment.quantity
                : sanitizeString(String(box.quantity)),
          }))
        : [manifestShipment]

      const duplicateWaybills = manifestShipments
        .map((shipment) => sanitizeString(shipment.waybill))
        .filter(Boolean)
        .filter((awb, index, all) => all.indexOf(awb) !== index)
      if (duplicateWaybills.length > 0) {
        throw new HttpError(400, 'Every Delhivery MPS box waybill must be unique.')
      }
      const manifestOrders = manifestShipments.map((shipment) => sanitizeString(shipment.order))
      if (new Set(manifestOrders).size !== manifestOrders.length) {
        throw new HttpError(400, 'Every Delhivery MPS box order must be unique.')
      }
      const hasInvalidDimensions = manifestShipments.some((shipment) =>
        ['weight', 'shipment_length', 'shipment_width', 'shipment_height'].some((field) => {
          const value = Number(shipment[field])
          return !Number.isFinite(value) || value <= 0
        }),
      )
      if (hasInvalidDimensions) {
        throw new HttpError(400, 'Shipment weight and dimensions must be positive numbers.')
      }

      const payload = {
        shipments: manifestShipments,
        pickup_location: {
          name: pickupLocationName,
        },
      }

      console.log('📤 Delhivery createShipment payload summary', {
        order: orderNumber,
        pickup_location: payload.shipments[0].pickup_location,
        pickup_date: payload.shipments[0].pickup_date ?? null,
        pickup_time: payload.shipments[0].pickup_time ?? null,
        weight_g: packageWeightGrams,
        payment_mode: paymentMode,
        hsn_present: hsnCodes.length,
        invoice_number: invoiceNumber,
        shipping_mode: shippingMode,
        cod_amount: codAmount,
        package_count: manifestShipments.length,
      })

      const res = await this.postFormEncoded('/api/cmu/create.json', payload)
      const responseData = res.data

      const packages: any[] = Array.isArray(responseData?.packages)
        ? responseData.packages
        : responseData?.packages
          ? [responseData.packages]
          : []

      const normalizedStatus = (value?: string) => (value || '').toLowerCase()
      const normalizeRemarks = (remarks: unknown): string[] => {
        if (!remarks) return []
        if (Array.isArray(remarks)) {
          return remarks
            .flatMap((entry) => normalizeRemarks(entry))
            .filter((entry) => entry.trim().length > 0)
        }
        if (typeof remarks === 'string') {
          return [remarks.trim()].filter(Boolean)
        }
        if (typeof remarks === 'object') {
          return Object.values(remarks as Record<string, unknown>)
            .flatMap((entry) => normalizeRemarks(entry))
            .filter((entry) => entry.trim().length > 0)
        }
        return [String(remarks).trim()].filter(Boolean)
      }
      const overallStatus = normalizedStatus(responseData?.status)
      const packageFailures = packages.filter(
        (pkg) =>
          normalizedStatus(pkg?.status) === 'fail' || pkg?.serviceable === false || !pkg?.waybill,
      )
      const packageFailuresWithRemarks = packageFailures.map((pkg) => ({
        ...pkg,
        remarks: normalizeRemarks(pkg?.remarks),
      }))
      const successPackage = packages.find(
        (pkg) =>
          pkg?.waybill && pkg?.serviceable !== false && normalizedStatus(pkg?.status) !== 'fail',
      )

      if (
        overallStatus === 'fail' ||
        responseData?.success === false ||
        responseData?.serviceable === false ||
        packageFailures.length > 0 ||
        packages.length < manifestShipments.length ||
        !successPackage
      ) {
        console.error('❌ Delhivery manifest rejected', {
          order: orderNumber,
          response: responseData,
          packageFailures: packageFailuresWithRemarks,
        })

        const failureReason =
          responseData?.message ||
          responseData?.status_message ||
          normalizeRemarks(responseData?.rmk).join(' | ') ||
          packageFailuresWithRemarks
            .map((pkg) => {
              const joinedRemarks = pkg.remarks.join(' | ')
              return (
                joinedRemarks ||
                pkg?.message ||
                pkg?.reason ||
                pkg?.rmk ||
                `status=${pkg?.status ?? 'unknown'}`
              )
            })
            .filter(Boolean)
            .join(' | ') ||
          'Delhivery reported a failure during shipment creation.'
        throw new DelhiveryManifestError(502, failureReason, responseData)
      }

      const responseShippingMode =
        responseData?.shipping_mode ??
        successPackage?.shipping_mode ??
        successPackage?.service_mode ??
        successPackage?.service_type ??
        successPackage?.mode ??
        null

      console.log('📤 Delhivery API response service', {
        order: orderNumber,
        requested_shipping_mode: shippingMode,
        response_shipping_mode: responseShippingMode,
        response_package_keys: successPackage ? Object.keys(successPackage) : [],
      })

      let sortCode: string | null = null
      if (successPackage) {
        sortCode =
          (successPackage.sort_code ||
            successPackage.sortCode ||
            successPackage.routing_code ||
            successPackage.routingCode) ??
          null
      }

      if (sortCode && successPackage) {
        successPackage.sort_code = sortCode
      }

      return responseData
    } catch (err: any) {
      console.error('Delhivery shipment error:', err.response?.data || err.message)
      if (err instanceof HttpError) {
        throw err
      }
      throw new Error('Delhivery shipment creation failed')
    }
  }

  // 🔹 6. Cancel Shipment
  async cancelShipment(waybill: string) {
    const normalizedWaybill = String(waybill || '').trim()
    if (!normalizedWaybill) {
      throw new HttpError(400, 'Delhivery AWB number is required for cancellation')
    }

    try {
      await this.ensureCredentials()
      console.log('🚚 Delhivery Cancel Shipment Request:', {
        waybill: normalizedWaybill,
        apiBase: this.apiBase,
      })

      const res = await this.postWithTimeout(
        `${this.apiBase}/api/p/edit`,
        { waybill: normalizedWaybill, cancellation: 'true' },
        {
          headers: {
            Authorization: `Token ${this.token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
      )

      console.log('📥 Delhivery Cancel Shipment Response:', {
        status: res.status,
        data: JSON.stringify(res.data, null, 2),
        success: res.data?.success,
        Success: res.data?.Success,
        statusField: res.data?.status,
        message: res.data?.message,
      })

      if (!isDelhiveryCancellationAccepted(res.data)) {
        const providerMessage =
          getDelhiveryCancellationMessage(res.data) ||
          extractProviderErrorMessage(res.data) ||
          'Delhivery cancellation not accepted'
        throw new Error(providerMessage)
      }

      return {
        success: true,
        status: 'success',
        provider: 'delhivery',
        awb_number: normalizedWaybill,
        alreadyCancelled: isDelhiveryAlreadyCancelledResponse(res.data),
        message:
          getDelhiveryCancellationMessage(res.data) ||
          (isDelhiveryAlreadyCancelledResponse(res.data)
            ? 'Delhivery shipment was already cancelled'
            : 'Delhivery cancellation accepted'),
        provider_response: res.data,
      }
    } catch (err: any) {
      console.error('❌ Delhivery cancellation error:', {
        waybill: normalizedWaybill,
        status: err.response?.status,
        data: JSON.stringify(err.response?.data, null, 2),
        message: err.message,
        stack: err.stack,
      })
      const providerMessage =
        extractProviderErrorMessage(err.response?.data) ||
        err.response?.data?.message ||
        err.message ||
        'Delhivery cancellation failed'
      throw new Error(providerMessage)
    }
  }

  // Update editable forward-shipment fields before Delhivery locks them in transit.
  async updateShipment(waybill: string, updates: DelhiveryShipmentUpdate) {
    const normalizedWaybill = String(waybill || '').trim()
    if (!normalizedWaybill) {
      throw new HttpError(400, 'Delhivery AWB number is required for shipment updates')
    }

    const allowedFields: Array<keyof DelhiveryShipmentUpdate> = [
      'name',
      'phone',
      'add',
      'pin',
      'products_desc',
      'cod_amount',
      'total_amount',
    ]
    const payload: Record<string, string | number> = { waybill: normalizedWaybill }
    for (const field of allowedFields) {
      const value = updates?.[field]
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        payload[field] = typeof value === 'number' ? value : String(value).trim()
      }
    }

    if (Object.keys(payload).length === 1) {
      throw new HttpError(400, 'At least one editable shipment field is required')
    }
    if (payload.pin && !/^\d{6}$/.test(String(payload.pin))) {
      throw new HttpError(400, 'pin must be a valid 6-digit pincode')
    }
    if (payload.phone) {
      const phone = String(payload.phone).replace(/\D/g, '').slice(-10)
      if (!/^\d{10}$/.test(phone)) {
        throw new HttpError(400, 'phone must contain 10 digits')
      }
      payload.phone = phone
    }

    await this.ensureCredentials()
    const res = await this.postWithTimeout(`${this.apiBase}/api/p/edit`, payload, {
      headers: this.headers,
    })
    return res.data
  }

  // 🔹 7. Track Shipment
  async trackShipment(awb: string) {
    await this.ensureCredentials()
    const res = await this.getWithTimeout(`${this.apiBase}/api/v1/packages/json/?waybill=${awb}`, {
      headers: this.headers,
    })
    return res.data
  }

  // 🔹 8. NDR Action (RE-ATTEMPT / PICKUP_RESCHEDULE)
  async submitNdrAction(
    actions: Array<{
      waybill: string
      act: 'RE-ATTEMPT' | 'DEFER_DLV' | 'EDIT_DETAILS' | 'PICKUP_RESCHEDULE'
      action_data?: Record<string, any>
    }>,
  ) {
    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/api/p/update`
      const payload = actions.map((action) => {
        const mappedAct = action.act === 'PICKUP_RESCHEDULE' ? 'DEFER_DLV' : action.act
        const actionData = { ...(action.action_data || {}) } as Record<string, any>

        if (mappedAct === 'DEFER_DLV') {
          const normalizedDeferredDate =
            actionData.deferred_date || actionData.deferment_date || actionData.defermentDate
          if (normalizedDeferredDate) {
            actionData.deferred_date = normalizedDeferredDate
          }
          delete actionData.deferment_date
          delete actionData.defermentDate
        }

        return {
          waybill: action.waybill,
          act: mappedAct,
          ...(Object.keys(actionData).length ? { action_data: actionData } : {}),
        }
      })
      const res = await this.postWithTimeout(url, { data: payload }, { headers: this.headers })
      return res.data // contains UPL id(s)
    } catch (err: any) {
      console.error('Delhivery NDR action error:', err.response?.data || err.message)
      throw new Error('Failed to submit Delhivery NDR action')
    }
  }

  // 🔹 9. Get NDR UPL Status
  async getNdrStatus(uplId: string, verbose: boolean = true) {
    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/api/cmu/get_bulk_upl/${encodeURIComponent(uplId)}?verbose=${
        verbose ? 'true' : 'false'
      }`
      const res = await this.getWithTimeout(url, { headers: this.headers })
      return res.data
    } catch (err: any) {
      console.error('Delhivery NDR status error:', err.response?.data || err.message)
      throw new Error('Failed to fetch Delhivery NDR status')
    }
  }

  // 🔹 8. Pickup Request (manual scheduling)
  async requestPickup(pickupData: any) {
    await this.ensureCredentials()
    const res = await this.postWithTimeout(`${this.apiBase}/fm/request/new/`, pickupData, {
      headers: this.headers,
    })
    return res.data
  }

  // services/delhivery.service.ts
  async createWarehouse(warehouse: {
    name: string
    registered_name?: string
    phone: string
    email?: string
    address: string
    city: string
    pin: string
    country?: string
    return_address: string
    return_city?: string
    return_pin?: string
    return_state?: string
    return_country?: string
  }) {
    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/api/backend/clientwarehouse/create/`
      const headers = {
        Authorization: `Token ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }

      const res = await this.postWithTimeout(url, warehouse, { headers })
      return res.data
    } catch (err: any) {
      console.error('❌ Delhivery warehouse creation error:', err.response?.data || err.message)
      // Re-throw original error so upstream callers can inspect Delhivery's response
      throw err
    }
  }

  async triggerDelhiveryPickupRequest(pickupLocationName: string, packageCount: number) {
    try {
      // 🔹 Current date in YYYY-MM-DD
      const now = new Date()
      const pickup_date = now.toISOString().split('T')[0]

      // 🔹 Pickup time → 1 hour from now (HH:mm:ss)
      const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)
      const pickup_time = oneHourLater.toTimeString().split(' ')[0] // "HH:mm:ss"

      const payload = {
        pickup_date,
        pickup_time,
        pickup_location: pickupLocationName,
        expected_package_count: packageCount,
      }

      const res = await this.requestPickup(payload)

      if (!res?.success) {
        console.error('❌ Delhivery pickup creation failed:', res)
        throw new Error(res?.message || 'Delhivery pickup request failed')
      }

      console.log(`✅ Pickup request created for ${pickupLocationName} (${packageCount} packages)`)
      return res
    } catch (err: any) {
      console.error('❌ Pickup request creation error:', err.message)
      throw err
    }
  }
  // 🔹 10. Create Reverse Shipment
  // Delhivery reverse shipments are created via the same create.json manifestation API,
  // with `package_type: "Pickup"` and reverse-specific shipment values.
  async createReverseShipment(params: {
    originalAwb: string
    originalOrderId?: string
    consignee: ShipmentParams['consignee']
    pickup: ShipmentParams['pickup']
    rto?: ShipmentParams['rto']
    order_amount?: number
    package_weight?: number
    package_length?: number
    package_breadth?: number
    package_height?: number
    order_items?: ShipmentParams['order_items']
  }) {
    try {
      const reverseDrop = params.rto ?? params.pickup
      const reversePayload: any = {
        shipments: [
          {
            order: params.originalOrderId || `REVERSE-${params.originalAwb}`,
            name: params.consignee?.name || '',
            phone: String(params.consignee?.phone || '')
              .replace(/\D/g, '')
              .slice(-10),
            add: params.consignee?.address || '',
            city: params.consignee?.city || '',
            state: params.consignee?.state || '',
            pin: String(params.consignee?.pincode || '')
              .padStart(6, '0')
              .slice(0, 6),
            country: 'India',
            payment_mode: 'Pickup',
            package_type: 'Pickup',
            total_amount: Number(params.order_amount || 0),
            cod_amount: '0',
            products_desc:
              params.order_items?.map((i) => i.name).join(', ') || 'Reverse Pickup Shipment',
            weight: normalizeDelhiveryWeightGrams(params.package_weight),
            shipment_length: Number(params.package_length ?? 10),
            shipment_width: Number(params.package_breadth ?? 10),
            shipment_height: Number(params.package_height ?? 10),
            pickup_location: params.pickup?.warehouse_name ?? 'Default Warehouse',
            seller_name: params.pickup?.name ?? 'Shiplifi',
            seller_add: params.pickup?.address ?? '',
            order_date: new Date().toISOString().split('T')[0],
            return_name: reverseDrop?.name ?? params.pickup?.name ?? 'Return',
            return_add: reverseDrop?.address ?? '',
            return_city: reverseDrop?.city ?? '',
            return_state: reverseDrop?.state ?? '',
            return_pin: String(reverseDrop?.pincode ?? '')
              .padStart(6, '0')
              .slice(0, 6),
            return_phone: String(reverseDrop?.phone ?? '')
              .replace(/\D/g, '')
              .slice(-10),
            return_country: 'India',
          },
        ],
      }

      if (params.order_items && params.order_items.length > 0) {
        reversePayload.shipments[0].products_desc = params.order_items
          .map((item) => item?.name || 'Item')
          .join(', ')
      }

      const res = await this.postFormEncoded('/api/cmu/create.json', reversePayload)

      if (!res.data?.packages?.length) {
        throw new Error('Delhivery reverse shipment creation failed - no packages returned')
      }

      const pkg = res.data.packages[0]
      const delhiveryCost =
        pkg?.charge || pkg?.amount || res.data?.charge || res.data?.amount || null

      return {
        success: true,
        packages: res.data.packages,
        upload_wbn: res.data.upload_wbn,
        shipment_id: res.data.upload_wbn,
        awb_number: pkg.waybill,
        courier_name: 'Delhivery',
        courier_cost: delhiveryCost ? Number(delhiveryCost) : null,
        status: 'booked',
      }
    } catch (err: any) {
      console.error('Delhivery reverse shipment error:', err.response?.data || err.message)
      throw new Error(err?.message || 'Delhivery reverse shipment creation failed')
    }
  }

  async updateWarehouse(data: {
    name: string // warehouse name (case-sensitive, cannot be changed)
    address?: string
    pin: string
    phone?: string
  }) {
    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/api/backend/clientwarehouse/edit/`
      const headers = {
        Authorization: `Token ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }

      const payload = {
        name: data.name,
        address: data.address,
        pin: data.pin,
        phone: data.phone,
      }

      const res = await this.postWithTimeout(url, payload, { headers })
      return res.data
    } catch (err: any) {
      console.error('❌ Delhivery warehouse update error:', err.response?.data || err.message)
      throw new Error('Failed to update Delhivery warehouse')
    }
  }

  async createPickupRequest({
    pickup_date,
    pickup_time,
    pickup_location,
    expected_package_count,
  }: {
    pickup_date: string
    pickup_time: string
    pickup_location: string
    expected_package_count: number
  }) {
    try {
      await this.ensureCredentials()
      const url = `${this.apiBase}/fm/request/new/`
      const payload = {
        pickup_date,
        pickup_time,
        pickup_location, // must exactly match warehouse name in Delhivery
        expected_package_count,
      }

      const headers = {
        Authorization: `Token ${this.token}`,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      }

      const res = await this.postWithTimeout(url, payload, { headers })
      const responseData = res.data
      const rejected =
        responseData?.success === false ||
        responseData?.status === false ||
        Boolean(responseData?.error) ||
        Boolean(responseData?.errors)

      if (rejected) {
        throw new Error(
          extractProviderErrorMessage(responseData) || 'Delhivery pickup request was rejected',
        )
      }

      return responseData
    } catch (err: any) {
      const providerError = err.response?.data
      const timeoutError = isTimeoutError(err)

      const providerMessage =
        (!timeoutError && extractProviderErrorMessage(providerError?.pickup_date)) ||
        extractProviderErrorMessage(providerError?.message) ||
        extractProviderErrorMessage(providerError?.error) ||
        (!timeoutError && extractProviderErrorMessage(providerError)) ||
        (typeof err.message === 'string' && err.message.trim().length > 0 && !timeoutError
          ? err.message.trim()
          : 'Pickup request is taking longer than expected. Please try again.')

      const existingPickupRequestId = getExistingPickupRequestId(providerMessage)
      if (existingPickupRequestId) {
        console.warn('ℹ️ Delhivery pickup request already exists; treating as accepted', {
          pickup_request_id: existingPickupRequestId,
          pickup_location,
          pickup_date,
          pickup_time,
          expected_package_count,
        })
        return {
          success: true,
          already_exists: true,
          pickup_request_id: existingPickupRequestId,
          message: providerMessage,
          provider_response: providerError || null,
        }
      }

      console.error('❌ Delhivery pickup request error:', providerError || err.message)

      const error = new Error(providerMessage)
      ;(error as any).statusCode = typeof err.response?.status === 'number'
        ? err.response.status
        : timeoutError
          ? 504
          : 500
      ;(error as any).details = providerError || null
      ;(error as any).isPickupRequestError = true
      ;(error as any).providerStatus = err.response?.status ?? null
      ;(error as any).providerStatusText = err.response?.statusText ?? null
      ;(error as any).code = err?.code ?? null
      throw error
    }
  }
  // 🔹 9. Fetch Shipping Label from Delhivery packing_slip API
  // format=json -> metadata (barcodes, sort code, etc.)
  // format=pdf  -> raw PDF bytes (used to ensure provider-side label generation activity)
  async generateLabel(awb: string, options: { format?: 'json' | 'pdf' } = { format: 'json' }) {
    await this.ensureCredentials()
    const format = options.format || 'json'
    const url = `${this.apiBase}/api/p/packing_slip?wbns=${encodeURIComponent(awb)}${
      format === 'pdf' ? '&pdf=true' : '&pdf=false'
    }`
    const responseType = format === 'pdf' ? 'arraybuffer' : 'json'
    const res = await this.getWithTimeout(
      url,
      {
      headers: this.headers,
      responseType,
      },
      format === 'pdf' ? this.labelTimeoutMs : this.requestTimeoutMs,
    )

    return format === 'pdf' ? Buffer.from(res.data) : res.data
  }

  // COD Settlement APIs not publicly available
  // Use CSV download from Delhivery dashboard instead:
  // Dashboard → Finances → Remittance → Download Report
}
