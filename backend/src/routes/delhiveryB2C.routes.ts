import { Router } from 'express'
import {
  cancelShipmentController,
  createPickupController,
  createReverseShipmentController,
  createShipmentController,
  createWarehouseController,
  downloadDocumentController,
  fetchWaybillsController,
  fetchSingleWaybillController,
  generateLabelController,
  heavyServiceabilityController,
  ndrStatusController,
  serviceabilityController,
  shippingCostController,
  submitNdrActionController,
  tatController,
  trackShipmentController,
  trackShipmentsController,
  updateEwaybillController,
  updateShipmentController,
  updateWarehouseController,
} from '../controllers/delhiveryB2C.controller'
import { isAdminMiddleware } from '../middlewares/isAdmin'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

router.use(requireAuth, isAdminMiddleware)

router.get('/serviceability/heavy/:pincode', heavyServiceabilityController)
router.get('/serviceability/:pincode', serviceabilityController)
router.get('/tat', tatController)
router.get('/shipping-cost', shippingCostController)
router.get('/tracking', trackShipmentsController)
router.get('/waybills/single', fetchSingleWaybillController)
router.get('/waybills', fetchWaybillsController)
router.post('/warehouses', createWarehouseController)
router.patch('/warehouses', updateWarehouseController)
router.post('/shipments', createShipmentController)
router.patch('/shipments/:awb', updateShipmentController)
router.delete('/shipments/:awb', cancelShipmentController)
router.put('/shipments/:awb/ewaybill', updateEwaybillController)
router.get('/shipments/:awb/tracking', trackShipmentController)
router.get('/shipments/:awb/label', generateLabelController)
router.get('/shipments/:awb/documents', downloadDocumentController)
router.post('/pickups', createPickupController)
router.post('/reverse-shipments', createReverseShipmentController)
router.post('/ndr/actions', submitNdrActionController)
router.get('/ndr/status/:uplId', ndrStatusController)

export default router
