import { calculateGstBreakup, roundCurrency } from './gst'

const toAmount = (value: unknown) => {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const isCodPayment = (paymentType: unknown) => String(paymentType || '').toLowerCase() === 'cod'

export const normalizeChargePercent = (value: unknown) => {
  const parsed = Number(value ?? 0)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return roundCurrency(parsed)
}

export const calculatePercentChargeAmount = (baseAmount: unknown, percent: unknown, enabled = true) => {
  if (!enabled) return 0
  const base = toAmount(baseAmount)
  const normalizedPercent = normalizeChargePercent(percent)
  if (base <= 0 || normalizedPercent <= 0) return 0
  return roundCurrency((base * normalizedPercent) / 100)
}

export const getBookingWalletDebitBaseAmount = ({
  paymentType,
  freightCharges = 0,
  otherCharges = 0,
  codCharges = 0,
}: {
  paymentType?: string | null
  freightCharges?: unknown
  otherCharges?: unknown
  codCharges?: unknown
}) => {
  if (isCodPayment(paymentType)) return 0

  const base =
    toAmount(freightCharges) +
    toAmount(otherCharges)

  return roundCurrency(base)
}

export const calculateBookingWalletDebit = ({
  paymentType,
  freightCharges = 0,
  otherCharges = 0,
  codCharges = 0,
  gstPercent = 0,
  razorpayChargeEnabled = false,
  razorpayChargePercent = 0,
}: {
  paymentType?: string | null
  freightCharges?: unknown
  otherCharges?: unknown
  codCharges?: unknown
  gstPercent?: unknown
  razorpayChargeEnabled?: unknown
  razorpayChargePercent?: unknown
}) => {
  const baseAmountBeforeRazorpay = getBookingWalletDebitBaseAmount({
    paymentType,
    freightCharges,
    otherCharges,
    codCharges,
  })
  const normalizedRazorpayChargePercent = normalizeChargePercent(razorpayChargePercent)
  const shouldApplyRazorpayCharge =
    Boolean(razorpayChargeEnabled) && normalizedRazorpayChargePercent > 0
  const razorpayChargeAmount = calculatePercentChargeAmount(
    baseAmountBeforeRazorpay,
    normalizedRazorpayChargePercent,
    shouldApplyRazorpayCharge,
  )
  const breakup = calculateGstBreakup(
    baseAmountBeforeRazorpay + razorpayChargeAmount,
    gstPercent,
  )

  return {
    ...breakup,
    baseAmountBeforeRazorpay,
    razorpayChargeEnabled: shouldApplyRazorpayCharge,
    razorpayChargePercent: normalizedRazorpayChargePercent,
    razorpayChargeAmount,
  }
}

export const resolveGstInclusiveWalletDebit = ({
  storedDebit,
  paymentType,
  freightCharges = 0,
  otherCharges = 0,
  codCharges = 0,
  gstPercent = 0,
  gstAmount = 0,
  razorpayChargeEnabled = false,
  razorpayChargePercent = 0,
}: {
  storedDebit?: unknown
  paymentType?: string | null
  freightCharges?: unknown
  otherCharges?: unknown
  codCharges?: unknown
  gstPercent?: unknown
  gstAmount?: unknown
  razorpayChargeEnabled?: unknown
  razorpayChargePercent?: unknown
}) => {
  if (isCodPayment(paymentType)) return 0

  const stored = toAmount(storedDebit)
  const gst = toAmount(gstAmount)
  const percent = toAmount(gstPercent)
  const computed = calculateBookingWalletDebit({
    paymentType,
    freightCharges,
    otherCharges,
    codCharges,
    gstPercent: percent,
    razorpayChargeEnabled,
    razorpayChargePercent,
  })

  if (stored <= 0) return computed.totalAmount
  if (gst <= 0 || percent <= 0) return Math.max(stored, computed.totalAmount)

  const gstOnStoredDebit = roundCurrency((stored * percent) / 100)
  const storedLooksTaxableOnly = Math.abs(gstOnStoredDebit - gst) <= 0.02
  if (storedLooksTaxableOnly) {
    return roundCurrency(stored + gst)
  }

  return Math.max(stored, computed.totalAmount)
}
