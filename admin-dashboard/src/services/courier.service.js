import api from './axios' // your pre-configured axios instance

const normalizeArrayPayload = (payload) => {
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload?.data)) return payload.data
  if (Array.isArray(payload?.couriers)) return payload.couriers
  if (Array.isArray(payload?.rates)) return payload.rates
  if (Array.isArray(payload?.items)) return payload.items
  return []
}

export const fetchShippingRates = async (filters = {}) => {
  const params = {}
  if (filters.courier_name) params.courier_name = filters.courier_name
  if (filters.mode) params.mode = filters.mode
  if (filters.min_weight !== undefined && filters.businessType?.toLowerCase() !== 'b2c') {
    params.min_weight = filters.min_weight
  }
  if (filters.businessType) params.businessType = filters.businessType
  if (filters.planId) params.planId = filters.planId
  const response = await api.get('/admin/couriers/shipping-rates', { params })
  return normalizeArrayPayload(response.data)
}

export const fetchAvailableCouriers = async (params) => {
  try {
    const res = await api.post('/admin/couriers/available', {
      ...params,
      shipment_type: params.shipment_type ?? 'b2c',
    })

    if (!res.data.success) {
      throw new Error(res.data.error || 'Failed to fetch couriers')
    }

    return res.data.data
  } catch (error) {
    console.error('fetchAvailableCouriers error:', error.response?.data || error.message)
    throw new Error(error.response?.data?.error || error.message || 'Failed to fetch couriers')
  }
}

export const fetchAllCouriers = async () => {
  const res = await api.get(`/admin/couriers/list`)
  if (!res.data?.success) throw new Error('Failed to fetch couriers')
  return normalizeArrayPayload(res.data) // returns an array of courier names
}

export const fetchAllCouriersList = async (filters = {}) => {
  const params = {}
  if (filters.search) params.search = filters.search
  if (filters.serviceProvider) params.serviceProvider = filters.serviceProvider
  if (filters.businessType) params.businessType = filters.businessType

  const res = await api.get(`/couriers/full-list`, { params })
  if (!res.data?.success) throw new Error('Failed to fetch couriers')
  return normalizeArrayPayload(res.data) // returns an array of courier objects
}

export const createCourier = async (payload) => {
  const { data } = await api.post(`/couriers/create`, payload)
  return data
}
export const deleteCourier = async ({ id, serviceProvider }) => {
  const { data } = await api.delete(`/couriers/delete/${id}`, {
    data: { serviceProvider },
  })
  return data
}

export const updateCourierStatus = async ({ id, serviceProvider, isEnabled, businessType }) => {
  const { data } = await api.patch(`/couriers/status/${id}`, {
    serviceProvider,
    isEnabled,
    businessType, // Optional: array of ['b2c'], ['b2b'], or ['b2c', 'b2b']
  })
  return data
}

export const fetchServiceProviders = async () => {
  const { data } = await api.get(`/couriers/providers`)
  if (!data?.success) throw new Error('Failed to fetch service providers')
  return data.data
}

export const updateServiceProviderStatus = async ({ serviceProvider, isEnabled }) => {
  const { data } = await api.patch(`/couriers/providers/${serviceProvider}`, {
    isEnabled,
  })
  return data
}

export const updateShippingRate = async (id, updates, planId) => {
  const { data } = await api.put(`/admin/couriers/shipping-rate/${id}/${planId}`, updates)
  return data
}

