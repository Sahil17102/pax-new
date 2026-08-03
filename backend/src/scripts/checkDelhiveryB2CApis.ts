import assert from 'assert'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

const run = async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test'
  const {
    DelhiveryService,
    isDelhiveryCancellationAccepted,
    isDelhiveryEwaybillUpdateAccepted,
    normalizeDelhiveryRvpQc,
    normalizeDelhiveryWaybills,
    summarizeDelhiveryExpectedTat,
    summarizeDelhiveryHeavyPincodeServiceability,
    summarizeDelhiveryPincodeServiceability,
    summarizeDelhiveryShippingCost,
    summarizeDelhiveryTracking,
  } = await import('../models/services/couriers/delhivery.service')

  assert.equal(isDelhiveryCancellationAccepted({ success: true }), true)
  assert.equal(
    isDelhiveryCancellationAccepted({ success: true, message: 'Cancellation not accepted' }),
    false,
  )
  assert.equal(
    isDelhiveryCancellationAccepted({ success: false, message: 'Shipment already cancelled' }),
    true,
  )
  assert.equal(isDelhiveryEwaybillUpdateAccepted({ success: true }), true)
  assert.equal(isDelhiveryEwaybillUpdateAccepted({ status: 'Success' }), true)
  assert.equal(isDelhiveryEwaybillUpdateAccepted({ success: false }), false)
  assert.equal(isDelhiveryEwaybillUpdateAccepted({ status: 'Failed' }), false)
  assert.equal(isDelhiveryEwaybillUpdateAccepted({ error: 'Invalid e-waybill' }), false)
  assert.equal(isDelhiveryEwaybillUpdateAccepted('E-waybill update failed'), false)

  assert.deepEqual(
    normalizeDelhiveryWaybills({ waybills: '123456789012, 123456789013\n123456789012' }),
    ['123456789012', '123456789013'],
  )
  assert.deepEqual(
    normalizeDelhiveryWaybills({ data: { waybill: ['223456789012', 223456789013] } }),
    ['223456789012', '223456789013'],
  )

  const validRvpQc = [{
    item: 'mobile',
    description: 'Mi Note Pro',
    images: 'https://images.example.com/front.jpg, https://images.example.com/back.jpg',
    return_reason: 'Damaged',
    brand: 'Mi',
    product_category: 'mobile',
    questions: [
      {
        questions_id: 'CLIENT-SERIAL',
        options: [''],
        value: ['SERIAL-123'],
        required: true,
        type: 'varchar',
        ques_images: ['http://images.example.com/serial-help.jpg'],
      },
      {
        questions_id: 'CLIENT-COLOR',
        options: ['Black', 'Other'],
        value: ['Black'],
        required: true,
        type: 'multi',
      },
    ],
  }]
  const normalizedRvpQc = normalizeDelhiveryRvpQc(validRvpQc)
  assert.equal(normalizedRvpQc[0].quantity, 1)
  assert.deepEqual(normalizedRvpQc[0].images, [
    'https://images.example.com/front.jpg',
    'https://images.example.com/back.jpg',
  ])
  assert.equal(normalizedRvpQc[0].questions[0].type, 'varchar')
  assert.deepEqual(normalizedRvpQc[0].questions[1].options, ['Black', 'Other'])
  assert.throws(
    () => normalizeDelhiveryRvpQc([validRvpQc[0], validRvpQc[0], validRvpQc[0]]),
    /maximum of 2 items/,
  )
  assert.throws(
    () => normalizeDelhiveryRvpQc([{
      ...validRvpQc[0],
      questions: Array.from({ length: 7 }, () => validRvpQc[0].questions[0]),
    }]),
    /maximum of 6 questions/,
  )
  assert.throws(
    () => normalizeDelhiveryRvpQc([{
      ...validRvpQc[0],
      questions: [{ ...validRvpQc[0].questions[1], required: 'true' }],
    }]),
    /required must be a boolean/,
  )
  assert.throws(
    () => normalizeDelhiveryRvpQc([{
      ...validRvpQc[0],
      questions: [{ ...validRvpQc[0].questions[1], value: ['Blue'] }],
    }]),
    /value\[0\] must match one of the multi-question options/,
  )
  assert.throws(
    () => normalizeDelhiveryRvpQc([{ ...validRvpQc[0], images: ['not-a-url'] }]),
    /valid HTTP\(S\) image URLs/,
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

  const shippingCostSummary = summarizeDelhiveryShippingCost([{
    total_amount: '84.50',
    gross_amount: 75,
    tax_amount: 9.5,
    chargeable_weight: 1000,
    zone: 'B',
    charge_FSC: '5.25',
  }])
  assert.equal(shippingCostSummary.quoteCount, 1)
  assert.equal(shippingCostSummary.quotes[0].totalAmount, 84.5)
  assert.equal(shippingCostSummary.quotes[0].chargeableWeightGrams, 1000)
  assert.equal(shippingCostSummary.quotes[0].zone, 'B')
  assert.equal(shippingCostSummary.quotes[0].breakdown.charge_FSC, 5.25)

  const trackingSummary = summarizeDelhiveryTracking(
    {
      ShipmentData: [{
        Shipment: {
          AWB: '1122345678722',
          ReferenceNo: 'ORDER-1001',
          Status: {
            Status: 'In Transit',
            StatusType: 'UD',
            StatusLocation: 'Delhi Hub',
            StatusDateTime: '2026-08-03T10:00:00',
            RecievedBy: '',
          },
          Scans: [{
            ScanDetail: {
              Scan: 'Bag Added To Trip',
              StatusCode: 'X-IT',
              ScanType: 'UD',
              ScannedLocation: 'Delhi Hub',
              ScanDateTime: '2026-08-03T09:30:00',
              Instructions: 'In transit',
            },
          }],
        },
      }],
    },
    { waybills: '1122345678722,1122345678722', refIds: ['ORDER-1001'] },
  )
  assert.deepEqual(trackingSummary.requestedWaybills, ['1122345678722'])
  assert.deepEqual(trackingSummary.requestedRefIds, ['ORDER-1001'])
  assert.equal(trackingSummary.shipmentCount, 1)
  assert.equal(trackingSummary.shipments[0].currentStatus, 'In Transit')
  assert.equal(trackingSummary.shipments[0].scans[0].statusCode, 'X-IT')

  const originalGet = axios.get
  const originalPost = axios.post
  const originalPut = axios.put
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
        : url.includes('/api/p/packing_slip')
          ? url.includes('pdf=true')
            ? { packages: [{ pdf_download_link: 'https://labels.example.com/label.pdf' }] }
            : { packages: [{ barcode: 'data:image/png;base64,MOCK', sort_code: 'DEL/B' }] }
        : url.includes('/api/v1/packages/json/')
          ? {
              ShipmentData: [{
                Shipment: {
                  AWB: 'TRACK-AWB-1',
                  ReferenceNo: 'TRACK-ORDER-1',
                  Status: { Status: 'Manifested', StatusType: 'UD', StatusLocation: 'Origin Hub' },
                  Scans: [{ ScanDetail: { Scan: 'Manifested', StatusCode: 'UD', ScanType: 'UD' } }],
                },
              }],
            }
        : url.includes('/expected_tat')
          ? { data: { tat: 2, expected_delivery_date: '2026-08-06' } }
          : url.includes('/pin-codes/')
            ? { delivery_codes: [{ postal_code: { pin: 194103, pickup: 'Y', pre_paid: 'Y', cod: 'N', remark: '' } }] }
            : [{ total_amount: 75 }],
    }
  }
  ;(axios as any).post = async (url: string, data: unknown, config: any) => {
    captured.push({ method: 'POST', url, data, headers: config?.headers })
    if (url.includes('/api/backend/clientwarehouse/create/')) {
      return {
        status: 200,
        data: { success: true, message: 'Warehouse created' },
      }
    }
    if (url.includes('/api/backend/clientwarehouse/edit/')) {
      return {
        status: 200,
        data: { success: true, message: 'Warehouse updated' },
      }
    }
    if (url.includes('/fm/request/new/')) {
      return {
        status: 200,
        data: { success: true, pickup_request_id: 'PICKUP-REQUEST-1' },
      }
    }
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
  ;(axios as any).put = async (url: string, data: unknown, config: any) => {
    captured.push({ method: 'PUT', url, data, headers: config?.headers })
    return { status: 200, data: { success: true, message: 'E-waybill updated' } }
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

  const warehouseRequestPayload = {
    name: 'Case Sensitive Warehouse',
    registered_name: ' Pax Logistics ',
    phone: '+91 99999 99999',
    email: ' operations@example.com ',
    address: ' Warehouse Road ',
    city: ' Kota ',
    pin: '110042',
    country: ' India ',
    return_address: ' Return Warehouse Road ',
    return_city: ' Kota ',
    return_pin: '110043',
    return_state: ' Delhi ',
    return_country: ' India ',
  }
  const warehouseResult = await mockedService.createWarehouse(warehouseRequestPayload)
  assert.equal(
    captured.at(-1)?.url,
    'https://staging-express.delhivery.com/api/backend/clientwarehouse/create/',
  )
  assert.deepEqual(captured.at(-1)?.data, {
    name: 'Case Sensitive Warehouse',
    phone: '9999999999',
    pin: '110042',
    return_address: 'Return Warehouse Road',
    registered_name: 'Pax Logistics',
    email: 'operations@example.com',
    address: 'Warehouse Road',
    city: 'Kota',
    country: 'India',
    return_city: 'Kota',
    return_pin: '110043',
    return_state: 'Delhi',
    return_country: 'India',
  })
  assert.equal(captured.at(-1)?.headers?.Authorization, 'Token test-token')
  assert.equal(captured.at(-1)?.headers?.Accept, 'application/json')
  assert.equal(captured.at(-1)?.headers?.['Content-Type'], 'application/json')
  assert.equal(warehouseResult.success, true)
  assert.equal(warehouseResult.warehouse_name, 'Case Sensitive Warehouse')
  assert.equal(warehouseResult.pin, '110042')
  assert.equal(warehouseResult.return_pin, '110043')
  assert.equal(warehouseResult.message, 'Warehouse created')

  const successfulWarehousePostMock = (axios as any).post
  ;(axios as any).post = async () => ({
    status: 200,
    data: { success: false, error: ['Warehouse registration rejected'] },
  })
  await assert.rejects(
    () => mockedService.createWarehouse(warehouseRequestPayload),
    /Warehouse registration rejected/,
  )
  ;(axios as any).post = successfulWarehousePostMock

  const warehouseUpdate = await mockedService.updateWarehouse({
    name: ' Case Sensitive Warehouse ',
    address: ' Updated Warehouse Road ',
    phone: '+91 88888 88888',
  })
  assert.equal(
    captured.at(-1)?.url,
    'https://staging-express.delhivery.com/api/backend/clientwarehouse/edit/',
  )
  assert.deepEqual(captured.at(-1)?.data, {
    name: 'Case Sensitive Warehouse',
    address: 'Updated Warehouse Road',
    phone: '8888888888',
  })
  assert.equal(captured.at(-1)?.headers?.Authorization, 'Token test-token')
  assert.equal(captured.at(-1)?.headers?.Accept, 'application/json')
  assert.equal(captured.at(-1)?.headers?.['Content-Type'], 'application/json')
  assert.equal(warehouseUpdate.success, true)
  assert.equal(warehouseUpdate.warehouse_name, 'Case Sensitive Warehouse')
  assert.deepEqual(warehouseUpdate.updated_fields, ['address', 'phone'])
  assert.equal(warehouseUpdate.message, 'Warehouse updated')

  const warehousePinUpdate = await mockedService.updateWarehouse({
    name: 'Case Sensitive Warehouse',
    pin: '110044',
  })
  assert.deepEqual(captured.at(-1)?.data, {
    name: 'Case Sensitive Warehouse',
    pin: '110044',
  })
  assert.deepEqual(warehousePinUpdate.updated_fields, ['pin'])

  const successfulWarehouseUpdatePostMock = (axios as any).post
  ;(axios as any).post = async () => ({
    status: 200,
    data: { status: 'Failed', error: 'Warehouse update rejected' },
  })
  await assert.rejects(
    () => mockedService.updateWarehouse({
      name: 'Case Sensitive Warehouse',
      address: 'Rejected address',
    }),
    /Warehouse update rejected/,
  )
  ;(axios as any).post = successfulWarehouseUpdatePostMock

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

  const shippingCost = await mockedService.calculateShippingCost({
    originPincode: '122001',
    destinationPincode: '400093',
    weightGrams: 500,
    mode: 'E',
    status: 'DTO',
    paymentType: 'COD',
    length: 10,
    breadth: 8,
    height: 6,
    packageType: 'box',
  })
  const shippingCostUrl = new URL(String(captured.at(-1)?.url))
  assert.equal(shippingCostUrl.pathname, '/api/kinko/v1/invoice/charges/.json')
  assert.equal(shippingCostUrl.searchParams.get('md'), 'E')
  assert.equal(shippingCostUrl.searchParams.get('ss'), 'DTO')
  assert.equal(shippingCostUrl.searchParams.get('o_pin'), '122001')
  assert.equal(shippingCostUrl.searchParams.get('d_pin'), '400093')
  assert.equal(shippingCostUrl.searchParams.get('cgm'), '500')
  assert.equal(shippingCostUrl.searchParams.get('pt'), 'COD')
  assert.equal(shippingCostUrl.searchParams.get('l'), '10')
  assert.equal(shippingCostUrl.searchParams.get('b'), '8')
  assert.equal(shippingCostUrl.searchParams.get('h'), '6')
  assert.equal(shippingCostUrl.searchParams.get('ipkg_type'), 'box')
  assert.equal(shippingCostUrl.searchParams.has('cod'), false)
  assert.equal(captured.at(-1)?.headers?.Authorization, 'Token test-token')
  assert.equal(shippingCost.quoteCount, 1)
  assert.equal(shippingCost.quotes[0].totalAmount, 75)

  await mockedService.calculateShippingCost({
    originPincode: '122001',
    destinationPincode: '400093',
    weightGrams: 0,
    mode: 'S',
    status: 'Delivered',
    paymentType: 'Pre-paid',
  })
  assert.equal(new URL(String(captured.at(-1)?.url)).searchParams.get('cgm'), '0')

  const successfulShippingCostGetMock = (axios as any).get
  ;(axios as any).get = async () => ({ status: 200, data: [] })
  await assert.rejects(
    () => mockedService.calculateShippingCost({
      originPincode: '122001',
      destinationPincode: '400093',
      weightGrams: 500,
      mode: 'S',
      status: 'Delivered',
      paymentType: 'Pre-paid',
    }),
    /returned no shipping-cost quote/,
  )
  ;(axios as any).get = async () => ({ status: 200, data: { error: 'Rate card unavailable' } })
  await assert.rejects(
    () => mockedService.calculateShippingCost({
      originPincode: '122001',
      destinationPincode: '400093',
      weightGrams: 500,
      mode: 'S',
      status: 'Delivered',
      paymentType: 'Pre-paid',
    }),
    /Rate card unavailable/,
  )
  ;(axios as any).get = successfulShippingCostGetMock

  const customLabel = await mockedService.generateLabel('LABEL-AWB-1', {
    pdf: false,
    pdfSize: 'A4',
  })
  const customLabelUrl = new URL(String(captured.at(-1)?.url))
  assert.equal(customLabelUrl.pathname, '/api/p/packing_slip')
  assert.equal(customLabelUrl.searchParams.get('wbns'), 'LABEL-AWB-1')
  assert.equal(customLabelUrl.searchParams.get('pdf'), 'false')
  assert.equal(customLabelUrl.searchParams.get('pdf_size'), 'A4')
  assert.equal(captured.at(-1)?.headers?.Authorization, 'Token test-token')
  assert.equal(customLabel.pdf, false)
  assert.equal(customLabel.pdf_size, 'A4')
  assert.equal(customLabel.label_url, null)
  assert.equal(customLabel.packages[0].sort_code, 'DEL/B')

  const pdfLabel = await mockedService.generateLabel('LABEL-AWB-2', {
    pdf: 'true',
    pdfSize: '4r',
  })
  const pdfLabelUrl = new URL(String(captured.at(-1)?.url))
  assert.equal(pdfLabelUrl.searchParams.get('pdf'), 'true')
  assert.equal(pdfLabelUrl.searchParams.get('pdf_size'), '4R')
  assert.equal(pdfLabel.pdf, true)
  assert.equal(pdfLabel.pdf_size, '4R')
  assert.equal(pdfLabel.label_url, 'https://labels.example.com/label.pdf')

  const legacyPdfLabel = await mockedService.generateLabel('LABEL-AWB-3', { format: 'pdf' })
  const legacyPdfLabelUrl = new URL(String(captured.at(-1)?.url))
  assert.equal(legacyPdfLabelUrl.searchParams.get('pdf'), 'true')
  assert.equal(legacyPdfLabelUrl.searchParams.has('pdf_size'), false)
  assert.equal(legacyPdfLabel.label_url, 'https://labels.example.com/label.pdf')

  const successfulLabelGetMock = (axios as any).get
  ;(axios as any).get = async () => ({ status: 200, data: { success: false, error: 'Invalid AWB' } })
  await assert.rejects(
    () => mockedService.generateLabel('UNKNOWN-AWB', { pdf: false }),
    /Invalid AWB/,
  )
  ;(axios as any).get = async () => ({ status: 200, data: { success: true } })
  await assert.rejects(
    () => mockedService.generateLabel('UNKNOWN-AWB', { pdf: true }),
    /returned no PDF label link/,
  )
  ;(axios as any).get = successfulLabelGetMock

  const bulkTracking = await mockedService.trackShipments(
    'TRACK-AWB-1, TRACK-AWB-2, TRACK-AWB-1',
    'TRACK-ORDER-1',
  )
  const bulkTrackingUrl = new URL(String(captured.at(-1)?.url))
  assert.equal(bulkTrackingUrl.pathname, '/api/v1/packages/json/')
  assert.equal(bulkTrackingUrl.searchParams.get('waybill'), 'TRACK-AWB-1,TRACK-AWB-2')
  assert.equal(bulkTrackingUrl.searchParams.get('ref_ids'), 'TRACK-ORDER-1')
  assert.equal(captured.at(-1)?.headers?.Authorization, 'Token test-token')
  assert.deepEqual(bulkTracking.requestedWaybills, ['TRACK-AWB-1', 'TRACK-AWB-2'])
  assert.equal(bulkTracking.shipmentCount, 1)
  assert.equal(bulkTracking.shipments[0].scans[0].status, 'Manifested')

  const referenceTracking = await mockedService.trackShipments(undefined, ['TRACK-ORDER-1'])
  const referenceTrackingUrl = new URL(String(captured.at(-1)?.url))
  assert.equal(referenceTrackingUrl.searchParams.has('waybill'), false)
  assert.equal(referenceTrackingUrl.searchParams.get('ref_ids'), 'TRACK-ORDER-1')

  const successfulGetMock = (axios as any).get
  ;(axios as any).get = async () => ({ status: 200, data: { error: 'Tracking ID not found' } })
  await assert.rejects(
    () => mockedService.trackShipments('UNKNOWN-AWB'),
    /Tracking ID not found/,
  )
  ;(axios as any).get = successfulGetMock

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
    order: 'DOC-RVP-QC-1',
    payment_mode: 'Pickup',
    total_amount: 749,
    name: 'RVP Customer',
    add: 'Customer reverse pickup address',
    city: 'Meerjapuram',
    state: 'Andhra Pradesh',
    pin: '521111',
    phone: '9999999999',
    weight: '150.0 gm',
    shipping_mode: 'Express',
    pickup_location: 'Test Warehouse',
    return_name: 'Pax Returns',
    return_address: 'Return Warehouse Road',
    return_city: 'Gurugram',
    return_state: 'Haryana',
    return_pin: '122001',
    return_phone: '9888888888',
    qc_type: 'param',
    custom_qc: validRvpQc,
  } as any, 'RVP-QC-AWB-1')
  const rvpQcForm = new URLSearchParams(String(captured.at(-1)?.data))
  assert.equal(rvpQcForm.get('format'), 'json')
  const rvpQcPayload = JSON.parse(rvpQcForm.get('data') || '{}')
  assert.equal(rvpQcPayload.pickup_location.name, 'Test Warehouse')
  assert.equal(rvpQcPayload.shipments.length, 1)
  assert.equal(rvpQcPayload.shipments[0].payment_mode, 'Pickup')
  assert.equal(rvpQcPayload.shipments[0].waybill, 'RVP-QC-AWB-1')
  assert.equal(rvpQcPayload.shipments[0].weight, 150)
  assert.equal(rvpQcPayload.shipments[0].client, 'test-client')
  assert.equal(rvpQcPayload.shipments[0].qc_type, 'param')
  assert.equal(rvpQcPayload.shipments[0].custom_qc.length, 1)
  assert.equal(rvpQcPayload.shipments[0].custom_qc[0].quantity, 1)
  assert.deepEqual(rvpQcPayload.shipments[0].custom_qc[0].images, [
    'https://images.example.com/front.jpg',
    'https://images.example.com/back.jpg',
  ])
  assert.equal(
    rvpQcPayload.shipments[0].custom_qc[0].questions[0].questions_id,
    'CLIENT-SERIAL',
  )
  assert.equal(rvpQcPayload.shipments[0].custom_qc[0].questions[1].type, 'multi')
  assert.equal(
    rvpQcPayload.shipments[0].custom_qc[0].questions[1].value[0],
    'Black',
  )

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
    pickup_location: { name: 'Test Warehouse' },
    shipments: [
      {
        order: 'DOC-MPS-1-1',
        weight: 500,
        mps_amount: 0,
        mps_children: 2,
        pin: '400093',
        products_desc: 'Toy car',
        add: 'First box address',
        shipment_type: 'MPS',
        state: 'Maharashtra',
        master_id: 'MPS-AWB-1',
        city: 'Mumbai',
        waybill: 'MPS-AWB-1',
        phone: '9999999999',
        payment_mode: 'Prepaid',
        name: 'MPS Customer',
        total_amount: 500,
        country: 'India',
      },
      {
        order: 'DOC-MPS-1-2',
        weight: 600,
        mps_amount: 0,
        mps_children: 2,
        pin: '400093',
        products_desc: 'Toy train',
        add: 'Second box address',
        shipment_type: 'MPS',
        state: 'Maharashtra',
        master_id: 'MPS-AWB-1',
        city: 'Mumbai',
        waybill: 'MPS-AWB-2',
        phone: '9999999999',
        payment_mode: 'Prepaid',
        name: 'MPS Customer',
        total_amount: 500,
        country: 'India',
      },
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
  assert(mpsPayload.shipments.every((shipment: any) => shipment.shipment_type === 'MPS'))
  assert(mpsPayload.shipments.every((shipment: any) => shipment.master_id === 'MPS-AWB-1'))
  assert(mpsPayload.shipments.every((shipment: any) => shipment.mps_children === 2))
  assert(mpsPayload.shipments.every((shipment: any) => shipment.mps_amount === 0))
  assert.equal(mpsPayload.shipments[1].add, 'Second box address')

  await mockedService.createShipment({
    order: 'DOC-MPS-COD',
    payment_mode: 'COD',
    cod_amount: 700,
    total_amount: 700,
    name: 'COD Customer',
    add: 'COD address',
    pin: '400093',
    phone: '9999999999',
    pickup_location: 'Test Warehouse',
    mps: true,
    master_id: 'MPS-COD-1',
    mps_amount: 700,
    boxes: [
      { waybill: 'MPS-COD-1', weight: 500, cod_amount: 300 },
      { waybill: 'MPS-COD-2', weight: 600, cod_amount: 400 },
    ],
  } as any)
  const codMpsForm = new URLSearchParams(String(captured.at(-1)?.data))
  const codMpsPayload = JSON.parse(codMpsForm.get('data') || '{}')
  assert(codMpsPayload.shipments.every((shipment: any) => shipment.mps_amount === 700))
  assert.deepEqual(codMpsPayload.shipments.map((shipment: any) => shipment.cod_amount), [300, 400])

  await mockedService.updateShipment('TEST-AWB', { phone: '919999999999' })
  assert.equal(captured.at(-1)?.url, 'https://staging-express.delhivery.com/api/p/edit')
  assert.deepEqual(captured.at(-1)?.data, { waybill: 'TEST-AWB', phone: '9999999999' })

  await mockedService.updateShipment('EDIT-AWB', {
    current_payment_mode: 'Prepaid',
    current_status: 'Manifested',
    pt: 'COD',
    cod: 100,
    phone: ['919999999999', '918888888888'],
    add: 'Updated address',
    products_desc: 'Updated products',
    gm: 100.2,
    shipment_height: 40.2,
    shipment_width: 30,
    shipment_length: 20,
  })
  assert.deepEqual(captured.at(-1)?.data, {
    waybill: 'EDIT-AWB',
    phone: ['9999999999', '8888888888'],
    add: 'Updated address',
    products_desc: 'Updated products',
    gm: 100.2,
    shipment_height: 40.2,
    shipment_width: 30,
    shipment_length: 20,
    cod: 100,
    pt: 'COD',
  })

  const manifestedCancellation = await mockedService.cancelShipment('CANCEL-AWB-1', {
    current_payment_mode: 'Prepaid',
    current_status: 'Manifested',
  })
  assert.equal(captured.at(-1)?.url, 'https://staging-express.delhivery.com/api/p/edit')
  assert.deepEqual(captured.at(-1)?.data, {
    waybill: 'CANCEL-AWB-1',
    cancellation: 'true',
  })
  assert.equal(captured.at(-1)?.headers?.Authorization, 'Token test-token')
  assert.equal(manifestedCancellation.expected_status, 'Manifested')
  assert.equal(manifestedCancellation.expected_status_type, 'UD')

  const pickupCancellation = await mockedService.cancelShipment('CANCEL-AWB-2', {
    current_payment_mode: 'Pickup',
    current_status: 'Scheduled',
  })
  assert.equal(pickupCancellation.expected_status, 'Canceled')
  assert.equal(pickupCancellation.expected_status_type, 'CN')

  const replCancellation = await mockedService.cancelShipment('CANCEL-AWB-3', {
    current_payment_mode: 'REPL',
    current_status: 'Pending',
  })
  assert.equal(replCancellation.expected_status, 'In Transit')
  assert.equal(replCancellation.expected_status_type, 'RT')

  const ewaybillUpdate = await mockedService.updateEwaybill('EWB-AWB-1', {
    dcn: ' INV-50001 ',
    ewbn: 123456789012,
  })
  assert.equal(
    captured.at(-1)?.url,
    'https://staging-express.delhivery.com/api/rest/ewaybill/EWB-AWB-1/',
  )
  assert.deepEqual(captured.at(-1)?.data, {
    data: [{ dcn: 'INV-50001', ewbn: '123456789012' }],
  })
  assert.equal(captured.at(-1)?.headers?.Authorization, 'Token test-token')
  assert.equal(captured.at(-1)?.headers?.['Content-Type'], 'application/json')
  assert.equal(ewaybillUpdate.awb_number, 'EWB-AWB-1')
  assert.equal(ewaybillUpdate.invoice_number, 'INV-50001')
  assert.equal(ewaybillUpdate.ewaybill_number, '123456789012')

  const pickupRequestPayload = {
    pickup_date: '2026-08-04',
    pickup_time: '11:00:00',
    pickup_location: 'Test Warehouse',
    expected_package_count: 3,
  }
  const pickupRequest = await mockedService.createPickupRequest(pickupRequestPayload)
  assert.equal(
    captured.at(-1)?.url,
    'https://staging-express.delhivery.com/fm/request/new/',
  )
  assert.deepEqual(captured.at(-1)?.data, pickupRequestPayload)
  assert.equal(captured.at(-1)?.headers?.Authorization, 'Token test-token')
  assert.equal(captured.at(-1)?.headers?.['Content-Type'], 'application/json')
  assert.equal(pickupRequest.success, true)
  assert.equal(pickupRequest.already_exists, false)
  assert.equal(pickupRequest.pickup_request_id, 'PICKUP-REQUEST-1')
  assert.equal(pickupRequest.pickup_location, 'Test Warehouse')
  assert.equal(pickupRequest.expected_package_count, 3)

  const successfulPostMock = (axios as any).post
  ;(axios as any).post = async () => ({
    status: 200,
    data: {
      pickup_date: ['Pickup request PR-123 already exists for this warehouse'],
    },
  })
  const duplicatePickupRequest = await mockedService.createPickupRequest(pickupRequestPayload)
  assert.equal(duplicatePickupRequest.success, true)
  assert.equal(duplicatePickupRequest.already_exists, true)
  assert.equal(duplicatePickupRequest.pickup_request_id, 'PR-123')
  assert.deepEqual((duplicatePickupRequest.provider_response as any)?.pickup_date, [
    'Pickup request PR-123 already exists for this warehouse',
  ])
  ;(axios as any).post = successfulPostMock

  ;(axios as any).get = originalGet
  ;(axios as any).post = originalPost
  ;(axios as any).put = originalPut

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
  await assert.rejects(
    () => service.createShipment({
      ...nativeShipmentBase,
      mps: true,
      boxes: [{ waybill: 'MPS-ONE' }, { waybill: 'MPS-TWO' }],
    } as any),
    /master_id is required/,
  )
  await assert.rejects(
    () => service.createShipment({
      ...nativeShipmentBase,
      custom_qc: validRvpQc,
    } as any),
    /supported only for Pickup shipments/,
  )
  await assert.rejects(
    () => service.createShipment({
      ...nativeShipmentBase,
      payment_mode: 'Pickup',
      qc_type: 'param',
    } as any),
    /custom_qc is required when qc_type is provided/,
  )
  await assert.rejects(
    () => service.createShipment({
      ...nativeShipmentBase,
      payment_mode: 'Pickup',
      qc_type: 'legacy',
      custom_qc: validRvpQc,
    } as any),
    /qc_type must be param/,
  )
  await assert.rejects(
    () => service.createShipment({
      ...nativeShipmentBase,
      payment_mode: 'Pickup',
      custom_qc: [],
    } as any),
    /custom_qc must be a non-empty array/,
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
  const shippingCostBase = {
    originPincode: '122001',
    destinationPincode: '400093',
    weightGrams: 500,
    mode: 'S' as const,
    status: 'Delivered' as const,
    paymentType: 'Pre-paid' as const,
  }
  await assert.rejects(
    () => service.calculateShippingCost({
      ...shippingCostBase,
      originPincode: '12200',
    }),
    /6-digit/,
  )
  await assert.rejects(
    () => service.calculateShippingCost({
      ...shippingCostBase,
      weightGrams: 1.5,
    }),
    /non-negative integer/,
  )
  await assert.rejects(
    () => service.calculateShippingCost({ ...shippingCostBase, mode: 'X' as any }),
    /mode\/md must be S or E/,
  )
  await assert.rejects(
    () => service.calculateShippingCost({ ...shippingCostBase, status: 'Pending' as any }),
    /status\/ss must be Delivered, RTO, or DTO/,
  )
  await assert.rejects(
    () => service.calculateShippingCost({ ...shippingCostBase, paymentType: 'Pickup' as any }),
    /payment_type\/pt must be Pre-paid or COD/,
  )
  await assert.rejects(
    () => service.calculateShippingCost({ ...shippingCostBase, length: 10 }),
    /length, breadth, and height must be provided together/,
  )
  await assert.rejects(
    () => service.calculateShippingCost({
      ...shippingCostBase,
      length: 10,
      breadth: 8.5,
      height: 6,
    }),
    /length, breadth, and height must be positive integers/,
  )
  await assert.rejects(
    () => service.calculateShippingCost({ ...shippingCostBase, packageType: 'satchel' as any }),
    /package_type\/ipkg_type must be box or flyer/,
  )
  await assert.rejects(() => service.updateShipment('TEST-AWB', {}), /editable shipment field/)
  await assert.rejects(() => service.fetchWaybills(0), /between 1 and 10000/)
  await assert.rejects(() => service.fetchWaybills(10001), /between 1 and 10000/)
  await assert.rejects(() => service.fetchWaybills(1.5), /between 1 and 10000/)
  await assert.rejects(
    () => service.updateShipment('TEST-AWB', { pin: '40009' } as any),
    /Unsupported Delhivery shipment edit field.*pin/,
  )
  await assert.rejects(
    () => service.updateShipment('TEST-AWB', { phone: '12345' }),
    /phone value must contain 10 digits/,
  )
  await assert.rejects(
    () => service.updateShipment('TEST-AWB', {
      current_payment_mode: 'Prepaid',
      pt: 'Pre-paid',
    }),
    /conversion is not allowed/,
  )
  await assert.rejects(
    () => service.updateShipment('TEST-AWB', {
      current_payment_mode: 'Prepaid',
      pt: 'Pickup',
    }),
    /only be converted between COD and Pre-paid/,
  )
  await assert.rejects(
    () => service.updateShipment('TEST-AWB', {
      current_payment_mode: 'Prepaid',
      pt: 'COD',
    }),
    /cod is required/,
  )
  await assert.rejects(
    () => service.updateShipment('TEST-AWB', {
      current_payment_mode: 'Pickup',
      current_status: 'Pending',
      add: 'Updated address',
    }),
    /not allowed in Pending status/,
  )
  await assert.rejects(
    () => service.updateShipment('TEST-AWB', {
      current_payment_mode: 'COD',
      current_status: 'Delivered',
      add: 'Updated address',
    }),
    /not allowed in Delivered status/,
  )
  await assert.rejects(
    () => service.updateShipment('TEST-AWB', { gm: 0 }),
    /gm must be a positive number/,
  )
  await assert.rejects(() => service.cancelShipment(''), /AWB number is required/)
  await assert.rejects(
    () => service.generateLabel(''),
    /AWB number is required/,
  )
  await assert.rejects(
    () => service.generateLabel('TEST-AWB', { pdf: 'yes' }),
    /pdf must be true or false/,
  )
  await assert.rejects(
    () => service.generateLabel('TEST-AWB', { pdfSize: 'Letter' }),
    /pdf_size must be A4 or 4R/,
  )
  await assert.rejects(
    () => service.generateLabel('TEST-AWB', { format: 'png' }),
    /format must be json or pdf/,
  )
  await assert.rejects(
    () => service.trackShipments(),
    /At least one Delhivery waybill or ref_ids value is required/,
  )
  await assert.rejects(
    () => service.trackShipments(Array.from({ length: 51 }, (_, index) => `AWB-${index}`)),
    /maximum of 50 Delhivery waybills/,
  )
  await assert.rejects(
    () => service.trackShipments(undefined, Array.from({ length: 51 }, (_, index) => `ORDER-${index}`)),
    /maximum of 50 Delhivery ref_ids/,
  )
  await assert.rejects(
    () => service.updateEwaybill('', { dcn: 'INV-1', ewbn: '123456789012' }),
    /AWB number is required/,
  )
  await assert.rejects(
    () => service.updateEwaybill('TEST-AWB', { dcn: '', ewbn: '123456789012' }),
    /dcn is required/,
  )
  await assert.rejects(
    () => service.updateEwaybill('TEST-AWB', { dcn: 'INV-1', ewbn: '' }),
    /ewbn is required/,
  )
  await assert.rejects(
    () => service.updateEwaybill('TEST-AWB', {
      dcn: 'INV-1',
      ewbn: '123456789012',
      extra: true,
    } as any),
    /Unsupported Delhivery e-waybill field.*extra/,
  )
  await assert.rejects(
    () => service.createPickupRequest({
      ...pickupRequestPayload,
      pickup_date: '2026-02-31',
    }),
    /valid calendar date/,
  )
  await assert.rejects(
    () => service.createPickupRequest({
      ...pickupRequestPayload,
      pickup_time: '24:00:00',
    }),
    /HH:mm:ss/,
  )
  await assert.rejects(
    () => service.createPickupRequest({
      ...pickupRequestPayload,
      pickup_location: '   ',
    }),
    /pickup_location is required/,
  )
  await assert.rejects(
    () => service.createPickupRequest({
      ...pickupRequestPayload,
      expected_package_count: 0,
    }),
    /positive integer/,
  )
  await assert.rejects(
    () => service.createPickupRequest({
      ...pickupRequestPayload,
      expected_package_count: 1.5,
    }),
    /positive integer/,
  )
  await assert.rejects(
    () => service.createPickupRequest({
      ...pickupRequestPayload,
      waybill: 'NOT-SUPPORTED',
    } as any),
    /Unsupported Delhivery pickup request field.*waybill/,
  )
  const validWarehousePayload = {
    name: 'Exact Warehouse Name',
    phone: '9999999999',
    pin: '110042',
    return_address: 'Return warehouse address',
  }
  await assert.rejects(
    () => service.createWarehouse({ ...validWarehousePayload, name: '   ' }),
    /Warehouse name is required.*case-sensitive/,
  )
  await assert.rejects(
    () => service.createWarehouse({ ...validWarehousePayload, phone: '12345' }),
    /valid 10-digit number/,
  )
  await assert.rejects(
    () => service.createWarehouse({ ...validWarehousePayload, pin: '11004' }),
    /valid 6-digit pincode/,
  )
  await assert.rejects(
    () => service.createWarehouse({ ...validWarehousePayload, return_address: '   ' }),
    /return_address is required/,
  )
  await assert.rejects(
    () => service.createWarehouse({
      ...validWarehousePayload,
      email: 'invalid-email',
    }),
    /valid email address/,
  )
  await assert.rejects(
    () => service.createWarehouse({ ...validWarehousePayload, return_pin: '11004' }),
    /return_pin must be a valid 6-digit pincode/,
  )
  await assert.rejects(
    () => service.createWarehouse({
      ...validWarehousePayload,
      state: 'Delhi',
    } as any),
    /Unsupported Delhivery warehouse field.*state/,
  )
  await assert.rejects(
    () => service.updateWarehouse({ name: '   ', address: 'Updated address' }),
    /Warehouse name is required.*cannot be changed/,
  )
  await assert.rejects(
    () => service.updateWarehouse({ name: 'Exact Warehouse Name' }),
    /at least one warehouse field to update/,
  )
  await assert.rejects(
    () => service.updateWarehouse({ name: 'Exact Warehouse Name', address: '   ' }),
    /address must be a non-empty string/,
  )
  await assert.rejects(
    () => service.updateWarehouse({ name: 'Exact Warehouse Name', pin: '11004' }),
    /pin must be a valid 6-digit pincode/,
  )
  await assert.rejects(
    () => service.updateWarehouse({ name: 'Exact Warehouse Name', phone: '12345' }),
    /phone must contain a valid 10-digit number/,
  )
  await assert.rejects(
    () => service.updateWarehouse({
      name: 'Exact Warehouse Name',
      registered_name: 'Not editable',
    } as any),
    /Unsupported Delhivery warehouse update field.*registered_name/,
  )
  await assert.rejects(
    () => service.cancelShipment('TEST-AWB', {
      current_payment_mode: 'Pickup',
      current_status: 'Pending',
    }),
    /cancellation is not allowed in Pending status/,
  )
  await assert.rejects(
    () => service.cancelShipment('TEST-AWB', {
      current_payment_mode: 'Prepaid',
      current_status: 'Scheduled',
    }),
    /cancellation is not allowed in Scheduled status/,
  )
  await assert.rejects(
    () => service.cancelShipment('TEST-AWB', {
      current_payment_mode: 'COD',
      current_status: 'Delivered',
    }),
    /cancellation is not allowed in Delivered status/,
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
  const shippingCostRequest = readOnlyFolder.item.find(
    (request: any) => request.name === 'Shipping Cost',
  )
  assert(shippingCostRequest.request.url.includes('md={{shippingMode}}'))
  assert(shippingCostRequest.request.url.includes('ss={{shippingStatus}}'))
  assert(shippingCostRequest.request.url.includes('pt={{shippingPaymentType}}'))
  assert(shippingCostRequest.request.url.includes('ipkg_type={{shippingPackageType}}'))
  assert(JSON.stringify(shippingCostRequest.event).includes('quoteCount'))
  const trackingRequest = readOnlyFolder.item.find(
    (request: any) => request.name === 'Shipment Tracking',
  )
  assert(trackingRequest.request.url.includes('waybill={{trackingWaybills}}'))
  assert(trackingRequest.request.url.includes('ref_ids={{trackingRefIds}}'))
  assert(JSON.stringify(trackingRequest.event).includes('shipmentCount'))
  const customLabelRequest = readOnlyFolder.item.find(
    (request: any) => request.name === 'Generate Custom Label Metadata',
  )
  assert(customLabelRequest.request.url.includes('pdf=false'))
  assert(customLabelRequest.request.url.includes('pdf_size={{labelPdfSize}}'))
  assert(JSON.stringify(customLabelRequest.event).includes('packages'))
  const pdfLabelRequest = readOnlyFolder.item.find(
    (request: any) => request.name === 'Generate PDF Label Link',
  )
  assert(pdfLabelRequest.request.url.includes('pdf=true'))
  assert(JSON.stringify(pdfLabelRequest.event).includes('label_url'))
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
  const createRvpQcRequest = mutatingFolder.item.find(
    (request: any) => request.name === 'Create RVP QC 3.0 Shipment',
  )
  assert(createRvpQcRequest.request.body.raw.includes('"qc_type": "param"'))
  assert(createRvpQcRequest.request.body.raw.includes('"custom_qc"'))
  assert(createRvpQcRequest.request.body.raw.includes('"questions_id"'))
  assert(createRvpQcRequest.request.body.raw.includes('{{qcSerialQuestionId}}'))
  assert(createRvpQcRequest.request.body.raw.includes('{{qcColorQuestionId}}'))
  assert(createRvpQcRequest.request.body.raw.includes('"ques_images"'))
  assert(JSON.stringify(createRvpQcRequest.event).includes('packages'))
  assert(mutatingFolder.item.some((request: any) => request.name === 'Create REPL Shipment'))
  const createMpsRequest = mutatingFolder.item.find(
    (request: any) => request.name === 'Create Multi Piece Shipment',
  )
  assert(createMpsRequest.request.body.raw.includes('{{mpsWaybill1}}'))
  assert(createMpsRequest.request.body.raw.includes('{{mpsWaybill2}}'))
  assert(createMpsRequest.request.body.raw.includes('master_id'))
  assert(createMpsRequest.request.body.raw.includes('mps_children'))
  assert(createMpsRequest.request.body.raw.includes('mps_amount'))
  const updateForwardRequest = mutatingFolder.item.find(
    (request: any) => request.name === 'Update Forward Shipment',
  )
  assert(updateForwardRequest.request.body.raw.includes('current_payment_mode'))
  assert(updateForwardRequest.request.body.raw.includes('shipment_height'))
  assert(mutatingFolder.item.some((request: any) => request.name === 'Update Pickup Shipment'))
  assert(mutatingFolder.item.some((request: any) => request.name === 'Update REPL Shipment'))
  const cancelForwardRequest = mutatingFolder.item.find(
    (request: any) => request.name === 'Cancel Forward Shipment',
  )
  assert(cancelForwardRequest.request.url.includes('current_payment_mode={{cancelPaymentMode}}'))
  assert(cancelForwardRequest.request.url.includes('current_status={{cancelStatus}}'))
  assert(mutatingFolder.item.some((request: any) => request.name === 'Cancel Pickup Shipment'))
  assert(mutatingFolder.item.some((request: any) => request.name === 'Cancel REPL Shipment'))
  const ewaybillRequest = mutatingFolder.item.find(
    (request: any) => request.name === 'Update E-waybill',
  )
  assert.equal(ewaybillRequest.request.method, 'PUT')
  assert(ewaybillRequest.request.url.endsWith('/shipments/{{awb}}/ewaybill'))
  assert(ewaybillRequest.request.body.raw.includes('{{invoiceNumber}}'))
  assert(ewaybillRequest.request.body.raw.includes('{{ewaybillNumber}}'))
  const pickupRequestItem = mutatingFolder.item.find(
    (request: any) => request.name === 'Create Pickup Request',
  )
  assert(pickupRequestItem.request.body.raw.includes('{{pickupDate}}'))
  assert(pickupRequestItem.request.body.raw.includes('{{pickupTime}}'))
  assert(pickupRequestItem.request.body.raw.includes('{{pickupPackageCount}}'))
  assert(JSON.stringify(pickupRequestItem.event).includes('pickup_request_id'))
  assert(JSON.stringify(pickupRequestItem.event).includes('already_exists'))
  const createWarehouseRequest = mutatingFolder.item.find(
    (request: any) => request.name === 'Create Warehouse',
  )
  assert(createWarehouseRequest.request.url.endsWith('/delhivery/b2c/warehouses'))
  assert(createWarehouseRequest.request.body.raw.includes('registered_name'))
  assert(createWarehouseRequest.request.body.raw.includes('return_address'))
  assert(createWarehouseRequest.request.body.raw.includes('return_pin'))
  assert(JSON.stringify(createWarehouseRequest.event).includes('warehouse_name'))
  assert(JSON.stringify(createWarehouseRequest.event).includes('provider_response'))
  const updateWarehouseRequest = mutatingFolder.item.find(
    (request: any) => request.name === 'Update Warehouse',
  )
  assert.equal(updateWarehouseRequest.request.method, 'PATCH')
  assert(updateWarehouseRequest.request.body.raw.includes('{{warehouseName}}'))
  assert(updateWarehouseRequest.request.body.raw.includes('address'))
  assert(updateWarehouseRequest.request.body.raw.includes('pin'))
  assert(updateWarehouseRequest.request.body.raw.includes('phone'))
  assert(JSON.stringify(updateWarehouseRequest.event).includes('updated_fields'))
  assert(JSON.stringify(updateWarehouseRequest.event).includes('provider_response'))

  console.log('Delhivery B2C integration checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
