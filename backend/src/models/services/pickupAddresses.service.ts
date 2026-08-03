// services/pickupAddresses.service.ts
import { and, asc, desc, eq, ilike, ne, or, sql } from 'drizzle-orm'
import { CreatePickupDto, HydratedPickupAddress, UpdatePickupDto } from '../../types/generic.types'
import { db } from '../client'
import { courier_registration_errors } from '../schema/courierRegistrationErrors'
import { addresses, pickupAddresses } from '../schema/pickupAddresses'
import { createAmazonShippingWarehouse } from './amazonShipping.service'
import { DelhiveryService } from './couriers/delhivery.service'
import { EkartService } from './couriers/ekart.service'

function parseCoordinate(value: string | null | undefined) {
  if (value === null || value === undefined) return undefined

  const normalized = String(value).trim()
  if (!normalized) return undefined

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : undefined
}

function buildGeo(latitude: string | null | undefined, longitude: string | null | undefined) {
  const lat = parseCoordinate(latitude)
  const lon = parseCoordinate(longitude)

  if (lat === undefined || lon === undefined) return undefined
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return undefined

  return { lat, lon }
}

const buildAmazonWarehousePayload = (pickupAddr: any, rtoAddressData?: any) => ({
  alias: pickupAddr.addressNickname || pickupAddr.contactName || `warehouse-${pickupAddr.id}`,
  contactName: pickupAddr.contactName || 'Shiplifi',
  contactPhone: pickupAddr.contactPhone || '',
  contactEmail: pickupAddr.contactEmail || '',
  addressLine1: pickupAddr.addressLine1,
  addressLine2: pickupAddr.addressLine2 || '',
  landmark: pickupAddr.landmark || '',
  city: pickupAddr.city,
  state: pickupAddr.state,
  country: pickupAddr.country || 'India',
  pincode: pickupAddr.pincode,
  latitude: pickupAddr.latitude,
  longitude: pickupAddr.longitude,
  companyName: pickupAddr.addressNickname || pickupAddr.contactName || 'Shiplifi',
  returnAddress: rtoAddressData
    ? {
        alias:
          rtoAddressData.addressNickname ||
          rtoAddressData.contactName ||
          `${pickupAddr.addressNickname || pickupAddr.contactName || 'warehouse'}-rto`,
        contactName: rtoAddressData.contactName || pickupAddr.contactName || 'Shiplifi',
        contactPhone: rtoAddressData.contactPhone || pickupAddr.contactPhone || '',
        contactEmail: rtoAddressData.contactEmail || pickupAddr.contactEmail || '',
        addressLine1: rtoAddressData.addressLine1 || pickupAddr.addressLine1,
        addressLine2: rtoAddressData.addressLine2 || '',
        landmark: rtoAddressData.landmark || '',
        city: rtoAddressData.city || pickupAddr.city,
        state: rtoAddressData.state || pickupAddr.state,
        country: rtoAddressData.country || pickupAddr.country || 'India',
        pincode: rtoAddressData.pincode || pickupAddr.pincode,
        latitude: rtoAddressData.latitude || pickupAddr.latitude,
        longitude: rtoAddressData.longitude || pickupAddr.longitude,
        companyName: rtoAddressData.addressNickname || rtoAddressData.contactName || 'Shiplifi',
      }
    : undefined,
})

const extractCourierRegistrationError = (error: any) => {
  const providerPayload = error?.response?.data ?? null
  const message =
    providerPayload?.description ||
    providerPayload?.message ||
    providerPayload?.error ||
    error?.message ||
    'Courier warehouse registration failed'
  const code = providerPayload?.code || error?.code || null

  return {
    code: typeof code === 'string' ? code : code ? String(code) : null,
    message: String(message),
    payload:
      providerPayload && typeof providerPayload === 'object'
        ? providerPayload
        : error?.response?.data
          ? { data: error.response.data }
          : null,
  }
}

