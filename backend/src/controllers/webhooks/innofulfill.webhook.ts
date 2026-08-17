import crypto from 'crypto'
import { Request, Response } from 'express'
import { and, eq, gte, isNull } from 'drizzle-orm'
import { db } from '../../models/client'
import { courier_credentials } from '../../models/schema/courierCredentials'
import { processInnofulfillWebhook } from '../../models/services/webhookProcessor'
import { pending_webhooks } from '../../schema/schema'

export const INNOFULFILL_WEBHOOK_PATH = '/webhooks/innofulfill/delivery'
export const INNOFULFILL_WEBHOOK_URL =
  process.env.INNOFULFILL_WEBHOOK_URL || `https://api.fgship.in${INNOFULFILL_WEBHOOK_PATH}`
export const INNOFULFILL_WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature'

const INNOFULFILL_WEBHOOK_SIGNATURE_HEADERS = [
  'x-webhook-signature',
  'x-hmac-sha256',
  'x-innofulfill-webhook-signature',
  'x-innofulfill-signature',
  'authorization',
]

const getHeaderValue = (headers: Request['headers'], headerName: string) => {
  const value = headers[headerName] || headers[headerName.toLowerCase()]
  if (Array.isArray(value)) return String(value[0] || '').trim()
  return String(value || '').trim()
}

const findSignatureHeader = (headers: Request['headers']) => {
  for (const headerName of INNOFULFILL_WEBHOOK_SIGNATURE_HEADERS) {
    const value = getHeaderValue(headers, headerName)
    if (value) return value
  }
  return ''
}

const maskSensitiveHeaders = (headers: Request['headers']) => {
  const masked: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(headers)) {
    const normalized = key.toLowerCase()
    masked[key] =
      normalized.includes('authorization') ||
      normalized.includes('secret') ||
      normalized.includes('signature') ||
      normalized.includes('hmac')
        ? '[masked]'
        : value
  }
  return masked
}

const timingSafeStringEqual = (actual: string, expected: string) => {
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expected)
  return (
    actualBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

const buildExpectedSignatureCandidates = (configuredSecret: string, rawBody: string) => {
  const digest = crypto.createHmac('sha256', configuredSecret).update(rawBody).digest()
  const base64Signature = digest.toString('base64')
  const hexSignature = digest.toString('hex')
  return [base64Signature, `sha256=${base64Signature}`, hexSignature, `sha256=${hexSignature}`]
}

const verifyInnofulfillWebhookSignature = ({
  configuredSecret,
  receivedSignature,
  rawBody,
}: {
  configuredSecret: string
  receivedSignature: string
  rawBody: string
}) => {
  if (!configuredSecret) return { valid: true, unsigned: !receivedSignature }
  if (!receivedSignature) return { valid: false, unsigned: true }

  const normalizedHeader = receivedSignature.startsWith('Bearer ')
    ? receivedSignature.slice('Bearer '.length).trim()
    : receivedSignature
  const candidateValues = Array.from(
    new Set([
      normalizedHeader,
      normalizedHeader.startsWith('sha256=')
        ? normalizedHeader
        : `sha256=${normalizedHeader}`,
    ]),
  )
  const expectedValues = buildExpectedSignatureCandidates(configuredSecret, rawBody)
  const valid = candidateValues.some((candidate) =>
    expectedValues.some((expectedValue) => timingSafeStringEqual(candidate, expectedValue)),
  )

  return { valid, unsigned: false }
}

const fetchInnofulfillWebhookSecret = async () => {
  try {
    const [row] = await db
      .select({ webhookSecret: courier_credentials.webhookSecret })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, 'innofulfill'))
      .limit(1)
    return (row?.webhookSecret || process.env.INNOFULFILL_WEBHOOK_SECRET || '').trim()
  } catch (err: any) {
    console.error('Failed to load Innofulfill webhook secret:', err?.message || err)
    return String(process.env.INNOFULFILL_WEBHOOK_SECRET || '').trim()
  }
}

const extractInnofulfillBusinessPayload = (payload: any) => {
  if (payload?.__provider === 'innofulfill' && payload?.body) return payload.body
  if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    return payload.data
  }
  return payload || {}
}

