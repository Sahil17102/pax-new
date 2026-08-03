import { Request, Response } from 'express'
import { ShipmentParams } from '../models/services/shiprocket.service'
import {
  DelhiveryService,
  DelhiveryProductType,
  DelhiveryShippingCostParams,
  DelhiveryTransportMode,
  summarizeDelhiveryExpectedTat,
  summarizeDelhiveryHeavyPincodeServiceability,
  summarizeDelhiveryPincodeServiceability,
} from '../models/services/couriers/delhivery.service'

const service = new DelhiveryService()

const sendResult = async (res: Response, action: Promise<unknown>) => {
  try {
    const data = await action
    return res.json({ success: true, data })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      message: error?.message || 'Delhivery B2C request failed',
    })
  }
}

const parseBoolean = (value: unknown, defaultValue = true) => {
  if (value === undefined || value === null || value === '') return defaultValue
  return String(value).trim().toLowerCase() === 'true'
}

const parseQueryList = (value: unknown): string | string[] | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  return Array.isArray(value) ? value.map(String) : String(value)
}

const parseOptionalNumber = (value: unknown): number | undefined =>
  value === undefined || value === null || value === '' ? undefined : Number(value)

export const serviceabilityController = async (req: Request, res: Response) => {
  try {
    const providerResponse = await service.checkServiceability(req.params.pincode)
    return res.json({
      success: true,
      data: {
        ...summarizeDelhiveryPincodeServiceability(providerResponse),
        provider_response: providerResponse,
      },
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      message: error?.message || 'Delhivery B2C serviceability request failed',
    })
  }
}

export const heavyServiceabilityController = async (req: Request, res: Response) => {
  try {
    const providerResponse = await service.checkHeavyServiceability(req.params.pincode, 'Heavy')
    return res.json({
      success: true,
      data: {
        ...summarizeDelhiveryHeavyPincodeServiceability(providerResponse),
        provider_response: providerResponse,
      },
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      message: error?.message || 'Delhivery Heavy serviceability request failed',
    })
  }
}

export const tatController = async (req: Request, res: Response) => {
  try {
    const originPincode = String(req.query.origin_pin || '')
    const destinationPincode = String(req.query.destination_pin || '')
    const mode = String(req.query.mot || req.query.mode || 'S').trim().toUpperCase()
    const productType = String(req.query.pdt ?? 'B2C').trim().toUpperCase()
    const expectedPickupDate = String(req.query.expected_pickup_date || '').trim()
    const providerResponse = await service.getExpectedTATDetails(
      originPincode,
      destinationPincode,
      mode as DelhiveryTransportMode,
      productType as DelhiveryProductType,
      expectedPickupDate || undefined,
    )

    return res.json({
      success: true,
      data: {
        ...summarizeDelhiveryExpectedTat(providerResponse, {
          originPincode,
          destinationPincode,
          mode: mode as DelhiveryTransportMode,
          productType: (productType || '') as DelhiveryProductType,
          expectedPickupDate: expectedPickupDate || undefined,
        }),
        provider_response: providerResponse,
      },
    })
  } catch (error: any) {
    const statusCode = Number(error?.statusCode || error?.response?.status || 500)
    return res.status(statusCode >= 400 && statusCode < 600 ? statusCode : 500).json({
      success: false,
      message: error?.message || 'Delhivery Expected TAT request failed',
    })
  }
}

