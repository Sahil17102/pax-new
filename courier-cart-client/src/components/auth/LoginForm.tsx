import { alpha, Box, Typography } from '@mui/material'
import type { ReactNode } from 'react'
import { FiCheck, FiMapPin, FiPackage, FiRadio, FiShield } from 'react-icons/fi'
import PhoneForm from './PhoneForm'

const navy = '#172238'
const blue = '#3454d1'
const orange = '#ef6c00'
const muted = '#647187'

function Point({ number, children }: { number: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, color: muted, fontSize: 13, fontWeight: 800 }}>
      <Box
        component="span"
        sx={{
          display: 'grid',
          placeItems: 'center',
          width: 28,
          height: 28,
          borderRadius: '50%',
          color: blue,
          background: alpha(blue, 0.09),
          fontSize: 11,
          fontWeight: 950,
        }}
      >
        {number}
      </Box>
      {children}
    </Box>
  )
}

function DeliveryVisual() {
  return (
    <Box
      sx={{
        position: 'relative',
        width: 'min(100%, 610px)',
        height: { md: 238, lg: 285 },
        mt: { md: 2.4, lg: 4.2 },
        overflow: 'hidden',
        border: '7px solid rgba(255,255,255,.92)',
        borderRadius: '25px',
        boxShadow: '0 28px 65px rgba(37,64,112,.2)',
        isolation: 'isolate',
        transition: 'transform .6s ease, box-shadow .6s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: '0 36px 75px rgba(37,64,112,.28)',
        },
      }}
    >
      <Box
        component="img"
        src="/images/pax-courier-hero.png"
        alt="Pax courier scanning a shipment at the delivery hub"
        sx={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: 'center 52%',
          transition: 'transform 1s ease',
          '.MuiBox-root:hover > &': { transform: 'scale(1.035)' },
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          background: 'linear-gradient(90deg, rgba(7,25,58,.86), rgba(16,53,96,.25) 63%, rgba(7,25,58,.55))',
        }}
      />

      <Box
        sx={{
          position: 'absolute',
          zIndex: 2,
          top: 18,
          left: 20,
          right: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'rgba(255,255,255,.82)',
          fontSize: 10,
          fontWeight: 900,
          letterSpacing: '.09em',
          textTransform: 'uppercase',
        }}
      >
        <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.8 }}>
          <Box component="i" sx={{ width: 8, height: 8, borderRadius: '50%', background: '#6fe0b8', boxShadow: '0 0 0 5px rgba(111,224,184,.14)' }} />
          Live city delivery
        </Box>
        HYD • 08:42 PM
      </Box>

      <Box
        sx={{
          position: 'absolute',
          zIndex: 2,
          bottom: 18,
          left: 18,
          minWidth: { md: 210, lg: 235 },
          p: 1.6,
          border: '1px solid rgba(255,255,255,.35)',
          borderRadius: 2,
          background: 'rgba(255,255,255,.94)',
          color: navy,
          backdropFilter: 'blur(13px)',
          boxShadow: '0 18px 34px rgba(9,28,62,.2)',
          animation: 'paxCardFloat 4.4s ease-in-out infinite',
        }}
      >
        <Typography sx={{ color: '#77849a', fontSize: 9, fontWeight: 950, letterSpacing: '.09em' }}>SHIPMENT IN MOTION</Typography>
        <Typography sx={{ my: 0.45, fontSize: 18, fontWeight: 950 }}>HYD → Customer</Typography>
        <Box sx={{ display: 'flex', gap: 1.5, color: '#6f7c90', fontSize: 10, fontWeight: 800 }}>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.55 }}><FiRadio color={blue} /> Live tracking</Box>
          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.55 }}><FiCheck color="#44ae84" /> On schedule</Box>
        </Box>
      </Box>

      <Box
        sx={{
          position: 'absolute',
          zIndex: 2,
          right: 22,
          bottom: 31,
          display: { md: 'none', lg: 'flex' },
          alignItems: 'center',
          gap: 0.8,
          color: '#fff',
          fontSize: 11,
          fontWeight: 950,
          animation: 'paxRouteFloat 4.4s ease-in-out infinite .45s',
        }}
      >
        Pickup <Box sx={{ width: 28, height: 1, background: 'rgba(255,255,255,.55)' }} />
        <Box sx={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: '50%', background: blue }}><FiMapPin /></Box>
        Delivery
      </Box>
    </Box>
  )
}

