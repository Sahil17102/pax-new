import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm'
import { Request, Response } from 'express'
import * as XLSX from 'xlsx'
import { db } from '../../models/client'
import {
  deleteCourierService,
  deleteShippingRate,
  getShippingRates,
  ShippingRateUpdatePayload,
  updateShippingRate,
} from '../../models/services/courierIntegration.service'
import {
  CSVRow,
  importB2CSlabFormat,
  importFlatFormat,
  isSlabValidationError,
  normalizeRateCardRow,
  parseRateCardCsvText,
} from '../../models/services/rateCardImport.service'
import { fetchAvailableCouriersWithRatesAdmin } from '../../models/services/shiprocket.service'
import { courier_credentials } from '../../models/schema/courierCredentials'
import { couriers } from '../../models/schema/couriers'
import { getAllZones } from '../../models/services/zone.service'
import { EkartService } from '../../models/services/couriers/ekart.service'
import { XpressbeesService } from '../../models/services/couriers/xpressbees.service'
import { ShadowfaxService } from '../../models/services/couriers/shadowfax.service'
import { InnofulfillService } from '../../models/services/couriers/innofulfill.service'
import { DelhiveryB2BService } from '../../models/services/couriers/delhiveryB2B.service'
import {
  DEFAULT_DELHIVERY_B2B_API_BASE,
  DELHIVERY_B2B_PROVIDER,
} from '../../models/services/delhiveryB2BCredentials.service'
import {
  XPRESSBEES_WEBHOOK_PATH,
  XPRESSBEES_WEBHOOK_SIGNATURE_HEADER,
} from '../../config/xpressbeesWebhook'
import {
  createXpressbeesManualAwbRange,
} from '../../models/services/xpressbeesAwbRange.service'
import {
  AMAZON_CREDENTIALS_PROVIDER,
  AMAZON_DEFAULT_BUSINESS_ID,
  AMAZON_DEFAULT_REGION,
  applyAmazonShippingCredentialsToEnv,
  buildAmazonShippingCredentialsFromRow,
  maskAmazonCredential,
  normalizeAmazonCredentialTokens,
  normalizeAmazonCredentialValue,
  parseAmazonSandboxFlag,
} from '../../models/services/amazonShippingCredentials.service'

export interface ShippingRateFilters {
  courier_name?: string[]
  mode?: string
  min_weight?: number
  plan_id?: string
  business_type?: 'b2b' | 'b2c'
}

export const fetchAvailableCouriersForAdmin = async (req: Request, res: Response) => {
  try {
    const {
      origin,
      destination,
      payment_type,
      order_amount,
      weight,
      length,
      breadth,
      height,
      shipment_type,
      plan_id,
      isCalculator,
      context,
      shadowfax_forward_mode,
      shadowfaxForwardMode,
      shadowfax_service_mode,
      shadowfaxServiceMode,
    } = req.body
    if (!origin || !destination) {
      return res.status(400).json({
        success: false,
        error: 'pickupPincode and deliveryPincode are required',
      })
    }

    const couriers = await fetchAvailableCouriersWithRatesAdmin(
      {
        origin: Number(origin),
        destination: Number(destination),
        payment_type: payment_type,
        order_amount: order_amount,
        shipment_type: shipment_type,
        weight: Number(weight),
        length: Number(length),
        breadth: Number(breadth),
        height: Number(height),
        isCalculator: isCalculator === true || context === 'rate_calculator',
        shadowfax_forward_mode: shadowfax_forward_mode ?? shadowfaxForwardMode,
        shadowfax_service_mode: shadowfax_service_mode ?? shadowfaxServiceMode,
      },
      plan_id,
    )

    return res.json({ success: true, data: couriers ?? [] })
  } catch (err: any) {
    console.error('Error fetching couriers:', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
}

export const getShippingRatesController = async (req: Request, res: Response) => {
  try {
    let courierNames: string[] = []

    const rawCourierNames = req.query['courier_name[]'] ?? req.query.courier_name

    if (Array.isArray(rawCourierNames)) {
      courierNames = rawCourierNames.flat().filter(Boolean).map(String)
    } else if (typeof rawCourierNames === 'string') {
      courierNames = [rawCourierNames]
    }

    const filters: ShippingRateFilters = {
      courier_name: courierNames.length ? courierNames : undefined,
      mode: req.query.mode as string | undefined,
      min_weight:
        (req.query.businessType as string | undefined)?.toLowerCase() === 'b2c'
          ? undefined
          : req.query.min_weight
            ? Number(req.query.min_weight)
            : undefined,
      plan_id: req.query.planId as string | undefined,
      business_type: (req.query.businessType as 'b2b' | 'b2c') || undefined,
    }

    const rates = await getShippingRates(filters)
    res.json({ success: true, data: rates })
  } catch (err) {
    console.error('Error fetching shipping rates:', err)
    res.status(500).json({ success: false, message: 'Internal Server Error' })
  }
}

export const getAllCouriersController = async (req: Request, res: Response) => {
  try {
    const courierList = await db
      .select({
        id: couriers.id,
        name: couriers.name,
        serviceProvider: couriers.serviceProvider,
        isEnabled: couriers.isEnabled,
        createdAt: couriers.createdAt,
      })
      .from(couriers)
      .orderBy(desc(couriers.createdAt))

    res.json({ success: true, data: courierList })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false })
  }
}

