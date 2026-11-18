import { Loader2 } from 'lucide-react'
import { STATIC_MODE } from '../lib/api'
import { useEngineStatus } from './status'

/** Small notice while a browser engine downloads (first Python run is ~10 MB; later visits are cached). */
export default function EngineBanner({ engine }: { engine: 'sql' | 'python' }) {
  const status = useEngineStatus()[engine]
  if (!STATIC_MODE || status.state !== 'loading') return null
  return (
    <div role="status" className="mb-3 flex items-center gap-2 rounded-lg border border-line bg-accent-soft px-3 py-2 text-sm text-accent">
      <Loader2 size={14} className="animate-spin" />{status.detail ?? 'Loading engine'}. This happens once; it is cached afterwards.
    </div>
  )
}
