import React from 'react'
import { useAppStore } from '../../stores/app-store'
import { FilePanel } from './FilePanel'
import { Splitter } from '../layout/Splitter'

export function DualPanel(): React.JSX.Element {
  const splitRatio = useAppStore((s) => s.splitRatio)

  return (
    <div className="panelRow">
      <div className="panelSlot" style={{ width: `${splitRatio * 100}%` }}>
        <FilePanel panelId="left" />
      </div>
      <Splitter />
      <div className="panelSlot" style={{ width: `${(1 - splitRatio) * 100}%` }}>
        <FilePanel panelId="right" />
      </div>
    </div>
  )
}
