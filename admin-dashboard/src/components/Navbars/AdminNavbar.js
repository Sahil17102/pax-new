import {
  Box,
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  Flex,
  Link,
  useColorModeValue,
} from '@chakra-ui/react'
import PropTypes from 'prop-types'
import { BRAND, brandStripe } from '../../constants/brand'
import BrandMark from '../Brand/BrandMark'
import AdminNavbarLinks from './AdminNavbarLinks'

export default function AdminNavbar(props) {
  const { variant, children, fixed, secondary, brandText, onOpen, sidebarWidth = 275, ...rest } = props

  const mainText = useColorModeValue('gray.800', 'gray.100')
  const secondaryText = useColorModeValue('gray.500', 'gray.400')
  const paddingX = '18px'

  const fixedNavbarShadow = useColorModeValue(
    '0 16px 38px rgba(7, 25, 35, 0.08)',
    '0 16px 38px rgba(5, 4, 10, 0.42)',
  )
  const fixedNavbarBg = useColorModeValue(
    'rgba(255,255,255,0.94)',
    'rgba(4,26,56,0.92)',
  )
  const fixedNavbarBorder = useColorModeValue(BRAND.colors.border, 'rgba(134, 168, 211, 0.18)')

  return (
    <Flex
      position="relative"
      zIndex="20"
      boxShadow={fixedNavbarShadow}
      bg={fixedNavbarBg}
      borderColor={fixedNavbarBorder}
      backdropFilter="blur(18px)"
      borderWidth="1px"
      borderStyle="solid"
      transition="all 0.3s ease"
      alignItems={{ xl: 'center' }}
      borderRadius="18px"
      display="flex"
      minH="88px"
      justifyContent={{ xl: 'center' }}
      mx={{ base: '10px', xl: '16px' }}
      mt="14px"
      px={{ sm: paddingX, md: '24px' }}
      py="14px"
      w={{
        base: 'calc(100% - 20px)',
        xl: 'calc(100% - 32px)',
      }}
      overflow="hidden"
      _before={{
        content: '""',
        position: 'absolute',
        inset: '0 0 auto 0',
        h: '4px',
        bg: brandStripe,
      }}
    >
      <Flex w="100%" flexDirection={{ sm: 'column', md: 'row' }} alignItems={{ xl: 'center' }} gap={{ sm: 2, md: 0 }}>
        <Box mb={{ sm: '4px', md: '0px' }} display="flex" alignItems="center" gap="14px">
          <Box display={{ base: 'none', md: 'block' }}>
            <BrandMark compact showTagline align="start" size={40} />
          </Box>

          <Box>
            <Breadcrumb separator="/" spacing="8px" mb="3px">
              <BreadcrumbItem>
                <BreadcrumbLink href="#" color={secondaryText} fontSize="xs" fontWeight="600" _hover={{ color: 'brand.500', textDecoration: 'none' }}>
                  {BRAND.name}
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbItem>
                <BreadcrumbLink href="#" color={mainText} fontSize="xs" fontWeight="700" _hover={{ color: 'brand.500', textDecoration: 'none' }}>
                  {brandText}
                </BreadcrumbLink>
              </BreadcrumbItem>
            </Breadcrumb>

            <Link
              color={mainText}
              href="#"
              bg="inherit"
              borderRadius="inherit"
              fontWeight="800"
              fontSize={{ base: 'lg', md: 'xl' }}
              letterSpacing="-0.01em"
              _hover={{ color: 'brand.500', textDecoration: 'none' }}
              _active={{ bg: 'inherit', transform: 'none', borderColor: 'transparent' }}
              _focus={{ boxShadow: 'none' }}
            >
              {brandText}
            </Link>
          </Box>
        </Box>

        <Box ms="auto" w={{ sm: '100%', md: 'unset' }}>
          <AdminNavbarLinks onOpen={onOpen} logoText={props.logoText} secondary={false} fixed={true} />
        </Box>
      </Flex>
    </Flex>
  )
}

AdminNavbar.propTypes = {
  brandText: PropTypes.string,
  variant: PropTypes.string,
  secondary: PropTypes.bool,
  fixed: PropTypes.bool,
  onOpen: PropTypes.func,
  sidebarWidth: PropTypes.number,
}