const logCourierRegistrationError = async ({
  userId,
  provider,
  operation,
  addressId,
  pickupAddressId,
  warehouseAlias,
  requestPayload,
  error,
  client = db,
}: {
  userId: string
  provider: string
  operation: string
  addressId?: string | null
  pickupAddressId?: string | null
  warehouseAlias?: string | null
  requestPayload?: Record<string, any> | null
  error: any
  client?: any
}) => {
  const normalizedProvider = String(provider || '').trim().toLowerCase()
  const extracted = extractCourierRegistrationError(error)
  const values = {
    user_id: userId,
    provider: normalizedProvider,
    operation,
    address_id: addressId ?? null,
    pickup_address_id: pickupAddressId ?? null,
    warehouse_alias: warehouseAlias || null,
    error_code: extracted.code,
    error_message: extracted.message,
    error_payload: extracted.payload,
    request_payload: requestPayload ?? null,
  }

  try {
    await client.insert(courier_registration_errors).values(values)
  } catch (persistErr: any) {
    const isForeignKeyFailure =
      persistErr?.code === '23503' || String(persistErr?.message || '').includes('violates foreign key')

    if (isForeignKeyFailure && (values.address_id || values.pickup_address_id)) {
      try {
        await client.insert(courier_registration_errors).values({
          ...values,
          address_id: null,
          pickup_address_id: null,
        })
        console.warn('⚠️ Courier registration error persisted without local FK links', {
          provider: normalizedProvider,
          operation,
          warehouseAlias: warehouseAlias || null,
        })
        return
      } catch (retryErr: any) {
        console.error('❌ Failed to persist courier registration error after FK retry:', retryErr?.message || retryErr)
        return
      }
    }

    console.error('❌ Failed to persist courier registration error:', persistErr?.message || persistErr)
  }
}

/**
 * Create Pickup + optional RTO
 */