const extractInnofulfillAwb = (payload: any) => {
  const data = extractInnofulfillBusinessPayload(payload)
  return (
    data?.awbNumber ||
    data?.cAwbNumber ||
    data?.awb_number ||
    data?.awb ||
    data?.waybill ||
    payload?.awbNumber ||
    payload?.awb_number ||
    payload?.awb ||
    null
  )
}

const extractInnofulfillStatus = (payload: any) => {
  const data = extractInnofulfillBusinessPayload(payload)
  return (
    data?.orderStatus ||
    payload?.event?.eventCode ||
    payload?.event?.triggerEventName ||
    payload?.event ||
    payload?.eventType ||
    data?.status ||
    'unknown'
  )
}

const queuePendingInnofulfillWebhook = async ({
  payload,
  awb,
  status,
}: {
  payload: any
  awb: unknown
  status: unknown
}) => {
  const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000)
  const awbValue = String(awb || 'unknown')
  const statusValue = `innofulfill:${String(status || 'unknown')}`
  const [existingPending] = await db
    .select({ id: pending_webhooks.id })
    .from(pending_webhooks)
    .where(
      and(
        eq(pending_webhooks.awb_number, awbValue),
        eq(pending_webhooks.status, statusValue),
        isNull(pending_webhooks.processed_at),
        gte(pending_webhooks.created_at, dedupeWindowStart),
      ),
    )
    .limit(1)

  if (existingPending) {
    console.warn(
      `Duplicate pending Innofulfill webhook skipped for AWB ${awb || 'N/A'} (within dedupe window).`,
    )
    return
  }

  await db.insert(pending_webhooks).values({
    awb_number: awb ? String(awb) : null,
    status: statusValue,
    payload: {
      __provider: 'innofulfill',
      body: payload,
    },
  })
  console.warn(`Stored Innofulfill webhook for AWB ${awb || 'N/A'} (order not yet created).`)
}

const hasProcessedInnofulfillWebhook = async (webhookId: string) => {
  if (!webhookId) return false
  const [existing] = await db
    .select({ id: pending_webhooks.id })
    .from(pending_webhooks)
    .where(eq(pending_webhooks.status, `innofulfill:processed:${webhookId}`))
    .limit(1)
  return Boolean(existing)
}

const markInnofulfillWebhookProcessed = async ({
  webhookId,
  awb,
  payload,
}: {
  webhookId: string
  awb: unknown
  payload: any
}) => {
  if (!webhookId) return
  await db.insert(pending_webhooks).values({
    awb_number: awb ? String(awb) : null,
    status: `innofulfill:processed:${webhookId}`,
    payload: {
      __provider: 'innofulfill',
      processed: true,
      body: payload,
    },
    processed_at: new Date(),
  })
}

const processInnofulfillWebhookAfterAck = async ({
  payload,
  awb,
  status,
  webhookId,
}: {
  payload: any
  awb: unknown
  status: unknown
  webhookId: string
}) => {
  if (webhookId && (await hasProcessedInnofulfillWebhook(webhookId))) {
    console.log(`Innofulfill webhook ${webhookId} already processed; skipping duplicate.`)
    return
  }

  const result = await processInnofulfillWebhook(payload)

  if (!result.success && result.reason === 'missing_awb') {
    console.warn('Innofulfill webhook ignored after ack: missing AWB/order reference')
    return
  }

  if (!result.success && result.reason === 'order_not_found') {
    await queuePendingInnofulfillWebhook({ payload, awb, status })
    return
  }

  if (!result.success) {
    console.warn('Innofulfill webhook accepted but not processed:', result.reason)
    return
  }

  await markInnofulfillWebhookProcessed({ webhookId, awb, payload })
}

