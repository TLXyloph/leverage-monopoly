import type { ReactNode } from 'react'
import type { PlayerId } from '@leverage/engine'
import { useGame } from '../useGame.ts'
import { ActionPanel } from '../components/Actions.tsx'
import { DraftPanel } from '../components/Draft.tsx'
import {
  CreditGauge, Exposure, NetWorth, Portfolio, Ventures, Warnings,
} from '../components/Assist.tsx'
import { Connection, Money, Panel, RejectionToast, Row } from '../components/primitives.tsx'

/**
 * `/p/:token` — what a player holds in their hand at the table.
 *
 * Phone-first, because that is where it is read. Players act HERE, not through the
 * facilitator: the Open phase is 45–90 seconds of all four acting simultaneously, and
 * queueing them behind one keyboard turns a 2.5-hour game into a four-hour one.
 */
export function PlayerShell({ token }: { token: string }): ReactNode {
  const game = useGame(token)
  const me = game.claims?.role.kind === 'player' ? game.claims.role.player : null

  if (game.error !== null) return <Fatal message={game.error} />
  if (game.sync === null || me === null) return <Loading />

  const sync = game.sync
  const player = sync.state.players[me]
  const assist = sync.assist[me]
  if (player === undefined || assist === undefined) return <Loading />

  return (
    <div className="mx-auto max-w-2xl px-3 pb-16 pt-3">
      <header className="mb-3 flex items-baseline justify-between gap-3 border-b-2 border-[#1b5e43] pb-1.5">
        <div>
          <h1 className="text-[1.4rem] leading-none tracking-tight">{me}</h1>
          <p className="legend mt-1">
            round {sync.state.round} of 24 · era {sync.state.era} · {sync.state.phase}
          </p>
        </div>
        <Connection live={game.live} />
      </header>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <Figure id="clean-cash" label="Clean cash" value={player.cleanCash} />
        <Figure id="dirty-cash" label="Dirty cash" value={player.dirtyCash} muted />
        <Figure id="net-worth" label="Net worth" value={sync.derived.netWorths[me] ?? 0} />
      </div>

      <div className="space-y-3">
        <DraftPanel
          sync={sync}
          me={me}
          disabled={game.pending}
          onSubmit={(command) => { void game.send(command) }}
        />
        <Warnings assist={assist} />
        <ActionPanel
          sync={sync}
          me={me}
          disabled={game.pending}
          onSubmit={(command) => { void game.send(command) }}
        />
        <CreditGauge assist={assist} />
        <Ventures assist={assist} />
        <Exposure assist={assist} />
        <Portfolio assist={assist} />
        <MyContracts sync={sync} me={me} />
        <NetWorth assist={assist} />
      </div>

      <RejectionToast rejection={game.rejection} onDismiss={game.dismiss} />
    </div>
  )
}

function Figure(
  { id, label, value, muted }: {
    id: string; label: string; value: number; muted?: boolean
  },
): ReactNode {
  return (
    <div
      data-figure={id}
      className="panel px-2.5 py-1.5"
      style={{ borderTopWidth: 2, borderTopColor: muted ? '#9a7b28' : '#1b5e43' }}
    >
      <p className="legend">{label}</p>
      <p className="mt-0.5 text-[1.15rem] leading-none"><Money value={value} /></p>
    </div>
  )
}

function MyContracts(
  { sync, me }: { sync: ReturnType<typeof useGame>['sync'] & object; me: PlayerId },
): ReactNode {
  const mine = sync.derived.contracts.filter((c) => c.counterparties.includes(me))
  if (mine.length === 0) return null
  return (
    <Panel title="Your contracts">
      {mine.map((contract) => (
        <Row key={contract.id} label={`${contract.kind} · ${contract.summary}`}>
          <Money value={contract.mark} />
        </Row>
      ))}
    </Panel>
  )
}

export function Loading(): ReactNode {
  return (
    <div className="grid h-full place-items-center">
      <p className="legend">connecting…</p>
    </div>
  )
}

export function Fatal({ message }: { message: string }): ReactNode {
  return (
    <div className="grid h-full place-items-center px-6">
      <div className="panel max-w-sm border-t-2 border-t-[#7b1e1e] px-4 py-3">
        <p className="legend text-[#7b1e1e]">cannot open</p>
        <p className="mt-1 text-[0.9rem]">{message}</p>
      </div>
    </div>
  )
}
