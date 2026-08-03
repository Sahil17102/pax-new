import { mode } from '@chakra-ui/theme-tools'
import colors from './foundations/colors'
import { BRAND, brandGradient } from '../constants/brand'

export const globalStyles = {
  colors: {
    ...colors,
  },
  styles: {
    global: (props) => ({
      body: {
        bg: mode(BRAND.colors.surface, BRAND.colors.tealDark)(props),
        color: mode(BRAND.colors.text, 'gray.100')(props),
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        backgroundImage: mode(brandGradient, 'radial-gradient(circle at 10% 8%, rgba(62,106,168,0.14) 0%, transparent 34%), linear-gradient(180deg, #020D1F 0%, #041A38 100%)')(props),
      },
      html: {
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
      },
      '#root': {
        minHeight: '100vh',
      },
      '::selection': {
        background: mode('brand.200', 'brand.600')(props),
      },
    }),
  },
}
