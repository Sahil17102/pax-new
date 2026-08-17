// services/webhookProcessor.ts
import dayjs from 'dayjs'
import { and, eq, gt, isNotNull, or, sql } from 'drizzle-orm'
import { sendWebhookEvent } from '../../services/webhookDelivery.service'
import { db } from '../client'
import { b2b_orders } from '../schema/b2bOrders'
import { b2c_orders } from '../schema/b2cOrders'
import { invoicePreferences } from '../schema/invoicePreferences'
import { ndr_events } from '../schema/ndr'
import { rto_events } from '../schema/rto'
import { userProfiles } from '../schema/userProfile'
import { wallets, walletTransactions } from '../schema/wallet'
import { createCodRemittance } from './codRemittance.service'
import { extractWeightProofFromWebhook } from './courierProofFetcher.service'
import {
  calculateChargedWeight,
  calculateVolumetricWeight,
} from './courierWeightCalculation.service'
import { sendOrderStatusUpdateEmail, sendTaxInvoiceGeneratedEmail } from './eventEmail.service'
import { generateInvoicePDF } from './invoice.service'
import { recordNdrEvent } from './ndr.service'
import { createNotificationService } from './notifications.service'
import { recordRtoEvent } from './rto.service'
import { logTrackingEvent } from './trackingEvents.service'
import { presignDownload, uploadBufferToStorage } from './upload.service'
import {
  formatPickupAddress,
  loadInvoiceAssets,
  normalizePickupDetails,
} from './invoiceHelpers'
import { createWalletTransaction } from './wallet.service'
import { createWeightDiscrepancy } from './weightReconciliation.service'
import { resolveInvoiceNumber } from './invoiceNumber.service'
import { syncShopifyStatusForLocalOrder } from './shopify.service'
import { syncWooCommerceStatusForLocalOrder } from './woocommerce.service'
import {
  computeB2CFreightForOrder,
  getCancellationRefundReason,
  getOrderRefundOutstanding,
  ORIGINAL_WALLET_DEBIT_REASONS,
} from './shiprocket.service'

const normalizeWebhookText = (...parts: unknown[]) =>
  parts
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' | ')

const notifyOrderStatusEmail = async (params: {
  order: any
  nextStatus: string
  previousStatus?: string | null
  rawStatus?: string | null
  location?: string | null
  remarks?: string | null
  source: string
}) => {
  const nextStatus = String(params.nextStatus || '').trim().toLowerCase()
  const previousStatus = String(params.previousStatus || '').trim().toLowerCase()
  if (!nextStatus) return
  if (nextStatus === previousStatus && nextStatus !== 'delivered') return

  await sendOrderStatusUpdateEmail({
    order: params.order,
    nextStatus,
    previousStatus,
    rawStatus: params.rawStatus,
    location: params.location,
    remarks: params.remarks,
    source: params.source,
  }).catch((err) => {
    console.error(`Failed to send order status email for ${params.order?.order_number}:`, err)
  })
}

const hasNdrSignal = (...parts: unknown[]) => {
  const text = normalizeWebhookText(...parts)
  if (!text) return false

  const ndrMarkers = [
    'ndr',
    'undelivered',
    'unsuccessful delivery',
    'not delivered',
    'delivery attempted',
    'attempted',
    'attempt failed',
    'reattempt',
    're-attempt',
    'customer not available',
    'customer unavailable',
    'consignee not available',
    'consignee unavailable',
    'consignee refused',
    'future delivery request',
    'future delivery requested',
    'door locked',
    'premises closed',
    'address issue',
    'address incomplete',
    'incorrect address',
    'refused',
    'otp not shared',
    'otp failed',
  ]

  return ndrMarkers.some((marker) => text.includes(marker))
}

const normalizeComparableText = (value: unknown) => String(value || '').trim().toLowerCase()

const pickWebhookText = (...values: unknown[]) => {
  for (const value of values) {
    if (value === null || value === undefined) continue
    if (typeof value === 'object') continue
    const text = String(value).trim()
    if (text) return text
  }
  return ''
}

const DELHIVERY_NDR_STATUS_CODES = new Set([
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

const normalizeDelhiveryStatusCode = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const hasDelhiveryNdrStatusCode = (...parts: unknown[]) =>
  parts.some((part) => DELHIVERY_NDR_STATUS_CODES.has(normalizeDelhiveryStatusCode(part)))

const normalizeWebhookWeightGrams = (value: unknown) => {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return null
  return numericValue > 50 ? Math.round(numericValue) : Math.round(numericValue * 1000)
}

const resolveNdrStatus = (status: unknown, ...signalParts: unknown[]) => {
  const normalizedStatus = normalizeComparableText(status)
  if (normalizedStatus === 'undelivered') return 'undelivered'
  if (normalizedStatus === 'ndr') return 'ndr'

  const signalText = normalizeWebhookText(...signalParts)
  if (signalText.includes('undelivered') || signalText.includes('not delivered')) {
    return 'undelivered'
  }

  return 'ndr'
}

const shouldSkipDuplicateNdrEvent = async (params: {
  orderId: string
  status: string
  reason?: string | null
  remarks?: string | null
  attemptNo?: string | null
}) => {
  const [latest] = await db
    .select({
      id: ndr_events.id,
      created_at: ndr_events.created_at,
      status: ndr_events.status,
      reason: ndr_events.reason,
      remarks: ndr_events.remarks,
      attempt_no: ndr_events.attempt_no,
    })
    .from(ndr_events)
    .where(eq(ndr_events.order_id, params.orderId))
    .orderBy(sql`${ndr_events.created_at} desc`)
    .limit(1)

  if (!latest?.created_at) return false

  const ageMs = Date.now() - new Date(latest.created_at).getTime()
  const withinDuplicateWindow = ageMs >= 0 && ageMs <= 10 * 60 * 1000
  if (!withinDuplicateWindow) return false

  return (
    normalizeComparableText(latest.status) === normalizeComparableText(params.status) &&
    normalizeComparableText(latest.reason) === normalizeComparableText(params.reason) &&
    normalizeComparableText(latest.remarks) === normalizeComparableText(params.remarks) &&
    normalizeComparableText(latest.attempt_no) === normalizeComparableText(params.attemptNo)
  )
}

const captureNdrEventFromWebhook = async (params: {
  order: any
  awbNumber?: string | null
  status?: string | null
  reason?: string | null
  remarks?: string | null
  attemptNo?: string | null
  payload?: any
  courierLabel: string
  signalParts?: unknown[]
}) => {
  const {
    order,
    awbNumber,
    status,
    reason,
    remarks,
    attemptNo,
    payload,
    courierLabel,
    signalParts = [],
  } = params

  const finalStatus = resolveNdrStatus(status, reason, remarks, ...signalParts)
  const currentOrderStatus = normalizeComparableText(order.order_status)
  if (['ndr', 'undelivered', 'lost'].includes(currentOrderStatus)) {
    console.log(`ℹ️ Skipping repeated NDR event for ${courierLabel}`, {
      order_number: order.order_number,
      awb_number: awbNumber || order.awb_number || null,
      status: finalStatus,
      current_status: currentOrderStatus,
    })
    return { skipped: true, status: finalStatus }
  }
  const duplicate = await shouldSkipDuplicateNdrEvent({
    orderId: order.id,
    status: finalStatus,
    reason,
    remarks,
    attemptNo,
  })

  if (duplicate) {
    console.log(`ℹ️ Skipping duplicate NDR event for ${courierLabel}`, {
      order_number: order.order_number,
      awb_number: awbNumber || order.awb_number || null,
      status: finalStatus,
    })
    return { skipped: true, status: finalStatus }
  }

  await recordNdrEvent({
    orderId: order.id,
    userId: order.user_id,
    awbNumber: awbNumber || order.awb_number || undefined,
    status: finalStatus,
    reason: reason || null,
    remarks: remarks || null,
    attemptNo: attemptNo || null,
    payload,
  })

  await createNotificationService({
    targetRole: 'user',
    userId: order.user_id,
    title: `Delivery attempt issue (${courierLabel})`,
    message: `Order ${order.order_number} marked as ${finalStatus}.`,
  })
  await createNotificationService({
    targetRole: 'admin',
    title: `NDR captured (${courierLabel})`,
    message: `User ${order.user_id} order ${order.order_number} status ${finalStatus}`,
  })

  return { skipped: false, status: finalStatus }
}

// Helper function to generate invoice for an order
const generateInvoiceForOrderWebhook = async (
  order: any,
  tx: any,
): Promise<
  | {
      key: string
      invoiceNumber: string
      invoiceDate: string
      invoiceAmount: number
    }
  | null
> => {
  try {
    // Check if invoice already exists
    if (order.invoice_link) {
      console.log(`ℹ️ Invoice already exists for order ${order.order_number}`)
      return order.invoice_link
    }

    const [prefs] = await tx
      .select()
      .from(invoicePreferences)
      .where(eq(invoicePreferences.userId, order.user_id))

    const [user] = await tx
      .select({
        companyName: sql<string>`(${userProfiles.companyInfo} ->> 'businessName')`,
        brandName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
        companyGST: sql<string>`(${userProfiles.companyInfo} ->> 'companyGst')`,
        supportEmail: sql<string>`(${userProfiles.companyInfo} ->> 'companyEmail')`,
        supportPhone: sql<string>`(${userProfiles.companyInfo} ->> 'companyContactNumber')`,
        companyLogo: sql<string>`(${userProfiles.companyInfo} ->> 'companyLogoUrl')`,
        companyAddress: sql<string>`(${userProfiles.companyInfo} ->> 'companyAddress')`,
        companyState: sql<string>`(${userProfiles.companyInfo} ->> 'state')`,
        panNumber: sql<string>`(${userProfiles.companyInfo} ->> 'panNumber')`,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, order.user_id))

    const { logoBuffer, signatureBuffer } = await loadInvoiceAssets(
      {
        companyLogoKey: user?.companyLogo,
        includeSignature: prefs?.includeSignature,
        signatureFile: prefs?.signatureFile,
      },
      order.order_number || String(order.id),
    )

    const invoiceNumber = await resolveInvoiceNumber({
      userId: order.user_id,
      existingInvoiceNumber: (order as any)?.invoice_number,
      prefix: prefs?.prefix ?? undefined,
      suffix: prefs?.suffix ?? undefined,
      tx,
    })

    const invoiceDateDisplay = dayjs().format('DD MMM YYYY')
    const invoiceDateStored = dayjs().format('YYYY-MM-DD')

    const invoiceAmount =
      Number(order.order_amount ?? 0) +
      Number(order.shipping_charges ?? 0) + // Already includes other_charges
      Number(order.gift_wrap ?? 0) +
      Number(order.transaction_fee ?? 0) -
      (Number(order.discount ?? 0) + Number(order.prepaid_amount ?? 0))

    const pickupDetails = normalizePickupDetails(order.pickup_details)
    const pickupPincode = pickupDetails?.pincode

    const serviceType =
      order.service_type ||
      (order as any).serviceType ||
      order.integration_type ||
      order.courier_partner ||
      ''
    const pickupAddress = formatPickupAddress(pickupDetails)
    const sellerAddress = pickupAddress || user?.companyAddress || ''
    const sellerStateCode = pickupDetails?.state || user?.companyState || ''
    const sellerName =
      pickupDetails?.warehouse_name || user?.companyName || user?.brandName || 'Seller'
    const brandName =
      user?.brandName ||
      user?.companyName ||
      pickupDetails?.warehouse_name ||
      ''
    const gstNumber = user?.companyGST || ''
    const panNumber = user?.panNumber || ''
    const supportPhone = pickupDetails?.phone || user?.supportPhone || ''
    const supportEmail = user?.supportEmail || prefs?.supportEmail || ''

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
      products: order.products as any,
      shippingCharges: Number(order.shipping_charges ?? 0),
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

    const trimmedKey = finalKey.trim()
    console.log(`✅ Invoice uploaded successfully for order ${order.order_number}: ${trimmedKey}`)

    await sendTaxInvoiceGeneratedEmail({
      order,
      invoiceNumber,
      invoiceDate: invoiceDateStored,
      invoiceAmount,
      invoiceKey: trimmedKey,
    }).catch((emailErr) => {
      console.error(`Failed to send tax invoice email for ${order.order_number}:`, emailErr)
    })

    return {
      key: trimmedKey,
      invoiceNumber,
      invoiceDate: invoiceDateStored,
      invoiceAmount,
    }
  } catch (err: any) {
    console.error(
      `⚠️ Failed to generate invoice for order ${order.order_number}:`,
      err?.message || err,
    )
    return null
  }
}

const getStoredRtoCharge = (order: any) =>
  Number(order.freight_charges ?? order.shipping_charges ?? 0) || 0

async function resolveRtoCharge(order: any): Promise<number> {
  const storedCharge = getStoredRtoCharge(order)
  if (storedCharge > 0) return storedCharge

  const courierId = Number(order.courier_id ?? 0)
  const originPincode = order.pickup_details?.pincode
  const destinationPincode = order.pincode
  const weightG = Math.round(Number(order.weight ?? 0) * 1000)
  const lengthCm = Number(order.length ?? 0)
  const breadthCm = Number(order.breadth ?? 0)
  const heightCm = Number(order.height ?? 0)

  if (
    !order.user_id ||
    !courierId ||
    !originPincode ||
    !destinationPincode ||
    weightG <= 0 ||
    lengthCm <= 0 ||
    breadthCm <= 0 ||
    heightCm <= 0
  ) {
    return 0
  }

  try {
    const rate = await computeB2CFreightForOrder({
      userId: order.user_id,
      courierId,
      serviceProvider: order.integration_type ?? null,
      mode: order.shipping_mode ?? null,
      selectedMaxSlabWeight: order.selected_max_slab_weight ?? null,
      originPincode,
      destinationPincode,
      weightG,
      lengthCm,
      breadthCm,
      heightCm,
      isReverse: true,
    })

    return Number(rate.freight ?? 0) || 0
  } catch (err) {
    console.error(`⚠️ Failed to resolve RTO rate from plan table for ${order.order_number}:`, err)
    return 0
  }
}

async function applyRtoChargeOnce(
  tx: any,
  order: any,
  courierLabel: string,
): Promise<number | null> {
  const amount = await resolveRtoCharge(order)
  if (amount <= 0) return null

  const [existingChargedEvent] = await tx
    .select({ id: rto_events.id })
    .from(rto_events)
    .where(
      and(
        eq(rto_events.order_id, order.id),
        isNotNull(rto_events.rto_charges),
        gt(rto_events.rto_charges, 0),
      ),
    )
    .limit(1)

  if (existingChargedEvent) {
    return null
  }

  try {
    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, order.user_id))
    if (!wallet) throw new Error(`Wallet not found for user ${order.user_id}`)

    await createWalletTransaction({
      walletId: wallet.id,
      amount,
      type: 'debit',
      currency: wallet.currency ?? 'INR',
      reason: `RTO freight - ${courierLabel} (${order.order_number})`,
      ref: order.id,
      meta: {
        awb: order.awb_number,
        order_number: order.order_number,
        courier_partner: order.courier_partner ?? courierLabel,
      },
      tx: tx as any,
    })
  } catch (err) {
    console.error(`⚠️ Failed RTO debit for ${courierLabel}:`, err)
  }

  return amount
}

