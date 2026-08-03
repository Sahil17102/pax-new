import { useMutation } from '@tanstack/react-query'
import { confirmRecharge, createRechargeOrder, fetchRechargeStatus } from '../api/wallet.api'

interface RechargeOptions {
  amount: number
  prefill: {
    name: string
    email: string
    contact: string
  }
}

interface WalletTopupStatusResponse {
  ok: boolean
  status: 'created' | 'processing' | 'success' | 'failed'
  paymentId?: string | null
  paymentStatus?: string
  message?: string
  alreadyProcessed?: boolean
}

interface RazorpayCheckoutOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  prefill: {
    name: string
    email: string
    contact: string
  }
  theme: {
    color: string
  }
  handler: (response: RazorpayPaymentResponse) => void | Promise<void>
  modal: {
    ondismiss: () => void
  }
}

interface RazorpayPaymentResponse {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
}

interface RazorpayPaymentFailureResponse {
  error?: {
    description?: string
    reason?: string
    step?: string
  }
}

interface RazorpayInstance {
  open: () => void
  on: (event: string, callback: (response: RazorpayPaymentFailureResponse) => void) => void
  close: () => void
}

interface RazorpayConstructor {
  new (options: RazorpayCheckoutOptions): RazorpayInstance
}

declare global {
  interface Window {
    Razorpay: RazorpayConstructor
  }
}

const getErrorMessage = (error: unknown, fallback: string) => {
  const apiMessage =
    typeof error === 'object' &&
    error !== null &&
    'response' in error &&
    typeof (error as { response?: { data?: { error?: unknown } } }).response?.data?.error === 'string'
      ? (error as { response?: { data?: { error?: string } } }).response?.data?.error
      : ''

  if (apiMessage) return apiMessage
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export const useRechargeWallet = () =>
  useMutation<void, Error, RechargeOptions>({
    mutationFn: async (options) => {
      const orderData = await createRechargeOrder({
        amount: options.amount,
        name: options.prefill.name,
        email: options.prefill.email,
        phone: options.prefill.contact,
      })

      if (!orderData?.orderId || !orderData?.key) {
        throw new Error('Invalid Razorpay order response')
      }

      if (!window.Razorpay) {
        throw new Error('Razorpay Checkout failed to load. Please refresh and try again.')
      }

      return new Promise<void>((resolve, reject) => {
        let settled = false
        let closingForSuccess = false
        let statusPollTimer: number | undefined
        let initialStatusCheckTimer: number | undefined
        let hardTimeoutTimer: number | undefined
        let razorpay: RazorpayInstance | null = null

        const cleanup = () => {
          if (statusPollTimer !== undefined) window.clearInterval(statusPollTimer)
          if (initialStatusCheckTimer !== undefined) window.clearTimeout(initialStatusCheckTimer)
          if (hardTimeoutTimer !== undefined) window.clearTimeout(hardTimeoutTimer)
        }

        const resolveAndReload = () => {
          if (settled) return
          settled = true
          cleanup()
          resolve()
          window.setTimeout(() => window.location.reload(), 0)
        }

        const rejectWithMessage = (message: string) => {
          if (settled) return
          settled = true
          cleanup()
          reject(new Error(message))
        }

        const settleFromStatus = async (source: string) => {
          if (settled) return

          try {
            const status = (await fetchRechargeStatus(orderData.orderId)) as WalletTopupStatusResponse

            if (status.status === 'success') {
              closingForSuccess = true
              try {
                razorpay?.close()
              } catch (error) {
                console.warn('Failed to close Razorpay checkout after success:', error)
              }
              resolveAndReload()
              return
            }

            if (status.status === 'failed') {
              rejectWithMessage(status.message || 'Payment failed.')
              return
            }

            if (source === 'timeout') {
              rejectWithMessage(
                status.message ||
                  'Payment confirmation is taking longer than usual. If money was debited, it should reflect shortly.',
              )
            }
          } catch (error) {
            console.error(`Wallet top-up status check failed during ${source}:`, error)

            if (source === 'timeout') {
              rejectWithMessage(
                getErrorMessage(
                  error,
                  'We could not confirm the payment automatically. If money was debited, it should reflect shortly.',
                ),
              )
            }
          }
        }

        const optionsRazorpay: RazorpayCheckoutOptions = {
          key: orderData.key,
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          name: orderData.name || 'Pax Logistics',
          description: orderData.description || 'Wallet Recharge',
          order_id: orderData.orderId,
          prefill: orderData.prefill,
          theme: orderData.theme || { color: '#062A5B' },
          handler: async (response: RazorpayPaymentResponse) => {
            try {
              const confirmation = await confirmRecharge({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              })

              if (confirmation?.status === 'success' || confirmation?.ok) {
                resolveAndReload()
                return
              }

              await settleFromStatus('handler')
            } catch (error) {
              console.error('Payment confirmation error:', error)
              await settleFromStatus('handler-fallback')

              if (!settled) {
                rejectWithMessage(
                  getErrorMessage(
                    error,
                    'Payment succeeded but confirmation is still pending. If money was debited, it should reflect shortly.',
                  ),
                )
              }
            }
          },
          modal: {
            ondismiss: () => {
              if (closingForSuccess || settled) return

              void settleFromStatus('dismiss').then(() => {
                if (!settled) {
                  rejectWithMessage(
                    'Payment window was closed before confirmation. If money was debited, it should reflect in your wallet shortly.',
                  )
                }
              })
            },
          },
        }

        razorpay = new window.Razorpay(optionsRazorpay)
        razorpay.on('payment.failed', (response: RazorpayPaymentFailureResponse) => {
          rejectWithMessage(
            response?.error?.description ||
              response?.error?.reason ||
              'Payment failed. Please try again.',
          )
        })

        razorpay.open()

        initialStatusCheckTimer = window.setTimeout(() => {
          void settleFromStatus('initial-check')
        }, 3000)

        statusPollTimer = window.setInterval(() => {
          void settleFromStatus('poll')
        }, 5000)

        hardTimeoutTimer = window.setTimeout(() => {
          void settleFromStatus('timeout')
        }, 10 * 60 * 1000)
      })
    },
  })
