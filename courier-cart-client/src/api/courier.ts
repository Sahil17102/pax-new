// src/services/courierService.ts
import axiosInstance from './axiosInstance'

export interface Courier {
  id: number
  name: string
  displayName?: string | null
  integration_type?: string | null
  service_provider?: string | null
  serviceProvider?: string | null
  rate_card_id?: string | null
  courier_option_key?: string | null
  max_slab_weight?: number | null
  edd?: string | null
  tag?: string | null
  baseCourierId?: number | null
  masterCompany?: string | null
  realtimeTracking?: string | null
  deliveryBoyContact?: string | null
  podAvailable?: string | null
  callBeforeDelivery?: string | null
  activatedDate?: string | null
  mode?: number | null
  minWeight?: number | null
  courierType?: number | null
  isHyperlocal?: boolean
  isOwnKeyCourier?: boolean
  ownkeyCourierId?: number | null
  useSrPostcodes?: boolean
  serviceType?: number | null
  // Slabbed pricing fields returned by backend
  rate?: number | null
  chargeable_weight?: number | null
  volumetric_weight?: number | null
  slabs?: number | null
  courier_cost_estimate?: number | null
  gst_percent?: number | null
  gst_amount?: number | null
  total_charges_without_gst?: number | null
  total_charges_with_gst?: number | null
  wallet_debit_amount?: number | null
  tax_label?: string | null
  localRates?: Record<string, any>
  approxZone?: { id?: string; code?: string; name?: string } | null
}

export interface CourierSummary {
  totalCourierCount: number
  serviceablePincodesCount: number
  pickupPincodesCount: number
  totalRtoCount: number
  totalOdaCount: number
  updatedAt?: string
}

const isInnofulfillCourierEntry = (entry: any) => {
  if (typeof entry === 'string') {
    return entry.trim().toLowerCase().includes('innofulfill')
  }

  const tokens = [
    entry?.integration_type,
    entry?.integrationType,
    entry?.service_provider,
    entry?.serviceProvider,
    entry?.courier_partner,
    entry?.courierPartner,
    entry?.courier_name,
    entry?.courierName,
    entry?.name,
    entry?.displayName,
    entry?.label,
  ]

  return tokens.some((value) => {
    const normalized = String(value || '').trim().toLowerCase()
    return normalized.includes('innofulfill') || normalized.includes('innofulfil')
  })
}

const filterVisibleCouriers = <T,>(items: T[] | undefined | null): T[] => {
  if (!Array.isArray(items)) return []
  return items.filter((item) => isInnofulfillCourierEntry(item))
}

const normalizeCourierServiceName = (entry: any) =>
  String(entry?.displayName || entry?.name || entry?.courier_name || entry?.courierName || entry || '')
    .trim()
    .toLowerCase()
    .replace(/\s+-\s+\([^)]*\)\s*(kg|g)?\s*$/i, '')
    .replace(/\s+/g, ' ')

const getCourierTotalCharge = (entry: any) => {
  const forwardRate = entry?.localRates?.forward
  const value =
    forwardRate?.total_charges_with_gst ??
    forwardRate?.wallet_debit_amount ??
    entry?.total_charges_with_gst ??
    entry?.wallet_debit_amount ??
    forwardRate?.total_charges ??
    entry?.total_charges ??
    entry?.courier_cost_estimate ??
    forwardRate?.rate ??
    entry?.rate
  const total = Number(value)
  return Number.isFinite(total) ? total : Number.MAX_SAFE_INTEGER
}

export const dedupeVisibleCourierOptions = <T,>(items: T[] | undefined | null): T[] => {
  const visibleItems = filterVisibleCouriers(items)
  const bestByService = new Map<string, T>()

  visibleItems.forEach((item) => {
    if (!item || typeof item !== 'object') {
      const key = normalizeCourierServiceName(item)
      if (!bestByService.has(key)) bestByService.set(key, item)
      return
    }

    const entry = item as any
    const provider = String(entry.integration_type || entry.service_provider || entry.serviceProvider || '')
      .trim()
      .toLowerCase()
    const serviceName = normalizeCourierServiceName(entry)
    const key = `${provider || 'innofulfill'}:${serviceName}`
    const existing = bestByService.get(key)

    if (!existing) {
      bestByService.set(key, item)
      return
    }

    const existingEntry = existing as any
    const currentTotal = getCourierTotalCharge(entry)
    const existingTotal = getCourierTotalCharge(existingEntry)
    const currentHasRateCard = Boolean(String(entry.rate_card_id || '').trim())
    const existingHasRateCard = Boolean(String(existingEntry.rate_card_id || '').trim())

    if (currentTotal < existingTotal || (currentTotal === existingTotal && currentHasRateCard && !existingHasRateCard)) {
      bestByService.set(key, item)
    }
  })

  return Array.from(bestByService.values())
}