export async function applyCancellationRefundOnce(
  tx: any,
  order: any,
  source: string,
): Promise<number> {
  const freightCharges = Number(order.freight_charges ?? 0)
  const otherCharges = Number(order.other_charges ?? 0)
  const codCharges = Number(order.cod_charges ?? 0)

  const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, order.user_id))
  if (!wallet) {
    throw new Error(`Wallet not found for user ${order.user_id}`)
  }

  const refundReason = getCancellationRefundReason(order.order_number)
  const [existingRefund] = await tx
    .select({ id: walletTransactions.id })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.wallet_id, wallet.id),
        eq(walletTransactions.type, 'credit'),
        eq(walletTransactions.reason, refundReason),
      ),
    )
    .limit(1)

  if (existingRefund) {
    console.log(
      `ℹ️ Cancellation refund already exists for order ${order.order_number}; skipping duplicate refund`,
    )
    return 0
  }

  const debitTransactions = await tx
    .select({
      amount: walletTransactions.amount,
      reason: walletTransactions.reason,
      meta: walletTransactions.meta,
    })
    .from(walletTransactions)
    .where(
      and(
        eq(walletTransactions.wallet_id, wallet.id),
        eq(walletTransactions.type, 'debit'),
        eq(walletTransactions.ref, order.id),
      ),
    )

  const originalWalletDebit = debitTransactions
    .filter((transaction: any) =>
      ORIGINAL_WALLET_DEBIT_REASONS.includes(String(transaction.reason ?? '')),
    )
    .reduce((sum: number, transaction: any) => sum + Number(transaction.amount ?? 0), 0)

  const fallbackRefundAmount =
    order.order_type === 'prepaid'
      ? Number(order.order_amount ?? 0) + freightCharges + otherCharges
      : freightCharges + otherCharges + codCharges
  const refundAmount = await getOrderRefundOutstanding(
    tx,
    wallet.id,
    order.id,
    order.order_number,
    fallbackRefundAmount,
  )

  if (refundAmount <= 0) {
    console.warn(`⚠️ No refundable amount resolved for cancelled order ${order.order_number}`, {
      source,
      order_type: order.order_type,
      order_amount: Number(order.order_amount ?? 0),
      freight_charges: freightCharges,
      other_charges: otherCharges,
      cod_charges: codCharges,
      original_wallet_debit: originalWalletDebit,
      debit_transactions_found: debitTransactions.length,
    })
    return 0
  }

  console.log(`💰 Refunding ₹${refundAmount} for cancelled order ${order.order_number}`, {
    source,
    order_type: order.order_type,
    order_amount: order.order_type === 'prepaid' ? Number(order.order_amount ?? 0) : 0,
    freight_charges: freightCharges,
    other_charges: otherCharges,
    cod_charges: order.order_type === 'cod' ? codCharges : 0,
    original_wallet_debit: originalWalletDebit,
    total_refund: refundAmount,
  })

  await createWalletTransaction({
    walletId: wallet.id,
    amount: refundAmount,
    type: 'credit',
    ref: order.id,
    reason: refundReason,
    currency: wallet.currency ?? 'INR',
    meta: {
      source,
      order_id: order.id,
      order_number: order.order_number,
      order_type: order.order_type,
      freight_charges: freightCharges,
      other_charges: otherCharges,
      cod_charges: order.order_type === 'cod' ? codCharges : 0,
    },
    tx: tx as any,
  })

  console.log(`✅ Wallet refunded ₹${refundAmount} for ${order.user_id}`)
  return refundAmount
}

// Ekart webhook: supports track_updated, shipment_created, shipment_recreated
export async function processEkartWebhookV2(payload: any, tx = db) {
  const statusRaw = payload?.status || payload?.track_updated?.status || payload?.status_text
  const awb =
    payload?.wbn || payload?.id || payload?.tracking_id || payload?.track_updated?.wbn || null
  const orderRef = payload?.orderNumber || payload?.order_number || payload?.order_id || null

  const normalized = (statusRaw || '').toString().toLowerCase()
  const statusMap: Record<string, string> = {
    'order placed': 'booked',
    'pickup scheduled': 'pickup_scheduled',
    'in transit': 'in_transit',
    'out for delivery': 'out_for_delivery',
    delivered: 'delivered',
    'return to origin': 'rto_initiated',
    'rto initiated': 'rto_initiated',
    'rto in transit': 'rto_in_transit',
    'rto delivered': 'rto_delivered',
    'delivery attempted': 'ndr',
    ndr: 'ndr',
    'manifest generated': 'pickup_initiated',
  }

  let mapped = statusMap[normalized] || normalized || 'unknown'
  if (mapped === 'pickup_scheduled') mapped = 'pickup_initiated'
  if (mapped === 'unknown' && normalized.includes('delivery')) mapped = 'out_for_delivery'
  if (mapped === 'unknown' && normalized.includes('attempt')) mapped = 'ndr'
  if (mapped === 'unknown' && normalized.includes('rto')) mapped = 'rto_initiated'

  // find order by awb then order_number
  let order
  if (awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.awb_number, awb))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.order_number, orderRef))
  }

  if (!order) {
    console.warn(`⚠️ Ekart webhook: order not found for AWB ${awb} or ref ${orderRef}`)
    return { success: false, reason: 'order_not_found' }
  }

  if (
    isEkartReverseOrder(order) &&
    (
      mapped === 'unknown' ||
      normalized.includes('order placed') ||
      normalized.includes('created') ||
      normalized.includes('shipment created') ||
      normalized.includes('manifest') ||
      normalized.includes('manifested') ||
      normalized.includes('consignment manifested')
    )
  ) {
    mapped = 'booked'
  }

  const update: any = {
    order_status: mapped,
    updated_at: new Date(),
  }

  const prevStatus = order.order_status || ''
  await tx.update(b2c_orders).set(update).where(eq(b2c_orders.id, order.id))
  await syncShopifyStatusForLocalOrder({ ...order, ...update }, tx).catch((err) => {
    console.warn('⚠️ Failed Shopify status sync for Ekart webhook:', err)
  })
  await syncWooCommerceStatusForLocalOrder({ ...order, ...update }, tx).catch((err) => {
    console.warn('Failed WooCommerce status sync for Ekart webhook:', err)
  })

  // emit tracking webhook
  await sendWebhookEvent(order.user_id, 'tracking.updated', {
    awb_number: awb || order.awb_number,
    order_id: order.id,
    order_number: order.order_number,
    status: mapped,
    raw_status: statusRaw,
    courier_partner: order.courier_partner,
  })

  if (mapped === 'ndr' || hasNdrSignal(statusRaw, payload?.status_text, payload?.remarks)) {
    try {
      await captureNdrEventFromWebhook({
        order,
        awbNumber: order.awb_number || awb || undefined,
        status: mapped,
        reason: payload?.remarks || payload?.status_text || statusRaw || null,
        remarks: payload?.event || payload?.status || null,
        attemptNo:
          payload?.attempt_no?.toString?.() ||
          payload?.attempted_count?.toString?.() ||
          payload?.attemptCount?.toString?.() ||
          null,
        payload,
        courierLabel: 'Ekart',
        signalParts: [statusRaw, payload?.status_text, payload?.remarks],
      })
    } catch (err) {
      console.error('❌ Failed to record NDR event (Ekart V2):', err)
    }
  }

  return { success: true }
}

