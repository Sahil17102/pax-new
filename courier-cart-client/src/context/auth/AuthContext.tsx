import { useQueryClient } from '@tanstack/react-query'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import { logoutApi } from '../../api/auth'
import {
  AUTH_STORAGE_KEYS,
  clearAuthTokens,
  getAuthTokens,
  getStoredSessionUser,
  setAuthTokens,
  setStoredSessionUser,
} from '../../api/tokenVault'
import { useUserProfile } from '../../hooks/User/useUserProfile'
import type { IUserProfileDB } from '../../types/user.types'
import { getAppHashHref } from '../../utils/appNavigation'
import { getCurrentAuthScope } from '../../utils/authQueryKeys'
import { emptyUserProfile } from '../../utils/utility'

type SessionUser = Partial<IUserProfileDB>

/* ---------- context shape ---------- */
interface AuthCtx {
  setUserId: Dispatch<SetStateAction<string>>
  userId: string
  user: IUserProfileDB
  loading: boolean
  isAuthenticated: boolean
  setTokens: (access: string, refresh: string, sessionUser?: SessionUser | null) => void
  clearTokens: () => void
  logout: () => Promise<void>
  refetchUser: () => void
  walletBalance: number | null
  setWalletBalance: Dispatch<SetStateAction<number | null>>
}

export const AuthContext = createContext<AuthCtx | undefined>(undefined)

/* ---------- provider ---------- */
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = useQueryClient()

  const { accessToken, refreshToken } = getAuthTokens()
  const hasTokens = !!accessToken && !!refreshToken

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(hasTokens)
  const [authScope, setAuthScope] = useState<string>(getCurrentAuthScope())
  const [authCheckTimedOut, setAuthCheckTimedOut] = useState(false)
  const [walletBalance, setWalletBalance] = useState<number | null>(null)
  const [userId, setUserId] = useState('')
  const [sessionUser, setSessionUser] = useState<SessionUser | null>(() =>
    getStoredSessionUser<SessionUser>(),
  )

  const resetSessionQueries = () => {
    queryClient.removeQueries({ queryKey: ['userInfo'] })
    queryClient.removeQueries({ queryKey: ['userProfile'] })
    queryClient.removeQueries({ queryKey: ['walletBalance'] })
    queryClient.removeQueries({ queryKey: ['walletTransactions'] })
  }

  const syncAuthStateFromStorage = () => {
    const { accessToken: nextAccessToken, refreshToken: nextRefreshToken } = getAuthTokens()
    const nextHasTokens = !!nextAccessToken && !!nextRefreshToken
    const nextSessionUser = getStoredSessionUser<SessionUser>()

    setIsAuthenticated(nextHasTokens)
    setSessionUser(nextSessionUser)
    setUserId(nextSessionUser?.id ?? '')
    setAuthScope(getCurrentAuthScope())
    setAuthCheckTimedOut(false)

    if (!nextHasTokens) {
      setWalletBalance(null)
      resetSessionQueries()
    }
  }

  const {
    data: user,
    isFetching: userFetching,
    isError: userProfileError,
    refetch: refetchUser,
  } = useUserProfile(isAuthenticated, authScope)

  useEffect(() => {
    if (!isAuthenticated || user?.id || userProfileError) {
      setAuthCheckTimedOut(false)
      return
    }

    const timeout = window.setTimeout(() => {
      setAuthCheckTimedOut(true)
    }, 3500)

    return () => window.clearTimeout(timeout)
  }, [isAuthenticated, user?.id, userProfileError])

  useEffect(() => {
    if (user?.id) {
      setIsAuthenticated(true)
      setSessionUser(user)
      setStoredSessionUser(user)
    }
  }, [user])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleStorage = (event: StorageEvent) => {
      if (event.key && !AUTH_STORAGE_KEYS.includes(event.key as (typeof AUTH_STORAGE_KEYS)[number])) {
        return
      }

      syncAuthStateFromStorage()
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  const setTokens = (access: string, refresh: string, nextSessionUser?: SessionUser | null) => {
    resetSessionQueries()
    setAuthTokens(access, refresh)

    if (nextSessionUser) {
      setSessionUser(nextSessionUser)
      setStoredSessionUser(nextSessionUser)
      setUserId(nextSessionUser.id ?? '')
    } else {
      setSessionUser(null)
      setUserId('')
    }

    setAuthScope(getCurrentAuthScope())
    setWalletBalance(null)
    setAuthCheckTimedOut(false)
    setIsAuthenticated(true)
  }

  const clearTokens = () => {
    clearAuthTokens()
    setSessionUser(null)
    setAuthScope(getCurrentAuthScope())
    setIsAuthenticated(false)
    setUserId('')
    setWalletBalance(null)
    setAuthCheckTimedOut(false)
    resetSessionQueries()
  }

  const logout = async () => {
    try {
      await logoutApi()
    } catch (e) {
      console.error('Logout error ignored:', e)
    }
    clearTokens()
    window.location.href = getAppHashHref('/login')
  }

  const activeUser = (user ?? sessionUser ?? { ...emptyUserProfile }) as IUserProfileDB
  // A stored session user is only a fast display fallback. Route guards must wait
  // for the canonical profile so stale onboarding/KYC flags cannot reopen setup.
  const hasResolvedUser = Boolean(user?.id)
  const value: AuthCtx = {
    user: activeUser,
    loading:
      isAuthenticated &&
      !hasResolvedUser &&
      userFetching &&
      !userProfileError &&
      !authCheckTimedOut,
    isAuthenticated,
    setUserId,
    setTokens,
    clearTokens,
    userId,
    logout,
    refetchUser,
    walletBalance,
    setWalletBalance,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

/* ---------- hook ---------- */
export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