export const shippingCostController = (req: Request, res: Response) => {
  const params: DelhiveryShippingCostParams = {
    originPincode: String(req.query.o_pin ?? req.query.origin_pin ?? ''),
    destinationPincode: String(req.query.d_pin ?? req.query.destination_pin ?? ''),
    weightGrams: Number(req.query.cgm ?? req.query.weight_g),
    mode: String(req.query.md ?? req.query.mode ?? '').trim().toUpperCase() as 'S' | 'E',
    status: String(req.query.ss ?? req.query.status ?? '').trim() as
      | 'Delivered'
      | 'RTO'
      | 'DTO',
    paymentType: String(req.query.pt ?? req.query.payment_type ?? '').trim() as
      | 'Pre-paid'
      | 'COD',
    length: parseOptionalNumber(req.query.l ?? req.query.length),
    breadth: parseOptionalNumber(req.query.b ?? req.query.breadth),
    height: parseOptionalNumber(req.query.h ?? req.query.height),
    packageType: String(req.query.ipkg_type ?? req.query.package_type ?? '').trim() as
      | 'box'
      | 'flyer',
  }
  return sendResult(res, service.calculateShippingCost(params))
}

export const fetchWaybillsController = (req: Request, res: Response) => {
  const count = Number(req.query.count || 1)
  if (!Number.isInteger(count) || count < 1 || count > 10000) {
    return res.status(400).json({
      success: false,
      message: 'count must be an integer between 1 and 10000',
    })
  }
  return sendResult(res, service.fetchWaybills(count))
}

export const fetchSingleWaybillController = (_req: Request, res: Response) =>
  sendResult(res, service.fetchSingleWaybill())

export const createWarehouseController = (req: Request, res: Response) =>
  sendResult(res, service.createWarehouse(req.body || {}))

export const updateWarehouseController = (req: Request, res: Response) =>
  sendResult(res, service.updateWarehouse(req.body || {}))

export const createShipmentController = (req: Request, res: Response) => {
  const { waybill, ...shipment } = req.body || {}
  return sendResult(
    res,
    service.createShipment(shipment as ShipmentParams, waybill ? String(waybill) : undefined),
  )
}

export const updateShipmentController = (req: Request, res: Response) =>
  sendResult(res, service.updateShipment(req.params.awb, req.body || {}))

export const cancelShipmentController = (req: Request, res: Response) =>
  sendResult(
    res,
    service.cancelShipment(req.params.awb, {
      current_payment_mode: req.query.current_payment_mode
        ? String(req.query.current_payment_mode)
        : undefined,
      current_status: req.query.current_status ? String(req.query.current_status) : undefined,
    }),
  )

export const updateEwaybillController = (req: Request, res: Response) =>
  sendResult(res, service.updateEwaybill(req.params.awb, req.body || {}))

export const trackShipmentsController = (req: Request, res: Response) =>
  sendResult(
    res,
    service.trackShipments(
      parseQueryList(req.query.waybill),
      parseQueryList(req.query.ref_ids),
    ),
  )

export const trackShipmentController = (req: Request, res: Response) =>
  sendResult(
    res,
    service.trackShipment(req.params.awb, parseQueryList(req.query.ref_ids)),
  )

export const generateLabelController = (req: Request, res: Response) =>
  sendResult(
    res,
    service.generateLabel(req.params.awb, {
      pdf: req.query.pdf === undefined ? undefined : String(req.query.pdf),
      pdfSize: String(req.query.pdf_size ?? req.query.size ?? ''),
      format: String(req.query.format ?? ''),
    }),
  )

export const downloadDocumentController = (req: Request, res: Response) =>
  sendResult(
    res,
    service.downloadDocument(req.params.awb, String(req.query.doc_type || '')),
  )

export const createPickupController = (req: Request, res: Response) =>
  sendResult(res, service.createPickupRequest(req.body || {}))

export const createReverseShipmentController = (req: Request, res: Response) =>
  sendResult(res, service.createReverseShipment(req.body || {}))

export const submitNdrActionController = (req: Request, res: Response) => {
  const actions = Array.isArray(req.body?.actions) ? req.body.actions : []
  if (actions.length === 0 || actions.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'actions must contain between 1 and 100 entries',
    })
  }
  return sendResult(res, service.submitNdrAction(actions))
}

export const ndrStatusController = (req: Request, res: Response) =>
  sendResult(res, service.getNdrStatus(req.params.uplId, parseBoolean(req.query.verbose)))
