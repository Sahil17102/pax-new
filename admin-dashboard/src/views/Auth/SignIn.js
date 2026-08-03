import { ViewIcon, ViewOffIcon } from '@chakra-ui/icons'
import {
  Box,
  Button,
  Checkbox,
  Flex,
  FormControl,
  FormLabel,
  Grid,
  GridItem,
  Heading,
  HStack,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Text,
  VStack,
  useToast,
} from '@chakra-ui/react'
import { jwtDecode } from 'jwt-decode'
import { useEffect, useState } from 'react'
import { FiArrowRight } from 'react-icons/fi'
import { useHistory } from 'react-router-dom'
import { BRAND } from '../../constants/brand'
import { loginAdmin } from '../../services/auth.service'
import { useAuthStore } from '../../store/useAuthStore'

function isTokenValid(token) {
  try {
    const decoded = jwtDecode(token)
    return decoded.exp > Date.now() / 1000
  } catch {
    return false
  }
}

function getLoginErrorMessage(error) {
  const apiError = error?.response?.data?.error
  if (typeof apiError === 'string' && apiError.trim()) return apiError

  const status = error?.response?.status
  const contentType = String(error?.response?.headers?.['content-type'] || '').toLowerCase()
  const receivedHtml = contentType.includes('text/html')

  if (status === 405 || receivedHtml) {
    return 'Backend API deployment is misconfigured. The API URL is serving a frontend app instead of the Express API.'
  }

  if (!error?.response) {
    return 'Cannot reach the backend API. Check the backend service URL, deployment, and CORS settings.'
  }

  return `Admin API request failed (HTTP ${status || 'unknown'}). Check the backend deployment.`
}

function RouteStop({ children, active, done }) {
  return (
    <Box
      border="1px solid"
      borderColor={done ? '#4E6FE3' : active ? '#DCECFF' : 'rgba(255,255,255,.16)'}
      borderRadius="full"
      bg={done ? '#4E6FE3' : active ? '#DCECFF' : 'transparent'}
      boxShadow={active ? '0 0 0 7px rgba(220,236,255,.12)' : 'none'}
      color={done ? 'white' : active ? '#1C355D' : 'rgba(255,255,255,.55)'}
      px="13px"
      py="9px"
      fontSize="10px"
      fontWeight="800"
      whiteSpace="nowrap"
    >
      {children}
    </Box>
  )
}

function PaxAdminBrand({ light = false }) {
  return (
    <HStack spacing="10px">
      <Box
        as="img"
        src={BRAND.logo}
        alt={BRAND.name}
        w="128px"
        h="46px"
        objectFit="contain"
        borderRadius="8px"
        bg={light ? 'white' : 'transparent'}
        px={light ? '8px' : 0}
        py={light ? '5px' : 0}
      />
      <Text
        borderLeft="1px solid"
        borderColor={light ? 'rgba(255,255,255,.25)' : '#D7DDEC'}
        pl="10px"
        color={light ? 'rgba(255,255,255,.75)' : '#65728D'}
        fontSize="10px"
        fontWeight="900"
        letterSpacing=".17em"
      >
        ADMIN
      </Text>
    </HStack>
  )
}

