import { Box, Stack, TextField, Typography } from '@mui/material'
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { FiEdit2, FiRefreshCcw } from 'react-icons/fi'
import { BRAND } from '../../config/brand'
import { useAuth } from '../../context/auth/AuthContext'
import { useRequestOtp, useVerifyOtp } from '../../hooks/useOTP'
import { extractScreenOtp, type OtpResponseLike } from '../../utils/authOtp'
import CustomIconLoadingButton from '../UI/button/CustomLoadingButton'
import { toast } from '../UI/Toast'

const OTP_LENGTH = 6
const OTP_RESEND_DELAY_MS = 30000
const BRAND_DARK = BRAND.colors.ink
const BRAND_TEAL = '#3454d1'

const primaryButtonStyles = {
  width: '100%',
  borderRadius: 1,
  background: `linear-gradient(135deg, ${BRAND_TEAL} 0%, #2947ae 100%)`,
  boxShadow: '0 16px 26px rgba(6, 42, 91, 0.18)',
  minHeight: 52,
}

const ghostButtonStyles = {
  width: '100%',
  border: '1px solid rgba(91, 119, 150, 0.32)',
  color: BRAND_DARK,
  backgroundColor: '#ffffff',
  borderRadius: 1,
  minHeight: 48,
}

type Props = {
  email: string
  debugOtp?: string
  onDebugOtpChange?: (otp: string) => void
  onEditEmail: () => void
}

