import axios from 'axios'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import { Request, Response } from 'express'
import { db } from '../models/client'
import { couriers } from '../models/schema/couriers'
import { plans } from '../models/schema/plans'
import { shippingRates, shippingRateSlabs } from '../models/schema/shippingRates'
import { userPlans } from '../models/schema/userPlans'
import {
  computeB2CRateCardCharge,
  computeEffectiveB2CCodCharge,
  formatCourierSlabDisplayName,
  normalizeB2CServiceProvider,
  normalizeB2CShippingMode,
} from '../models/services/b2cRateCard.service'
import {
  createCourier,
  getAllCouriersPaginated,
  getCourierById,
  getCourierCount,
  getCourierSummary,
} from '../models/services/courierIntegration.service'
import {
  fetchAvailableCouriersForGuest,
  fetchAvailableCouriersWithRates,
  fetchAvailableCouriersWithRatesB2B,
} from '../models/services/shiprocket.service'
import { getPaymentOptions } from '../models/services/paymentOptions.service'
import {
  getCanonicalDelhiveryCourierIdByMode,
  getDelhiveryCourierDisplayName,
  resolveDelhiveryShippingMode,
} from '../utils/delhiveryCourier'
import { calculateBookingWalletDebit } from '../utils/bookingWalletDebit'
import { extractOrderAmountFromBody } from '../utils/orderAmount'
import { getMerchantScopedUserId } from '../utils/merchantScope'

const parseOptionalBoolean = (value: unknown): boolean | undefined => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true
    if (['false', '0', 'no', 'n'].includes(normalized)) return false
  }
  return undefined
}

const parseOptionalNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  const num = Number(value)
  return Number.isNaN(num) ? undefined : num
}

const extractPreferredCarrierIds = (raw: unknown): number[] | undefined => {
  if (!Array.isArray(raw)) return undefined
  const ids = raw
    .map((val) => parseOptionalNumber(val))
    .filter((val): val is number => typeof val === 'number')
  return ids.length ? ids : undefined
}

const buildServiceabilityOptions = (body: any): Record<string, any> => {
  const options: Record<string, any> = {}

  const copyStringOption = (keys: string[], targetKey: string) => {
    const value = keys
      .map((key) => body?.[key])
      .find((candidate) => candidate !== undefined && candidate !== null && String(candidate).trim())
    if (value !== undefined) {
      options[targetKey] = String(value).trim()
    }
  }

  const pickupIdRaw = body?.pickupId ?? body?.pickup_id
  if (pickupIdRaw !== undefined && pickupIdRaw !== null && pickupIdRaw !== '') {
    options.pickupId = String(pickupIdRaw)
  }

  copyStringOption(['pickupName', 'pickup_name'], 'pickupName')
  copyStringOption(['pickupPhone', 'pickup_phone'], 'pickupPhone')
  copyStringOption(['pickupAddress', 'pickup_address'], 'pickupAddress')
  copyStringOption(['pickupCity', 'pickup_city'], 'pickupCity')
  copyStringOption(['pickupState', 'pickup_state'], 'pickupState')
  copyStringOption(['deliveryName', 'delivery_name'], 'deliveryName')
  copyStringOption(['deliveryPhone', 'delivery_phone'], 'deliveryPhone')
  copyStringOption(['deliveryAddress', 'delivery_address'], 'deliveryAddress')
  copyStringOption(['deliveryCity', 'delivery_city'], 'deliveryCity')
  copyStringOption(['deliveryState', 'delivery_state'], 'deliveryState')
  copyStringOption(['shadowfax_forward_mode', 'shadowfaxForwardMode'], 'shadowfax_forward_mode')
  copyStringOption(['shadowfax_service_mode', 'shadowfaxServiceMode'], 'shadowfax_service_mode')

  const preferredCarrierIds = extractPreferredCarrierIds(
    body?.preferred_carriers ?? body?.preferredCarriers,
  )
  if (preferredCarrierIds) {
    options.preferred_carriers = preferredCarrierIds
  }

  const deliveryType = parseOptionalNumber(body?.delivery_type ?? body?.deliveryType)
  if (deliveryType !== undefined) {
    options.delivery_type = deliveryType
  }

  const extraInfo = parseOptionalBoolean(body?.extra_info ?? body?.extraInfo) ?? undefined
  if (extraInfo !== undefined) {
    options.extra_info = extraInfo
  }

  const costInfo = parseOptionalBoolean(body?.cost_info ?? body?.costInfo) ?? undefined
  if (costInfo !== undefined) {
    options.cost_info = costInfo
  }

  const explicitSource = parseOptionalNumber(body?.source_pincode ?? body?.sourcePincode)
  if (explicitSource !== undefined) {
    options.source_pincode = explicitSource
  }

  const explicitDestination = parseOptionalNumber(
    body?.destination_pincode ?? body?.destinationPincode,
  )
  if (explicitDestination !== undefined) {
    options.destination_pincode = explicitDestination
  }

  const isReverse =
    parseOptionalBoolean(body?.isReverse ?? body?.is_reverse) ??
    (typeof body?.payment_type === 'string' && body.payment_type.toLowerCase() === 'reverse'
      ? true
      : undefined)
  if (isReverse !== undefined) {
    options.isReverse = isReverse
  }

  // Lightweight flag so downstream can optimise for calculator vs shipment flows.
  // Shipment courier selection must stay live because providers like Amazon need
  // a fresh rate token before the option can be booked.
  const context = String(body?.context || '')
    .trim()
    .toLowerCase()
  const isCalculator =
    context !== 'shipment_courier_selection' &&
    (context === 'rate_calculator' || body?.isCalculator === true || body?.is_calculator === true)
  if (isCalculator) {
    options.isCalculator = true
  }

  return options
}

