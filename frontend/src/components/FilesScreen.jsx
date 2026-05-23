import React, { useState, useEffect, useCallback } from 'react'
import { filesApi }    from '../api/files.js'
import ChunkPanel      from './ChunkPanel.jsx'
import DownloadDialog  from './DownloadDialog.jsx'

function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return n + ' B'
  const u = ['KB', 'MB', 'GB', 'TB']
  let i = -1, v = n
  do { v /= 1024; i++ } while (v >= 1024 && i < u.length - 1)
  return v.toFixed(v >= 10 ? 0 : 1) + ' ' + u[i]
}

// Normalise field names so the UI works regardless of whether the backend
// uses camelCase (sizeBytes / totalChunks / chunksComplete) or the legacy
// names from the mock HTML (size / chunksTotal / chunksDone).
function normalise(f) {
  return {
    ...f,
    size:        f.sizeBytes      ?? f.size,
    chunksTotal: f.totalChunks    ?? f.chunksTotal,
    chunksDone:  f.chunksComplete ?? f.chunksDone,
  }
}

export default function FilesScreen({ hasDrives, onGoDrives, onCountChange }) {
  const [files, setFiles]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [error, setError]               = useState('')
  const [expandedId, setExpandedId]     = useState(null)
  const [downloadTarget, setDownloadTarget] = useState(null)
  const [toast, setToast]               = useState(null)  // { name }

  const fetchFiles = useCallback(async () => {
    try {
      const data = await filesApi.list()
      const normalised = data.map(normalise)
      setFiles(normalised)
      onCountChange?.(normalised.length)
      setError('')
    } catch (err) {
      setError(err.message || 'Failed to load files.')
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  // Initial load
  useEffect(() => { fetchFiles() }, [fetchFiles])

  // Auto-refresh every 3 s while any file is still uploading
  useEffect(() => {
    const anyUploading = files.some((f) => f.status === 'UPLOADING')
    if (!anyUploading) return
    const t = setInterval(fetchFiles, 3000)
    return () => clearInterval(t)
  }, [files, fetchFiles])

  // Auto-dismiss toast after 6 s
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  async function handleDelete(file) {
    if (!confirm(`Delete "${file.name}"? Chunks on all drives will be removed.`)) return
    try {
      await filesApi.delete(file.id)
      setFiles((prev) => prev.filter((f) => f.id !== file.id))
      if (expandedId === file.id) setExpandedId(null)
      onCountChange?.((c) => Math.max(0, (c ?? 1) - 1))
    } catch (err) {
      alert(err.message || 'Delete failed.')
    }
  }

  function handleDownloadDone(name) {
    setDownloadTarget(null)
    setToast({ name })
  }

  const anyUploading = files.some((f) => f.status === 'UPLOADING')

  if (loading) return <div className="empty">Loading files…</div>

  return (
    <section>
      <div className="toolbar">
        <h2>Files</h2>
        <div className="toolbar-actions">
          {anyUploading && (
            <span style={{ color: 'var(--muted)', fontSize: 12 }}>auto-refreshing…</span>
          )}
          <button className="btn" onClick={fetchFiles}>Refresh</button>
        </div>
      </div>

      {!hasDrives && (
        <div className="auth-warn">
          No Google Drive accounts linked.{' '}
          <button className="btn-link" style={{ padding: 0 }} onClick={onGoDrives}>
            Connect one →
          </button>
        </div>
      )}

      {error && <div className="auth-warn">{error}</div>}

      {files.length === 0 ? (
        <div className="empty">
          No files yet. Switch to <strong>Upload</strong> to add one.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: '35%' }}>Name</th>
              <th style={{ width: 90 }}>Size</th>
              <th style={{ width: 80 }}>Chunks</th>
              <th style={{ width: 130 }}>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <React.Fragment key={f.id}>
                <tr>
                  <td className="col-name">{f.name}</td>
                  <td>{formatBytes(f.size)}</td>
                  <td className="mono">{f.chunksDone} / {f.chunksTotal}</td>
                  <td>
                    <span className={`status ${f.status.toLowerCase()}`}>{f.status}</span>
                  </td>
                  <td className="col-actions">
                    <button
                      className="btn-link"
                      onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                    >
                      {expandedId === f.id ? 'Hide' : 'Details'}
                    </button>
                    <button
                      className="btn-link"
                      onClick={() => setDownloadTarget(f)}
                      disabled={f.status !== 'COMMITTED'}
                    >
                      Download
                    </button>
                    <button className="btn-link danger" onClick={() => handleDelete(f)}>
                      Delete
                    </button>
                  </td>
                </tr>

                {expandedId === f.id && (
                  <tr className="detail-row">
                    <td colSpan={5} style={{ padding: 0 }}>
                      <ChunkPanel fileId={f.id} fileName={f.name} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      )}

      {downloadTarget && (
        <DownloadDialog
          file={downloadTarget}
          onCancel={() => setDownloadTarget(null)}
          onDone={handleDownloadDone}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          <div className="toast-title">Downloaded {toast.name}</div>
          <div className="toast-body">Saved by your browser.</div>
        </div>
      )}
    </section>
  )
}