import { randomUUID } from 'crypto'
import * as dotenv from 'dotenv'
import * as path from 'path'
import { Pool, PoolClient } from 'pg'
import forwardRateCardData from './forwardRateCardData.json'

const TARGET_PROVIDERS = [
  'delhivery',
  'ekart',
  'xpressbees',
  'amazon',
  'shadowfax',
  'innofulfill',
] as const
const BASIC_PLAN_NAME = 'Basic'
const RATE = 10
const COD_CHARGES = 10
const COD_PERCENT = 2
const EXTRA_RATE = 10
const EXTRA_WEIGHT_UNIT_KG = 1
const FIRST_SLAB_TO_KG = 0.5
const LOCAL_FALLBACK_DATABASE_URL = 'postgres://postgres@127.0.0.1:5432/meracourier'

const INNOFULFILL_ECOMM_FORWARD_RATES: Record<string, number[]> = {
  local: [0, 0, 0, 0],
  withinZone: [32, 55, 113, 48],
  metro: [48, 89, 145, 53],
  roi: [54, 99, 163, 63],
  neJk: [73, 131, 223, 68],
}

const INNOFULFILL_ECOMM_SLABS = [
  { weight_from: 0, weight_to: 0.5 },
  { weight_from: 0.5, weight_to: 1 },
  { weight_from: 1, weight_to: 2 },
  { weight_from: 2, weight_to: null },
]

type Provider = (typeof TARGET_PROVIDERS)[number]

type CourierSeed = {
  id: number
  name: string
  serviceProvider: Provider
  mode: string
}

type ZoneRow = {
  id: string
  code: string
  name: string
}

type RateSlabSeed = {
  weight_from: number
  weight_to: number | null
  rate: number
  extra_rate: number | null
  extra_weight_unit: number | null
}

type CourierRow = {
  id: number
  name: string
  serviceProvider: Provider
  mode: string
}

const REQUIRED_COURIER_SEEDS: CourierSeed[] = [
  {
    id: 99,
    name: 'Delhivery Air',
    serviceProvider: 'delhivery',
    mode: 'air',
  },
  {
    id: 100,
    name: 'Delhivery Surface',
    serviceProvider: 'delhivery',
    mode: 'surface',
  },
  {
    id: 45,
    name: 'Xpressbees 2kg',
    serviceProvider: 'xpressbees',
    mode: 'surface',
  },
  {
    id: 601,
    name: 'Innofulfill ECOMM',
    serviceProvider: 'innofulfill',
    mode: 'surface',
  },
]
const REQUIRED_COURIER_SEED_KEYS = new Set(
  REQUIRED_COURIER_SEEDS.map((seed) => `${seed.serviceProvider}:${seed.id}`),
)

const loadEnv = () => {
  const env = process.env.NODE_ENV || 'development'
  dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })
}

const normalizeProvider = (value: unknown): Provider | null => {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'delhivery') return 'delhivery'
  if (raw === 'ekart') return 'ekart'
  if (raw === 'xpressbees') return 'xpressbees'
  if (raw === 'amazon') return 'amazon'
  if (raw === 'shadowfax') return 'shadowfax'
  if (raw === 'innofulfill' || raw === 'innofulfil') return 'innofulfill'
  return null
}

const providerFromCourierName = (name: string): Provider | null => {
  const lower = name.toLowerCase()
  if (lower.includes('delhivery')) return 'delhivery'
  if (lower.includes('ekart')) return 'ekart'
  if (lower.includes('xpressbees')) return 'xpressbees'
  if (lower.includes('amazon')) return 'amazon'
  if (lower.includes('shadowfax')) return 'shadowfax'
  if (lower.includes('innofulfill') || lower.includes('innofulfil')) return 'innofulfill'
  return null
}

const inferMode = (name: string, mode?: unknown) => {
  const raw = String(mode || '').trim().toLowerCase()
  if (raw === 'air' || raw === 'a' || raw === 'express') return 'air'
  if (raw === 'surface' || raw === 's' || raw === 'ground') return 'surface'
  return name.toLowerCase().includes('air') ? 'air' : 'surface'
}

const isXpressbeesAir = (name: string, mode?: unknown) =>
  inferMode(name, mode) === 'air' || name.toLowerCase().includes('air')

const isSupportedXpressbeesSeed = (name: string, mode?: unknown) => {
  const lowerName = name.toLowerCase()
  if (lowerName.includes('reverse')) return false
  if (isXpressbeesAir(name, mode)) return true
  if (lowerName.includes('stressed')) return true
  if (lowerName.includes('surface')) return true
  return /\b(?:1|2|5|10|20)\s*(?:k\.?\s*g\.?|kg|kgs)\b/i.test(name)
}

