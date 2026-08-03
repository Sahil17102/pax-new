import assert from 'assert'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

const run = async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test'
  const {
    DelhiveryService,
    summarizeDelhiveryHeavyPincodeServiceability,
    summarizeDelhiveryPincodeServiceability,
  } = await import('../models/services/couriers/delhivery.service')

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

  const originalGet = axios.get
  const originalPost = axios.post
  const captured: Array<{ method: string; url: string; data?: unknown; headers?: any }> = []
  ;(axios as any).get = async (url: string, config: any) => {
    captured.push({ method: 'GET', url, headers: config?.headers })
    return {
      status: 200,
      data: url.includes('/fetch/serviceability/pincode')
        ? { data: { pincode: 400086, status: 'Serviceable', payment_type: ['Pre-paid', 'COD'] } }
        : url.includes('/pin-codes/')
          ? { delivery_codes: [{ postal_code: { pin: 194103, pickup: 'Y', pre_paid: 'Y', cod: 'N', remark: '' } }] }
          : [{ total_amount: 75 }],
    }
  }
  ;(axios as any).post = async (url: string, data: unknown, config: any) => {
    captured.push({ method: 'POST', url, data, headers: config?.headers })
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

  await mockedService.calculateShippingCost({
    originPincode: '122001',
    destinationPincode: '400093',
    weightGrams: 500,
  })
  assert(captured.at(-1)?.url.includes('/api/kinko/v1/invoice/charges/.json?'))
  assert(captured.at(-1)?.url.includes('o_pin=122001'))
  assert(captured.at(-1)?.url.includes('d_pin=400093'))
  assert(captured.at(-1)?.url.includes('cgm=500'))

  await mockedService.updateShipment('TEST-AWB', { phone: '919999999999' })
  assert.equal(captured.at(-1)?.url, 'https://staging-express.delhivery.com/api/p/edit')
  assert.deepEqual(captured.at(-1)?.data, { waybill: 'TEST-AWB', phone: '9999999999' })

  ;(axios as any).get = originalGet
  ;(axios as any).post = originalPost

  const service = new DelhiveryService()
  await assert.rejects(() => service.checkServiceability('19410'), /6-digit/)
  await assert.rejects(() => service.checkHeavyServiceability('40008'), /6-digit/)
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
  const mutatingFolder = collection.item.find(
    (folder: any) => folder.name === 'Mutating lifecycle requests',
  )
  assert(mutatingFolder, 'Mutating lifecycle folder must exist')
  assert(
    JSON.stringify(mutatingFolder.event).includes('pm.execution.skipRequest'),
    'Mutating collection requests must be locked by default',
  )

  console.log('Delhivery B2C integration checks passed')
}

run().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
