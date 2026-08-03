import { ChevronDownIcon } from '@chakra-ui/icons'
import { Box, Button, Collapse, Flex, Stack, Text, useColorModeValue } from '@chakra-ui/react'
import React, { useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { BRAND, brandStripe } from '../../constants/brand'
import BrandMark from '../Brand/BrandMark'

const SidebarContent = ({ logoText, routes, sidebarWidth }) => {
  const location = useLocation()
  const [state, setState] = React.useState({})

  const sidebarBg = useColorModeValue(
    `linear-gradient(180deg, ${BRAND.colors.paper} 0%, ${BRAND.colors.surface} 100%)`,
    `linear-gradient(180deg, ${BRAND.colors.tealDark} 0%, #020D1F 100%)`,
  )
  const sidebarBorder = useColorModeValue(BRAND.colors.border, 'rgba(134,168,211,0.14)')
  const sidebarShadow = useColorModeValue('14px 0 32px rgba(6, 42, 91, 0.09)', '14px 0 34px rgba(2, 13, 31, 0.5)')
  const activeBg = `linear-gradient(135deg, ${BRAND.colors.teal} 0%, ${BRAND.colors.tealDark} 100%)`
  const hoverBg = useColorModeValue('rgba(6,42,91,0.05)', 'rgba(255,255,255,0.05)')
  const activeBorder = useColorModeValue(BRAND.colors.teal, 'rgba(134,168,211,0.32)')
  const hoverBorder = useColorModeValue('rgba(6,42,91,0.12)', 'rgba(255,255,255,0.08)')
  const iconBg = useColorModeValue('rgba(6,42,91,0.08)', 'rgba(255,255,255,0.06)')
  const iconActiveBg = BRAND.colors.orange
  const textColor = useColorModeValue(BRAND.colors.text, 'rgba(255,255,255,0.8)')
  const activeTextColor = 'white'
  const iconColor = useColorModeValue(BRAND.colors.muted, 'rgba(255,255,255,0.56)')
  const dividerColor = useColorModeValue(BRAND.colors.border, 'rgba(255,255,255,0.08)')
  const thumbColor = useColorModeValue('rgba(6,42,91,0.22)', 'rgba(255,255,255,0.18)')
  const brandCardBg = useColorModeValue('rgba(255,255,255,0.92)', 'rgba(255,255,255,0.04)')
  const brandCardBorder = useColorModeValue(BRAND.colors.border, 'rgba(255,255,255,0.08)')
  const brandText = useColorModeValue(BRAND.colors.ink, 'white')
  const collapsedLogoBg = useColorModeValue('rgba(6,42,91,0.08)', 'rgba(255,255,255,0.08)')

  const activeRoute = (routeName) => location.pathname.startsWith(routeName)

  const toggleCollapse = (key) => {
    setState((prev) => ({ [key]: !prev[key] }))
  }

  useEffect(() => {
    routes.forEach((route) => {
      if (route.category && route.views) {
        const isChildActive = route.views.some((view) =>
          location.pathname.startsWith(view.layout + view.path.split('/:')[0]),
        )
        if (isChildActive) {
          setState((prev) => ({ ...prev, [route.state]: true }))
        }
      }
    })
  }, [location.pathname, routes])

  const collapsed = sidebarWidth < 220
  const compact = sidebarWidth >= 220 && sidebarWidth < 270
  const textSize = compact ? '13px' : 'sm'
  const showText = !collapsed

  const renderLinkButton = (prop, isActive) => (
    <Button
      className="sidebar-nav-button"
      aria-label={collapsed ? prop.name : undefined}
      title={collapsed ? prop.name : undefined}
      justifyContent={collapsed ? 'center' : 'flex-start'}
      w="100%"
      bg={isActive ? activeBg : 'transparent'}
      borderRadius="10px"
      mb={collapsed ? '1px' : '2px'}
      px={collapsed ? '2' : '3'}
      py={collapsed ? '5px' : '7px'}
      h="auto"
      minH={collapsed ? '44px' : '50px'}
      border="1px solid"
      borderColor={isActive ? activeBorder : 'transparent'}
      _hover={{
        bg: isActive ? activeBg : hoverBg,
        transform: 'translateX(2px)',
        borderColor: isActive ? activeBorder : hoverBorder,
      }}
      _active={{ transform: 'scale(0.98)' }}
      transition="all 0.2s ease"
    >
      <Flex align="center" justify={collapsed ? 'center' : 'flex-start'} gap={collapsed ? '0' : '10px'} w="100%">
        {prop.icon && (
          <Box
            className="sidebar-nav-icon"
            p={collapsed ? '4px' : '7px'}
            borderRadius="8px"
            bg={isActive ? iconActiveBg : iconBg}
            color={isActive ? '#FFFFFF' : iconColor}
            fontSize="18px"
            minW={collapsed ? '30px' : '34px'}
            minH={collapsed ? '30px' : '34px'}
            display="flex"
            alignItems="center"
            justifyContent="center"
          >
            {prop.icon}
          </Box>
        )}
        {showText && (
          <Text color={isActive ? activeTextColor : textColor} fontWeight={isActive ? '700' : '600'} fontSize={textSize}>
            {prop.name}
          </Text>
        )}
      </Flex>
    </Button>
  )

  const renderLinks = (items) =>
    items
      .filter((prop) => prop.show !== false)
      .map((prop) => {
        if (prop.redirect) return null

        if (prop.category) {
          const isChildActive = prop.views.some((view) =>
            location.pathname.startsWith(view.layout + view.path.split('/:')[0]),
          )

          return (
            <Box key={prop.name} mb={collapsed ? '1px' : '2px'}>
              <Button
                className="sidebar-nav-button"
                aria-label={collapsed ? prop.name : undefined}
                title={collapsed ? prop.name : undefined}
                onClick={() => toggleCollapse(prop.state)}
                justifyContent={collapsed ? 'center' : 'space-between'}
                w="100%"
                bg={isChildActive ? activeBg : 'transparent'}
                borderRadius="10px"
                mb={collapsed ? '1px' : '2px'}
                px={collapsed ? '2' : '3'}
                py={collapsed ? '5px' : '7px'}
                h="auto"
                minH={collapsed ? '44px' : '50px'}
                border="1px solid"
                borderColor={isChildActive ? activeBorder : 'transparent'}
                _hover={{
                  bg: isChildActive ? activeBg : hoverBg,
                  transform: 'translateX(2px)',
                  borderColor: isChildActive ? activeBorder : hoverBorder,
                }}
                transition="all 0.2s ease"
              >
                <Flex align="center" justify={collapsed ? 'center' : 'flex-start'} gap={collapsed ? '0' : '10px'} w="100%">
                  <Box
                    className="sidebar-nav-icon"
                    p={collapsed ? '4px' : '7px'}
                    borderRadius="8px"
                    bg={isChildActive ? iconActiveBg : iconBg}
                    color={isChildActive ? '#FFFFFF' : iconColor}
                    fontSize="18px"
                    minW={collapsed ? '30px' : '34px'}
                    minH={collapsed ? '30px' : '34px'}
                    display="flex"
                    alignItems="center"
                    justifyContent="center"
                  >
                    {prop.icon}
                  </Box>
                  {showText && (
                    <Text
                      color={isChildActive ? activeTextColor : textColor}
                      fontWeight={isChildActive ? '700' : '600'}
                      fontSize={textSize}
                      textAlign="left"
                      flex="1"
                    >
                      {prop.name}
                    </Text>
                  )}
                </Flex>
                {showText && (
                  <Box
                    transition="transform 0.2s"
                    transform={state[prop.state] ? 'rotate(180deg)' : 'rotate(0deg)'}
                    color={isChildActive ? BRAND.colors.teal : iconColor}
                  >
                    <ChevronDownIcon />
                  </Box>
                )}
              </Button>
              <Collapse in={state[prop.state]} animateOpacity>
                <Box pl={showText ? '12px' : '0'} pr={showText ? '8px' : '0'} mt="1">
                  <Stack spacing="1">{renderLinks(prop.views)}</Stack>
                </Box>
              </Collapse>
            </Box>
          )
        }

        const isActive = activeRoute(prop.layout + prop.path)
        return (
          <NavLink to={prop.layout + prop.path} key={prop.name}>
            {renderLinkButton(prop, isActive)}
          </NavLink>
        )
      })

  return (
    <Box
      pt={collapsed ? '8px' : '16px'}
      pb={collapsed ? '8px' : '14px'}
      h="100dvh"
      maxH="100dvh"
      w={`${sidebarWidth}px`}
      bg={sidebarBg}
      borderRight="1px solid"
      borderColor={sidebarBorder}
      boxShadow={sidebarShadow}
      position="fixed"
      left="0"
      top="0"
      zIndex="1200"
      transition="width 0.25s ease"
      overflowY="auto"
      overflowX="hidden"
      pr="2"
      overscrollBehavior="contain"
      css={{
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: '0 0 auto 0',
          height: '4px',
          background: brandStripe,
          zIndex: 1,
        },
        scrollbarWidth: 'thin',
        '&::-webkit-scrollbar': { width: '5px' },
        '&::-webkit-scrollbar-track': { background: 'transparent' },
        '&::-webkit-scrollbar-thumb': {
          background: thumbColor,
          borderRadius: '4px',
        },
        '@media screen and (max-height: 760px)': {
          '& .sidebar-nav-button': {
            minHeight: '38px',
            paddingTop: '3px',
            paddingBottom: '3px',
            marginBottom: '0px',
          },
          '& .sidebar-nav-icon': {
            minWidth: '28px',
            minHeight: '28px',
            padding: '3px',
            fontSize: '17px',
          },
        },
      }}
    >
      <Box mb={collapsed ? '7px' : '14px'} px={collapsed ? '8px' : '12px'} textAlign="center" transition="all 0.3s ease">
        {showText ? (
          <Flex
            align="center"
            justify="flex-start"
            gap="10px"
            px="12px"
            py="12px"
            borderRadius="14px"
            bg={brandCardBg}
            border="1px solid"
            borderColor={brandCardBorder}
          >
            <BrandMark compact showTagline align="start" size={42} />
          </Flex>
        ) : (
          <Box mx="auto" p="2px" borderRadius="10px" bg={collapsedLogoBg}>
            <BrandMark markOnly size={30} />
          </Box>
        )}
      </Box>

      <Box h="1px" bg={dividerColor} mx={collapsed ? '8px' : '14px'} mb={collapsed ? '6px' : '10px'} />

      <Stack direction="column" spacing="0" px={collapsed ? '6px' : '10px'}>
        {renderLinks(routes)}
      </Stack>
    </Box>
  )
}

export default SidebarContent
