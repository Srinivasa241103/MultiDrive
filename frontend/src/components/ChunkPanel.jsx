import React, { useState, useEffect } from 'react'
import { filesApi } from '../api/files.js'

function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return n + ' B'
  const u = ['KB', 'MB', 'GB', 'TB']
  let i = -1, v = n
  do { v /= 1024; i++ } while (v >= 1024 && i < u.length - 1)
  return v.toFixed(v >= 10 ? 0 : 1) + ' ' + u[i]
}

function truncateMid(s, head = 14, tail = 6) {
  if (!s || s === '—' || s.length <= head + tail + 1) return s
  return s.slice(0, head) + '…' + s.slice(-tail)
}

export default function ChunkPanel({ fileId, fileName }) {
  const [chunks, setChunks]   = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  useEffect(() => {
    filesApi.chunks(fileId)
      .then(setChunks)
      .catch((err) => setError(err.message || 'Failed to load chunks.'))
      .finally(() => setLoading(false))
  }, [fileId])

  // Normalise field names from backend (sequenceNo or seq, accountEmail or email, etc.)
  const rows = chunks.map((c) => ({
    seq:      c.sequenceNo  ?? c.seq,
    email:    c.email       ?? c.accountEmail,
    driveId:  c.driveFileId ?? c.driveId ?? '—',
    size:     c.sizeBytes   ?? c.size,
    status:   c.status,
  }))

  const uniqueAccounts = new Set(rows.map((c) => c.email)).size

  return (
    <div className="detail-panel">
      <h3>Chunk placement map — {fileName}</h3>
      <p className="detail-sub">
        File ID{' '}
        <span style={{ fontFamily: 'ui-monospace,monospace' }}>{fileId}</span>
        {rows.length > 0 && ` · ${rows.length} chunks across ${uniqueAccounts} account${uniqueAccounts === 1 ? '' : 's'}`}
      </p>

      {loading && (
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>Loading chunk map…</div>
      )}
      {error && <div className="auth-warn">{error}</div>}

      {!loading && !error && (
        <table>
          <thead>
            <tr>
              <th style={{ width: 60 }}>Seq</th>
              <th>Drive (email)</th>
              <th>Drive File ID</th>
              <th style={{ width: 90 }}>Size</th>
              <th style={{ width: 110 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.seq}>
                <td className="mono">{c.seq}</td>
                <td>{c.email}</td>
                <td className="mono" title={c.driveId}>{truncateMid(c.driveId)}</td>
                <td>{formatBytes(c.size)}</td>
                <td>
                  <span className={`status ${(c.status || '').toLowerCase()}`}>
                    {c.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}