function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const toast = useToast()
  const history = useHistory()
  const login = useAuthStore((state) => state.login)

  useEffect(() => {
    document.title = `${BRAND.name} Admin | Sign In`
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const data = await loginAdmin(email, password)
      login(data.token, data?.user?.id, data.refreshToken)

      toast({
        title: 'Login successful',
        status: 'success',
        duration: 2000,
        isClosable: true,
      })

      history.push('/admin/dashboard')
    } catch (err) {
      toast({
        title: 'Login failed',
        description: getLoginErrorMessage(err),
        status: 'error',
        duration: 3000,
        isClosable: true,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const accessToken = localStorage.getItem('accessToken')
    const refreshToken = localStorage.getItem('refreshToken')

    if (accessToken && refreshToken && isTokenValid(refreshToken)) {
      history.replace('/admin/dashboard')
    }
  }, [history])

  return (
    <Grid
      minH="100vh"
      templateColumns={{ base: '1fr', lg: 'minmax(440px, 1.08fr) minmax(480px, .92fr)' }}
      bg="#F6F8FC"
      color="#172238"
      fontFamily="'DM Sans', Inter, sans-serif"
    >
      <GridItem
        position="relative"
        display={{ base: 'none', lg: 'flex' }}
        minH="100vh"
        flexDirection="column"
        overflow="hidden"
        p="clamp(38px, 5vw, 72px)"
        bg="radial-gradient(circle at 82% 12%, rgba(183,217,245,.32), transparent 25%), radial-gradient(circle at 12% 88%, rgba(78,111,227,.2), transparent 28%), linear-gradient(145deg, #284778 0%, #3454D1 58%, #1C355D 100%)"
        color="white"
        _after={{
          content: '""',
          position: 'absolute',
          inset: 0,
          bgImage:
            'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)',
          bgSize: '48px 48px',
          pointerEvents: 'none',
        }}
      >
        <Box position="relative" zIndex="1">
          <PaxAdminBrand light />
        </Box>

        <Box position="relative" zIndex="1" my="auto" pb="30px">
          <Text mb="11px" color="#B7D9F5" fontSize="11px" fontWeight="900" letterSpacing=".14em">
            OPERATIONS CONTROL CENTRE
          </Text>
          <Heading
            maxW="710px"
            color="white"
            fontFamily="Manrope, Inter, sans-serif"
            fontSize="clamp(3.5rem, 6vw, 6.8rem)"
            lineHeight=".98"
            letterSpacing="-.065em"
          >
            Every parcel.
            <br />
            One clear view.
          </Heading>
          <Text
            display="block"
            maxW="570px"
            mt="26px"
            color="rgba(255,255,255,.66)"
            fontSize="clamp(.95rem, 1.4vw, 1.15rem)"
            lineHeight="1.7"
          >
            Manage customers, monitor movement, resolve exceptions and keep collections on track.
          </Text>
        </Box>

        <Grid
          position="relative"
          zIndex="1"
          templateColumns="auto 1fr auto 1fr auto"
          alignItems="center"
          gap="13px"
          maxW="590px"
          mb="34px"
        >
          <RouteStop done>Pickup</RouteStop>
          <Box h="1px" bg="linear-gradient(90deg, #7FAED3, rgba(255,255,255,.2))" />
          <RouteStop active>HYD Hub</RouteStop>
          <Box h="1px" bg="linear-gradient(90deg, #7FAED3, rgba(255,255,255,.2))" />
          <RouteStop>Delivery</RouteStop>
        </Grid>

        <Text position="relative" zIndex="1" color="rgba(255,255,255,.4)" fontSize="11px">
          Restricted to authorised Pax operations staff.
        </Text>
      </GridItem>

      <GridItem
        display="grid"
        minH="100vh"
        placeItems="center"
        p={{ base: '22px', md: '38px' }}
        bg={{
          base: 'linear-gradient(145deg, #EAF0FF, #F6F8FC 55%, #DCEcff)',
          lg: 'radial-gradient(circle at 100% 0, rgba(202,221,255,.52), transparent 30%), radial-gradient(circle at 2% 100%, rgba(188,220,244,.34), transparent 28%), #F6F8FC',
        }}
      >
        <Box
          as="form"
          onSubmit={handleSubmit}
          w="min(100%, 490px)"
          border="1px solid rgba(52,84,209,.13)"
          borderRadius="24px"
          bg="white"
          boxShadow="0 30px 90px rgba(37,64,112,.13)"
          p="clamp(30px, 5vw, 52px)"
        >
          <Box display={{ base: 'block', lg: 'none' }} mb="32px">
            <PaxAdminBrand />
          </Box>

          <Text mb="11px" color="#3454D1" fontSize="11px" fontWeight="900" letterSpacing=".14em">
            SECURE ADMIN ACCESS
          </Text>
          <Heading
            m="0"
            color="#172238"
            fontFamily="Manrope, Inter, sans-serif"
            fontSize={{ base: '2rem', md: '2.35rem' }}
            letterSpacing="-.045em"
          >
            Welcome back.
          </Heading>
          <Text mt="10px" mb="28px" color="#637083" lineHeight="1.55">
            Sign in with the email and password issued by your Pax administrator.
          </Text>

          <VStack spacing="17px" align="stretch">
            <FormControl isRequired>
              <FormLabel mb="8px" color="#31405C" fontSize="12px" fontWeight="800">
                Admin email
              </FormLabel>
              <Input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Enter admin email"
                autoComplete="username"
                minH="50px"
                borderColor="rgba(52,84,209,.18)"
                borderRadius="10px"
                bg="#F8FAFF"
                px="14px"
                _hover={{ borderColor: '#3454D1' }}
                _focus={{ borderColor: '#3454D1', boxShadow: '0 0 0 4px rgba(52,84,209,.1)' }}
              />
            </FormControl>

            <FormControl isRequired>
              <FormLabel mb="8px" color="#31405C" fontSize="12px" fontWeight="800">
                Password
              </FormLabel>
              <InputGroup>
                <Input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  minH="50px"
                  borderColor="rgba(52,84,209,.18)"
                  borderRadius="10px"
                  bg="#F8FAFF"
                  px="14px"
                  pr="48px"
                  _hover={{ borderColor: '#3454D1' }}
                  _focus={{ borderColor: '#3454D1', boxShadow: '0 0 0 4px rgba(52,84,209,.1)' }}
                />
                <InputRightElement h="50px" pr="8px">
                  <IconButton
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    icon={showPassword ? <ViewOffIcon /> : <ViewIcon />}
                    variant="ghost"
                    size="sm"
                    color="#637083"
                    onClick={() => setShowPassword(!showPassword)}
                    _hover={{ bg: 'rgba(52,84,209,.08)', color: '#3454D1' }}
                  />
                </InputRightElement>
              </InputGroup>
            </FormControl>
          </VStack>

          <Checkbox
            mt="17px"
            isChecked={remember}
            onChange={(event) => setRemember(event.target.checked)}
            color="#637083"
            colorScheme="blue"
            fontSize="12px"
            fontWeight="600"
          >
            Keep me signed in
          </Checkbox>

          <Button
            type="submit"
            w="100%"
            minH="51px"
            mt="19px"
            borderRadius="10px"
            bg="linear-gradient(135deg, #486BDC, #2F50BD)"
            color="white"
            fontWeight="800"
            isLoading={loading}
            loadingText="Connecting"
            rightIcon={<FiArrowRight />}
            boxShadow="0 13px 25px rgba(52,84,209,.2)"
            _hover={{ bg: 'linear-gradient(135deg, #3C5FCF, #2645AA)', transform: 'translateY(-1px)' }}
            _active={{ transform: 'translateY(0)' }}
          >
            Sign in to operations
          </Button>
        </Box>
      </GridItem>
    </Grid>
  )
}

export default SignIn