const mapDelhiveryB2BStatus = (type: string, status: string) => {
  const normalizedType = String(type || '').trim().toUpperCase()
  const normalized = String(status || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')

  if (['CANCELLED', 'CANCELED'].includes(normalized) || normalizedType === 'CN') {
    return 'cancelled'
  }
  if (normalized === 'LOST' || normalizedType === 'LT') return 'lost'
  if (normalized === 'DELIVERED') return 'delivered'
  if (['RTO', 'RETURN_DELIVERED'].includes(normalized)) return 'rto_delivered'
  if (['RETURNED_INTRANSIT', 'RETURN_OFD'].includes(normalized)) return 'rto_in_transit'
  if (normalized === 'RECEIVED_AT_RETURN_CENTER') return 'rto'
  if (['OFD', 'DISPATCHED', 'OUT_FOR_DELIVERY'].includes(normalized)) {
    return normalizedType === 'RT' ? 'rto_in_transit' : 'out_for_delivery'
  }
  if (['UNDEL_REATTEMPT', 'PART_DEL'].includes(normalized)) return 'ndr'
  if (normalized === 'NOT_PICKED') return 'pickup_initiated'
  if (normalized === 'MANIFESTED') return 'shipment_created'
  if (normalized === 'PICKED_UP') return 'pickup_initiated'
  if (['LEFT_ORIGIN', 'REACH_DESTINATION', 'IN_TRANSIT', 'PENDING'].includes(normalized)) {
    return normalizedType === 'RT' ? 'rto_in_transit' : 'in_transit'
  }

  return 'in_transit'
}

const delhiveryWebhookEventForStatus = (status: string) => {
  if (status === 'delivered') return 'order.delivered'
  if (status === 'cancelled') return 'order.cancelled'
  if (['ndr', 'lost'].includes(status)) return 'order.failed'
  if (status.startsWith('rto')) return 'order.rto'
  if (['pickup_initiated', 'in_transit', 'out_for_delivery'].includes(status)) {
    return 'order.shipped'
  }
  return 'order.updated'
}

const processDelhiveryB2BWebhook = async (params: {
  payload: any
  tx: any
  trackingReference: string
  orderReference: string | null
  status: string
  statusType: string
  statusCode: string
  location: string
  instructions: string
}) => {
  const identifiers = [params.trackingReference, params.orderReference]
    .map((value) => String(value || '').trim())
    .filter(Boolean)

  let order: any
  for (const identifier of identifiers) {
    ;[order] = await params.tx
      .select()
      .from(b2b_orders)
      .where(
        or(
          eq(b2b_orders.awb_number, identifier),
          eq(b2b_orders.provider_reference, identifier),
          eq(b2b_orders.provider_request_id, identifier),
          eq(b2b_orders.shipment_id, identifier),
          eq(b2b_orders.order_number, identifier),
          eq(b2b_orders.order_id, identifier),
        )!,
      )
      .limit(1)
    if (order) break
  }

  if (!order) return null

  const internalStatus = mapDelhiveryB2BStatus(params.statusType, params.status)
  const previousStatus = String(order.order_status || '').trim().toLowerCase()
  const updateData: any = {
    order_status: internalStatus,
    delivery_location: params.location || null,
    delivery_message: params.instructions || null,
    provider_last_status: params.status || internalStatus,
    provider_meta: params.payload,
    updated_at: new Date(),
  }
  if (!order.awb_number && params.trackingReference) {
    updateData.awb_number = params.trackingReference
  }

  await params.tx.update(b2b_orders).set(updateData).where(eq(b2b_orders.id, order.id))

  await notifyOrderStatusEmail({
    order,
    nextStatus: internalStatus,
    previousStatus,
    rawStatus: params.status,
    location: params.location,
    remarks: params.instructions,
    source: 'delhivery_b2b_webhook',
  })

  const webhookData = {
    order_id: order.id,
    order_number: order.order_number,
    awb_number: order.awb_number || params.trackingReference,
    status: internalStatus,
    raw_status: params.status,
    status_type: params.statusType,
    status_code: params.statusCode,
    courier_partner: order.courier_partner || 'Delhivery B2B',
    provider_reference: order.provider_reference || params.trackingReference,
    location: params.location || null,
    remarks: params.instructions || null,
    order_type: 'b2b',
  }

  await sendWebhookEvent(order.user_id, 'tracking.updated', webhookData).catch((error) => {
    console.error('Failed to send Delhivery B2B tracking.updated webhook:', error)
  })
  if (internalStatus !== previousStatus) {
    await sendWebhookEvent(
      order.user_id,
      delhiveryWebhookEventForStatus(internalStatus) as any,
      webhookData,
    ).catch((error) => {
      console.error('Failed to send Delhivery B2B status webhook:', error)
    })
  }

  if (internalStatus === 'delivered' && order.order_type === 'cod') {
    await createCodRemittance({
      orderId: order.id,
      orderType: 'b2b',
      userId: order.user_id,
      orderNumber: order.order_number,
      awbNumber: order.awb_number || params.trackingReference || undefined,
      courierPartner: order.courier_partner || 'Delhivery B2B',
      codAmount: Number(order.order_amount || 0),
      codCharges: Number(order.cod_charges || 0),
      freightCharges: Number(order.freight_charges ?? order.shipping_charges ?? 0),
      collectedAt: new Date(),
    }).catch((error) => {
      console.error('Failed to create Delhivery B2B COD remittance:', error)
    })
  }

  return { success: true, orderType: 'b2b' as const, reason: undefined }
}

export async function processDelhiveryWebhook(payload: any, tx = db) {
  const shipment = payload?.Shipment || payload?.shipment || payload || {}
  const statusInfo =
    shipment?.Status ||
    shipment?.status_detail ||
    shipment?.statusDetails ||
    payload?.Status ||
    payload?.status_detail ||
    payload?.statusDetails ||
    {}

  const waybill = pickWebhookText(
    shipment?.AWB,
    shipment?.Waybill,
    shipment?.awb,
    shipment?.waybill,
    shipment?.wbn,
    shipment?.awb_number,
    shipment?.LRN,
    shipment?.lrn,
    shipment?.lrnum,
    shipment?.lr_number,
    payload?.AWB,
    payload?.Waybill,
    payload?.awb,
    payload?.waybill,
    payload?.wbn,
    payload?.awb_number,
    payload?.LRN,
    payload?.lrn,
    payload?.lrnum,
    payload?.lr_number,
  )
  const referenceNo =
    pickWebhookText(
      shipment?.ReferenceNo,
      shipment?.ReferenceNumber,
      shipment?.reference_no,
      shipment?.order,
      shipment?.order_number,
      shipment?.orderNumber,
      payload?.ReferenceNo,
      payload?.ReferenceNumber,
      payload?.reference_no,
      payload?.order_number,
      payload?.orderNumber,
      payload?.order,
    ) || null
  const status = pickWebhookText(
    statusInfo?.Status,
    statusInfo?.status,
    statusInfo?.ScanStatus,
    shipment?.current_status,
    shipment?.status,
    payload?.current_status,
    payload?.status,
    payload?.event,
  )
  const status_type = pickWebhookText(
    statusInfo?.StatusType,
    statusInfo?.status_type,
    statusInfo?.ScanType,
    payload?.StatusType,
    payload?.status_type,
    payload?.scan_type,
  )
  const location = pickWebhookText(
    statusInfo?.StatusLocation,
    statusInfo?.StatusLocationName,
    statusInfo?.ScanLocation,
    statusInfo?.location,
    payload?.location,
  )
  const instructions = pickWebhookText(
    statusInfo?.Instructions,
    statusInfo?.instructions,
    statusInfo?.StatusAction,
    statusInfo?.Remarks,
    shipment?.Instructions,
    shipment?.Remarks,
    payload?.instructions,
    payload?.remarks,
    payload?.message,
  )
  const statusCode = pickWebhookText(
    statusInfo?.StatusCode,
    statusInfo?.status_code,
    statusInfo?.NSLCode,
    statusInfo?.nsl_code,
    shipment?.StatusCode,
    shipment?.status_code,
    shipment?.NSLCode,
    shipment?.nsl_code,
    payload?.StatusCode,
    payload?.status_code,
    payload?.NSLCode,
    payload?.nsl_code,
  )

  if (!waybill) return { success: false, reason: 'missing_awb' }

  let [order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.awb_number, waybill))
  if (!order && referenceNo) {
    ;[order] = await tx
      .select()
      .from(b2c_orders)
      .where(eq(b2c_orders.order_number, String(referenceNo)))
  }
  if (!order) {
    const b2bResult = await processDelhiveryB2BWebhook({
      payload,
      tx,
      trackingReference: waybill,
      orderReference: referenceNo,
      status,
      statusType: status_type,
      statusCode,
      location,
      instructions,
    })
    if (b2bResult) return b2bResult
  }
  if (!order) {
    console.warn(`⚠️ No local order found for AWB ${waybill}`)
    return { success: false, reason: 'order_not_found' }
  }

  // 🔹 Map Delhivery → internal status
  // Reference: Delhivery Webhook Documentation
  // Forward Shipment: UD (Manifested, Not Picked, In Transit, Pending, Dispatched) → DL (Delivered)
  // Return Shipment: RT (In Transit, Pending, Dispatched) → DL (RTO)
  // Reverse Shipment: PP (Open, Scheduled, Dispatched) → PU (In Transit, Pending, Dispatched) → DL (DTO)
  const mapStatus = (
    type?: string,
    s?: string,
    instructionText?: string,
    statusCodeText?: string,
  ): string => {
    const t = type?.toUpperCase()
    const st = s?.toLowerCase() || ''
    const instruction = instructionText?.toLowerCase() || ''
    const combined = `${st} ${instruction}`.trim()
    const hasNdrStatusSignal =
      hasNdrSignal(st, t, instruction, statusCodeText) ||
      hasDelhiveryNdrStatusCode(statusCodeText)

    // Delhivery sometimes reports refusal / reattempt cases as text that still
    // contains "order cancelled". Those are delivery exceptions, not terminal
    // shipment cancellations, so let the NDR classifier win first.
    if (
      hasNdrStatusSignal &&
      !instruction.includes('seller cancelled') &&
      !instruction.includes('seller canceled') &&
      !instruction.includes('shipment has been cancelled') &&
      !instruction.includes('shipment has been canceled')
    ) {
      return 'ndr'
    }

    if (
      combined.includes('cancelled') ||
      combined.includes('canceled') ||
      instruction.includes('seller cancelled') ||
      instruction.includes('seller canceled') ||
      instruction.includes('shipment has been cancelled') ||
      instruction.includes('shipment has been canceled')
    ) {
      return 'cancelled'
    }

    // Some Delhivery events arrive as simple status-only payloads without StatusType.
    if (st === 'booked' || st === 'booking confirmed' || st === 'manifest created') {
      return 'booked'
    }
    if (st === 'manifested') return 'shipment_created'
    if (st === 'not picked' || st === 'pickup scheduled' || st === 'pickup requested') {
      return 'pickup_initiated'
    }
    if (st === 'in transit') return 'in_transit'
    if (st === 'pending') return 'in_transit'
    if (st === 'dispatched' || st === 'out for delivery') return 'out_for_delivery'
    if (st === 'delivered') return 'delivered'
    if (st === 'rto') return 'rto_delivered'
    if (st === 'dto') return 'delivered'

    // Forward Shipment Statuses (UD)
    if (t === 'UD') {
      if (st === 'manifested') return 'shipment_created'
      if (st === 'not picked') return 'pickup_initiated'
      if (st === 'in transit') return 'in_transit'
      if (st === 'pending') return 'in_transit' // Reached destination city, not yet dispatched
      if (st === 'dispatched') return 'out_for_delivery'
    }

    // Delivery Statuses (DL)
    if (t === 'DL') {
      if (st === 'delivered') return 'delivered' // Forward shipment delivered
      if (st === 'dto') return 'delivered' // Reverse shipment accepted (DTO = Delivered To Origin)
      if (st === 'rto') return 'rto_delivered' // Return shipment delivered to origin
    }

    // Return Shipment Statuses (RT)
    if (t === 'RT') {
      if (st === 'in transit') return 'rto_in_transit' // Forward shipment converted to return, in transit
      if (st === 'pending') return 'rto' // Reached DC nearest to origin
      if (st === 'dispatched') return 'rto_in_transit' // Dispatched for delivery to origin
    }

    // NDR handling for Delhivery
    if (t === 'ND') {
      return 'ndr'
    }

    // Reverse Shipment - Pickup Request Statuses (PP)
    if (t === 'PP') {
      if (st === 'open') return 'pickup_initiated' // Pickup request created
      if (st === 'scheduled') return 'pickup_initiated' // Pickup request scheduled
      if (st === 'dispatched') return 'out_for_delivery' // FE out in field to collect package
    }

    // Reverse Shipment - Pickup In Transit Statuses (PU)
    if (t === 'PU') {
      if (st === 'in transit') return 'in_transit' // In transit to RPC from DC after physical pickup
      if (st === 'pending') return 'in_transit' // Reached RPC but not yet dispatched
      if (st === 'dispatched') return 'out_for_delivery' // Dispatched for delivery to client from RPC
    }

    // Cancellation Statuses (CN)
    if (t === 'CN') {
      if (st === 'canceled' || st === 'cancelled') return 'cancelled' // Canceled before pickup
      if (st === 'closed') return 'cancelled' // Canceled and request closed
      return 'cancelled' // Default for any CN status
    }

    return 'in_transit' // Default fallback
  }

  let internalStatus = mapStatus(status_type, status, instructions, statusCode)

  // Map any pending_pickup status to pickup_initiated
  if (internalStatus === 'pending_pickup') {
    internalStatus = 'pickup_initiated'
  }

  console.log(
    `📦 Delhivery Webhook: ${waybill} → ${status} (${status_type}${
      statusCode ? `/${statusCode}` : ''
    }) → ${internalStatus}`,
  )

  const currentStatus = (order.order_status || '').toLowerCase()
  if (currentStatus === 'cancellation_requested') {
    if (internalStatus === 'cancelled' || status_type?.toUpperCase() === 'RT') {
      // Delhivery moves cancelled COD/prepaid shipments into its RT return
      // lifecycle; CN is used for cancelled pickup shipments.
      internalStatus = 'cancelled'
    } else {
      console.log(
        `Holding Delhivery cancellation request for ${order.order_number}: ${status} (${status_type}) is not cancellation confirmation`,
      )
      return {
        success: true,
        ignored: true,
        reason: 'cancellation_awaiting_provider_confirmation',
      }
    }
  }
  const currentManifestError = String(order.manifest_error || '').trim()
  const hasExistingAwb = String(order.awb_number || '').trim().length > 0
  const manifestReference = String(order.manifest || '').trim()
  const hasLocalManifest =
    manifestReference.length > 0 &&
    (/^https?:\/\//i.test(manifestReference) ||
      manifestReference.includes('/') ||
      manifestReference.toLowerCase().includes('manifest') ||
      manifestReference.toLowerCase().endsWith('.pdf'))
  if (
    currentStatus === 'cancelled' &&
    internalStatus !== 'cancelled' &&
    internalStatus !== 'rto' &&
    internalStatus !== 'rto_in_transit' &&
    internalStatus !== 'rto_delivered'
  ) {
    console.log(
      `⏭️ Ignoring Delhivery webhook status regression for cancelled order ${order.order_number}: ${status} (${status_type}) would map to ${internalStatus}`,
    )
    return {
      success: true,
      ignored: true,
      reason: 'cancelled_order_status_regression',
    }
  }

  if (
    currentStatus === 'manifest_failed' &&
    currentManifestError &&
    !hasExistingAwb &&
    (internalStatus === 'booked' || internalStatus === 'pickup_initiated')
  ) {
    console.log(
      `⏭️ Ignoring Delhivery webhook status regression for manifest_failed order ${order.order_number}: ${status} (${status_type}) would map to ${internalStatus}`,
    )
    return {
      success: true,
      ignored: true,
      reason: 'manifest_failed_status_regression',
    }
  }

  const shouldHoldPreManifestStatus =
    !hasLocalManifest &&
    ['booked', 'shipment_created'].includes(currentStatus || 'booked') &&
    ['shipment_created', 'pickup_initiated'].includes(internalStatus)

  if (shouldHoldPreManifestStatus) {
    console.log(
      `Holding Delhivery pre-manifest status for order ${order.order_number}: provider ${status} (${status_type}) mapped to ${internalStatus}, local remains ${
        currentStatus || 'booked'
      }`,
    )
  }

  await tx.transaction(async (innerTx) => {
    // 1️⃣ Update base order status
    const nextOrderStatus = shouldHoldPreManifestStatus ? currentStatus || 'booked' : internalStatus
    const updateData: any = {
      order_status: nextOrderStatus,
      delivery_location: location || null,
      delivery_message: instructions || null,
      provider_last_status: status || internalStatus,
      updated_at: new Date(),
    }

    if (currentStatus === 'cancellation_requested' && internalStatus === 'cancelled') {
      const existingProviderMeta: Record<string, any> =
        order.provider_meta && typeof order.provider_meta === 'object'
          ? (order.provider_meta as Record<string, any>)
          : {}
      updateData.pickup_status = 'cancelled'
      updateData.provider_meta = {
        ...existingProviderMeta,
        cancellation: {
          ...(existingProviderMeta.cancellation || {}),
          confirmed_at: new Date().toISOString(),
          confirmation_source: 'delhivery_webhook',
          pending: false,
        },
      }
    }

    if (
      !shouldHoldPreManifestStatus &&
      (internalStatus === 'pickup_initiated' || internalStatus === 'booked')
    ) {
      updateData.manifest_error = null
      updateData.pickup_error = null
      updateData.pickup_status = internalStatus
    }

    if (!order.awb_number && waybill) {
      updateData.awb_number = String(waybill)
    }

    // 🔹 Capture courier cost if available from Delhivery webhook (for revenue calculation)
    // Check various possible field names from Delhivery webhook
    if (
      shipment?.Charge !== undefined ||
      shipment?.Amount !== undefined ||
      shipment?.BillingAmount !== undefined ||
      shipment?.TotalCharge !== undefined ||
      shipment?.FreightCharges !== undefined ||
      shipment?.cost !== undefined
    ) {
      const courierCost =
        shipment?.Charge ||
        shipment?.Amount ||
        shipment?.BillingAmount ||
        shipment?.TotalCharge ||
        shipment?.FreightCharges ||
        shipment?.cost
      if (courierCost !== null && courierCost !== undefined) {
        updateData.courier_cost = Number(courierCost)
        console.log(
          `💰 Captured Delhivery courier cost ₹${courierCost} for order ${order.order_number}`,
        )
      }
    }

    // 🔹 Capture weight data from Delhivery webhook if available
    const scans = shipment?.Scans || shipment?.scans || payload?.Scans || payload?.scans
    const firstScan = Array.isArray(scans)
      ? scans[0]?.ScanDetail || scans[0]?.scan_detail || scans[0]
      : scans?.ScanDetail || scans?.scan_detail || scans
    const scannedWeight = pickWebhookText(
      firstScan?.ScannedWeight,
      firstScan?.scanned_weight,
      shipment?.ScannedWeight,
      shipment?.scanned_weight,
      payload?.ScannedWeight,
      payload?.scanned_weight,
    )
    const chargedWeight = pickWebhookText(
      shipment?.ChargedWeight,
      shipment?.charged_weight,
      shipment?.ChargeableWeight,
      shipment?.chargeable_weight,
      payload?.ChargedWeight,
      payload?.charged_weight,
      payload?.ChargeableWeight,
      payload?.chargeable_weight,
      scannedWeight,
    )
    const volumetricWeight = pickWebhookText(
      shipment?.VolumetricWeight,
      shipment?.volumetric_weight,
      payload?.VolumetricWeight,
      payload?.volumetric_weight,
    )
    const chargedWeightGrams = normalizeWebhookWeightGrams(chargedWeight)
    const volumetricWeightGrams = normalizeWebhookWeightGrams(volumetricWeight)
    const scannedWeightGrams = normalizeWebhookWeightGrams(scannedWeight)

    if (chargedWeightGrams || volumetricWeightGrams || scannedWeightGrams) {
      if (chargedWeightGrams) updateData.charged_weight = chargedWeightGrams
      if (volumetricWeightGrams) updateData.volumetric_weight = volumetricWeightGrams
      if (scannedWeightGrams && !updateData.actual_weight)
        updateData.actual_weight = scannedWeightGrams

      // Check for weight discrepancy
      const finalChargedWeight = chargedWeightGrams
      const declaredWeight = normalizeWebhookWeightGrams(order.weight) || Number(order.weight)

      if (
        finalChargedWeight &&
        declaredWeight &&
        Math.abs(finalChargedWeight - declaredWeight) > 10
      ) {
        updateData.weight_discrepancy = true

        // Create weight discrepancy record
        try {
          await createWeightDiscrepancy({
            orderType: 'b2c',
            orderId: order.id,
            userId: order.user_id,
            orderNumber: order.order_number,
            awbNumber: order.awb_number || undefined,
            courierPartner: 'Delhivery',
            declaredWeight,
            actualWeight: scannedWeightGrams || undefined,
            volumetricWeight: volumetricWeightGrams || undefined,
            chargedWeight: finalChargedWeight,
            declaredDimensions: {
              length: Number(order.length || 0),
              breadth: Number(order.breadth || 0),
              height: Number(order.height || 0),
            },
            originalShippingCharge: Number(order.shipping_charges || 0),
            courierRemarks: shipment?.Status?.Instructions,
          })
          console.log(
            `⚖️ Weight discrepancy detected for order ${order.order_number}: ${declaredWeight}g → ${finalChargedWeight}g`,
          )
        } catch (err) {
          console.error(`❌ Failed to create weight discrepancy record:`, err)
        }
      }
    }

    await innerTx.update(b2c_orders).set(updateData).where(eq(b2c_orders.id, order.id))
    await syncShopifyStatusForLocalOrder({ ...order, ...updateData }, innerTx).catch((err) => {
      console.warn('⚠️ Failed Shopify status sync for Delhivery webhook:', err)
    })
    await syncWooCommerceStatusForLocalOrder({ ...order, ...updateData }, innerTx).catch((err) => {
      console.warn('Failed WooCommerce status sync for Delhivery webhook:', err)
    })
    // 🔔 NDR capture for Delhivery
    const statusLower = (internalStatus || '').toLowerCase()
    const isNdr =
      ['ndr', 'undelivered'].includes(statusLower) ||
      hasNdrSignal(statusLower, status, status_type, instructions, statusCode) ||
      hasDelhiveryNdrStatusCode(statusCode)
    if (isNdr) {
      try {
        await captureNdrEventFromWebhook({
          order,
          awbNumber: order.awb_number || undefined,
          status: statusLower,
          reason: pickWebhookText(statusInfo?.Instructions, instructions, statusCode) || null,
          remarks: pickWebhookText(statusInfo?.Status, status, statusCode) || null,
          attemptNo:
            pickWebhookText(
              shipment?.AttemptedCount,
              shipment?.attempted_count,
              statusInfo?.AttemptedCount,
              statusInfo?.attempted_count,
              payload?.AttemptedCount,
              payload?.attempted_count,
            ) || null,
          payload,
          courierLabel: 'Delhivery',
          signalParts: [status, status_type, instructions, statusCode],
        })
      } catch (e) {
        console.error('❌ Failed to record NDR event (Delhivery):', e)
      }
    }

    // 🔔 RTO capture for Delhivery
    const isRto = ['rto', 'rto_in_transit', 'rto_delivered'].includes(statusLower)
    if (isRto) {
      try {
        const rtoCharge = await applyRtoChargeOnce(innerTx, order, 'Delhivery')
        await recordRtoEvent({
          orderId: order.id,
          userId: order.user_id,
          awbNumber: order.awb_number || undefined,
          status: statusLower,
          reason: shipment?.Status?.Instructions || null,
          remarks: shipment?.Status?.Status || null,
          rtoCharges: rtoCharge,
          payload,
        })
        await createNotificationService({
          targetRole: 'user',
          userId: order.user_id,
          title: 'RTO update (Delhivery)',
          message: `Order ${order.order_number} status updated: ${statusLower}.`,
        })
        await createNotificationService({
          targetRole: 'admin',
          title: 'RTO event (Delhivery)',
          message: `User ${order.user_id} order ${order.order_number} ${statusLower}`,
        })
      } catch (e) {
        console.error('❌ Failed to record RTO event (Delhivery):', e)
      }
    }

    // 2️⃣ Delivered → Create COD remittance (if COD order)
    if (internalStatus === 'delivered' && order.order_type === 'cod') {
      try {
        console.log(`💰 Creating COD remittance for Delhivery order ${order.order_number}`)

        const { remittance, created } = await createCodRemittance({
          orderId: order.id,
          orderType: 'b2c',
          userId: order.user_id,
          orderNumber: order.order_number,
          awbNumber: order.awb_number || undefined,
          courierPartner: order.courier_partner || 'Delhivery',
          codAmount: Number(order.order_amount || 0),
          codCharges: Number(order.cod_charges || 0),
          freightCharges: Number(order.freight_charges ?? order.shipping_charges ?? 0),
          collectedAt: new Date(),
        })

        if (created) {
          await createNotificationService({
            targetRole: 'admin',
            title: 'COD remittance created',
            message: `Order ${order.order_number} (${order.awb_number || 'no AWB'}) created pending COD remittance of ₹${Number(
              remittance.remittableAmount || 0,
            ).toFixed(2)}.`,
          })
        }

        console.log(`✅ COD remittance created for Delhivery order ${order.order_number}`)
      } catch (err) {
        console.error(`❌ Failed to create COD remittance for order ${order.order_number}:`, err)
      }
    }

    // 3️⃣ Cancelled → Refund wallet
  if (internalStatus === 'cancelled') {
      await applyCancellationRefundOnce(innerTx, order, 'delhivery_webhook')
    }
  })

  await notifyOrderStatusEmail({
    order,
    nextStatus: shouldHoldPreManifestStatus ? currentStatus || 'booked' : internalStatus,
    previousStatus: currentStatus,
    rawStatus: status,
    location,
    remarks: instructions,
    source: 'delhivery_webhook',
  })

  try {
    await logTrackingEvent({
      orderId: order.id,
      userId: order.user_id,
      awbNumber: waybill || order.awb_number || undefined,
      courier: 'Delhivery',
      statusCode: shouldHoldPreManifestStatus ? currentStatus || 'booked' : internalStatus,
      statusText: status,
      location,
      raw: payload,
    })
  } catch (e) {
    console.error('Failed to log tracking event (Delhivery):', e)
  }

  return { success: true }
}

/**
 * Process Delhivery Document Push Webhook (POD, Sorter Image, QC Image)
 * According to Delhivery documentation, document push webhooks are separate from scan push webhooks
 */
