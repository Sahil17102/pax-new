import { io, type Socket } from 'socket.io-client'

const DEFAULT_PRODUCTION_API_URL = 'https://pax-new.onrender.com/api'

const resolveApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL

  if (typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase()
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return 'http://localhost:4000/api'
    }
  }

  return DEFAULT_PRODUCTION_API_URL
}

const resolveSocketUrl = () => {
  if (import.meta.env.VITE_APP_SOCKET_URL) return import.meta.env.VITE_APP_SOCKET_URL

  const apiUrl = resolveApiBaseUrl()
  if (apiUrl) {
    try {
      return new URL(apiUrl, window.location.origin).origin
    } catch {
      return apiUrl.replace(/\/api\/?$/, '').replace(/\/+$/, '')
    }
  }

  return DEFAULT_PRODUCTION_API_URL.replace(/\/api\/?$/, '')
}

let socket: Socket | null = null

const getSocket = () => {
  if (!socket) {
    socket = io(resolveSocketUrl(), { transports: ['websocket', 'polling'] })
  }

  return socket
}

let pingInterval: number | null = null

export const registerUserSocket = (user: { id: string; role: string }) => {
  if (user.role !== 'employee') return

  const activeSocket = getSocket()
  activeSocket.emit('register', user.id)

  // Ping every 10 seconds to maintain online status
  pingInterval = window.setInterval(() => {
    activeSocket.emit('employee_ping', user.id)
  }, 10000)

  activeSocket.on('new_notification', (msg) => {
    console.log('Received notification:', msg)
  })
}

export const disconnectSocket = () => {
  if (pingInterval) {
    clearInterval(pingInterval)
    pingInterval = null
  }
  socket?.disconnect()
  socket = null
}

export default getSocket