export const getAllCouriersListController = async (req: Request, res: Response) => {
  try {
    const { search, serviceProvider, businessType } = req.query

    const whereClauses = []

    // Filter by search (name or id)
    if (search && typeof search === 'string' && search.trim()) {
      const searchTerm = `%${search.trim()}%`
      whereClauses.push(
        or(
          ilike(couriers.name, searchTerm),
          sql`CAST(${couriers.id} AS TEXT) ILIKE ${searchTerm}`,
        )!,
      )
    }

    // Filter by service provider
    if (serviceProvider && typeof serviceProvider === 'string' && serviceProvider.trim()) {
      whereClauses.push(eq(couriers.serviceProvider, serviceProvider.trim()))
    }

    // Filter by business type (b2c or b2b)
    if (businessType && typeof businessType === 'string') {
      const normalizedBusinessType = businessType.trim().toLowerCase()
      if (normalizedBusinessType === 'b2c' || normalizedBusinessType === 'b2b') {
        // Construct JSONB array string - value is validated above (only 'b2c' or 'b2b')
        const jsonbArrayStr = JSON.stringify([normalizedBusinessType])
        // Match the pattern from shiprocket.service.ts - construct the full JSONB literal
        whereClauses.push(
          sql`${couriers.businessType} @> ${sql.raw(
            `'${jsonbArrayStr.replace(/'/g, "''")}'::jsonb`,
          )}`,
        )
      }
    }

    const whereCondition = whereClauses.length > 0 ? and(...whereClauses) : undefined

    const courierList = await db
      .select()
      .from(couriers)
      .where(whereCondition)
      .orderBy(desc(couriers.createdAt))

    res.json({ success: true, data: courierList })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to fetch couriers' })
  }
}

export const updateCourierStatusController = async (req: Request, res: Response) => {
  const { id } = req.params
  const { serviceProvider, isEnabled, businessType } = req.body

  try {
    if (!serviceProvider) {
      return res.status(400).json({
        success: false,
        message: 'serviceProvider is required',
      })
    }

    // Build update object
    const updateData: any = {
      updatedAt: new Date(),
    }

    // Update isEnabled if provided
    if (typeof isEnabled === 'boolean') {
      updateData.isEnabled = isEnabled
    }

    // Update businessType if provided
    if (businessType && Array.isArray(businessType) && businessType.length > 0) {
      // Validate businessType values
      const validTypes = businessType.filter((type) => type === 'b2c' || type === 'b2b')
      if (validTypes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'businessType must contain at least one valid value: "b2c" or "b2b"',
        })
      }
      updateData.businessType = validTypes
    }

    // Check if there's anything to update
    if (Object.keys(updateData).length === 1) {
      // Only updatedAt was added, nothing to update
      return res.status(400).json({
        success: false,
        message: 'No valid fields to update. Provide isEnabled and/or businessType',
      })
    }

    const updated = await db
      .update(couriers)
      .set(updateData)
      .where(and(eq(couriers.id, Number(id)), eq(couriers.serviceProvider, serviceProvider)))
      .returning()

    if (!updated.length) {
      return res.status(404).json({ success: false, message: 'Courier not found' })
    }

    res.json({ success: true, data: updated[0] })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update courier' })
  }
}

export const getServiceProvidersController = async (req: Request, res: Response) => {
  try {
    // Only expose the main integrated service providers in the enable/disable UI
    const allowedProviders = ['delhivery', 'ekart', 'xpressbees', 'shadowfax', 'amazon', 'innofulfill']

    const rows = await db
      .select({
        serviceProvider: couriers.serviceProvider,
        totalCouriers: sql<number>`count(*)`,
        enabledCouriers: sql<number>`sum(case when ${couriers.isEnabled} then 1 else 0 end)`,
      })
      .from(couriers)
      .where(inArray(couriers.serviceProvider, allowedProviders))
      .groupBy(couriers.serviceProvider)
      .orderBy(couriers.serviceProvider)

    const byProvider = new Map(
      rows.map((row) => [
        row.serviceProvider,
        {
          serviceProvider: row.serviceProvider,
          totalCouriers: Number(row.totalCouriers || 0),
          enabledCouriers: Number(row.enabledCouriers || 0),
          isEnabled: Number(row.enabledCouriers || 0) > 0,
        },
      ]),
    )

    // Ensure allowed providers are always visible in admin UI,
    // even when no rows exist in couriers table yet.
    const providers = allowedProviders.map((provider) => ({
      serviceProvider: provider,
      totalCouriers: byProvider.get(provider)?.totalCouriers ?? 0,
      enabledCouriers: byProvider.get(provider)?.enabledCouriers ?? 0,
      isEnabled: byProvider.get(provider)?.isEnabled ?? false,
    }))

    res.json({ success: true, data: providers })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to fetch service providers' })
  }
}

export const updateServiceProviderStatusController = async (req: Request, res: Response) => {
  const { serviceProvider } = req.params
  const { isEnabled } = req.body

  try {
    const allowedProviders = ['delhivery', 'ekart', 'xpressbees', 'shadowfax', 'amazon', 'innofulfill']

    if (!serviceProvider || typeof isEnabled !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'serviceProvider (param) and boolean isEnabled (body) are required',
      })
    }
    if (!allowedProviders.includes(String(serviceProvider).toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Only these providers are supported: ${allowedProviders.join(', ')}`,
      })
    }

    const updated = await db
      .update(couriers)
      .set({
        isEnabled,
        updatedAt: new Date(),
      })
      .where(eq(couriers.serviceProvider, serviceProvider))
      .returning()

    if (!updated.length) {
      return res.status(404).json({ success: false, message: 'No couriers found for provider' })
    }

    res.json({
      success: true,
      data: {
        serviceProvider,
        isEnabled,
        affectedCouriers: updated.length,
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update service provider status' })
  }
}

const buildAmazonCredentialResponse = (
  row?: Partial<typeof courier_credentials.$inferSelect> | null,
) => {
  const credentials = buildAmazonShippingCredentialsFromRow(row)
  const accessToken = normalizeAmazonCredentialValue(credentials.accessToken)
  const refreshToken = normalizeAmazonCredentialValue(credentials.refreshToken)
  const lwaClientId = normalizeAmazonCredentialValue(credentials.lwaClientId)
  const lwaClientSecret = normalizeAmazonCredentialValue(credentials.lwaClientSecret)

  return {
    provider: AMAZON_CREDENTIALS_PROVIDER,
    apiBase: normalizeAmazonCredentialValue(credentials.endpoint),
    endpoint: normalizeAmazonCredentialValue(credentials.endpoint),
    lwaClientId,
    shippingBusinessId:
      normalizeAmazonCredentialValue(credentials.shippingBusinessId) || AMAZON_DEFAULT_BUSINESS_ID,
    region: normalizeAmazonCredentialValue(credentials.region) || AMAZON_DEFAULT_REGION,
    sandbox: Boolean(credentials.sandbox),
    lwaTokenUrl: normalizeAmazonCredentialValue(credentials.lwaTokenUrl),
    hasAccessToken: Boolean(accessToken),
    accessTokenMasked: maskAmazonCredential(accessToken),
    hasRefreshToken: Boolean(refreshToken),
    refreshTokenMasked: maskAmazonCredential(refreshToken),
    hasLwaClientSecret: Boolean(lwaClientSecret),
    configured: Boolean(accessToken || (refreshToken && lwaClientId && lwaClientSecret)),
  }
}

const optionalCredentialString = (value: unknown) =>
  typeof value === 'string' ? value.trim() : undefined

const normalizePublicUrl = (value: unknown, fallback: string) => {
  const normalized = String(value || fallback).trim()
  return normalized.replace(/\/+$/, '')
}

const getPublicApiUrl = () =>
  normalizePublicUrl(process.env.API_URL || process.env.PUBLIC_API_URL, 'https://api.fgship.in')

const resolvePublicWebhookUrl = (envName: string, path: string) => {
  const configured = optionalCredentialString(process.env[envName])
  if (configured) {
    return /^https?:\/\//i.test(configured)
      ? normalizePublicUrl(configured, configured)
      : `${getPublicApiUrl()}/${configured.replace(/^\/+/, '')}`
  }

  return `${getPublicApiUrl()}${path}`
}

const buildDelhiveryWebhookConfig = () => ({
  scanPushUrl: resolvePublicWebhookUrl(
    'DELHIVERY_SCAN_PUSH_WEBHOOK_URL',
    '/api/webhook/delhivery/scan',
  ),
  documentPushUrl: resolvePublicWebhookUrl(
    'DELHIVERY_DOCUMENT_PUSH_WEBHOOK_URL',
    '/api/webhook/delhivery/document',
  ),
  legacyUnifiedUrl: resolvePublicWebhookUrl(
    'DELHIVERY_LEGACY_WEBHOOK_URL',
    '/api/webhook/delhivery/order',
  ),
  method: 'POST',
  contentType: 'application/json',
  expectedResponse: '200 OK',
  requiredFields: [
    'Shipment.AWB',
    'Shipment.ReferenceNo',
    'Shipment.Status.Status',
    'Shipment.Status.StatusType',
    'Shipment.Status.Instructions',
    'Shipment.NSLCode or Shipment.Status.StatusCode',
  ],
})

const buildEkartWebhookConfig = () => ({
  trackingUrl: resolvePublicWebhookUrl('EKART_WEBHOOK_URL', '/api/webhook/ekart'),
  trackAliasUrl: resolvePublicWebhookUrl('EKART_TRACK_WEBHOOK_URL', '/api/webhook/ekart/track'),
  method: 'POST',
  contentType: 'application/json',
  expectedResponse: '200 OK',
  authentication: {
    type: 'shared_secret_or_hmac_sha256',
    secretRequired: false,
    supportedHeaders: [
      'x-ekart-webhook-secret',
      'x-ekart-webhook-signature',
      'x-ekart-signature',
      'x-ekart-hmac-sha256',
      'x-hmac-sha256',
      'x-webhook-signature',
      'x-signature',
      'x-hub-signature-256',
    ],
  },
  suggestedTopics: ['tracking_updates', 'shipment_status_updates', 'weight_updates'],
  samplePayloadFields: [
    'tracking_id',
    'current_status',
    'desc',
    'current_location',
    'charged_weight',
    'actual_weight',
    'volumetric_weight',
  ],
})

const buildShadowfaxWebhookConfig = () => ({
  clientPushUrl: resolvePublicWebhookUrl('SHADOWFAX_WEBHOOK_URL', '/webhooks/shadowfax'),
  trackingUrl: resolvePublicWebhookUrl('SHADOWFAX_WEBHOOK_URL', '/webhooks/shadowfax'),
  legacyUrl: resolvePublicWebhookUrl('SHADOWFAX_LEGACY_WEBHOOK_URL', '/api/webhook/shadowfax'),
  trackAliasUrl: resolvePublicWebhookUrl(
    'SHADOWFAX_TRACK_WEBHOOK_URL',
    '/api/webhook/shadowfax/track',
  ),
  method: 'POST',
  contentType: 'application/json',
  expectedResponse: '200 OK',
  authorizationPresent:
    Boolean(
      String(process.env.SHADOWFAX_WEBHOOK_BASIC_USERNAME || '').trim() &&
        String(process.env.SHADOWFAX_WEBHOOK_BASIC_PASSWORD || '').trim(),
    ) || String(process.env.SHADOWFAX_WEBHOOK_REQUIRE_AUTH || '').toLowerCase() === 'true',
  authentication: {
    type: String(process.env.SHADOWFAX_WEBHOOK_BASIC_USERNAME || '').trim()
      ? 'basic_auth'
      : 'optional_shared_secret',
    secretRequired:
      Boolean(
        String(process.env.SHADOWFAX_WEBHOOK_BASIC_USERNAME || '').trim() &&
          String(process.env.SHADOWFAX_WEBHOOK_BASIC_PASSWORD || '').trim(),
      ) || String(process.env.SHADOWFAX_WEBHOOK_REQUIRE_AUTH || '').toLowerCase() === 'true',
    supportedHeaders: ['authorization', 'x-shadowfax-secret'],
  },
  suggestedTopics: [
    'FWD Marketplace',
    'FWD Warehouse',
    'Return Seller',
    'Return Origin',
    'Seller Delivery',
    'Invoice',
  ],
  samplePayloadFields: [
    'awb_number',
    'request_id',
    'client_request_id',
    'order_id',
    'event',
    'status',
    'current_status',
    'current_location',
    'comments',
  ],
})

const buildXpressbeesWebhookConfig = () => ({
  trackingUrl: resolvePublicWebhookUrl('XPRESSBEES_WEBHOOK_URL', XPRESSBEES_WEBHOOK_PATH),
  legacyUrl: resolvePublicWebhookUrl('XPRESSBEES_LEGACY_WEBHOOK_URL', '/api/webhook/xpressbees'),
  trackAliasUrl: resolvePublicWebhookUrl(
    'XPRESSBEES_TRACK_WEBHOOK_URL',
    '/api/webhook/xpressbees/track',
  ),
  method: 'POST',
  contentType: 'application/json',
  expectedResponse: '200 OK',
  authentication: {
    type: 'hmac_sha256',
    headerName: XPRESSBEES_WEBHOOK_SIGNATURE_HEADER,
    encoding: 'base64',
    secretRequired: false,
    secretRecommended: true,
  },
  samplePayloadFields: [
    'awb_number',
    'status',
    'event_time',
    'location',
    'message',
    'rto_awb',
  ],
})

const maskCredential = (value?: string | null) => {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  if (normalized.length <= 8) return `${normalized.slice(0, 2)}${'*'.repeat(Math.max(normalized.length - 2, 0))}`
  return `${normalized.slice(0, 4)}${'*'.repeat(Math.max(normalized.length - 8, 0))}${normalized.slice(-4)}`
}

export const getCourierCredentialsController = async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select({
        provider: courier_credentials.provider,
        apiBase: courier_credentials.apiBase,
        clientName: courier_credentials.clientName,
        apiKey: courier_credentials.apiKey,
        clientId: courier_credentials.clientId,
        username: courier_credentials.username,
        password: courier_credentials.password,
        webhookSecret: courier_credentials.webhookSecret,
        metadata: courier_credentials.metadata,
      })
      .from(courier_credentials)
      .where(
        inArray(courier_credentials.provider, [
          'delhivery',
          'delhivery_b2b',
          'ekart',
          'xpressbees',
          'shadowfax',
          'innofulfill',
          AMAZON_CREDENTIALS_PROVIDER,
        ]),
      )

    const defaults = {
      delhivery: {
        provider: 'delhivery',
        apiBase: 'https://track.delhivery.com',
        clientName: '',
        hasApiKey: false,
        apiKeyMasked: '',
        webhookConfig: buildDelhiveryWebhookConfig(),
      },
      delhiveryB2B: {
        provider: 'delhivery_b2b',
        apiBase: 'https://ltl-clients-api.delhivery.com',
        username: '',
        clientId: '',
        warehouseId: '',
        freightMode: 'fop',
        fmPickup: true,
        hasPassword: false,
      },
      ekart: {
        provider: 'ekart',
        apiBase: 'https://app.elite.ekartlogistics.in',
        clientId: '',
        username: '',
        hasPassword: false,
        hasWebhookSecret: false,
        webhookConfig: buildEkartWebhookConfig(),
      },
      xpressbees: {
        provider: 'xpressbees',
        email: '',
        username: '',
        hasPassword: false,
      },
      shadowfax: {
        provider: 'shadowfax',
        apiBase: 'https://dale.shadowfax.in/api',
        clientName: '',
        hasApiKey: false,
        apiKeyMasked: '',
        hasWebhookSecret: false,
        webhookConfig: buildShadowfaxWebhookConfig(),
      },
      innofulfill: {
        provider: 'innofulfill',
        apiBase: 'https://apis.innofulfill.com',
        username: '',
        tenantId: '',
        userId: '',
        hasPassword: false,
        hasApiKey: false,
        apiKeyMasked: '',
        hasRefreshToken: false,
      },
      amazon: buildAmazonCredentialResponse(),
    }

    const data = rows.reduce<Record<string, any>>((acc, row) => {
      const provider = (row.provider || '').toLowerCase()
      if (!provider) return acc
      if (provider === 'delhivery') {
        const apiKey = row.apiKey || ''
        acc.delhivery = {
          provider: 'delhivery',
          apiBase: row.apiBase || 'https://track.delhivery.com',
          clientName: row.clientName || '',
          hasApiKey: Boolean(apiKey.trim()),
          apiKeyMasked: apiKey
            ? `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 0))}${apiKey.slice(-4)}`
            : '',
          webhookConfig: buildDelhiveryWebhookConfig(),
        }
      } else if (provider === 'delhivery_b2b') {
        const metadata = row.metadata || {}
        acc.delhiveryB2B = {
          provider: 'delhivery_b2b',
          apiBase: row.apiBase || 'https://ltl-clients-api.delhivery.com',
          username: row.username || '',
          clientId: row.clientId || '',
          warehouseId: String(metadata.warehouse_id || ''),
          freightMode: metadata.freight_mode === 'fod' ? 'fod' : 'fop',
          fmPickup: metadata.fm_pickup !== false,
          hasPassword: Boolean((row.password || '').trim()),
        }
      } else if (provider === 'ekart') {
        const hasPassword = Boolean((row.password || '').trim())
        const hasWebhookSecret = Boolean((row.webhookSecret || '').trim())
        acc.ekart = {
          provider: 'ekart',
          apiBase: row.apiBase || 'https://app.elite.ekartlogistics.in',
          clientId: row.clientId || '',
          username: row.username || '',
          hasPassword,
          hasWebhookSecret,
          webhookConfig: buildEkartWebhookConfig(),
        }
      } else if (provider === 'xpressbees') {
        const hasPassword = Boolean((row.password || '').trim())
        acc.xpressbees = {
          provider: 'xpressbees',
          email: row.username || '',
          username: row.username || '',
          hasPassword,
        }
      } else if (provider === 'shadowfax') {
        const apiKey = row.apiKey || ''
        const hasWebhookSecret = Boolean((row.webhookSecret || '').trim())
        acc.shadowfax = {
          provider: 'shadowfax',
          apiBase: row.apiBase || 'https://dale.shadowfax.in/api',
          clientName: row.clientName || '',
          hasApiKey: Boolean(apiKey.trim()),
          apiKeyMasked: apiKey
            ? `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 0))}${apiKey.slice(-4)}`
            : '',
          hasWebhookSecret,
          webhookConfig: buildShadowfaxWebhookConfig(),
        }
      } else if (provider === 'innofulfill') {
        const metadata = row.metadata || {}
        const apiKey = row.apiKey || ''
        const refreshToken = String(metadata.refreshToken || metadata.refresh_token || '')
        acc.innofulfill = {
          provider: 'innofulfill',
          apiBase: row.apiBase || 'https://apis.innofulfill.com',
          username: row.username || '',
          tenantId: String(metadata.tenantId || metadata.tenant_id || ''),
          userId: String(metadata.userId || metadata.user_id || ''),
          hasPassword: Boolean((row.password || '').trim()),
          hasApiKey: Boolean(apiKey.trim()),
          apiKeyMasked: maskCredential(apiKey),
          hasRefreshToken: Boolean(refreshToken.trim()),
          refreshTokenMasked: maskCredential(refreshToken),
        }
      } else if (provider === AMAZON_CREDENTIALS_PROVIDER) {
        acc.amazon = buildAmazonCredentialResponse(row)
      }
      return acc
    }, { ...defaults })

    res.json({
      success: true,
      data,
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to fetch courier credentials' })
  }
}

export const updateInnofulfillCredentialsController = async (req: Request, res: Response) => {
  const { apiBase, username, password, apiKey, tenantId, userId, refreshToken } = req.body || {}

  try {
    const nextApiBase =
      typeof apiBase === 'string' && apiBase.trim()
        ? apiBase.trim().replace(/\/+$/, '')
        : 'https://apis.innofulfill.com'
    const nextUsername = typeof username === 'string' ? username.trim() : undefined
    const nextPassword = typeof password === 'string' ? password.trim() : undefined
    const nextApiKey = typeof apiKey === 'string' ? apiKey.trim() : undefined
    const nextTenantId = typeof tenantId === 'string' ? tenantId.trim() : undefined
    const nextUserId = typeof userId === 'string' ? userId.trim() : undefined
    const nextRefreshToken =
      typeof refreshToken === 'string' ? refreshToken.trim() : undefined

    const [existing] = await db
      .select({
        id: courier_credentials.id,
        username: courier_credentials.username,
        password: courier_credentials.password,
        apiKey: courier_credentials.apiKey,
        metadata: courier_credentials.metadata,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'innofulfill'))
      .limit(1)

    const existingMetadata =
      existing?.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}

    const values = {
      provider: 'innofulfill',
      apiBase: nextApiBase,
      username: nextUsername ?? existing?.username ?? '',
      password: nextPassword || existing?.password || '',
      apiKey: nextApiKey || existing?.apiKey || '',
      metadata: {
        ...existingMetadata,
        tenantId: nextTenantId ?? String(existingMetadata.tenantId || existingMetadata.tenant_id || ''),
        userId: nextUserId ?? String(existingMetadata.userId || existingMetadata.user_id || ''),
        ...(nextRefreshToken ? { refreshToken: nextRefreshToken } : {}),
      },
      updatedAt: new Date(),
    }

    await db
      .insert(courier_credentials)
      .values(values as any)
      .onConflictDoUpdate({
        target: courier_credentials.provider,
        set: values as any,
      })

    res.json({ success: true, message: 'Innofulfill credentials updated successfully' })
  } catch (err: any) {
    console.error('Failed to update Innofulfill credentials:', err)
    res.status(500).json({
      success: false,
      message: err?.message || 'Failed to update Innofulfill credentials',
    })
  }
}

