import { Badge, Box, Flex, HStack, SimpleGrid, Stack, Text, useColorModeValue } from '@chakra-ui/react'
import { BRAND, brandStripe } from '../../constants/brand'
import BrandMark from '../Brand/BrandMark'

export default function PageHeader({
  eyebrow = `${BRAND.name} Admin`,
  title,
  description,
  actions = null,
  meta = [],
}) {
  const panelBg = useColorModeValue('rgba(255,255,255,0.96)', 'rgba(4, 26, 56, 0.94)')
  const borderColor = useColorModeValue(BRAND.colors.border, 'rgba(134, 168, 211, 0.18)')
  const titleColor = useColorModeValue(BRAND.colors.ink, 'white')
  const textColor = useColorModeValue(BRAND.colors.muted, 'gray.300')
  const metaBg = useColorModeValue('rgba(6, 42, 91, 0.06)', 'rgba(255, 255, 255, 0.04)')

  return (
    <Box
      position="relative"
      overflow="hidden"
      bg={panelBg}
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="14px"
      px={{ base: 4, md: 6 }}
      py={{ base: 5, md: 6 }}
      boxShadow={useColorModeValue('0 18px 50px rgba(6, 42, 91, 0.09)', '0 22px 60px rgba(2, 6, 23, 0.42)')}
      backdropFilter="blur(14px)"
      _before={{
        content: '""',
        position: 'absolute',
        inset: '0 0 auto 0',
        h: '4px',
        bg: brandStripe,
      }}
    >
      <Box
        as="img"
        src={BRAND.mark}
        alt=""
        aria-hidden="true"
        position="absolute"
        right={{ base: '-28px', md: '22px' }}
        bottom="-34px"
        w={{ base: '130px', md: '170px' }}
        opacity={useColorModeValue(0.035, 0.055)}
        pointerEvents="none"
      />
      <Flex
        position="relative"
        zIndex="1"
        justify="space-between"
        align={{ base: 'flex-start', xl: 'center' }}
        direction={{ base: 'column', xl: 'row' }}
        gap={5}
      >
        <Stack spacing={3} maxW="780px">
          <Badge
            alignSelf="flex-start"
            borderRadius="8px"
            px={3}
            py={1}
            fontSize="11px"
            letterSpacing="0.12em"
            textTransform="uppercase"
            bg="accent.50"
            color="accent.600"
          >
            <HStack spacing={2}>
              <BrandMark markOnly size={18} />
              <Text as="span">{eyebrow}</Text>
            </HStack>
          </Badge>
          <Stack spacing={1.5}>
            <Text fontSize={{ base: '2xl', md: '3xl' }} fontWeight="800" letterSpacing="-0.03em" color={titleColor}>
              {title}
            </Text>
            {description ? (
              <Text color={textColor} fontSize={{ base: 'sm', md: 'md' }} lineHeight="1.7">
                {description}
              </Text>
            ) : null}
          </Stack>
          {meta.length > 0 ? (
            <SimpleGrid columns={{ base: 1, md: 3 }} spacing={3} w="100%">
              {meta.map((item) => (
                <Box
                  key={item.label}
                  px={4}
                  py={3}
                  borderRadius="10px"
                  bg={metaBg}
                  borderWidth="1px"
                  borderColor={borderColor}
                  minW={0}
                >
                  <Text fontSize="xs" textTransform="uppercase" letterSpacing="0.08em" color={textColor} mb={1}>
                    {item.label}
                  </Text>
                  <Text fontSize="lg" fontWeight="700" color={titleColor}>
                    {item.value}
                  </Text>
                </Box>
              ))}
            </SimpleGrid>
          ) : null}
        </Stack>
        {actions ? <Box w={{ base: '100%', xl: 'auto' }}>{actions}</Box> : null}
      </Flex>
    </Box>
  )
}
