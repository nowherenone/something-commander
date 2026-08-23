import { app, screen, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { join } from 'path'

/**
 * Window geometry persistence (UX plan F-11). The main process owns the OS
 * window, so it owns the bounds file: `<userData>/window-state.json`.
 * Saved bounds are clamped against the current work area so a monitor that
 * disappeared since last launch can't strand the window off-screen.
 */

export interface WindowState {
  width: number
  height: number
  x?: number
  y?: number
  maximized?: boolean
}

const DEFAULTS: WindowState = { width: 1200, height: 800 }

function statePath(): string {
  return join(app.getPath('userData'), 'window-state.json')
}

export function loadWindowState(): WindowState {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<WindowState>
    const state: WindowState = {
      width: typeof parsed.width === 'number' ? parsed.width : DEFAULTS.width,
      height: typeof parsed.height === 'number' ? parsed.height : DEFAULTS.height,
      x: typeof parsed.x === 'number' ? parsed.x : undefined,
      y: typeof parsed.y === 'number' ? parsed.y : undefined,
      maximized: !!parsed.maximized
    }
    return clampToWorkArea(state)
  } catch {
    return { ...DEFAULTS }
  }
}

/** Keep the window at least partly on a connected display. */
function clampToWorkArea(state: WindowState): WindowState {
  if (state.x === undefined || state.y === undefined) return state
  const area = screen.getPrimaryDisplay().workArea
  const visibleWidth = Math.min(state.x + state.width, area.x + area.width) - Math.max(state.x, area.x)
  const visibleHeight = Math.min(state.y + state.height, area.y + area.height) - Math.max(state.y, area.y)
  if (visibleWidth < state.width * 0.25 || visibleHeight < state.height * 0.25) {
    // Mostly off-screen — reset position, keep the size.
    return { width: state.width, height: state.height }
  }
  return state
}

export function saveWindowState(win: BrowserWindow): void {
  try {
    if (win.isDestroyed()) return
    const bounds = win.getNormalBounds() // pre-maximize geometry
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: win.isMaximized()
    }
    const file = statePath()
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(state, null, 2))
  } catch {
    // Best-effort persistence — never block quit over it.
  }
}
