import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Grid,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { FiPlus, FiTrash2 } from 'react-icons/fi'
import type { HydratedPickup } from '../../../types/generic.types'

type ManualReverseItemForm = {
  name: string
  sku: string
  qty: string
  price: string
  hsn: string
  discount: string
  tax_rate: string
}

type ManualReverseFormState = {
  order_number: string
  original_order_id: string
  integration_type: string
  order_amount: string
  shipping_charges: string
  package_weight: string
  package_length: string
  package_breadth: string
  package_height: string
  consignee: {
    name: string
    phone: string
    email: string
    address: string
    city: string
    state: string
    pincode: string
  }
  pickup: {
    warehouse_name: string
    name: string
    phone: string
    address: string
    city: string
    state: string
    pincode: string
  }
  items: ManualReverseItemForm[]
}

type ManualReversePayload = {
  original_order_id?: string
  order_number: string
  payment_type: 'reverse'
  order_amount: number
  order_date: string
  package_weight?: number
  package_length?: number
  package_breadth?: number
  package_height?: number
  shipping_charges: number
  freight_charges: number
  prepaid_amount: number
  is_rto_different: 'no'
  discount: number
  integration_type: string
  transaction_fee: number
  gift_wrap: number
  consignee: {
    name: string
    address: string
    city: string
    state: string
    pincode: string
    email: string
    phone: string
  }
  pickup: {
    warehouse_name: string
    address: string
    name: string
    phone: string
    city: string
    state: string
    pincode: string
  }
  order_items: {
    name: string
    sku: string
    qty: number
    price: number
    hsn: string
    discount: number
    tax_rate: number
  }[]
}

interface ManualReversePickupDialogProps {
  open: boolean
  onClose: () => void
  onSubmit: (payload: ManualReversePayload) => void
  isSubmitting?: boolean
  defaultPickup?: HydratedPickup | null
  defaultIntegrationType?: string
}

const SUPPORTED_INTEGRATIONS = [
  { label: 'Innofulfill', value: 'innofulfill' },
]

const createEmptyItem = (): ManualReverseItemForm => ({
  name: '',
  sku: '',
  qty: '1',
  price: '0',
  hsn: '',
  discount: '0',
  tax_rate: '0',
})

const buildInitialState = (
  defaultPickup?: HydratedPickup | null,
  defaultIntegrationType = 'delhivery',
): ManualReverseFormState => {
  const pickup = defaultPickup?.pickup

  return {
    order_number: '',
    original_order_id: '',
    integration_type: defaultIntegrationType || 'innofulfill',
    order_amount: '0',
    shipping_charges: '',
    package_weight: '',
    package_length: '',
    package_breadth: '',
    package_height: '',
    consignee: {
      name: '',
      phone: '',
      email: '',
      address: '',
      city: '',
      state: '',
      pincode: '',
    },
    pickup: {
      warehouse_name:
        pickup?.addressNickname || pickup?.contactName || defaultPickup?.pickup?.addressLine1 || '',
      name: pickup?.contactName || pickup?.addressNickname || '',
      phone: pickup?.contactPhone || '',
      address: pickup?.addressLine1 || '',
      city: pickup?.city || '',
      state: pickup?.state || '',
      pincode: pickup?.pincode || '',
    },
    items: [createEmptyItem()],
  }
}

const numberOrZero = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const numberOrUndefined = (value: string) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && value.trim() !== '' ? parsed : undefined
}

