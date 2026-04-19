import { ipcMain } from 'electron'
import type { BrowsePlugin } from '@shared/types'
import { IPC_CHANNELS } from '@shared/types/ipc-channels'
import { pluginManager } from '../plugins/plugin-manager'
import { smbError } from '../plugins/shared/smb-errors'
import type { SftpPlugin } from '../plugins/sftp'
import type { S3Plugin } from '../plugins/s3'
import type { SmbPlugin } from '../plugins/smb'

function requirePlugin<T extends BrowsePlugin>(pluginId: string): T {
  const plugin = pluginManager.get(pluginId) as T | undefined
  if (!plugin) throw new Error(`${pluginId} plugin not loaded`)
  return plugin
}

/** Connection-management handlers for SFTP / S3 / SMB plugins. */
export function registerConnectionIPC(): void {
  // SFTP
  ipcMain.handle(
    IPC_CHANNELS.SFTP_CONNECT,
    async (_event, host: string, port: number, username: string, password?: string) => {
      return requirePlugin<SftpPlugin>('sftp').connect(host, port, username, password)
    }
  )
  ipcMain.handle(IPC_CHANNELS.SFTP_DISCONNECT, async (_event, connId: string) => {
    await requirePlugin<SftpPlugin>('sftp').disconnect(connId)
  })
  ipcMain.handle(IPC_CHANNELS.SFTP_LIST_CONNECTIONS, () => {
    const sftp = pluginManager.get('sftp') as SftpPlugin | undefined
    return sftp ? sftp.getConnections() : []
  })

  // S3
  ipcMain.handle(
    IPC_CHANNELS.S3_CONNECT,
    (_event, bucket: string, region: string, accessKeyId: string, secretAccessKey: string, label?: string) =>
      requirePlugin<S3Plugin>('s3').connect(bucket, region, accessKeyId, secretAccessKey, label)
  )
  ipcMain.handle(IPC_CHANNELS.S3_DISCONNECT, (_event, connId: string) => {
    const s3 = pluginManager.get('s3') as S3Plugin | undefined
    s3?.disconnect(connId)
  })

  // SMB
  ipcMain.handle(
    IPC_CHANNELS.SMB_CONNECT,
    (_event, host: string, share: string, username: string, password: string, domain?: string, label?: string) =>
      requirePlugin<SmbPlugin>('smb')
        .connect(host, share, username, password, domain, label)
        .catch((err: unknown) => { throw smbError(err) })
  )
  ipcMain.handle(IPC_CHANNELS.SMB_DISCONNECT, async (_event, connId: string) => {
    const smb = pluginManager.get('smb') as SmbPlugin | undefined
    if (smb) await smb.disconnect(connId)
  })
}
