import { useEffect, useState, type ReactNode } from 'react'
import { PLAYER_IDS, type Era, type PlayerId } from '@leverage/engine'
import type { Sync, WireCommand } from '@leverage/server'
import { fetchStatic } from '../api.ts'
import { useGame, type Game } from '../useGame.ts'
import { ActionPanel } from '../components/Actions.tsx'
import { DraftPanel } from '../components/Draft.tsx'
import { Warnings } from '../components/Assist.tsx'
import { Connection, Empty, Money, Panel, RejectionToast, Row } from '../components/primitives.tsx'
import { Fatal, Loading } from './Player.tsx'

/**
 * `/admin` — the facilitator's console.
 *
 * The override is ON TOP of player self-service, not instead of it: the facilitator runs
 * the clock, enters dice for anyone away from their phone, runs the liquidation auction,
 * and undoes their own typos. Undo is the most-used control here and is treated as a
 * first-class one, not an emergency escape — the facilitator WILL mistype a die roll.
 *
 * There is deliberately no "set this player's cash to $X" control. Every dollar in the
 * game has a named counterparty and one conserved quantity holds across the whole log;
 * a raw field edit would break it silently and permanently. Every real correction is
 * either "act on their behalf" or "undo", and both are here.
 */
export function AdminShell({ token }: { token: string }): ReactNode {
  const game = useGame(token)
  const [actAs, setActAs] = useState<PlayerId>('P1')
  const [deckSizes, setDeckSizes] = useState<Record<Era, number>>({ 1: 0, 2: 0, 3: 0, 4: 0 })
  const [auditRolls, setAuditRolls] = useState<Record<string, [number, number]>>({})

  useEffect(() => {
    let cancelled = false
    void fetchStatic().then((reference) => {
      if (cancelled) return
      const sizes: Record<Era, number> = { 1: 0, 2: 0, 3: 0, 4: 0 }
      for (const card of reference.cards) sizes[card.era as Era] += 1
      setDeckSizes(sizes)
    })
    return () => { cancelled = true }
  }, [])

  if (game.error !== null) return <Fatal message={game.error} />
  if (game.sync === null) return <Loading />
  const sync = game.sync

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16 pt-4">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-3 border-b-2 border-[#1b5e43] pb-2">
        <div>
          <h1 className="text-[1.5rem] leading-none tracking-tight">
            {sync.label} <span className="legend ml-2">facilitator</span>
          </h1>
          <p className="legend mt-1">
            round {sync.state.round} of 24 · era {sync.state.era} · {sync.state.phase} ·
            {' '}treasury <Money value={sync.state.treasury} /> · {sync.length} events
          </p>
        </div>
        <Connection live={game.live} />
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <Clock game={game} sync={sync} deckSizes={deckSizes} auditRolls={auditRolls} />
          <Audits sync={sync} rolls={auditRolls} onChange={setAuditRolls} />
          <Dice game={game} sync={sync} />
          <Liquidation game={game} sync={sync} />
          <Reorder game={game} sync={sync} />
          <Standings sync={sync} />
          <History game={game} sync={sync} />
        </div>

        <div className="space-y-4">
          <Panel
            title="Act on a player's behalf"
            aside={
              <select
                className="field w-auto"
                value={actAs}
                aria-label="acting player"
                onChange={(e) => { setActAs(e.target.value as PlayerId) }}
              >
                {PLAYER_IDS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            }
          >
            <p className="mb-2 text-[0.75rem] leading-snug text-[#8b8570]">
              For anyone confused or away from their phone. They can still act in their
              own view at the same time.
            </p>
          </Panel>
          <DraftPanel
            sync={sync}
            me={actAs}
            disabled={game.pending}
            onSubmit={(command) => { void game.send(command) }}
          />
          {sync.assist[actAs] !== undefined && <Warnings assist={sync.assist[actAs]} />}
          <ActionPanel
            sync={sync}
            me={actAs}
            disabled={game.pending}
            onSubmit={(command) => { void game.send(command) }}
          />
        </div>
      </div>

      <RejectionToast rejection={game.rejection} onDismiss={game.dismiss} />
    </div>
  )
}