export const testInnofulfillCredentialsController = async (req: Request, res: Response) => {
  try {
    const service = new InnofulfillService({
      apiBase: req.body?.apiBase,
      username: req.body?.username,
      password: req.body?.password,
      apiKey: req.body?.apiKey,
      tenantId: req.body?.tenantId,
      userId: req.body?.userId,
    })
    const result = req.body?.apiKey ? { ok: true, auth: 'api-key' } : await service.login()
    res.json({
      success: true,
      data: {
        ok: true,
        auth: req.body?.apiKey ? 'api-key' : 'login',
        userId: result?.user_id || result?.userId || null,
        tenantId: result?.tenant_id || result?.tenantId || null,
        expiresIn: result?.expires_in || null,
      },
    })
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to test Innofulfill credentials',
    })
  }
}

export const testInnofulfillRefreshTokenController = async (req: Request, res: Response) => {
  try {
    const service = new InnofulfillService({
      apiBase: req.body?.apiBase,
      username: req.body?.username,
      password: req.body?.password,
      apiKey: req.body?.apiKey,
      tenantId: req.body?.tenantId,
      userId: req.body?.userId,
      refreshToken: req.body?.refreshToken,
    })
    const result = await service.refreshToken({
      userId: req.body?.userId,
      refreshToken: req.body?.refreshToken,
    })
    res.json({
      success: true,
      data: {
        ok: true,
        auth: 'refresh-token',
        expiresIn: result?.expires_in || null,
        tokenType: result?.token_type || null,
        hasIdToken: Boolean(result?.id_token),
        hasRefreshToken: Boolean(result?.refresh_token),
      },
    })
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to refresh Innofulfill token',
    })
  }
}

