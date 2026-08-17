import axios from 'axios'
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  SQL,
  sql,
} from 'drizzle-orm'
import { DelhiveryManifestError, HttpError } from '../../utils/classes'
import {
  calculateBookingWalletDebit,
  resolveGstInclusiveWalletDebit,
} from '../../utils/bookingWalletDebit'
import {
  getCourierProviderDisplayName,
  getProviderMetaCourierName,
  normalizeCourierProviderKey,
  resolveCourierProviderKeyFromFields,
} from '../../utils/courierProvider'
import {
  type DelhiveryShippingMode,
  getCanonicalDelhiveryCourierIdByMode,
  getDelhiveryCourierDisplayName,
  getDelhiveryShippingModeByCourierId,
  normalizeCourierId,
  resolveDelhiveryRateCardShippingMode,
  resolveDelhiveryShippingMode,
} from '../../utils/delhiveryCourier'
import { getAmazonOrderLabelReference } from '../../utils/orderLabels'
import { parseDelhiveryTrackingTimestamp } from '../../utils/delhiveryTrackingTime'
import { getBucketName, normalizeIndianPhoneForBooking } from '../../utils/functions'
import { db } from '../client'
import { b2b_orders } from '../schema/b2bOrders'
import { b2c_orders } from '../schema/b2cOrders'
import { invoicePreferences } from '../schema/invoicePreferences'
import { ndr_events } from '../schema/ndr'
// import { shippingRate, shippingRateCard } from '../schema/shippingRateCard'
import dayjs from 'dayjs'
import { sendWebhookEvent } from '../../services/webhookDelivery.service'
import { users } from '../schema/users'
import { wallets, walletTransactions } from '../schema/wallet'
import { computeRovChargeForOrder } from './insurance.service'
import { generateInvoicePDF, Product } from './invoice.service'
import { sendOrderStatusUpdateEmail, sendTaxInvoiceGeneratedEmail } from './eventEmail.service'
import { formatPickupAddress, loadInvoiceAssets, normalizePickupDetails } from './invoiceHelpers'
import { resolveInvoiceNumber } from './invoiceNumber.service'
import { createNotificationService } from './notifications.service'
import { getPaymentOptions } from './paymentOptions.service'
import { presignDownload, uploadBufferToStorage } from './upload.service'
import { logTrackingEvent } from './trackingEvents.service'
import { createWalletTransaction } from './wallet.service'
import { walletOfUser } from './walletTopupService'

import * as dotenv from 'dotenv'
import { PgTransaction } from 'drizzle-orm/pg-core'
import path from 'path'
import PdfPrinter from 'pdfmake'
import { requireMerchantOrderReadiness } from '../../utils/merchantReadiness'
import { courierPriorityProfiles } from '../schema/courierPriority'
import { couriers } from '../schema/couriers'
import { locations } from '../schema/locations'
import { addresses, pickupAddresses } from '../schema/pickupAddresses'
import { plans } from '../schema/plans'
import { shippingRates } from '../schema/shippingRates'
import { userPlans } from '../schema/userPlans'
import { userProfiles } from '../schema/userProfile'
import { b2bPincodes, b2bZoneToZoneRates, zones } from '../schema/zones'
import { calculateB2BRate } from './b2bAdmin.service'
import {
  computeEffectiveB2CCodCharge,
  computeB2CRateCardCharge,
  fetchResolvedB2CRateCards,
  formatCourierSlabDisplayName,
  mergeResolvedB2CRateCards,
  normalizeB2CServiceProvider,
  normalizeB2CShippingMode,
} from './b2cRateCard.service'
import {
  AfterShipTrackingService,
  isAfterShipTrackingConfigured,
} from './aftershipTracking.service'
import {
  buildAmazonShippingAddressFromWarehouse,
  cancelAmazonShipment,
  getAmazonShipmentDocuments,
  getAmazonShippingRates,
  getAmazonShippingTracking,
  purchaseAmazonShipment,
} from './amazonShipping.service'
import {
  applyAmazonShippingCredentialsToEnv,
  getStoredAmazonShippingCredentials,
} from './amazonShippingCredentials.service'
import {
  getEffectiveCourierConfig,
  hasUsableXpressbeesCredentials,
  type XpressbeesConfig,
} from './courierCredentials.service'
import {
  DelhiveryService,
  summarizeDelhiveryHeavyPincodeServiceability,
  summarizeDelhiveryPincodeServiceability,
} from './couriers/delhivery.service'
import {
  DelhiveryB2BService,
  mapDelhiveryB2BTrackingStatus,
} from './couriers/delhiveryB2B.service'
import { EkartService } from './couriers/ekart.service'
import { InnofulfillService } from './couriers/innofulfill.service'
import { ShadowfaxService } from './couriers/shadowfax.service'
import { XpressbeesService } from './couriers/xpressbees.service'
import { calculateOrderWeights } from './courierWeightCalculation.service'
import { generateLabelForOrder } from './generateCustomLabelService'
import { recordNdrEvent } from './ndr.service'
import { fetchCombinedOrdersPage } from './orderListing.service'
import { b2bOrderListSelect, b2cOrderListSelect } from './orderListSelects'
import {
  markXpressbeesManualAwbFailed,
  markXpressbeesManualAwbUsed,
  reserveNextXpressbeesManualAwb,
  XpressbeesManualAwbReservation,
} from './xpressbeesAwbRange.service'

// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

const pdfFonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
}

const MAX_MANIFEST_RETRY_ATTEMPTS = 3
const MANIFEST_ORDER_LOOKUP_CHUNK_SIZE = 500
const PROVIDER_MANIFEST_REQUEST_CHUNK_SIZE = 100
const WALLET_TRANSACTION_GST_PERCENT = 18
export const ORIGINAL_WALLET_DEBIT_REASONS = [
  'B2C Prepaid Order Payment',
  'B2C COD Service Charges',
  'reverse_shipment',
]

type ShadowfaxForwardModeSelection = 'marketplace' | 'warehouse'

const chunkArray = <T>(items: T[], size: number): T[][] => {
  const chunks: T[][] = []
  const chunkSize = Math.max(1, size)
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize))
  }
  return chunks
}

let b2cRazorpayChargeSchemaReady: Promise<void> | null = null

const ensureB2CRazorpayChargeSchema = () => {
  if (!b2cRazorpayChargeSchemaReady) {
    b2cRazorpayChargeSchemaReady = db
      .execute(sql`
        ALTER TABLE b2c_orders
          ADD COLUMN IF NOT EXISTS razorpay_charge_enabled BOOLEAN DEFAULT false,
          ADD COLUMN IF NOT EXISTS razorpay_charge_percent NUMERIC(6, 2) DEFAULT '0',
          ADD COLUMN IF NOT EXISTS razorpay_charge_amount NUMERIC(12, 2) DEFAULT '0'
      `)
      .then(() =>
        db.execute(sql`
          UPDATE b2c_orders
          SET
            razorpay_charge_enabled = COALESCE(razorpay_charge_enabled, false),
            razorpay_charge_percent = COALESCE(razorpay_charge_percent, '0'),
            razorpay_charge_amount = COALESCE(razorpay_charge_amount, '0')
          WHERE razorpay_charge_enabled IS NULL
            OR razorpay_charge_percent IS NULL
            OR razorpay_charge_amount IS NULL
        `),
      )
      .then(() => undefined)
      .catch((err) => {
        b2cRazorpayChargeSchemaReady = null
        throw err
      })
  }

  return b2cRazorpayChargeSchemaReady
}

const normalizeXpressbeesAwb = (value: unknown): string => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return ''
  return normalized.replace(/\D/g, '')
}

const parseXpressbeesAwbPool = (): string[] => {
  const raw =
    process.env.XPRESSBEES_PREALLOCATED_AWBS ||
    process.env.XPRESSBEES_AWB_POOL ||
    process.env.XPRESSBEES_TEST_AWBS ||
    ''

  return Array.from(
    new Set(
      raw
        .split(/[\s,;|]+/)
        .map(normalizeXpressbeesAwb)
        .filter(Boolean),
    ),
  )
}

const isTruthyEnvValue = (value: unknown): boolean =>
  ['true', '1', 'yes', 'y'].includes(String(value || '').trim().toLowerCase())

const isXpressbeesAwbCredentialError = (error: any): boolean => {
  const response = error?.response?.data || {}
  const code = String(response?.ReturnCode ?? response?.returnCode ?? response?.code ?? '').trim()
  const message = String(
    error?.message ||
      response?.ReturnMessage ||
      response?.returnMessage ||
      response?.message ||
      response?.error ||
      '',
  )
    .trim()
    .toLowerCase()

  return (
    message.includes('invalid xbaccesskey') ||
    message.includes('invalid xb access key') ||
    message.includes('invalid access key') ||
    (code === '101' && (message.includes('access') || message.includes('key')))
  )
}

const isXpressbeesAwbResolutionError = (error: any): boolean => {
  const message = String(error?.message || error || '').trim().toLowerCase()
  return (
    message.includes('xpressbees awb generation') ||
    message.includes('awb generation failed') ||
    message.includes('awb series') ||
    message.includes('manual awb range is not configured') ||
    message.includes('preallocated awbs') ||
    isXpressbeesAwbCredentialError(error)
  )
}

const getUnusedXpressbeesAwbs = async (awbs: string[]): Promise<string[]> => {
  const normalizedAwbs = Array.from(new Set(awbs.map(normalizeXpressbeesAwb).filter(Boolean)))
  if (!normalizedAwbs.length) return []

  const usedRows = await db
    .select({ awbNumber: b2c_orders.awb_number })
    .from(b2c_orders)
    .where(inArray(b2c_orders.awb_number, normalizedAwbs))

  const usedAwbs = new Set(usedRows.map((row) => normalizeXpressbeesAwb(row.awbNumber)))
  return normalizedAwbs.filter((awb) => !usedAwbs.has(awb))
}

const isXpressbeesManifestSuccess = (response: any): boolean => {
  const code = String(response?.ReturnCode ?? response?.returnCode ?? response?.code ?? '').trim()
  const message = String(
    response?.ReturnMessage ?? response?.returnMessage ?? response?.message ?? response?.Message ?? '',
  )
    .trim()
    .toLowerCase()

  return code === '100' || response?.status === true || response?.success === true || message === 'successful' || message === 'successfull'
}

const XPRESSBEES_PRE_SHIP_FLOW = 'xpressbees_pre_ship_manifestation'
const XPRESSBEES_MANUAL_MANIFEST_FLOW = 'xpressbees_manual_manifest_required'
const XPRESSBEES_SHIPMENTS2_FLOW = 'xpressbees_shipments2_create'

const getXpressbeesManifestMessage = (response: any): string =>
  String(
    response?.ReturnMessage ??
      response?.returnMessage ??
      response?.message ??
      response?.Message ??
      response?.error ??
      'Xpressbees shipment creation failed',
  ).trim()

const toRecord = (value: unknown): Record<string, any> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null

const parseRecordValue = (value: unknown): Record<string, any> => {
  const record = toRecord(value)
  if (record) return record

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) return {}
    try {
      return toRecord(JSON.parse(trimmed)) || {}
    } catch {
      return {}
    }
  }

  return {}
}

const firstNonEmptyText = (...values: unknown[]): string => {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (normalized) return normalized
  }
  return ''
}

const REVERSE_B2C_RATE_TYPES = ['reverse_pickup', 'rto'] as const
const FORWARD_B2C_RATE_TYPES = ['forward'] as const

const getPreferredB2CRateTypes = (isReverse: boolean) =>
  (isReverse ? REVERSE_B2C_RATE_TYPES : FORWARD_B2C_RATE_TYPES)

const getActiveB2CLocalRateForShipment = (courier: any, isReverse: boolean) => {
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

const getAmazonLabelReference = (...values: unknown[]): string | null => {
  for (const value of values) {
    const normalized = String(value ?? '').trim()
    if (normalized) return normalized
  }
  return null
}

const extractAmazonShipmentLabel = (payload: any): string | null => {
  if (!payload || typeof payload !== 'object') return null

  const candidateLists = [
    payload,
    payload?.payload,
    payload?.data,
    payload?.result,
    payload?.shipmentDocuments?.[0],
    payload?.packageDocumentDetail,
    payload?.packageDocumentDetails?.[0],
    payload?.packages?.[0],
  ]

  for (const candidate of candidateLists) {
    if (!candidate || typeof candidate !== 'object') continue
    const label = getAmazonLabelReference(
      candidate.label,
      candidate.labelUrl,
      candidate.label_url,
      candidate.documentUrl,
      candidate.document_url,
      candidate.url,
      candidate.downloadUrl,
      candidate.download_url,
      candidate.fileUrl,
      candidate.file_url,
    )
    if (label) return label
  }

  return null
}

const extractAmazonShipmentDocumentContents = (payload: any): string | null => {
  if (!payload || typeof payload !== 'object') return null

  const candidateLists = [
    payload,
    payload?.payload,
    payload?.data,
    payload?.result,
    payload?.shipmentDocuments?.[0],
    payload?.packageDocumentDetail,
    payload?.packageDocumentDetails?.[0],
    payload?.packages?.[0],
  ]

  for (const candidate of candidateLists) {
    if (!candidate || typeof candidate !== 'object') continue

    const packageDocuments = Array.isArray(candidate.packageDocuments)
      ? candidate.packageDocuments
      : []
    for (const document of packageDocuments) {
      const contents = firstNonEmptyText(
        document?.contents,
        document?.content,
        document?.base64,
        document?.document,
      )
      if (contents) return contents
    }

    const directContents = firstNonEmptyText(
      candidate.contents,
      candidate.content,
      candidate.base64,
      candidate.document,
    )
    if (directContents) return directContents
  }

  return null
}

const uploadAmazonShipmentDocumentToR2 = async ({
  contents,
  userId,
  shipmentId,
  packageClientReferenceId,
}: {
  contents: string
  userId: string
  shipmentId: string
  packageClientReferenceId: string
}) => {
  const normalizedContents = contents.trim()
  if (!normalizedContents) return null

  const base64Contents = normalizedContents.startsWith('data:')
    ? normalizedContents.split(',', 2)[1] || ''
    : normalizedContents
  if (!base64Contents) return null

  const pdfBuffer = Buffer.from(base64Contents, 'base64')
  if (!pdfBuffer.length) return null

  const { key } = await uploadBufferToStorage({
    buffer: pdfBuffer,
    filename: `amazon-label-${shipmentId}-${packageClientReferenceId}.pdf`,
    contentType: 'application/pdf',
    userId,
    folderKey: 'labels',
  })

  return key
}

const resolveAmazonShipmentLabel = async ({
  shipmentData,
  amazonPayload,
  amazonPackage,
  amazonShipmentId,
  amazonPackageClientReferenceId,
  amazonCredentials,
  userId,
}: {
  shipmentData: any
  amazonPayload: any
  amazonPackage: any
  amazonShipmentId?: string | null
  amazonPackageClientReferenceId?: string | null
  amazonCredentials: any
  userId: string
}) => {
  const directLabel = extractAmazonShipmentLabel({
    label: amazonPackage?.label,
    labelUrl: amazonPackage?.labelUrl,
    label_url: amazonPackage?.label_url,
    documentUrl: amazonPackage?.documentUrl,
    document_url: amazonPackage?.document_url,
    url: amazonPackage?.url,
    shipmentDocuments: amazonPayload?.shipmentDocuments,
    packageDocumentDetails: amazonPayload?.packageDocumentDetails,
    packages: amazonPayload?.packages,
  })

  if (directLabel) {
    return directLabel
  }

  if (!amazonShipmentId || !amazonPackageClientReferenceId) {
    return null
  }

  try {
    const documentsResponse: any = await getAmazonShipmentDocuments(
      {
        shipmentId: amazonShipmentId,
        packageClientReferenceId: amazonPackageClientReferenceId,
        format: 'PDF',
      },
      amazonCredentials,
    )

    const documentPayload =
      documentsResponse?.data?.payload ||
      documentsResponse?.data?.data ||
      documentsResponse?.data ||
      documentsResponse?.payload ||
      documentsResponse

    const fetchedLabel = extractAmazonShipmentLabel(documentPayload)
    if (fetchedLabel) return fetchedLabel

    const fetchedContents = extractAmazonShipmentDocumentContents(documentPayload)
    if (fetchedContents) {
      const storedLabel = await uploadAmazonShipmentDocumentToR2({
        contents: fetchedContents,
        userId,
        shipmentId: amazonShipmentId,
        packageClientReferenceId: amazonPackageClientReferenceId,
      })
      if (storedLabel) return storedLabel
    }
  } catch (error: any) {
    console.warn('[AmazonShipping] Failed to fetch shipment documents for label passthrough', {
      shipmentId: amazonShipmentId,
      packageClientReferenceId: amazonPackageClientReferenceId,
      message: error?.message || error,
    })
  }

  return directLabel
}

const resolveAmazonProviderLabelReference = async ({
  order,
  amazonCredentials,
}: {
  order: any
  amazonCredentials: any | null
}) => {
  const directLabel = getAmazonOrderLabelReference(order)
  if (directLabel) return directLabel

  if (!amazonCredentials) return null

  const providerMeta = parseRecordValue(order?.provider_meta)
  const amazonMeta = parseRecordValue(providerMeta.amazon || providerMeta.amazonMeta)
  const amazonPayload = amazonMeta && Object.keys(amazonMeta).length > 0 ? amazonMeta : providerMeta
  const amazonPackage = {
    label: firstNonEmptyText(
      providerMeta.amazon_label,
      providerMeta.amazonLabel,
      amazonMeta.label,
      amazonMeta.labelUrl,
      amazonMeta.label_url,
      amazonMeta.documentUrl,
      amazonMeta.document_url,
      amazonMeta.url,
    ),
  }
  const amazonShipmentId = firstNonEmptyText(
    providerMeta.amazon_shipment_id,
    providerMeta.amazonShipmentId,
    amazonMeta.shipmentId,
    amazonMeta.shipment_id,
    providerMeta.shipment_id,
    providerMeta.provider_reference,
    order?.shipment_id,
  )
  const amazonPackageClientReferenceId = firstNonEmptyText(
    providerMeta.amazon_package_client_reference_id,
    providerMeta.amazonPackageClientReferenceId,
    amazonMeta.packageClientReferenceId,
    amazonMeta.package_client_reference_id,
    providerMeta.package_client_reference_id,
    providerMeta.client_reference_id,
  )

  if (!amazonShipmentId || !amazonPackageClientReferenceId) return null

  return resolveAmazonShipmentLabel({
    shipmentData: { amazon: amazonPayload },
    amazonPayload,
    amazonPackage,
    amazonShipmentId,
    amazonPackageClientReferenceId,
    amazonCredentials,
    userId: String(order?.user_id || ''),
  })
}

const getXpressbeesManifestToken = (value: unknown): string => {
  const record = parseRecordValue(value)
  const data = parseRecordValue(record.data)
  const nested = parseRecordValue(record.xpressbees)
  const manifestation = parseRecordValue(nested.manifestation)

  return firstNonEmptyText(
    record.provider_manifest_id,
    record.provider_request_id,
    record.TokenNumber,
    record.tokenNumber,
    record.token_number,
    data.provider_manifest_id,
    data.TokenNumber,
    data.tokenNumber,
    data.token_number,
    manifestation.provider_manifest_id,
    manifestation.token_number,
    manifestation.tokenNumber,
    record.manifest,
  )
}

const normalizeXpressbeesManifestResponses = (response: any): any[] => {
  if (Array.isArray(response)) return response
  if (response === undefined || response === null) return []
  return [response]
}

const assertXpressbeesManifestAccepted = (response: any, context: string) => {
  const responses = normalizeXpressbeesManifestResponses(response)
  if (!responses.length) {
    throw new HttpError(502, `Xpressbees ${context} returned an empty response`)
  }

  const rejected = responses.filter((item) => !isXpressbeesManifestSuccess(item))
  if (rejected.length) {
    throw new HttpError(
      502,
      `Xpressbees ${context} failed: ${rejected
        .map((item) => getXpressbeesManifestMessage(item))
        .filter(Boolean)
        .join('; ')}`,
    )
  }
}

const hasXpressbeesPreShipManifestation = (order: any): boolean => {
  const meta = parseRecordValue(order?.provider_meta)
  const nested = parseRecordValue(meta.xpressbees)
  const manifestation = parseRecordValue(nested.manifestation)
  const status = firstNonEmptyText(
    meta.provider_manifest_status,
    manifestation.status,
    nested.provider_manifest_status,
  )
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
  const flow = firstNonEmptyText(meta.provider_flow, nested.booking_flow).toLowerCase()
  const hasAcceptedStatus =
    status === 'accepted' ||
    status === 'successful' ||
    status === 'success' ||
    status === 'pre_ship_manifested'
  const hasPreShipMarker = flow === XPRESSBEES_PRE_SHIP_FLOW || flow.includes('pre_ship')
  const providerManifestToken = firstNonEmptyText(
    getXpressbeesManifestToken(meta),
    order?.provider_request_id,
    order?.provider_reference,
    order?.shipment_id,
  )
  const awb = firstNonEmptyText(order?.awb_number, meta.awb_number)
  return Boolean(awb && providerManifestToken && (hasPreShipMarker || hasAcceptedStatus))
}

const mergeXpressbeesManifestMeta = ({
  existingMeta,
  localManifestKey,
  providerResponse,
  skippedProviderCall,
}: {
  existingMeta: unknown
  localManifestKey: string
  providerResponse?: any
  skippedProviderCall: boolean
}) => {
  const meta = parseRecordValue(existingMeta)
  const nested = parseRecordValue(meta.xpressbees)
  const existingManifestation = parseRecordValue(nested.manifestation)
  const providerManifestToken = firstNonEmptyText(
    getXpressbeesManifestToken(providerResponse),
    getXpressbeesManifestToken(meta),
  )

  return {
    ...meta,
    provider_flow: meta.provider_flow || XPRESSBEES_PRE_SHIP_FLOW,
    provider_manifest_status: 'accepted',
    provider_manifest_id: meta.provider_manifest_id || providerManifestToken || null,
    xpressbees: {
      ...nested,
      booking_flow: nested.booking_flow || XPRESSBEES_PRE_SHIP_FLOW,
      manifestation: {
        ...existingManifestation,
        provider_manifest_id:
          existingManifestation.provider_manifest_id || providerManifestToken || null,
        status: 'accepted',
        accepted_at: existingManifestation.accepted_at || new Date().toISOString(),
        skipped_duplicate_provider_call: skippedProviderCall,
        last_provider_manifest_response: providerResponse || existingManifestation.last_provider_manifest_response,
      },
      local_manifest: {
        key: localManifestKey,
        generated_at: new Date().toISOString(),
      },
    },
  }
}

const buildXpressbeesPickupVendorCode = (params: ShipmentParams, userId: string): string => {
  const pickup = params.pickup || ({} as ShipmentParams['pickup'])
  const explicit = String(
    (params as any).pickupVendorCode ||
      (params as any).PickupVendorCode ||
      (params as any).pickup_vendor_code ||
      (pickup as any).pickupVendorCode ||
      (pickup as any).pickup_vendor_code ||
      (pickup as any).vendorCode ||
      (pickup as any).vendor_code ||
      process.env.XPRESSBEES_PICKUP_VENDOR_CODE ||
      '',
  )
    .trim()
    .replace(/[^A-Za-z0-9]/g, '')

  if (explicit) return explicit.slice(0, 30)

  const base = [
    pickup.addressNickname,
    pickup.warehouse_name,
    pickup.name,
    pickup.pincode,
    String(pickup.phone || '').slice(-4),
    userId.slice(0, 8),
  ]
    .filter(Boolean)
    .join('')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()

  return `SL${base || userId.replace(/[^A-Za-z0-9]/g, '').toUpperCase()}`.slice(0, 30)
}

const ensureXpressbeesManifestPickupVendorCode = (order: any) => {
  const pickupDetails = parseRecordValue(order?.pickup_details)
  const meta = parseRecordValue(order?.provider_meta)
  const nested = parseRecordValue(meta.xpressbees)
  const existingCode = firstNonEmptyText(
    pickupDetails.pickupVendorCode,
    pickupDetails.pickup_vendor_code,
    pickupDetails.vendorCode,
    pickupDetails.vendor_code,
    order?.pickupVendorCode,
    order?.PickupVendorCode,
    meta.pickup_vendor_code,
    nested.pickup_vendor_code,
    process.env.XPRESSBEES_PICKUP_VENDOR_CODE,
  )
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 30)

  const pickupVendorCode =
    existingCode ||
    buildXpressbeesPickupVendorCode(
      {
        pickup: pickupDetails as ShipmentParams['pickup'],
      } as ShipmentParams,
      String(order?.user_id || order?.id || ''),
    )

  const nextPickupDetails = {
    ...pickupDetails,
    pickupVendorCode,
    pickup_vendor_code: pickupVendorCode,
  }

  return {
    order: {
      ...order,
      pickup_details: nextPickupDetails,
      pickupVendorCode,
      PickupVendorCode: pickupVendorCode,
    },
    pickupDetails: nextPickupDetails,
    generated: !existingCode,
  }
}

type XpressbeesAwbCandidate = {
  awb: string
  source: 'explicit' | 'manual_range' | 'live_api' | 'preallocated_pool'
  manualReservation?: XpressbeesManualAwbReservation
}

const resolveXpressbeesAwbCandidates = async (
  params: ShipmentParams,
  xpressbees?: XpressbeesService,
  userId?: string,
): Promise<XpressbeesAwbCandidate[]> => {
  const explicitAwbs = [
    (params as any).awb_number,
    (params as any).awb,
    (params as any).AirWayBillNO,
    (params as any).xpressbees_awb,
    (params as any).provider_awb,
  ]
    .map(normalizeXpressbeesAwb)
    .filter(Boolean)

  if (explicitAwbs.length) {
    return Array.from(new Set(explicitAwbs)).map((awb) => ({ awb, source: 'explicit' }))
  }

  const manualReservation = await reserveNextXpressbeesManualAwb({
    orderNumber: params.order_number,
    userId,
  })
  if (manualReservation?.awb) {
    return [
      {
        awb: manualReservation.awb,
        source: 'manual_range',
        manualReservation,
      },
    ]
  }

  let fallbackPool: string[] = []

  if (xpressbees && isTruthyEnvValue(process.env.XPRESSBEES_ALLOW_LIVE_AWB_GENERATION)) {
    try {
      const generated = await xpressbees.generateAwbNumber({
        deliveryType: params.payment_type,
      })
      const generatedAwbs = [
        ...(Array.isArray(generated.awbs) ? generated.awbs : []),
        generated.awb,
      ]
        .map(normalizeXpressbeesAwb)
        .filter(Boolean)
      const availableGeneratedAwbs = await getUnusedXpressbeesAwbs(generatedAwbs)
      if (availableGeneratedAwbs.length) {
        return availableGeneratedAwbs.map((awb) => ({ awb, source: 'live_api' }))
      }

      throw new HttpError(
        502,
        `Xpressbees generated AWB batch ${generated.batchId} but every returned AWB is already used locally.`,
      )
    } catch (err: any) {
      fallbackPool = parseXpressbeesAwbPool()
      const allowConfiguredFallback = isTruthyEnvValue(
        process.env.XPRESSBEES_ALLOW_PREALLOCATED_AWB_FALLBACK,
      )
      if (!allowConfiguredFallback) {
        throw err
      }
      console.warn('[Xpressbees] AWB API generation failed, using configured AWB pool fallback', {
        order_number: params.order_number,
        fallback_reason: isXpressbeesAwbCredentialError(err)
          ? 'invalid_awb_access_key'
          : 'configured',
        message: err?.message || err,
      })
    }
  }

  const pool = fallbackPool.length ? fallbackPool : parseXpressbeesAwbPool()
  if (!pool.length) {
    throw new HttpError(
      400,
      'Xpressbees manual AWB range is not configured. Add the AWB starting and ending number in Admin > Couriers > Credentials before booking Xpressbees shipments.',
    )
  }

  const available = await getUnusedXpressbeesAwbs(pool)
  if (!available.length) {
    throw new HttpError(400, 'No unused Xpressbees preallocated AWBs are available.')
  }

  return available.map((awb) => ({ awb, source: 'preallocated_pool' }))
}

const getXpressbeesManifestServiceType = (
  params: ShipmentParams,
  slabbedFreight: { rate_card_mode?: string | null; rate_card_courier_name?: string | null },
): string => {
  const raw = String(
    (params as any).provider_service ||
      (params as any).service_type ||
      params.shipping_mode ||
      slabbedFreight.rate_card_mode ||
      slabbedFreight.rate_card_courier_name ||
      process.env.XPRESSBEES_MANIFEST_SERVICE_TYPE ||
      'SD',
  )
    .trim()
    .toLowerCase()

  if (raw.includes('air')) return 'AIR'
  if (raw.includes('surface') || raw.includes('sfc')) return 'SFC'
  if (raw.includes('intrasdd')) return 'IntraSDD'
  if (raw.includes('sdd')) return 'SDD'
  if (raw.includes('ndd')) return 'NDD'
  return 'SD'
}

const normalizeShadowfaxForwardModeValue = (value: unknown): ShadowfaxForwardModeSelection => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (['warehouse', 'wh', 'warehouse_pickup', 'warehouse_forward'].includes(normalized)) {
    return 'warehouse'
  }

  return 'marketplace'
}

const normalizeShadowfaxServiceModeValue = (
  value: unknown,
  fallback: 'regular' | 'surface' = 'surface',
) => {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')

  if (normalized === 'regular') return 'regular'
  if (normalized === 'surface') return 'surface'
  return fallback
}

const isShadowfaxReverseShipment = (params: {
  isReverse?: boolean | null
  payment_type?: string | null
  order_type?: string | null
}) =>
  params.isReverse === true ||
  String(params.payment_type || '')
    .trim()
    .toLowerCase() === 'reverse' ||
  String(params.order_type || '')
    .trim()
    .toLowerCase() === 'reverse'

const resolveShadowfaxOrderMode = (
  params: {
    isReverse?: boolean | null
    payment_type?: string | null
    order_type?: string | null
  },
  explicitMode?: unknown,
): ShadowfaxForwardModeSelection => {
  if (isShadowfaxReverseShipment(params)) return 'warehouse'
  if (explicitMode !== undefined && explicitMode !== null && String(explicitMode).trim()) {
    return 'marketplace'
  }
  return 'marketplace'
}

const resolveCourierBookingLifecycle = (
  integrationType: string,
  options: {
    providerFlow?: string | null
    providerManifestStatus?: string | null
    isReverse?: boolean | null
  } = {},
): {
  orderStatus: string
  pickupStatus: string
  providerLastStatus: string
} => {
  const provider = String(integrationType || '')
    .trim()
    .toLowerCase()
  const isReverse = options.isReverse === true

  if (provider === 'ekart' && isReverse) {
    return {
      orderStatus: 'booked',
      pickupStatus: 'pending',
      providerLastStatus: 'booked',
    }
  }

  if (provider === 'shadowfax' || provider === 'ekart') {
    return {
      orderStatus: 'pickup_initiated',
      pickupStatus: 'pickup_requested',
      providerLastStatus: 'pickup_initiated',
    }
  }

  if (provider === 'amazon') {
    return {
      orderStatus: 'pickup_initiated',
      pickupStatus: 'pickup_initiated',
      providerLastStatus: 'shipment_purchased',
    }
  }

  if (provider === 'xpressbees') {
    const providerFlow = String(options.providerFlow || '').trim()
    const providerManifestStatus = String(options.providerManifestStatus || '').trim().toLowerCase()
    const needsManualManifest =
      providerFlow === XPRESSBEES_MANUAL_MANIFEST_FLOW && providerManifestStatus !== 'accepted'

    if (!needsManualManifest) {
      return {
        orderStatus: 'pickup_initiated',
        pickupStatus: 'pickup_requested',
        providerLastStatus: 'pickup_initiated',
      }
    }
  }

  return {
    orderStatus: 'booked',
    pickupStatus: 'pending',
    providerLastStatus: 'booked',
  }
}

const truncateColumnValue = (value: string, maxLength = 255) => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

const getErrorStatusCode = (error: any, fallback = 500) =>
  typeof error?.statusCode === 'number' ? error.statusCode : fallback

const getUserFacingManifestError = (
  error: any,
  fallback = 'Failed to generate manifest. Please try again.',
) => {
  const rawMessage = typeof error?.message === 'string' ? error.message.trim() : ''
  if (!rawMessage) {
    return fallback
  }

  if (/non serviceable pincode/i.test(rawMessage)) {
    return rawMessage
  }

  if (/destination pincode .* not serviceable/i.test(rawMessage)) {
    return rawMessage
  }

  if (/pickup pincode .* not serviceable/i.test(rawMessage)) {
    return rawMessage
  }

  if (/invoice_number/i.test(rawMessage) || /hsn/i.test(rawMessage)) {
    return rawMessage
  }

  return rawMessage
}

const summarizeManifestRefs = (values: Array<string | null | undefined>, maxVisible = 5) => {
  const normalized = values.map((value) => String(value ?? '').trim()).filter(Boolean)
  if (normalized.length <= maxVisible) {
    return normalized.join(', ')
  }

  return `${normalized.slice(0, maxVisible).join(', ')} +${normalized.length - maxVisible} more`
}

const sanitizeManifestLogValue = (value: any, depth = 0): any => {
  if (value == null) return value

  if (depth >= 3) {
    if (Array.isArray(value)) return `[array(${value.length})]`
    if (typeof value === 'object') return '[object]'
    return value
  }

  if (typeof value === 'string') {
    return value.length > 1000 ? `${value.slice(0, 1000)}...<truncated>` : value
  }

  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => sanitizeManifestLogValue(item, depth + 1))
  }

  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 20)
        .map(([key, nestedValue]) => [key, sanitizeManifestLogValue(nestedValue, depth + 1)]),
    )
  }

  return value
}

const logManifestGenerationError = (
  error: any,
  context: {
    requestId?: string
    source?: string
    type: 'b2c' | 'b2b'
    userId?: string
    integrationType?: string
    manifestRefs: string[]
    manifestFailureOrderIds?: string[]
    fetchedOrders?: Array<{
      id?: string
      order_number?: string | null
      awb_number?: string | null
      courier_partner?: string | null
    }>
  },
) => {
  const axiosConfig = axios.isAxiosError(error) ? error.config : undefined
  const providerResponse = error?.response?.data ?? error?.details ?? null

  console.error('❌ [Manifest] Generation failed', {
    requestId: context.requestId ?? null,
    source: context.source ?? 'generateManifestService',
    manifestType: context.type,
    userId: context.userId ?? null,
    integrationType: context.integrationType ?? null,
    manifestRefs: context.manifestRefs,
    manifestFailureOrderIds: context.manifestFailureOrderIds ?? [],
    fetchedOrders:
      context.fetchedOrders?.map((order) => ({
        id: order.id ?? null,
        order_number: order.order_number ?? null,
        awb_number: order.awb_number ?? null,
        courier_partner: order.courier_partner ?? null,
      })) ?? [],
    statusCode: getErrorStatusCode(error, 500),
    errorName: error?.name || null,
    message: error?.message || String(error),
    providerStatus: error?.response?.status ?? error?.providerStatus ?? null,
    providerStatusText: error?.response?.statusText ?? error?.providerStatusText ?? null,
    providerUrl: axiosConfig?.url ?? null,
    providerMethod: axiosConfig?.method?.toUpperCase?.() ?? null,
    providerResponse: sanitizeManifestLogValue(providerResponse),
    stack: error?.stack || null,
  })
}

export const getManifestFailureRefundReason = (orderNumber: string | null | undefined) =>
  `Refund for manifest failed order #${String(orderNumber || '').trim() || 'unknown'}`

export const getCancellationRefundReason = (orderNumber: string | null | undefined) =>
  `Refund for cancelled order #${String(orderNumber || '').trim() || 'unknown'}`

const isOrderRefundCreditReason = (reason: unknown, orderNumber: string | null | undefined) => {
  const normalizedReason = String(reason ?? '').trim()
  return (
    normalizedReason === getManifestFailureRefundReason(orderNumber) ||
    normalizedReason === getCancellationRefundReason(orderNumber)
  )
}

const isProviderBalanceIssue = (message: string) => {
  const normalized = String(message || '')
    .trim()
    .toLowerCase()
  return (
    (normalized.includes('wallet balance') && normalized.includes('less than')) ||
    normalized.includes('insufficient balance') ||
    normalized.includes('low balance') ||
    (normalized.includes('client wallet') && normalized.includes('balance')) ||
    (normalized.includes('recharge') && normalized.includes('wallet'))
  )
}

const persistPickupFailureForOrders = async ({
  orderIds,
  pickupError,
}: {
  orderIds: string[]
  pickupError: string
}) => {
  const normalizedOrderIds = orderIds.map((id) => String(id || '').trim()).filter(Boolean)
  const normalizedError = truncateColumnValue(String(pickupError || '').trim())

  if (!normalizedOrderIds.length || !normalizedError) return

  await db
    .update(b2c_orders)
    .set({
      pickup_error: normalizedError,
      pickup_status: 'failed',
      order_status: 'shipment_created',
      provider_last_status: 'shipment_created',
      updated_at: new Date(),
    })
    .where(inArray(b2c_orders.id, normalizedOrderIds))
}

const notifyAdminsForProviderBalanceIssue = async ({
  orders,
  errorMessage,
  courierPartner,
  contextLabel,
}: {
  orders: Array<{
    user_id?: string | null
    order_number?: string | null
    awb_number?: string | null
  }>
  errorMessage: string
  courierPartner?: string
  contextLabel?: string
}) => {
  const normalizedError = String(errorMessage || '').trim()
  if (!normalizedError || !isProviderBalanceIssue(normalizedError)) return

  const orderRefs = summarizeManifestRefs(
    orders.map((order) => order.order_number || order.awb_number || null),
  )
  const latestOrder = orders[0]

  await createNotificationService({
    targetRole: 'admin',
    title: `${courierPartner || 'Courier'} balance issue`,
    message: `${contextLabel || 'Provider operation'} failed for ${orderRefs || 'order'}${
      latestOrder?.user_id ? ` (merchant ${latestOrder.user_id})` : ''
    }: ${normalizedError}`,
    sendEmail: true,
  })
}

const isRetryableManifestStepFailure = (order: {
  order_status?: string | null
  manifest_error?: string | null
  awb_number?: string | null
  integration_type?: string | null
  manifest_retry_count?: number | null
  manifest?: string | null
}) => {
  const provider = String(order.integration_type || '')
    .trim()
    .toLowerCase()
  const retryCount = Number(order.manifest_retry_count ?? 0)
  const hasManifest = String(order.manifest || '').trim().length > 0
  const hasManifestError = String(order.manifest_error || '').trim().length > 0

  return (
    retryCount < MAX_MANIFEST_RETRY_ATTEMPTS &&
    hasManifestError &&
    ((String(order.order_status || '')
      .trim()
      .toLowerCase() === 'manifest_failed' &&
      !order.awb_number &&
      provider === 'delhivery') ||
      (hasManifest && ['shadowfax', 'xpressbees', 'ekart'].includes(provider)))
  )
}

const isRetryablePickupStepFailure = (order: {
  order_status?: string | null
  pickup_status?: string | null
  pickup_error?: string | null
  awb_number?: string | null
  integration_type?: string | null
}) => {
  const provider = String(order.integration_type || '')
    .trim()
    .toLowerCase()
  const orderStatus = String(order.order_status || '')
    .trim()
    .toLowerCase()
  const pickupStatus = String(order.pickup_status || '')
    .trim()
    .toLowerCase()

  return (
    String(order.pickup_error || '').trim().length > 0 &&
    String(order.awb_number || '').trim().length > 0 &&
    provider === 'delhivery' &&
    (pickupStatus === 'failed' || orderStatus === 'shipment_created')
  )
}

const retryDelhiveryPickupRequestForOrder = async (order: {
  id: string
  user_id: string
  order_number?: string | null
  awb_number?: string | null
  pickup_details?: any
  pickup_error?: string | null
  manifest?: string | null
  manifest_retry_count?: number | null
}) => {
  const pickupDetails = normalizePickupDetails(order.pickup_details) as any
  const pickupLocationName = String(pickupDetails?.warehouse_name || '').trim()
  if (!pickupLocationName) {
    throw new HttpError(400, 'Pickup warehouse name is required to create Delhivery pickup request')
  }

  const pickupDateRaw = pickupDetails?.pickup_date || new Date().toISOString()
  const pickupDate = normalizePickupDateForRetry(pickupDateRaw, true)
  const pickupTimeRaw = String(pickupDetails?.pickup_time || getDefaultPickupTime()).trim()
  const pickupTime = /^\d{2}:\d{2}:\d{2}$/.test(pickupTimeRaw)
    ? pickupTimeRaw
    : /^\d{2}:\d{2}$/.test(pickupTimeRaw)
      ? `${pickupTimeRaw}:00`
      : getDefaultPickupTime()

  const delhivery = new DelhiveryService()
  await delhivery.createPickupRequest({
    pickup_date: pickupDate,
    pickup_time: pickupTime,
    pickup_location: pickupLocationName,
    expected_package_count: 1,
  })

  await db
    .update(b2c_orders)
    .set({
      order_status: 'pickup_initiated',
      manifest_error: null,
      pickup_error: null,
      pickup_status: 'pickup_requested',
      provider_last_status: 'pickup_initiated',
      updated_at: new Date(),
    })
    .where(eq(b2c_orders.id, order.id))

  return {
    manifest_id: order.manifest ?? null,
    manifest_url: null,
    manifest_key: order.manifest ?? null,
    retry_count: Number(order.manifest_retry_count ?? 0),
    retries_remaining: Math.max(
      0,
      MAX_MANIFEST_RETRY_ATTEMPTS - Number(order.manifest_retry_count ?? 0),
    ),
    order_status: 'pickup_initiated',
    retry_action: 'pickup_request' as const,
  }
}

const getExpectedWalletDebitFromOrder = (order: {
  order_type?: string | null
  freight_charges?: number | string | null
  other_charges?: number | string | null
  cod_charges?: number | string | null
  razorpay_charge_enabled?: boolean | null
  razorpay_charge_percent?: number | string | null
  gst_percent?: number | string | null
  gst_amount?: number | string | null
  wallet_debit_amount?: number | string | null
}) => {
  return resolveGstInclusiveWalletDebit({
    storedDebit: order.wallet_debit_amount,
    paymentType: order.order_type,
    freightCharges: order.freight_charges,
    otherCharges: order.other_charges,
    codCharges: order.cod_charges,
    gstPercent: order.gst_percent ?? WALLET_TRANSACTION_GST_PERCENT,
    gstAmount: order.gst_amount,
    razorpayChargeEnabled: order.razorpay_charge_enabled ?? false,
    razorpayChargePercent: order.razorpay_charge_percent ?? 0,
  })
}

const getWalletDebitReasonFromOrder = (orderType: string | null | undefined) => {
  const normalizedOrderType = String(orderType || '').toLowerCase()
  if (normalizedOrderType === 'reverse') return 'reverse_shipment'
  return normalizedOrderType === 'cod' ? 'B2C COD Service Charges' : 'B2C Prepaid Order Payment'
}

export const getOrderRefundOutstanding = async (
  executor: any,
  walletId: string,
  orderId: string,
  orderNumber: string | null | undefined,
  fallbackDebit = 0,
) => {
  const transactions = await executor
    .select({
      amount: walletTransactions.amount,
      type: walletTransactions.type,
      reason: walletTransactions.reason,
    })
    .from(walletTransactions)
    .where(and(eq(walletTransactions.wallet_id, walletId), eq(walletTransactions.ref, orderId)))

  const totalOriginalDebit = transactions
    .filter(
      (transaction: any) =>
        transaction.type === 'debit' &&
        ORIGINAL_WALLET_DEBIT_REASONS.includes(String(transaction.reason ?? '')),
    )
    .reduce((sum: number, transaction: any) => sum + Number(transaction.amount ?? 0), 0)

  const refundableBase = totalOriginalDebit > 0 ? totalOriginalDebit : Math.max(0, fallbackDebit)

  const totalRefundCredits = transactions
    .filter(
      (transaction: any) =>
        transaction.type === 'credit' && isOrderRefundCreditReason(transaction.reason, orderNumber),
    )
    .reduce((sum: number, transaction: any) => sum + Number(transaction.amount ?? 0), 0)

  return Math.max(0, refundableBase - totalRefundCredits)
}

const refundManifestFailureChargeOnce = async ({
  orderId,
  manifestErrorMessage,
}: {
  orderId: string
  manifestErrorMessage: string
}) => {
  await db.transaction(async (tx) => {
    const [order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.id, orderId)).limit(1)

    if (!order) return

    await tx
      .update(b2c_orders)
      .set({
        order_status: 'manifest_failed',
        manifest_error: truncateColumnValue(manifestErrorMessage),
        updated_at: new Date(),
      })
      .where(eq(b2c_orders.id, order.id))

    const [wallet] = await tx
      .select()
      .from(wallets)
      .where(eq(wallets.userId, order.user_id))
      .limit(1)
    if (!wallet?.id) {
      return
    }

    const outstandingRefund = await getOrderRefundOutstanding(
      tx,
      wallet.id,
      order.id,
      order.order_number,
    )

    if (outstandingRefund <= 0) {
      return
    }

    await createWalletTransaction({
      walletId: wallet.id,
      amount: outstandingRefund,
      type: 'credit',
      ref: order.id,
      reason: getManifestFailureRefundReason(order.order_number),
      currency: wallet.currency ?? 'INR',
      meta: {
        source: 'manifest_failure',
        order_id: order.id,
        order_number: order.order_number,
        manifest_error: manifestErrorMessage,
      },
      tx: tx as any,
    })
  })
}

const debitManifestSuccessChargeIfNeeded = async ({ tx, order }: { tx: any; order: any }) => {
  const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, order.user_id)).limit(1)
  if (!wallet?.id) {
    throw new Error(`Wallet not found for user ${order.user_id}`)
  }

  const expectedDebit = getExpectedWalletDebitFromOrder(order)
  if (expectedDebit <= 0) {
    return
  }

  const transactions = await tx
    .select({
      amount: walletTransactions.amount,
      type: walletTransactions.type,
      reason: walletTransactions.reason,
    })
    .from(walletTransactions)
    .where(and(eq(walletTransactions.wallet_id, wallet.id), eq(walletTransactions.ref, order.id)))

  const totalOriginalDebit = transactions
    .filter(
      (transaction: any) =>
        transaction.type === 'debit' &&
        ORIGINAL_WALLET_DEBIT_REASONS.includes(String(transaction.reason ?? '')),
    )
    .reduce((sum: number, transaction: any) => sum + Number(transaction.amount ?? 0), 0)

  const totalRefundCredits = transactions
    .filter(
      (transaction: any) =>
        transaction.type === 'credit' &&
        isOrderRefundCreditReason(transaction.reason, order.order_number),
    )
    .reduce((sum: number, transaction: any) => sum + Number(transaction.amount ?? 0), 0)

  const netCharged = totalOriginalDebit - totalRefundCredits
  const amountToDebit = Math.max(0, expectedDebit - netCharged)

  if (amountToDebit <= 0) {
    return
  }

  await createWalletTransaction({
    walletId: wallet.id,
    amount: amountToDebit,
    type: 'debit',
    ref: order.id,
    reason: getWalletDebitReasonFromOrder(order.order_type),
    currency: wallet.currency ?? 'INR',
    meta: {
      order_number: order.order_number,
      payment_type: order.order_type,
      freight_charges: Number(order.freight_charges ?? 0),
      other_charges: Number(order.other_charges ?? 0),
      cod_charges:
        String(order.order_type || '').toLowerCase() === 'cod' ? Number(order.cod_charges ?? 0) : 0,
      razorpay_charge_enabled: Boolean((order as any).razorpay_charge_enabled ?? false),
      razorpay_charge_percent: Number((order as any).razorpay_charge_percent ?? 0),
      razorpay_charge_amount: Number((order as any).razorpay_charge_amount ?? 0),
      gst_percent: Number(order.gst_percent ?? 0),
      gst_amount: Number(order.gst_amount ?? 0),
      wallet_debit_amount: Number(order.wallet_debit_amount ?? 0),
      triggered_by: 'manifest_success',
      debit_recovery_after_refund: totalRefundCredits > 0,
      total_wallet_debit: amountToDebit,
    },
    tx: tx as any,
  })
}

interface PickupWarehouseRecord {
  pickupId: string
  addressNickname?: string | null
  addressLine1: string
  addressLine2?: string | null
  landmark?: string | null
  city: string
  state: string
  pincode: string
  contactName?: string | null
  contactPhone?: string | null
  contactEmail?: string | null
  gstNumber?: string | null
  country?: string | null
  latitude?: string | null
  longitude?: string | null
}

async function fetchPickupWarehouseRecord(
  userId: string,
  pickupLocationId?: string,
): Promise<PickupWarehouseRecord | null> {
  if (!pickupLocationId) return null
  const normalizedId = String(pickupLocationId).trim()
  if (!normalizedId) return null

  const [warehouse] = await db
    .select({
      pickupId: pickupAddresses.id,
      addressNickname: addresses.addressNickname,
      addressLine1: addresses.addressLine1,
      addressLine2: addresses.addressLine2,
      landmark: addresses.landmark,
      city: addresses.city,
      state: addresses.state,
      pincode: addresses.pincode,
      contactName: addresses.contactName,
      contactPhone: addresses.contactPhone,
      contactEmail: addresses.contactEmail,
      gstNumber: addresses.gstNumber,
      country: addresses.country,
      latitude: addresses.latitude,
      longitude: addresses.longitude,
    })
    .from(pickupAddresses)
    .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
    .where(
      and(
        eq(pickupAddresses.userId, userId),
        eq(pickupAddresses.id, normalizedId),
        eq(pickupAddresses.isPickupEnabled, true),
      ),
    )
    .limit(1)

  return warehouse ?? null
}

const trimText = (value: unknown) => String(value ?? '').trim()

const normalizeAmazonGstNumber = (value: unknown) => {
  const normalized = trimText(value).toUpperCase().replace(/\s+/g, '')
  return /^[0-9A-Z]{15}$/.test(normalized) ? normalized : ''
}

const normalizeAmazonInvoiceDate = (value: unknown) => {
  const normalized = trimText(value)
  const parsed = normalized ? new Date(normalized) : new Date()
  const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

const getAmazonProviderInternalInputError = (error: any) =>
  error?.details?.providerInternalInputError === true ||
  (Array.isArray(error?.details?.errors) &&
    error.details.errors.some((entry: any) => {
      const text = [entry?.code, entry?.message, entry?.details]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return text.includes('s-900') || text.includes('internal service error')
    }))

const AMAZON_PROVIDER_KEY = 'amazon'

const toPositiveNumber = (value: unknown, fallback = 0) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

const hasUsableAmazonShippingCredentials = (credentials: any) =>
  Boolean(
    trimText(credentials?.accessToken) ||
      (trimText(credentials?.refreshToken) &&
        trimText(credentials?.lwaClientId) &&
        trimText(credentials?.lwaClientSecret)),
  )

const normalizeAmazonCountry = (value: unknown) => {
  const normalized = trimText(value).toLowerCase()
  if (!normalized) return 'IN'
  if (['india', 'bharat', 'in'].includes(normalized)) return 'IN'
  if (['united states', 'united states of america', 'usa', 'us'].includes(normalized)) return 'US'
  if (['united kingdom', 'uk', 'gb'].includes(normalized)) return 'GB'
  if (/^[a-z]{2}$/i.test(trimText(value))) return trimText(value).toUpperCase()
  return 'IN'
}

const getAmazonCurrencyForCountry = (countryCode: string) =>
  ({
    IN: 'INR',
    US: 'USD',
    GB: 'GBP',
    AE: 'AED',
    SA: 'SAR',
    EG: 'EGP',
    JP: 'JPY',
  })[countryCode] || 'INR'

const getAmazonRatesFromResponse = (data: any): any[] => {
  const candidates = [
    data?.payload?.rates,
    data?.rates,
    data?.rateOptions,
    data?.shippingRates,
  ]
  const rates = candidates.find((candidate) => Array.isArray(candidate))
  return rates || []
}

const getEligibleAmazonRates = (rates: any[]) =>
  rates.filter(
    (rate) =>
      (!Array.isArray(rate?.ineligibilityReasons) || rate.ineligibilityReasons.length === 0) &&
      rate?.requiresAdditionalInputs !== true,
  )

const getAmazonRequestTokenFromResponse = (data: any) =>
  trimText(data?.payload?.requestToken || data?.requestToken)

const getAmazonRateId = (rate: any) =>
  trimText(rate?.rateId || rate?.rate_id || rate?.id || rate?.serviceId || rate?.carrierId)

const isAmazonShipmentReference = (value: unknown) => /^amzn1\.sid\./i.test(trimText(value))

const getAmazonNestedText = (value: any, keyNames: string[]): string => {
  const queue = [value]
  const seen = new Set<any>()
  const normalizedKeys = new Set(keyNames.map((key) => key.toLowerCase()))

  while (queue.length) {
    const current = queue.shift()
    if (!current || typeof current !== 'object' || seen.has(current)) continue
    seen.add(current)

    if (Array.isArray(current)) {
      queue.push(...current)
      continue
    }

    for (const [key, nested] of Object.entries(current)) {
      if (normalizedKeys.has(key.toLowerCase())) {
        const normalized = trimText(nested)
        if (normalized) return normalized
      }

      if (nested && typeof nested === 'object') queue.push(nested)
    }
  }

  return ''
}

const getAmazonShipmentIdFromPayload = (payload: any) =>
  getAmazonNestedText(payload, ['shipmentId', 'shipment_id', 'shipmentIdentifier'])

const getAmazonTrackingIdFromPayload = (payload: any) => {
  const trackingId = getAmazonNestedText(payload, [
    'trackingId',
    'tracking_id',
    'trackingNumber',
    'tracking_number',
    'trackingCode',
    'tracking_code',
    'awbNumber',
    'awb_number',
    'awb',
  ])

  return trackingId && !isAmazonShipmentReference(trackingId) ? trackingId : ''
}

const getAmazonPackageClientReferenceIdFromPayload = (payload: any) =>
  getAmazonNestedText(payload, ['packageClientReferenceId', 'package_client_reference_id'])

const asArray = <T = any>(value: unknown): T[] =>
  Array.isArray(value) ? (value as T[]) : value === undefined || value === null ? [] : [value as T]

const isAmazonCodOrder = (params: any) =>
  trimText(params?.payment_type || params?.order_type).toLowerCase() === 'cod'

const AMAZON_COLLECT_ON_DELIVERY_SERVICE_ID = 'CollectOnDelivery'

const getAmazonRateCharge = (rate: any): number | null => {
  const candidates = [
    rate?.totalCharge?.value,
    rate?.totalCharge?.amount,
    rate?.total_charge?.value,
    rate?.total_charge?.amount,
    rate?.charge?.value,
    rate?.charge?.amount,
    rate?.shippingCharge?.value,
    rate?.shippingCharge?.amount,
    rate?.rate?.value,
    rate?.rate?.amount,
    rate?.amount,
  ]
  for (const candidate of candidates) {
    const parsed = Number(candidate)
    if (Number.isFinite(parsed) && parsed >= 0) return parsed
  }
  return null
}

const getAmazonRateEdd = (rate: any): string => {
  const raw = trimText(
    rate?.promise?.deliveryWindow?.end ||
      rate?.promise?.receiveWindow?.end ||
      rate?.deliveryWindow?.end ||
      rate?.deliveryDate ||
      rate?.estimatedDeliveryDate,
  )
  if (!raw) return '3-5 Days'
  const asDate = new Date(raw)
  if (!isNaN(asDate.getTime())) {
    const diffDays = Math.ceil((asDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? `${diffDays} Days` : '1 Day'
  }
  return raw
}

const pickAmazonRateForCourier = (rates: any[], courierName?: string | null) => {
  if (!rates.length) return null
  const normalizedCourierName = trimText(courierName).toLowerCase()
  if (normalizedCourierName) {
    const namedRate = rates.find((rate) => {
      const rateName = trimText(
        rate?.courier_name ||
          rate?.courierName ||
          rate?.carrierName ||
          rate?.serviceName ||
          rate?.serviceId,
      ).toLowerCase()
      return (
        rateName &&
        (normalizedCourierName.includes(rateName) || rateName.includes(normalizedCourierName))
      )
    })
    if (namedRate) return namedRate
  }
  return rates[0]
}

const buildAmazonProviderPayload = (rateResponseData: any, rate: any) => {
  const requestToken = getAmazonRequestTokenFromResponse(rateResponseData)
  const rateId = getAmazonRateId(rate)
  return {
    requestToken,
    rateId,
    carrierId: trimText(rate?.carrierId || rate?.carrier_id),
    carrierName: trimText(rate?.carrierName || rate?.carrier_name || 'Amazon Shipping'),
    serviceId: trimText(rate?.serviceId || rate?.service_id),
    serviceName: trimText(rate?.serviceName || rate?.service_name),
    charge: getAmazonRateCharge(rate),
    edd: getAmazonRateEdd(rate),
    rawRate: rate,
  }
}

type AmazonRateTokenCacheEntry = {
  expiresAt: number
  requestToken: string
  rateId: string
  carrierId?: string | null
  carrierName?: string | null
  serviceId?: string | null
  serviceName?: string | null
  rawRate?: any
}

const configuredAmazonRateTokenCacheTtlMs = Number(process.env.AMAZON_RATE_TOKEN_CACHE_TTL_MS)
const AMAZON_RATE_TOKEN_CACHE_TTL_MS =
  Number.isFinite(configuredAmazonRateTokenCacheTtlMs) &&
  configuredAmazonRateTokenCacheTtlMs > 0
    ? Math.floor(configuredAmazonRateTokenCacheTtlMs)
    : 10 * 60 * 1000
const amazonRateTokenCache = new Map<string, AmazonRateTokenCacheEntry>()
let amazonRateTokenCacheTableReady: Promise<void> | null = null

const normalizeAmazonRateCacheText = (value: unknown) => trimText(value).toLowerCase()

const normalizeAmazonRateCacheNumber = (value: unknown, precision = 3) => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return ''
  const multiplier = Math.pow(10, precision)
  return String(Math.round(numericValue * multiplier) / multiplier)
}

const getAmazonRateCacheWeight = (params: any) => {
  const weight = normalizeServiceabilityWeightToGrams(params.package_weight ?? params.weight)
  return weight > 0 ? String(weight) : ''
}

const buildAmazonRateTokenCacheKey = (
  params: any,
  userId?: string | null,
  courierId?: unknown,
) => {
  const origin =
    params.origin ||
    params.source_pincode ||
    params.pickup_pincode ||
    params.pickup?.pincode ||
    params.pickup_details?.pincode
  const destination =
    params.destination ||
    params.destination_pincode ||
    params.consignee?.pincode ||
    params.delivery_pincode
  const pickupId = params.pickupId || params.pickup_id || params.pickup_location_id

  return [
    normalizeAmazonRateCacheText(userId || params.user_id),
    normalizeAmazonRateCacheText(pickupId),
    normalizeAmazonRateCacheText(origin),
    normalizeAmazonRateCacheText(destination),
    normalizeAmazonRateCacheText(params.payment_type || params.order_type || 'prepaid'),
    normalizeAmazonRateCacheNumber(params.order_amount ?? params.orderAmount, 2),
    getAmazonRateCacheWeight(params),
    normalizeAmazonRateCacheNumber(params.package_length ?? params.length, 2),
    normalizeAmazonRateCacheNumber(params.package_breadth ?? params.breadth, 2),
    normalizeAmazonRateCacheNumber(params.package_height ?? params.height, 2),
    normalizeAmazonRateCacheText(courierId ?? params.courier_id),
  ].join('|')
}

const buildAmazonRateTokenCacheContext = (
  params: any,
  userId?: string | null,
  courierId?: unknown,
) => {
  const origin =
    params.origin ||
    params.source_pincode ||
    params.pickup_pincode ||
    params.pickup?.pincode ||
    params.pickup_details?.pincode
  const destination =
    params.destination ||
    params.destination_pincode ||
    params.consignee?.pincode ||
    params.delivery_pincode
  const pickupId = params.pickupId || params.pickup_id || params.pickup_location_id
  const weightG = normalizeServiceabilityWeightToGrams(params.package_weight ?? params.weight)

  return {
    cacheKey: buildAmazonRateTokenCacheKey(params, userId, courierId),
    userId: normalizeAmazonRateCacheText(userId || params.user_id),
    courierId: normalizeAmazonRateCacheText(courierId ?? params.courier_id),
    pickupLocationId: normalizeAmazonRateCacheText(pickupId),
    originPincode: normalizeAmazonRateCacheText(origin),
    destinationPincode: normalizeAmazonRateCacheText(destination),
    paymentType: normalizeAmazonRateCacheText(params.payment_type || params.order_type || 'prepaid'),
    orderAmount: Number.isFinite(Number(params.order_amount ?? params.orderAmount))
      ? Number(params.order_amount ?? params.orderAmount)
      : null,
    weightG: weightG > 0 ? weightG : null,
    lengthCm: Number.isFinite(Number(params.package_length ?? params.length))
      ? Number(params.package_length ?? params.length)
      : null,
    breadthCm: Number.isFinite(Number(params.package_breadth ?? params.breadth))
      ? Number(params.package_breadth ?? params.breadth)
      : null,
    heightCm: Number.isFinite(Number(params.package_height ?? params.height))
      ? Number(params.package_height ?? params.height)
      : null,
  }
}

const ensureAmazonRateTokenCacheTable = () => {
  if (!amazonRateTokenCacheTableReady) {
    amazonRateTokenCacheTableReady = db
      .execute(sql`
        CREATE TABLE IF NOT EXISTS amazon_rate_token_cache (
          cache_key text PRIMARY KEY,
          user_id text NOT NULL,
          courier_id text,
          pickup_location_id text,
          origin_pincode text,
          destination_pincode text,
          payment_type text,
          order_amount numeric,
          weight_g integer,
          length_cm numeric,
          breadth_cm numeric,
          height_cm numeric,
          request_token text NOT NULL,
          rate_id text NOT NULL,
          carrier_id text,
          carrier_name text,
          service_id text,
          service_name text,
          raw_rate jsonb,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        )
      `)
      .then(() => undefined)
      .catch((err) => {
        amazonRateTokenCacheTableReady = null
        throw err
      })
  }

  return amazonRateTokenCacheTableReady
}

const pruneAmazonRateTokenCache = () => {
  const now = Date.now()
  for (const [key, entry] of amazonRateTokenCache.entries()) {
    if (entry.expiresAt <= now) amazonRateTokenCache.delete(key)
  }
}

const mapAmazonRateTokenCacheRow = (row: any): AmazonRateTokenCacheEntry | null => {
  const requestToken = trimText(row?.request_token)
  const rateId = trimText(row?.rate_id)
  const expiresAt = row?.expires_at ? new Date(row.expires_at).getTime() : 0
  if (!requestToken || !rateId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return null
  }

  return {
    expiresAt,
    requestToken,
    rateId,
    carrierId: trimText(row?.carrier_id) || null,
    carrierName: trimText(row?.carrier_name) || null,
    serviceId: trimText(row?.service_id) || null,
    serviceName: trimText(row?.service_name) || null,
    rawRate: row?.raw_rate || null,
  }
}

const rememberAmazonRateToken = async ({
  params,
  userId,
  courierId,
  amazonRecord,
}: {
  params: any
  userId?: string | null
  courierId?: unknown
  amazonRecord: any
}) => {
  if (!amazonRecord?.requestToken || !amazonRecord?.rateId) return

  pruneAmazonRateTokenCache()
  const context = buildAmazonRateTokenCacheContext(params, userId, courierId)
  const entry: AmazonRateTokenCacheEntry = {
    expiresAt: Date.now() + AMAZON_RATE_TOKEN_CACHE_TTL_MS,
    requestToken: amazonRecord.requestToken,
    rateId: amazonRecord.rateId,
    carrierId: amazonRecord.carrierId || null,
    carrierName: amazonRecord.carrierName || null,
    serviceId: amazonRecord.serviceId || null,
    serviceName: amazonRecord.serviceName || null,
    rawRate: amazonRecord.rawRate || null,
  }
  amazonRateTokenCache.set(context.cacheKey, entry)

  try {
    await ensureAmazonRateTokenCacheTable()
    await db.execute(sql`
      INSERT INTO amazon_rate_token_cache (
        cache_key,
        user_id,
        courier_id,
        pickup_location_id,
        origin_pincode,
        destination_pincode,
        payment_type,
        order_amount,
        weight_g,
        length_cm,
        breadth_cm,
        height_cm,
        request_token,
        rate_id,
        carrier_id,
        carrier_name,
        service_id,
        service_name,
        raw_rate,
        expires_at,
        updated_at
      )
      VALUES (
        ${context.cacheKey},
        ${context.userId},
        ${context.courierId},
        ${context.pickupLocationId},
        ${context.originPincode},
        ${context.destinationPincode},
        ${context.paymentType},
        ${context.orderAmount},
        ${context.weightG},
        ${context.lengthCm},
        ${context.breadthCm},
        ${context.heightCm},
        ${entry.requestToken},
        ${entry.rateId},
        ${entry.carrierId},
        ${entry.carrierName},
        ${entry.serviceId},
        ${entry.serviceName},
        ${JSON.stringify(entry.rawRate || null)}::jsonb,
        ${new Date(entry.expiresAt)},
        now()
      )
      ON CONFLICT (cache_key) DO UPDATE SET
        request_token = EXCLUDED.request_token,
        rate_id = EXCLUDED.rate_id,
        carrier_id = EXCLUDED.carrier_id,
        carrier_name = EXCLUDED.carrier_name,
        service_id = EXCLUDED.service_id,
        service_name = EXCLUDED.service_name,
        raw_rate = EXCLUDED.raw_rate,
        expires_at = EXCLUDED.expires_at,
        updated_at = now()
    `)
  } catch (err: any) {
    console.warn('[AmazonShipping] Failed to persist selected rate token cache', {
      message: err?.message || err,
      courierId: context.courierId || null,
      origin: context.originPincode || null,
      destination: context.destinationPincode || null,
    })
  }
}

const getCachedAmazonRateToken = async (params: any, userId?: string | null) => {
  pruneAmazonRateTokenCache()

  const keys = [
    buildAmazonRateTokenCacheKey(params, userId, params.courier_id),
    buildAmazonRateTokenCacheKey(params, userId),
  ]

  for (const key of keys) {
    const entry = amazonRateTokenCache.get(key)
    if (!entry) continue
    if (entry.expiresAt <= Date.now()) {
      amazonRateTokenCache.delete(key)
      continue
    }
    return entry
  }

  try {
    await ensureAmazonRateTokenCacheTable()
    const result = (await db.execute(sql`
      SELECT
        cache_key,
        request_token,
        rate_id,
        carrier_id,
        carrier_name,
        service_id,
        service_name,
        raw_rate,
        expires_at
      FROM amazon_rate_token_cache
      WHERE cache_key IN (${sql.join(keys.map((key) => sql`${key}`), sql`, `)})
        AND expires_at > now()
      ORDER BY updated_at DESC
      LIMIT 1
    `)) as any

    const row = result.rows?.[0]
    const entry = mapAmazonRateTokenCacheRow(row)
    if (entry) {
      amazonRateTokenCache.set(row.cache_key, entry)
      return entry
    }
  } catch (err: any) {
    console.warn('[AmazonShipping] Failed to read selected rate token cache', {
      message: err?.message || err,
    })
  }

  return null
}

const buildAmazonFallbackRateOption = (providerServiceability: any) => {
  const charge = getAmazonRateCharge(providerServiceability?.rawRate || providerServiceability)
  if (charge === null) return null
  return {
    rate: charge,
    cod_charges: 0,
    cod_percent: 0,
    other_charges: 0,
    mode: 'surface',
    min_weight: 0,
    slabs: [],
    selected_slab: null,
    slab_weight: null,
    chargeable_weight: null,
    volumetric_weight: null,
    slab_count: null,
    max_slab_weight: null,
    matched_by: 'amazon_api',
  }
}

const chooseAmazonPrintOptionValue = <T>(
  values: T[],
  preferredValues: T[],
  fallback?: T,
): T | undefined => {
  if (!values.length) return fallback
  for (const preferredValue of preferredValues) {
    if (values.some((value) => value === preferredValue)) return preferredValue
  }
  return values[0] ?? fallback
}

const getAmazonSupportedDocumentSpecifications = (rate: any) =>
  asArray<any>(
    rate?.supportedDocumentSpecifications ||
      rate?.supported_document_specifications ||
      rate?.documentSpecifications ||
      rate?.document_specifications,
  )

const pickAmazonDocumentSpecification = (rate: any) => {
  const specs = getAmazonSupportedDocumentSpecifications(rate)
  if (!specs.length) return null

  const withPdf = specs.filter((spec) => trimText(spec?.format).toUpperCase() === 'PDF')
  const candidates = withPdf.length ? withPdf : specs
  const fourBySix = candidates.find((spec) => {
    const width = Number(spec?.size?.width)
    const length = Number(spec?.size?.length)
    const unit = trimText(spec?.size?.unit).toUpperCase()
    return unit === 'INCH' && width === 4 && length === 6
  })

  return fourBySix || candidates[0]
}

const buildAmazonRequestedDocumentTypes = (printOption: any) => {
  const supportedDetails = asArray<any>(
    printOption?.supportedDocumentDetails || printOption?.supported_document_details,
  )
  const mandatory = supportedDetails
    .filter((detail) => detail?.isMandatory === true)
    .map((detail) => trimText(detail?.name).toUpperCase())
    .filter(Boolean)
  if (mandatory.length) return [...new Set(mandatory)]

  const supportedNames = supportedDetails
    .map((detail) => trimText(detail?.name).toUpperCase())
    .filter(Boolean)
  if (supportedNames.includes('LABEL')) return ['LABEL']
  return supportedNames.length ? [supportedNames[0]] : ['LABEL']
}

const getAmazonLabelSpecification = (rate?: any, options: { includeCod?: boolean } = {}) => {
  const spec = pickAmazonDocumentSpecification(rate)
  const printOptions = asArray<any>(spec?.printOptions || spec?.print_options)
  const selectedPrintOption =
    printOptions.find((option) =>
      asArray(option?.supportedDocumentDetails || option?.supported_document_details).some(
        (detail: any) => trimText(detail?.name).toUpperCase() === 'LABEL',
      ),
    ) ||
    printOptions[0] ||
    null

  if (spec?.format && spec?.size && selectedPrintOption) {
    const supportedDpis = asArray<number>(
      selectedPrintOption.supportedDPIs || selectedPrintOption.supported_dpis,
    )
      .map((dpi) => Number(dpi))
      .filter((dpi) => Number.isFinite(dpi))
    const supportedPageLayouts = asArray<string>(
      selectedPrintOption.supportedPageLayouts || selectedPrintOption.supported_page_layouts,
    )
      .map((layout) => trimText(layout).toUpperCase())
      .filter(Boolean)
    const supportedFileJoiningOptions = asArray<any>(
      selectedPrintOption.supportedFileJoiningOptions ||
        selectedPrintOption.supported_file_joining_options,
    )
      .map((value) => {
        if (value === true || trimText(value).toLowerCase() === 'true') return true
        if (value === false || trimText(value).toLowerCase() === 'false') return false
        return undefined
      })
      .filter((value): value is boolean => typeof value === 'boolean')

    const requestedSpecification: any = {
      format: trimText(spec.format).toUpperCase(),
      size: spec.size,
      needFileJoining:
        chooseAmazonPrintOptionValue(supportedFileJoiningOptions, [false, true], false) ?? false,
      requestedDocumentTypes: buildAmazonRequestedDocumentTypes(selectedPrintOption),
    }

    const dpi = chooseAmazonPrintOptionValue(supportedDpis, [300, 203])
    if (dpi) requestedSpecification.dpi = dpi

    const pageLayout = chooseAmazonPrintOptionValue(supportedPageLayouts, ['DEFAULT', 'LEFT'])
    if (pageLayout) requestedSpecification.pageLayout = pageLayout

    if (options.includeCod) {
      requestedSpecification.requestedLabelCustomization = {
        requestAttributes: ['PACKAGE_CLIENT_REFERENCE_ID', 'COLLECT_ON_DELIVERY_AMOUNT'],
      }
    }

    return requestedSpecification
  }

  const fallbackSpecification: any = {
  format: 'PDF',
  size: {
    length: 6,
    width: 4,
    unit: 'INCH',
  },
  dpi: 300,
  pageLayout: 'DEFAULT',
  needFileJoining: false,
  requestedDocumentTypes: ['LABEL'],
  }

  if (options.includeCod) {
    fallbackSpecification.requestedLabelCustomization = {
      requestAttributes: ['PACKAGE_CLIENT_REFERENCE_ID', 'COLLECT_ON_DELIVERY_AMOUNT'],
    }
  }

  return fallbackSpecification
}

const getAmazonRateValueAddedServiceIds = (rate: any) => {
  const groups = asArray<any>(
    rate?.availableValueAddedServiceGroups ||
      rate?.available_value_added_service_groups ||
      rate?.valueAddedServiceGroups ||
      rate?.value_added_service_groups,
  )

  return groups
    .flatMap((group) =>
      asArray<any>(
        group?.valueAddedServices ||
          group?.value_added_services ||
          group?.services ||
          group?.valueAddedServiceOptions ||
          group?.value_added_service_options,
      ),
    )
    .map((service) => trimText(service?.id || service?.name || service?.valueAddedServiceId))
    .filter(Boolean)
}

const getAmazonRequestedValueAddedServices = (rate: any, params: any) => {
  if (!isAmazonCodOrder(params)) return []
  const serviceIds = getAmazonRateValueAddedServiceIds(rate)
  const hasExplicitCodService = serviceIds.some(
    (id) => id.toLowerCase() === AMAZON_COLLECT_ON_DELIVERY_SERVICE_ID.toLowerCase(),
  )

  if (!serviceIds.length || hasExplicitCodService) {
    return [{ id: AMAZON_COLLECT_ON_DELIVERY_SERVICE_ID }]
  }

  return []
}

const buildAmazonPurchaseShipmentBody = ({
  requestToken,
  rateId,
  selectedAmazonRate,
  params,
}: {
  requestToken: string
  rateId: string
  selectedAmazonRate: any
  params: any
}) => {
  const isCod = isAmazonCodOrder(params)
  const body: any = {
    requestToken,
    rateId,
    requestedDocumentSpecification: getAmazonLabelSpecification(selectedAmazonRate, {
      includeCod: isCod,
    }),
  }

  const requestedValueAddedServices = getAmazonRequestedValueAddedServices(
    selectedAmazonRate,
    params,
  )
  if (requestedValueAddedServices.length) {
    body.requestedValueAddedServices = requestedValueAddedServices
  }

  return body
}

const buildAmazonAddressFromLooseInput = async ({
  name,
  phone,
  email,
  addressLine1,
  addressLine2,
  city,
  state,
  country,
  pincode,
  companyName,
}: {
  name?: unknown
  phone?: unknown
  email?: unknown
  addressLine1?: unknown
  addressLine2?: unknown
  city?: unknown
  state?: unknown
  country?: unknown
  pincode?: unknown
  companyName?: unknown
}) => {
  const normalizedPincode = trimText(pincode)
  const location = normalizedPincode ? await fetchLocationByPincode(normalizedPincode) : null
  const resolvedCity = trimText(city) || trimText(location?.city)
  const resolvedState = trimText(state) || trimText(location?.state)
  if (!normalizedPincode || !resolvedCity || !resolvedState) {
    throw new Error('Amazon Shipping address requires pincode, city, and state')
  }

  return buildAmazonShippingAddressFromWarehouse({
    alias: trimText(name) || trimText(companyName) || 'Shiplifi',
    contactName: trimText(name) || trimText(companyName) || 'Shiplifi',
    contactPhone: trimText(phone),
    contactEmail: trimText(email),
    addressLine1: trimText(addressLine1) || `Pincode ${normalizedPincode}`,
    addressLine2: trimText(addressLine2),
    city: resolvedCity,
    state: resolvedState,
    country: trimText(country) || trimText(location?.country) || 'India',
    pincode: normalizedPincode,
    companyName: trimText(companyName) || trimText(name) || 'Shiplifi',
  })
}

const buildAmazonShippingRatesRequest = async (params: any, userId?: string | null) => {
  const pickupId = trimText(params.pickupId || params.pickup_id || params.pickup_location_id)
  const originPincode = trimText(
    params.origin || params.source_pincode || params.pickup_pincode || params.pickup?.pincode,
  )
  const destinationPincode = trimText(
    params.destination || params.destination_pincode || params.consignee?.pincode,
  )
  const isReverseShipment = params.isReverse === true || params.payment_type === 'reverse'

  let shipFrom
  let pickupWarehouse: PickupWarehouseRecord | null = null
  if (userId && pickupId) {
    pickupWarehouse = await fetchPickupWarehouseRecord(userId, pickupId)
    if (pickupWarehouse && !isReverseShipment) {
      shipFrom = buildAmazonShippingAddressFromWarehouse({
        alias: pickupWarehouse.addressNickname || pickupWarehouse.contactName || 'Amazon Warehouse',
        contactName: pickupWarehouse.contactName,
        contactPhone: pickupWarehouse.contactPhone,
        contactEmail: pickupWarehouse.contactEmail,
        addressLine1: pickupWarehouse.addressLine1,
        addressLine2: pickupWarehouse.addressLine2,
        landmark: pickupWarehouse.landmark,
        city: pickupWarehouse.city,
        state: pickupWarehouse.state,
        country: pickupWarehouse.country,
        pincode: pickupWarehouse.pincode,
        latitude: pickupWarehouse.latitude,
        longitude: pickupWarehouse.longitude,
        companyName: pickupWarehouse.addressNickname || pickupWarehouse.contactName || 'Shiplifi',
      })
    }
  }

  if (!shipFrom) {
    shipFrom = isReverseShipment
      ? await buildAmazonAddressFromLooseInput({
          name: params.consignee?.name || params.pickupName || params.pickup_name,
          phone: params.consignee?.phone || params.pickupPhone || params.pickup_phone,
          email: params.consignee?.email,
          addressLine1: params.consignee?.address || params.pickupAddress,
          addressLine2: params.consignee?.address_2,
          city: params.consignee?.city || params.pickupCity,
          state: params.consignee?.state || params.pickupState,
          country: params.consignee?.country,
          pincode: params.consignee?.pincode || originPincode,
          companyName: params.consignee?.company_name || params.pickupName,
        })
      : await buildAmazonAddressFromLooseInput({
          name: params.pickup?.name || params.pickupName || params.pickup_name,
          phone: params.pickup?.phone || params.pickupPhone || params.pickup_phone,
          addressLine1: params.pickup?.address || params.pickupAddress,
          addressLine2: params.pickup?.address_2,
          city: params.pickup?.city || params.pickupCity,
          state: params.pickup?.state || params.pickupState,
          country: params.pickup?.country,
          pincode: params.pickup?.pincode || originPincode,
          companyName: params.company?.name || params.pickup?.warehouse_name || params.pickupName,
        })
  }

  let shipTo
  if (isReverseShipment && pickupWarehouse) {
    shipTo = buildAmazonShippingAddressFromWarehouse({
      alias: pickupWarehouse.addressNickname || pickupWarehouse.contactName || 'Amazon Warehouse',
      contactName: pickupWarehouse.contactName,
      contactPhone: pickupWarehouse.contactPhone,
      contactEmail: pickupWarehouse.contactEmail,
      addressLine1: pickupWarehouse.addressLine1,
      addressLine2: pickupWarehouse.addressLine2,
      landmark: pickupWarehouse.landmark,
      city: pickupWarehouse.city,
      state: pickupWarehouse.state,
      country: pickupWarehouse.country,
      pincode: pickupWarehouse.pincode,
      latitude: pickupWarehouse.latitude,
      longitude: pickupWarehouse.longitude,
      companyName: pickupWarehouse.addressNickname || pickupWarehouse.contactName || 'Shiplifi',
    })
  }

  if (!shipTo) {
    shipTo = isReverseShipment
      ? await buildAmazonAddressFromLooseInput({
          name: params.rto?.name || params.pickup?.name || params.deliveryName || 'Return Warehouse',
          phone: params.rto?.phone || params.pickup?.phone || params.deliveryPhone,
          addressLine1: params.rto?.address || params.pickup?.address || params.deliveryAddress,
          addressLine2: params.rto?.address_2 || params.pickup?.address_2,
          city: params.rto?.city || params.pickup?.city || params.deliveryCity,
          state: params.rto?.state || params.pickup?.state || params.deliveryState,
          country: params.rto?.country || params.pickup?.country,
          pincode: params.rto?.pincode || params.pickup?.pincode || destinationPincode,
          companyName:
            params.company?.name ||
            params.rto?.warehouse_name ||
            params.pickup?.warehouse_name ||
            params.deliveryName,
        })
      : await buildAmazonAddressFromLooseInput({
          name: params.consignee?.name || params.deliveryName || 'Customer',
          phone: params.consignee?.phone || params.deliveryPhone,
          email: params.consignee?.email,
          addressLine1: params.consignee?.address || params.deliveryAddress,
          addressLine2: params.consignee?.address_2,
          city: params.consignee?.city || params.deliveryCity,
          state: params.consignee?.state || params.deliveryState,
          country: params.consignee?.country,
          pincode: params.consignee?.pincode || destinationPincode,
          companyName: params.consignee?.company_name,
        })
  }

  const countryCode = normalizeAmazonCountry(shipTo.countryCode || shipFrom.countryCode)
  const currency = getAmazonCurrencyForCountry(countryCode)
  const weightGrams = Math.max(1, normalizeServiceabilityWeightToGrams(params.package_weight ?? params.weight ?? 0))
  const orderAmount = Math.max(1, toPositiveNumber(params.order_amount ?? params.orderAmount, 1))
  const firstItem = Array.isArray(params.order_items) ? params.order_items[0] : null
  const orderReference = trimText(params.order_number || params.orderNo || params.order_id)
  const invoiceNumber = trimText(
    params.invoice_number ||
      params.invoiceNumber ||
      firstItem?.invoice_number ||
      firstItem?.invoiceNumber,
  )
  const productType = trimText(
    params.product_type ||
      params.productType ||
      firstItem?.product_type ||
      firstItem?.productType,
  )
  const gstNumber = normalizeAmazonGstNumber(
    params.company?.gst ||
      params.company?.gstin ||
      params.company_gst ||
      params.gstin ||
      params.pickup?.gst_number ||
      params.pickup?.gstNumber ||
      pickupWarehouse?.gstNumber ||
      process.env.AMAZON_SHIPPING_GSTIN,
  )

  const requestBody: any = {
    channelDetails: {
      channelType: 'EXTERNAL',
    },
    shipFrom,
    shipTo,
    packages: [
      {
        packageClientReferenceId: orderReference
          ? `PKG-${orderReference.slice(0, 35)}`
          : 'PKG-RATE-CHECK',
        dimensions: {
          length: Math.max(1, toPositiveNumber(params.package_length ?? params.length, 1)),
          width: Math.max(1, toPositiveNumber(params.package_breadth ?? params.breadth, 1)),
          height: Math.max(1, toPositiveNumber(params.package_height ?? params.height, 1)),
          unit: 'CENTIMETER',
        },
        weight: {
          value: weightGrams,
          unit: 'GRAM',
        },
        insuredValue: {
          value: orderAmount,
          unit: currency,
        },
        isHazmat: false,
        items: [
          {
            quantity: Math.max(1, Number(firstItem?.qty ?? firstItem?.quantity ?? 1)),
            description: trimText(firstItem?.name) || 'Merchandise',
            itemValue: {
              value: Math.max(1, toPositiveNumber(firstItem?.price, orderAmount)),
              unit: currency,
            },
            weight: {
              value: weightGrams,
              unit: 'GRAM',
            },
            isHazmat: false,
            ...(productType ? { productType } : {}),
            ...(invoiceNumber
              ? {
                  invoiceDetails: {
                    invoiceNumber: invoiceNumber.slice(0, 50),
                    invoiceDate: normalizeAmazonInvoiceDate(
                      params.invoice_date ||
                        params.invoiceDate ||
                        firstItem?.invoice_date ||
                        firstItem?.invoiceDate,
                    ),
                  },
                }
              : {}),
          },
        ],
      },
    ],
    shipmentType: isReverseShipment ? 'RETURNS' : 'FORWARD',
  }

  if (gstNumber) {
    requestBody.taxDetails = [
      {
        taxType: 'GST',
        taxRegistrationNumber: gstNumber,
      },
    ]
  }

  if (isAmazonCodOrder(params)) {
    requestBody.valueAddedServices = {
      collectOnDelivery: {
        amount: {
          value: orderAmount,
          unit: currency,
        },
      },
    }
  }

  return requestBody
}

async function ensureUniqueMerchantOrderNumber(
  tx: PgTransaction<any, any, any>,
  userId: string,
  orderNumber?: string | null,
) {
  const normalizedOrderNumber = typeof orderNumber === 'string' ? orderNumber.trim() : ''
  const normalizedOrderNumberKey = normalizedOrderNumber.toLowerCase()

  if (!normalizedOrderNumber) {
    throw new HttpError(400, 'Order ID is required.')
  }

  const [existingB2C, existingB2B] = await Promise.all([
    tx
      .select({ id: b2c_orders.id })
      .from(b2c_orders)
      .where(
        and(
          eq(b2c_orders.user_id, userId),
          sql`lower(trim(${b2c_orders.order_number})) = ${normalizedOrderNumberKey}`,
        ),
      )
      .limit(1),
    tx
      .select({ id: b2b_orders.id })
      .from(b2b_orders)
      .where(
        and(
          eq(b2b_orders.user_id, userId),
          sql`lower(trim(${b2b_orders.order_number})) = ${normalizedOrderNumberKey}`,
        ),
      )
      .limit(1),
  ])

  if (existingB2C[0] || existingB2B[0]) {
    throw new HttpError(
      409,
      `Order ID "${normalizedOrderNumber}" already exists for this merchant. Please use a unique Order ID.`,
    )
  }

  return normalizedOrderNumber
}

export async function checkMerchantOrderNumberAvailability(
  userId: string,
  orderNumber?: string | null,
) {
  const normalizedOrderNumber = typeof orderNumber === 'string' ? orderNumber.trim() : ''
  const normalizedOrderNumberKey = normalizedOrderNumber.toLowerCase()

  if (!normalizedOrderNumber) {
    throw new HttpError(400, 'Order ID is required.')
  }

  const [existingB2C, existingB2B] = await Promise.all([
    db
      .select({ id: b2c_orders.id })
      .from(b2c_orders)
      .where(
        and(
          eq(b2c_orders.user_id, userId),
          sql`lower(trim(${b2c_orders.order_number})) = ${normalizedOrderNumberKey}`,
        ),
      )
      .limit(1),
    db
      .select({ id: b2b_orders.id })
      .from(b2b_orders)
      .where(
        and(
          eq(b2b_orders.user_id, userId),
          sql`lower(trim(${b2b_orders.order_number})) = ${normalizedOrderNumberKey}`,
        ),
      )
      .limit(1),
  ])

  return {
    normalizedOrderNumber,
    available: !(existingB2C[0] || existingB2B[0]),
  }
}

function buildPickupFromWarehouse(
  warehouse: PickupWarehouseRecord,
  previousPickup?: ShipmentParams['pickup'],
  fallbackDate?: string,
  fallbackTime?: string,
): ShipmentParams['pickup'] {
  const addressSegments = [warehouse.addressLine1, warehouse.addressLine2].filter(
    (segment) => typeof segment === 'string' && segment.trim().length,
  )
  const formattedAddress =
    addressSegments.length > 0 ? addressSegments.join(', ') : warehouse.addressLine1

  return {
    warehouse_name: warehouse.addressNickname || warehouse.contactName || 'Warehouse',
    address: formattedAddress,
    address_2: warehouse.addressLine2 ?? undefined,
    city: warehouse.city,
    state: warehouse.state,
    pincode: warehouse.pincode,
    name: warehouse.contactName || 'Shiplifi',
    phone: warehouse.contactPhone || '',
    gst_number: previousPickup?.gst_number ?? warehouse.gstNumber ?? '',
    pickup_date: previousPickup?.pickup_date ?? fallbackDate,
    pickup_time: previousPickup?.pickup_time ?? fallbackTime,
  }
}

const getDefaultPickupDate = () => {
  const now = new Date()
  return now.toISOString().split('T')[0]
}

const getTomorrowPickupDate = () => {
  const nextDay = new Date()
  nextDay.setDate(nextDay.getDate() + 1)
  return nextDay.toISOString().split('T')[0]
}

const normalizePickupDateForRetry = (pickupDateRaw: unknown, isManifestRetry: boolean) => {
  const fallbackDate = isManifestRetry ? getTomorrowPickupDate() : getDefaultPickupDate()
  const normalizedInput = String(pickupDateRaw || '')
    .trim()
    .slice(0, 10)

  if (!normalizedInput) {
    return fallbackDate
  }

  if (!isManifestRetry) {
    return normalizedInput
  }

  return normalizedInput < fallbackDate ? fallbackDate : normalizedInput
}

const formatLocalDateInput = (value: Date) => {
  const year = value.getFullYear()
  const month = String(value.getMonth() + 1).padStart(2, '0')
  const day = String(value.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getDefaultPickupTime = () => {
  const now = new Date(Date.now() + 60 * 60 * 1000)
  return now.toTimeString().split(' ')[0]
}

const formatLocalTimeInput = (value: Date) => {
  const hours = String(value.getHours()).padStart(2, '0')
  const minutes = String(value.getMinutes()).padStart(2, '0')
  const seconds = String(value.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

const normalizePickupTimeValue = (pickupTimeRaw: unknown) => {
  const value = String(pickupTimeRaw || '').trim()
  if (/^\d{2}:\d{2}:\d{2}$/.test(value)) return value
  if (/^\d{2}:\d{2}$/.test(value)) return `${value}:00`
  return getDefaultPickupTime()
}

const normalizePickupSchedule = ({
  pickupDateRaw,
  pickupTimeRaw,
  isManifestRetry,
}: {
  pickupDateRaw: unknown
  pickupTimeRaw: unknown
  isManifestRetry: boolean
}) => {
  let pickupDate = normalizePickupDateForRetry(pickupDateRaw, isManifestRetry)
  let pickupTime = normalizePickupTimeValue(pickupTimeRaw)

  const [hours, minutes, seconds] = pickupTime.split(':').map((part) => Number(part) || 0)
  const minimumAllowed = new Date(Date.now() + 15 * 60 * 1000)
  const scheduledAt = new Date(
    `${pickupDate}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
  )

  if (Number.isNaN(scheduledAt.getTime()) || scheduledAt.getTime() < minimumAllowed.getTime()) {
    pickupDate = formatLocalDateInput(minimumAllowed)
    pickupTime = formatLocalTimeInput(minimumAllowed)
  }

  return { pickupDate, pickupTime }
}

const getIndiaDateInput = (offsetDays = 0) => {
  const indiaOffsetMs = 330 * 60 * 1000
  const dayMs = 24 * 60 * 60 * 1000
  return new Date(Date.now() + indiaOffsetMs + offsetDays * dayMs).toISOString().slice(0, 10)
}

const resolveEkartBookingSchedule = (params: ShipmentParams) => {
  const schedule = normalizePickupSchedule({
    pickupDateRaw:
      params.preferred_dispatch_date ||
      params.pickup_date ||
      params.pickup?.pickup_date ||
      params.order_date ||
      new Date().toISOString(),
    pickupTimeRaw: params.pickup_time || params.pickup?.pickup_time || getDefaultPickupTime(),
    isManifestRetry: true,
  })

  const minimumDispatchDate = getIndiaDateInput(1)
  if (schedule.pickupDate < minimumDispatchDate) {
    return {
      ...schedule,
      pickupDate: minimumDispatchDate,
    }
  }

  return schedule
}

interface NimbusServiceabilityParams {
  origin: number
  destination: number
  payment_type?: 'cod' | 'prepaid' | 'reverse'
  order_amount?: number
  orderAmount?: number
  weight?: number
  length?: number
  shipment_type?: 'b2b' | 'b2c'
  product_type?: string
  productType?: string
  breadth?: number
  height?: number
  isReverse?: boolean
  preferred_carriers?: number[]
  delivery_type?: number
  extra_info?: boolean
  cost_info?: boolean
  source_pincode?: number
  destination_pincode?: number
  pickupId?: string
  pickupName?: string
  pickupAddress?: string
  pickupCity?: string
  pickupState?: string
  deliveryName?: string
  deliveryPhone?: string
  deliveryAddress?: string
  deliveryCity?: string
  deliveryState?: string
  shadowfax_forward_mode?: string
  shadowfax_service_mode?: 'regular' | 'surface'
  // Hint that this call is coming from a rate calculator UI (we can skip heavy live checks)
  isCalculator?: boolean
}

// Delhivery-only serviceability.

// Assumes same imports / db / eq / tables are available as before.

type LocRow = {
  id: string
  pincode: string
  city?: string | null
  state?: string | null
  country?: string | null
  tags?: string[] | string | null
}

const normalizeTags = (raw: string[] | string | null | undefined): string[] => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((t) => String(t).toLowerCase())
  return String(raw)
    .split(/[;,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

const fetchLocationByPincode = async (pincode: string): Promise<LocRow | null> => {
  const rows = await db
    .select({
      id: locations.id,
      pincode: locations.pincode,
      city: locations.city,
      state: locations.state,
      country: locations.country,
      tags: locations.tags,
    })
    .from(locations)
    .where(eq(locations.pincode, pincode))
    .limit(1)

  const row = rows[0] as unknown as LocRow | undefined
  if (!row) return null
  return {
    ...row,
    tags: normalizeTags(row.tags),
  }
}

const hasTag = (loc: LocRow | null, tag: string) =>
  !!loc && Array.isArray(loc.tags) && loc.tags.includes(tag.toLowerCase())

/**
 * Determine B2C zone classification for a shipment
 *
 * Priority order (most specific → broadest):
 *  1. Special Zones
 *  2. Within City (city + state must both match)
 *  3. Within State (same state, different city)
 *  4. Metro to Metro (different metro cities, cross-state or same state)
 *  5. Within Region (north/south/east/west)
 *  6. ROI (Rest of India - fallback)
 */
const determineB2CZoneKey = (
  origin: LocRow | null,
  destination: LocRow | null,
): { key: string; reason: string } => {
  if (!origin || !destination) {
    return { key: 'ROI', reason: 'origin or destination missing' }
  }
  // 1. Special Zones (always override)
  if (
    hasTag(origin, 'special_zones') ||
    hasTag(origin, 'special_zone') ||
    hasTag(destination, 'special_zones') ||
    hasTag(destination, 'special_zone') ||
    hasTag(origin, 'special') ||
    hasTag(destination, 'special')
  ) {
    return { key: 'SPECIAL_ZONE', reason: 'special zone tag present' }
  }

  // 2. Within City (requires same city + same state)
  if (
    origin.city &&
    destination.city &&
    origin.state &&
    destination.state &&
    (origin.city ?? '').toLowerCase() === (destination.city ?? '').toLowerCase() &&
    (origin.state ?? '').toLowerCase() === (destination.state ?? '').toLowerCase()
  ) {
    return { key: 'WITHIN_CITY', reason: 'same city + same state' }
  }

  // 3. Within State (same state, but different cities)
  if (
    origin.state &&
    destination.state &&
    (origin.state ?? '').toLowerCase() === (destination.state ?? '').toLowerCase() &&
    (origin.city ?? '').toLowerCase() !== (destination.city ?? '').toLowerCase()
  ) {
    return { key: 'WITHIN_STATE', reason: 'same state (different city)' }
  }

  // 4. Metro to Metro (different metro cities — cross-state or within same state)
  if (
    hasTag(origin, 'metros') &&
    hasTag(destination, 'metros') &&
    (origin.city ?? '').toLowerCase() !== (destination.city ?? '').toLowerCase()
  ) {
    return { key: 'METRO_TO_METRO', reason: 'both metros (different cities, cross-state allowed)' }
  }

  // 5. Within Region (north/south/east/west)
  const regions = ['north', 'south', 'east', 'west']
  for (const r of regions) {
    if (hasTag(origin, r) && hasTag(destination, r)) {
      return { key: 'WITHIN_REGION', reason: `both in region ${r}` }
    }
  }

  // 6. Fallback ROI
  return { key: 'ROI', reason: 'fallback Rest of India' }
}

/**
 * Map internal zone key to the DB's zones.code string.
 * Adjust the right-hand values if your zones.code uses different wording.
 */
const ZONE_KEY_TO_DB_CODE: Record<string, string> = {
  METRO_TO_METRO: 'METRO_TO_METRO',
  ROI: 'ROI',
  SPECIAL_ZONE: 'SPECIAL_ZONE',
  WITHIN_CITY: 'WITHIN_CITY',
  WITHIN_REGION: 'WITHIN_REGION',
  WITHIN_STATE: 'WITHIN_STATE',
}

const B2C_ZONE_KEY_FALLBACK_CODES: Record<string, string[]> = {
  METRO_TO_METRO: ['A_B2C', 'A', 'ZONE_A', 'ZONE A', 'ZONE A (B2C)'],
  WITHIN_CITY: ['A_B2C', 'A', 'ZONE_A', 'ZONE A', 'ZONE A (B2C)'],
  WITHIN_STATE: ['B_B2C', 'B', 'ZONE_B', 'ZONE B', 'ZONE B (B2C)'],
  WITHIN_REGION: ['C_B2C', 'C', 'ZONE_C', 'ZONE C', 'ZONE C (B2C)'],
  ROI: ['D_B2C', 'E_B2C', 'D', 'E', 'ZONE_D', 'ZONE_E', 'ZONE D', 'ZONE E'],
  SPECIAL_ZONE: ['SPECIAL_B2C', 'SPECIAL', 'E_B2C', 'E', 'ZONE_E', 'ZONE E'],
}

const uniqueZoneCandidates = (values: Array<string | null | undefined>) =>
  Array.from(
    new Set(
      values
        .map((value) => String(value || '').trim())
        .filter(Boolean),
    ),
  )

const findB2CZoneByCandidate = async (
  candidate: string,
): Promise<{ id: string; code: string; name?: string } | null> => {
  const dbCode = String(candidate || '').trim()
  if (!dbCode) return null

  const [exactTrim] = await db
    .select({ id: zones.id, code: zones.code, name: zones.name })
    .from(zones)
    .where(and(eq(zones.business_type, 'B2C'), sql`trim(${zones.code}) = ${dbCode}`))
    .limit(1)

  if (exactTrim?.id) {
    return { id: exactTrim.id, code: exactTrim.code, name: exactTrim.name }
  }

  const normalized = dbCode.toLowerCase()
  const [caseInsensitive] = await db
    .select({ id: zones.id, code: zones.code, name: zones.name })
    .from(zones)
    .where(
      and(
        eq(zones.business_type, 'B2C'),
        sql`(
          lower(trim(${zones.code})) = ${normalized}
          OR lower(trim(${zones.name})) = ${normalized}
        )`,
      ),
    )
    .limit(1)

  return caseInsensitive?.id
    ? {
        id: caseInsensitive.id,
        code: caseInsensitive.code,
        name: caseInsensitive.name,
      }
    : null
}

const findB2CZoneByCandidates = async (candidates: string[]) => {
  for (const candidate of uniqueZoneCandidates(candidates)) {
    const zone = await findB2CZoneByCandidate(candidate)
    if (zone) return zone
  }

  return null
}

/**
 * Fetch zone row by zones.code; fallback to ROI if not found.
 */
const fetchZoneIdByKey = async (
  key: string,
): Promise<{ id: string; code: string; name?: string }> => {
  const dbCodeRaw = ZONE_KEY_TO_DB_CODE[key] ?? ZONE_KEY_TO_DB_CODE['ROI']
  const dbCode = dbCodeRaw?.trim()

  if (!dbCode) {
    throw new Error('fetchZoneIdByKey called with empty dbCode')
  }

  const requestedZone = await findB2CZoneByCandidates([
    dbCode,
    ...(B2C_ZONE_KEY_FALLBACK_CODES[key] || []),
  ])
  if (requestedZone) return requestedZone

  const fallback = await findB2CZoneByCandidates([
    ZONE_KEY_TO_DB_CODE['ROI'] ?? 'ROI',
    ...(B2C_ZONE_KEY_FALLBACK_CODES['ROI'] || []),
  ])
  if (fallback) {
    console.warn('[Serviceability] Falling back to available B2C zone', {
      requestedKey: key,
      requestedDbCode: dbCode,
      fallbackCode: fallback.code,
    })
    return fallback
  }

  const [firstB2CZone] = await db
    .select({ id: zones.id, code: zones.code, name: zones.name })
    .from(zones)
    .where(eq(zones.business_type, 'B2C'))
    .orderBy(zones.code)
    .limit(1)

  if (firstB2CZone?.id) {
    console.warn('[Serviceability] Falling back to first configured B2C zone', {
      requestedKey: key,
      requestedDbCode: dbCode,
      fallbackCode: firstB2CZone.code,
    })
    return { id: firstB2CZone.id, code: firstB2CZone.code, name: firstB2CZone.name }
  }

  throw new Error(
    'Zone lookup failed: no matching zone found and ROI fallback missing in zones table',
  )
}

/**
 * Compute slab-based B2C freight using rate card data.
 */
export const computeB2CFreightForOrder = async (params: {
  userId: string
  courierId: number | string
  serviceProvider?: string | null
  mode?: string | null
  selectedRateCardId?: string | null
  selectedMaxSlabWeight?: number | null
  zoneIdOverride?: string | null
  destinationPincode: string
  originPincode: string
  weightG: number
  lengthCm: number
  breadthCm: number
  heightCm: number
  orderAmount?: number | null
  isReverse?: boolean
}) => {
  // Resolve active plan
  const [userPlan] = await db
    .select({ planId: userPlans.plan_id })
    .from(userPlans)
    .where(and(eq(userPlans.userId, params.userId), eq(userPlans.is_active, true)))
    .limit(1)

  let activePlanId = userPlan?.planId ?? null
  if (!activePlanId) {
    const [defaultPlan] = await db
      .select({ id: plans.id })
      .from(plans)
      .where(sql`lower(${plans.name}) = 'default'`)
      .limit(1)
    activePlanId = defaultPlan?.id ?? null
  }

  if (!activePlanId) {
    throw new HttpError(400, 'No active plan found for user to compute freight')
  }

  const [originLoc, destLoc] = await Promise.all([
    fetchLocationByPincode(params.originPincode),
    fetchLocationByPincode(params.destinationPincode),
  ])
  const { key: zoneKey } = determineB2CZoneKey(originLoc, destLoc)
  const resolvedZoneRow = await fetchZoneIdByKey(zoneKey)

  if (params.zoneIdOverride && params.zoneIdOverride !== resolvedZoneRow.id) {
    throw new HttpError(
      400,
      'Selected courier zone does not match the pickup/destination route. Please refresh courier rates and select again.',
    )
  }

  const preferredRateTypes = getPreferredB2CRateTypes(Boolean(params.isReverse))
  const resolvedServiceProvider =
    params.serviceProvider?.trim() ||
    (params.courierId !== undefined && params.courierId !== null
      ? ((
          await db
            .select({ serviceProvider: couriers.serviceProvider })
            .from(couriers)
            .where(eq(couriers.id, Number(params.courierId)))
            .limit(1)
        )[0]?.serviceProvider ?? null)
      : null)

  let rateCard: Awaited<ReturnType<typeof fetchResolvedB2CRateCards>>[number] | undefined
  for (const rateType of preferredRateTypes) {
    const [matchedRateCard] = await fetchResolvedB2CRateCards({
      planId: activePlanId,
      zoneId: resolvedZoneRow.id,
      shippingRateId: params.selectedRateCardId ?? null,
      courierId: Number(params.courierId),
      serviceProvider: resolvedServiceProvider,
      mode: params.mode?.trim() || null,
      type: rateType,
    })
    if (matchedRateCard) {
      rateCard = matchedRateCard
      break
    }
  }

  if (!rateCard) {
    throw new HttpError(400, 'No rate card found for selected courier/zone')
  }
  const freightCalc = computeB2CRateCardCharge({
    actual_weight_g: params.weightG,
    length_cm: params.lengthCm,
    width_cm: params.breadthCm,
    height_cm: params.heightCm,
    rateCard,
    selected_max_slab_weight: params.selectedMaxSlabWeight ?? null,
  })

  if (rateCard.slabs.length && freightCalc.freight <= 0) {
    throw new HttpError(400, 'No slab configured for selected courier/zone/weight')
  }

  return {
    ...freightCalc,
    slab_weight: freightCalc.slab_weight,
    base_price: freightCalc.base_price,
    zone_id: resolvedZoneRow.id,
    plan_id: activePlanId,
    rate_card_mode: rateCard.mode,
    rate_card_courier_name: rateCard.courier_name,
    rate_card_service_provider: rateCard.service_provider,
    selected_slab: freightCalc.selected_slab,
    cod_charges: computeEffectiveB2CCodCharge({
      cod_charges: rateCard.cod_charges,
      cod_percent: rateCard.cod_percent,
      order_amount: params.orderAmount,
    }),
    cod_percent: rateCard.cod_percent,
    other_charges: rateCard.other_charges,
  }
}

const convertKgToGrams = (value: unknown) => {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0
  return Math.round(numericValue * 1000)
}

const normalizeServiceabilityWeightToGrams = (value: unknown) => {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0
  return numericValue > 50 ? Math.round(numericValue) : Math.round(numericValue * 1000)
}

//ADMIN CALCULATION
export const fetchAvailableCouriersWithRatesAdmin = async (
  params: NimbusServiceabilityParams,
  planId?: string,
) => {
  return fetchAvailableCouriersWithRates(params, {
    planIdOverride: planId ?? null,
  })
}

function parseEddToDays(edd: string | null | undefined): number {
  if (!edd) return Infinity

  // Case 1: valid date (e.g. "2025-09-15")
  const asDate = new Date(edd)
  if (!isNaN(asDate.getTime())) {
    const today = new Date()
    const diffMs = asDate.getTime() - today.getTime()
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  }

  // Case 2: "2-3 Days" or "4 Days"
  const match = edd.match(/(\d+)/)
  if (match) return parseInt(match[1], 10)

  return Infinity
}

/**
 * Filter couriers by business_type
 * Only returns couriers that have the specified business type in their business_type array
 * @param courierList - Array of courier objects with at least an `id` property
 * @param expectedBusinessType - 'b2c' or 'b2b'
 * @returns Filtered array of couriers that support the expected business type
 */
async function filterCouriersByBusinessType(
  courierList: any[],
  expectedBusinessType: 'b2c' | 'b2b',
): Promise<any[]> {
  if (!courierList || courierList.length === 0) {
    return []
  }

  const courierIds = Array.from(
    new Set(
      courierList
        .map((c: any) => c.id)
        .filter((id: any) => id !== undefined && id !== null),
    ),
  )

  if (courierIds.length === 0) {
    return []
  }

  // Fetch business_type for all couriers
  const courierBusinessTypes = await db
    .select({
      id: couriers.id,
      serviceProvider: couriers.serviceProvider,
      businessType: couriers.businessType,
      isEnabled: couriers.isEnabled,
    })
    .from(couriers)
    .where(inArray(couriers.id, courierIds))

  const providerVisibilityMap = new Map(
    courierBusinessTypes.map((c) => [
      `${Number(c.id)}__${String(c.serviceProvider || '').trim().toLowerCase()}`,
      {
        businessType: c.businessType as ('b2c' | 'b2b')[],
        isEnabled: c.isEnabled === true,
      },
    ]),
  )
  const idVisibilityMap = new Map<
    number,
    { businessType: ('b2c' | 'b2b')[]; isEnabled: boolean }
  >()
  const idProviderCounts = new Map<number, number>()
  for (const row of courierBusinessTypes) {
    const id = Number(row.id)
    idProviderCounts.set(id, (idProviderCounts.get(id) || 0) + 1)
    if (!idVisibilityMap.has(id)) {
      idVisibilityMap.set(id, {
        businessType: row.businessType as ('b2c' | 'b2b')[],
        isEnabled: row.isEnabled === true,
      })
    }
  }

  // Filter couriers to only include those with the expected business type
  const filtered = courierList.filter((c: any) => {
    const providerKey = String(c?.integration_type || c?.serviceProvider || '')
      .trim()
      .toLowerCase()
    const exactKey = `${Number(c.id)}__${providerKey}`
    const visibility =
      providerVisibilityMap.get(exactKey) ||
      (!providerKey && idProviderCounts.get(Number(c.id)) === 1
        ? idVisibilityMap.get(Number(c.id))
        : null)
    const types = visibility?.businessType || []
    const hasBusinessType =
      visibility?.isEnabled === true &&
      Array.isArray(types) &&
      types.includes(expectedBusinessType)
    const hasB2CRateCardBackedVisibility =
      expectedBusinessType === 'b2c' &&
      c?.isRateCardBackedB2C === true &&
      visibility?.isEnabled === true &&
      Boolean(c?.localRates?.forward || c?.localRates?.rto || c?.localRates?.reverse_pickup)

    if (!hasBusinessType && !hasB2CRateCardBackedVisibility) {
      console.log('🚫 Removing courier - wrong business_type', {
        courierId: c.id,
        courierName: c.name,
        isEnabled: visibility?.isEnabled ?? false,
        businessType: types,
        expected: expectedBusinessType,
        rateCardBackedB2C: c?.isRateCardBackedB2C === true,
      })
    }

    return hasBusinessType || hasB2CRateCardBackedVisibility
  })

  return filtered
}

type FetchCouriersOptions =
  | string
  | {
      userId?: string
      planIdOverride?: string | null
      planFallbackName?: string | null
    }

export const fetchAvailableCouriersWithRates = async (
  params: NimbusServiceabilityParams & { pickupId?: string },
  userOrOptions?: FetchCouriersOptions,
) => {
  try {
    // ✅ B2C only - B2B should use fetchAvailableCouriersWithRatesB2B
    if (params.shipment_type && params.shipment_type !== 'b2c') {
      throw new Error(
        `fetchAvailableCouriersWithRates is for B2C only. Use fetchAvailableCouriersWithRatesB2B for ${params.shipment_type}`,
      )
    }

    const options =
      typeof userOrOptions === 'string'
        ? {
            userId: userOrOptions,
          }
        : (userOrOptions ?? {})

    const { userId, planIdOverride, planFallbackName } = options
    const effectiveShipmentType = params.shipment_type ?? 'b2c'

    const isCalculator = params.isCalculator === true
    const shouldRunLiveServiceability = !isCalculator

    // 🔹 Cache key (per user + params)
    const normalizePincode = (value: unknown): number | undefined => {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        return Number(value)
      }
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.trim())
        return Number.isNaN(parsed) ? undefined : parsed
      }
      return undefined
    }

    const pickupIdForServiceability = String(
      params.pickupId || (params as any).pickup_id || '',
    ).trim()
    const requestedOriginPincode = normalizePincode(params.origin ?? params.source_pincode)
    if ((!requestedOriginPincode || requestedOriginPincode <= 0) && userId && pickupIdForServiceability) {
      const pickupWarehouse = await fetchPickupWarehouseRecord(userId, pickupIdForServiceability)
      const resolvedOriginPincode = normalizePincode(pickupWarehouse?.pincode)
      if (resolvedOriginPincode && resolvedOriginPincode > 0) {
        params.origin = resolvedOriginPincode
        params.source_pincode = resolvedOriginPincode
        console.log('[Serviceability] Resolved origin pincode from pickup_id', {
          pickupId: pickupIdForServiceability,
          originPincode: resolvedOriginPincode,
        })
      } else {
        console.warn('[Serviceability] Unable to resolve pickup pincode from pickup_id', {
          pickupId: pickupIdForServiceability,
          userId,
        })
      }
    }

    // const isReverseShipment = params.isReverse === true || params.payment_type === 'reverse'

    // Build registry of enabled couriers by service provider
    // Filter by business type: check if business_type JSONB array contains 'b2c'
    const SUPPORTED_PROVIDERS = ['innofulfill']
    const allSystemCourierRows = await db
      .select({
        id: couriers.id,
        serviceProvider: couriers.serviceProvider,
        name: couriers.name,
        isEnabled: couriers.isEnabled,
        businessType: couriers.businessType,
        createdAt: couriers.createdAt,
      })
      .from(couriers)

    const rowSupportsBusinessType = (
      row: (typeof allSystemCourierRows)[number],
      businessType: 'b2c' | 'b2b',
    ) => Array.isArray(row.businessType) && row.businessType.includes(businessType)

    const systemCourierRows = allSystemCourierRows.filter(
      (row) => row.isEnabled === true && rowSupportsBusinessType(row, 'b2c'),
    )

    const normalizeProviderKey = (value?: unknown) => {
      if (!value) return ''
      return String(value).trim().toLowerCase()
    }

    const isRecognizedDelhiveryCourier = (source: {
      id?: unknown
      name?: unknown
      mode?: unknown
    }) =>
      Boolean(
        resolveDelhiveryShippingMode({
          courierId: source.id,
          mode: source.mode,
          courierName: source.name,
        }),
      )

    const getCanonicalDelhiveryCourierMeta = (source: {
      id?: unknown
      name?: unknown
      mode?: unknown
    }) => {
      const shippingMode = resolveDelhiveryShippingMode({
        courierId: source.id,
        mode: source.mode,
        courierName: source.name,
      })
      const courierId = getCanonicalDelhiveryCourierIdByMode(shippingMode)
      if (!shippingMode || !courierId) return null

      return {
        id: courierId,
        name: getDelhiveryCourierDisplayName(shippingMode),
        shippingMode,
        rateMode: shippingMode === 'Express' ? 'air' : 'surface',
      }
    }

    const getCanonicalDelhiveryRateCardMeta = (source: {
      id?: unknown
      name?: unknown
      mode?: unknown
    }) => {
      const shippingMode = resolveDelhiveryRateCardShippingMode({
        courierId: source.id,
        mode: source.mode,
        courierName: source.name,
      })
      const courierId = getCanonicalDelhiveryCourierIdByMode(shippingMode)
      if (!shippingMode || !courierId) return null

      return {
        id: courierId,
        name: getDelhiveryCourierDisplayName(shippingMode),
        shippingMode,
        rateMode: shippingMode === 'Express' ? 'air' : 'surface',
      }
    }

    const isXpressbeesAirCourier = (source: { name?: unknown; mode?: unknown }) => {
      const name = String(source.name || '').trim().toLowerCase()
      const mode = normalizeB2CShippingMode(source.mode)
      return mode === 'air' || name.includes('air')
    }

    const isXpressbeesForwardSurfaceCourier = (source: { name?: unknown; mode?: unknown }) => {
      const name = String(source.name || '').trim().toLowerCase()
      return !isXpressbeesAirCourier(source) && !name.includes('reverse')
    }

    const isSupportedB2CProviderCourier = (
      providerKey: string,
      source: { id?: unknown; name?: unknown; mode?: unknown },
    ) => {
      if (providerKey === 'delhivery') {
        return isRecognizedDelhiveryCourier(source)
      }

      if (providerKey === 'xpressbees') {
        return isXpressbeesForwardSurfaceCourier(source)
      }

      return true
    }

    const normalizeShadowfaxMode = normalizeShadowfaxForwardModeValue

    const explicitShadowfaxForwardMode = String(params.shadowfax_forward_mode || '').trim()
    let shadowfaxRequestedMode = resolveShadowfaxOrderMode(
      params,
      explicitShadowfaxForwardMode,
    )
    const explicitShadowfaxServiceMode = String(params.shadowfax_service_mode || '').trim()
    let shadowfaxRequestedService = normalizeShadowfaxServiceModeValue(
      explicitShadowfaxServiceMode || 'surface',
    )

    const shadowfaxCourierMatchesMode = (
      courierName?: string | null,
      requestedMode?: string | null,
    ) => {
      const normalizedName = String(courierName || '')
        .trim()
        .toLowerCase()
      const normalizedMode = normalizeShadowfaxMode(requestedMode)

      if (!normalizedName) return true
      if (normalizedMode === 'warehouse') {
        return normalizedName.includes('warehouse')
      }

      if (normalizedName.includes('warehouse')) {
        return false
      }

      return true
    }

    const makeCourierIdentityKey = (courier: {
      id: number | string
      integration_type?: string | null
      serviceProvider?: string | null
      rate_card_id?: string | null
      max_slab_weight?: number | null
    }) => {
      const base = `${String(courier.id)}__${normalizeProviderKey(courier.integration_type || courier.serviceProvider || null)}`
      const rateCardId = String(courier.rate_card_id || '').trim()
      const slab = courier.max_slab_weight ?? 'base'
      return rateCardId ? `${base}__${rateCardId}__${slab}` : `${base}__${slab}`
    }

    const courierNameAlreadyHasWeight = (name?: string | null) =>
      /\b\d+(\.\d+)?\s*(k\.?\s*g\.?|kg)\b/i.test(String(name || ''))

    const formatCourierOptionName = (courierName: string, slabWeightTo: number | null) => {
      if (courierNameAlreadyHasWeight(courierName)) return courierName
      return formatCourierSlabDisplayName(courierName, slabWeightTo)
    }

    interface CourierRow {
      id: number
      serviceProvider: string | null
      name: string
      createdAt: Date | null
      isVirtualProvider?: boolean
      isRateCardBackedB2C?: boolean
      shippingMode?: DelhiveryShippingMode | null
    }

    interface ProviderBucket {
      rows: CourierRow[]
      idSet: Set<number>
    }

    const providerCourierBuckets = new Map<string, ProviderBucket>()
    const makeProviderCourierRegistryKey = (providerKey: unknown, courierId: unknown) => {
      const numericId = Number(courierId)
      if (!Number.isFinite(numericId)) return ''
      return `${numericId}__${normalizeProviderKey(providerKey)}`
    }
    const enabledCourierRegistryRows = new Map(
      allSystemCourierRows
        .filter((row) => row.isEnabled === true)
        .map((row) => [
          makeProviderCourierRegistryKey(row.serviceProvider, row.id),
          row,
        ]),
    )
    const addProviderBucketRow = (providerKey: string, row: CourierRow) => {
      const normalizedProvider = normalizeProviderKey(providerKey)
      const courierId = Number(row.id)
      if (!normalizedProvider || !Number.isFinite(courierId)) return false

      if (!providerCourierBuckets.has(normalizedProvider)) {
        providerCourierBuckets.set(normalizedProvider, { rows: [], idSet: new Set<number>() })
      }

      const bucket = providerCourierBuckets.get(normalizedProvider)!
      const existingIndex = bucket.rows.findIndex((existing) => Number(existing.id) === courierId)
      if (existingIndex >= 0) {
        bucket.rows[existingIndex] = {
          ...bucket.rows[existingIndex],
          ...row,
          isRateCardBackedB2C:
            bucket.rows[existingIndex].isRateCardBackedB2C === true ||
            row.isRateCardBackedB2C === true,
        }
      } else {
        bucket.rows.push(row)
      }
      bucket.idSet.add(courierId)
      return true
    }
    const disabledCourierIdentityKeys = new Set(
      allSystemCourierRows
        .filter((row) => row.isEnabled !== true)
        .map((row) => `${Number(row.id)}__${normalizeProviderKey(row.serviceProvider)}`),
    )
    const isCourierDisabledForProvider = (
      providerKey: string,
      source: { id?: unknown; name?: unknown; mode?: unknown },
    ) => {
      const normalizedProvider = normalizeProviderKey(providerKey)
      if (!normalizedProvider) return false

      if (normalizedProvider === 'delhivery') {
        const canonical = getCanonicalDelhiveryCourierMeta(source)
        if (canonical) {
          return disabledCourierIdentityKeys.has(`${canonical.id}__${normalizedProvider}`)
        }
      }

      const courierId = Number(source.id)
      return (
        Number.isFinite(courierId) &&
        disabledCourierIdentityKeys.has(`${courierId}__${normalizedProvider}`)
      )
    }

    for (const row of systemCourierRows) {
      const providerKey = normalizeProviderKey(row.serviceProvider)
      if (!providerKey || !SUPPORTED_PROVIDERS.includes(providerKey)) continue
      if (!isSupportedB2CProviderCourier(providerKey, row)) {
        continue
      }
      addProviderBucketRow(providerKey, row)
    }

    const inferDefaultShadowfaxModeFromBuckets = (rateCards: any[] = []) => {
      const reverseShadowfaxShipment = isShadowfaxReverseShipment(params)
      const shadowfaxBucket = providerCourierBuckets.get('shadowfax')
      if (!shadowfaxBucket?.rows.length) return
      const shadowfaxRateCards = rateCards.filter(
        (rate) => inferProviderFromRateCard(rate) === 'shadowfax',
      )
      if (shadowfaxRateCards.length) {
        const hasWarehouseRate = shadowfaxRateCards.some((rate) =>
          String(rate.courier_name || '').toLowerCase().includes('warehouse'),
        )
        const hasMarketplaceRate = shadowfaxRateCards.some(
          (rate) => !String(rate.courier_name || '').toLowerCase().includes('warehouse'),
        )
        if (explicitShadowfaxForwardMode && shadowfaxRequestedMode === 'warehouse') {
          const explicitWarehouse = normalizeShadowfaxMode(explicitShadowfaxForwardMode) === 'warehouse'
          if (explicitWarehouse && hasWarehouseRate) return
          if (!explicitWarehouse && hasMarketplaceRate) return
          if (explicitWarehouse && !hasWarehouseRate && hasMarketplaceRate) {
            shadowfaxRequestedMode = 'marketplace'
            return
          }
          if (reverseShadowfaxShipment && !explicitWarehouse && !hasMarketplaceRate && hasWarehouseRate) {
            shadowfaxRequestedMode = 'warehouse'
            return
          }
          return
        }
        if (reverseShadowfaxShipment && hasWarehouseRate && !hasMarketplaceRate) {
          shadowfaxRequestedMode = 'warehouse'
          return
        }
        if (hasMarketplaceRate && !hasWarehouseRate) {
          shadowfaxRequestedMode = 'marketplace'
          return
        }
      }
      if (explicitShadowfaxForwardMode && shadowfaxRequestedMode === 'warehouse') return
      const hasWarehouseCourier = shadowfaxBucket.rows.some((row) =>
        String(row.name || '').toLowerCase().includes('warehouse'),
      )
      const hasMarketplaceCourier = shadowfaxBucket.rows.some(
        (row) => !String(row.name || '').toLowerCase().includes('warehouse'),
      )
      if (reverseShadowfaxShipment && hasWarehouseCourier && !hasMarketplaceCourier) {
        shadowfaxRequestedMode = 'warehouse'
      }
    }
    inferDefaultShadowfaxModeFromBuckets()

    const inferDefaultShadowfaxServiceFromRates = (rateCards: any[] = []) => {
      if (explicitShadowfaxServiceMode) return
      const shadowfaxRateCards = rateCards.filter(
        (rate) => inferProviderFromRateCard(rate) === 'shadowfax',
      )
      if (!shadowfaxRateCards.length) return

      const hasSurfaceRate = shadowfaxRateCards.some(
        (rate) =>
          normalizeB2CShippingMode(rate.mode) === 'surface' ||
          String(rate.courier_name || '').toLowerCase().includes('surface'),
      )
      const hasRegularRate = shadowfaxRateCards.some((rate) => {
        const mode = normalizeB2CShippingMode(rate.mode)
        const name = String(rate.courier_name || '').toLowerCase()
        return mode === 'regular' || name.includes('regular')
      })

      if (hasSurfaceRate && !hasRegularRate) shadowfaxRequestedService = 'surface'
      if (hasRegularRate && !hasSurfaceRate) shadowfaxRequestedService = 'regular'
    }

    const systemCourierMap = Object.fromEntries(
      [...providerCourierBuckets.entries()].map(([providerKey, bucket]) => [
        providerKey,
        bucket.idSet,
      ]),
    ) as Record<string, Set<number>>

    interface ServiceableProviderMeta {
      providerKey: string
      providerId: string
      providerName?: string
      codAvailable: boolean
      prepaidAvailable: boolean
      edd: string
      raw: any
      matchedCourierIds: Set<number>
    }

    const serviceableProviders = new Map<string, ServiceableProviderMeta>()

    const registerServiceableProvider = (
      providerKeyCandidate: string,
      meta: Omit<ServiceableProviderMeta, 'providerKey' | 'matchedCourierIds'>,
    ) => {
      const normalizedKey = normalizeProviderKey(providerKeyCandidate)
      if (!normalizedKey) return
      serviceableProviders.set(normalizedKey, {
        ...meta,
        providerKey: normalizedKey,
        matchedCourierIds: new Set<number>(),
      })
    }

    const isCourierInSystem = (provider: string | undefined, id: any) => {
      if (!provider) return false
      const normalizedProvider = provider.toLowerCase()
      const set = systemCourierMap[normalizedProvider]
      if (!set) return false
      const numericId = Number(id)
      if (Number.isNaN(numericId)) return false
      return set.has(numericId)
    }

    // Local B2C rate cards are pricing only; courier visibility still comes
    // exclusively from enabled B2C rows in the couriers registry.
    let localRates: any[] = []
    let approxZone: { id: string; code: string; name?: string } | null = null

    const inferProviderFromRateCard = (rate: any) => {
      const explicitProvider = normalizeProviderKey(normalizeB2CServiceProvider(rate.service_provider))
      if (explicitProvider) return explicitProvider

      const courierName = String(rate.courier_name || '').toLowerCase()
      if (courierName.includes('delhivery')) return 'delhivery'
      if (courierName.includes('amazon')) return 'amazon'
      if (courierName.includes('ekart')) return 'ekart'
      if (courierName.includes('shadowfax')) return 'shadowfax'
      if (courierName.includes('xpress')) return 'xpressbees'
      if (courierName.includes('innofulfill') || courierName.includes('innofulfil')) {
        return 'innofulfill'
      }
      return ''
    }

    const canonicalizeB2CLocalRateCard = (rate: any) => {
      const providerKey = inferProviderFromRateCard(rate)
      if (providerKey !== 'delhivery') return rate

      const canonical = getCanonicalDelhiveryRateCardMeta({
        id: rate.courier_id,
        name: rate.courier_name,
        mode: rate.mode,
      })
      if (!canonical) return rate

      return {
        ...rate,
        courier_id: canonical.id,
        courier_name: canonical.name,
        service_provider: rate.service_provider || 'delhivery',
        mode: normalizeB2CShippingMode(rate.mode) || canonical.rateMode,
      }
    }

    const localRateProviders = new Set<string>()

    if (effectiveShipmentType === 'b2c') {
      const originPincode = params.origin?.toString()
      const destinationPincode = params.destination?.toString()

      const [originLoc, destLoc] = await Promise.all([
        originPincode ? fetchLocationByPincode(originPincode) : null,
        destinationPincode ? fetchLocationByPincode(destinationPincode) : null,
      ])

      const { key: zoneKey } = determineB2CZoneKey(originLoc, destLoc)
      const zoneRow = await fetchZoneIdByKey(zoneKey)
      approxZone = { id: zoneRow.id, code: zoneRow.code, name: zoneRow.name }

      let activePlanId: string | null | undefined = planIdOverride ?? null

      if (!activePlanId && userId) {
        const [returnedUser] = await db
          .select({ planId: userPlans.plan_id })
          .from(userPlans)
          .where(and(eq(userPlans.userId, userId), eq(userPlans.is_active, true)))
          .limit(1)
        activePlanId = returnedUser?.planId ?? null
      }

      const fallbackPlanName = planFallbackName || (!userId ? 'Basic' : 'Default')
      if (!activePlanId && fallbackPlanName) {
        const normalizedFallback = fallbackPlanName.toLowerCase()
        const [fallbackPlan] = await db
          .select({ id: plans.id })
          .from(plans)
          .where(sql`lower(${plans.name}) = ${normalizedFallback}`)
          .limit(1)
        activePlanId = fallbackPlan?.id ?? null
      }

      if (activePlanId) {
        localRates = await fetchResolvedB2CRateCards({
          planId: activePlanId,
          zoneId: zoneRow.id,
        })
        localRates = localRates.map(canonicalizeB2CLocalRateCard)
      }

      const visibleRateProviders = new Set<string>()
      for (const rate of localRates) {
        const providerKey = inferProviderFromRateCard(rate)
        if (!providerKey || !SUPPORTED_PROVIDERS.includes(providerKey)) continue
        localRateProviders.add(providerKey)
        if (
          !isSupportedB2CProviderCourier(providerKey, {
            id: rate.courier_id,
            name: rate.courier_name,
            mode: rate.mode,
          })
        ) {
          continue
        }

        const courierId = Number(rate.courier_id)
        if (!Number.isFinite(courierId)) continue
        // Older Xpressbees Surface rows can be enabled with B2C rates but lack the B2C registry flag.
        if (providerKey === 'xpressbees' && !isCourierInSystem(providerKey, courierId)) {
          const registryRow = enabledCourierRegistryRows.get(
            makeProviderCourierRegistryKey(providerKey, courierId),
          )
          if (registryRow) {
            addProviderBucketRow(providerKey, {
              id: Number(registryRow.id),
              serviceProvider: registryRow.serviceProvider,
              name: registryRow.name,
              createdAt: registryRow.createdAt,
              isRateCardBackedB2C: true,
            })
          }
        }
        if (isCourierDisabledForProvider(providerKey, { id: courierId, name: rate.courier_name, mode: rate.mode })) continue
        if (!isCourierInSystem(providerKey, courierId)) continue
        visibleRateProviders.add(providerKey)
      }

      inferDefaultShadowfaxModeFromBuckets(localRates)
      inferDefaultShadowfaxServiceFromRates(localRates)

      const providerRateSummaryMap = localRates.reduce<Map<string, number>>((summary, rate) => {
        const providerKey = inferProviderFromRateCard(rate) || 'unknown'
        const key = `${providerKey}|${rate.type || 'unknown'}|${normalizeB2CShippingMode(rate.mode) || 'any'}`
        summary.set(key, (summary.get(key) || 0) + 1)
        return summary
      }, new Map<string, number>())
      const providerRateSummary = Array.from(providerRateSummaryMap.entries()).map(([key, count]) => {
        const [provider, type, mode] = key.split('|')
        return { provider, type, mode, count }
      })

      console.log('[Serviceability] B2C local rate context', {
        userId: userId || null,
        activePlanId: activePlanId || null,
        mode: isCalculator ? 'calculator' : 'standard',
        zoneKey,
        zoneId: zoneRow.id,
        zoneCode: zoneRow.code,
        zoneName: zoneRow.name,
        localRateCount: localRates.length,
        visibleRateProviders: Array.from(visibleRateProviders),
        providerRateSummary,
      })
    }

    // Registry of enabled providers (by serviceProvider string)
    const enabledProviders = new Set(Object.keys(systemCourierMap))
    const xpressbeesConfig = enabledProviders.has('xpressbees')
      ? await getEffectiveCourierConfig<XpressbeesConfig>('xpressbees', 'b2c')
      : null
    const xpressbeesCredentialsReady = hasUsableXpressbeesCredentials(xpressbeesConfig)

    if (enabledProviders.has('xpressbees') && !xpressbeesCredentialsReady) {
      console.warn('[Serviceability] Xpressbees rate-card visibility disabled until credentials are configured', {
        reason: 'missing_xpressbees_credentials',
      })
    }

    let amazonCredentialsForRates: Awaited<
      ReturnType<typeof getStoredAmazonShippingCredentials>
    > | null = null
    try {
      amazonCredentialsForRates = await getStoredAmazonShippingCredentials()
    } catch (err: any) {
      console.warn('[Serviceability] Amazon Shipping credential lookup failed:', err?.message || err)
    }

    const hasEnabledAmazonCourierForRates = () =>
      Boolean(providerCourierBuckets.get(AMAZON_PROVIDER_KEY)?.rows.length)
    const shouldRunAmazonRates =
      enabledProviders.has(AMAZON_PROVIDER_KEY) && hasEnabledAmazonCourierForRates()

    // 🔹 Start with an empty list of candidate couriers
    let combinedCouriers: any[] = []

    // 🟢 Delhivery Serviceability (called for both calculator and non-calculator flows)
    let delhiveryAvailable = false
    let delhiveryOriginServiceable = false
    let delhiveryDestinationServiceable = false
    let delhiveryEDD = '3-5 Days'
    let delhiveryResp: any = null
    const normalizedPaymentType = String(params.payment_type || 'prepaid')
      .trim()
      .toLowerCase()
    const delhiveryRequiresCOD = normalizedPaymentType === 'cod'
    const delhiveryHeavyProduct =
      String(params.product_type || params.productType || '')
        .trim()
        .toLowerCase() === 'heavy'

    if (shouldRunLiveServiceability && enabledProviders.has('delhivery')) {
      const delhivery = new DelhiveryService()
      const originPincode = normalizePincode(params.origin ?? params.source_pincode)?.toString()
      const destinationPincode = normalizePincode(
        params.destination ?? params.destination_pincode,
      )?.toString()

      console.log('[Serviceability] Delhivery pincode check start', {
        mode: isCalculator ? 'calculator' : 'standard',
        origin: originPincode,
        destination: destinationPincode,
      })

      if (originPincode && destinationPincode) {
        try {
          const [originResp, destinationResp] = await Promise.all(
            delhiveryHeavyProduct
              ? [
                  delhivery.checkHeavyServiceability(originPincode),
                  delhivery.checkHeavyServiceability(destinationPincode),
                ]
              : [
                  delhivery.checkServiceability(originPincode),
                  delhivery.checkServiceability(destinationPincode),
                ],
          )
          delhiveryResp = destinationResp

          const originService = delhiveryHeavyProduct
            ? summarizeDelhiveryHeavyPincodeServiceability(originResp)
            : summarizeDelhiveryPincodeServiceability(originResp)
          const destinationService = delhiveryHeavyProduct
            ? summarizeDelhiveryHeavyPincodeServiceability(destinationResp)
            : summarizeDelhiveryPincodeServiceability(destinationResp)

          delhiveryOriginServiceable = delhiveryHeavyProduct
            ? originService.serviceable
            : 'pickup' in originService && originService.pickup
          delhiveryDestinationServiceable = delhiveryRequiresCOD
            ? destinationService.cod
            : destinationService.prepaid

          console.log('[Serviceability] Delhivery pincode check result', {
            mode: isCalculator ? 'calculator' : 'standard',
            origin: originPincode,
            destination: destinationPincode,
            productType: delhiveryHeavyProduct ? 'Heavy' : 'B2C',
            paymentType: normalizedPaymentType,
            requiresCOD: delhiveryRequiresCOD,
            originAvailableRecords: delhiveryHeavyProduct
              ? Number(Boolean(originResp))
              : originResp?.delivery_codes?.length ?? 0,
            destinationAvailableRecords: delhiveryHeavyProduct
              ? Number(Boolean(destinationResp))
              : destinationResp?.delivery_codes?.length ?? 0,
            originPickup:
              'pickup' in originService ? originService.pickup : originService.serviceable,
            destinationPrePaid: destinationService.prepaid,
            destinationCod: destinationService.cod,
            destinationRemark:
              'remark' in destinationService
                ? destinationService.remark
                : destinationService.providerStatus,
          })

          delhiveryAvailable = delhiveryOriginServiceable && delhiveryDestinationServiceable

          if (delhiveryAvailable) {
            const tatResp = await delhivery.getExpectedTAT(
              originPincode,
              destinationPincode,
              'S',
              'B2C',
            )
            if (tatResp && Number.isFinite(Number(tatResp)) && Number(tatResp) > 0) {
              delhiveryEDD = `${Number(tatResp)} Days`
            }
            console.log('[Serviceability] Delhivery TAT evaluated', {
              mode: 'standard',
              origin: originPincode,
              destination: destinationPincode,
              tat: tatResp,
              edd: delhiveryEDD,
            })
          }
        } catch (err: any) {
          console.warn('[Serviceability] Delhivery pincode check unavailable:', {
            mode: isCalculator ? 'calculator' : 'standard',
            message: err?.response?.data || err?.message || err,
          })
        }
      } else {
        console.log('[Serviceability] Delhivery pincode validation skipped (missing input)', {
          mode: isCalculator ? 'calculator' : 'standard',
          origin: originPincode,
          destination: destinationPincode,
        })
      }
    }

    if (delhiveryAvailable) {
      const destinationSummary = delhiveryHeavyProduct
        ? summarizeDelhiveryHeavyPincodeServiceability(delhiveryResp)
        : summarizeDelhiveryPincodeServiceability(delhiveryResp)
      registerServiceableProvider('delhivery', {
        providerId: 'delhivery',
        providerName: 'Delhivery',
        codAvailable: destinationSummary.cod,
        prepaidAvailable: destinationSummary.prepaid,
        edd: delhiveryEDD,
        raw: delhiveryResp,
      })
    }

    console.log('[Serviceability] Delhivery candidate couriers prepared', {
      mode: isCalculator ? 'calculator' : 'standard',
      destination: params.destination?.toString(),
      available: delhiveryAvailable,
      originServiceable: delhiveryOriginServiceable,
      destinationServiceable: delhiveryDestinationServiceable,
      candidates: providerCourierBuckets.get('delhivery')?.rows.length ?? 0,
    })

    // 🟢 Ekart Serviceability V3
    let ekartAvailable = false
    let ekartResp: any = null
    let ekartEDD = '3-5 Days'
    if (shouldRunLiveServiceability && enabledProviders.has('ekart')) {
      const ekart = new EkartService()
      const originPincode = normalizePincode(params.origin ?? params.source_pincode)?.toString()
      const destinationPincode = normalizePincode(
        params.destination ?? params.destination_pincode,
      )?.toString()
      const orderAmountValue = Number(params.order_amount ?? params.orderAmount ?? 0)
      const serviceabilityInvoiceAmount = orderAmountValue > 0 ? orderAmountValue : 1

      if (orderAmountValue <= 0) {
        console.warn('⚠️ Ekart serviceability using minimal invoice amount for pincode check', {
          originPincode,
          destinationPincode,
          order_amount: params.order_amount ?? params.orderAmount ?? null,
          invoice_amount_used: serviceabilityInvoiceAmount,
        })
      }

      if (originPincode && destinationPincode) {
        try {
          ekartResp = await ekart.checkServiceability({
            pickupPincode: originPincode,
            dropPincode: destinationPincode,
            length: String(params.length ?? 0),
            height: String(params.height ?? 0),
            width: String(params.breadth ?? 0),
            weight: String(Number(params.weight ?? 0) / 1000), // grams → kg
            paymentType: params.payment_type === 'cod' ? 'COD' : 'Prepaid',
            invoiceAmount: String(serviceabilityInvoiceAmount),
            codAmount: params.payment_type === 'cod' ? String(serviceabilityInvoiceAmount) : undefined,
          })
          ekartAvailable = ekartResp.serviceable === true
          console.log('[Serviceability] Ekart response', {
            serviceable: ekartResp.serviceable,
            records: ekartResp.records?.length ?? null,
            availability: ekartResp.availability,
          })
          if (ekartResp?.tat) {
            ekartEDD = `${ekartResp.tat} Days`
          }
        } catch (err: any) {
          console.error(
            '❌ Ekart serviceability error:',
            err?.response?.data || err?.message || err,
          )
        }
      }
    }

    const getFirstNonEmptyString = (...values: Array<string | undefined | null>) => {
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim()
        }
      }
      return null
    }

    if (ekartAvailable) {
      const ekartProviderIdentifier =
        getFirstNonEmptyString(
          ekartResp?.availability?.service_type,
          ekartResp?.availability?.courier_id,
        ) ?? 'ekart'

      registerServiceableProvider('ekart', {
        providerId: ekartProviderIdentifier,
        providerName: 'Ekart Logistics',
        codAvailable: ekartResp?.codAvailable ?? true,
        prepaidAvailable: ekartResp?.prepaidAvailable ?? true,
        edd: ekartEDD,
        raw: ekartResp,
      })

      console.log('[Serviceability] Ekart candidate couriers prepared', {
        mode: isCalculator ? 'calculator' : 'standard',
        destination: params.destination?.toString(),
        available: ekartAvailable,
        providerId: ekartProviderIdentifier,
        records: ekartResp?.records?.length ?? 0,
        candidates: providerCourierBuckets.get('ekart')?.rows.length ?? 0,
      })
    }

    let xpressbeesAvailable = false
    let xpressbeesResp: any = null
    if (shouldRunLiveServiceability && enabledProviders.has('xpressbees') && xpressbeesCredentialsReady) {
      const xpressbees = new XpressbeesService()
      const originPincode = normalizePincode(params.origin ?? params.source_pincode)?.toString()
      const destinationPincode = normalizePincode(
        params.destination ?? params.destination_pincode,
      )?.toString()
      const orderAmountValue = Number(params.order_amount ?? params.orderAmount ?? 0)
      const serviceabilityOrderAmount = orderAmountValue > 0 ? orderAmountValue : 1

      if (originPincode && destinationPincode) {
        try {
          if (orderAmountValue <= 0) {
            console.warn('⚠️ Xpressbees serviceability using minimal order amount for pincode check', {
              origin: originPincode,
              destination: destinationPincode,
              order_amount_used: serviceabilityOrderAmount,
            })
          }
          xpressbeesResp = await xpressbees.checkServiceability({
            origin: originPincode,
            destination: destinationPincode,
            payment_type: params.payment_type === 'cod' ? 'cod' : 'prepaid',
            order_amount: String(serviceabilityOrderAmount),
            weight: String(Number(params.weight ?? 0)),
            length: String(Number(params.length ?? 0)),
            breadth: String(Number(params.breadth ?? 0)),
            height: String(Number(params.height ?? 0)),
          })
          xpressbeesAvailable = xpressbeesResp.serviceable === true
          console.log('[Serviceability] Xpressbees response', {
            serviceable: xpressbeesResp.serviceable,
            records: xpressbeesResp.records?.length ?? 0,
          })
        } catch (err: any) {
          const liveServiceabilityError = err?.response?.data || err?.message || err
          const logFn = localRateProviders.has('xpressbees')
            ? console.warn.bind(console)
            : console.error.bind(console)
          logFn('[Serviceability] Xpressbees live serviceability unavailable', {
            message: liveServiceabilityError,
            fallback:
              localRateProviders.has('xpressbees') && effectiveShipmentType === 'b2c'
                ? 'local_rate_card'
                : null,
          })
        }
      }
    }

    let shadowfaxAvailable = false
    let shadowfaxResp: any = null
    let shadowfaxEDD = '3-5 Days'
    if (shouldRunLiveServiceability && enabledProviders.has('shadowfax')) {
      const shadowfax = new ShadowfaxService()
      const originPincode = normalizePincode(params.origin ?? params.source_pincode)?.toString()
      const destinationPincode = normalizePincode(
        params.destination ?? params.destination_pincode,
      )?.toString()

      if (originPincode && destinationPincode) {
        try {
          const isReverseShipment = isShadowfaxReverseShipment(params)
          shadowfaxResp = isReverseShipment
            ? await shadowfax.checkReverseServiceability({
                origin: originPincode,
                destination: destinationPincode,
              })
            : await shadowfax.checkForwardServiceability({
                origin: originPincode,
                destination: destinationPincode,
                paymentType: params.payment_type,
                mode: shadowfaxRequestedMode,
                service: shadowfaxRequestedService,
              })

          shadowfaxAvailable = shadowfaxResp.serviceable === true
          if (shadowfaxResp?.tat && Number(shadowfaxResp.tat) > 0) {
            shadowfaxEDD = `${Number(shadowfaxResp.tat)} Days`
          }
          console.log('[Serviceability] Shadowfax response', {
            serviceable: shadowfaxResp.serviceable,
            services: shadowfaxResp.services,
            mode: shadowfaxResp?.mode || shadowfaxRequestedMode,
            requestedService: shadowfaxRequestedService,
            service: shadowfaxResp?.service || shadowfaxRequestedService,
          })
        } catch (err: any) {
          console.error(
            '❌ Shadowfax serviceability error:',
            err?.response?.data || err?.message || err,
          )
        }
      }
    }

    if (shadowfaxAvailable) {
      registerServiceableProvider('shadowfax', {
        providerId: 'shadowfax',
        providerName: 'Shadowfax',
        codAvailable: shadowfaxResp?.codAvailable ?? true,
        prepaidAvailable: shadowfaxResp?.prepaidAvailable ?? true,
        edd: shadowfaxEDD,
        raw: shadowfaxResp,
      })

      console.log('[Serviceability] Shadowfax candidate couriers prepared', {
        mode: isCalculator ? 'calculator' : 'standard',
        destination: params.destination?.toString(),
        available: shadowfaxAvailable,
        services: shadowfaxResp?.services ?? [],
        candidates: providerCourierBuckets.get('shadowfax')?.rows.length ?? 0,
      })
    }

    let innofulfillAvailable = false
    let innofulfillResp: any = null
    if (shouldRunLiveServiceability && enabledProviders.has('innofulfill')) {
      const innofulfill = new InnofulfillService()
      const originPincode = normalizePincode(params.origin ?? params.source_pincode)?.toString()
      const destinationPincode = normalizePincode(
        params.destination ?? params.destination_pincode,
      )?.toString()

      if (originPincode && destinationPincode) {
        try {
          innofulfillResp = await innofulfill.checkEcommServiceability({
            fromPincode: originPincode,
            toPincode: destinationPincode,
            paymentMode: params.payment_type === 'cod' ? 'COD' : 'PREPAID',
          })
          innofulfillAvailable = innofulfillResp.serviceable === true
          console.log('[Serviceability] Innofulfill response', {
            serviceable: innofulfillResp.serviceable,
            codAvailable: innofulfillResp.codAvailable,
            prepaidAvailable: innofulfillResp.prepaidAvailable,
          })
        } catch (err: any) {
          const liveServiceabilityError = err?.response?.data || err?.message || err
          console.error('[Serviceability] Innofulfill live serviceability unavailable', {
            message: liveServiceabilityError,
            fallback: null,
          })
        }
      }
    }

    if (innofulfillAvailable) {
      registerServiceableProvider('innofulfill', {
        providerId: 'innofulfill',
        providerName: 'Innofulfill',
        codAvailable: innofulfillResp?.codAvailable ?? true,
        prepaidAvailable: innofulfillResp?.prepaidAvailable ?? true,
        edd: innofulfillResp?.tat ? `${innofulfillResp.tat} Days` : '3-5 Days',
        raw: innofulfillResp?.raw ?? innofulfillResp,
      })

      console.log('[Serviceability] Innofulfill candidate couriers prepared', {
        mode: isCalculator ? 'calculator' : 'standard',
        destination: params.destination?.toString(),
        available: innofulfillAvailable,
        candidates: providerCourierBuckets.get('innofulfill')?.rows.length ?? 0,
      })
    }

    const getShadowfaxBookingBlockReason = (resp: any) => {
      if (!resp || resp.serviceable !== false) return null

      const attempts = Array.isArray(resp?.raw?.attempts) ? resp.raw.attempts : []
      const originUnavailable = attempts.some((attempt: any) => attempt?.originAvailable === false)
      const destinationUnavailable = attempts.some(
        (attempt: any) => attempt?.destinationAvailable === false,
      )
      const codUnavailable =
        normalizedPaymentType === 'cod' &&
        attempts.some((attempt: any) => attempt?.destinationCodAvailable === false)

      if (originUnavailable) {
        return 'Shadowfax pickup is not live-serviceable for this pickup pincode.'
      }

      if (destinationUnavailable) {
        return 'Shadowfax delivery is not live-serviceable for this destination pincode.'
      }

      if (codUnavailable) {
        return 'Shadowfax COD is not live-serviceable for this destination pincode.'
      }

      return 'Shadowfax live serviceability failed for this pickup and delivery combination.'
    }

    let amazonRateResponseData: any = null
    let amazonRates: any[] = []
    let amazonRatesRequestBody: any = null
    let amazonRatesUnavailableReason: string | null = null
    let amazonRatesUnavailableDetails: any = null
    if (shouldRunAmazonRates) {
      try {
        console.log('[Serviceability] Amazon Shipping rates check start', {
          mode: isCalculator ? 'calculator' : 'standard',
          origin: params.origin?.toString(),
          destination: params.destination?.toString(),
          pickupId: params.pickupId || null,
        })

        amazonRatesRequestBody = await buildAmazonShippingRatesRequest(params, userId)
        const amazonCredentials =
          amazonCredentialsForRates || (await getStoredAmazonShippingCredentials())
        applyAmazonShippingCredentialsToEnv(amazonCredentials)
        const configuredServiceabilityAttempts = Number(
          process.env.AMAZON_SHIPPING_SERVICEABILITY_RATES_ATTEMPTS,
        )
        const configuredServiceabilityTimeoutMs = Number(
          process.env.AMAZON_SHIPPING_SERVICEABILITY_RATES_TIMEOUT_MS,
        )
        const amazonRateResult = await getAmazonShippingRates(
          amazonRatesRequestBody,
          amazonCredentials,
          {
            maxAttempts:
              Number.isFinite(configuredServiceabilityAttempts) &&
              configuredServiceabilityAttempts > 0
                ? Math.min(Math.floor(configuredServiceabilityAttempts), 3)
                : 2,
            timeoutMs:
              Number.isFinite(configuredServiceabilityTimeoutMs) &&
              configuredServiceabilityTimeoutMs > 0
                ? Math.floor(configuredServiceabilityTimeoutMs)
                : 6000,
          },
        )
        amazonRateResponseData = amazonRateResult.data
        amazonRates = getEligibleAmazonRates(getAmazonRatesFromResponse(amazonRateResponseData))

        console.log('[Serviceability] Amazon Shipping rates response', {
          available: amazonRates.length > 0,
          rateCount: amazonRates.length,
          requestId: amazonRateResult.amazon?.requestId || null,
          rateLimit: amazonRateResult.amazon?.rateLimit || null,
          candidates: providerCourierBuckets.get('amazon')?.rows.length ?? 0,
        })

        if (amazonRates.length > 0 && hasEnabledAmazonCourierForRates()) {
          const firstRate = amazonRates[0]
          registerServiceableProvider('amazon', {
            providerId: trimText(firstRate?.carrierId || firstRate?.serviceId || 'amazon'),
            providerName: trimText(firstRate?.carrierName || 'Amazon Shipping'),
            codAvailable: normalizedPaymentType === 'cod',
            prepaidAvailable: true,
            edd: getAmazonRateEdd(firstRate),
            raw: {
              requestToken: getAmazonRequestTokenFromResponse(amazonRateResponseData),
              rates: amazonRates,
              requestBody: amazonRatesRequestBody,
            },
          })
        } else {
          amazonRatesUnavailableReason = 'no_eligible_live_rates'
          amazonRatesUnavailableDetails = {
            rateCount: amazonRates.length,
            requestId: amazonRateResult.amazon?.requestId || null,
            rateLimit: amazonRateResult.amazon?.rateLimit || null,
          }
        }
      } catch (err: any) {
        const providerInternalInputError = getAmazonProviderInternalInputError(err)
        amazonRatesUnavailableReason = providerInternalInputError
          ? 'provider_s900'
          : 'rate_fetch_failed'
        amazonRatesUnavailableDetails = {
          message: err?.message || err,
          statusCode: err?.statusCode || err?.response?.status || null,
          amazon: err?.details || null,
          providerInternalInputError,
        }
        const logFn = providerInternalInputError ? console.warn.bind(console) : console.error.bind(console)
        logFn('[Serviceability] Amazon Shipping rates unavailable:', {
          message: amazonRatesUnavailableDetails.message,
          statusCode: amazonRatesUnavailableDetails.statusCode,
          amazon: amazonRatesUnavailableDetails.amazon,
          providerInternalInputError,
          action: providerInternalInputError
            ? 'Falling back to local Amazon rate card visibility; shipment purchase will refresh the live rate token.'
            : 'Falling back to local Amazon rate card visibility when configured.',
        })
      }
    }

    if (
      shouldRunAmazonRates &&
      effectiveShipmentType === 'b2c' &&
      !serviceableProviders.has(AMAZON_PROVIDER_KEY) &&
      hasEnabledAmazonCourierForRates() &&
      localRates.length &&
      localRateProviders.has(AMAZON_PROVIDER_KEY)
    ) {
      const amazonProviderRateCards = localRates.filter(
        (rate) =>
          inferProviderFromRateCard(rate) === AMAZON_PROVIDER_KEY &&
          isSupportedB2CProviderCourier(AMAZON_PROVIDER_KEY, {
            id: rate.courier_id,
            name: rate.courier_name,
            mode: rate.mode,
          }),
      )

      if (amazonProviderRateCards.length) {
        registerServiceableProvider(AMAZON_PROVIDER_KEY, {
          providerId: AMAZON_PROVIDER_KEY,
          providerName: 'Amazon Shipping',
          codAvailable: normalizedPaymentType === 'cod',
          prepaidAvailable: true,
          edd: '3-5 Days',
          raw: {
            fallback: true,
            reason: 'amazon_live_rate_unavailable',
            rateUnavailableReason: amazonRatesUnavailableReason || 'not_called',
            rateUnavailableDetails: amazonRatesUnavailableDetails,
            requestBody: amazonRatesRequestBody,
            rateCardCount: amazonProviderRateCards.length,
            liveRateAvailable: false,
            requiresLiveRateRefresh: true,
            mayRefreshLiveRateOnBooking: !isCalculator,
          },
        })

        console.warn('[Serviceability] Showing Amazon via local rate-card fallback', {
          mode: isCalculator ? 'calculator' : 'standard',
          reason: amazonRatesUnavailableReason || 'not_called',
          rateCardCount: amazonProviderRateCards.length,
          candidates: providerCourierBuckets.get(AMAZON_PROVIDER_KEY)?.rows.length ?? 0,
        })
      }
    }

    if (xpressbeesAvailable) {
      registerServiceableProvider('xpressbees', {
        providerId: 'xpressbees',
        providerName: 'Xpressbees',
        codAvailable: xpressbeesResp?.codAvailable ?? true,
        prepaidAvailable: xpressbeesResp?.prepaidAvailable ?? true,
        edd: '3-5 Days',
        raw: xpressbeesResp,
      })

      console.log('[Serviceability] Xpressbees candidate couriers prepared', {
        mode: isCalculator ? 'calculator' : 'standard',
        destination: params.destination?.toString(),
        available: xpressbeesAvailable,
        records: xpressbeesResp?.records?.length ?? 0,
        candidates: providerCourierBuckets.get('xpressbees')?.rows.length ?? 0,
      })
    }

    const providerDisplayNames: Record<string, string> = {
      delhivery: 'Delhivery',
      ekart: 'Ekart Logistics',
      xpressbees: 'Xpressbees',
      shadowfax: 'Shadowfax',
      amazon: 'Amazon Shipping',
      innofulfill: 'Innofulfill',
    }

    const fallbackProviderDetails: Array<{
      providerKey: string
      candidates: number
      rateCardCount: number
    }> = []

    if (effectiveShipmentType === 'b2c' && localRates.length) {
      for (const [providerKey, bucket] of providerCourierBuckets.entries()) {
        if (serviceableProviders.has(providerKey) || !bucket.rows.length) continue
        if (!localRateProviders.has(providerKey)) continue
        if (providerKey === AMAZON_PROVIDER_KEY) continue
        if (providerKey === 'innofulfill') continue
        if (providerKey === 'xpressbees' && !xpressbeesCredentialsReady) continue

        // If Shadowfax definitively rejects the lane, do not expose a local
        // rate-card fallback that cannot be booked.
        const shadowfaxBookingBlockReason =
          providerKey === 'shadowfax' ? getShadowfaxBookingBlockReason(shadowfaxResp) : null
        if (shadowfaxBookingBlockReason) continue

        const providerRateCards = localRates.filter(
          (rate) =>
            inferProviderFromRateCard(rate) === providerKey &&
            isSupportedB2CProviderCourier(providerKey, {
              id: rate.courier_id,
              name: rate.courier_name,
              mode: rate.mode,
            }),
        )
        if (!providerRateCards.length) continue

        registerServiceableProvider(providerKey, {
          providerId: providerKey,
          providerName: providerDisplayNames[providerKey] || providerKey,
          codAvailable: true,
          prepaidAvailable: true,
          edd: '3-5 Days',
          raw: {
            fallback: true,
            reason: 'local_rate_card',
            zone: approxZone,
            rateCardCount: providerRateCards.length,
          },
        })
        fallbackProviderDetails.push({
          providerKey,
          candidates: bucket.rows.length,
          rateCardCount: providerRateCards.length,
        })
      }
    }

    if (fallbackProviderDetails.length) {
      console.warn('[Serviceability] Using local rate-card fallback providers', {
        mode: isCalculator ? 'calculator' : 'standard',
        providers: fallbackProviderDetails,
      })
    }

    for (const [providerKey, bucket] of providerCourierBuckets.entries()) {
      const providerMeta = serviceableProviders.get(providerKey)
      if (!providerMeta) continue
      const providerRows =
        providerKey === 'shadowfax'
          ? (() => {
              const selectedMode = shadowfaxResp?.mode || shadowfaxRequestedMode
              const modeMatchedRows = bucket.rows.filter((courier) =>
                shadowfaxCourierMatchesMode(courier.name, selectedMode),
              )
              if (modeMatchedRows.length || !bucket.rows.length) return modeMatchedRows

              console.log('[Serviceability] Shadowfax mode/name fallback', {
                selectedMode,
                availableCourierNames: bucket.rows.map((courier) => courier.name),
              })
              return bucket.rows
            })()
          : bucket.rows

      for (const courier of providerRows) {
        const xpressbeesUsesRouteServiceability =
          providerKey === 'xpressbees' &&
          (xpressbeesResp?.mode === 'xbees_pincode_master' || providerMeta.raw?.fallback === true)
        const xpressbeesRecord =
          providerKey === 'xpressbees'
            ? xpressbeesResp?.records?.find(
                (record: any) => String(record?.id || '').trim() === String(courier.id).trim(),
              ) ||
              (xpressbeesUsesRouteServiceability
                ? {
                    id: courier.id,
                    name: courier.name,
                    serviceability_mode:
                      providerMeta.raw?.fallback === true
                        ? 'local_rate_card_fallback'
                        : 'xbees_pincode_master',
                    chargeable_weight: Number(params.weight ?? 0) || null,
                    raw: xpressbeesResp?.raw ?? providerMeta.raw ?? null,
                  }
                : null)
            : null
        const shadowfaxRecord =
          providerKey === 'shadowfax'
            ? {
                ...(shadowfaxResp || {}),
                ...(providerMeta.raw?.fallback === true ? providerMeta.raw : {}),
                mode: shadowfaxResp?.mode || providerMeta.raw?.mode || shadowfaxRequestedMode,
                shipping_mode:
                  normalizeB2CShippingMode(params.shadowfax_service_mode) ||
                  shadowfaxRequestedService,
                service_mode:
                  normalizeShadowfaxServiceModeValue(
                    shadowfaxResp?.service || providerMeta.raw?.service_mode,
                    shadowfaxRequestedService,
                  ),
              }
            : null
        const amazonRate =
          providerKey === 'amazon' ? pickAmazonRateForCourier(amazonRates, courier.name) : null
        const cachedAmazonFallbackRate =
          providerKey === 'amazon' && providerMeta.raw?.fallback === true
            ? await getCachedAmazonRateToken({ ...params, courier_id: courier.id }, userId)
            : null
        const amazonFallbackRecord =
          providerKey === 'amazon' && providerMeta.raw?.fallback === true
            ? {
                ...providerMeta.raw,
                requestToken: cachedAmazonFallbackRate?.requestToken ?? null,
                rateId: cachedAmazonFallbackRate?.rateId ?? null,
                carrierId: cachedAmazonFallbackRate?.carrierId ?? null,
                carrierName:
                  cachedAmazonFallbackRate?.carrierName ||
                  providerMeta.providerName ||
                  'Amazon Shipping',
                serviceId: cachedAmazonFallbackRate?.serviceId ?? null,
                serviceName: cachedAmazonFallbackRate?.serviceName ?? null,
                charge: null,
                edd: cachedAmazonFallbackRate?.rawRate
                  ? getAmazonRateEdd(cachedAmazonFallbackRate.rawRate)
                  : providerMeta.edd,
                liveRateAvailable: false,
                persistedRateTokenAvailable: Boolean(cachedAmazonFallbackRate),
                requiresLiveRateRefresh: !cachedAmazonFallbackRate,
                rawRate: cachedAmazonFallbackRate?.rawRate ?? null,
              }
            : null
        const amazonRecord =
          providerKey === 'amazon' && amazonRate
            ? buildAmazonProviderPayload(amazonRateResponseData, amazonRate)
            : amazonFallbackRecord
        if (providerKey === 'xpressbees' && !xpressbeesRecord) {
          continue
        }
        if (providerKey === 'amazon' && !amazonRecord) {
          continue
        }
        const amazonUsesLocalRateFallback =
          providerKey === 'amazon' && amazonRecord?.fallback === true
        if (
          providerKey === 'amazon' &&
          !amazonUsesLocalRateFallback &&
          (!amazonRecord?.requestToken || !amazonRecord?.rateId)
        ) {
          console.warn('[Serviceability] Skipping Amazon courier without live rate token', {
            courier_id: courier.id,
            courier_name: courier.name,
            hasRequestToken: Boolean(amazonRecord?.requestToken),
            hasRateId: Boolean(amazonRecord?.rateId),
          })
          continue
        }
        if (providerKey === 'amazon' && !amazonUsesLocalRateFallback) {
          await rememberAmazonRateToken({
            params,
            userId,
            courierId: courier.id,
            amazonRecord,
          })
        }
        const bookingAvailable = providerMeta.raw?.booking_available !== false
        providerMeta.matchedCourierIds.add(Number(courier.id))
        const delhiveryShippingMode =
          providerKey === 'delhivery'
            ? resolveDelhiveryShippingMode({
                courierId: courier.id,
                mode: courier.shippingMode,
                courierName: courier.name,
              })
            : null
        const courierDisplayName =
          providerKey === 'delhivery' && delhiveryShippingMode
            ? getDelhiveryCourierDisplayName(delhiveryShippingMode)
            : courier.name
        combinedCouriers.push({
          id: courier.id,
          name: courierDisplayName,
          integration_type: providerKey,
          serviceProvider: courier.serviceProvider ?? providerKey,
          isVirtualProvider: courier.isVirtualProvider === true,
          isRateCardBackedB2C: courier.isRateCardBackedB2C === true,
          cod: providerMeta.codAvailable,
          prepaid: providerMeta.prepaidAvailable,
          edd: providerMeta.edd,
          approxZone: null,
          booking_available: bookingAvailable,
          can_book: bookingAvailable,
          booking_blocked_reason: providerMeta.raw?.booking_blocked_reason ?? null,
          createdAt: courier.createdAt,
          shipping_mode: delhiveryShippingMode,
          service_mode: delhiveryShippingMode,
          courier_cost_estimate:
            amazonRecord?.charge ??
            xpressbeesRecord?.total_charges ??
            xpressbeesRecord?.freight_charges ??
            shadowfaxRecord?.rate ??
            null,
          freight_charges:
            amazonRecord?.charge ?? xpressbeesRecord?.freight_charges ?? shadowfaxRecord?.rate ?? null,
          cod_charges: xpressbeesRecord?.cod_charges ?? null,
          total_charges:
            amazonRecord?.charge ?? xpressbeesRecord?.total_charges ?? shadowfaxRecord?.rate ?? null,
          chargeable_weight:
            xpressbeesRecord?.chargeable_weight ?? Number(params.weight ?? 0) ?? null,
          provider_serviceability: xpressbeesRecord ?? shadowfaxRecord ?? amazonRecord ?? null,
          amazon_request_token: amazonRecord?.requestToken ?? null,
          amazon_rate_id: amazonRecord?.rateId ?? null,
          amazon_service_id: amazonRecord?.serviceId ?? null,
          amazon_carrier_id: amazonRecord?.carrierId ?? null,
        })
      }
    }

    const providerMappings = Array.from(serviceableProviders.values()).map((meta) => ({
      providerId: meta.providerId,
      providerKey: meta.providerKey,
      matchedCourierIds: Array.from(meta.matchedCourierIds),
    }))
    if (providerMappings.length) {
      console.log('[Serviceability] Provider-to-courier mapping', { providerMappings })
      const unmatchedProviders = providerMappings.filter(
        (mapping) => mapping.matchedCourierIds.length === 0,
      )
      if (unmatchedProviders.length) {
        console.warn('[Serviceability] Serviceable providers missing DB configuration', {
          unmatchedProviders,
        })
      }
    }

    // Delhivery-only mode: no non-Delhivery live serviceability checks.

    // 🔹 Calculate chargeable weight if dimensions are provided
    const serviceabilityWeightG = normalizeServiceabilityWeightToGrams(params.weight)
    let chargeableWeight: number | null = null
    if (
      params.length &&
      params.breadth &&
      params.height &&
      params.length > 0 &&
      params.breadth > 0 &&
      params.height > 0
    ) {
      try {
        const weightCalc = calculateOrderWeights({
          actualWeight: serviceabilityWeightG > 0 ? serviceabilityWeightG / 1000 : undefined,
          dimensions: {
            length: params.length,
            breadth: params.breadth,
            height: params.height,
          },
        })
        chargeableWeight = Math.round(weightCalc.chargedWeight * 1000) // Convert back to grams and round
        console.log('✅ Calculated chargeable weight:', {
          actualWeight: serviceabilityWeightG,
          dimensions: { length: params.length, breadth: params.breadth, height: params.height },
          chargeableWeight,
          volumetricWeight: weightCalc.volumetricWeight * 1000,
        })
      } catch (error) {
        console.error('❌ Error calculating chargeable weight:', error)
      }
    } else {
      console.log('⚠️ Skipping chargeable weight calculation - missing dimensions:', {
        length: params.length,
        breadth: params.breadth,
        height: params.height,
      })
    }

    // 🔹 Merge local rates with couriers
    // Match couriers with local rates by courier_id
    // Include ALL couriers (even if they don't have local rates) - they have service provider response data
    const isReverseShipment = params.isReverse === true || params.payment_type === 'reverse'

    const shouldIncludeCodCharges = params.payment_type === 'cod'

    const buildServiceabilityRateOptions = (rateCard: any) => {
      const computed = computeB2CRateCardCharge({
        actual_weight_g: serviceabilityWeightG,
        length_cm: Number(params.length ?? 0),
        width_cm: Number(params.breadth ?? 0),
        height_cm: Number(params.height ?? 0),
        rateCard,
      })
      const effectiveCodCharge = shouldIncludeCodCharges
        ? computeEffectiveB2CCodCharge({
            cod_charges: rateCard.cod_charges,
            cod_percent: rateCard.cod_percent,
            order_amount: Number(params.order_amount ?? 0),
          })
        : 0

      return computed.freight > 0
        ? [
            {
              rate: computed.freight,
              cod_charges: effectiveCodCharge,
              cod_percent: shouldIncludeCodCharges ? rateCard.cod_percent : 0,
              other_charges: rateCard.other_charges,
              shipping_rate_id: rateCard.shippingRateId,
              mode: rateCard.mode,
              min_weight: rateCard.min_weight,
              slabs: rateCard.slabs,
              zone_id: rateCard.zone_id,
              zone: approxZone?.name || approxZone?.code || null,
              zone_code: approxZone?.code || null,
              zone_name: approxZone?.name || null,
              selected_slab: computed.selected_slab,
              slab_weight: computed.slab_weight,
              chargeable_weight: computed.chargeable_weight,
              volumetric_weight: computed.volumetric_weight,
              slab_count: computed.slabs,
              max_slab_weight: computed.max_slab_weight,
              matched_by: computed.matched_by,
            },
          ]
        : []
    }

    let combined = combinedCouriers
      ?.flatMap((courier: any) => {
        const providerKey = String(courier.integration_type || courier.service_provider || '')
          .toLowerCase()
          .trim()
        const delhiveryShippingMode =
          providerKey === 'delhivery'
            ? resolveDelhiveryShippingMode({
                courierId: courier?.id,
                mode:
                  courier?.shipping_mode ??
                  courier?.service_mode ??
                  courier?.provider_serviceability?.shipping_mode ??
                  courier?.provider_serviceability?.service_mode ??
                  courier?.provider_serviceability?.mode ??
                  courier?.mode ??
                  courier?.shippingMode,
                courierName: courier?.name,
              })
            : null
        const courierDisplayName =
          providerKey === 'delhivery' && delhiveryShippingMode
            ? getDelhiveryCourierDisplayName(delhiveryShippingMode)
            : courier.name
        const providerMode =
          (providerKey === 'shadowfax'
            ? normalizeB2CShippingMode(
                courier?.shipping_mode ??
                  courier?.service_mode ??
                  courier?.provider_serviceability?.shipping_mode ??
                  courier?.provider_serviceability?.service_mode,
              )
            : normalizeB2CShippingMode(
                courier?.shipping_mode ??
                  courier?.service_mode ??
                  courier?.provider_serviceability?.shipping_mode ??
                  courier?.provider_serviceability?.service_mode ??
                  courier?.provider_serviceability?.mode ??
                  courier?.mode,
              )) ||
          (providerKey === 'delhivery'
            ? normalizeB2CShippingMode(delhiveryShippingMode)
            : '')
        // Find local rates for this courier
        const courierRates = localRates.filter(
          (r) =>
            r.courier_id.toString() === courier.id.toString() &&
            (!providerKey ||
              !r.service_provider ||
              String(r.service_provider).toLowerCase().trim() === providerKey),
        )

        const preferredRateTypes = Array.from(getPreferredB2CRateTypes(isReverseShipment))
        const preferredRateTypeSet = new Set<string>(preferredRateTypes)
        const matchedCourierRates = providerMode
          ? courierRates.filter((r) => normalizeB2CShippingMode(r.mode) === providerMode)
          : courierRates
        const blankModeCourierRates = courierRates.filter((r) => !normalizeB2CShippingMode(r.mode))
        const shadowfaxRequestedRateMode =
          providerKey === 'shadowfax'
            ? normalizeB2CShippingMode(
                (params as any).shadowfax_service_mode || shadowfaxRequestedService,
              )
            : ''
        const shadowfaxRequestedModeRates =
          providerKey === 'shadowfax' && shadowfaxRequestedRateMode
            ? courierRates.filter(
                (r) => normalizeB2CShippingMode(r.mode) === shadowfaxRequestedRateMode,
              )
            : []
        const rawEffectiveCourierRates =
          providerKey === 'shadowfax'
            ? matchedCourierRates.length
              ? matchedCourierRates
              : shadowfaxRequestedModeRates.length
                ? shadowfaxRequestedModeRates
                : blankModeCourierRates.length
                  ? blankModeCourierRates
                  : courierRates
            : providerMode
              ? matchedCourierRates.length
                ? matchedCourierRates
                : blankModeCourierRates
              : courierRates
        const effectiveCourierRates = mergeResolvedB2CRateCards(rawEffectiveCourierRates, {
          serviceProvider: providerKey,
        })

        if (providerKey === 'shadowfax' && !isCalculator) {
          console.log('[Serviceability] Shadowfax local rate resolution', {
            courierId: courier.id,
            courierName: courier.name,
            providerMode,
            preferredRateTypes,
            localRateCount: localRates.length,
            courierRateCount: courierRates.length,
            matchedCourierRateCount: matchedCourierRates.length,
            blankModeCourierRateCount: blankModeCourierRates.length,
            shadowfaxRequestedRateMode,
            shadowfaxRequestedModeRateCount: shadowfaxRequestedModeRates.length,
            rawEffectiveCourierRateCount: rawEffectiveCourierRates.length,
            effectiveCourierRateCount: effectiveCourierRates.length,
            courierRateModes: courierRates.map((r) => r.mode),
            selectedRateModes: rawEffectiveCourierRates.map((r) => r.mode),
          })
        }

        // Build localRates object from matching rates
        // Compute slabbed freight if we have a matching rate
        const applicableRateCards = effectiveCourierRates.filter((r) =>
          preferredRateTypeSet.has(r.type),
        )
        const applicableRateOptions = applicableRateCards.flatMap((r) =>
          buildServiceabilityRateOptions(r),
        )

        if (!applicableRateOptions.length) {
          return [
            {
              ...courier,
              name: courierDisplayName,
              displayName: courierDisplayName,
              localRates: {},
              approxZone,
              zone: approxZone?.name || approxZone?.code || null,
              zone_id: approxZone?.id || null,
              zone_code: approxZone?.code || null,
              zone_name: approxZone?.name || null,
              courier_cost_estimate:
                courier?.courier_cost_estimate ||
                courier?.rateEstimate ||
                courier?.freight_charges ||
                courier?.charge ||
                courier?.cost ||
                null,
              chargeable_weight: chargeableWeight,
              volumetric_weight: null,
              slabs: null,
              rate: courier.rate,
              max_slab_weight: null,
              rate_card_fallback: null,
            },
          ]
        }

        return applicableRateOptions.map((applicableRate: any) => {
          const rateCardFreight = Number(applicableRate.rate ?? 0)
          const rateCardCod = shouldIncludeCodCharges
            ? Number(applicableRate.cod_charges ?? 0)
            : 0
          const rateCardOther = Number(applicableRate.other_charges ?? 0)
          const rateCardTotal = rateCardFreight + rateCardCod + rateCardOther
          const responseRate = {
            ...applicableRate,
            rate: rateCardFreight,
            cod_charges: rateCardCod,
            other_charges: rateCardOther,
            total_charges: rateCardTotal,
          }
          const courierOptionName =
            applicableRate.matched_by !== 'legacy'
              ? formatCourierOptionName(courierDisplayName, applicableRate.max_slab_weight)
              : courierDisplayName

          return {
            ...courier,
            courier_option_key: makeCourierIdentityKey({
              id: courier.id,
              integration_type: courier.integration_type || courier.service_provider || null,
              serviceProvider: courier.serviceProvider || null,
              rate_card_id: applicableRate.shipping_rate_id ?? null,
              max_slab_weight: applicableRate.max_slab_weight ?? null,
            }),
            rate_card_id: applicableRate.shipping_rate_id ?? null,
            name: courierOptionName,
            displayName: courierOptionName,
            localRates: { [applicableRate.type || 'forward']: responseRate },
            approxZone,
            zone: approxZone?.name || approxZone?.code || null,
            zone_id: approxZone?.id || null,
            zone_code: approxZone?.code || null,
            zone_name: approxZone?.name || null,
            shipping_mode:
              providerKey === 'shadowfax'
                ? applicableRate.mode || courier?.provider_serviceability?.shipping_mode || null
                : providerKey === 'delhivery'
                  ? delhiveryShippingMode || applicableRate.mode || courier.shipping_mode || null
                  : courier.shipping_mode,
            service_mode:
              providerKey === 'shadowfax'
                ? courier?.provider_serviceability?.service_mode || applicableRate.mode || null
                : providerKey === 'delhivery'
                  ? delhiveryShippingMode || applicableRate.mode || courier.service_mode || null
                  : courier.service_mode,
            provider_serviceability:
              providerKey === 'shadowfax'
                ? {
                    ...(courier.provider_serviceability || {}),
                    shipping_mode:
                      applicableRate.mode || courier?.provider_serviceability?.shipping_mode || null,
                    service_mode:
                      courier?.provider_serviceability?.service_mode || applicableRate.mode || null,
                  }
                : providerKey === 'delhivery'
                  ? {
                      ...(courier.provider_serviceability || {}),
                      shipping_mode:
                        delhiveryShippingMode || applicableRate.mode || courier.shipping_mode || null,
                      service_mode:
                        delhiveryShippingMode || applicableRate.mode || courier.service_mode || null,
                    }
                  : courier.provider_serviceability,
            courier_cost_estimate: rateCardTotal,
            freight_charges: rateCardFreight,
            cod_charges: rateCardCod,
            other_charges: rateCardOther,
            total_charges: rateCardTotal,
            chargeable_weight: applicableRate.chargeable_weight ?? chargeableWeight,
            volumetric_weight: applicableRate.volumetric_weight,
            slabs: applicableRate.slab_count,
            rate: rateCardFreight,
            max_slab_weight: applicableRate.max_slab_weight ?? null,
            rate_card_fallback: null,
          }
        })
      })
      // Only filter out null/undefined, not couriers without local rates
      .filter((c) => c !== null && c !== undefined)

    const requireLocalRates = effectiveShipmentType === 'b2c'
    combined = combined.filter((c: any) => {
      const providerKey = (c.integration_type || '').toLowerCase()
      const inSystem = isCourierInSystem(providerKey, c.id)
      const localRatesAvailable =
        !requireLocalRates || Boolean(getActiveB2CLocalRateForShipment(c, isReverseShipment))

      if (!inSystem || !localRatesAvailable) {
        console.log('🚫 Removing courier from final list', {
          courierId: c.id,
          providerKey,
          inSystem,
          localRatesAvailable,
        })
      }

      return inSystem && localRatesAvailable
    })

    // ✅ Final filter: Ensure all couriers have correct business_type
    combined = await filterCouriersByBusinessType(combined, 'b2c')

    if (effectiveShipmentType === 'b2c') {
      const bestByProvider = new Map<string, any>()
      const passthrough: any[] = []

      for (const courier of combined) {
        const providerKey = String(courier?.integration_type || courier?.serviceProvider || '')
          .toLowerCase()
          .trim()

        if (providerKey !== 'innofulfill') {
          passthrough.push(courier)
          continue
        }

        const activeRate = getActiveB2CLocalRateForShipment(courier, isReverseShipment)
        if (!activeRate) continue

        const existing = bestByProvider.get(providerKey)
        const currentTotal = Number(activeRate.total_charges ?? activeRate.rate ?? Infinity)
        const existingRate = existing
          ? getActiveB2CLocalRateForShipment(existing, isReverseShipment)
          : null
        const existingTotal = Number(existingRate?.total_charges ?? existingRate?.rate ?? Infinity)

        if (!existing || currentTotal < existingTotal) {
          bestByProvider.set(providerKey, courier)
        }
      }

      combined = [...passthrough, ...bestByProvider.values()]
    }

    combined = combined.map((courier: any) => {
      const activeRate = getActiveB2CLocalRateForShipment(courier, isReverseShipment)
      if (!activeRate) return courier
      const activeLocalRateKey =
        isReverseShipment && courier?.localRates?.reverse_pickup
          ? 'reverse_pickup'
          : isReverseShipment
            ? 'rto'
            : 'forward'

      return {
        ...courier,
        rate: activeRate.rate ?? courier.rate ?? null,
        freight_charges: activeRate.rate ?? courier.freight_charges ?? null,
        cod_charges: activeRate.cod_charges ?? courier.cod_charges ?? 0,
        other_charges: activeRate.other_charges ?? courier.other_charges ?? 0,
        total_charges: activeRate.total_charges ?? courier.total_charges ?? null,
        courier_cost_estimate:
          activeRate.total_charges ?? courier.courier_cost_estimate ?? courier.total_charges ?? null,
        chargeable_weight: activeRate.chargeable_weight ?? null,
        volumetric_weight: activeRate.volumetric_weight ?? null,
        localRates: {
          ...courier.localRates,
          [activeLocalRateKey]: {
            ...activeRate,
            chargeable_weight: activeRate.chargeable_weight ?? null,
            volumetric_weight: activeRate.volumetric_weight ?? null,
          },
        },
      }
    })

    // 🔹 Sorting and tagging
    if (userId && combined?.length) {
      const [profile] = await db
        .select()
        .from(courierPriorityProfiles)
        .where(eq(courierPriorityProfiles.user_id, userId))

      if (profile) {
        if (profile.name === 'personalised' && profile.personalised_order) {
          const courierMap: Record<string, any> = {}
          combined.forEach((c: any) => {
            courierMap[makeCourierIdentityKey(c)] = c
          })

          const ordered: any[] = []
          profile.personalised_order.forEach((p) => {
            const personalisedKey = `${String(p.courierId)}__${normalizeProviderKey((p as any).serviceProvider || (p as any).integration_type || null)}`
            const fallbackMatches = combined.filter(
              (c: any) => String(c.id) === String(p.courierId),
            )
            const matchedCourier =
              courierMap[personalisedKey] ||
              (fallbackMatches.length === 1 ? fallbackMatches[0] : null)
            if (matchedCourier) {
              const personalisedDisplayName =
                matchedCourier.max_slab_weight != null
                  ? formatCourierSlabDisplayName(p.name, matchedCourier.max_slab_weight)
                  : p.name
              ordered.push({
                ...matchedCourier,
                displayName: personalisedDisplayName,
              })
            }
          })
          combined.forEach((c: any) => {
            const alreadyIncluded = ordered.some(
              (existing) => makeCourierIdentityKey(existing) === makeCourierIdentityKey(c),
            )
            if (!alreadyIncluded) ordered.push(c)
          })
          combined = ordered
        } else if (profile.name === 'fastest') {
          combined = combined.sort(
            (a: any, b: any) => parseEddToDays(a.edd) - parseEddToDays(b.edd),
          )
        } else if (profile.name === 'economy') {
          combined = combined.sort(
            (a: any, b: any) =>
              (getActiveB2CLocalRateForShipment(a, isReverseShipment)?.rate ?? Infinity) -
              (getActiveB2CLocalRateForShipment(b, isReverseShipment)?.rate ?? Infinity),
          )
        } else {
          combined = combined.sort(
            (a: any, b: any) =>
              (getActiveB2CLocalRateForShipment(a, isReverseShipment)?.rate ?? Infinity) -
              (getActiveB2CLocalRateForShipment(b, isReverseShipment)?.rate ?? Infinity),
          )
        }
      }

      // Tag fastest and cheapest
      let fastestCourierId: string | null = null
      let cheapestCourierId: string | null = null

      const sortedByEdd = [...combined].sort(
        (a, b) => parseEddToDays(a.edd) - parseEddToDays(b.edd),
      )
      if (sortedByEdd.length) fastestCourierId = makeCourierIdentityKey(sortedByEdd[0])

      const sortedByRate = [...combined].sort(
        (a, b) =>
          (getActiveB2CLocalRateForShipment(a, isReverseShipment)?.rate ?? Infinity) -
          (getActiveB2CLocalRateForShipment(b, isReverseShipment)?.rate ?? Infinity),
      )
      if (sortedByRate.length) cheapestCourierId = makeCourierIdentityKey(sortedByRate[0])

      combined = combined.map((c: any) => {
        let tag = ''
        const identityKey = makeCourierIdentityKey(c)
        if (identityKey === fastestCourierId) tag = 'fastest'
        else if (identityKey === cheapestCourierId) tag = 'economy'
        return { ...c, tag }
      })
    }

    // Cache the final combined list before returning
    return combined
  } catch (error: any) {
    console.error('Error fetching combined courier rates:', error.message)
    throw new Error('Failed to fetch combined courier rates')
  }
}
export const fetchAvailableCouriersForGuest = async (params: NimbusServiceabilityParams) => {
  return fetchAvailableCouriersWithRates(params, {
    planFallbackName: 'Basic',
  })
}

// =================== B2B Courier Fetching ===================

export const fetchAvailableCouriersWithRatesB2B = async (
  params: NimbusServiceabilityParams & { pickupId?: string },
  userOrOptions?: FetchCouriersOptions,
) => {
  try {
    // ✅ B2B only
    if (params.shipment_type && params.shipment_type !== 'b2b') {
      throw new Error(
        `fetchAvailableCouriersWithRatesB2B is for B2B only. Use fetchAvailableCouriersWithRates for ${params.shipment_type}`,
      )
    }

    const options =
      typeof userOrOptions === 'string'
        ? {
            userId: userOrOptions,
          }
        : (userOrOptions ?? {})

    const { userId, planIdOverride, planFallbackName } = options
    const normalizeProviderKey = (value?: string | null) =>
      String(value || '')
        .trim()
        .toLowerCase()
    const makeCourierIdentityKey = (courier: {
      id: number | string
      integration_type?: string | null
      serviceProvider?: string | null
      max_slab_weight?: number | null
    }) =>
      `${String(courier.id)}__${normalizeProviderKey(courier.integration_type || courier.serviceProvider || null)}__${courier.max_slab_weight ?? 'base'}`

    const requestedShadowfaxMode = resolveShadowfaxOrderMode(
      params as any,
      (params as any).shadowfax_forward_mode,
    )
    const requestedShadowfaxService =
      String((params as any).shadowfax_service_mode || '')
        .trim()
        .toLowerCase() === 'surface'
        ? 'surface'
        : 'surface'

    const shadowfaxCourierMatchesMode = (courierName?: string | null) => {
      const normalizedName = String(courierName || '')
        .trim()
        .toLowerCase()
      if (!normalizedName) return true
      if (requestedShadowfaxMode === 'warehouse') {
        return normalizedName.includes('warehouse')
      }
      if (normalizedName.includes('warehouse')) {
        return false
      }
      return true
    }

    const normalizePincode = (value: unknown): string | undefined => {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        return String(value)
      }
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
      return undefined
    }

    // Step 1: Get origin zone from pickupId
    let originPincode: string | undefined = undefined
    let originZoneId: string | null = null

    if (params.pickupId) {
      const [pickupRow] = await db
        .select({ pincode: addresses.pincode })
        .from(pickupAddresses)
        .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
        .where(eq(pickupAddresses.id, params.pickupId))
        .limit(1)

      if (pickupRow?.pincode) {
        originPincode = pickupRow.pincode

        // Lookup zone from b2bPincodes
        const [originZoneRow] = await db
          .select({ zoneId: b2bPincodes.zone_id })
          .from(b2bPincodes)
          .where(eq(b2bPincodes.pincode, originPincode))
          .limit(1)

        originZoneId = originZoneRow?.zoneId ?? null
      }
    } else {
      // Fallback: use origin pincode directly if pickupId not provided
      originPincode = normalizePincode(params.source_pincode) ?? normalizePincode(params.origin)

      if (originPincode) {
        const [originZoneRow] = await db
          .select({ zoneId: b2bPincodes.zone_id })
          .from(b2bPincodes)
          .where(eq(b2bPincodes.pincode, originPincode))
          .limit(1)

        originZoneId = originZoneRow?.zoneId ?? null
      }
    }

    // Step 2: Get destination zone from destination pincode
    const destinationPincode =
      normalizePincode(params.destination_pincode) ?? normalizePincode(params.destination)

    let destinationZoneId: string | null = null

    if (destinationPincode) {
      const [destZoneRow] = await db
        .select({ zoneId: b2bPincodes.zone_id })
        .from(b2bPincodes)
        .where(eq(b2bPincodes.pincode, destinationPincode))
        .limit(1)

      destinationZoneId = destZoneRow?.zoneId ?? null
    }

    // Step 3: Validate we have both zones
    if (!originZoneId || !destinationZoneId) {
      console.error('B2B Zone lookup failed:', {
        originPincode,
        originZoneId,
        destinationPincode,
        destinationZoneId,
      })
      throw new Error(
        `B2B zone lookup failed. Origin zone: ${
          originZoneId ? 'found' : 'not found'
        }, Destination zone: ${destinationZoneId ? 'found' : 'not found'}`,
      )
    }

    console.log('✅ B2B Zone lookup successful:', {
      originPincode,
      originZoneId,
      destinationPincode,
      destinationZoneId,
    })

    // Step 4: Get active plan (similar to B2C flow)
    let activePlanId: string | null | undefined = planIdOverride ?? null

    if (!activePlanId && userId) {
      const [returnedUser] = await db
        .select({ planId: userPlans.plan_id })
        .from(userPlans)
        .where(eq(userPlans.userId, userId))
      activePlanId = returnedUser?.planId ?? null
    }

    if (!activePlanId && planFallbackName) {
      const normalizedFallback = planFallbackName.toLowerCase()
      const [fallbackPlan] = await db
        .select({ id: plans.id })
        .from(plans)
        .where(sql`lower(${plans.name}) = ${normalizedFallback}`)
        .limit(1)
      activePlanId = fallbackPlan?.id ?? null
    }

    // Step 5: Fetch B2B zone-to-zone rates
    // Get enabled couriers first - filter by business type for B2B
    const systemCourierRows = await db
      .select({ id: couriers.id, serviceProvider: couriers.serviceProvider, name: couriers.name })
      .from(couriers)
      .where(and(eq(couriers.isEnabled, true), sql`${couriers.businessType} @> '["b2b"]'::jsonb`))

    const shadowfaxRows = systemCourierRows.filter(
      (row) => normalizeProviderKey(row.serviceProvider) === 'shadowfax',
    )
    const shadowfaxModeMatchedRows = shadowfaxRows.filter((row) =>
      shadowfaxCourierMatchesMode(row.name),
    )
    const shouldFilterShadowfaxByName = shadowfaxModeMatchedRows.length > 0

    if (shadowfaxRows.length && !shouldFilterShadowfaxByName) {
      console.log('[B2B Serviceability] Shadowfax mode/name fallback', {
        requestedShadowfaxMode,
        availableCourierNames: shadowfaxRows.map((row) => row.name),
      })
    }

    const systemCourierMap = systemCourierRows.reduce<Record<string, Set<number>>>((acc, row) => {
      const providerKey = (row.serviceProvider || '').toLowerCase()
      if (!providerKey) return acc
      if (
        providerKey === 'shadowfax' &&
        shouldFilterShadowfaxByName &&
        !shadowfaxCourierMatchesMode(row.name)
      ) {
        return acc
      }
      if (!acc[providerKey]) acc[providerKey] = new Set<number>()
      acc[providerKey].add(Number(row.id))
      return acc
    }, {})

    // Fetch zone-to-zone rates for all enabled couriers
    const effectiveDate = new Date()
    const rateConditions: any[] = [
      eq(b2bZoneToZoneRates.origin_zone_id, originZoneId),
      eq(b2bZoneToZoneRates.destination_zone_id, destinationZoneId),
      eq(b2bZoneToZoneRates.is_active, true),
      or(
        isNull(b2bZoneToZoneRates.effective_from),
        lte(b2bZoneToZoneRates.effective_from, effectiveDate),
      ),
      or(
        isNull(b2bZoneToZoneRates.effective_to),
        gte(b2bZoneToZoneRates.effective_to, effectiveDate),
      ),
    ]

    // Filter by plan if available
    if (activePlanId) {
      rateConditions.push(
        or(eq(b2bZoneToZoneRates.plan_id, activePlanId), isNull(b2bZoneToZoneRates.plan_id)),
      )
    } else {
      rateConditions.push(isNull(b2bZoneToZoneRates.plan_id))
    }

    const zoneToZoneRates = await db
      .select({
        id: b2bZoneToZoneRates.id,
        courierId: b2bZoneToZoneRates.courier_id,
        serviceProvider: b2bZoneToZoneRates.service_provider,
        ratePerKg: b2bZoneToZoneRates.rate_per_kg,
        volumetricFactor: b2bZoneToZoneRates.volumetric_factor,
      })
      .from(b2bZoneToZoneRates)
      .where(and(...rateConditions))
      .orderBy(desc(b2bZoneToZoneRates.effective_from))

    // Step 6: Build courier list with rates
    const courierMap = new Map<number, any>()

    for (const rate of zoneToZoneRates) {
      if (!rate.courierId) continue

      // Check if courier is enabled
      const providerKey = (rate.serviceProvider || '').toLowerCase()
      const isEnabled = providerKey && systemCourierMap[providerKey]?.has(Number(rate.courierId))

      if (!isEnabled) continue

      // Get or create courier entry
      if (!courierMap.has(rate.courierId)) {
        const [courierRow] = await db
          .select()
          .from(couriers)
          .where(eq(couriers.id, rate.courierId))
          .limit(1)

        if (!courierRow) continue

        courierMap.set(rate.courierId, {
          id: courierRow.id,
          name: courierRow.name,
          integration_type: rate.serviceProvider?.toLowerCase() || 'unknown',
          serviceProvider: rate.serviceProvider?.toLowerCase(),
          localRates: {},
          approxZone: {
            originZoneId,
            destinationZoneId,
          },
          provider_serviceability:
            String(rate.serviceProvider || '')
              .trim()
              .toLowerCase() === 'shadowfax'
              ? {
                  mode: requestedShadowfaxMode,
                  service_mode: requestedShadowfaxService,
                  shipping_mode: requestedShadowfaxService,
                }
              : null,
          courier_option_key: makeCourierIdentityKey({
            id: courierRow.id,
            integration_type: rate.serviceProvider?.toLowerCase() || null,
            serviceProvider: rate.serviceProvider?.toLowerCase() || null,
            max_slab_weight: null,
          }),
          createdAt: courierRow.createdAt,
        })
      }

      // Add rate to courier
      const courier = courierMap.get(rate.courierId)!
      courier.localRates.forward = {
        ratePerKg: rate.ratePerKg,
        volumetricFactor: rate.volumetricFactor,
      }
    }

    // Step 7: Convert map to array and filter couriers with rates
    let combined = Array.from(courierMap.values()).filter(
      (c) => c.localRates && Object.keys(c.localRates).length > 0,
    )

    // ✅ Final filter: Ensure all couriers have correct business_type for B2B
    combined = await filterCouriersByBusinessType(combined, 'b2b')

    combined = await Promise.all(
      combined.map(async (courier: any) => {
        try {
          const rateResult = await calculateB2BRate({
            originPincode: originPincode || '',
            destinationPincode: destinationPincode || '',
            weightKg: Number(params.weight ?? 0),
            length: Number(params.length ?? 0) || undefined,
            width: Number(params.breadth ?? 0) || undefined,
            height: Number(params.height ?? 0) || undefined,
            invoiceValue: Number(params.order_amount ?? 0),
            paymentMode:
              (params.payment_type ?? 'prepaid').toUpperCase() === 'COD' ? 'COD' : 'PREPAID',
            courierScope: {
              courierId: Number(courier.id),
              serviceProvider: courier.integration_type ?? courier.serviceProvider ?? undefined,
            },
            pickupDate: (params as any).pickup_date,
            deliveryAddress: '',
            planId: activePlanId ?? undefined,
          })

          return {
            ...courier,
            rate: rateResult?.charges?.total ?? courier.rate ?? null,
            rateEstimate: rateResult?.charges?.total ?? courier.rateEstimate ?? null,
            courier_cost_estimate: courier.courier_cost_estimate ?? null,
            chargeable_weight:
              rateResult?.calculation?.billableWeight ?? courier.chargeable_weight ?? null,
            volumetric_weight:
              rateResult?.calculation?.volumetricWeight ?? courier.volumetric_weight ?? null,
            localRates: {
              ...courier.localRates,
              forward: {
                ...(courier.localRates?.forward || {}),
                rate: rateResult?.charges?.total ?? null,
                billableWeight: rateResult?.calculation?.billableWeight ?? null,
                volumetricWeight: rateResult?.calculation?.volumetricWeight ?? null,
              },
            },
          }
        } catch (rateErr) {
          console.warn('⚠️ Failed to compute B2B courier estimate:', {
            courierId: courier?.id,
            provider: courier?.integration_type || courier?.serviceProvider,
            error: (rateErr as any)?.message || rateErr,
          })
          return courier
        }
      }),
    )

    // Step 8: Apply sorting and tagging (similar to B2C)
    if (userId && combined?.length) {
      const [profile] = await db
        .select()
        .from(courierPriorityProfiles)
        .where(eq(courierPriorityProfiles.user_id, userId))

      if (profile) {
        if (profile.name === 'personalised' && profile.personalised_order) {
          const personalisedIds = profile.personalised_order.map((p) => p.courierId)
          const courierMapObj: Record<string, any> = {}
          combined.forEach((c: any) => {
            courierMapObj[c.id] = c
          })

          const ordered: any[] = []
          profile.personalised_order.forEach((p) => {
            if (courierMapObj[p.courierId]) {
              ordered.push({
                ...courierMapObj[p.courierId],
                displayName: p.name,
              })
            }
          })
          combined.forEach((c: any) => {
            if (!personalisedIds.includes(c.id)) ordered.push(c)
          })
          combined = ordered
        } else if (profile.name === 'fastest') {
          // For B2B, we might not have EDD, so skip fastest sorting
          combined = combined.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
        } else if (profile.name === 'economy') {
          combined = combined.sort((a: any, b: any) => {
            const aRate = a.localRates.forward?.ratePerKg ?? Infinity
            const bRate = b.localRates.forward?.ratePerKg ?? Infinity
            return aRate - bRate
          })
        }
      }
    }

    return combined
  } catch (error: any) {
    console.error('Error fetching combined courier rates (B2B):', error.message)
    throw error
  }
}

// =================== Create Shipment & Update Order ===================

export interface ShipmentParams {
  order_number: string // corresponds to b2c_orders.id
  payment_type?: 'cod' | 'prepaid' | 'reverse' | 'replacement'
  product_type?: string
  productType?: string
  package_weight?: number
  package_length?: number
  package_breadth?: number
  package_height?: number
  integration_type?: 'delhivery' | 'ekart' | 'shadowfax' | string
  provider_code?: string // Opaque provider code (alternative to integration_type)
  shipping_mode?: DelhiveryShippingMode | 'Air' | 'Surface' | 'Express' | string
  shadowfax_forward_mode?: string
  shadowfax_service_mode?: 'regular' | 'surface'
  request_auto_pickup?: 'yes' | 'no'
  shipping_charges?: number
  other_charges?: number // Other charges from courier serviceability API (e.g. fuel surcharge, handling, etc.)
  freight_charges?: number // What platform charges seller (based on rate card)
  courier_cost?: number // Estimated courier cost from serviceability response (can be updated later via webhook)
  boxes?: any
  prepaid_amount?: string
  transaction_fee?: number
  order_date: Date
  pickup_date?: string
  pickup_time?: string
  delivery_location?: string
  zone?: string
  zone_id?: string
  selected_rate_card_id?: string
  selected_max_slab_weight?: number
  courier_option_key?: string
  amazon_request_token?: string
  amazon_rate_id?: string
  amazon_service_id?: string
  amazon_carrier_id?: string
  requestToken?: string
  rateId?: string

  cod_charges?: number
  discount?: number
  order_amount?: number
  // Additional optional fields used across flows
  pickup_details?: any
  pickup_location_id?: string
  origin?: number | string
  destination?: number | string
  pickup_pincode?: number | string
  destination_pincode?: number | string
  source_pincode?: number | string
  weight?: number
  length?: number
  breadth?: number
  height?: number
  isReverse?: boolean
  transport_speed?: string
  freight_mode?: 'fop' | 'fod' | string
  billing_address?: Record<string, unknown>
  callback?: Record<string, unknown>
  address_type?: string
  ewbn?: string
  ewb?: string
  ewbn_number?: string
  ewaybill_number?: string
  dangerous_good?: boolean | string | number
  fragile_shipment?: boolean | string | number
  plastic_packaging?: boolean | string | number
  quantity?: string | number
  country?: string
  consignee: {
    name: string
    company_name?: string
    address: string
    address_2?: string
    city: string
    state: string
    country?: string
    pincode: string
    phone: string
    gstin?: string
    email?: string
  }
  pickup: {
    warehouse_name: string
    name: string
    address: string
    address_2?: string
    city: string
    state: string
    country?: string
    pincode: string
    phone: string
    gst_number?: string
    pickup_date?: string
    pickup_time?: string
    addressNickname?: string
  }
  is_rto_different?: 'yes' | 'no'
  rto?: {
    warehouse_name: string
    name: string
    address: string
    address_2?: string
    city: string
    state: string
    country?: string
    pincode: string
    phone: string
    addressNickname?: string
  }
  company: { name?: string; gst?: string }
  pickup_location_alias?: string
  return_location_alias?: string
  templateName?: string
  preferred_dispatch_date?: string
  delayed_dispatch?: boolean
  mps?: boolean
  obd_shipment?: boolean
  qc_details?: any
  qc_type?: 'param'
  custom_qc?: any[]
  category_of_goods?: string
  invoices?: {
    invoiceNumber?: string
    invoiceDate?: string
    invoiceValue?: number
    invoiceFileUrl?: string
    ewaybill?: string
    eway_bill?: string
    invQrCode?: string
    inv_qr_code?: string
  }[]
  order_items?: {
    name: string
    sku: string
    qty: number
    quantity?: number
    price: number
    hsn: string
    hsnCode?: string
    discount: number
    tax_rate: number
  }[]
  courier_id?: number
  courier_partner?: string
  invoice_number?: string
  invoice_date?: string
  invoice_amount?: string | number
  is_insurance?: 0 | 1
  gift_wrap?: string
  tags?: string
  original_order_id?: string
  order_id?: string
}

export interface InsertB2COrderParams {
  tx: PgTransaction<any, any, any>
  params: any
  shipmentData?: any
  userId: string
  shippingCharges?: number // What seller charges customer (total shipping including other_charges)
  otherCharges?: number // Other charges from courier serviceability API
  freightCharges?: number // What platform charges seller (based on rate card)
  razorpayChargeEnabled?: boolean
  razorpayChargePercent?: number
  razorpayChargeAmount?: number
  gstPercent?: number
  gstAmount?: number
  walletDebitAmount?: number
  courierCost?: number | null // What platform pays courier (actual courier cost)
  transactionFee?: number
  giftWrap?: number
  discount?: number
  status?: string
  pickupStatus?: string | null
  providerLastStatus?: string | null
  integration_type: 'delhivery' | 'ekart' | 'shadowfax' | string
  is_external_api?: boolean // true if created via external API, false if created locally
  volumetricWeight?: number
  chargedWeight?: number
  chargedSlabs?: number
  shippingMode?: string | null
  selectedMaxSlabWeight?: number | null
  manifestError?: string | null
}

type ExistingB2COrderBookingOptions = {
  existingOrderId?: string
}

export async function createB2COrder({
  tx,
  params,
  shipmentData,
  userId,
  shippingCharges = 0,
  otherCharges = 0,
  freightCharges = 0,
  razorpayChargeEnabled = false,
  razorpayChargePercent = 0,
  razorpayChargeAmount = 0,
  gstPercent = 0,
  gstAmount = 0,
  walletDebitAmount = 0,
  courierCost,
  transactionFee = 0,
  status,
  pickupStatus,
  providerLastStatus,
  giftWrap = 0,
  discount = 0,
  integration_type,
  is_external_api = false,
  volumetricWeight,
  chargedWeight,
  chargedSlabs,
  shippingMode,
  selectedMaxSlabWeight,
  manifestError,
}: InsertB2COrderParams) {
  const orderAmount = Number(params.order_amount ?? 0)
  const normalizedOrderNumber = await ensureUniqueMerchantOrderNumber(
    tx,
    userId,
    params.order_number,
  )
  const normalizeJsonValue = (value: unknown) => {
    if (!value) return null

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return null
      try {
        return JSON.parse(trimmed)
      } catch (err) {
        console.warn('⚠️ Unable to parse JSON string in createB2COrder:', trimmed)
        return null
      }
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value as Record<string, unknown>).filter((key) => {
        const v = (value as Record<string, unknown>)[key]
        if (v === undefined || v === null) return false
        if (typeof v === 'string') return v.trim().length > 0
        return true
      })

      return keys.length ? value : null
    }

    return null
  }

  const pickupDetails = normalizeJsonValue(params.pickup) ?? {}
  const rtoDetails = normalizeJsonValue(params.rto)
  const isCodOrder = params.payment_type === 'cod'
  const storedCodCharges = isCodOrder ? Number(params?.cod_charges ?? 0) : 0
  const providerReference =
    String(
      shipmentData?.provider_reference ??
        shipmentData?.shipment_id ??
        shipmentData?.awb_number ??
        shipmentData?.order_id ??
        '',
    ).trim() || null
  const providerRequestId =
    String(
      shipmentData?.provider_request_id ??
        shipmentData?.request_id ??
        shipmentData?.client_request_id ??
        (integration_type === 'amazon' ? '' : shipmentData?.awb_number) ??
        '',
    ).trim() || null
  const providerModeRaw =
    shipmentData?.provider_mode ??
    params.shadowfax_forward_mode ??
    shipmentData?.mode ??
    shipmentData?.shipping_mode ??
    ''
  const providerMode =
    integration_type === 'shadowfax'
      ? String(providerModeRaw).trim()
        ? normalizeShadowfaxForwardModeValue(providerModeRaw)
        : null
      : String(providerModeRaw).trim() || null
  const providerService =
    String(
      shipmentData?.provider_service ??
        shipmentData?.service_mode ??
        shipmentData?.service ??
        params.shadowfax_service_mode ??
        '',
    ).trim() || null
  const tagParts = String(params.tags || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)

  if (integration_type === 'shadowfax') {
    const shadowfaxMode = String(providerModeRaw).trim()
      ? normalizeShadowfaxForwardModeValue(providerModeRaw)
      : ''
    const shadowfaxService = String(providerService || '')
      .trim()
      .toLowerCase()
    const shadowfaxReference = String(
      shipmentData?.shipment_id || shipmentData?.awb_number || '',
    ).trim()

    if (shadowfaxMode && !tagParts.some((tag) => tag.startsWith('shadowfax_mode='))) {
      tagParts.push(`shadowfax_mode=${shadowfaxMode}`)
    }

    if (shadowfaxService && !tagParts.some((tag) => tag.startsWith('shadowfax_service='))) {
      tagParts.push(`shadowfax_service=${shadowfaxService}`)
    }

    if (shadowfaxReference && !tagParts.some((tag) => tag.startsWith('shadowfax_reference='))) {
      tagParts.push(`shadowfax_reference=${shadowfaxReference}`)
    }
  }

  try {
    const [newOrder] = await tx
      .insert(b2c_orders)
      .values({
        user_id: userId,

        // Order info
        order_number: normalizedOrderNumber,
        order_id:
          shipmentData?.order_id ??
          shipmentData?.data?.order_id ??
          shipmentData?.shipment_id ??
          null,
        order_date: params.order_date ?? new Date().toISOString().slice(0, 10), // 'YYYY-MM-DD'
        order_amount: orderAmount,
        cod_charges: storedCodCharges,
        integration_type: params?.integration_type,

        // Buyer info
        buyer_name: params.consignee?.name ?? '',
        buyer_phone: params.consignee?.phone ?? '',
        buyer_email: params.consignee?.email || null,
        address: params.consignee?.address ?? '',
        city: params.consignee?.city ?? '',
        state: params.consignee?.state ?? '',
        country: 'India',
        pincode: params.consignee?.pincode ?? '',

        // Product info
        products: Array.isArray(params.order_items) ? params.order_items : [],
        weight: Number(params.package_weight ?? 0),
        length: Number(params.package_length ?? 0),
        breadth: Number(params.package_breadth ?? 0),
        height: Number(params.package_height ?? 0),

        // Charges
        order_type: params.payment_type,
        prepaid_amount: Number(params.prepaid_amount ?? 0),
        shipping_charges: shippingCharges, // What seller charges customer (total shipping including other_charges)
        other_charges: otherCharges, // Other charges from courier serviceability API
        freight_charges: freightCharges, // What platform charges seller (based on rate card)
        razorpay_charge_enabled: razorpayChargeEnabled,
        razorpay_charge_percent: razorpayChargePercent,
        razorpay_charge_amount: razorpayChargeAmount,
        gst_percent: gstPercent,
        gst_amount: gstAmount,
        wallet_debit_amount: walletDebitAmount,
        courier_cost: courierCost ?? null, // What platform pays courier (actual courier cost - can be null initially, updated via webhook)
        transaction_fee: transactionFee,
        gift_wrap: giftWrap,
        discount: discount,
        volumetric_weight: volumetricWeight ?? params.volumetricWeight ?? null,
        charged_weight: chargedWeight ?? params.chargedWeight ?? null,
        weight_discrepancy: false,
        charged_slabs: chargedSlabs ?? params.chargedSlabs ?? null,

        order_status: status ?? 'booked',
        pickup_status: pickupStatus ?? 'pending',

        is_rto_different: params.is_rto_different === 'yes',

        // Courier info
        courier_partner: shipmentData?.courier_name ?? params.courier_partner ?? null,
        delivery_location: params.delivery_location ?? params.zone ?? null,
        courier_id: params.courier_id ? Number(params.courier_id) : null,
        shipping_mode: shippingMode ?? null,
        selected_max_slab_weight: selectedMaxSlabWeight ?? null,
        shipment_id: shipmentData?.shipment_id?.toString() ?? null,
        provider_reference: providerReference,
        provider_request_id: providerRequestId,
        provider_mode: providerMode,
        provider_service: providerService,
        provider_last_status: providerLastStatus ?? status ?? 'booked',
        provider_meta: shipmentData ?? null,
        awb_number: shipmentData?.awb_number ?? null,
        // Store courier-provided label key/identifier if available
        label: typeof shipmentData?.label === 'string' ? shipmentData.label : null,
        manifest:
          typeof shipmentData?.manifest === 'string' && shipmentData?.manifest.length <= 100
            ? shipmentData.manifest
            : null,

        manifest_error: manifestError ?? null,

        // Routing / sort code from courier label
        sort_code: (shipmentData as any)?.sort_code || (shipmentData as any)?.sortCode || null,

        // Pickup & RTO info
        pickup_location_id: params.pickup_location_id ?? params.pickup?.warehouse_name ?? null,
        pickup_details: pickupDetails,
        rto_details: rtoDetails,

        // Order source flag
        is_external_api: is_external_api ?? false,

        // Tags / meta
        tags: tagParts.length ? tagParts.join(',') : null,
        invoice_link: shipmentData?.invoice_link ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning({ id: b2c_orders.id, order_number: b2c_orders.order_number })

    return newOrder
  } catch (err: any) {
    console.error('❌ Failed to insert B2C order:', err)
    console.error('❌ Failed to insert B2C order (details):', {
      message: err?.message,
      detail: err?.detail,
      code: err?.code,
      stack: err?.stack,
    })
    throw err
  }
}

async function updateExistingB2COrderWithShipment({
  tx,
  existingOrderId,
  params,
  shipmentData,
  userId,
  shippingCharges = 0,
  otherCharges = 0,
  freightCharges = 0,
  razorpayChargeEnabled = false,
  razorpayChargePercent = 0,
  razorpayChargeAmount = 0,
  gstPercent = 0,
  gstAmount = 0,
  walletDebitAmount = 0,
  courierCost,
  transactionFee = 0,
  status,
  pickupStatus,
  providerLastStatus,
  giftWrap = 0,
  discount = 0,
  integration_type,
  volumetricWeight,
  chargedWeight,
  chargedSlabs,
  shippingMode,
  selectedMaxSlabWeight,
  manifestError,
}: InsertB2COrderParams & { existingOrderId: string }) {
  const [existingOrder] = await tx
    .select()
    .from(b2c_orders)
    .where(and(eq(b2c_orders.id, existingOrderId), eq(b2c_orders.user_id, userId)))
    .limit(1)

  if (!existingOrder) {
    throw new HttpError(404, 'Order not found')
  }

  if (existingOrder.awb_number) {
    throw new HttpError(400, 'This order already has an AWB and cannot be booked again')
  }

  const normalizeJsonValue = (value: unknown) => {
    if (!value) return null

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return null
      try {
        return JSON.parse(trimmed)
      } catch {
        return null
      }
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value as Record<string, unknown>).filter((key) => {
        const v = (value as Record<string, unknown>)[key]
        if (v === undefined || v === null) return false
        if (typeof v === 'string') return v.trim().length > 0
        return true
      })

      return keys.length ? value : null
    }

    return null
  }

  const pickupDetails = normalizeJsonValue(params.pickup) ?? existingOrder.pickup_details ?? {}
  const rtoDetails = normalizeJsonValue(params.rto) ?? existingOrder.rto_details ?? null
  const isCodOrder = params.payment_type === 'cod'
  const storedCodCharges = isCodOrder ? Number(params?.cod_charges ?? 0) : 0
  const providerReference =
    String(
      shipmentData?.provider_reference ??
        shipmentData?.shipment_id ??
        shipmentData?.awb_number ??
        shipmentData?.order_id ??
        '',
    ).trim() || null
  const providerRequestId =
    String(
      shipmentData?.provider_request_id ??
        shipmentData?.request_id ??
        shipmentData?.client_request_id ??
        (integration_type === 'amazon' ? '' : shipmentData?.awb_number) ??
        '',
    ).trim() || null
  const providerModeRaw =
    shipmentData?.provider_mode ??
    params.shadowfax_forward_mode ??
    shipmentData?.mode ??
    shipmentData?.shipping_mode ??
    ''
  const providerMode =
    integration_type === 'shadowfax'
      ? String(providerModeRaw).trim()
        ? normalizeShadowfaxForwardModeValue(providerModeRaw)
        : null
      : String(providerModeRaw).trim() || null
  const providerService =
    String(
      shipmentData?.provider_service ??
        shipmentData?.service_mode ??
        shipmentData?.service ??
        params.shadowfax_service_mode ??
        '',
    ).trim() || null
  const tagParts = Array.from(
    new Set(
      [existingOrder.tags, params.tags]
        .flatMap((tagValue) =>
          String(tagValue || '')
            .split(',')
            .map((tag) => tag.trim())
            .filter(Boolean),
        )
        .filter(Boolean),
    ),
  )

  const [updatedOrder] = await tx
    .update(b2c_orders)
    .set({
      order_amount: Number(params.order_amount ?? existingOrder.order_amount ?? 0),
      cod_charges: storedCodCharges,
      invoice_number: params.invoice_number ?? existingOrder.invoice_number,
      invoice_date: params.invoice_date ?? existingOrder.invoice_date,
      invoice_amount: params.invoice_amount ?? existingOrder.invoice_amount,
      buyer_name: params.consignee?.name ?? existingOrder.buyer_name,
      buyer_phone: params.consignee?.phone ?? existingOrder.buyer_phone,
      buyer_email: params.consignee?.email || existingOrder.buyer_email,
      address: params.consignee?.address ?? existingOrder.address,
      city: params.consignee?.city ?? existingOrder.city,
      state: params.consignee?.state ?? existingOrder.state,
      country: params.consignee?.country ?? existingOrder.country ?? 'India',
      pincode: params.consignee?.pincode ?? existingOrder.pincode,
      products: Array.isArray(params.order_items) ? params.order_items : existingOrder.products,
      weight: Number(params.package_weight ?? existingOrder.weight ?? 0),
      length: Number(params.package_length ?? existingOrder.length ?? 0),
      breadth: Number(params.package_breadth ?? existingOrder.breadth ?? 0),
      height: Number(params.package_height ?? existingOrder.height ?? 0),
      order_type: params.payment_type ?? existingOrder.order_type,
      prepaid_amount: Number(params.prepaid_amount ?? existingOrder.prepaid_amount ?? 0),
      shipping_charges: shippingCharges,
      other_charges: otherCharges,
      freight_charges: freightCharges,
      razorpay_charge_enabled: razorpayChargeEnabled,
      razorpay_charge_percent: razorpayChargePercent,
      razorpay_charge_amount: razorpayChargeAmount,
      gst_percent: gstPercent,
      gst_amount: gstAmount,
      wallet_debit_amount: walletDebitAmount,
      courier_cost: courierCost ?? null,
      transaction_fee: transactionFee,
      gift_wrap: giftWrap,
      discount,
      volumetric_weight: volumetricWeight ?? params.volumetricWeight ?? existingOrder.volumetric_weight,
      charged_weight: chargedWeight ?? params.chargedWeight ?? existingOrder.charged_weight,
      weight_discrepancy: false,
      charged_slabs: chargedSlabs ?? params.chargedSlabs ?? existingOrder.charged_slabs,
      order_status: status ?? 'booked',
      pickup_status: pickupStatus ?? existingOrder.pickup_status ?? 'pending',
      is_rto_different: params.is_rto_different === 'yes',
      courier_partner: shipmentData?.courier_name ?? params.courier_partner ?? existingOrder.courier_partner,
      delivery_location: params.delivery_location ?? params.zone ?? existingOrder.delivery_location,
      courier_id: params.courier_id ? Number(params.courier_id) : existingOrder.courier_id,
      shipping_mode: shippingMode ?? existingOrder.shipping_mode,
      selected_max_slab_weight: selectedMaxSlabWeight ?? existingOrder.selected_max_slab_weight,
      shipment_id: shipmentData?.shipment_id?.toString() ?? existingOrder.shipment_id,
      provider_reference: providerReference,
      provider_request_id: providerRequestId,
      provider_mode: providerMode,
      provider_service: providerService,
      provider_last_status: providerLastStatus ?? status ?? 'booked',
      provider_meta: shipmentData ?? existingOrder.provider_meta,
      awb_number: shipmentData?.awb_number ?? existingOrder.awb_number,
      label: typeof shipmentData?.label === 'string' ? shipmentData.label : existingOrder.label,
      manifest:
        typeof shipmentData?.manifest === 'string' && shipmentData?.manifest.length <= 100
          ? shipmentData.manifest
          : existingOrder.manifest,
      manifest_error: manifestError ?? null,
      sort_code: (shipmentData as any)?.sort_code || (shipmentData as any)?.sortCode || existingOrder.sort_code,
      pickup_location_id: params.pickup_location_id ?? params.pickup?.warehouse_name ?? existingOrder.pickup_location_id,
      pickup_details: pickupDetails,
      rto_details: rtoDetails,
      tags: tagParts.length ? tagParts.join(',') : existingOrder.tags,
      updated_at: new Date(),
    } as any)
    .where(and(eq(b2c_orders.id, existingOrderId), eq(b2c_orders.user_id, userId)))
    .returning({ id: b2c_orders.id, order_number: b2c_orders.order_number })

  return updatedOrder
}

const syncShopifyAfterB2CBooking = async (
  orderId: string | undefined,
  source = 'courier-booking',
) => {
  if (!orderId) return null

  const [freshOrder] = await db
    .select()
    .from(b2c_orders)
    .where(eq(b2c_orders.id, orderId))
    .limit(1)

  if (!freshOrder) return null

  const providerMeta =
    freshOrder.provider_meta &&
    typeof freshOrder.provider_meta === 'object' &&
    !Array.isArray(freshOrder.provider_meta)
      ? (freshOrder.provider_meta as Record<string, any>)
      : {}
  const isShopifyOrder =
    String(freshOrder.order_id || '').startsWith('shopify_') ||
    String(providerMeta.source || '').toLowerCase() === 'shopify' ||
    String(providerMeta.shopify_order_id || '').trim().length > 0

  if (!isShopifyOrder) return freshOrder

  const { syncShopifyStatusForLocalOrder } = await import('./shopify.service')
  await syncShopifyStatusForLocalOrder(freshOrder, db, { source }).catch((err: any) => {
    console.warn('Shopify status sync skipped after courier booking:', err?.message || err)
  })

  const [syncedOrder] = await db
    .select()
    .from(b2c_orders)
    .where(eq(b2c_orders.id, orderId))
    .limit(1)

  return syncedOrder || freshOrder
}

// Main service function
export const createB2CShipmentService = async (
  params: ShipmentParams,
  userId: string,
  is_external_api: boolean = false,
  options: ExistingB2COrderBookingOptions = {},
) => {
  await requireMerchantOrderReadiness(userId, { requireMinimumWalletBalance: false })
  await ensureB2CRazorpayChargeSchema()

  // 🔹 Handle provider_code: Convert provider_code to integration_type if provided
  // Users can send either integration_type (direct) or provider_code (opaque code from serviceability API)
  if (!params.integration_type && params.provider_code) {
    // Dynamic import to avoid circular dependencies
    const { getIntegrationTypeFromProviderCode } = await import('../../utils/externalApiHelpers')
    const integrationTypeFromCode = getIntegrationTypeFromProviderCode(params.provider_code)

    if (integrationTypeFromCode) {
      params.integration_type = integrationTypeFromCode
      console.log(
        `✅ Converted provider_code: ${params.provider_code} to integration_type: ${params.integration_type}`,
      )
    } else {
      throw new HttpError(
        400,
        `Invalid provider_code: ${params.provider_code}. Please provide a valid provider_code from the serviceability API response.`,
      )
    }
  }

  console.log('🚀 Creating shipment for integration_type:', params.integration_type)

  const normalizePincode = (value: unknown): string | undefined => {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value).trim()
    }
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    return undefined
  }

  const resolveShadowfaxForwardMode = (): 'marketplace' | 'warehouse' => {
    return resolveShadowfaxOrderMode(params, params.shadowfax_forward_mode)
  }

  const resolveShadowfaxServiceMode = (): 'regular' | 'surface' => {
    const explicitService = String(params.shadowfax_service_mode || '')
      .trim()
      .toLowerCase()
    if (explicitService === 'regular' || explicitService === 'surface') {
      return explicitService
    }

    const transportSpeed = String(params.transport_speed || '')
      .trim()
      .toLowerCase()
    if (transportSpeed === 'surface') return 'surface'
    return 'surface'
  }

  let delhiveryService: DelhiveryService | null = null

  const ensureDelhiveryServiceable = async ({
    delhivery,
    originPin,
    destinationPin,
    paymentType,
    productType,
    orderNumber,
  }: {
    delhivery: DelhiveryService
    originPin: string
    destinationPin: string
    paymentType?: ShipmentParams['payment_type']
    productType?: string
    orderNumber?: string
  }) => {
    const requiresCOD = (paymentType || 'prepaid').toLowerCase() === 'cod'
    const isHeavyProduct = String(productType || '').trim().toLowerCase() === 'heavy'
    try {
      if (isHeavyProduct) {
        const [originResp, destinationResp] = await Promise.all([
          delhivery.checkHeavyServiceability(originPin),
          delhivery.checkHeavyServiceability(destinationPin),
        ])
        const originSummary = summarizeDelhiveryHeavyPincodeServiceability(originResp)
        const destinationSummary = summarizeDelhiveryHeavyPincodeServiceability(destinationResp)

        if (!originSummary.serviceable) {
          throw new HttpError(
            400,
            `Delhivery Heavy pickup pincode ${originPin} is NSZ for order ${orderNumber ?? 'unknown'}.`,
          )
        }
        const destinationReady = requiresCOD
          ? destinationSummary.cod
          : destinationSummary.prepaid
        if (!destinationReady) {
          throw new HttpError(
            400,
            `Delhivery Heavy destination pincode ${destinationPin} is not serviceable for ${
              requiresCOD ? 'COD' : 'Prepaid'
            } orders.`,
          )
        }

        console.log('[Delhivery] Heavy serviceability pre-check passed', {
          order_number: orderNumber,
          origin_pin: originPin,
          destination_pin: destinationPin,
          requires_cod: requiresCOD,
          origin_nsz: originSummary.nsz,
          destination_nsz: destinationSummary.nsz,
          destination_payment_types: destinationSummary.paymentTypes,
        })
        return { originResp, destinationResp }
      }

      const [originResp, destinationResp] = await Promise.all([
        delhivery.checkServiceability(originPin),
        delhivery.checkServiceability(destinationPin),
      ])

      const originPostalCode = summarizeDelhiveryPincodeServiceability(originResp)
      if (!originPostalCode.pickup) {
        throw new HttpError(
          400,
          `Delhivery pickup pincode ${originPin} is not serviceable for order ${orderNumber ?? 'unknown'}. Please update the pickup location.`,
        )
      }

      const destinationPostalCode = summarizeDelhiveryPincodeServiceability(destinationResp)
      const isDestinationReady =
        requiresCOD === true
          ? destinationPostalCode.cod
          : destinationPostalCode.prepaid
      if (!isDestinationReady) {
        throw new HttpError(
          400,
          `Delhivery destination pincode ${destinationPin} is not serviceable for ${
            requiresCOD ? 'COD' : 'Prepaid'
          } orders. Please confirm availability before booking.`,
        )
      }

      console.log('[Delhivery] Serviceability pre-check passed', {
        order_number: orderNumber,
        origin_pin: originPin,
        destination_pin: destinationPin,
        requires_cod: requiresCOD,
        origin_pickup_flag: originPostalCode.pickup,
        destination_cod_flag: destinationPostalCode.cod,
        destination_prepaid_flag: destinationPostalCode.prepaid,
        origin_embargoed: originPostalCode.embargoed,
        destination_embargoed: destinationPostalCode.embargoed,
      })

      return { originResp, destinationResp }
    } catch (error: any) {
      if (error instanceof HttpError) {
        throw error
      }
      console.error('❌ Delhivery serviceability validation failed:', error?.message || error)
      throw new HttpError(
        502,
        `Delhivery serviceability validation failed. ${error?.message || 'Please try again later.'}`,
      )
    }
  }

  const ensureXpressbeesCourierServiceable = async ({
    xpressbees,
    originPin,
    destinationPin,
    paymentType,
    orderAmount,
    packageWeight,
    packageLength,
    packageBreadth,
    packageHeight,
    courierId,
    orderNumber,
  }: {
    xpressbees: XpressbeesService
    originPin: string
    destinationPin: string
    paymentType?: ShipmentParams['payment_type']
    orderAmount?: number
    packageWeight?: number
    packageLength?: number
    packageBreadth?: number
    packageHeight?: number
    courierId?: number | string
    orderNumber?: string
  }) => {
    const normalizedCourierId = String(courierId ?? '').trim()
    const orderAmountValue = Number(orderAmount ?? 0)
    const serviceabilityOrderAmount = orderAmountValue > 0 ? orderAmountValue : 1
    const resp = await xpressbees.checkServiceability({
      origin: originPin,
      destination: destinationPin,
      payment_type: paymentType === 'cod' ? 'cod' : 'prepaid',
      order_amount: String(serviceabilityOrderAmount),
      weight: String(Number(packageWeight ?? 0)),
      length: String(Number(packageLength ?? 0)),
      breadth: String(Number(packageBreadth ?? 0)),
      height: String(Number(packageHeight ?? 0)),
    })

    if (!resp.serviceable) {
      throw new HttpError(
        400,
        `Xpressbees destination pincode ${destinationPin} is not serviceable for order ${orderNumber ?? 'unknown'}.`,
      )
    }

    if (normalizedCourierId) {
      const usesRouteLevelServiceability =
        resp.mode === 'xbees_pincode_master' ||
        resp.records?.some(
          (record: any) => record?.serviceability_mode === 'xbees_pincode_master',
        )
      const matchedRecord = resp.records?.find(
        (record: any) =>
          String(record?.id ?? record?.courier_id ?? record?.courierId ?? '').trim() ===
          normalizedCourierId,
      )
      if (!matchedRecord && !usesRouteLevelServiceability) {
        throw new HttpError(
          400,
          `Selected Xpressbees courier ${normalizedCourierId} is not serviceable for destination pincode ${destinationPin}.`,
        )
      }
    }

    return resp
  }

  const ensureEkartServiceable = async ({
    ekart,
    originPin,
    destinationPin,
    paymentType,
    orderAmount,
    packageWeight,
    packageLength,
    packageBreadth,
    packageHeight,
    orderNumber,
    isReverse,
  }: {
    ekart: EkartService
    originPin: string
    destinationPin: string
    paymentType?: ShipmentParams['payment_type']
    orderAmount?: number
    packageWeight?: number
    packageLength?: number
    packageBreadth?: number
    packageHeight?: number
    orderNumber?: string
    isReverse?: boolean
  }) => {
    const invoiceAmount = Number(orderAmount ?? 0) > 0 ? Number(orderAmount) : 1
    const normalizedPaymentType = paymentType === 'cod' ? 'COD' : 'Prepaid'
    const weightKg = normalizeServiceabilityWeightToGrams(packageWeight ?? 0) / 1000

    try {
      const resp = await ekart.checkServiceability({
        pickupPincode: originPin,
        dropPincode: destinationPin,
        length: String(Number(packageLength ?? 0) || 10),
        height: String(Number(packageHeight ?? 0) || 10),
        width: String(Number(packageBreadth ?? 0) || 10),
        weight: String(weightKg > 0 ? weightKg : 0.5),
        paymentType: normalizedPaymentType,
        invoiceAmount: String(invoiceAmount),
        codAmount: normalizedPaymentType === 'COD' ? String(invoiceAmount) : undefined,
      })

      if (!resp.serviceable) {
        throw new HttpError(
          400,
          `Ekart is not serviceable between pickup pincode ${originPin} and destination pincode ${destinationPin} for order ${orderNumber ?? 'unknown'}.`,
        )
      }

      if (isReverse) {
        const readPath = (source: any, path: string) =>
          path.split('.').reduce((current: any, part: string) => {
            if (current === undefined || current === null) return undefined
            return current?.[part]
          }, source)
        const toBoolean = (value: any): boolean | undefined => {
          if (typeof value === 'boolean') return value
          if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase()
            if (['true', 'yes', '1', 'available', 'serviceable'].includes(normalized)) return true
            if (['false', 'no', '0', 'unavailable', 'not available', 'not serviceable'].includes(normalized)) {
              return false
            }
          }
          if (typeof value === 'number') return value > 0
          return undefined
        }
        const readAnyBoolean = (paths: string[]) => {
          const sources = [resp.availability, ...(Array.isArray(resp.records) ? resp.records : [])]
          for (const source of sources) {
            for (const path of paths) {
              const parsed = toBoolean(readPath(source, path))
              if (parsed !== undefined) return parsed
            }
          }
          return undefined
        }
        const reversePickup = readAnyBoolean([
          'reverse_pickup',
          'reversePickup',
          'reverse.pickup',
          'details.reverse_pickup',
        ])
        const reverseDrop = readAnyBoolean([
          'reverse_drop',
          'reverseDrop',
          'reverse.drop',
          'details.reverse_drop',
        ])

        if (reversePickup === false || reverseDrop === false) {
          throw new HttpError(
            400,
            `Ekart reverse pickup is not serviceable between pickup pincode ${originPin} and destination pincode ${destinationPin} for order ${orderNumber ?? 'unknown'}.`,
          )
        }
      } else if (normalizedPaymentType === 'COD' && resp.codAvailable === false) {
        throw new HttpError(
          400,
          `Ekart COD is not serviceable for destination pincode ${destinationPin}. Please choose prepaid or another courier.`,
        )
      }

      if (normalizedPaymentType === 'Prepaid' && resp.prepaidAvailable === false) {
        throw new HttpError(
          400,
          `Ekart prepaid delivery is not serviceable for destination pincode ${destinationPin}. Please choose another courier.`,
        )
      }

      console.log('[Ekart] Serviceability pre-check passed', {
        order_number: orderNumber,
        origin_pin: originPin,
        destination_pin: destinationPin,
        payment_type: normalizedPaymentType,
        tat: resp.tat,
        records: resp.records?.length ?? 0,
      })

      return resp
    } catch (error: any) {
      if (error instanceof HttpError) {
        throw error
      }
      console.error('❌ Ekart serviceability validation failed:', error?.message || error)
      throw new HttpError(
        502,
        `Ekart serviceability validation failed. ${error?.message || 'Please try again later.'}`,
      )
    }
  }

  let selectedDelhiveryCourierId: number | null = null
  let selectedDelhiveryShippingMode: 'Express' | 'Surface' | null = null
  const parseSelectedMaxSlabWeight = (value: unknown, courierOptionKey: unknown) => {
    const directValue = Number(value)
    if (Number.isFinite(directValue) && directValue > 0) {
      return directValue
    }

    const rawOptionKey = String(courierOptionKey || '')
    if (!rawOptionKey) return null

    const parts = rawOptionKey.split('__')
    const lastPart = parts[parts.length - 1]
    if (!lastPart || lastPart === 'base') return null

    const parsedValue = Number(lastPart)
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null
  }

  const parseSelectedRateCardId = (value: unknown, courierOptionKey: unknown) => {
    const directValue = String(value || '').trim()
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(directValue)) {
      return directValue
    }

    const rawOptionKey = String(courierOptionKey || '')
    if (!rawOptionKey) return null

    const parts = rawOptionKey.split('__')
    return (
      parts.find((part) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part),
      ) || null
    )
  }

  // 🔹 Derive integration_type from courier_id if not provided
  // IMPORTANT: courier_id and courier_name are NOT unique across service providers
  // The composite key in the database is (courier_id, serviceProvider)
  // Since both can be duplicated, we cannot accurately identify a courier without integration_type
  const resolveSelectedDelhiveryShippingMode = async (
    courierId: number,
  ): Promise<DelhiveryShippingMode | null> => {
    const directMode = resolveDelhiveryShippingMode({
      mode: params.shipping_mode,
      courierName: params.courier_partner,
    })
    if (directMode) return directMode

    const rateRows = await db
      .select({
        mode: shippingRates.mode,
        courierName: shippingRates.courier_name,
        type: shippingRates.type,
      })
      .from(shippingRates)
      .where(
        and(
          eq(shippingRates.courier_id, courierId),
          eq(shippingRates.business_type, 'b2c'),
          or(
            sql`lower(coalesce(${shippingRates.service_provider}, '')) = 'delhivery'`,
            ilike(shippingRates.courier_name, '%delhivery%'),
          ),
        ),
      )
      .orderBy(desc(shippingRates.last_updated), desc(shippingRates.created_at))
      .limit(20)

    const forwardRateMode = rateRows
      .filter((row) => String(row.type || '').toLowerCase() === 'forward')
      .map((row) =>
        resolveDelhiveryShippingMode({
          mode: row.mode,
          courierName: row.courierName,
        }),
      )
      .find((mode): mode is DelhiveryShippingMode => Boolean(mode))
    if (forwardRateMode) return forwardRateMode

    const anyRateMode = rateRows
      .map((row) =>
        resolveDelhiveryShippingMode({
          mode: row.mode,
          courierName: row.courierName,
        }),
      )
      .find((mode): mode is DelhiveryShippingMode => Boolean(mode))
    if (anyRateMode) return anyRateMode

    const courierRows = await db
      .select({
        name: couriers.name,
      })
      .from(couriers)
      .where(
        and(
          eq(couriers.id, courierId),
          sql`lower(coalesce(${couriers.serviceProvider}, '')) = 'delhivery'`,
        ),
      )
      .limit(10)

    for (const row of courierRows) {
      const mode = resolveDelhiveryShippingMode({ courierId, courierName: row.name })
      if (mode) return mode
    }

    return getDelhiveryShippingModeByCourierId(courierId)
  }

  // The serviceability API returns integration_type with each courier - it should be included in the request
  if (!params.integration_type && params.courier_id) {
    try {
      console.log(
        `⚠️ integration_type not provided, attempting to derive from courier_id: ${
          params.courier_id
        }${params.courier_partner ? `, courier_partner: ${params.courier_partner}` : ''}`,
      )

      // First, get all couriers matching the courier_id
      const matchingCouriers = await db
        .select({
          serviceProvider: couriers.serviceProvider,
          name: couriers.name,
          id: couriers.id,
        })
        .from(couriers)
        .where(and(eq(couriers.id, Number(params.courier_id)), eq(couriers.isEnabled, true)))

      if (matchingCouriers.length === 0) {
        // No courier found - require integration_type to be explicitly provided
        throw new HttpError(
          400,
          `Courier with id ${params.courier_id} not found. Please provide integration_type or provider_code along with courier_id for accurate matching.`,
        )
      } else if (matchingCouriers.length === 1) {
        // Only one courier with this ID - use it directly
        const matchedCourier = matchingCouriers[0]
        const serviceProvider = matchedCourier.serviceProvider?.toLowerCase().trim()
        if (serviceProvider === 'delhivery') {
          params.integration_type = 'delhivery'
          console.log(
            `✅ Derived integration_type: ${params.integration_type} from courier_id: ${params.courier_id} (courier: ${matchedCourier.name})`,
          )
        } else if (serviceProvider === 'ekart') {
          params.integration_type = 'ekart'
          console.log(
            `✅ Derived integration_type: ${params.integration_type} from courier_id: ${params.courier_id} (courier: ${matchedCourier.name})`,
          )
        } else if (serviceProvider === 'shadowfax') {
          params.integration_type = 'shadowfax'
          console.log(
            `✅ Derived integration_type: ${params.integration_type} from courier_id: ${params.courier_id} (courier: ${matchedCourier.name})`,
          )
        } else if (serviceProvider === 'xpressbees') {
          params.integration_type = 'xpressbees'
          console.log(
            `âœ… Derived integration_type: ${params.integration_type} from courier_id: ${params.courier_id} (courier: ${matchedCourier.name})`,
          )
        } else if (serviceProvider === 'amazon') {
          params.integration_type = 'amazon'
          console.log(
            `âœ… Derived integration_type: ${params.integration_type} from courier_id: ${params.courier_id} (courier: ${matchedCourier.name})`,
          )
        } else if (serviceProvider === 'innofulfill') {
          params.integration_type = 'innofulfill'
          console.log(
            `Derived integration_type: ${params.integration_type} from courier_id: ${params.courier_id} (courier: ${matchedCourier.name})`,
          )
        } else {
          throw new HttpError(
            400,
            `Unsupported serviceProvider: ${serviceProvider}. Supported providers: delhivery, ekart, xpressbees, shadowfax, amazon, innofulfill.`,
          )
        }
      } else {
        // Multiple couriers with same ID (different service providers)
        // Since courier names can also be duplicated across providers, we cannot accurately match
        // without integration_type. The composite key is (courier_id, serviceProvider).
        const availableProviders = matchingCouriers.map((c) => c.serviceProvider).join(', ')
        const uniqueCourierNames = [...new Set(matchingCouriers.map((c) => c.name))].join(', ')

        throw new HttpError(
          400,
          `Multiple couriers found with id ${params.courier_id} across different service providers: [${availableProviders}]. ` +
            `Since courier IDs and names can both be duplicated across service providers, ` +
            `integration_type or provider_code is REQUIRED for accurate matching. ` +
            `Please include either integration_type or provider_code from the serviceability API response. ` +
            `Found courier names: ${uniqueCourierNames}`,
        )
      }
    } catch (error: any) {
      // If it's already an HttpError, re-throw it
      if (error instanceof HttpError) {
        throw error
      }
      // Otherwise, log and throw a generic error requiring integration_type
      console.error(`❌ Error looking up courier_id ${params.courier_id}:`, error.message)
      throw new HttpError(
        500,
        `Error looking up courier: ${error.message}. Please provide integration_type or provider_code along with courier_id.`,
      )
    }
  }

  // If still no integration_type (and no courier_id was provided to derive it), default to 'delhivery'
  // Note: This fallback is only for backward compatibility when neither integration_type nor courier_id is provided
  // When courier_id is provided without integration_type, an error is thrown above if it cannot be determined
  if (!params.integration_type) {
    console.warn(
      `⚠️ integration_type not provided and courier_id not available, defaulting to 'delhivery'`,
    )
    params.integration_type = 'delhivery'
  }

  const effectiveIntegrationType = String(params.integration_type || '').toLowerCase()

  if (effectiveIntegrationType === 'delhivery') {
    selectedDelhiveryCourierId = normalizeCourierId(params.courier_id)
    if (selectedDelhiveryCourierId === null) {
      throw new HttpError(
        400,
        'Delhivery courier_id is required to lock the selected Air/Express or Surface service.',
      )
    }
    const shippingMode = await resolveSelectedDelhiveryShippingMode(selectedDelhiveryCourierId)
    if (!shippingMode) {
      throw new HttpError(
        400,
        `Invalid Delhivery courier selection: courier_id ${selectedDelhiveryCourierId} does not map to Air/Express or Surface.`,
      )
    }
    selectedDelhiveryShippingMode = shippingMode
    params.shipping_mode = shippingMode
    console.log('🧭 Delhivery service selected (panel)', {
      order_number: params.order_number,
      courier_id: selectedDelhiveryCourierId,
      shipping_mode: selectedDelhiveryShippingMode,
    })
  }

  const selectedMaxSlabWeight = parseSelectedMaxSlabWeight(
    params.selected_max_slab_weight,
    params.courier_option_key,
  )
  const selectedRateCardId = parseSelectedRateCardId(
    params.selected_rate_card_id,
    params.courier_option_key,
  )

  let resolvedPickupWarehouse: PickupWarehouseRecord | null = null
  if (params.pickup_location_id) {
    resolvedPickupWarehouse = await fetchPickupWarehouseRecord(userId, params.pickup_location_id)
    if (!resolvedPickupWarehouse) {
      throw new HttpError(
        400,
        'Pickup warehouse not found or not enabled. Please select a valid pickup location.',
      )
    }

    params.pickup = buildPickupFromWarehouse(
      resolvedPickupWarehouse,
      params.pickup,
      params.pickup_date,
      params.pickup_time,
    )
    params.pickup_location_alias = params.pickup?.warehouse_name || params.pickup_location_alias
    params.return_location_alias =
      params.rto?.warehouse_name || params.return_location_alias || params.pickup_location_alias

    const resolvedPincode = resolvedPickupWarehouse.pincode?.trim()
    if (resolvedPincode) {
      params.origin = resolvedPincode
      params.source_pincode = resolvedPincode
      params.pickup_pincode = resolvedPincode as any
    }

    console.log('📍 Resolved pickup warehouse for Delhivery order', {
      order_number: params.order_number,
      pickup_location_id: params.pickup_location_id,
      pickup_id: resolvedPickupWarehouse.pickupId,
      warehouse_name: params.pickup?.warehouse_name,
      city: resolvedPickupWarehouse.city,
      state: resolvedPickupWarehouse.state,
      pincode: resolvedPickupWarehouse.pincode,
    })
  }

  // ✅ Ensure pickup details are present (especially for Delhivery)
  const isMissingPickupField = (val?: string) => !val || val.toString().trim().length === 0
  const pickup = params.pickup || ({} as ShipmentParams['pickup'])
  const pickupIncomplete =
    !pickup ||
    isMissingPickupField(pickup.warehouse_name) ||
    isMissingPickupField(pickup.address) ||
    isMissingPickupField(pickup.city) ||
    isMissingPickupField(pickup.state) ||
    isMissingPickupField(pickup.pincode) ||
    isMissingPickupField(pickup.phone)

  if (pickupIncomplete) {
    try {
      const searchTerm = pickup?.warehouse_name?.trim()
      const conditions: any[] = [eq(pickupAddresses.userId, userId)]
      if (searchTerm) {
        conditions.push(
          or(
            ilike(addresses.addressNickname, `%${searchTerm}%`),
            ilike(addresses.contactName, `%${searchTerm}%`),
          ),
        )
      }

      const [pickupRow] = await db
        .select({
          addressNickname: addresses.addressNickname,
          addressLine1: addresses.addressLine1,
          addressLine2: addresses.addressLine2,
          city: addresses.city,
          state: addresses.state,
          pincode: addresses.pincode,
          contactName: addresses.contactName,
          contactPhone: addresses.contactPhone,
          gstNumber: addresses.gstNumber,
        })
        .from(pickupAddresses)
        .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
        .where(and(...conditions))
        .orderBy(desc(pickupAddresses.isPrimary))
        .limit(1)

      if (pickupRow) {
        const warehouseName =
          effectiveIntegrationType === 'ekart'
            ? pickupRow.addressNickname || pickup.warehouse_name || pickupRow.contactName || ''
            : pickup.warehouse_name || pickupRow.addressNickname || ''
        params.pickup = {
          warehouse_name: warehouseName,
          address: pickup.address || pickupRow.addressLine1 || '',
          address_2: pickup.address_2 || pickupRow.addressLine2 || undefined,
          city: pickup.city || pickupRow.city || '',
          state: pickup.state || pickupRow.state || '',
          pincode: pickup.pincode || pickupRow.pincode || '',
          phone: pickup.phone || pickupRow.contactPhone || '',
          name: pickup.name || pickupRow.contactName || '',
          gst_number: pickup.gst_number || pickupRow.gstNumber || undefined,
          pickup_date: pickup.pickup_date,
          pickup_time: pickup.pickup_time,
        }
        if (effectiveIntegrationType === 'ekart' && warehouseName) {
          params.pickup_location_alias = warehouseName
          params.return_location_alias = params.return_location_alias || warehouseName
        }
      }
    } catch (err: any) {
      console.warn('⚠️ Failed to resolve pickup address from DB:', err?.message || err)
    }
  }

  if (params.consignee) {
    const normalizedConsigneePhone = normalizeIndianPhoneForBooking(params.consignee.phone)
    if (normalizedConsigneePhone) {
      params.consignee.phone = normalizedConsigneePhone
    }
  }

  const requiredConsigneeFields = ['name', 'address', 'city', 'state', 'pincode', 'phone'] as const
  const consignee = params.consignee || ({} as ShipmentParams['consignee'])
  const missingConsigneeFields = requiredConsigneeFields.filter(
    (field) => !consignee[field] || String(consignee[field]).trim().length === 0,
  )
  if (missingConsigneeFields.length > 0) {
    throw new HttpError(
      400,
      `Consignee details incomplete. Missing fields: ${missingConsigneeFields.join(
        ', ',
      )}. Please provide full buyer information before booking.`,
    )
  }

  const normalizedPaymentType = params.payment_type?.trim().toLowerCase()
  if (!normalizedPaymentType || !['cod', 'prepaid', 'reverse'].includes(normalizedPaymentType)) {
    throw new HttpError(
      400,
      'payment_type is required and must be either cod, prepaid, or reverse when booking with Delhivery.',
    )
  }
  params.payment_type = normalizedPaymentType as ShipmentParams['payment_type']
  const isReverseShipment = params.isReverse === true || normalizedPaymentType === 'reverse'

  const orderAmount = Number(params.order_amount ?? 0)
  if (!isReverseShipment && (!orderAmount || Number.isNaN(orderAmount))) {
    throw new HttpError(
      400,
      'order_amount is required and must be greater than 0 for Delhivery bookings.',
    )
  }

  const invoiceNumber = String(params.invoice_number ?? '').trim()
  // if (!invoiceNumber) {
  //   throw new HttpError(
  //     400,
  //     'invoice_number is mandatory for Delhivery B2C manifests. Provide the seller invoice number before booking.',
  //   )
  // }
  params.invoice_number = invoiceNumber

  const orderItems = Array.isArray(params.order_items) ? params.order_items : []
  const hsnCodes = orderItems
    .map((item) => (item?.hsn || item?.hsnCode || '').toString().trim())
    .filter((code) => code.length > 0)
  // if (hsnCodes.length === 0) {
  //   throw new HttpError(
  //     400,
  //     'At least one HSN code is required for Delhivery shipments (per official API requirements). Please include HSN/SAC for your products.',
  //   )
  // }

  // Fill seller/company metadata from user profile (if not explicitly provided).
  // Delhivery UI uses this for "Seller Details" and GST visibility.
  try {
    const [profile] = await db
      .select({
        brandName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
        businessName: sql<string>`(${userProfiles.companyInfo} ->> 'businessName')`,
        companyGst: sql<string>`COALESCE((${userProfiles.companyInfo} ->> 'companyGst'), (${userProfiles.companyInfo} ->> 'companyGST'), '')`,
        gstin: sql<string>`COALESCE((${userProfiles.companyInfo} ->> 'gstin'), (${userProfiles.companyInfo} ->> 'GSTIN'), '')`,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1)

    const resolvedCompanyName =
      params.company?.name ||
      profile?.businessName ||
      profile?.brandName ||
      params.pickup?.name ||
      ''
    const resolvedCompanyGst =
      params.company?.gst ||
      profile?.companyGst ||
      profile?.gstin ||
      params.pickup?.gst_number ||
      ''

    params.company = {
      ...(params.company || {}),
      name: resolvedCompanyName || 'Shiplifi',
      gst: resolvedCompanyGst || '',
    }

    if (!params.pickup?.name && resolvedCompanyName) {
      params.pickup = {
        ...(params.pickup || ({} as ShipmentParams['pickup'])),
        name: resolvedCompanyName,
      }
    }
  } catch (profileErr: any) {
    console.warn(
      '⚠️ Failed to resolve company metadata for shipment:',
      profileErr?.message || profileErr,
    )
  }

  // Hard validation: do not call Delhivery with incomplete pickup details.
  // Otherwise Delhivery may accept booking but show null pickup address/seller fields.
  const requiredPickupFields: Array<keyof ShipmentParams['pickup']> = [
    'warehouse_name',
    'address',
    'city',
    'state',
    'pincode',
    'phone',
  ]
  const missingPickupFields = requiredPickupFields.filter((key) =>
    isMissingPickupField(params.pickup?.[key] as string | undefined),
  )
  if (missingPickupFields.length > 0) {
    throw new HttpError(
      400,
      `Pickup details incomplete. Missing fields: ${missingPickupFields.join(', ')}. Please select a valid pickup address and retry.`,
    )
  }
  // 💰 PRE-CHECK: Validate wallet balance BEFORE creating shipments with service providers
  const bookingPickupPincode = normalizePincode(
    params.origin ??
      params.pickup?.pincode ??
      params.pickup_pincode ??
      params.source_pincode ??
      undefined,
  )
  const bookingDestinationPincode = normalizePincode(
    params.destination ?? params.consignee?.pincode ?? params.destination_pincode,
  )

  if (!bookingPickupPincode || !bookingDestinationPincode) {
    throw new HttpError(400, 'Pickup and destination pincodes are required to book with Delhivery.')
  }

  let otherCharges = Number(params?.other_charges ?? 0)
  const shippingCharges = Number(params?.shipping_charges ?? 0)
  const totalShippingCharges = shippingCharges + otherCharges
  let freightCharges = Number(params?.freight_charges ?? 0)
  const isCodOrder = params.payment_type === 'cod'
  let codCharges = isCodOrder ? Number(params?.cod_charges ?? 0) : 0
  const discount = Number(params?.discount ?? 0)
  const giftWrap = Number(params?.gift_wrap ?? 0)
  const transactionFee = Number(params?.transaction_fee ?? 0)
  const prepaidAmt = Number(params?.prepaid_amount ?? 0)
  const freightOriginPincode = isReverseShipment ? bookingDestinationPincode : bookingPickupPincode
  const freightDestinationPincode = isReverseShipment
    ? normalizePincode(params.rto?.pincode ?? params.pickup?.pincode ?? bookingPickupPincode)
    : bookingDestinationPincode

  const courierIdForRate =
    selectedDelhiveryCourierId ?? (params.courier_id ? Number(params.courier_id) : null)

  let slabbedFreight: {
    freight: number
    volumetric_weight: number | null
    chargeable_weight: number | null
    slabs: number | null
    cod_charges?: number | null
    cod_percent?: number | null
    other_charges?: number | null
    rate_card_mode?: string | null
    rate_card_courier_name?: string | null
    rate_card_service_provider?: string | null
  } = {
    freight: freightCharges,
    volumetric_weight: null,
    chargeable_weight: null,
    slabs: null,
  }

  if (courierIdForRate && freightOriginPincode && freightDestinationPincode) {
    try {
      const computedFreight = await computeB2CFreightForOrder({
        userId,
        courierId: courierIdForRate,
        serviceProvider: params.integration_type ?? null,
        mode: selectedDelhiveryShippingMode ?? null,
        selectedRateCardId,
        selectedMaxSlabWeight,
        zoneIdOverride: params.zone_id ?? null,
        destinationPincode: freightDestinationPincode,
        originPincode: freightOriginPincode,
        weightG: normalizeServiceabilityWeightToGrams(params.package_weight ?? params.weight ?? 0),
        lengthCm: Number(params.package_length ?? params.length ?? 0),
        breadthCm: Number(params.package_breadth ?? params.breadth ?? 0),
        heightCm: Number(params.package_height ?? params.height ?? 0),
        orderAmount: Number(params.order_amount ?? 0),
        isReverse: isReverseShipment,
      })
      if (computedFreight?.freight !== undefined) {
        slabbedFreight = computedFreight
        freightCharges = Number(computedFreight.freight)
        otherCharges = Number(computedFreight.other_charges ?? 0)
        params.freight_charges = freightCharges
        params.other_charges = otherCharges
        if (isCodOrder) {
          codCharges = Number(computedFreight.cod_charges ?? codCharges)
          params.cod_charges = codCharges
        }
      }
    } catch (freightErr: any) {
      console.error('❌ Failed to compute slab-based freight; aborting shipment creation', {
        order_number: params.order_number,
        error: freightErr?.message || freightErr,
        pickup_pincode: freightOriginPincode,
        destination_pincode: freightDestinationPincode,
        courier_id: courierIdForRate,
      })
      if (freightErr instanceof HttpError) {
        throw freightErr
      }
      throw new HttpError(
        400,
        freightErr?.message || 'Unable to compute freight for selected courier/zone',
      )
    }
  }

  if (!Number.isFinite(freightCharges) || freightCharges <= 0) {
    throw new HttpError(
      400,
      isReverseShipment
        ? 'No reverse pickup rate card freight available for selected courier/zone'
        : 'No Shiplifi rate card freight available for selected courier/zone',
    )
  }

  const paymentSettings = await getPaymentOptions()
  const configuredGstPercent = Number(paymentSettings.gstPercent ?? WALLET_TRANSACTION_GST_PERCENT)
  const configuredRazorpayChargeEnabled = Boolean(paymentSettings.razorpayChargeEnabled)
  const configuredRazorpayChargePercent = Number(paymentSettings.razorpayChargePercent ?? 0)
  let estimatedWalletDebit = 0
  let estimatedWalletBaseDebit = 0
  let estimatedWalletBaseDebitBeforeRazorpay = 0
  let estimatedWalletRazorpayChargeAmount = 0
  let estimatedWalletGstAmount = 0
  {
    const estimatedTaxBreakup = calculateBookingWalletDebit({
      paymentType: params.payment_type,
      freightCharges,
      otherCharges,
      codCharges,
      gstPercent: configuredGstPercent,
      razorpayChargeEnabled: configuredRazorpayChargeEnabled,
      razorpayChargePercent: configuredRazorpayChargePercent,
    })
    estimatedWalletBaseDebit = estimatedTaxBreakup.baseAmount
    estimatedWalletBaseDebitBeforeRazorpay = estimatedTaxBreakup.baseAmountBeforeRazorpay
    estimatedWalletRazorpayChargeAmount = estimatedTaxBreakup.razorpayChargeAmount
    estimatedWalletDebit = estimatedTaxBreakup.totalAmount
    estimatedWalletGstAmount = estimatedTaxBreakup.gstAmount

    if (estimatedWalletDebit > 0) {
      const [userWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1)
      if (!userWallet) {
        throw new Error('Wallet not found')
      }
      const walletBalance = Number(userWallet?.balance ?? 0)

      console.log('💳 Pre-checking wallet balance before shipment creation:', {
        order_number: params.order_number,
        payment_type: params.payment_type,
        wallet_balance: walletBalance,
        estimated_wallet_base_debit: estimatedWalletBaseDebit,
        estimated_wallet_base_debit_before_razorpay: estimatedWalletBaseDebitBeforeRazorpay,
        razorpay_charge_enabled: configuredRazorpayChargeEnabled,
        razorpay_charge_percent: configuredRazorpayChargePercent,
        razorpay_charge_amount: estimatedWalletRazorpayChargeAmount,
        gst_percent: configuredGstPercent,
        gst_amount: estimatedWalletGstAmount,
        gst_included_in_wallet_debit: true,
        estimated_wallet_debit: estimatedWalletDebit,
        freight_charges: freightCharges,
        other_charges: otherCharges,
        cod_charges: isCodOrder ? codCharges : 0,
      })

      if (walletBalance < estimatedWalletDebit) {
        const errorMessage =
          isReverseShipment
            ? 'Insufficient wallet balance for reverse shipment'
            : params.payment_type === 'prepaid'
              ? 'Insufficient wallet balance for prepaid order'
              : 'Insufficient wallet balance for COD service charges'
        console.error('❌ Wallet balance check failed:', {
          wallet_balance: walletBalance,
          required_amount: estimatedWalletDebit,
          shortfall: estimatedWalletDebit - walletBalance,
          razorpay_charge_enabled: configuredRazorpayChargeEnabled,
          razorpay_charge_percent: configuredRazorpayChargePercent,
          razorpay_charge_amount: estimatedWalletRazorpayChargeAmount,
          gst_percent: configuredGstPercent,
          gst_amount: estimatedWalletGstAmount,
          gst_included_in_wallet_debit: true,
        })
        throw new Error(errorMessage)
      }
    }
  }

  const persistManifestFailureOrder = async (failure: DelhiveryManifestError) => {
    try {
      await db.transaction(async (tx) => {
        const failureDetails = failure.details || {}
        const failureShipmentData = {
          courier_name: 'Delhivery',
          courier_id: params.courier_id ? Number(params.courier_id) : null,
          manifest: failureDetails.upload_wbn ?? failureDetails.shipment_id ?? null,
          shipment_id: failureDetails.shipment_id ?? failureDetails.upload_wbn ?? null,
          sort_code: failureDetails.sort_code ?? null,
        }

        if (options.existingOrderId) {
          await updateExistingB2COrderWithShipment({
            tx,
            existingOrderId: options.existingOrderId,
            params,
            shipmentData: failureShipmentData,
            userId,
            shippingCharges: totalShippingCharges,
            otherCharges,
            freightCharges,
            razorpayChargeEnabled: configuredRazorpayChargeEnabled,
            razorpayChargePercent: configuredRazorpayChargePercent,
            razorpayChargeAmount: estimatedWalletRazorpayChargeAmount,
            gstPercent: configuredGstPercent,
            gstAmount: estimatedWalletGstAmount,
            walletDebitAmount: estimatedWalletDebit,
            courierCost: null,
            transactionFee,
            giftWrap,
            discount,
            status: 'manifest_failed',
            manifestError: failure.message,
            integration_type: params?.integration_type!,
            volumetricWeight: slabbedFreight.volumetric_weight ?? undefined,
            chargedWeight: slabbedFreight.chargeable_weight ?? undefined,
            chargedSlabs: slabbedFreight.slabs ?? undefined,
            shippingMode: selectedDelhiveryShippingMode ?? null,
            selectedMaxSlabWeight,
          })
          console.log('⚠️ Delhivery manifest failure stored on existing order', {
            order_id: options.existingOrderId,
          })
          return
        }

        const failureOrder = await createB2COrder({
          tx,
          params,
          shipmentData: failureShipmentData,
          userId,
          shippingCharges: totalShippingCharges,
          otherCharges,
          freightCharges,
          razorpayChargeEnabled: configuredRazorpayChargeEnabled,
          razorpayChargePercent: configuredRazorpayChargePercent,
          razorpayChargeAmount: estimatedWalletRazorpayChargeAmount,
          gstPercent: configuredGstPercent,
          gstAmount: estimatedWalletGstAmount,
          walletDebitAmount: estimatedWalletDebit,
          courierCost: null,
          transactionFee,
          giftWrap,
          discount,
          status: 'manifest_failed',
          manifestError: failure.message,
          integration_type: params?.integration_type!,
          is_external_api,
          volumetricWeight: slabbedFreight.volumetric_weight ?? undefined,
          chargedWeight: slabbedFreight.chargeable_weight ?? undefined,
          chargedSlabs: slabbedFreight.slabs ?? undefined,
          shippingMode: selectedDelhiveryShippingMode ?? null,
          selectedMaxSlabWeight,
        })
        console.log('⚠️ Delhivery manifest failure stored as order', {
          order_id: failureOrder?.id,
        })
      })
    } catch (err: any) {
      console.error('❌ Failed to persist manifest failure order:', err?.message || err)
    }
  }

  let shipmentData: any = null
  let shipmentMeta: {
    shipment_id?: string
    awb_number?: string
    courier_name?: string
    courier_id?: string | number | null
    label?: string
    manifest?: string
    courier_cost?: number | null // Actual courier cost from API response
    sort_code?: string | null
    provider_reference?: string
    provider_request_id?: string
    provider_service?: string
    provider_mode?: string
    provider_flow?: string
    provider_manifest_id?: string | null
    provider_manifest_status?: string
    provider_manifested_at?: string
    pickup_vendor_code?: string
    manifest_attempts?: any
    xpressbees?: any
    innofulfill?: any
    amazon_rate_id?: string
    amazon_carrier_id?: string
    amazon_tracking_id?: string
    amazon_shipment_id?: string | null
    amazon_package_client_reference_id?: string | null
    amazon_label?: string | null
  } = {}

  const rollbackActions: Array<() => Promise<void>> = []

  // Check if this is a reverse shipment
  const originalOrderId = params.original_order_id || params.order_id

  try {
    // 1️⃣ CREATE SHIPMENT
    const requestedIntegrationType = String(params.integration_type || '').toLowerCase()
    const allowedIntegrationTypes = ['delhivery', 'ekart', 'xpressbees', 'shadowfax', 'amazon', 'innofulfill']
    if (!requestedIntegrationType || !allowedIntegrationTypes.includes(requestedIntegrationType)) {
      throw new Error(
        `Invalid integration_type: ${params.integration_type}. Supported values: delhivery, ekart, xpressbees, shadowfax, amazon, innofulfill.`,
      )
    }

    const integrationType = requestedIntegrationType as
      | 'delhivery'
      | 'ekart'
      | 'xpressbees'
      | 'shadowfax'
      | 'amazon'
      | 'innofulfill'
    const providerName =
      integrationType === 'delhivery'
        ? 'Delhivery'
        : integrationType === 'ekart'
          ? 'Ekart Logistics'
          : integrationType === 'xpressbees'
            ? 'Xpressbees'
            : integrationType === 'shadowfax'
              ? 'Shadowfax'
              : integrationType === 'amazon'
                ? 'Amazon Shipping'
                : 'Innofulfill'

    if (!isReverseShipment) {
      const orderDateRaw =
        params.order_date instanceof Date ? params.order_date.toISOString() : params.order_date
      const bookingPickupSchedule = normalizePickupSchedule({
        pickupDateRaw:
          params.pickup_date ||
          params.pickup?.pickup_date ||
          orderDateRaw ||
          new Date().toISOString(),
        pickupTimeRaw: params.pickup_time || params.pickup?.pickup_time || getDefaultPickupTime(),
        isManifestRetry: false,
      })

      params.pickup_date = bookingPickupSchedule.pickupDate
      params.pickup_time = bookingPickupSchedule.pickupTime
      params.pickup = {
        ...(params.pickup || ({} as ShipmentParams['pickup'])),
        pickup_date: bookingPickupSchedule.pickupDate,
        pickup_time: bookingPickupSchedule.pickupTime,
      }
      if (integrationType === 'shadowfax' && !params.preferred_dispatch_date) {
        params.preferred_dispatch_date = bookingPickupSchedule.pickupDate
      }

      console.log(`[${providerName}] Booking pickup schedule resolved`, {
        order_number: params.order_number,
        pickup_date: bookingPickupSchedule.pickupDate,
        pickup_time: bookingPickupSchedule.pickupTime,
      })
    }

    let shipmentSuccessPackage: any = null
    let providerCourierCost: number | null = null
    let providerSortCode: string | null = null
    if (integrationType === 'delhivery') {
      console.log(
        isReverseShipment
          ? '→ Using Delhivery Reverse Shipment API...'
          : '→ Creating Delhivery shipment now; pickup request will be scheduled after booking...',
      )
      const delhivery = new DelhiveryService()
      delhiveryService = delhivery

      if (isReverseShipment) {
        let originalOrder: typeof b2c_orders.$inferSelect | null = null
        if (originalOrderId) {
          ;[originalOrder] = await db
            .select()
            .from(b2c_orders)
            .where(and(eq(b2c_orders.id, originalOrderId), eq(b2c_orders.user_id, userId)))
            .limit(1)

          if (!originalOrder) {
            throw new Error('Original order not found for reverse shipment')
          }
        }

        shipmentData = await delhivery.createReverseShipment({
          originalAwb: originalOrder?.awb_number || '',
          originalOrderId: originalOrder?.order_number || params.order_number,
          consignee: params.consignee,
          pickup: params.pickup,
          rto: params.rto,
          order_amount: params.order_amount,
          package_weight: params.package_weight,
          package_length: params.package_length,
          package_breadth: params.package_breadth,
          package_height: params.package_height,
          order_items: params.order_items,
        })
      } else {
        const originPin = bookingPickupPincode
        const destinationPin = bookingDestinationPincode

        await ensureDelhiveryServiceable({
          delhivery,
          originPin,
          destinationPin,
          paymentType: params.payment_type,
          productType: params.product_type || params.productType,
          orderNumber: params.order_number,
        })

        const pickupAddress = [
          resolvedPickupWarehouse?.addressLine1 || params.pickup?.address,
          resolvedPickupWarehouse?.addressLine2 || params.pickup?.address_2,
          resolvedPickupWarehouse?.landmark,
        ]
          .map((part) => String(part || '').trim())
          .filter(Boolean)
          .join(', ')
        const returnAddress = [
          params.rto?.address || pickupAddress,
          params.rto?.address_2,
        ]
          .map((part) => String(part || '').trim())
          .filter(Boolean)
          .join(', ')

        shipmentData = await delhivery.createShipmentWithWarehouseRecovery(params, {
          name: String(params.pickup?.warehouse_name || '').trim(),
          registered_name: String(
            params.company?.name || params.pickup?.name || 'Pax Logistics',
          ).trim(),
          phone: String(params.pickup?.phone || resolvedPickupWarehouse?.contactPhone || '').trim(),
          email: String(resolvedPickupWarehouse?.contactEmail || '').trim() || undefined,
          address: pickupAddress,
          city: String(params.pickup?.city || resolvedPickupWarehouse?.city || '').trim(),
          pin: String(params.pickup?.pincode || resolvedPickupWarehouse?.pincode || '').trim(),
          country: String(
            params.pickup?.country || resolvedPickupWarehouse?.country || 'India',
          ).trim(),
          return_address: returnAddress || pickupAddress,
          return_city: String(params.rto?.city || params.pickup?.city || '').trim(),
          return_pin: String(params.rto?.pincode || params.pickup?.pincode || '').trim(),
          return_state: String(params.rto?.state || params.pickup?.state || '').trim(),
          return_country: String(
            params.rto?.country || params.pickup?.country || 'India',
          ).trim(),
        })
      }

      if (isReverseShipment) {
        if (!shipmentData?.awb_number && !shipmentData?.packages?.length) {
          console.error('❌ Invalid Delhivery reverse shipment:', shipmentData)
          throw new HttpError(500, 'Delhivery reverse shipment creation failed')
        }
      } else {
        const shipmentPackage = shipmentData?.packages?.[0] || null
        if (!shipmentPackage?.waybill && !shipmentData?.awb_number) {
          console.error('❌ Invalid Delhivery shipment:', shipmentData)
          throw new HttpError(500, 'Delhivery shipment creation failed')
        }
      }

      shipmentSuccessPackage = isReverseShipment
        ? shipmentData.packages?.[0] || { waybill: shipmentData.awb_number }
        : shipmentData.packages?.[0] || { waybill: shipmentData.awb_number }

      providerCourierCost =
        shipmentSuccessPackage?.charge ||
        shipmentSuccessPackage?.amount ||
        shipmentData?.charge ||
        shipmentData?.amount ||
        params?.courier_cost ||
        null

      providerSortCode =
        shipmentSuccessPackage?.sort_code ??
        shipmentSuccessPackage?.sortCode ??
        shipmentData?.packages?.[0]?.sort_code ??
        null

      shipmentMeta = {
        shipment_id: shipmentData.upload_wbn ?? shipmentData.shipment_id ?? undefined,
        awb_number: shipmentSuccessPackage?.waybill ?? shipmentData.awb_number ?? undefined,
        courier_name: 'Delhivery',
        courier_id: params.courier_id ? Number(params.courier_id) : null,
        label: undefined,
        manifest: undefined,
        courier_cost: providerCourierCost,
        sort_code: providerSortCode,
        provider_reference: shipmentData.upload_wbn ?? shipmentData.shipment_id ?? undefined,
      }
    } else if (integrationType === 'ekart') {
      console.log('→ Using Ekart API...')
      const ekart = new EkartService()
      await ensureEkartServiceable({
        ekart,
        originPin: isReverseShipment ? bookingDestinationPincode : bookingPickupPincode,
        destinationPin: isReverseShipment
          ? normalizePincode(params.rto?.pincode ?? params.pickup?.pincode ?? bookingPickupPincode) ||
            bookingPickupPincode
          : bookingDestinationPincode,
        paymentType: params.payment_type,
        orderAmount: Number(params.order_amount ?? 0),
        packageWeight: Number(params.package_weight ?? params.weight ?? 0),
        packageLength: Number(params.package_length ?? params.length ?? 0),
        packageBreadth: Number(params.package_breadth ?? params.breadth ?? 0),
        packageHeight: Number(params.package_height ?? params.height ?? 0),
        orderNumber: params.order_number,
        isReverse: isReverseShipment,
      })

      if (!params.delayed_dispatch) {
        const ekartSchedule = resolveEkartBookingSchedule(params)
        params.preferred_dispatch_date = ekartSchedule.pickupDate
        params.pickup_date = ekartSchedule.pickupDate
        params.pickup_time = ekartSchedule.pickupTime
        params.pickup = {
          ...(params.pickup || ({} as ShipmentParams['pickup'])),
          pickup_date: ekartSchedule.pickupDate,
          pickup_time: ekartSchedule.pickupTime,
        }
        console.log('[Ekart] Preferred dispatch date resolved for booking', {
          order_number: params.order_number,
          preferred_dispatch_date: params.preferred_dispatch_date,
          pickup_time: params.pickup_time,
        })
      }

      shipmentData = await ekart.createShipment(params)

      const ekartWaybill =
        shipmentData?.awb_number ??
        shipmentData?.tracking_id ??
        shipmentData?.vendor_waybill ??
        null

      if (!ekartWaybill) {
        console.error('❌ Invalid Ekart shipment:', shipmentData)
        throw new HttpError(500, 'Ekart shipment creation failed')
      }

      shipmentSuccessPackage = {
        waybill: ekartWaybill,
        charge: shipmentData?.courier_cost ?? null,
        amount: shipmentData?.amount ?? null,
        shipping_mode: shipmentData?.shipping_mode ?? null,
        service_mode: shipmentData?.service_mode ?? null,
        service_type: shipmentData?.service_type ?? null,
        mode: shipmentData?.mode ?? null,
      }

      providerCourierCost = shipmentData?.courier_cost ?? params?.courier_cost ?? null
      providerSortCode = null

      shipmentMeta = {
        shipment_id:
          shipmentData?.shipment_id ??
          shipmentData?.tracking_id ??
          shipmentData?.awb_number ??
          shipmentData?.vendor_waybill ??
          undefined,
        awb_number: ekartWaybill,
        courier_name: 'Ekart Logistics',
        courier_id: params.courier_id ? Number(params.courier_id) : null,
        label: undefined,
        manifest: undefined,
        courier_cost: providerCourierCost,
        sort_code: providerSortCode,
      }
    } else if (integrationType === 'xpressbees') {
      console.log(
        isReverseShipment
          ? '→ Using Xpressbees Reverse Shipment API...'
          : '→ Using Xpressbees API...',
      )

      const xpressbees = new XpressbeesService()
      let xpressbeesProviderFlow = XPRESSBEES_MANUAL_MANIFEST_FLOW
      let xpressbeesProviderManifestStatus: string | null = null
      let xpressbeesManualAwbReservation: XpressbeesManualAwbReservation | null = null
      const xpressParams = params as ShipmentParams & {
        collectable_amount?: number
        categories?: string
        qccheck?: string | number
        uploadedimage?: string
        uploadedimage_2?: string
        uploadedimage_3?: string
        uploadedimage_4?: string
        product_usage?: string | number
        product_damage?: string | number
        brandname?: string | number
        brandnametype?: string
        productsize?: string | number
        productsizetype?: string
        productcolor?: string | number
        productcolourtype?: string
        consignee?: ShipmentParams['consignee'] & { alternate_phone?: string }
      }

      if (isReverseShipment) {
        xpressbeesProviderFlow = XPRESSBEES_SHIPMENTS2_FLOW
        xpressbeesProviderManifestStatus = null
        let originalOrder: typeof b2c_orders.$inferSelect | null = null
        if (originalOrderId) {
          ;[originalOrder] = await db
            .select()
            .from(b2c_orders)
            .where(and(eq(b2c_orders.id, originalOrderId), eq(b2c_orders.user_id, userId)))
            .limit(1)

          if (!originalOrder) {
            throw new Error('Original order not found for reverse shipment')
          }
        }

        shipmentData = await xpressbees.createReverseShipment({
          order_id: originalOrder?.order_number || params.order_number,
          request_auto_pickup: params.request_auto_pickup || 'yes',
          consignee: {
            name: xpressParams?.consignee?.name,
            address: xpressParams?.consignee?.address,
            address_2: xpressParams?.consignee?.address_2,
            city: xpressParams?.consignee?.city,
            state: xpressParams?.consignee?.state,
            pincode: xpressParams?.consignee?.pincode,
            phone: xpressParams?.consignee?.phone,
            alternate_phone: xpressParams?.consignee?.alternate_phone,
          },
          pickup: params.pickup,
          categories: xpressParams?.categories || 'General',
          product_name: xpressParams?.order_items?.[0]?.name || 'Return Item',
          product_qty: xpressParams?.order_items?.[0]?.qty || 1,
          product_amount: xpressParams?.order_items?.[0]?.price || xpressParams?.order_amount || 0,
          package_weight: params.package_weight,
          package_length: params.package_length,
          package_breadth: params.package_breadth,
          package_height: params.package_height,
          qccheck: xpressParams?.qccheck || '0',
          uploadedimage: xpressParams?.uploadedimage || '',
          uploadedimage_2: xpressParams?.uploadedimage_2 || '',
          uploadedimage_3: xpressParams?.uploadedimage_3 || '',
          uploadedimage_4: xpressParams?.uploadedimage_4 || '',
          product_usage: xpressParams?.product_usage || '0',
          product_damage: xpressParams?.product_damage || '0',
          brandname: xpressParams?.brandname || '0',
          brandnametype: xpressParams?.brandnametype || '',
          productsize: xpressParams?.productsize || '0',
          productsizetype: xpressParams?.productsizetype || '',
          productcolor: xpressParams?.productcolor || '0',
          productcolourtype: xpressParams?.productcolourtype || '',
        })
      } else {
        await ensureXpressbeesCourierServiceable({
          xpressbees,
          originPin: bookingPickupPincode,
          destinationPin: bookingDestinationPincode,
          paymentType: params.payment_type,
          orderAmount: Number(params.order_amount ?? 0),
          packageWeight: Number(params.package_weight ?? 0),
          packageLength: Number(params.package_length ?? 0),
          packageBreadth: Number(params.package_breadth ?? 0),
          packageHeight: Number(params.package_height ?? 0),
          courierId: params.courier_id,
          orderNumber: params.order_number,
        })

        const pickupVendorCode = buildXpressbeesPickupVendorCode(params, userId)
        const serviceType = getXpressbeesManifestServiceType(params, slabbedFreight)
        params.pickup = {
          ...(params.pickup || {}),
          pickupVendorCode,
          pickup_vendor_code: pickupVendorCode,
        } as ShipmentParams['pickup'] & {
          pickupVendorCode: string
          pickup_vendor_code: string
        }
        let awbCandidates: XpressbeesAwbCandidate[] = []

        try {
          awbCandidates = await resolveXpressbeesAwbCandidates(params, xpressbees, userId)
        } catch (awbError: any) {
          if (!isXpressbeesAwbResolutionError(awbError)) {
            throw awbError
          }

          console.warn(
            '[Xpressbees] AWB-series API failed; using shipment creation API to allocate AWB.',
            {
              order_number: params.order_number,
              message: awbError?.message || awbError,
            },
          )

          xpressbeesProviderFlow = XPRESSBEES_SHIPMENTS2_FLOW
          xpressbeesProviderManifestStatus = null
          try {
            shipmentData = await xpressbees.createShipment({
              ...params,
              request_auto_pickup: params.request_auto_pickup || 'yes',
            })
          } catch (shipmentApiError: any) {
            const status = Number(
              shipmentApiError?.statusCode ||
                shipmentApiError?.response?.status ||
                shipmentApiError?.status ||
                0,
            )
            const providerMessage =
              shipmentApiError?.response?.data?.message ||
              shipmentApiError?.message ||
              'shipment API rejected the request'
            const credentialHint =
              status === 401 || String(providerMessage).toLowerCase().includes('token')
                ? ' The configured shipment API token/login is not accepted by Xpressbees.'
                : ''
            throw new HttpError(
              502,
              `Xpressbees could not allocate an AWB from live APIs. The AWB-series API failed, and the shipment API fallback failed: ${providerMessage}.${credentialHint} Please save a valid Xpressbees AWB-generation XBKey or shipment API credentials before booking without preallocated AWBs.`,
            )
          }
        }

        if (!shipmentData) {
          const awbCandidate = awbCandidates[0]
          if (!awbCandidate) {
            throw new HttpError(
              502,
              'Xpressbees could not allocate an AWB from the configured AWB-series API or manual AWB ranges.',
            )
          }

          const awb = awbCandidate.awb
          xpressbeesManualAwbReservation = awbCandidate.manualReservation || null
          xpressbeesProviderFlow = XPRESSBEES_MANUAL_MANIFEST_FLOW
          xpressbeesProviderManifestStatus = 'pending'
          shipmentData = {
            status: true,
            awb_number: awb,
            AWBNo: awb,
            shipment_id: awb,
            order_id: params.order_number,
            courier_name: 'Xpressbees',
            courier_id: params.courier_id ?? null,
            provider_flow: XPRESSBEES_MANUAL_MANIFEST_FLOW,
            provider_manifest_status: 'pending',
            provider_manifest_id: null,
            provider_request_id: awb,
            service_type: serviceType,
            service_mode: serviceType,
            pickup_vendor_code: pickupVendorCode,
            xpressbees: {
              booking_flow: XPRESSBEES_MANUAL_MANIFEST_FLOW,
              manifestation: {
                provider_manifest_id: null,
                status: 'pending',
                response: null,
              },
              pickup_vendor_code: pickupVendorCode,
            },
            manifest_attempts: [
              {
                awb,
                returnCode: null,
                returnMessage: 'Provider manifestation pending until manual Manifest action.',
              },
            ],
          }
        }
      }

      const xpressbeesPackage = shipmentData?.data || shipmentData
      const xpressbeesWaybill =
        xpressbeesPackage?.awb_number ?? xpressbeesPackage?.AWBNo ?? xpressbeesPackage?.awb ?? null

      if (!xpressbeesPackage?.status && shipmentData?.status !== true) {
        console.error('❌ Invalid Xpressbees shipment:', shipmentData)
        await markXpressbeesManualAwbFailed({
          allocationId: xpressbeesManualAwbReservation?.allocationId,
          failureReason: 'Xpressbees shipment creation returned an invalid response',
          providerResponse: shipmentData,
        }).catch((markErr: any) => {
          console.warn('[Xpressbees] Failed to mark invalid-response manual AWB as failed', {
            awb: xpressbeesWaybill || null,
            message: markErr?.message || markErr,
          })
        })
        throw new HttpError(500, 'Xpressbees shipment creation failed')
      }

      if (!xpressbeesWaybill) {
        console.error('❌ Missing Xpressbees AWB:', shipmentData)
        await markXpressbeesManualAwbFailed({
          allocationId: xpressbeesManualAwbReservation?.allocationId,
          failureReason: 'Xpressbees did not return an AWB number',
          providerResponse: shipmentData,
        }).catch((markErr: any) => {
          console.warn('[Xpressbees] Failed to mark missing-AWB manual allocation as failed', {
            message: markErr?.message || markErr,
          })
        })
        throw new HttpError(500, 'Xpressbees did not return an AWB number')
      }

      shipmentSuccessPackage = {
        waybill: xpressbeesWaybill,
        label: xpressbeesPackage?.label ?? null,
        manifest: xpressbeesPackage?.manifest ?? null,
        courier_name: xpressbeesPackage?.courier_name ?? 'Xpressbees',
        courier_id: xpressbeesPackage?.courier_id ?? params?.courier_id ?? null,
        status: xpressbeesPackage?.status ?? null,
        sort_code: xpressbeesPackage?.fwd_destination_code ?? null,
      }

      providerCourierCost = params?.courier_cost ?? null
      providerSortCode = xpressbeesPackage?.fwd_destination_code ?? null
      const xpressbeesProviderManifestToken = firstNonEmptyText(
        getXpressbeesManifestToken(xpressbeesPackage),
        getXpressbeesManifestToken(shipmentData),
        xpressbeesPackage?.shipment_id,
        xpressbeesWaybill,
      )
      await markXpressbeesManualAwbUsed({
        allocationId: xpressbeesManualAwbReservation?.allocationId,
        providerReference: xpressbeesProviderManifestToken || xpressbeesWaybill,
        providerResponse: shipmentData,
      }).catch((markErr: any) => {
        console.warn('[Xpressbees] Failed to mark manual AWB as used', {
          awb: xpressbeesWaybill,
          message: markErr?.message || markErr,
        })
      })
      const xpressbeesProviderManifestedAt = firstNonEmptyText(
        xpressbeesPackage?.provider_manifested_at,
        shipmentData?.provider_manifested_at,
        xpressbeesProviderManifestStatus === 'accepted' ? new Date().toISOString() : '',
      )
      const xpressbeesRateMode =
        normalizeB2CShippingMode(slabbedFreight.rate_card_mode) ||
        normalizeB2CShippingMode(slabbedFreight.rate_card_courier_name) ||
        null

      shipmentMeta = {
        shipment_id:
          xpressbeesPackage?.shipment_id ??
          xpressbeesPackage?.TokenNumber ??
          xpressbeesPackage?.tokenNumber ??
          xpressbeesPackage?.order_id ??
          xpressbeesWaybill ??
          undefined,
        awb_number: xpressbeesWaybill,
        courier_name: xpressbeesPackage?.courier_name ?? 'Xpressbees',
        courier_id: xpressbeesPackage?.courier_id
          ? Number(xpressbeesPackage.courier_id)
          : params.courier_id
            ? Number(params.courier_id)
            : null,
        label: xpressbeesPackage?.label ?? undefined,
        manifest: undefined,
        courier_cost: providerCourierCost,
        sort_code: providerSortCode,
        provider_mode: xpressbeesRateMode ?? undefined,
        provider_service:
          xpressbeesPackage?.service_type ??
          xpressbeesPackage?.service_mode ??
          xpressbeesRateMode ??
          undefined,
        provider_reference: xpressbeesProviderManifestToken || xpressbeesWaybill || undefined,
        provider_request_id: xpressbeesProviderManifestToken || xpressbeesWaybill || undefined,
        provider_flow: xpressbeesProviderFlow,
        provider_manifest_id:
          xpressbeesProviderManifestStatus === 'accepted'
            ? xpressbeesProviderManifestToken || null
            : null,
        provider_manifest_status: xpressbeesProviderManifestStatus ?? undefined,
        provider_manifested_at:
          xpressbeesProviderManifestStatus === 'accepted'
            ? xpressbeesProviderManifestedAt
            : undefined,
        pickup_vendor_code:
          xpressbeesPackage?.pickup_vendor_code ??
          shipmentData?.pickup_vendor_code ??
          undefined,
        manifest_attempts:
          xpressbeesPackage?.manifest_attempts ??
          shipmentData?.manifest_attempts ??
          undefined,
        xpressbees: {
          booking_flow: xpressbeesProviderFlow,
          ...(xpressbeesManualAwbReservation
            ? {
                manual_awb: {
                  allocation_id: xpressbeesManualAwbReservation.allocationId,
                  range_id: xpressbeesManualAwbReservation.rangeId,
                  awb_number: xpressbeesManualAwbReservation.awb,
                  remaining_after_allocation: xpressbeesManualAwbReservation.remainingAfter,
                },
              }
            : {}),
          ...(xpressbeesProviderManifestStatus === 'accepted'
            ? {
                manifestation: {
                  provider_manifest_id: xpressbeesProviderManifestToken || null,
                  status: 'accepted',
                  accepted_at: xpressbeesProviderManifestedAt,
                  response: shipmentData,
                },
              }
            : xpressbeesProviderManifestStatus === 'pending'
              ? {
                  manifestation: {
                    provider_manifest_id: null,
                    status: 'pending',
                    response: null,
                  },
                }
            : {}),
          pickup_vendor_code:
            xpressbeesPackage?.pickup_vendor_code ??
            shipmentData?.pickup_vendor_code ??
            undefined,
        },
      }
    } else if (integrationType === 'shadowfax') {
      console.log(
        isReverseShipment
          ? '→ Using Shadowfax Reverse Shipment API...'
          : '→ Using Shadowfax Forward API...',
      )

      const shadowfax = new ShadowfaxService()

      if (isReverseShipment) {
        const reverseOriginPin = bookingDestinationPincode
        const reverseDestinationPin = String(
          params.rto?.pincode || params.pickup?.pincode || bookingPickupPincode || '',
        ).trim()
        const serviceability = await shadowfax.checkReverseServiceability({
          origin: reverseOriginPin,
          destination: reverseDestinationPin,
        })
        if (!serviceability.serviceable) {
          throw new HttpError(
            400,
            `Shadowfax reverse pickup is not serviceable for ${params.order_number} between ${reverseOriginPin} and ${reverseDestinationPin}.`,
          )
        }

        shipmentData = await shadowfax.createReverseShipment(params)
        const reverseAwb =
          shipmentData?.client_request_id ??
          shipmentData?.awb_number ??
          shipmentData?.data?.client_request_id ??
          shipmentData?.data?.awb_number ??
          null

        if (!reverseAwb) {
          console.error('❌ Invalid Shadowfax reverse shipment:', shipmentData)
          throw new HttpError(500, 'Shadowfax reverse shipment creation failed')
        }

        shipmentMeta = {
          shipment_id: reverseAwb,
          awb_number: reverseAwb,
          courier_name: 'Shadowfax',
          courier_id: params.courier_id ? Number(params.courier_id) : null,
          label: undefined,
          manifest: undefined,
          courier_cost: params?.courier_cost ? Number(params.courier_cost) : null,
          sort_code: null,
        }
      } else {
        const forwardMode = resolveShadowfaxForwardMode()
        const serviceMode = resolveShadowfaxServiceMode()
        const originPin = bookingPickupPincode
        const destinationPin = bookingDestinationPincode

        const booking = await shadowfax.createForwardShipmentWithFallback(params, {
          origin: originPin,
          destination: destinationPin,
          paymentType: params.payment_type,
          mode: forwardMode,
          service: serviceMode,
        })
        const resolvedShadowfaxMode = booking.mode
        const resolvedShadowfaxService = booking.service
        shipmentData = booking.shipment

        const forwardData = shipmentData?.data || shipmentData
        const shadowfaxAwb = forwardData?.awb_number || shipmentData?.awb_number || null
        if (!shadowfaxAwb) {
          console.error('❌ Invalid Shadowfax forward shipment:', shipmentData)
          throw new HttpError(500, 'Shadowfax shipment creation failed')
        }

        providerSortCode = forwardData?.sort_code ?? null
        shipmentMeta = {
          shipment_id:
            forwardData?.id?.toString?.() ?? forwardData?.client_order_id ?? shadowfaxAwb,
          awb_number: shadowfaxAwb,
          courier_name: 'Shadowfax',
          courier_id: params.courier_id ? Number(params.courier_id) : null,
          label: undefined,
          manifest: undefined,
          courier_cost: params?.courier_cost ? Number(params.courier_cost) : null,
          sort_code: providerSortCode,
        }
        ;(shipmentMeta as any).provider_mode = resolvedShadowfaxMode
        ;(shipmentMeta as any).provider_service = resolvedShadowfaxService
      }
    } else if (integrationType === 'innofulfill') {
      if (isReverseShipment) {
        throw new HttpError(400, 'Innofulfill reverse shipments are not supported yet')
      }

      console.log('Using Innofulfill B2C API...')
      const innofulfill = new InnofulfillService()
      shipmentData = await innofulfill.createOrder(params)
      const innofulfillPackage = innofulfill.normalizeBookingResponse(shipmentData, params)

      if (!innofulfillPackage.awb_number && !innofulfillPackage.order_id) {
        console.error('Invalid Innofulfill shipment:', shipmentData)
        throw new HttpError(502, 'Innofulfill shipment creation did not return an order ID or AWB')
      }

      shipmentMeta = {
        shipment_id:
          innofulfillPackage.shipment_id ||
          innofulfillPackage.order_id ||
          innofulfillPackage.awb_number,
        awb_number: innofulfillPackage.awb_number || innofulfillPackage.order_id,
        courier_name: innofulfillPackage.courier_name || 'Innofulfill',
        courier_id: params.courier_id ? Number(params.courier_id) : null,
        label: undefined,
        manifest: undefined,
        courier_cost: params?.courier_cost ? Number(params.courier_cost) : null,
        sort_code: null,
        provider_reference: innofulfillPackage.provider_reference,
        provider_request_id: innofulfillPackage.provider_request_id,
        provider_service: (params as any).innofulfill_service_type || 'ECOMM',
        provider_mode: normalizeB2CShippingMode(params.shipping_mode) || undefined,
        innofulfill: innofulfillPackage.raw,
      }
    } else if (integrationType === 'amazon') {
      console.log('Using Amazon Shipping API...')
      const amazonCredentials = await getStoredAmazonShippingCredentials()
      applyAmazonShippingCredentialsToEnv(amazonCredentials)

      let requestToken = trimText(params.amazon_request_token || params.requestToken)
      let rateId = trimText(params.amazon_rate_id || params.rateId)
      let selectedAmazonRate: any = null
      let amazonRatesRequestBody: any = null
      let shouldUseSelectedAmazonRateWithoutRefetch = false

      if (!requestToken || !rateId) {
        const cachedAmazonRate = await getCachedAmazonRateToken(params, userId)
        if (cachedAmazonRate) {
          requestToken = cachedAmazonRate.requestToken
          rateId = cachedAmazonRate.rateId
          params.amazon_carrier_id =
            params.amazon_carrier_id || cachedAmazonRate.carrierId || undefined
          params.amazon_service_id =
            params.amazon_service_id || cachedAmazonRate.serviceId || undefined
          ;(params as any).amazon_service_name =
            (params as any).amazon_service_name || cachedAmazonRate.serviceName || undefined
          selectedAmazonRate = cachedAmazonRate.rawRate || {
            rateId: cachedAmazonRate.rateId,
            carrierId: cachedAmazonRate.carrierId,
            carrierName: cachedAmazonRate.carrierName || 'Amazon Shipping',
            serviceId: cachedAmazonRate.serviceId,
            serviceName: cachedAmazonRate.serviceName,
          }
          shouldUseSelectedAmazonRateWithoutRefetch = true

          console.log('[AmazonShipping] Recovered selected rate token from serviceability cache', {
            order_number: params.order_number,
            hasRequestToken: Boolean(requestToken),
            hasRateId: Boolean(rateId),
            amazon_service_id: trimText(params.amazon_service_id) || null,
            amazon_carrier_id: trimText(params.amazon_carrier_id) || null,
          })
        }
      }

      if (requestToken && rateId && !selectedAmazonRate) {
        selectedAmazonRate = {
          rateId,
          carrierId: trimText(params.amazon_carrier_id),
          carrierName: 'Amazon Shipping',
          serviceId: trimText(params.amazon_service_id),
          serviceName: trimText((params as any).amazon_service_name),
        }
        shouldUseSelectedAmazonRateWithoutRefetch = true
      }

      if (shouldUseSelectedAmazonRateWithoutRefetch && selectedAmazonRate) {
        console.log('[AmazonShipping] Using selected rate token for purchase', {
          order_number: params.order_number,
          hasRequestToken: Boolean(requestToken),
          hasRateId: Boolean(rateId),
          amazon_service_id: trimText(params.amazon_service_id) || null,
          amazon_carrier_id: trimText(params.amazon_carrier_id) || null,
        })
      } else {
        console.log('[AmazonShipping] Refetching rates before purchase', {
          order_number: params.order_number,
          hasRequestToken: Boolean(requestToken),
          hasRateId: Boolean(rateId),
          payment_type: params.payment_type || null,
        })
        try {
          amazonRatesRequestBody = await buildAmazonShippingRatesRequest(params, userId)
          const rateResult = await getAmazonShippingRates(amazonRatesRequestBody, amazonCredentials)
          const rates = getEligibleAmazonRates(getAmazonRatesFromResponse(rateResult.data))
          selectedAmazonRate =
            rates.find((rate) => getAmazonRateId(rate) === rateId) ||
            rates.find(
              (rate) =>
                trimText(rate?.serviceId || rate?.service_id) === trimText(params.amazon_service_id),
            ) ||
            rates.find(
              (rate) =>
                trimText(rate?.carrierId || rate?.carrier_id) === trimText(params.amazon_carrier_id),
            ) ||
            rates[0]
          requestToken = getAmazonRequestTokenFromResponse(rateResult.data)
          rateId = getAmazonRateId(selectedAmazonRate)
        } catch (err: any) {
          if (getAmazonProviderInternalInputError(err)) {
            if (!requestToken || !rateId) {
              throw new HttpError(
                400,
                'Amazon Shipping could not return a live rate for this route/payment right now. Please refresh courier rates and select another available courier.',
              )
            }
          } else {
            throw err
          }

          console.warn('[AmazonShipping] Rate refetch returned S-900; using selected rate token', {
            order_number: params.order_number,
            hasRequestToken: true,
            hasRateId: true,
            amazon_service_id: trimText(params.amazon_service_id) || null,
            amazon_carrier_id: trimText(params.amazon_carrier_id) || null,
            requestId: err?.details?.requestId || null,
          })

          selectedAmazonRate = {
            rateId,
            carrierId: trimText(params.amazon_carrier_id),
            carrierName: 'Amazon Shipping',
            serviceId: trimText(params.amazon_service_id),
            serviceName: trimText((params as any).amazon_service_name),
          }
        }
      }

      if (selectedAmazonRate) {
        console.log('[AmazonShipping] Selected refreshed rate for purchase', {
          order_number: params.order_number,
          carrierId: trimText(selectedAmazonRate?.carrierId || selectedAmazonRate?.carrier_id) || null,
          serviceId: trimText(selectedAmazonRate?.serviceId || selectedAmazonRate?.service_id) || null,
          hasSupportedDocumentSpecifications:
            getAmazonSupportedDocumentSpecifications(selectedAmazonRate).length > 0,
          codRequested: isAmazonCodOrder(params),
        })
      }

      if (!requestToken || !rateId) {
        throw new HttpError(400, 'Amazon Shipping rate token is missing. Please refresh couriers and select Amazon again.')
      }

      const amazonPurchaseBody = buildAmazonPurchaseShipmentBody({
        requestToken,
        rateId,
        selectedAmazonRate,
        params,
      })
      console.log('[AmazonShipping] Purchasing shipment', {
        order_number: params.order_number,
        hasRequestToken: Boolean(amazonPurchaseBody.requestToken),
        hasRateId: Boolean(amazonPurchaseBody.rateId),
        requestedDocumentSpecification: {
          format: amazonPurchaseBody.requestedDocumentSpecification?.format || null,
          dpi: amazonPurchaseBody.requestedDocumentSpecification?.dpi || null,
          pageLayout: amazonPurchaseBody.requestedDocumentSpecification?.pageLayout || null,
          requestedDocumentTypes:
            amazonPurchaseBody.requestedDocumentSpecification?.requestedDocumentTypes || [],
        },
        requestedValueAddedServices:
          amazonPurchaseBody.requestedValueAddedServices?.map((service: any) => service.id) || [],
      })

      shipmentData = await purchaseAmazonShipment(amazonPurchaseBody, amazonCredentials)

      const amazonPayload =
        shipmentData?.data?.payload || shipmentData?.data || shipmentData?.payload || shipmentData
      const amazonPackage =
        amazonPayload?.packages?.[0] ||
        amazonPayload?.packageDocumentDetails?.[0] ||
        amazonPayload?.shipmentDocuments?.[0] ||
        {}
      const amazonShipmentId = getAmazonShipmentIdFromPayload(amazonPayload) || undefined
      const amazonTrackingId = getAmazonTrackingIdFromPayload(amazonPayload) || undefined
      const amazonPackageClientReferenceId =
        getAmazonPackageClientReferenceIdFromPayload(amazonPayload) ||
        trimText(amazonRatesRequestBody?.packages?.[0]?.packageClientReferenceId) ||
        undefined

      if (!amazonShipmentId && !amazonTrackingId) {
        console.error('[AmazonShipping] Purchase response missing shipment/tracking id', {
          order_number: params.order_number,
          requestId: shipmentData?.amazon?.requestId ?? null,
          payloadKeys: amazonPayload && typeof amazonPayload === 'object' ? Object.keys(amazonPayload) : [],
          packageKeys: amazonPackage && typeof amazonPackage === 'object' ? Object.keys(amazonPackage) : [],
        })
        throw new HttpError(
          502,
          'Amazon Shipping purchase succeeded but did not return a shipment or tracking id. Local order was not created.',
        )
      }

      if (!amazonTrackingId) {
        let cancelMessage = ''
        if (amazonShipmentId) {
          try {
            await cancelAmazonShipment({ shipmentId: amazonShipmentId }, amazonCredentials)
            cancelMessage = ' The provider shipment was cancelled automatically.'
            console.warn('[AmazonShipping] Cancelled shipment without tracking id', {
              order_number: params.order_number,
              shipmentId: amazonShipmentId,
              requestId: shipmentData?.amazon?.requestId ?? null,
            })
          } catch (cancelErr: any) {
            cancelMessage = ` Provider cancellation also failed: ${cancelErr?.message || cancelErr}.`
            console.error('[AmazonShipping] Failed to cancel shipment without tracking id', {
              order_number: params.order_number,
              shipmentId: amazonShipmentId,
              error: cancelErr?.message || cancelErr,
            })
          }
        }

        throw new HttpError(
          502,
          `Amazon Shipping purchase did not return a tracking ID/AWB.${cancelMessage} Local order was not created.`,
        )
      }

      if (amazonShipmentId) {
        rollbackActions.push(async () => {
          await cancelAmazonShipment({ shipmentId: amazonShipmentId }, amazonCredentials)
          console.warn('[AmazonShipping] Rolled back purchased shipment after local booking failure', {
            order_number: params.order_number,
            shipmentId: amazonShipmentId,
          })
        })
      }

      const amazonLabel = await resolveAmazonShipmentLabel({
        shipmentData,
        amazonPayload,
        amazonPackage,
        amazonShipmentId,
        amazonPackageClientReferenceId,
        amazonCredentials,
        userId: String((params as any).user_id || ''),
      })
      if (amazonLabel && amazonLabel.length > 100) {
        console.warn('[AmazonShipping] Amazon label exceeds label column limit; storing exact reference in provider meta', {
          order_number: params.order_number,
          labelLength: amazonLabel.length,
        })
      }

      providerCourierCost =
        getAmazonRateCharge(selectedAmazonRate) ??
        (params?.courier_cost ? Number(params.courier_cost) : null)

      shipmentMeta = {
        shipment_id: amazonShipmentId ?? amazonTrackingId,
        awb_number: amazonTrackingId,
        courier_name: 'Amazon Shipping',
        courier_id: params.courier_id ? Number(params.courier_id) : null,
        label:
          amazonLabel && amazonLabel.length <= 100 ? amazonLabel : undefined,
        amazon_label: amazonLabel ?? null,
        manifest: undefined,
        courier_cost: providerCourierCost,
        sort_code: null,
        provider_reference: amazonShipmentId ?? amazonTrackingId,
        provider_request_id: shipmentData?.amazon?.requestId ?? undefined,
        provider_service: trimText(params.amazon_service_id || selectedAmazonRate?.serviceId),
        provider_mode: 'surface',
        amazon_rate_id: rateId,
        amazon_carrier_id: trimText(
          params.amazon_carrier_id || selectedAmazonRate?.carrierId || selectedAmazonRate?.carrier_id,
        ),
        amazon_tracking_id: amazonTrackingId,
        amazon_shipment_id: amazonShipmentId ?? null,
        amazon_package_client_reference_id: amazonPackageClientReferenceId ?? null,
      }
    } else {
      throw new Error(`Unsupported integration_type: ${integrationType}`)
    }

    console.log(`📦 ${providerName} shipment response:`, shipmentData)

    if (integrationType === 'delhivery' && shipmentSuccessPackage) {
      const responseShippingMode =
        shipmentData?.shipping_mode ??
        shipmentSuccessPackage?.shipping_mode ??
        shipmentSuccessPackage?.service_mode ??
        shipmentSuccessPackage?.service_type ??
        shipmentSuccessPackage?.mode ??
        null

      console.log('📤 Delhivery API response service', {
        order: params.order_number,
        requested_shipping_mode: selectedDelhiveryShippingMode,
        response_shipping_mode: responseShippingMode,
        response_package_keys: Object.keys(shipmentSuccessPackage || {}),
      })

      console.log(`✅ Delhivery shipment created with AWB: ${shipmentSuccessPackage?.waybill}`)
      console.log(`💰 Delhivery courier cost captured:`, {
        awb: shipmentSuccessPackage?.waybill,
        cost: providerCourierCost,
        source: providerCourierCost
          ? shipmentSuccessPackage?.charge
            ? 'pkg.charge'
            : shipmentSuccessPackage?.amount
              ? 'pkg.amount'
              : shipmentData?.charge
                ? 'shipmentData.charge'
                : shipmentData?.amount
                  ? 'shipmentData.amount'
                  : 'params.courier_cost'
          : 'none',
        pkg_fields: Object.keys(shipmentSuccessPackage || {}),
        shipment_fields: Object.keys(shipmentData || {}),
      })
    }

    // 🔹 Recalculate freight using slab pricing (ignore incoming freight_charges)
    const pickupPincode =
      (params.pickup as any)?.pincode ||
      (params.pickup_details as any)?.pincode ||
      params.pickup_location_id ||
      params.origin ||
      params.pickup_pincode ||
      params.source_pincode

    const destinationPincode = params?.consignee?.pincode

    if (!pickupPincode || !destinationPincode) {
      throw new HttpError(400, 'Pickup and destination pincodes are required to compute freight')
    }

    const courierIdForRate = params.courier_id ?? shipmentMeta?.courier_id
    if (courierIdForRate === undefined || courierIdForRate === null) {
      throw new HttpError(400, 'Courier ID is required to compute freight')
    }

    let finalSlabbedFreight = slabbedFreight
    finalSlabbedFreight = await computeB2CFreightForOrder({
      userId,
      courierId: courierIdForRate,
      serviceProvider: params.integration_type ?? null,
      mode: selectedDelhiveryShippingMode ?? null,
      selectedRateCardId,
      selectedMaxSlabWeight,
      zoneIdOverride: params.zone_id ?? null,
      originPincode: String(pickupPincode),
      destinationPincode: String(destinationPincode),
      weightG: normalizeServiceabilityWeightToGrams(params.package_weight ?? params.weight ?? 0),
      lengthCm: Number(params.package_length ?? params.length ?? 0),
      breadthCm: Number(params.package_breadth ?? params.breadth ?? 0),
      heightCm: Number(params.package_height ?? params.height ?? 0),
      orderAmount: Number(params.order_amount ?? 0),
      isReverse: params.isReverse === true || params.payment_type === 'reverse',
    })
    params.freight_charges = Number(finalSlabbedFreight.freight ?? 0)
    params.other_charges = Number(finalSlabbedFreight.other_charges ?? 0)
    if (isCodOrder) {
      params.cod_charges = Number(finalSlabbedFreight.cod_charges ?? 0)
    }
    if (isCodOrder) {
      codCharges = Number(finalSlabbedFreight.cod_charges ?? codCharges)
    }

    // 2️⃣ INSERT LOCAL ORDER + WALLET TRANSACTION
    const result: any = await db.transaction(async (tx) => {
      const userWallet = await walletOfUser(userId, tx)
      const walletBalance = Number(userWallet?.balance ?? 0)

      const orderAmount = Number(params?.order_amount ?? 0)
      const otherCharges = Number(params?.other_charges ?? 0) // Other charges from courier serviceability API
      const shippingCharges = Number(params?.shipping_charges ?? 0) // What seller charges customer (base shipping)
      // Total shipping charges = base shipping + other charges (from serviceability API)
      const totalShippingCharges = shippingCharges + otherCharges
      const freightCharges = Number(finalSlabbedFreight?.freight ?? params?.freight_charges ?? 0) // What platform charges seller (based on rate card)
      if (!Number.isFinite(freightCharges) || freightCharges <= 0) {
        throw new HttpError(
          400,
          isReverseShipment
            ? 'No reverse pickup rate card freight available for selected courier/zone'
            : 'No Shiplifi rate card freight available for selected courier/zone',
        )
      }
      // Extract courier_cost from shipment response or use estimated from params
      const courierCost =
        shipmentMeta?.courier_cost !== undefined && shipmentMeta?.courier_cost !== null
          ? Number(shipmentMeta.courier_cost)
          : params?.courier_cost
            ? Number(params.courier_cost)
            : null // Use estimated cost from serviceability if available

      console.log('💰 Courier Cost Summary:', {
        order_number: params.order_number,
        integration_type: params.integration_type,
        from_shipment_response: shipmentMeta?.courier_cost,
        from_params: params?.courier_cost,
        final_courier_cost: courierCost,
        freight_charges: freightCharges, // What platform charges seller
        shipping_charges: shippingCharges, // Base shipping (what seller charges customer)
        other_charges: otherCharges, // Other charges from serviceability API
        total_shipping_charges: totalShippingCharges, // Total shipping (base + other)
      })
      const discount = Number(params?.discount ?? 0)
      const giftWrap = Number(params?.gift_wrap ?? 0)
      const transactionFee = Number(params?.transaction_fee ?? 0)
      const prepaidAmt = Number(params?.prepaid_amount ?? 0)

      // Calculate total amount (customer-facing). Courier COD service fees are
      // seller wallet charges and must not be added to the buyer collectable.
      const totalAmount =
        orderAmount +
        totalShippingCharges + // Includes other_charges
        transactionFee +
        giftWrap +
        discount -
        prepaidAmt

      console.log('💰 Order Charges Summary:', {
        order_number: params.order_number,
        payment_type: params.payment_type,
        order_amount: orderAmount,
        shipping_charges: shippingCharges, // Base shipping
        other_charges: otherCharges, // Other charges from serviceability API
        total_shipping_charges: totalShippingCharges, // Base + other
        transaction_fee: transactionFee,
        gift_wrap: giftWrap,
        cod_charges: isCodOrder ? codCharges : 0,
        discount: discount,
        prepaid_amount: prepaidAmt,
        total_amount: totalAmount,
        freight_charges: freightCharges, // What platform charges seller
        courier_cost: courierCost, // What platform pays courier
      })

      let walletDebit = 0
      let walletDebitBaseAmount = 0
      let walletDebitBaseAmountBeforeRazorpay = 0
      let walletRazorpayChargeAmount = 0
      let walletGstAmount = 0
      const applyConfiguredChargesToWalletDebit = ({
        freight,
        other,
        cod = 0,
      }: {
        freight: number
        other: number
        cod?: number
      }) => {
        const walletTaxBreakup = calculateBookingWalletDebit({
          paymentType: params.payment_type,
          freightCharges: freight,
          otherCharges: other,
          codCharges: cod,
          gstPercent: configuredGstPercent,
          razorpayChargeEnabled: configuredRazorpayChargeEnabled,
          razorpayChargePercent: configuredRazorpayChargePercent,
        })
        walletDebitBaseAmount = walletTaxBreakup.baseAmount
        walletDebitBaseAmountBeforeRazorpay = walletTaxBreakup.baseAmountBeforeRazorpay
        walletRazorpayChargeAmount = walletTaxBreakup.razorpayChargeAmount
        walletGstAmount = walletTaxBreakup.gstAmount
        walletDebit = walletTaxBreakup.totalAmount
      }

      if (isReverseShipment) {
        applyConfiguredChargesToWalletDebit({ freight: freightCharges, other: otherCharges })

        console.log('Reverse pickup wallet deduction:', {
          order_number: params.order_number,
          wallet_balance: walletBalance,
          freight_charges: freightCharges,
          other_charges: otherCharges,
          razorpay_charge_enabled: configuredRazorpayChargeEnabled,
          razorpay_charge_percent: configuredRazorpayChargePercent,
          razorpay_charge_amount: walletRazorpayChargeAmount,
          gst_percent: configuredGstPercent,
          gst_amount: walletGstAmount,
          gst_included_in_wallet_debit: true,
          wallet_base_debit_before_razorpay: walletDebitBaseAmountBeforeRazorpay,
          wallet_base_debit: walletDebitBaseAmount,
          wallet_debit: walletDebit,
          breakdown: `freight (${freightCharges}) + other (${otherCharges}) + razorpay (${walletRazorpayChargeAmount}) + gst (${walletGstAmount}) = ${walletDebit}`,
          reason: 'reverse_shipment',
        })

        if (walletBalance < walletDebit) {
          throw new Error('Insufficient wallet balance for reverse shipment')
        }
      } else if (params.payment_type === 'prepaid') {
        // Prepaid: Seller wallet debited for freight charges + other charges (all courier costs)
        // Customer pays: order_amount + shipping + transaction_fee + gift_wrap - discount - prepaid
        // Seller wallet debited: freight_charges (Shiplifi rate-card freight) + other_charges (fuel surcharge, handling, etc.)
        applyConfiguredChargesToWalletDebit({ freight: freightCharges, other: otherCharges })

        // Validate that otherCharges are included
        if (otherCharges > 0) {
          console.log('✅ Other charges included in wallet debit:', otherCharges)
        } else if (otherCharges === 0 && params?.other_charges === undefined) {
          console.warn(
            '⚠️ other_charges not provided in params - defaulting to 0. Ensure other charges are included if applicable.',
          )
        }

        console.log('💳 Prepaid Wallet Deduction:', {
          order_number: params.order_number,
          wallet_balance: walletBalance,
          freight_charges: freightCharges,
          other_charges: otherCharges,
          razorpay_charge_enabled: configuredRazorpayChargeEnabled,
          razorpay_charge_percent: configuredRazorpayChargePercent,
          razorpay_charge_amount: walletRazorpayChargeAmount,
          gst_percent: configuredGstPercent,
          gst_amount: walletGstAmount,
          gst_included_in_wallet_debit: true,
          wallet_base_debit_before_razorpay: walletDebitBaseAmountBeforeRazorpay,
          wallet_base_debit: walletDebitBaseAmount,
          wallet_debit: walletDebit,
          breakdown: `freight (${freightCharges}) + other (${otherCharges}) + razorpay (${walletRazorpayChargeAmount}) + gst (${walletGstAmount}) = ${walletDebit}`,
          reason: 'B2C Prepaid Order Payment',
        })

        if (walletBalance < walletDebit) {
          throw new Error('Insufficient wallet balance for prepaid order')
        }
      } else {
        // COD: Seller wallet debited for freight charges + other charges + COD charges
        // Customer pays: order_amount + shipping + transaction_fee + gift_wrap - discount
        // Seller wallet debited: freight_charges (Shiplifi rate-card freight) + other_charges (fuel surcharge, handling, etc.) + cod_charges (courier COD fee)
        applyConfiguredChargesToWalletDebit({
          freight: freightCharges,
          other: otherCharges,
          cod: codCharges,
        })

        // Validate that otherCharges are included
        if (otherCharges > 0) {
          console.log('✅ Other charges included in wallet debit:', otherCharges)
        } else if (otherCharges === 0 && params?.other_charges === undefined) {
          console.warn(
            '⚠️ other_charges not provided in params - defaulting to 0. Ensure other charges are included if applicable.',
          )
        }

        console.log('💳 COD Wallet Deduction:', {
          order_number: params.order_number,
          wallet_balance: walletBalance,
          freight_charges: freightCharges,
          other_charges: otherCharges,
          cod_charges: codCharges,
          razorpay_charge_enabled: configuredRazorpayChargeEnabled,
          razorpay_charge_percent: configuredRazorpayChargePercent,
          razorpay_charge_amount: walletRazorpayChargeAmount,
          gst_percent: configuredGstPercent,
          gst_amount: walletGstAmount,
          gst_included_in_wallet_debit: true,
          wallet_base_debit_before_razorpay: walletDebitBaseAmountBeforeRazorpay,
          wallet_base_debit: walletDebitBaseAmount,
          wallet_debit: walletDebit,
          breakdown: `freight (${freightCharges}) + other (${otherCharges}) + cod (${codCharges}) + razorpay (${walletRazorpayChargeAmount}) + gst (${walletGstAmount}) = ${walletDebit}`,
          reason: 'B2C COD Service Charges',
        })

        if (walletBalance < walletDebit) {
          throw new Error('Insufficient wallet balance for COD service charges')
        }
      }

      // 3️⃣ CREATE/UPDATE LOCAL ORDER ENTRY (no seller insurance for B2C – platform liability only)
      const bookingLifecycle = resolveCourierBookingLifecycle(integrationType, {
        providerFlow: shipmentMeta.provider_flow,
        providerManifestStatus: shipmentMeta.provider_manifest_status,
        isReverse: isReverseShipment,
      })
      const orderStatus = bookingLifecycle.orderStatus
      const manifestErrorMessage = null

      const finalWalletDebit = resolveGstInclusiveWalletDebit({
        storedDebit: walletDebit,
        paymentType: params.payment_type,
        freightCharges,
        otherCharges,
        codCharges,
        gstPercent: configuredGstPercent,
        gstAmount: walletGstAmount,
        razorpayChargeEnabled: configuredRazorpayChargeEnabled,
        razorpayChargePercent: configuredRazorpayChargePercent,
      })
      if (walletBalance < finalWalletDebit) {
        throw new Error(
          isReverseShipment
            ? 'Insufficient wallet balance for reverse shipment'
            : params.payment_type === 'prepaid'
            ? 'Insufficient wallet balance for prepaid order'
            : 'Insufficient wallet balance for COD service charges',
        )
      }

      const orderPersistencePayload = {
        tx,
        params,
        shipmentData: shipmentMeta,
        userId,
        shippingCharges: totalShippingCharges, // Total shipping (base + other charges)
        otherCharges, // Store other_charges separately
        freightCharges,
        razorpayChargeEnabled: configuredRazorpayChargeEnabled,
        razorpayChargePercent: configuredRazorpayChargePercent,
        razorpayChargeAmount: walletRazorpayChargeAmount,
        gstPercent: configuredGstPercent,
        gstAmount: walletGstAmount,
        walletDebitAmount: finalWalletDebit,
        courierCost: courierCost ?? undefined, // Save courier cost (actual from API or estimated from serviceability)
        transactionFee,
        giftWrap,
        discount,
        status: orderStatus,
        pickupStatus: bookingLifecycle.pickupStatus,
        providerLastStatus: bookingLifecycle.providerLastStatus,
        manifestError: manifestErrorMessage,
        integration_type: params?.integration_type!,
        is_external_api,
        volumetricWeight: finalSlabbedFreight.volumetric_weight ?? undefined,
        chargedWeight: finalSlabbedFreight.chargeable_weight ?? undefined,
        chargedSlabs: finalSlabbedFreight.slabs ?? undefined,
        shippingMode:
          selectedDelhiveryShippingMode ??
          (integrationType === 'xpressbees'
            ? normalizeB2CShippingMode(finalSlabbedFreight.rate_card_mode) ||
              normalizeB2CShippingMode(finalSlabbedFreight.rate_card_courier_name) ||
              null
            : null) ??
          (integrationType === 'shadowfax'
            ? resolveShadowfaxServiceMode() || resolveShadowfaxForwardMode()
            : null),
        selectedMaxSlabWeight,
      }

      const newOrder = options.existingOrderId
        ? await updateExistingB2COrderWithShipment({
            ...orderPersistencePayload,
            existingOrderId: options.existingOrderId,
          })
        : await createB2COrder(orderPersistencePayload)

      if (integrationType === 'xpressbees') {
        const manualAwbMeta = parseRecordValue((shipmentMeta as any)?.xpressbees?.manual_awb)
        await markXpressbeesManualAwbUsed({
          allocationId: firstNonEmptyText(manualAwbMeta.allocation_id),
          localOrderId: newOrder?.id,
          providerReference: shipmentMeta.provider_reference || shipmentMeta.awb_number || null,
        }).catch((markErr: any) => {
          console.warn('[Xpressbees] Failed to attach local order to manual AWB allocation', {
            order_id: newOrder?.id ?? null,
            awb: shipmentMeta.awb_number ?? null,
            message: markErr?.message || markErr,
          })
        })
      }

      if (selectedDelhiveryShippingMode && selectedDelhiveryCourierId !== null) {
        console.log('💾 Delhivery service persisted with order record', {
          order_number: params.order_number,
          order_id: newOrder.id,
          courier_id: selectedDelhiveryCourierId,
          shipping_mode: selectedDelhiveryShippingMode,
        })
      }

      // 4️⃣ WALLET TRANSACTION
      if (finalWalletDebit <= 0) {
        console.warn('Wallet debit is 0 or negative, skipping wallet transaction')
      } else {
        await createWalletTransaction({
          walletId: userWallet?.id,
          amount: finalWalletDebit,
          currency: 'INR',
          type: 'debit',
          reason:
            isReverseShipment
              ? 'reverse_shipment'
              : params.payment_type === 'prepaid'
              ? 'B2C Prepaid Order Payment'
              : 'B2C COD Service Charges',
          ref: newOrder?.id?.toString(),
          meta: {
            order_number: params.order_number,
            original_order_id: params.original_order_id ?? null,
            shipment_id: shipmentMeta.shipment_id,
            awb_number: shipmentMeta.awb_number,
            courier_name: shipmentMeta.courier_name,
            integration_type: params.integration_type,
            boxes: params.order_items,
            payment_type: params.payment_type,
            freight_charges: freightCharges,
            other_charges: otherCharges,
            cod_charges: isCodOrder ? codCharges : 0,
            razorpay_charge_enabled: configuredRazorpayChargeEnabled,
            razorpay_charge_percent: configuredRazorpayChargePercent,
            razorpay_charge_amount: walletRazorpayChargeAmount,
            gst_percent: configuredGstPercent,
            gst_amount: walletGstAmount,
            gst_included_in_wallet_debit: true,
            wallet_base_debit_before_razorpay: walletDebitBaseAmountBeforeRazorpay,
            wallet_base_debit: walletDebitBaseAmount,
            charged_weight: finalSlabbedFreight.chargeable_weight,
            volumetric_weight: finalSlabbedFreight.volumetric_weight,
            charged_slabs: finalSlabbedFreight.slabs,
            total_wallet_debit: finalWalletDebit,
          },
          tx: tx as any,
        })
        console.log('✅ Wallet transaction created:', {
          order_number: params.order_number,
          wallet_debit: finalWalletDebit,
          breakdown: {
            freight_charges: freightCharges,
            other_charges: otherCharges,
            cod_charges: isCodOrder ? codCharges : 0,
            razorpay_charge_enabled: configuredRazorpayChargeEnabled,
            razorpay_charge_percent: configuredRazorpayChargePercent,
            razorpay_charge_amount: walletRazorpayChargeAmount,
            gst_percent: configuredGstPercent,
            gst_amount: walletGstAmount,
            gst_included_in_wallet_debit: true,
            wallet_base_debit_before_razorpay: walletDebitBaseAmountBeforeRazorpay,
            wallet_base_debit: walletDebitBaseAmount,
          },
          charged_weight: finalSlabbedFreight.chargeable_weight,
          volumetric_weight: finalSlabbedFreight.volumetric_weight,
          charged_slabs: finalSlabbedFreight.slabs,
        })
      }

      // Download the Shiplifi label URL and save to R2, or generate a platform label.
      if (
        params.integration_type === 'shiplifi' ||
        params.integration_type === 'couriercart' ||
        !params.integration_type
      ) {
        try {
          const [freshOrder] = await tx
            .select()
            .from(b2c_orders)
            .where(eq(b2c_orders.id, newOrder.id))

          if (freshOrder) {
            // Try to download the Shiplifi label URL first if available.
            const courierCartLabelUrl = shipmentMeta?.label

            if (
              courierCartLabelUrl &&
              typeof courierCartLabelUrl === 'string' &&
              courierCartLabelUrl.startsWith('http')
            ) {
              try {
                console.log(`Downloading Shiplifi label from URL: ${courierCartLabelUrl}`)

                // Download label PDF from the platform URL.
                const labelResponse = await axios.get(courierCartLabelUrl, {
                  responseType: 'arraybuffer',
                  timeout: 30000,
                })

                const labelBuffer = Buffer.from(labelResponse.data)

                // Upload to R2
                const uploadTarget = await uploadBufferToStorage({
                  buffer: labelBuffer,
                  filename: `label-${params.order_number}.pdf`,
                  contentType: 'application/pdf',
                  userId,
                  folderKey: 'labels',
                })

                const labelKey = uploadTarget.key

                // Update order with R2 key
                await tx
                  .update(b2c_orders)
                  .set({
                    label: labelKey,
                    updated_at: new Date(),
                  })
                  .where(eq(b2c_orders.id, newOrder.id))

                console.log(`Shiplifi label downloaded and saved to R2: ${labelKey}`)
              } catch (downloadErr: any) {
                console.error(
                  `Failed to download Shiplifi label from URL: ${courierCartLabelUrl}`,
                  downloadErr?.message || downloadErr,
                )
                console.log(`Falling back to generating a custom label for ${params.order_number}`)

                // Fallback to generating custom label
                const labelKey = await generateLabelForOrder(freshOrder, userId, tx)
                if (labelKey) {
                  await tx
                    .update(b2c_orders)
                    .set({
                      label: labelKey,
                      updated_at: new Date(),
                    })
                    .where(eq(b2c_orders.id, newOrder.id))
                  console.log(`Shiplifi custom label generated and saved: ${labelKey}`)
                }
              }
            } else {
              // No hosted platform label URL, generate a custom Shiplifi label.
              console.log(
                `No Shiplifi label URL, generating custom label for ${params.order_number}`,
              )
              const labelKey = await generateLabelForOrder(freshOrder, userId, tx)
              if (labelKey) {
                await tx
                  .update(b2c_orders)
                  .set({
                    label: labelKey,
                    updated_at: new Date(),
                  })
                  .where(eq(b2c_orders.id, newOrder.id))
                console.log(`Shiplifi custom label generated and saved: ${labelKey}`)
              } else {
                console.warn(
                  `Shiplifi label generator returned empty result for ${params.order_number}`,
                )
              }
            }
          }
        } catch (labelErr: any) {
          console.error(
            `Failed to process Shiplifi label for ${params.order_number}:`,
            labelErr?.message || labelErr,
          )
        }
      }
      console.log(
        `✅ Local order ${newOrder.id} created via ${params.integration_type} (AWB: ${shipmentMeta.awb_number})`,
      )

      // 🔔 Send webhook event for order creation (async, don't wait)
      const webhookStatus = orderStatus

      sendWebhookEvent(userId, 'order.created', {
        order_id: newOrder.id,
        order_number: params.order_number,
        awb_number: shipmentMeta.awb_number,
        status: webhookStatus,
        courier_partner: shipmentMeta.courier_name,
        courier_id: shipmentMeta.courier_id,
        shipment_id: shipmentMeta.shipment_id,
        integration_type: params.integration_type,
        payment_type: params.payment_type,
        created_at: new Date().toISOString(),
      }).catch((err) => {
        console.error('Failed to send order.created webhook:', err)
        // Don't fail the main flow if webhook fails
      })

      return { order: newOrder, shipment: shipmentData }
    })

    rollbackActions.length = 0

    if (integrationType === 'delhivery' && !isReverseShipment && result?.order?.id) {
      const pickupLocationName = String(
        params.pickup?.warehouse_name || params.pickup_location_alias || params.pickup_location_id || '',
      ).trim()
      const orderDateRaw =
        params.order_date instanceof Date ? params.order_date.toISOString() : params.order_date
      const delhiveryPickupSchedule = normalizePickupSchedule({
        pickupDateRaw:
          params.pickup_date ||
          params.pickup?.pickup_date ||
          orderDateRaw ||
          new Date().toISOString(),
        pickupTimeRaw: params.pickup_time || params.pickup?.pickup_time || getDefaultPickupTime(),
        isManifestRetry: false,
      })
      const expectedPackageCount = Math.max(
        1,
        Array.isArray(result?.shipment?.packages) ? result.shipment.packages.length : 1,
      )

      if (pickupLocationName) {
        const delhivery = delhiveryService ?? new DelhiveryService()
        const [freshOrder] = await db
          .select({
            pickup_details: b2c_orders.pickup_details,
            provider_meta: b2c_orders.provider_meta,
          })
          .from(b2c_orders)
          .where(eq(b2c_orders.id, result.order.id))
          .limit(1)
        const existingPickupDetails = normalizePickupDetails(freshOrder?.pickup_details) || {}
        const updatedPickupDetails = {
          ...existingPickupDetails,
          warehouse_name: pickupLocationName,
          pickup_date: delhiveryPickupSchedule.pickupDate,
          pickup_time: delhiveryPickupSchedule.pickupTime,
        }
        const buildDelhiveryPickupProviderMeta = (
          status: 'accepted' | 'failed',
          details: Record<string, any>,
        ) => ({
          ...parseRecordValue(freshOrder?.provider_meta),
          pickup_request: {
            provider: 'delhivery',
            status,
            pickup_location: pickupLocationName,
            pickup_date: delhiveryPickupSchedule.pickupDate,
            pickup_time: delhiveryPickupSchedule.pickupTime,
            expected_package_count: expectedPackageCount,
            recorded_at: new Date().toISOString(),
            ...details,
          },
        })

        try {
          const pickupRequest = await delhivery.createPickupRequest({
            pickup_date: delhiveryPickupSchedule.pickupDate,
            pickup_time: delhiveryPickupSchedule.pickupTime,
            pickup_location: pickupLocationName,
            expected_package_count: expectedPackageCount,
          })

          await db
            .update(b2c_orders)
            .set({
              pickup_status: 'pickup_requested',
              pickup_error: null,
              order_status: 'pickup_initiated',
              provider_last_status: 'pickup_requested',
              provider_meta: buildDelhiveryPickupProviderMeta('accepted', {
                response: pickupRequest,
              }) as any,
              pickup_details: updatedPickupDetails as any,
              updated_at: new Date(),
            } as any)
            .where(eq(b2c_orders.id, result.order.id))

          if (result.shipment && typeof result.shipment === 'object') {
            result.shipment.pickup_request = pickupRequest
          }
          console.log('✅ Delhivery pickup request created after booking', {
            order_number: params.order_number,
            pickup_location: pickupLocationName,
            pickup_date: delhiveryPickupSchedule.pickupDate,
            pickup_time: delhiveryPickupSchedule.pickupTime,
            expected_package_count: expectedPackageCount,
          })
        } catch (error: any) {
          const pickupErrorMessage = getUserFacingManifestError(
            error,
            'Pickup request failed after shipment booking.',
          )
          await db
            .update(b2c_orders)
            .set({
              pickup_status: 'failed',
              pickup_error: truncateColumnValue(pickupErrorMessage),
              order_status: 'shipment_created',
              provider_last_status: 'shipment_created',
              provider_meta: buildDelhiveryPickupProviderMeta('failed', {
                error: pickupErrorMessage,
              }) as any,
              pickup_details: updatedPickupDetails as any,
              updated_at: new Date(),
            } as any)
            .where(eq(b2c_orders.id, result.order.id))

          if (result.shipment && typeof result.shipment === 'object') {
            result.shipment.pickup_request_error = pickupErrorMessage
          }
          console.warn('⚠️ Delhivery shipment booked but pickup request failed after booking', {
            order_number: params.order_number,
            pickup_location: pickupLocationName,
            pickup_date: delhiveryPickupSchedule.pickupDate,
            pickup_time: delhiveryPickupSchedule.pickupTime,
            expected_package_count: expectedPackageCount,
            error: pickupErrorMessage,
          })
        }
      } else {
        const pickupErrorMessage =
          'Pickup warehouse name is required to create Delhivery pickup request.'
        await db
          .update(b2c_orders)
          .set({
            pickup_status: 'failed',
            pickup_error: truncateColumnValue(pickupErrorMessage),
            order_status: 'shipment_created',
            provider_last_status: 'shipment_created',
            updated_at: new Date(),
          } as any)
          .where(eq(b2c_orders.id, result.order.id))

        if (result.shipment && typeof result.shipment === 'object') {
          result.shipment.pickup_request_error = pickupErrorMessage
        }
        console.warn('⚠️ Delhivery shipment booked without a pickup warehouse name', {
          order_number: params.order_number,
        })
      }
    }

    if (
      integrationType === 'shadowfax' &&
      !isReverseShipment &&
      result?.order?.id &&
      shipmentMeta?.awb_number &&
      isAfterShipTrackingConfigured()
    ) {
      const afterShip = new AfterShipTrackingService()
      void afterShip
        .getOrCreateShadowfaxTracking({
          id: String(result.order.id),
          source_type: 'b2c',
          order_id: params.order_id || params.order_number || String(result.order.id),
          order_number: params.order_number,
          awb_number: String(shipmentMeta.awb_number),
          edd: null,
          provider_meta: shipmentMeta,
        })
        .catch((error: any) => {
          console.warn(
            '[AfterShip] Shadowfax tracking registration skipped:',
            error?.message || error,
          )
        })
    }

    const syncedShopifyOrder = await syncShopifyAfterB2CBooking(result?.order?.id, 'courier-booking')
    return syncedShopifyOrder ? { ...result, order: syncedShopifyOrder } : result
  } catch (error) {
    await notifyAdminsForProviderBalanceIssue({
      orders: [
        {
          user_id: userId,
          order_number: params.order_number ?? null,
          awb_number: null,
        },
      ],
      errorMessage: getUserFacingManifestError(error),
      courierPartner:
        String(params.integration_type || '').trim() ||
        String(shipmentMeta?.courier_name || '').trim() ||
        'Courier',
      contextLabel: 'Shipment creation',
    }).catch((notifyErr) => {
      console.error('❌ Failed to notify admins about provider balance issue:', notifyErr)
    })

    for (const action of rollbackActions.reverse()) {
      await action().catch((err) => {
        console.error('❌ Failed during rollback action:', err?.response?.data || err?.message)
      })
    }

    throw error
  }
}

const normalizeB2COrderItemsForBooking = (value: unknown) => {
  const raw = (() => {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  })()

  return raw.map((item: any) => ({
    name: item?.name ?? item?.productName ?? item?.box_name ?? 'Product',
    sku: item?.sku ?? 'NA',
    qty: Number(item?.qty ?? item?.quantity ?? 1) || 1,
    price: Number(item?.price ?? 0) || 0,
    hsn: item?.hsn ?? item?.hsnCode ?? '',
    discount: Number(item?.discount ?? 0) || 0,
    tax_rate: Number(item?.tax_rate ?? item?.taxRate ?? 0) || 0,
  }))
}

const resolveB2COrderItemsAmount = (items: Array<{ qty: number; price: number; discount: number }>, fallback: unknown) => {
  const amount = items.reduce(
    (sum, item) => sum + Number(item.price ?? 0) * Number(item.qty ?? 1) - Number(item.discount ?? 0),
    0,
  )
  return amount > 0 ? amount : Number(fallback ?? 0)
}

export const bookExistingB2COrderWithCourierService = async (
  orderId: string,
  userId: string,
  payload: Partial<ShipmentParams> & {
    gst_percent?: number
    gst_amount?: number
    wallet_debit_amount?: number
    chargedWeight?: number | null
    volumetricWeight?: number | null
  },
) => {
  const [existingOrder] = await db
    .select()
    .from(b2c_orders)
    .where(and(eq(b2c_orders.id, orderId), eq(b2c_orders.user_id, userId)))
    .limit(1)

  if (!existingOrder) {
    throw new HttpError(404, 'Order not found')
  }

  const status = String(existingOrder.order_status || '').trim().toLowerCase()
  if (['cancelled', 'canceled', 'delivered', 'rto_delivered'].includes(status)) {
    throw new HttpError(400, 'This order cannot be booked because it is already closed')
  }

  if (existingOrder.awb_number) {
    throw new HttpError(400, 'This order already has an AWB')
  }

  const orderItems = normalizeB2COrderItemsForBooking(
    Array.isArray(payload.order_items) && payload.order_items.length
      ? payload.order_items
      : existingOrder.products,
  )
  const orderAmount = resolveB2COrderItemsAmount(orderItems, existingOrder.order_amount)
  const paymentType = String(existingOrder.order_type || 'prepaid').toLowerCase() === 'cod' ? 'cod' : 'prepaid'
  const pickup = payload.pickup || ({} as ShipmentParams['pickup'])
  const consignee = payload.consignee || ({} as ShipmentParams['consignee'])
  const rto = payload.rto

  const shipmentParams: ShipmentParams = {
    order_number: existingOrder.order_number,
    payment_type: paymentType,
    order_amount: orderAmount,
    order_date: existingOrder.order_date ? new Date(existingOrder.order_date) : new Date(),
    package_weight: Number(payload.package_weight ?? existingOrder.weight ?? 0),
    package_length: Number(payload.package_length ?? existingOrder.length ?? 0),
    package_breadth: Number(payload.package_breadth ?? existingOrder.breadth ?? 0),
    package_height: Number(payload.package_height ?? existingOrder.height ?? 0),
    shipping_charges: Number(payload.shipping_charges ?? existingOrder.shipping_charges ?? 0),
    prepaid_amount: String(payload.prepaid_amount ?? existingOrder.prepaid_amount ?? 0),
    transaction_fee: Number(payload.transaction_fee ?? existingOrder.transaction_fee ?? 0),
    gift_wrap: String(payload.gift_wrap ?? existingOrder.gift_wrap ?? 0),
    discount: Number(payload.discount ?? existingOrder.discount ?? 0),
    cod_charges: Number(payload.cod_charges ?? existingOrder.cod_charges ?? 0),
    freight_charges: Number(payload.freight_charges ?? 0),
    other_charges: Number(payload.other_charges ?? 0),
    courier_cost: payload.courier_cost !== undefined ? Number(payload.courier_cost) : undefined,
    integration_type: payload.integration_type,
    shipping_mode: payload.shipping_mode,
    courier_id: payload.courier_id ? Number(payload.courier_id) : undefined,
    courier_partner: payload.courier_partner,
    courier_option_key: payload.courier_option_key,
    amazon_request_token: payload.amazon_request_token,
    amazon_rate_id: payload.amazon_rate_id,
    amazon_service_id: payload.amazon_service_id,
    amazon_carrier_id: payload.amazon_carrier_id,
    shadowfax_forward_mode: payload.shadowfax_forward_mode,
    shadowfax_service_mode: payload.shadowfax_service_mode,
    selected_max_slab_weight: payload.selected_max_slab_weight,
    pickup_date: payload.pickup_date || pickup?.pickup_date,
    pickup_time: payload.pickup_time || pickup?.pickup_time,
    pickup_location_id: payload.pickup_location_id,
    delivery_location: payload.delivery_location ?? payload.zone,
    zone: payload.zone,
    zone_id: payload.zone_id,
    consignee: {
      name: consignee?.name ?? existingOrder.buyer_name ?? '',
      address: consignee?.address ?? existingOrder.address ?? '',
      city: consignee?.city ?? existingOrder.city ?? '',
      state: consignee?.state ?? existingOrder.state ?? '',
      country: consignee?.country ?? existingOrder.country ?? 'India',
      pincode: consignee?.pincode ?? existingOrder.pincode ?? '',
      phone:
        normalizeIndianPhoneForBooking(consignee?.phone ?? existingOrder.buyer_phone) ||
        consignee?.phone ||
        existingOrder.buyer_phone ||
        '',
      email: consignee?.email || existingOrder.buyer_email || undefined,
    },
    pickup: {
      warehouse_name: pickup?.warehouse_name || '',
      name: pickup?.name || pickup?.warehouse_name || '',
      address: pickup?.address || '',
      address_2: pickup?.address_2,
      city: pickup?.city || '',
      state: pickup?.state || '',
      country: pickup?.country || 'India',
      pincode: pickup?.pincode || '',
      phone: pickup?.phone || '',
      gst_number: pickup?.gst_number,
      pickup_date: payload.pickup_date || pickup?.pickup_date,
      pickup_time: payload.pickup_time || pickup?.pickup_time,
    },
    is_rto_different: payload.is_rto_different,
    rto: rto
      ? {
          warehouse_name: rto.warehouse_name || '',
          name: rto.name || rto.warehouse_name || '',
          address: rto.address || '',
          address_2: rto.address_2,
          city: rto.city || '',
          state: rto.state || '',
          country: rto.country || 'India',
          pincode: rto.pincode || '',
          phone: rto.phone || '',
        }
      : undefined,
    company: {},
    order_items: orderItems,
    invoice_number: existingOrder.invoice_number || existingOrder.order_number,
    invoice_date: existingOrder.invoice_date || new Date().toISOString().slice(0, 10),
    invoice_amount: existingOrder.invoice_amount ?? existingOrder.order_amount ?? orderAmount,
    tags: existingOrder.tags || undefined,
    order_id: existingOrder.order_id || undefined,
    ...(payload.chargedWeight !== undefined ? { chargedWeight: payload.chargedWeight } : {}),
    ...(payload.volumetricWeight !== undefined ? { volumetricWeight: payload.volumetricWeight } : {}),
  } as ShipmentParams

  const result = await createB2CShipmentService(shipmentParams, userId, false, {
    existingOrderId: existingOrder.id,
  })

  const [updatedOrder] = await db
    .select()
    .from(b2c_orders)
    .where(eq(b2c_orders.id, existingOrder.id))
    .limit(1)

  if (updatedOrder && String(updatedOrder.order_id || '').startsWith('woo_')) {
    const { syncWooCommerceStatusForLocalOrder } = await import('./woocommerce.service')
    await syncWooCommerceStatusForLocalOrder(updatedOrder, db, { source: 'courier-booking' }).catch((err: any) => {
      console.warn('WooCommerce status sync skipped after courier booking:', err?.message || err)
    })
  }

  return {
    ...result,
    order: updatedOrder || result.order,
  }
}

//B2B

const findProviderValue = (value: unknown, keys: string[]): unknown => {
  if (!value || typeof value !== 'object') return undefined
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findProviderValue(entry, keys)
      if (found !== undefined && found !== null && found !== '') return found
    }
    return undefined
  }

  const record = value as Record<string, unknown>
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && record[key] !== '') {
      return record[key]
    }
  }
  for (const nested of Object.values(record)) {
    const found = findProviderValue(nested, keys)
    if (found !== undefined && found !== null && found !== '') return found
  }
  return undefined
}

const delhiveryB2BServiceable = (response: any) => {
  if (response?.success === false) return false
  const rows =
    response?.data?.pincode_serviceability_data ||
    response?.pincode_serviceability_data ||
    response?.data ||
    []
  if (!Array.isArray(rows)) return Boolean(rows)
  return rows.length > 0
}

const delhiveryB2BManifestFailed = (response: any) => {
  if (response?.success === false) return true
  const status = String(
    findProviderValue(response, ['status', 'job_status', 'state']) || '',
  ).toLowerCase()
  return ['failed', 'failure', 'error', 'rejected', 'cancelled'].includes(status)
}

const waitForDelhiveryB2BManifest = async (
  service: DelhiveryB2BService,
  initialResponse: any,
) => {
  let response = initialResponse
  const jobId = String(
    findProviderValue(initialResponse, ['job_id', 'jobId', 'request_id', 'requestId']) || '',
  ).trim()
  const configuredDelay = Number(process.env.DELHIVERY_B2B_MANIFEST_POLL_DELAY_MS || 1500)
  const pollDelayMs = Number.isFinite(configuredDelay)
    ? Math.min(30_000, Math.max(1_000, configuredDelay))
    : 1500

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const lrn = String(
      findProviderValue(response, ['lrn', 'lrnum', 'lr_number', 'lr_number_id']) || '',
    ).trim()
    if (lrn) return { response, jobId, lrn }
    if (delhiveryB2BManifestFailed(response)) {
      throw new HttpError(422, 'Delhivery B2B rejected the shipment manifestation')
    }
    if (!jobId) break
    await new Promise((resolve) => setTimeout(resolve, pollDelayMs))
    response = await service.getManifestStatus(jobId)
  }

  if (!jobId) {
    throw new HttpError(
      502,
      'Delhivery B2B manifestation did not return an LR number or job ID',
    )
  }

  const pendingError = new HttpError(
    202,
    `Delhivery B2B manifestation is still processing (job_id: ${jobId})`,
  ) as HttpError & { providerRequestId: string }
  pendingError.providerRequestId = jobId
  throw pendingError
}

export const createB2BShipmentService = async (
  params: ShipmentParams,
  userId: string,
  is_external_api: boolean = false,
) => {
  await requireMerchantOrderReadiness(userId, { requireMinimumWalletBalance: false })

  // Helper function to normalize JSON values (similar to B2C)
  const normalizeJsonValue = (value: unknown) => {
    if (!value) return null

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return null
      try {
        return JSON.parse(trimmed)
      } catch (err) {
        console.warn('⚠️ Unable to parse JSON string in createB2BShipmentService:', trimmed)
        return null
      }
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value as Record<string, unknown>).filter((key) => {
        const v = (value as Record<string, unknown>)[key]
        if (v === undefined || v === null) return false
        if (typeof v === 'string') return v.trim().length > 0
        return true
      })

      return keys.length ? value : null
    }

    return null
  }

  const pickupDetails = normalizeJsonValue(params.pickup) ?? {}
  const rtoDetails = normalizeJsonValue(params.rto)
  const normalizedOrderNumber = await ensureUniqueMerchantOrderNumber(
    db as any,
    userId,
    params.order_number,
  )

  const inferredBoxes = Array.isArray(params.boxes)
    ? params.boxes
        .map((box: any, index: number) => ({
          box_name: box?.box_name || box?.name || `Package ${index + 1}`,
          length: Number(box?.length ?? box?.lengthCm ?? 0),
          breadth: Number(box?.breadth ?? box?.breadthCm ?? 0),
          height: Number(box?.height ?? box?.heightCm ?? 0),
          weight: Number(box?.weight ?? box?.weightKg ?? 0),
          quantity: Number(box?.quantity ?? 1),
        }))
        .filter(
          (box: any) =>
            box.length > 0 ||
            box.breadth > 0 ||
            box.height > 0 ||
            box.weight > 0 ||
            box.quantity > 0,
        )
    : []

  const normalizedInvoices = Array.isArray(params.invoices)
    ? params.invoices
        .map((invoice: any, index: number) => ({
          invoiceNumber: String(
            invoice?.invoiceNumber || invoice?.invoice_number || `INV-${index + 1}`,
          ).trim(),
          invoiceDate: String(
            invoice?.invoiceDate || invoice?.invoice_date || params.order_date || '',
          ).trim(),
          invoiceValue: Number(invoice?.invoiceValue ?? invoice?.invoice_value ?? 0),
          ewaybill: String(invoice?.ewaybill || invoice?.eway_bill || '').trim(),
          qrCode: String(invoice?.invQrCode || invoice?.inv_qr_code || '').trim(),
          invoiceFileUrl:
            String(invoice?.invoiceFileUrl || invoice?.invoice_file_url || '').trim() || undefined,
        }))
        .filter((invoice: any) => invoice.invoiceNumber || invoice.invoiceValue > 0)
    : []

  const normalizedOrderItems =
    Array.isArray(params.order_items) && params.order_items.length
      ? params.order_items.map((item: any, index: number) => ({
          name: item?.name || `Item ${index + 1}`,
          sku: item?.sku || `SKU-${index + 1}`,
          qty: Number(item?.qty ?? item?.quantity ?? 1),
          quantity: Number(item?.quantity ?? item?.qty ?? 1),
          price: Number(item?.price ?? 0),
          hsn: item?.hsn || item?.hsnCode || '',
          hsnCode: item?.hsnCode || item?.hsn || '',
          discount: Number(item?.discount ?? 0),
          tax_rate: Number(item?.tax_rate ?? 0),
        }))
      : normalizedInvoices.length
        ? normalizedInvoices.map((invoice: any, index: number) => ({
            name: invoice.invoiceNumber || `Invoice ${index + 1}`,
            sku: `INV-${index + 1}`,
            qty: 1,
            quantity: 1,
            price: Number(invoice.invoiceValue ?? 0),
            hsn: '',
            hsnCode: '',
            discount: 0,
            tax_rate: 0,
          }))
        : inferredBoxes.map((box: any, index: number) => ({
            name: box.box_name || `Package ${index + 1}`,
            sku: `BOX-${index + 1}`,
            qty: Number(box.quantity ?? 1),
            quantity: Number(box.quantity ?? 1),
            price: Number(params.order_amount ?? 0) / Math.max(inferredBoxes.length, 1),
            hsn: '',
            hsnCode: '',
            discount: 0,
            tax_rate: 0,
          }))

  const primaryInvoice = normalizedInvoices[0]

  const courierId =
    params.courier_id !== undefined && params.courier_id !== null
      ? Number(params.courier_id)
      : undefined

  let effectiveIntegrationType = String(params.integration_type || '')
    .trim()
    .toLowerCase()

  if (!effectiveIntegrationType && courierId) {
    const [courierRow] = await db
      .select({ serviceProvider: couriers.serviceProvider })
      .from(couriers)
      .where(eq(couriers.id, courierId))
      .limit(1)
    effectiveIntegrationType = String(courierRow?.serviceProvider || '')
      .trim()
      .toLowerCase()
  }

  if (!['shadowfax', 'delhivery'].includes(effectiveIntegrationType)) {
    throw new HttpError(
      400,
      'B2B shipment booking is supported for Delhivery and Shadowfax only.',
    )
  }

  const invoiceValue = Number(
    primaryInvoice?.invoiceValue ?? params.invoice_amount ?? params.order_amount ?? 0,
  )

  let activePlanId: string | null = null
  try {
    const [userPlan] = await db
      .select({ planId: userPlans.plan_id })
      .from(userPlans)
      .where(eq(userPlans.userId, userId))
    activePlanId = userPlan?.planId ?? null
  } catch (planErr) {
    console.error('⚠️ Failed to fetch B2B user plan for ROV:', planErr)
  }

  const insuranceSelected = params.is_insurance === 1 || (params.is_insurance as any) === true
  const rovCharge =
    insuranceSelected
      ? await computeRovChargeForOrder({
          invoiceValue,
          isInsurance: true,
          courierId,
          serviceProvider: effectiveIntegrationType,
          planId: activePlanId ?? undefined,
        })
      : 0

  // Compute B2B rate breakdown (using admin overhead config)
  let chargesBreakdown: {
    baseFreight: number
    overheads: {
      id: string
      code?: string
      name: string
      type: string
      amount: number
      description?: string
    }[]
    demurrage: number
    total: number
  } | null = null

  try {
    const rateResult = await calculateB2BRate({
      originPincode: params.pickup?.pincode ?? '',
      destinationPincode: params.consignee.pincode,
      weightKg:
        inferredBoxes.reduce((sum: number, box: any) => sum + Number(box.weight ?? 0), 0) ||
        Number(params.package_weight ?? 0),
      length:
        (inferredBoxes.length
          ? Math.max(...inferredBoxes.map((box: any) => Number(box.length ?? 0)))
          : 0) ||
        Number(params.package_length ?? 0) ||
        undefined,
      width:
        (inferredBoxes.length
          ? Math.max(...inferredBoxes.map((box: any) => Number(box.breadth ?? 0)))
          : 0) ||
        Number(params.package_breadth ?? 0) ||
        undefined,
      height:
        (inferredBoxes.length
          ? Math.max(...inferredBoxes.map((box: any) => Number(box.height ?? 0)))
          : 0) ||
        Number(params.package_height ?? 0) ||
        undefined,
      invoiceValue,
      paymentMode: (params.payment_type ?? 'prepaid').toUpperCase() === 'COD' ? 'COD' : 'PREPAID',
      courierScope: {
        courierId,
        serviceProvider: effectiveIntegrationType || undefined,
      },
      pickupDate: params.pickup?.pickup_date,
      deliveryAddress: params.consignee.address,
      planId: activePlanId ?? undefined,
    })

    if (rateResult?.charges) {
      chargesBreakdown = {
        baseFreight: rateResult.charges.baseFreight,
        overheads: rateResult.charges.overheads,
        demurrage: rateResult.charges.demurrage,
        total: rateResult.charges.total,
      }
    }
  } catch (err) {
    console.error('⚠️ Failed to compute B2B charges breakdown for order', params.order_number, err)
    chargesBreakdown = null
  }

  // 1️⃣ Insert local B2B order as 'pending'
  const [pendingOrder] = await db
    .insert(b2b_orders)
    .values({
      order_number: normalizedOrderNumber,
      order_date: params?.order_date,
      order_amount: params?.order_amount,
      integration_type: effectiveIntegrationType,
      user_id: userId,
      company_name: params.consignee?.company_name ?? '',
      company_gst: params.consignee?.gstin ?? '',
      buyer_name: params.consignee.name,
      buyer_phone: params.consignee.phone ?? '',
      buyer_email: params.consignee.email ?? '',
      address: params.consignee.address,
      city: params.consignee.city,
      state: params.consignee.state,
      country: 'India',
      pincode: params.consignee.pincode,
      packages: inferredBoxes.length ? inferredBoxes : null,
      order_type: params.payment_type,
      order_status: 'pending',
      invoice_number: primaryInvoice?.invoiceNumber ?? params?.invoice_number,
      invoice_date: primaryInvoice?.invoiceDate ?? params?.invoice_date,
      invoice_amount:
        primaryInvoice?.invoiceValue !== undefined
          ? String(primaryInvoice.invoiceValue)
          : params?.invoice_amount
            ? String(params.invoice_amount)
            : null,
      is_insurance: insuranceSelected,
      declared_value: insuranceSelected ? invoiceValue : null,
      rov_charge: insuranceSelected ? rovCharge : null,
      charges_breakdown: chargesBreakdown,
      shipping_charges: params.shipping_charges ?? 0,
      freight_charges: params.freight_charges ?? 0, // What platform charges seller
      courier_cost: params.courier_cost ?? null, // What platform pays courier (will be updated via webhook)
      transaction_fee: params.transaction_fee ?? 0,
      discount: params.discount ?? 0,
      gift_wrap: params.gift_wrap ? Number(params.gift_wrap) : 0,
      products: normalizedOrderItems,
      delivery_location: params.delivery_location ?? params.zone ?? null,
      pickup_location_id: params.pickup_location_id ?? params.pickup?.warehouse_name ?? null,
      pickup_details: pickupDetails,
      rto_details: rtoDetails,
      is_rto_different: params.is_rto_different === 'yes',
      is_external_api: is_external_api ?? false,
      provider_mode:
        effectiveIntegrationType === 'shadowfax'
          ? resolveShadowfaxOrderMode(params as any, params.shadowfax_forward_mode)
          : String(params.freight_mode || 'fop').toLowerCase(),
      provider_service:
        effectiveIntegrationType === 'shadowfax'
          ? normalizeShadowfaxServiceModeValue(
              params.shadowfax_service_mode ||
                params.shipping_mode ||
                params.transport_speed ||
                'surface',
            )
          : 'ltl',
      provider_last_status: 'pending',
      created_at: new Date(),
      updated_at: new Date(),
    } as any)
    .returning({ id: b2b_orders.id })

  const boxes = inferredBoxes

  const totalDeadWeight = boxes.reduce((sum: number, b: any) => sum + Number(b.weight ?? 0), 0)
  const totalVolumetricWeight = boxes.reduce(
    (sum: number, b: any) =>
      sum + (Number(b.length ?? 0) * Number(b.breadth ?? 0) * Number(b.height ?? 0)) / 5000,
    0,
  )

  const package_weight = Math.max(
    0.5,
    Number(
      (
        Math.max(totalDeadWeight, totalVolumetricWeight) ||
        Number(params.package_weight ?? 0) ||
        0.5
      ).toFixed(2),
    ),
  )
  const package_length = boxes.length
    ? Math.max(...boxes.map((b: any) => Number(b.length ?? 0)))
    : Number(params.package_length ?? params.length ?? 0)
  const package_breadth = boxes.length
    ? Math.max(...boxes.map((b: any) => Number(b.breadth ?? 0)))
    : Number(params.package_breadth ?? params.breadth ?? 0)
  const package_height = boxes.length
    ? Math.max(...boxes.map((b: any) => Number(b.height ?? 0)))
    : Number(params.package_height ?? params.height ?? 0)

  if (effectiveIntegrationType === 'delhivery') {
    const delhivery = new DelhiveryB2BService()
    try {
      const originPincode = String(params.pickup?.pincode || '').trim()
      const destinationPincode = String(params.consignee?.pincode || '').trim()
      const weightGrams = Math.max(1, Math.round(package_weight * 1000))
      const [originServiceability, destinationServiceability, defaults] = await Promise.all([
        delhivery.checkServiceability(originPincode, weightGrams),
        delhivery.checkServiceability(destinationPincode, weightGrams),
        delhivery.getOperationalDefaults(),
      ])

      if (!delhiveryB2BServiceable(originServiceability)) {
        throw new HttpError(400, `Delhivery B2B does not service origin pincode ${originPincode}`)
      }
      if (!delhiveryB2BServiceable(destinationServiceability)) {
        throw new HttpError(
          400,
          `Delhivery B2B does not service destination pincode ${destinationPincode}`,
        )
      }

      const itemDescription = normalizedOrderItems
        .map((item: any) => String(item.name || '').trim())
        .filter(Boolean)
        .join(', ')
        .slice(0, 300)
      const boxCount = Math.max(
        1,
        boxes.reduce((sum: number, box: any) => sum + Math.max(1, Number(box.quantity || 1)), 0),
      )
      const freightMode =
        String(params.freight_mode || defaults.freightMode).toLowerCase() === 'fod'
          ? 'fod'
          : 'fop'
      const pickupLocationName = String(params.pickup?.warehouse_name || '').trim()
      if (!pickupLocationName && !defaults.warehouseId) {
        throw new HttpError(
          400,
          'A Delhivery B2B pickup warehouse name or default warehouse ID is required',
        )
      }
      const manifestPayload: Record<string, unknown> = {
        pickup_location_name: pickupLocationName || undefined,
        pickup_location_id: pickupLocationName ? undefined : defaults.warehouseId || undefined,
        payment_mode: params.payment_type === 'cod' ? 'cod' : 'prepaid',
        cod_amount: params.payment_type === 'cod' ? Number(params.order_amount || 0) : undefined,
        weight: weightGrams,
        dropoff_location: {
          consignee_name: params.consignee.name,
          address: params.consignee.address,
          city: params.consignee.city,
          state: params.consignee.state,
          zip: destinationPincode,
          phone: params.consignee.phone,
          email: params.consignee.email || '',
        },
        return_address:
          params.is_rto_different === 'yes' && params.rto
            ? {
                name: params.rto.name || params.rto.warehouse_name,
                address: params.rto.address,
                city: params.rto.city,
                state: params.rto.state,
                zip: params.rto.pincode,
                phone: params.rto.phone,
              }
            : undefined,
        shipment_details: [
          {
            order_id: normalizedOrderNumber,
            box_count: boxCount,
            description: itemDescription || normalizedOrderNumber,
            weight: weightGrams,
            waybills: [],
            master: true,
          },
        ],
        dimensions: boxes.map((box: any) => ({
          box_count: Math.max(1, Number(box.quantity || 1)),
          length: Number(box.length || 0),
          width: Number(box.breadth || 0),
          height: Number(box.height || 0),
        })),
        rov_insurance: insuranceSelected,
        invoices: normalizedInvoices.map((invoice: any) => ({
          ewaybill: invoice.ewaybill || '',
          inv_num: invoice.invoiceNumber,
          inv_amt: invoice.invoiceValue,
          inv_qr_code: invoice.qrCode || '',
        })),
        freight_mode: freightMode,
        fm_pickup:
          params.request_auto_pickup === 'yes' ? true : Boolean(defaults.fmPickup),
        billing_address: (params as any).billing_address,
        callback: (params as any).callback,
      }

      const initialManifest = await delhivery.manifestShipment(manifestPayload)
      const manifest = await waitForDelhiveryB2BManifest(delhivery, initialManifest)
      const waybillValue = findProviderValue(manifest.response, [
        'waybills',
        'awb_numbers',
        'awb_number',
        'awb',
      ])
      const waybills = Array.isArray(waybillValue)
        ? waybillValue.map((value) => String(value)).filter(Boolean)
        : String(waybillValue || '')
            .split(',')
            .map((value) => value.trim())
            .filter(Boolean)
      const primaryAwb = waybills[0] || manifest.lrn

      await db
        .update(b2b_orders)
        .set({
          integration_type: 'delhivery',
          order_status: 'pickup_initiated',
          order_id: manifest.lrn,
          shipment_id: manifest.lrn,
          awb_number: primaryAwb,
          courier_partner: 'Delhivery B2B',
          courier_id: courierId ?? null,
          weight: package_weight,
          length: package_length || null,
          breadth: package_breadth || null,
          height: package_height || null,
          volumetric_weight: Number(totalVolumetricWeight || 0) || null,
          charged_weight: package_weight,
          provider_reference: manifest.lrn,
          provider_request_id: manifest.jobId || null,
          provider_mode: freightMode,
          provider_service: 'ltl',
          provider_last_status: 'manifested',
          provider_meta: {
            manifest: manifest.response,
            waybills,
            origin_serviceability: originServiceability,
            destination_serviceability: destinationServiceability,
          },
          updated_at: new Date(),
        } as any)
        .where(eq(b2b_orders.id, pendingOrder.id))

      sendWebhookEvent(userId, 'order.created', {
        order_id: pendingOrder.id,
        order_number: normalizedOrderNumber,
        awb_number: primaryAwb,
        status: 'pickup_initiated',
        courier_partner: 'Delhivery B2B',
        courier_id: courierId ?? null,
        shipment_id: manifest.lrn,
        integration_type: 'delhivery',
        payment_type: params.payment_type,
        created_at: new Date().toISOString(),
        order_type: 'b2b',
      }).catch((err) => console.error('Failed to send B2B order.created webhook:', err))

      return {
        order: {
          id: pendingOrder.id,
          order_number: normalizedOrderNumber,
          awb_number: primaryAwb,
          lrn: manifest.lrn,
          provider_request_id: manifest.jobId || null,
        },
        shipment: manifest.response,
      }
    } catch (error: any) {
      await db
        .update(b2b_orders)
        .set({
          integration_type: 'delhivery',
          order_status: error?.statusCode === 202 ? 'manifest_pending' : 'failed',
          provider_last_status:
            error?.statusCode === 202 ? 'manifest_processing' : 'booking_failed',
          provider_request_id: error?.providerRequestId || null,
          provider_meta: {
            error: error?.message || 'Delhivery B2B shipment creation failed',
            ...(error?.providerRequestId ? { job_id: error.providerRequestId } : {}),
          },
          updated_at: new Date(),
        } as any)
        .where(eq(b2b_orders.id, pendingOrder.id))
      throw error
    }
  }

  const payload: ShipmentParams = {
    ...params,
    order_number: normalizedOrderNumber,
    integration_type: 'shadowfax',
    payment_type: params.payment_type === 'prepaid' ? 'prepaid' : 'cod',
    request_auto_pickup: params.request_auto_pickup ?? 'no',
    is_insurance: params.is_insurance ?? 0,
    is_rto_different: params.is_rto_different ?? 'no',
    package_weight,
    package_length,
    package_breadth,
    package_height,
    order_items: normalizedOrderItems,
    invoice_number: primaryInvoice?.invoiceNumber ?? params.invoice_number,
    invoice_date: primaryInvoice?.invoiceDate ?? params.invoice_date,
    invoice_amount: primaryInvoice?.invoiceValue ?? params.invoice_amount,
    company: {
      name: params.consignee?.company_name || params.company?.name || '',
      gst: params.consignee?.gstin || params.company?.gst || '',
    },
  }
  const shadowfaxForwardMode = resolveShadowfaxOrderMode(
    params as any,
    params.shadowfax_forward_mode,
  )
  const shadowfaxServiceMode = normalizeShadowfaxServiceModeValue(
    params.shadowfax_service_mode || params.shipping_mode || params.transport_speed || 'surface',
  )

  try {
    const shadowfax = new ShadowfaxService()
    const booking = await shadowfax.createForwardShipmentWithFallback(payload, {
      origin: String(params.pickup?.pincode || ''),
      destination: String(params.consignee?.pincode || ''),
      paymentType: params.payment_type,
      mode: shadowfaxForwardMode,
      service: shadowfaxServiceMode,
    })
    const resolvedShadowfaxMode = booking.mode
    const resolvedShadowfaxService = booking.service
    const shipmentData = booking.shipment

    const forwardData = shipmentData?.data || shipmentData
    const shadowfaxAwb = forwardData?.awb_number || shipmentData?.awb_number || null

    if (!shadowfaxAwb) {
      console.error('❌ Invalid Shadowfax B2B shipment:', shipmentData)
      throw new HttpError(500, 'Shadowfax B2B shipment creation failed')
    }

    const providerReference =
      String(
        forwardData?.id?.toString?.() ??
          forwardData?.client_order_id ??
          shipmentData?.shipment_id ??
          shadowfaxAwb,
      ).trim() || shadowfaxAwb

    const providerRequestId =
      String(
        forwardData?.request_id ??
          forwardData?.client_request_id ??
          shipmentData?.request_id ??
          shipmentData?.client_request_id ??
          shadowfaxAwb,
      ).trim() || shadowfaxAwb

    await db
      .update(b2b_orders)
      .set({
        integration_type: 'shadowfax',
        order_status: 'pickup_initiated',
        order_id: String(forwardData?.order_id || '').trim() || null,
        shipment_id: providerReference,
        awb_number: shadowfaxAwb,
        courier_partner: 'Shadowfax',
        courier_id: courierId ?? null,
        label: typeof shipmentData?.label === 'string' ? shipmentData.label : null,
        manifest:
          typeof shipmentData?.manifest === 'string' && shipmentData.manifest.length <= 100
            ? shipmentData.manifest
            : null,
        courier_cost:
          shipmentData?.freight_charges ??
          shipmentData?.charge ??
          shipmentData?.cost ??
          params?.courier_cost ??
          null,
        invoice_link: shipmentData?.invoice_link ?? null,
        weight: package_weight,
        length: package_length || null,
        breadth: package_breadth || null,
        height: package_height || null,
        volumetric_weight: Number(totalVolumetricWeight || 0) || null,
        charged_weight: package_weight,
        provider_reference: providerReference,
        provider_request_id: providerRequestId,
        provider_mode: resolvedShadowfaxMode,
        provider_service: resolvedShadowfaxService,
        provider_last_status: String(
          forwardData?.status || forwardData?.current_status || 'pickup_initiated',
        ),
        provider_meta: shipmentData,
        updated_at: new Date(),
      } as any)
      .where(eq(b2b_orders.id, pendingOrder.id))

    sendWebhookEvent(userId, 'order.created', {
      order_id: pendingOrder.id,
      order_number: normalizedOrderNumber,
      awb_number: shadowfaxAwb,
      status: 'pickup_initiated',
      courier_partner: 'Shadowfax',
      courier_id: courierId ?? null,
      shipment_id: providerReference,
      integration_type: 'shadowfax',
      payment_type: params.payment_type,
      created_at: new Date().toISOString(),
      order_type: 'b2b',
    }).catch((err) => {
      console.error('Failed to send B2B order.created webhook:', err)
    })

    console.log(`B2B Order ${pendingOrder.id} successfully booked with Shadowfax shipment.`)
    return {
      order: {
        id: pendingOrder.id,
        order_number: normalizedOrderNumber,
        awb_number: shadowfaxAwb,
        provider_reference: providerReference,
        provider_request_id: providerRequestId,
      },
      shipment: shipmentData,
    }
  } catch (error: any) {
    await db
      .update(b2b_orders)
      .set({
        integration_type: 'shadowfax',
        order_status: 'failed',
        provider_last_status: 'booking_failed',
        provider_meta: {
          error: error?.message || 'B2B shipment creation failed',
        },
        updated_at: new Date(),
      } as any)
      .where(eq(b2b_orders.id, pendingOrder.id))

    throw error
  }
}

export const getAllB2COrdersService = async () => {
  const orders = await db.select().from(b2c_orders).orderBy(desc(b2c_orders.updated_at)) // ✅ FIX
  return orders
}

// ✅ Get all B2B orders
export const getAllB2BOrdersService = async () => {
  const orders = await db.select().from(b2b_orders).orderBy(desc(b2b_orders.created_at)) // ✅ FIX
  return orders
}

interface OrderFilters {
  status?: string | string[] // support single or multiple statuses
  type?: string
  courier?: string
  warehouse?: string
  productQuery?: string
  fromDate?: string
  toDate?: string
  search?: string
  sortBy?: 'created_at'
  sortOrder?: 'asc' | 'desc'
}

export const getB2COrdersByUserService = async (
  userId: string,
  page: number = 1,
  limit: number = 10,
  filters: OrderFilters = {},
) => {
  const offset = (page - 1) * limit

  // Build conditions array (explicit type)
  const conditions: SQL<unknown>[] = [eq(b2c_orders.user_id, userId)]

  // 🔹 Status filter (single or multiple)
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(inArray(b2c_orders.order_status, filters.status))
    } else {
      conditions.push(eq(b2c_orders.order_status, filters.status))
    }
  }

  // 🔹 Type filter (COD / Prepaid)
  if (filters.type) {
    conditions.push(eq(b2c_orders.order_type, filters.type))
  }

  // 🔹 Courier filter
  if (filters.courier) {
    const courierId = Number(filters.courier)
    if (!isNaN(courierId) && courierId > 0) {
      // Match by courier_id (numeric)
      conditions.push(eq(b2c_orders.courier_id, courierId))
    } else {
      // If not a valid number, try matching by courier_partner name
      conditions.push(ilike(b2c_orders.courier_partner, `%${filters.courier}%`))
    }
  }

  // 🔹 Warehouse filter - check both pickup_location_id and pickup_details JSONB
  if (filters.warehouse && filters.warehouse.trim()) {
    const warehouseFilter = `%${filters.warehouse.trim()}%`
    const warehouseConditions: any[] = [ilike(b2c_orders.pickup_location_id, warehouseFilter)]

    // Also check JSONB fields in pickup_details
    warehouseConditions.push(
      sql`COALESCE(${b2c_orders.pickup_details}->>'warehouse_name', '') ILIKE ${warehouseFilter}`,
    )
    warehouseConditions.push(
      sql`COALESCE(${b2c_orders.pickup_details}->>'name', '') ILIKE ${warehouseFilter}`,
    )

    conditions.push(or(...warehouseConditions) as any)
  }

  // 🔹 Date filters
  if (filters.fromDate) {
    // Start of day for fromDate
    const fromDate = new Date(filters.fromDate)
    fromDate.setHours(0, 0, 0, 0)
    conditions.push(gte(b2c_orders.created_at, fromDate))
  }
  if (filters.toDate) {
    // End of day for toDate to include the entire day
    const toDate = new Date(filters.toDate)
    toDate.setHours(23, 59, 59, 999)
    conditions.push(lte(b2c_orders.created_at, toDate))
  }

  if (filters.search && filters.search.trim()) {
    const search = filters.search.trim()

    // try parse number safely
    const searchAsNumber = Number(search)
    const isNumericSearch = !isNaN(searchAsNumber) && search.length > 0

    const searchConditions: any[] = [
      ilike(b2c_orders.order_number, `%${search}%`),
      ilike(b2c_orders.buyer_name, `%${search}%`),
      ilike(b2c_orders.buyer_phone, `%${search}%`),
      ilike(b2c_orders.awb_number, `%${search}%`),
      ilike(b2c_orders.provider_reference, `%${search}%`),
      ilike(b2c_orders.provider_request_id, `%${search}%`),
      ilike(b2c_orders.buyer_email, `%${search}%`),
    ]

    if (isNumericSearch) {
      // Match exact order amount
      searchConditions.push(eq(b2c_orders.order_amount, searchAsNumber))
      // Also search in order amount as text for partial matches
      searchConditions.push(
        sql`CAST(${b2c_orders.order_amount} AS TEXT) ILIKE ${'%' + search + '%'}`,
      )
    }

    // Search in city, state, and pincode
    searchConditions.push(ilike(b2c_orders.city, `%${search}%`))
    searchConditions.push(ilike(b2c_orders.state, `%${search}%`))
    searchConditions.push(ilike(b2c_orders.pincode, `%${search}%`))

    conditions.push(or(...searchConditions) as any)
  }

  if (filters.productQuery && filters.productQuery.trim()) {
    const productQuery = `%${filters.productQuery.trim()}%`
    conditions.push(
      sql`EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(${b2c_orders.products}, '[]'::jsonb)) AS product
        WHERE
          COALESCE(product->>'productName', '') ILIKE ${productQuery}
          OR COALESCE(product->>'sku', '') ILIKE ${productQuery}
      )`,
    )
  }

  // Combine conditions safely
  const whereCondition = conditions.length === 1 ? conditions[0] : and(...conditions)

  // Count total rows
  const totalResult = await db
    .select({ value: count().as('value') })
    .from(b2c_orders)
    .where(whereCondition)

  const total = Number(totalResult[0]?.value ?? 0)

  if (total === 0) {
    return { orders: [], totalCount: 0, totalPages: 0 }
  }

  // Fetch paginated results
  const sortBy = filters.sortBy || 'created_at'
  const sortOrder = filters.sortOrder === 'asc' ? 'asc' : 'desc'
  const orderByClause =
    sortBy === 'created_at' && sortOrder === 'asc'
      ? asc(b2c_orders.created_at)
      : desc(b2c_orders.created_at)

  const ordersRaw = await db
    .select({
      ...b2cOrderListSelect,
      totalAmount: sql<number>`
        (
          COALESCE(${b2c_orders.order_amount}, 0)
          + COALESCE(${b2c_orders.shipping_charges}, 0)
          + COALESCE(${b2c_orders.transaction_fee}, 0)
          + COALESCE(${b2c_orders.gift_wrap}, 0)
          - COALESCE(${b2c_orders.discount}, 0)
          - COALESCE(${b2c_orders.prepaid_amount}, 0)
        ) as "totalAmount"
      `,
    })
    .from(b2c_orders)
    .where(whereCondition)
    .orderBy(orderByClause)
    .limit(limit)
    .offset(offset)

  // Sanitize orders - remove internal platform fields (courier_cost)
  const { sanitizeOrdersForCustomer } = await import('../../utils/orderSanitizer')
  const orders = await sanitizeOrdersForCustomer(ordersRaw)

  return {
    orders,
    totalCount: total,
    totalPages: Math.ceil(total / limit),
  }
}

export const getB2BOrdersByUserService = async (
  userId: string,
  page: number = 1,
  limit: number = 10,
  filters: OrderFilters = {},
) => {
  const offset = (page - 1) * limit

  const conditions: any[] = [sql`${b2b_orders.user_id} = ${userId}::uuid`]

  // if (filters.status) conditions.push(eq(b2b_orders.order_status, filters.status))
  if (filters.fromDate)
    conditions.push(
      gte(b2b_orders.order_date, new Date(filters.fromDate).toISOString().slice(0, 10)),
    )
  if (filters.toDate)
    conditions.push(lte(b2b_orders.order_date, new Date(filters.toDate).toISOString().slice(0, 10)))

  if (filters.search) {
    conditions.push(
      or(
        ilike(b2b_orders.order_number, `%${filters.search}%`),
        ilike(b2b_orders.buyer_name, `%${filters.search}%`),
        ilike(b2b_orders.buyer_phone, `%${filters.search}%`),
        ilike(b2b_orders.awb_number, `%${filters.search}%`),
        ilike(b2b_orders.provider_reference, `%${filters.search}%`),
        ilike(b2b_orders.provider_request_id, `%${filters.search}%`),
      ),
    )
  }

  const whereCondition = conditions.length === 1 ? conditions[0] : and(...conditions)

  const totalResult = await db
    .select({ value: count().as('value') })
    .from(b2b_orders)
    .where(whereCondition)

  const total = Number(totalResult[0]?.value ?? 0)

  if (total === 0) return { orders: [], totalCount: 0, totalPages: 0 }

  const ordersRaw = await db
    .select(b2bOrderListSelect)
    .from(b2b_orders)
    .where(whereCondition)
    .orderBy(desc(b2b_orders.order_date))
    .limit(limit)
    .offset(offset)

  // Sanitize orders - remove internal platform fields (courier_cost)
  const { sanitizeOrdersForCustomer } = await import('../../utils/orderSanitizer')
  const orders = await sanitizeOrdersForCustomer(ordersRaw)

  return {
    orders,
    totalCount: total,
    totalPages: Math.ceil(total / limit),
  }
}

// // 🔹 Get all B2B orders for a user
// export const getB2BOrdersByUserService = async (userId: string) => {
//   const orders = await db
//     .select()
//     .from(b2b_orders)
//     .where(eq(b2b_orders.user_id, userId))
//     .orderBy(desc(b2b_orders.created_at))

//   return orders
// }
interface UpdateB2COrderParams {
  awb_number?: string // identify order by AWB
  order_id?: string // or by internal order ID
  updates: Partial<{
    manifest: string
    order_status: string
    courier_partner: string
    updated_at: Date
    [key: string]: any // for any other dynamic field
  }>
}

export const updateB2COrderService = async (params: UpdateB2COrderParams) => {
  try {
    const { awb_number, order_id, updates } = params

    if (!awb_number && !order_id) {
      throw new Error('Either awb_number or order_id must be provided')
    }

    const condition = awb_number
      ? eq(b2c_orders.awb_number, awb_number)
      : eq(b2c_orders.order_id, order_id!)

    const updated = await db
      .update(b2c_orders)
      .set({ ...updates, updated_at: new Date() })
      .where(condition)
      .returning({ id: b2c_orders.id, awb_number: b2c_orders.awb_number })

    return updated
  } catch (error: any) {
    console.error('Update B2C order error:', error.message)
    throw new Error(`Failed to update order: ${error.message}`)
  }
}

type OrderType = 'b2c' | 'b2b'

async function resolveManifestUrlOutsideTransaction(value: string | null): Promise<string | null> {
  if (!value) return null
  if (/^https?:\/\//i.test(value)) return value
  try {
    const signed = await presignDownload(value)
    return Array.isArray(signed) ? (signed[0] ?? null) : signed
  } catch (err) {
    console.error('⚠️ Failed to presign manifest URL:', err)
    return null
  }
}

function normalizeToR2KeyOutsideTransaction(value: string | null | undefined): string | null {
  if (!value || typeof value !== 'string' || !value.trim()) {
    return null
  }

  const trimmed = value.trim()
  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    const pathParts = url.pathname.split('/').filter(Boolean)
    const bucket = getBucketName()

    if (pathParts.includes(bucket)) {
      const bucketIndex = pathParts.indexOf(bucket)
      if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
        const key = pathParts.slice(bucketIndex + 1).join('/')
        console.log(`🔄 Extracted R2 key from URL: ${key}`)
        return key
      }
    }

    if (process.env.R2_ENDPOINT && trimmed.startsWith(process.env.R2_ENDPOINT)) {
      if (pathParts.length > 1) {
        const key = pathParts.slice(1).join('/')
        console.log(`🔄 Extracted R2 key from endpoint URL: ${key}`)
        return key
      }
    }

    console.warn(`⚠️ Could not extract R2 key from URL, treating as external URL: ${trimmed}`)
    return null
  } catch (err) {
    console.error(`❌ Failed to parse URL for key extraction: ${trimmed}`, err)
    return null
  }
}

async function generateInvoiceForManifestOrderOutsideTransaction(order: any): Promise<{
  key: string
  invoiceNumber: string
  invoiceDate: string
  invoiceAmount: number
} | null> {
  try {
    console.log(
      `🧾 [Manifest] Generating invoice for order ${order.order_number} (ID: ${order.id})`,
    )

    const [prefs] = await db
      .select()
      .from(invoicePreferences)
      .where(eq(invoicePreferences.userId, order.user_id))

    const [user] = await db
      .select({
        companyName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
        companyGST: sql<string>`(${userProfiles.companyInfo} ->> 'companyGst')`,
        supportEmail: sql<string>`(${userProfiles.companyInfo} ->> 'companyEmail')`,
        supportPhone: sql<string>`(${userProfiles.companyInfo} ->> 'companyContactNumber')`,
        brandName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
        companyLogo: sql<string>`(${userProfiles.companyInfo} ->> 'companyLogoUrl')`,
        companyAddress: sql<string>`(${userProfiles.companyInfo} ->> 'companyAddress')`,
        companyState: sql<string>`(${userProfiles.companyInfo} ->> 'state')`,
        panNumber: sql<string>`(${userProfiles.companyInfo} ->> 'panNumber')`,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, order.user_id))

    const pickupDetails = normalizePickupDetails(order.pickup_details)
    const pickupPincode = pickupDetails?.pincode

    const { logoBuffer, signatureBuffer } = await loadInvoiceAssets(
      {
        companyLogoKey: user?.companyLogo ?? undefined,
        includeSignature: prefs?.includeSignature,
        signatureFile: prefs?.signatureFile ?? undefined,
      },
      order.order_number || String(order.id),
    )

    const serviceType =
      order.service_type ||
      (order as any).serviceType ||
      order.integration_type ||
      order.courier_partner ||
      ''

    const invoiceNumber = await resolveInvoiceNumber({
      userId: order.user_id,
      existingInvoiceNumber: (order as any)?.invoice_number,
      prefix: prefs?.prefix ?? undefined,
      suffix: prefs?.suffix ?? undefined,
    })
    const invoiceDateDisplay = dayjs().format('DD MMM YYYY')
    const invoiceDateStored = dayjs().format('YYYY-MM-DD')

    const pickupAddress = formatPickupAddress(pickupDetails)
    const sellerAddress = pickupAddress || user?.companyAddress || ''
    const sellerStateCode = pickupDetails?.state || user?.companyState || ''
    const sellerName =
      pickupDetails?.warehouse_name || user?.companyName || user?.brandName || 'Seller'
    const brandName = user?.brandName || user?.companyName || pickupDetails?.warehouse_name || ''
    const gstNumber = user?.companyGST || ''
    const panNumber = user?.panNumber || ''
    const supportPhone = pickupDetails?.phone || user?.supportPhone || ''
    const supportEmail = user?.supportEmail || prefs?.supportEmail || ''

    const invoiceAmount =
      Number(order.order_amount ?? 0) +
      Number(order.shipping_charges ?? 0) +
      Number(order.gift_wrap ?? 0) +
      Number(order.transaction_fee ?? 0) -
      (Number(order.discount ?? 0) + Number(order.prepaid_amount ?? 0))

    let products: Product[] = []
    try {
      if (order.products) {
        const productsData =
          typeof order.products === 'string' ? JSON.parse(order.products) : order.products

        if (Array.isArray(productsData)) {
          products = productsData.map((p: any) => ({
            name: p.name ?? p.productName ?? p.box_name ?? 'N/A',
            price: Number(p.price ?? 0),
            qty: Number(p.qty ?? p.quantity ?? 1),
            sku: p.sku ?? '',
            hsn: p.hsn ?? p.hsnCode ?? '',
            discount: Number(p.discount ?? 0),
            tax_rate: Number(p.tax_rate ?? p.taxRate ?? 0),
            box_name: p.box_name ?? p.name ?? p.productName,
          }))
        } else {
          console.warn(
            `⚠️ [Manifest] Products is not an array for order ${order.order_number}, using empty array`,
          )
          products = []
        }
      } else {
        console.warn(
          `⚠️ [Manifest] Products is null/undefined for order ${order.order_number}, using empty array`,
        )
        products = []
      }
    } catch (productsErr: any) {
      console.error(
        `❌ [Manifest] Failed to parse products for order ${order.order_number}:`,
        productsErr?.message || productsErr,
      )
      products = []
    }

    if (products.length === 0) {
      console.warn(
        `⚠️ [Manifest] No products found for order ${order.order_number}, creating placeholder product`,
      )
      products = [
        {
          name: 'Product',
          price: Number(order.order_amount ?? 0),
          qty: 1,
          sku: '',
          hsn: '',
          discount: 0,
          tax_rate: 0,
        },
      ]
    }

    console.log(`📄 [Manifest] Generating invoice PDF for order ${order.order_number}...`)

    const invoiceBuffer = await generateInvoicePDF({
      invoiceNumber,
      invoiceDate: invoiceDateDisplay,
      invoiceAmount,
      buyerName: order.buyer_name,
      buyerPhone: order.buyer_phone,
      buyerEmail: order.buyer_email ?? '',
      buyerAddress: order.address,
      buyerCity: order.city,
      buyerState: order.state,
      buyerPincode: order.pincode,
      products: products,
      shippingCharges: Number(order.shipping_charges) ?? 0,
      giftWrap: Number(order.gift_wrap) ?? 0,
      transactionFee: Number(order.transaction_fee) ?? 0,
      discount: Number(order.discount) ?? 0,
      prepaidAmount: Number(order.prepaid_amount) ?? 0,
      courierName: order.courier_partner ?? '',
      courierId: order.courier_id?.toString() ?? '',
      logoBuffer,
      orderType: order?.order_type as 'prepaid' | 'cod',
      courierCod: order?.order_type === 'cod' ? Number(order?.cod_charges ?? 0) : 0,
      signatureBuffer,
      companyName: sellerName,
      supportEmail,
      supportPhone,
      companyGST: gstNumber,
      sellerName,
      brandName,
      sellerAddress,
      sellerStateCode,
      gstNumber,
      panNumber,
      invoiceNotes: prefs?.invoiceNotes ?? '',
      termsAndConditions: prefs?.termsAndConditions ?? '',
      orderId: order.order_number,
      awbNumber: order.awb_number ?? '',
      courierPartner: order.courier_partner ?? '',
      serviceType,
      pickupPincode: pickupPincode ?? '',
      deliveryPincode: order.pincode ?? '',
      orderDate: order.order_date ?? '',
      rtoCharges: Number((order as any).rto_charges ?? 0),
      layout: (prefs?.template as 'classic' | 'thermal') ?? 'classic',
    })

    if (!invoiceBuffer || invoiceBuffer.length === 0) {
      throw new Error('Invoice PDF buffer is empty')
    }

    console.log(
      `📤 [Manifest] Uploading invoice PDF for order ${order.order_number} (size: ${invoiceBuffer.length} bytes)...`,
    )

    const uploadTarget = await uploadBufferToStorage({
      buffer: invoiceBuffer,
      filename: `invoice-${order.id}.pdf`,
      contentType: 'application/pdf',
      userId: order.user_id,
      folderKey: 'invoices',
    })

    const finalKey = uploadTarget.key
    const uploadResponse = { status: 200 }
    if (!finalKey || typeof finalKey !== 'string' || finalKey.trim().length === 0) {
      throw new Error('Invoice key is invalid or empty after upload')
    }

    const trimmedKey = finalKey.trim()
    const normalizedKey = normalizeToR2KeyOutsideTransaction(trimmedKey) || trimmedKey
    const keyToStore = normalizedKey || (trimmedKey.startsWith('http') ? null : trimmedKey)

    if (!keyToStore) {
      throw new Error(`Invalid invoice key format: ${trimmedKey}`)
    }

    console.log(
      `✅ [Manifest] Invoice generated and uploaded successfully for order ${order.order_number}: ${keyToStore} (status: ${uploadResponse.status})`,
    )

    await sendTaxInvoiceGeneratedEmail({
      order,
      invoiceNumber,
      invoiceDate: invoiceDateStored,
      invoiceAmount,
      invoiceKey: keyToStore,
    }).catch((emailErr: any) => {
      console.error(`Failed to send tax invoice email for ${order.order_number}:`, emailErr)
    })

    return {
      key: keyToStore,
      invoiceNumber,
      invoiceDate: invoiceDateStored,
      invoiceAmount,
    }
  } catch (err: any) {
    console.error(
      `❌ [Manifest] Failed to generate invoice for order ${order.order_number}:`,
      err?.message || err,
    )
    return null
  }
}

// ----------------------
// Generate Manifest
// ----------------------
const resolveB2CManifestIntegrationType = (order: {
  integration_type?: unknown
  courier_partner?: unknown
}) => {
  const source = [order?.integration_type, order?.courier_partner]
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ')

  if (source.includes('amazon')) return 'amazon'
  if (source.includes('xpressbees')) return 'xpressbees'
  if (source.includes('ekart')) return 'ekart'
  if (source.includes('shadowfax')) return 'shadowfax'
  if (source.includes('delhivery')) return 'delhivery'

  return 'delhivery'
}

export const generateManifestService = async (params: {
  awbs: string[]
  type: 'b2c' | 'b2b'
  userId?: string
  pickup_date?: string
  pickup_time?: string
  pickup_location?: string
  expected_package_count?: number
  requestId?: string
  source?: string
}): Promise<{
  manifest_id: string | null
  manifest_url: string | null
  manifest_key: string | null
  warnings?: string[]
}> => {
  const table = params.type === 'b2c' ? b2c_orders : b2b_orders

  const normalizedRefs = Array.from(
    new Set((params.awbs || []).map((value) => String(value ?? '').trim()).filter(Boolean)),
  )

  if (normalizedRefs.length === 0) {
    throw new Error('No AWBs provided for manifest generation')
  }

  const orderLookupColumns =
    params.type === 'b2c'
      ? {
          id: b2c_orders.id,
          user_id: b2c_orders.user_id,
          order_number: b2c_orders.order_number,
          awb_number: b2c_orders.awb_number,
          shipment_id: b2c_orders.shipment_id,
          provider_reference: b2c_orders.provider_reference,
          provider_request_id: b2c_orders.provider_request_id,
          integration_type: b2c_orders.integration_type,
          courier_partner: b2c_orders.courier_partner,
        }
      : {
          id: b2b_orders.id,
          user_id: b2b_orders.user_id,
          order_number: b2b_orders.order_number,
          awb_number: b2b_orders.awb_number,
        }

  const ordersById = new Map<string, any>()
  for (const refChunk of chunkArray(normalizedRefs, MANIFEST_ORDER_LOOKUP_CHUNK_SIZE)) {
    const orderMatchCondition =
      params.type === 'b2c'
        ? or(
            inArray(table.awb_number, refChunk),
            inArray(table.order_number, refChunk),
            inArray((table as typeof b2c_orders).shipment_id, refChunk),
            inArray((table as typeof b2c_orders).provider_reference, refChunk),
            inArray((table as typeof b2c_orders).provider_request_id, refChunk),
          )
        : or(
            inArray(table.awb_number, refChunk),
            inArray(table.order_number, refChunk),
          )

    const scopedOrderCondition = params.userId
      ? and(orderMatchCondition, eq(table.user_id, params.userId))
      : orderMatchCondition

    const chunkOrders = await db
      .select(orderLookupColumns as any)
      .from(table)
      .where(scopedOrderCondition as any)

    chunkOrders.forEach((order: any) => {
      ordersById.set(String(order.id), order)
    })
  }

  const orders = Array.from(ordersById.values())

  if (!orders.length) {
    throw new HttpError(404, 'No orders found for the selected manifest request.')
  }

  const matchedRefs = new Set<string>()
  orders.forEach((order) => {
    const awbNumber = String(order.awb_number ?? '').trim()
    const orderNumber = String(order.order_number ?? '').trim()
    if (awbNumber) matchedRefs.add(awbNumber)
    if (orderNumber) matchedRefs.add(orderNumber)
    if (params.type === 'b2c') {
      const b2cOrder = order as any
      const shipmentId = String(b2cOrder.shipment_id ?? '').trim()
      const providerReference = String(b2cOrder.provider_reference ?? '').trim()
      const providerRequestId = String(b2cOrder.provider_request_id ?? '').trim()
      if (shipmentId) matchedRefs.add(shipmentId)
      if (providerReference) matchedRefs.add(providerReference)
      if (providerRequestId) matchedRefs.add(providerRequestId)
    }
  })

  const missingRefs = normalizedRefs.filter((ref) => !matchedRefs.has(ref))
  if (missingRefs.length > 0) {
    throw new HttpError(
      404,
      `Manifest could not be started for: ${summarizeManifestRefs(missingRefs)}.`,
    )
  }

  const orderMatchesManifestRef = (order: any, ref: string) => {
    const values = [
      order?.awb_number,
      order?.order_number,
      params.type === 'b2c' ? order?.shipment_id : null,
      params.type === 'b2c' ? order?.provider_reference : null,
      params.type === 'b2c' ? order?.provider_request_id : null,
    ]
    return values.some((value) => String(value ?? '').trim() === ref)
  }

  const manifestRefCondition = (ref: string) =>
    params.type === 'b2c'
      ? or(
          eq(table.awb_number, ref),
          eq(table.order_number, ref),
          eq((table as typeof b2c_orders).shipment_id, ref),
          eq((table as typeof b2c_orders).provider_reference, ref),
          eq((table as typeof b2c_orders).provider_request_id, ref),
        )
      : or(eq(table.awb_number, ref), eq(table.order_number, ref))

  const orderUserIds = Array.from(
    new Set(
      orders
        .map((order) => String((order as { user_id?: string }).user_id ?? '').trim())
        .filter(Boolean),
    ),
  )

  if (orderUserIds.length > 1) {
    throw new HttpError(400, 'Manifest can only be generated for one merchant at a time.')
  }

  const integrationTypes =
    params.type === 'b2c'
      ? Array.from(
          new Set(orders.map((order) => resolveB2CManifestIntegrationType(order as any))),
        )
      : ['delhivery']

  if (params.type === 'b2c' && integrationTypes.length > 1) {
    throw new HttpError(400, 'Select orders from only one courier at a time for manifesting.')
  }

  const integrationType = integrationTypes[0] || 'delhivery'

  if (params.type === 'b2c' && integrationType === 'delhivery') {
    let manifestFailureOrderIds: string[] = []
    let fetchedOrdersForLogging: any[] = []

    try {
      const fetchedOrders: any[] = []
      let expectedPackageCount = 0

      for (const order of orders) {
        const [fullOrder] = await db.select().from(table).where(eq(table.id, order.id))
        if (fullOrder) fetchedOrders.push(fullOrder)
      }

      if (!fetchedOrders.length) {
        throw new Error('Unable to load Delhivery orders for manifest generation')
      }

      fetchedOrdersForLogging = fetchedOrders
      manifestFailureOrderIds = fetchedOrders.map((order) => order.id)
      const manifestStartedAt = Date.now()
      const delhivery = new DelhiveryService()

      const normalizeDetails = (value: any) => {
        if (!value) return {}
        if (typeof value === 'string') {
          try {
            return JSON.parse(value)
          } catch {
            return {}
          }
        }
        return value
      }

      const normalizeOrderItems = (value: any) => {
        try {
          const raw = typeof value === 'string' ? JSON.parse(value) : value
          if (!Array.isArray(raw) || !raw.length) {
            return [
              {
                name: 'Product',
                sku: 'NA',
                qty: 1,
                price: 0,
                hsn: '',
                discount: 0,
                tax_rate: 0,
              },
            ]
          }

          return raw.map((item: any) => ({
            name: item?.name ?? item?.productName ?? item?.box_name ?? 'Product',
            sku: item?.sku ?? 'NA',
            qty: Number(item?.qty ?? item?.quantity ?? 1) || 1,
            price: Number(item?.price ?? 0) || 0,
            hsn: item?.hsn ?? item?.hsnCode ?? '',
            discount: Number(item?.discount ?? 0) || 0,
            tax_rate: Number(item?.tax_rate ?? item?.taxRate ?? 0) || 0,
          }))
        } catch {
          return [
            {
              name: 'Product',
              sku: 'NA',
              qty: 1,
              price: 0,
              hsn: '',
              discount: 0,
              tax_rate: 0,
            },
          ]
        }
      }

      const manifestPickupDetails = normalizeDetails(fetchedOrders[0]?.pickup_details)
      const orderPickupLocations = Array.from(
        new Set(
          fetchedOrders
            .map((order) =>
              String(normalizeDetails(order.pickup_details)?.warehouse_name || '').trim(),
            )
            .filter(Boolean),
        ),
      )
      if (orderPickupLocations.length > 1) {
        throw new HttpError(
          400,
          'Select Delhivery orders from only one pickup location at a time for manifesting.',
        )
      }

      const requestedPickupLocation = String(params.pickup_location || '').trim()
      const storedPickupLocation = String(manifestPickupDetails?.warehouse_name || '').trim()
      const manifestPickupLocationName = requestedPickupLocation || storedPickupLocation
      if (!manifestPickupLocationName) {
        throw new Error('Pickup warehouse name is required to create Delhivery pickup request')
      }
      if (storedPickupLocation && manifestPickupLocationName !== storedPickupLocation) {
        throw new HttpError(
          400,
          `Pickup location must match the order warehouse exactly: ${storedPickupLocation}.`,
        )
      }

      const manifestIsRetry = fetchedOrders.some(
        (order) => String(order.order_status || '').toLowerCase() === 'manifest_failed',
      )
      const manifestPickupSchedule = normalizePickupSchedule({
        pickupDateRaw:
          params.pickup_date ||
          manifestPickupDetails?.pickup_date ||
          fetchedOrders[0]?.order_date ||
          new Date().toISOString(),
        pickupTimeRaw:
          params.pickup_time || manifestPickupDetails?.pickup_time || getDefaultPickupTime(),
        isManifestRetry: manifestIsRetry,
      })

      console.log('ℹ️ Delhivery manifest pickup schedule resolved', {
        order_number: fetchedOrders[0]?.order_number,
        request_pickup_date: params.pickup_date || null,
        request_pickup_time: params.pickup_time || null,
        pickup_location: manifestPickupLocationName,
        stored_pickup_date: manifestPickupDetails?.pickup_date || null,
        stored_pickup_time: manifestPickupDetails?.pickup_time || null,
        final_pickup_date: manifestPickupSchedule.pickupDate,
        final_pickup_time: manifestPickupSchedule.pickupTime,
      })

      for (const order of fetchedOrders) {
        await db.transaction(async (tx) => {
          await debitManifestSuccessChargeIfNeeded({ tx, order })
        })
      }

      for (const order of fetchedOrders) {
        if (order.awb_number) continue

        const shipmentStartedAt = Date.now()
        const pickupDetails = normalizeDetails(order.pickup_details)
        const manifestParams: ShipmentParams = {
          order_number: order.order_number,
          order_date: new Date(order.order_date || order.created_at || new Date()),
          payment_type: order.order_type === 'cod' ? 'cod' : 'prepaid',
          order_amount: Number(order.order_amount ?? 0),
          package_weight: Number(order.weight ?? 0),
          package_length: Number(order.length ?? 0),
          package_breadth: Number(order.breadth ?? 0),
          package_height: Number(order.height ?? 0),
          courier_id: order.courier_id ?? undefined,
          integration_type: 'delhivery',
          shipping_mode: order.shipping_mode ?? undefined,
          invoice_number: order.invoice_number ?? undefined,
          invoice_date: order.invoice_date ?? undefined,
          is_rto_different: order.is_rto_different ? 'yes' : 'no',
          company: {},
          pickup: {
            warehouse_name: pickupDetails?.warehouse_name || '',
            name: pickupDetails?.name || pickupDetails?.warehouse_name || 'Pickup',
            address: pickupDetails?.address || '',
            city: pickupDetails?.city || '',
            state: pickupDetails?.state || '',
            pincode: pickupDetails?.pincode || '',
            phone: pickupDetails?.phone || '',
            gst_number: pickupDetails?.gst_number || '',
            pickup_date: manifestPickupSchedule.pickupDate,
            pickup_time: manifestPickupSchedule.pickupTime,
          },
          consignee: {
            name: order.buyer_name,
            address: order.address,
            city: order.city,
            state: order.state,
            pincode: order.pincode,
            phone: order.buyer_phone,
            email: order.buyer_email ?? '',
          },
          order_items: normalizeOrderItems(order.products),
          pickup_date: manifestPickupSchedule.pickupDate,
          pickup_time: manifestPickupSchedule.pickupTime,
        }

        let shipmentData: any
        try {
          shipmentData = await delhivery.createShipment(manifestParams)
          console.log('✅ Delhivery shipment created during manifest', {
            order_number: order.order_number,
            awb: shipmentData?.packages?.[0]?.waybill ?? shipmentData?.awb_number ?? null,
            duration_ms: Date.now() - shipmentStartedAt,
          })
        } catch (error: any) {
          const manifestErrorMessage = getUserFacingManifestError(error)
          await refundManifestFailureChargeOnce({
            orderId: order.id,
            manifestErrorMessage,
          })

          throw new HttpError(getErrorStatusCode(error, 502), manifestErrorMessage)
        }

        const shipmentPackage = shipmentData?.packages?.[0] || null
        expectedPackageCount += Math.max(
          1,
          Array.isArray(shipmentData?.packages) ? shipmentData.packages.length : 0,
        )

        await db
          .update(table)
          .set({
            awb_number: shipmentPackage?.waybill ?? shipmentData?.awb_number ?? null,
            shipment_id: shipmentData?.upload_wbn ?? shipmentData?.shipment_id ?? null,
            courier_partner: 'Delhivery',
            shipping_mode:
              shipmentData?.shipping_mode ??
              shipmentPackage?.shipping_mode ??
              shipmentPackage?.service_mode ??
              shipmentPackage?.service_type ??
              order.shipping_mode ??
              null,
            sort_code:
              shipmentPackage?.sort_code ??
              shipmentPackage?.sortCode ??
              shipmentPackage?.routing_code ??
              shipmentPackage?.routingCode ??
              null,
            manifest: shipmentData?.upload_wbn ?? shipmentData?.manifest ?? null,
            manifest_error: null,
            order_status:
              order.order_status === 'pending' || order.order_status === 'manifest_failed'
                ? 'shipment_created'
                : order.order_status,
            updated_at: new Date(),
          } as any)
          .where(eq(table.id, order.id))

        order.awb_number = shipmentPackage?.waybill ?? shipmentData?.awb_number ?? null
        order.shipment_id = shipmentData?.upload_wbn ?? shipmentData?.shipment_id ?? null
        order.shipping_mode =
          shipmentData?.shipping_mode ??
          shipmentPackage?.shipping_mode ??
          shipmentPackage?.service_mode ??
          shipmentPackage?.service_type ??
          order.shipping_mode ??
          null
        order.sort_code =
          shipmentPackage?.sort_code ??
          shipmentPackage?.sortCode ??
          shipmentPackage?.routing_code ??
          shipmentPackage?.routingCode ??
          null
        order.manifest = shipmentData?.upload_wbn ?? shipmentData?.manifest ?? null
      }

      if (expectedPackageCount === 0) {
        expectedPackageCount = fetchedOrders.reduce(
          (count, order) => count + (order.awb_number ? 1 : 0),
          0,
        )
      }
      if (expectedPackageCount === 0) {
        expectedPackageCount = fetchedOrders.length
      }

      const pickupDetails = manifestPickupDetails
      const pickupLocationName = manifestPickupLocationName

      const isManifestRetry = fetchedOrders.some(
        (order) => String(order.order_status || '').toLowerCase() === 'manifest_failed',
      )
      const pickupDateRaw =
        params.pickup_date ||
        pickupDetails?.pickup_date ||
        fetchedOrders[0]?.order_date ||
        new Date().toISOString()
      const pickupTimeRaw =
        params.pickup_time || pickupDetails?.pickup_time || getDefaultPickupTime()
      const { pickupDate, pickupTime } = normalizePickupSchedule({
        pickupDateRaw,
        pickupTimeRaw,
        isManifestRetry,
      })
      const requestedPackageCount = Number(params.expected_package_count ?? 0)
      if (Number.isFinite(requestedPackageCount) && requestedPackageCount > 0) {
        expectedPackageCount = Math.max(1, Math.round(requestedPackageCount))
      }

      if (isManifestRetry) {
        console.log('ℹ️ Delhivery manifest retry pickup schedule adjusted', {
          order_number: fetchedOrders[0]?.order_number,
          requested_pickup_date: String(pickupDateRaw).slice(0, 10) || null,
          final_pickup_date: pickupDate,
        })
      }

      let pickupRequestWarning: string | null = null
      const pickupRequestStartedAt = Date.now()
      try {
        await delhivery.createPickupRequest({
          pickup_date: pickupDate,
          pickup_time: pickupTime,
          pickup_location: pickupLocationName,
          expected_package_count: expectedPackageCount,
        })
        console.log('✅ Delhivery pickup request created during manifest', {
          pickup_location: pickupLocationName,
          expected_package_count: expectedPackageCount,
          duration_ms: Date.now() - pickupRequestStartedAt,
        })
      } catch (error: any) {
        const pickupErrorMessage = getUserFacingManifestError(error)
        pickupRequestWarning = pickupErrorMessage
        console.warn('⚠️ Delhivery shipment created but pickup request failed', {
          orders: fetchedOrders.map((order) => ({
            order_number: order.order_number,
            awb_number: order.awb_number,
          })),
          pickup_location: pickupLocationName,
          expected_package_count: expectedPackageCount,
          error: pickupErrorMessage,
          duration_ms: Date.now() - pickupRequestStartedAt,
        })
        throw error
      }

      const createManifestCard = (order: any) => ({
        width: '48%',
        margin: [0, 0, 0, 12],
        stack: [
          {
            canvas: [
              {
                type: 'rect',
                x: 0,
                y: 0,
                w: 245,
                h: 118,
                r: 8,
                lineColor: '#d8deee',
                fillColor: '#fbfcff',
                lineWidth: 1,
              },
            ],
          },
          {
            margin: [12, -108, 12, 0],
            stack: [
              {
                columns: [
                  {
                    text: order.order_number ?? '-',
                    bold: true,
                    fontSize: 11,
                    color: '#1f2a44',
                  },
                  {
                    text: (order.order_type ?? '').toUpperCase() || '-',
                    fontSize: 8,
                    bold: true,
                    color: '#4c67a1',
                    alignment: 'right',
                  },
                ],
              },
              {
                text: `AWB: ${order.awb_number ?? '-'}`,
                fontSize: 9,
                color: '#42506b',
                margin: [0, 6, 0, 0],
              },
              {
                text: `Consignee: ${order.buyer_name ?? '-'}`,
                fontSize: 9,
                color: '#42506b',
                margin: [0, 4, 0, 0],
              },
              {
                columns: [
                  {
                    text: `Pincode: ${order.pincode ?? '-'}`,
                    fontSize: 9,
                    color: '#42506b',
                  },
                  {
                    text: `Weight: ${Number(order.weight ?? 0).toFixed(0)} g`,
                    fontSize: 9,
                    color: '#42506b',
                    alignment: 'right',
                  },
                ],
                margin: [0, 4, 0, 0],
              },
              {
                text: `City: ${order.city ?? '-'}${order.state ? `, ${order.state}` : ''}`,
                fontSize: 9,
                color: '#42506b',
                margin: [0, 4, 0, 0],
              },
              {
                text: `Address: ${order.address ?? '-'}`,
                fontSize: 8,
                color: '#667085',
                margin: [0, 8, 0, 0],
              },
            ],
          },
        ],
      })

      const manifestCards = fetchedOrders.reduce((rows: any[], order, index) => {
        if (index % 2 === 0) {
          rows.push({
            columns: [
              createManifestCard(order),
              fetchedOrders[index + 1]
                ? createManifestCard(fetchedOrders[index + 1])
                : { width: '48%', text: '' },
            ],
            columnGap: 12,
          })
        }
        return rows
      }, [])

      const printer = new PdfPrinter(pdfFonts)
      const docDefinition: any = {
        defaultStyle: { font: 'Helvetica' },
        pageSize: 'A4',
        pageMargins: [30, 40, 30, 40],
        content: [
          {
            text: 'Manifest',
            fontSize: 16,
            bold: true,
            alignment: 'center',
            margin: [0, 0, 0, 10],
          },
          {
            columns: [
              {
                stack: [
                  { text: `Generated On: ${new Date().toLocaleString()}`, fontSize: 9 },
                  {
                    text: `Total Shipments: ${fetchedOrders.length}`,
                    fontSize: 9,
                    margin: [0, 4, 0, 0],
                  },
                ],
              },
              {
                stack: [
                  {
                    text: `User ID: ${fetchedOrders[0].user_id}`,
                    fontSize: 9,
                    alignment: 'right',
                  },
                  {
                    text: `Pickup Location: ${pickupDetails?.warehouse_name ?? '-'}`,
                    fontSize: 9,
                    alignment: 'right',
                    margin: [0, 4, 0, 0],
                  },
                ],
              },
            ],
            margin: [0, 0, 0, 12],
          },
          {
            text: 'Shipments',
            fontSize: 11,
            bold: true,
            color: '#24324d',
            margin: [0, 0, 0, 10],
          },
          ...manifestCards,
        ],
      }

      const pdfDoc = printer.createPdfKitDocument(docDefinition)
      const chunks: Buffer[] = []
      const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
        pdfDoc.on('data', (chunk) => chunks.push(chunk))
        pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
        pdfDoc.on('error', (err) => reject(err))
        pdfDoc.end()
      })

      const uploadTarget = await uploadBufferToStorage({
        buffer: pdfBuffer,
        filename: `manifest-delhivery-${Date.now()}.pdf`,
        contentType: 'application/pdf',
        userId: fetchedOrders[0].user_id,
        folderKey: 'manifests',
      })
      const manifestKey = uploadTarget.key

      const invoicePromisesDel = fetchedOrders.map((order) =>
        generateInvoiceForManifestOrderOutsideTransaction(order).catch((err) => {
          console.error(
            `❌ [Manifest] Invoice generation failed for order ${order.order_number}:`,
            err?.message || err,
          )
          return null
        }),
      )

      const labelAndUpdateStartedAt = Date.now()
      const orderUpdatePromisesDel = fetchedOrders.map(async (order) => {
        const [freshOrder] = await db.select().from(table).where(eq(table.id, order.id))
        if (!freshOrder) {
          console.warn(
            `⚠️ Order ${order.order_number} not found in database, skipping label generation`,
          )
          return
        }

        const currentLabel = freshOrder.label || null
        const currentAwb = freshOrder.awb_number || null

        console.log(`🔍 Checking label generation for order ${order.order_number}:`, {
          order_id: order.id,
          has_label: !!currentLabel,
          label_value: currentLabel,
          has_awb: !!currentAwb,
          awb_value: currentAwb,
        })

        let labelKey: string | null = currentLabel
        if (!labelKey && currentAwb) {
          try {
            console.log(
              `🖨️ [Delhivery] Generating custom label during manifest for order ${order.order_number} (AWB: ${currentAwb})`,
            )

            let enrichedOrder: any = freshOrder
            try {
              const labelResp: any = await delhivery.generateLabel(currentAwb)

              const pkg = Array.isArray(labelResp?.packages)
                ? labelResp.packages[0]
                : labelResp?.packages || labelResp

              if (pkg) {
                const sortCode =
                  (pkg.sort_code || pkg.sortCode || pkg.routing_code || pkg.routingCode) ?? null

                enrichedOrder = {
                  ...freshOrder,
                  barcode_img: pkg.barcode || null,
                  oid_barcode: pkg.oid_barcode || null,
                  sort_code: sortCode || (freshOrder as any).sort_code || null,
                  delhivery_label_meta: pkg,
                }
              }
            } catch (metaErr: any) {
              console.warn(
                `⚠️ [Delhivery] Failed to fetch packing_slip JSON for order ${order.order_number}:`,
                metaErr?.message || metaErr,
              )
            }

            labelKey = await generateLabelForOrder(enrichedOrder, enrichedOrder.user_id, db)

            if (!labelKey) {
              console.warn(
                `⚠️ [Delhivery] Custom label generation returned null for order ${order.order_number} during manifest`,
              )
            } else {
              console.log(
                `✅ [Delhivery] Custom label generated for order ${order.order_number} during manifest: ${labelKey}`,
              )
            }

            void new DelhiveryService()
              .generateLabel(currentAwb, {
                format: 'pdf',
              })
              .then((providerLabelResult) => {
                console.log(
                  `✅ [Delhivery] Provider label PDF generated for AWB ${currentAwb}: ${providerLabelResult?.label_url || 'link received'}`,
                )
              })
              .catch((providerLabelErr: any) => {
                console.warn(
                  `⚠️ [Delhivery] Failed to fetch provider label PDF for AWB ${currentAwb}:`,
                  providerLabelErr?.message || providerLabelErr,
                )
              })
          } catch (labelErr: any) {
            console.error(
              `❌ [Delhivery] Failed to generate custom label for order ${order.order_number} during manifest:`,
              labelErr?.message || labelErr,
              labelErr?.stack,
            )
          }
        } else if (!labelKey) {
          console.warn(
            `⚠️ Cannot generate label for order ${order.order_number}: AWB number is missing (AWB: ${currentAwb})`,
          )
        } else {
          console.log(`ℹ️ Label already exists for order ${order.order_number}: ${currentLabel}`)
        }

        const currentOrderStatus = String(freshOrder.order_status || '').trim().toLowerCase()
        const stableManifestStatus = pickupRequestWarning
          ? ['pending', 'booked', 'manifest_failed', 'shipment_created'].includes(
              currentOrderStatus,
            )
            ? 'shipment_created'
            : String(freshOrder.order_status || '').trim() || 'shipment_created'
          : ['pending', 'booked', 'manifest_failed', 'shipment_created'].includes(
              currentOrderStatus,
            )
            ? 'pickup_initiated'
            : String(freshOrder.order_status || '').trim() ||
              (currentAwb ? 'pickup_initiated' : 'shipment_created')
        const existingPickupDetails = normalizeDetails(freshOrder.pickup_details)
        const updateDataDel: any = {
          manifest: manifestKey,
          manifest_error: null,
          pickup_error: pickupRequestWarning ? truncateColumnValue(pickupRequestWarning) : null,
          pickup_status: pickupRequestWarning ? 'failed' : 'pickup_requested',
          order_status: stableManifestStatus,
          provider_last_status: stableManifestStatus,
          pickup_details: {
            ...existingPickupDetails,
            warehouse_name: pickupLocationName,
            pickup_date: pickupDate,
            pickup_time: pickupTime,
          },
          updated_at: new Date(),
        }

        if (labelKey && typeof labelKey === 'string' && labelKey.trim().length > 0) {
          const normalizedLabel = normalizeToR2KeyOutsideTransaction(labelKey.trim())
          if (normalizedLabel) {
            updateDataDel.label = normalizedLabel
            console.log(`✅ [Delhivery] Normalized label key stored: ${normalizedLabel}`)
          } else {
            console.warn(`⚠️ [Delhivery] Could not normalize label, skipping: ${labelKey.trim()}`)
          }
        } else if (
          currentLabel &&
          typeof currentLabel === 'string' &&
          currentLabel.trim().length > 0
        ) {
          const normalizedLabel = normalizeToR2KeyOutsideTransaction(currentLabel.trim())
          if (normalizedLabel) {
            updateDataDel.label = normalizedLabel
          }
        }

        await db.update(table).set(updateDataDel).where(eq(table.id, order.id))
      })

      await Promise.all(orderUpdatePromisesDel)
      console.log('✅ Delhivery manifest order updates completed', {
        orders: fetchedOrders.length,
        duration_ms: Date.now() - labelAndUpdateStartedAt,
        total_duration_ms: Date.now() - manifestStartedAt,
      })

      const results = await Promise.allSettled(invoicePromisesDel)
      results.forEach((result, index) => {
        const order = fetchedOrders[index]
        if (result.status === 'fulfilled' && result.value) {
          const invoiceResult = result.value as {
            key: string
            invoiceNumber?: string
            invoiceDate?: string
            invoiceAmount?: number
          }
          const invoiceKey = invoiceResult.key
          if (invoiceKey && typeof invoiceKey === 'string' && invoiceKey.trim().length > 0) {
            const normalizedInvoiceKey = normalizeToR2KeyOutsideTransaction(invoiceKey.trim())
            if (normalizedInvoiceKey) {
              db.update(table)
                .set({
                  invoice_link: normalizedInvoiceKey,
                  invoice_number: invoiceResult.invoiceNumber ?? undefined,
                  invoice_date: invoiceResult.invoiceDate ?? undefined,
                  invoice_amount:
                    invoiceResult.invoiceAmount !== undefined
                      ? invoiceResult.invoiceAmount
                      : undefined,
                  updated_at: new Date(),
                } as any)
                .where(eq(table.id, order.id))
                .then(() => {
                  console.log(
                    `✅ [Manifest] Invoice link updated for order ${order.order_number}: ${normalizedInvoiceKey}`,
                  )
                })
                .catch((err) => {
                  console.error(
                    `❌ [Manifest] Failed to update invoice_link for order ${order.order_number}:`,
                    err?.message || err,
                  )
                })
            } else {
              console.warn(
                `⚠️ [Manifest] Could not normalize invoice key for order ${
                  order.order_number
                }: ${invoiceKey.trim()}`,
              )
            }
          } else {
            console.warn(
              `⚠️ [Manifest] Invoice generation failed for order ${order.order_number}: Invalid key`,
            )
          }
        } else {
          console.warn(`⚠️ [Manifest] Invoice generation failed for order ${order.order_number}`)
        }
      })

      const manifestDownloadUrl = await resolveManifestUrlOutsideTransaction(manifestKey)
      console.log('✅ Delhivery manifest generation completed', {
        orders: fetchedOrders.length,
        manifest_key: manifestKey,
        total_duration_ms: Date.now() - manifestStartedAt,
      })

      return {
        manifest_id: manifestKey,
        manifest_url: manifestDownloadUrl,
        manifest_key: manifestKey,
        warnings: pickupRequestWarning ? [pickupRequestWarning] : undefined,
      }
    } catch (error: any) {
      const isPickupRequestFailure = error?.isPickupRequestError === true
      const pickupErrorMessage = isPickupRequestFailure
        ? getUserFacingManifestError(error)
        : null

      console.error('DB UPDATE FAIL', {
        message: error.message,
        stack: error.stack,
        code: error.code,
        status: error.status,
      })
      if (isPickupRequestFailure && pickupErrorMessage) {
        if (params.type === 'b2c') {
          await persistPickupFailureForOrders({
            orderIds: manifestFailureOrderIds,
            pickupError: pickupErrorMessage,
          })
        }
        await notifyAdminsForProviderBalanceIssue({
          orders: fetchedOrdersForLogging,
          errorMessage: pickupErrorMessage,
          courierPartner: 'Delhivery',
          contextLabel: 'Pickup request',
        })
      }
      logManifestGenerationError(error, {
        requestId: params.requestId,
        source: params.source,
        type: params.type,
        userId: params.userId,
        integrationType,
        manifestRefs: normalizedRefs,
        manifestFailureOrderIds,
        fetchedOrders: fetchedOrdersForLogging,
      })
      if (isPickupRequestFailure) {
        throw new HttpError(getErrorStatusCode(error, 502), pickupErrorMessage || 'Pickup request failed')
      }
      if (manifestFailureOrderIds.length > 0) {
        const manifestErrorMessage = getUserFacingManifestError(error)
        await Promise.allSettled(
          manifestFailureOrderIds.map((orderId) =>
            refundManifestFailureChargeOnce({
              orderId,
              manifestErrorMessage,
            }),
          ),
        )
      }
      if (error instanceof HttpError) {
        throw error
      }
      throw new HttpError(getErrorStatusCode(error, 500), getUserFacingManifestError(error))
    }
  }

  return await db.transaction(
    async (
      tx,
    ): Promise<{
      manifest_id: string | null
      manifest_url: string | null
      manifest_key: string | null
      warnings?: string[]
    }> => {
      let manifestFailureOrderIds: string[] = []
      let fetchedOrdersForLogging: any[] = []
      let integrationType: string | undefined

      try {
        const normalizedRefs = Array.from(
          new Set((params.awbs || []).map((value) => String(value ?? '').trim()).filter(Boolean)),
        )

        if (normalizedRefs.length === 0) {
          throw new Error('No AWBs provided for manifest generation')
        }

        const orderLookupColumns =
          params.type === 'b2c'
            ? {
                id: b2c_orders.id,
                user_id: b2c_orders.user_id,
                order_number: b2c_orders.order_number,
                awb_number: b2c_orders.awb_number,
                shipment_id: b2c_orders.shipment_id,
                provider_reference: b2c_orders.provider_reference,
                provider_request_id: b2c_orders.provider_request_id,
                integration_type: b2c_orders.integration_type,
                courier_partner: b2c_orders.courier_partner,
              }
            : {
                id: b2b_orders.id,
                user_id: b2b_orders.user_id,
                order_number: b2b_orders.order_number,
                awb_number: b2b_orders.awb_number,
              }

        const ordersById = new Map<string, any>()
        for (const refChunk of chunkArray(normalizedRefs, MANIFEST_ORDER_LOOKUP_CHUNK_SIZE)) {
          const orderMatchCondition =
            params.type === 'b2c'
              ? or(
                  inArray(table.awb_number, refChunk),
                  inArray(table.order_number, refChunk),
                  inArray((table as typeof b2c_orders).shipment_id, refChunk),
                  inArray((table as typeof b2c_orders).provider_reference, refChunk),
                  inArray((table as typeof b2c_orders).provider_request_id, refChunk),
                )
              : or(
                  inArray(table.awb_number, refChunk),
                  inArray(table.order_number, refChunk),
                )

          const scopedOrderCondition = params.userId
            ? and(orderMatchCondition, eq(table.user_id, params.userId))
            : orderMatchCondition

          const chunkOrders = await tx
            .select(orderLookupColumns as any)
            .from(table)
            .where(scopedOrderCondition as any)

          chunkOrders.forEach((order: any) => {
            ordersById.set(String(order.id), order)
          })
        }

        const orders = Array.from(ordersById.values())

        if (!orders.length) {
          throw new HttpError(404, 'No orders found for the selected manifest request.')
        }

        fetchedOrdersForLogging = orders
        manifestFailureOrderIds = orders.map((order) => order.id)

        const matchedRefs = new Set<string>()
        orders.forEach((order) => {
          const awbNumber = String(order.awb_number ?? '').trim()
          const orderNumber = String(order.order_number ?? '').trim()
          if (awbNumber) matchedRefs.add(awbNumber)
          if (orderNumber) matchedRefs.add(orderNumber)
          if (params.type === 'b2c') {
            const b2cOrder = order as any
            const shipmentId = String(b2cOrder.shipment_id ?? '').trim()
            const providerReference = String(b2cOrder.provider_reference ?? '').trim()
            const providerRequestId = String(b2cOrder.provider_request_id ?? '').trim()
            if (shipmentId) matchedRefs.add(shipmentId)
            if (providerReference) matchedRefs.add(providerReference)
            if (providerRequestId) matchedRefs.add(providerRequestId)
          }
        })

        const missingRefs = normalizedRefs.filter((ref) => !matchedRefs.has(ref))
        if (missingRefs.length > 0) {
          throw new HttpError(
            404,
            `Manifest could not be started for: ${summarizeManifestRefs(missingRefs)}.`,
          )
        }

        const orderUserIds = Array.from(
          new Set(
            orders
              .map((order) => String((order as { user_id?: string }).user_id ?? '').trim())
              .filter(Boolean),
          ),
        )

        if (orderUserIds.length > 1) {
          throw new HttpError(400, 'Manifest can only be generated for one merchant at a time.')
        }

        const integrationTypes =
          params.type === 'b2c'
            ? Array.from(
                new Set(orders.map((order) => resolveB2CManifestIntegrationType(order as any))),
              )
            : ['delhivery']

        if (params.type === 'b2c' && integrationTypes.length > 1) {
          throw new HttpError(400, 'Select orders from only one courier at a time for manifesting.')
        }

        integrationType = integrationTypes[0] || 'delhivery'

        if (
          integrationType === 'xpressbees' ||
          integrationType === 'ekart' ||
          integrationType === 'shadowfax'
        ) {
          if (params.type !== 'b2c') {
            throw new Error('This manifest flow is only supported for B2C orders')
          }

          const fetchedOrders: any[] = []
          for (const order of orders) {
            const [fullOrder] = await tx
              .select()
              .from(b2c_orders)
              .where(eq(b2c_orders.id, order.id))
            if (fullOrder) fetchedOrders.push(fullOrder)
          }

          if (!fetchedOrders.length) {
            throw new Error(`Unable to load ${integrationType} orders for manifest generation`)
          }

          const providerName =
            integrationType === 'ekart'
              ? 'Ekart'
              : integrationType === 'shadowfax'
                ? 'Shadowfax'
                : 'Xpressbees'
          const providerManifestIds =
            integrationType === 'ekart'
              ? fetchedOrders
                  .map((order) =>
                    String(
                      order.shipment_id || order.awb_number || order.order_number || '',
                    ).trim(),
                  )
                  .filter(Boolean)
              : fetchedOrders
                  .map((order) => String(order.awb_number || order.order_number || '').trim())
                  .filter(Boolean)

          if (!providerManifestIds.length) {
            throw new Error(`No ${providerName} identifiers found for manifest generation`)
          }

          const providerManifestResponsesByOrderId = new Map<string, any>()
          const skippedXpressbeesProviderManifestOrderIds = new Set<string>()

          if (integrationType === 'ekart') {
            const ekart = new EkartService()
            for (const providerManifestIdChunk of chunkArray(
              providerManifestIds,
              PROVIDER_MANIFEST_REQUEST_CHUNK_SIZE,
            )) {
              await ekart.generateManifest(providerManifestIdChunk)
            }
          } else if (integrationType === 'xpressbees') {
            const forceProviderManifestRetry = isTruthyEnvValue(
              process.env.XPRESSBEES_FORCE_PROVIDER_MANIFEST_ON_LOCAL_MANIFEST,
            )
            const ordersNeedingProviderManifest = forceProviderManifestRetry
              ? fetchedOrders
              : fetchedOrders.filter((order) => !hasXpressbeesPreShipManifestation(order))

            for (const order of fetchedOrders) {
              if (!ordersNeedingProviderManifest.some((candidate) => candidate.id === order.id)) {
                skippedXpressbeesProviderManifestOrderIds.add(String(order.id))
              }
            }

            if (ordersNeedingProviderManifest.length) {
              const xpressbees = new XpressbeesService()
              const providerManifestOrders: any[] = []
              for (const order of ordersNeedingProviderManifest) {
                const prepared = ensureXpressbeesManifestPickupVendorCode(order)
                providerManifestOrders.push(prepared.order)

                if (prepared.generated) {
                  await tx
                    .update(b2c_orders)
                    .set({
                      pickup_details: prepared.pickupDetails as any,
                      updated_at: new Date(),
                    })
                    .where(eq(b2c_orders.id, order.id))
                }
              }

              for (const providerManifestOrderChunk of chunkArray(
                providerManifestOrders,
                PROVIDER_MANIFEST_REQUEST_CHUNK_SIZE,
              )) {
                const providerManifestResponse =
                  await xpressbees.generateManifest(providerManifestOrderChunk)
                assertXpressbeesManifestAccepted(
                  providerManifestResponse,
                  'provider manifest request',
                )

                const normalizedResponses =
                  normalizeXpressbeesManifestResponses(providerManifestResponse)
                providerManifestOrderChunk.forEach((order, index) => {
                  providerManifestResponsesByOrderId.set(
                    String(order.id),
                    normalizedResponses[index] || providerManifestResponse,
                  )
                })
              }
            } else {
              console.log(
                '[Xpressbees] Skipping duplicate provider manifest call; provider manifestation is already accepted.',
                {
                  orders: fetchedOrders.map((order) => order.order_number || order.id),
                },
              )
            }
          }

          const normalizeDetails = (value: any) => {
            if (!value) return {}
            if (typeof value === 'string') {
              try {
                return JSON.parse(value)
              } catch {
                return {}
              }
            }
            return value
          }

          const pickupDetails = normalizeDetails(fetchedOrders[0]?.pickup_details)

          const createManifestCard = (order: any) => ({
            width: '48%',
            margin: [0, 0, 0, 12],
            stack: [
              {
                canvas: [
                  {
                    type: 'rect',
                    x: 0,
                    y: 0,
                    w: 245,
                    h: 118,
                    r: 8,
                    lineColor: '#d8deee',
                    fillColor: '#fbfcff',
                    lineWidth: 1,
                  },
                ],
              },
              {
                margin: [12, -108, 12, 0],
                stack: [
                  {
                    columns: [
                      {
                        text: order.order_number ?? '-',
                        bold: true,
                        fontSize: 11,
                        color: '#1f2a44',
                      },
                      {
                        text: (order.order_type ?? '').toUpperCase() || '-',
                        fontSize: 8,
                        bold: true,
                        color: '#4c67a1',
                        alignment: 'right',
                      },
                    ],
                  },
                  {
                    text: `AWB: ${order.awb_number ?? '-'}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 6, 0, 0],
                  },
                  {
                    text: `Consignee: ${order.buyer_name ?? '-'}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 4, 0, 0],
                  },
                  {
                    columns: [
                      {
                        text: `Pincode: ${order.pincode ?? '-'}`,
                        fontSize: 9,
                        color: '#42506b',
                      },
                      {
                        text: `Weight: ${Number(order.weight ?? 0).toFixed(0)} g`,
                        fontSize: 9,
                        color: '#42506b',
                        alignment: 'right',
                      },
                    ],
                    margin: [0, 4, 0, 0],
                  },
                  {
                    text: `City: ${order.city ?? '-'}${order.state ? `, ${order.state}` : ''}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 4, 0, 0],
                  },
                  {
                    text: `Address: ${order.address ?? '-'}`,
                    fontSize: 8,
                    color: '#667085',
                    margin: [0, 8, 0, 0],
                  },
                ],
              },
            ],
          })

          const manifestCards = fetchedOrders.reduce((rows: any[], order, index) => {
            if (index % 2 === 0) {
              rows.push({
                columns: [
                  createManifestCard(order),
                  fetchedOrders[index + 1]
                    ? createManifestCard(fetchedOrders[index + 1])
                    : { width: '48%', text: '' },
                ],
                columnGap: 12,
              })
            }
            return rows
          }, [])

          const printer = new PdfPrinter(pdfFonts)
          const docDefinition: any = {
            defaultStyle: { font: 'Helvetica' },
            pageSize: 'A4',
            pageMargins: [30, 40, 30, 40],
            content: [
              {
                text: 'Manifest',
                fontSize: 16,
                bold: true,
                alignment: 'center',
                margin: [0, 0, 0, 10],
              },
              {
                columns: [
                  {
                    stack: [
                      { text: `Generated On: ${new Date().toLocaleString()}`, fontSize: 9 },
                      {
                        text: `Total Shipments: ${fetchedOrders.length}`,
                        fontSize: 9,
                        margin: [0, 4, 0, 0],
                      },
                    ],
                  },
                  {
                    stack: [
                      {
                        text: `User ID: ${fetchedOrders[0].user_id}`,
                        fontSize: 9,
                        alignment: 'right',
                      },
                      {
                        text: `Pickup Location: ${pickupDetails?.warehouse_name ?? '-'}`,
                        fontSize: 9,
                        alignment: 'right',
                        margin: [0, 4, 0, 0],
                      },
                    ],
                  },
                ],
                margin: [0, 0, 0, 12],
              },
              {
                text: 'Shipments',
                fontSize: 11,
                bold: true,
                color: '#24324d',
                margin: [0, 0, 0, 10],
              },
              ...manifestCards,
            ],
          }

          const pdfDoc = printer.createPdfKitDocument(docDefinition)
          const chunks: Buffer[] = []
          const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
            pdfDoc.on('data', (chunk) => chunks.push(chunk))
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
            pdfDoc.on('error', (err) => reject(err))
            pdfDoc.end()
          })

          const uploadTarget = await uploadBufferToStorage({
            buffer: pdfBuffer,
            filename: `manifest-${integrationType}-${Date.now()}.pdf`,
            contentType: 'application/pdf',
            userId: fetchedOrders[0].user_id,
            folderKey: 'manifests',
          })
          const manifestKey = uploadTarget.key
          const signedManifestUrl = await presignDownload(manifestKey)
          const manifestDownloadUrl = Array.isArray(signedManifestUrl)
            ? (signedManifestUrl[0] ?? null)
            : signedManifestUrl
          const manifestWarnings: string[] = []

          const orderUpdatePromises = fetchedOrders.map(async (order) => {
            const [freshOrder] = await tx
              .select()
              .from(b2c_orders)
              .where(eq(b2c_orders.id, order.id))

            if (!freshOrder) {
              console.warn(
                `⚠️ ${providerName} order ${order.order_number} not found in database, skipping label generation`,
              )
              manifestWarnings.push(
                `${order.order_number}: label could not be generated because the order was not found after manifesting.`,
              )
              return
            }

            let labelKey: string | null =
              typeof freshOrder.label === 'string' && freshOrder.label.trim()
                ? freshOrder.label.trim()
                : null

            if (!labelKey && freshOrder.awb_number) {
              try {
                labelKey = await generateLabelForOrder(freshOrder, freshOrder.user_id, tx)
                if (labelKey) {
                  console.log(
                    `✅ [${providerName}] Custom label generated for order ${freshOrder.order_number}: ${labelKey}`,
                  )
                }
              } catch (labelErr: any) {
                console.error(
                  `❌ [${providerName}] Failed to generate custom label for order ${freshOrder.order_number}:`,
                  labelErr?.message || labelErr,
                )
                manifestWarnings.push(`${freshOrder.order_number}: label could not be generated.`)
              }
            }

            const currentOrderStatus = String(freshOrder.order_status || '').trim().toLowerCase()
            const nextOrderStatus = ['cancelled', 'canceled', 'delivered', 'rto_delivered'].includes(
              currentOrderStatus,
            )
              ? freshOrder.order_status
              : 'pickup_initiated'
            const updateDataXpress: any = {
              manifest: manifestKey,
              order_status: nextOrderStatus,
              pickup_status:
                integrationType === 'xpressbees' && nextOrderStatus === 'pickup_initiated'
                  ? 'pickup_initiated'
                  : nextOrderStatus === 'pickup_initiated'
                  ? 'pickup_requested'
                  : freshOrder.pickup_status ?? null,
              provider_last_status: nextOrderStatus,
              updated_at: new Date(),
            }

            if (integrationType === 'xpressbees') {
              updateDataXpress.provider_meta = mergeXpressbeesManifestMeta({
                existingMeta: freshOrder.provider_meta,
                localManifestKey: manifestKey,
                providerResponse: providerManifestResponsesByOrderId.get(String(freshOrder.id)),
                skippedProviderCall: skippedXpressbeesProviderManifestOrderIds.has(
                  String(freshOrder.id),
                ),
              })
            }

            if (labelKey && typeof labelKey === 'string' && labelKey.trim().length > 0) {
              const normalizedLabel = normalizeToR2Key(labelKey.trim())
              if (normalizedLabel) {
                updateDataXpress.label = normalizedLabel
              }
            }

            await tx
              .update(b2c_orders)
              .set(updateDataXpress)
              .where(eq(b2c_orders.id, freshOrder.id))
          })

          await Promise.all(orderUpdatePromises)

          const invoiceResults = await Promise.allSettled(
            fetchedOrders.map((order) => generateInvoiceForOrder(order)),
          )

          const invoiceUpdateResults = await Promise.allSettled(
            invoiceResults.map(async (result, index) => {
              const order = fetchedOrders[index]

              if (result.status !== 'fulfilled' || !result.value) {
                console.warn(
                  `⚠️ [Manifest] Invoice generation failed for ${providerName} order ${order.order_number}`,
                )
                manifestWarnings.push(`${order.order_number}: invoice could not be generated.`)
                return
              }

              const invoiceResult = result.value as {
                key: string
                invoiceNumber?: string
                invoiceDate?: string
                invoiceAmount?: number
              }
              const invoiceKey = invoiceResult.key
              if (!invoiceKey || typeof invoiceKey !== 'string' || !invoiceKey.trim()) {
                manifestWarnings.push(`${order.order_number}: invoice file is missing.`)
                return
              }

              const normalizedInvoiceKey = normalizeToR2Key(invoiceKey.trim())
              if (!normalizedInvoiceKey) {
                console.warn(
                  `⚠️ [Manifest] Could not normalize invoice key for ${providerName} order ${order.order_number}: ${invoiceKey.trim()}`,
                )
                manifestWarnings.push(`${order.order_number}: invoice file could not be saved.`)
                return
              }

              await tx
                .update(b2c_orders)
                .set({
                  invoice_link: normalizedInvoiceKey,
                  invoice_number: invoiceResult.invoiceNumber ?? undefined,
                  invoice_date: invoiceResult.invoiceDate ?? undefined,
                  invoice_amount:
                    invoiceResult.invoiceAmount !== undefined
                      ? invoiceResult.invoiceAmount
                      : undefined,
                  updated_at: new Date(),
                })
                .where(eq(b2c_orders.id, order.id))

              console.log(
                `✅ [Manifest] Invoice link updated for ${providerName} order ${order.order_number}: ${normalizedInvoiceKey}`,
              )
            }),
          )

          invoiceUpdateResults.forEach((result, index) => {
            if (result.status === 'fulfilled') return
            const order = fetchedOrders[index]
            console.error(
              `❌ [Manifest] Failed to update invoice_link for ${providerName} order ${order.order_number}:`,
              {
                message: result.reason?.message || String(result.reason),
                cause: result.reason?.cause ?? null,
                detail: result.reason?.detail ?? null,
                hint: result.reason?.hint ?? null,
                code: result.reason?.code ?? null,
                constraint: result.reason?.constraint ?? null,
                column: result.reason?.column ?? null,
                table: result.reason?.table ?? null,
              },
            )
            manifestWarnings.push(`${order.order_number}: invoice could not be saved.`)
          })

          const uniqueWarnings = Array.from(new Set(manifestWarnings))

          await Promise.all(
            fetchedOrders.map(async (order) => {
              const orderWarnings = uniqueWarnings.filter((warning) =>
                String(warning || '').startsWith(`${order.order_number}:`),
              )

              await tx
                .update(b2c_orders)
                .set({
                  manifest_error: orderWarnings.length
                    ? truncateColumnValue(orderWarnings.join(' '))
                    : null,
                  updated_at: new Date(),
                })
                .where(eq(b2c_orders.id, order.id))
            }),
          )

          return {
            manifest_id: manifestKey,
            manifest_url: manifestDownloadUrl,
            manifest_key: manifestKey,
            warnings: uniqueWarnings.length > 0 ? uniqueWarnings : undefined,
          }
        }

        if (integrationType === 'amazon') {
          if (params.type !== 'b2c') {
            throw new Error('Amazon manifest flow is only supported for B2C orders')
          }

          const fetchedOrders: any[] = []
          for (const order of orders) {
            const [fullOrder] = await tx
              .select()
              .from(b2c_orders)
              .where(eq(b2c_orders.id, order.id))
            if (fullOrder) fetchedOrders.push(fullOrder)
          }

          if (!fetchedOrders.length) {
            throw new Error('Unable to load Amazon orders for manifest generation')
          }

          const normalizeDetails = (value: any) => {
            if (!value) return {}
            if (typeof value === 'string') {
              try {
                return JSON.parse(value)
              } catch {
                return {}
              }
            }
            return value
          }

          const pickupDetails = normalizeDetails(fetchedOrders[0]?.pickup_details)

          const createManifestCard = (order: any) => ({
            width: '48%',
            margin: [0, 0, 0, 12],
            stack: [
              {
                canvas: [
                  {
                    type: 'rect',
                    x: 0,
                    y: 0,
                    w: 245,
                    h: 118,
                    r: 8,
                    lineColor: '#d8deee',
                    fillColor: '#fbfcff',
                    lineWidth: 1,
                  },
                ],
              },
              {
                margin: [12, -108, 12, 0],
                stack: [
                  {
                    columns: [
                      {
                        text: order.order_number ?? '-',
                        bold: true,
                        fontSize: 11,
                        color: '#1f2a44',
                      },
                      {
                        text: (order.order_type ?? '').toUpperCase() || '-',
                        fontSize: 8,
                        bold: true,
                        color: '#4c67a1',
                        alignment: 'right',
                      },
                    ],
                  },
                  {
                    text: `AWB: ${order.awb_number ?? '-'}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 6, 0, 0],
                  },
                  {
                    text: `Consignee: ${order.buyer_name ?? '-'}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 4, 0, 0],
                  },
                  {
                    columns: [
                      {
                        text: `Pincode: ${order.pincode ?? '-'}`,
                        fontSize: 9,
                        color: '#42506b',
                      },
                      {
                        text: `Weight: ${Number(order.weight ?? 0).toFixed(0)} g`,
                        fontSize: 9,
                        color: '#42506b',
                        alignment: 'right',
                      },
                    ],
                    margin: [0, 4, 0, 0],
                  },
                  {
                    text: `City: ${order.city ?? '-'}${order.state ? `, ${order.state}` : ''}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 4, 0, 0],
                  },
                  {
                    text: `Address: ${order.address ?? '-'}`,
                    fontSize: 8,
                    color: '#667085',
                    margin: [0, 8, 0, 0],
                  },
                ],
              },
            ],
          })

          const manifestCards = fetchedOrders.reduce((rows: any[], order, index) => {
            if (index % 2 === 0) {
              rows.push({
                columns: [
                  createManifestCard(order),
                  fetchedOrders[index + 1]
                    ? createManifestCard(fetchedOrders[index + 1])
                    : { width: '48%', text: '' },
                ],
                columnGap: 12,
              })
            }
            return rows
          }, [])

          const printer = new PdfPrinter(pdfFonts)
          const docDefinition: any = {
            defaultStyle: { font: 'Helvetica' },
            pageSize: 'A4',
            pageMargins: [30, 40, 30, 40],
            content: [
              {
                text: 'Manifest',
                fontSize: 16,
                bold: true,
                alignment: 'center',
                margin: [0, 0, 0, 10],
              },
              {
                columns: [
                  {
                    stack: [
                      { text: `Generated On: ${new Date().toLocaleString()}`, fontSize: 9 },
                      {
                        text: `Total Shipments: ${fetchedOrders.length}`,
                        fontSize: 9,
                        margin: [0, 4, 0, 0],
                      },
                    ],
                  },
                  {
                    stack: [
                      {
                        text: `User ID: ${fetchedOrders[0].user_id}`,
                        fontSize: 9,
                        alignment: 'right',
                      },
                      {
                        text: `Pickup Location: ${pickupDetails?.warehouse_name ?? '-'}`,
                        fontSize: 9,
                        alignment: 'right',
                        margin: [0, 4, 0, 0],
                      },
                    ],
                  },
                ],
                margin: [0, 0, 0, 12],
              },
              {
                text: 'Shipments',
                fontSize: 11,
                bold: true,
                color: '#24324d',
                margin: [0, 0, 0, 10],
              },
              ...manifestCards,
            ],
          }

          const pdfDoc = printer.createPdfKitDocument(docDefinition)
          const chunks: Buffer[] = []
          const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
            pdfDoc.on('data', (chunk) => chunks.push(chunk))
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
            pdfDoc.on('error', (err) => reject(err))
            pdfDoc.end()
          })

          const manifestUploadTarget = await uploadBufferToStorage({
            buffer: pdfBuffer,
            filename: `manifest-amazon-${Date.now()}.pdf`,
            contentType: 'application/pdf',
            userId: fetchedOrders[0].user_id,
            folderKey: 'manifests',
          })
          const manifestKey = manifestUploadTarget.key
          const signedManifestUrl = await presignDownload(manifestKey)
          const manifestDownloadUrl = Array.isArray(signedManifestUrl)
            ? (signedManifestUrl[0] ?? null)
            : signedManifestUrl
          const manifestWarnings: string[] = []
          const amazonCredentials =
            integrationType === 'amazon' ? await getStoredAmazonShippingCredentials() : null
          if (amazonCredentials) {
            applyAmazonShippingCredentialsToEnv(amazonCredentials)
          }

          const orderUpdatePromises = fetchedOrders.map(async (order) => {
            const [freshOrder] = await tx
              .select()
              .from(b2c_orders)
              .where(eq(b2c_orders.id, order.id))

            if (!freshOrder) {
              console.warn(
                `⚠️ [Amazon] Order ${order.order_number} not found in database, skipping label generation`,
              )
              manifestWarnings.push(
                `${order.order_number}: label could not be generated because the order was not found.`,
              )
              return
            }

            let labelKey: string | null =
              await resolveAmazonProviderLabelReference({
                order: freshOrder,
                amazonCredentials,
              })

            if (!labelKey) {
              const warning = `${freshOrder.order_number}: Amazon label could not be resolved from provider data.`
              console.warn(`⚠️ [Amazon] ${warning}`)
              manifestWarnings.push(warning)
            }

            const currentOrderStatus = String(freshOrder.order_status || '').trim().toLowerCase()
            const nextOrderStatus = ['cancelled', 'canceled', 'delivered', 'rto_delivered'].includes(
              currentOrderStatus,
            )
              ? freshOrder.order_status
              : 'pickup_initiated'

            const updateData: any = {
              manifest: manifestKey,
              order_status: nextOrderStatus,
              pickup_status:
                nextOrderStatus === 'pickup_initiated'
                  ? 'pickup_requested'
                  : freshOrder.pickup_status ?? null,
              provider_last_status: nextOrderStatus,
              updated_at: new Date(),
            }

            if (labelKey && typeof labelKey === 'string' && labelKey.trim().length > 0) {
              const normalizedLabel = normalizeToR2Key(labelKey.trim())
              if (normalizedLabel) {
                updateData.label = normalizedLabel
              }
            }

            await tx
              .update(b2c_orders)
              .set(updateData)
              .where(eq(b2c_orders.id, freshOrder.id))
          })

          await Promise.all(orderUpdatePromises)

          const invoiceResults = await Promise.allSettled(
            fetchedOrders.map((order) => generateInvoiceForOrder(order)),
          )

          const invoiceUpdateResults = await Promise.allSettled(
            invoiceResults.map(async (result, index) => {
              const order = fetchedOrders[index]

              if (result.status !== 'fulfilled' || !result.value) {
                console.warn(
                  `⚠️ [Manifest] Invoice generation failed for Amazon order ${order.order_number}`,
                )
                manifestWarnings.push(`${order.order_number}: invoice could not be generated.`)
                return
              }

              const invoiceResult = result.value as {
                key: string
                invoiceNumber?: string
                invoiceDate?: string
                invoiceAmount?: number
              }
              const invoiceKey = invoiceResult.key
              if (!invoiceKey || typeof invoiceKey !== 'string' || !invoiceKey.trim()) {
                manifestWarnings.push(`${order.order_number}: invoice file is missing.`)
                return
              }

              const normalizedInvoiceKey = normalizeToR2Key(invoiceKey.trim())
              if (!normalizedInvoiceKey) {
                manifestWarnings.push(`${order.order_number}: invoice file could not be saved.`)
                return
              }

              await tx
                .update(b2c_orders)
                .set({
                  invoice_link: normalizedInvoiceKey,
                  invoice_number: invoiceResult.invoiceNumber ?? undefined,
                  invoice_date: invoiceResult.invoiceDate ?? undefined,
                  invoice_amount:
                    invoiceResult.invoiceAmount !== undefined
                      ? invoiceResult.invoiceAmount
                      : undefined,
                  updated_at: new Date(),
                })
                .where(eq(b2c_orders.id, order.id))

              console.log(
                `✅ [Manifest] Invoice link updated for Amazon order ${order.order_number}: ${normalizedInvoiceKey}`,
              )
            }),
          )

          invoiceUpdateResults.forEach((result, index) => {
            if (result.status === 'fulfilled') return
            const order = fetchedOrders[index]
            console.error(
              `❌ [Manifest] Failed to update invoice_link for Amazon order ${order.order_number}:`,
              {
                message: result.reason?.message || String(result.reason),
                cause: result.reason?.cause ?? null,
                code: result.reason?.code ?? null,
              },
            )
            manifestWarnings.push(`${order.order_number}: invoice could not be saved.`)
          })

          const uniqueWarnings = Array.from(new Set(manifestWarnings))

          await Promise.all(
            fetchedOrders.map(async (order) => {
              const orderWarnings = uniqueWarnings.filter((warning) =>
                String(warning || '').startsWith(`${order.order_number}:`),
              )

              await tx
                .update(b2c_orders)
                .set({
                  manifest_error: orderWarnings.length
                    ? truncateColumnValue(orderWarnings.join(' '))
                    : null,
                  updated_at: new Date(),
                })
                .where(eq(b2c_orders.id, order.id))
            }),
          )

          return {
            manifest_id: manifestKey,
            manifest_url: manifestDownloadUrl,
            manifest_key: manifestKey,
            warnings: uniqueWarnings.length > 0 ? uniqueWarnings : undefined,
          }
        }

        if (integrationType !== 'delhivery') {
          throw new Error('Only Delhivery is supported for manifest generation')
        }

        async function resolveManifestUrl(value: string | null): Promise<string | null> {
          if (!value) return null
          if (/^https?:\/\//i.test(value)) return value
          try {
            const signed = await presignDownload(value)
            return Array.isArray(signed) ? (signed[0] ?? null) : signed
          } catch (err) {
            console.error('⚠️ Failed to presign manifest URL:', err)
            return null
          }
        }

        // Helper function to normalize URLs to R2 keys
        // Ensures we always store R2 keys (not full Cloudflare URLs) in the database
        function normalizeToR2Key(value: string | null | undefined): string | null {
          if (!value || typeof value !== 'string' || !value.trim()) {
            return null
          }

          const trimmed = value.trim()

          // If it's already a key (doesn't start with http), return as-is
          if (!/^https?:\/\//i.test(trimmed)) {
            return trimmed
          }

          // If it's a URL, try to extract the R2 key
          try {
            const url = new URL(trimmed)
            const pathParts = url.pathname.split('/').filter(Boolean)
            const bucket = getBucketName()

            // Check if it's an R2 URL with our bucket
            if (pathParts.includes(bucket)) {
              const bucketIndex = pathParts.indexOf(bucket)
              if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
                const key = pathParts.slice(bucketIndex + 1).join('/')
                console.log(`🔄 Extracted R2 key from URL: ${key}`)
                return key
              }
            }

            // Check if it's an R2 endpoint URL format
            if (process.env.R2_ENDPOINT && trimmed.startsWith(process.env.R2_ENDPOINT)) {
              if (pathParts.length > 1) {
                // Skip bucket name (first part) and get the rest as key
                const key = pathParts.slice(1).join('/')
                console.log(`🔄 Extracted R2 key from endpoint URL: ${key}`)
                return key
              }
            }

            // If we can't extract a key, it's an external URL - log warning
            console.warn(
              `⚠️ Could not extract R2 key from URL, treating as external URL: ${trimmed}`,
            )
            return null // Don't store external URLs as keys
          } catch (err) {
            console.error(`❌ Failed to parse URL for key extraction: ${trimmed}`, err)
            return null
          }
        }

        // Helper function to generate invoice for an order
        async function generateInvoiceForOrder(order: any): Promise<{
          key: string
          invoiceNumber: string
          invoiceDate: string
          invoiceAmount: number
        } | null> {
          try {
            console.log(
              `🧾 [Manifest] Generating invoice for order ${order.order_number} (ID: ${order.id})`,
            )

            // Use db instead of tx since this runs after transaction completes
            const [prefs] = await db
              .select()
              .from(invoicePreferences)
              .where(eq(invoicePreferences.userId, order.user_id))

            // 🔹 Fetch user profile for company details
            const [user] = await db
              .select({
                companyName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
                companyGST: sql<string>`(${userProfiles.companyInfo} ->> 'companyGst')`,
                supportEmail: sql<string>`(${userProfiles.companyInfo} ->> 'companyEmail')`,
                supportPhone: sql<string>`(${userProfiles.companyInfo} ->> 'companyContactNumber')`,
                brandName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
                companyLogo: sql<string>`(${userProfiles.companyInfo} ->> 'companyLogoUrl')`,
                companyAddress: sql<string>`(${userProfiles.companyInfo} ->> 'companyAddress')`,
                companyState: sql<string>`(${userProfiles.companyInfo} ->> 'state')`,
                panNumber: sql<string>`(${userProfiles.companyInfo} ->> 'panNumber')`,
              })
              .from(userProfiles)
              .where(eq(userProfiles.userId, order.user_id))

            const pickupDetails = normalizePickupDetails(order.pickup_details)
            const pickupPincode = pickupDetails?.pincode

            const { logoBuffer, signatureBuffer } = await loadInvoiceAssets(
              {
                companyLogoKey: user?.companyLogo ?? undefined,
                includeSignature: prefs?.includeSignature,
                signatureFile: prefs?.signatureFile ?? undefined,
              },
              order.order_number || String(order.id),
            )

            const serviceType =
              order.service_type ||
              (order as any).serviceType ||
              order.integration_type ||
              order.courier_partner ||
              ''

            // ✅ Always use prefs prefix/suffix
            const invoiceNumber = await resolveInvoiceNumber({
              userId: order.user_id,
              existingInvoiceNumber: (order as any)?.invoice_number,
              prefix: prefs?.prefix ?? undefined,
              suffix: prefs?.suffix ?? undefined,
            })
            const invoiceDateDisplay = dayjs().format('DD MMM YYYY')
            const invoiceDateStored = dayjs().format('YYYY-MM-DD')

            const pickupAddress = formatPickupAddress(pickupDetails)
            const sellerAddress = pickupAddress || user?.companyAddress || ''
            const sellerStateCode = pickupDetails?.state || user?.companyState || ''
            const sellerName =
              pickupDetails?.warehouse_name || user?.companyName || user?.brandName || 'Seller'
            const brandName =
              user?.brandName || user?.companyName || pickupDetails?.warehouse_name || ''
            const gstNumber = user?.companyGST || ''
            const panNumber = user?.panNumber || ''
            const supportPhone = pickupDetails?.phone || user?.supportPhone || ''
            const supportEmail = user?.supportEmail || prefs?.supportEmail || ''

            // ✅ COD-safe invoice amount
            const invoiceAmount =
              Number(order.order_amount ?? 0) +
              Number(order.shipping_charges ?? 0) +
              Number(order.gift_wrap ?? 0) +
              Number(order.transaction_fee ?? 0) -
              (Number(order.discount ?? 0) + Number(order.prepaid_amount ?? 0))

            // Validate and normalize products array
            let products: Product[] = []
            try {
              if (order.products) {
                // Handle case where products might be a JSON string
                const productsData =
                  typeof order.products === 'string' ? JSON.parse(order.products) : order.products

                // Ensure it's an array
                if (Array.isArray(productsData)) {
                  products = productsData.map((p: any) => ({
                    name: p.name ?? p.productName ?? p.box_name ?? 'N/A',
                    price: Number(p.price ?? 0),
                    qty: Number(p.qty ?? p.quantity ?? 1),
                    sku: p.sku ?? '',
                    hsn: p.hsn ?? p.hsnCode ?? '',
                    discount: Number(p.discount ?? 0),
                    tax_rate: Number(p.tax_rate ?? p.taxRate ?? 0),
                    box_name: p.box_name ?? p.name ?? p.productName,
                  }))
                } else {
                  console.warn(
                    `⚠️ [Manifest] Products is not an array for order ${order.order_number}, using empty array`,
                  )
                  products = []
                }
              } else {
                console.warn(
                  `⚠️ [Manifest] Products is null/undefined for order ${order.order_number}, using empty array`,
                )
                products = []
              }
            } catch (productsErr: any) {
              console.error(
                `❌ [Manifest] Failed to parse products for order ${order.order_number}:`,
                productsErr?.message || productsErr,
              )
              products = []
            }

            // Ensure we have at least one product
            if (products.length === 0) {
              console.warn(
                `⚠️ [Manifest] No products found for order ${order.order_number}, creating placeholder product`,
              )
              products = [
                {
                  name: 'Product',
                  price: Number(order.order_amount ?? 0),
                  qty: 1,
                  sku: '',
                  hsn: '',
                  discount: 0,
                  tax_rate: 0,
                },
              ]
            }

            console.log(`📄 [Manifest] Generating invoice PDF for order ${order.order_number}...`)

            // Generate invoice PDF
            const invoiceBuffer = await generateInvoicePDF({
              invoiceNumber,
              invoiceDate: invoiceDateDisplay,
              invoiceAmount,
              buyerName: order.buyer_name,
              buyerPhone: order.buyer_phone,
              buyerEmail: order.buyer_email ?? '',
              buyerAddress: order.address,
              buyerCity: order.city,
              buyerState: order.state,
              buyerPincode: order.pincode,
              products: products,
              shippingCharges: Number(order.shipping_charges) ?? 0,
              giftWrap: Number(order.gift_wrap) ?? 0,
              transactionFee: Number(order.transaction_fee) ?? 0,
              discount: Number(order.discount) ?? 0,
              prepaidAmount: Number(order.prepaid_amount) ?? 0,
              courierName: order.courier_partner ?? '',
              courierId: order.courier_id?.toString() ?? '',
              logoBuffer,
              orderType: order?.order_type as 'prepaid' | 'cod',
              courierCod: order?.order_type === 'cod' ? Number(order?.cod_charges ?? 0) : 0,
              signatureBuffer,
              companyName: sellerName,
              supportEmail,
              supportPhone,
              companyGST: gstNumber,
              sellerName,
              brandName,
              sellerAddress,
              sellerStateCode,
              gstNumber,
              panNumber,
              invoiceNotes: prefs?.invoiceNotes ?? '',
              termsAndConditions: prefs?.termsAndConditions ?? '',
              orderId: order.order_number,
              awbNumber: order.awb_number ?? '',
              courierPartner: order.courier_partner ?? '',
              serviceType,
              pickupPincode: pickupPincode ?? '',
              deliveryPincode: order.pincode ?? '',
              orderDate: order.order_date ?? '',
              rtoCharges: Number((order as any).rto_charges ?? 0),
              layout: (prefs?.template as 'classic' | 'thermal') ?? 'classic',
            })

            if (!invoiceBuffer || invoiceBuffer.length === 0) {
              throw new Error('Invoice PDF buffer is empty')
            }

            console.log(
              `📤 [Manifest] Uploading invoice PDF for order ${order.order_number} (size: ${invoiceBuffer.length} bytes)...`,
            )

            // Upload invoice to R2
            const uploadTarget = await uploadBufferToStorage({
              buffer: invoiceBuffer,
              filename: `invoice-${order.id}.pdf`,
              contentType: 'application/pdf',
              userId: order.user_id,
              folderKey: 'invoices',
            })

            const finalKey = uploadTarget.key
            const uploadResponse = { status: 200 }

            // Validate key is not empty and is a string
            if (!finalKey || typeof finalKey !== 'string' || finalKey.trim().length === 0) {
              throw new Error('Invoice key is invalid or empty after upload')
            }

            // Ensure we store only the R2 key (not a URL), even if Cloudflare returns it in URL format
            const trimmedKey = finalKey.trim()
            const normalizedKey = normalizeToR2Key(trimmedKey) || trimmedKey

            // If normalization failed but it's not a URL, use the original key
            // (normalizeToR2Key returns null for external URLs, but our key should be valid)
            const keyToStore = normalizedKey || (trimmedKey.startsWith('http') ? null : trimmedKey)

            if (!keyToStore) {
              throw new Error(`Invalid invoice key format: ${trimmedKey}`)
            }

            console.log(
              `✅ [Manifest] Invoice generated and uploaded successfully for order ${order.order_number}: ${keyToStore} (status: ${uploadResponse.status})`,
            )

            await sendTaxInvoiceGeneratedEmail({
              order,
              invoiceNumber,
              invoiceDate: invoiceDateStored,
              invoiceAmount,
              invoiceKey: keyToStore,
            }).catch((emailErr: any) => {
              console.error(`Failed to send tax invoice email for ${order.order_number}:`, emailErr)
            })

            return {
              key: keyToStore,
              invoiceNumber,
              invoiceDate: invoiceDateStored,
              invoiceAmount,
            }
          } catch (err: any) {
            console.error(
              `❌ [Manifest] Failed to generate invoice for order ${order.order_number} (ID: ${order.id}):`,
              {
                error: err?.message || err,
                errorName: err?.name,
                stack: err?.stack,
                orderNumber: order.order_number,
                orderId: order.id,
                hasProducts: !!order.products,
                productsType: typeof order.products,
                productsIsArray: Array.isArray(order.products),
              },
            )
            // Return null so we can continue manifest generation even if invoice fails
            return null
          }
        }
        if (integrationType === 'delhivery') {
          const fetchedOrders: any[] = []
          let expectedPackageCount = 0
          for (const order of orders) {
            const [fullOrder] = await tx.select().from(table).where(eq(table.id, order.id))
            if (fullOrder) fetchedOrders.push(fullOrder)
          }

          if (!fetchedOrders.length) {
            throw new Error('Unable to load Delhivery orders for manifest generation')
          }

          manifestFailureOrderIds = fetchedOrders.map((order) => order.id)
          const manifestStartedAt = Date.now()

          const delhivery = new DelhiveryService()
          const normalizeDetails = (value: any) => {
            if (!value) return {}
            if (typeof value === 'string') {
              try {
                return JSON.parse(value)
              } catch {
                return {}
              }
            }
            return value
          }

          const normalizeOrderItems = (value: any) => {
            try {
              const raw = typeof value === 'string' ? JSON.parse(value) : value
              if (!Array.isArray(raw) || !raw.length) {
                return [
                  {
                    name: 'Product',
                    sku: 'NA',
                    qty: 1,
                    price: 0,
                    hsn: '',
                    discount: 0,
                    tax_rate: 0,
                  },
                ]
              }

              return raw.map((item: any) => ({
                name: item?.name ?? item?.productName ?? item?.box_name ?? 'Product',
                sku: item?.sku ?? 'NA',
                qty: Number(item?.qty ?? item?.quantity ?? 1) || 1,
                price: Number(item?.price ?? 0) || 0,
                hsn: item?.hsn ?? item?.hsnCode ?? '',
                discount: Number(item?.discount ?? 0) || 0,
                tax_rate: Number(item?.tax_rate ?? item?.taxRate ?? 0) || 0,
              }))
            } catch {
              return [
                {
                  name: 'Product',
                  sku: 'NA',
                  qty: 1,
                  price: 0,
                  hsn: '',
                  discount: 0,
                  tax_rate: 0,
                },
              ]
            }
          }

          const manifestPickupDetails = normalizeDetails(fetchedOrders[0]?.pickup_details)
          const orderPickupLocations = Array.from(
            new Set(
              fetchedOrders
                .map((order) =>
                  String(normalizeDetails(order.pickup_details)?.warehouse_name || '').trim(),
                )
                .filter(Boolean),
            ),
          )
          if (orderPickupLocations.length > 1) {
            throw new HttpError(
              400,
              'Select Delhivery orders from only one pickup location at a time for manifesting.',
            )
          }

          const requestedPickupLocation = String(params.pickup_location || '').trim()
          const storedPickupLocation = String(manifestPickupDetails?.warehouse_name || '').trim()
          const manifestPickupLocationName = requestedPickupLocation || storedPickupLocation
          if (!manifestPickupLocationName) {
            throw new Error('Pickup warehouse name is required to create Delhivery pickup request')
          }
          if (storedPickupLocation && manifestPickupLocationName !== storedPickupLocation) {
            throw new HttpError(
              400,
              `Pickup location must match the order warehouse exactly: ${storedPickupLocation}.`,
            )
          }

          const manifestIsRetry = fetchedOrders.some(
            (order) => String(order.order_status || '').toLowerCase() === 'manifest_failed',
          )
          const manifestPickupSchedule = normalizePickupSchedule({
            pickupDateRaw:
              params.pickup_date ||
              manifestPickupDetails?.pickup_date ||
              fetchedOrders[0]?.order_date ||
              new Date().toISOString(),
            pickupTimeRaw:
              params.pickup_time || manifestPickupDetails?.pickup_time || getDefaultPickupTime(),
            isManifestRetry: manifestIsRetry,
          })

          console.log('ℹ️ Delhivery manifest pickup schedule resolved', {
            order_number: fetchedOrders[0]?.order_number,
            request_pickup_date: params.pickup_date || null,
            request_pickup_time: params.pickup_time || null,
            pickup_location: manifestPickupLocationName,
            stored_pickup_date: manifestPickupDetails?.pickup_date || null,
            stored_pickup_time: manifestPickupDetails?.pickup_time || null,
            final_pickup_date: manifestPickupSchedule.pickupDate,
            final_pickup_time: manifestPickupSchedule.pickupTime,
          })

          for (const order of fetchedOrders) {
            await debitManifestSuccessChargeIfNeeded({ tx, order })
          }

          for (const order of fetchedOrders) {
            if (order.awb_number) continue

            const shipmentStartedAt = Date.now()
            const pickupDetails = normalizeDetails(order.pickup_details)
            const manifestParams: ShipmentParams = {
              order_number: order.order_number,
              order_date: new Date(order.order_date || order.created_at || new Date()),
              payment_type: order.order_type === 'cod' ? 'cod' : 'prepaid',
              order_amount: Number(order.order_amount ?? 0),
              package_weight: Number(order.weight ?? 0),
              package_length: Number(order.length ?? 0),
              package_breadth: Number(order.breadth ?? 0),
              package_height: Number(order.height ?? 0),
              courier_id: order.courier_id ?? undefined,
              integration_type: 'delhivery',
              shipping_mode: order.shipping_mode ?? undefined,
              invoice_number: order.invoice_number ?? undefined,
              invoice_date: order.invoice_date ?? undefined,
              is_rto_different: order.is_rto_different ? 'yes' : 'no',
              company: {},
              pickup: {
                warehouse_name: pickupDetails?.warehouse_name || '',
                name: pickupDetails?.name || pickupDetails?.warehouse_name || 'Pickup',
                address: pickupDetails?.address || '',
                city: pickupDetails?.city || '',
                state: pickupDetails?.state || '',
                pincode: pickupDetails?.pincode || '',
                phone: pickupDetails?.phone || '',
                gst_number: pickupDetails?.gst_number || '',
                pickup_date: manifestPickupSchedule.pickupDate,
                pickup_time: manifestPickupSchedule.pickupTime,
              },
              consignee: {
                name: order.buyer_name,
                address: order.address,
                city: order.city,
                state: order.state,
                pincode: order.pincode,
                phone: order.buyer_phone,
                email: order.buyer_email ?? '',
              },
              order_items: normalizeOrderItems(order.products),
              pickup_date: manifestPickupSchedule.pickupDate,
              pickup_time: manifestPickupSchedule.pickupTime,
            }

            let shipmentData: any
            try {
              shipmentData = await delhivery.createShipment(manifestParams)
              console.log('✅ Delhivery shipment created during manifest', {
                order_number: order.order_number,
                awb: shipmentData?.packages?.[0]?.waybill ?? shipmentData?.awb_number ?? null,
                duration_ms: Date.now() - shipmentStartedAt,
              })
            } catch (error: any) {
              const manifestErrorMessage = getUserFacingManifestError(error)
              await refundManifestFailureChargeOnce({
                orderId: order.id,
                manifestErrorMessage,
              })

              throw new HttpError(getErrorStatusCode(error, 502), manifestErrorMessage)
            }
            const shipmentPackage = shipmentData?.packages?.[0] || null
            expectedPackageCount += Math.max(
              1,
              Array.isArray(shipmentData?.packages) ? shipmentData.packages.length : 0,
            )

            await tx
              .update(b2c_orders)
              .set({
                awb_number: shipmentPackage?.waybill ?? shipmentData?.awb_number ?? null,
                shipment_id: shipmentData?.upload_wbn ?? shipmentData?.shipment_id ?? null,
                courier_partner: 'Delhivery',
                shipping_mode:
                  shipmentData?.shipping_mode ??
                  shipmentPackage?.shipping_mode ??
                  shipmentPackage?.service_mode ??
                  shipmentPackage?.service_type ??
                  order.shipping_mode ??
                  null,
                sort_code:
                  shipmentPackage?.sort_code ??
                  shipmentPackage?.sortCode ??
                  shipmentPackage?.routing_code ??
                  shipmentPackage?.routingCode ??
                  null,
                manifest: shipmentData?.upload_wbn ?? shipmentData?.manifest ?? null,
                manifest_error: null,
                order_status:
                  order.order_status === 'pending' || order.order_status === 'manifest_failed'
                    ? 'shipment_created'
                    : order.order_status,
                updated_at: new Date(),
              })
              .where(eq(b2c_orders.id, order.id))

            order.awb_number = shipmentPackage?.waybill ?? shipmentData?.awb_number ?? null
            order.shipment_id = shipmentData?.upload_wbn ?? shipmentData?.shipment_id ?? null
            order.shipping_mode =
              shipmentData?.shipping_mode ??
              shipmentPackage?.shipping_mode ??
              shipmentPackage?.service_mode ??
              shipmentPackage?.service_type ??
              order.shipping_mode ??
              null
            order.sort_code =
              shipmentPackage?.sort_code ??
              shipmentPackage?.sortCode ??
              shipmentPackage?.routing_code ??
              shipmentPackage?.routingCode ??
              null
            order.manifest = shipmentData?.upload_wbn ?? shipmentData?.manifest ?? null
          }

          if (expectedPackageCount === 0) {
            expectedPackageCount = fetchedOrders.reduce(
              (count, order) => count + (order.awb_number ? 1 : 0),
              0,
            )
          }
          if (expectedPackageCount === 0) {
            expectedPackageCount = fetchedOrders.length
          }

          const pickupDetails = manifestPickupDetails
          const pickupLocationName = manifestPickupLocationName
          const isManifestRetry = fetchedOrders.some(
            (order) => String(order.order_status || '').toLowerCase() === 'manifest_failed',
          )
          const pickupDateRaw =
            params.pickup_date ||
            pickupDetails?.pickup_date ||
            fetchedOrders[0]?.order_date ||
            new Date().toISOString()
          const pickupTimeRaw =
            params.pickup_time || pickupDetails?.pickup_time || getDefaultPickupTime()
          const { pickupDate, pickupTime } = normalizePickupSchedule({
            pickupDateRaw,
            pickupTimeRaw,
            isManifestRetry,
          })
          const requestedPackageCount = Number(params.expected_package_count ?? 0)
          if (Number.isFinite(requestedPackageCount) && requestedPackageCount > 0) {
            expectedPackageCount = Math.max(1, Math.round(requestedPackageCount))
          }

          if (isManifestRetry) {
            console.log('ℹ️ Delhivery manifest retry pickup schedule adjusted', {
              order_number: fetchedOrders[0]?.order_number,
              requested_pickup_date: String(pickupDateRaw).slice(0, 10) || null,
              final_pickup_date: pickupDate,
            })
          }

          for (const order of fetchedOrders) {
            const orderPickupDetails = normalizeDetails(order.pickup_details)
            order.pickup_details = {
              ...orderPickupDetails,
              pickup_date: pickupDate,
              pickup_time: pickupTime,
            }

            await tx
              .update(b2c_orders)
              .set({
                pickup_details: order.pickup_details,
                updated_at: new Date(),
              })
              .where(eq(b2c_orders.id, order.id))
          }

          let pickupRequestWarning: string | null = null
          const pickupRequestStartedAt = Date.now()
          try {
            await delhivery.createPickupRequest({
              pickup_date: pickupDate,
              pickup_time: pickupTime,
              pickup_location: pickupLocationName,
              expected_package_count: expectedPackageCount,
            })
            console.log('✅ Delhivery pickup request created during manifest', {
              pickup_location: pickupLocationName,
              expected_package_count: expectedPackageCount,
              duration_ms: Date.now() - pickupRequestStartedAt,
            })
          } catch (error: any) {
            const pickupErrorMessage = getUserFacingManifestError(error)
            pickupRequestWarning = pickupErrorMessage
            console.warn('⚠️ Delhivery shipment created but pickup request failed', {
              orders: fetchedOrders.map((order) => ({
                order_number: order.order_number,
                awb_number: order.awb_number,
              })),
              pickup_location: pickupLocationName,
              expected_package_count: expectedPackageCount,
              error: pickupErrorMessage,
              duration_ms: Date.now() - pickupRequestStartedAt,
            })
            await persistPickupFailureForOrders({
              orderIds: fetchedOrders.map((order) => order.id),
              pickupError: pickupErrorMessage,
            })
            await notifyAdminsForProviderBalanceIssue({
              orders: fetchedOrders,
              errorMessage: pickupErrorMessage,
              courierPartner: 'Delhivery',
              contextLabel: 'Pickup request',
            })
          }

          const createManifestCard = (order: any) => ({
            width: '48%',
            margin: [0, 0, 0, 12],
            stack: [
              {
                canvas: [
                  {
                    type: 'rect',
                    x: 0,
                    y: 0,
                    w: 245,
                    h: 118,
                    r: 8,
                    lineColor: '#d8deee',
                    fillColor: '#fbfcff',
                    lineWidth: 1,
                  },
                ],
              },
              {
                margin: [12, -108, 12, 0],
                stack: [
                  {
                    columns: [
                      {
                        text: order.order_number ?? '-',
                        bold: true,
                        fontSize: 11,
                        color: '#1f2a44',
                      },
                      {
                        text: (order.order_type ?? '').toUpperCase() || '-',
                        fontSize: 8,
                        bold: true,
                        color: '#4c67a1',
                        alignment: 'right',
                      },
                    ],
                  },
                  {
                    text: `AWB: ${order.awb_number ?? '-'}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 6, 0, 0],
                  },
                  {
                    text: `Consignee: ${order.buyer_name ?? '-'}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 4, 0, 0],
                  },
                  {
                    columns: [
                      {
                        text: `Pincode: ${order.pincode ?? '-'}`,
                        fontSize: 9,
                        color: '#42506b',
                      },
                      {
                        text: `Weight: ${Number(order.weight ?? 0).toFixed(0)} g`,
                        fontSize: 9,
                        color: '#42506b',
                        alignment: 'right',
                      },
                    ],
                    margin: [0, 4, 0, 0],
                  },
                  {
                    text: `City: ${order.city ?? '-'}${order.state ? `, ${order.state}` : ''}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 4, 0, 0],
                  },
                  {
                    text: `Address: ${order.address ?? '-'}`,
                    fontSize: 8,
                    color: '#667085',
                    margin: [0, 8, 0, 0],
                  },
                ],
              },
            ],
          })

          const manifestCards = fetchedOrders.reduce((rows: any[], order, index) => {
            if (index % 2 === 0) {
              rows.push({
                columns: [
                  createManifestCard(order),
                  fetchedOrders[index + 1]
                    ? createManifestCard(fetchedOrders[index + 1])
                    : { width: '48%', text: '' },
                ],
                columnGap: 12,
              })
            }
            return rows
          }, [])

          const printer = new PdfPrinter(pdfFonts)
          const docDefinition: any = {
            defaultStyle: { font: 'Helvetica' },
            pageSize: 'A4',
            pageMargins: [30, 40, 30, 40],
            content: [
              {
                text: 'Manifest',
                fontSize: 16,
                bold: true,
                alignment: 'center',
                margin: [0, 0, 0, 10],
              },
              {
                columns: [
                  {
                    stack: [
                      { text: `Generated On: ${new Date().toLocaleString()}`, fontSize: 9 },
                      {
                        text: `Total Shipments: ${fetchedOrders.length}`,
                        fontSize: 9,
                        margin: [0, 4, 0, 0],
                      },
                    ],
                  },
                  {
                    stack: [
                      {
                        text: `User ID: ${fetchedOrders[0].user_id}`,
                        fontSize: 9,
                        alignment: 'right',
                      },
                      {
                        text: `Pickup Location: ${pickupDetails?.warehouse_name ?? '-'}`,
                        fontSize: 9,
                        alignment: 'right',
                        margin: [0, 4, 0, 0],
                      },
                    ],
                  },
                ],
                margin: [0, 0, 0, 12],
              },
              {
                text: 'Shipments',
                fontSize: 11,
                bold: true,
                color: '#24324d',
                margin: [0, 0, 0, 10],
              },
              ...manifestCards,
            ],
          }

          const pdfDoc = printer.createPdfKitDocument(docDefinition)
          const chunks: Buffer[] = []
          const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
            pdfDoc.on('data', (chunk) => chunks.push(chunk))
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
            pdfDoc.on('error', (err) => reject(err))
            pdfDoc.end()
          })

          const uploadTarget = await uploadBufferToStorage({
            buffer: pdfBuffer,
            filename: `manifest-delhivery-${Date.now()}.pdf`,
            contentType: 'application/pdf',
            userId: fetchedOrders[0].user_id,
            folderKey: 'manifests',
          })
          const manifestKey = uploadTarget.key

          // Generate invoices in parallel (non-blocking) to avoid timeouts
          const invoicePromisesDel = fetchedOrders.map((order) =>
            generateInvoiceForOrder(order).catch((err) => {
              console.error(
                `❌ [Manifest] Invoice generation failed for order ${order.order_number}:`,
                err?.message || err,
              )
              return null
            }),
          )

          // Process orders (labels first, then update) - don't wait for invoices
          const labelAndUpdateStartedAt = Date.now()
          const orderUpdatePromisesDel = fetchedOrders.map(async (order) => {
            // 🖨️ Generate label if it doesn't exist and order has AWB
            // Fetch fresh order data to avoid race conditions
            const [freshOrder] = await tx.select().from(table).where(eq(table.id, order.id))
            if (!freshOrder) {
              console.warn(
                `⚠️ Order ${order.order_number} not found in database, skipping label generation`,
              )
              return
            }

            const currentLabel = freshOrder.label || null
            const currentAwb = freshOrder.awb_number || null

            console.log(`🔍 Checking label generation for order ${order.order_number}:`, {
              order_id: order.id,
              has_label: !!currentLabel,
              label_value: currentLabel,
              has_awb: !!currentAwb,
              awb_value: currentAwb,
            })

            let labelKey: string | null = currentLabel
            if (!labelKey && currentAwb) {
              try {
                console.log(
                  `🖨️ [Delhivery] Generating custom label during manifest for order ${order.order_number} (AWB: ${currentAwb})`,
                )

                // Fetch Delhivery packing_slip JSON (pdf=false) to enrich our custom label
                let enrichedOrder: any = freshOrder
                try {
                  const delhivery = new DelhiveryService()
                  const labelResp: any = await delhivery.generateLabel(currentAwb)

                  const pkg = Array.isArray(labelResp?.packages)
                    ? labelResp.packages[0]
                    : labelResp?.packages || labelResp

                  if (pkg) {
                    // Capture sort_code from Delhivery label metadata
                    const sortCode =
                      (pkg.sort_code || pkg.sortCode || pkg.routing_code || pkg.routingCode) ?? null

                    enrichedOrder = {
                      ...freshOrder,
                      // Provider barcodes (data:image/png;base64,...) used by custom label generator
                      barcode_img: pkg.barcode || null,
                      oid_barcode: pkg.oid_barcode || null,
                      // Sort code from courier label API (use existing sort_code from order if available, otherwise from label metadata)
                      sort_code: sortCode || (freshOrder as any).sort_code || null,
                      // Keep raw meta if needed later
                      delhivery_label_meta: pkg,
                    }
                  }
                } catch (metaErr: any) {
                  console.warn(
                    `⚠️ [Delhivery] Failed to fetch packing_slip JSON for order ${order.order_number}:`,
                    metaErr?.message || metaErr,
                  )
                }

                // Always generate our own custom label PDF
                labelKey = await generateLabelForOrder(enrichedOrder, enrichedOrder.user_id, tx)

                if (!labelKey) {
                  console.warn(
                    `⚠️ [Delhivery] Custom label generation returned null for order ${order.order_number} during manifest`,
                  )
                } else {
                  console.log(
                    `✅ [Delhivery] Custom label generated for order ${order.order_number} during manifest: ${labelKey}`,
                  )
                }

                // Best-effort: trigger Delhivery packing slip PDF generation as well.
                // This keeps provider-side label state in sync even when we print custom labels.
                void new DelhiveryService()
                  .generateLabel(currentAwb, {
                    format: 'pdf',
                  })
                  .then((providerLabelResult) => {
                    console.log(
                      `✅ [Delhivery] Provider label PDF generated for AWB ${currentAwb}: ${providerLabelResult?.label_url || 'link received'}`,
                    )
                  })
                  .catch((providerLabelErr: any) => {
                    console.warn(
                      `⚠️ [Delhivery] Failed to fetch provider label PDF for AWB ${currentAwb}:`,
                      providerLabelErr?.message || providerLabelErr,
                    )
                  })
              } catch (labelErr: any) {
                console.error(
                  `❌ [Delhivery] Failed to generate custom label for order ${order.order_number} during manifest:`,
                  labelErr?.message || labelErr,
                  labelErr?.stack,
                )
                // Don't throw - continue with manifest generation even if label fails
              }
            } else if (!labelKey) {
              console.warn(
                `⚠️ Cannot generate label for order ${order.order_number}: AWB number is missing (AWB: ${currentAwb})`,
              )
            } else {
              console.log(
                `ℹ️ Label already exists for order ${order.order_number}: ${currentLabel}`,
              )
            }

            // Update order with manifest and label first (invoice will be updated separately)
            const currentOrderStatus = String(freshOrder.order_status || '').trim().toLowerCase()
            const stableManifestStatus = pickupRequestWarning
              ? ['pending', 'booked', 'manifest_failed', 'shipment_created'].includes(
                  currentOrderStatus,
                )
                ? 'shipment_created'
                : String(freshOrder.order_status || '').trim() || 'shipment_created'
              : ['pending', 'booked', 'manifest_failed', 'shipment_created'].includes(
                  currentOrderStatus,
                )
                ? 'pickup_initiated'
                : String(freshOrder.order_status || '').trim() ||
                  (currentAwb ? 'pickup_initiated' : 'shipment_created')
            const updateDataDel: any = {
              manifest: manifestKey,
              manifest_error: null,
              pickup_error: pickupRequestWarning ? truncateColumnValue(pickupRequestWarning) : null,
              pickup_status: pickupRequestWarning ? 'failed' : 'pickup_requested',
              order_status: stableManifestStatus,
              provider_last_status: stableManifestStatus,
              updated_at: new Date(),
            }

            // Only set label if it was generated and is valid
            // Ensure we store R2 key, not a full URL
            if (labelKey && typeof labelKey === 'string' && labelKey.trim().length > 0) {
              const normalizedLabel = normalizeToR2Key(labelKey.trim())
              if (normalizedLabel) {
                updateDataDel.label = normalizedLabel
                console.log(`✅ [Delhivery] Normalized label key stored: ${normalizedLabel}`)
              } else {
                console.warn(
                  `⚠️ [Delhivery] Could not normalize label, skipping: ${labelKey.trim()}`,
                )
              }
            } else if (
              currentLabel &&
              typeof currentLabel === 'string' &&
              currentLabel.trim().length > 0
            ) {
              // Preserve existing label if new one wasn't generated, but normalize it
              const normalizedLabel = normalizeToR2Key(currentLabel.trim())
              if (normalizedLabel) {
                updateDataDel.label = normalizedLabel
              }
            }

            await tx.update(table).set(updateDataDel).where(eq(table.id, order.id))
          })

          // Wait for order updates to complete
          await Promise.all(orderUpdatePromisesDel)
          console.log('✅ Delhivery manifest order updates completed', {
            orders: fetchedOrders.length,
            duration_ms: Date.now() - labelAndUpdateStartedAt,
            total_duration_ms: Date.now() - manifestStartedAt,
          })

          // Update invoices in background (fire-and-forget, but wait a bit for initial completion)
          Promise.allSettled(invoicePromisesDel).then((results) => {
            results.forEach((result, index) => {
              const order = fetchedOrders[index]
              if (result.status === 'fulfilled' && result.value) {
                // Validate and update invoice_link in database (use db, not tx, since this runs after transaction)
                // Ensure we store R2 key, not a full URL
                const invoiceResult = result.value as {
                  key: string
                  invoiceNumber?: string
                  invoiceDate?: string
                  invoiceAmount?: number
                }
                const invoiceKey = invoiceResult.key
                if (invoiceKey && typeof invoiceKey === 'string' && invoiceKey.trim().length > 0) {
                  const normalizedInvoiceKey = normalizeToR2Key(invoiceKey.trim())
                  if (normalizedInvoiceKey) {
                    db.update(table)
                      .set({
                        invoice_link: normalizedInvoiceKey,
                        invoice_number: invoiceResult.invoiceNumber ?? undefined,
                        invoice_date: invoiceResult.invoiceDate ?? undefined,
                        invoice_amount:
                          invoiceResult.invoiceAmount !== undefined
                            ? invoiceResult.invoiceAmount
                            : undefined,
                        updated_at: new Date(),
                      })
                      .where(eq(table.id, order.id))
                      .then(() => {
                        console.log(
                          `✅ [Manifest] Invoice link updated for order ${order.order_number}: ${normalizedInvoiceKey}`,
                        )
                      })
                      .catch((err) => {
                        console.error(
                          `❌ [Manifest] Failed to update invoice_link for order ${order.order_number}:`,
                          err?.message || err,
                        )
                      })
                  } else {
                    console.warn(
                      `⚠️ [Manifest] Could not normalize invoice key for order ${
                        order.order_number
                      }: ${invoiceKey.trim()}`,
                    )
                  }
                } else {
                  console.warn(
                    `⚠️ [Manifest] Invoice generation failed for order ${order.order_number}: Invalid key`,
                  )
                }
              } else {
                console.warn(
                  `⚠️ [Manifest] Invoice generation failed for order ${order.order_number}`,
                )
              }
            })
          })

          const manifestDownloadUrl = await resolveManifestUrl(manifestKey)
          console.log('✅ Delhivery manifest generation completed', {
            orders: fetchedOrders.length,
            manifest_key: manifestKey,
            total_duration_ms: Date.now() - manifestStartedAt,
          })

          return {
            manifest_id: manifestKey,
            manifest_url: manifestDownloadUrl,
            manifest_key: manifestKey,
            warnings: pickupRequestWarning ? [pickupRequestWarning] : undefined,
          }
        }

        const processedManifestOrderIds = new Set<string>()
        for (const ref of normalizedRefs) {
          let order: any = orders.find((o) => orderMatchesManifestRef(o, ref))
          if (!order) {
            const [fetched] = await tx
              .select()
              .from(table)
              .where(manifestRefCondition(ref) as any)
              .limit(1)
            order = fetched
          } else {
            const [fetched] = await tx.select().from(table).where(eq(table.id, order.id)).limit(1)
            order = fetched || order
          }
          if (!order) continue

          const orderId = String(order.id ?? '').trim()
          if (orderId) {
            if (processedManifestOrderIds.has(orderId)) continue
            processedManifestOrderIds.add(orderId)
          }

          const [prefs] = await tx
            .select()
            .from(invoicePreferences)
            .where(eq(invoicePreferences.userId, order.user_id))

          // 🔹 Fetch user profile for company details
          const [user] = await tx
            .select({
              companyName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
              companyGST: sql<string>`(${userProfiles.companyInfo} ->> 'companyGst')`,
              supportEmail: sql<string>`(${userProfiles.companyInfo} ->> 'companyEmail')`,
              brandName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
              supportPhone: sql<string>`(${userProfiles.companyInfo} ->> 'companyContactNumber')`,
              companyLogo: sql<string>`(${userProfiles.companyInfo} ->> 'companyLogoUrl')`,
              companyAddress: sql<string>`(${userProfiles.companyInfo} ->> 'companyAddress')`,
              companyState: sql<string>`(${userProfiles.companyInfo} ->> 'state')`,
              panNumber: sql<string>`(${userProfiles.companyInfo} ->> 'panNumber')`,
            })
            .from(userProfiles)
            .where(eq(userProfiles.userId, order.user_id))

          const pickupDetails = normalizePickupDetails(order.pickup_details)
          const pickupPincode = pickupDetails?.pincode
          const { logoBuffer, signatureBuffer } = await loadInvoiceAssets(
            {
              companyLogoKey: user?.companyLogo ?? undefined,
              includeSignature: prefs?.includeSignature,
              signatureFile: prefs?.signatureFile ?? undefined,
            },
            order.order_number || String(order.id),
          )

          const serviceType =
            (order as any).service_type || order.integration_type || order.courier_partner || ''

          const invoiceNumber = await resolveInvoiceNumber({
            userId: order.user_id,
            existingInvoiceNumber: (order as any)?.invoice_number,
            prefix: prefs?.prefix ?? undefined,
            suffix: prefs?.suffix ?? undefined,
          })
          const invoiceDateDisplay = dayjs().format('DD MMM YYYY')
          const invoiceDateStored = dayjs().format('YYYY-MM-DD')

          const pickupAddress = formatPickupAddress(pickupDetails)
          const sellerAddress = pickupAddress || user?.companyAddress || ''
          const sellerStateCode = pickupDetails?.state || user?.companyState || ''
          const sellerName =
            pickupDetails?.warehouse_name || user?.companyName || user?.brandName || 'Seller'
          const brandName =
            user?.brandName || user?.companyName || pickupDetails?.warehouse_name || ''
          const gstNumber = user?.companyGST || ''
          const panNumber = user?.panNumber || ''
          const supportPhone = pickupDetails?.phone || user?.supportPhone || ''
          const supportEmail = user?.supportEmail || prefs?.supportEmail || ''

          // ✅ COD-safe invoice amount
          const invoiceAmount =
            Number(order.order_amount ?? 0) +
            Number(order.shipping_charges ?? 0) +
            Number(order.gift_wrap ?? 0) +
            Number(order.transaction_fee ?? 0) -
            (Number(order.discount ?? 0) + Number(order.prepaid_amount ?? 0))

          // Generate invoice PDF
          const invoiceBuffer = await generateInvoicePDF({
            invoiceNumber,
            invoiceDate: invoiceDateDisplay,
            invoiceAmount,
            buyerName: order.buyer_name,
            buyerPhone: order.buyer_phone,
            buyerEmail: order.buyer_email ?? '',
            buyerAddress: order.address,
            buyerCity: order.city,
            buyerState: order.state,
            buyerPincode: order.pincode,
            products: order.products as Product[],
            shippingCharges: Number(order.shipping_charges) ?? 0,
            giftWrap: Number(order.gift_wrap) ?? 0,
            transactionFee: Number(order.transaction_fee) ?? 0,
            discount: Number(order.discount) ?? 0,
            prepaidAmount: Number(order.prepaid_amount) ?? 0,
            courierName: order.courier_partner ?? '',
            courierId: order.courier_id?.toString() ?? '',
            logoBuffer,
            orderType: order?.order_type as 'prepaid' | 'cod',
            courierCod: order?.order_type === 'cod' ? Number(order?.cod_charges ?? 0) : 0,
            signatureBuffer,
            companyName: sellerName,
            supportEmail,
            supportPhone,
            companyGST: gstNumber,
            sellerName,
            brandName,
            sellerAddress,
            sellerStateCode,
            gstNumber,
            panNumber,
            invoiceNotes: prefs?.invoiceNotes ?? '',
            termsAndConditions: prefs?.termsAndConditions ?? '',
            orderId: order.order_number,
            awbNumber: order.awb_number ?? '',
            courierPartner: order.courier_partner ?? '',
            serviceType,
            pickupPincode: pickupPincode ?? '',
            deliveryPincode: order.pincode ?? '',
            orderDate: order.order_date ?? '',
            rtoCharges: Number((order as any).rto_charges ?? 0),
            layout: (prefs?.template as 'classic' | 'thermal') ?? 'classic',
          })

          // Upload invoice to S3
          const uploadTarget = await uploadBufferToStorage({
            buffer: invoiceBuffer,
            filename: `invoice-${order.id}.pdf`,
            contentType: 'application/pdf',
            userId: order.user_id,
            folderKey: 'invoices',
          })
          const finalKey = uploadTarget.key

          // Validate key is not empty and is a string
          if (!finalKey || typeof finalKey !== 'string' || finalKey.trim().length === 0) {
            throw new Error('Invoice key is invalid or empty after upload')
          }

          // Ensure we store only the R2 key (not a URL), even if Cloudflare returns it in URL format
          const trimmedKey = finalKey.trim()
          const normalizedInvoiceKey = normalizeToR2Key(trimmedKey) || trimmedKey

          // If normalization failed but it's not a URL, use the original key
          // (normalizeToR2Key returns null for external URLs, but our key should be valid)
          const keyToStore =
            normalizedInvoiceKey || (trimmedKey.startsWith('http') ? null : trimmedKey)

          if (!keyToStore) {
            throw new Error(`Invalid invoice key format: ${trimmedKey}`)
          }

          console.log(`📄 Invoice generated and uploaded for order ${order.order_number}:`, {
            invoice_key: keyToStore,
            storage_key: keyToStore,
            invoice_size: invoiceBuffer.length,
          })

          // Update order with manifest + invoice (local manifest only)
          // Ensure we store R2 key, not a full URL
          await tx
            .update(table)
            .set({
              invoice_link: keyToStore,
              invoice_number: invoiceNumber,
              invoice_date: invoiceDateStored,
              invoice_amount: invoiceAmount,
              order_status: 'pickup_initiated',
              updated_at: new Date(),
            })
            .where(eq(table.id, order.id))

          console.log(
            `✅ Invoice link saved to database for order ${order.order_number}: ${finalKey}`,
          )

          // 🖨️ Generate label if it doesn't exist and order has AWB
          await sendTaxInvoiceGeneratedEmail({
            order,
            invoiceNumber,
            invoiceDate: invoiceDateStored,
            invoiceAmount,
            invoiceKey: keyToStore,
          }).catch((emailErr: any) => {
            console.error(`Failed to send tax invoice email for ${order.order_number}:`, emailErr)
          })

          if (!order.label && order.awb_number) {
            try {
              console.log(
                `🖨️ Generating label for order ${order.order_number} during manifest (AWB: ${order.awb_number})`,
              )
              const labelKey = await generateLabelForOrder(order, order.user_id, tx)

              // Validate and save label if generated
              // Ensure we store R2 key, not a full URL
              if (labelKey && typeof labelKey === 'string' && labelKey.trim().length > 0) {
                const normalizedLabelKey = normalizeToR2Key(labelKey.trim())
                if (normalizedLabelKey) {
                  await tx
                    .update(table)
                    .set({
                      label: normalizedLabelKey,
                      updated_at: new Date(),
                    })
                    .where(eq(table.id, order.id))

                  console.log(
                    `✅ Label generated and saved for order ${order.order_number} during manifest: ${normalizedLabelKey}`,
                  )
                } else {
                  console.warn(
                    `⚠️ Could not normalize label key for order ${
                      order.order_number
                    }: ${labelKey.trim()}`,
                  )
                }
              } else {
                console.warn(
                  `⚠️ Label generation returned invalid value for order ${order.order_number} during manifest`,
                )
              }
            } catch (labelErr: any) {
              console.error(
                `❌ Failed to generate label for order ${order.order_number} during manifest:`,
                labelErr?.message || labelErr,
              )
              // Don't throw - continue with manifest generation even if label fails
            }
          } else if (!order.label) {
            console.warn(
              `⚠️ Cannot generate label for order ${order.order_number}: AWB number is missing`,
            )
          } else if (order.label) {
            // Ensure existing label is preserved and properly formatted
            const existingLabel = order.label
            if (typeof existingLabel === 'string' && existingLabel.trim().length > 0) {
              await tx
                .update(table)
                .set({
                  label: existingLabel.trim(),
                  updated_at: new Date(),
                })
                .where(eq(table.id, order.id))
            }
          } else {
            console.log(`ℹ️ Label already exists for order ${order.order_number}: ${order.label}`)
          }
        }

        // When using local manifest generation, just resolve and return a pseudo key as manifest info.
        const manifestKey = `manifest-invoice`
        const manifestDownloadUrl = await resolveManifestUrl(manifestKey)

        return {
          manifest_id: manifestKey,
          manifest_url: manifestDownloadUrl,
          manifest_key: manifestKey,
        }
      } catch (error: any) {
        if (error?.isPickupRequestError === true) {
          const pickupErrorMessage = getUserFacingManifestError(error)
          if (params.type === 'b2c') {
            await persistPickupFailureForOrders({
              orderIds: manifestFailureOrderIds,
              pickupError: pickupErrorMessage,
            })
          }
          await notifyAdminsForProviderBalanceIssue({
            orders: fetchedOrdersForLogging,
            errorMessage: pickupErrorMessage,
            courierPartner: integrationType || 'Delhivery',
            contextLabel: 'Pickup request',
          })
        }
        logManifestGenerationError(error, {
          requestId: params.requestId,
          source: params.source,
          type: params.type,
          userId: params.userId,
          integrationType: typeof integrationType === 'string' ? integrationType : undefined,
          manifestRefs: normalizedRefs,
          manifestFailureOrderIds,
          fetchedOrders: fetchedOrdersForLogging,
        })
        if (manifestFailureOrderIds.length > 0) {
          const manifestErrorMessage = getUserFacingManifestError(error)
          await Promise.allSettled(
            manifestFailureOrderIds.map((orderId) =>
              refundManifestFailureChargeOnce({
                orderId,
                manifestErrorMessage,
              }),
            ),
          )
        }
        if (error instanceof HttpError) {
          throw error
        }
        throw new HttpError(getErrorStatusCode(error, 500), getUserFacingManifestError(error))
      }
    },
  )
}

export const retryFailedManifestService = async (
  orderId: string,
  userId: string,
): Promise<{
  manifest_id: string | null
  manifest_url: string | null
  manifest_key: string | null
  retry_count: number | null
  retries_remaining: number | null
  order_status: string | null
  retry_action: 'manifest_generation' | 'pickup_request'
}> => {
  const [order] = await db
    .select({
      id: b2c_orders.id,
      user_id: b2c_orders.user_id,
      order_number: b2c_orders.order_number,
      awb_number: b2c_orders.awb_number,
      order_status: b2c_orders.order_status,
      integration_type: b2c_orders.integration_type,
      manifest_retry_count: b2c_orders.manifest_retry_count,
      manifest_error: b2c_orders.manifest_error,
      pickup_error: b2c_orders.pickup_error,
      pickup_status: b2c_orders.pickup_status,
      pickup_details: b2c_orders.pickup_details,
      manifest: b2c_orders.manifest,
    })
    .from(b2c_orders)
    .where(and(eq(b2c_orders.id, orderId), eq(b2c_orders.user_id, userId)))
    .limit(1)

  if (!order) {
    throw new HttpError(404, 'Order not found.')
  }

  const retryablePickupFailure = isRetryablePickupStepFailure(order)
  const retryableManifestFailure = isRetryableManifestStepFailure(order)

  if (!retryablePickupFailure && !retryableManifestFailure) {
    throw new HttpError(
      400,
      'Retry is available only for orders that failed on the current next provider step.',
    )
  }

  const currentRetryCount = Number(order.manifest_retry_count ?? 0)
  if (currentRetryCount >= MAX_MANIFEST_RETRY_ATTEMPTS) {
    throw new HttpError(
      409,
      `Retry limit reached for order ${order.order_number}. You can retry this provider step only ${MAX_MANIFEST_RETRY_ATTEMPTS} times.`,
    )
  }

  const nextRetryCount = currentRetryCount + 1
  await db
    .update(b2c_orders)
    .set({
      manifest_retry_count: nextRetryCount,
      manifest_last_retry_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(b2c_orders.id, order.id))

  if (retryablePickupFailure) {
    return retryDelhiveryPickupRequestForOrder({
      ...order,
      manifest_retry_count: nextRetryCount,
    })
  }

  try {
    const manifestResult = await generateManifestService({
      awbs: [order.order_number],
      type: 'b2c',
      userId,
      source: 'retryFailedManifestService',
    })

    await db
      .update(b2c_orders)
      .set({
        manifest_error: null,
        pickup_error: null,
        pickup_status: 'pickup_initiated',
        updated_at: new Date(),
      })
      .where(eq(b2c_orders.id, order.id))

    const [updatedOrder] = await db
      .select({
        order_status: b2c_orders.order_status,
        manifest_retry_count: b2c_orders.manifest_retry_count,
      })
      .from(b2c_orders)
      .where(eq(b2c_orders.id, order.id))
      .limit(1)

    const retryCount = Number(updatedOrder?.manifest_retry_count ?? nextRetryCount)

    return {
      ...manifestResult,
      retry_count: retryCount,
      retries_remaining: Math.max(0, MAX_MANIFEST_RETRY_ATTEMPTS - retryCount),
      order_status: updatedOrder?.order_status ?? null,
      retry_action: 'manifest_generation',
    }
  } catch (error: any) {
    const manifestErrorMessage = getUserFacingManifestError(error)

    if (error?.isPickupRequestError === true) {
      await db
        .update(b2c_orders)
        .set({
          order_status: 'shipment_created',
          manifest_error: null,
          pickup_error: truncateColumnValue(manifestErrorMessage),
          pickup_status: 'failed',
          updated_at: new Date(),
        })
        .where(eq(b2c_orders.id, order.id))
    } else {
      await db
        .update(b2c_orders)
        .set({
          order_status: 'manifest_failed',
          manifest_error: truncateColumnValue(manifestErrorMessage),
          updated_at: new Date(),
        })
        .where(eq(b2c_orders.id, order.id))
    }

    throw new HttpError(getErrorStatusCode(error, 500), manifestErrorMessage)
  }
}

// export const generateAndSaveManifestService = async (params: GenerateManifestParams) => {
//   console.log('PARAMS!!!', params)
//   const { awbs } = params

//   if (!awbs || awbs?.length === 0) {
//     throw new Error('No AWBs provided')
//   }

//   try {
//     const result = await db.transaction(async (tx) => {
//       // 1️⃣ Generate manifest
//       const manifestData = await generateManifestService({ awbs })

//       // 2️⃣ Update all local orders with manifest_id
//       // const updatedOrders = await Promise.all(
//       //   awbs.map(async (awb) => {
//       //     const [updated] = await tx
//       //       .update(b2c_orders)
//       //       .set({
//       //         manifest: manifestData.manifest_id,
//       //         order_status: 'pickup_scheduled', // optional: move status to next step
//       //         updated_at: new Date(),
//       //       })
//       //       .where(eq(b2c_orders.awb_number, awb))
//       //       .returning({ id: b2c_orders.id, awb_number: b2c_orders.awb_number })

//       //     return updated
//       //   }),
//       // )

//       return {
//         // manifestData,
//         // updatedOrders,
//       }
//     })

//     console.log('Manifest generated and orders updated:', result)
//     return result
//   } catch (error: any) {
//     console.error('Error generating or saving manifest:', error.message)
//     throw new Error(`Failed to generate/save manifest: ${error.message}`)
//   }
// }

export interface PaginationParams {
  page?: number
  limit?: number
}

export interface IOrderFilters {
  status?: string
  fromDate?: string
  toDate?: string
  search?: string
  userId?: string
  sortBy?: 'created_at'
  sortOrder?: 'asc' | 'desc'
}
export const getAllOrdersService = async (
  userId: string,
  {
    page = 1,
    limit = 10,
    filters = {} as IOrderFilters,
  }: PaginationParams & { filters?: IOrderFilters },
) => {
  const { sanitizeOrdersForCustomer } = await import('../../utils/orderSanitizer')
  const { orders, totalCount, totalPages } = await fetchCombinedOrdersPage({
    page,
    limit,
    filters: {
      userId,
      status: filters.status,
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      search: filters.search,
      sortOrder: filters.sortOrder,
    },
  })

  const sanitizedOrders = await sanitizeOrdersForCustomer(orders)

  return {
    orders: sanitizedOrders,
    totalCount,
    totalPages,
  }
}

type TrackingHistoryItem = {
  status_code: string
  location: string
  event_time: string
  message: string
}

interface TrackingServiceResponse {
  id: string
  order_id: string | null
  order_number: string
  awb_number: string
  courier_name: string
  status: string
  edd: string | null
  history: TrackingHistoryItem[]
  payment_type: string
  shipment_info: string | null
}

type ProviderNormalizedTracking = {
  history: TrackingHistoryItem[]
  status?: string
  edd?: string | null
  courier_name?: string | null
  shipment_info?: string | null
}

type OrderSummary = {
  id: string
  user_id: string
  source_type: 'b2c' | 'b2b'
  order_id: string | null
  order_number: string
  integration_type: string | null
  courier_partner: string | null
  courier_id: number | null
  provider_reference?: string | null
  provider_request_id?: string | null
  provider_service?: string | null
  provider_meta?: any
  awb_number: string
  order_status: string | null
  edd: string | null
  order_type: string | null
  shipment_id: string | null
  delivery_message: string | null
  created_at: Date | null
  updated_at: Date | null
}

const sanitizeString = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) return fallback
  const str = String(value).trim()
  return str || fallback
}

const formatTrackingLocation = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'object') return sanitizeString(value)

  if (Array.isArray(value)) {
    return Array.from(
      new Set(value.map((entry) => formatTrackingLocation(entry)).filter(Boolean)),
    ).join(', ')
  }

  const location = value as Record<string, unknown>
  const parts = [
    location.name,
    location.locationName,
    location.hubName,
    location.city,
    location.stateOrRegion,
    location.state,
    location.region,
    location.postalCode,
    location.pincode,
    location.countryCode,
    location.country,
  ]
    .map((entry) => sanitizeString(entry))
    .filter(Boolean)

  return Array.from(new Set(parts)).join(', ')
}

const toIsoString = (value: unknown, fallback?: string): string => {
  if (value) {
    const date = value instanceof Date ? value : new Date(value as string)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }
  if (fallback) return fallback
  return new Date().toISOString()
}

const pushHistoryEvent = (
  history: TrackingHistoryItem[],
  params: { statusCode?: unknown; message?: unknown; location?: unknown; time?: unknown },
  fallbackTime?: string,
) => {
  const statusCodeCandidate = sanitizeString(params.statusCode)
  const messageCandidate = sanitizeString(params.message)
  const message = messageCandidate || statusCodeCandidate || 'Status Update'
  const statusCode = statusCodeCandidate || message
  history.push({
    status_code: statusCode,
    location: formatTrackingLocation(params.location),
    event_time: toIsoString(params.time, fallbackTime),
    message,
  })
}

const sortHistoryDescending = (history: TrackingHistoryItem[]) => {
  history.sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime())
}

const mapDelhiveryTracking = (raw: any, order: OrderSummary): ProviderNormalizedTracking => {
  const history: TrackingHistoryItem[] = []
  const shipmentWrapper = Array.isArray(raw?.ShipmentData)
    ? raw?.ShipmentData?.[0]
    : (raw?.ShipmentData ?? raw)
  const shipment = shipmentWrapper?.Shipment ?? shipmentWrapper ?? {}
  const statusObj = shipment?.Status ?? shipment?.status ?? {}

  const scans = shipment?.Scans
  if (Array.isArray(scans)) {
    scans.forEach((scanEntry: any) => {
      const detail = scanEntry?.ScanDetail ?? scanEntry
      if (detail) {
        pushHistoryEvent(history, {
          statusCode: detail?.ScanType ?? detail?.StatusCode ?? detail?.Status,
          message: detail?.ScanStatus ?? detail?.Status ?? detail?.Instructions ?? detail?.Remarks,
          location: detail?.ScanLocation ?? detail?.Location,
          time: parseDelhiveryTrackingTimestamp(
            detail?.ScanDateTime ?? detail?.ScanDate ?? detail?.ScanTime,
          ),
        })
      }
    })
  } else if (scans?.ScanDetail) {
    const scanDetails = Array.isArray(scans.ScanDetail) ? scans.ScanDetail : [scans.ScanDetail]
    scanDetails.forEach((detail: any) => {
      pushHistoryEvent(history, {
        statusCode: detail?.ScanType ?? detail?.StatusCode ?? detail?.Status,
        message: detail?.ScanStatus ?? detail?.Status ?? detail?.Instructions ?? detail?.Remarks,
        location: detail?.ScanLocation ?? detail?.Location,
        time: parseDelhiveryTrackingTimestamp(
          detail?.ScanDateTime ?? detail?.ScanDate ?? detail?.ScanTime,
        ),
      })
    })
  }

  if (Object.keys(statusObj).length) {
    pushHistoryEvent(history, {
      statusCode: statusObj?.StatusCode ?? statusObj?.Status,
      message: statusObj?.Status ?? statusObj?.StatusType ?? statusObj?.StatusAction,
      location: statusObj?.StatusLocation ?? statusObj?.StatusLocationName,
      time: parseDelhiveryTrackingTimestamp(statusObj?.StatusDateTime ?? statusObj?.StatusDate),
    })
  }

  const status = sanitizeString(
    statusObj?.Status ?? history[0]?.message ?? order.order_status,
    order.order_status ?? 'In Transit',
  )

  const eddString = sanitizeString(shipment?.ExpectedDeliveryDate ?? shipment?.EDD ?? '')

  const shipmentInfo = sanitizeString(
    statusObj?.Instructions ?? shipment?.Instructions ?? shipment?.Remarks ?? '',
  )

  return {
    history,
    status,
    edd: eddString || undefined,
    shipment_info: shipmentInfo || undefined,
    courier_name: 'Delhivery',
  }
}

const mapDelhiveryB2BTracking = (raw: any, order: OrderSummary): ProviderNormalizedTracking => {
  const history: TrackingHistoryItem[] = []
  const payload = raw?.data || raw || {}
  const eventsValue =
    findProviderValue(payload, [
      'history',
      'tracking_history',
      'tracking_events',
      'events',
      'scans',
    ]) || []
  const events = Array.isArray(eventsValue) ? eventsValue : [eventsValue]

  events.forEach((entry: any) => {
    if (!entry || typeof entry !== 'object') return
    pushHistoryEvent(history, {
      statusCode: entry.status_code || entry.status || entry.state || entry.scan_type,
      message: entry.status_name || entry.status || entry.state || entry.remarks || entry.message,
      location: entry.location || entry.current_location || entry.scan_location || entry.center,
      time:
        entry.status_time ||
        entry.event_time ||
        entry.timestamp ||
        entry.updated_at ||
        entry.created_at,
    })
  })

  const status = sanitizeString(
    findProviderValue(payload, [
      'current_status',
      'latest_status',
      'status_name',
      'status',
      'state',
    ]),
    order.order_status || 'In Transit',
  )
  if (!history.length) {
    pushHistoryEvent(history, {
      statusCode: status,
      message: status,
      location: findProviderValue(payload, ['current_location', 'location', 'center']),
      time: findProviderValue(payload, ['updated_at', 'status_time', 'timestamp']),
    })
  }

  sortHistoryDescending(history)
  return {
    history,
    status,
    edd:
      sanitizeString(
        findProviderValue(payload, ['expected_delivery_date', 'estimated_delivery_date', 'edd']),
      ) || undefined,
    shipment_info:
      sanitizeString(findProviderValue(payload, ['remarks', 'message', 'description'])) ||
      undefined,
    courier_name: 'Delhivery B2B',
  }
}

const mapShadowfaxTracking = (raw: any, order: OrderSummary): ProviderNormalizedTracking => {
  const history: TrackingHistoryItem[] = []
  const payload = raw?.data || raw
  const orderDetails = payload?.order_details || raw?.order_details || {}
  const normalizeHistoryRows = (value: unknown): any[] => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') return [value]
    return []
  }
  const stateHistory =
    payload?.pickup_request_state_histories ||
    payload?.state_histories ||
    payload?.tracking_data ||
    payload?.tracking_details ||
    raw?.tracking_details ||
    payload?.history ||
    []

  const historyRows = normalizeHistoryRows(stateHistory)
  if (historyRows.length) {
    historyRows.forEach((entry: any) => {
      pushHistoryEvent(history, {
        statusCode: entry?.status_id || entry?.event || entry?.status || entry?.state,
        message:
          entry?.remarks ||
          entry?.comment ||
          entry?.status_display ||
          entry?.status ||
          entry?.state,
        location: entry?.current_location || entry?.location,
        time: entry?.created || entry?.created_at || entry?.event_timestamp || entry?.updated_at,
      })
    })
  }

  const currentStatus = sanitizeString(
    payload?.status ||
      payload?.current_status ||
      payload?.event ||
      orderDetails?.status_display ||
      orderDetails?.status ||
      history[0]?.message ||
      order.order_status,
    order.order_status || 'In Transit',
  )

  return {
    history,
    status: currentStatus,
    courier_name: 'Shadowfax',
    shipment_info:
      sanitizeString(
        payload?.message ||
          payload?.comments ||
          orderDetails?.status_display ||
          orderDetails?.customer_track_url ||
          '',
        '',
      ) || undefined,
  }
}

const mapAfterShipTracking = (raw: any, order: OrderSummary): ProviderNormalizedTracking => {
  const history: TrackingHistoryItem[] = []
  const tracking = raw?.data?.tracking || raw?.tracking || raw?.data || raw || {}
  const checkpoints = Array.isArray(tracking?.checkpoints) ? tracking.checkpoints : []

  checkpoints.forEach((checkpoint: any) => {
    const locationParts = [
      checkpoint?.city,
      checkpoint?.state,
      checkpoint?.country_name,
      checkpoint?.country_iso3,
    ]
      .map((value) => sanitizeString(value))
      .filter(Boolean)

    pushHistoryEvent(history, {
      statusCode:
        checkpoint?.subtag ||
        checkpoint?.tag ||
        checkpoint?.checkpoint_status ||
        checkpoint?.slug ||
        tracking?.tag,
      message:
        checkpoint?.message ||
        checkpoint?.subtag_message ||
        checkpoint?.checkpoint_message ||
        checkpoint?.tag ||
        tracking?.subtag_message ||
        tracking?.tag,
      location: checkpoint?.location || locationParts.join(', '),
      time:
        checkpoint?.checkpoint_time ||
        checkpoint?.event_time ||
        checkpoint?.created_at ||
        checkpoint?.updated_at,
    })
  })

  return {
    history,
    status: sanitizeString(
      tracking?.subtag_message || tracking?.tag || tracking?.subtag || order.order_status,
      order.order_status || 'In Transit',
    ),
    courier_name: 'Shadowfax',
    edd:
      sanitizeString(
        tracking?.expected_delivery ||
          tracking?.aftership_estimated_delivery_date ||
          tracking?.order_promised_delivery_date ||
          '',
      ) || undefined,
    shipment_info:
      sanitizeString(
        tracking?.subtag_message ||
          tracking?.shipment_type ||
          tracking?.courier_tracking_link ||
          '',
        '',
      ) || undefined,
  }
}

const mapAmazonTracking = (raw: any, order: OrderSummary): ProviderNormalizedTracking => {
  const history: TrackingHistoryItem[] = []
  const payload = raw?.payload || raw?.data?.payload || raw?.data || raw || {}
  const summary = payload?.summary || payload?.trackingSummary || payload?.packageStatus || {}
  const events =
    payload?.eventHistory ||
    payload?.trackingEvents ||
    payload?.events ||
    payload?.eventDetails ||
    payload?.packageStatusHistory ||
    []

  if (Array.isArray(events)) {
    events.forEach((entry: any) => {
      pushHistoryEvent(history, {
        statusCode:
          entry?.eventCode ||
          entry?.statusCode ||
          entry?.status ||
          entry?.eventType ||
          entry?.event,
        message:
          entry?.eventDescription ||
          entry?.statusDescription ||
          entry?.status ||
          entry?.message ||
          entry?.event,
        location:
          entry?.location?.city ||
          entry?.location?.postalCode ||
          entry?.eventLocation ||
          entry?.location,
        time:
          entry?.eventTime ||
          entry?.eventDate ||
          entry?.timestamp ||
          entry?.eventTimestamp ||
          entry?.updatedAt,
      })
    })
  }

  const status = sanitizeString(
    summary?.statusDescription ||
      summary?.status ||
      payload?.statusDescription ||
      payload?.status ||
      history[0]?.message ||
      order.order_status,
    order.order_status || 'In Transit',
  )

  return {
    history,
    status,
    courier_name: 'Amazon Shipping',
    edd: sanitizeString(
      summary?.promisedDeliveryDate ||
        summary?.estimatedDeliveryDate ||
        payload?.promisedDeliveryDate ||
        payload?.estimatedDeliveryDate ||
        '',
    ) || undefined,
    shipment_info:
      sanitizeString(summary?.message || payload?.message || payload?.latestEventDescription || '', '') ||
      undefined,
  }
}

const mapXpressbeesTracking = (raw: any, order: OrderSummary): ProviderNormalizedTracking => {
  const history: TrackingHistoryItem[] = []
  const payload = raw?.data || raw?.payload || raw || {}
  const parseXpressbeesTime = (value: unknown) => {
    const normalized = sanitizeString(value)
    const match = normalized.match(
      /^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/,
    )
    if (!match) return value
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = match
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    )
  }
  const rawEvents =
    payload?.ShipmentLogDetails ||
    payload?.ShipmentStatusDetails ||
    payload?.CurrentShipmentStatus ||
    payload?.currentShipmentStatus ||
    payload?.history ||
    payload?.tracking_history ||
    payload?.trackingHistory ||
    payload?.events ||
    payload?.scans ||
    []
  const events =
    Array.isArray(rawEvents) || rawEvents == null
      ? rawEvents
      : typeof rawEvents === 'object'
        ? [rawEvents]
        : []

  if (Array.isArray(events)) {
    events.forEach((entry: any) => {
      pushHistoryEvent(history, {
        statusCode:
          entry?.status_code ||
          entry?.statusCode ||
          entry?.ShipmentStatus ||
          entry?.status ||
          entry?.scan_code ||
          entry?.scanCode,
        message:
          entry?.message ||
          entry?.Description ||
          entry?.Process ||
          entry?.status ||
          entry?.scan ||
          entry?.remarks ||
          entry?.description ||
          entry?.event,
        location:
          entry?.location ||
          entry?.current_location ||
          entry?.scan_location ||
          entry?.HubLocation ||
          [entry?.City, entry?.State].filter(Boolean).join(', '),
        time: parseXpressbeesTime(
          entry?.event_time ||
            entry?.eventTime ||
            entry?.ShipmentStatusDateTime ||
            entry?.created_at ||
            entry?.timestamp,
        ),
      })
    })
  }

  const status = sanitizeString(
    payload?.status ||
      payload?.ShipmentStatus ||
      payload?.CurrentStatus ||
      payload?.currentStatus ||
      payload?.current_status ||
      payload?.shipment_status ||
      history[0]?.status_code ||
      history[0]?.message ||
      order.order_status,
    order.order_status || 'In Transit',
  )

  return {
    history,
    status,
    courier_name: sanitizeString(payload?.courier_name, 'Xpressbees'),
    edd: sanitizeString(payload?.edd || payload?.expected_delivery_date || payload?.expectedDeliveryDate || '') || undefined,
    shipment_info:
      sanitizeString(payload?.shipment_info || payload?.additional_info || payload?.message || '', '') ||
      undefined,
  }
}

const mapEkartTracking = (raw: any, order: OrderSummary): ProviderNormalizedTracking => {
  const history: TrackingHistoryItem[] = []
  const payload = raw?.data || raw?.payload || raw || {}
  const track = payload?.track || payload?.tracking || payload?.track_updated || payload
  const normalizeRows = (value: unknown): any[] => {
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') return [value]
    return []
  }

  const rawEvents =
    track?.details ||
    track?.history ||
    track?.tracking_history ||
    track?.events ||
    track?.scans ||
    payload?.history ||
    payload?.tracking_history ||
    payload?.events ||
    payload?.scans ||
    []

  normalizeRows(rawEvents).forEach((entry: any) => {
    pushHistoryEvent(history, {
      statusCode:
        entry?.status ||
        entry?.current_status ||
        entry?.event ||
        entry?.status_text ||
        entry?.scan_status,
      message:
        entry?.desc ||
        entry?.description ||
        entry?.remarks ||
        entry?.message ||
        entry?.status ||
        entry?.event,
      location:
        entry?.location ||
        entry?.current_location ||
        entry?.scan_location ||
        entry?.hub ||
        entry?.city,
      time:
        entry?.ctime ||
        entry?.created_at ||
        entry?.event_time ||
        entry?.eventTime ||
        entry?.timestamp ||
        entry?.updated_at,
    })
  })

  const status = sanitizeString(
    track?.status ||
      track?.current_status ||
      payload?.status ||
      payload?.current_status ||
      history[0]?.status_code ||
      history[0]?.message ||
      order.order_status,
    order.order_status || 'In Transit',
  )
  const description = sanitizeString(
    track?.desc ||
      track?.description ||
      payload?.desc ||
      payload?.description ||
      track?.ndrStatus ||
      payload?.ndrStatus ||
      '',
    '',
  )
  const currentLocation =
    sanitizeString(
      track?.location ||
        track?.current_location ||
        payload?.location ||
        payload?.current_location ||
        '',
      '',
    ) || undefined
  const currentTime =
    track?.ctime ||
    track?.pickupTime ||
    payload?.ctime ||
    payload?.pickupTime ||
    payload?.updated_at ||
    payload?.created_at

  if (status || description || currentLocation) {
    pushHistoryEvent(history, {
      statusCode: status,
      message: description || status,
      location: currentLocation,
      time: currentTime,
    })
  }

  const eddValue = payload?.edd || track?.edd || payload?.estimated_delivery_date || track?.estimated_delivery_date

  return {
    history,
    status,
    courier_name: 'Ekart Logistics',
    edd: eddValue ? toIsoString(eddValue) : undefined,
    shipment_info: description || undefined,
  }
}

const mapInnofulfillTracking = (raw: any, order: OrderSummary): ProviderNormalizedTracking => {
  const history: TrackingHistoryItem[] = []
  const payload = raw?.data || raw?.payload || raw || {}
  const tracking = payload?.tracking || payload?.trackingDetails || payload
  const rawEvents =
    findProviderValue(tracking, ['tracking_history', 'trackingHistory', 'history', 'events', 'scans']) ||
    []
  const events = Array.isArray(rawEvents)
    ? rawEvents
    : rawEvents && typeof rawEvents === 'object'
      ? [rawEvents]
      : []

  events.forEach((entry: any) => {
    pushHistoryEvent(history, {
      statusCode:
        entry?.status_code ||
        entry?.statusCode ||
        entry?.scanCode ||
        entry?.eventCode ||
        entry?.status ||
        entry?.event,
      message:
        entry?.message ||
        entry?.description ||
        entry?.remarks ||
        entry?.statusDescription ||
        entry?.status ||
        entry?.event,
      location:
        entry?.location ||
        entry?.current_location ||
        entry?.scan_location ||
        entry?.hub ||
        entry?.city,
      time:
        entry?.event_time ||
        entry?.eventTime ||
        entry?.scan_time ||
        entry?.timestamp ||
        entry?.updated_at ||
        entry?.created_at,
    })
  })

  const status = sanitizeString(
    findProviderValue(tracking, [
      'current_status',
      'currentStatus',
      'shipment_status',
      'shipmentStatus',
      'status',
      'state',
    ]) ||
      history[0]?.message ||
      order.order_status,
    order.order_status || 'In Transit',
  )

  if (!history.length) {
    pushHistoryEvent(history, {
      statusCode: status,
      message: status,
      location: findProviderValue(tracking, ['current_location', 'currentLocation', 'location']),
      time: findProviderValue(tracking, ['updated_at', 'updatedAt', 'timestamp']),
    })
  }

  sortHistoryDescending(history)
  return {
    history,
    status,
    courier_name: sanitizeString(
      findProviderValue(payload, ['carrierDisplayName', 'carrierName', 'courier_name']),
      'Innofulfill',
    ),
    edd:
      sanitizeString(
        findProviderValue(payload, [
          'expected_delivery_date',
          'expectedDeliveryDate',
          'estimatedDeliveryDate',
          'edd',
        ]),
      ) || undefined,
    shipment_info:
      sanitizeString(findProviderValue(payload, ['message', 'description', 'remarks'])) ||
      undefined,
  }
}

const normalizeLiveTrackingStatusText = (value: unknown) =>
  sanitizeString(value)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const normalizeInternalTrackingStatus = (value: unknown, fallback = '') =>
  normalizeLiveTrackingStatusText(value).replace(/\s+/g, '_') || fallback

const normalizeTrackingStatusCode = (value: unknown) =>
  sanitizeString(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const hasTrackingStatusToken = (status: string, token: string) =>
  new RegExp(`(^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(status)

const DELHIVERY_TRACKING_NDR_STATUS_CODES = new Set([
  'EOD-3',
  'EOD-6',
  'EOD-11',
  'EOD-15',
  'EOD-16',
  'EOD-43',
  'EOD-69',
  'EOD-74',
  'EOD-86',
  'EOD-104',
  'ST-108',
])

const normalizeDelhiveryTrackingStatusCode = (value: unknown) =>
  sanitizeString(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const hasDelhiveryTrackingNdrStatusCode = (...parts: unknown[]) =>
  parts.some((part) =>
    DELHIVERY_TRACKING_NDR_STATUS_CODES.has(normalizeDelhiveryTrackingStatusCode(part)),
  )

const hasLiveTrackingNdrSignal = (...parts: unknown[]) => {
  const status = normalizeLiveTrackingStatusText(parts.map((part) => sanitizeString(part)).join(' '))
  if (!status) return hasDelhiveryTrackingNdrStatusCode(...parts)

  return (
    hasDelhiveryTrackingNdrStatusCode(...parts) ||
    status.includes('ndr') ||
    status.includes('undeliver') ||
    status.includes('unsuccessful delivery') ||
    status.includes('not delivered') ||
    status.includes('attempt') ||
    status.includes('reattempt') ||
    status.includes('customer not available') ||
    status.includes('customer unavailable') ||
    status.includes('consignee not available') ||
    status.includes('consignee unavailable') ||
    status.includes('not contactable') ||
    status.includes('door locked') ||
    status.includes('address issue') ||
    status.includes('refused') ||
    status.includes('rejected') ||
    status.includes('failed') ||
    hasTrackingStatusToken(status, 'nc') ||
    hasTrackingStatusToken(status, 'na')
  )
}

const findLiveTrackingNdrEvent = (
  tracking: Pick<TrackingServiceResponse, 'history' | 'status' | 'shipment_info'>,
) => {
  const historyMatch = (tracking.history || []).find((event) =>
    hasLiveTrackingNdrSignal(event.status_code, event.message),
  )
  if (historyMatch) return historyMatch

  if (hasLiveTrackingNdrSignal(tracking.status, tracking.shipment_info)) {
    const now = new Date().toISOString()
    return {
      status_code: sanitizeString(tracking.status, 'ndr'),
      message: sanitizeString(tracking.shipment_info || tracking.status, 'NDR'),
      location: '',
      event_time: now,
    }
  }

  return null
}

const isSameTrackingHistoryEvent = (
  first?: TrackingHistoryItem | null,
  second?: TrackingHistoryItem | null,
) => {
  if (!first || !second) return false
  return (
    first.status_code === second.status_code &&
    first.message === second.message &&
    first.event_time === second.event_time
  )
}

const mapProviderTrackingCodeToInternal = (
  rawStatus: unknown,
  providerKey: string,
): string | null => {
  const code = normalizeTrackingStatusCode(rawStatus)
  const provider = normalizeTrackingStatusCode(providerKey)
  if (!code) return null

  const commonCodeMap: Record<string, string> = {
    can: 'cancelled',
    cancel: 'cancelled',
    cancelled: 'cancelled',
    canceled: 'cancelled',
    cncl: 'cancelled',
    ofd: 'out_for_delivery',
    out_for_delivery: 'out_for_delivery',
    dl: 'delivered',
    del: 'delivered',
    dlvd: 'delivered',
    delivered: 'delivered',
    ndr: 'ndr',
    nd: 'ndr',
    undelivered: 'ndr',
    attempted: 'ndr',
    lost: 'lost',
    rto_d: 'rto_delivered',
    rts_d: 'rto_delivered',
    rtd: 'rto_delivered',
    rtod: 'rto_delivered',
    rto_delivered: 'rto_delivered',
    rto_it: 'rto_in_transit',
    rto_ofd: 'rto_in_transit',
    rts_in_process: 'rto_in_transit',
    rts_ofd: 'rto_in_transit',
    rto_in_transit: 'rto_in_transit',
    rto: 'rto',
    rts: 'rto',
  }

  const providerCodeMap: Record<string, Record<string, string>> = {
    delhivery: {
      ud: 'in_transit',
      rt: 'rto_in_transit',
      pp: 'pickup_initiated',
      pu: 'in_transit',
      cn: 'cancelled',
    },
    xpressbees: {
      manifest: 'pickup_initiated',
      manifested: 'pickup_initiated',
      drc: 'pickup_initiated',
      pnd: 'pickup_initiated',
      pck: 'pickup_initiated',
      pku: 'pickup_initiated',
      pkd: 'pickup_initiated',
      picked: 'pickup_initiated',
      pickup: 'pickup_initiated',
      it: 'in_transit',
      itran: 'in_transit',
      rad: 'in_transit',
      reached_at_destination: 'in_transit',
      bagged: 'in_transit',
      dispatched: 'in_transit',
      ship: 'in_transit',
      shipped: 'in_transit',
      dlex: 'ndr',
      ud: 'ndr',
    },
    ekart: {
      order_placed: 'booked',
      consignment_manifested: 'pickup_initiated',
      manifested: 'pickup_initiated',
      pickup_scheduled: 'pickup_initiated',
      pickup_requested: 'pickup_initiated',
      picked: 'pickup_initiated',
      shipped: 'in_transit',
      dispatched: 'in_transit',
    },
    shadowfax: {
      new: 'booked',
      assigned_for_seller_pickup: 'pickup_initiated',
      assigned_for_pickup: 'pickup_initiated',
      ofp: 'pickup_initiated',
      picked: 'pickup_initiated',
      received_from_client_warehouse: 'pickup_initiated',
      recd_at_rev_hub: 'in_transit',
      item_manifested: 'in_transit',
      recd_at_fwd_dc: 'in_transit',
      recd_at_fwd_hub: 'in_transit',
      assigned_for_delivery: 'out_for_delivery',
      cid: 'ndr',
      seller_initiated_delay: 'ndr',
      seller_not_contactable: 'ndr',
      nc: 'ndr',
      na: 'ndr',
      on_hold: 'ndr',
      pickup_on_hold: 'ndr',
      pickup_not_attempted: 'ndr',
      cancelled_by_customer: 'cancelled',
      cancelled_by_seller: 'cancelled',
      item_misrouted: 'in_transit',
      pincode_updated: 'in_transit',
      returned_to_client: 'rto_delivered',
    },
    amazon: {
      pre_transit: 'pickup_initiated',
      label_created: 'pickup_initiated',
      ready_for_pickup: 'pickup_initiated',
      picked_up: 'pickup_initiated',
      in_transit: 'in_transit',
      out_for_delivery: 'out_for_delivery',
      delivery_attempted: 'ndr',
      rejected: 'ndr',
      refused: 'ndr',
      failed: 'ndr',
    },
  }

  return providerCodeMap[provider]?.[code] || commonCodeMap[code] || null
}

const preserveNonRegressiveTrackingStatus = (currentStatus: string, mappedStatus: string) => {
  const current = normalizeInternalTrackingStatus(currentStatus)
  const mapped = normalizeInternalTrackingStatus(mappedStatus)
  if (!mapped) return current || 'in_transit'

  if (
    ['cancelled', 'delivered', 'rto_delivered'].includes(current) &&
    !['cancelled', 'delivered', 'rto_delivered'].includes(mapped)
  ) {
    return current
  }

  if (current.startsWith('rto') && !mapped.startsWith('rto') && mapped !== 'cancelled') {
    return current
  }

  const rank: Record<string, number> = {
    pending: 0,
    booked: 1,
    shipment_created: 2,
    pickup_initiated: 3,
    in_transit: 4,
    out_for_delivery: 5,
    delivered: 6,
  }
  if (rank[current] !== undefined && rank[mapped] !== undefined && rank[mapped] < rank[current]) {
    return current
  }

  return mapped
}

const isXpressbeesPickupStageTrackingStatus = (status: string) =>
  Boolean(status) &&
  (
    status.includes('pending pickup') ||
    status.includes('pickup scheduled') ||
    status.includes('pickup requested') ||
    status.includes('pickup assigned') ||
    status.includes('assigned for pickup') ||
    status.includes('out for pickup') ||
    status.includes('pickup booked') ||
    status.includes('manifest') ||
    status.includes('data received') ||
    status.includes('information received') ||
    status.includes('shipment created') ||
    status.includes('shipment booked') ||
    status.includes('picked') ||
    hasTrackingStatusToken(status, 'pp') ||
    hasTrackingStatusToken(status, 'drc') ||
    hasTrackingStatusToken(status, 'pnd') ||
    hasTrackingStatusToken(status, 'pck') ||
    hasTrackingStatusToken(status, 'pku') ||
    hasTrackingStatusToken(status, 'pkd')
  )

const mapLiveTrackingStatusToInternal = (
  rawStatus: unknown,
  providerKey: string,
  currentStatus?: string | null,
  orderType?: string | null,
) => {
  const status = normalizeLiveTrackingStatusText(rawStatus)
  const current = normalizeInternalTrackingStatus(currentStatus)
  const provider = normalizeLiveTrackingStatusText(providerKey)
  const isReverseEkart =
    provider === 'ekart' && normalizeInternalTrackingStatus(orderType) === 'reverse'

  let mapped =
    current ||
    (provider === 'xpressbees'
      ? 'pickup_initiated'
      : isReverseEkart
        ? 'booked'
        : 'in_transit')
  if (!status) return mapped

  if (provider === 'delhivery') {
    const delhiveryB2BStatus = mapDelhiveryB2BTrackingStatus(rawStatus)
    if (delhiveryB2BStatus) {
      return preserveNonRegressiveTrackingStatus(current, delhiveryB2BStatus)
    }
  }

  if (
    isReverseEkart &&
    (
      status.includes('order placed') ||
      status.includes('created') ||
      status.includes('shipment created') ||
      status.includes('manifest') ||
      status.includes('manifested') ||
      status.includes('consignment manifested')
    )
  ) {
    return preserveNonRegressiveTrackingStatus(current, 'booked')
  }

  const providerCodeStatus = mapProviderTrackingCodeToInternal(rawStatus, providerKey)
  if (providerCodeStatus) {
    return preserveNonRegressiveTrackingStatus(current, providerCodeStatus)
  }

  // Delhivery and other carriers sometimes include "cancelled" in refusal /
  // reattempt messages. Those are NDR signals, not terminal cancellations.
  if (hasLiveTrackingNdrSignal(status)) mapped = 'ndr'
  else if (status.includes('cancel')) mapped = 'cancelled'
  else if (
    status.includes('rto delivered') ||
    status.includes('return delivered') ||
    status.includes('delivered to origin') ||
    status.includes('rts d') ||
    status.includes('rto d') ||
    status.includes('returned to client')
  ) mapped = 'rto_delivered'
  else if (
    status.includes('rto in transit') ||
    status.includes('rts in process') ||
    status.includes('rts ofd') ||
    status.includes('return in transit') ||
    status.includes('in transit return')
  ) mapped = 'rto_in_transit'
  else if (status.includes('rto') || status.includes('rts') || status.includes('return to origin')) {
    mapped = 'rto'
  } else if (status.includes('lost')) mapped = 'lost'
  else if (status.includes('out for delivery') || status === 'ofd' || status.includes('assigned for delivery')) {
    mapped = 'out_for_delivery'
  } else if (status.includes('delivered')) mapped = 'delivered'
  else if (
    provider === 'xpressbees' &&
    isXpressbeesPickupStageTrackingStatus(status)
  ) {
    mapped = 'pickup_initiated'
  }
  else if (
    status.includes('in transit') ||
    status.includes('item manifested') ||
    status.includes('recd') ||
    status.includes('received') ||
    status.includes('scanned') ||
    status.includes('arrived') ||
    status.includes('departed') ||
    status.includes('dispatched') ||
    status.includes('shipped') ||
    hasTrackingStatusToken(status, 'it') ||
    hasTrackingStatusToken(status, 'rad')
  ) mapped = 'in_transit'
  else if (
    status === 'new' ||
    status.includes('created') ||
    status.includes('booked') ||
    status.includes('order placed') ||
    status.includes('manifest') ||
    status.includes('pickup') ||
    status.includes('picked') ||
    status.includes('assigned for seller pickup') ||
    status.includes('assigned for pickup')
  ) {
    mapped = provider === 'shadowfax' ? 'pickup_initiated' : 'pickup_initiated'
  }

  if (
    provider === 'xpressbees' &&
    mapped === 'pickup_initiated' &&
    isXpressbeesPickupStageTrackingStatus(status) &&
    !['cancelled', 'delivered', 'rto_delivered'].includes(current) &&
    !current.startsWith('rto')
  ) {
    return 'pickup_initiated'
  }

  return preserveNonRegressiveTrackingStatus(current, mapped)
}

const trackingWebhookEventForStatus = (status: string) => {
  if (status === 'delivered') return 'order.delivered'
  if (status === 'cancelled') return 'order.cancelled'
  if (['ndr', 'undelivered', 'lost'].includes(status)) return 'order.failed'
  if (status.startsWith('rto')) return 'order.rto'
  if (['pickup_initiated', 'in_transit', 'out_for_delivery'].includes(status)) return 'order.shipped'
  return 'order.updated'
}

const notifyLiveTrackingStatusEmail = async (params: {
  order: any
  nextStatus: string
  previousStatus: string
  rawStatus?: string | null
  location?: string | null
  remarks?: string | null
}) => {
  const nextStatus = sanitizeString(params.nextStatus).toLowerCase()
  const previousStatus = sanitizeString(params.previousStatus).toLowerCase()
  if (!nextStatus) return
  if (nextStatus === previousStatus && nextStatus !== 'delivered') return

  await sendOrderStatusUpdateEmail({
    order: params.order,
    nextStatus,
    previousStatus,
    rawStatus: params.rawStatus,
    location: params.location,
    remarks: params.remarks,
    source: 'live_tracking_fetch',
  }).catch((err: any) => {
    console.error(`Failed to send live tracking status email for ${params.order?.order_number}:`, err)
  })
}

const runB2CLiveTrackingSideEffects = async ({
  order,
  nextStatus,
  previousStatus,
}: {
  order: OrderSummary
  nextStatus: string
  previousStatus: string
}) => {
  if (order.source_type !== 'b2c') return
  if (nextStatus === previousStatus && !['delivered', 'cancelled'].includes(nextStatus)) return

  const [freshOrder] = await db
    .select()
    .from(b2c_orders)
    .where(eq(b2c_orders.id, order.id))
    .limit(1)
  const syncedOrder = freshOrder || order

  if (nextStatus === 'cancelled') {
    await db.transaction(async (tx) => {
      await tx
        .update(b2c_orders)
        .set({
          pickup_status: 'cancelled',
          provider_last_status: 'cancelled',
          updated_at: new Date(),
        })
        .where(eq(b2c_orders.id, syncedOrder.id))

      const [wallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, syncedOrder.user_id))
        .limit(1)
      if (!wallet?.id) return

      const outstandingRefund = await getOrderRefundOutstanding(
        tx,
        wallet.id,
        syncedOrder.id,
        syncedOrder.order_number,
        Number((syncedOrder as any).wallet_debit_amount ?? 0),
      )
      if (outstandingRefund <= 0) return

      await createWalletTransaction({
        walletId: wallet.id,
        amount: outstandingRefund,
        type: 'credit',
        ref: syncedOrder.id,
        reason: getCancellationRefundReason(syncedOrder.order_number),
        currency: wallet.currency ?? 'INR',
        meta: {
          source: 'live_tracking_cancelled',
          order_id: syncedOrder.id,
          order_number: syncedOrder.order_number,
          awb_number: syncedOrder.awb_number,
          previous_status: previousStatus,
        },
        tx: tx as any,
      })
    })
  }

  if (nextStatus !== previousStatus) {
    if (String(syncedOrder.order_id || '').startsWith('shopify_')) {
      const { syncShopifyStatusForLocalOrder } = await import('./shopify.service')
      await syncShopifyStatusForLocalOrder(syncedOrder, db, { source: 'live-tracking' }).catch((err: any) => {
        console.warn('Shopify status sync skipped after live tracking update:', err?.message || err)
      })
    }

    if (String(syncedOrder.order_id || '').startsWith('woo_')) {
      const { syncWooCommerceStatusForLocalOrder } = await import('./woocommerce.service')
      await syncWooCommerceStatusForLocalOrder(syncedOrder, db, { source: 'live-tracking' }).catch((err: any) => {
        console.warn(
          'WooCommerce status sync skipped after live tracking update:',
          err?.message || err,
        )
      })
    }
  }

  if (nextStatus === 'delivered' && String((syncedOrder as any).order_type || '').toLowerCase() === 'cod') {
    const { createCodRemittance } = await import('./codRemittance.service')
    const remittanceOrderNumber = sanitizeString(syncedOrder.order_number, syncedOrder.id)
    const { remittance, created } = await createCodRemittance({
      orderId: syncedOrder.id,
      orderType: 'b2c',
      userId: syncedOrder.user_id,
      orderNumber: remittanceOrderNumber,
      awbNumber: syncedOrder.awb_number || undefined,
      courierPartner: syncedOrder.courier_partner || syncedOrder.integration_type || 'Courier',
      codAmount: Number((syncedOrder as any).order_amount || 0),
      codCharges: Number((syncedOrder as any).cod_charges || 0),
      freightCharges: Number(
        (syncedOrder as any).freight_charges ?? (syncedOrder as any).shipping_charges ?? 0,
      ),
      collectedAt: new Date(),
    })

    if (created) {
      await createNotificationService({
        targetRole: 'admin',
        title: 'COD remittance created',
        message: `Order ${remittanceOrderNumber} (${syncedOrder.awb_number || 'no AWB'}) created pending COD remittance of Rs. ${Number(
          remittance.remittableAmount || 0,
        ).toFixed(2)} from live tracking.`,
      }).catch((err: any) => {
        console.warn('Failed to notify admin for live tracking COD remittance:', err?.message || err)
      })
    }
  }
}

const recordLiveTrackingNdrEvent = async (params: {
  order: OrderSummary
  providerKey: string
  tracking: TrackingServiceResponse
  ndrEvent: TrackingHistoryItem | null
  mappedStatus: string
}) => {
  const { order, providerKey, tracking, ndrEvent, mappedStatus } = params
  if (order.source_type !== 'b2c' || !ndrEvent) return
  if (['ndr', 'undelivered', 'lost'].includes(normalizeInternalTrackingStatus(order.order_status))) {
    return
  }

  const reason = sanitizeString(ndrEvent.message || tracking.shipment_info || tracking.status, 'NDR')
  const remarks = sanitizeString(ndrEvent.status_code || tracking.status || providerKey, 'NDR')
  const eventTime = sanitizeString(ndrEvent.event_time)
  const duplicateWhere = eventTime
    ? and(
        eq(ndr_events.order_id, order.id),
        sql`${ndr_events.payload}->>'source' = 'live_tracking_fetch'`,
        sql`${ndr_events.payload}->>'event_time' = ${eventTime}`,
      )
    : and(eq(ndr_events.order_id, order.id), eq(ndr_events.reason, reason.slice(0, 300)))

  const [existing] = await db
    .select({ id: ndr_events.id })
    .from(ndr_events)
    .where(duplicateWhere)
    .limit(1)

  if (existing) return

  await recordNdrEvent({
    orderId: order.id,
    userId: order.user_id,
    awbNumber: order.awb_number,
    status: 'ndr',
    reason: reason.slice(0, 300),
    remarks: remarks.slice(0, 500),
    payload: {
      source: 'live_tracking_fetch',
      provider: providerKey,
      current_status: tracking.status,
      mapped_status: mappedStatus,
      event_time: eventTime || null,
      shipment_info: tracking.shipment_info || null,
      event: ndrEvent,
    },
  })

  await createNotificationService({
    targetRole: 'user',
    userId: order.user_id,
    title: 'Delivery attempt issue',
    message: `Order ${order.order_number} has a Delhivery NDR update.`,
  }).catch((err: any) => {
    console.warn('Failed to notify user for live tracking NDR:', err?.message || err)
  })
  await createNotificationService({
    targetRole: 'admin',
    title: 'NDR captured (Delhivery)',
    message: `User ${order.user_id} order ${order.order_number} status ndr`,
  }).catch((err: any) => {
    console.warn('Failed to notify admin for live tracking NDR:', err?.message || err)
  })
}

const persistLiveTrackingStatus = async (
  order: OrderSummary,
  providerKey: string,
  tracking: TrackingServiceResponse,
) => {
  const latest = tracking.history?.[0]
  const ndrEvent = findLiveTrackingNdrEvent(tracking)
  const rawStatus = sanitizeString(
    tracking.status || latest?.message || latest?.status_code || order.order_status || '',
  )
  const statusForMapping = [rawStatus, tracking.shipment_info, latest?.message, latest?.status_code]
    .map((part) => sanitizeString(part))
    .filter(Boolean)
    .join(' | ')
  const previousStatus = normalizeInternalTrackingStatus(order.order_status)
  let nextStatus = mapLiveTrackingStatusToInternal(
    statusForMapping,
    providerKey,
    order.order_status,
    order.order_type,
  )
  if (
    previousStatus === 'cancellation_requested' &&
    normalizeLiveTrackingStatusText(providerKey) === 'delhivery' &&
    nextStatus !== 'cancelled'
  ) {
    // An accepted Delhivery cancel request can take time to move from PP/UD
    // into CN/RT. Do not let a normal tracking poll reopen pickup locally while
    // the dedicated cancellation retry is waiting for courier confirmation.
    nextStatus = 'cancellation_requested'
  }
  const deliveryLocation = sanitizeString(latest?.location, '')
  const deliveryMessage = sanitizeString(tracking.shipment_info || latest?.message || rawStatus, '')
  const isExistingTerminalStatus = ['cancelled', 'delivered', 'rto_delivered'].includes(
    previousStatus,
  )
  const isGenericDeliveryMessage = ['success', 'ok', 'status update'].includes(
    normalizeLiveTrackingStatusText(deliveryMessage),
  )

  const updateData: Record<string, any> = {
    order_status: nextStatus,
    provider_last_status: rawStatus.slice(0, 80) || nextStatus,
    updated_at: new Date(),
  }
  if (deliveryLocation) updateData.delivery_location = deliveryLocation.slice(0, 100)
  if (
    deliveryMessage &&
    !(isExistingTerminalStatus && isGenericDeliveryMessage && sanitizeString(order.delivery_message))
  ) {
    updateData.delivery_message = deliveryMessage.slice(0, 100)
  }

  const rawStatusForPickup = normalizeLiveTrackingStatusText(rawStatus)
  const trackingConfirmsPickupRequest =
    rawStatusForPickup.includes('pickup scheduled') ||
    rawStatusForPickup.includes('pickup requested') ||
    rawStatusForPickup.includes('pickup booked') ||
    rawStatusForPickup.includes('assigned for pickup') ||
    rawStatusForPickup.includes('assigned for seller pickup') ||
    rawStatusForPickup.includes('manifest') ||
    rawStatusForPickup.includes('picked')
  const trackingConfirmsShipmentProgress = [
    'pickup_initiated',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'ndr',
    'rto',
    'rto_in_transit',
    'rto_delivered',
  ].includes(nextStatus)

  if (
    order.source_type === 'b2c' &&
    nextStatus !== 'cancelled' &&
    (trackingConfirmsPickupRequest || trackingConfirmsShipmentProgress)
  ) {
    updateData.pickup_status = 'pickup_initiated'
    updateData.pickup_error = null
    updateData.manifest_error = null
  }
  if (order.source_type === 'b2c' && nextStatus === 'cancelled') {
    updateData.pickup_status = 'cancelled'
    updateData.pickup_error = null
  }

  if (order.source_type === 'b2b') {
    await db.update(b2b_orders).set(updateData as any).where(eq(b2b_orders.id, order.id))
  } else {
    await db.update(b2c_orders).set(updateData as any).where(eq(b2c_orders.id, order.id))
    await runB2CLiveTrackingSideEffects({ order, nextStatus, previousStatus }).catch((err: any) => {
      console.warn('Live tracking side effects skipped:', err?.message || err)
    })
    await recordLiveTrackingNdrEvent({
      order,
      providerKey,
      tracking,
      ndrEvent,
      mappedStatus: nextStatus,
    }).catch((err: any) => {
      console.warn('Live tracking NDR capture skipped:', err?.message || err)
    })

    try {
      await logTrackingEvent({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: order.awb_number.slice(0, 100),
        courier: sanitizeString(tracking.courier_name || order.courier_partner || order.integration_type).slice(0, 60),
        statusCode: sanitizeString(latest?.status_code || rawStatus || nextStatus).slice(0, 80),
        statusText: sanitizeString(latest?.message || rawStatus || nextStatus).slice(0, 200),
        location: sanitizeString(latest?.location).slice(0, 120) || null,
        raw: {
          source: 'live_tracking_fetch',
          provider: providerKey,
          status: tracking.status,
          history: tracking.history?.slice(0, 5) || [],
        },
      })
    } catch (err: any) {
      console.error('Failed to log live tracking event:', err?.message || err)
    }
  }

  await notifyLiveTrackingStatusEmail({
    order,
    nextStatus,
    previousStatus,
    rawStatus,
    location: latest?.location || null,
    remarks: latest?.message || tracking.shipment_info || null,
  })

  await sendWebhookEvent(order.user_id, 'tracking.updated', {
    awb_number: order.awb_number,
    order_id: order.id,
    order_number: order.order_number,
    status: nextStatus,
    raw_status: rawStatus,
    courier_partner: tracking.courier_name || order.courier_partner,
    provider_reference: order.provider_reference || null,
    provider_request_id: order.provider_request_id || null,
    location: latest?.location || null,
    remarks: latest?.message || tracking.shipment_info || null,
    source: 'live_tracking_fetch',
  }).catch((err) => {
    console.error('Failed to send live tracking.updated webhook:', err)
  })

  if (nextStatus !== previousStatus) {
    await sendWebhookEvent(order.user_id, trackingWebhookEventForStatus(nextStatus) as any, {
      order_id: order.id,
      order_number: order.order_number,
      awb_number: order.awb_number,
      status: nextStatus,
      raw_status: rawStatus,
      courier_partner: tracking.courier_name || order.courier_partner,
      provider_reference: order.provider_reference || null,
      provider_request_id: order.provider_request_id || null,
      location: latest?.location || null,
      remarks: latest?.message || tracking.shipment_info || null,
      order_type: order.source_type,
      source: 'live_tracking_fetch',
    }).catch((err) => {
      console.error('Failed to send live tracking status webhook:', err)
    })
  }
}

const buildTrackingResponse = (
  order: OrderSummary,
  providerData: ProviderNormalizedTracking,
): TrackingServiceResponse => {
  const history = [...(providerData.history || [])]
  const fallbackTime = toIsoString(order.updated_at ?? order.created_at ?? new Date())

  if (!history.length) {
    pushHistoryEvent(
      history,
      {
        statusCode: order.order_status ?? 'Status Update',
        message: order.order_status ?? 'Status Update',
        location: '',
        time: fallbackTime,
      },
      fallbackTime,
    )
  }

  sortHistoryDescending(history)

  const status = sanitizeString(
    providerData.status ?? history[0]?.message ?? order.order_status,
    'In Transit',
  )

  const courierName = sanitizeString(
    providerData.courier_name ?? order.courier_partner ?? order.integration_type ?? 'Courier',
  )

  const eddValue = providerData.edd ?? (order.edd ? sanitizeString(order.edd) : null)

  const shipmentInfoValue =
    providerData.shipment_info || sanitizeString(order.delivery_message ?? '', '') || null

  return {
    id: order.id,
    order_id: order.order_id ?? order.id,
    order_number: order.order_number,
    awb_number: order.awb_number,
    courier_name: courierName,
    status,
    edd: eddValue || null,
    history,
    payment_type: sanitizeString(order.order_type ?? 'prepaid', 'prepaid').toUpperCase(),
    shipment_info: shipmentInfoValue,
  }
}

const findOrderByAwb = async (awb: string): Promise<OrderSummary | null> => {
  const [b2c] = await db
    .select({
      id: b2c_orders.id,
      user_id: b2c_orders.user_id,
      order_id: b2c_orders.order_id,
      order_number: b2c_orders.order_number,
      integration_type: b2c_orders.integration_type,
      courier_partner: b2c_orders.courier_partner,
      courier_id: b2c_orders.courier_id,
      provider_reference: b2c_orders.provider_reference,
      provider_request_id: b2c_orders.provider_request_id,
      provider_service: b2c_orders.provider_service,
      provider_meta: b2c_orders.provider_meta,
      awb_number: b2c_orders.awb_number,
      order_status: b2c_orders.order_status,
      edd: b2c_orders.edd,
      order_type: b2c_orders.order_type,
      shipment_id: b2c_orders.shipment_id,
      delivery_message: b2c_orders.delivery_message,
      created_at: b2c_orders.created_at,
      updated_at: b2c_orders.updated_at,
    })
    .from(b2c_orders)
    .where(
      or(
        eq(b2c_orders.awb_number, awb),
        eq(b2c_orders.shipment_id, awb),
        eq(b2c_orders.provider_reference, awb),
        eq(b2c_orders.provider_request_id, awb),
      ),
    )
    .limit(1)

  if (b2c) {
    return {
      id: b2c.id,
      user_id: b2c.user_id,
      source_type: 'b2c',
      order_id: b2c.order_id,
      order_number: b2c.order_number,
      integration_type: b2c.integration_type ?? 'delhivery',
      courier_partner: b2c.courier_partner,
      courier_id: b2c.courier_id ? Number(b2c.courier_id) : null,
      provider_reference: b2c.provider_reference,
      provider_request_id: b2c.provider_request_id,
      provider_service: b2c.provider_service,
      provider_meta: b2c.provider_meta,
      awb_number: b2c.awb_number ?? awb,
      order_status: b2c.order_status,
      edd: b2c.edd,
      order_type: b2c.order_type,
      shipment_id: b2c.shipment_id,
      delivery_message: b2c.delivery_message,
      created_at: b2c.created_at,
      updated_at: b2c.updated_at,
    }
  }

  const [b2b] = await db
    .select({
      id: b2b_orders.id,
      user_id: b2b_orders.user_id,
      order_id: b2b_orders.order_id,
      order_number: b2b_orders.order_number,
      integration_type: b2b_orders.integration_type,
      courier_partner: b2b_orders.courier_partner,
      courier_id: b2b_orders.courier_id,
      provider_reference: b2b_orders.provider_reference,
      provider_request_id: b2b_orders.provider_request_id,
      provider_service: b2b_orders.provider_service,
      provider_meta: b2b_orders.provider_meta,
      awb_number: b2b_orders.awb_number,
      order_status: b2b_orders.order_status,
      order_type: b2b_orders.order_type,
      shipment_id: b2b_orders.shipment_id,
      delivery_message: b2b_orders.delivery_message,
      created_at: b2b_orders.created_at,
      updated_at: b2b_orders.updated_at,
    })
    .from(b2b_orders)
    .where(
      or(
        eq(b2b_orders.awb_number, awb),
        eq(b2b_orders.shipment_id, awb),
        eq(b2b_orders.provider_reference, awb),
        eq(b2b_orders.provider_request_id, awb),
      ),
    )
    .limit(1)

  if (b2b) {
    return {
      id: b2b.id,
      user_id: b2b.user_id,
      source_type: 'b2b',
      order_id: b2b.order_id,
      order_number: b2b.order_number,
      integration_type: b2b.integration_type || 'delhivery',
      courier_partner: b2b.courier_partner,
      courier_id: b2b.courier_id ? Number(b2b.courier_id) : null,
      provider_reference: b2b.provider_reference,
      provider_request_id: b2b.provider_request_id,
      provider_service: b2b.provider_service,
      provider_meta: b2b.provider_meta,
      awb_number: b2b.awb_number ?? awb,
      order_status: b2b.order_status,
      edd: null,
      order_type: b2b.order_type,
      shipment_id: b2b.shipment_id,
      delivery_message: b2b.delivery_message,
      created_at: b2b.created_at,
      updated_at: b2b.updated_at,
    }
  }

  return null
}

export const trackByAwbService = async (awb: string): Promise<TrackingServiceResponse> => {
  if (!awb) throw new HttpError(400, 'AWB number is required')

  const order = await findOrderByAwb(awb)
  if (!order) {
    throw new HttpError(404, `No order found for AWB: ${awb}`)
  }

  const providerMetaCourierName = getProviderMetaCourierName(order.provider_meta)
  const providerKey = resolveCourierProviderKeyFromFields(
    order.integration_type,
    order.courier_partner,
    providerMetaCourierName,
    order.provider_service,
  )

  if (!providerKey) {
    throw new HttpError(400, 'Unsupported integration_type for tracking')
  }

  const providerDisplayName =
    providerMetaCourierName || getCourierProviderDisplayName(providerKey) || order.courier_partner
  const shouldRepairProviderFields =
    order.source_type === 'b2c' &&
    (normalizeCourierProviderKey(order.integration_type) !== providerKey ||
      normalizeCourierProviderKey(order.courier_partner) !== providerKey)

  if (shouldRepairProviderFields) {
    await db
      .update(b2c_orders)
      .set({
        integration_type: providerKey,
        courier_partner: providerDisplayName,
        updated_at: new Date(),
      } as any)
      .where(eq(b2c_orders.id, order.id))
      .catch((err: any) => {
        console.warn('Tracking provider field repair skipped:', err?.message || err)
      })

    order.integration_type = providerKey
    order.courier_partner = providerDisplayName
  }

  let providerData: ProviderNormalizedTracking | null = null

  try {
    if (providerKey === 'delhivery') {
      if (order.source_type === 'b2b') {
        const delhiveryService = new DelhiveryB2BService()
        const lrn = sanitizeString(
          order.provider_reference || order.shipment_id || order.order_id || awb,
          awb,
        )
        const raw = await delhiveryService.trackShipment(lrn, true)
        providerData = mapDelhiveryB2BTracking(raw, order)
      } else {
        const delhiveryService = new DelhiveryService()
        const raw = await delhiveryService.trackShipment(awb)
        providerData = mapDelhiveryTracking(raw, order)
      }
    } else if (providerKey === 'shadowfax') {
      const isReverseShadowfax = awb.toUpperCase().startsWith('R')

      if (!isReverseShadowfax && isAfterShipTrackingConfigured()) {
        try {
          const afterShip = new AfterShipTrackingService()
          const raw = await afterShip.getOrCreateShadowfaxTracking(order)
          providerData = mapAfterShipTracking(raw, order)
        } catch (afterShipError: any) {
          console.warn(
            '[AfterShip] Shadowfax tracking fallback to provider API:',
            afterShipError?.message || afterShipError,
          )
        }
      }

      if (!providerData) {
        const shadowfaxService = new ShadowfaxService()
        const raw = isReverseShadowfax
          ? await shadowfaxService.trackReverseShipment(awb)
          : await shadowfaxService.trackShipment(awb)
        providerData = mapShadowfaxTracking(raw, order)
      }
    } else if (providerKey === 'amazon') {
      const amazonCredentials = await getStoredAmazonShippingCredentials()
      applyAmazonShippingCredentialsToEnv(amazonCredentials)
      const amazonTrackingId =
        sanitizeString(order.provider_meta?.amazon_tracking_id) ||
        sanitizeString(order.provider_meta?.trackingId) ||
        sanitizeString(order.provider_meta?.tracking_id) ||
        sanitizeString(order.provider_meta?.awb_number) ||
        (!isAmazonShipmentReference(order.awb_number) ? sanitizeString(order.awb_number) : '') ||
        (!isAmazonShipmentReference(awb) ? sanitizeString(awb) : '')
      if (!amazonTrackingId) {
        throw new HttpError(
          400,
          'Amazon Shipping tracking ID is not available for this order. The stored provider reference is a shipment ID, not a trackable AWB.',
        )
      }
      const carrierId =
        sanitizeString(order.provider_meta?.amazon_carrier_id) ||
        sanitizeString(order.provider_meta?.carrierId) ||
        sanitizeString(order.provider_meta?.carrier_id) ||
        sanitizeString(order.provider_meta?.provider_serviceability?.carrierId) ||
        (sanitizeString(order.provider_service).toUpperCase().startsWith('AMZN')
          ? sanitizeString(order.provider_service)
          : '') ||
        'AMZN_IN'
      const raw = await getAmazonShippingTracking(
        {
          trackingId: amazonTrackingId,
          carrierId,
        },
        amazonCredentials,
      )
      providerData = mapAmazonTracking(raw.data ?? raw, order)
    } else if (providerKey === 'xpressbees') {
      const xpressbeesService = new XpressbeesService()
      const raw = await xpressbeesService.trackShipment(awb)
      providerData = mapXpressbeesTracking(raw, order)
    } else if (providerKey === 'innofulfill') {
      const innofulfillService = new InnofulfillService()
      const raw = await innofulfillService.trackAwb(awb)
      providerData = mapInnofulfillTracking(raw, order)
    } else if (providerKey === 'ekart') {
      const ekartService = new EkartService()
      const raw = await ekartService.track(awb)
      providerData = mapEkartTracking(raw, order)
    }
  } catch (err: any) {
    if (err instanceof HttpError) throw err
    const status = err?.status ?? err?.response?.status ?? 500
    const message =
      err?.response?.data?.message ?? err?.message ?? 'Failed to fetch tracking information'
    throw new HttpError(status, message)
  }

  if (!providerData) {
    throw new HttpError(500, 'Failed to resolve tracking information')
  }

  const trackingResponse = buildTrackingResponse(order, providerData)
  await persistLiveTrackingStatus(order, providerKey, trackingResponse)

  return trackingResponse
}

export const trackByOrderService = async ({
  orderNumber,
  email,
  phone,
}: {
  orderNumber?: string
  email?: string
  phone?: string
}) => {
  if (!orderNumber || (!email && !phone)) {
    throw new Error('Order number and either email or phone are required')
  }

  const normalizedOrderNumber = sanitizeString(orderNumber)
  const normalizedEmail = sanitizeString(email).toLowerCase()
  const normalizedPhone = sanitizeString(phone).replace(/\D/g, '')

  const buyerB2cContactFilter = or(
    normalizedEmail ? ilike(b2c_orders.buyer_email, normalizedEmail) : undefined,
    normalizedPhone ? eq(b2c_orders.buyer_phone, normalizedPhone) : undefined,
  )

  if (buyerB2cContactFilter) {
    const [buyerB2cOrder] = await db
      .select()
      .from(b2c_orders)
      .where(and(eq(b2c_orders.order_number, normalizedOrderNumber), buyerB2cContactFilter))
      .limit(1)

    if (buyerB2cOrder) return buyerB2cOrder
  }

  const buyerB2bContactFilter = or(
    normalizedEmail ? ilike(b2b_orders.buyer_email, normalizedEmail) : undefined,
    normalizedPhone ? eq(b2b_orders.buyer_phone, normalizedPhone) : undefined,
  )

  if (buyerB2bContactFilter) {
    const [buyerB2bOrder] = await db
      .select()
      .from(b2b_orders)
      .where(and(eq(b2b_orders.order_number, normalizedOrderNumber), buyerB2bContactFilter))
      .limit(1)

    if (buyerB2bOrder) return buyerB2bOrder
  }

  // 1️⃣ Find user
  const user = await db
    .select()
    .from(users)
    .where(
      or(
        normalizedEmail ? eq(users.email, normalizedEmail) : undefined,
        normalizedPhone ? eq(users.phone, normalizedPhone) : undefined,
      ),
    )
    .limit(1)

  if (!user[0]) throw new Error('No order found with provided order/contact details')

  // 2️⃣ Fetch orders for user
  const orders = await getAllOrdersService(user[0].id, {
    filters: { search: normalizedOrderNumber },
  })

  if (orders.totalCount === 0) {
    throw new Error(`No order found with order number: ${normalizedOrderNumber}`)
  }

  // 3️⃣ Return the first matching order with tracking info
  return orders.orders[0]
}
