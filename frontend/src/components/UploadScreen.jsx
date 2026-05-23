import React, { useState, useRef, useEffect } from 'react'
import { filesApi } from '../api/files.js'

function formatBytes(n) {
  if (n == null) return '—'
  if (n < 1024) return n + ' B'
  const u = ['KB', 'MB', 'GB', 'TB']
  let i = -1, v = n
  do { v /= 1024; i++ } while (v >= 1024 && i < u.length - 1)
  return v.toFixed(v >= 10 ? 0 : 1) + ' ' + u[i]
}

export default function UploadScreen({ hasDrives, onGoDrives, onComplete }) {
  const [picked, setPicked]     = useState(null)   // { name, size, file }
  const [uploading, setUploading] = useState(false)
  const [log, setLog]           = useState([])
  const [done, setDone]         = useState(false)
  const fileRef   = useRef(null)
  const pollRef   = useRef(null)

  // Clean up the poll interval if the component unmounts mid-upload
  useEffect(() => () => clearInterval(pollRef.current), [])

  function pick(e) {
    const f = e.target.files[0]
    if (!f) return
    setPicked({ name: f.name, size: f.size, file: f })
    setLog([])
    setDone(false)
  }

  function appendLog(t, v) {
    setLog((prev) => [...prev, { t, v }])
  }

  function replaceLastLog(t, v) {
    setLog((prev) => [...prev.slice(0, -1), { t, v }])
  }

  async function start() {
    if (!picked || uploading) return
    setUploading(true)
    setDone(false)
    setLog([{ t: 'muted', v: `POST /files/upload → sending ${picked.name}…` }])

    let fileId
    try {
      const res = await filesApi.upload(picked.file)
      // Accept either { id } or { fileId } from the backend
      fileId = res.id ?? res.fileId
      appendLog('muted', `upload_id: ${fileId}`)
      appendLog('norm',  '0 / ? chunks — UPLOADING')
    } catch (err) {
      appendLog('err', `Error: ${err.message}`)
      setUploading(false)
      return
    }

    // Poll /files/:id/status every 1.5 s until the file commits or fails
    pollRef.current = setInterval(async () => {
      try {
        const s = await filesApi.status(fileId)

        const complete = s.chunksComplete ?? s.chunksDone  ?? 0
        const total    = s.totalChunks    ?? s.chunksTotal ?? '?'

        replaceLastLog('norm', `${complete} / ${total} chunks — ${s.status}`)

        if (s.status === 'COMMITTED' || s.status === 'FAILED') {
          clearInterval(pollRef.current)
          setUploading(false)
          setDone(true)
          if (s.status === 'COMMITTED') {
            setTimeout(() => onComplete?.(), 800) // brief pause so user sees COMMITTED
          }
        }
      } catch (err) {
        clearInterval(pollRef.current)
        appendLog('err', `Poll error: ${err.message}`)
        setUploading(false)
      }
    }, 1500)
  }

  function reset() {
    setPicked(null)
    setLog([])
    setDone(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  return (
    <section>
      <div className="toolbar">
        <h2>Upload</h2>
      </div>

      {!hasDrives && (
        <div className="auth-warn">
          No Google Drive accounts linked.{' '}
          <button className="btn-link" style={{ padding: 0 }} onClick={onGoDrives}>
            Connect one →
          </button>
        </div>
      )}

      <div className="upload-box">
        <div className="upload-row">
          <div className="file-input-wrap">
            <label className="file-label" htmlFor="fileInput">Choose file</label>
            <input id="fileInput" ref={fileRef} type="file" onChange={pick} />
            <span className={`file-name ${picked ? 'has-file' : ''}`}>
              {picked
                ? `${picked.name} · ${formatBytes(picked.size)}`
                : 'No file selected'}
            </span>
          </div>

          <button
            className="btn btn-primary"
            disabled={!picked || uploading || !hasDrives}
            onClick={start}
          >
            {uploading ? 'Uploading…' : 'Upload'}
          </button>

          {done && (
            <button className="btn" onClick={reset}>Upload another</button>
          )}
        </div>

        {log.length > 0 && (
          <div className="progress-line">
            {log.map((l, i) => (
              <span
                key={i}
                className="log-line"
                style={
                  l.t === 'muted' ? { color: 'var(--muted)' }
                  : l.t === 'err' ? { color: 'var(--red)' }
                  : undefined
                }
              >
                {l.v}
              </span>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}