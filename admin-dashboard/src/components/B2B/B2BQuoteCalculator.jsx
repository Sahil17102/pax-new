import {
  Box,
  Button,
  Divider,
  FormControl,
  FormLabel,
  Input,
  NumberInput,
  NumberInputField,
  Select,
  SimpleGrid,
  Table,
  Tbody,
  Td,
  Text,
  Tr,
  useColorModeValue,
  useToast,
  VStack,
} from '@chakra-ui/react'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { b2bAdminService } from '../../services/b2bAdmin.service'
import Card from '../Card/Card'
import CardBody from '../Card/CardBody'
import CardHeader from '../Card/CardHeader'

const B2BQuoteCalculator = ({ planId }) => {
  const toast = useToast()
  const [formData, setFormData] = useState({
    originPincode: '',
    destinationPincode: '',
    weightKg: '',
    length: '',
    width: '',
    height: '',
    invoiceValue: '',
    paymentMode: 'PREPAID',
    courierId: '',
    serviceProvider: '',
  })
  const [quoteResult, setQuoteResult] = useState(null)
  const [isCalculating, setIsCalculating] = useState(false)

  const { data: couriers = [] } = useQuery({
    queryKey: ['couriers'],
    queryFn: () => fetch('/api/couriers').then((r) => r.json()),
  })

  const handleCalculate = async () => {
    if (!formData.originPincode || !formData.destinationPincode || !formData.weightKg) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill in origin, destination, and weight',
        status: 'error',
        duration: 3000,
      })
      return
    }

    setIsCalculating(true)
    try {
      const result = await b2bAdminService.calculateRate({
        originPincode: formData.originPincode,
        destinationPincode: formData.destinationPincode,
        weightKg: Number(formData.weightKg),
        length: formData.length ? Number(formData.length) : undefined,
        width: formData.width ? Number(formData.width) : undefined,
        height: formData.height ? Number(formData.height) : undefined,
        invoiceValue: formData.invoiceValue ? Number(formData.invoiceValue) : undefined,
        paymentMode: formData.paymentMode,
        courier_id: formData.courierId || undefined,
        service_provider: formData.serviceProvider || undefined,
        plan_id: planId || undefined,
      })
      setQuoteResult(result)
    } catch (error) {
      toast({
        title: 'Calculation failed',
        description: error.message,
        status: 'error',
        duration: 5000,
      })
    } finally {
      setIsCalculating(false)
    }
  }

  const bgColor = useColorModeValue('white', 'gray.800')
  const cardBg = useColorModeValue('blue.50', 'blue.900')

  return (
    <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6}>
      <Card bg={bgColor}>
        <CardHeader>
          <Text fontSize="lg" fontWeight="bold">
            Quote Calculator
          </Text>
        </CardHeader>
        <CardBody>
          <VStack spacing={4} align="stretch">
            <SimpleGrid columns={2} spacing={4}>
              <FormControl isRequired>
                <FormLabel>Origin Pincode</FormLabel>
                <Input
                  value={formData.originPincode}
                  onChange={(e) => setFormData({ ...formData, originPincode: e.target.value })}
                  placeholder="110001"
                />
              </FormControl>
              <FormControl isRequired>
                <FormLabel>Destination Pincode</FormLabel>
                <Input
                  value={formData.destinationPincode}
                  onChange={(e) => setFormData({ ...formData, destinationPincode: e.target.value })}
                  placeholder="400001"
                />
              </FormControl>
            </SimpleGrid>

            <SimpleGrid columns={2} spacing={4}>
              <FormControl isRequired>
                <FormLabel>Weight (kg)</FormLabel>
                <NumberInput
                  value={formData.weightKg}
                  onChange={(_, value) => setFormData({ ...formData, weightKg: value })}
                  min={0}
                >
                  <NumberInputField />
                </NumberInput>
              </FormControl>
              <FormControl>
                <FormLabel>Payment Mode</FormLabel>
                <Select
                  value={formData.paymentMode}
                  onChange={(e) => setFormData({ ...formData, paymentMode: e.target.value })}
                >
                  <option value="PREPAID">Prepaid</option>
                  <option value="COD">COD</option>
                </Select>
              </FormControl>
            </SimpleGrid>

            <Text fontSize="sm" fontWeight="semibold" color="gray.600">
              Dimensions (optional, for volumetric weight)
            </Text>
            <SimpleGrid columns={3} spacing={4}>
              <FormControl>
                <FormLabel>Length (cm)</FormLabel>
                <NumberInput
                  value={formData.length}
                  onChange={(_, value) => setFormData({ ...formData, length: value })}
                >
                  <NumberInputField />
                </NumberInput>
              </FormControl>
              <FormControl>
                <FormLabel>Width (cm)</FormLabel>
                <NumberInput
                  value={formData.width}
                  onChange={(_, value) => setFormData({ ...formData, width: value })}
                >
                  <NumberInputField />
                </NumberInput>
              </FormControl>
              <FormControl>
                <FormLabel>Height (cm)</FormLabel>
                <NumberInput
                  value={formData.height}
                  onChange={(_, value) => setFormData({ ...formData, height: value })}
                >
                  <NumberInputField />
                </NumberInput>
              </FormControl>
            </SimpleGrid>

            <SimpleGrid columns={2} spacing={4}>
              <FormControl>
                <FormLabel>Invoice Value (₹)</FormLabel>
                <NumberInput
                  value={formData.invoiceValue}
                  onChange={(_, value) => setFormData({ ...formData, invoiceValue: value })}
                >
                  <NumberInputField />
                </NumberInput>
              </FormControl>
              <FormControl>
                <FormLabel>Courier</FormLabel>
                <Select
                  placeholder="All Couriers"
                  value={formData.courierId}
                  onChange={(e) => setFormData({ ...formData, courierId: e.target.value })}
                >
                  {couriers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </FormControl>
            </SimpleGrid>

            <FormControl>
              <FormLabel>Service Provider</FormLabel>
              <Select
                placeholder="Select Service Provider"
                value={formData.serviceProvider}
                onChange={(e) => setFormData({ ...formData, serviceProvider: e.target.value })}
              >
                <option value="innofulfill">Innofulfill</option>
              </Select>
            </FormControl>

            <Button
              colorScheme="blue"
              size="lg"
              onClick={handleCalculate}
              isLoading={isCalculating}
            >
              Calculate Quote
            </Button>
          </VStack>
        </CardBody>
      </Card>

      {quoteResult && (
        <Card bg={cardBg}>
          <CardHeader>
            <Text fontSize="lg" fontWeight="bold">
              Quote Breakdown
            </Text>
          </CardHeader>
          <CardBody>
            <VStack spacing={4} align="stretch">
              <Box>
                <Text fontSize="sm" color="gray.600" mb={2}>
                  Route
                </Text>
                <Text fontWeight="semibold">
                  {quoteResult.origin?.zoneCode} ({quoteResult.origin?.zoneName}) →{' '}
                  {quoteResult.destination?.zoneCode} ({quoteResult.destination?.zoneName})
                </Text>
              </Box>

              {quoteResult.calculation && (
                <Box>
                  <Text fontSize="sm" color="gray.600" mb={2}>
                    Weight Calculation
                  </Text>
                  <SimpleGrid columns={2} spacing={2} fontSize="sm">
                    <Text>Actual Weight: {quoteResult.calculation.actualWeight} kg</Text>
                    <Text>
                      Volumetric Weight: {quoteResult.calculation.volumetricWeight.toFixed(2)} kg
                    </Text>
                    <Text>
                      Billable Weight: {quoteResult.calculation.billableWeight.toFixed(2)} kg
                    </Text>
                    <Text>
                      {quoteResult.calculation.usedVolumetric
                        ? '✓ Using volumetric'
                        : 'Using actual'}
                    </Text>
                  </SimpleGrid>
                </Box>
              )}

              <Divider />

              <Box>
                <Text fontSize="sm" color="gray.600" mb={2}>
                  Charges Breakdown
                </Text>
                <Table size="sm" variant="simple">
                  <Tbody>
                    <Tr>
                      <Td fontWeight="semibold">Base Freight</Td>
                      <Td isNumeric>₹{quoteResult.charges.baseFreight.toFixed(2)}</Td>
                    </Tr>
                    {quoteResult.charges.overheads.map((overhead) => (
                      <Tr key={overhead.id}>
                        <Td>{overhead.name}</Td>
                        <Td isNumeric>₹{overhead.amount.toFixed(2)}</Td>
                      </Tr>
                    ))}
                    <Tr borderTop="2px solid" borderColor="gray.300">
                      <Td fontWeight="bold">Total</Td>
                      <Td isNumeric fontWeight="bold">
                        ₹{quoteResult.charges.total.toFixed(2)}
                      </Td>
                    </Tr>
                  </Tbody>
                </Table>
              </Box>
            </VStack>
          </CardBody>
        </Card>
      )}
    </SimpleGrid>
  )
}

export default B2BQuoteCalculator
