import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi } from '../api/auth.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser]               = useState(null)
  const [loading, setLoading]         = useState(true)   // true while /auth/me is in-flight on mount
  const [sessionStart, setSessionStart] = useState(null) // wall-clock ms, for session-age display

  // On app load, hit /auth/me to check if there's a live session cookie.
  // This is the only place we check — no tokens in JS, no localStorage.
  useEffect(() => {
    authApi.me()
      .then((u) => {
        setUser(u)
        setSessionStart(Date.now())
      })
      .catch(() => {
        // 401 → no active session → stay logged out
        setUser(null)
      })
      .finally(() => setLoading(false))
  }, [])

  const login = useCallback(async (username, password) => {
    const u = await authApi.login(username, password)
    setUser(u)
    setSessionStart(Date.now())
    return u
  }, [])

  const register = useCallback(async (username, email, password) => {
    const u = await authApi.register(username, email, password)
    setUser(u)
    setSessionStart(Date.now())
    return u
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout().catch(() => {})
    setUser(null)
    setSessionStart(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, loading, sessionStart, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)