export const innofulfillWebhookHealthHandler = (_req: Request, res: Response) =>
  res.status(200).json({
    success: true,
    provider: 'innofulfill',
    webhookUrl: INNOFULFILL_WEBHOOK_URL,
    deliveryUrl: INNOFULFILL_WEBHOOK_URL,
    aliases: ['/api/webhook/innofulfill', '/api/webhook/innofulfill/delivery'],
    supportedEvents: {
      ecomm: [
        'ORDER_CREATED',
        'ORDER_CONFIRMED',
        'OUT_FOR_PICKUP',
        'READY_FOR_DISPATCH',
        'PICKED_UP',
        'NOT_PICKED_UP',
        'PICKUP_RESCHEDULED',
        'PICKUP_CANCELLED',
        'IN_TRANSIT',
        'ON_HOLD',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'UNDELIVERED',
        'RTO_REQUESTED',
        'RTO_INITIATED',
        'RTO',
        'RTO_IN_TRANSIT',
        'RTO_OUT_FOR_DELIVERY',
        'RTO_UNDELIVERED',
        'RTO_DELIVERED',
        'RTO_REVOKED',
        'CANCELLED',
        'DAMAGED',
        'LOST',
        'ERROR_ORDER',
      ],
      hyperlocal: [
        'ORDER_CREATED',
        'ORDER_CONFIRMED',
        'PICKED_UP',
        'READY_FOR_DELIVERY',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'RTO_INITIATED',
        'RTO',
        'CANCELLED',
        'CANCELLED_BY_CUSTOMER',
        'CANCELLED_BY_SHIPPER',
        'ERROR_ORDER',
      ],
    },
    authentication: {
      type: 'hmac_sha256',
      requiredWhenSecretConfigured: true,
      headerName: INNOFULFILL_WEBHOOK_SIGNATURE_HEADER,
      encodings: ['hex', 'base64', 'sha256=hex', 'sha256=base64'],
      sample: "hash_hmac('sha256', raw_request_body, webhook_signature_key)",
    },
    expectedResponse: '200 OK',
    timeoutSafe: true,
  })

export const innofulfillDeliveryWebhookHandler = async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString()
  const payload = req.body || {}
  const rawBody = (req as any).rawBody || (req.body ? JSON.stringify(req.body) : '')
  const webhookId =
    getHeaderValue(req.headers, 'x-webhook-id') || String(payload?.id || '').trim()
  const awb = extractInnofulfillAwb(payload)
  const status = extractInnofulfillStatus(payload)
  const webhookEvent =
    getHeaderValue(req.headers, 'x-webhook-event') ||
    String(payload?.event?.triggerEventName || payload?.eventType || payload?.event || '').trim()

  console.log('='.repeat(80))
  console.log(`[${timestamp}] Innofulfill delivery webhook received`)
  console.log(`   Webhook ID: ${webhookId || 'N/A'}`)
  console.log(`   Event: ${webhookEvent || 'N/A'}`)
  console.log(`   AWB: ${awb || 'N/A'}`)
  console.log(`   Status: ${status || 'unknown'}`)
  console.log(`   Tenant: ${getHeaderValue(req.headers, 'x-tenant-id') || payload?.tenantId || 'N/A'}`)
  console.log(`   IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`)
  console.log('   Headers:', JSON.stringify(maskSensitiveHeaders(req.headers), null, 2))
  console.log('   Payload:', JSON.stringify(payload, null, 2))
  console.log('='.repeat(80))

  res.status(200).json({
    success: true,
    accepted: true,
    processing: true,
  })

  setImmediate(() => {
    ;(async () => {
      const configuredSecret = await fetchInnofulfillWebhookSecret()
      const receivedSignature = findSignatureHeader(req.headers)
      const signature = verifyInnofulfillWebhookSignature({
        configuredSecret,
        receivedSignature,
        rawBody,
      })

      if (!signature.valid) {
        console.warn('Innofulfill webhook signature mismatch; acknowledged without processing.', {
          webhookId: webhookId || null,
          awb: awb || null,
          status: String(status || 'unknown'),
          signaturePresent: Boolean(receivedSignature),
        })
        return
      }

      if (signature.unsigned && !configuredSecret) {
        console.warn(
          'Innofulfill webhook received without a configured signature key; processing unsigned payload.',
        )
      }

      await processInnofulfillWebhookAfterAck({ payload, awb, status, webhookId })
    })().catch((err: any) => {
      console.error('Innofulfill webhook background error:', {
        message: err?.message || String(err),
        webhookId: webhookId || null,
        awb: awb || null,
        status: String(status || 'unknown'),
        stack: err?.stack || null,
      })
    })
  })
}
