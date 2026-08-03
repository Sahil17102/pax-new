import { Box, Flex, Stack, Text, useColorModeValue } from '@chakra-ui/react'
import { BRAND } from '../../constants/brand'

export default function BrandMark({
  compact = false,
  showTagline = false,
  align = 'center',
  size = 40,
  markOnly = false,
}) {
  const titleColor = useColorModeValue(BRAND.colors.ink, 'white')
  const subtitleColor = useColorModeValue(BRAND.colors.muted, 'gray.400')
  const pillBg = useColorModeValue('rgba(6, 42, 91, 0.08)', 'rgba(255, 255, 255, 0.08)')
  const logoBlendMode = useColorModeValue('multiply', 'normal')

  const fittedLogo = (dimension, withBackground = false) => (
    <Box
      w={`${dimension}px`}
      h={`${dimension}px`}
      flexShrink="0"
      position="relative"
      overflow="hidden"
      borderRadius={withBackground ? '14px' : '10px'}
      bg={withBackground ? pillBg : 'transparent'}
    >
      <Box
        as="img"
        src={BRAND.logo}
        alt={BRAND.name}
        position="absolute"
        inset="0"
        w="100%"
        h="100%"
        objectFit="contain"
        objectPosition="center"
        transform="scale(1.42)"
        transformOrigin="center"
        mixBlendMode={logoBlendMode}
      />
    </Box>
  )

  if (markOnly) {
    return fittedLogo(size)
  }

  return (
    <Flex align="center" justify={align} gap={compact ? '10px' : '14px'}>
      {fittedLogo(Math.round(size * 1.1), true)}
      <Stack spacing={0.5} align={align === 'center' ? 'center' : 'start'}>
        <Text fontSize={compact ? 'sm' : 'md'} fontWeight="800" color={titleColor} letterSpacing="-0.02em">
          {BRAND.name}
        </Text>
        {showTagline ? (
          <Text fontSize="xs" fontWeight="700" textTransform="uppercase" letterSpacing="0.12em" color={subtitleColor}>
            Admin Console
          </Text>
        ) : null}
      </Stack>
    </Flex>
  )
}
