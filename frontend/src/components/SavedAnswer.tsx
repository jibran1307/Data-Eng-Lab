import { Badge, Button, Card } from './ui'

export interface SavedEntry { label: string; code: string; ts: number; passed?: boolean }

/** Collapsible record of what you previously submitted, with a button to load it back into the editor. */
export default function SavedAnswer({ entries, onLoad, noun = 'code' }: { entries: SavedEntry[]; onLoad: (code: string) => void; noun?: string }) {
  if (!entries.length) return null
  return (
    <Card className="p-4">
      <div className="mb-2 text-xs font-medium text-muted">Saved {noun}</div>
      <div className="space-y-2">
        {entries.map((e) => (
          <details key={e.label} className="rounded-lg border border-line" open={entries.length === 1}>
            <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
              <span className="font-medium">{e.label}</span>
              {e.passed !== undefined && <Badge tone={e.passed ? 'ok' : 'warn'}>{e.passed ? 'passed' : 'not passed'}</Badge>}
              <span className="text-xs text-muted">{new Date(e.ts).toLocaleString()}</span>
            </summary>
            <div className="border-t border-line p-3">
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-code p-3 font-mono text-xs">{e.code}</pre>
              <Button size="sm" className="mt-2" onClick={() => onLoad(e.code)}>Load into editor</Button>
            </div>
          </details>
        ))}
      </div>
    </Card>
  )
}

/** Builds the entries to show for an exercise submission record. */
export function submissionEntries(sub?: { code: string; ts: number; passed: boolean; solved?: { code: string; ts: number } }): SavedEntry[] {
  if (!sub) return []
  const out: SavedEntry[] = [{ label: 'Last submission', code: sub.code, ts: sub.ts, passed: sub.passed }]
  if (sub.solved && sub.solved.code !== sub.code) out.push({ label: 'Last passing solution', code: sub.solved.code, ts: sub.solved.ts, passed: true })
  return out
}