export async function createPickupAddressService(data: CreatePickupDto, userId: string) {
  return await db.transaction(async (txn) => {
    const existing = await txn.query.pickupAddresses.findFirst({
      where: eq(pickupAddresses.userId, userId),
    })

    const isPrimary = !existing

    // 🔹 Reset existing primary if new one is requested
    if (data.isPrimary && existing) {
      await txn
        .update(pickupAddresses)
        .set({ isPrimary: false })
        .where(eq(pickupAddresses.userId, userId))
    }

    // 🔹 Insert pickup address
    const [pickupAddr] = await txn
      .insert(addresses)
      .values({
        userId,
        type: 'pickup',
        ...data.pickup,
      })
      .returning()

    // 🔹 Insert optional RTO address
    let rtoAddressId: string | null = null
    let isRTOSame = true
    let rtoAddressData = pickupAddr

    if (data?.rtoAddress) {
      const [rtoAddr] = await txn
        .insert(addresses)
        .values({
          userId,
          type: 'rto',
          ...data.rtoAddress,
        })
        .returning()
      rtoAddressId = rtoAddr.id
      isRTOSame = false
      rtoAddressData = rtoAddr
    } else {
      rtoAddressId = pickupAddr.id
    }

    // 🔹 Link in pickup_addresses
    const [created] = await txn
      .insert(pickupAddresses)
      .values({
        userId,
        addressId: pickupAddr.id,
        rtoAddressId,
        isPrimary: data.isPrimary ?? isPrimary,
        isPickupEnabled: data.isPickupEnabled ?? true,
        isRTOSame,
      })
      .returning()

    // 🚚 Register pickup in Delhivery
    try {
      const delhivery = new DelhiveryService()
      const pickupAddressLine = [
        pickupAddr.addressLine1,
        pickupAddr.addressLine2,
        pickupAddr.landmark,
      ]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(', ')
      const returnAddressLine = [
        rtoAddressData.addressLine1 ?? pickupAddr.addressLine1,
        rtoAddressData.addressLine2 ?? pickupAddr.addressLine2,
        rtoAddressData.landmark ?? pickupAddr.landmark,
      ]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join(', ')
      const delhiveryResp = await delhivery.createWarehouse({
        name: pickupAddr.addressNickname ?? pickupAddr.contactName ?? 'Default Warehouse',
        registered_name: 'Pax Logistics',
        phone: pickupAddr.contactPhone,
        email: pickupAddr.contactEmail?.trim() || undefined,
        address: pickupAddressLine || pickupAddr.addressLine1,
        city: pickupAddr.city,
        pin: pickupAddr.pincode.toString(),
        country: pickupAddr.country ?? 'India',
        return_address:
          returnAddressLine || rtoAddressData.addressLine1 || pickupAddr.addressLine1,
        return_city: rtoAddressData.city ?? pickupAddr.city,
        return_pin: rtoAddressData.pincode?.toString() ?? pickupAddr.pincode?.toString(),
        return_state: rtoAddressData.state ?? pickupAddr.state,
        return_country: 'India',
      })

      if (!delhiveryResp || delhiveryResp.success === false) {
        console.warn('⚠️ Delhivery warehouse creation returned a non-success response; keeping pickup creation non-blocking.', {
          pickupId: pickupAddr.id,
          alias: pickupAddr.addressNickname ?? pickupAddr.contactName ?? null,
          response: delhiveryResp,
        })
      } else {
        console.log(`✅ Delhivery warehouse registered: ${pickupAddr.addressNickname}`)
      }
    } catch (err: any) {
      const rawError = err?.response?.data ?? err
      console.error('❌ Error registering Delhivery warehouse:', rawError)
      await logCourierRegistrationError({
        userId,
        provider: 'delhivery',
        operation: 'create_warehouse',
        addressId: pickupAddr.id,
        pickupAddressId: created.id,
        warehouseAlias: pickupAddr.addressNickname ?? pickupAddr.contactName ?? null,
        requestPayload: {
          warehouse_name: pickupAddr.addressNickname ?? pickupAddr.contactName ?? null,
          address_line_1: pickupAddr.addressLine1,
          address_line_2: pickupAddr.addressLine2 ?? null,
          landmark: pickupAddr.landmark ?? null,
          city: pickupAddr.city,
          state: pickupAddr.state,
          pincode: pickupAddr.pincode,
          country: pickupAddr.country ?? 'India',
          latitude: pickupAddr.latitude ?? null,
          longitude: pickupAddr.longitude ?? null,
        },
        error: err,
      })

      // Keep pickup creation alive even if Delhivery rejects the warehouse payload.
      const delhiveryErrorText: string | undefined =
        rawError?.error?.[0] || rawError?.message || rawError?.data?.message

      if (typeof delhiveryErrorText === 'string') {
        if (
          delhiveryErrorText.includes('client-warehouse of client') &&
          delhiveryErrorText.toLowerCase().includes('already exists')
        ) {
          console.warn('⚠️ Delhivery duplicate warehouse detected; local pickup creation will continue.', {
            pickupId: pickupAddr.id,
            alias: pickupAddr.addressNickname ?? pickupAddr.contactName ?? null,
          })
        } else if (delhiveryErrorText.toLowerCase().includes('serviceability')) {
          console.warn('⚠️ Delhivery reported pickup pincode serviceability issue; local pickup creation will continue.', {
            pickupId: pickupAddr.id,
            pincode: pickupAddr.pincode,
          })
        } else {
          console.warn('⚠️ Delhivery warehouse sync failed; local pickup creation will continue.', {
            pickupId: pickupAddr.id,
            alias: pickupAddr.addressNickname ?? pickupAddr.contactName ?? null,
            message: delhiveryErrorText,
          })
        }
      }
    }

    // 🔹 Register pickup in Ekart (mirror our warehouse)
    try {
      const ekart = new EkartService()
      const alias = pickupAddr.addressNickname || pickupAddr.contactName || `warehouse-${pickupAddr.id}`
      const phoneRaw = String(pickupAddr.contactPhone || '')
      const phoneDigits = phoneRaw.replace(/\D/g, '')
      const geo = buildGeo(pickupAddr.latitude, pickupAddr.longitude)
      const payload = {
        alias,
        contactName: pickupAddr.contactName || 'Shiplifi',
        phone: Number(phoneDigits) || 0,
        email: pickupAddr.contactEmail || '',
        addressLine1: pickupAddr.addressLine1,
        addressLine2: pickupAddr.addressLine2 || '',
        city: pickupAddr.city,
        state: pickupAddr.state,
        pincode: Number(pickupAddr.pincode) || 0,
        country: pickupAddr.country || 'India',
        ...(geo ? { geo } : {}),
        returnAddress: {
          contactName: pickupAddr.contactName || 'Shiplifi',
          phone: Number(phoneDigits) || 0,
          addressLine1: pickupAddr.addressLine1,
          addressLine2: pickupAddr.addressLine2 || '',
          city: pickupAddr.city,
          state: pickupAddr.state,
          pincode: Number(pickupAddr.pincode) || 0,
          country: pickupAddr.country || 'India',
          ...(geo ? { geo } : {}),
        },
      }
      console.log('Registering Ekart warehouse', {
        alias,
        pickupId: pickupAddr.id,
        hasGeo: Boolean(geo),
      })
      await ekart.createWarehouse(payload)
      console.log(`✅ Ekart warehouse registered: ${alias}`)
    } catch (err: any) {
      console.warn('⚠️ Failed to register Ekart warehouse:', err?.response?.data || err?.message || err)
      await logCourierRegistrationError({
        userId,
        provider: 'ekart',
        operation: 'create_warehouse',
        addressId: pickupAddr.id,
        pickupAddressId: created.id,
        warehouseAlias: pickupAddr.addressNickname || pickupAddr.contactName || null,
        requestPayload: {
          alias: pickupAddr.addressNickname || pickupAddr.contactName || null,
          city: pickupAddr.city,
          state: pickupAddr.state,
          pincode: pickupAddr.pincode,
          latitude: pickupAddr.latitude ?? null,
          longitude: pickupAddr.longitude ?? null,
          has_geo: Boolean(buildGeo(pickupAddr.latitude, pickupAddr.longitude)),
        },
        error: err,
        client: txn,
      })
    }

    try {
      const amazonWarehouse = createAmazonShippingWarehouse(
        buildAmazonWarehousePayload(pickupAddr, rtoAddressData),
      )
      console.log('Amazon Shipping warehouse prepared', {
        alias: amazonWarehouse.alias,
        pickupId: pickupAddr.id,
        countryCode: amazonWarehouse.shipFrom.countryCode,
        postalCode: amazonWarehouse.shipFrom.postalCode,
      })
    } catch (err: any) {
      console.warn('Failed to prepare Amazon Shipping warehouse:', err?.message || err)
      await logCourierRegistrationError({
        userId,
        provider: 'amazon',
        operation: 'create_warehouse',
        addressId: pickupAddr.id,
        pickupAddressId: created.id,
        warehouseAlias: pickupAddr.addressNickname || pickupAddr.contactName || null,
        requestPayload: {
          alias: pickupAddr.addressNickname || pickupAddr.contactName || null,
          city: pickupAddr.city,
          state: pickupAddr.state,
          pincode: pickupAddr.pincode,
          country: pickupAddr.country || 'India',
        },
        error: err,
        client: txn,
      })
    }

    return created
  })
}
/**
 * Update Pickup + optional RTO
 */