const canonicalDelhiverySeed = (name: string, mode?: unknown): CourierSeed => {
  const resolvedMode = inferMode(name, mode)
  return resolvedMode === 'air'
    ? {
        id: 99,
        name: 'Delhivery Air',
        serviceProvider: 'delhivery',
        mode: 'air',
      }
    : {
        id: 100,
        name: 'Delhivery Surface',
        serviceProvider: 'delhivery',
        mode: 'surface',
      }
}

const isSupportedProviderCourierSeed = (seed: CourierSeed) => {
  if (seed.serviceProvider === 'delhivery') {
    return seed.id === 99 || seed.id === 100
  }

  if (seed.serviceProvider === 'xpressbees') {
    return isSupportedXpressbeesSeed(seed.name, seed.mode)
  }

  return !seed.name.toLowerCase().includes('reverse')
}

const fallbackCourierSeeds = (): CourierSeed[] => {
  const seen = new Set<string>()
  const seeds: CourierSeed[] = []

  for (const seed of REQUIRED_COURIER_SEEDS) {
    const key = `${seed.serviceProvider}:${seed.id}`
    seen.add(key)
    seeds.push(seed)
  }

  for (const row of forwardRateCardData as any[]) {
    const name = String(row?.courier_name || '').trim()
    const provider = providerFromCourierName(name)
    const id = Number(row?.id)
    const type = String(row?.type || '').trim().toLowerCase()
    if (!provider || !Number.isFinite(id) || !name || type === 'reverse') continue

    const seed: CourierSeed =
      provider === 'delhivery'
        ? canonicalDelhiverySeed(name, row?.mode)
        : {
            id,
            name,
            serviceProvider: provider,
            mode: inferMode(name, row?.mode),
          }
    if (!isSupportedProviderCourierSeed(seed)) continue

    const key = `${seed.serviceProvider}:${seed.id}`
    if (seen.has(key)) continue
    seen.add(key)
    seeds.push(seed)
  }

  return seeds
}

const tableExists = async (client: PoolClient, tableName: string) => {
  const { rows } = await client.query(
    `select 1 from information_schema.tables where table_schema = 'public' and table_name = $1 limit 1`,
    [tableName],
  )
  return rows.length > 0
}

const resolveZonesTable = async (client: PoolClient) => {
  for (const tableName of ['shiplifi_zones', 'meracourierwala_zones', 'zones']) {
    if (await tableExists(client, tableName)) return tableName
  }
  throw new Error('No zones table found. Expected shiplifi_zones or meracourierwala_zones.')
}

const ensureBasicPlan = async (client: PoolClient) => {
  const existing = await client.query(
    `select id from plans where lower(name) = lower($1) order by created_at nulls last limit 1`,
    [BASIC_PLAN_NAME],
  )
  if (existing.rows[0]?.id) return existing.rows[0].id as string

  const id = randomUUID()
  await client.query(
    `insert into plans (id, name, description, is_active, created_at)
     values ($1, $2, $3, true, now())`,
    [id, BASIC_PLAN_NAME, 'Default B2C plan'],
  )
  return id
}