export const testInnofulfillEcommServiceabilityController = async (
  req: Request,
  res: Response,
) => {
  try {
    const service = new InnofulfillService({
      apiBase: req.body?.apiBase,
      username: req.body?.username,
      password: req.body?.password,
      apiKey: req.body?.apiKey,
      tenantId: req.body?.tenantId,
      userId: req.body?.userId,
      refreshToken: req.body?.refreshToken,
    })
    const result = await service.checkEcommServiceability({
      fromPincode: req.body?.fromPincode ?? req.body?.origin ?? req.body?.pickupPincode,
      toPincode: req.body?.toPincode ?? req.body?.destination ?? req.body?.dropPincode,
      paymentMode: req.body?.paymentMode,
      operationType: req.body?.operationType,
      carriers: req.body?.carriers,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to test Innofulfill ECOMM serviceability',
    })
  }
}

export const testInnofulfillHyperlocalServiceabilityController = async (
  req: Request,
  res: Response,
) => {
  try {
    const service = new InnofulfillService({
      apiBase: req.body?.apiBase,
      username: req.body?.username,
      password: req.body?.password,
      apiKey: req.body?.apiKey,
      tenantId: req.body?.tenantId,
      userId: req.body?.userId,
      refreshToken: req.body?.refreshToken,
    })
    const result = await service.checkHyperlocalServiceability({
      pickupAddress: req.body?.pickupAddress,
      shippingAddress: req.body?.shippingAddress,
      paymentMode: req.body?.paymentMode,
      operationType: req.body?.operationType,
      carriers: req.body?.carriers,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to test Innofulfill Hyperlocal serviceability',
    })
  }
}

export const testInnofulfillEcommRateController = async (req: Request, res: Response) => {
  try {
    const service = new InnofulfillService({
      apiBase: req.body?.apiBase,
      username: req.body?.username,
      password: req.body?.password,
      apiKey: req.body?.apiKey,
      tenantId: req.body?.tenantId,
      userId: req.body?.userId,
      refreshToken: req.body?.refreshToken,
    })
    const result = await service.calculateEcommRate({
      fromPincode: req.body?.fromPincode ?? req.body?.origin ?? req.body?.pickupPincode,
      toPincode: req.body?.toPincode ?? req.body?.destination ?? req.body?.dropPincode,
      serviceType: req.body?.serviceType,
      productType: req.body?.productType,
      weight: req.body?.weight,
      length: req.body?.length,
      height: req.body?.height,
      width: req.body?.width ?? req.body?.breadth,
      includeDefaultCharges: req.body?.includeDefaultCharges,
      userOptions: req.body?.userOptions,
      filters: req.body?.filters,
      deliveryMode: req.body?.deliveryMode,
      delivery_mode: req.body?.delivery_mode,
      paymentMode: req.body?.paymentMode,
      payment_type: req.body?.payment_type,
      insurance: req.body?.insurance,
      order_amount: req.body?.order_amount,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to test Innofulfill ECOMM rate calculation',
    })
  }
}

export const testInnofulfillHyperlocalRateController = async (req: Request, res: Response) => {
  try {
    const service = new InnofulfillService({
      apiBase: req.body?.apiBase,
      username: req.body?.username,
      password: req.body?.password,
      apiKey: req.body?.apiKey,
      tenantId: req.body?.tenantId,
      userId: req.body?.userId,
      refreshToken: req.body?.refreshToken,
    })
    const result = await service.calculateHyperlocalRate({
      fromPincode: req.body?.fromPincode ?? req.body?.origin ?? req.body?.pickupPincode,
      toPincode: req.body?.toPincode ?? req.body?.destination ?? req.body?.dropPincode,
      serviceType: req.body?.serviceType,
      productType: req.body?.productType,
      weight: req.body?.weight,
      length: req.body?.length,
      height: req.body?.height,
      width: req.body?.width ?? req.body?.breadth,
      distance: req.body?.distance ?? req.body?.distanceKm ?? req.body?.distance_km,
      includeDefaultCharges: req.body?.includeDefaultCharges,
      userOptions: req.body?.userOptions,
      paymentMode: req.body?.paymentMode,
      payment_type: req.body?.payment_type,
      insurance: req.body?.insurance,
      order_amount: req.body?.order_amount,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to test Innofulfill Hyperlocal rate calculation',
    })
  }
}

