import React, { useEffect, useState, useCallback, useRef } from 'react'
import { formatSize } from '../utils/format'

interface EditorPageProps {
  filePath: string
  fileName: string
}

export function EditorPage({ filePath, fileName }: EditorPageProps): React.JSX.Element {
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modified, setModified] = useState(false)
  const [fileSize, setFileSize] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    async function loadFile(): Promise<void> {
      setLoading(true)
      try {
        const size = await window.api.util.getFileSize(filePath)
        setFileSize(size)

        // Limit editor to ~10MB
        if (size > 10 * 1024 * 1024) {
          setError('File too large for editor (>10MB). Use F3 viewer instead.')
          setLoading(false)
          return
        }

        const result = await window.api.util.readFileContent(filePath, size)
        if (result.error) {
          setError(result.error)
        } else if (result.isBinary) {
          setError('Cannot edit binary files. Use F3 viewer instead.')
        } else {
          setContent(result.content)
          setOriginalContent(result.content)
        }
      } catch (err) {
        setError(String(err))
      }
      setLoading(false)
    }
    loadFile()
  }, [filePath])

  const handleSave = useCallback(async () => {
    setSaving(true)
    const result = await window.api.util.saveFile(filePath, content)
    if (result.success) {
      setOriginalContent(content)
      setModified(false)
    } else {
      setError(result.error || 'Save failed')
    }
    setSaving(false)
  }, [filePath, content])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    setModified(e.target.value !== originalContent)
  }, [originalContent])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') {
      if (modified) {
        if (confirm('Unsaved changes. Close anyway?')) window.close()
      } else {
        window.close()
      }
    }
    // Tab inserts a tab character
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = textareaRef.current
      if (ta) {
        const start = ta.selectionStart
        const end = ta.selectionEnd
        const newContent = content.slice(0, start) + '\t' + content.slice(end)
        setContent(newContent)
        setModified(newContent !== originalContent)
        setTimeout(() => {
          ta.selectionStart = ta.selectionEnd = start + 1
        }, 0)
      }
    }
  }, [handleSave, modified, content, originalContent])

  const lineCount = content.split('\n').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-primary)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 12px',
        background: 'var(--bg-secondary)',
        borderBottom: '1px solid var(--border-color)',
        flexShrink: 0
      }}>
        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {fileName}{modified ? ' *' : ''}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
          {formatSize(fileSize)} | {lineCount} lines
        </span>
        <button
          onClick={handleSave}
          disabled={!modified || saving}
          style={{
            padding: '3px 12px',
            background: modified ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: modified ? 'white' : 'var(--text-muted)',
            border: '1px solid var(--border-color)',
            borderRadius: 3,
            fontSize: 11,
            cursor: modified ? 'pointer' : 'default'
          }}
        >
          {saving ? 'Saving...' : 'Save (Ctrl+S)'}
        </button>
      </div>

      {/* Editor */}
      {loading ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Loading...
        </div>
      ) : error ? (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', padding: 20, textAlign: 'center' }}>
          {error}
        </div>
      ) : (
        <textarea
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          autoFocus
          spellCheck={false}
          style={{
            flex: 1,
            resize: 'none',
            background: 'var(--bg-primary)',
            color: 'var(--text-primary)',
            border: 'none',
            padding: '8px 12px',
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
            lineHeight: 1.5,
            outline: 'none',
            tabSize: 4
          }}
        />
      )}

      {/* Status bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 12px',
        background: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border-color)',
        fontSize: 11,
        color: 'var(--text-muted)',
        flexShrink: 0
      }}>
        <span>{filePath}</span>
        <span>Ctrl+S save | Esc close</span>
      </div>
    </div>
  )
}
