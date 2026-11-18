import { lazy, Suspense } from 'react'
import { useTheme } from '../lib/theme'

const MonacoInner = lazy(() => import('./MonacoInner'))

interface Props {
  value: string
  onChange: (v: string) => void
  language: 'sql' | 'python' | 'yaml' | 'markdown' | 'json' | 'plaintext'
  height?: number | string
  readOnly?: boolean
  onRun?: () => void
}

/** Lazily loaded Monaco editor (bundled locally, works offline). Follows the app theme. */
export default function CodeEditor(props: Props) {
  const { theme } = useTheme()
  return (
    <div className="overflow-hidden rounded-lg border border-line" style={{ height: props.height ?? 260 }}>
      <Suspense fallback={<div className="skeleton h-full w-full" />}>
        <MonacoInner {...props} theme={theme} />
      </Suspense>
    </div>
  )
}
