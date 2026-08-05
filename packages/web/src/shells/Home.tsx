import { useState, type ReactNode } from 'react'
import { Panel } from '../components/primitives.tsx'

/**
 * `/` — where a game night starts. Creates a table and prints the six links: one per
 * player, one for the facilitator, one for the television.
 *
 * No auth: the server binds to localhost or to a tunnel the operator opened themselves,
 * and whoever can reach it is the person running the game. There are no accounts here to
 * protect and no keys anywhere in the project.
 */

interface Created {
  gameId: string
  roomCode: string
  urls: { admin: string; table: string; players: Record<string, string> }
}

export function HomeShell(): ReactNode {
  const [label, setLabel] = useState('LEVERAGE')
  const [unlockMode, setUnlockMode] = useState<'progressive' | 'all'>('progressive')
  const [created, setCreated] = useState<Created | null>(null)
  const [busy, setBusy] = useState(false)

  const create = async (): Promise<void> => {
    setBusy(true)
    try {
      const response = await fetch('/api/games', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ label, unlockMode }),
      })
      setCreated((await response.json()) as Created)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="mb-1 text-[2.6rem] leading-none tracking-tight">LEVERAGE</h1>
      <p className="mb-6 border-b-2 border-[#1b5e43] pb-3 text-[0.95rem] text-[#55503f]">
        A Monopoly variant that replaces landing luck with financial skill. The board,
        dice, tokens and houses stay physical; this owns every dollar.
      </p>

      {created === null ? (
        <Panel title="Open a table" tone="structural">
          <label className="mb-2 block">
            <span className="legend">Name</span>
            <input
              className="field mt-0.5" value={label}
              onChange={(e) => { setLabel(e.target.value) }}
            />
          </label>
          <label className="mb-3 block">
            <span className="legend">Instruments</span>
            <select
              className="field mt-0.5" value={unlockMode}
              onChange={(e) => { setUnlockMode(e.target.value as 'progressive' | 'all') }}
            >
              <option value="progressive">unlock era by era (the real game)</option>
              <option value="all">all available from round 1 (teaching)</option>
            </select>
          </label>
          <button type="button" className="btn" disabled={busy} onClick={() => { void create() }}>
            {busy ? 'opening…' : 'Open the table'}
          </button>
        </Panel>
      ) : (
        <Panel title={`Room ${created.roomCode}`} tone="structural">
          <p className="mb-3 text-[0.85rem] text-[#55503f]">
            Hand each player their own link. The facilitator keeps the first one. Every
            link survives a reload and a server restart.
          </p>
          <Link label="Facilitator" href={created.urls.admin} />
          {Object.entries(created.urls.players).map(([player, href]) => (
            <Link key={player} label={player} href={href} />
          ))}
          <Link label="Television" href={created.urls.table} />
        </Panel>
      )}
    </div>
  )
}

function Link({ label, href }: { label: string; href: string }): ReactNode {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dotted border-[#ddd6c3] py-1.5 last:border-b-0">
      <span className="w-24 text-[0.9rem]">{label}</span>
      <a className="num truncate text-[0.75rem] text-[#1b5e43] underline" href={href}>
        {href}
      </a>
      <button
        type="button" className="btn shrink-0"
        onClick={() => {
          void navigator.clipboard?.writeText(`${window.location.origin}${href}`)
        }}
      >
        Copy
      </button>
    </div>
  )
}
