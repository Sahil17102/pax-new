import { and, asc, eq, ilike, isNotNull, or, sql } from 'drizzle-orm'
import { sendWebhookEvent } from '../../services/webhookDelivery.service'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { cancelAmazonShipment, getAmazonShippingTracking } from './amazonShipping.service'
import {
  applyAmazonShippingCredentialsToEnv,
  getStoredAmazonShippingCredentials,
} from './amazonShippingCredentials.service'
import {
  DelhiveryService,
  isDelhiveryCancellationConfirmed,
} from './couriers/delhivery.service'
import { EkartService } from './couriers/ekart.service'
import { InnofulfillService } from './couriers/innofulfill.service'
import { ShadowfaxService } from './couriers/shadowfax.service'
import { XpressbeesService } from './couriers/xpressbees.service'
import { logTrackingEvent } from './trackingEvents.service'
import { applyCancellationRefundOnce } from './webhookProcessor'

const SUPPORTED_CANCELLATION_PROVIDERS = new Set([
  'delhivery',
  'ekart',
  'xpressbees',
  'shadowfax',
  'amazon',
  'innofulfill',
])

const TERMINAL_NON_CANCELLABLE_STATUSES = new Set(['delivered', 'rto_delivered'])

const cancellationResponseText = (value: unknown) => {
  try {
    return JSON.stringify(value || {}).toLowerCase()
  } catch {
    return String(value || '').toLowerCase()
  }
}

const isCancellationAccepted = (result: any) => {
  const responseText = cancellationResponseText(result)
  const numericStatus = Number(
    result?.status ??
      result?.responseCode ??
      result?.code ??
      result?.ReturnCode ??
      result?.returnCode,
  )
  const alreadyCancelled =
    responseText.includes('already cancelled') || responseText.includes('already canceled')
  const rejected =
    responseText.includes('not accepted') ||
    responseText.includes('failed') ||
    responseText.includes('failure')
  const acceptedText =
    responseText.includes('cancelled') ||
    responseText.includes('canceled') ||
    responseText.includes('shipment updated successfully') ||
    responseText.includes('successful') ||
    responseText.includes('cancellation initiated') ||
    responseText.includes('cancellation accepted') ||
    responseText.includes('cancellation request accepted')

  return (
    alreadyCancelled ||
    result?.success === true ||
    result?.Success === true ||
    Number(result?.cancelledCount || 0) > 0 ||
    result?.status === true ||
    String(result?.ReturnCode || result?.returnCode || '').trim() === '100' ||
    String(result?.status || '').toLowerCase() === 'success' ||
    (Number.isFinite(numericStatus) && numericStatus >= 200 && numericStatus < 300) ||
    result?.response?.status === true ||
    (acceptedText && !rejected)
  )
}

const getCancellationErrorMessage = (result: any) =>
  result?.error ||
  result?.message ||
  result?.ReturnMessage ||
  result?.returnMessage ||
  result?.responseMsg ||
  result?.remark ||
  'Courier cancellation not accepted'

const getInnofulfillCancellationOrderId = (order: typeof b2c_orders.$inferSelect) => {
  const providerMeta =
    order.provider_meta && typeof order.provider_meta === 'object' && !Array.isArray(order.provider_meta)
      ? (order.provider_meta as Record<string, any>)
      : {}

  return String(
    order.provider_reference ||
      order.shipment_id ||
      order.provider_request_id ||
      providerMeta.provider_reference ||
      providerMeta.shipment_id ||
      providerMeta.order_id ||
      providerMeta.orderId ||
      order.awb_number ||
      '',
  ).trim()
}

const truncateText = (value: unknown, maxLength: number) => {
  const text = String(value || '').trim()
  if (!text) return null
  return text.length > maxLength ? text.slice(0, maxLength - 3).trimEnd() + '...' : text
}

const getCancellationDeliveryMessage = (result: any) =>
  truncateText(
    result?.message ||
      result?.ReturnMessage ||
      result?.returnMessage ||
      result?.remark ||
      result?.responseMsg,
    100,
  )