export const testInnofulfillListOrdersController = async (req: Request, res: Response) => {
  try {
    const service = new InnofulfillService({
      apiBase: req.body?.apiBase,
      username: req.body?.username,
      password: req.body?.password,
      apiKey: req.body?.apiKey,
      tenantId: req.body?.tenantId,
      userId: req.body?.userId,
      refreshToken: req.body?.refreshToken,
    })
    const filters = req.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {}
    const result = await service.listOrders({
      ...filters,
      page: req.body?.page ?? filters.page,
      limit: req.body?.limit ?? filters.limit,
      sortOrder: req.body?.sortOrder ?? filters.sortOrder,
      orderId: req.body?.orderId ?? filters.orderId,
      referenceId: req.body?.referenceId ?? filters.referenceId,
      orderStatus: req.body?.orderStatus ?? filters.orderStatus,
      orderType: req.body?.orderType ?? filters.orderType,
      parcelCategory: req.body?.parcelCategory ?? filters.parcelCategory,
      deliveryMode: req.body?.deliveryMode ?? filters.deliveryMode,
      deliveryPromise: req.body?.deliveryPromise ?? filters.deliveryPromise,
      carrierName: req.body?.carrierName ?? filters.carrierName,
      awbNumber: req.body?.awbNumber ?? filters.awbNumber,
      phone: req.body?.phone ?? filters.phone,
      paymentType: req.body?.paymentType ?? filters.paymentType,
      startDate: req.body?.startDate ?? filters.startDate,
      endDate: req.body?.endDate ?? filters.endDate,
      manifested: req.body?.manifested ?? filters.manifested,
      autoManifest: req.body?.autoManifest ?? filters.autoManifest,
      returnable: req.body?.returnable ?? filters.returnable,
      filterByCurrentUser: req.body?.filterByCurrentUser ?? filters.filterByCurrentUser,
      bulkId: req.body?.bulkId ?? filters.bulkId,
      destinationCity: req.body?.destinationCity ?? filters.destinationCity,
      destinationZip: req.body?.destinationZip ?? filters.destinationZip,
      'addresses.type': req.body?.['addresses.type'] ?? filters['addresses.type'],
      'addresses.state': req.body?.['addresses.state'] ?? filters['addresses.state'],
      'addresses.city': req.body?.['addresses.city'] ?? filters['addresses.city'],
      'addresses.zip': req.body?.['addresses.zip'] ?? filters['addresses.zip'],
      'addresses.country': req.body?.['addresses.country'] ?? filters['addresses.country'],
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to test Innofulfill list orders',
    })
  }
}

export const testInnofulfillGetOrderController = async (req: Request, res: Response) => {
  try {
    const service = new InnofulfillService({
      apiBase: req.body?.apiBase,
      username: req.body?.username,
      password: req.body?.password,
      apiKey: req.body?.apiKey,
      tenantId: req.body?.tenantId,
      userId: req.body?.userId,
      refreshToken: req.body?.refreshToken,
    })
    const result = await service.getOrderDetails(req.body?.orderId)

    res.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to test Innofulfill get order',
    })
  }
}

export const testInnofulfillManifestOrdersController = async (req: Request, res: Response) => {
  try {
    const service = new InnofulfillService({
      apiBase: req.body?.apiBase,
      username: req.body?.username,
      password: req.body?.password,
      apiKey: req.body?.apiKey,
      tenantId: req.body?.tenantId,
      userId: req.body?.userId,
      refreshToken: req.body?.refreshToken,
    })
    const result = await service.manifestOrdersBulk(req.body?.orderIds)

    res.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to test Innofulfill bulk manifest',
    })
  }
}

export const testInnofulfillCreateEcommOrderController = async (req: Request, res: Response) => {
  try {
    const service = new InnofulfillService({
      apiBase: req.body?.apiBase,
      username: req.body?.username,
      password: req.body?.password,
      apiKey: req.body?.apiKey,
      tenantId: req.body?.tenantId,
      userId: req.body?.userId,
      refreshToken: req.body?.refreshToken,
    })
    const orderPayload = req.body?.order && typeof req.body.order === 'object' ? req.body.order : req.body
    const result = await service.createEcommOrder(orderPayload)

    res.status(201).json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to test Innofulfill ECOMM order creation',
    })
  }
}

export const testInnofulfillCreateHyperlocalOrderController = async (req: Request, res: Response) => {
  try {
    const service = new InnofulfillService({
      apiBase: req.body?.apiBase,
      username: req.body?.username,
      password: req.body?.password,
      apiKey: req.body?.apiKey,
      tenantId: req.body?.tenantId,
      userId: req.body?.userId,
      refreshToken: req.body?.refreshToken,
    })
    const orderPayload = req.body?.order && typeof req.body.order === 'object' ? req.body.order : req.body
    const result = await service.createHyperlocalOrder(orderPayload)

    res.status(201).json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to test Innofulfill HYPERLOCAL order creation',
    })
  }
}

