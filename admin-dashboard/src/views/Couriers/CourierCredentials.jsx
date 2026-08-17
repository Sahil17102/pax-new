import {
  Badge,
  Box,
  Button,
  Flex,
  FormControl,
  FormLabel,
  Input,
  Select,
  Spinner,
  Switch,
  Text,
  useToast,
  VStack,
} from '@chakra-ui/react'
import { useEffect, useState } from 'react'
import {
  useCourierCredentials,
  useTestDelhiveryB2BCredentials,
  useUpdateDelhiveryCredentials,
  useUpdateDelhiveryB2BCredentials,
  useUpdateEkartCredentials,
  useTestInnofulfillCredentials,
  useTestInnofulfillRefreshToken,
  useUpdateInnofulfillCredentials,
  useUpdateShadowfaxCredentials,
  useTestXpressbeesCredentials,
  useUpdateXpressbeesCredentials,
} from 'hooks/useCouriers'

const CourierCredentials = () => {
  const toast = useToast()
  const { data, isLoading, error } = useCourierCredentials()
  const updateDelhivery = useUpdateDelhiveryCredentials()
  const updateDelhiveryB2B = useUpdateDelhiveryB2BCredentials()
  const testDelhiveryB2B = useTestDelhiveryB2BCredentials()
  const updateEkart = useUpdateEkartCredentials()
  const updateShadowfax = useUpdateShadowfaxCredentials()
  const updateXpressbees = useUpdateXpressbeesCredentials()
  const testXpressbees = useTestXpressbeesCredentials()
  const updateInnofulfill = useUpdateInnofulfillCredentials()
  const testInnofulfill = useTestInnofulfillCredentials()
  const testInnofulfillRefresh = useTestInnofulfillRefreshToken()

  const [form, setForm] = useState({
    apiBase: '',
    clientName: '',
    apiKey: '',
  })
  const [ekartForm, setEkartForm] = useState({
    apiBase: '',
    clientId: '',
    username: '',
    password: '',
    webhookSecret: '',
  })
  const [delhiveryB2BForm, setDelhiveryB2BForm] = useState({
    apiBase: '',
    username: '',
    password: '',
    clientId: '',
    warehouseId: '',
    freightMode: 'fop',
    fmPickup: true,
  })
  const [xpressbeesForm, setXpressbeesForm] = useState({
    email: '',
    password: '',
  })
  const [xpressbeesTestResult, setXpressbeesTestResult] = useState(null)
  const [shadowfaxForm, setShadowfaxForm] = useState({
    apiBase: '',
    clientName: '',
    apiKey: '',
    webhookSecret: '',
  })
  const [innofulfillForm, setInnofulfillForm] = useState({
    apiBase: '',
    username: '',
    password: '',
    apiKey: '',
    tenantId: '',
    userId: '',
    refreshToken: '',
  })
  const [innofulfillTestResult, setInnofulfillTestResult] = useState(null)
  useEffect(() => {
    if (data?.delhivery) {
      setForm({
        apiBase: data.delhivery.apiBase || '',
        clientName: data.delhivery.clientName || '',
        apiKey: '',
      })
    }
    if (data?.ekart) {
      setEkartForm({
        apiBase: data.ekart.apiBase || '',
        clientId: data.ekart.clientId || '',
        username: data.ekart.username || '',
        password: '',
        webhookSecret: '',
      })
    }
    if (data?.delhiveryB2B) {
      setDelhiveryB2BForm({
        apiBase: data.delhiveryB2B.apiBase || '',
        username: data.delhiveryB2B.username || '',
        password: '',
        clientId: data.delhiveryB2B.clientId || '',
        warehouseId: data.delhiveryB2B.warehouseId || '',
        freightMode: data.delhiveryB2B.freightMode || 'fop',
        fmPickup: data.delhiveryB2B.fmPickup !== false,
      })
    }
    if (data?.xpressbees) {
      setXpressbeesForm({
        email: data.xpressbees.email || data.xpressbees.username || '',
        password: '',
      })
    }
    if (data?.shadowfax) {
      setShadowfaxForm({
        apiBase: data.shadowfax.apiBase || '',
        clientName: data.shadowfax.clientName || '',
        apiKey: '',
        webhookSecret: '',
      })
    }
    if (data?.innofulfill) {
      setInnofulfillForm({
        apiBase: data.innofulfill.apiBase || '',
        username: data.innofulfill.username || '',
        password: '',
        apiKey: '',
        tenantId: data.innofulfill.tenantId || '',
        userId: data.innofulfill.userId || '',
        refreshToken: '',
      })
    }
  }, [data])

  const handleSaveDelhivery = () => {
    updateDelhivery.mutate(
      {
        apiBase: form.apiBase,
        clientName: form.clientName,
        ...(form.apiKey ? { apiKey: form.apiKey } : {}),
      },
      {
        onSuccess: () => {
          toast({
            title: 'Delhivery credentials updated',
            status: 'success',
          })
          setForm((prev) => ({ ...prev, apiKey: '' }))
        },
        onError: (err) => {
          toast({
            title: 'Failed to update credentials',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  const handleSaveEkart = () => {
    updateEkart.mutate(
      {
        apiBase: ekartForm.apiBase,
        clientId: ekartForm.clientId,
        username: ekartForm.username,
        ...(ekartForm.password ? { password: ekartForm.password } : {}),
        ...(ekartForm.webhookSecret ? { webhookSecret: ekartForm.webhookSecret } : {}),
      },
      {
        onSuccess: () => {
          toast({ title: 'Ekart credentials updated', status: 'success' })
          setEkartForm((prev) => ({ ...prev, password: '', webhookSecret: '' }))
        },
        onError: (err) => {
          toast({
            title: 'Failed to update Ekart credentials',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  const handleSaveDelhiveryB2B = () => {
    updateDelhiveryB2B.mutate(
      {
        apiBase: delhiveryB2BForm.apiBase,
        username: delhiveryB2BForm.username,
        clientId: delhiveryB2BForm.clientId,
        warehouseId: delhiveryB2BForm.warehouseId,
        freightMode: delhiveryB2BForm.freightMode,
        fmPickup: delhiveryB2BForm.fmPickup,
        ...(delhiveryB2BForm.password ? { password: delhiveryB2BForm.password } : {}),
      },
      {
        onSuccess: () => {
          toast({ title: 'Delhivery B2B credentials updated', status: 'success' })
          setDelhiveryB2BForm((prev) => ({ ...prev, password: '' }))
        },
        onError: (err) => {
          toast({
            title: 'Failed to update Delhivery B2B credentials',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  const handleTestDelhiveryB2B = () => {
    testDelhiveryB2B.mutate(undefined, {
      onSuccess: (result) => {
        toast({
          title: 'Delhivery B2B connection passed',
          description: `Token valid until ${new Date(result.expiresAt).toLocaleString()}`,
          status: 'success',
        })
      },
      onError: (err) => {
        toast({
          title: 'Delhivery B2B connection failed',
          description: err?.message,
          status: 'error',
        })
      },
    })
  }

  const handleSaveXpressbees = () => {
    updateXpressbees.mutate(
      {
        email: xpressbeesForm.email,
        ...(xpressbeesForm.password ? { password: xpressbeesForm.password } : {}),
      },
      {
        onSuccess: () => {
          toast({ title: 'Xpressbees credentials updated', status: 'success' })
          setXpressbeesTestResult(null)
          setXpressbeesForm((prev) => ({
            ...prev,
            password: '',
          }))
        },
        onError: (err) => {
          toast({
            title: 'Failed to update Xpressbees credentials',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  const handleTestXpressbees = () => {
    testXpressbees.mutate(
      {
        email: xpressbeesForm.email,
        ...(xpressbeesForm.password ? { password: xpressbeesForm.password } : {}),
        origin: '122001',
        destination: '400001',
        paymentType: 'cod',
        orderAmount: '499',
        weight: '500',
      },
      {
        onSuccess: (result) => {
          setXpressbeesTestResult(result)
          toast({
            title: result?.ok
              ? 'Xpressbees connection test passed'
              : 'Xpressbees connection test completed with issues',
            description: result?.ok
              ? 'Auth, courier list, and serviceability checks succeeded.'
              : 'Review the step-by-step result below for the failing check.',
            status: result?.ok ? 'success' : 'warning',
          })
        },
        onError: (err) => {
          toast({
            title: 'Failed to test Xpressbees credentials',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  const handleSaveShadowfax = () => {
    updateShadowfax.mutate(
      {
        apiBase: shadowfaxForm.apiBase,
        clientName: shadowfaxForm.clientName,
        ...(shadowfaxForm.apiKey ? { apiKey: shadowfaxForm.apiKey } : {}),
        ...(shadowfaxForm.webhookSecret ? { webhookSecret: shadowfaxForm.webhookSecret } : {}),
      },
      {
        onSuccess: () => {
          toast({ title: 'Shadowfax credentials updated', status: 'success' })
          setShadowfaxForm((prev) => ({ ...prev, apiKey: '', webhookSecret: '' }))
        },
        onError: (err) => {
          toast({
            title: 'Failed to update Shadowfax credentials',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  const handleSaveInnofulfill = () => {
    updateInnofulfill.mutate(
      {
        apiBase: innofulfillForm.apiBase,
        username: innofulfillForm.username,
        tenantId: innofulfillForm.tenantId,
        userId: innofulfillForm.userId,
        ...(innofulfillForm.password ? { password: innofulfillForm.password } : {}),
        ...(innofulfillForm.apiKey ? { apiKey: innofulfillForm.apiKey } : {}),
        ...(innofulfillForm.refreshToken ? { refreshToken: innofulfillForm.refreshToken } : {}),
      },
      {
        onSuccess: () => {
          toast({ title: 'Innofulfill credentials updated', status: 'success' })
          setInnofulfillTestResult(null)
          setInnofulfillForm((prev) => ({ ...prev, password: '', apiKey: '', refreshToken: '' }))
        },
        onError: (err) => {
          toast({
            title: 'Failed to update Innofulfill credentials',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  const handleTestInnofulfill = () => {
    testInnofulfill.mutate(
      {
        apiBase: innofulfillForm.apiBase,
        username: innofulfillForm.username,
        password: innofulfillForm.password,
        apiKey: innofulfillForm.apiKey,
        tenantId: innofulfillForm.tenantId,
        userId: innofulfillForm.userId,
        refreshToken: innofulfillForm.refreshToken,
      },
      {
        onSuccess: (result) => {
          setInnofulfillTestResult(result)
          toast({
            title: 'Innofulfill connection test passed',
            description: result?.tenantId
              ? `Tenant ${result.tenantId} authenticated successfully.`
              : 'Authentication details were accepted.',
            status: 'success',
          })
        },
        onError: (err) => {
          toast({
            title: 'Failed to test Innofulfill credentials',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  const handleRefreshInnofulfillToken = () => {
    testInnofulfillRefresh.mutate(
      {
        apiBase: innofulfillForm.apiBase,
        username: innofulfillForm.username,
        password: innofulfillForm.password,
        apiKey: innofulfillForm.apiKey,
        tenantId: innofulfillForm.tenantId,
        userId: innofulfillForm.userId,
        refreshToken: innofulfillForm.refreshToken,
      },
      {
        onSuccess: (result) => {
          setInnofulfillTestResult(result)
          toast({
            title: 'Innofulfill token refreshed',
            description: 'The rotated refresh token was saved on the backend.',
            status: 'success',
          })
          setInnofulfillForm((prev) => ({ ...prev, refreshToken: '' }))
        },
        onError: (err) => {
          toast({
            title: 'Failed to refresh Innofulfill token',
            description: err?.message,
            status: 'error',
          })
        },
      },
    )
  }

  if (isLoading) return <Spinner size="md" />
  if (error) return <Text color="red.500">Failed to load courier credentials</Text>

  return (
    <Flex direction="column" pt={{ base: '120px', md: '75px' }} gap={4}>
      <Text fontSize="xl" fontWeight="bold">
        Courier Credentials
      </Text>

      <Flex gap={4} flexWrap="wrap">
        <Box
          borderWidth="1px"
          borderRadius="lg"
          p={5}
          minW="320px"
          flex="1"
          maxW="520px"
          mb={{ base: 4, md: 0 }}
        >
          <VStack spacing={4} align="stretch">
            <Flex justify="space-between" align="center">
              <Text fontWeight="semibold">Delhivery</Text>
              <Badge colorScheme={data?.delhivery?.hasApiKey ? 'green' : 'orange'}>
                {data?.delhivery?.hasApiKey ? 'Configured' : 'Missing API Key'}
              </Badge>
            </Flex>

            <FormControl>
              <FormLabel>API Base URL</FormLabel>
              <Input
                value={form.apiBase}
                onChange={(e) => setForm((prev) => ({ ...prev, apiBase: e.target.value }))}
                placeholder="https://track.delhivery.com"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Client Name</FormLabel>
              <Input
                value={form.clientName}
                onChange={(e) => setForm((prev) => ({ ...prev, clientName: e.target.value }))}
                placeholder="Your Delhivery client name"
              />
            </FormControl>

            <FormControl>
              <FormLabel>API Key</FormLabel>
              <Input
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                placeholder={data?.delhivery?.apiKeyMasked || 'Enter Delhivery API key'}
              />
              {!!data?.delhivery?.apiKeyMasked && (
                <Text fontSize="xs" color="gray.500" mt={1}>
                  Current key: {data.delhivery.apiKeyMasked}
                </Text>
              )}
            </FormControl>

            <Text fontSize="xs" color="gray.500">
              Standard Delhivery credentials. Leave the API key blank to keep the existing secret.
            </Text>

            <Button
              colorScheme="blue"
              onClick={handleSaveDelhivery}
              isLoading={updateDelhivery.isPending}
              alignSelf="flex-start"
            >
              Save Delhivery Credentials
            </Button>
          </VStack>
        </Box>

        <Box borderWidth="1px" borderRadius="lg" p={5} minW="320px" flex="1" maxW="520px">
          <VStack spacing={4} align="stretch">
            <Flex justify="space-between" align="center">
              <Text fontWeight="semibold">Delhivery B2B (LTL)</Text>
              <Badge colorScheme={data?.delhiveryB2B?.hasPassword ? 'green' : 'orange'}>
                {data?.delhiveryB2B?.hasPassword ? 'Credentials set' : 'Missing password'}
              </Badge>
            </Flex>

            <FormControl>
              <FormLabel>API Base URL</FormLabel>
              <Input
                value={delhiveryB2BForm.apiBase}
                onChange={(e) =>
                  setDelhiveryB2BForm((prev) => ({ ...prev, apiBase: e.target.value }))
                }
                placeholder="https://ltl-clients-api.delhivery.com"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Username</FormLabel>
              <Input
                value={delhiveryB2BForm.username}
                onChange={(e) =>
                  setDelhiveryB2BForm((prev) => ({ ...prev, username: e.target.value }))
                }
                placeholder="Registered Delhivery account username"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Password</FormLabel>
              <Input
                type="password"
                value={delhiveryB2BForm.password}
                onChange={(e) =>
                  setDelhiveryB2BForm((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Leave blank to keep the saved password"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Client ID</FormLabel>
              <Input
                value={delhiveryB2BForm.clientId}
                onChange={(e) =>
                  setDelhiveryB2BForm((prev) => ({ ...prev, clientId: e.target.value }))
                }
                placeholder="Delhivery B2B client ID"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Warehouse ID</FormLabel>
              <Input
                value={delhiveryB2BForm.warehouseId}
                onChange={(e) =>
                  setDelhiveryB2BForm((prev) => ({ ...prev, warehouseId: e.target.value }))
                }
                placeholder="Default Delhivery warehouse ID"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Freight Mode</FormLabel>
              <Select
                value={delhiveryB2BForm.freightMode}
                onChange={(e) =>
                  setDelhiveryB2BForm((prev) => ({ ...prev, freightMode: e.target.value }))
                }
              >
                <option value="fop">FOP</option>
                <option value="fod">FOD</option>
              </Select>
            </FormControl>

            <FormControl display="flex" alignItems="center">
              <Switch
                isChecked={delhiveryB2BForm.fmPickup}
                onChange={(e) =>
                  setDelhiveryB2BForm((prev) => ({ ...prev, fmPickup: e.target.checked }))
                }
                mr={3}
              />
              <FormLabel mb="0">Request first-mile pickup by default</FormLabel>
            </FormControl>

            <Text fontSize="xs" color="gray.500">
              JWT login is cached for its 24-hour lifetime. Leave password blank to keep the
              existing secret.
            </Text>

            <Flex gap={3} flexWrap="wrap">
              <Button
                colorScheme="blue"
                onClick={handleSaveDelhiveryB2B}
                isLoading={updateDelhiveryB2B.isPending}
              >
                Save Delhivery B2B Credentials
              </Button>
              <Button
                colorScheme="blue"
                variant="outline"
                onClick={handleTestDelhiveryB2B}
                isLoading={testDelhiveryB2B.isPending}
                isDisabled={!data?.delhiveryB2B?.hasPassword}
              >
                Test Connection
              </Button>
            </Flex>
          </VStack>
        </Box>

        <Box borderWidth="1px" borderRadius="lg" p={5} minW="320px" flex="1" maxW="520px">
          <VStack spacing={4} align="stretch">
            <Flex justify="space-between" align="center">
              <Text fontWeight="semibold">Shadowfax</Text>
              <Badge colorScheme={data?.shadowfax?.hasApiKey ? 'green' : 'orange'}>
                {data?.shadowfax?.hasApiKey ? 'Configured' : 'Missing API Key'}
              </Badge>
            </Flex>

            <FormControl>
              <FormLabel>API Base URL</FormLabel>
              <Input
                value={shadowfaxForm.apiBase}
                onChange={(e) =>
                  setShadowfaxForm((prev) => ({ ...prev, apiBase: e.target.value }))
                }
                placeholder="https://dale.shadowfax.in/api"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Client Name</FormLabel>
              <Input
                value={shadowfaxForm.clientName}
                onChange={(e) =>
                  setShadowfaxForm((prev) => ({ ...prev, clientName: e.target.value }))
                }
                placeholder="Your Shadowfax client/account name"
              />
            </FormControl>

            <FormControl>
              <FormLabel>API Token</FormLabel>
              <Input
                type="password"
                value={shadowfaxForm.apiKey}
                onChange={(e) =>
                  setShadowfaxForm((prev) => ({ ...prev, apiKey: e.target.value }))
                }
                placeholder={data?.shadowfax?.apiKeyMasked || 'Enter Shadowfax API token'}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Webhook Secret</FormLabel>
              <Input
                type="password"
                value={shadowfaxForm.webhookSecret}
                onChange={(e) =>
                  setShadowfaxForm((prev) => ({ ...prev, webhookSecret: e.target.value }))
                }
                placeholder="Optional shared webhook secret"
              />
            </FormControl>

            <Button
              colorScheme="blue"
              onClick={handleSaveShadowfax}
              isLoading={updateShadowfax.isPending}
              alignSelf="flex-start"
            >
              Save Shadowfax Credentials
            </Button>
          </VStack>
        </Box>

        <Box borderWidth="1px" borderRadius="lg" p={5} minW="320px" flex="1" maxW="520px">
          <VStack spacing={4} align="stretch">
            <Flex justify="space-between" align="center">
              <Text fontWeight="semibold">Ekart Logistics</Text>
              <Badge colorScheme={data?.ekart?.hasPassword ? 'green' : 'orange'}>
                {data?.ekart?.hasPassword ? 'Credentials set' : 'Missing password'}
              </Badge>
            </Flex>

            <FormControl>
              <FormLabel>API Base URL</FormLabel>
              <Input
                value={ekartForm.apiBase}
                onChange={(e) => setEkartForm((prev) => ({ ...prev, apiBase: e.target.value }))}
                placeholder="https://app.elite.ekartlogistics.in"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Client ID</FormLabel>
              <Input
                value={ekartForm.clientId}
                onChange={(e) => setEkartForm((prev) => ({ ...prev, clientId: e.target.value }))}
                placeholder="Your Ekart client ID"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Username</FormLabel>
              <Input
                value={ekartForm.username}
                onChange={(e) => setEkartForm((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="Ekart username"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Password</FormLabel>
              <Input
                type="password"
                value={ekartForm.password}
                onChange={(e) => setEkartForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Enter Ekart password (saved securely)"
              />
            </FormControl>

            <Text fontSize="xs" color="gray.500">
              Ekart requires client ID + username/password for token generation. Leave password blank to keep the saved secret.
            </Text>

            <Box borderTopWidth="1px" pt={4}>
              <Text fontWeight="semibold" mb={3}>
                Webhook Setup
              </Text>

              <FormControl mb={3}>
                <FormLabel>Webhook URL</FormLabel>
                <Input
                  value={
                    data?.ekart?.webhookConfig?.trackingUrl ||
                    'https://api.fgship.in/api/webhook/ekart'
                  }
                  isReadOnly
                />
                {!!data?.ekart?.webhookConfig?.trackAliasUrl && (
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Alias: {data.ekart.webhookConfig.trackAliasUrl}
                  </Text>
                )}
              </FormControl>

              <FormControl mb={3}>
                <FormLabel>Secret</FormLabel>
                <Input
                  value={ekartForm.webhookSecret}
                  onChange={(e) =>
                    setEkartForm((prev) => ({ ...prev, webhookSecret: e.target.value }))
                  }
                  type="password"
                  placeholder="Leave blank to keep existing webhook secret"
                />
                {data?.ekart?.hasWebhookSecret && (
                  <Text fontSize="xs" color="gray.500" mt={1}>
                    Webhook secret already configured on Ekart.
                  </Text>
                )}
              </FormControl>

              <Text fontSize="xs" color="gray.500" mb={1}>
                Topics: {(data?.ekart?.webhookConfig?.suggestedTopics || []).join(', ') || 'tracking_updates'}
              </Text>
              <Text fontSize="xs" color="gray.500">
                Alert email: use your monitored ops/support inbox in the Ekart portal.
              </Text>
            </Box>

            <Button
              colorScheme="blue"
              onClick={handleSaveEkart}
              isLoading={updateEkart.isPending}
              alignSelf="flex-start"
            >
              Save Ekart Credentials
            </Button>
          </VStack>
        </Box>

        <Box borderWidth="1px" borderRadius="lg" p={5} minW="320px" flex="1" maxW="520px">
          <VStack spacing={4} align="stretch">
            <Flex justify="space-between" align="center">
              <Text fontWeight="semibold">Xpressbees</Text>
              <Badge
                colorScheme={
                  data?.xpressbees?.email && data?.xpressbees?.hasPassword ? 'green' : 'orange'
                }
              >
                {data?.xpressbees?.email && data?.xpressbees?.hasPassword
                  ? 'Email login set'
                  : 'Missing email login'}
              </Badge>
            </Flex>

            <FormControl>
              <FormLabel>Email</FormLabel>
              <Input
                value={xpressbeesForm.email}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, email: e.target.value }))
                }
                placeholder="ops@example.com"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Password</FormLabel>
              <Input
                type="password"
                value={xpressbeesForm.password}
                onChange={(e) =>
                  setXpressbeesForm((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Leave blank to keep existing password"
              />
            </FormControl>

            <Text fontSize="xs" color="gray.500">
              Xpressbees authenticates with email and password only. Leave password blank to keep
              the saved password.
            </Text>

            <Text fontSize="xs" color="gray.500">
              Connection test uses a sample COD lane from `122001` to `400001` with `500g`
              weight, and it does not create a shipment.
            </Text>

            {xpressbeesTestResult && (
              <Box borderWidth="1px" borderRadius="md" p={3}>
                <Flex justify="space-between" align="center" gap={3} mb={3}>
                  <Text fontWeight="semibold">Latest Connection Test</Text>
                  <Badge colorScheme={xpressbeesTestResult.ok ? 'green' : 'orange'}>
                    {xpressbeesTestResult.ok ? 'Passed' : 'Needs attention'}
                  </Badge>
                </Flex>

                <Text fontSize="xs" color="gray.500" mb={3}>
                  Sample lane: {xpressbeesTestResult.sampleServiceability?.origin} to{' '}
                  {xpressbeesTestResult.sampleServiceability?.destination} (
                  {String(xpressbeesTestResult.sampleServiceability?.paymentType || '').toUpperCase()}
                  )
                </Text>

                <VStack spacing={2} align="stretch">
                  {(xpressbeesTestResult.checks || []).map((check) => (
                    <Flex key={check.key} justify="space-between" align="flex-start" gap={3}>
                      <Box>
                        <Text fontSize="sm" fontWeight="semibold">
                          {check.key === 'auth'
                            ? 'Auth'
                            : check.key === 'couriers'
                              ? 'Courier List'
                              : 'Serviceability'}
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                          {check.message}
                        </Text>
                      </Box>
                      <Badge colorScheme={check.ok ? 'green' : 'red'}>
                        {check.statusCode ? `HTTP ${check.statusCode}` : check.ok ? 'OK' : 'Failed'}
                      </Badge>
                    </Flex>
                  ))}
                </VStack>
              </Box>
            )}

            <Flex gap={3} flexWrap="wrap">
              <Button
                colorScheme="blue"
                variant="outline"
                onClick={handleTestXpressbees}
                isLoading={testXpressbees.isPending}
                alignSelf="flex-start"
              >
                Test Xpressbees Connection
              </Button>

              <Button
                colorScheme="blue"
                onClick={handleSaveXpressbees}
                isLoading={updateXpressbees.isPending}
                alignSelf="flex-start"
              >
                Save Xpressbees Credentials
              </Button>
            </Flex>
          </VStack>
        </Box>

        <Box borderWidth="1px" borderRadius="lg" p={5} minW="320px" flex="1" maxW="520px">
          <VStack spacing={4} align="stretch">
            <Flex justify="space-between" align="center">
              <Text fontWeight="semibold">Innofulfill</Text>
              <Badge
                colorScheme={
                  data?.innofulfill?.hasApiKey ||
                  (data?.innofulfill?.username && data?.innofulfill?.hasPassword)
                    ? 'green'
                    : 'orange'
                }
              >
                {data?.innofulfill?.hasApiKey
                  ? 'API key set'
                  : data?.innofulfill?.username && data?.innofulfill?.hasPassword
                    ? 'Email login set'
                    : 'Missing credentials'}
              </Badge>
            </Flex>

            <FormControl>
              <FormLabel>API Base URL</FormLabel>
              <Input
                value={innofulfillForm.apiBase}
                onChange={(e) =>
                  setInnofulfillForm((prev) => ({ ...prev, apiBase: e.target.value }))
                }
                placeholder="https://apis.innofulfill.com"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Email Username</FormLabel>
              <Input
                value={innofulfillForm.username}
                onChange={(e) =>
                  setInnofulfillForm((prev) => ({ ...prev, username: e.target.value }))
                }
                placeholder="user@example.com"
              />
            </FormControl>

            <FormControl>
              <FormLabel>Password</FormLabel>
              <Input
                type="password"
                value={innofulfillForm.password}
                onChange={(e) =>
                  setInnofulfillForm((prev) => ({ ...prev, password: e.target.value }))
                }
                placeholder="Leave blank to keep existing password"
              />
            </FormControl>

            <FormControl>
              <FormLabel>API Key</FormLabel>
              <Input
                type="password"
                value={innofulfillForm.apiKey}
                onChange={(e) =>
                  setInnofulfillForm((prev) => ({ ...prev, apiKey: e.target.value }))
                }
                placeholder={data?.innofulfill?.apiKeyMasked || 'Optional API key'}
              />
            </FormControl>

            <FormControl>
              <FormLabel>Tenant ID</FormLabel>
              <Input
                value={innofulfillForm.tenantId}
                onChange={(e) =>
                  setInnofulfillForm((prev) => ({ ...prev, tenantId: e.target.value }))
                }
                placeholder="tnt_..."
              />
            </FormControl>

            <FormControl>
              <FormLabel>User ID</FormLabel>
              <Input
                value={innofulfillForm.userId}
                onChange={(e) =>
                  setInnofulfillForm((prev) => ({ ...prev, userId: e.target.value }))
                }
                placeholder="usr_..."
              />
            </FormControl>

            <FormControl>
              <FormLabel>Refresh Token</FormLabel>
              <Input
                type="password"
                value={innofulfillForm.refreshToken}
                onChange={(e) =>
                  setInnofulfillForm((prev) => ({ ...prev, refreshToken: e.target.value }))
                }
                placeholder={
                  data?.innofulfill?.refreshTokenMasked || 'Optional rotated refresh token'
                }
              />
              {data?.innofulfill?.hasRefreshToken && (
                <Text fontSize="xs" color="gray.500" mt={1}>
                  Current refresh token: {data.innofulfill.refreshTokenMasked}
                </Text>
              )}
            </FormControl>

            <Text fontSize="xs" color="gray.500">
              Email login calls `/auth/login` with `signinType: EMAIL`; the returned ID token is
              used as a Bearer token for authenticated Innofulfill calls. Refresh tokens are
              single-use and are rotated server-side after each successful refresh.
            </Text>

            {innofulfillTestResult && (
              <Box borderWidth="1px" borderRadius="md" p={3}>
                <Flex justify="space-between" align="center" gap={3}>
                  <Text fontWeight="semibold">Latest Connection Test</Text>
                  <Badge colorScheme="green">{innofulfillTestResult.auth}</Badge>
                </Flex>
                <Text fontSize="xs" color="gray.500" mt={2}>
                  User: {innofulfillTestResult.userId || 'n/a'} | Tenant:{' '}
                  {innofulfillTestResult.tenantId || 'n/a'}
                </Text>
              </Box>
            )}

            <Flex gap={3} flexWrap="wrap">
              <Button
                colorScheme="blue"
                variant="outline"
                onClick={handleTestInnofulfill}
                isLoading={testInnofulfill.isPending}
              >
                Test Innofulfill Login
              </Button>
              <Button
                colorScheme="blue"
                variant="outline"
                onClick={handleRefreshInnofulfillToken}
                isLoading={testInnofulfillRefresh.isPending}
                isDisabled={!innofulfillForm.refreshToken && !data?.innofulfill?.hasRefreshToken}
              >
                Refresh Token
              </Button>
              <Button
                colorScheme="blue"
                onClick={handleSaveInnofulfill}
                isLoading={updateInnofulfill.isPending}
              >
                Save Innofulfill Credentials
              </Button>
            </Flex>
          </VStack>
        </Box>

      </Flex>
    </Flex>
  )
}

export default CourierCredentials
