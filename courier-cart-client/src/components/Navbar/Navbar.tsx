import { alpha, Box, IconButton, Stack, Tooltip, useMediaQuery, useTheme } from '@mui/material'
import { FaBolt, FaWallet } from 'react-icons/fa'
import { MdClose, MdMenu, MdPushPin } from 'react-icons/md'
import { BRAND, brandStripe } from '../../config/brand'
import { useAuth } from '../../context/auth/AuthContext'
import { useUserProfile } from '../../hooks/User/useUserProfile'
import StatusChip from '../UI/chip/StatusChip'
import GlobalSearch from './GlobalSearch'
import QuickActions from './QuickActions'
import UserMenu from './UserMenu'
import WalletMenu from './WalletMenu'

interface NavbarProps {
  handleDrawerToggle: () => void
  pinned?: boolean
  onPinChange?: (pinned: boolean) => void
}

const BRAND_SURFACE = BRAND.colors.paper
const BRAND_TEXT = BRAND.colors.ink
const BRAND_PRIMARY = BRAND.colors.teal
const BRAND_ACCENT = BRAND.colors.orange

export default function Navbar({ handleDrawerToggle, pinned = false, onPinChange }: NavbarProps) {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const isCompactNavbar = useMediaQuery(theme.breakpoints.down('lg'))
  const { isAuthenticated, user } = useAuth()
  const handlePinToggle = () => {
    onPinChange?.(!pinned)
  }
  const { data: profile } = useUserProfile(isAuthenticated, user?.id)
  return (
    <Box sx={{ position: 'sticky', top: 0, zIndex: (currentTheme) => currentTheme.zIndex.appBar }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={{ xs: 0.5, sm: 0.6, md: 0.8, lg: 1.0 }}
        sx={{
          position: 'relative',
          overflow: 'hidden',
          px: { xs: 0.5, sm: 0.8, md: 1.2, lg: 1.5 },
          py: { xs: 0.4, sm: 0.45, md: 0.5, lg: 0.6 },
          borderRadius: 0,
          background:
            `linear-gradient(180deg, ${alpha(BRAND_SURFACE, 0.98)} 0%, ${alpha(BRAND.colors.tealSoft, 0.82)} 100%)`,
          border: `1px solid ${alpha(BRAND_PRIMARY, 0.12)}`,
          boxShadow: '0 10px 30px rgba(6, 26, 51, 0.06)',
          minHeight: { xs: 44, sm: 46, md: 48, lg: 52 },
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          transition: 'all 300ms cubic-bezier(0.4, 0, 0.2, 1)',
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: '0 0 auto 0',
            height: 3,
            background: brandStripe,
          },
        }}
      >
        <Stack
          direction="row"
          spacing={{ xs: 0.6, sm: 0.8, md: 1.0, lg: 1.2 }}
          alignItems="center"
          minWidth={0}
          flex={1}
        >
          {isMobile && (
            <IconButton
              onClick={handleDrawerToggle}
              title="Open navigation menu"
              aria-label="Open navigation menu"
              sx={{
                width: { xs: 32, sm: 34, md: 36, lg: 40 },
                height: { xs: 32, sm: 34, md: 36, lg: 40 },
                borderRadius: 2,
                bgcolor: alpha(BRAND_PRIMARY, 0.04),
                border: `1.5px solid ${alpha(BRAND_PRIMARY, 0.12)}`,
                color: BRAND_TEXT,
                transition: 'all 280ms cubic-bezier(0.34, 1.56, 0.64, 1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                '&:hover': {
                  bgcolor: alpha(BRAND_ACCENT, 0.08),
                  borderColor: alpha(BRAND_ACCENT, 0.25),
                  color: BRAND_ACCENT,
                  boxShadow: `0 4px 12px ${alpha(BRAND_PRIMARY, 0.12)}, inset 0 1px 0 rgba(255, 255, 255, 0.5)`,
                  transform: 'translateY(-1px)',
                },
              }}
            >
              <MdMenu size={21} />
            </IconButton>
          )}

          {!isMobile && (
            <Tooltip title={pinned ? 'Collapse sidebar' : 'Expand sidebar'} placement="bottom">
              <IconButton
                onClick={handlePinToggle}
                size="small"
                sx={{
                  width: 32,
                  height: 32,
                  color: BRAND_TEXT,
                  transition: 'all 200ms ease',
                  padding: 0,
                  '&:hover': {
                    color: BRAND_ACCENT,
                    background: alpha(BRAND_ACCENT, 0.08),
                  },
                }}
              >
                {pinned ? <MdClose size={16} /> : <MdPushPin size={14} />}
              </IconButton>
            </Tooltip>
          )}

          <Box sx={{ flex: 1, maxWidth: { xs: 220, sm: 320, md: 440, lg: 520 } }}>
            <GlobalSearch compact={isCompactNavbar} />
          </Box>
        </Stack>

        <Stack
          direction="row"
          spacing={{ xs: 0.4, sm: 0.5, md: 0.7, lg: 0.85 }}
          alignItems="center"
          justifyContent="flex-end"
          flexShrink={0}
          sx={{ minWidth: 0 }}
        >
          {isCompactNavbar ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <QuickActions compact iconOverride={<FaBolt size={12} />} />
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <WalletMenu iconOnly iconOverride={<FaWallet size={12} />} />
              </Box>
            </>
          ) : (
            <>
              {profile?.approved ? (
                <StatusChip
                  status="success"
                  label="Verified Account"
                  sx={{
                    display: { xs: 'none', md: 'flex' },
                    height: 28,
                    px: 1,
                    fontSize: '0.7rem',
                    fontWeight: 800,
                    letterSpacing: '0.04em',
                    borderRadius: '999px',
                    border: `1px solid ${alpha(BRAND.colors.teal, 0.28)}`,
                    background: alpha(BRAND.colors.teal, 0.08),
                    color: BRAND.colors.teal,
                    '& .MuiChip-icon': {
                      color: BRAND.colors.teal,
                    },
                  }}
                />
              ) : null}{' '}
              <QuickActions />
              <WalletMenu />
            </>
          )}
          <UserMenu />
        </Stack>
      </Stack>
    </Box>
  )
}