const SUPPORTED_B2C_FALLBACK_PROVIDERS = ['innofulfill']

const toNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const getOptionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

const getActiveB2CLocalRate = (courier: any, isReverse: boolean) => {
  if (!courier?.localRates) return null
  if (isReverse) {
    return (
      courier.localRates.reverse_pickup ??
      courier.localRates.rto ??
      courier.localRates.forward ??
      null
    )
  }
  return courier.localRates.forward ?? null
}

const getCourierBillingBaseAmount = (courier: any, paymentType?: string) => {
  const isReverse = String(paymentType || '').toLowerCase() === 'reverse'
  const activeRate = getActiveB2CLocalRate(courier, isReverse) ?? {}
  const explicitTotal = getOptionalNumber(activeRate.total_charges ?? courier?.total_charges)
  if (explicitTotal !== undefined) return Math.max(0, explicitTotal)

  const freight = getOptionalNumber(activeRate.rate ?? courier?.rate ?? courier?.freight_charges) ?? 0
  const cod =
    String(paymentType || '').toLowerCase() === 'cod'
      ? getOptionalNumber(activeRate.cod_charges ?? courier?.cod_charges) ?? 0
      : 0
  const other = getOptionalNumber(activeRate.other_charges ?? courier?.other_charges) ?? 0
  return Math.max(0, freight + cod + other)
}