export const uploadShippingRates = async ({ file, planId, businessType, targetCourier }) => {
  if (!file) throw new Error('No file provided for import')

  const formData = new FormData()
  formData.append('file', file?.file) // must be File or Blob
  const params = new URLSearchParams()
  if (planId) {
    params.set('planId', planId)
    params.set('plan_id', planId)
  }
  if (businessType) {
    const normalizedBusinessType = businessType.toLowerCase()
    params.set('businessType', normalizedBusinessType)
    params.set('business_type', normalizedBusinessType)
  }
  if (targetCourier?.courierId) {
    params.set('targetCourierId', String(targetCourier.courierId))
    params.set('target_courier_id', String(targetCourier.courierId))
  }
  if (targetCourier?.courierName) {
    params.set('targetCourierName', String(targetCourier.courierName))
    params.set('target_courier_name', String(targetCourier.courierName))
  }
  if (targetCourier?.serviceProvider) {
    params.set('targetServiceProvider', String(targetCourier.serviceProvider))
    params.set('target_service_provider', String(targetCourier.serviceProvider))
  }
  if (targetCourier?.mode) {
    params.set('targetMode', String(targetCourier.mode))
    params.set('target_mode', String(targetCourier.mode))
  }

  try {
    const { data } = await api.post(
      `/admin/couriers/shipping-rates/import?${params.toString()}`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
    )

    return data
  } catch (error) {
    const serverMessage =
      error?.response?.data?.message ||
      error?.response?.data?.error ||
      error?.message ||
      'Failed to upload shipping rates'

    throw new Error(serverMessage)
  }
}
// Unified delete function: B2C zone, B2B zone, B2B courier
export const deleteShippingRateAPI = async ({
  courierId,
  planId,
  businessType,
  zoneId,
  serviceProvider,
  mode,
}) => {
  if (!courierId || !planId || !businessType) {
    throw new Error('courierId, planId and businessType are required')
  }

  const { data } = await api.delete(`/admin/couriers/shipping-rates/${planId}/${courierId}`, {
    params: {
      businessType,
      zoneId,
      serviceProvider,
      mode,
    },
  })

  return data
}

export const fetchCourierCredentials = async () => {
  const { data } = await api.get('/admin/couriers/credentials')
  if (!data?.success) throw new Error('Failed to fetch courier credentials')
  return data.data
}

export const updateDelhiveryCredentials = async (payload) => {
  const { data } = await api.put('/admin/couriers/credentials/delhivery', payload)
  if (!data?.success) throw new Error('Failed to update Delhivery credentials')
  return data.data
}

export const updateDelhiveryB2BCredentials = async (payload) => {
  const { data } = await api.put('/admin/couriers/credentials/delhivery-b2b', payload)
  if (!data?.success) throw new Error('Failed to update Delhivery B2B credentials')
  return data.data
}

export const testDelhiveryB2BCredentials = async () => {
  const { data } = await api.post('/admin/couriers/credentials/delhivery-b2b/test')
  if (!data?.success) throw new Error(data?.message || 'Failed to test Delhivery B2B credentials')
  return data.data
}

export const updateEkartCredentials = async (payload) => {
  const { data } = await api.put('/admin/couriers/credentials/ekart', payload)
  if (!data?.success) throw new Error('Failed to update Ekart credentials')
  return data.data
}

export const updateXpressbeesCredentials = async (payload) => {
  const { data } = await api.put('/admin/couriers/credentials/xpressbees', payload)
  if (!data?.success) throw new Error('Failed to update Xpressbees credentials')
  return data.data
}

export const testXpressbeesCredentials = async (payload) => {
  const { data } = await api.post('/admin/couriers/credentials/xpressbees/test', payload)
  if (!data?.success) throw new Error(data?.message || 'Failed to test Xpressbees credentials')
  return data.data
}

export const updateXpressbeesAwbRange = async (payload) => {
  const { data } = await api.put('/admin/couriers/credentials/xpressbees/awb-range', payload)
  if (!data?.success) throw new Error(data?.message || 'Failed to update Xpressbees AWB range')
  return data.data
}

export const updateShadowfaxCredentials = async (payload) => {
  const { data } = await api.put('/admin/couriers/credentials/shadowfax', payload)
  if (!data?.success) throw new Error('Failed to update Shadowfax credentials')
  return data.data
}

export const updateInnofulfillCredentials = async (payload) => {
  const { data } = await api.put('/admin/couriers/credentials/innofulfill', payload)
  if (!data?.success) throw new Error(data?.message || 'Failed to update Innofulfill credentials')
  return data.data
}

export const testInnofulfillCredentials = async (payload) => {
  const { data } = await api.post('/admin/couriers/credentials/innofulfill/test', payload)
  if (!data?.success) throw new Error(data?.message || 'Failed to test Innofulfill credentials')
  return data.data
}