export default function ManualReversePickupDialog({
  open,
  onClose,
  onSubmit,
  isSubmitting = false,
  defaultPickup,
  defaultIntegrationType = 'delhivery',
}: ManualReversePickupDialogProps) {
  const initialState = useMemo(
    () => buildInitialState(defaultPickup, defaultIntegrationType),
    [defaultPickup, defaultIntegrationType],
  )
  const [form, setForm] = useState<ManualReverseFormState>(initialState)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setForm(buildInitialState(defaultPickup, defaultIntegrationType))
      setError(null)
    }
  }, [open, defaultPickup, defaultIntegrationType])

  const updateConsignee = (field: keyof ManualReverseFormState['consignee'], value: string) => {
    setForm((prev) => ({
      ...prev,
      consignee: {
        ...prev.consignee,
        [field]: value,
      },
    }))
  }

  const updatePickup = (field: keyof ManualReverseFormState['pickup'], value: string) => {
    setForm((prev) => ({
      ...prev,
      pickup: {
        ...prev.pickup,
        [field]: value,
      },
    }))
  }

  const updateItem = (index: number, field: keyof ManualReverseItemForm, value: string) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item,
      ),
    }))
  }

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, createEmptyItem()],
    }))
  }

  const removeItem = (index: number) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((_, itemIndex) => itemIndex !== index) : prev.items,
    }))
  }

  const handleClose = () => {
    if (isSubmitting) return
    setError(null)
    onClose()
  }

  const handleSubmit = () => {
    const orderNumber = form.order_number.trim()
    const originalOrderId = form.original_order_id.trim()
    const shippingCharges = numberOrZero(form.shipping_charges)
    const items = form.items
      .map((item) => ({
        name: item.name.trim(),
        sku: item.sku.trim(),
        qty: numberOrZero(item.qty),
        price: numberOrZero(item.price),
        hsn: item.hsn.trim(),
        discount: numberOrZero(item.discount),
        tax_rate: numberOrZero(item.tax_rate),
      }))
      .filter((item) => item.name.length > 0)

    if (!orderNumber) {
      setError('Order number is required.')
      return
    }

    if (!items.length) {
      setError('Add at least one order item.')
      return
    }

    const invalidItem = items.find((item) => item.qty <= 0 || item.price < 0)
    if (invalidItem) {
      setError('Each order item must have quantity greater than zero and a valid price.')
      return
    }

    if (!originalOrderId && shippingCharges <= 0) {
      setError('Provide either an original order ID for auto-quote or a manual shipping charge.')
      return
    }

    if (shippingCharges < 0) {
      setError('Shipping charges cannot be negative.')
      return
    }

    const requiredConsigneeFields = ['name', 'phone', 'address', 'city', 'state', 'pincode'] as const
    const missingConsignee = requiredConsigneeFields.find((field) => !form.consignee[field].trim())
    if (missingConsignee) {
      setError(`Consignee ${missingConsignee} is required.`)
      return
    }

    const requiredPickupFields = ['warehouse_name', 'name', 'phone', 'address', 'city', 'state', 'pincode'] as const
    const missingPickup = requiredPickupFields.find((field) => !form.pickup[field].trim())
    if (missingPickup) {
      setError(`Pickup ${missingPickup} is required.`)
      return
    }

    if (!form.integration_type.trim()) {
      setError('Select a courier integration.')
      return
    }

    const payload: ManualReversePayload = {
      original_order_id: originalOrderId || undefined,
      order_number: orderNumber,
      payment_type: 'reverse',
      order_amount: numberOrZero(form.order_amount),
      order_date: new Date().toISOString(),
      package_weight: numberOrUndefined(form.package_weight),
      package_length: numberOrUndefined(form.package_length),
      package_breadth: numberOrUndefined(form.package_breadth),
      package_height: numberOrUndefined(form.package_height),
      shipping_charges: shippingCharges,
      freight_charges: shippingCharges,
      prepaid_amount: 0,
      is_rto_different: 'no',
      discount: 0,
      integration_type: form.integration_type.trim(),
      transaction_fee: 0,
      gift_wrap: 0,
      consignee: {
        name: form.consignee.name.trim(),
        address: form.consignee.address.trim(),
        city: form.consignee.city.trim(),
        state: form.consignee.state.trim(),
        pincode: form.consignee.pincode.trim(),
        email: form.consignee.email.trim(),
        phone: form.consignee.phone.trim(),
      },
      pickup: {
        warehouse_name: form.pickup.warehouse_name.trim(),
        address: form.pickup.address.trim(),
        name: form.pickup.name.trim(),
        phone: form.pickup.phone.trim(),
        city: form.pickup.city.trim(),
        state: form.pickup.state.trim(),
        pincode: form.pickup.pincode.trim(),
      },
      order_items: items,
    }

    setError(null)
    onSubmit(payload)
  }

  return (
    <Dialog open={open} onClose={handleClose} fullWidth maxWidth="lg">
      <DialogTitle>Manual Reverse Pickup</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5} sx={{ pt: 1 }}>
          <Alert severity="info" sx={{ borderRadius: 2 }}>
            Use this form when the delivered order is not available in the table. If you provide
            an original order ID, the backend will try to auto-quote the reverse charge. Otherwise,
            enter a manual shipping charge.
          </Alert>

          {error ? (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {error}
            </Alert>
          ) : null}

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
              Order Details
            </Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Order Number"
                  value={form.order_number}
                  onChange={(e) => setForm((prev) => ({ ...prev, order_number: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Original Order ID"
                  value={form.original_order_id}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, original_order_id: e.target.value }))
                  }
                  helperText="Optional, but recommended for automatic reverse quote."
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  select
                  label="Integration Type"
                  value={form.integration_type}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, integration_type: e.target.value }))
                  }
                >
                  {SUPPORTED_INTEGRATIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Order Amount"
                  type="number"
                  value={form.order_amount}
                  onChange={(e) => setForm((prev) => ({ ...prev, order_amount: e.target.value }))}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Shipping Charges"
                  type="number"
                  value={form.shipping_charges}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, shipping_charges: e.target.value }))
                  }
                  helperText="Required when no original order ID is provided."
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Package Weight"
                  type="number"
                  value={form.package_weight}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, package_weight: e.target.value }))
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Length"
                  type="number"
                  value={form.package_length}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, package_length: e.target.value }))
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Breadth"
                  type="number"
                  value={form.package_breadth}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, package_breadth: e.target.value }))
                  }
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="Height"
                  type="number"
                  value={form.package_height}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, package_height: e.target.value }))
                  }
                />
              </Grid>
            </Grid>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
              Consignee Details
            </Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Customer Name"
                  value={form.consignee.name}
                  onChange={(e) => updateConsignee('name', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Phone"
                  value={form.consignee.phone}
                  onChange={(e) => updateConsignee('phone', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Email"
                  value={form.consignee.email}
                  onChange={(e) => updateConsignee('email', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Pincode"
                  value={form.consignee.pincode}
                  onChange={(e) => updateConsignee('pincode', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Address"
                  value={form.consignee.address}
                  onChange={(e) => updateConsignee('address', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="City"
                  value={form.consignee.city}
                  onChange={(e) => updateConsignee('city', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="State"
                  value={form.consignee.state}
                  onChange={(e) => updateConsignee('state', e.target.value)}
                />
              </Grid>
            </Grid>
          </Box>

          <Divider />

          <Box>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
              Pickup Details
            </Typography>
            <Grid container spacing={1.5}>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Warehouse Name"
                  value={form.pickup.warehouse_name}
                  onChange={(e) => updatePickup('warehouse_name', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Contact Name"
                  value={form.pickup.name}
                  onChange={(e) => updatePickup('name', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Phone"
                  value={form.pickup.phone}
                  onChange={(e) => updatePickup('phone', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField
                  fullWidth
                  label="Pincode"
                  value={form.pickup.pincode}
                  onChange={(e) => updatePickup('pincode', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12 }}>
                <TextField
                  fullWidth
                  label="Address"
                  value={form.pickup.address}
                  onChange={(e) => updatePickup('address', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="City"
                  value={form.pickup.city}
                  onChange={(e) => updatePickup('city', e.target.value)}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField
                  fullWidth
                  label="State"
                  value={form.pickup.state}
                  onChange={(e) => updatePickup('state', e.target.value)}
                />
              </Grid>
            </Grid>
          </Box>

          <Divider />

          <Box>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
                Order Items
              </Typography>
              <Button startIcon={<FiPlus />} variant="outlined" onClick={addItem}>
                Add Item
              </Button>
            </Stack>

            <Stack spacing={1.5}>
              {form.items.map((item, index) => (
                <Box
                  key={`reverse-item-${index}`}
                  sx={{
                    border: '1px solid',
                    borderColor: 'divider',
                    borderRadius: 2,
                    p: 1.5,
                    bgcolor: 'background.paper',
                  }}
                >
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 800 }}>
                      Item {index + 1}
                    </Typography>
                    <IconButton
                      size="small"
                      onClick={() => removeItem(index)}
                      disabled={form.items.length === 1}
                    >
                      <FiTrash2 />
                    </IconButton>
                  </Stack>

                  <Grid container spacing={1.25}>
                    <Grid size={{ xs: 12, md: 4 }}>
                      <TextField
                        fullWidth
                        label="Name"
                        value={item.name}
                        onChange={(e) => updateItem(index, 'name', e.target.value)}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 2 }}>
                      <TextField
                        fullWidth
                        label="SKU"
                        value={item.sku}
                        onChange={(e) => updateItem(index, 'sku', e.target.value)}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 2 }}>
                      <TextField
                        fullWidth
                        label="Qty"
                        type="number"
                        value={item.qty}
                        onChange={(e) => updateItem(index, 'qty', e.target.value)}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 2 }}>
                      <TextField
                        fullWidth
                        label="Price"
                        type="number"
                        value={item.price}
                        onChange={(e) => updateItem(index, 'price', e.target.value)}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 2 }}>
                      <TextField
                        fullWidth
                        label="HSN"
                        value={item.hsn}
                        onChange={(e) => updateItem(index, 'hsn', e.target.value)}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <TextField
                        fullWidth
                        label="Discount"
                        type="number"
                        value={item.discount}
                        onChange={(e) => updateItem(index, 'discount', e.target.value)}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <TextField
                        fullWidth
                        label="Tax Rate"
                        type="number"
                        value={item.tax_rate}
                        onChange={(e) => updateItem(index, 'tax_rate', e.target.value)}
                      />
                    </Grid>
                  </Grid>
                </Box>
              ))}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Creating...' : 'Create Reverse Pickup'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