export default function LoginForm() {
  return (
    <Box
      component="main"
      sx={{
        minHeight: '100dvh',
        position: 'relative',
        overflow: { xs: 'auto', md: 'hidden' },
        color: navy,
        background:
          'radial-gradient(circle at 9% 13%, rgba(202,221,255,.8), transparent 30%), radial-gradient(circle at 88% 86%, rgba(188,220,244,.5), transparent 28%), linear-gradient(180deg,#f8fbff 0%,#eef4fc 100%)',
        '@keyframes paxCardFloat': {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-5px)' },
        },
        '@keyframes paxRouteFloat': {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-4px)' },
        },
      }}
    >
      <Box sx={{ position: 'absolute', width: 650, height: 650, borderRadius: '50%', border: '1px solid rgba(52,84,209,.12)', left: -245, bottom: -360, pointerEvents: 'none' }} />
      <Box sx={{ position: 'absolute', width: 560, height: 560, borderRadius: '50%', border: '1px solid rgba(52,84,209,.1)', right: -210, top: -290, pointerEvents: 'none' }} />

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          width: 'min(100% - 32px, 1320px)',
          minHeight: '100dvh',
          mx: 'auto',
          py: { xs: 2, sm: 3, md: 2.25, lg: 4 },
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'minmax(0,.92fr) minmax(500px,.82fr)' },
          gap: { xs: 2, md: 3.5, lg: 7 },
          alignItems: 'center',
        }}
      >
        <Box sx={{ display: { xs: 'none', md: 'block' }, minWidth: 0 }}>
          <Box
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 0.9,
              px: 1.5,
              py: 0.85,
              borderRadius: 99,
              border: '1px solid rgba(52,84,209,.18)',
              background: 'rgba(52,84,209,.07)',
              color: blue,
              fontSize: 11,
              fontWeight: 950,
              letterSpacing: '.1em',
              textTransform: 'uppercase',
            }}
          >
            <Box sx={{ width: 8, height: 8, borderRadius: '50%', background: blue }} /> Pax delivery network
          </Box>

          <Typography
            component="h1"
            sx={{
              maxWidth: 680,
              mt: { md: 2, lg: 2.6 },
              mb: { md: 1.5, lg: 2.2 },
              fontSize: { md: '3.5rem', lg: '4.7rem' },
              lineHeight: 0.94,
              letterSpacing: '-.045em',
              fontWeight: 950,
            }}
          >
            Move every parcel.
            <Box component="span" sx={{ display: 'block', mt: 0.55, background: 'linear-gradient(110deg,#3454d1,#5087c9)', backgroundClip: 'text', color: 'transparent' }}>
              Know every step.
            </Box>
          </Typography>

          <Typography sx={{ maxWidth: 580, color: muted, fontSize: { md: 15, lg: 17 }, lineHeight: 1.7 }}>
            Book pickups, track every handoff and keep courier operations moving from one dependable workspace.
          </Typography>

          <DeliveryVisual />

          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: { md: 1.3, lg: 2.2 }, mt: { md: 1.6, lg: 2.6 } }}>
            <Point number="01">Doorstep pickup</Point>
            <Point number="02">Live shipment tracking</Point>
            <Point number="03">Pan-India delivery</Point>
          </Box>
        </Box>

        <Box
          sx={{
            width: '100%',
            maxWidth: 640,
            mx: 'auto',
            p: { xs: 2.2, sm: 3.4, md: 3.5, lg: 4.2 },
            border: '1px solid rgba(39,69,121,.1)',
            borderRadius: { xs: 2.5, md: 3.5 },
            background: 'rgba(255,255,255,.96)',
            boxShadow: '0 35px 80px rgba(37,64,112,.17)',
            boxSizing: 'border-box',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2, mb: { xs: 2, md: 2.5 } }}>
            <Box component="img" src="/images/pax-logo.png" alt="Pax Logistics" sx={{ display: 'block', width: { xs: 118, md: 145 }, maxHeight: 55, objectFit: 'contain', objectPosition: 'left center' }} />
            <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.7, px: 1.25, py: 0.8, borderRadius: 99, background: '#eaf0ff', color: blue, fontSize: 10, fontWeight: 950, letterSpacing: '.05em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
              <Box sx={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', background: blue, color: '#fff' }}><FiShield size={12} /></Box>
              Customer portal
            </Box>
          </Box>

          <Box sx={{ mb: { xs: 1.8, md: 2.2 } }}>
            <Typography sx={{ color: orange, fontSize: 11, fontWeight: 950, letterSpacing: '.13em', textTransform: 'uppercase' }}>Welcome to Pax</Typography>
            <Typography component="h2" sx={{ mt: 0.7, color: navy, fontSize: { xs: 29, md: 36 }, lineHeight: 1.12, fontWeight: 950, letterSpacing: '-.025em' }}>
              Log in to your account.
            </Typography>
            <Typography sx={{ mt: 1, color: '#7a8799', fontSize: { xs: 13.5, md: 14.5 }, lineHeight: 1.6 }}>
              Choose OTP or password and use your registered work email.
            </Typography>
          </Box>

          <PhoneForm />

          <Box sx={{ mt: 2, pt: 1.5, borderTop: '1px solid #e8edf4', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.8, color: '#8b97a8', fontSize: 12.5, fontWeight: 700, textAlign: 'center' }}>
            <FiPackage /> Your shipment and account data stays protected.
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
