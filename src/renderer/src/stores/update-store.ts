import { create } from 'zustand'

export type UpdatePhase =
  | 'idle'
  | 'checking'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdateState {
  phase: UpdatePhase
  /** Remote version when known */
  availableVersion: string | null
  /** 0–100 while downloading */
  downloadPercent: number
  lastError: string | null

  setFromStatus: (status: { type: string; data?: any }) => void
  setPhase: (phase: UpdatePhase, extra?: Partial<Pick<UpdateState, 'availableVersion' | 'lastError' | 'downloadPercent'>>) => void
  /** Silent / background check — never toasts for "available". */
  checkForUpdates: (opts?: { autoDownload?: boolean }) => Promise<{
    updateAvailable: boolean
    version?: string
    error?: string
  }>
  /**
   * User clicked the update control:
   * download if needed, then quit and install (restart).
   */
  installAndRestart: () => Promise<void>
}

function updateApi(): {
  checkForUpdates?: () => Promise<{ updateAvailable: boolean; version?: string; error?: string }>
  downloadUpdate?: () => Promise<{ success: boolean; error?: string }>
  quitAndInstall?: () => void
  setAutoDownload?: (enabled: boolean) => void
} | null {
  return (window as any).api?.update ?? null
}

export const useUpdateStore = create<UpdateState>((set, get) => ({
  phase: 'idle',
  availableVersion: null,
  downloadPercent: 0,
  lastError: null,

  setFromStatus: (status) => {
    switch (status.type) {
      case 'checking':
        set({ phase: 'checking', lastError: null })
        break
      case 'available':
        set({
          phase: 'available',
          availableVersion: status.data?.version ?? get().availableVersion,
          lastError: null
        })
        break
      case 'not-available':
        // Don't clear a ready/available badge if we already know an update exists
        if (get().phase === 'ready' || get().phase === 'available' || get().phase === 'downloading') {
          break
        }
        set({ phase: 'idle', availableVersion: null, downloadPercent: 0, lastError: null })
        break
      case 'download-progress':
        set({
          phase: 'downloading',
          downloadPercent: Math.round(status.data?.percent ?? 0)
        })
        break
      case 'downloaded':
        set({
          phase: 'ready',
          availableVersion: status.data?.version ?? get().availableVersion,
          downloadPercent: 100,
          lastError: null
        })
        break
      case 'error':
        set({
          phase: get().phase === 'ready' ? 'ready' : 'error',
          lastError: typeof status.data === 'string' ? status.data : status.data?.message || String(status.data || 'Update error')
        })
        break
      default:
        break
    }
  },

  setPhase: (phase, extra) => set({ phase, ...extra }),

  checkForUpdates: async (opts = {}) => {
    const api = updateApi()
    if (!api?.checkForUpdates) {
      return { updateAvailable: false, error: 'Update system not available' }
    }

    set({ phase: 'checking', lastError: null })
    try {
      const res = await api.checkForUpdates()
      if (res.error) {
        set({ phase: 'error', lastError: res.error })
        return res
      }
      if (res.updateAvailable) {
        set({
          phase: 'available',
          availableVersion: res.version ?? null,
          lastError: null
        })
        if (opts.autoDownload && api.downloadUpdate) {
          set({ phase: 'downloading', downloadPercent: 0 })
          const dl = await api.downloadUpdate()
          if (dl.success) {
            set({ phase: 'ready', downloadPercent: 100 })
          } else {
            set({
              phase: 'available',
              lastError: dl.error || 'Download failed'
            })
          }
        }
        return res
      }
      set({ phase: 'idle', availableVersion: null, downloadPercent: 0, lastError: null })
      return res
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      set({ phase: 'error', lastError: message })
      return { updateAvailable: false, error: message }
    }
  },

  installAndRestart: async () => {
    const api = updateApi()
    if (!api) return

    const { phase } = get()

    // Already downloaded → restart now
    if (phase === 'ready') {
      api.quitAndInstall?.()
      return
    }

    // Need to download first
    if (phase === 'available' || phase === 'error' || phase === 'idle') {
      // If idle, check first
      if (phase === 'idle') {
        const res = await get().checkForUpdates()
        if (!res.updateAvailable) return
      }

      if (!api.downloadUpdate) return
      set({ phase: 'downloading', downloadPercent: 0, lastError: null })
      const dl = await api.downloadUpdate()
      if (!dl.success) {
        set({
          phase: 'available',
          lastError: dl.error || 'Download failed'
        })
        return
      }
      set({ phase: 'ready', downloadPercent: 100 })
      api.quitAndInstall?.()
      return
    }

    if (phase === 'downloading') {
      // Already in progress — wait for ready via status events; user can click again when ready
      return
    }
  }
}))

/** Hint text for the menu-bar update control. */
export function updateBadgeTitle(s: Pick<UpdateState, 'phase' | 'availableVersion' | 'downloadPercent' | 'lastError'>): string {
  const ver = s.availableVersion ? ` ${s.availableVersion}` : ''
  switch (s.phase) {
    case 'checking':
      return 'Checking for updates…'
    case 'available':
      return `Update${ver} available — click to install and restart`
    case 'downloading':
      return `Downloading update${ver}… ${s.downloadPercent}%`
    case 'ready':
      return `Update${ver} ready — click to restart and install`
    case 'error':
      return s.lastError
        ? `Update error: ${s.lastError}`
        : 'Update check failed'
    default:
      return ''
  }
}

export function updateBadgeVisible(phase: UpdatePhase): boolean {
  return phase === 'available' || phase === 'downloading' || phase === 'ready' || phase === 'error'
}
