/** IPC payloads for streaming command-line runs (see main/command-runner.ts). */

export interface CmdDataEvent {
  type: 'data'
  runId: string
  stream: 'stdout' | 'stderr'
  text: string
}

export interface CmdExitEvent {
  type: 'exit'
  runId: string
  code: number | null
  signal: string | null
  /** Spawn failure (bad cwd, missing shell …). */
  error?: string
  /** Ended by stop(). */
  stopped?: boolean
}

export type CmdRunEvent = CmdDataEvent | CmdExitEvent

export interface CmdStartOptions {
  command: string
  cwd: string
  /** Settings ▸ Shell override (blank → platform default). */
  shell?: string
}

export interface CmdPathCompletion {
  name: string
  isDir: boolean
}