const isShadowfaxCancellationProcessingError = (error: any) => {
  const responseText = cancellationResponseText({
    message: error?.message,
    response: error?.response?.data,
    status: error?.statusCode || error?.response?.status,
  })

  return (
    responseText.includes('order is being processed') ||
    responseText.includes('try cancelling after sometime')
  )
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

const isAmazonCancellationPropagationError = (error: any) => {
  const responseText = cancellationResponseText({
    message: error?.message,
    response: error?.response?.data,
    status: error?.statusCode || error?.response?.status,
  })

  return (
    responseText.includes('ineligible state') ||
    responseText.includes('trackingid not found') ||
    responseText.includes('tracking id not found')
  )
}

const amazonTrackingConfirmsCancellation = async ({
  order,
  credentials,
}: {
  order: any
  credentials: any
}) => {
  const trackingId = String(
    order?.awb_number ||
      order?.provider_meta?.amazon_tracking_id ||
      order?.provider_meta?.trackingId ||
      order?.provider_meta?.tracking_id ||
      '',
  ).trim()

  if (!trackingId) return false

  const carrierId = String(
    order?.provider_meta?.amazon_carrier_id ||
      order?.provider_meta?.carrierId ||
      order?.provider_service ||
      'ATS',
  ).trim()

  try {
    const tracking = await getAmazonShippingTracking({ trackingId, carrierId }, credentials)
    const trackingText = cancellationResponseText(tracking)
    return (
      trackingText.includes('pickupcancelled') ||
      trackingText.includes('pickup cancelled') ||
      trackingText.includes('cancelled') ||
      trackingText.includes('canceled')
    )
  } catch {
    return false
  }
}

const cancelAmazonShipmentWithRetry = async ({
  shipmentId,
  order,
  credentials,
}: {
  shipmentId: string
  order: any
  credentials: any
}) => {
  const retryDelaysMs = [5000, 15000, 30000]
  let lastError: any = null

  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try {
      return await cancelAmazonShipment({ shipmentId }, credentials)
    } catch (error: any) {
      lastError = error
      if (!isAmazonCancellationPropagationError(error)) {
        throw error
      }

      if (await amazonTrackingConfirmsCancellation({ order, credentials })) {
        return {
          success: true,
          message: 'Amazon tracking confirms cancellation',
          provider_response: error?.response?.data || null,
        }
      }

      const delayMs = retryDelaysMs[attempt]
      if (!delayMs) break
      console.warn('Amazon cancellation is still propagating; retrying', {
        orderId: order?.id,
        shipmentId,
        attempt: attempt + 1,
        delayMs,
        message: error?.message || error,
      })
      await delay(delayMs)
    }
  }

  if (await amazonTrackingConfirmsCancellation({ order, credentials })) {
    return {
      success: true,
      message: 'Amazon tracking confirms cancellation',
      provider_response: lastError?.response?.data || null,
    }
  }

  throw lastError
}

const resolveCancellationProvider = (order: any) => {
  const providerText = `${order?.integration_type || ''} ${order?.courier_partner || ''}`
    .trim()
    .toLowerCase()
  if (providerText.includes('delhivery')) return 'delhivery'
  if (providerText.includes('ekart')) return 'ekart'
  if (providerText.includes('xpressbees') || providerText.includes('xpress bees')) {
    return 'xpressbees'
  }
  if (providerText.includes('shadowfax')) return 'shadowfax'
  if (providerText.includes('amazon')) return 'amazon'
  if (providerText.includes('innofulfill') || providerText.includes('innofulfil')) {
    return 'innofulfill'
  }
  return providerText
}

const isSalesChannelSourceOrder = (order: any) => {
  const localOrderId = String(order?.order_id || '').trim()
  return localOrderId.startsWith('shopify_') || localOrderId.startsWith('woo_')
}

