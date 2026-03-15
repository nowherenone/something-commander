import React from 'react'
import { useAppStore } from '../../stores/app-store'
import { FilePanel } from './FilePanel'
import { Splitter } from '../layout/Splitter'

export function DualPanel(): React.JSX.Element {
  const splitRatio = useAppStore((s) => s.splitRatio)

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      <div style={{ width: `${splitRatio * 100}%`, display: 'flex', overflow: 'hidden' }}>
        <FilePanel panelId="left" />
      </div>
      <Splitter />
      <div style={{ width: `${(1 - splitRatio) * 100}%`, display: 'flex', overflow: 'hidden' }}>
        <FilePanel panelId="right" />
      </div>
    </div>
  )
}
