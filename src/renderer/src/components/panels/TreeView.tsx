import React, { useState, useCallback, useEffect } from 'react'
import type { Entry } from '@shared/types'
import { getIconForHint } from '../../utils/icon-map'
import styles from '../../styles/panels.module.css'

interface TreeNode {
  entry: Entry
  children: TreeNode[] | null // null = not loaded, [] = loaded but empty
  expanded: boolean
  depth: number
}

interface TreeViewProps {
  pluginId: string
  locationId: string | null
  onNavigate: (locationId: string) => void
}

export function TreeView({ pluginId, locationId, onNavigate }: TreeViewProps): React.JSX.Element {
  const [nodes, setNodes] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(false)

  // Load root
  useEffect(() => {
    setLoading(true)
    window.api.plugins.readDirectory(pluginId, locationId).then((result) => {
      const treeNodes = result.entries
        .filter((e) => e.isContainer)
        .map((entry) => ({
          entry,
          children: null,
          expanded: false,
          depth: 0
        }))
      setNodes(treeNodes)
      setLoading(false)
    })
  }, [pluginId, locationId])

  const toggleExpand = useCallback(async (node: TreeNode, path: number[]) => {
    if (node.expanded) {
      // Collapse
      setNodes((prev) => updateNodeAt(prev, path, { ...node, expanded: false }))
    } else {
      // Expand — load children if needed
      if (node.children === null) {
        const result = await window.api.plugins.readDirectory(pluginId, node.entry.id)
        const children = result.entries
          .filter((e) => e.isContainer)
          .map((entry) => ({
            entry,
            children: null,
            expanded: false,
            depth: node.depth + 1
          }))
        setNodes((prev) => updateNodeAt(prev, path, { ...node, expanded: true, children }))
      } else {
        setNodes((prev) => updateNodeAt(prev, path, { ...node, expanded: true }))
      }
    }
  }, [pluginId])

  const handleClick = useCallback((node: TreeNode) => {
    onNavigate(node.entry.id)
  }, [onNavigate])

  if (loading) {
    return <div className={styles.loading}>Loading tree...</div>
  }

  const flatList = flattenTree(nodes)

  return (
    <div style={{ flex: 1, overflow: 'auto', fontSize: 12 }}>
      {flatList.map(({ node, path }) => (
        <div
          key={node.entry.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            height: 22,
            paddingLeft: 8 + node.depth * 16,
            cursor: 'pointer',
            color: 'var(--text-primary)'
          }}
          onClick={() => handleClick(node)}
          onDoubleClick={() => toggleExpand(node, path)}
        >
          <span
            style={{ width: 16, textAlign: 'center', fontSize: 10, color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}
            onClick={(e) => { e.stopPropagation(); toggleExpand(node, path) }}
          >
            {node.children === null || (node.children && node.children.length > 0)
              ? (node.expanded ? '\u25BC' : '\u25B6')
              : '\u2022'}
          </span>
          <span style={{ marginRight: 4, fontSize: 13 }}>{getIconForHint('folder')}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.entry.name}
          </span>
        </div>
      ))}
    </div>
  )
}

function flattenTree(nodes: TreeNode[]): Array<{ node: TreeNode; path: number[] }> {
  const result: Array<{ node: TreeNode; path: number[] }> = []
  function walk(list: TreeNode[], pathPrefix: number[]): void {
    list.forEach((node, i) => {
      const path = [...pathPrefix, i]
      result.push({ node, path })
      if (node.expanded && node.children) {
        walk(node.children, path)
      }
    })
  }
  walk(nodes, [])
  return result
}

function updateNodeAt(nodes: TreeNode[], path: number[], newNode: TreeNode): TreeNode[] {
  if (path.length === 0) return nodes
  const result = [...nodes]
  if (path.length === 1) {
    result[path[0]] = newNode
    return result
  }
  const [head, ...rest] = path
  const parent = { ...result[head] }
  parent.children = parent.children ? updateNodeAt(parent.children, rest, newNode) : null
  result[head] = parent
  return result
}
