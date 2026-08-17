export const COURIER_PROVIDER_KEYS = [
  'delhivery',
  'shadowfax',
  'amazon',
  'xpressbees',
  'ekart',
  'innofulfill',
] as const

export type CourierProviderKey = (typeof COURIER_PROVIDER_KEYS)[number]

const COURIER_PROVIDER_DISPLAY_NAMES: Record<CourierProviderKey, string> = {
  delhivery: 'Delhivery',
  shadowfax: 'Shadowfax',
  amazon: 'Amazon Shipping',
  xpressbees: 'Xpressbees',
  ekart: 'Ekart Logistics',
  innofulfill: 'Innofulfill',
}

const normalizeText = (value: unknown) => String(value ?? '').trim()

const toRecord = (value: unknown): Record<string, any> => {
  if (!value) return {}

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    } catch {
      return {}
    }
  }

  return typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

export const normalizeCourierProviderKey = (value: unknown): CourierProviderKey | '' => {
  const text = normalizeText(value).toLowerCase()
  if (!text) return ''

  if ((COURIER_PROVIDER_KEYS as readonly string[]).includes(text)) {
    return text as CourierProviderKey
  }

  const compact = text.replace(/[\s_-]+/g, '')
  if (compact.includes('delhivery')) return 'delhivery'
  if (compact.includes('shadowfax')) return 'shadowfax'
  if (compact.includes('amazon')) return 'amazon'
  if (compact.includes('xpressbees') || compact.includes('xpressbee')) return 'xpressbees'
  if (compact.includes('ekart')) return 'ekart'
  if (compact.includes('innofulfill') || compact.includes('innofulfil')) return 'innofulfill'

  return ''
}

export const getCourierProviderDisplayName = (providerKey: unknown): string => {
  const normalized = normalizeCourierProviderKey(providerKey)
  return normalized ? COURIER_PROVIDER_DISPLAY_NAMES[normalized] : ''
}

export const getProviderMetaCourierName = (providerMeta: unknown): string => {
  const meta = toRecord(providerMeta)
  const data = toRecord(meta.data)
  const provider = toRecord(meta.provider)
  const providerServiceability = toRecord(meta.provider_serviceability)

  const candidates = [
    meta.courier_name,
    meta.courierName,
    meta.carrier_name,
    meta.carrierName,
    meta.provider_name,
    data.courier_name,
    data.courierName,
    data.carrier_name,
    data.carrierName,
    provider.courier_name,
    provider.courierName,
    provider.name,
    providerServiceability.carrier_name,
    providerServiceability.carrierName,
  ]

  return candidates.map(normalizeText).find(Boolean) || ''
}

export const resolveCourierProviderKeyFromFields = (...values: unknown[]): CourierProviderKey | '' => {
  for (const value of values) {
    const providerKey = normalizeCourierProviderKey(value)
    if (providerKey) return providerKey
  }

  return ''
}
