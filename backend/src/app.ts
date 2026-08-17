import cookieParser from 'cookie-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import http from 'http'
import path from 'path'
import { randomUUID } from 'crypto'
import { initSocketServer } from './config/socketServer'
import {
  delhiveryDocumentPushHandler,
  delhiveryScanPushHandler,
  delhiveryWebhookHandler,
} from './controllers/webhooks/delhivery.webhook'
import {
  amazonShippingTrackingWebhookHealthHandler,
  amazonShippingTrackingWebhookHandler,
} from './controllers/webhooks/amazonShipping.webhook'
import { AMAZON_SHIPPING_WEBHOOK_PATH } from './config/amazonShippingWebhook'
import { XPRESSBEES_WEBHOOK_PATH } from './config/xpressbeesWebhook'
import { ekartWebhookHandler } from './controllers/webhooks/ekart.webhook'
import {
  SHADOWFAX_WEBHOOK_PATH,
  shadowfaxWebhookHandler,
  shadowfaxWebhookHealthHandler,
} from './controllers/webhooks/shadowfax.webhook'
import {
  xpressbeesWebhookHandler,
  xpressbeesWebhookHealthHandler,
} from './controllers/webhooks/xpressbees.webhook'
import {
  INNOFULFILL_WEBHOOK_PATH,
  innofulfillDeliveryWebhookHandler,
  innofulfillWebhookHealthHandler,
} from './controllers/webhooks/innofulfill.webhook'
import {
  shopifyComplianceWebhookController,
  shopifyOrderWebhookController,
} from './controllers/shopify.controller'
import { wooCommerceOrderWebhookController } from './controllers/woocommerce.controller'
import adminCourierRoutes from './routes/adminRoutes/adminCourier.routes'
import adminDashboardRoutes from './routes/adminRoutes/dashboard.routes'
import adminSupportRoutes from './routes/adminRoutes/adminSupport.routes'
import adminUserRoutes from './routes/adminRoutes/adminUser.routes'
import adminWalletRoutes from './routes/adminRoutes/adminWallet.routes'
import b2bAdminRoutes from './routes/adminRoutes/b2b.routes'
import adminBillingInvoiceRoutes from './routes/adminRoutes/billingInvoice.admin.routes'
import adminBillingPreferencesRoutes from './routes/adminRoutes/billingPreferences.admin.routes'
import adminCodRemittanceRoutes from './routes/adminRoutes/codRemittance.admin.routes'
import adminDeveloperRoutes from './routes/adminRoutes/developer.routes'
import locationRoutes from './routes/adminRoutes/location.routes'
import adminOrderRoutes from './routes/adminRoutes/order.routes'
import adminOpsAnalyticsRoutes from './routes/adminRoutes/opsAnalytics.routes'
import adminPaymentOptionsRoutes from './routes/adminRoutes/paymentOptions.admin.routes'
import planRoutes from './routes/adminRoutes/plan.routes'
import adminWeightReconciliationRoutes from './routes/adminRoutes/weightReconciliation.admin.routes'
import zoneRoutes from './routes/adminRoutes/zone.routes'
import authRoutes from './routes/authRoutes'
import bankAccountRoutes from './routes/bank.routes'
import billingInvoiceRoutes from './routes/billingInvoice.routes'
import billingPreferencesRoutes from './routes/billingPreferences.routes'
import blogRoutes from './routes/blogs.routes'
import codRemittanceRoutes from './routes/codRemittance.routes'
import courierRoutes from './routes/courier.routes'
import courierPriorityRoutes from './routes/courierPriority.routes'
import dashboardRoutes from './routes/dashboard.routes'
import delhiveryB2BRoutes from './routes/delhiveryB2B.routes'
import delhiveryB2CRoutes from './routes/delhiveryB2C.routes'
import employeeRoutes from './routes/employee.routes'
import externalApiRoutes from './routes/externalApi.routes'
import globalSearchRoutes from './routes/globalSearch.routes'
import integrationRoutes from './routes/integrationRoutes'
import invoicesRoutes from './routes/invoice.routes'
import invoicePreferencesRoutes from './routes/invoicePreferences.routes'
import labelRoutes from './routes/labelPreferences.routes'
import ndrRoutes from './routes/ndr.routes'
import notificationRoutes from './routes/notifications.routes'
import orderRoutes from './routes/order.routes'
import paymentOptionsRoutes from './routes/paymentOptions.routes'
import pickupRoutes from './routes/pickup.routes'
import pickupAddressesRoutes from './routes/pickupAddresses.route'
import returnsRoutes from './routes/returns.routes'
import rtoRoutes from './routes/rto.routes'
import staticPagesRoutes from './routes/staticPages.routes'
import supportRoutes from './routes/support.routes'
import uploadRoutes from './routes/upload.route'
import profileRoutes from './routes/userProfileRoutes'
import reportsRoutes from './routes/reports.routes'
import publicToolsRoutes from './routes/publicTools.routes'
import userRoutes from './routes/userRoutes'
import walletRoutes from './routes/walletRoutes'
import weightReconciliationRoutes from './routes/weightReconciliation.routes'

