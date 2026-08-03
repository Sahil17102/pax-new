export const BRAND = {
  name: 'Pax Logistics',
  shortName: 'Pax',
  tagline: 'Reaching Further.',
  supportEmail: 'support@expressmagic.in',
  website: 'www.expressmagic.in',
  logo: '/images/pax-logo.png',
  mark: '/images/pax-logo.png',
  colors: {
    teal: '#062A5B',
    tealDark: '#041A38',
    tealSoft: '#EEF4FB',
    bridge: '#0F9AA4',
    aquaSoft: '#E4F7FB',
    orange: '#ED1C24',
    orangeDark: '#B80F1A',
    amberSoft: '#FDE7EA',
    skySoft: '#D9E6F7',
    ink: '#061A33',
    text: '#183153',
    muted: '#64748B',
    paper: '#ffffff',
    surface: '#F5F8FC',
    border: '#D6E1EF',
  },
} as const

export const brandGradient =
  'radial-gradient(circle at 0 0, rgba(6, 42, 91, 0.1), transparent 28%), radial-gradient(circle at 100% 0, rgba(62, 106, 168, 0.12), transparent 30%), linear-gradient(180deg, #ffffff 0%, #F5F8FC 56%, #fbfbfb 100%)'

export const brandStripe = BRAND.colors.teal
