import assert from 'assert'
import {
  calculateBookingWalletDebit,
  resolveGstInclusiveWalletDebit,
} from '../utils/bookingWalletDebit'

const assertAmount = (actual: number, expected: number, label: string) => {
  assert.strictEqual(Number(actual.toFixed(2)), expected, label)
}

const prepaid = calculateBookingWalletDebit({
  paymentType: 'prepaid',
  freightCharges: 100,
  otherCharges: 10,
  codCharges: 50,
  gstPercent: 18,
})
assertAmount(prepaid.baseAmount, 110, 'prepaid taxable base excludes COD')
assertAmount(prepaid.gstAmount, 19.8, 'prepaid GST amount')
assertAmount(prepaid.totalAmount, 129.8, 'prepaid wallet debit includes GST')

const cod = calculateBookingWalletDebit({
  paymentType: 'cod',
  freightCharges: 100,
  otherCharges: 10,
  codCharges: 50,
  gstPercent: 18,
})
assertAmount(cod.baseAmount, 0, 'COD taxable wallet base is zero')
assertAmount(cod.gstAmount, 0, 'COD wallet GST amount is zero')
assertAmount(cod.totalAmount, 0, 'COD wallet debit is zero')

assertAmount(
  resolveGstInclusiveWalletDebit({
    storedDebit: 55,
    paymentType: 'cod',
    freightCharges: 33,
    codCharges: 22,
    gstPercent: 18,
    gstAmount: 9.9,
  }),
  0,
  'COD stored debit resolves to zero for new wallet policy',
)

assertAmount(
  resolveGstInclusiveWalletDebit({
    storedDebit: 64.9,
    paymentType: 'cod',
    freightCharges: 33,
    codCharges: 22,
    gstPercent: 18,
    gstAmount: 9.9,
  }),
  0,
  'GST-inclusive COD stored debit resolves to zero for new wallet policy',
)

assertAmount(
  resolveGstInclusiveWalletDebit({
    storedDebit: 76,
    paymentType: 'cod',
    freightCharges: 40,
    codCharges: 0,
    gstPercent: 18,
    gstAmount: 13.68,
  }),
  0,
  'legacy COD debit with hidden provider COD charge resolves to zero',
)

const productionLikeSamples = [
  {
    label: 'Amazon prepaid freight 30',
    paymentType: 'prepaid',
    freightCharges: 30,
    otherCharges: 0,
    codCharges: 0,
    expected: 35.4,
  },
  {
    label: 'Delhivery COD freight 33 + COD 22',
    paymentType: 'cod',
    freightCharges: 33,
    otherCharges: 0,
    codCharges: 22,
    expected: 0,
  },
  {
    label: 'Xpressbees COD freight 38 + COD 26.4',
    paymentType: 'cod',
    freightCharges: 38,
    otherCharges: 0,
    codCharges: 26.4,
    expected: 0,
  },
  {
    label: 'Delhivery prepaid freight 319',
    paymentType: 'prepaid',
    freightCharges: 319,
    otherCharges: 0,
    codCharges: 0,
    expected: 376.42,
  },
]

for (const sample of productionLikeSamples) {
  const breakup = calculateBookingWalletDebit({
    paymentType: sample.paymentType,
    freightCharges: sample.freightCharges,
    otherCharges: sample.otherCharges,
    codCharges: sample.codCharges,
    gstPercent: 18,
  })
  assertAmount(breakup.totalAmount, sample.expected, `${sample.label} total includes GST`)

  const legacyBaseOnlyDebit =
    sample.paymentType === 'cod'
      ? 0
      : sample.freightCharges + sample.otherCharges
  assertAmount(
    resolveGstInclusiveWalletDebit({
      storedDebit: legacyBaseOnlyDebit,
      paymentType: sample.paymentType,
      freightCharges: sample.freightCharges,
      otherCharges: sample.otherCharges,
      codCharges: sample.codCharges,
      gstPercent: 18,
      gstAmount: breakup.gstAmount,
    }),
    sample.expected,
    `${sample.label} legacy base-only debit resolves to GST-inclusive amount`,
  )

  assertAmount(
    resolveGstInclusiveWalletDebit({
      storedDebit: breakup.totalAmount,
      paymentType: sample.paymentType,
      freightCharges: sample.freightCharges,
      otherCharges: sample.otherCharges,
      codCharges: sample.codCharges,
      gstPercent: 18,
      gstAmount: breakup.gstAmount,
    }),
    sample.expected,
    `${sample.label} GST-inclusive debit is not double charged`,
  )
}

console.log('Booking wallet GST debit checks passed', {
  prepaid,
  cod,
  codWalletDebitPolicy: 'zero',
  productionLikeSamples,
})