// Routes imports
// import other routes here...
// Determine environment
const env = process.env.NODE_ENV || 'development'

// Load correct .env file
dotenv.config({ path: path.resolve(__dirname, `../.env.${env}`) })

const app = express()
const server = http.createServer(app) // ✅ HTTP server for socket.io

// Init socket.io server
initSocketServer(server)

const normalizeContentTypeCharset = (contentTypeHeader: string) =>
  contentTypeHeader.replace(/charset=([^;]+)/i, (_match, charset) => {
    return `charset=${String(charset).trim().toLowerCase()}`
  })

app.use((req: any, res, next) => {
  const startedAt = process.hrtime.bigint()
  const requestId = randomUUID()
  req.requestId = requestId
  res.setHeader('X-Request-Id', requestId)

  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000
    if (durationMs >= 1000 || res.statusCode >= 500) {
      console.log('[HTTP]', {
        requestId,
        method: req.method,
        path: req.originalUrl || req.url,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(2)),
      })
    }
  })

  next()
})

app.use((req, _res, next) => {
  const contentTypeHeader = req.headers['content-type']
  if (typeof contentTypeHeader === 'string' && /charset=/i.test(contentTypeHeader)) {
    req.headers['content-type'] = normalizeContentTypeCharset(contentTypeHeader)
  }

  next()
})

app.use(cookieParser())

const normalizeOrigin = (origin: string) => origin.trim().replace(/\/+$/, '').toLowerCase()

const configuredAllowedOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
  .map(normalizeOrigin)

const allowedOrigins = new Set([
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5176',
  'https://fgship.in',
  'https://www.fgship.in',
  'https://client.fgship.in',
  'https://admin.fgship.in',
  'https://express-magic.onrender.com',
  'https://express-magic-admin.onrender.com',
  'https://pax-log.onrender.com',
  'https://pax-log-admin.onrender.com',
  ...configuredAllowedOrigins,
])

const isAllowedOrigin = (origin: string) => {
  const normalizedOrigin = normalizeOrigin(origin)

  if (allowedOrigins.has(normalizedOrigin)) {
    return true
  }

  // Allow first-party HTTPS subdomains like preview or alternate app hosts.
  return /^https:\/\/([a-z0-9-]+\.)*fgship\.in$/.test(normalizedOrigin)
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin)) {
        callback(null, true)
      } else {
        callback(new Error(`Not allowed by CORS: ${origin}`))
      }
    },
    credentials: true,
  }),
)

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' })
})

// Shopify webhooks require raw body for HMAC verification
app.post('/api/webhooks/shopify/order-created', express.raw({ type: 'application/json' }), shopifyOrderWebhookController)
app.post('/api/webhooks/shopify/compliance', express.raw({ type: 'application/json' }), shopifyComplianceWebhookController)
app.post('/api/webhook/shopify/orders', express.raw({ type: 'application/json' }), shopifyOrderWebhookController)
app.post('/api/webhook/shopify/compliance', express.raw({ type: 'application/json' }), shopifyComplianceWebhookController)
app.post('/api/webhook/woocommerce/orders', express.raw({ type: 'application/json' }), wooCommerceOrderWebhookController)

app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
)
app.use(express.urlencoded({ extended: true }))

