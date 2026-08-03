import {
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useCallback, useEffect, useState } from 'react'
import { FiLock, FiMail, FiSend } from 'react-icons/fi'
import { BRAND } from '../../config/brand'
import { useRequestOtp } from '../../hooks/useOTP'
import { extractScreenOtp, type OtpResponseLike } from '../../utils/authOtp'
import { TERMS_AND_CONDITIONS } from '../../utils/constants'
import CustomCheckbox from '../UI/inputs/CustomCheckbox'
import CustomModal from '../UI/modal/CustomModal'
import { toast } from '../UI/Toast'
import OtpForm from './OtpForm'
import PasswordLoginForm from './PasswordLoginForm'

const { ink, paper } = BRAND.colors
const teal = '#3454d1'
const tealDark = '#2947ae'
const orange = '#ef6c00'
const tealSoft = '#edf2ff'

type AuthMode = 'otp' | 'password'

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    minHeight: 52,
    borderRadius: 1.25,
    background: paper,
    color: ink,
    boxShadow: `inset 0 1px 0 ${alpha('#ffffff', 0.9)}`,
    '& fieldset': {
      borderColor: alpha('#5b7796', 0.28),
    },
    '&:hover fieldset': {
      borderColor: alpha(teal, 0.55),
    },
    '&.Mui-focused fieldset': {
      borderColor: teal,
      borderWidth: 1.5,
    },
  },
  '& .MuiOutlinedInput-input': {
    py: 1.35,
    fontSize: 16,
    color: ink,
    fontWeight: 500,
    '&::placeholder': {
      color: '#7890ad',
      opacity: 0.82,
    },
  },
  '& .MuiFormHelperText-root': {
    ml: 0,
    mt: 0.65,
    fontWeight: 600,
  },
}

const tabButtonSx = {
  minHeight: 52,
  minWidth: 0,
  borderRadius: 1,
  textTransform: 'none',
  fontWeight: 900,
  fontSize: { xs: 13, sm: 15 },
  gap: { xs: 0.65, sm: 1 },
  px: { xs: 0.75, sm: 1.4 },
  whiteSpace: 'nowrap',
  '& svg': {
    flexShrink: 0,
  },
}

