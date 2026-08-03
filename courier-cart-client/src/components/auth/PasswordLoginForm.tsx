/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  InputAdornment,
  Link,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import { useState, type Dispatch, type SetStateAction } from 'react'
import { FiLock, FiMail, FiShield } from 'react-icons/fi'
import { MdInfoOutline } from 'react-icons/md'
import { BRAND } from '../../config/brand'
import { useAuth } from '../../context/auth/AuthContext'
import { useRequestPasswordLogin } from '../../hooks/useRequestPasswordLogin'
import CustomCheckbox from '../UI/inputs/CustomCheckbox'
import { toast } from '../UI/Toast'
import EmailVerificationForm from './EmailVerificationForm'
import PasswordResetDialog from './PasswordResetDialog'

const { ink, muted, paper } = BRAND.colors
const teal = '#3454d1'
const tealDark = '#2947ae'
const orange = '#ef6c00'
const tealSoft = '#edf2ff'

const fieldSx = {
  '& .MuiOutlinedInput-root': {
    minHeight: 56,
    borderRadius: 1.25,
    background: paper,
    color: ink,
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
    py: 1.55,
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

interface IPasswordFormProps {
  setStep: Dispatch<SetStateAction<number>>
  step: number
  setOpenTerms: Dispatch<SetStateAction<boolean>>
}

export default function PasswordLoginForm({ setStep, step, setOpenTerms }: IPasswordFormProps) {
  const { setTokens, setUserId } = useAuth()
  const { mutate: requestPasswordLogin, isPending } = useRequestPasswordLogin()

  const [emailForm, setEmailForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({ email: '', password: '' })
  const [touched, setTouched] = useState({ email: false, password: false })
  const [termsChecked, setTermsChecked] = useState(false)
  const [openPasswordReset, setOpenPasswordReset] = useState(false)

  const validateEmail = (email: string): string => {
    if (!email) return 'Email is required.'
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) return 'Enter a valid email format.'
    return ''
  }

  const validatePassword = (password: string): string => {
    if (!password) return 'Password is required.'
    if (password.length < 6) return 'Minimum 6 characters required.'
    return ''
  }

  const handleChange = (field: 'email' | 'password', value: string) => {
    setEmailForm((prev) => ({ ...prev, [field]: value }))

    if (touched[field]) {
      const error = field === 'email' ? validateEmail(value) : validatePassword(value)
      setErrors((prev) => ({ ...prev, [field]: error }))
    }
  }

  const handleBlur = (field: 'email' | 'password') => {
    setTouched((prev) => ({ ...prev, [field]: true }))
    const value = emailForm[field]
    const error = field === 'email' ? validateEmail(value) : validatePassword(value)
    setErrors((prev) => ({ ...prev, [field]: error }))
  }

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
        sx={{ cursor: 'pointer', color: teal, fontWeight: 900 }}
      >
        Terms and Conditions
      </Link>
    </Typography>
  )

  const isFormValid = !validateEmail(emailForm.email) && !validatePassword(emailForm.password)

  const handleSubmit = (event?: React.FormEvent) => {
    event?.preventDefault()

    if (!termsChecked) {
      toast.open({
        message: 'Please accept the Terms and Conditions to continue.',
        severity: 'warning',
        position: { vertical: 'top', horizontal: 'center' },
      })
      return
    }

    const emailError = validateEmail(emailForm.email)
    const passwordError = validatePassword(emailForm.password)

    setErrors({ email: emailError, password: passwordError })
    setTouched({ email: true, password: true })

    if (!emailError && !passwordError) {
      sessionStorage.setItem('preferredMethod', 'password')

      requestPasswordLogin(
        { email: emailForm.email, password: emailForm.password },
        {
          onSuccess: ({ message, token, refreshToken, user }) => {
            if (message) {
              toast.open({
                message,
                severity: 'success',
                position: { vertical: 'top', horizontal: 'center' },
              })
            }

            if (message?.includes('Verification email sent')) {
              setStep(1)
              return
            }

            setUserId(user?.id)
            setTokens(token, refreshToken, user)
          },
          onError: (error: any) => {
            toast.open({
              message: error?.response?.data?.error || 'Something went wrong',
              severity: 'error',
              position: { vertical: 'top', horizontal: 'center' },
            })
          },
        },
      )
    }
  }

  return (
    <>
      {step === 0 ? (
        <Stack component="form" onSubmit={handleSubmit} width="100%" spacing={{ xs: 1.55, md: 1.75 }}>
          <Box
            sx={{
              display: 'none',
              gridTemplateColumns: '58px 1fr',
              gap: 1.55,
              alignItems: 'center',
              p: { xs: 1.5, md: 1.65 },
              borderRadius: 1.25,
              border: `1px solid ${alpha(teal, 0.12)}`,
              background: `linear-gradient(135deg, ${alpha(tealSoft, 0.72)} 0%, ${alpha(paper, 0.92)} 100%)`,
            }}
          >
            <Box
              sx={{
                width: 46,
                height: 46,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                color: teal,
                background: alpha(paper, 0.74),
                boxShadow: `inset 0 0 0 1px ${alpha(teal, 0.12)}`,
                fontSize: 25,
              }}
            >
              <FiShield />
            </Box>
            <Box minWidth={0}>
              <Typography sx={{ color: '#102344', fontSize: 15.5, fontWeight: 900, lineHeight: 1.25 }}>
                Sign in with your merchant credentials
              </Typography>
              <Typography sx={{ mt: 0.55, color: muted, fontSize: 14.5, lineHeight: 1.55 }}>
                Password access may still require email verification to protect billing and shipment data.
              </Typography>
            </Box>
          </Box>

          <Box>
            <Typography sx={{ color: '#081932', fontSize: 14, fontWeight: 900, mb: 0.9 }}>
              Email address <Box component="span" sx={{ color: orange }}>*</Box>
            </Typography>
            <TextField
              type="email"
              name="email"
              id="password-email"
              value={emailForm.email}
              onChange={(e) => handleChange('email', e.target.value)}
              onBlur={() => handleBlur('email')}
              required
              helperText={touched.email && errors.email}
              error={touched.email && !!errors.email}
              placeholder="you@company.com"
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

          <Box>
            <Typography sx={{ color: '#081932', fontSize: 14, fontWeight: 900, mb: 0.9 }}>
              Password <Box component="span" sx={{ color: orange }}>*</Box>
            </Typography>
            <TextField
              name="password"
              id="password"
              type="password"
              value={emailForm.password}
              onChange={(e) => handleChange('password', e.target.value)}
              onBlur={() => handleBlur('password')}
              required
              helperText={touched.password && errors.password}
              error={touched.password && !!errors.password}
              placeholder="Enter password"
              fullWidth
              sx={fieldSx}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start" sx={{ color: '#385373', mr: 0.7 }}>
                      <FiLock size={21} />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end" sx={{ color: teal }}>
                      <Tooltip
                        title={
                          <Typography fontSize="12px">
                            Existing email users can set a password once and keep OTP as a fallback.
                          </Typography>
                        }
                        arrow
                      >
                        <Box sx={{ display: 'inline-flex', alignItems: 'center', color: teal }}>
                          <MdInfoOutline size={19} />
                        </Box>
                      </Tooltip>
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

          <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: -0.35 }}>
            <Link
              component="button"
              type="button"
              underline="hover"
              onClick={() => setOpenPasswordReset(true)}
              sx={{
                cursor: 'pointer',
                color: teal,
                fontWeight: 900,
                fontSize: 13.5,
                textAlign: 'left',
              }}
            >
              Forgot your password? Reset it with your registered email.
            </Link>
          </Box>

          <Button
            type="submit"
            disabled={!isFormValid || isPending}
            sx={{
              width: '100%',
              minHeight: 52,
              borderRadius: 1,
              textTransform: 'none',
              color: paper,
              fontSize: 15.5,
              fontWeight: 900,
              gap: 1.1,
              background: `linear-gradient(135deg, ${teal} 0%, ${tealDark} 100%)`,
              boxShadow: `0 16px 26px ${alpha(teal, 0.18)}`,
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
            {isPending ? (
              <CircularProgress size={18} thickness={4} sx={{ color: 'currentColor' }} />
            ) : (
              <FiLock size={19} />
            )}
            {isPending ? 'Signing in...' : 'Sign in with password'}
          </Button>
        </Stack>
      ) : (
        <EmailVerificationForm
          onEditEmail={() => setStep(0)}
          email={emailForm.email}
          resendMail={() => handleSubmit()}
          password={emailForm.password}
        />
      )}

      <PasswordResetDialog
        open={openPasswordReset}
        onClose={() => setOpenPasswordReset(false)}
        initialEmail={emailForm.email || sessionStorage.getItem('activeEmail') || ''}
      />
    </>
  )
}