app.use('/api/user', userRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/integrations', integrationRoutes)
app.use('/api/payments', walletRoutes)
app.use('/api/uploads', uploadRoutes)
app.use('/api/bank-account', bankAccountRoutes)
app.use('/api/pickup-addresses', pickupAddressesRoutes)
app.use('/api', pickupRoutes)
app.use('/api', returnsRoutes)
app.use('/api/couriers', courierRoutes)
app.use('/api/delhivery/b2b', delhiveryB2BRoutes)
app.use('/api/delhivery/b2c', delhiveryB2CRoutes)
app.use('/api/courier', courierPriorityRoutes)
app.use('/api/support', supportRoutes)
app.use('/api/admin', adminSupportRoutes)
app.use('/api/admin/users', adminUserRoutes)
app.use('/api/admin/orders', adminOrderRoutes)
app.use('/api/admin/dashboard', adminDashboardRoutes)
app.use('/api/admin/ops', adminOpsAnalyticsRoutes)
app.use('/api/admin/developer', adminDeveloperRoutes)
app.use('/api/admin/couriers', adminCourierRoutes)
app.use('/api/admin/zones', zoneRoutes)
app.use('/api/admin/b2b', b2bAdminRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api', invoicePreferencesRoutes)
app.use('/api', invoicesRoutes)
app.use('/api', billingInvoiceRoutes)
app.use('/api', adminBillingInvoiceRoutes)
app.use('/api/blogs', blogRoutes)
app.use('/api/static-pages', staticPagesRoutes)
app.use('/api/public', publicToolsRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/search', globalSearchRoutes)
app.use('/api/serviceability', locationRoutes)
app.use('/api/user-management', employeeRoutes)
app.use('/api/label-preference', labelRoutes)
app.use('/api/plans', planRoutes)
app.use('/api/billing-preferences', billingPreferencesRoutes)
app.use('/api/cod-remittance', codRemittanceRoutes)
app.use('/api/admin/cod-remittance', adminCodRemittanceRoutes)
app.use('/api/admin/weight-reconciliation', adminWeightReconciliationRoutes)
app.use('/api/admin/wallets', adminWalletRoutes)
app.use('/api/admin/payment-options', adminPaymentOptionsRoutes)
app.use('/api/admin/billing-preferences', adminBillingPreferencesRoutes)
app.use('/api/payment-options', paymentOptionsRoutes)
app.use('/api/weight-reconciliation', weightReconciliationRoutes)
app.use('/api', ndrRoutes)
app.use('/api', rtoRoutes)
app.use('/api/v1', externalApiRoutes)
// Amazon Shipping tracking webhook. The public production URL is:
// https://api.fgship.in/webhooks/amazon-shipping/tracking
app.get(AMAZON_SHIPPING_WEBHOOK_PATH, amazonShippingTrackingWebhookHealthHandler)
app.post(AMAZON_SHIPPING_WEBHOOK_PATH, express.json(), amazonShippingTrackingWebhookHandler)
app.post('/api/webhook/amazon-shipping/tracking', express.json(), amazonShippingTrackingWebhookHandler)
// Xpressbees tracking webhook. The public production URL is:
// https://api.fgship.in/webhooks/xpressbees/tracking
app.get(XPRESSBEES_WEBHOOK_PATH, xpressbeesWebhookHealthHandler)
app.post(
  XPRESSBEES_WEBHOOK_PATH,
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
  xpressbeesWebhookHandler,
)
// Ekart webhook
app.post(
  '/api/webhook/ekart',
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
  ekartWebhookHandler,
)
app.post(
  '/api/webhook/ekart/track',
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
  ekartWebhookHandler,
)
app.post(
  '/api/webhook/xpressbees',
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
  xpressbeesWebhookHandler,
)
app.post(
  '/api/webhook/xpressbees/track',
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
  xpressbeesWebhookHandler,
)
// Delhivery webhooks - separate endpoints for Scan Push and Document Push
app.post('/api/webhook/delhivery/scan', express.json(), delhiveryScanPushHandler) // Scan Push (Status Updates)
app.post('/api/webhook/delhivery/document', express.json(), delhiveryDocumentPushHandler) // Document Push (POD, Sorter Image, QC Image)
// Legacy unified endpoint (auto-detects type) - kept for backward compatibility
app.post('/api/webhook/delhivery/order', express.json(), delhiveryWebhookHandler)
app.get(SHADOWFAX_WEBHOOK_PATH, shadowfaxWebhookHealthHandler)
app.post(SHADOWFAX_WEBHOOK_PATH, express.json(), shadowfaxWebhookHandler)
app.post('/api/webhook/shadowfax', express.json(), shadowfaxWebhookHandler)
app.post('/api/webhook/shadowfax/track', express.json(), shadowfaxWebhookHandler)
app.get(INNOFULFILL_WEBHOOK_PATH, innofulfillWebhookHealthHandler)
app.post(
  INNOFULFILL_WEBHOOK_PATH,
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
  innofulfillDeliveryWebhookHandler,
)
app.post(
  '/api/webhook/innofulfill',
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
  innofulfillDeliveryWebhookHandler,
)
app.post(
  '/api/webhook/innofulfill/delivery',
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
  innofulfillDeliveryWebhookHandler,
)

app.use((err: any, req: any, res: any, next: any) => {
  if (res.headersSent) {
    return next(err)
  }

  const statusCode =
    err?.message?.startsWith('Not allowed by CORS')
      ? 403
      : typeof err?.statusCode === 'number'
        ? err.statusCode
        : 500

  console.error('❌ Unhandled request error', {
    requestId: req?.requestId ?? null,
    method: req?.method,
    path: req?.originalUrl || req?.url,
    statusCode,
    message: err?.message || String(err),
    stack: err?.stack,
  })

  return res.status(statusCode).json({
    success: false,
    message: statusCode === 500 ? 'Internal server error' : err?.message || 'Request failed',
    requestId: req?.requestId ?? null,
  })
})

export { app, server } // ✅ named exports
