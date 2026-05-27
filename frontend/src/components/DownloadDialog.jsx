import React, { useState } from 'react'
import { filesApi } from '../api/files.js'

function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return n + ' B'
  const u = ['KB', 'MB', 'GB', 'TB']
  let i = -1, v = n
  do { v /= 1024; i++ } while (v >= 1024 && i < u.length - 1)
  return v.toFixed(v >= 10 ? 0 : 1) + ' ' + u[i]
}

// The folder selector is a UX affordance only — browsers don't expose a way
// to set the actual save path. The chosen folder label is shown for reference,
// but the browser's own "Save As" dialog controls where the file lands.
const COMMON_FOLDERS = [
  '~/Downloads',
  '~/Documents',
  '~/Desktop',
  '~/MultiDrive',
  '/tmp',
]

export default function DownloadDialog({ file, onCancel, onDone }) {
  const [folder, setFolder]           = useState('~/Downloads')
  const [customFolder, setCustomFolder] = useState('')
  const [filename, setFilename]       = useState(file.name)
  const [downloading, setDownloading] = useState(false)
  const [error, setError]             = useState('')

  const usingCustom  = folder === '__custom'
  const canConfirm   = filename.trim().length > 0 && !downloading
  const totalChunks  = file.totalChunks ?? file.chunksTotal
  const fileSize     = file.sizeBytes   ?? file.size

  async function handleDownload() {
    setDownloading(true)
    setError('')
    try {
      // Fetch the fully reassembled file as a Blob via the backend
      const blob = await filesApi.download(file.id)

      // Programmatically trigger the browser's save dialog
      const url = URL.createObjectURL(blob)
      const a   = document.createElement('a')
      a.href     = url
      a.download = filename.trim()
      a.rel      = 'noopener'
      // Do NOT set target=_blank — download attribute handles it;
      // but we DO need the element attached to trigger click in Firefox.
      document.body.appendChild(a)
      a.click()
      // Small delay before cleanup so the browser can initiate the download
      setTimeout(() => {
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }, 200)

      setDownloading(false)
      onDone?.(filename.trim())
    } catch (err) {
      setError(err.message || 'Download failed.')
      setDownloading(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Download file</h3>
        <p className="modal-sub">
          The reassembled file will be streamed from{' '}
          <span style={{ fontFamily: 'ui-monospace,monospace' }}>
            GET /files/{file.id}/download
          </span>{' '}
          and saved by your browser.
        </p>

        <div className="modal-meta">
          <div><strong>{file.name}</strong></div>
          <div>
            {formatBytes(fileSize)} · {totalChunks} chunk{totalChunks !== 1 ? 's' : ''} · ID{' '}
            <span style={{ fontFamily: 'ui-monospace,monospace' }}>{file.id}</span>
          </div>
        </div>

        {error && (
          <div className="login-error" style={{ marginBottom: 14 }}>{error}</div>
        )}

        <div className="modal-field">
          <label htmlFor="dlFolder">Save location (reference)</label>
          <select
            id="dlFolder"
            value={folder}
            onChange={(e) => setFolder(e.target.value)}
          >
            {COMMON_FOLDERS.map((f) => <option key={f} value={f}>{f}</option>)}
            <option value="__custom">Other…</option>
          </select>
        </div>

        {usingCustom && (
          <div className="modal-field">
            <label htmlFor="dlCustom">Custom path</label>
            <input
              id="dlCustom"
              type="text"
              autoFocus
              placeholder="/absolute/or/~relative/path"
              value={customFolder}
              onChange={(e) => setCustomFolder(e.target.value)}
            />
          </div>
        )}

        <div className="modal-field">
          <label htmlFor="dlName">File name</label>
          <input
            id="dlName"
            type="text"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
          />
        </div>

        <p style={{ fontSize: 11, color: 'var(--muted)', margin: '0 0 14px 0' }}>
          The browser controls the actual save location.
        </p>

        <div className="modal-actions">
          <button className="btn" onClick={onCancel} disabled={downloading}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!canConfirm}
            onClick={handleDownload}
          >
            {downloading ? 'Downloading…' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  )
}