const applyGstToB2CCouriers = async (couriers: any[], paymentType?: string) => {
  if (!Array.isArray(couriers) || couriers.length === 0) return []

  const paymentSettings = await getPaymentOptions()
  const gstPercent = Number(paymentSettings.gstPercent ?? 0)
  const razorpayChargeEnabled = Boolean(paymentSettings.razorpayChargeEnabled)
  const razorpayChargePercent = Number(paymentSettings.razorpayChargePercent ?? 0)

  return couriers.map((courier) => {
    const isReverse = String(paymentType || '').toLowerCase() === 'reverse'
    const activeRate = getActiveB2CLocalRate(courier, isReverse)
    const activeRateKey =
      isReverse && courier?.localRates?.reverse_pickup ? 'reverse_pickup' : isReverse ? 'rto' : 'forward'
    const breakup = calculateBookingWalletDebit({
      paymentType,
      freightCharges: getOptionalNumber(activeRate?.rate ?? courier?.rate ?? courier?.freight_charges) ?? 0,
      otherCharges: getOptionalNumber(activeRate?.other_charges ?? courier?.other_charges) ?? 0,
      codCharges:
        String(paymentType || '').toLowerCase() === 'cod'
          ? getOptionalNumber(activeRate?.cod_charges ?? courier?.cod_charges) ?? 0
          : 0,
      gstPercent,
      razorpayChargeEnabled,
      razorpayChargePercent,
    })
    const taxFields = {
      gst_percent: breakup.gstPercent,
      gst_amount: breakup.gstAmount,
      razorpay_charge_enabled: breakup.razorpayChargeEnabled,
      razorpay_charge_percent: breakup.razorpayChargePercent,
      razorpay_charge_amount: breakup.razorpayChargeAmount,
      total_charges_before_razorpay: breakup.baseAmountBeforeRazorpay,
      total_charges_without_gst: breakup.baseAmount,
      total_charges_with_gst: breakup.totalAmount,
      wallet_debit_amount: breakup.totalAmount,
      tax_label: 'Courier rate + taxes',
    }

    return {
      ...courier,
      ...taxFields,
      localRates: courier?.localRates
        ? {
            ...courier.localRates,
            [activeRateKey]: activeRate ? { ...activeRate, ...taxFields } : activeRate,
          }
        : courier?.localRates,
    }
  })
}

const normalizeWeightToGrams = (value: unknown) => {
  const numeric = toNumber(value)
  if (numeric <= 0) return 0
  return numeric > 50 ? Math.round(numeric) : Math.round(numeric * 1000)
}

const inferB2CFallbackProvider = (rate: typeof shippingRates.$inferSelect) => {
  const explicitProvider = normalizeB2CServiceProvider(rate.service_provider)
  if (explicitProvider) return explicitProvider

  const name = String(rate.courier_name || '').toLowerCase()
  if (name.includes('delhivery')) return 'delhivery'
  if (name.includes('ekart')) return 'ekart'
  if (name.includes('xpress')) return 'xpressbees'
  if (name.includes('shadowfax')) return 'shadowfax'
  if (name.includes('amazon')) return 'amazon'
  if (name.includes('innofulfill') || name.includes('innofulfil')) return 'innofulfill'
  return ''
}

const isSupportedB2CFallbackRate = (
  provider: string,
  rate: typeof shippingRates.$inferSelect,
) => {
  const name = String(rate.courier_name || '').toLowerCase()
  const mode = normalizeB2CShippingMode(rate.mode)

  if (!SUPPORTED_B2C_FALLBACK_PROVIDERS.includes(provider)) return false
  if (provider === 'xpressbees') {
    return mode !== 'air' && !name.includes('air') && !name.includes('reverse')
  }

  return true
}

const getB2CFallbackRateMeta = (rate: typeof shippingRates.$inferSelect) => {
  const provider = inferB2CFallbackProvider(rate)
  if (provider === 'delhivery') {
    const shippingMode = resolveDelhiveryShippingMode({
      courierId: rate.courier_id,
      mode: rate.mode,
      courierName: rate.courier_name,
    })
    const courierId = getCanonicalDelhiveryCourierIdByMode(shippingMode)
    if (shippingMode && courierId) {
      return {
        provider,
        courierId,
        courierName: getDelhiveryCourierDisplayName(shippingMode),
        mode: shippingMode === 'Express' ? 'air' : 'surface',
      }
    }
  }

  return {
    provider,
    courierId: Number(rate.courier_id),
    courierName: rate.courier_name,
    mode: normalizeB2CShippingMode(rate.mode),
  }
}

const fetchEnabledB2CFallbackCourierMap = async () => {
  const rows = await db
    .select({
      id: couriers.id,
      name: couriers.name,
      serviceProvider: couriers.serviceProvider,
    })
    .from(couriers)
    .where(and(eq(couriers.isEnabled, true), sql`${couriers.businessType} @> '["b2c"]'::jsonb`))

  return new Map(
    rows.map((row) => [
      `${Number(row.id)}__${normalizeB2CServiceProvider(row.serviceProvider)}`,
      row,
    ]),
  )
}

