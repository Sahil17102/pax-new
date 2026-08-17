// hooks/useShippingRates.js
import { useToast } from '@chakra-ui/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  createCourier,
  deleteCourier,
  deleteShippingRateAPI,
  fetchCourierCredentials,
  fetchAllCouriersList,
  fetchAvailableCouriers,
  fetchServiceProviders,
  fetchShippingRates,
  testDelhiveryB2BCredentials,
  testInnofulfillCredentials,
  testInnofulfillRefreshToken,
  testXpressbeesCredentials,
  updateDelhiveryCredentials,
  updateDelhiveryB2BCredentials,
  updateEkartCredentials,
  updateInnofulfillCredentials,
  updateShadowfaxCredentials,
  updateXpressbeesAwbRange,
  updateXpressbeesCredentials,
  updateCourierStatus,
  updateServiceProviderStatus,
  updateShippingRate,
  uploadShippingRates,
} from '../services/courier.service'

export const useCouriers = (filters = {}) => {
  return useQuery({
    queryKey: ['couriers', filters],
    queryFn: () => fetchAllCouriersList(filters),
    staleTime: 5 * 120 * 1000, // 5 minutes cache
    retry: 1,
  })
}

export const useCreateCourier = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: createCourier,
    onSuccess: () => {
      queryClient.invalidateQueries(['couriers'])
    },
  })
}

export const useAvailableCouriersMutation = () => {
  return useMutation({
    mutationFn: (params) => {
      const parsedOrderAmount = Number(params.orderAmount ?? 0)
      const normalizedOrderAmount = parsedOrderAmount > 0 ? parsedOrderAmount : undefined

      return fetchAvailableCouriers({
        origin: params.pickupPincode,
        destination: params.deliveryPincode,
        pickupId: params.pickupId,
        payment_type: params.paymentType ?? (params.cod && params.cod > 0 ? 'cod' : 'prepaid'),
        order_amount: normalizedOrderAmount,
        weight: params.weight,
        length: params.length,
        breadth: params.breadth,
        height: params.height,
        shipment_type: params?.shipmentType,
        plan_id: params?.planId,
        isReverse: params?.shipmentType === 'reverse',
        isCalculator: params?.isCalculator === true || params?.context === 'rate_calculator',
      })
    },
    retry: 1,
  })
}

export const useDeleteCourier = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: deleteCourier,
    onSuccess: () => {
      queryClient.invalidateQueries(['couriers'])
    },
  })
}

export const useUpdateCourierStatus = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateCourierStatus,
    onSuccess: () => {
      queryClient.invalidateQueries(['couriers'])
    },
  })
}

export const useServiceProviders = () => {
  return useQuery({
    queryKey: ['serviceProviders'],
    queryFn: () => fetchServiceProviders(),
    staleTime: 5 * 60 * 1000,
  })
}

export const useUpdateServiceProviderStatus = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateServiceProviderStatus,
    onSuccess: () => {
      queryClient.invalidateQueries(['serviceProviders'])
      queryClient.invalidateQueries(['couriers'])
    },
  })
}

export const useCourierCredentials = () => {
  return useQuery({
    queryKey: ['courierCredentials'],
    queryFn: fetchCourierCredentials,
    staleTime: 60 * 1000,
  })
}

export const useUpdateDelhiveryCredentials = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateDelhiveryCredentials,
    onSuccess: () => {
      queryClient.invalidateQueries(['courierCredentials'])
    },
  })
}

export const useUpdateDelhiveryB2BCredentials = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateDelhiveryB2BCredentials,
    onSuccess: () => {
      queryClient.invalidateQueries(['courierCredentials'])
    },
  })
}

export const useTestDelhiveryB2BCredentials = () => {
  return useMutation({
    mutationFn: testDelhiveryB2BCredentials,
  })
}

export const useUpdateEkartCredentials = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateEkartCredentials,
    onSuccess: () => {
      queryClient.invalidateQueries(['courierCredentials'])
    },
  })
}

export const useUpdateXpressbeesCredentials = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateXpressbeesCredentials,
    onSuccess: () => {
      queryClient.invalidateQueries(['courierCredentials'])
    },
  })
}

export const useTestXpressbeesCredentials = () => {
  return useMutation({
    mutationFn: testXpressbeesCredentials,
  })
}

export const useUpdateXpressbeesAwbRange = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateXpressbeesAwbRange,
    onSuccess: () => {
      queryClient.invalidateQueries(['courierCredentials'])
    },
  })
}

export const useUpdateShadowfaxCredentials = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateShadowfaxCredentials,
    onSuccess: () => {
      queryClient.invalidateQueries(['courierCredentials'])
    },
  })
}

export const useUpdateInnofulfillCredentials = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: updateInnofulfillCredentials,
    onSuccess: () => {
      queryClient.invalidateQueries(['courierCredentials'])
    },
  })
}

export const useTestInnofulfillCredentials = () => {
  return useMutation({
    mutationFn: testInnofulfillCredentials,
  })
}

export const useTestInnofulfillRefreshToken = () => {
  return useMutation({
    mutationFn: testInnofulfillRefreshToken,
  })
}

export const useShippingRates = (filters = {}) => {
  return useQuery({
    queryKey: ['shippingRates', filters],
    queryFn: () => fetchShippingRates(filters),
    staleTime: 5 * 60 * 1000, // 5 minutes
  })
}

export const useUpdateShippingRate = () => {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: async ({ id, updates, planId }) => updateShippingRate(id, updates, planId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shippingRates'] })
      toast({
        title: 'Rate updated successfully.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      })
    },
    onError: (error) => {
      console.error('Failed to update shipping rate:', error)
      toast({
        title: 'Failed to update rate.',
        description: error?.message || 'Something went wrong.',
        status: 'error',
        duration: 4000,
        isClosable: true,
      })
    },
  })
}

export const useImportShippingRates = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: uploadShippingRates,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shippingRates'] })
    },
  })
}

export const useDeleteB2CZone = (planId) => {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: ({ courierId, zoneId, serviceProvider, mode }) =>
      deleteShippingRateAPI({
        courierId,
        planId,
        businessType: 'b2c',
        zoneId,
        serviceProvider,
        mode,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries(['shippingRates'])
      toast({ title: 'B2C zone rate deleted', status: 'success' })
    },
    onError: () => toast({ title: 'Failed to delete B2C zone rate', status: 'error' }),
  })
}

// B2B zone delete
export const useDeleteB2BZone = (planId) => {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: ({ courierId, zoneId }) =>
      deleteShippingRateAPI({ courierId, planId, businessType: 'b2b', zoneId }),
    onSuccess: () => {
      queryClient.invalidateQueries(['shippingRates'])
      toast({ title: 'B2B zone rate deleted', status: 'success' })
    },
    onError: () => toast({ title: 'Failed to delete B2B zone rate', status: 'error' }),
  })
}

// B2B courier delete (all zones)
export const useDeleteB2BCourier = (planId) => {
  const queryClient = useQueryClient()
  const toast = useToast()

  return useMutation({
    mutationFn: (courierId) => deleteShippingRateAPI({ courierId, planId, businessType: 'b2b' }), // no zoneId = delete whole courier
    onSuccess: () => {
      queryClient.invalidateQueries(['shippingRates'])
      toast({ title: 'B2B courier deleted', status: 'success' })
    },
    onError: () => toast({ title: 'Failed to delete B2B courier', status: 'error' }),
  })
}