const ensureB2CZones = async (client: PoolClient, zonesTable: string): Promise<ZoneRow[]> => {
  const seeds = [
    {
      code: 'local',
      name: 'local',
      description: 'Innofulfill ECOMM local/same-city B2C lane.',
      region: 'local',
    },
    {
      code: 'withinZone',
      name: 'withinZone',
      description: 'Innofulfill ECOMM within-zone B2C lane.',
      region: 'withinZone',
    },
    {
      code: 'metro',
      name: 'metro',
      description: 'Innofulfill ECOMM metro B2C lane.',
      region: 'metro',
    },
    {
      code: 'roi',
      name: 'roi',
      description: 'Innofulfill ECOMM rest-of-India B2C lane.',
      region: 'roi',
    },
    {
      code: 'neJk',
      name: 'neJk',
      description: 'Innofulfill ECOMM north-east and Jammu/Kashmir B2C lane.',
      region: 'neJk',
    },
    {
      code: 'METRO_TO_METRO',
      name: 'Metro to Metro',
      description: 'Shipments moving between major metro cities.',
      region: 'Metro to Metro',
    },
    {
      code: 'ROI',
      name: 'Rest of India',
      description: 'Shipments outside same-city, same-state, same-region, and special zones.',
      region: 'Rest of India',
    },
    {
      code: 'SPECIAL_ZONE',
      name: 'Special Zone',
      description: 'Locations requiring special routing or handling.',
      region: 'Special Zone',
    },
    {
      code: 'WITHIN_CITY',
      name: 'Within City',
      description: 'Pickup and delivery within the same city.',
      region: 'Within City',
    },
    {
      code: 'WITHIN_REGION',
      name: 'Within Region',
      description: 'Pickup and delivery within the same regional lane.',
      region: 'Within Region',
    },
    {
      code: 'WITHIN_STATE',
      name: 'Within State',
      description: 'Pickup and delivery within the same state.',
      region: 'Within State',
    },
  ]

  for (const seed of seeds) {
    const existing = await client.query(
      `select id
       from ${zonesTable}
       where upper(business_type) = 'B2C'
         and lower(trim(code)) = lower($1)
       limit 1`,
      [seed.code],
    )

    if (existing.rows[0]?.id) {
      await client.query(
        `update ${zonesTable}
         set name = $1,
             description = $2,
             region = $3,
             updated_at = now()
         where id = $4`,
        [seed.name, seed.description, seed.region, existing.rows[0].id],
      )
    } else {
      await client.query(
        `insert into ${zonesTable}
          (id, code, name, description, region, business_type, metadata, states, created_at, updated_at)
         values ($1, $2, $3, $4, $5, 'B2C', '{}'::jsonb, '[]'::jsonb, now(), now())`,
        [randomUUID(), seed.code, seed.name, seed.description, seed.region],
      )
    }
  }

  const created = await client.query(
    `select id, code, name
     from ${zonesTable}
     where upper(business_type) = 'B2C'
       and code = any($1)
     order by code`,
    [seeds.map((seed) => seed.code)],
  )
  return created.rows
}

const ensureFallbackCouriers = async (client: PoolClient) => {
  const seeds = fallbackCourierSeeds()
  for (const seed of seeds) {
    const isRequiredSeed = REQUIRED_COURIER_SEED_KEYS.has(`${seed.serviceProvider}:${seed.id}`)
    if (isRequiredSeed) {
      await client.query(
        `insert into couriers
          (id, name, "serviceProvider", "isEnabled", business_type, created_at, updated_at)
         values ($1, $2, $3, true, '["b2c"]'::jsonb, now(), now())
         on conflict (id, "serviceProvider") do update set
          name = excluded.name,
          "isEnabled" = true,
          business_type = case
            when couriers.business_type @> '["b2b"]'::jsonb
              then '["b2c", "b2b"]'::jsonb
            else '["b2c"]'::jsonb
          end,
          updated_at = now()`,
        [seed.id, seed.name, seed.serviceProvider],
      )
      continue
    }

    await client.query(
      `update couriers
       set name = $2,
           updated_at = now()
       where id = $1
         and "serviceProvider" = $3`,
      [seed.id, seed.name, seed.serviceProvider],
    )
  }
}

const disableUnsupportedCouriers = async (client: PoolClient) => {
  await client.query(
    `update couriers
     set business_type = coalesce(business_type, '[]'::jsonb) - 'b2c',
         "isEnabled" = case
           when coalesce(business_type, '[]'::jsonb) @> '["b2b"]'::jsonb then "isEnabled"
           else false
         end,
         updated_at = now()
     where lower("serviceProvider") = 'delhivery'
       and "isEnabled" = true
       and coalesce(business_type, '[]'::jsonb) @> '["b2c"]'::jsonb
       and id not in (99, 100)`,
  )

  await client.query(
    `update couriers
     set business_type = coalesce(business_type, '[]'::jsonb) - 'b2c',
         "isEnabled" = case
           when coalesce(business_type, '[]'::jsonb) @> '["b2b"]'::jsonb then "isEnabled"
           else false
         end,
         updated_at = now()
     where lower("serviceProvider") = 'xpressbees'
       and "isEnabled" = true
       and coalesce(business_type, '[]'::jsonb) @> '["b2c"]'::jsonb
       and lower(name) like '%reverse%'`,
  )
}