const fetchB2CFallbackPlanIds = async (userId?: string) => {
  const planIds: string[] = []
  let hasActiveUserPlan = false

  if (userId) {
    const [activeUserPlan] = await db
      .select({ planId: userPlans.plan_id })
      .from(userPlans)
      .where(and(eq(userPlans.userId, userId), eq(userPlans.is_active, true)))
      .limit(1)
    if (activeUserPlan?.planId) {
      planIds.push(activeUserPlan.planId)
      hasActiveUserPlan = true
    }
  }

  const fallbackPlanName = userId && !hasActiveUserPlan ? 'default' : !userId ? 'basic' : null
  if (fallbackPlanName) {
    const [fallbackPlan] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(sql`lower(${plans.name}) = ${fallbackPlanName}`)
      .limit(1)
    if (fallbackPlan?.id) planIds.push(fallbackPlan.id)
  }

  if (userId) {
    return Array.from(new Set(planIds))
  }

  const [basicPlan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(sql`lower(${plans.name}) = 'basic'`)
    .limit(1)
  if (basicPlan?.id) planIds.push(basicPlan.id)

  const [firstRatePlan] = await db
    .select({ planId: shippingRates.plan_id })
    .from(shippingRates)
    .where(eq(shippingRates.business_type, 'b2c'))
    .limit(1)
  if (firstRatePlan?.planId) planIds.push(firstRatePlan.planId)

  return Array.from(new Set(planIds))
}

const fetchB2CRateRowsForFallback = async (params: {
  planId?: string | null
  rateType: string
}) => {
  const conditions = [eq(shippingRates.business_type, 'b2c')]
  if (params.rateType) conditions.push(eq(shippingRates.type, params.rateType))
  if (params.planId) conditions.push(eq(shippingRates.plan_id, params.planId))

  return db
    .select()
    .from(shippingRates)
    .where(and(...conditions))
    .orderBy(asc(shippingRates.last_updated))
}

const buildLastResortB2CCouriersFromRateCards = async (
  serviceParams: Record<string, any>,
  userId?: string,
) => {
  const isReverse = serviceParams?.isReverse === true || serviceParams?.payment_type === 'reverse'
  const preferredRateTypes = isReverse ? ['reverse_pickup', 'rto', 'forward'] : ['forward']
  const planIds = await fetchB2CFallbackPlanIds(userId)
  let rateRows: Array<typeof shippingRates.$inferSelect> = []

  for (const rateType of preferredRateTypes) {
    for (const planId of planIds) {
      rateRows = await fetchB2CRateRowsForFallback({ planId, rateType })
      if (rateRows.length) break
    }
    if (rateRows.length) break
  }

  if (!rateRows.length) {
    for (const rateType of preferredRateTypes) {
      rateRows = await fetchB2CRateRowsForFallback({ rateType })
      if (rateRows.length) break
    }
  }

  if (!rateRows.length) return []

  const rateIds = rateRows.map((rate) => rate.id)
  let slabs: Array<typeof shippingRateSlabs.$inferSelect> = []
  try {
    slabs = await db
      .select()
      .from(shippingRateSlabs)
      .where(inArray(shippingRateSlabs.shipping_rate_id, rateIds))
      .orderBy(asc(shippingRateSlabs.shipping_rate_id), asc(shippingRateSlabs.weight_from))
  } catch (err: any) {
    console.warn('[Couriers] B2C fallback slab lookup failed, using legacy rate rows', {
      message: err?.message || err,
    })
  }

  const slabMap = new Map<string, Array<typeof shippingRateSlabs.$inferSelect>>()
  for (const slab of slabs) {
    const list = slabMap.get(slab.shipping_rate_id) || []
    list.push(slab)
    slabMap.set(slab.shipping_rate_id, list)
  }

  const actualWeightG = normalizeWeightToGrams(serviceParams?.weight)
  const lengthCm = toNumber(serviceParams?.length)
  const breadthCm = toNumber(serviceParams?.breadth)
  const heightCm = toNumber(serviceParams?.height)
  const shouldIncludeCod = String(serviceParams?.payment_type || '').toLowerCase() === 'cod'
  const cardsByKey = new Map<string, any>()
  const enabledCourierMap = await fetchEnabledB2CFallbackCourierMap()

  for (const row of rateRows) {
    const rateMeta = getB2CFallbackRateMeta(row)
    const { provider } = rateMeta
    if (!isSupportedB2CFallbackRate(provider, row)) continue
    if (!Number.isFinite(rateMeta.courierId)) continue
    const enabledCourier = enabledCourierMap.get(`${rateMeta.courierId}__${provider}`)
    if (!enabledCourier) continue

    const rowSlabs = (slabMap.get(row.id) || []).map((slab) => ({
      id: slab.id,
      weight_from: toNumber(slab.weight_from),
      weight_to: slab.weight_to === null ? null : toNumber(slab.weight_to),
      rate: toNumber(slab.rate),
      extra_rate: slab.extra_rate === null ? null : toNumber(slab.extra_rate),
      extra_weight_unit:
        slab.extra_weight_unit === null ? null : toNumber(slab.extra_weight_unit),
    }))
    const rateCard = {
      shippingRateId: row.id,
      courier_id: rateMeta.courierId,
      courier_name: rateMeta.courierName,
      service_provider: provider,
      zone_id: row.zone_id,
      type: row.type,
      mode: rateMeta.mode,
      cod_charges: toNumber(row.cod_charges),
      cod_percent: toNumber(row.cod_percent),
      other_charges: toNumber(row.other_charges),
      min_weight: toNumber(row.min_weight),
      base_rate: toNumber(row.rate),
      slabs: rowSlabs,
    }
    const computed = computeB2CRateCardCharge({
      actual_weight_g: actualWeightG,
      length_cm: lengthCm,
      width_cm: breadthCm,
      height_cm: heightCm,
      rateCard,
    })
    const freight = computed.freight > 0 ? computed.freight : toNumber(row.rate)
    if (freight <= 0) continue

    const codCharges = shouldIncludeCod
      ? computeEffectiveB2CCodCharge({
          cod_charges: toNumber(row.cod_charges),
          cod_percent: toNumber(row.cod_percent),
          order_amount: serviceParams?.order_amount,
        })
      : 0
    const mode = normalizeB2CShippingMode(rateMeta.mode)
    const maxSlabWeight = computed.max_slab_weight ?? null
    const displayName =
      computed.matched_by !== 'legacy'
        ? formatCourierSlabDisplayName(rateMeta.courierName, maxSlabWeight)
        : rateMeta.courierName
    const optionKey = `${rateMeta.courierId}__${provider}__${row.id}__${maxSlabWeight ?? 'base'}`
    const rateDetails = {
      rate: freight,
      cod_charges: codCharges,
      cod_percent: shouldIncludeCod ? toNumber(row.cod_percent) : 0,
      other_charges: toNumber(row.other_charges),
      shipping_rate_id: row.id,
      mode,
      min_weight: toNumber(row.min_weight),
      slabs: computed.slabs,
      zone_id: row.zone_id,
      zone: null,
      zone_code: null,
      zone_name: null,
      selected_slab: computed.selected_slab,
      slab_weight: computed.slab_weight,
      chargeable_weight: computed.chargeable_weight,
      volumetric_weight: computed.volumetric_weight,
      slab_count: computed.slabs,
      max_slab_weight: maxSlabWeight,
      matched_by: computed.matched_by,
    }
    const card = {
      id: rateMeta.courierId,
      courier_id: rateMeta.courierId,
      name: displayName,
      displayName,
      courier_option_key: optionKey,
      rate_card_id: row.id,
      integration_type: provider,
      serviceProvider: provider,
      cod: true,
      prepaid: true,
      edd: '3-5 Days',
      localRates: { [row.type || 'forward']: rateDetails },
      approxZone: null,
      zone: null,
      zone_id: row.zone_id,
      zone_code: null,
      zone_name: null,
      shipping_mode: mode || null,
      service_mode: mode || null,
      provider_serviceability: {
        fallback: true,
        reason: 'last_resort_rate_card',
        enabled_courier_name: enabledCourier.name,
        shipping_mode: mode || null,
        service_mode: mode || null,
      },
      courier_cost_estimate: freight + codCharges + toNumber(row.other_charges),
      freight_charges: freight,
      cod_charges: codCharges,
      other_charges: toNumber(row.other_charges),
      total_charges: freight + codCharges + toNumber(row.other_charges),
      chargeable_weight: computed.chargeable_weight,
      volumetric_weight: computed.volumetric_weight,
      slabs: computed.slabs,
      rate: freight,
      max_slab_weight: maxSlabWeight,
      rate_card_fallback: 'last_resort',
    }
    const existing = cardsByKey.get(optionKey)
    if (!existing || Number(existing.rate || Infinity) > freight) {
      cardsByKey.set(optionKey, card)
    }
  }

  return Array.from(cardsByKey.values()).sort(
    (left, right) => Number(left.rate || Infinity) - Number(right.rate || Infinity),
  )
}

const fetchB2CCouriersWithLocalFallback = async (serviceParams: Record<string, any>, userId?: string) => {
  const runLastResortFallback = async () => {
    const lastResortCouriers = await buildLastResortB2CCouriersFromRateCards(serviceParams, userId)

    if (lastResortCouriers.length > 0) {
      console.warn('[Couriers] Using direct B2C rate-card fallback', {
        origin: serviceParams?.origin,
        destination: serviceParams?.destination,
        shipment_type: serviceParams?.shipment_type,
        courierCount: lastResortCouriers.length,
      })
    } else {
      console.warn('[Couriers] No strict or direct B2C fallback result available; returning no couriers')
    }

    return lastResortCouriers
  }

  try {
    const strictCouriers = await fetchAvailableCouriersWithRates(serviceParams as any, userId)
    if (strictCouriers.length > 0) {
      return strictCouriers
    }

    console.warn('[Couriers] Strict B2C courier fetch returned no options, trying fallback paths', {
      origin: serviceParams?.origin,
      destination: serviceParams?.destination,
      shipment_type: serviceParams?.shipment_type,
      isCalculator: serviceParams?.isCalculator === true,
    })

    if (serviceParams?.isCalculator !== true) {
      try {
        const calculatorCouriers = await fetchAvailableCouriersWithRates(
          {
            ...serviceParams,
            isCalculator: true,
          } as any,
          userId,
        )

        if (calculatorCouriers.length > 0) {
          return calculatorCouriers
        }
      } catch (fallbackErr: any) {
        console.warn('[Couriers] Local rate-card pipeline failed after empty strict result', {
          message: fallbackErr?.message || fallbackErr,
        })
      }
    }

    return await runLastResortFallback()
  } catch (err: any) {
    console.warn('[Couriers] B2C courier fetch failed, retrying fallback paths', {
      message: err?.message || err,
      origin: serviceParams?.origin,
      destination: serviceParams?.destination,
      shipment_type: serviceParams?.shipment_type,
      isCalculator: serviceParams?.isCalculator === true,
    })

    if (serviceParams?.isCalculator !== true) {
      try {
        return await fetchAvailableCouriersWithRates(
          {
            ...serviceParams,
            isCalculator: true,
          } as any,
          userId,
        )
      } catch (fallbackErr: any) {
        console.warn('[Couriers] Local rate-card pipeline failed, using direct rate-card fallback', {
          message: fallbackErr?.message || fallbackErr,
        })
      }
    }

    return await runLastResortFallback()
  }
}

// src/controllers/courier.controller.ts
export const getCouriers = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1
    const limit = parseInt(req.query.limit as string) || 10
    const offset = (page - 1) * limit

    // ✅ Extract filters from query
    const name = req.query.name?.toString()
    const masterCompany = req.query.masterCompany?.toString()
    const podAvailable = req.query.podAvailable?.toString() // "yes" | "no"
    const realtimeTracking = req.query.realtimeTracking?.toString()
    const isHyperlocal = req.query.isHyperlocal

    // ✅ Validate and map sortBy
    const rawSortBy = req.query.sortBy?.toString()
    const sortBy = ['latest', 'oldest', 'az', 'za'].includes(rawSortBy ?? '')
      ? (rawSortBy as 'latest' | 'oldest' | 'az' | 'za')
      : undefined

    const filters = {
      name,
      masterCompany,
      podAvailable,
      realtimeTracking,
      isHyperlocal: isHyperlocal === 'true' ? true : isHyperlocal === 'false' ? false : undefined,
    }

    const [couriers, summary, totalCount] = await Promise.all([
      getAllCouriersPaginated({ limit, offset, filters, sortBy }),
      getCourierSummary(),
      getCourierCount(filters),
    ])

    res.json({
      status: 'success',
      data: {
        summary,
        couriers,
        totalCount,
        page,
        limit,
      },
    })
  } catch (error) {
    console.error('[getCouriers] error:', error)
    res.status(500).json({ status: 'error', message: 'Failed to fetch couriers and summary.' })
  }
}