function Clock(
  { game, sync, deckSizes, auditRolls }: {
    game: Game; sync: Sync
    deckSizes: Record<Era, number>
    auditRolls: Record<string, [number, number]>
  },
): ReactNode {
  const send = (command: WireCommand): void => { void game.send(command) }
  const decks = ([1, 2, 3, 4] as const).filter((era) => sync.state.decks[era].order.length === 0)

  return (
    <Panel title="Round clock" tone="structural">
      <div className="flex flex-wrap gap-2">
        <button
          type="button" className="btn" disabled={game.pending}
          onClick={() => { send({ type: 'advance-phase' }) }}
        >
          Advance phase
        </button>
        <button
          type="button" className="btn" disabled={game.pending || sync.state.phase !== 'settlement'}
          onClick={() => { send({ type: 'settle', auditDice: auditDiceFor(auditRolls) }) }}
        >
          Run Settlement
        </button>
        <button
          type="button" className="btn" disabled={game.pending || sync.state.phase !== 'draft'}
          onClick={() => { send({ type: 'resolve-draft-round' }) }}
        >
          Resolve draft round
        </button>
        <button
          type="button" className="btn btn-risk" disabled={game.pending || sync.length <= 1}
          onClick={() => { void game.rewind() }}
        >
          Undo last command
        </button>
      </div>

      {decks.length > 0 && (
        <div className="mt-3 border-t border-[#ddd6c3] pt-2">
          <p className="legend mb-1">Unshuffled decks</p>
          <div className="flex flex-wrap gap-2">
            {decks.map((era) => (
              <button
                key={era} type="button" className="btn" disabled={game.pending}
                onClick={() => {
                  send({ type: 'ShuffleDeck', era, order: shuffleOrder(deckSizes[era]) })
                }}
              >
                Shuffle era {era}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[0.72rem] leading-snug text-[#8b8570]">
            The permutation is generated here in the browser and sent as event payload, so
            the server stays deterministic and the shuffle replays exactly.
          </p>
        </div>
      )}
    </Panel>
  )
}

/**
 * The shuffle is generated HERE, in the browser, and sent as the `order` payload of
 * `ShuffleDeck`. That keeps the server deterministic — it never produces a random value,
 * it only records one — so the log replays exactly and undo stays free. Deck sizes come
 * from the server's static reference rather than a constant of our own.
 */
function shuffleOrder(size: number): number[] {
  const order = Array.from({ length: size }, (_, i) => i)
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = order[i] as number
    order[i] = order[j] as number
    order[j] = a
  }
  return order
}

/**
 * The default Settlement roll. A 2d6 total AT OR BELOW a player's Heat is an audit, so
 * 12 can never audit: it is the safe default the facilitator overrides by typing the
 * real physical roll for whoever is actually carrying Heat.
 */
function auditDiceFor(overrides: Record<string, [number, number]>): Record<PlayerId, [number, number]> {
  return Object.fromEntries(
    PLAYER_IDS.map((p) => [p, overrides[p] ?? [6, 6]]),
  ) as Record<PlayerId, [number, number]>
}

/**
 * Audit rolls are physical 2d6, entered here before Settlement runs. Only players
 * carrying Heat are ever rolled for, and only from round 13 — the panel says so rather
 * than silently doing nothing, because a Settlement missing a required roll rejects.
 */
function Audits(
  { sync, rolls, onChange }: {
    sync: Sync
    rolls: Record<string, [number, number]>
    onChange: (next: Record<string, [number, number]>) => void
  },
): ReactNode {
  const heated = PLAYER_IDS.filter((p) => sync.state.players[p].heat >= 2)
  if (sync.state.round < 13 || heated.length === 0) return null
  return (
    <Panel title="Audit rolls" tone="risk">
      <p className="mb-2 text-[0.75rem] leading-snug text-[#8b8570]">
        Roll 2d6 for each of these players before running Settlement. A total at or below
        their Heat is an audit.
      </p>
      {heated.map((player) => {
        const pair = rolls[player] ?? [6, 6]
        return (
          <div key={player} className="flex items-center gap-2 py-1">
            <span className="w-8 text-[0.85rem]">{player}</span>
            <span className="legend w-20">heat {sync.state.players[player].heat}</span>
            <input
              className="field w-14" inputMode="numeric" aria-label={`${player} audit die 1`}
              value={String(pair[0])}
              onChange={(e) => {
                onChange({ ...rolls, [player]: [Math.trunc(Number(e.target.value)), pair[1]] })
              }}
            />
            <input
              className="field w-14" inputMode="numeric" aria-label={`${player} audit die 2`}
              value={String(pair[1])}
              onChange={(e) => {
                onChange({ ...rolls, [player]: [pair[0], Math.trunc(Number(e.target.value))] })
              }}
            />
          </div>
        )
      })}
    </Panel>
  )
}

function Dice({ game, sync }: { game: Game; sync: Sync }): ReactNode {
  const [rolls, setRolls] = useState<Record<string, [string, string]>>({})
  const movement = sync.state.phase === 'movement'

  return (
    <Panel title="Dice and cards" tone={movement ? 'structural' : 'plain'}>
      {!movement && (
        <p className="mb-2 text-[0.78rem] text-[#8b8570]">
          Dice are entered during the Movement phase.
        </p>
      )}
      {PLAYER_IDS.map((player) => {
        const pair = rolls[player] ?? ['', '']
        const square = sync.state.players[player].position
        return (
          <div key={player} className="flex items-center gap-2 border-b border-dotted border-[#ddd6c3] py-1.5 last:border-b-0">
            <span className="w-8 text-[0.85rem]">{player}</span>
            <span className="legend w-24">square {square}</span>
            <input
              className="field w-14" aria-label={`${player} die 1`} inputMode="numeric"
              value={pair[0]}
              onChange={(e) => { setRolls((r) => ({ ...r, [player]: [e.target.value, pair[1]] })) }}
            />
            <input
              className="field w-14" aria-label={`${player} die 2`} inputMode="numeric"
              value={pair[1]}
              onChange={(e) => { setRolls((r) => ({ ...r, [player]: [pair[0], e.target.value] })) }}
            />
            <button
              type="button" className="btn" data-roll={player}
              disabled={game.pending || !movement}
              onClick={() => {
                void game.send({
                  type: 'roll-dice', player,
                  dice: [Math.trunc(Number(pair[0])), Math.trunc(Number(pair[1]))],
                })
              }}
            >
              Roll
            </button>
            <button
              type="button" className="btn" data-draw={player}
              disabled={game.pending || !movement}
              onClick={() => {
                void game.send({ type: 'DrawCard', era: sync.state.era, player })
              }}
            >
              Card
            </button>
          </div>
        )
      })}
    </Panel>
  )
}

function Liquidation({ game, sync }: { game: Game; sync: Sync }): ReactNode {
  const awaiting = sync.derived.awaitingLiquidation
  if (awaiting.length === 0) return null
  return (
    <Panel title="Forced liquidation" tone="risk">
      {awaiting.map((player) => {
        const queue = sync.assist[player]?.credit.liquidationQueue ?? []
        const next = queue[0]
        return (
          <div key={player} className="border-b border-dotted border-[#ddd6c3] py-1.5 last:border-b-0">
            <Row label={`${player} shortfall`} tone="risk">
              <Money value={sync.assist[player]?.credit.marginShortfall ?? 0} />
            </Row>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="text-[0.8rem]">
                {next === undefined ? 'nothing left to auction' : `next lot: ${next}`}
              </span>
              <button
                type="button" className="btn btn-risk" data-liquidate={player}
                disabled={game.pending || next === undefined}
                onClick={() => {
                  if (next === undefined) return
                  void game.send({
                    type: 'SettleLiquidationLot', player, deed: next, bids: [],
                  })
                }}
              >
                Sell to the bank at the floor
              </button>
            </div>
          </div>
        )
      })}
    </Panel>
  )
}

/**
 * E3-05, Material Non-Public Information: a player is shown the next three cards and may
 * put them back in any order. The reveal is private and happens at the table; the ENGINE
 * only records the chosen permutation, which is what keeps replay exact.
 *
 * It lives on the facilitator's console rather than in a player view because the card is
 * adjudicated face-to-face — and because `ReorderDeck` was otherwise the one command in
 * the game with no control anywhere, which is how a mechanic quietly stops existing.
 */
function Reorder({ game, sync }: { game: Game; sync: Sync }): ReactNode {
  const deck = sync.state.decks[sync.state.era]
  const head = deck.order.slice(deck.drawn, deck.drawn + 3)
  const [player, setPlayer] = useState<PlayerId>('P1')
  const [order, setOrder] = useState<number[]>([])
  if (head.length < 3) return null

  const chosen = order.length === 3 ? order : head
  const rotate = (): void => { setOrder([chosen[2] as number, chosen[0] as number, chosen[1] as number]) }

  return (
    <Panel title="Reveal and reorder (E3-05)" aside={<span className="legend">era {sync.state.era}</span>}>
      <p className="mb-2 text-[0.75rem] leading-snug text-[#8b8570]">
        Show these three to the holder privately, then submit the order they choose.
      </p>
      <div className="mb-2 flex items-center gap-2">
        <select
          className="field w-auto" aria-label="reorder holder" value={player}
          onChange={(e) => { setPlayer(e.target.value as PlayerId) }}
        >
          {PLAYER_IDS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <span className="num text-[0.85rem]">{chosen.join(' · ')}</span>
        <button type="button" className="btn" onClick={rotate}>Rotate</button>
        <button
          type="button" className="btn" data-reorder
          disabled={game.pending}
          onClick={() => {
            void game.send({ type: 'ReorderDeck', era: sync.state.era, player, order: chosen })
          }}
        >
          Apply
        </button>
      </div>
    </Panel>
  )
}

function Standings({ sync }: { sync: Sync }): ReactNode {
  return (
    <Panel title="Standings">
      {sync.derived.standings.map((standing) => {
        const player = sync.state.players[standing.player]
        return (
          <Row
            key={standing.player}
            label={`${standing.rank}. ${standing.player} · cash $${player.cleanCash} · heat ${player.heat}`}
          >
            <Money value={standing.netWorth} />
          </Row>
        )
      })}
    </Panel>
  )
}

interface CommandRecordView { seq: number; type: string; actor: string }

function History({ game, sync }: { game: Game; sync: Sync }): ReactNode {
  const [commands, setCommands] = useState<CommandRecordView[]>([])

  useEffect(() => {
    let cancelled = false
    fetch(`/api/game/${sync.gameId}/history`, {
      headers: { authorization: `Bearer ${tokenFromLocation()}` },
    })
      .then((r) => r.json() as Promise<{ commands: CommandRecordView[] }>)
      .then((body) => { if (!cancelled) setCommands(body.commands.slice(-14).reverse()) })
      .catch(() => { /* the strip is a convenience; the game does not depend on it */ })
    return () => { cancelled = true }
  }, [sync.gameId, sync.length])

  return (
    <Panel title="What just happened" aside={<span className="legend">newest first</span>}>
      {commands.length === 0 ? <Empty>Nothing yet.</Empty> : null}
      {commands.map((command) => (
        <div key={command.seq} className="flex items-center justify-between gap-3 border-b border-dotted border-[#ddd6c3] py-1 last:border-b-0">
          <span className="text-[0.8rem]">
            <span className="legend mr-2">{command.actor}</span>{command.type}
          </span>
          <button
            type="button" className="btn btn-risk"
            disabled={game.pending}
            onClick={() => { void game.rewind(command.seq) }}
          >
            Undo to here
          </button>
        </div>
      ))}
    </Panel>
  )
}

function tokenFromLocation(): string {
  return new URLSearchParams(window.location.search).get('token') ?? ''
}
