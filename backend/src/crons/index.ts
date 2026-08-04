import cron from 'node-cron'
import { generateAutoBillingInvoices } from './invoiceGenerator'
import { processPendingWebhooks } from './processPendingWebhooks'
import { reconcileWalletTopups } from './reconcileWalletTopups'
import { seedHolidaysCron } from './seedHolidays'
import {
  sendDailyWeightReconciliationEmails,
  sendWeeklyWeightReconciliationEmails,
} from './weightReconciliationEmails'
import { pollCourierTracking } from './courierTracking'
import { retryPendingSalesChannelStatusSync } from '../models/services/salesChannelSync.service'
import { syncShopifyOrdersForAllStores } from '../models/services/shopify.service'
import { retryPendingDelhiveryCancellations } from '../models/services/pickup.service'

const parseTrackingProviders = () =>
  String(process.env.COURIER_TRACKING_POLL_PROVIDERS || '')
    .split(/[\s,;|]+/)
    .map((provider) => provider.trim())
    .filter(Boolean)

cron.schedule(process.env.COURIER_TRACKING_POLL_CRON || '*/15 * * * *', async () => {
  console.log('[Cron] Courier tracking poll')
  try {
    const result = await pollCourierTracking({
      batchSize: Number(process.env.COURIER_TRACKING_POLL_BATCH_SIZE || 50),
      providers: parseTrackingProviders(),
    })
    if (result.checked > 0) {
      console.log('[Cron] Courier tracking poll complete', result)
    }
  } catch (err) {
    console.error('[Cron] Courier tracking poll failed:', err)
  }
})

cron.schedule(process.env.DELHIVERY_CANCELLATION_RETRY_CRON || '*/2 * * * *', async () => {
  try {
    const result = await retryPendingDelhiveryCancellations(
      Number(process.env.DELHIVERY_CANCELLATION_RETRY_BATCH_SIZE || 25),
    )
    if (result.checked > 0) {
      console.log('[Cron] Delhivery cancellation retry complete', result)
    }
  } catch (err) {
    console.error('[Cron] Delhivery cancellation retry failed:', err)
  }
})

// Runs every 20 minutes.
cron.schedule('*/20 * * * *', async () => {
  console.log('[Cron] Wallet reconciliation kicking off')
  try {
    await reconcileWalletTopups()
  } catch (err) {
    console.error('[Cron] Wallet reconciliation failed:', err)
  }
})

cron.schedule('*/1 * * * *', () => {
  processPendingWebhooks().catch((err) => console.error('Error in cron webhook processor', err))
})

cron.schedule(process.env.SALES_CHANNEL_SYNC_RETRY_CRON || '*/10 * * * *', async () => {
  try {
    const result = await retryPendingSalesChannelStatusSync()
    if (result.attempted > 0 || result.failed > 0) {
      console.log('[Cron] Sales channel status sync retry complete', result)
    }
  } catch (err) {
    console.error('[Cron] Sales channel status sync retry failed:', err)
  }
})

cron.schedule(process.env.SHOPIFY_ORDER_SYNC_CRON || '*/30 * * * *', async () => {
  try {
    const result = await syncShopifyOrdersForAllStores()
    if (result.stores > 0) {
      console.log('[Cron] Shopify order refresh complete', result)
    }
  } catch (err) {
    console.error('[Cron] Shopify order refresh failed:', err)
  }
})

cron.schedule('0 2 * * *', () => generateAutoBillingInvoices())

// Send daily weight reconciliation summaries at 8 AM.
cron.schedule('0 8 * * *', async () => {
  console.log('[Cron] Daily weight reconciliation emails starting')
  try {
    await sendDailyWeightReconciliationEmails()
  } catch (err) {
    console.error('[Cron] Daily weight reconciliation emails failed:', err)
  }
})

// Send weekly weight reconciliation reports every Monday at 9 AM.
cron.schedule('0 9 * * 1', async () => {
  console.log('[Cron] Weekly weight reconciliation reports starting')
  try {
    await sendWeeklyWeightReconciliationEmails()
  } catch (err) {
    console.error('[Cron] Weekly weight reconciliation reports failed:', err)
  }
})

// Runs on January 1st at 12:00 AM every year.
cron.schedule('0 0 1 1 *', () => {
  console.log('[Cron] Holiday seeding cron triggered')
  seedHolidaysCron().catch((err) => console.error('Error in holiday seeding cron', err))
})
