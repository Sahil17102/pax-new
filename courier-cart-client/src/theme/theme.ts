import { alpha, createTheme } from '@mui/material/styles'
import { BRAND, brandGradient } from '../config/brand'

const {
  teal,
  tealDark,
  tealSoft,
  orange,
  orangeDark,
  amberSoft,
  skySoft,
  ink,
  text,
  muted,
  paper,
  surface,
  border,
} = BRAND.colors

const theme = createTheme({
  breakpoints: {
    values: {
      xs: 300,
      sm: 600,
      md: 900,
      lg: 1200,
      xl: 1536,
    },
  },
  palette: {
    mode: 'light',
    primary: {
      main: teal,
      light: '#1F5C9E',
      dark: tealDark,
      contrastText: '#ffffff',
    },
    secondary: {
      main: orange,
      light: amberSoft,
      dark: orangeDark,
      contrastText: '#ffffff',
    },
    background: {
      default: surface,
      paper,
    },
    text: {
      primary: ink,
      secondary: muted,
      disabled: '#94a3b8',
    },
    divider: border,
    error: {
      main: orange,
      dark: orangeDark,
    },
    warning: {
      main: orange,
    },
    info: {
      main: teal,
    },
    success: {
      main: '#0F5A8A',
    },
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily: '"Inter", "Segoe UI", sans-serif',
    h1: { color: ink, fontWeight: 700, letterSpacing: 0 },
    h2: { color: ink, fontWeight: 700, letterSpacing: 0 },
    h3: { color: ink, fontWeight: 600, letterSpacing: 0 },
    h4: { color: ink, fontWeight: 600, letterSpacing: 0 },
    h5: { color: ink, fontWeight: 600, letterSpacing: 0 },
    h6: { color: ink, fontWeight: 600, letterSpacing: 0 },
    subtitle1: { color: text, fontWeight: 600, letterSpacing: 0 },
    subtitle2: { color: muted, fontWeight: 600, letterSpacing: '0.02em' },
    body1: { color: text, lineHeight: 1.65, letterSpacing: 0 },
    body2: { color: muted, lineHeight: 1.55, letterSpacing: 0 },
    button: { fontWeight: 600, textTransform: 'none', letterSpacing: 0 },
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        ':root': {
          colorScheme: 'light',
        },
        body: {
          color: ink,
          background: brandGradient,
        },
        '#root': {
          minHeight: '100vh',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
        rounded: {
          borderRadius: 8,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          position: 'relative',
          overflow: 'hidden',
          borderRadius: 8,
          backgroundColor: alpha(paper, 0.96),
          border: `1px solid ${alpha(teal, 0.14)}`,
          boxShadow: '0 18px 48px rgba(6, 26, 51, 0.08)',
        },
      },
    },
    MuiContainer: {
      styleOverrides: {
        root: {
          paddingLeft: '0 !important',
          paddingRight: '0 !important',
        },
      },
    },
    MuiButton: {
      defaultProps: {
        disableElevation: true,
      },
      styleOverrides: {
        root: {
          borderRadius: 8,
          paddingInline: 18,
          minHeight: 42,
          fontWeight: 600,
          '&.Mui-disabled': {
            opacity: 0.72,
          },
        },
        containedPrimary: {
          background: teal,
          color: '#ffffff',
          '&:hover': {
            background: '#123763',
            boxShadow: `0 14px 30px ${alpha(teal, 0.24)}`,
          },
        },
        containedSecondary: {
          background: `linear-gradient(135deg, ${orange} 0%, ${orangeDark} 100%)`,
          color: '#ffffff',
          '&:hover': {
            background: `linear-gradient(135deg, ${orangeDark} 0%, #9F0D17 100%)`,
            boxShadow: `0 14px 30px ${alpha(orange, 0.26)}`,
          },
        },
        outlined: {
          borderWidth: 1,
          borderColor: alpha(teal, 0.22),
          color: teal,
          backgroundColor: alpha(paper, 0.82),
          '&:hover': {
            borderWidth: 1,
            borderColor: alpha(teal, 0.36),
            backgroundColor: alpha(teal, 0.06),
          },
        },
        text: {
          color: teal,
          '&:hover': {
            backgroundColor: alpha(teal, 0.06),
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          fontWeight: 600,
          letterSpacing: '0.02em',
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: 'outlined',
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: alpha('#f8fcfd', 0.98),
          transition: 'border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease',
          '& fieldset': {
            borderColor: alpha(teal, 0.14),
          },
          '&:hover fieldset': {
            borderColor: alpha(teal, 0.3),
          },
          '&.Mui-focused': {
            backgroundColor: paper,
            boxShadow: `0 0 0 4px ${alpha(teal, 0.08)}`,
          },
          '&.Mui-focused fieldset': {
            borderColor: teal,
          },
        },
        input: {
          paddingTop: 13,
          paddingBottom: 13,
        },
      },
    },
    MuiInputLabel: {
      styleOverrides: {
        root: {
          color: muted,
          fontWeight: 500,
          '&.Mui-focused': {
            color: teal,
          },
        },
      },
    },
    MuiAppBar: {
      styleOverrides: {
        root: {
          backgroundColor: alpha(paper, 0.92),
          color: ink,
          border: `1px solid ${alpha(teal, 0.12)}`,
          backdropFilter: 'blur(16px)',
          boxShadow: '0 12px 32px rgba(7, 25, 35, 0.06)',
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          backgroundImage: 'none',
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: alpha(teal, 0.12),
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
    MuiTableHead: {
      styleOverrides: {
        root: {
          backgroundColor: tealSoft,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          color: ink,
          fontWeight: 700,
          fontSize: '0.78rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          borderBottom: `1px solid ${alpha(teal, 0.14)}`,
        },
        body: {
          color: text,
          borderBottom: `1px solid ${alpha(teal, 0.1)}`,
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': {
            backgroundColor: alpha(skySoft, 0.18),
          },
        },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        toolbar: {
          paddingInline: 8,
        },
      },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: {
          height: 3,
          borderRadius: 2,
          background: teal,
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          minHeight: 46,
          fontWeight: 600,
          color: muted,
          '&.Mui-selected': {
            color: teal,
          },
        },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          border: `1px solid ${alpha(teal, 0.14)}`,
          boxShadow: '0 28px 70px rgba(7, 25, 35, 0.14)',
        },
      },
    },
    MuiPopover: {
      styleOverrides: {
        paper: {
          borderRadius: 8,
          border: `1px solid ${alpha(teal, 0.14)}`,
          boxShadow: '0 24px 50px rgba(7, 25, 35, 0.12)',
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 8,
        },
      },
    },
  },
})

export default theme
