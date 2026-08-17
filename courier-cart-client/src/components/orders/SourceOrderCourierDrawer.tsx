import { Box, Button, Divider, Stack, Typography } from '@mui/material'
import { FormProvider, useFieldArray, useForm } from 'react-hook-form'
import { useEffect } from 'react'
import { fetchAvailableCouriers } from '../../api/courier'
import { useBookExistingB2COrderCourier } from '../../hooks/Orders/useOrders'
import { toast } from '../UI/Toast'
import CustomDrawer from '../UI/drawer/CustomDrawer'
import DeliveryDetailsForm from './DeliveryDetailsForm'
import PickupLocationForm from './PickupLocationForm'
import { SelectCourierForm } from './SelectCourierForm'
import type { B2CFormData, Product } from './b2c/B2COrderForm'
import PackageDetailsForm from './b2c/PackageDetailsForm'
import PackageDimensionsForm from './b2c/PackageDimensionsForm'

type SourceOrderCourierDrawerProps = {
  open: boolean
  order: Record<string, any> | null
  onClose: () => void
}

const normalizeProducts = (value: unknown): Product[] => {
  const raw = (() => {
    if (Array.isArray(value)) return value
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  })()

  const products = raw.map((item: any) => ({
    productName: item?.productName ?? item?.name ?? item?.title ?? 'Product',
    price: Number(item?.price ?? 0),
    quantity: Number(item?.quantity ?? item?.qty ?? 1) || 1,
    discount: Number(item?.discount ?? 0),
    taxRate: Number(item?.taxRate ?? item?.tax_rate ?? 0),
    hsnCode: item?.hsnCode ?? item?.hsn ?? '',
    sku: item?.sku ?? 'NA',
  }))

  return products.length ? products : [{ productName: 'Product', price: 0, quantity: 1 }]
}

const getProductsSubtotal = (products: Product[], fallback: unknown) => {
  const subtotal = products.reduce(
    (sum, product) =>
      sum +
      Number(product.price ?? 0) * Number(product.quantity ?? 1) -
      Number(product.discount ?? 0),
    0,
  )
  return subtotal > 0 ? subtotal : Number(fallback ?? 0)
}

const buildDefaultValues = (order: Record<string, any> | null): B2CFormData => {
  const products = normalizeProducts(order?.products)
  const subtotal = getProductsSubtotal(products, order?.order_amount)
  const orderType = String(order?.order_type || '').toLowerCase() === 'cod' ? 'cod' : 'prepaid'

  return {
    buyerName: order?.buyer_name || '',
    buyerPhone: order?.buyer_phone || '',
    buyerEmail: order?.buyer_email || '',
    address: order?.address || '',
    pincode: order?.pincode || '',
    city: order?.city || '',
    state: order?.state || '',
    country: order?.country || 'India',
    products,
    weight: Number(order?.weight ?? 0),
    length: Number(order?.length ?? 10),
    breadth: Number(order?.breadth ?? 10),
    height: Number(order?.height ?? 10),
    orderId: order?.order_number || '',
    orderDate: order?.order_date || new Date().toISOString().slice(0, 10),
    orderType,
    courierPartner: '',
    courierPartnerId: '',
    courierOptionKey: '',
    shippingCharges: Number(order?.shipping_charges ?? 0),
    transactionFee: Number(order?.transaction_fee ?? 0),
    giftWrap: Number(order?.gift_wrap ?? 0),
    discount: Number(order?.discount ?? 0),
    prepaidAmount: Number(order?.prepaid_amount ?? (orderType === 'prepaid' ? subtotal : 0)),
    courierCod: 0,
    otherCharges: 0,
    forwardCharges: 0,
    courierCost: null,
    isRtoSame: true,
    orderAmount: subtotal,
    pickupDate: new Date().toISOString().slice(0, 10),
    pickupTime: '10:00',
    selectedRateCardId: null,
    selectedMaxSlabWeight: null,
    amazonRequestToken: null,
    amazonRateId: null,
    amazonServiceId: null,
    amazonCarrierId: null,
  }
}

