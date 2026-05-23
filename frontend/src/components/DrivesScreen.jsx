import React, { useState, useEffect, useCallback } from 'react'
import { drivesApi } from '../api/drives.js'

function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return n + ' B'
  const u = ['KB', 'MB', 'GB', 'TB']
  let i = -1, v = n
  do { v /= 1024; i++ } while (v >= 1024 && i < u.length - 1)
  return v.toFixed(v >= 10 ? 0 : 1) + ' ' + u[i]
}

const DAILY_CAP = 750_000_000_000 // 750 GB — Google Drive upload cap per account per day

export default function DrivesScreen({ onCountChange }) {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')

  const fetchAccounts = useCallback(async () => {
    try {
      const data = await drivesApi.list()
      setAccounts(data)
      onCountChange?.(data.length)
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load accounts.')
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => { fetchAccounts() }, [fetchAccounts])

  function linkAccount() {
    // Opens the existing OAuth flow in a new tab.
    // The user approves, Google redirects to /auth/google/callback,
    // the backend stores the tokens, then the user comes back here and hits Refresh.
    window.open('/auth/google', '_blank', 'noopener,noreferrer')
  }

  if (loading) return <div className="empty">Loading accounts…</div>

  return (
    <section>
      <div className="toolbar">
        <h2>Drives</h2>
        <div className="toolbar-actions">
          <button className="btn" onClick={fetchAccounts}>Refresh</button>
          <button className="btn btn-primary" onClick={linkAccount}>Link new account</button>
        </div>
      </div>

      {error && <div className="auth-warn">{error}</div>}

      {accounts.length === 0 ? (
        <div className="empty">
          No Google Drive accounts linked yet.<br />
          Click <strong>Link new account</strong> to connect one and start uploading.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th style={{ width: 170 }}>Used / Total</th>
              <th style={{ width: 180 }}>Uploaded today</th>
              <th style={{ width: 110 }}>Healthy</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => {
              // Accept both naming conventions (backend may use quotaUsedBytes or legacy used)
              const used    = a.quotaUsedBytes      ?? a.used  ?? 0
              const total   = a.quotaTotalBytes     ?? a.total ?? 0
              const today   = a.uploadedTodayBytes  ?? a.today ?? 0
              const pctToday = Math.min(100, (today / DAILY_CAP) * 100)

              return (
                <tr key={a.email}>
                  <td>{a.email}</td>
                  <td className="mono">{formatBytes(used)} / {formatBytes(total)}</td>
                  <td className="mono">
                    {formatBytes(today)}{' '}
                    <span style={{ color: 'var(--muted)' }}>
                      ({pctToday.toFixed(0)}% of cap)
                    </span>
                  </td>
                  <td>
                    <span className={`status ${a.health ? 'healthy' : 'unhealthy'}`}>
                      {a.health ? 'YES' : 'NO'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </section>
  )
}