export const updateXpressbeesAwbRangeController = async (req: any, res: Response) => {
  try {
    const result = await createXpressbeesManualAwbRange({
      startAwb: req.body?.startAwb ?? req.body?.awbStartNumber ?? req.body?.start,
      endAwb: req.body?.endAwb ?? req.body?.awbEndNumber ?? req.body?.end,
      createdBy: req.user?.sub || null,
    })

    res.json({
      success: true,
      message: 'Xpressbees manual AWB range updated successfully',
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to update Xpressbees manual AWB range:', err)
    const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500
    res.status(statusCode).json({
      success: false,
      message: err?.message || 'Failed to update Xpressbees manual AWB range',
    })
  }
}

export const updateDelhiveryCredentialsController = async (req: Request, res: Response) => {
  const { apiBase, clientName, apiKey } = req.body || {}

  try {
    const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined
    const nextClientName = typeof clientName === 'string' ? clientName.trim() : undefined
    const nextApiKey = typeof apiKey === 'string' ? apiKey.trim() : undefined
    const hasNewApiKey = typeof nextApiKey === 'string' && nextApiKey.length > 0

    const [existing] = await db
      .select({ id: courier_credentials.id })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'delhivery'))
      .limit(1)

    if (existing) {
      const updatePayload: Record<string, any> = {
        updatedAt: new Date(),
      }
      if (nextApiBase !== undefined) {
        updatePayload.apiBase = nextApiBase || 'https://track.delhivery.com'
      }
      if (nextClientName !== undefined) {
        updatePayload.clientName = nextClientName
      }
      if (hasNewApiKey) {
        updatePayload.apiKey = nextApiKey
      }

      await db
        .update(courier_credentials)
        .set(updatePayload)
        .where(eq(courier_credentials.provider, 'delhivery'))
    } else {
      await db.insert(courier_credentials).values({
        provider: 'delhivery',
        apiBase: nextApiBase || 'https://track.delhivery.com',
        clientName: nextClientName || '',
        apiKey: hasNewApiKey ? nextApiKey : '',
      })
    }

    const [saved] = await db
      .select({
        apiBase: courier_credentials.apiBase,
        clientName: courier_credentials.clientName,
        apiKey: courier_credentials.apiKey,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'delhivery'))
      .limit(1)

    res.json({
      success: true,
      message: 'Delhivery credentials updated successfully',
      data: {
        provider: 'delhivery',
        apiBase: saved?.apiBase || 'https://track.delhivery.com',
        clientName: saved?.clientName || '',
        hasApiKey: Boolean((saved?.apiKey || '').trim()),
        webhookConfig: buildDelhiveryWebhookConfig(),
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update Delhivery credentials' })
  }
}

export const updateDelhiveryB2BCredentialsController = async (req: Request, res: Response) => {
  const { apiBase, username, password, clientId, warehouseId, freightMode, fmPickup } =
    req.body || {}

  try {
    const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined
    const nextUsername = typeof username === 'string' ? username.trim() : undefined
    const nextPassword = typeof password === 'string' ? password.trim() : undefined
    const nextClientId = typeof clientId === 'string' ? clientId.trim() : undefined
    const nextWarehouseId = typeof warehouseId === 'string' ? warehouseId.trim() : undefined
    const hasNewPassword = Boolean(nextPassword)

    const [existing] = await db
      .select()
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, DELHIVERY_B2B_PROVIDER))
      .limit(1)

    const storedFreightMode =
      String(existing?.metadata?.freight_mode || '').toLowerCase() === 'fod' ? 'fod' : 'fop'
    const nextFreightMode =
      freightMode === undefined
        ? storedFreightMode
        : String(freightMode).toLowerCase() === 'fod'
          ? 'fod'
          : 'fop'
    const nextFmPickup =
      fmPickup === undefined ? existing?.metadata?.fm_pickup !== false : fmPickup !== false

    const metadata = {
      ...(existing?.metadata || {}),
      ...(nextWarehouseId !== undefined ? { warehouse_id: nextWarehouseId } : {}),
      freight_mode: nextFreightMode,
      fm_pickup: nextFmPickup,
    }

    if (existing) {
      const updatePayload: Record<string, any> = { metadata, updatedAt: new Date() }
      if (nextApiBase !== undefined) {
        updatePayload.apiBase = nextApiBase || DEFAULT_DELHIVERY_B2B_API_BASE
      }
      if (nextUsername !== undefined) updatePayload.username = nextUsername
      if (nextClientId !== undefined) updatePayload.clientId = nextClientId
      if (hasNewPassword) updatePayload.password = nextPassword

      await db
        .update(courier_credentials)
        .set(updatePayload)
        .where(eq(courier_credentials.provider, DELHIVERY_B2B_PROVIDER))
    } else {
      await db.insert(courier_credentials).values({
        provider: DELHIVERY_B2B_PROVIDER,
        apiBase: nextApiBase || DEFAULT_DELHIVERY_B2B_API_BASE,
        username: nextUsername || '',
        password: hasNewPassword ? nextPassword! : '',
        clientId: nextClientId || '',
        metadata,
      })
    }

    DelhiveryB2BService.clearTokenCache()

    const [saved] = await db
      .select()
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, DELHIVERY_B2B_PROVIDER))
      .limit(1)

    res.json({
      success: true,
      message: 'Delhivery B2B credentials updated successfully',
      data: {
        provider: DELHIVERY_B2B_PROVIDER,
        apiBase: saved?.apiBase || DEFAULT_DELHIVERY_B2B_API_BASE,
        username: saved?.username || '',
        clientId: saved?.clientId || '',
        warehouseId: String(saved?.metadata?.warehouse_id || ''),
        freightMode: saved?.metadata?.freight_mode === 'fod' ? 'fod' : 'fop',
        fmPickup: saved?.metadata?.fm_pickup !== false,
        hasPassword: Boolean((saved?.password || '').trim()),
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({
      success: false,
      message: 'Failed to update Delhivery B2B credentials',
    })
  }
}

export const testDelhiveryB2BCredentialsController = async (_req: Request, res: Response) => {
  try {
    const login = await new DelhiveryB2BService().login(true)
    return res.json({
      success: true,
      data: {
        authenticated: true,
        expiresAt: new Date(login.expiresAt).toISOString(),
      },
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || 500)
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      message: error?.message || 'Delhivery B2B credential test failed',
    })
  }
}

export const updateEkartCredentialsController = async (req: Request, res: Response) => {
  const { apiBase, clientId, username, password, webhookSecret } = req.body || {}

  try {
    const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined
    const nextClientId = typeof clientId === 'string' ? clientId.trim() : undefined
    const nextUsername = typeof username === 'string' ? username.trim() : undefined
    const nextPassword = typeof password === 'string' ? password.trim() : undefined
    const nextWebhookSecret =
      typeof webhookSecret === 'string' ? webhookSecret.trim() : undefined
    const hasPassword = typeof nextPassword === 'string' && nextPassword.length > 0
    const hasWebhookSecret =
      typeof nextWebhookSecret === 'string' && nextWebhookSecret.length > 0

    const [existing] = await db
      .select({ id: courier_credentials.id })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'ekart'))
      .limit(1)

    if (existing) {
      const updatePayload: Record<string, any> = {
        updatedAt: new Date(),
      }
      if (nextApiBase !== undefined) {
        updatePayload.apiBase = nextApiBase || 'https://app.elite.ekartlogistics.in'
      }
      if (nextClientId !== undefined) {
        updatePayload.clientId = nextClientId
      }
      if (nextUsername !== undefined) {
        updatePayload.username = nextUsername
      }
      if (hasPassword) {
        updatePayload.password = nextPassword
      }
      if (hasWebhookSecret) {
        updatePayload.webhookSecret = nextWebhookSecret
      }

      await db
        .update(courier_credentials)
        .set(updatePayload)
        .where(eq(courier_credentials.provider, 'ekart'))
    } else {
      await db.insert(courier_credentials).values({
        provider: 'ekart',
        apiBase: nextApiBase || 'https://app.elite.ekartlogistics.in',
        clientName: '',
        apiKey: '',
        clientId: nextClientId || '',
        username: nextUsername || '',
        password: hasPassword ? nextPassword : '',
        webhookSecret: hasWebhookSecret ? nextWebhookSecret : '',
      })
    }

    EkartService.clearCachedConfig()

    const [saved] = await db
      .select({
        apiBase: courier_credentials.apiBase,
        clientId: courier_credentials.clientId,
        username: courier_credentials.username,
        password: courier_credentials.password,
        webhookSecret: courier_credentials.webhookSecret,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'ekart'))
      .limit(1)

    res.json({
      success: true,
      message: 'Ekart credentials updated successfully',
      data: {
        provider: 'ekart',
        apiBase: saved?.apiBase || 'https://app.elite.ekartlogistics.in',
        clientId: saved?.clientId || '',
        username: saved?.username || '',
        hasPassword: Boolean((saved?.password || '').trim()),
        hasWebhookSecret: Boolean(
          (saved?.webhookSecret || '').trim() || String(process.env.EKART_WEBHOOK_SECRET || '').trim(),
        ),
        webhookConfig: buildEkartWebhookConfig(),
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update Ekart credentials' })
  }
}

export const updateXpressbeesCredentialsController = async (req: Request, res: Response) => {
  const { email, username, password } = req.body || {}

  try {
    const nextEmail = typeof email === 'string' ? email.trim() : undefined
    const nextUsername =
      nextEmail !== undefined ? nextEmail : typeof username === 'string' ? username.trim() : undefined
    const nextPassword = typeof password === 'string' ? password.trim() : undefined
    const hasPassword = typeof nextPassword === 'string' && nextPassword.length > 0

    const [existing] = await db
      .select({ id: courier_credentials.id, metadata: courier_credentials.metadata })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'xpressbees'))
      .limit(1)

    if (existing) {
      const existingMetadata =
        existing.metadata && typeof existing.metadata === 'object' ? existing.metadata : {}
      const metadataWithoutAlternateAuth = { ...(existingMetadata as Record<string, any>) }
      const alternateAuthMetadataKeys = [
        'authBearer',
        'auth_bearer',
        'authorizationBearer',
        'secretKey',
        'secret_key',
        'xbKey',
        'xb_key',
        'xbAccessKey',
        'xb_access_key',
      ]
      alternateAuthMetadataKeys.forEach((key) => {
        delete metadataWithoutAlternateAuth[key]
      })
      const updatePayload: Record<string, any> = {
        apiKey: '',
        metadata: metadataWithoutAlternateAuth,
        updatedAt: new Date(),
      }
      if (nextUsername !== undefined) {
        updatePayload.username = nextUsername
      }
      if (hasPassword) {
        updatePayload.password = nextPassword
      }

      await db
        .update(courier_credentials)
        .set(updatePayload)
        .where(eq(courier_credentials.provider, 'xpressbees'))
    } else {
      await db.insert(courier_credentials).values({
        provider: 'xpressbees',
        apiBase: 'https://shipment.xpressbees.com',
        clientName: '',
        apiKey: '',
        clientId: '',
        username: nextUsername || '',
        password: hasPassword ? nextPassword : '',
        webhookSecret: '',
        metadata: {
          pincodeBusinessUnit: 'eComm',
          pincodeBusinessFlow: 'Forward',
          pickupBusinessService: 'PickUp',
          deliveryBusinessService: 'Delivery',
          serviceabilityVersion: 'v1',
          trackingVersion: 'v1',
        },
      })
    }

    const [saved] = await db
      .select({
        username: courier_credentials.username,
        password: courier_credentials.password,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'xpressbees'))
      .limit(1)

    XpressbeesService.clearCachedConfig()

    res.json({
      success: true,
      message: 'Xpressbees credentials updated successfully',
      data: {
        provider: 'xpressbees',
        email: saved?.username || '',
        username: saved?.username || '',
        hasPassword: Boolean((saved?.password || '').trim()),
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update Xpressbees credentials' })
  }
}

export const testXpressbeesCredentialsController = async (req: Request, res: Response) => {
  try {
    const body = req.body || {}
    const paymentType =
      String(body.paymentType || body.payment_type || 'cod').trim().toLowerCase() === 'prepaid'
        ? 'prepaid'
        : 'cod'

    const xpressbees = new XpressbeesService({
      configOverrides: {
        email:
          optionalCredentialString(body.username) || optionalCredentialString(body.email) || '',
        password: optionalCredentialString(body.password),
      },
      skipTokenPersist: true,
    })

    const result = await xpressbees.testConnection({
      origin: optionalCredentialString(body.origin) || optionalCredentialString(body.pickupPincode),
      destination:
        optionalCredentialString(body.destination) ||
        optionalCredentialString(body.deliveryPincode),
      paymentType,
      orderAmount:
        optionalCredentialString(body.orderAmount) || optionalCredentialString(body.order_amount),
      weight: optionalCredentialString(body.weight),
      forceFreshAuth: true,
    })

    res.json({
      success: true,
      data: result,
    })
  } catch (err: any) {
    console.error('Failed to test Xpressbees credentials:', err)
    res.status(500).json({
      success: false,
      message: err?.message || 'Failed to test Xpressbees credentials',
    })
  }
}

export const updateShadowfaxCredentialsController = async (req: Request, res: Response) => {
  const { apiBase, clientName, apiKey, webhookSecret } = req.body || {}

  try {
    const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined
    const nextClientName = typeof clientName === 'string' ? clientName.trim() : undefined
    const nextApiKey = typeof apiKey === 'string' ? apiKey.trim() : undefined
    const nextWebhookSecret =
      typeof webhookSecret === 'string' ? webhookSecret.trim() : undefined
    const hasNewApiKey = typeof nextApiKey === 'string' && nextApiKey.length > 0
    const hasWebhookSecret =
      typeof nextWebhookSecret === 'string' && nextWebhookSecret.length > 0

    const [existing] = await db
      .select({ id: courier_credentials.id })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'shadowfax'))
      .limit(1)

    if (existing) {
      const updatePayload: Record<string, any> = {
        updatedAt: new Date(),
      }
      if (nextApiBase !== undefined) {
        updatePayload.apiBase = nextApiBase || 'https://dale.shadowfax.in/api'
      }
      if (nextClientName !== undefined) {
        updatePayload.clientName = nextClientName
      }
      if (hasNewApiKey) {
        updatePayload.apiKey = nextApiKey
      }
      if (hasWebhookSecret) {
        updatePayload.webhookSecret = nextWebhookSecret
      }

      await db
        .update(courier_credentials)
        .set(updatePayload)
        .where(eq(courier_credentials.provider, 'shadowfax'))
    } else {
      await db.insert(courier_credentials).values({
        provider: 'shadowfax',
        apiBase: nextApiBase || 'https://dale.shadowfax.in/api',
        clientName: nextClientName || '',
        apiKey: hasNewApiKey ? nextApiKey : '',
        webhookSecret: hasWebhookSecret ? nextWebhookSecret : '',
      })
    }

    const [saved] = await db
      .select({
        apiBase: courier_credentials.apiBase,
        clientName: courier_credentials.clientName,
        apiKey: courier_credentials.apiKey,
        webhookSecret: courier_credentials.webhookSecret,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'shadowfax'))
      .limit(1)

    ShadowfaxService.clearCachedConfig()

    res.json({
      success: true,
      message: 'Shadowfax credentials updated successfully',
      data: {
        provider: 'shadowfax',
        apiBase: saved?.apiBase || 'https://dale.shadowfax.in/api',
        clientName: saved?.clientName || '',
        hasApiKey: Boolean((saved?.apiKey || '').trim()),
        hasWebhookSecret: Boolean((saved?.webhookSecret || '').trim()),
      },
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update Shadowfax credentials' })
  }
}

export const updateAmazonCredentialsController = async (req: Request, res: Response) => {
  const {
    apiBase,
    endpoint,
    accessToken,
    refreshToken,
    lwaClientId,
    clientId,
    lwaClientSecret,
    clientSecret,
    shippingBusinessId,
    region,
    sandbox,
    lwaTokenUrl,
    tokenUrl,
  } = req.body || {}

  try {
    const [existing] = await db
      .select()
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, AMAZON_CREDENTIALS_PROVIDER))
      .limit(1)

    const nextCredentials = { ...buildAmazonShippingCredentialsFromRow(existing) }
    const nextEndpoint = optionalCredentialString(endpoint) ?? optionalCredentialString(apiBase)
    const nextAccessToken = optionalCredentialString(accessToken)
    const nextRefreshToken = optionalCredentialString(refreshToken)
    const nextLwaClientId = optionalCredentialString(lwaClientId) ?? optionalCredentialString(clientId)
    const nextLwaClientSecret =
      optionalCredentialString(lwaClientSecret) ?? optionalCredentialString(clientSecret)
    const nextShippingBusinessId = optionalCredentialString(shippingBusinessId)
    const nextRegion = optionalCredentialString(region)
    const nextLwaTokenUrl =
      optionalCredentialString(lwaTokenUrl) ?? optionalCredentialString(tokenUrl)

    if (nextEndpoint !== undefined) {
      nextCredentials.endpoint = nextEndpoint
    }
    if (nextAccessToken) {
      nextCredentials.accessToken = nextAccessToken
    }
    if (nextRefreshToken) {
      nextCredentials.refreshToken = nextRefreshToken
    }
    if (nextLwaClientId !== undefined) {
      nextCredentials.lwaClientId = nextLwaClientId
    }
    if (nextLwaClientSecret) {
      nextCredentials.lwaClientSecret = nextLwaClientSecret
    }
    if (nextShippingBusinessId !== undefined) {
      nextCredentials.shippingBusinessId = nextShippingBusinessId || AMAZON_DEFAULT_BUSINESS_ID
    }
    if (nextRegion !== undefined) {
      nextCredentials.region = nextRegion || AMAZON_DEFAULT_REGION
    }
    if (sandbox !== undefined) {
      nextCredentials.sandbox = parseAmazonSandboxFlag(sandbox)
    }
    if (nextLwaTokenUrl !== undefined) {
      nextCredentials.lwaTokenUrl = nextLwaTokenUrl
    }

    const normalizedTokens = normalizeAmazonCredentialTokens({
      accessToken: nextCredentials.accessToken,
      refreshToken: nextCredentials.refreshToken,
    })
    nextCredentials.accessToken = normalizedTokens.accessToken
    nextCredentials.refreshToken = normalizedTokens.refreshToken

    const metadata = {
      accessToken: normalizeAmazonCredentialValue(nextCredentials.accessToken),
      refreshToken: normalizeAmazonCredentialValue(nextCredentials.refreshToken),
      lwaClientId: normalizeAmazonCredentialValue(nextCredentials.lwaClientId),
      lwaClientSecret: normalizeAmazonCredentialValue(nextCredentials.lwaClientSecret),
      endpoint: normalizeAmazonCredentialValue(nextCredentials.endpoint),
      region: normalizeAmazonCredentialValue(nextCredentials.region) || AMAZON_DEFAULT_REGION,
      sandbox: Boolean(nextCredentials.sandbox),
      shippingBusinessId:
        normalizeAmazonCredentialValue(nextCredentials.shippingBusinessId) ||
        AMAZON_DEFAULT_BUSINESS_ID,
      lwaTokenUrl: normalizeAmazonCredentialValue(nextCredentials.lwaTokenUrl),
    }

    const values = {
      provider: AMAZON_CREDENTIALS_PROVIDER,
      apiBase: metadata.endpoint,
      clientName: metadata.shippingBusinessId,
      apiKey: metadata.refreshToken || metadata.accessToken,
      clientId: metadata.lwaClientId,
      username: metadata.region,
      password: metadata.lwaClientSecret,
      webhookSecret: String(metadata.sandbox),
      metadata,
      updatedAt: new Date(),
    }

    await db
      .insert(courier_credentials)
      .values(values)
      .onConflictDoUpdate({
        target: courier_credentials.provider,
        set: values,
      })

    applyAmazonShippingCredentialsToEnv(nextCredentials, { overwriteExisting: true })

    const [saved] = await db
      .select()
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, AMAZON_CREDENTIALS_PROVIDER))
      .limit(1)

    res.json({
      success: true,
      message: 'Amazon credentials updated successfully',
      data: buildAmazonCredentialResponse(saved),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to update Amazon credentials' })
  }
}

export interface RateType {
  forward?: string | number
  rto?: string | number
}

// Utility: convert numbers to string for decimal fields
export const numericToString = (val: string | number | null | undefined): string | null => {
  if (val === null || val === undefined || val === '') return null
  return String(val)
}

// ---------------- Controller ----------------
export const updateShippingRateController = async (req: Request, res: Response) => {
  try {
    const courierId = Number(req.params.id) // courier_id from params
    let planId: string | undefined = req.params.planId // plan_id from params

    // Fallback: try to get planId from query or body if not in params
    if (!planId || planId === 'undefined') {
      planId = (req.query.planId as string) || (req.body.planId as string) || undefined
    }

    if (!courierId || isNaN(courierId)) {
      return res.status(400).json({ success: false, message: 'Invalid courier ID' })
    }

    if (!planId || planId === 'undefined') {
      return res.status(400).json({
        success: false,
        message: 'Invalid or missing plan ID. Please ensure a plan is selected.',
      })
    }

    const updates: ShippingRateUpdatePayload = req.body

    console.log(`[updateShippingRateController] courierId: ${courierId}, planId: ${planId}`)

    const updated = await updateShippingRate(courierId, updates, planId)
    if (!updated) return res.status(404).json({ success: false, message: 'Rate card not found' })

    res.json({ success: true, data: updated })
  } catch (err) {
    console.log('Error updating shipping rate:', err)
    const statusCode = isSlabValidationError(err) ? 400 : 500
    res.status(statusCode).json({
      success: false,
      message: isSlabValidationError(err)
        ? String((err as any)?.message || 'Invalid slab configuration')
        : 'Internal Server Error',
    })
  }
}

const isExcelRateCard = (file: any) => {
  const name = String(file?.originalname || '').toLowerCase()
  const mime = String(file?.mimetype || '').toLowerCase()
  return (
    name.endsWith('.xlsx') ||
    name.endsWith('.xls') ||
    mime.includes('spreadsheet') ||
    mime.includes('excel')
  )
}

const parseRateCardFile = (file: any) => {
  if (isExcelRateCard(file)) {
    const workbook = XLSX.read(file.buffer, { type: 'buffer' })
    const firstSheetName = workbook.SheetNames[0]
    if (!firstSheetName) {
      return { data: [] as CSVRow[], errors: [{ message: 'Excel file has no sheets' }] }
    }

    const worksheet = workbook.Sheets[firstSheetName]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
      defval: '',
      raw: false,
      blankrows: false,
    })

    return { data: rows.map(normalizeRateCardRow), errors: [] as any[] }
  }

  return parseRateCardCsvText(file.buffer.toString('utf8'))
}