export default function SourceOrderCourierDrawer({
  open,
  order,
  onClose,
}: SourceOrderCourierDrawerProps) {
  const methods = useForm<B2CFormData>({
    defaultValues: buildDefaultValues(order),
  })
  const { control, handleSubmit, reset, setError, setValue } = methods
  const { fields, append, remove } = useFieldArray({ control, name: 'products' })
  const bookCourier = useBookExistingB2COrderCourier(onClose)

  useEffect(() => {
    if (open) {
      reset(buildDefaultValues(order))
    }
  }, [open, order, reset])

  const onSubmit = async (data: B2CFormData) => {
    if (!order?.id) return
    if (!data.courierPartnerId) {
      setError('courierPartnerId', {
        type: 'manual',
        message: 'Please select a courier partner',
      })
      return
    }

    const normalizedProducts = (data.products ?? []).map((product, index) => ({
      name: String(product.productName || '').trim() || `Product ${index + 1}`,
      sku: String(product.sku || '').trim() || 'NA',
      qty: Math.max(1, Number(product.quantity ?? 1) || 1),
      price: Math.max(0, Number(product.price ?? 0) || 0),
      hsn: String(product.hsnCode || '').trim(),
      discount: Math.max(0, Number(product.discount ?? 0) || 0),
      tax_rate: Math.max(0, Number(product.taxRate ?? 0) || 0),
    }))
    const subtotal = getProductsSubtotal(data.products ?? [], order?.order_amount)

    let amazonRequestToken = data.amazonRequestToken ?? undefined
    let amazonRateId = data.amazonRateId ?? undefined
    let amazonServiceId = data.amazonServiceId ?? undefined
    let amazonCarrierId = data.amazonCarrierId ?? undefined

    if (data.integrationType === 'amazon' && (!amazonRequestToken || !amazonRateId)) {
      try {
        const refreshedCouriers = await fetchAvailableCouriers({
          origin: data.pickupLocationPincode,
          destination: data.pincode,
          pickupId: data.pickupLocationId,
          pickupName: data.pickupLocationName,
          pickupAddress: data.pickupAddress,
          pickupCity: data.pickupCity,
          pickupState: data.pickupState,
          deliveryName: data.buyerName,
          deliveryPhone: data.buyerPhone,
          deliveryAddress: data.address,
          deliveryCity: data.city,
          deliveryState: data.state,
          payment_type: data.orderType,
          order_amount: data.orderAmount,
          cod: data.orderType === 'cod' ? 1 : 0,
          weight: data.weight,
          length: data.length,
          breadth: data.breadth,
          height: data.height,
          shipment_type: 'b2c',
          context: 'shipment_courier_selection',
        })

        const selectedCourierOptionKey = String(data.courierOptionKey ?? '')
        const selectedCourierId = String(data.courierPartnerId ?? '')
        const refreshedAmazonCourier = refreshedCouriers.find((courier) => {
          const isAmazon =
            String(courier?.integration_type || '').trim().toLowerCase() === 'amazon'
          if (!isAmazon || !courier?.amazon_request_token || !courier?.amazon_rate_id) {
            return false
          }

          const courierOptionKey = String(
            courier?.courier_option_key ?? courier?.id ?? courier?.courier_id ?? '',
          )
          return selectedCourierOptionKey
            ? courierOptionKey === selectedCourierOptionKey
            : String(courier?.id ?? courier?.courier_id ?? '') === selectedCourierId
        })

        if (refreshedAmazonCourier) {
          amazonRequestToken = refreshedAmazonCourier.amazon_request_token
          amazonRateId = refreshedAmazonCourier.amazon_rate_id
          amazonServiceId = refreshedAmazonCourier.amazon_service_id ?? amazonServiceId
          amazonCarrierId = refreshedAmazonCourier.amazon_carrier_id ?? amazonCarrierId

          setValue('amazonRequestToken', amazonRequestToken)
          setValue('amazonRateId', amazonRateId)
          setValue('amazonServiceId', amazonServiceId ?? null)
          setValue('amazonCarrierId', amazonCarrierId ?? null)
        }
      } catch (error) {
        console.error('Failed to refresh Amazon rate token before booking:', error)
      }

      if (!amazonRequestToken || !amazonRateId) {
        const message = 'Amazon live rate is not available right now. Refresh courier rates and try again.'
        setError('courierPartnerId', { type: 'manual', message })
        toast.open({ message, severity: 'error' })
        return
      }
    }

    bookCourier.mutate({
      orderId: String(order.id),
      data: {
        payment_type: data.orderType,
        package_weight: Number(data.weight),
        package_length: Number(data.length),
        package_breadth: Number(data.breadth),
        package_height: Number(data.height),
        order_amount: subtotal,
        shipping_charges: Number(data.shippingCharges ?? 0),
        freight_charges: Number(data.forwardCharges ?? 0),
        courier_cost: data.courierCost ? Number(data.courierCost) : undefined,
        prepaid_amount: Number(data.prepaidAmount ?? 0),
        cod_charges: Number(data.courierCod ?? 0),
        other_charges: Number(data.otherCharges ?? 0),
        discount: Number(data.discount ?? 0),
        transaction_fee: Number(data.transactionFee ?? 0),
        gift_wrap: Number(data.giftWrap ?? 0),
        integration_type: data.integrationType,
        courier_id: Number(data.courierPartnerId),
        courier_partner: data.courierPartner,
        courier_option_key: data.courierOptionKey,
        selected_rate_card_id: data.selectedRateCardId ?? undefined,
        amazon_request_token: amazonRequestToken,
        amazon_rate_id: amazonRateId,
        amazon_service_id: amazonServiceId,
        amazon_carrier_id: amazonCarrierId,
        shadowfax_forward_mode: data.shadowfaxForwardMode,
        shadowfax_service_mode: data.shadowfaxServiceMode,
        selected_max_slab_weight:
          data.selectedMaxSlabWeight !== undefined && data.selectedMaxSlabWeight !== null
            ? Number(data.selectedMaxSlabWeight)
            : undefined,
        pickup_location_id: data.pickupLocationId,
        pickup_date: data.pickupDate,
        pickup_time: data.pickupTime,
        consignee: {
          name: data.buyerName,
          phone: data.buyerPhone,
          email: data.buyerEmail || undefined,
          address: data.address,
          city: data.city,
          state: data.state,
          pincode: data.pincode,
        },
        pickup: {
          warehouse_name: data.pickupLocationName ?? '',
          address: data.pickupAddress ?? '',
          name: data.pickupLocationPOCName ?? '',
          phone: data.pickupLocationPOCPhone ?? '',
          city: data.pickupCity ?? '',
          state: data.pickupState ?? '',
          pincode: data.pickupLocationPincode ?? '',
          pickup_date: data.pickupDate,
          pickup_time: data.pickupTime,
        },
        is_rto_different: data.isRtoSame ? 'no' : 'yes',
        ...(!data.isRtoSame && {
          rto: {
            warehouse_name: data.rtoLocationName ?? '',
            address: data.rtoAddress ?? '',
            name: data.rtoLocationPOCName ?? '',
            phone: data.rtoLocationPOCPhone ?? '',
            city: data.rtoCity ?? '',
            state: data.rtoState ?? '',
            pincode: data.rtoLocationPincode ?? '',
          },
        }),
        delivery_location: data.zone,
        zone_id: data.zoneId,
        chargedWeight: data.chargeableWeight ?? undefined,
        volumetricWeight: data.volumetricWeight ?? undefined,
        order_items: normalizedProducts,
      },
    })
  }

  return (
    <CustomDrawer
      open={open}
      onClose={onClose}
      title={order?.order_number ? `Select courier for ${order.order_number}` : 'Select courier'}
      width="100vw"
    >
      <FormProvider {...methods}>
        <Box component="form" onSubmit={handleSubmit(onSubmit)}>
          <Stack spacing={2}>
            <DeliveryDetailsForm type="b2c" allowResolvedLocationEdit />
            <Divider />
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>
                Product Details
              </Typography>
              <PackageDetailsForm
                control={control}
                fields={fields}
                remove={remove}
                append={append}
              />
            </Box>
            <Divider />
            <PickupLocationForm compact />
            <Divider />
            <PackageDimensionsForm />
            <Divider />
            <SelectCourierForm shipment_type="b2c" />

            <Stack direction="row" justifyContent="flex-end" spacing={1.2}>
              <Button onClick={onClose} disabled={bookCourier.isPending}>
                Cancel
              </Button>
              <Button type="submit" variant="contained" disabled={bookCourier.isPending}>
                {bookCourier.isPending ? 'Booking...' : 'Book Courier'}
              </Button>
            </Stack>
          </Stack>
        </Box>
      </FormProvider>
    </CustomDrawer>
  )
}
