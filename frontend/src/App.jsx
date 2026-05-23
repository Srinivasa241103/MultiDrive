import React, { useState, useEffect } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import LoginScreen    from './components/LoginScreen.jsx'
import TopBar         from './components/TopBar.jsx'
import FilesScreen    from './components/FilesScreen.jsx'
import UploadScreen   from './components/UploadScreen.jsx'
import DrivesScreen   from './components/DrivesScreen.jsx'

// ─────────────────────────────────────────────
// Dashboard — rendered once the user is logged in
// ─────────────────────────────────────────────
function Dashboard() {
  const { user, sessionStart, logout } = useAuth()
  const [tab, setTab]             = useState('files')
  const [fileCount, setFileCount] = useState(null)
  const [driveCount, setDriveCount] = useState(null)
  const [sessionAge, setSessionAge] = useState(0)

  // Tick session age every second for the TopBar display
  useEffect(() => {
    if (!sessionStart) return
    const t = setInterval(
      () => setSessionAge(Math.floor((Date.now() - sessionStart) / 1000)),
      1000,
    )
    return () => clearInterval(t)
  }, [sessionStart])

  const hasDrives = driveCount == null ? true : driveCount > 0

  const subtitle =
    driveCount != null && fileCount != null
      ? `${driveCount} Google Drive account${driveCount === 1 ? '' : 's'} linked · ${fileCount} file${fileCount === 1 ? '' : 's'}`
      : 'Loading…'

  return (
    <>
      <TopBar user={user} sessionAge={sessionAge} onLogout={logout} />

      <main>
        <h1 style={{ color: 'rgb(255,255,255)' }}>Welcome, {user.username}</h1>
        <p className="subtitle">{subtitle}</p>

        <nav className="tabs" role="tablist">
          {[
            ['files',  'Files'],
            ['upload', 'Upload'],
            ['drives', 'Drive Accounts'],
          ].map(([k, label]) => (
            <button
              key={k}
              role="tab"
              aria-selected={tab === k}
              className={`tab ${tab === k ? 'active' : ''}`}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </nav>

        {tab === 'files' && (
          <FilesScreen
            hasDrives={hasDrives}
            onGoDrives={() => setTab('drives')}
            onCountChange={setFileCount}
          />
        )}
        {tab === 'upload' && (
          <UploadScreen
            hasDrives={hasDrives}
            onGoDrives={() => setTab('drives')}
            onComplete={() => setTab('files')}
          />
        )}
        {tab === 'drives' && (
          <DrivesScreen onCountChange={setDriveCount} />
        )}
      </main>

      <footer>
        Signed in as{' '}
        <strong style={{ color: 'var(--text)' }}>{user.username}</strong>{' '}
        · Session cookie is HttpOnly — the token never touches JS memory{' '}
        · CLI and UI share the same REST API.
      </footer>
    </>
  )
}

// ─────────────────────────────────────────────
// Root content — auth gate
// ─────────────────────────────────────────────
function AppContent() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="login-shell">
        <div style={{ color: 'var(--muted)', fontSize: 14 }}>Checking session…</div>
      </div>
    )
  }

  return user ? <Dashboard /> : <LoginScreen />
}

// ─────────────────────────────────────────────
// App — wraps everything in AuthProvider
// ─────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}