export const getCourier = async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id)
    if (isNaN(id)) return res.status(400).json({ status: 'error', message: 'Invalid ID.' })

    const courier = await getCourierById(id)
    if (!courier) return res.status(404).json({ status: 'error', message: 'Courier not found.' })

    res.json({ status: 'success', data: courier })
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to fetch courier.' })
  }
}

let token: string | null = null
let tokenExpiry: number | null = null
const SHIPROCKET_AUTH_TIMEOUT_MS = Number(process.env.SHIPROCKET_AUTH_TIMEOUT_MS || 10000)

export const getToken = async (): Promise<string> => {
  try {
    if (token && tokenExpiry && Date.now() < tokenExpiry) return token

    const res = await axios.post(`${process.env.SHIPROCKET_API_BASE}/auth/login`, {
      email: process.env.SHIPROCKET_EMAIL,
      password: process.env.SHIPROCKET_PASSWORD,
    }, {
      timeout: SHIPROCKET_AUTH_TIMEOUT_MS,
    })

    token = res.data.token
    tokenExpiry = Date.now() + 23 * 60 * 60 * 1000 // ~23 hours
    return token ?? ''
  } catch (error: any) {
    console.error('Shiprocket auth error:', error.response?.data || error.message)
    throw new Error('Failed to authenticate with Shiprocket')
  }
}

