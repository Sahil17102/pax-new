import {
  alpha,
  Box,
  CardContent,
  CircularProgress,
  Divider,
  Grid,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'
import { useEffect, useRef, useState } from 'react'
import { Controller, FormProvider, useForm } from 'react-hook-form'
import { BiRupee } from 'react-icons/bi'
import { FiBarChart2, FiCheckCircle, FiMapPin, FiPackage, FiShield, FiZap } from 'react-icons/fi'
import { useLocation } from 'react-router-dom'
import { getStaticPage } from '../../api/staticPages.service'
import CourierRateCards from '../../components/CourierRateCard'
import B2BRateCalculator from '../../components/tools/B2BRateCalculator'
import B2CRateCalculator from '../../components/tools/B2CRateCalculator'
import PublicToolStorySections from '../../components/tools/PublicToolStorySections'
import PublicToolsHeader from '../../components/tools/PublicToolsHeader'
import CustomIconLoadingButton from '../../components/UI/button/CustomLoadingButton'
import CustomInput from '../../components/UI/inputs/CustomInput'
import { SmartTabs } from '../../components/UI/tab/Tabs'
import { BRAND } from '../../config/brand'
import { useAvailableCouriersMutation } from '../../hooks/Integrations/useCouriers'
import { usePaymentOptions } from '../../hooks/usePaymentOptions'
import { usePincodeLookup } from '../../hooks/User/usePincodeLookup'
import { defaultLogo } from '../../utils/constants'

type ShipmentType = 'b2b' | 'b2c'
const { teal, tealDark, orange, muted, border } = BRAND.colors

const defaultTermsContent: Record<ShipmentType, string> = {
  b2c: `<ul>
    <li>Above shared commercials are exclusive of GST.</li>
    <li>Pricing is subject to change when a courier company updates its commercials.</li>
    <li>Volumetric or dead weight, whichever is higher, will be charged.</li>
    <li>Return charges are the same as forward charges where special RTO pricing is not shared.</li>
    <li>Fixed COD charge or COD percentage of the order value, whichever is higher, will apply.</li>
    <li>Other applicable charges, including address correction charges, will be charged extra.</li>
    <li>Prohibited items must not be shipped. Any resulting penalty will be charged to the seller.</li>
    <li>No claim will be entertained for glassware, fragile products, concealed damage, or improper packaging.</li>
    <li>A weight dispute caused by an incorrect weight declaration cannot be claimed.</li>
    <li>Chargeable weight is volumetric or actual weight, whichever is higher (L x B x H / 5000).</li>
    <li>Delhivery 2 kg, 5 kg, and 10 kg accounts use a 4000 volumetric divisor.</li>
    <li>Reverse QC liability is limited to INR 2,000 or the product value, whichever is lower.</li>
  </ul>`,
  b2b: `<ul>
    <li>Above shared commercials are exclusive of GST.</li>
    <li>Pricing is subject to change when a courier company updates its commercials.</li>
    <li>Volumetric or dead weight, whichever is higher, will be charged.</li>
    <li>Other applicable charges, including address correction charges, will be charged extra.</li>
    <li>Prohibited items must not be shipped. Any resulting penalty will be charged to the seller.</li>
    <li>No claim will be entertained for glassware, fragile products, concealed damage, or improper packaging.</li>
    <li>A weight dispute caused by an incorrect weight declaration cannot be claimed.</li>
    <li>Chargeable weight is volumetric or actual weight, whichever is higher.</li>
    <li>Delhivery volumetric calculation: (L x B x H / 27000) x CFT.</li>
    <li>Delhivery B2B transporter ID: 06AAPCS9575E1ZR.</li>
  </ul>`,
}

export const cardStyles = {
  position: 'relative',
  width: '100%',
  overflow: 'hidden',
  background: BRAND.colors.paper,
  border: `1px solid ${border}`,
  borderRadius: 3,
  boxShadow: '0 18px 46px rgba(1, 63, 73, 0.08)',
}

export function RateCalculator() {
  const location = useLocation()
  const isPublicRoute = location.pathname.startsWith('/rate-calculator')
  const { mutateAsync, isPending, isError, error } = useAvailableCouriersMutation()
  const couriersRef = useRef<HTMLDivElement | null>(null)
  const [shipmentType, setShipmentType] = useState<ShipmentType>('b2c')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [availableCouriers, setAvailableCouriers] = useState<any[]>([])
  const { data: paymentOptions } = usePaymentOptions()
  const [termsContent, setTermsContent] = useState<Record<ShipmentType, string>>(defaultTermsContent)

  useEffect(() => {
    let active = true

    Promise.allSettled([
      getStaticPage('rate_calculator_terms_b2c'),
      getStaticPage('rate_calculator_terms_b2b'),
    ]).then(([b2cResult, b2bResult]) => {
      if (!active) return

      setTermsContent({
        b2c:
          b2cResult.status === 'fulfilled' && b2cResult.value.content
            ? b2cResult.value.content
            : defaultTermsContent.b2c,
        b2b:
          b2bResult.status === 'fulfilled' && b2bResult.value.content
            ? b2bResult.value.content
            : defaultTermsContent.b2b,
      })
    })

    return () => {
      active = false
    }
  }, [])

  const methods = useForm({
    mode: 'onBlur',
    defaultValues: {
      pickupPincode: '',
      pickupCity: '',
      pickupState: '',
      deliveryPincode: '',
      deliveryCity: '',
      deliveryState: '',
      paymentType: 'cod',
      length: '',
      breadth: '',
      height: '',
      weight: '',
      totalWeight: '',
      numberOfBoxes: '',
      orderAmount: '',
    },
  })

  const {
    watch,
    setValue,
    setError,
    clearErrors,
    register,
    handleSubmit,
    formState: { errors },
  } = methods

  const pickupPincode = watch('pickupPincode')
  const deliveryPincode = watch('deliveryPincode')
  const loadingPickup = usePincodeLookup(pickupPincode, 'pickup', setValue, setError, clearErrors)
  const loadingDelivery = usePincodeLookup(deliveryPincode, 'delivery', setValue, setError, clearErrors)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const onSubmit = async (formData: any) => {
    try {
      // convert to numbers
      const length = Number(formData.length) || 0
      const breadth = Number(formData.breadth) || 0
      const height = Number(formData.height) || 0
      const actualWeightKg = Number(formData.weight) || 0 // kg from UI

      // Convert actual weight from kg to grams.
      const actualWeightGrams = actualWeightKg * 1000
      const b2bWeightKg = Number(formData.totalWeight) || 0
      const numberOfBoxes = Math.max(Number(formData.numberOfBoxes) || 1, 1)

      const orderAmountValue = Number(formData.orderAmount || 0)

      const payload = {
        pickupPincode: formData.pickupPincode,
        deliveryPincode: formData.deliveryPincode,
        // B2C serviceability expects grams; B2B local rate calculation expects kilograms.
        weight: shipmentType === 'b2c' ? actualWeightGrams : b2bWeightKg,
        cod: formData.paymentType === 'cod' ? Math.max(orderAmountValue, 1) : 0,
        length,
        breadth,
        height,
        orderAmount: orderAmountValue > 0 ? orderAmountValue : undefined,
        shipmentType: shipmentType,
        payment_type: formData?.paymentType,
        numberOfBoxes: shipmentType === 'b2b' ? numberOfBoxes : undefined,
        // Hint to backend that this is just a rate calculator call (can skip heavy live checks)
        context: 'rate_calculator',
      }

      const result = await mutateAsync(payload)
      setAvailableCouriers(result ?? [])
      console.log('Available couriers:', result)
    } catch (err) {
      setAvailableCouriers([])
      console.error('Failed fetching couriers:', err)
    }
  }

  useEffect(() => {
    if (availableCouriers?.length > 0 && couriersRef.current) {
      couriersRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  }, [availableCouriers])

  useEffect(() => {
    setAvailableCouriers([])
  }, [shipmentType])

  // Set default payment type based on enabled options
  useEffect(() => {
    if (paymentOptions) {
      const currentPaymentType = methods.watch('paymentType')
      const isCurrentEnabled =
        (currentPaymentType === 'cod' && paymentOptions.codEnabled) ||
        (currentPaymentType === 'prepaid' && paymentOptions.prepaidEnabled)

      if (!isCurrentEnabled) {
        // Set to first available option
        if (paymentOptions.codEnabled) {
          methods.setValue('paymentType', 'cod')
        } else if (paymentOptions.prepaidEnabled) {
          methods.setValue('paymentType', 'prepaid')
        }
      }
    }
  }, [paymentOptions, methods])

  return (
    <Box
      sx={{
        minHeight: '100vh',
        background:
          'radial-gradient(circle at 82% 10%, rgba(237,28,36,0.13), transparent 28%), radial-gradient(circle at 12% 22%, rgba(6,42,91,0.12), transparent 30%), linear-gradient(180deg, #FFFFFF 0%, #F5F8FC 48%, #EEF4FB 100%)',
      }}
    >
      {isPublicRoute && <PublicToolsHeader />}
      <Stack
        component="main"
        sx={{
          width: '100%',
          maxWidth: 1580,
          mx: 'auto',
          px: { xs: 1.5, sm: 2.5, md: isPublicRoute ? 4 : 0 },
          py: { xs: 2.5, md: isPublicRoute ? 4 : 1.5 },
        }}
        spacing={3}
      >
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', lg: '0.9fr 1.1fr' },
            gap: { xs: 2.4, md: 3 },
            alignItems: 'stretch',
          }}
        >
          <Box
            sx={{
              overflow: 'hidden',
              borderRadius: { xs: 4, md: 5 },
              border: `1px solid ${alpha('#07142F', 0.12)}`,
              p: { xs: 3, md: 4.5 },
              background:
                'linear-gradient(rgba(6,42,91,0.055) 1px, transparent 1px), linear-gradient(90deg, rgba(6,42,91,0.055) 1px, transparent 1px), #FFFFFF',
              backgroundSize: '44px 44px',
              boxShadow: '0 30px 90px rgba(7,20,47,0.1)',
            }}
          >
            <Typography
              sx={{
                color: orange,
                fontSize: '0.78rem',
                fontWeight: 900,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
              }}
            >
              Price intelligence
            </Typography>
            <Typography
              component="h1"
              sx={{
                mt: 2,
                color: '#07142F',
                fontSize: { xs: '3rem', md: '4.8rem' },
                fontWeight: 950,
                letterSpacing: '-0.06em',
                lineHeight: 0.96,
              }}
            >
              Compare rates.
              <Box component="span" sx={{ display: 'block', color: teal }}>
                Choose smarter.
              </Box>
            </Typography>
            <Typography
              sx={{
                mt: 2.5,
                maxWidth: 700,
                color: '#31415B',
                fontSize: { xs: '1rem', md: '1.12rem' },
                fontWeight: 650,
                lineHeight: 1.8,
              }}
            >
              Enter pickup, delivery, parcel and payment details to compare courier pricing in one clear Pax Logistics
              view.
            </Typography>
            <Box
              sx={{
                mt: 3,
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' },
                gap: 1.4,
              }}
            >
              {[
                ['B2C + B2B', 'Shipment modes'],
                ['Live lanes', 'Pincode lookup'],
                ['COD ready', 'Payment pricing'],
              ].map(([value, label]) => (
                <Box
                  key={value}
                  sx={{
                    border: `1px solid ${alpha('#07142F', 0.1)}`,
                    borderRadius: 3,
                    bgcolor: 'rgba(255,255,255,0.78)',
                    p: 1.8,
                  }}
                >
                  <Typography
                    sx={{
                      color: '#07142F',
                      fontSize: '1.15rem',
                      fontWeight: 950,
                    }}
                  >
                    {value}
                  </Typography>
                  <Typography
                    sx={{
                      mt: 0.35,
                      color: muted,
                      fontSize: '0.76rem',
                      fontWeight: 800,
                    }}
                  >
                    {label}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>

          <Box
            sx={{
              position: 'relative',
              overflow: 'hidden',
              borderRadius: { xs: 4, md: 5 },
              border: `1px solid ${alpha(teal, 0.13)}`,
              bgcolor: '#FFFFFF',
              boxShadow: '0 30px 90px rgba(6,42,91,0.12)',
              minHeight: { xs: 360, lg: 520 },
            }}
          >
            <Box
              component="img"
              src="/images/rate-tool-3d.webp"
              loading="lazy"
              decoding="async"
              alt="Courier rate calculator with invoice and parcels"
              sx={{
                width: '100%',
                height: '100%',
                minHeight: { xs: 360, lg: 520 },
                objectFit: 'contain',
                objectPosition: 'center',
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                left: { xs: 16, md: 24 },
                bottom: { xs: 16, md: 24 },
                minWidth: { xs: 180, md: 220 },
                border: `1px solid ${alpha(teal, 0.12)}`,
                borderRadius: 1,
                bgcolor: 'rgba(255,255,255,0.94)',
                backdropFilter: 'blur(14px)',
                p: 2,
                boxShadow: '0 18px 44px rgba(7,20,47,0.12)',
              }}
            >
              <Typography sx={{ color: muted, fontSize: '0.72rem', fontWeight: 850 }}>LIVE PRICE COMPARISON</Typography>
              <Stack direction="row" alignItems="center" spacing={0.3} sx={{ mt: 0.8, color: teal }}>
                <BiRupee size={25} />
                <Typography sx={{ fontSize: '2rem', lineHeight: 1, fontWeight: 950 }}>Best fit</Typography>
              </Stack>
              <Typography
                sx={{
                  mt: 0.7,
                  color: muted,
                  fontSize: '0.74rem',
                  fontWeight: 700,
                }}
              >
                Route, weight and payment mode together.
              </Typography>
            </Box>
          </Box>
        </Box>

        <FormProvider {...methods}>
          <CardContent
            sx={{
              position: 'relative',
              width: '100%',
              overflow: 'hidden',
              background: 'rgba(255,255,255,0.94)',
              border: `1px solid ${alpha('#07142F', 0.12)}`,
              borderRadius: { xs: 3, md: 4 },
              boxShadow: '0 24px 70px rgba(7,20,47,0.1)',
              backdropFilter: 'blur(18px)',
              p: { xs: 2.4, md: 3.2 },
            }}
          >
            <Typography
              sx={{
                color: orange,
                fontSize: '0.76rem',
                fontWeight: 900,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
              }}
            >
              Rate calculator
            </Typography>
            <Typography
              variant="h5"
              gutterBottom
              sx={{
                mt: 1,
                color: '#07142F',
                fontSize: { xs: '1.75rem', md: '2.45rem' },
                fontWeight: 950,
                letterSpacing: '-0.04em',
              }}
            >
              Calculate courier price
            </Typography>

            {/* Tabs */}
            <SmartTabs
              value={shipmentType}
              onChange={(val) => setShipmentType(val)}
              tabs={[
                { label: 'B2C', value: 'b2c' },
                { label: 'B2B', value: 'b2b' },
              ]}
            />

            <Divider sx={{ my: 2 }} />

            {/* Pickup Section */}
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}>
                <CustomInput
                  label="Pickup Pincode"
                  {...register('pickupPincode', {
                    required: 'Pickup pincode is required',
                    pattern: {
                      value: /^[1-9][0-9]{5}$/,
                      message: 'Enter valid 6-digit pincode',
                    },
                  })}
                  error={!!errors.pickupPincode}
                  helperText={errors.pickupPincode?.message as string}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <CustomInput
                  label="Pickup City"
                  {...register('pickupCity')}
                  fullWidth
                  disabled
                  postfix={loadingPickup ? <CircularProgress size={16} /> : null}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <CustomInput
                  label="Pickup State"
                  {...register('pickupState')}
                  fullWidth
                  disabled
                  postfix={loadingPickup ? <CircularProgress size={16} /> : null}
                />
              </Grid>

              {/* Delivery Section */}
              <Grid size={{ xs: 12, md: 4 }}>
                <CustomInput
                  label="Delivery Pincode"
                  {...register('deliveryPincode', {
                    required: 'Delivery pincode is required',
                    pattern: {
                      value: /^[1-9][0-9]{5}$/,
                      message: 'Enter valid 6-digit pincode',
                    },
                  })}
                  error={!!errors.deliveryPincode}
                  helperText={errors.deliveryPincode?.message as string}
                  fullWidth
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <CustomInput
                  label="Delivery City"
                  {...register('deliveryCity')}
                  fullWidth
                  disabled
                  postfix={loadingDelivery ? <CircularProgress size={16} /> : null}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <CustomInput
                  label="Delivery State"
                  {...register('deliveryState')}
                  fullWidth
                  disabled
                  postfix={loadingDelivery ? <CircularProgress size={16} /> : null}
                />
              </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />

            {/* Conditional Forms */}
            {shipmentType === 'b2c' ? <B2CRateCalculator /> : <B2BRateCalculator />}

            <Divider sx={{ my: 2 }} />
            <Controller
              name="paymentType"
              control={methods?.control}
              rules={{ required: 'Please select a payment type' }}
              render={({ field, fieldState }) => (
                <Stack mb={3}>
                  <Typography color={muted} sx={{ fontSize: '15px' }}>
                    {' '}
                    Payment Type
                  </Typography>
                  <Stack direction={'column'} mt={2}>
                    <ToggleButtonGroup
                      value={field.value}
                      exclusive
                      onChange={(_, newValue) => {
                        if (newValue !== null) field.onChange(newValue)
                      }}
                    >
                      {(!paymentOptions || paymentOptions.prepaidEnabled) && (
                        <ToggleButton
                          value="prepaid"
                          sx={{
                            px: 3,
                            mx: 1,
                            py: 1,
                            borderRadius: '10px !important',
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: '0.95rem',
                            color: muted,
                            border: `1px solid ${border}`,
                            transition: 'all 0.25s ease',
                            '&.Mui-selected': {
                              background: teal,
                              color: '#FFFFFF',
                              transform: 'scale(1.05)',
                            },
                            '&:hover': {
                              borderColor: teal,
                              color: tealDark,
                            },
                          }}
                        >
                          Prepaid
                        </ToggleButton>
                      )}

                      {(!paymentOptions || paymentOptions.codEnabled) && (
                        <ToggleButton
                          value="cod"
                          sx={{
                            px: 3,
                            py: 1,
                            mx: 1,
                            borderRadius: '10px !important',
                            textTransform: 'none',
                            fontWeight: 500,
                            fontSize: '0.95rem',
                            color: muted,
                            border: `1px solid ${border}`,
                            transition: 'all 0.25s ease',
                            '&.Mui-selected': {
                              background: teal,
                              color: '#FFFFFF',
                              transform: 'scale(1.05)',
                            },
                            '&:hover': {
                              borderColor: teal,
                              color: tealDark,
                            },
                          }}
                        >
                          COD
                        </ToggleButton>
                      )}
                    </ToggleButtonGroup>

                    {fieldState?.error && <p className="text-red-500 text-sm mt-2">{fieldState.error.message}</p>}
                  </Stack>
                </Stack>
              )}
            />

            <Divider sx={{ my: 2 }} />

            <Grid size={{ xs: 12, md: 4 }}>
              <CustomInput
                label="Order Amount (Shipment Value)"
                type="number"
                placeholder="Enter Shipment Value"
                {...register('orderAmount', {
                  required: 'Order amount is required',
                  min: { value: 1, message: 'Order amount must be at least 1' },
                })}
                error={!!errors.orderAmount}
                helperText={errors.orderAmount?.message as string}
                fullWidth
                prefix={<BiRupee />}
              />
            </Grid>
            <Divider sx={{ my: 2 }} />

            <CustomIconLoadingButton
              text="Calculate Rate"
              loadingText="Calculating Rate.."
              loading={isPending}
              onClick={handleSubmit(onSubmit)}
            ></CustomIconLoadingButton>
          </CardContent>
        </FormProvider>
        {isPending && (
          <Typography sx={{ color: teal, textAlign: 'center', py: 2 }}>Loading available couriers...</Typography>
        )}

        {isError ? (
          <Typography sx={{ color: '#E74C3C', textAlign: 'center', py: 2 }}>
            Failed to fetch couriers: {error?.message ?? 'Unknown error'}
          </Typography>
        ) : (
          <Box ref={couriersRef}>
            <CourierRateCards
              shipmentType={watch('paymentType')}
              availableCouriers={availableCouriers}
              defaultLogo={defaultLogo}
            />
          </Box>
        )}

        <Divider />
        <CardContent
          sx={{
            order: isPublicRoute ? 2 : 0,
            mt: 3,
            backgroundColor: 'rgba(255,255,255,0.94)',
            border: `1px solid ${alpha('#07142F', 0.12)}`,
            borderRadius: { xs: 3, md: 4 },
            boxShadow: '0 18px 46px rgba(7,20,47,0.07)',
            p: 3,
          }}
        >
          <Typography variant="h6" gutterBottom sx={{ color: tealDark, fontWeight: 700 }}>
            Terms & Conditions ({shipmentType.toUpperCase()})
          </Typography>

          <Box
            sx={{
              color: muted,
              fontSize: '0.85rem',
              lineHeight: 1.6,
              '& p': { mb: 1 },
              '& ul, & ol': { mt: 0, mb: 0, pl: 2.5 },
              '& li': { mb: 1 },
              '& a': { color: orange, textDecoration: 'underline' },
            }}
            dangerouslySetInnerHTML={{ __html: termsContent[shipmentType] }}
          />
        </CardContent>
        {isPublicRoute && (
          <Box sx={{ order: 1 }}>
            <PublicToolStorySections
              eyebrow="How rate comparison works"
              title="One shipment. Multiple courier possibilities."
              description="Enter the lane and parcel details once, then compare suitable courier pricing in one consistent view."
              steps={[
                {
                  icon: <FiMapPin />,
                  title: 'Set the route',
                  description: 'Add valid pickup and delivery pincodes for the shipment lane.',
                },
                {
                  icon: <FiPackage />,
                  title: 'Describe the parcel',
                  description: 'Enter dimensions, weight, value and shipment type.',
                },
                {
                  icon: <FiBarChart2 />,
                  title: 'Compare options',
                  description: 'Review available courier rates and service fit together.',
                },
                {
                  icon: <FiCheckCircle />,
                  title: 'Choose confidently',
                  description: 'Pick the option that balances price and delivery needs.',
                },
              ]}
              features={[
                {
                  icon: <BiRupee />,
                  title: 'Live pricing',
                  description: 'Calculate from current courier options.',
                },
                {
                  icon: <FiPackage />,
                  title: 'B2C and B2B',
                  description: 'Use the right form for each shipment.',
                },
                {
                  icon: <FiShield />,
                  title: 'Clear inputs',
                  description: 'Keep route and parcel details organized.',
                },
                {
                  icon: <FiZap />,
                  title: 'Faster decisions',
                  description: 'Compare without repeated data entry.',
                },
              ]}
              ctaTitle="Found the right rate? Put the shipment in motion."
              ctaDescription="Sign in to book the selected courier, generate shipment details and manage every order from one dashboard."
              primaryLabel="Login to book shipment"
              primaryPath="/login"
              secondaryLabel="Check parcel weight"
              secondaryPath="/weight-calculator"
            />
          </Box>
        )}
      </Stack>
    </Box>
  )
}