export async function processDelhiveryDocumentWebhook(
  payload: any,
  documentType: string | null,
  tx = db,
) {
  const shipment = payload?.Shipment || payload
  const waybill = pickWebhookText(
    shipment?.AWB,
    shipment?.Waybill,
    shipment?.awb,
    shipment?.waybill,
    shipment?.wbn,
    shipment?.awb_number,
    shipment?.LRN,
    shipment?.lrn,
    shipment?.lrnum,
    shipment?.lr_number,
    payload?.AWB,
    payload?.Waybill,
    payload?.awb,
    payload?.waybill,
    payload?.wbn,
    payload?.awb_number,
    payload?.LRN,
    payload?.lrn,
    payload?.lrnum,
    payload?.lr_number,
  )

  if (!waybill) {
    return { success: false, reason: 'missing_awb' }
  }

  let orderType: 'b2c' | 'b2b' = 'b2c'
  let order: any
  ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.awb_number, waybill))
  if (!order) {
    ;[order] = await tx
      .select()
      .from(b2b_orders)
      .where(
        or(
          eq(b2b_orders.awb_number, waybill),
          eq(b2b_orders.provider_reference, waybill),
          eq(b2b_orders.shipment_id, waybill),
          eq(b2b_orders.order_id, waybill),
        )!,
      )
      .limit(1)
    if (order) orderType = 'b2b'
  }
  if (!order) {
    console.warn(`⚠️ No local order found for AWB ${waybill} (document webhook)`)
    return { success: false, reason: 'order_not_found' }
  }

  // Extract document URLs based on document type
  let documentUrl: string | null = null
  const docType = (documentType || '').toLowerCase()

  if (docType === 'pod' || docType === 'poddocument') {
    documentUrl =
      shipment?.PODDocument ||
      payload?.PODDocument ||
      shipment?.POD?.DocumentURL ||
      payload?.POD?.DocumentURL ||
      shipment?.DocumentURL ||
      payload?.DocumentURL
  } else if (docType === 'sorterimage' || docType === 'sorter') {
    documentUrl =
      shipment?.SorterImage ||
      payload?.SorterImage ||
      shipment?.Sorter?.ImageURL ||
      payload?.Sorter?.ImageURL ||
      shipment?.ImageURL ||
      payload?.ImageURL
  } else if (docType === 'qcimage' || docType === 'qc') {
    documentUrl =
      shipment?.QCImage ||
      payload?.QCImage ||
      shipment?.QC?.ImageURL ||
      payload?.QC?.ImageURL ||
      shipment?.ImageURL ||
      payload?.ImageURL
  } else {
    // Generic document URL extraction
    documentUrl =
      shipment?.DocumentURL ||
      payload?.DocumentURL ||
      shipment?.ImageURL ||
      payload?.ImageURL ||
      shipment?.URL ||
      payload?.URL
  }

  if (!documentUrl) {
    console.warn(`⚠️ No document URL found in Delhivery document webhook for AWB ${waybill}`)
    return { success: false, reason: 'missing_document_url' }
  }

  console.log(
    `📄 Processing Delhivery ${
      documentType || 'document'
    } webhook for AWB ${waybill}, URL: ${documentUrl}`,
  )

  try {
    await tx.transaction(async (innerTx) => {
      // Store document URL in order metadata or delivery_message field
      // Note: You may want to add a dedicated field for POD/document URLs in the schema
      const updateData: any = {
        updated_at: new Date(),
      }

      if (orderType === 'b2b') {
        updateData.provider_meta = {
          ...(order.provider_meta || {}),
          documents: {
            ...((order.provider_meta as any)?.documents || {}),
            [documentType || 'document']: documentUrl,
          },
        }
      }

      // Store in delivery_message if it's POD, otherwise append to existing message
      if (docType === 'pod' || docType === 'poddocument') {
        const existingMessage = order.delivery_message || ''
        updateData.delivery_message = existingMessage
          ? `${existingMessage}\nPOD Document: ${documentUrl}`
          : `POD Document: ${documentUrl}`
      }

      // Log the document for tracking
      if (orderType === 'b2c') {
        await logTrackingEvent({
          orderId: order.id,
          userId: order.user_id,
          awbNumber: order.awb_number,
          courier: 'Delhivery',
          statusCode: 'document_received',
          statusText: `${documentType || 'Document'} received`,
          location: null,
          raw: {
            documentType,
            documentUrl,
            payload,
          },
        })
        await innerTx.update(b2c_orders).set(updateData).where(eq(b2c_orders.id, order.id))
      } else {
        await innerTx.update(b2b_orders).set(updateData).where(eq(b2b_orders.id, order.id))
      }

      // Create notification for document received
      await createNotificationService({
        targetRole: 'user',
        userId: order.user_id,
        title: `${documentType || 'Document'} received (Delhivery)`,
        message: `Order ${order.order_number} - ${
          documentType || 'Document'
        } document is now available.`,
      })

      // Also notify admins so POD/document events are visible in admin notification center.
      await createNotificationService({
        targetRole: 'admin',
        title: `${documentType || 'Document'} received (Delhivery)`,
        message: `Order ${order.order_number} (${order.awb_number || waybill}) - ${
          documentType || 'Document'
        } document received.`,
      })

      console.log(
        `✅ Delhivery ${
          documentType || 'document'
        } webhook processed successfully for AWB ${waybill}`,
      )
    })

    return { success: true }
  } catch (error: any) {
    console.error(
      `❌ Failed to process Delhivery document webhook for AWB ${waybill}:`,
      error?.message || error,
    )
    return { success: false, reason: 'processing_error' }
  }
}

// =========================
// Ekart Webhook Processing
// =========================
const mapEkartStatus = (...parts: unknown[]): string => {
  const s = normalizeWebhookText(...parts)
  if (!s) return ''
  if (s.includes('cancel')) return 'cancelled'
  if (s.includes('rto delivered') || s.includes('return delivered')) return 'rto_delivered'
  if (s.includes('rto') || s.includes('return to origin') || s.includes('return in transit')) {
    return 'rto_in_transit'
  }
  if (
    s.includes('ndr') ||
    s.includes('undelivered') ||
    s.includes('not delivered') ||
    s.includes('delivery attempted') ||
    s.includes('attempt failed')
  ) {
    return 'ndr'
  }
  if (s.includes('delivered')) return 'delivered'
  if (s.includes('out for delivery') || s.includes('ofd')) return 'out_for_delivery'
  if (
    s.includes('order placed') ||
    s.includes('consignment manifested') ||
    s.includes('manifest') ||
    s.includes('pickup scheduled') ||
    s.includes('pickup requested') ||
    s.includes('pickup') ||
    s.includes('created')
  ) {
    return 'pickup_initiated'
  }
  if (s.includes('transit') || s.includes('dispatched') || s.includes('shipped')) return 'in_transit'
  return ''
}

const isEkartReverseOrder = (order: any) =>
  normalizeComparableText(order?.order_type).replace(/\s+/g, '_') === 'reverse'

const normalizeEkartReverseWebhookStatus = (order: any, mappedStatus: string, ...parts: unknown[]) => {
  if (!isEkartReverseOrder(order)) return mappedStatus

  const s = normalizeWebhookText(...parts)
  if (
    !s ||
    s.includes('order placed') ||
    s.includes('created') ||
    s.includes('shipment created') ||
    s.includes('manifest') ||
    s.includes('manifested') ||
    s.includes('consignment manifested')
  ) {
    return 'booked'
  }

  return mappedStatus
}

const preserveEkartStatusTransition = (currentStatus: unknown, nextStatus: string) => {
  const current = normalizeComparableText(currentStatus).replace(/\s+/g, '_')
  const next = normalizeComparableText(nextStatus).replace(/\s+/g, '_')
  if (!current) return next || 'in_transit'

  if (
    ['cancelled', 'delivered', 'rto_delivered'].includes(current) &&
    !['cancelled', 'delivered', 'rto_delivered'].includes(next)
  ) {
    return current
  }

  if (current.startsWith('rto') && !next.startsWith('rto') && next !== 'cancelled') {
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

  if (rank[current] !== undefined && rank[next] !== undefined && rank[next] < rank[current]) {
    return current
  }

  return next || current || 'in_transit'
}

const ekartWebhookEventForStatus = (status: string) => {
  if (status === 'delivered') return 'order.delivered'
  if (status === 'cancelled') return 'order.cancelled'
  if (['ndr', 'undelivered', 'lost'].includes(status)) return 'order.failed'
  if (status.startsWith('rto')) return 'order.rto'
  if (['pickup_initiated', 'in_transit', 'out_for_delivery'].includes(status)) return 'order.shipped'
  return 'order.updated'
}

const collectEkartValuesByKeys = (
  node: any,
  keys: Set<string>,
  seen = new WeakSet<object>(),
): any[] => {
  if (!node || typeof node !== 'object') return []
  if (seen.has(node)) return []
  seen.add(node)

  const values: any[] = []
  for (const [key, value] of Object.entries(node)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '')
    if (keys.has(normalizedKey)) values.push(value)
    if (value && typeof value === 'object') {
      values.push(...collectEkartValuesByKeys(value, keys, seen))
    }
  }

  return values
}

const pickFirstEkartWeight = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = normalizeWebhookWeightGrams(value)
    if (parsed !== null) return parsed
  }
  return null
}

const extractEkartWeightSnapshot = (payload: any) => {
  const chargedWeight = pickFirstEkartWeight(
    ...collectEkartValuesByKeys(
      payload,
      new Set([
        'chargedweight',
        'chargeableweight',
        'billingweight',
        'billedweight',
        'finalweight',
      ]),
    ),
  )
  const actualWeight = pickFirstEkartWeight(
    ...collectEkartValuesByKeys(
      payload,
      new Set([
        'actualweight',
        'deadweight',
        'physicalweight',
        'scannedweight',
        'pickupweight',
      ]),
    ),
  )
  const volumetricWeight = pickFirstEkartWeight(
    ...collectEkartValuesByKeys(
      payload,
      new Set(['volumetricweight', 'volweight', 'volumeweight']),
    ),
  )
  const remarks = collectEkartValuesByKeys(
    payload,
    new Set(['weightremarks', 'weightremark', 'weightmessage', 'weightcomment']),
  )
    .map((value) => String(value || '').trim())
    .find(Boolean)

  return {
    chargedWeight,
    actualWeight,
    volumetricWeight,
    remarks: remarks || undefined,
  }
}

const unwrapXpressbeesPayload = (payload: any) => {
  if (payload?.__provider === 'xpressbees' && payload?.body) {
    return payload.body
  }
  if (Array.isArray(payload?.data) && payload.data.length > 0) {
    return payload.data[0]
  }
  if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data
  }
  return payload
}

const mapXpressbeesStatus = (status: string): string => {
  const s = (status || '').toLowerCase().trim()
  if (!s) return ''
  if (['success', 'successful', 'ok', 'true', 'false'].includes(s)) return ''
  if (s.includes('cancel')) return 'cancelled'
  if (s.includes('ndr') || s.includes('undelivered') || s.includes('attempt')) return 'ndr'
  if (s.includes('rto') && s.includes('deliver')) return 'rto_delivered'
  if (s.includes('rto')) return 'rto_in_transit'
  if (s.includes('out for delivery') || s.includes('ofd')) return 'out_for_delivery'
  if (s.includes('deliver')) return 'delivered'
  if (
    s.includes('pickup scheduled') ||
    s.includes('pickup requested') ||
    s.includes('pickup assigned') ||
    s.includes('assigned for pickup') ||
    s.includes('out for pickup') ||
    s.includes('pickup booked') ||
    s.includes('manifest') ||
    s.includes('picked') ||
    s.includes('data received') ||
    s.includes('information received') ||
    s.includes('shipment created') ||
    s.includes('shipment booked') ||
    ['drc', 'pnd', 'pck', 'pku', 'pkd', 'pickup', 'manifested'].includes(s)
  ) return 'pickup_initiated'
  if (s.includes('booked') || s.includes('created') || s.includes('order placed')) return 'booked'
  if (
    s.includes('in transit') ||
    s.includes('dispatched') ||
    s.includes('bagged') ||
    s.includes('reached at') ||
    s.includes('arrived at') ||
    s.includes('departed') ||
    ['it', 'itran', 'rad', 'ship', 'shipped'].includes(s)
  ) return 'in_transit'
  return ''
}

