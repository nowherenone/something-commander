import React, { useEffect, useState, useCallback, useRef } from 'react'
import { formatSize } from '../utils/format'
import { useSizeFormat } from '../stores/settings-store'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { parseEditorPath, resolveEditorSaveTarget } from '../utils/editor-path'

interface EditorPageProps {
  filePath: string
  fileName: string
}

export function EditorPage({ filePath }: EditorPageProps): React.JSX.Element {
  const sizeFormat = useSizeFormat()
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [modified, setModified] = useState(false)
  const [fileSize, setFileSize] = useState(0)
  const [confirmClose, setConfirmClose] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    async function loadFile(): Promise<void> {
      setLoading(true)
      setLoadError(null)
      try {
        // Always plugin-scoped (plain paths → local-filesystem)
        const { pluginId, entryId } = parseEditorPath(filePath)
        const maxEditBytes = 10 * 1024 * 1024

        const probe = await window.api.util.readEntryContent(pluginId, entryId, 0, 1)
        let size = probe.totalSize || 0
        if (size > maxEditBytes) {
          setFileSize(size)
          setLoadError('File too large for editor (>10MB). Use F3 viewer instead.')
          setLoading(false)
          return
        }
        const res = await window.api.util.readEntryContent(
          pluginId,
          entryId,
          0,
          size > 0 ? size : maxEditBytes
        )
        size = res.totalSize || size
        setFileSize(size)
        if (res.error) {
          setLoadError(res.error)
        } else if (res.isBinary) {
          setLoadError('Cannot edit binary files. Use F3 viewer instead.')
        } else {
          const text = typeof res.data === 'string' ? res.data : ''
          setContent(text)
          setOriginalContent(text)
        }
      } catch (err) {
        setLoadError(String(err))
      }
      setLoading(false)
    }
    loadFile()
  }, [filePath])

  const handleSave = useCallback(async () => {
    setSaving(true)
    setSaveMessage(null)

    const target = resolveEditorSaveTarget(filePath)
    if ('error' in target) {
      setSaveMessage(target.error)
      setSaving(false)
      return
    }

    try {
      const result = await window.api.util.saveEntryContent(
        target.pluginId,
        target.entryId,
        content
      )
      if (result.success) {
        setOriginalContent(content)
        setModified(false)
        setFileSize(
          typeof result.bytesWritten === 'number'
            ? result.bytesWritten
            : new TextEncoder().encode(content).length
        )
        setSaveMessage('Saved')
        window.setTimeout(() => setSaveMessage(null), 2000)
      } else {
        setSaveMessage(result.error || 'Save failed')
      }
    } catch (err) {
      setSaveMessage(String(err))
    }
    setSaving(false)
  }, [filePath, content])

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value)
    setModified(e.target.value !== originalContent)
    setSaveMessage(null)
  }, [originalContent])

  const rootRef = useRef<HTMLDivElement>(null)

  // Esc: first press opens the unsaved-changes confirm (no native window.confirm —
  // it steals focus styling and looks alien next to the custom chrome), second
  // press cancels back to the editor.
  useEscapeKey(() => {
    if (confirmClose) {
      setConfirmClose(false)
      return
    }
    if (modified) {
      setConfirmClose(true)
    } else {
      window.close()
    }
  })

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
      void handleSave()
    }
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
  const displayPath = parseEditorPath(filePath).entryId || filePath

  return (
    <div ref={rootRef} className="appShell" style={{ background: 'var(--bg-primary)' }}>
      {confirmClose && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--overlay-bg)',
            backdropFilter: 'blur(2px)'
          }}
          data-testid="editor-close-confirm"
        >
          <div
            style={{
              background: 'var(--bg-panel)',
              border: 'var(--border-width) solid var(--border-color)',
              borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--shadow-dialog)',
              padding: 'var(--space-7)',
              width: 320,
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: 'var(--font-size-ui)', color: 'var(--text-primary)', marginBottom: 6 }}>
              Unsaved changes
            </div>
            <div style={{ fontSize: 'var(--font-size-small)', color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
              Close without saving?
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'center' }}>
              <button
                autoFocus
                onClick={() => setConfirmClose(false)}
                style={{
                  height: 28,
                  padding: '0 var(--space-5)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-secondary)',
                  border: 'var(--border-width) solid var(--border-color)',
                  borderRadius: 'var(--radius-xs)',
                  cursor: 'pointer'
                }}
              >
                Cancel (Esc)
              </button>
              <button
                onClick={() => window.close()}
                style={{
                  height: 28,
                  padding: '0 var(--space-5)',
                  background: 'var(--danger)',
                  color: 'var(--text-on-accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-xs)',
                  cursor: 'pointer'
                }}
              >
                Close without saving
              </button>
            </div>
          </div>
        </div>
      )}
      {loading ? (
        <div className="panelSlot" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
          Loading...
        </div>
      ) : loadError ? (
        <div className="panelSlot" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', padding: 'var(--space-6)', textAlign: 'center' }}>
          {loadError}
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
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{displayPath}</span>
        <span>
          {formatSize(fileSize, sizeFormat)} | {lineCount} lines
          {modified ? ' | modified' : ''}
          {saveMessage ? (
            <span style={{ color: saveMessage === 'Saved' ? 'var(--success)' : 'var(--danger)', marginLeft: 8 }}>
              {saveMessage}
            </span>
          ) : null}
        </span>
        <button
          onClick={() => void handleSave()}
          disabled={!modified || saving || !!loadError}
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
