import { alpha, AppBar, Box, Button, IconButton, Stack, Toolbar, Tooltip } from '@mui/material'
import { useEffect } from 'react'
import { FiArrowLeft, FiGrid, FiLogIn } from 'react-icons/fi'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { BRAND } from '../../config/brand'
import { useAuth } from '../../context/auth/AuthContext'

const toolLinks = [
  { label: 'Tracking', path: '/tracking' },
  { label: 'Weight Calculator', path: '/weight-calculator' },
  { label: 'Rate Calculator', path: '/rate-calculator' },
]

export default function PublicToolsHeader() {
  const navigate = useNavigate()
  const location = useLocation()
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [location.pathname])

  const goBack = () => {
    if (window.history.length > 1) {
      navigate(-1)
      return
    }

    navigate('/')
  }

  return (
    <AppBar
      position="sticky"
      elevation={0}
      sx={{
        top: 0,
        zIndex: 20,
        bgcolor: 'rgba(255,255,255,0.94)',
        color: BRAND.colors.ink,
        borderBottom: `1px solid ${alpha(BRAND.colors.teal, 0.11)}`,
        backdropFilter: 'blur(18px)',
      }}
    >
      <Toolbar
        sx={{
          width: '100%',
          maxWidth: 1580,
          minHeight: { xs: 72, md: 84 },
          mx: 'auto',
          px: { xs: 1.5, sm: 2.5, md: 4 },
          py: { xs: 1, md: 0 },
          display: 'flex',
          flexWrap: { xs: 'wrap', md: 'nowrap' },
          gap: { xs: 1, md: 2 },
        }}
      >
        <Stack direction="row" alignItems="center" spacing={{ xs: 0.5, sm: 1 }}>
          <Tooltip title="Go back">
            <IconButton
              aria-label="Go back"
              onClick={goBack}
              sx={{
                color: BRAND.colors.teal,
                border: `1px solid ${alpha(BRAND.colors.teal, 0.14)}`,
                bgcolor: alpha(BRAND.colors.teal, 0.035),
                '&:hover': { bgcolor: alpha(BRAND.colors.teal, 0.09) },
              }}
            >
              <FiArrowLeft />
            </IconButton>
          </Tooltip>

          <Box
            component={Link}
            to="/"
            aria-label={`${BRAND.name} home`}
            sx={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            <Box
              component="img"
              src={BRAND.logo}
              alt={BRAND.name}
              sx={{
                width: { xs: 104, sm: 126 },
                height: { xs: 45, sm: 54 },
                objectFit: 'contain',
                mixBlendMode: 'multiply',
              }}
            />
          </Box>
        </Stack>

        <Stack
          component="nav"
          aria-label="Shipping tools"
          direction="row"
          spacing={{ xs: 0.25, sm: 0.8 }}
          sx={{
            order: { xs: 3, md: 2 },
            width: { xs: '100%', md: 'auto' },
            ml: { md: 'auto' },
            overflowX: 'auto',
            scrollbarWidth: 'none',
            '&::-webkit-scrollbar': { display: 'none' },
          }}
        >
          {toolLinks.map((link) => {
            const active = location.pathname.startsWith(link.path)

            return (
              <Button
                key={link.path}
                component={Link}
                to={link.path}
                sx={{
                  flexShrink: 0,
                  minHeight: 42,
                  px: { xs: 1.35, sm: 2 },
                  borderRadius: 2,
                  textTransform: 'none',
                  color: active ? BRAND.colors.teal : '#34445E',
                  bgcolor: active ? alpha(BRAND.colors.teal, 0.075) : 'transparent',
                  fontSize: { xs: '0.78rem', sm: '0.88rem' },
                  fontWeight: active ? 900 : 800,
                  '&:hover': { bgcolor: alpha(BRAND.colors.teal, 0.075) },
                  '&::after': active
                    ? {
                        content: '""',
                        position: 'absolute',
                        left: 14,
                        right: 14,
                        bottom: 3,
                        height: 2,
                        borderRadius: 999,
                        bgcolor: BRAND.colors.orange,
                      }
                    : undefined,
                }}
              >
                {link.label}
              </Button>
            )
          })}
        </Stack>

        <Button
          component={Link}
          to={isAuthenticated ? '/home' : '/login'}
          variant="contained"
          startIcon={isAuthenticated ? <FiGrid /> : <FiLogIn />}
          sx={{
            order: { xs: 2, md: 3 },
            ml: { xs: 'auto', md: 1 },
            minHeight: 44,
            px: { xs: 1.5, sm: 2.4 },
            borderRadius: 2,
            bgcolor: BRAND.colors.teal,
            textTransform: 'none',
            fontSize: { xs: '0.78rem', sm: '0.86rem' },
            fontWeight: 900,
            boxShadow: `0 12px 28px ${alpha(BRAND.colors.teal, 0.2)}`,
            '&:hover': { bgcolor: BRAND.colors.tealDark },
          }}
        >
          {isAuthenticated ? 'Dashboard' : 'Login'}
        </Button>
      </Toolbar>
    </AppBar>
  )
}