export const fetchAvailableCouriers = async (req: Request, res: Response) => {
  try {
    const {
      origin,
      destination,
      payment_type,
      weight,
      length,
      breadth,
      height,
      shipment_type,
    } = req.body
    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        error: 'pickupPincode and deliveryPincode are required',
      })
    }

    const userId = getMerchantScopedUserId(req)

    const orderAmountResult = extractOrderAmountFromBody(req.body)
    if (orderAmountResult.invalid) {
      return res.status(400).json({
        success: false,
        error: 'order_amount must be a non-negative number',
      })
    }

    const serviceabilityOptions = buildServiceabilityOptions(req.body)

    const serviceParams = {
      origin: Number(origin),
      destination: Number(destination),
      payment_type: payment_type,
      order_amount: orderAmountResult.value,
      shipment_type: shipment_type,
      weight: Number(weight),
      length: Number(length),
      breadth: Number(breadth),
      height: Number(height),
      ...serviceabilityOptions,
    }

    const couriers = await fetchB2CCouriersWithLocalFallback(serviceParams, userId)
    const couriersWithGst = await applyGstToB2CCouriers(couriers ?? [], payment_type)

    return res.json({ success: true, data: couriersWithGst })
  } catch (err: any) {
    console.error('Error fetching couriers:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}

export const fetchAvailableCouriersForGuestController = async (req: Request, res: Response) => {
  try {
    const { origin, destination, payment_type, weight, length, breadth, height } = req.body

    // Validate required fields
    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        error: 'origin (pickup pincode) and destination (delivery pincode) are required',
      })
    }

    // Validate origin and destination are valid numbers
    const originNum = Number(origin)
    const destinationNum = Number(destination)
    if (isNaN(originNum) || isNaN(destinationNum)) {
      return res.status(400).json({
        success: false,
        error: 'origin and destination must be valid numbers',
      })
    }

    // Validate pincodes are 6 digits
    if (origin.toString().length !== 6 || destination.toString().length !== 6) {
      return res.status(400).json({
        success: false,
        error: 'origin and destination must be 6-digit pincodes',
      })
    }

    // Validate weight if provided
    const weightNum = weight ? Number(weight) : undefined
    if (weight && (isNaN(weightNum!) || weightNum! <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'weight must be a positive number',
      })
    }

    // Validate dimensions if provided
    const lengthNum = length ? Number(length) : undefined
    const breadthNum = breadth ? Number(breadth) : undefined
    const heightNum = height ? Number(height) : undefined

    if (length && (isNaN(lengthNum!) || lengthNum! <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'length must be a positive number',
      })
    }
    if (breadth && (isNaN(breadthNum!) || breadthNum! <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'breadth must be a positive number',
      })
    }
    if (height && (isNaN(heightNum!) || heightNum! <= 0)) {
      return res.status(400).json({
        success: false,
        error: 'height must be a positive number',
      })
    }

    // Validate payment_type if provided
    if (payment_type && !['cod', 'prepaid'].includes(payment_type)) {
      return res.status(400).json({
        success: false,
        error: 'payment_type must be either "cod" or "prepaid"',
      })
    }

    const orderAmountResult = extractOrderAmountFromBody(req.body)
    if (orderAmountResult.invalid) {
      return res.status(400).json({
        success: false,
        error: 'order_amount must be a non-negative number',
      })
    }

    const couriers = await fetchAvailableCouriersForGuest({
      origin: originNum,
      destination: destinationNum,
      payment_type: payment_type,
      order_amount: orderAmountResult.value,
      weight: weightNum,
      length: lengthNum,
      breadth: breadthNum,
      height: heightNum,
    })
    const couriersWithGst = await applyGstToB2CCouriers(couriers ?? [], payment_type)

    return res.json({ success: true, data: couriersWithGst })
  } catch (err: any) {
    console.error('Error fetching couriers for guest:', err.message)
    return res.status(500).json({ success: false, error: 'Failed to fetch available couriers' })
  }
}

