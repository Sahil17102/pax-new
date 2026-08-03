import type { JSX } from '@emotion/react/jsx-runtime'
import {
  alpha,
  Box,
  Collapse,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { BiInfoCircle, BiListPlus } from 'react-icons/bi'
import { CgTrack } from 'react-icons/cg'
import { FaBalanceScaleLeft } from 'react-icons/fa'
import { FaClipboardList as FaFileAlt, FaUser } from 'react-icons/fa6'
import {
  MdOutlineAccountBalanceWallet,
  MdOutlineAddBusiness,
  MdOutlineKeyboardReturn,
  MdOutlineRateReview,
  MdStorefront,
  MdOutlineWarningAmber,
} from 'react-icons/md'
import { RiSettings2Line } from 'react-icons/ri'
import {
  TbAlertCircle,
  TbBuildingStore,
  TbChartBar,
  TbHelpCircle,
  TbHome,
  TbInvoice,
  TbLayoutDashboard,
  TbPackage,
  TbReportAnalytics,
  TbScale,
  TbSettings,
  TbTicket,
  TbTools,
  TbTransactionRupee,
  TbWallet,
} from 'react-icons/tb'
import { NavLink, useLocation } from 'react-router-dom'
import { BRAND, brandStripe } from '../../config/brand'
import useEmployeePermissions from '../../hooks/User/useEmployeePermissions'
import { isActive } from '../../utils/functions'

export type Role = 'customer' | 'admin'

export interface SubItem {
  text: string
  path: string
  icon?: JSX.Element
}

export interface NavItem {
  text: string
  icon: JSX.Element
  path: string
  section: string
  roles: Role[]
  children?: SubItem[]
}

interface SidebarProps {
  role?: Role
  pinned?: boolean
  onPinChange?: (pinned: boolean) => void
  fixed?: boolean
}

export const SIDEBAR_EXPANDED_WIDTH = 260
export const SIDEBAR_COLLAPSED_WIDTH = 96
const ICON_SIZE_MD = 20 // Material Design
const ICON_SIZE_FA = 18 // Font Awesome (slightly smaller to match MD)
const ICON_SIZE_TB = 20 // Tabler
const ICON_SIZE_BI = 20 // Bootstrap Icons
const ICON_SIZE_CG = 20 // css.gg
const ICON_SIZE_RI = 18 // Remix Icon
const BRAND_ORANGE = BRAND.colors.teal
const BRAND_ACCENT = BRAND.colors.orange
const BRAND_SURFACE = BRAND.colors.paper
const BRAND_INK = BRAND.colors.ink
const BRAND_BORDER = BRAND.colors.border
const LOGO_SRC = BRAND.mark

const navItems: NavItem[] = [
  {
    text: 'Overview',
    icon: <TbHome size={ICON_SIZE_TB} />,
    path: '/home',
    section: 'Overview',
    roles: ['customer', 'admin'],
  },
  {
    text: 'Dashboard',
    icon: <TbLayoutDashboard size={ICON_SIZE_TB} />,
    path: '/dashboard',
    section: 'Overview',
    roles: ['customer', 'admin'],
  },
  {
    text: 'Shipments',
    icon: <TbPackage size={ICON_SIZE_TB} />,
    path: '/orders',
    section: 'Execution',
    roles: ['customer', 'admin'],
    children: [
      {
        text: 'All Shipments',
        path: '/orders/list',
        icon: <FaFileAlt size={ICON_SIZE_FA} />,
      },
      {
        text: 'B2C Orders',
        path: '/orders/b2c/list',
        icon: <FaUser size={ICON_SIZE_FA} />,
      },
      {
        text: 'B2B Orders',
        path: '/orders/b2b/list',
        icon: <MdOutlineAddBusiness size={ICON_SIZE_MD} />,
      },
      {
        text: 'Create Order',
        path: '/orders/create',
        icon: <BiListPlus size={ICON_SIZE_BI} />,
      },
    ],
  },
  {
    text: 'Exceptions',
    icon: <TbAlertCircle size={ICON_SIZE_TB} />,
    path: '/ops',
    section: 'Execution',
    roles: ['customer', 'admin'],
    children: [
      { text: 'NDR', path: '/ops/ndr', icon: <MdOutlineWarningAmber size={ICON_SIZE_MD} /> },
      {
        text: 'RTO',
        path: '/ops/rto',
        icon: <MdOutlineKeyboardReturn size={ICON_SIZE_MD} />,
      },
    ],
  },
  {
    text: 'Finance',
    icon: <TbWallet size={ICON_SIZE_TB} />,
    path: '/billing',
    section: 'Finance',
    roles: ['customer', 'admin'],
    children: [
      {
        text: 'Wallet Transactions',
        path: '/billing/wallet_transactions',
        icon: <TbTransactionRupee size={ICON_SIZE_TB} />,
      },
      {
        text: 'COD Settlements',
        path: '/cod-remittance',
        icon: <MdOutlineAccountBalanceWallet size={ICON_SIZE_MD} />,
      },
      {
        text: 'Invoices',
        path: '/billing/invoice_management',
        icon: <TbInvoice size={ICON_SIZE_TB} />,
      },
    ],
  },
  {
    text: 'Audits',
    icon: <TbScale size={ICON_SIZE_TB} />,
    path: '/reconciliation',
    section: 'Finance',
    roles: ['customer', 'admin'],
    children: [
      {
        text: 'Weight Audit',
        path: '/reconciliation/weight',
        icon: <FaBalanceScaleLeft size={ICON_SIZE_FA} />,
      },
      {
        text: 'Audit Rules',
        path: '/reconciliation/weight/settings',
        icon: <RiSettings2Line size={ICON_SIZE_RI} />,
      },
    ],
  },
  {
    text: 'Utilities',
    icon: <TbTools size={ICON_SIZE_TB} />,
    path: '/tools',
    section: 'Toolkit',
    roles: ['customer', 'admin'],
    children: [
      {
        text: 'Rate Chart',
        path: '/tools/rate_card',
        icon: <MdOutlineRateReview size={ICON_SIZE_MD} />,
      },
      {
        text: 'Rate Calculator',
        path: '/tools/rate_calculator',
        icon: <TbReportAnalytics size={ICON_SIZE_TB} />,
      },
      {
        text: 'Track Shipment',
        path: '/tools/order_tracking',
        icon: <CgTrack size={ICON_SIZE_CG} />,
      },
    ],
  },
  {
    text: 'Insights',
    icon: <TbChartBar size={ICON_SIZE_TB} />,
    path: '/reports',
    section: 'Toolkit',
    roles: ['customer', 'admin'],
  },
  {
    text: 'Channels',
    icon: <TbBuildingStore size={ICON_SIZE_TB} />,
    path: '/channels',
    section: 'System',
    roles: ['customer', 'admin'],
    children: [
      {
        text: 'Connected Channels',
        path: '/channels/connected',
        icon: <MdStorefront size={ICON_SIZE_MD} />,
      },
      {
        text: 'Connect Store',
        path: '/channels/channel_list',
        icon: <MdOutlineAddBusiness size={ICON_SIZE_MD} />,
      },
    ],
  },
  {
    text: 'Workspace',
    icon: <TbSettings size={ICON_SIZE_TB} />,
    path: '/settings',
    section: 'System',
    roles: ['customer', 'admin'],
  },
  {
    text: 'Support',
    icon: <TbHelpCircle size={ICON_SIZE_TB} />,
    path: '/support',
    section: 'System',
    roles: ['customer', 'admin'],
    children: [
      {
        text: 'Support Tickets',
        path: '/support/tickets',
        icon: <TbTicket size={ICON_SIZE_TB} />,
      },
      {
        text: `About ${BRAND.name}`,
        path: '/support/about_us',
        icon: <BiInfoCircle size={ICON_SIZE_BI} />,
      },
    ],
  },
]

export default function Sidebar({
  role = 'customer',
  pinned: initialPinned = false,
  fixed = false,
  // onPinChange,
}: SidebarProps) {
  const { pathname } = useLocation()
  const [pinned, setPinned] = useState(initialPinned)
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null)
  const [hoveredItemText, setHoveredItemText] = useState<string | null>(null)
  const [expandedItemText, setExpandedItemText] = useState<string | null>(null)
  const { canViewWallet, canUseRateCalculator } = useEmployeePermissions()

  useEffect(() => {
    setPinned(initialPinned)
  }, [initialPinned])

  // const handlePinToggle = () => {
  //   const newPinned = !pinned
  //   setPinned(newPinned)
  //   onPinChange?.(newPinned)
  // }

  const sidebarWidth = pinned ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH
  const shouldShowExpanded = pinned

  const filteredItems = useMemo(() => {
    return navItems
      .filter((item) => item.roles.includes(role))
      .map((item) => {
        if (!item.children?.length) return item

        const children = item.children.filter((child) => {
          if (child.path === '/billing/wallet_transactions') return canViewWallet
          if (child.path === '/tools/rate_calculator') return canUseRateCalculator
          return true
        })

        if (!children.length) return null

        return { ...item, children }
      })
      .filter((item): item is NavItem => Boolean(item))
  }, [canUseRateCalculator, canViewWallet, role])

  const handlePopoverOpen = (event: React.MouseEvent<HTMLElement>, itemText: string) => {
    setAnchorEl(event.currentTarget)
    setHoveredItemText(itemText)
  }

  const handlePopoverClose = () => {
    setAnchorEl(null)
    setHoveredItemText(null)
  }

  return (
    <Box
      sx={{
        width: sidebarWidth,
        minWidth: sidebarWidth,
        height: '100dvh',
        position: fixed ? 'fixed' : 'sticky',
        top: 0,
        left: fixed ? 0 : 'auto',
        display: 'flex',
        flexDirection: 'column',
        background: BRAND_SURFACE,
        color: BRAND_INK,
        borderRight: `1px solid ${BRAND_BORDER}`,
        boxShadow: '10px 0 30px rgba(6, 26, 51, 0.06)',
        zIndex: 1200,
        overflowY: 'auto',
        overflowX: 'hidden',
        transition:
          'width 300ms cubic-bezier(0.4, 0, 0.2, 1), min-width 300ms cubic-bezier(0.4, 0, 0.2, 1)',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: '0 0 auto 0',
          height: 3,
          background: brandStripe,
          zIndex: 1,
        },
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent={shouldShowExpanded ? 'space-between' : 'center'}
        sx={{
          px: shouldShowExpanded ? 1.5 : 1,
          py: shouldShowExpanded ? 1.5 : 0.75,
          borderBottom: `1px solid ${BRAND_BORDER}`,
          flexShrink: 0,
        }}
      >
        <Box
          sx={{
            width: shouldShowExpanded ? 48 : 40,
            height: shouldShowExpanded ? 48 : 40,
            borderRadius: 1.5,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Box
            component="img"
            src={LOGO_SRC}
            alt={BRAND.name}
            sx={{ width: '90%', height: '90%', objectFit: 'contain' }}
          />
        </Box>
        {shouldShowExpanded && (
          <Box sx={{ flex: 1, minWidth: 0, ml: 1 }}>
            <Typography sx={{ fontSize: '0.9rem', fontWeight: 700, color: BRAND_INK }}>
              {BRAND.name}
            </Typography>
          </Box>
        )}
      </Stack>

      <List
        sx={{
          flex: 1,
          px: shouldShowExpanded ? 0.5 : 0.35,
          py: shouldShowExpanded ? 1 : 0.5,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {filteredItems.map(({ text, icon, path, children }) => {
          const hasChildren = Boolean(children?.length)
          const childActive = children?.some((child) => isActive(child.path, pathname))
          const isActive_ = isActive(path, pathname) || childActive

          return (
            <Box key={text}>
              <Tooltip title={shouldShowExpanded || hasChildren ? '' : text} placement="right">
                <ListItemButton
                  {...(!hasChildren && { component: NavLink, to: path })}
                  aria-label={text}
                  onMouseEnter={(e: React.MouseEvent<HTMLElement>) => {
                    if (hasChildren) {
                      if (!shouldShowExpanded) {
                        // When collapsed, show popover
                        handlePopoverOpen(e, text)
                      } else {
                        // When expanded, toggle the expanded item
                        setExpandedItemText(expandedItemText === text ? null : text)
                      }
                    } else {
                      // Close popover when hovering over items without children
                      handlePopoverClose()
                      setExpandedItemText(null)
                    }
                  }}
                  onMouseLeave={() => {
                    // Close popover with delay to allow interaction
                    if (!shouldShowExpanded && hasChildren) {
                      setTimeout(() => {
                        // Only close if we're not hovering over the popover
                        if (!hoveredItemText) {
                          handlePopoverClose()
                        }
                      }, 200)
                    }
                  }}
                  sx={{
                    minHeight: shouldShowExpanded ? 54 : 52,
                    px: shouldShowExpanded ? 1.5 : 0.25,
                    py: shouldShowExpanded ? 0.75 : 0.5,
                    mb: shouldShowExpanded ? 0.5 : 0.25,
                    borderRadius: 1.25,
                    justifyContent: shouldShowExpanded ? 'flex-start' : 'center',
                    alignItems: 'center',
                    flexDirection: shouldShowExpanded ? 'row' : 'column',
                    gap: shouldShowExpanded ? 0 : 0.4,
                    background: isActive_
                      ? `linear-gradient(135deg, ${BRAND_ORANGE} 0%, ${BRAND.colors.tealDark} 100%)`
                      : 'transparent',
                    border: `1px solid ${isActive_ ? BRAND_ORANGE : 'transparent'}`,
                    color: isActive_ ? '#FFFFFF' : BRAND.colors.text,
                    boxShadow: isActive_ ? `0 8px 18px ${alpha(BRAND_ORANGE, 0.2)}` : 'none',
                    transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                    position: 'relative',
                    overflow: 'hidden',
                    '&:hover': {
                      background: isActive_
                        ? `linear-gradient(135deg, ${BRAND_ORANGE} 0%, ${BRAND.colors.tealDark} 100%)`
                        : alpha(BRAND_ORANGE, 0.055),
                      borderColor: isActive_ ? BRAND_ORANGE : alpha(BRAND_INK, 0.12),
                      color: isActive_ ? '#FFFFFF' : BRAND_INK,
                      transform: 'translateX(2px)',
                      boxShadow: isActive_
                        ? `0 8px 18px ${alpha(BRAND_ORANGE, 0.24)}`
                        : `0 4px 12px ${alpha(BRAND_INK, 0.07)}`,
                    },
                  }}
                >
                  <ListItemIcon
                    sx={{
                      width: shouldShowExpanded ? 34 : 30,
                      height: shouldShowExpanded ? 34 : 30,
                      minWidth: shouldShowExpanded ? 34 : 30,
                      mr: shouldShowExpanded ? 1.25 : 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderRadius: 1,
                      background: isActive_ ? BRAND_ACCENT : alpha(BRAND_ORANGE, 0.08),
                      color: isActive_ ? '#FFFFFF' : BRAND.colors.muted,
                      boxShadow: isActive_ ? `0 5px 12px ${alpha(BRAND_ACCENT, 0.28)}` : 'none',
                      flexShrink: 0,
                      transition: 'all 200ms ease',
                    }}
                  >
                    {icon}
                  </ListItemIcon>
                  {shouldShowExpanded ? (
                    <ListItemText
                      primary={text}
                      slotProps={{
                        primary: {
                          sx: {
                            fontSize: '0.86rem',
                            fontWeight: isActive_ ? 700 : 600,
                            color: 'inherit',
                          },
                        },
                      }}
                    />
                  ) : (
                    <Typography
                      component="span"
                      sx={{
                        width: '100%',
                        color: 'inherit',
                        fontFamily: '"Inter", "Segoe UI", sans-serif',
                        fontSize: '0.67rem',
                        fontWeight: isActive_ ? 800 : 650,
                        lineHeight: 1.1,
                        letterSpacing: '-0.015em',
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {text}
                    </Typography>
                  )}
                </ListItemButton>
              </Tooltip>
              {hasChildren && shouldShowExpanded && (
                <Collapse in={expandedItemText === text} timeout="auto" unmountOnExit>
                  <List component="div" disablePadding sx={{ pl: 2 }}>
                    {children?.map((child) => {
                      const childIsActive = isActive(child.path, pathname)
                      return (
                        <ListItemButton
                          key={child.path}
                          component={NavLink}
                          to={child.path}
                          sx={{
                            minHeight: 44,
                            px: 1.5,
                            mb: 0.25,
                            borderRadius: 1,
                            color: childIsActive ? BRAND_ORANGE : '#64748B',
                            background: childIsActive ? alpha(BRAND_ORANGE, 0.08) : 'transparent',
                            border: `1px solid ${childIsActive ? alpha(BRAND_ORANGE, 0.2) : alpha(BRAND_INK, 0.08)}`,
                            fontSize: '0.85rem',
                            fontWeight: childIsActive ? 600 : 500,
                            '&:hover': {
                              background: childIsActive
                                ? alpha(BRAND_ORANGE, 0.12)
                                : alpha(BRAND_ORANGE, 0.05),
                              borderColor: childIsActive
                                ? alpha(BRAND_ORANGE, 0.3)
                                : alpha(BRAND_INK, 0.12),
                              color: childIsActive ? BRAND_ORANGE : BRAND_INK,
                            },
                          }}
                        >
                          <ListItemIcon
                            sx={{
                              minWidth: 32,
                              color: childIsActive ? BRAND_ORANGE : BRAND_INK,
                              fontSize: '1rem',
                            }}
                          >
                            {child.icon}
                          </ListItemIcon>
                          <ListItemText primary={child.text} />
                        </ListItemButton>
                      )
                    })}
                  </List>
                </Collapse>
              )}
            </Box>
          )
        })}
      </List>

      {/* Custom Dropdown Menu for collapsed sidebar */}
      {hoveredItemText && anchorEl && !shouldShowExpanded && (
        <Box
          onMouseEnter={() => setHoveredItemText(hoveredItemText)}
          onMouseLeave={handlePopoverClose}
          sx={{
            position: 'fixed',
            zIndex: 1300,
            left: `${sidebarWidth + 8}px`,
            top: anchorEl.getBoundingClientRect().top,
            background: BRAND_SURFACE,
            border: `1px solid ${BRAND_BORDER}`,
            borderRadius: 2,
            boxShadow: '0 8px 32px rgba(0,0,0,0.12)',
            minWidth: 220,
            animation: 'fadeInSlide 300ms cubic-bezier(0.34, 1.56, 0.64, 1)',
            '@keyframes fadeInSlide': {
              from: {
                opacity: 0,
                transform: 'translateX(-8px)',
              },
              to: {
                opacity: 1,
                transform: 'translateX(0)',
              },
            },
          }}
        >
          <List sx={{ py: 1 }}>
            {filteredItems
              .find((item) => item.text === hoveredItemText)
              ?.children?.map((child) => {
                const active = isActive(child.path, pathname)
                return (
                  <ListItemButton
                    key={child.path}
                    component={NavLink}
                    to={child.path}
                    onClick={handlePopoverClose}
                    sx={{
                      px: 1.5,
                      py: 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 1.5,
                      background: active ? alpha(BRAND_ORANGE, 0.08) : 'transparent',
                      color: active ? BRAND_ORANGE : BRAND_INK,
                      transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                      borderRadius: 1,
                      position: 'relative',
                      overflow: 'hidden',
                      '&::before': {
                        content: '""',
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: active ? '3px' : '0px',
                        height: active ? '60%' : '0%',
                        background: BRAND_ORANGE,
                        borderRadius: '0 2px 2px 0',
                        transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                      },
                      '&:hover': {
                        background: active ? alpha(BRAND_ORANGE, 0.15) : alpha(BRAND_INK, 0.06),
                        transform: 'translateX(4px)',
                        '&::before': {
                          height: '70%',
                        },
                      },
                    }}
                  >
                    {child.icon && (
                      <Box
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'inherit',
                          fontSize: '1.2rem',
                        }}
                      >
                        {child.icon}
                      </Box>
                    )}
                    <Typography variant="body2" sx={{ fontWeight: active ? 600 : 500 }}>
                      {child.text}
                    </Typography>
                  </ListItemButton>
                )
              })}
          </List>
        </Box>
      )}
    </Box>
  )
}