const loadTargetCouriers = async (client: PoolClient): Promise<CourierRow[]> => {
  await ensureFallbackCouriers(client)
  await disableUnsupportedCouriers(client)

  let result = await client.query(
    `select id, name, "serviceProvider"
     from couriers
     where lower("serviceProvider") = any($1)
       and "isEnabled" = true
       and business_type @> '["b2c"]'::jsonb
       and lower(name) not like '%reverse%'
     order by "serviceProvider", id, name`,
    [TARGET_PROVIDERS],
  )

  const foundProviders = new Set(result.rows.map((row) => normalizeProvider(row.serviceProvider)).filter(Boolean))
  const missingProvider = TARGET_PROVIDERS.some((provider) => !foundProviders.has(provider))
  if (missingProvider) {
    await ensureFallbackCouriers(client)
    result = await client.query(
      `select id, name, "serviceProvider"
       from couriers
       where lower("serviceProvider") = any($1)
         and "isEnabled" = true
         and business_type @> '["b2c"]'::jsonb
         and lower(name) not like '%reverse%'
       order by "serviceProvider", id, name`,
      [TARGET_PROVIDERS],
    )
  }

  return result.rows
    .map((row) => {
      const provider = normalizeProvider(row.serviceProvider)
      if (!provider) return null
      const seed = {
        id: Number(row.id),
        name: String(row.name),
        serviceProvider: provider,
        mode: inferMode(String(row.name)),
      }
      if (!isSupportedProviderCourierSeed(seed)) return null
      return {
        id: seed.id,
        name: seed.name,
        serviceProvider: seed.serviceProvider,
        mode: seed.mode,
      }
    })
    .filter(Boolean) as CourierRow[]
}

const deleteDuplicateRates = async (client: PoolClient, ids: string[]) => {
  if (!ids.length) return
  await client.query(`delete from shipping_rate_slabs where shipping_rate_id = any($1::uuid[])`, [ids])
  await client.query(`delete from shipping_rates where id = any($1::uuid[])`, [ids])
}

const buildDefaultRateSlabs = (): RateSlabSeed[] => [
  {
    weight_from: 0,
    weight_to: FIRST_SLAB_TO_KG,
    rate: RATE,
    extra_rate: EXTRA_RATE,
    extra_weight_unit: EXTRA_WEIGHT_UNIT_KG,
  },
]

