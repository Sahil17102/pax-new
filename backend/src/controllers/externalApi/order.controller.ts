import { eq } from 'drizzle-orm'
import { Response } from 'express'
import { db } from '../../models/client'
import { DelhiveryService } from '../../models/services/couriers/delhivery.service'
import { EkartService } from '../../models/services/couriers/ekart.service'
import { InnofulfillService } from '../../models/services/couriers/innofulfill.service'
import { ShadowfaxService } from '../../models/services/couriers/shadowfax.service'
import { XpressbeesService } from '../../models/services/couriers/xpressbees.service'
import { cancelAmazonShipment } from '../../models/services/amazonShipping.service'
import {
  applyAmazonShippingCredentialsToEnv,
  getStoredAmazonShippingCredentials,
} from '../../models/services/amazonShippingCredentials.service'
import {
  createB2CShipmentService,
  getB2COrdersByUserService,
  retryFailedManifestService,
  ShipmentParams,
  trackByAwbService,
  trackByOrderService,
} from '../../models/services/shiprocket.service'
import { presignDownload } from '../../models/services/upload.service'
import { applyCancellationRefundOnce } from '../../models/services/webhookProcessor'
import { b2c_orders } from '../../schema/schema'
import { sendWebhookEvent } from '../../services/webhookDelivery.service'
import { getOpaqueProviderCode } from '../../utils/externalApiHelpers'
import { getMerchantSafeOperationalError } from '../../utils/merchantErrorMessages'
import { getOrderLabelReference, isExternalLabelReference } from '../../utils/orderLabels'

const isOperationalTimeoutError = (error: any) => {
  const message = String(error?.message || '')
    .trim()
    .toLowerCase()

  return (
    error?.code === 'ECONNABORTED' ||
    error?.code === 'ETIMEDOUT' ||
    message.includes('timeout') ||
    message.includes('timed out')
  )
}

const getInnofulfillCancellationOrderId = (order: any) => {
  const providerMeta =
    order?.provider_meta && typeof order.provider_meta === 'object' && !Array.isArray(order.provider_meta)
      ? order.provider_meta
      : {}

  return String(
    order?.provider_reference ||
      order?.shipment_id ||
      order?.provider_request_id ||
      providerMeta.provider_reference ||
      providerMeta.shipment_id ||
      providerMeta.order_id ||
      providerMeta.orderId ||
      order?.awb_number ||
      '',
  ).trim()
}

const queueWebhookEvent = (
  userId: string,
  eventType: Parameters<typeof sendWebhookEvent>[1],
  eventData: Record<string, any>,
) => {
  void sendWebhookEvent(userId, eventType, eventData).catch((error) => {
    console.error(`Webhook delivery failed for event ${eventType}:`, error)
  })
}

const resolveExternalOrder = async (userId: string, orderId: string) => {
  const { orders } = await getB2COrdersByUserService(userId, 1, 20, {
    search: orderId,
  })

  return (
    orders.find(
      (o: any) =>
        o.order_number === orderId ||
        o.order_id === orderId ||
        o.id === orderId ||
        o.awb_number === orderId ||
        o.provider_reference === orderId ||
        o.provider_request_id === orderId,
    ) || null
  )
}

/**
 * Create a B2C order via external API
 * POST /api/v1/orders
 */
