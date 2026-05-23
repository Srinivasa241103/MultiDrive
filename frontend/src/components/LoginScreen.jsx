import React, { useState } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function LoginScreen() {
  const { login, register } = useAuth()

  const [mode, setMode]         = useState('signin')
  const [username, setUsername] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [busy, setBusy]         = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')

    if (!username.trim() || password.length < 4) {
      setError('Enter a username and at least 4 characters for the password.')
      return
    }
    if (mode === 'signup' && !/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter a valid email address.')
      return
    }

    setBusy(true)
    try {
      if (mode === 'signin') {
        await login(username.trim(), password)
      } else {
        await register(username.trim(), email.trim(), password)
      }
      // AuthContext updates user → AppContent re-renders → Dashboard shown
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next) {
    setMode(next)
    setError('')
  }

  return (
    <div className="login-shell">
      <form className="login-card" onSubmit={submit}>
        <div className="brand"><span className="dot" />MultiDrive</div>
        <p className="tagline">Distributed file storage across your Google Drive accounts.</p>

        <div className="login-tabs">
          <button
            type="button"
            className={`login-tab ${mode === 'signin' ? 'active' : ''}`}
            onClick={() => switchMode('signin')}
          >
            Sign in
          </button>
          <button
            type="button"
            className={`login-tab ${mode === 'signup' ? 'active' : ''}`}
            onClick={() => switchMode('signup')}
          >
            Create account
          </button>
        </div>

        {error && <div className="login-error">{error}</div>}

        <div className="login-field">
          <label htmlFor="loginUser">Username</label>
          <input
            id="loginUser"
            type="text"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
          />
        </div>

        {mode === 'signup' && (
          <div className="login-field">
            <label htmlFor="loginEmail">Email</label>
            <input
              id="loginEmail"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        )}

        <div className="login-field">
          <label htmlFor="loginPass">Password</label>
          <input
            id="loginPass"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        <button className="btn btn-primary login-submit" type="submit" disabled={busy}>
          {busy
            ? mode === 'signin' ? 'Signing in…' : 'Creating account…'
            : mode === 'signin' ? 'Sign in'    : 'Create account'}
        </button>

        <p className="login-hint">
          Session secured via HttpOnly cookie — no token handling in JavaScript.
        </p>
      </form>
    </div>
  )
}