const syncSalesChannelStatusForOrder = async (orderId: string, source: string) => {
  const [updatedOrder] = await db
    .select()
    .from(b2c_orders)
    .where(eq(b2c_orders.id, orderId))
    .limit(1)

  if (!updatedOrder) return

  const localOrderId = String(updatedOrder.order_id || '').trim()
  if (localOrderId.startsWith('shopify_')) {
    const { syncShopifyStatusForLocalOrder } = await import('./shopify.service')
    await syncShopifyStatusForLocalOrder(updatedOrder, db, { source }).catch((err: any) => {
      console.warn(`Shopify status sync skipped after ${source}:`, err?.message || err)
    })
  }

  if (localOrderId.startsWith('woo_')) {
    const { syncWooCommerceStatusForLocalOrder } = await import('./woocommerce.service')
    await syncWooCommerceStatusForLocalOrder(updatedOrder, db, { source }).catch((err: any) => {
      console.warn(`WooCommerce status sync skipped after ${source}:`, err?.message || err)
    })
  }
}

const getDelhiveryCancellationContext = (order: any) => {
  const orderType = String(order?.order_type || '').trim().toLowerCase()
  const providerMeta =
    order?.provider_meta && typeof order.provider_meta === 'object' ? order.provider_meta : {}
  const direction = String(
    providerMeta?.direction || providerMeta?.shipment_type || providerMeta?.order_type || '',
  ).trim().toLowerCase()
  const isPickup = orderType === 'reverse' || direction.includes('reverse') || direction === 'pickup'

  return {
    current_payment_mode: isPickup ? 'Pickup' : orderType === 'cod' ? 'COD' : 'Pre-paid',
  }
}

const markDelhiveryCancellationRequested = async (
  order: any,
  cancellationResult: any,
  trackingResult: any = null,
  error: any = null,
) => {
  const requestedAt = new Date()
  const providerMeta: Record<string, any> =
    order.provider_meta && typeof order.provider_meta === 'object' && !Array.isArray(order.provider_meta)
      ? order.provider_meta
      : {}
  const previousCancellation =
    providerMeta.cancellation && typeof providerMeta.cancellation === 'object'
      ? providerMeta.cancellation
      : {}
  const attemptCount = Number(previousCancellation.attempt_count || 0) + 1
  const isLegacyCancelled = String(order.order_status || '').trim().toLowerCase() === 'cancelled'
  const pendingResult = {
    success: true,
    pending: true,
    provider: 'delhivery',
    message:
      'Delhivery accepted the cancellation request. Waiting for courier tracking confirmation before refund.',
    provider_response: cancellationResult?.provider_response || cancellationResult || null,
  }

  await db
    .update(b2c_orders)
    .set({
      order_status: isLegacyCancelled ? 'cancelled' : 'cancellation_requested',
      pickup_status: isLegacyCancelled ? 'cancelled' : 'cancellation_requested',
      provider_last_status: isLegacyCancelled ? 'cancelled' : 'cancellation_requested',
      delivery_message: isLegacyCancelled
        ? order.delivery_message
        : 'Waiting for Delhivery cancellation confirmation',
      provider_meta: {
        ...providerMeta,
        cancellation: {
          ...previousCancellation,
          provider: 'delhivery',
          requested_at: previousCancellation.requested_at || requestedAt.toISOString(),
          last_attempt_at: requestedAt.toISOString(),
          attempt_count: attemptCount,
          awb_number: order.awb_number || null,
          pending: true,
          result: cancellationResult || null,
          tracking: trackingResult || null,
          last_error: error ? String(error?.message || error).slice(0, 500) : null,
        },
      },
      updated_at: requestedAt,
    })
    .where(
      and(
        eq(b2c_orders.id, order.id),
        eq(
          b2c_orders.order_status,
          isLegacyCancelled ? 'cancelled' : 'cancellation_requested',
        ),
      ),
    )

  return pendingResult
}