export const createOrderController = async (req: any, res: Response) => {
  try {
    const userId = req.userId // From requireApiKey middleware
    const params: ShipmentParams = req.body
    console.log('[ShipmentCreate] External B2C request received', {
      user_id: userId || null,
      order_number: params?.order_number || null,
      integration_type: params?.integration_type || null,
      payment_type: params?.payment_type || null,
      courier_id: params?.courier_id ?? null,
      has_amazon_request_token: Boolean(params?.amazon_request_token || params?.requestToken),
      has_amazon_rate_id: Boolean(params?.amazon_rate_id || params?.rateId),
      amazon_service_id: params?.amazon_service_id || null,
      amazon_carrier_id: params?.amazon_carrier_id || null,
    })

    // Validate required fields
    if (!params.order_number || !params.consignee || !params.order_items?.length) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'order_number, consignee, and order_items are required',
      })
    }

    // Create the shipment (via external API, so is_external_api = true)
    const result = await createB2CShipmentService(params, userId, true)
    const { order: newOrder, shipment: shipmentData } = result

    // Fetch the full order data
    const [order] = await db
      .select()
      .from(b2c_orders)
      .where(eq(b2c_orders.id, newOrder.id))
      .limit(1)

    if (!order) {
      return res.status(500).json({
        success: false,
        error: 'Order creation failed',
        message: 'Order was created but could not be retrieved',
      })
    }

    queueWebhookEvent(userId, 'order.created', {
      order_id: order.id,
      order_number: order.order_number,
      awb_number: order.awb_number,
      status: order.order_status || 'booked',
      shipment_data: shipmentData,
    })

    const createManifest =
      String(order.integration_type || '')
        .trim()
        .toLowerCase() === 'delhivery' && !order.manifest

    // Generate opaque provider code to hide actual integration_type from external API users
    const providerCode = getOpaqueProviderCode(order.integration_type)

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        order_id: order.id,
        order_number: order.order_number,
        awb_number: order.awb_number,
        status: order.order_status || 'booked',
        label: getOrderLabelReference(order),
        courier_partner: order.courier_partner,
        createManifest: createManifest,
        provider_code: providerCode, // Opaque code - users cannot determine actual provider
      },
    })
  } catch (error: any) {
    console.error('Error creating order via API:', error)
    res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
      success: false,
      error: 'Failed to create order',
      message: error.message || 'Internal server error',
    })
  }
}

/**
 * Get orders list
 * GET /api/v1/orders
 */
export const getOrdersController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1)
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 100)

    const filters = {
      status: req.query.status as string | undefined,
      type: req.query.type as string | undefined,
      courier: req.query.courier as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
    }

    const { orders, totalCount, totalPages } = await getB2COrdersByUserService(
      userId,
      page,
      limit,
      filters,
    )

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
      },
    })
  } catch (error: any) {
    console.error('Error fetching orders via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
      message: error.message || 'Internal server error',
    })
  }
}

/**
 * Get order by ID or order number
 * GET /api/v1/orders/:orderId
 */