const hasXpressbeesStatusToken = (status: string, token: string) =>
  new RegExp(`(^|\\s)${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(
    String(status || '').toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(),
  )

const isXpressbeesPickupStageRawStatus = (...parts: unknown[]) => {
  const status = parts
    .map((part) => String(part || '').trim().toLowerCase())
    .filter(Boolean)
    .join(' | ')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')

  return Boolean(status) &&
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
      hasXpressbeesStatusToken(status, 'pp') ||
      hasXpressbeesStatusToken(status, 'drc') ||
      hasXpressbeesStatusToken(status, 'pnd') ||
      hasXpressbeesStatusToken(status, 'pck') ||
      hasXpressbeesStatusToken(status, 'pku') ||
      hasXpressbeesStatusToken(status, 'pkd')
    )
}

const isXpressbeesPickupProgressStatus = (status: string) =>
  [
    'pickup_initiated',
    'in_transit',
    'out_for_delivery',
    'delivered',
    'ndr',
    'rto',
    'rto_in_transit',
    'rto_delivered',
  ].includes(String(status || '').trim().toLowerCase())

const preserveXpressbeesStatusTransition = (
  currentStatus: unknown,
  mappedStatus: string,
  rawStatus?: unknown,
) => {
  const current = normalizeComparableText(currentStatus).replace(/\s+/g, '_')
  const mapped = normalizeComparableText(mappedStatus).replace(/\s+/g, '_')
  if (!mapped) return current || 'pickup_initiated'

  if (
    ['cancelled', 'delivered', 'rto_delivered'].includes(current) &&
    !['cancelled', 'delivered', 'rto_delivered'].includes(mapped)
  ) {
    return current
  }

  if (current.startsWith('rto') && !mapped.startsWith('rto') && mapped !== 'cancelled') {
    return current
  }

  if (
    mapped === 'pickup_initiated' &&
    isXpressbeesPickupStageRawStatus(rawStatus) &&
    !['cancelled', 'delivered', 'rto_delivered'].includes(current) &&
    !current.startsWith('rto')
  ) {
    return 'pickup_initiated'
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

const xpressbeesWebhookEventForStatus = (status: string) => {
  if (status === 'delivered') return 'order.delivered'
  if (status === 'cancelled') return 'order.cancelled'
  if (['ndr', 'undelivered', 'lost'].includes(status)) return 'order.failed'
  if (status.startsWith('rto')) return 'order.rto'
  if (['pickup_initiated', 'in_transit', 'out_for_delivery'].includes(status)) return 'order.shipped'
  return 'order.updated'
}

export async function processEkartWebhook(payload: any, tx = db) {
  const event = payload?.track_updated || payload?.track || payload?.data || payload || {}
  const awb = pickWebhookText(
    event?.tracking_id,
    event?.trackingId,
    event?.awb,
    event?.waybill,
    event?.wbn,
    event?.id,
    event?.barcodes?.wbn,
    payload?.tracking_id,
    payload?.trackingId,
    payload?.awb,
    payload?.waybill,
    payload?.wbn,
    payload?.id,
    payload?.barcodes?.wbn,
  )
  const orderRef = pickWebhookText(
    event?.orderNumber,
    event?.order_number,
    event?.order_id,
    event?.shipment_id,
    event?.client_order_id,
    event?.barcodes?.order,
    payload?.orderNumber,
    payload?.order_number,
    payload?.order_id,
    payload?.shipment_id,
    payload?.client_order_id,
    payload?.barcodes?.order,
  )
  const statusRaw = pickWebhookText(
    event?.current_status,
    event?.status,
    event?.event,
    event?.status_text,
    payload?.current_status,
    payload?.status,
    payload?.event,
    payload?.status_text,
  )
  const remarks = pickWebhookText(
    event?.desc,
    event?.description,
    event?.remarks,
    event?.remark,
    event?.message,
    payload?.desc,
    payload?.description,
    payload?.remarks,
    payload?.remark,
    payload?.message,
  )
  const location =
    pickWebhookText(
      event?.current_location,
      event?.location,
      event?.scan_location,
      event?.last_location,
      payload?.current_location,
      payload?.location,
      payload?.scan_location,
      payload?.last_location,
    ) || null

  if (!awb && !orderRef) return { success: false, reason: 'missing_awb' }

  let order: any
  if (awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.awb_number, awb))
  }
  if (!order && awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.shipment_id, awb))
  }
  if (!order && awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.provider_reference, awb))
  }
  if (!order && awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.provider_request_id, awb))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.order_number, orderRef))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.order_id, orderRef))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.shipment_id, orderRef))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.provider_reference, orderRef))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.provider_request_id, orderRef))
  }

  if (!order) {
    console.warn(`No local order found for Ekart AWB ${awb || 'N/A'} ref ${orderRef || 'N/A'}`)
    return { success: false, reason: 'order_not_found' }
  }

  const mappedStatus = normalizeEkartReverseWebhookStatus(
    order,
    mapEkartStatus(statusRaw, remarks, event?.ndrStatus, event?.ndrActions),
    statusRaw,
    remarks,
    event?.ndrStatus,
    event?.ndrActions,
  )
  const internalStatus = preserveEkartStatusTransition(order.order_status, mappedStatus)
  const previousStatus = normalizeComparableText(order.order_status).replace(/\s+/g, '_')
  const statusLower = internalStatus.toLowerCase()
  const statusText = statusRaw || remarks || internalStatus
  const ekartWeight = extractEkartWeightSnapshot(payload)
  const ekartProof = extractWeightProofFromWebhook(payload, 'ekart')
  const updateData: any = {
    order_status: internalStatus,
    delivery_location: location,
    delivery_message: remarks || statusRaw || null,
    provider_last_status: String(statusRaw || remarks || internalStatus || '').trim().slice(0, 80) || null,
    updated_at: new Date(),
  }

  if (internalStatus === 'pickup_initiated') {
    updateData.pickup_status = 'pickup_initiated'
    updateData.pickup_error = null
    updateData.manifest_error = null
  }

  if (payload?.courier_cost !== undefined) updateData.courier_cost = Number(payload.courier_cost)
  if (ekartWeight.chargedWeight !== null) updateData.charged_weight = ekartWeight.chargedWeight
  if (ekartWeight.volumetricWeight !== null) updateData.volumetric_weight = ekartWeight.volumetricWeight
  if (ekartWeight.actualWeight !== null) updateData.actual_weight = ekartWeight.actualWeight

  const declaredWeight = normalizeWebhookWeightGrams(order.weight) || Number(order.weight || 0)
  if (
    ekartWeight.chargedWeight !== null &&
    declaredWeight > 0 &&
    Math.abs(ekartWeight.chargedWeight - declaredWeight) > 10
  ) {
    updateData.weight_discrepancy = true

    try {
      await createWeightDiscrepancy({
        orderType: 'b2c',
        orderId: order.id,
        userId: order.user_id,
        orderNumber: order.order_number,
        awbNumber: order.awb_number || awb || undefined,
        courierPartner: 'Ekart Logistics',
        declaredWeight,
        actualWeight: ekartWeight.actualWeight || undefined,
        volumetricWeight: ekartWeight.volumetricWeight || undefined,
        chargedWeight: ekartWeight.chargedWeight,
        declaredDimensions: {
          length: Number(order.length || 0),
          breadth: Number(order.breadth || 0),
          height: Number(order.height || 0),
        },
        originalShippingCharge: Number(order.freight_charges ?? order.shipping_charges ?? 0),
        courierRemarks: ekartWeight.remarks || remarks || statusText || undefined,
        courierWeightSlipUrl: ekartProof.weightSlipUrl,
        courierWeightProofImages: ekartProof.weightImages,
        weighingMetadata: ekartProof.metadata as any,
      })
    } catch (err) {
      console.error('Failed to create Ekart weight discrepancy:', err)
    }
  }

  await tx.transaction(async (innerTx) => {
    await innerTx.update(b2c_orders).set(updateData).where(eq(b2c_orders.id, order.id))
    await syncShopifyStatusForLocalOrder({ ...order, ...updateData }, innerTx).catch((err) => {
      console.warn('Failed Shopify status sync for Ekart webhook:', err)
    })

    await syncWooCommerceStatusForLocalOrder({ ...order, ...updateData }, innerTx).catch((err) => {
      console.warn('Failed WooCommerce status sync for Ekart webhook:', err)
    })

    try {
      await logTrackingEvent({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: order.awb_number || awb,
        courier: 'Ekart Logistics',
        statusCode: statusRaw || internalStatus,
        statusText,
        location,
        raw: payload,
      })
    } catch (err: any) {
      console.error('Failed to log Ekart tracking event:', err)
    }

    if (internalStatus === 'pickup_initiated') {
      try {
        const [freshOrder] = await innerTx
          .select()
          .from(b2c_orders)
          .where(eq(b2c_orders.id, order.id))

        if (!freshOrder) {
          console.warn(`Order ${order.order_number} not found during Ekart webhook transaction`)
          return
        }

        let invoiceKey = freshOrder.invoice_link
        let invoiceNumberToStore = freshOrder.invoice_number
        let invoiceDateToStore = freshOrder.invoice_date
        let invoiceAmountToStore = freshOrder.invoice_amount

        if (!invoiceKey) {
          try {
            const invoiceResult = await generateInvoiceForOrderWebhook(freshOrder, innerTx)
            if (invoiceResult) {
              invoiceKey = invoiceResult.key
              invoiceNumberToStore = invoiceResult.invoiceNumber
              invoiceDateToStore = invoiceResult.invoiceDate
              invoiceAmountToStore = invoiceResult.invoiceAmount
            }
          } catch (invoiceErr: any) {
            console.error(
              `Failed to generate invoice for Ekart order ${order.order_number}:`,
              invoiceErr?.message || invoiceErr,
            )
          }
        }

        await innerTx
          .update(b2c_orders)
          .set({
            invoice_link: invoiceKey ?? undefined,
            invoice_number: invoiceNumberToStore ?? undefined,
            invoice_date: invoiceDateToStore ?? undefined,
            invoice_amount: invoiceAmountToStore ?? undefined,
            updated_at: new Date(),
          })
          .where(eq(b2c_orders.id, order.id))
      } catch (err: any) {
        console.error(`Ekart invoice flow error for ${order.order_number}:`, err)
      }
    }
  })

  await notifyOrderStatusEmail({
    order,
    nextStatus: internalStatus,
    previousStatus,
    rawStatus: statusRaw,
    location,
    remarks: remarks || statusText,
    source: 'ekart_webhook',
  })

  await sendWebhookEvent(order.user_id, 'tracking.updated', {
    awb_number: order.awb_number || awb,
    order_id: order.id,
    order_number: order.order_number,
    status: internalStatus,
    raw_status: statusRaw,
    courier_partner: order.courier_partner || 'Ekart Logistics',
    provider_reference: order.provider_reference || awb || null,
    provider_request_id: order.provider_request_id || awb || null,
    location,
    remarks: remarks || statusText || null,
    source: 'ekart_webhook',
  }).catch((err) => {
    console.error('Failed to send Ekart tracking.updated webhook:', err)
  })

  if (internalStatus !== previousStatus) {
    await sendWebhookEvent(order.user_id, ekartWebhookEventForStatus(internalStatus) as any, {
      order_id: order.id,
      order_number: order.order_number,
      awb_number: order.awb_number || awb,
      status: internalStatus,
      raw_status: statusRaw,
      courier_partner: order.courier_partner || 'Ekart Logistics',
      provider_reference: order.provider_reference || awb || null,
      provider_request_id: order.provider_request_id || awb || null,
      location,
      remarks: remarks || statusText || null,
      order_type: 'b2c',
      source: 'ekart_webhook',
    }).catch((err) => {
      console.error('Failed to send Ekart status webhook:', err)
    })
  }

  if (
    ['ndr', 'undelivered'].includes(statusLower) ||
    hasNdrSignal(statusRaw, remarks, location, event?.ndrStatus, event?.ndrActions)
  ) {
    try {
      await captureNdrEventFromWebhook({
        order,
        awbNumber: order.awb_number || awb || undefined,
        status: statusLower,
        reason: remarks || pickWebhookText(event?.ndrStatus, payload?.ndrStatus) || null,
        remarks: statusText || null,
        attemptNo: pickWebhookText(
          event?.attempts,
          event?.attempt_no,
          event?.attempted_count,
          event?.attemptCount,
          payload?.attempts,
          payload?.attempt_no,
          payload?.attempted_count,
          payload?.attemptCount,
        ) || null,
        payload,
        courierLabel: 'Ekart',
        signalParts: [statusRaw, remarks, location, event?.ndrStatus, event?.ndrActions],
      })
    } catch (err) {
      console.error('Failed to record NDR event (Ekart):', err)
    }
  }

  if (statusLower.startsWith('rto') && internalStatus !== previousStatus) {
    try {
      const rtoCharge = await applyRtoChargeOnce(tx, order, 'Ekart')
      await recordRtoEvent({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: order.awb_number || awb || undefined,
        status: statusLower,
        reason: remarks || null,
        rtoCharges: rtoCharge,
        payload,
      })
      await createNotificationService({
        targetRole: 'user',
        userId: order.user_id,
        title: 'RTO update (Ekart)',
        message: `Order ${order.order_number} status ${statusLower}.`,
      })
      await createNotificationService({
        targetRole: 'admin',
        title: 'RTO event (Ekart)',
        message: `User ${order.user_id} order ${order.order_number} ${statusLower}`,
      })
    } catch (err) {
      console.error('Failed to record RTO event (Ekart):', err)
    }
  }

  if (internalStatus === 'delivered' && order.order_type === 'cod') {
    try {
      const { remittance, created } = await createCodRemittance({
        orderId: order.id,
        orderType: 'b2c',
        userId: order.user_id,
        orderNumber: order.order_number,
        awbNumber: order.awb_number || awb || undefined,
        courierPartner: 'Ekart Logistics',
        codAmount: Number(order.order_amount ?? 0),
        codCharges: Number(order.cod_charges ?? 0),
        freightCharges: Number(order.freight_charges ?? order.shipping_charges ?? 0),
        collectedAt: new Date(),
      })

      if (created) {
        await createNotificationService({
          targetRole: 'admin',
          title: 'COD remittance created',
          message: `Order ${order.order_number} (${order.awb_number || 'no AWB'}) created pending COD remittance of INR ${Number(
            remittance.remittableAmount || 0,
          ).toFixed(2)}.`,
        })
      }
    } catch (err) {
      console.error(`Failed to create COD remittance for Ekart order ${order.order_number}:`, err)
    }
  }

  return { success: true }
}

export async function processXpressbeesWebhook(payload: any, tx = db) {
  const event = unwrapXpressbeesPayload(payload)
  const awb = pickWebhookText(
    event?.awb_number ||
    event?.awb ||
    event?.waybill ||
    event?.tracking_id ||
    event?.trackingId ||
    event?.AWBNumber ||
    event?.AWBNo ||
    event?.AirWayBillNO ||
    event?.AirWayBillNo ||
    event?.ShippingID ||
    event?.shipment?.awb_number ||
    event?.shipment?.awb,
  )
  const orderRef = pickWebhookText(
    event?.order_number ||
    event?.order_id ||
    event?.reference_number ||
    event?.shipment_id ||
    event?.OrderNo ||
    event?.SubOrderNo ||
    event?.client_order_id ||
    event?.shipment?.order_number ||
    event?.shipment?.order_id,
  )
  const statusRaw = pickWebhookText(
    event?.current_status ||
    event?.shipment_status ||
    event?.status ||
    event?.event ||
    event?.event_name ||
    event?.scan_status ||
    event?.ShipmentStatus ||
    event?.CurrentStatus ||
    event?.Status ||
    event?.status_code ||
    event?.Process,
  )
  const remarks = pickWebhookText(
    event?.courier_remarks ||
    event?.remarks ||
    event?.remark ||
    event?.message ||
    event?.description ||
    event?.Description ||
    event?.ReturnMessage,
  )
  const location = pickWebhookText(
    event?.current_location ||
    event?.location ||
    event?.scan_location ||
    event?.hub_name ||
    event?.HubLocation ||
    event?.city ||
    event?.City,
  ) || null

  if (!awb && !orderRef) return { success: false, reason: 'missing_awb' }

  let order
  if (awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.awb_number, String(awb)))
  }
  if (!order && orderRef) {
    ;[order] = await tx
      .select()
      .from(b2c_orders)
      .where(eq(b2c_orders.order_number, String(orderRef)))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.order_id, String(orderRef)))
  }
  if (!order && awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.shipment_id, String(awb)))
  }
  if (!order && awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.provider_reference, String(awb)))
  }
  if (!order && awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.provider_request_id, String(awb)))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.shipment_id, String(orderRef)))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.provider_reference, String(orderRef)))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.provider_request_id, String(orderRef)))
  }

  if (!order) {
    console.warn(`⚠️ No local order found for Xpressbees AWB ${awb || 'N/A'} ref ${orderRef || 'N/A'}`)
    return { success: false, reason: 'order_not_found' }
  }

  const mappedStatus = mapXpressbeesStatus(statusRaw || remarks)
  const internalStatus = preserveXpressbeesStatusTransition(
    order.order_status,
    mappedStatus,
    [statusRaw, remarks].filter(Boolean).join(' | '),
  )
  const previousStatus = normalizeComparableText(order.order_status).replace(/\s+/g, '_')
  const statusLower = internalStatus.toLowerCase()
  const statusText = statusRaw || remarks || internalStatus

  const updateData: any = {
    order_status: internalStatus,
    delivery_location: location,
    delivery_message: remarks || null,
    provider_last_status: String(statusRaw || remarks || internalStatus || '').slice(0, 80),
    updated_at: new Date(),
  }

  if (isXpressbeesPickupProgressStatus(internalStatus)) {
    updateData.pickup_status = 'pickup_initiated'
    updateData.pickup_error = null
    updateData.manifest_error = null
  }

  if (internalStatus === 'cancelled') {
    updateData.pickup_status = 'cancelled'
    updateData.pickup_error = null
  }

  if (event?.courier_cost !== undefined) updateData.courier_cost = Number(event.courier_cost)
  if (event?.freight_charges !== undefined && updateData.courier_cost === undefined) {
    updateData.courier_cost = Number(event.freight_charges)
  }
  if (event?.charged_weight !== undefined) updateData.charged_weight = Number(event.charged_weight)
  if (event?.chargeable_weight !== undefined && updateData.charged_weight === undefined) {
    updateData.charged_weight = Number(event.chargeable_weight)
  }
  if (event?.volumetric_weight !== undefined) {
    updateData.volumetric_weight = Number(event.volumetric_weight)
  }
  if (event?.actual_weight !== undefined) updateData.actual_weight = Number(event.actual_weight)
  if (event?.label) updateData.label = String(event.label)
  if (event?.manifest) updateData.manifest = String(event.manifest)

  await tx.transaction(async (innerTx) => {
    await innerTx.update(b2c_orders).set(updateData).where(eq(b2c_orders.id, order.id))
    await syncShopifyStatusForLocalOrder({ ...order, ...updateData }, innerTx).catch((err) => {
      console.warn('⚠️ Failed Shopify status sync for Xpressbees webhook:', err)
    })
    await syncWooCommerceStatusForLocalOrder({ ...order, ...updateData }, innerTx).catch((err) => {
      console.warn('Failed WooCommerce status sync for Xpressbees webhook:', err)
    })

    try {
      await logTrackingEvent({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: order.awb_number,
        courier: 'Xpressbees',
        statusCode: internalStatus,
        statusText,
        location,
        raw: payload,
      })
    } catch (err: any) {
      console.error('❌ Failed to log Xpressbees tracking event:', err)
    }

    if (internalStatus === 'booked' || internalStatus === 'pickup_initiated') {
      try {
        const [freshOrder] = await innerTx
          .select()
          .from(b2c_orders)
          .where(eq(b2c_orders.id, order.id))

        if (!freshOrder) return

        let invoiceKey = freshOrder.invoice_link
        let invoiceNumberToStore = freshOrder.invoice_number
        let invoiceDateToStore = freshOrder.invoice_date
        let invoiceAmountToStore = freshOrder.invoice_amount

        if (!invoiceKey) {
          const invoiceResult = await generateInvoiceForOrderWebhook(freshOrder, innerTx)
          if (invoiceResult) {
            invoiceKey = invoiceResult.key
            invoiceNumberToStore = invoiceResult.invoiceNumber
            invoiceDateToStore = invoiceResult.invoiceDate
            invoiceAmountToStore = invoiceResult.invoiceAmount
          }
        }

        await innerTx
          .update(b2c_orders)
          .set({
            invoice_link: invoiceKey ?? undefined,
            invoice_number: invoiceNumberToStore ?? undefined,
            invoice_date: invoiceDateToStore ?? undefined,
            invoice_amount: invoiceAmountToStore ?? undefined,
            updated_at: new Date(),
          })
          .where(eq(b2c_orders.id, order.id))
      } catch (err: any) {
        console.error(`❌ Xpressbees invoice flow error for ${order.order_number}:`, err)
      }
    }
  })

  await notifyOrderStatusEmail({
    order,
    nextStatus: internalStatus,
    previousStatus,
    rawStatus: statusRaw,
    location,
    remarks: remarks || statusText,
    source: 'xpressbees_webhook',
  })

  await sendWebhookEvent(order.user_id, 'tracking.updated', {
    awb_number: order.awb_number || awb,
    order_id: order.id,
    order_number: order.order_number,
    status: internalStatus,
    raw_status: statusRaw,
    courier_partner: order.courier_partner || 'Xpressbees',
    provider_reference: order.provider_reference || awb || null,
    provider_request_id: order.provider_request_id || awb || null,
    location,
    remarks: remarks || statusText || null,
    source: 'xpressbees_webhook',
  }).catch((err) => {
    console.error('Failed to send Xpressbees tracking.updated webhook:', err)
  })

  if (internalStatus !== previousStatus) {
    await sendWebhookEvent(order.user_id, xpressbeesWebhookEventForStatus(internalStatus) as any, {
      order_id: order.id,
      order_number: order.order_number,
      awb_number: order.awb_number || awb,
      status: internalStatus,
      raw_status: statusRaw,
      courier_partner: order.courier_partner || 'Xpressbees',
      provider_reference: order.provider_reference || awb || null,
      provider_request_id: order.provider_request_id || awb || null,
      location,
      remarks: remarks || statusText || null,
      order_type: 'b2c',
      source: 'xpressbees_webhook',
    }).catch((err) => {
      console.error('Failed to send Xpressbees status webhook:', err)
    })
  }

  if (
    ['ndr', 'undelivered'].includes(statusLower) ||
    hasNdrSignal(statusRaw, remarks, statusText, location)
  ) {
    try {
      await captureNdrEventFromWebhook({
        order,
        awbNumber: order.awb_number || undefined,
        status: statusLower,
        reason: remarks || null,
        remarks: statusText || null,
        payload,
        courierLabel: 'Xpressbees',
        signalParts: [statusRaw, remarks, statusText, location],
      })
    } catch (err) {
      console.error('❌ Failed to record NDR event (Xpressbees):', err)
    }
  }

  if (statusLower.includes('rto')) {
    try {
      const rtoCharge = await applyRtoChargeOnce(tx, order, 'Xpressbees')
      await recordRtoEvent({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: order.awb_number || undefined,
        status: statusLower,
        reason: remarks || null,
        remarks: statusText || null,
        rtoCharges: rtoCharge,
        payload,
      })
      await createNotificationService({
        targetRole: 'user',
        userId: order.user_id,
        title: 'RTO update (Xpressbees)',
        message: `Order ${order.order_number} status ${statusLower}.`,
      })
      await createNotificationService({
        targetRole: 'admin',
        title: 'RTO event (Xpressbees)',
        message: `User ${order.user_id} order ${order.order_number} ${statusLower}`,
      })
    } catch (err) {
      console.error('❌ Failed to record RTO event (Xpressbees):', err)
    }
  }

  if (internalStatus === 'delivered' && order.order_type === 'cod') {
    try {
      const { remittance, created } = await createCodRemittance({
        orderId: order.id,
        orderType: 'b2c',
        userId: order.user_id,
        orderNumber: order.order_number,
        awbNumber: order.awb_number || undefined,
        courierPartner: 'Xpressbees',
        codAmount: Number(order.order_amount ?? 0),
        codCharges: Number(order.cod_charges ?? 0),
        freightCharges: Number(order.freight_charges ?? order.shipping_charges ?? 0),
        collectedAt: new Date(),
      })

      if (created) {
        await createNotificationService({
          targetRole: 'admin',
          title: 'COD remittance created',
          message: `Order ${order.order_number} (${order.awb_number || 'no AWB'}) created pending COD remittance of ₹${Number(
            remittance.remittableAmount || 0,
          ).toFixed(2)}.`,
        })
      }
    } catch (err) {
      console.error(
        `❌ Failed to create COD remittance for Xpressbees order ${order.order_number}:`,
        err,
      )
    }
  }

  if (internalStatus === 'cancelled') {
    await applyCancellationRefundOnce(tx, order, 'xpressbees_webhook')
  }

  return { success: true }
}

const unwrapInnofulfillPayload = (payload: any) => {
  if (payload?.__provider === 'innofulfill' && payload?.body) return payload.body
  if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data
  }
  return payload || {}
}

const mapInnofulfillStatus = (status: string, triggerEventName?: string): string => {
  const raw = String(status || triggerEventName || '').trim()
  const normalized = raw.toUpperCase().replace(/[\s.-]+/g, '_')
  const text = raw.toLowerCase().replace(/[_-]+/g, ' ')
  if (!raw) return ''

  if (
    [
      'CANCELLED',
      'CANCELLED_BY_CUSTOMER',
      'CANCELLED_BY_SHIPPER',
      'PICKUP_CANCELLED',
    ].includes(normalized) ||
    text.includes('cancel')
  ) {
    return 'cancelled'
  }

  if (normalized === 'RTO_DELIVERED') return 'rto_delivered'
  if (normalized === 'RTO_UNDELIVERED') return 'rto_in_transit'
  if (normalized === 'RTO_REVOKED') return 'in_transit'
  if (['RTO_REQUESTED', 'RTO_INITIATED', 'RTO', 'RTO_IN_TRANSIT'].includes(normalized)) {
    return 'rto_in_transit'
  }
  if (normalized === 'RTO_OUT_FOR_DELIVERY') return 'out_for_delivery'

  if (['UNDELIVERED', 'NOT_PICKED_UP'].includes(normalized) || text.includes('undelivered')) {
    return 'ndr'
  }
  if (normalized === 'DELIVERED' || /\bdelivered\b/.test(text)) return 'delivered'
  if (normalized === 'LOST' || text.includes('lost')) return 'lost'
  if (normalized === 'DAMAGED' || text.includes('damage')) return 'damaged'
  if (normalized === 'ERROR_ORDER' || text.includes('error')) return 'failed'

  if (['OUT_FOR_DELIVERY', 'READY_FOR_DELIVERY'].includes(normalized) || text.includes('out for delivery')) {
    return 'out_for_delivery'
  }
  if (['IN_TRANSIT', 'ON_HOLD'].includes(normalized) || text.includes('in transit')) {
    return 'in_transit'
  }
  if (
    [
      'OUT_FOR_PICKUP',
      'READY_FOR_DISPATCH',
      'PICKED_UP',
      'PICKUP_RESCHEDULED',
    ].includes(normalized) ||
    text.includes('picked') ||
    text.includes('pickup')
  ) {
    return 'pickup_initiated'
  }
  if (['ORDER_CREATED', 'ORDER_CONFIRMED'].includes(normalized) || text.includes('order created')) {
    return 'booked'
  }

  return ''
}

const innofulfillWebhookEventForStatus = (status: string) => {
  if (status === 'delivered') return 'order.delivered'
  if (status === 'cancelled') return 'order.cancelled'
  if (['ndr', 'undelivered', 'lost', 'damaged', 'failed'].includes(status)) return 'order.failed'
  if (status.startsWith('rto')) return 'order.rto'
  if (['pickup_initiated', 'in_transit', 'out_for_delivery'].includes(status)) return 'order.shipped'
  return 'order.updated'
}

export async function processInnofulfillWebhook(payload: any, tx = db) {
  const event = unwrapInnofulfillPayload(payload)
  const parent = payload?.__provider === 'innofulfill' && payload?.body ? payload.body : payload
  const eventMeta = parent?.event && typeof parent.event === 'object' ? parent.event : {}

  const awb = pickWebhookText(
    event?.awbNumber,
    event?.cAwbNumber,
    event?.awb_number,
    event?.awb,
    event?.waybill,
    event?.trackingId,
    event?.tracking_id,
    parent?.awbNumber,
    parent?.awb_number,
    parent?.awb,
  )
  const orderRef = pickWebhookText(
    event?.orderId,
    event?.orderNumber,
    event?.referenceId,
    event?.referenceNumber,
    event?.shipmentId,
    event?.shipment_id,
    parent?.orderId,
    parent?.orderNumber,
    parent?.id,
  )
  const statusRaw = pickWebhookText(
    event?.orderStatus,
    event?.status,
    eventMeta?.eventCode,
    eventMeta?.triggerEventName,
    parent?.event,
    parent?.eventType,
  )
  const remarks = pickWebhookText(
    event?.reason,
    event?.remarks,
    event?.message,
    event?.description,
  )
  const location = pickWebhookText(event?.location, event?.currentLocation, event?.city) || null
  const statusUpdatedAt = pickWebhookText(
    event?.statusUpdatedAt,
    event?.orderDate,
    parent?.timestamp,
    parent?.['x-webhook-timestamp'],
  )

  if (!awb && !orderRef) return { success: false, reason: 'missing_awb' }

  let order
  if (awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.awb_number, String(awb)))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.order_number, String(orderRef)))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.order_id, String(orderRef)))
  }
  if (!order && awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.shipment_id, String(awb)))
  }
  if (!order && awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.provider_reference, String(awb)))
  }
  if (!order && awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.provider_request_id, String(awb)))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.shipment_id, String(orderRef)))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.provider_reference, String(orderRef)))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.provider_request_id, String(orderRef)))
  }

  if (!order) {
    console.warn(`No local order found for Innofulfill AWB ${awb || 'N/A'} ref ${orderRef || 'N/A'}`)
    return { success: false, reason: 'order_not_found' }
  }

  const mappedStatus = mapInnofulfillStatus(statusRaw || remarks, eventMeta?.triggerEventName)
  const internalStatus = preserveXpressbeesStatusTransition(
    order.order_status,
    mappedStatus,
    [statusRaw, remarks, eventMeta?.triggerEventName].filter(Boolean).join(' | '),
  )
  const previousStatus = normalizeComparableText(order.order_status).replace(/\s+/g, '_')
  const statusLower = internalStatus.toLowerCase()
  const statusText = statusRaw || remarks || internalStatus

  const existingProviderMeta =
    order.provider_meta && typeof order.provider_meta === 'object' && !Array.isArray(order.provider_meta)
      ? order.provider_meta
      : {}
  const updateData: any = {
    order_status: internalStatus,
    delivery_location: location,
    delivery_message: remarks || null,
    provider_last_status: String(statusRaw || remarks || internalStatus || '').slice(0, 80),
    provider_meta: {
      ...existingProviderMeta,
      innofulfill_webhook: {
        id: parent?.id || null,
        event: eventMeta?.triggerEventName || parent?.eventType || parent?.event || null,
        eventCode: eventMeta?.eventCode || null,
        statusUpdatedAt: statusUpdatedAt || null,
        payload,
      },
    },
    updated_at: new Date(),
  }

  if (awb && !order.awb_number) updateData.awb_number = String(awb)
  if (orderRef && !order.provider_reference) updateData.provider_reference = String(orderRef)

  if (isXpressbeesPickupProgressStatus(internalStatus)) {
    updateData.pickup_status = 'pickup_initiated'
    updateData.pickup_error = null
    updateData.manifest_error = null
  }
  if (internalStatus === 'cancelled') {
    updateData.pickup_status = 'cancelled'
    updateData.pickup_error = null
  }

  await tx.transaction(async (innerTx) => {
    await innerTx.update(b2c_orders).set(updateData).where(eq(b2c_orders.id, order.id))
    await syncShopifyStatusForLocalOrder({ ...order, ...updateData }, innerTx).catch((err) => {
      console.warn('Failed Shopify status sync for Innofulfill webhook:', err)
    })
    await syncWooCommerceStatusForLocalOrder({ ...order, ...updateData }, innerTx).catch((err) => {
      console.warn('Failed WooCommerce status sync for Innofulfill webhook:', err)
    })

    try {
      await logTrackingEvent({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: order.awb_number || awb,
        courier: 'Innofulfill',
        statusCode: internalStatus,
        statusText,
        location,
        raw: payload,
      })
    } catch (err: any) {
      console.error('Failed to log Innofulfill tracking event:', err)
    }
  })

  await notifyOrderStatusEmail({
    order,
    nextStatus: internalStatus,
    previousStatus,
    rawStatus: statusRaw,
    location,
    remarks: remarks || statusText,
    source: 'innofulfill_webhook',
  })

  await sendWebhookEvent(order.user_id, 'tracking.updated', {
    awb_number: order.awb_number || awb,
    order_id: order.id,
    order_number: order.order_number,
    status: internalStatus,
    raw_status: statusRaw,
    courier_partner: order.courier_partner || 'Innofulfill',
    provider_reference: order.provider_reference || orderRef || awb || null,
    provider_request_id: order.provider_request_id || awb || null,
    location,
    remarks: remarks || statusText || null,
    order_type: 'b2c',
    source: 'innofulfill_webhook',
  }).catch((err) => {
    console.error('Failed to send Innofulfill tracking.updated webhook:', err)
  })

  if (internalStatus !== previousStatus) {
    await sendWebhookEvent(order.user_id, innofulfillWebhookEventForStatus(internalStatus) as any, {
      order_id: order.id,
      order_number: order.order_number,
      awb_number: order.awb_number || awb,
      status: internalStatus,
      raw_status: statusRaw,
      courier_partner: order.courier_partner || 'Innofulfill',
      provider_reference: order.provider_reference || orderRef || awb || null,
      provider_request_id: order.provider_request_id || awb || null,
      location,
      remarks: remarks || statusText || null,
      order_type: 'b2c',
      source: 'innofulfill_webhook',
    }).catch((err) => {
      console.error('Failed to send Innofulfill status webhook:', err)
    })
  }

  if (
    ['ndr', 'undelivered'].includes(statusLower) ||
    hasNdrSignal(statusRaw, remarks, statusText, location)
  ) {
    try {
      await captureNdrEventFromWebhook({
        order,
        awbNumber: order.awb_number || awb || undefined,
        status: statusLower,
        reason: remarks || null,
        remarks: statusText || null,
        payload,
        courierLabel: 'Innofulfill',
        signalParts: [statusRaw, remarks, statusText, location],
      })
    } catch (err) {
      console.error('Failed to record NDR event (Innofulfill):', err)
    }
  }

  if (statusLower.includes('rto')) {
    try {
      const rtoCharge = await applyRtoChargeOnce(tx, order, 'Innofulfill')
      await recordRtoEvent({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: order.awb_number || awb || undefined,
        status: statusLower,
        reason: remarks || null,
        remarks: statusText || null,
        rtoCharges: rtoCharge,
        payload,
      })
      await createNotificationService({
        targetRole: 'user',
        userId: order.user_id,
        title: 'RTO update (Innofulfill)',
        message: `Order ${order.order_number} status ${statusLower}.`,
      })
      await createNotificationService({
        targetRole: 'admin',
        title: 'RTO event (Innofulfill)',
        message: `User ${order.user_id} order ${order.order_number} ${statusLower}`,
      })
    } catch (err) {
      console.error('Failed to record RTO event (Innofulfill):', err)
    }
  }

  if (internalStatus === 'delivered' && order.order_type === 'cod') {
    try {
      const { remittance, created } = await createCodRemittance({
        orderId: order.id,
        orderType: 'b2c',
        userId: order.user_id,
        orderNumber: order.order_number,
        awbNumber: order.awb_number || awb || undefined,
        courierPartner: 'Innofulfill',
        codAmount: Number(order.order_amount ?? 0),
        codCharges: Number(order.cod_charges ?? 0),
        freightCharges: Number(order.freight_charges ?? order.shipping_charges ?? 0),
        collectedAt: new Date(),
      })

      if (created) {
        await createNotificationService({
          targetRole: 'admin',
          title: 'COD remittance created',
          message: `Order ${order.order_number} (${order.awb_number || awb || 'no AWB'}) created pending COD remittance of INR ${Number(
            remittance.remittableAmount || 0,
          ).toFixed(2)}.`,
        })
      }
    } catch (err) {
      console.error(`Failed to create COD remittance for Innofulfill order ${order.order_number}:`, err)
    }
  }

  if (internalStatus === 'cancelled') {
    await applyCancellationRefundOnce(tx, order, 'innofulfill_webhook')
  }

  return { success: true }
}

const isAmazonWebhookObject = (value: unknown): value is Record<string, any> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value))

const amazonWebhookText = (value: unknown) => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value).trim()
  }
  return ''
}

const pickAmazonWebhookText = (...values: unknown[]) =>
  values.map(amazonWebhookText).find(Boolean) || ''

const truncateAmazonWebhookText = (value: unknown, maxLength: number) => {
  const text = amazonWebhookText(value)
  return text.length > maxLength ? text.slice(0, maxLength) : text
}

const unwrapAmazonShippingWebhookPayload = (payload: any) => {
  if (Array.isArray(payload)) return payload[0] || {}
  if (payload?.__provider === 'amazon' && isAmazonWebhookObject(payload.body)) {
    return payload.body
  }
  if (isAmazonWebhookObject(payload?.payload)) return payload.payload
  if (isAmazonWebhookObject(payload?.data)) return payload.data
  if (isAmazonWebhookObject(payload?.notification?.payload)) return payload.notification.payload
  return payload || {}
}

const resolveAmazonWebhookDetails = (event: any) => {
  if (isAmazonWebhookObject(event?.trackingEvent)) return event.trackingEvent
  if (isAmazonWebhookObject(event?.trackingDetails)) return event.trackingDetails
  if (isAmazonWebhookObject(event?.statusDetails)) return event.statusDetails
  if (isAmazonWebhookObject(event?.latestEvent)) return event.latestEvent
  if (isAmazonWebhookObject(event?.event)) return event.event
  return {}
}

const resolveAmazonWebhookLocation = (...values: unknown[]) => {
  for (const value of values) {
    const direct = amazonWebhookText(value)
    if (direct) return direct

    if (!isAmazonWebhookObject(value)) continue
    const location = [
      value.city,
      value.stateOrRegion,
      value.state,
      value.postalCode,
      value.countryCode,
    ]
      .map(amazonWebhookText)
      .filter(Boolean)
      .join(', ')
    if (location) return location
  }

  return ''
}

const mapAmazonShippingWebhookStatus = (statusRaw: unknown, eventCode?: unknown) => {
  const normalized = normalizeWebhookText(statusRaw, eventCode)
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return 'in_transit'
  if (normalized.includes('cancel')) return 'cancelled'
  if (
    (normalized.includes('delivered') || normalized.includes('delivery complete')) &&
    (normalized.includes('return') || normalized.includes('rto'))
  ) {
    return 'rto_delivered'
  }
  if (normalized.includes('return') || normalized.includes('rto')) return 'rto_in_transit'
  if (normalized.includes('lost')) return 'lost'
  if (
    normalized.includes('undeliver') ||
    normalized.includes('delivery attempted') ||
    normalized.includes('attempted') ||
    normalized.includes('rejected') ||
    normalized.includes('refused') ||
    normalized.includes('failed')
  ) {
    return 'ndr'
  }
  if (normalized.includes('out for delivery') || normalized.includes('ofd')) {
    return 'out_for_delivery'
  }
  if (normalized.includes('delivered')) return 'delivered'
  if (
    normalized.includes('pickup') ||
    normalized.includes('shipment created') ||
    normalized.includes('label created') ||
    normalized.includes('pre transit') ||
    normalized.includes('manifest')
  ) {
    return 'pickup_initiated'
  }
  if (
    normalized.includes('transit') ||
    normalized.includes('arrived') ||
    normalized.includes('departed') ||
    normalized.includes('received') ||
    normalized.includes('scanned')
  ) {
    return 'in_transit'
  }

  return 'in_transit'
}

const amazonWebhookEventForStatus = (status: string) => {
  if (status === 'delivered') return 'order.delivered'
  if (status === 'cancelled') return 'order.cancelled'
  if (['ndr', 'undelivered', 'lost'].includes(status)) return 'order.failed'
  if (status.startsWith('rto')) return 'order.rto'
  if (['pickup_initiated', 'in_transit', 'out_for_delivery'].includes(status)) return 'order.shipped'
  return 'order.updated'
}

const findAmazonOrderByIdentifier = async (identifier: string, tx: any) => {
  const value = amazonWebhookText(identifier)
  if (!value) return { order: null, orderType: 'b2c' as 'b2c' | 'b2b' }

  const [b2c] = await tx
    .select()
    .from(b2c_orders)
    .where(
      or(
        eq(b2c_orders.awb_number, value),
        eq(b2c_orders.provider_reference, value),
        eq(b2c_orders.provider_request_id, value),
        eq(b2c_orders.shipment_id, value),
      )!,
    )
    .limit(1)

  if (b2c) return { order: b2c, orderType: 'b2c' as const }

  const [b2b] = await tx
    .select()
    .from(b2b_orders)
    .where(
      or(
        eq(b2b_orders.awb_number, value),
        eq(b2b_orders.provider_reference, value),
        eq(b2b_orders.provider_request_id, value),
        eq(b2b_orders.shipment_id, value),
      )!,
    )
    .limit(1)

  if (b2b) return { order: b2b, orderType: 'b2b' as const }
  return { order: null, orderType: 'b2c' as 'b2c' | 'b2b' }
}

const findAmazonOrderByReference = async (reference: string, tx: any) => {
  const value = amazonWebhookText(reference)
  if (!value) return { order: null, orderType: 'b2c' as 'b2c' | 'b2b' }

  const [b2c] = await tx
    .select()
    .from(b2c_orders)
    .where(or(eq(b2c_orders.order_number, value), eq(b2c_orders.order_id, value))!)
    .limit(1)

  if (b2c) return { order: b2c, orderType: 'b2c' as const }

  const [b2b] = await tx
    .select()
    .from(b2b_orders)
    .where(or(eq(b2b_orders.order_number, value), eq(b2b_orders.order_id, value))!)
    .limit(1)

  if (b2b) return { order: b2b, orderType: 'b2b' as const }
  return { order: null, orderType: 'b2c' as 'b2c' | 'b2b' }
}

export const getAmazonShippingWebhookSummary = (payload: any) => {
  const event = unwrapAmazonShippingWebhookPayload(payload)
  const details = resolveAmazonWebhookDetails(event)
  const trackingId = pickAmazonWebhookText(
    event?.trackingId,
    event?.tracking_id,
    event?.trackingNumber,
    event?.containerTrackingId,
    event?.packageTrackingId,
    event?.awb,
    event?.awb_number,
    details?.trackingId,
    details?.tracking_id,
    details?.trackingNumber,
  )
  const shipmentId = pickAmazonWebhookText(
    event?.shipmentId,
    event?.shipment_id,
    event?.shipmentIdentifier,
    event?.shipmentIdentifierId,
    details?.shipmentId,
    details?.shipment_id,
  )
  const orderRef = pickAmazonWebhookText(
    event?.orderNumber,
    event?.order_number,
    event?.orderId,
    event?.order_id,
    event?.clientReferenceId,
    event?.packageClientReferenceId,
    details?.orderNumber,
    details?.order_number,
    details?.clientReferenceId,
    details?.packageClientReferenceId,
  )
  const status = pickAmazonWebhookText(
    event?.status,
    event?.statusCode,
    event?.statusDescription,
    event?.trackingStatus,
    event?.latestStatus,
    details?.status,
    details?.statusCode,
    details?.statusDescription,
  )
  const eventCode = pickAmazonWebhookText(
    event?.eventCode,
    event?.eventType,
    event?.code,
    details?.eventCode,
    details?.eventType,
    details?.code,
  )
  const eventTime = pickAmazonWebhookText(
    event?.eventTime,
    event?.eventDate,
    event?.timestamp,
    event?.eventTimestamp,
    event?.updatedAt,
    details?.eventTime,
    details?.eventDate,
    details?.timestamp,
  )
  const location = resolveAmazonWebhookLocation(
    event?.location,
    event?.eventLocation,
    event?.currentLocation,
    details?.location,
    details?.eventLocation,
    details?.currentLocation,
  )
  const remarks = pickAmazonWebhookText(
    event?.eventDescription,
    event?.statusDescription,
    event?.message,
    event?.description,
    details?.eventDescription,
    details?.statusDescription,
    details?.message,
    details?.description,
  )

  return {
    event,
    trackingId,
    shipmentId,
    orderRef,
    status,
    eventCode,
    eventTime,
    location,
    remarks,
    shippingPartyAccountId: pickAmazonWebhookText(
      event?.shippingPartyAccountId,
      event?.shipping_party_account_id,
      details?.shippingPartyAccountId,
      details?.shipping_party_account_id,
    ),
  }
}

export async function processAmazonShippingTrackingWebhook(payload: any, tx = db) {
  const summary = getAmazonShippingWebhookSummary(payload)
  const { trackingId, shipmentId, orderRef, status, eventCode, eventTime, location, remarks } =
    summary

  if (!trackingId && !shipmentId && !orderRef) {
    return { success: false, reason: 'missing_awb' }
  }

  let resolved = { order: null as any, orderType: 'b2c' as 'b2c' | 'b2b' }
  for (const identifier of [trackingId, shipmentId]) {
    if (!identifier) continue
    resolved = await findAmazonOrderByIdentifier(identifier, tx)
    if (resolved.order) break
  }
  if (!resolved.order && orderRef) {
    resolved = await findAmazonOrderByReference(orderRef, tx)
  }

  const order = resolved.order
  const orderType = resolved.orderType
  const primaryTrackingId = trackingId || shipmentId || orderRef
  if (!order) {
    console.warn(
      `Amazon Shipping webhook: order not found for tracking ${trackingId || 'N/A'} shipment ${
        shipmentId || 'N/A'
      } ref ${orderRef || 'N/A'}`,
    )
    return { success: false, reason: 'order_not_found' }
  }

  const internalStatus = mapAmazonShippingWebhookStatus(status, eventCode)
  const previousStatus = String(order.order_status || '').trim().toLowerCase()
  const providerMeta =
    isAmazonWebhookObject(order.provider_meta) ? { ...order.provider_meta } : {}

  const updateData: any = {
    order_status: internalStatus,
    delivery_location: truncateAmazonWebhookText(location, 100) || null,
    delivery_message: truncateAmazonWebhookText(remarks || status, 100) || null,
    provider_last_status: truncateAmazonWebhookText(status || eventCode || internalStatus, 80) || null,
    provider_meta: {
      ...providerMeta,
      amazon_tracking_webhook: payload,
      amazon_last_event_time: eventTime || null,
      amazon_shipping_party_account_id: summary.shippingPartyAccountId || null,
    },
    updated_at: new Date(),
  }

  if (orderType === 'b2c' && internalStatus === 'pickup_initiated') {
    updateData.pickup_status = 'pickup_initiated'
    updateData.pickup_error = null
    updateData.manifest_error = null
  }

  await tx.transaction(async (innerTx: any) => {
    if (orderType === 'b2b') {
      await innerTx.update(b2b_orders).set(updateData).where(eq(b2b_orders.id, order.id))
    } else {
      await innerTx.update(b2c_orders).set(updateData).where(eq(b2c_orders.id, order.id))
      await syncShopifyStatusForLocalOrder({ ...order, ...updateData }, innerTx).catch((err) => {
        console.warn('Failed Shopify status sync for Amazon Shipping webhook:', err)
      })
      await syncWooCommerceStatusForLocalOrder({ ...order, ...updateData }, innerTx).catch((err) => {
        console.warn('Failed WooCommerce status sync for Amazon Shipping webhook:', err)
      })

      try {
        await logTrackingEvent({
          orderId: order.id,
          userId: order.user_id,
          awbNumber: order.awb_number || primaryTrackingId,
          courier: 'Amazon Shipping',
          statusCode: truncateAmazonWebhookText(eventCode || status || internalStatus, 80),
          statusText: truncateAmazonWebhookText(status || remarks || internalStatus, 200),
          location: truncateAmazonWebhookText(location, 120) || null,
          raw: payload,
        })
      } catch (err: any) {
        console.error('Failed to log Amazon Shipping tracking event:', err)
      }
    }
  })

  await notifyOrderStatusEmail({
    order,
    nextStatus: internalStatus,
    previousStatus,
    rawStatus: status || eventCode,
    location,
    remarks: remarks || status,
    source: 'amazon_shipping_webhook',
  })

  await sendWebhookEvent(order.user_id, 'tracking.updated', {
    awb_number: order.awb_number || primaryTrackingId,
    order_id: order.id,
    order_number: order.order_number,
    status: internalStatus,
    raw_status: status || eventCode,
    courier_partner: order.courier_partner || 'Amazon Shipping',
    provider_reference: order.provider_reference || shipmentId || primaryTrackingId || null,
    provider_request_id: order.provider_request_id || null,
    location: location || null,
    remarks: remarks || null,
    event_time: eventTime || null,
    shipping_party_account_id: summary.shippingPartyAccountId || null,
  }).catch((err) => {
    console.error('Failed to send Amazon Shipping tracking.updated webhook:', err)
  })

  if (internalStatus !== previousStatus) {
    await sendWebhookEvent(order.user_id, amazonWebhookEventForStatus(internalStatus) as any, {
      order_id: order.id,
      order_number: order.order_number,
      awb_number: order.awb_number || primaryTrackingId,
      status: internalStatus,
      raw_status: status || eventCode,
      courier_partner: order.courier_partner || 'Amazon Shipping',
      provider_reference: order.provider_reference || shipmentId || primaryTrackingId || null,
      provider_request_id: order.provider_request_id || null,
      location: location || null,
      remarks: remarks || null,
      order_type: orderType,
    }).catch((err) => {
      console.error('Failed to send Amazon Shipping status webhook:', err)
    })
  }

  if (orderType === 'b2c') {
    if (
      ['ndr', 'undelivered'].includes(internalStatus) ||
      hasNdrSignal(status, eventCode, remarks, location)
    ) {
      try {
        await captureNdrEventFromWebhook({
          order,
          awbNumber: order.awb_number || primaryTrackingId,
          status: internalStatus,
          reason: remarks || status || null,
          remarks: eventCode || status || null,
          payload,
          courierLabel: 'Amazon Shipping',
          signalParts: [status, eventCode, remarks, location],
        })
      } catch (err) {
        console.error('Failed to record NDR event (Amazon Shipping):', err)
      }
    }

    if (internalStatus.startsWith('rto') && internalStatus !== previousStatus) {
      try {
        const rtoCharge = await applyRtoChargeOnce(tx, order, 'Amazon Shipping')
        await recordRtoEvent({
          orderId: order.id,
          userId: order.user_id,
          awbNumber: order.awb_number || primaryTrackingId,
          status: internalStatus,
          reason: remarks || status || null,
          remarks: eventCode || status || null,
          rtoCharges: rtoCharge,
          payload,
        })
        await createNotificationService({
          targetRole: 'user',
          userId: order.user_id,
          title: 'RTO update (Amazon Shipping)',
          message: `Order ${order.order_number} status ${internalStatus}.`,
        })
        await createNotificationService({
          targetRole: 'admin',
          title: 'RTO event (Amazon Shipping)',
          message: `User ${order.user_id} order ${order.order_number} ${internalStatus}`,
        })
      } catch (err) {
        console.error('Failed to record RTO event (Amazon Shipping):', err)
      }
    }

    if (internalStatus === 'delivered' && order.order_type === 'cod') {
      try {
        const { remittance, created } = await createCodRemittance({
          orderId: order.id,
          orderType: 'b2c',
          userId: order.user_id,
          orderNumber: order.order_number,
          awbNumber: order.awb_number || primaryTrackingId,
          courierPartner: 'Amazon Shipping',
          codAmount: Number(order.order_amount ?? 0),
          codCharges: Number(order.cod_charges ?? 0),
          freightCharges: Number(order.freight_charges ?? order.shipping_charges ?? 0),
          collectedAt: eventTime ? new Date(eventTime) : new Date(),
        })

        if (created) {
          await createNotificationService({
            targetRole: 'admin',
            title: 'COD remittance created',
            message: `Order ${order.order_number} (${order.awb_number || 'no AWB'}) created pending COD remittance of ${Number(
              remittance.remittableAmount || 0,
            ).toFixed(2)}.`,
          })
        }
      } catch (err) {
        console.error(
          `Failed to create COD remittance for Amazon Shipping order ${order.order_number}:`,
          err,
        )
      }
    }

    if (internalStatus === 'cancelled') {
      await applyCancellationRefundOnce(tx, order, 'amazon_shipping_webhook')
    }
  }

  return { success: true, orderType }
}

const mapShadowfaxWebhookStatus = (statusRaw: unknown, requestId?: string | null) => {
  const normalized = String(statusRaw || '').trim().toLowerCase()
  const reverseLike = String(requestId || '').toUpperCase().startsWith('R')

  const mapping: Record<string, string> = {
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
    ofd: 'out_for_delivery',
    delivered: 'delivered',
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
    rts: reverseLike ? 'in_transit' : 'rto',
    rto: 'rto',
    rts_in_process: 'rto_in_transit',
    rts_ofd: 'rto_in_transit',
    in_transit_return: 'rto_in_transit',
    rts_d: 'rto_delivered',
    rto_d: 'rto_delivered',
    rts_nd: 'rto',
    lost: 'lost',
    item_misrouted: 'in_transit',
    pincode_updated: 'in_transit',
    returned_to_client: 'rto_delivered',
  }

  return mapping[normalized] || (reverseLike ? 'in_transit' : 'in_transit')
}

const shadowfaxWebhookEventForStatus = (status: string) => {
  if (status === 'delivered') return 'order.delivered'
  if (status === 'cancelled') return 'order.cancelled'
  if (['ndr', 'undelivered', 'lost'].includes(status)) return 'order.failed'
  if (status.startsWith('rto')) return 'order.rto'
  if (['pickup_initiated', 'in_transit', 'out_for_delivery'].includes(status)) return 'order.shipped'
  return 'order.updated'
}

const parseShadowfaxNumeric = (value: unknown): number | undefined => {
  if (value === null || value === undefined || value === '') return undefined
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined

  const match = String(value).replace(/,/g, '').match(/-?\d+(\.\d+)?/)
  if (!match) return undefined

  const parsed = Number(match[0])
  return Number.isFinite(parsed) ? parsed : undefined
}

const collectShadowfaxValuesByKeys = (
  node: any,
  keys: Set<string>,
  seen = new WeakSet<object>(),
): any[] => {
  if (!node || typeof node !== 'object') return []
  if (seen.has(node)) return []
  seen.add(node)

  if (Array.isArray(node)) {
    return node.flatMap((item) => collectShadowfaxValuesByKeys(item, keys, seen))
  }

  const values: any[] = []
  for (const [key, value] of Object.entries(node)) {
    if (keys.has(key.toLowerCase())) {
      values.push(value)
    }
    if (value && typeof value === 'object') {
      values.push(...collectShadowfaxValuesByKeys(value, keys, seen))
    }
  }

  return values
}

const pickFirstShadowfaxNumber = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = parseShadowfaxNumeric(value)
    if (parsed !== undefined) return parsed
  }
  return undefined
}

const extractShadowfaxWeightSnapshot = (payload: any) => {
  const chargedWeight = pickFirstShadowfaxNumber(
    ...collectShadowfaxValuesByKeys(
      payload,
      new Set([
        'charged_weight',
        'chargeable_weight',
        'chargedweight',
        'chargeableweight',
        'billing_weight',
        'billed_weight',
      ]),
    ),
  )
  const actualWeight = pickFirstShadowfaxNumber(
    ...collectShadowfaxValuesByKeys(
      payload,
      new Set(['actual_weight', 'dead_weight', 'pickup_weight', 'physical_weight', 'scanned_weight']),
    ),
  )
  const volumetricWeight = pickFirstShadowfaxNumber(
    ...collectShadowfaxValuesByKeys(
      payload,
      new Set(['volumetric_weight', 'vol_weight', 'volumetricweight']),
    ),
  )
  const remarks = collectShadowfaxValuesByKeys(
    payload,
    new Set(['weight_remarks', 'weight_remark', 'weight_message', 'weight_comment']),
  )
    .map((value) => String(value || '').trim())
    .find(Boolean)

  return {
    chargedWeight,
    actualWeight,
    volumetricWeight,
    remarks: remarks || undefined,
  }
}

export async function processShadowfaxWebhook(payload: any, tx = db) {
  const event =
    payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
      ? payload.data
      : payload?.event_data && typeof payload.event_data === 'object'
        ? payload.event_data
        : payload?.payload && typeof payload.payload === 'object'
          ? payload.payload
          : payload || {}
  const awb = pickWebhookText(
    event?.awb_number,
    event?.awb,
    event?.waybill,
    event?.tracking_id,
    event?.trackingId,
    event?.client_request_id,
    event?.request_id,
    event?.return_request_id,
    event?.reverse_request_id,
    event?.shipment_id,
    event?.order_id,
    payload?.awb_number,
    payload?.awb,
    payload?.waybill,
    payload?.tracking_id,
    payload?.trackingId,
    payload?.client_request_id,
    payload?.request_id,
    payload?.return_request_id,
    payload?.reverse_request_id,
    payload?.shipment_id,
    payload?.order_id,
  )
  const orderRef = pickWebhookText(
    event?.order_id,
    event?.client_order_id,
    event?.seller_order_id,
    event?.reference_id,
    event?.merchant_order_id,
    event?.invoice_id,
    event?.invoice_number,
    payload?.order_id,
    payload?.client_order_id,
    payload?.seller_order_id,
    payload?.reference_id,
    payload?.merchant_order_id,
    payload?.invoice_id,
    payload?.invoice_number,
  )
  const statusRaw = pickWebhookText(
    event?.event,
    event?.event_name,
    event?.status,
    event?.current_status,
    event?.shipment_status,
    event?.state,
    event?.invoice_status,
    payload?.event,
    payload?.event_name,
    payload?.status,
    payload?.current_status,
    payload?.shipment_status,
    payload?.state,
    payload?.invoice_status,
  )
  const location = pickWebhookText(
    event?.current_location,
    event?.location,
    event?.scan_location,
    event?.hub,
    payload?.current_location,
    payload?.location,
    payload?.scan_location,
    payload?.hub,
  ) || null
  const remarks = pickWebhookText(
    event?.comments,
    event?.comment,
    event?.message,
    event?.remarks,
    event?.description,
    event?.desc,
    payload?.comments,
    payload?.comment,
    payload?.message,
    payload?.remarks,
    payload?.description,
    payload?.desc,
  ) || null

  console.log('🔄 processShadowfaxWebhook:start', {
    awb: awb || null,
    orderRef: orderRef || null,
    statusRaw: String(statusRaw || ''),
    eventTimestamp:
      event?.shadowfax_event_timestamp ||
      event?.event_timestamp ||
      event?.event_time ||
      event?.timestamp ||
      null,
    payloadKeys: Object.keys(event || {}),
  })

  if (!awb && !orderRef) return { success: false, reason: 'missing_awb' }

  let order: any
  let orderType: 'b2c' | 'b2b' = 'b2c'
  if (awb) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.awb_number, String(awb)))
  }
  if (!order && awb) {
    ;[order] = await tx
      .select()
      .from(b2c_orders)
      .where(eq(b2c_orders.provider_reference, String(awb)))
  }
  if (!order && awb) {
    ;[order] = await tx
      .select()
      .from(b2c_orders)
      .where(eq(b2c_orders.provider_request_id, String(awb)))
  }
  if (!order && orderRef) {
    ;[order] = await tx
      .select()
      .from(b2c_orders)
      .where(eq(b2c_orders.order_number, String(orderRef)))
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2c_orders).where(eq(b2c_orders.order_id, String(orderRef)))
  }
  if (!order && awb) {
    ;[order] = await tx
      .select()
      .from(b2b_orders)
      .where(eq(b2b_orders.awb_number, String(awb)))
    if (order) orderType = 'b2b'
  }
  if (!order && awb) {
    ;[order] = await tx
      .select()
      .from(b2b_orders)
      .where(eq(b2b_orders.provider_reference, String(awb)))
    if (order) orderType = 'b2b'
  }
  if (!order && awb) {
    ;[order] = await tx
      .select()
      .from(b2b_orders)
      .where(eq(b2b_orders.provider_request_id, String(awb)))
    if (order) orderType = 'b2b'
  }
  if (!order && orderRef) {
    ;[order] = await tx
      .select()
      .from(b2b_orders)
      .where(eq(b2b_orders.order_number, String(orderRef)))
    if (order) orderType = 'b2b'
  }
  if (!order && orderRef) {
    ;[order] = await tx.select().from(b2b_orders).where(eq(b2b_orders.order_id, String(orderRef)))
    if (order) orderType = 'b2b'
  }

  if (!order) {
    console.warn(`⚠️ No local order found for Shadowfax AWB ${awb || 'N/A'} ref ${orderRef || 'N/A'}`)
    return { success: false, reason: 'order_not_found' }
  }

  const internalStatus = mapShadowfaxWebhookStatus(statusRaw, awb)
  const shadowfaxWeight = extractShadowfaxWeightSnapshot(payload)
  const shadowfaxProof = extractWeightProofFromWebhook(payload, 'shadowfax')
  const updateData: any = {
    order_status: internalStatus,
    delivery_location: location,
    delivery_message: remarks || null,
    provider_last_status: String(statusRaw || internalStatus || '').trim() || null,
    provider_meta: payload,
    updated_at: new Date(),
  }

  if (internalStatus === 'pickup_initiated') {
    updateData.pickup_status = 'pickup_initiated'
    updateData.pickup_error = null
    updateData.manifest_error = null
  }

  if (shadowfaxWeight.chargedWeight !== undefined) {
    updateData.charged_weight = shadowfaxWeight.chargedWeight
  }
  if (shadowfaxWeight.actualWeight !== undefined) {
    updateData.actual_weight = shadowfaxWeight.actualWeight
  }
  if (shadowfaxWeight.volumetricWeight !== undefined) {
    updateData.volumetric_weight = shadowfaxWeight.volumetricWeight
  }

  const declaredWeight = Number(order.weight || 0)
  console.log('🔄 processShadowfaxWebhook:resolved-order', {
    orderType,
    orderId: order.id,
    orderNumber: order.order_number,
    awb: order.awb_number || awb || null,
    previousStatus: String(order.order_status || ''),
    internalStatus,
    declaredWeight,
    providerReference: order.provider_reference || null,
    providerRequestId: order.provider_request_id || null,
  })

  console.log('⚖️ Shadowfax webhook weight snapshot', {
    orderNumber: order.order_number,
    awb: order.awb_number || awb || null,
    declaredWeight,
    actualWeight: shadowfaxWeight.actualWeight ?? null,
    volumetricWeight: shadowfaxWeight.volumetricWeight ?? null,
    chargedWeight: shadowfaxWeight.chargedWeight ?? null,
    proofUrl: shadowfaxProof.weightSlipUrl || null,
    proofImagesCount: Array.isArray(shadowfaxProof.weightImages)
      ? shadowfaxProof.weightImages.length
      : 0,
  })

  if (
    shadowfaxWeight.chargedWeight !== undefined &&
    declaredWeight > 0 &&
    Math.abs(shadowfaxWeight.chargedWeight - declaredWeight) > 0.01
  ) {
    updateData.weight_discrepancy = true

    try {
      await createWeightDiscrepancy({
        orderType,
        orderId: order.id,
        userId: order.user_id,
        orderNumber: order.order_number,
        awbNumber: order.awb_number || String(awb || '') || undefined,
        courierPartner: 'Shadowfax',
        declaredWeight,
        actualWeight: shadowfaxWeight.actualWeight,
        volumetricWeight: shadowfaxWeight.volumetricWeight,
        chargedWeight: shadowfaxWeight.chargedWeight,
        declaredDimensions: {
          length: Number(order.length || 0),
          breadth: Number(order.breadth || 0),
          height: Number(order.height || 0),
        },
        originalShippingCharge: Number(order.shipping_charges || order.freight_charges || 0),
        courierRemarks: shadowfaxWeight.remarks || remarks || undefined,
        courierWeightSlipUrl: shadowfaxProof.weightSlipUrl,
        courierWeightProofImages: shadowfaxProof.weightImages,
        weighingMetadata: shadowfaxProof.metadata as any,
      })
      console.log(
        `⚖️ Shadowfax weight discrepancy detected for ${orderType} order ${order.order_number}: ${declaredWeight} -> ${shadowfaxWeight.chargedWeight}`,
      )
    } catch (err) {
      console.error('❌ Failed to create Shadowfax weight discrepancy:', err)
    }
  }

  console.log('🔄 processShadowfaxWebhook:updateData', {
    orderNumber: order.order_number,
    awb: order.awb_number || awb || null,
    orderType,
    updateData,
  })

  const previousStatus = String(order.order_status || '').trim().toLowerCase()

  await tx.transaction(async (innerTx) => {
    if (orderType === 'b2b') {
      await innerTx.update(b2b_orders).set(updateData).where(eq(b2b_orders.id, order.id))
    } else {
      await innerTx.update(b2c_orders).set(updateData).where(eq(b2c_orders.id, order.id))
      await syncShopifyStatusForLocalOrder({ ...order, ...updateData }, innerTx).catch((err) => {
        console.warn('⚠️ Failed Shopify status sync for Shadowfax webhook:', err)
      })
      await syncWooCommerceStatusForLocalOrder({ ...order, ...updateData }, innerTx).catch((err) => {
        console.warn('Failed WooCommerce status sync for Shadowfax webhook:', err)
      })

      try {
        await logTrackingEvent({
          orderId: order.id,
          userId: order.user_id,
          awbNumber: order.awb_number || String(awb || ''),
          courier: 'Shadowfax',
          statusCode: String(statusRaw || internalStatus),
          statusText: String(event?.status || statusRaw || internalStatus),
          location,
          raw: payload,
        })
      } catch (err: any) {
        console.error('❌ Failed to log Shadowfax tracking event:', err)
      }
    }
  })

  await notifyOrderStatusEmail({
    order,
    nextStatus: internalStatus,
    previousStatus,
    rawStatus: statusRaw,
    location,
    remarks: remarks || String(event?.status || statusRaw || internalStatus),
    source: 'shadowfax_webhook',
  })

  await sendWebhookEvent(order.user_id, 'tracking.updated', {
    awb_number: order.awb_number || String(awb || ''),
    order_id: order.id,
    order_number: order.order_number,
    status: internalStatus,
    raw_status: statusRaw,
    courier_partner: order.courier_partner || 'Shadowfax',
    provider_reference: order.provider_reference || awb || null,
    provider_request_id: order.provider_request_id || awb || null,
    location,
    remarks,
  }).catch((err) => {
    console.error('❌ Failed to send Shadowfax tracking.updated webhook:', err)
  })

  const shouldEmitGenericStatusWebhook = !(
    orderType === 'b2c' && internalStatus.startsWith('rto')
  )

  if (internalStatus !== previousStatus && shouldEmitGenericStatusWebhook) {
    await sendWebhookEvent(order.user_id, shadowfaxWebhookEventForStatus(internalStatus) as any, {
      order_id: order.id,
      order_number: order.order_number,
      awb_number: order.awb_number || String(awb || ''),
      status: internalStatus,
      raw_status: statusRaw,
      courier_partner: order.courier_partner || 'Shadowfax',
      provider_reference: order.provider_reference || awb || null,
      provider_request_id: order.provider_request_id || awb || null,
      location,
      remarks,
      order_type: orderType,
    }).catch((err) => {
      console.error('❌ Failed to send Shadowfax status webhook:', err)
    })
  }

  if (orderType === 'b2c') {
    if (
      ['ndr', 'undelivered'].includes(internalStatus) ||
      hasNdrSignal(statusRaw, remarks, event?.status, location)
    ) {
      try {
        await captureNdrEventFromWebhook({
          order,
          awbNumber: order.awb_number || String(awb || ''),
          status: internalStatus,
          reason: remarks || null,
          remarks: String(event?.status || statusRaw || internalStatus),
          payload,
          courierLabel: 'Shadowfax',
          signalParts: [statusRaw, remarks, event?.status, location],
        })
      } catch (err) {
        console.error('❌ Failed to capture Shadowfax NDR event:', err)
      }
    }

    if (internalStatus.startsWith('rto') && internalStatus !== previousStatus) {
      try {
        const rtoCharge = await applyRtoChargeOnce(tx, order, 'Shadowfax')
        await recordRtoEvent({
          orderId: order.id,
          userId: order.user_id,
          awbNumber: order.awb_number || String(awb || ''),
          status: internalStatus,
          reason: remarks || null,
          remarks: String(event?.status || statusRaw || internalStatus),
          rtoCharges: rtoCharge,
          payload,
        })
        await createNotificationService({
          targetRole: 'user',
          userId: order.user_id,
          title: 'RTO update (Shadowfax)',
          message: `Order ${order.order_number} status ${internalStatus}.`,
        })
        await createNotificationService({
          targetRole: 'admin',
          title: 'RTO event (Shadowfax)',
          message: `User ${order.user_id} order ${order.order_number} ${internalStatus}`,
        })
      } catch (err) {
        console.error('❌ Failed to capture Shadowfax RTO event:', err)
      }
    }

    if (internalStatus === 'delivered' && order.order_type === 'cod') {
      try {
        const { remittance, created } = await createCodRemittance({
          orderId: order.id,
          orderType: 'b2c',
          userId: order.user_id,
          orderNumber: order.order_number,
          awbNumber: order.awb_number || String(awb || ''),
          courierPartner: 'Shadowfax',
          codAmount: Number(order.order_amount ?? 0),
          codCharges: Number(order.cod_charges ?? 0),
          freightCharges: Number(order.freight_charges ?? order.shipping_charges ?? 0),
          collectedAt: new Date(),
        })

        if (created) {
          await createNotificationService({
            targetRole: 'admin',
            title: 'COD remittance created',
            message: `Order ${order.order_number} (${order.awb_number || 'no AWB'}) created pending COD remittance of INR ${Number(
              remittance.remittableAmount || 0,
            ).toFixed(2)}.`,
          })
        }
      } catch (err) {
        console.error(`Failed to create COD remittance for Shadowfax order ${order.order_number}:`, err)
      }
    }
  }

  console.log('✅ processShadowfaxWebhook:done', {
    orderType,
    orderId: order.id,
    orderNumber: order.order_number,
    awb: order.awb_number || awb || null,
    finalStatus: internalStatus,
  })
  return { success: true, orderType }
}