// src/api/courier.ts

export interface CourierListResponse {
  summary: CourierSummary
  couriers: Courier[]
  totalCount: number
  page: number
  limit: number
}

interface GetCouriersParams {
  page?: number
  limit?: number
  filters?: Record<string, string | boolean | number>
}

export const getCouriers = async ({
  page,
  limit,
  filters = {},
}: GetCouriersParams): Promise<CourierListResponse> => {
  const params = new URLSearchParams()

  // ✅ Only add pagination if provided
  if (page !== undefined) params.set('page', String(page))
  if (limit !== undefined) params.set('limit', String(limit))

  // ✅ Add filters safely
  Object.entries(filters).forEach(([key, val]) => {
    if (val !== '' && val !== undefined && val !== null) {
      params.set(key, String(val))
    }
  })

  const queryString = params.toString()
  const url = queryString ? `/couriers?${queryString}` : '/couriers'

  const res = await axiosInstance.get<{ status: string; data: CourierListResponse }>(url)
  const payload = res.data.data
  const filteredCouriers = dedupeVisibleCourierOptions(payload?.couriers)
  const removedCount = Math.max((payload?.couriers?.length ?? 0) - filteredCouriers.length, 0)

  return {
    ...payload,
    couriers: filteredCouriers,
    totalCount: Math.max(Number(payload?.totalCount ?? 0) - removedCount, 0),
    summary: payload?.summary
      ? {
          ...payload.summary,
          totalCourierCount: Math.max(
            Number(payload.summary.totalCourierCount ?? 0) - removedCount,
            0,
          ),
        }
      : payload.summary,
  }
}

export const getCourierById = async (id: number): Promise<Courier> => {
  const res = await axiosInstance.get<{ status: string; data: Courier }>(`/couriers/${id}`)
  return res.data.data
}

interface FetchCouriersResponse {
  success: boolean
  data: Courier[]
  error?: string
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// Courier selection can briefly fail during backend restarts or upstream gateway hiccups.
const shouldRetryCourierFetch = (error: any) => {
  const status = Number(error?.response?.status)
  const code = String(error?.code || '').toUpperCase()
  return (
    !error?.response ||
    [502, 503, 504].includes(status) ||
    ['ECONNABORTED', 'ECONNRESET', 'ETIMEDOUT'].includes(code)
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchAvailableCouriers = async (params: any): Promise<any[]> => {
  const maxAttempts = 2

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await axiosInstance.post<FetchCouriersResponse>(
        '/couriers/available-to-user',
        {
          ...params,
        },
        {
          timeout: 45000,
        },
      )

      if (!res.data.success) {
        throw new Error(res.data.error || 'Failed to fetch couriers')
      }

      return dedupeVisibleCourierOptions(res.data.data)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      console.error('fetchAvailableCouriers error:', error.response?.data || error.message)
      if (attempt < maxAttempts && shouldRetryCourierFetch(error)) {
        await delay(1200)
        continue
      }
      throw new Error(error.response?.data?.error || error.message || 'Failed to fetch couriers')
    }
  }

  throw new Error('Failed to fetch couriers')
}

interface ShippingRatesFilters {
  courier?: string
  mode?: string
  min_weight?: number
  businessType?: 'b2b' | 'b2c'
  // add more fields if needed
}

export const fetchShippingRates = async (filters: ShippingRatesFilters = {}): Promise<any[]> => {
  const params: Record<string, string | number> = {}

  if (filters.courier) params.courier_name = filters.courier
  if (filters.mode) params.mode = filters.mode
  if (filters.min_weight !== undefined) params.min_weight = filters.min_weight
  if (filters.businessType) params.businessType = filters.businessType

  const response = await axiosInstance.get('/couriers/shipping-rates', { params })
  return dedupeVisibleCourierOptions(response.data.data)
}

export const fetchAllCouriers = async () => {
  const res = await axiosInstance.get(`/couriers/list`)
  if (!res.data?.success) throw new Error('Failed to fetch couriers')
  return dedupeVisibleCourierOptions(res.data.data) // returns an array of courier names
}

export const fetchCouriersWithDetails = async () => {
  const res = await axiosInstance.get(`/couriers/full-list`)
  if (!res.data?.success) throw new Error('Failed to fetch couriers')
  return dedupeVisibleCourierOptions(res.data.data) // returns an array of courier names
}
export const getZones = async () => {
  const res = await axiosInstance.get('/admin/zones')
  return res.data
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const getZonesFiltered = async (businessType: string, filters: any) => {
  const params = new URLSearchParams()
  if (businessType) params.append('business_type', businessType)

  // Only include courier filter if B2B
  if (businessType === 'B2B' && filters.courier_id) {
    params.append('courier_id', filters.courier_id)
  }

  const res = await axiosInstance.get(`/admin/zones?${params.toString()}`)
  return res.data
}