const finalizeOrderCancellation = async (
  orderId: string,
  cancellationResult: any,
  source: string,
) => {
  const [order] = await db.select().from(b2c_orders).where(eq(b2c_orders.id, orderId)).limit(1)
  if (!order) throw new Error('Order not found')

  if (String(order.order_status || '').trim().toLowerCase() === 'cancelled') {
    const existingProviderMeta: Record<string, any> =
      order.provider_meta && typeof order.provider_meta === 'object' && !Array.isArray(order.provider_meta)
        ? order.provider_meta
        : {}
    await db
      .update(b2c_orders)
      .set({
        provider_meta: {
          ...existingProviderMeta,
          cancellation: {
            ...(existingProviderMeta.cancellation || {}),
            confirmed_at: new Date().toISOString(),
            pending: false,
            result: cancellationResult,
          },
        },
        updated_at: new Date(),
      })
      .where(eq(b2c_orders.id, orderId))
    return {
      ...cancellationResult,
      success: true,
      alreadyCancelled: true,
      message: cancellationResult?.message || 'Order already cancelled',
    }
  }

  const integration = resolveCancellationProvider(order)
  const awbNumber = String(order.awb_number || '').trim()
  const providerMeta: Record<string, unknown> =
    order.provider_meta && typeof order.provider_meta === 'object' && !Array.isArray(order.provider_meta)
      ? (order.provider_meta as Record<string, unknown>)
      : {}
  const cancelledAt = new Date()

  await db.transaction(async (tx) => {
    await tx
      .update(b2c_orders)
      .set({
        order_status: 'cancelled',
        pickup_status: 'cancelled',
        provider_last_status: 'cancelled',
        delivery_message: getCancellationDeliveryMessage(cancellationResult),
        provider_meta: {
          ...providerMeta,
          cancellation: {
            ...((providerMeta.cancellation as Record<string, unknown>) || {}),
            provider: integration,
            confirmed_at: cancelledAt.toISOString(),
            awb_number: awbNumber || null,
            pending: false,
            result: cancellationResult,
          },
        },
        updated_at: cancelledAt,
      })
      .where(eq(b2c_orders.id, orderId))

    await applyCancellationRefundOnce(tx, order, source)
  })

  await syncSalesChannelStatusForOrder(orderId, 'order cancellation')

  await logTrackingEvent({
    orderId: order.id,
    userId: order.user_id,
    awbNumber: awbNumber || null,
    courier: order.courier_partner || integration,
    statusCode: 'cancelled',
    statusText: 'Shipment cancelled',
    raw: cancellationResult,
  }).catch((err) => {
    console.warn('Failed to log cancellation tracking event:', err)
  })

  await sendWebhookEvent(order.user_id, 'tracking.updated', {
    awb_number: awbNumber || order.awb_number,
    order_id: order.id,
    order_number: order.order_number,
    status: 'cancelled',
    raw_status: 'cancelled',
    courier_partner: order.courier_partner,
  }).catch((err) => {
    console.warn('Failed to send cancellation tracking webhook:', err)
  })

  await sendWebhookEvent(order.user_id, 'order.cancelled', {
    awb_number: awbNumber || order.awb_number,
    order_id: order.id,
    order_number: order.order_number,
    status: 'cancelled',
    courier_partner: order.courier_partner,
  }).catch((err) => {
    console.warn('Failed to send order cancellation webhook:', err)
  })

  return cancellationResult
}