export const importShippingRatesController = async (req: any, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' })
    }

    const planIdValue =
      req.query?.planId ??
      req.query?.plan_id ??
      req.body?.planId ??
      req.body?.plan_id ??
      undefined
    const businessTypeValue =
      req.query?.businessType ??
      req.query?.business_type ??
      req.body?.businessType ??
      req.body?.business_type ??
      undefined

    const planId = planIdValue != null && String(planIdValue).trim() ? String(planIdValue) : ''
    const businessType =
      businessTypeValue != null && String(businessTypeValue).trim()
        ? String(businessTypeValue)
        : ''

    if (!planId || !businessType) {
      return res.status(400).json({
        success: false,
        message: 'Missing planId/plan_id or businessType/business_type',
      })
    }

    const normalizedBusinessType = businessType.toLowerCase()
    if (normalizedBusinessType !== 'b2b' && normalizedBusinessType !== 'b2c') {
      return res.status(400).json({
        success: false,
        message: 'Invalid businessType/business_type',
      })
    }

    const targetCourierIdValue =
      req.query?.targetCourierId ??
      req.query?.target_courier_id ??
      req.body?.targetCourierId ??
      req.body?.target_courier_id ??
      undefined
    const targetCourierNameValue =
      req.query?.targetCourierName ??
      req.query?.target_courier_name ??
      req.body?.targetCourierName ??
      req.body?.target_courier_name ??
      undefined
    const targetServiceProviderValue =
      req.query?.targetServiceProvider ??
      req.query?.target_service_provider ??
      req.body?.targetServiceProvider ??
      req.body?.target_service_provider ??
      undefined
    const targetModeValue =
      req.query?.targetMode ??
      req.query?.target_mode ??
      req.body?.targetMode ??
      req.body?.target_mode ??
      undefined

    const targetCourier =
      [
        targetCourierIdValue,
        targetCourierNameValue,
        targetServiceProviderValue,
        targetModeValue,
      ].some((value) => value != null && String(value).trim())
        ? {
            courierId:
              targetCourierIdValue != null && String(targetCourierIdValue).trim()
                ? String(targetCourierIdValue).trim()
                : undefined,
            courierName:
              targetCourierNameValue != null && String(targetCourierNameValue).trim()
                ? String(targetCourierNameValue).trim()
                : undefined,
            serviceProvider:
              targetServiceProviderValue != null && String(targetServiceProviderValue).trim()
                ? String(targetServiceProviderValue).trim()
                : undefined,
            mode:
              targetModeValue != null && String(targetModeValue).trim()
                ? String(targetModeValue).trim()
                : undefined,
          }
        : undefined

    const { data, errors } = parseRateCardFile(req.file)

    if (errors.length) {
      console.error('Rate card parse errors:', errors)
      return res.status(400).json({ success: false, message: 'Invalid rate card file', errors })
    }

    const zonesList = await getAllZones(normalizedBusinessType)

    // Detect format: new slab-per-row format has a "Slab Type" column
    const headers = data.length ? Object.keys(data[0]) : []
    const isSlabFormat = headers.some((h) => h.trim() === 'Slab Type')
    let savedRows = 0

    if (normalizedBusinessType === 'b2c' && isSlabFormat) {
      savedRows = await importB2CSlabFormat(data as CSVRow[], planId, zonesList, {
        targetCourier,
      })
    } else {
      savedRows = await importFlatFormat(
        data as CSVRow[],
        planId,
        normalizedBusinessType,
        zonesList,
        { targetCourier },
      )
    }

    if (savedRows === 0) {
      return res.status(400).json({
        success: false,
        message:
          'No rate rows were imported. Check the plan, courier, mode, zone column names, forward slab values, and the RTO/Reverse Pickup percentage columns in the file.',
      })
    }

    res.json({
      success: true,
      message: `Shipping rates imported successfully. ${savedRows} rate rows saved.`,
      data: { savedRows },
    })
  } catch (err) {
    console.error('Error importing shipping rates:', err)
    const statusCode = isSlabValidationError(err) ? 400 : 500
    res.status(statusCode).json({
      success: false,
      message: isSlabValidationError(err)
        ? String((err as any)?.message || 'Invalid slab configuration')
        : 'Internal Server Error',
    })
  }
}

