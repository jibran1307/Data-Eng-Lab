import type { SqlResult } from '../lib/api'

export default function ResultTable({ result, title }: { result: SqlResult; title?: string }) {
  if (result.error) {
    return <pre className="whitespace-pre-wrap rounded-lg border border-bad/40 bg-bad/10 p-3 font-mono text-xs text-bad">{result.error}</pre>
  }
  if (!result.columns?.length) return <div className="rounded-lg border border-line bg-surface2 p-3 text-sm text-muted">{result.message ?? 'No rows returned.'}</div>
  return (
    <div>
      {title && <div className="mb-1 text-xs font-medium text-muted">{title}</div>}
      <div className="max-h-72 overflow-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 bg-surface2"><tr>{result.columns.map((c) => <th key={c} className="whitespace-nowrap border-b border-line px-3 py-2 font-semibold">{c}</th>)}</tr></thead>
          <tbody>
            {(result.rows ?? []).map((r, i) => (
              <tr key={i} className="border-b border-line last:border-0">
                {r.map((v, j) => <td key={j} className="whitespace-nowrap px-3 py-1.5 font-mono">{v === null ? <span className="text-muted">NULL</span> : String(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-1 text-xs text-muted">{result.row_count} row{result.row_count === 1 ? '' : 's'}{result.truncated ? ' (showing first 500)' : ''}</div>
    </div>
  )
}
