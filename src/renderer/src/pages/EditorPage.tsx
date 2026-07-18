import React, { useEffect, useState, useCallback, useRef } from 'react'
import { formatSize } from '../utils/format'
import { useEscapeKey } from '../hooks/useEscapeKey'

interface EditorPageProps {
  filePath: string
  fileName: string
}

export function EditorPage({ filePath }: EditorPageProps): React.JSX.Element {
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
        const parts = filePath.split('|')
        const usePlugin = parts.length === 2
        const pluginId = usePlugin ? parts[0] : ''
        const entryId = usePlugin ? parts[1] : filePath

        let size = 0
        let content = ''
        let isBin = false
        if (usePlugin) {
          const res = await window.api.util.readEntryContent(pluginId, entryId, 0)
          size = res.totalSize || 0
          isBin = res.isBinary
          content = typeof res.data === 'string' ? res.data : ''
          if (res.error) {
            setError(res.error)
          }
        } else {
          size = await window.api.util.getFileSize(filePath)
          const res = await window.api.util.readFileContent(filePath, size)
          size = size
          isBin = res.isBinary
          content = res.content || ''
          if (res.error) setError(res.error)
        }

        setFileSize(size)

        // Limit editor to ~10MB
        if (size > 10 * 1024 * 1024) {
          setError('File too large for editor (>10MB). Use F3 viewer instead.')
          setLoading(false)
          return
        }

        if (isBin) {
          setError('Cannot edit binary files. Use F3 viewer instead.')
        } else if (!content && !usePlugin) {
          setError('Empty or unreadable')
        } else {
          setContent(content)
          setOriginalContent(content)
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

  const rootRef = useRef<HTMLDivElement>(null)

  // Use shared escape handler: blur inputs first, then close (with confirm if dirty)
  useEscapeKey(() => {
    if (modified) {
      if (window.confirm('Unsaved changes. Close anyway?')) {
        window.close()
      }
    } else {
      window.close()
    }
  })

  // Ensure focus for keyboard
  useEffect(() => {
    const t = setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
      } else {
        rootRef.current?.focus()
      }
    }, 0)
    return () => clearTimeout(t)
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault()
      handleSave()
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
  }, [handleSave, content, originalContent])

  const lineCount = content.split('\n').length

  return (
    <div ref={rootRef} className="appShell" style={{ background: 'var(--bg-primary)' }}>
      {loading ? (
        <div className="panelSlot" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Loading...
        </div>
      ) : error ? (
        <div className="panelSlot" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', padding: 'var(--space-6)', textAlign: 'center' }}>
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
            background: 'var(--bg-panel)',
            color: 'var(--text-primary)',
            border: 'none',
            padding: 'var(--space-4) var(--space-5)',
            fontFamily: 'var(--font-family)',
            fontSize: 'var(--font-size)',
            lineHeight: 1.5,
            outline: 'none',
            tabSize: 4
          }}
        />
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-5)',
          height: 'var(--statusbar-height)',
          padding: '0 var(--space-5)',
          background: 'var(--bg-secondary)',
          borderTop: 'var(--border-width) solid var(--border-subtle)',
          fontSize: 'var(--font-size-tiny)',
          fontFamily: 'var(--font-ui)',
          color: 'var(--text-muted)',
          flexShrink: 0
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{filePath}</span>
        <span>
          {formatSize(fileSize)} | {lineCount} lines
        </span>
        <button
          onClick={handleSave}
          disabled={!modified || saving}
          style={{
            height: 24,
            padding: '0 var(--space-3)',
            background: modified ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: modified ? 'var(--text-on-accent)' : 'var(--text-muted)',
            border: 'var(--border-width) solid var(--border-color)',
            borderRadius: 'var(--radius-xs)',
            fontSize: 'var(--font-size-tiny)',
            fontFamily: 'var(--font-ui)',
            cursor: modified ? 'pointer' : 'default',
            flexShrink: 0
          }}
        >
          {saving ? 'Saving...' : 'Save (Ctrl+S)'}
        </button>
        <span>Esc close</span>
      </div>
    </div>
  )
}
