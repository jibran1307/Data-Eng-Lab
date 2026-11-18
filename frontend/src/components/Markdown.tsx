import { Children, isValidElement, useMemo, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import hljs from 'highlight.js/lib/core'
import sql from 'highlight.js/lib/languages/sql'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import yaml from 'highlight.js/lib/languages/yaml'
import json from 'highlight.js/lib/languages/json'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import ini from 'highlight.js/lib/languages/ini'
import plaintext from 'highlight.js/lib/languages/plaintext'
import { CopyButton } from './ui'

hljs.registerLanguage('sql', sql)
hljs.registerLanguage('python', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('json', json)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('text', plaintext)

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const textOf = (n: ReactNode): string => {
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(textOf).join('')
  if (isValidElement(n)) return textOf((n.props as { children?: ReactNode }).children)
  return ''
}

export function CodeBlock({ code, lang }: { code: string; lang: string }) {
  const html = useMemo(() => {
    try { return hljs.highlight(code, { language: hljs.getLanguage(lang) ? lang : 'text' }).value } catch { return code.replace(/&/g, '&amp;').replace(/</g, '&lt;') }
  }, [code, lang])
  return (
    <div className="group my-4 overflow-hidden rounded-lg border border-line bg-code">
      <div className="flex items-center justify-between border-b border-line px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted">{lang || 'text'}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-3.5 text-[13px] leading-6"><code className="hljs font-mono" dangerouslySetInnerHTML={{ __html: html }} /></pre>
    </div>
  )
}

/** Extract h2/h3 headings for the table of contents. */
export function extractToc(md: string): { id: string; text: string; level: number }[] {
  const out: { id: string; text: string; level: number }[] = []
  let fence = false
  for (const line of md.split('\n')) {
    if (line.startsWith('```')) fence = !fence
    if (fence) continue
    const m = /^(##|###)\s+(.*)$/.exec(line)
    if (m) out.push({ id: slug(m[2]), text: m[2].replace(/[`*]/g, ''), level: m[1].length })
  }
  return out
}

/** Expandable example: write `<details>`-like blocks using a blockquote that starts with "**Example:**" is not needed;
 *  instead authors use fenced code and the UI keeps it simple. */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="prose-lab">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h2: ({ children: c }) => <h2 id={slug(textOf(c))}>{c}</h2>,
          h3: ({ children: c }) => <h3 id={slug(textOf(c))}>{c}</h3>,
          a: ({ href, children: c }) => <a href={href} target="_blank" rel="noreferrer noopener">{c}</a>,
          pre: ({ children: c }) => {
            const child = Children.toArray(c)[0]
            if (isValidElement(child)) {
              const p = child.props as { className?: string; children?: ReactNode }
              const lang = /language-(\w+)/.exec(p.className ?? '')?.[1] ?? 'text'
              return <CodeBlock code={textOf(p.children).replace(/\n$/, '')} lang={lang} />
            }
            return <pre>{c}</pre>
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