const normalizeInnofulfillRateZoneCode = (zoneCode: string) => {
  const normalized = String(zoneCode || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

  if (normalized === 'withincity' || normalized === 'local') return 'local'
  if (['withinzone', 'withinregion', 'withinstate'].includes(normalized)) return 'withinZone'
  if (normalized === 'metrotometro' || normalized === 'metro') return 'metro'
  if (normalized === 'roi' || normalized === 'restofindia') return 'roi'
  if (['nejk', 'nejandk', 'specialzone', 'special'].includes(normalized)) return 'neJk'
  return zoneCode
}

const buildInnofulfillRateSlabs = (zoneCode: string): RateSlabSeed[] => {
  const rates = INNOFULFILL_ECOMM_FORWARD_RATES[normalizeInnofulfillRateZoneCode(zoneCode)]
  if (!rates) return buildDefaultRateSlabs()

  return INNOFULFILL_ECOMM_SLABS.map((slab, index) => ({
    ...slab,
    rate: rates[index] ?? 0,
    extra_rate: slab.weight_to === null ? 1 : null,
    extra_weight_unit: slab.weight_to === null ? EXTRA_WEIGHT_UNIT_KG : null,
  }))
}

const getRateSeed = (courier: CourierRow, zone: ZoneRow) => {
  const isInnofulfill = courier.serviceProvider === 'innofulfill'
  const slabs = isInnofulfill ? buildInnofulfillRateSlabs(zone.code) : buildDefaultRateSlabs()
  const baseRate = slabs[0]?.rate ?? RATE

  return {
    baseRate,
    slabs,
    overwriteExisting: isInnofulfill,
  }
}

const upsertRate = async (
  client: PoolClient,
  params: {
    planId: string
    courier: CourierRow
    zone: ZoneRow
    type: 'forward' | 'rto'
  },
) => {
  const existing = await client.query(
    `select id
     from shipping_rates
     where courier_id = $1
       and plan_id = $2
       and business_type = 'b2c'
       and zone_id = $3
       and type = $4
       and lower(mode) = $5
       and lower(coalesce(service_provider, '')) = $6
     order by created_at nulls first, id`,
    [
      params.courier.id,
      params.planId,
      params.zone.id,
      params.type,
      params.courier.mode,
      params.courier.serviceProvider,
    ],
  )

  const rateId = existing.rows[0]?.id || randomUUID()
  const duplicateIds = existing.rows.slice(1).map((row) => row.id as string)
  await deleteDuplicateRates(client, duplicateIds)

  const rateSeed = getRateSeed(params.courier, params.zone)
  const codCharges = COD_CHARGES
  const codPercent = COD_PERCENT

  if (existing.rows[0]?.id) {
    await client.query(
      `update shipping_rates set
        service_provider = $1,
        cod_charges = case when $9 then $2 else coalesce(cod_charges, $2) end,
        cod_percent = case when $9 then $3 else coalesce(cod_percent, $3) end,
        other_charges = coalesce(other_charges, 0),
        rate = case when $9 then $4 when rate <= 0 then $4 else rate end,
        last_updated = now(),
        courier_name = $5,
        mode = $6,
        min_weight = case when min_weight <= 0 then $7 else min_weight end
       where id = $8`,
      [
        params.courier.serviceProvider,
        codCharges,
        codPercent,
        rateSeed.baseRate,
        params.courier.name,
        params.courier.mode,
        FIRST_SLAB_TO_KG,
        rateId,
        rateSeed.overwriteExisting,
      ],
    )
  } else {
    await client.query(
      `insert into shipping_rates
        (id, plan_id, service_provider, cod_charges, cod_percent, other_charges, rate,
         last_updated, courier_id, courier_name, mode, business_type, min_weight, zone_id, type, created_at)
       values ($1, $2, $3, $4, $5, 0, $6, now(), $7, $8, $9, 'b2c', $10, $11, $12, now())`,
      [
        rateId,
        params.planId,
        params.courier.serviceProvider,
        codCharges,
        codPercent,
        rateSeed.baseRate,
        params.courier.id,
        params.courier.name,
        params.courier.mode,
        FIRST_SLAB_TO_KG,
        params.zone.id,
        params.type,
      ],
    )
  }

  if (rateSeed.overwriteExisting) {
    await client.query(`delete from shipping_rate_slabs where shipping_rate_id = $1`, [rateId])
  }

  const slabCount = await client.query(
    `select count(*)::int as count from shipping_rate_slabs where shipping_rate_id = $1`,
    [rateId],
  )
  if (!Number(slabCount.rows[0]?.count || 0)) {
    for (const slab of rateSeed.slabs) {
      await client.query(
        `insert into shipping_rate_slabs
          (id, shipping_rate_id, weight_from, weight_to, rate, extra_rate, extra_weight_unit, created_at, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7, now(), now())`,
        [
          randomUUID(),
          rateId,
          slab.weight_from,
          slab.weight_to,
          slab.rate,
          slab.extra_rate,
          slab.extra_weight_unit,
        ],
      )
    }
  }

  return rateId
}

async function main() {
  loadEnv()
  if (!process.env.DATABASE_URL && process.env.NODE_ENV === 'production') {
    throw new Error('DATABASE_URL is required to seed production provider rate cards')
  }
  const connectionString = process.env.DATABASE_URL || LOCAL_FALLBACK_DATABASE_URL
  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })

  const client = await pool.connect()
  try {
    await client.query('begin')

    const zonesTable = await resolveZonesTable(client)
    const planId = await ensureBasicPlan(client)
    const zones = await ensureB2CZones(client, zonesTable)
    const couriers = await loadTargetCouriers(client)

    if (!couriers.length) {
      throw new Error('No target couriers found or seeded for the supported B2C providers')
    }

    let savedRates = 0
    for (const courier of couriers) {
      for (const zone of zones) {
        await upsertRate(client, { planId, courier, zone, type: 'forward' })
        await upsertRate(client, { planId, courier, zone, type: 'rto' })
        savedRates += 2
      }
    }

    await client.query('commit')

    const byProvider = couriers.reduce<Record<string, number>>((acc, courier) => {
      acc[courier.serviceProvider] = (acc[courier.serviceProvider] || 0) + 1
      return acc
    }, {})

    console.log('Basic provider rate cards seeded successfully')
    console.log(
      JSON.stringify(
        {
          database: connectionString.replace(/:[^:@/]+@/, ':***@'),
          zonesTable,
          planId,
          zones: zones.length,
          couriers: byProvider,
          savedRates,
          slab: {
            weight_from: 0,
            weight_to: FIRST_SLAB_TO_KG,
            rate: RATE,
            extra_rate: EXTRA_RATE,
            extra_weight_unit: EXTRA_WEIGHT_UNIT_KG,
          },
          cod: { cod_charges: COD_CHARGES, cod_percent: COD_PERCENT },
        },
        null,
        2,
      ),
    )
  } catch (error) {
    await client.query('rollback').catch(() => undefined)
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error('Failed to seed Basic provider rate cards:', error)
  process.exit(1)
})
