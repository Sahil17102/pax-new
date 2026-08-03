import { Box, Flex, Text, useColorModeValue } from '@chakra-ui/react'
import { BRAND, brandStripe } from '../../constants/brand'

export default function MetricTile({
  icon,
  label,
  value,
  accent = 'brand.500',
  muted,
  onClick,
  active = false,
}) {
  const bg = useColorModeValue('white', 'rgba(14, 23, 43, 0.9)')
  const borderColor = active
    ? useColorModeValue('rgba(6, 42, 91, 0.34)', 'rgba(237, 28, 36, 0.36)')
    : useColorModeValue('rgba(148, 163, 184, 0.24)', 'rgba(148, 163, 184, 0.16)')
  const titleColor = useColorModeValue('gray.500', 'gray.400')
  const valueColor = useColorModeValue('gray.800', 'white')

  return (
    <Flex
      position="relative"
      overflow="hidden"
      direction="column"
      justify="flex-start"
      w="100%"
      minW={0}
      minH={{ base: '142px', md: '148px' }}
      p={{ base: 4, md: 4 }}
      borderRadius="18px"
      borderWidth="1px"
      borderColor={borderColor}
      bg={bg}
      boxShadow={useColorModeValue('0 14px 34px rgba(15, 23, 42, 0.05)', '0 16px 40px rgba(2, 8, 23, 0.32)')}
      cursor={onClick ? 'pointer' : 'default'}
      transition="transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease"
      _hover={
        onClick
          ? {
              transform: 'translateY(-2px)',
              borderColor: useColorModeValue('rgba(6, 42, 91, 0.26)', 'rgba(237, 28, 36, 0.28)'),
              boxShadow: useColorModeValue('0 18px 40px rgba(6, 42, 91, 0.12)', '0 20px 48px rgba(2, 8, 23, 0.42)'),
            }
          : undefined
      }
      onClick={onClick}
      _before={{
        content: '""',
        position: 'absolute',
        inset: '0 0 auto 0',
        h: '3px',
        bg: brandStripe,
      }}
    >
      <Box
        as="img"
        src={BRAND.mark}
        alt=""
        aria-hidden="true"
        position="absolute"
        right="-12px"
        bottom="-18px"
        w="86px"
        opacity={useColorModeValue(0.025, 0.045)}
        pointerEvents="none"
      />
      <Flex position="relative" zIndex="1" align="flex-start" justify="space-between" gap={3} mb={2.5} minW={0}>
        <Text
          minW={0}
          pt={1}
          fontSize="xs"
          fontWeight="700"
          lineHeight="1.35"
          textTransform="uppercase"
          letterSpacing="0.08em"
          whiteSpace="normal"
          wordBreak="normal"
          overflowWrap="break-word"
          color={titleColor}
        >
          {label}
        </Text>
        <Flex
          flexShrink={0}
          align="center"
          justify="center"
          w="42px"
          h="42px"
          borderRadius="16px"
          bg={useColorModeValue('rgba(6, 42, 91, 0.08)', 'rgba(255,255,255,0.06)')}
          color={accent}
        >
          {icon}
        </Flex>
      </Flex>
      <Box position="relative" zIndex="1" minW={0} mt="auto">
        <Text
          fontSize={{ base: '2xl', md: '3xl' }}
          fontWeight="800"
          lineHeight="1.15"
          letterSpacing="0"
          whiteSpace="normal"
          wordBreak="normal"
          overflowWrap="break-word"
          color={valueColor}
        >
          {value}
        </Text>
        {muted ? (
          <Text
            mt={1.5}
            fontSize="sm"
            lineHeight="1.45"
            whiteSpace="normal"
            wordBreak="normal"
            overflowWrap="break-word"
            color={titleColor}
          >
            {muted}
          </Text>
        ) : null}
      </Box>
    </Flex>
  )
}