export const deleteShippingRateController = async (req: Request, res: Response) => {
  try {
    const courierId = Number(req.params.id)
    const planId = req.params.planId
    const businessType = req.query.businessType as 'b2b' | 'b2c'
    const zoneId = req.query.zoneId as string | undefined
    const serviceProvider = req.query.serviceProvider as string | undefined
    const mode = req.query.mode as string | undefined

    if (!courierId || !planId || !businessType) {
      return res
        .status(400)
        .json({ success: false, message: 'courierId, planId and businessType are required' })
    }

    const deleted = await deleteShippingRate(
      courierId,
      planId,
      businessType,
      zoneId,
      serviceProvider,
      mode,
    )

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'No matching rate found' })
    }

    res.json({ success: true, message: 'Rate(s) deleted successfully', data: deleted })
  } catch (err) {
    console.error('Error deleting shipping rate:', err)
    res.status(500).json({ success: false, message: 'Internal Server Error' })
  }
}

export const deleteCourierController = async (req: Request, res: Response) => {
  const { id } = req.params
  const { serviceProvider } = req.body

  try {
    if (!serviceProvider) {
      return res.status(400).json({ success: false, message: 'Service provider is required' })
    }
    await deleteCourierService(id, serviceProvider)
    res.json({ success: true, message: 'Courier deleted successfully' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ success: false, message: 'Failed to delete courier' })
  }
}