export async function cancelOrderShipment(orderId: string) {
  console.log('Starting cancellation for orderId:', orderId)

  const [order] = await db.select().from(b2c_orders).where(eq(b2c_orders.id, orderId))

  if (!order) {
    console.error('Order not found:', orderId)
    throw new Error('Order not found')
  }

  const integration = resolveCancellationProvider(order)
  const currentStatus = String(order.order_status || '').trim().toLowerCase()
  const awbNumber = String(order.awb_number || '').trim()

  console.log('Order found for cancellation:', {
    orderId: order.id,
    orderNumber: order.order_number,
    integrationType: integration,
    awbNumber,
    shipmentId: order.shipment_id,
    currentStatus,
  })

  if (currentStatus === 'cancelled') {
    await syncSalesChannelStatusForOrder(orderId, 'already-cancelled order check')
    return {
      success: true,
      alreadyCancelled: true,
      message: 'Order already cancelled',
    }
  }

  if (TERMINAL_NON_CANCELLABLE_STATUSES.has(currentStatus)) {
    throw new Error(`Order is already ${currentStatus} and cannot be cancelled`)
  }

  if (!SUPPORTED_CANCELLATION_PROVIDERS.has(integration) && !(isSalesChannelSourceOrder(order) && !awbNumber)) {
    console.error('Unsupported integration type:', { orderId, integration })
    throw new Error('Only Delhivery, Ekart, Xpressbees, Shadowfax, Amazon and Innofulfill are supported for cancellation')
  }

  const amazonShipmentId = String(
    order.shipment_id ||
      order.provider_reference ||
      order.order_id ||
      (order.provider_meta as any)?.shipment_id ||
      (order.provider_meta as any)?.provider_reference ||
      (order.provider_meta as any)?.shipmentId ||
      '',
  ).trim()

  if (integration === 'amazon' && !amazonShipmentId) {
    console.error('Amazon cancellation failed: Missing shipment id', {
      orderId,
      integration,
      awbNumber,
      shipmentId: order.shipment_id,
      providerReference: order.provider_reference,
    })
    throw new Error('Amazon cancellation requires a shipment id')
  }

  const innofulfillOrderId = integration === 'innofulfill' ? getInnofulfillCancellationOrderId(order) : ''
  if (integration === 'innofulfill' && !innofulfillOrderId) {
    console.error('Innofulfill cancellation failed: Missing provider order id', {
      orderId,
      integration,
      awbNumber,
      shipmentId: order.shipment_id,
      providerReference: order.provider_reference,
      providerRequestId: order.provider_request_id,
    })
    throw new Error('Innofulfill cancellation requires a provider order id')
  }

  const providerMeta: Record<string, unknown> =
    order.provider_meta && typeof order.provider_meta === 'object' && !Array.isArray(order.provider_meta)
      ? (order.provider_meta as Record<string, unknown>)
      : {}

  console.log('Attempting courier cancellation:', {
    orderId,
    awbNumber,
    shipmentId: integration === 'amazon' ? amazonShipmentId : order.shipment_id,
    integration,
  })

  let cancellationResult: any = null
  if (integration === 'delhivery' && !awbNumber) {
    throw new Error('Delhivery cancellation requires an AWB number')
  }

  if (!['amazon', 'innofulfill'].includes(integration) && !awbNumber) {
    cancellationResult = {
      success: true,
      localOnly: true,
      message: 'Order has no provider AWB yet; cancelled locally before courier booking.',
    }
  } else if (integration === 'delhivery') {
    const svc = new DelhiveryService()
    const requestedAt = new Date()
    await db
      .update(b2c_orders)
      .set({
        order_status: 'cancellation_requested',
        pickup_status: 'cancellation_requested',
        provider_last_status: 'cancellation_requested',
        delivery_message: 'Sending cancellation request to Delhivery',
        provider_meta: {
          ...providerMeta,
          cancellation: {
            provider: integration,
            requested_at: requestedAt.toISOString(),
            attempt_count: 0,
            awb_number: awbNumber,
            pending: true,
          },
        },
        updated_at: requestedAt,
      })
      .where(eq(b2c_orders.id, orderId))

    try {
      cancellationResult = await svc.cancelShipment(awbNumber)
    } catch (error) {
      await db
        .update(b2c_orders)
        .set({
          order_status: order.order_status,
          pickup_status: order.pickup_status,
          provider_last_status: order.provider_last_status,
          delivery_message: order.delivery_message,
          provider_meta: order.provider_meta,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(b2c_orders.id, orderId),
            eq(b2c_orders.order_status, 'cancellation_requested'),
          ),
        )
      throw error
    }

    const cancellationContext = getDelhiveryCancellationContext(order)
    let trackingResult: any = null
    try {
      trackingResult = await svc.trackShipment(awbNumber)
    } catch (trackingError: any) {
      console.warn('Delhivery tracking confirmation unavailable after cancellation request', {
        orderId,
        awbNumber,
        error: trackingError?.message || trackingError,
      })
    }

    if (!isDelhiveryCancellationConfirmed(trackingResult, cancellationContext)) {
      const pendingResult = await markDelhiveryCancellationRequested(
        { ...order, order_status: 'cancellation_requested' },
        cancellationResult,
        trackingResult,
      )
      const [latestOrder] = await db
        .select({ order_status: b2c_orders.order_status })
        .from(b2c_orders)
        .where(eq(b2c_orders.id, orderId))
        .limit(1)
      if (String(latestOrder?.order_status || '').trim().toLowerCase() === 'cancelled') {
        return {
          ...pendingResult,
          pending: false,
          confirmed: true,
          message: 'Shipment cancellation confirmed by Delhivery',
        }
      }

      await logTrackingEvent({
        orderId: order.id,
        userId: order.user_id,
        awbNumber,
        courier: order.courier_partner || integration,
        statusCode: 'cancellation_requested',
        statusText: 'Cancellation requested; awaiting Delhivery confirmation',
        raw: { cancellation: cancellationResult, tracking: trackingResult },
      }).catch((err) => {
        console.warn('Failed to log Delhivery cancellation-requested event:', err)
      })

      await sendWebhookEvent(order.user_id, 'tracking.updated', {
        awb_number: awbNumber,
        order_id: order.id,
        order_number: order.order_number,
        status: 'cancellation_requested',
        raw_status: 'cancellation_requested',
        courier_partner: order.courier_partner,
      }).catch((err) => {
        console.warn('Failed to send Delhivery cancellation-requested webhook:', err)
      })

      await syncSalesChannelStatusForOrder(orderId, 'cancellation request')
      return pendingResult
    }

    cancellationResult = {
      ...cancellationResult,
      confirmed: true,
      tracking: trackingResult,
      message: cancellationResult?.message || 'Delhivery cancellation confirmed',
    }
  } else if (integration === 'ekart') {
    const svc = new EkartService()
    cancellationResult = await svc.cancelShipment(awbNumber)
  } else if (integration === 'shadowfax') {
    const svc = new ShadowfaxService()
    const shadowfaxCancelRef = String(
      order.provider_request_id || order.provider_reference || awbNumber,
    ).trim()
    console.log('Shadowfax cancellation identifier', {
      orderId,
      awbNumber,
      providerRequestId: order.provider_request_id,
      providerReference: order.provider_reference,
      cancelReference: shadowfaxCancelRef,
      orderStatus: order.order_status,
    })
    try {
      cancellationResult = await svc.cancelShipment(shadowfaxCancelRef)
    } catch (error: any) {
      if (!isShadowfaxCancellationProcessingError(error)) {
        throw error
      }

      const requestedAt = new Date()
      const pendingResult = {
        success: true,
        pending: true,
        provider: 'shadowfax',
        message:
          'Shadowfax is still processing this new order. Cancellation has been requested and will finalize after provider confirmation.',
        provider_response: error?.response?.data || null,
      }

      console.warn('Shadowfax cancellation is processing; marking local order as cancellation_requested', {
        orderId,
        awbNumber,
        cancelReference: shadowfaxCancelRef,
        providerResponse: error?.response?.data || null,
      })

      await db
        .update(b2c_orders)
        .set({
          order_status: 'cancellation_requested',
          pickup_status: 'cancellation_requested',
          provider_last_status: 'cancellation_requested',
          delivery_message: 'Cancellation requested with Shadowfax',
          provider_meta: {
            ...providerMeta,
            cancellation: {
              provider: integration,
              requested_at: requestedAt.toISOString(),
              awb_number: awbNumber || null,
              pending: true,
              result: pendingResult,
            },
          },
          updated_at: requestedAt,
        })
        .where(eq(b2c_orders.id, orderId))

      await logTrackingEvent({
        orderId: order.id,
        userId: order.user_id,
        awbNumber: awbNumber || null,
        courier: order.courier_partner || integration,
        statusCode: 'cancellation_requested',
        statusText: 'Cancellation requested',
        raw: pendingResult,
      }).catch((err) => {
        console.warn('Failed to log Shadowfax cancellation-requested event:', err)
      })

      await sendWebhookEvent(order.user_id, 'tracking.updated', {
        awb_number: awbNumber || order.awb_number,
        order_id: order.id,
        order_number: order.order_number,
        status: 'cancellation_requested',
        raw_status: 'cancellation_requested',
        courier_partner: order.courier_partner,
      }).catch((err) => {
        console.warn('Failed to send Shadowfax cancellation-requested webhook:', err)
      })

      await syncSalesChannelStatusForOrder(orderId, 'cancellation request')

      return pendingResult
    }
  } else if (integration === 'amazon') {
    const amazonCredentials = await getStoredAmazonShippingCredentials()
    applyAmazonShippingCredentialsToEnv(amazonCredentials)
    cancellationResult = await cancelAmazonShipmentWithRetry({
      shipmentId: amazonShipmentId,
      order,
      credentials: amazonCredentials,
    })
  } else if (integration === 'innofulfill') {
    const svc = new InnofulfillService()
    cancellationResult = await svc.cancelOrdersBulk(
      [{ orderId: innofulfillOrderId, reason: 'Cancelled By Customer' }],
      'Cancelled By Customer',
    )
  } else {
    const svc = new XpressbeesService()
    cancellationResult = await svc.cancelShipment(awbNumber)
  }

  const isSuccess = isCancellationAccepted(cancellationResult)

  console.log('Courier cancellation response validation:', {
    integration,
    isSuccess,
    success: cancellationResult?.success,
    Success: cancellationResult?.Success,
    status: cancellationResult?.status,
    statusType: typeof cancellationResult?.status,
    remark: cancellationResult?.remark,
    message: cancellationResult?.message,
    error: cancellationResult?.error,
    fullResponse: cancellationResult,
  })

  if (!isSuccess) {
    const errorMsg = getCancellationErrorMessage(cancellationResult)
    console.error('Courier cancellation failed:', {
      orderId,
      integration,
      response: cancellationResult,
      message: errorMsg,
    })
    throw new Error(errorMsg)
  }

  console.log('Courier cancellation confirmed; finalizing local cancellation', {
    orderId,
    integration,
  })
  return finalizeOrderCancellation(orderId, cancellationResult, 'pickup_cancel_api')
}