export const fetchAvailableCouriersToUser = async (req: Request, res: Response) => {
  try {
    const {
      origin,
      destination,
      payment_type,
      weight,
      length,
      breadth,
      height,
      shipment_type,
    } = req.body
    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        error: 'pickupPincode and deliveryPincode are required',
      })
    }

    const userId = getMerchantScopedUserId(req)

    const serviceabilityOptions = buildServiceabilityOptions(req.body) // handles pickupId, reverse flags, etc.
    const orderAmountResult = extractOrderAmountFromBody(req.body)
    if (orderAmountResult.invalid) {
      return res.status(400).json({
        success: false,
        error: 'order_amount must be a non-negative number',
      })
    }

    // Route to appropriate function based on shipment_type
    const serviceParams = {
      origin: Number(origin),
      destination: Number(destination),
      payment_type: payment_type,
      order_amount: orderAmountResult.value,
      shipment_type: shipment_type,
      weight: Number(weight),
      length: Number(length),
      breadth: Number(breadth),
      height: Number(height),
      ...serviceabilityOptions,
    }

    let couriers
    if (shipment_type === 'b2b') {
      couriers = await fetchAvailableCouriersWithRatesB2B(serviceParams, userId)
    } else {
      couriers = await fetchB2CCouriersWithLocalFallback(serviceParams, userId)
      couriers = await applyGstToB2CCouriers(couriers ?? [], payment_type)
    }

    return res.json({ success: true, data: couriers ?? [] })
  } catch (err: any) {
    console.error('Error fetching couriers:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}

export const createCourierController = async (req: Request, res: Response) => {
  try {
    const newCourier = await createCourier(req?.body)
    res.status(201).json({ status: 'success', data: newCourier })
  } catch (error: any) {
    console.error('[createCourierController] error:', error.message)
    console.error('[createCourierController] full error:', error)
    const status = error.message.includes('Courier already exists') ? 409 : 500
    res.status(status).json({ status: 'error', message: error.message })
  }
}