export const getOrderController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const { orderId } = req.params

    // Try to get order by order_number or order_id
    const order = await resolveExternalOrder(userId, orderId)

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Order with ID ${orderId} not found`,
      })
    }

    res.status(200).json({
      success: true,
      data: order,
    })
  } catch (error: any) {
    console.error('Error fetching order via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order',
      message: error.message || 'Internal server error',
    })
  }
}

export const retryFailedManifestController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const { orderId } = req.params

    const result = await retryFailedManifestService(String(orderId), userId)
    const retryLabel =
      result.retry_action === 'pickup_request' ? 'Pickup retry completed successfully' : 'Manifest retry completed successfully'

    res.status(200).json({
      success: true,
      message: retryLabel,
      data: result,
    })
  } catch (error: any) {
    console.error('Error retrying failed manifest via API:', error)
    const isTimeout = isOperationalTimeoutError(error)
    const statusCode = typeof error?.statusCode === 'number'
      ? error.statusCode
      : isTimeout
        ? 504
        : 500
    const errorMessage = isTimeout
      ? 'Manifest retry is taking longer than expected. Please try again shortly.'
      : error?.message || 'Internal server error'

    res.status(statusCode).json({
      success: false,
      error: 'Failed to retry manifest',
      message: getMerchantSafeOperationalError(errorMessage),
    })
  }
}

/**
 * Track order by AWB or order number
 * GET /api/v1/orders/track
 */
export const trackOrderController = async (req: any, res: Response) => {
  try {
    const { awb, orderNumber, contact } = req.query

    let awbNumber: string | undefined = awb ? String(awb) : undefined

    if (!awbNumber && orderNumber && contact) {
      const contactStr = String(contact)
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactStr)
      const isPhone = /^\d{7,15}$/.test(contactStr)

      if (!isEmail && !isPhone) {
        return res.status(400).json({
          success: false,
          error: 'Invalid contact',
          message: 'Contact must be a valid email or phone number',
        })
      }

      const orderData = await trackByOrderService({
        orderNumber: String(orderNumber),
        email: isEmail ? contactStr : undefined,
        phone: isPhone ? contactStr : undefined,
      })

      awbNumber = orderData?.awb_number ?? ''
      if (!awbNumber) {
        return res.status(404).json({
          success: false,
          error: 'AWB not found',
          message: 'AWB number not found for this order',
        })
      }
    }

    if (awbNumber) {
      const trackingData = await trackByAwbService(awbNumber)
      return res.json({
        success: true,
        data: trackingData,
      })
    }

    return res.status(400).json({
      success: false,
      error: 'Missing parameters',
      message: "Provide either 'awb' or ('orderNumber' with 'contact')",
    })
  } catch (err: any) {
    console.error('Error tracking order via API:', err)
    return res.status(500).json({
      success: false,
      error: 'Failed to track order',
      message: err.message || 'Internal server error',
    })
  }
}

/**
 * Cancel an order
 * POST /api/v1/orders/:orderId/cancel
 */
export const cancelOrderController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const { orderId } = req.params
    const { reason } = req.body

    // Find the order
    const order = await resolveExternalOrder(userId, orderId)

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Order with ID ${orderId} not found`,
      })
    }

    // Check if order can be cancelled
    const cancellableStatuses = ['booked', 'pending', 'confirmed', 'pickup_initiated']
    if (!cancellableStatuses.includes(order.order_status?.toLowerCase() || '')) {
      return res.status(400).json({
        success: false,
        error: 'Order cannot be cancelled',
        message: `Order with status "${order.order_status}" cannot be cancelled`,
      })
    }

    let cancellationResult: any = null
    const provider = String(order.integration_type || '').toLowerCase()
    if (!['delhivery', 'ekart', 'xpressbees', 'shadowfax', 'amazon', 'innofulfill'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported provider',
        message: `Only Delhivery, Ekart, Xpressbees, Shadowfax, Amazon and Innofulfill are supported for cancellation. Found: ${order.integration_type}`,
      })
    }

    const amazonShipmentId = String(
      order.shipment_id ||
        order.provider_reference ||
        order.order_id ||
        order.provider_meta?.shipment_id ||
        order.provider_meta?.provider_reference ||
        order.provider_meta?.shipmentId ||
        '',
    ).trim()

    if (provider === 'amazon' && !amazonShipmentId) {
      return res.status(400).json({
        success: false,
        error: 'Missing shipment id',
        message: 'Amazon cancellation requires a shipment id',
      })
    }

    const innofulfillOrderId =
      provider === 'innofulfill' ? getInnofulfillCancellationOrderId(order) : ''

    if (provider === 'innofulfill' && !innofulfillOrderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing provider order id',
        message: 'Innofulfill cancellation requires a provider order id',
      })
    }

    if (!['amazon', 'innofulfill'].includes(provider) && !order.awb_number) {
      return res.status(400).json({
        success: false,
        error: 'Missing AWB',
        message: 'Cancellation requires an AWB number',
      })
    }

    try {
      if (provider === 'delhivery') {
        const delhivery = new DelhiveryService()
        cancellationResult = await delhivery.cancelShipment(order.awb_number)
      } else if (provider === 'ekart') {
        const ekart = new EkartService()
        cancellationResult = await ekart.cancelShipment(order.awb_number)
      } else if (provider === 'shadowfax') {
        const shadowfax = new ShadowfaxService()
        cancellationResult = await shadowfax.cancelShipment(
          order.provider_request_id || order.provider_reference || order.awb_number,
          reason || 'Cancelled By Customer',
        )
      } else if (provider === 'amazon') {
        const amazonCredentials = await getStoredAmazonShippingCredentials()
        applyAmazonShippingCredentialsToEnv(amazonCredentials)
        cancellationResult = await cancelAmazonShipment(
          {
            shipmentId: amazonShipmentId,
          },
          amazonCredentials,
        )
      } else if (provider === 'innofulfill') {
        const innofulfill = new InnofulfillService()
        cancellationResult = await innofulfill.cancelOrdersBulk(
          [{ orderId: innofulfillOrderId, reason: reason || 'Cancelled via API' }],
          reason || 'Cancelled via API',
        )
      } else {
        const xpressbees = new XpressbeesService()
        cancellationResult = await xpressbees.cancelShipment(order.awb_number)
      }
    } catch (err: any) {
      console.error('Courier cancellation error:', err)
      return res.status(502).json({
        success: false,
        error: 'Courier cancellation failed',
        message: err?.message || 'Courier cancellation failed',
      })
    }

    const providerCancelAccepted =
      cancellationResult?.success === true ||
      cancellationResult?.Success === true ||
      Number(cancellationResult?.cancelledCount || 0) > 0 ||
      cancellationResult?.status === true ||
      cancellationResult?.status === 'Success' ||
      cancellationResult?.status === 'success' ||
      cancellationResult?.response?.status === true ||
      (Number(cancellationResult?.status) >= 200 && Number(cancellationResult?.status) < 300) ||
      (typeof cancellationResult?.remark === 'string' &&
        cancellationResult.remark.toLowerCase().includes('cancelled')) ||
      (typeof cancellationResult?.message === 'string' &&
        cancellationResult.message.toLowerCase().includes('cancelled') &&
        !cancellationResult?.error)

    if (!providerCancelAccepted) {
      return res.status(502).json({
        success: false,
        error: 'Courier cancellation rejected',
        message:
          cancellationResult?.error ||
          cancellationResult?.message ||
          `${String(order.integration_type || 'Courier')} did not confirm cancellation`,
        data: {
          provider: provider,
          awb_number: order.awb_number,
          provider_response: cancellationResult,
        },
      })
    }

    await db.transaction(async (tx) => {
      await tx
        .update(b2c_orders)
        .set({
          order_status: 'cancelled',
          updated_at: new Date(),
        })
        .where(eq(b2c_orders.id, order.id))

      await applyCancellationRefundOnce(tx, order, 'cancel_api')
    })

    queueWebhookEvent(userId, 'order.cancelled', {
      order_id: order.id,
      order_number: order.order_number,
      awb_number: order.awb_number,
      status: 'cancelled',
      cancellation_reason: reason || 'Cancelled via API',
      cancelled_at: new Date().toISOString(),
    })

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        order_id: order.id,
        order_number: order.order_number,
        awb_number: order.awb_number,
        status: 'cancelled',
        cancellation_reason: reason || 'Cancelled via API',
      },
    })
  } catch (error: any) {
    console.error('Error cancelling order via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to cancel order',
      message: error.message || 'Internal server error',
    })
  }
}

