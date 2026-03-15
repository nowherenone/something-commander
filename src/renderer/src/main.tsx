import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ViewerPage } from './pages/ViewerPage'
import { EditorPage } from './pages/EditorPage'
import './styles/global.css'

function Router(): React.JSX.Element {
  const hash = window.location.hash

  if (hash.startsWith('#/viewer')) {
    const params = new URLSearchParams(hash.split('?')[1] || '')
    const filePath = params.get('file') || ''
    const fileName = params.get('name') || 'Unknown'
    return <ViewerPage filePath={filePath} fileName={fileName} />
  }

  if (hash.startsWith('#/editor')) {
    const params = new URLSearchParams(hash.split('?')[1] || '')
    const filePath = params.get('file') || ''
    const fileName = params.get('name') || 'Unknown'
    return <EditorPage filePath={filePath} fileName={fileName} />
  }

  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Router />
  </React.StrictMode>
)
