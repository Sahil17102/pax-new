import assert from 'assert'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

const run = async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test'
  const {
    DelhiveryService,
    normalizeDelhiveryWaybills,
    summarizeDelhiveryExpectedTat,
    summarizeDelhiveryHeavyPincodeServiceability,
    summarizeDelhiveryPincodeServiceability,
  } = await import('../models/services/couriers/delhivery.service')

  assert.deepEqual(
    normalizeDelhiveryWaybills({ waybills: '123456789012, 123456789013\n123456789012' }),
    ['123456789012', '123456789013'],
  )
  assert.deepEqual(
    normalizeDelhiveryWaybills({ data: { waybill: ['223456789012', 223456789013] } }),
    ['223456789012', '223456789013'],
  )

  assert.deepEqual(summarizeDelhiveryPincodeServiceability({ delivery_codes: [] }), {
    pincode: null,
    serviceable: false,
    embargoed: false,
    remark: '',
    pickup: false,
    prepaid: false,
    cod: false,
    reversePickup: false,
  })

  const embargoed = summarizeDelhiveryPincodeServiceability({
    delivery_codes: [{ postal_code: { pin: 194103, pickup: 'Y', pre_paid: 'Y', cod: 'Y', repl: 'Y', remark: 'Embargo' } }],
  })
  assert.equal(embargoed.serviceable, false)
  assert.equal(embargoed.embargoed, true)
  assert.equal(embargoed.pickup, false)
  assert.equal(embargoed.prepaid, false)
  assert.equal(embargoed.cod, false)

  const serviceable = summarizeDelhiveryPincodeServiceability({
    delivery_codes: [{ postal_code: { pin: 122001, pickup: 'Y', pre_paid: 'Y', cod: 'N', repl: 'Y', remark: '' } }],
  })
  assert.equal(serviceable.serviceable, true)
  assert.equal(serviceable.pickup, true)
  assert.equal(serviceable.prepaid, true)
  assert.equal(serviceable.cod, false)
  assert.equal(serviceable.reversePickup, true)

  const heavyNsz = summarizeDelhiveryHeavyPincodeServiceability({
    data: { pincode: 400086, status: 'NSZ', payment_type: [] },
  })
  assert.equal(heavyNsz.productType, 'Heavy')
  assert.equal(heavyNsz.serviceable, false)
  assert.equal(heavyNsz.nsz, true)
  assert.deepEqual(heavyNsz.paymentTypes, [])

  const heavyServiceable = summarizeDelhiveryHeavyPincodeServiceability({
    data: {
      pincode: 400086,
      status: 'Serviceable',
      payment_type: { COD: 'Y', Prepaid: true, Reverse: 'N' },
    },
  })
  assert.equal(heavyServiceable.serviceable, true)
  assert.equal(heavyServiceable.nsz, false)
  assert.equal(heavyServiceable.cod, true)
  assert.equal(heavyServiceable.prepaid, true)
  assert.deepEqual(heavyServiceable.paymentTypes, ['COD', 'Pre-paid'])

  const expectedTat = summarizeDelhiveryExpectedTat(
    { data: { tat: '2 days', expected_delivery_date: '2026-08-06' } },
    {
      originPincode: '122003',
      destinationPincode: '136118',
      mode: 'N',
      productType: 'B2C',
      expectedPickupDate: '2026-08-04 14:00',
    },
  )
  assert.equal(expectedTat.tatDays, 2)
  assert.equal(expectedTat.expectedDeliveryDate, '2026-08-06')
  assert.equal(expectedTat.mode, 'N')
  assert.equal(expectedTat.productType, 'B2C')

  const originalGet = axios.get
  const originalPost = axios.post
  const captured: Array<{ method: string; url: string; data?: unknown; headers?: any }> = []
  ;(axios as any).get = async (url: string, config: any) => {
    captured.push({ method: 'GET', url, headers: config?.headers })
    return {
      status: 200,
      data: url.includes('/waybill/api/fetch/json/')
        ? { waybill: '323456789012' }
        : url.includes('/waybill/api/bulk/json/')
        ? { waybills: '123456789012,123456789013,123456789012' }
        : url.includes('/fetch/serviceability/pincode')
        ? { data: { pincode: 400086, status: 'Serviceable', payment_type: ['Pre-paid', 'COD'] } }
        : url.includes('/expected_tat')
          ? { data: { tat: 2, expected_delivery_date: '2026-08-06' } }
          : url.includes('/pin-codes/')
            ? { delivery_codes: [{ postal_code: { pin: 194103, pickup: 'Y', pre_paid: 'Y', cod: 'N', remark: '' } }] }
            : [{ total_amount: 75 }],
    }
  }
  ;(axios as any).post = async (url: string, data: unknown, config: any) => {
    captured.push({ method: 'POST', url, data, headers: config?.headers })
    if (url.includes('/api/cmu/create.json')) {
      const form = new URLSearchParams(String(data))
      const payload = JSON.parse(form.get('data') || '{}')
      return {
        status: 200,
        data: {
          success: true,
          status: 'Success',
          packages: payload.shipments.map((shipment: any, index: number) => ({
            status: 'Success',
            serviceable: true,
            waybill: shipment.waybill || `MOCK-AWB-${index + 1}`,
          })),
        },
      }
    }
    return { status: 200, data: { success: true } }
  }

  const mockedService = new DelhiveryService({
    apiBase: 'https://staging-express.delhivery.com/',
    apiKey: 'test-token',
    clientName: 'test-client',
  })
  await mockedService.checkServiceability('194103')
  assert.equal(
    captured.at(-1)?.url,
    'https://staging-express.delhivery.com/c/api/pin-codes/json/?filter_codes=194103',
  )
  assert.equal(captured.at(-1)?.headers?.Authorization, 'Token test-token')

  await mockedService.checkHeavyServiceability('400086')
  assert.equal(
    captured.at(-1)?.url,
    'https://staging-express.delhivery.com/api/dc/fetch/serviceability/pincode?product_type=Heavy&pincode=400086',
  )
  assert.equal(captured.at(-1)?.headers?.Accept, 'application/json')

  const singleWaybill = await mockedService.fetchSingleWaybill()
  assert.deepEqual(singleWaybill, { waybill: '323456789012' })
  assert.equal(
    captured.at(-1)?.url,
    'https://staging-express.delhivery.com/waybill/api/fetch/json/?token=test-token',
  )
  assert.equal(captured.at(-1)?.headers?.Accept, 'application/json')
  assert.equal(captured.at(-1)?.headers?.Authorization, undefined)

  const waybillBatch = await mockedService.fetchWaybills(5)
  assert.deepEqual(waybillBatch, {
    requestedCount: 5,
    receivedCount: 2,
    waybills: ['123456789012', '123456789013'],
  })
  assert.equal(
    captured.at(-1)?.url,
    'https://staging-express.delhivery.com/waybill/api/bulk/json/?token=test-token&count=5',
  )
  assert.equal(captured.at(-1)?.headers?.Accept, 'application/json')
  assert.equal(captured.at(-1)?.headers?.Authorization, undefined)

  const tatResponse = await mockedService.getExpectedTATDetails(
    '122003',
    '136118',
    'N',
    'B2C',
    '2026-08-04 14:00',
  )
  assert.equal(tatResponse.data.tat, 2)
  assert.equal(
    captured.at(-1)?.url,
    'https://staging-express.delhivery.com/api/dc/expected_tat?origin_pin=122003&destination_pin=136118&mot=N&pdt=B2C&expected_pickup_date=2026-08-04%2014%3A00',
  )

  await mockedService.calculateShippingCost({
    originPincode: '122001',
    destinationPincode: '400093',
    weightGrams: 500,
  })
  assert(captured.at(-1)?.url.includes('/api/kinko/v1/invoice/charges/.json?'))
  assert(captured.at(-1)?.url.includes('o_pin=122001'))
  assert(captured.at(-1)?.url.includes('d_pin=400093'))
  assert(captured.at(-1)?.url.includes('cgm=500'))

  await mockedService.createShipment({
    order: 'DOC-COD-1',
    payment_mode: 'COD',
    cod_amount: 350,
    total_amount: 500,
    name: 'Postman Customer',
    add: 'Market & Block #5',
    pin: '400093',
    city: 'Mumbai',
    state: 'Maharashtra',
    country: 'India',
    phone: '9999999999',
    pickup_location: { name: 'Test Warehouse' },
    seller_name: 'Pax Logistics',
    seller_add: 'Warehouse Road',
    products_desc: 'T-shirt; Shoes',
    hsn_code: '610910, 640411',
    weight: 750,
    shipment_length: 20,
    shipment_width: 15,
    shipment_height: 10,
    shipping_mode: 'Express',
    transport_speed: 'F',
    address_type: 'home',
    fragile_shipment: true,
    dangerous_good: false,
    plastic_packaging: false,
  } as any, 'DOC-AWB-1')
  assert.equal(captured.at(-1)?.url, 'https://staging-express.delhivery.com/api/cmu/create.json')
  assert.equal(captured.at(-1)?.headers?.Authorization, 'Token test-token')
  assert.equal(captured.at(-1)?.headers?.['Content-Type'], 'application/x-www-form-urlencoded')
  const codForm = new URLSearchParams(String(captured.at(-1)?.data))
  assert.equal(codForm.get('format'), 'json')
  const codPayload = JSON.parse(codForm.get('data') || '{}')
  assert.equal(codPayload.pickup_location.name, 'Test Warehouse')
  assert.equal(codPayload.shipments[0].order, 'DOC-COD-1')
  assert.equal(codPayload.shipments[0].payment_mode, 'COD')
  assert.equal(codPayload.shipments[0].cod_amount, 350)
  assert.equal(codPayload.shipments[0].shipping_mode, 'Express')
  assert.equal(codPayload.shipments[0].transport_speed, 'F')
  assert.equal(codPayload.shipments[0].add, 'Market & Block #5')
  assert.equal(codPayload.shipments[0].waybill, 'DOC-AWB-1')

  await mockedService.createShipment({
    order: 'DOC-PICKUP-1',
    payment_mode: 'Pickup',
    total_amount: 0,
    name: 'Pickup Customer',
    add: 'Customer pickup address',
    pin: '400093',
    phone: '9999999999',
    pickup_location: 'Test Warehouse',
    return_name: 'Pax Returns',
    return_address: 'Return Hub',
    return_city: 'Gurugram',
    return_state: 'Haryana',
    return_pin: '122001',
    return_phone: '9888888888',
  } as any)
  const pickupForm = new URLSearchParams(String(captured.at(-1)?.data))
  const pickupPayload = JSON.parse(pickupForm.get('data') || '{}')
  assert.equal(pickupPayload.shipments[0].payment_mode, 'Pickup')
  assert.equal(pickupPayload.shipments[0].return_add, 'Return Hub')
  assert.equal(pickupPayload.shipments[0].return_pin, '122001')

  await mockedService.createShipment({
    order: 'DOC-REPL-1',
    payment_mode: 'REPL',
    total_amount: 500,
    name: 'Exchange Customer',
    add: 'Exchange address',
    pin: '400093',
    phone: '9999999999',
    pickup_location: 'Test Warehouse',
  } as any, 'REPL-AWB-1')
  const replForm = new URLSearchParams(String(captured.at(-1)?.data))
  const replPayload = JSON.parse(replForm.get('data') || '{}')
  assert.equal(replPayload.shipments.length, 1)
  assert.equal(replPayload.shipments[0].payment_mode, 'REPL')
  assert.equal(replPayload.shipments[0].waybill, 'REPL-AWB-1')
  assert.equal(replPayload.shipments[0].return_add, 'Test Warehouse')

  await mockedService.createShipment({
    order: 'DOC-MPS-1',
    payment_mode: 'Prepaid',
    total_amount: 500,
    name: 'Exchange Customer',
    add: 'Exchange address',
    pin: '400093',
    phone: '9999999999',
    pickup_location: 'Test Warehouse',
    mps: true,
    boxes: [
      { waybill: 'MPS-AWB-1', weight: 500, quantity: 1 },
      { waybill: 'MPS-AWB-2', weight: 600, quantity: 2 },
    ],
  } as any)
  const mpsForm = new URLSearchParams(String(captured.at(-1)?.data))
  const mpsPayload = JSON.parse(mpsForm.get('data') || '{}')
  assert.equal(mpsPayload.shipments.length, 2)
  assert.deepEqual(mpsPayload.shipments.map((shipment: any) => shipment.waybill), [
    'MPS-AWB-1',
    'MPS-AWB-2',
  ])
  assert.deepEqual(mpsPayload.shipments.map((shipment: any) => shipment.order), [
    'DOC-MPS-1-1',
    'DOC-MPS-1-2',
  ])
  assert.equal(mpsPayload.shipments[0].payment_mode, 'Prepaid')

  await mockedService.updateShipment('TEST-AWB', { phone: '919999999999' })
  assert.equal(captured.at(-1)?.url, 'https://staging-express.delhivery.com/api/p/edit')
  assert.deepEqual(captured.at(-1)?.data, { waybill: 'TEST-AWB', phone: '9999999999' })

  ;(axios as any).get = originalGet
  ;(axios as any).post = originalPost

  const service = new DelhiveryService()
  const nativeShipmentBase = {
    order: 'INVALID-CHECK',
    payment_mode: 'Prepaid',
    total_amount: 100,
    name: 'Test Customer',
    add: 'Test address',
    pin: '400093',
    phone: '9999999999',
    pickup_location: 'Test Warehouse',
  }
  await assert.rejects(
    () => service.createShipment({ ...nativeShipmentBase, name: '' } as any),
    /Consignee name is required/,
  )
  await assert.rejects(
    () => service.createShipment({ ...nativeShipmentBase, transport_speed: 'X' } as any),
    /transport_speed must be F.*or D/,
  )
  await assert.rejects(
    () => service.createShipment({
      ...nativeShipmentBase,
      mps: true,
      boxes: [{ waybill: 'MPS-ONE' }],
    } as any),
    /At least two boxes/,
  )
  await assert.rejects(
    () => service.createShipment({
      ...nativeShipmentBase,
      mps: true,
      boxes: [{ waybill: 'MPS-ONE' }, { weight: 500 }],
    } as any),
    /Every Delhivery MPS box must have its own waybill/,
  )
  await assert.rejects(() => service.checkServiceability('19410'), /6-digit/)
  await assert.rejects(() => service.checkHeavyServiceability('40008'), /6-digit/)
  await assert.rejects(
    () => service.getExpectedTATDetails('12200', '136118'),
    /6-digit/,
  )
  await assert.rejects(
    () => service.getExpectedTATDetails('122003', '136118', 'X' as any),
    /mot must be S, E, or N/,
  )
  await assert.rejects(
    () => service.getExpectedTATDetails('122003', '136118', 'S', 'B2C', '2026-02-31'),
    /valid calendar date/,
  )
  await assert.rejects(
    () => service.calculateShippingCost({
      originPincode: '12200',
      destinationPincode: '400093',
      weightGrams: 500,
    }),
    /6-digit/,
  )
  await assert.rejects(
    () => service.calculateShippingCost({
      originPincode: '122001',
      destinationPincode: '400093',
      weightGrams: 0,
    }),
    /positive number/,
  )
  await assert.rejects(() => service.updateShipment('TEST-AWB', {}), /editable shipment field/)
  await assert.rejects(() => service.fetchWaybills(0), /between 1 and 10000/)
  await assert.rejects(() => service.fetchWaybills(10001), /between 1 and 10000/)
  await assert.rejects(() => service.fetchWaybills(1.5), /between 1 and 10000/)
  await assert.rejects(
    () => service.updateShipment('TEST-AWB', { pin: '40009' }),
    /6-digit/,
  )
  await assert.rejects(
    () => service.updateShipment('TEST-AWB', { phone: '12345' }),
    /10 digits/,
  )

  const collectionPath = path.resolve(
    __dirname,
    '../../postman/delhivery-b2c.postman_collection.json',
  )
  const collection = JSON.parse(fs.readFileSync(collectionPath, 'utf8'))
  assert.equal(collection.info.name, 'Pax Logistics - Delhivery B2C')
  const readOnlyFolder = collection.item.find(
    (folder: any) => folder.name === 'Read-only smoke tests',
  )
  assert(readOnlyFolder)
  assert(
    readOnlyFolder.item.some(
      (request: any) => request.name === 'Heavy Product Pincode Serviceability',
    ),
  )
  const tatRequest = readOnlyFolder.item.find((request: any) => request.name === 'Expected TAT')
  assert(tatRequest.request.url.includes('mot={{tatMode}}'))
  assert(tatRequest.request.url.includes('expected_pickup_date={{expectedPickupDate}}'))
  const mutatingFolder = collection.item.find(
    (folder: any) => folder.name === 'Mutating lifecycle requests',
  )
  assert(mutatingFolder, 'Mutating lifecycle folder must exist')
  assert(
    JSON.stringify(mutatingFolder.event).includes('pm.execution.skipRequest'),
    'Mutating collection requests must be locked by default',
  )
  const fetchWaybillsRequest = mutatingFolder.item.find(
    (request: any) => request.name === 'Fetch Waybill(s)',
  )
  assert(fetchWaybillsRequest.request.url.includes('count={{waybillCount}}'))
  assert(JSON.stringify(fetchWaybillsRequest.event).includes('receivedCount'))
  const fetchSingleWaybillRequest = mutatingFolder.item.find(
    (request: any) => request.name === 'Fetch Single Waybill',
  )
  assert(fetchSingleWaybillRequest.request.url.endsWith('/waybills/single'))
  assert(JSON.stringify(fetchSingleWaybillRequest.event).includes('fetchedSingleWaybill'))
  const createShipmentRequest = mutatingFolder.item.find(
    (request: any) => request.name === 'Create Forward Shipment',
  )
  assert(createShipmentRequest.request.body.raw.includes('{{manifestWaybill}}'))
  assert(createShipmentRequest.request.body.raw.includes('transport_speed'))
  assert(mutatingFolder.item.some((request: any) => request.name === 'Create Pickup Shipment'))
  assert(mutatingFolder.item.some((request: any) => request.name === 'Create REPL Shipment'))
  const createMpsRequest = mutatingFolder.item.find(
    (request: any) => request.name === 'Create Multi Piece Shipment',
  )
  assert(createMpsRequest.request.body.raw.includes('{{mpsWaybill1}}'))
  assert(createMpsRequest.request.body.raw.includes('{{mpsWaybill2}}'))

  console.log('Delhivery B2C integration checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