export async function updatePickupAddressService(
  pickupId: string | null,
  userId: string,
  data: UpdatePickupDto & { id?: string },
) {
  try {
    const targetPickupId = pickupId ?? data.id
    if (!targetPickupId) throw new Error('Pickup ID is required')

    // ✅ Handle primary switch (if making this the new primary)
    if (data.isPrimary) {
      await db
        .update(pickupAddresses)
        .set({ isPrimary: false })
        .where(and(eq(pickupAddresses.userId, userId), ne(pickupAddresses.id, targetPickupId)))
    }

    // ✅ Update pickup record (flags only)
    const [pickup] = await db
      .update(pickupAddresses)
      .set({
        isPrimary: data.isPrimary,
        isPickupEnabled: data.isPickupEnabled ?? true,
      })
      .where(and(eq(pickupAddresses.id, targetPickupId), eq(pickupAddresses.userId, userId)))
      .returning()

    if (!pickup) return null

    // 🟡 If only flags are provided (no pickup or RTO details) — skip courier syncs
    const onlyFlagsChanged = !data.pickup && !data.rtoAddress
    if (onlyFlagsChanged) {
      console.log('⚙️ Only flags updated (isPrimary/isPickupEnabled). Skipping courier syncs.')
      return pickup
    }

    // ✅ Start transaction for atomic updates
    return await db.transaction(async (txn) => {
      // ✅ Update pickup address itself
      let updatedPickup: any = null
      if (data.pickup && pickup.addressId) {
        const { createdAt, ...safeData } = data.pickup
        const [addr] = await txn
          .update(addresses)
          .set({
            ...safeData,
            updatedAt: new Date(),
          })
          .where(eq(addresses.id, pickup.addressId))
          .returning()
        updatedPickup = addr
      }

      // ✅ Update / Create RTO address
      if (data.rtoAddress) {
        if (pickup.rtoAddressId) {
          const { createdAt, ...safeData } = data?.rtoAddress
          await txn
            .update(addresses)
            .set({ ...safeData, updatedAt: new Date() })
            .where(eq(addresses.id, pickup.rtoAddressId))
        } else {
          const [newRto] = await txn
            .insert(addresses)
            .values({
              userId,
              type: 'rto',
              contactName: data.rtoAddress.contactName!,
              contactPhone: data.rtoAddress.contactPhone!,
              addressLine1: data.rtoAddress.addressLine1!,
              city: data.rtoAddress.city!,
              state: data.rtoAddress.state!,
              country: data.rtoAddress.country ?? 'India',
              pincode: data.rtoAddress.pincode!,
              contactEmail: data.rtoAddress.contactEmail,
              addressLine2: data.rtoAddress.addressLine2,
              landmark: data.rtoAddress.landmark,
              gstNumber: data.rtoAddress.gstNumber,
            })
            .returning()

          await txn
            .update(pickupAddresses)
            .set({ rtoAddressId: newRto.id, isRTOSame: false })
            .where(eq(pickupAddresses.id, targetPickupId))
        }
      }

      // 🟢 Sync with Delhivery (only if pickup address actually changed)
      try {
        if (updatedPickup) {
          const delhivery = new DelhiveryService()
          const delhiveryResp = await delhivery.updateWarehouse({
            name:
              updatedPickup?.addressNickname ?? updatedPickup?.contactName ?? 'Default Warehouse',
            address: updatedPickup?.addressLine1,
            pin: updatedPickup?.pincode?.toString(),
            phone: updatedPickup?.contactPhone,
          })

          if (!delhiveryResp || delhiveryResp.success === false) {
            console.error('❌ Failed to update warehouse in Delhivery:', delhiveryResp)
            throw new Error('Warehouse update failed')
          }

          console.log(`✅ Warehouse updated in Delhivery: ${updatedPickup?.addressNickname}`)
        } else {
          console.log('ℹ️ No pickup address change detected — skipped Delhivery update.')
        }
      } catch (err: any) {
        console.error('❌ Delhivery warehouse update error:', err.message)
        throw new Error('Failed to update warehouse')
      }

      try {
        if (updatedPickup) {
          const amazonWarehouse = createAmazonShippingWarehouse(
            buildAmazonWarehousePayload(updatedPickup),
          )
          console.log('Amazon Shipping warehouse update prepared', {
            alias: amazonWarehouse.alias,
            pickupId: updatedPickup.id,
            countryCode: amazonWarehouse.shipFrom.countryCode,
            postalCode: amazonWarehouse.shipFrom.postalCode,
          })
        }
      } catch (err: any) {
        console.warn('Failed to prepare Amazon Shipping warehouse update:', err?.message || err)
        await logCourierRegistrationError({
          userId,
          provider: 'amazon',
          operation: 'update_warehouse',
          addressId: updatedPickup?.id ?? pickup.addressId,
          pickupAddressId: targetPickupId,
          warehouseAlias: updatedPickup?.addressNickname || updatedPickup?.contactName || null,
          requestPayload: updatedPickup
            ? {
                alias: updatedPickup.addressNickname || updatedPickup.contactName || null,
                city: updatedPickup.city,
                state: updatedPickup.state,
                pincode: updatedPickup.pincode,
                country: updatedPickup.country || 'India',
              }
            : null,
          error: err,
          client: txn,
        })
      }

      return pickup
    })
  } catch (error) {
    console.error('❌ Failed to update pickup address:', error)
    throw new Error('Failed to update pickup address')
  }
}