/**
 * Get shipping label for an order
 * GET /api/v1/orders/:orderId/label
 */
export const getOrderLabelController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const { orderId } = req.params

    // Find the order
    const order = await resolveExternalOrder(userId, orderId)

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Order with ID ${orderId} not found`,
      })
    }

    const labelReference = getOrderLabelReference(order)

    if (!labelReference) {
      return res.status(404).json({
        success: false,
        error: 'Label not found',
        message: 'Shipping label has not been generated for this order',
      })
    }
    const safeLabelReference = labelReference

    let labelUrl: string
    try {
      if (isExternalLabelReference(safeLabelReference)) {
        labelUrl = safeLabelReference
      } else {
        const signed = await presignDownload(safeLabelReference)
        labelUrl = Array.isArray(signed)
          ? signed[0] || safeLabelReference
          : signed || safeLabelReference
      }
    } catch (err) {
      // Fallback to stored URL if presigning fails
      labelUrl = safeLabelReference
    }

    res.status(200).json({
      success: true,
      data: {
        order_id: order.id,
        order_number: order.order_number,
        awb_number: order.awb_number,
        label_url: labelUrl,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      },
    })
  } catch (error: any) {
    console.error('Error fetching label via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch label',
      message: error.message || 'Internal server error',
    })
  }
}

export const getOrderPodController = async (req: any, res: Response) => {
  try {
    const order = await resolveExternalOrder(req.userId, String(req.params.orderId || '').trim())
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found', message: 'Order not found' })
    }

    if (String(order.integration_type || '').toLowerCase() !== 'shadowfax') {
      return res.status(400).json({
        success: false,
        error: 'Unsupported provider',
        message: 'POD fetch is currently supported for Shadowfax-backed orders only.',
      })
    }

    const shadowfax = new ShadowfaxService()
    const reference = String(
      order.provider_request_id || order.provider_reference || order.awb_number || '',
    ).trim()
    const reverse =
      String(order.order_type || '').toLowerCase() === 'reverse' ||
      reference.toUpperCase().startsWith('R')

    const pod = await shadowfax.getPodDetails([reference], reverse)
    return res.status(200).json({ success: true, data: pod })
  } catch (error: any) {
    console.error('Error fetching order POD via API:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to fetch POD',
      message: error.message || 'Internal server error',
    })
  }
}

export const escalateOrderController = async (req: any, res: Response) => {
  try {
    const order = await resolveExternalOrder(req.userId, String(req.params.orderId || '').trim())
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found', message: 'Order not found' })
    }

    if (String(order.integration_type || '').toLowerCase() !== 'shadowfax') {
      return res.status(400).json({
        success: false,
        error: 'Unsupported provider',
        message: 'Escalation is currently supported for Shadowfax-backed orders only.',
      })
    }

    const issueCategory = Number(req.body?.issue_category)
    if (!Number.isFinite(issueCategory) || issueCategory <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing issue_category',
        message: 'issue_category must be a positive number',
      })
    }

    const shadowfax = new ShadowfaxService()
    const escalation = await shadowfax.createEscalation({
      awb_number: String(order.awb_number || order.provider_request_id || ''),
      issue_category: issueCategory,
    })

    return res.status(200).json({ success: true, data: escalation })
  } catch (error: any) {
    console.error('Error escalating order via API:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to escalate order',
      message: error.message || 'Internal server error',
    })
  }
}

export const generateOrderQrController = async (req: any, res: Response) => {
  try {
    const order = await resolveExternalOrder(req.userId, String(req.params.orderId || '').trim())
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found', message: 'Order not found' })
    }

    if (String(order.integration_type || '').toLowerCase() !== 'shadowfax') {
      return res.status(400).json({
        success: false,
        error: 'Unsupported provider',
        message: 'QR generation is currently supported for Shadowfax-backed orders only.',
      })
    }

    const shadowfax = new ShadowfaxService()
    const qr = await shadowfax.generateQrCode({
      awb_number: order.awb_number,
      client_request_id: order.provider_request_id || undefined,
      ...req.body,
    })

    return res.status(200).json({ success: true, data: qr })
  } catch (error: any) {
    console.error('Error generating order QR via API:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to generate QR',
      message: error.message || 'Internal server error',
    })
  }
}

export const updateOrderProviderController = async (req: any, res: Response) => {
  try {
    const order = await resolveExternalOrder(req.userId, String(req.params.orderId || '').trim())
    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found', message: 'Order not found' })
    }

    if (String(order.integration_type || '').toLowerCase() !== 'shadowfax') {
      return res.status(400).json({
        success: false,
        error: 'Unsupported provider',
        message: 'Provider update is currently supported for Shadowfax-backed orders only.',
      })
    }

    const shadowfax = new ShadowfaxService()
    const reference = String(
      order.provider_request_id || order.provider_reference || order.awb_number || '',
    ).trim()
    const reverse =
      String(order.order_type || '').toLowerCase() === 'reverse' ||
      reference.toUpperCase().startsWith('R')

    const payload = {
      awb_number: order.awb_number || undefined,
      request_id: reverse ? reference : undefined,
      client_request_id: reverse ? reference : undefined,
      client_order_id: order.order_number,
      ...req.body,
    }

    const result =
      reverse && Object.prototype.hasOwnProperty.call(req.body || {}, 'qc_flag')
        ? await shadowfax.updateReverseQcFlag({
            awb_number: reference,
            qc_flag: Boolean((req.body || {}).qc_flag),
            ...(req.body?.sku_id ? { sku_id: String(req.body.sku_id) } : {}),
          })
        : reverse
        ? await shadowfax.updateReverseOrder(payload)
        : await shadowfax.updateForwardOrder(payload)

    return res.status(200).json({ success: true, data: result })
  } catch (error: any) {
    console.error('Error updating provider order via API:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to update provider order',
      message: error.message || 'Internal server error',
    })
  }
}