export default function OtpForm({ email, debugOtp, onDebugOtpChange, onEditEmail }: Props) {
  const { setTokens, setUserId } = useAuth()
  const [otpDigits, setOtpDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''))
  const [error, setError] = useState('')
  const [resendEnabled, setResendEnabled] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(OTP_RESEND_DELAY_MS / 1000)

  const { mutate: verifyOtp, isPending: verifying } = useVerifyOtp()
  const { mutate: resendOtp, isPending: resending } = useRequestOtp()

  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    setResendEnabled(false)
    setSecondsLeft(OTP_RESEND_DELAY_MS / 1000)

    if (timerRef.current) clearTimeout(timerRef.current)
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)

    countdownIntervalRef.current = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current!)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    timerRef.current = setTimeout(() => {
      setResendEnabled(true)
      setSecondsLeft(0)
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    }, OTP_RESEND_DELAY_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
    }
  }, [email])

  useEffect(() => {
    if (/^\d{6}$/.test(debugOtp || '')) {
      setOtpDigits(debugOtp!.split(''))
      setError('')
    }
  }, [debugOtp])

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return

    const nextDigits = [...otpDigits]
    nextDigits[index] = value.slice(-1)
    setOtpDigits(nextDigits)
    setError('')

    if (value && index < OTP_LENGTH - 1) {
      document.getElementById(`otp-${index + 1}`)?.focus()
    }
  }

  const handleKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus()
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const otp = otpDigits.join('')
    if (otp.length !== OTP_LENGTH) {
      setError(`Enter the full ${OTP_LENGTH}-digit verification code.`)
      return
    }

    setError('')

    verifyOtp(
      { email, otp },
      {
        onSuccess: ({ token, refreshToken, user }) => {
          sessionStorage.setItem('activeEmail', email)
          setUserId(user?.id)
          setTokens(token, refreshToken, user)
        },
        onError: (err: any) => {
          const msg = err?.response?.data?.error || 'OTP verification failed'
          setError(msg)

          if (msg.toLowerCase().includes('otp expired')) {
            setResendEnabled(true)
            setSecondsLeft(0)
            if (timerRef.current) clearTimeout(timerRef.current)
            if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
          }
        },
      },
    )
  }

  const handleResendOtp = useCallback(() => {
    if (!resendEnabled || resending) return

    resendOtp(email.toLowerCase().trim(), {
      onSuccess: (data: OtpResponseLike) => {
        const nextOtp = extractScreenOtp(data)
        onDebugOtpChange?.(nextOtp)
        setOtpDigits(Array(OTP_LENGTH).fill(''))
        setError('')
        setResendEnabled(false)
        setSecondsLeft(OTP_RESEND_DELAY_MS / 1000)

        if (timerRef.current) clearTimeout(timerRef.current)
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)

        countdownIntervalRef.current = setInterval(() => {
          setSecondsLeft((prev) => {
            if (prev <= 1) {
              clearInterval(countdownIntervalRef.current!)
              return 0
            }
            return prev - 1
          })
        }, 1000)

        timerRef.current = setTimeout(() => {
          setResendEnabled(true)
          setSecondsLeft(0)
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
        }, OTP_RESEND_DELAY_MS)

        toast.open({ message: 'Verification code generated again.', severity: 'success' })
      },
      onError: (err: any) => {
        setError(err?.response?.data?.error || 'Failed to resend OTP')
      },
    })
  }, [email, resendOtp, resendEnabled, resending])

  return (
    <Stack component="form" onSubmit={handleSubmit} width="100%" mt={0} gap={1.75}>
      <Box
        sx={{
          p: 1.65,
          borderRadius: 1.25,
          background: 'linear-gradient(135deg, rgba(228,246,248,0.76), rgba(255,255,255,0.92))',
          border: '1px solid rgba(6,42,91,0.12)',
        }}
      >
        <Typography variant="body2" sx={{ color: '#5F5A57', lineHeight: 1.7 }}>
          We generated a 6-digit sign-in code for <strong>{email}</strong>.
          <Box
            component="span"
            sx={{
              ml: 0.7,
              display: 'inline-flex',
              alignItems: 'center',
              cursor: 'pointer',
              color: BRAND_TEAL,
            }}
            onClick={onEditEmail}
          >
            <FiEdit2 size={13} style={{ marginRight: 4 }} />
            Edit
          </Box>
        </Typography>
      </Box>

      {debugOtp && (
        <Box
          role="status"
          aria-live="polite"
          sx={{
            p: 1.35,
            borderRadius: 1.25,
            textAlign: 'center',
            background: 'linear-gradient(135deg, rgba(6,42,91,0.1), rgba(237,28,36,0.12))',
            border: '1px solid rgba(6,42,91,0.2)',
          }}
        >
          <Typography sx={{ fontSize: '0.72rem', fontWeight: 800, color: BRAND_TEAL, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Your same-screen OTP
          </Typography>
          <Typography sx={{ mt: 0.4, fontSize: '1.5rem', fontWeight: 800, color: BRAND_DARK, letterSpacing: '0.18em' }}>
            {debugOtp}
          </Typography>
          <Typography sx={{ mt: 0.35, fontSize: '0.72rem', fontWeight: 650, color: '#5F5A57' }}>
            The code is filled below automatically.
          </Typography>
        </Box>
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
          gap: { xs: 0.55, sm: 1 },
          width: '100%',
          maxWidth: 380,
          mx: 'auto',
        }}
      >
        {otpDigits.map((digit, idx) => (
          <TextField
            key={idx}
            id={`otp-${idx}`}
            type="text"
            inputMode="numeric"
            value={digit}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKeyDown(idx, e as KeyboardEvent<HTMLInputElement>)}
            slotProps={{
              htmlInput: {
                maxLength: 1,
                style: {
                  textAlign: 'center',
                  fontSize: '1.15rem',
                  padding: 0,
                  height: 46,
                  fontWeight: 700,
                },
              },
            }}
            sx={{
              width: '100%',
              '& .MuiOutlinedInput-root': {
                height: 52,
                borderRadius: 1,
                backgroundColor: '#f8fcfd',
                color: BRAND_DARK,
                '& fieldset': {
                  borderColor: 'rgba(6, 42, 91, 0.18)',
                },
                '&:hover fieldset': {
                  borderColor: BRAND_TEAL,
                },
                '&.Mui-focused fieldset': {
                  borderColor: BRAND_TEAL,
                  borderWidth: 2,
                },
              },
            }}
            error={!!error}
            autoComplete="one-time-code"
            aria-label={`OTP digit ${idx + 1}`}
          />
        ))}
      </Box>

      {error && (
        <Typography variant="caption" color="error" textAlign="center" sx={{ userSelect: 'none' }}>
          {error}
        </Typography>
      )}

      <Typography variant="caption" color="#6E6763" textAlign="center" sx={{ userSelect: 'none' }}>
        Review the code, then continue to the merchant shipping workspace.
      </Typography>

      <CustomIconLoadingButton
        type="submit"
        text="Verify and continue"
        styles={primaryButtonStyles}
        disabled={otpDigits.join('').length !== OTP_LENGTH}
        loading={verifying}
        loadingText="Verifying..."
        textColor="#fff"
      />

      <CustomIconLoadingButton
        type="button"
        onClick={handleResendOtp}
        text={resendEnabled ? 'Resend verification code' : `Resend in ${secondsLeft}s`}
        styles={ghostButtonStyles}
        disabled={!resendEnabled || resending}
        loading={resending}
        loadingText="Resending..."
        icon={<FiRefreshCcw size={14} />}
      />
    </Stack>
  )
}