/**
 * Get pickup addresses with hydrated pickup + rto
 */

export async function getPickupAddressesService(
  userId: string,
  filters: Record<string, any> = {},
  page = 1,
  limit = 10,
): Promise<{ data: HydratedPickupAddress[]; totalCount: number }> {
  const conditions: any[] = [eq(pickupAddresses.userId, userId)]

  // ✅ Pickup status filters
  if (filters.isPickupEnabled === 'active')
    conditions.push(eq(pickupAddresses.isPickupEnabled, true))
  if (filters.isPickupEnabled === 'inactive')
    conditions.push(eq(pickupAddresses.isPickupEnabled, false))
  if (filters.isPrimary !== undefined && filters.isPrimary !== '')
    conditions.push(eq(pickupAddresses.isPrimary, filters.isPrimary === 'true'))

  // ✅ Helper for pickup OR rto field
  const pickupOrRto = (field: string, value: string) => {
    const search = `%${value}%`
    return or(
      ilike((addresses as any)[field], search),
      sql<boolean>`EXISTS (
        SELECT 1 FROM addresses rto
        WHERE rto.id = ${pickupAddresses.rtoAddressId}
          AND rto.${sql.identifier(field)} ILIKE ${search}
      )`,
    )
  }

  // ✅ Field-specific filters
  if (filters.name) conditions.push(pickupOrRto('addressNickname', filters.name))
  if (filters.city) conditions.push(pickupOrRto('city', filters.city))
  if (filters.state) conditions.push(pickupOrRto('state', filters.state))
  if (filters.pincode) conditions.push(pickupOrRto('pincode', filters.pincode))

  // ✅ Sorting
  let sortByClause = desc(addresses.createdAt)
  switch (filters.sortBy) {
    case 'oldest':
      sortByClause = asc(addresses.createdAt)
      break
    case 'az':
      sortByClause = asc(addresses.contactName)
      break
    case 'za':
      sortByClause = desc(addresses.contactName)
      break
  }

  const whereClause = conditions.length > 0 ? and(...conditions) : undefined

  // ✅ Count query
  const totalCountResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(pickupAddresses)
    .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
    .where(whereClause) // safe: Drizzle skips undefined

  const totalCount = Number(totalCountResult[0]?.count ?? 0)

  const offset = (page - 1) * limit

  // ✅ Data query
  const data = await db
    .select({
      pickupId: pickupAddresses.id,
      isPrimary: pickupAddresses.isPrimary,
      isPickupEnabled: pickupAddresses.isPickupEnabled,
      isRTOSame: pickupAddresses.isRTOSame,
      pickup: {
        id: addresses.id,
        userId: addresses.userId,
        type: addresses.type,
        contactName: addresses.contactName,
        contactPhone: addresses.contactPhone,
        addressNickname: addresses.addressNickname,
        contactEmail: addresses.contactEmail,
        addressLine1: addresses.addressLine1,
        addressLine2: addresses.addressLine2,
        landmark: addresses.landmark,
        city: addresses.city,
        state: addresses.state,
        country: addresses.country,
        pincode: addresses.pincode,
        latitude: addresses.latitude,
        longitude: addresses.longitude,
        gstNumber: addresses.gstNumber,
        createdAt: addresses.createdAt,
        updatedAt: addresses.updatedAt,
      },
      rto: sql/*sql*/ `
      CASE 
        WHEN ${pickupAddresses.isRTOSame} = false THEN (
          SELECT row_to_json(a)
          FROM addresses a
          WHERE a.id = ${pickupAddresses.rtoAddressId}
        )
        ELSE NULL
      END
    `.as('rto'),
    })
    .from(pickupAddresses)
    .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
    .where(whereClause)
    .orderBy(sortByClause)
    .limit(limit)
    .offset(offset)

  return { data: data as unknown as HydratedPickupAddress[], totalCount }
}