export async function retryPendingDelhiveryCancellations(batchSize = 25) {
  const limit = Number.isFinite(batchSize) && batchSize > 0 ? Math.floor(batchSize) : 25
  const pendingOrders = await db
    .select()
    .from(b2c_orders)
    .where(
      and(
        or(
          eq(b2c_orders.order_status, 'cancellation_requested'),
          and(
            eq(b2c_orders.order_status, 'cancelled'),
            sql`${b2c_orders.provider_meta}->'cancellation' IS NOT NULL`,
            sql`COALESCE(${b2c_orders.provider_meta}->'cancellation'->>'confirmed_at', '') = ''`,
          ),
        ),
        isNotNull(b2c_orders.awb_number),
        or(
          eq(b2c_orders.integration_type, 'delhivery'),
          ilike(b2c_orders.courier_partner, '%delhivery%'),
        ),
      ),
    )
    .orderBy(asc(b2c_orders.updated_at))
    .limit(limit)

  let confirmed = 0
  let pending = 0
  let failed = 0

  for (const order of pendingOrders) {
    const awbNumber = String(order.awb_number || '').trim()
    if (!awbNumber) continue

    const service = new DelhiveryService()
    const cancellationContext = getDelhiveryCancellationContext(order)
    let cancellationResult: any = null
    let trackingResult: any = null

    try {
      trackingResult = await service.trackShipment(awbNumber)
      if (!isDelhiveryCancellationConfirmed(trackingResult, cancellationContext)) {
        cancellationResult = await service.cancelShipment(awbNumber)
        trackingResult = await service.trackShipment(awbNumber)
      }

      if (isDelhiveryCancellationConfirmed(trackingResult, cancellationContext)) {
        await finalizeOrderCancellation(
          order.id,
          {
            ...(cancellationResult || {}),
            success: true,
            confirmed: true,
            provider: 'delhivery',
            awb_number: awbNumber,
            message: cancellationResult?.message || 'Delhivery cancellation confirmed',
            tracking: trackingResult,
          },
          'delhivery_cancellation_retry',
        )
        confirmed += 1
        continue
      }

      await markDelhiveryCancellationRequested(order, cancellationResult, trackingResult)
      pending += 1
    } catch (error: any) {
      await markDelhiveryCancellationRequested(
        order,
        cancellationResult,
        trackingResult,
        error,
      )
      failed += 1
      console.error('Delhivery cancellation retry failed', {
        orderId: order.id,
        orderNumber: order.order_number,
        awbNumber,
        error: error?.message || error,
      })
    }
  }

  return { checked: pendingOrders.length, confirmed, pending, failed }
}
