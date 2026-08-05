import type { ReactNode } from 'react'
import type { Rejection } from '@leverage/engine'

/** Half of every screen is money, so every figure that can change is tabular. */
export function Money({ value, sign = false }: { value: number; sign?: boolean }): ReactNode {
  const negative = value < 0
  const body = `$${Math.abs(value).toLocaleString('en-US')}`
  return (
    <span className={`num ${negative ? 'text-[#7b1e1e]' : ''}`}>
      {negative ? '−' : sign ? '+' : ''}{body}
    </span>
  )
}

export function Pct({ value, places = 0 }: { value: number; places?: number }): ReactNode {
  return <span className="num">{(value * 100).toFixed(places)}%</span>
}

export function Panel(
  { title, aside, children, tone = 'plain' }: {
    title?: string; aside?: ReactNode; children: ReactNode
    tone?: 'plain' | 'structural' | 'risk'
  },
): ReactNode {
  const rule = tone === 'risk' ? '#7b1e1e' : tone === 'structural' ? '#1b5e43' : '#ddd6c3'
  return (
    <section className="panel" style={{ borderTopWidth: 2, borderTopColor: rule }}>
      {title !== undefined && (
        <header className="flex items-baseline justify-between gap-3 px-3 pt-2 pb-1">
          <h2 className="legend">{title}</h2>
          {aside}
        </header>
      )}
      <div className="px-3 pb-3">{children}</div>
    </section>
  )
}

export function Row(
  { label, children, tone }: { label: string; children: ReactNode; tone?: 'risk' },
): ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dotted border-[#ddd6c3] py-1 last:border-b-0">
      <span className={`text-[0.8rem] ${tone === 'risk' ? 'text-[#7b1e1e]' : 'text-[#55503f]'}`}>
        {label}
      </span>
      <span className="text-[0.85rem]">{children}</span>
    </div>
  )
}

/**
 * The engine's rejection, shown verbatim. Its `message` is written for the player, not
 * the developer — "Your borrowing base allows at most $340 more", not an error code —
 * so rewording it here would only make it worse.
 */
export function RejectionToast(
  { rejection, onDismiss }: { rejection: Rejection | null; onDismiss: () => void },
): ReactNode {
  if (rejection === null) return null
  return (
    <div
      role="alert"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl border-2 border-[#7b1e1e] bg-[#f0dcdc] px-4 py-3 shadow-lg"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="legend text-[#7b1e1e]">{rejection.code.replace(/_/g, ' ')}</p>
          <p className="mt-1 text-[0.9rem] text-[#1c1a15]">{rejection.message}</p>
        </div>
        <button type="button" className="btn btn-risk shrink-0" onClick={onDismiss}>Close</button>
      </div>
    </div>
  )
}

export function Connection({ live }: { live: boolean }): ReactNode {
  return (
    <span className="legend inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className="inline-block size-2 rounded-full"
        style={{ background: live ? '#1b5e43' : '#7b1e1e' }}
      />
      {live ? 'live' : 'reconnecting'}
    </span>
  )
}

export function Empty({ children }: { children: ReactNode }): ReactNode {
  return <p className="py-2 text-[0.8rem] italic text-[#8b8570]">{children}</p>
}
