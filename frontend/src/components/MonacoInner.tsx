import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker'

// Serve Monaco from the local bundle instead of a CDN so the app works fully offline.
;(self as unknown as { MonacoEnvironment: unknown }).MonacoEnvironment = { getWorker: () => new EditorWorker() }
loader.config({ monaco })

let themesDefined = false
function defineThemes() {
  if (themesDefined) return
  themesDefined = true
  monaco.editor.defineTheme('lab-dark', {
    base: 'vs-dark', inherit: true, rules: [],
    colors: { 'editor.background': '#12151a', 'editorGutter.background': '#12151a', 'editor.lineHighlightBackground': '#1a1e25', 'editorLineNumber.foreground': '#4a5160' },
  })
  monaco.editor.defineTheme('lab-light', {
    base: 'vs', inherit: true, rules: [],
    colors: { 'editor.background': '#f6f7f9', 'editorGutter.background': '#f6f7f9', 'editor.lineHighlightBackground': '#eceef2' },
  })
}

interface Props {
  value: string; onChange: (v: string) => void; language: string; theme: 'dark' | 'light'
  readOnly?: boolean; onRun?: () => void
}

export default function MonacoInner({ value, onChange, language, theme, readOnly, onRun }: Props) {
  return (
    <Editor
      value={value}
      language={language}
      theme={theme === 'dark' ? 'lab-dark' : 'lab-light'}
      beforeMount={defineThemes}
      onChange={(v) => onChange(v ?? '')}
      onMount={(ed, m) => {
        if (onRun) ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.Enter, () => onRun())
      }}
      options={{
        readOnly, minimap: { enabled: false }, fontSize: 13, lineHeight: 20, scrollBeyondLastLine: false,
        padding: { top: 10, bottom: 10 }, automaticLayout: true, tabSize: 4, renderLineHighlight: 'line',
        fontFamily: 'ui-monospace, "SF Mono", Menlo, Consolas, monospace', wordWrap: 'on',
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      }}
    />
  )
}