export default function PhoneForm() {
  const activeEmail = sessionStorage.getItem('activeEmail')
  const [authMode, setAuthMode] = useState<AuthMode>('otp')
  const [otpStep, setOtpStep] = useState<number>(0)
  const [passwordStep, setPasswordStep] = useState<number>(0)
  const [email, setEmail] = useState('')
  const [termsChecked, setTermsChecked] = useState(false)
  const [openTerms, setOpenTerms] = useState(false)
  const [debugOtp, setDebugOtp] = useState('')

  const { mutate: sendOtpRequest, isPending } = useRequestOtp()

  const handleEmailChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value.trim())
    setDebugOtp('')
  }, [])

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  const isValidEmail = email.length > 0 && emailRegex.test(email)

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()

      if (!termsChecked) {
        toast.open({
          message: 'Please accept the Terms and Conditions to continue.',
          severity: 'warning',
          position: { vertical: 'top', horizontal: 'center' },
        })
        return
      }

      const normalizedEmail = email.toLowerCase().trim()

      sendOtpRequest(normalizedEmail, {
        onSuccess: (data: OtpResponseLike) => {
          const otpFromResponse = extractScreenOtp(data)
          setDebugOtp(otpFromResponse)
          sessionStorage.setItem('preferredMethod', 'email_otp')
          setOtpStep(1)
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error || 'OTP request failed'
          toast.open({
            message: msg,
            severity: 'error',
            position: { vertical: 'top', horizontal: 'center' },
          })
        },
      })
    },
    [email, termsChecked, sendOtpRequest],
  )

  useEffect(() => {
    if (activeEmail) setEmail(activeEmail)
  }, [activeEmail])

  const termsLabel = (
    <Typography component="span" fontSize="15px" color="#263a59" sx={{ lineHeight: 1.45 }}>
      I agree to{' '}
      <Link
        component="button"
        type="button"
        underline="hover"
        onClick={(event) => {
          event.preventDefault()
          setOpenTerms(true)
        }}
        sx={{
          cursor: 'pointer',
          color: teal,
          fontWeight: 900,
          verticalAlign: 'baseline',
        }}
      >
        Terms and Conditions
      </Link>
    </Typography>
  )

  const termsModal = (
    <CustomModal open={openTerms} onClose={() => setOpenTerms(false)} title="Terms and Conditions">
      <Typography
        variant="body2"
        sx={{
          whiteSpace: 'pre-line',
          maxHeight: '60vh',
          overflowY: 'auto',
          pr: 1,
          color: ink,
        }}
      >
        {TERMS_AND_CONDITIONS}
      </Typography>
    </CustomModal>
  )

  if (authMode === 'otp' && otpStep === 1) {
    return (
      <>
        <OtpForm email={email} debugOtp={debugOtp} onDebugOtpChange={setDebugOtp} onEditEmail={() => setOtpStep(0)} />
        {termsModal}
      </>
    )
  }

  return (
    <Stack spacing={{ xs: 1.35, md: 1.45 }} alignItems="stretch" sx={{ minWidth: 0 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))' },
          minWidth: 0,
          gap: 0,
          overflow: 'hidden',
          borderRadius: 1.4,
          background: '#f2f5fb',
        }}
      >
        <Button
          type="button"
          onClick={() => setAuthMode('otp')}
          sx={{
            ...tabButtonSx,
            position: 'relative',
            color: authMode === 'otp' ? orange : '#596582',
            border: 0,
            background: authMode === 'otp' ? paper : 'transparent',
            boxShadow: 'none',
            '&::after': authMode === 'otp' ? {
              content: '""',
              position: 'absolute',
              right: 0,
              bottom: 0,
              left: 0,
              height: 3,
              background: orange,
            } : {},
            '&:hover': {
              background: authMode === 'otp' ? paper : alpha(tealSoft, 0.44),
            },
          }}
        >
          <FiMail size={20} />
          Login with OTP
        </Button>
        <Button
          type="button"
          onClick={() => setAuthMode('password')}
          sx={{
            ...tabButtonSx,
            position: 'relative',
            color: authMode === 'password' ? orange : '#596582',
            border: 0,
            background: authMode === 'password' ? paper : 'transparent',
            boxShadow: 'none',
            '&::after': authMode === 'password' ? {
              content: '""',
              position: 'absolute',
              right: 0,
              bottom: 0,
              left: 0,
              height: 3,
              background: orange,
            } : {},
            '&:hover': {
              background: authMode === 'password' ? paper : alpha(tealSoft, 0.44),
            },
          }}
        >
          <FiLock size={19} />
          <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>
            Login with Password
          </Box>
          <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>
            Password
          </Box>
        </Button>
      </Box>

      {authMode === 'otp' ? (
        <Box component="form" onSubmit={handleSubmit} width="100%">
          <Stack spacing={{ xs: 1.35, md: 1.45 }}>
            <Box>
              <Typography sx={{ color: '#081932', fontSize: 14, fontWeight: 900, mb: 0.9 }}>
                Email address <Box component="span" sx={{ color: orange }}>*</Box>
              </Typography>
              <TextField
                type="email"
                value={email}
                name="email"
                id="email"
                onChange={handleEmailChange}
                required
                error={email.length > 0 && !isValidEmail}
                helperText={email.length > 0 && !isValidEmail ? 'Enter a valid email address.' : ''}
                placeholder="you@company.com"
                autoFocus
                fullWidth
                sx={fieldSx}
                slotProps={{
                  input: {
                    startAdornment: (
                      <InputAdornment position="start" sx={{ color: '#385373', mr: 0.7 }}>
                        <FiMail size={22} />
                      </InputAdornment>
                    ),
                  },
                }}
              />
            </Box>

            <FormControlLabel
              sx={{ m: 0, alignItems: 'center' }}
              control={
                <CustomCheckbox
                  checked={termsChecked}
                  onChange={(e) => setTermsChecked(e.target.checked)}
                  color="primary"
                  sx={{ ml: -1 }}
                />
              }
              label={termsLabel}
            />

            <Button
              type="submit"
              disabled={!email || !termsChecked || isPending || !isValidEmail}
              sx={{
                width: '100%',
                minHeight: 50,
                borderRadius: 1,
                textTransform: 'none',
                color: paper,
                fontSize: 15.5,
                fontWeight: 900,
                gap: 1.1,
                background: `linear-gradient(135deg, ${teal} 0%, ${tealDark} 100%)`,
                boxShadow: `0 13px 28px ${alpha(teal, 0.22)}`,
                '&:hover': {
                  background: `linear-gradient(135deg, ${tealDark} 0%, ${teal} 100%)`,
                },
                '&:disabled': {
                  color: paper,
                  background: '#9ca9ba',
                  boxShadow: 'none',
                },
              }}
            >
              {isPending ? <CircularProgress size={18} thickness={4} sx={{ color: 'currentColor' }} /> : <FiSend size={20} />}
              {isPending ? 'Generating...' : 'Send OTP'}
            </Button>
            <Typography sx={{ color: '#7a8799', fontSize: 12.5, lineHeight: 1.5, textAlign: 'center' }}>
              New to Pax? Use OTP and your customer workspace will be created securely.
            </Typography>
          </Stack>
        </Box>
      ) : (
        <PasswordLoginForm setStep={setPasswordStep} step={passwordStep} setOpenTerms={setOpenTerms} />
      )}

      {termsModal}
    </Stack>
  )
}
