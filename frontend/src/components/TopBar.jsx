import React, { useState, useEffect, useRef } from 'react'

export default function TopBar({ user, sessionAge, onLogout }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)

  // Close the dropdown when clicking outside
  useEffect(() => {
    function handleClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const initials   = (user.username || user.email || '?').slice(0, 2).toUpperCase()
  const sessionMins  = Math.floor(sessionAge / 60)
  const sessionLabel = sessionMins < 1 ? 'just now' : `${sessionMins} min ago`

  return (
    <header className="topbar">
      <div className="topbar-inner">
        <div className="brand"><span className="dot" />MultiDrive</div>

        <div className="user-chip-wrap" ref={wrapRef}>
          <button className="user-chip" onClick={() => setOpen((o) => !o)}>
            <span className="avatar">{initials}</span>
            <span>{user.username}</span>
            <span className="caret">▾</span>
          </button>

          {open && (
            <div className="user-menu" role="menu">
              <div className="user-menu-header">
                <div className="um-name">{user.username}</div>
                <div className="um-email">{user.email}</div>
              </div>

              <button className="user-menu-item" disabled>
                <span>Session started</span>
                <span className="um-meta">{sessionLabel}</span>
              </button>
              <button className="user-menu-item" disabled>
                <span>Auth method</span>
                <span className="um-meta">HttpOnly cookie</span>
              </button>

              <button
                className="user-menu-item danger"
                onClick={() => { setOpen(false); onLogout() }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}