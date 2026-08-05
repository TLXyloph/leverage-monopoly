import { useMemo, useState, type ReactNode } from 'react'
import type { Sync, WireCommand } from '@leverage/server'
import type { PlayerId } from '@leverage/engine'
import { Empty, Money, Panel, Row } from './primitives.tsx'

/**
 * The seven-round draft, spec section 3.
 *
 * All four players submit SIMULTANEOUSLY — a ranked triple plus a maximum bid — and the
 * round resolves in one pass. That is the whole reason the draft is a ranked triple
 * rather than a live auction: one submission, instant resolution, no cascading
 * negotiation rounds, and 28 deeds allocated in the time a single Monopoly auction takes.
 *
 * This panel exists because the command did not otherwise have one. Every other command
 * in the game was reachable from a control; `submit-draft` was not, which made the game
 * unstartable from a browser — the UI form of the defect that escaped the engine's
 * reviews six times: correct code, passing tests, nothing calling it.
 */

export function DraftPanel(
  { sync, me, onSubmit, disabled }: {
    sync: Sync
    me: PlayerId
    onSubmit: (command: WireCommand) => void
    disabled: boolean
  },
): ReactNode {
  const draft = sync.state.draft
  const available = useMemo(
    () => Object.values(sync.state.deeds)
      .filter((deed) => deed.owner === null)
      .sort((a, b) => a.faceValue - b.faceValue || a.square - b.square),
    [sync.state.deeds],
  )

  const [ranked, setRanked] = useState<[string, string, string]>(['', '', ''])
  const [maxBid, setMaxBid] = useState('')

  if (draft === null || sync.state.phase !== 'draft') return null

  const submitted = draft.submissions.some((s) => s.player === me)
  const picks: [string, string, string] = [
    ranked[0] || (available[0]?.id ?? ''),
    ranked[1] || (available[1]?.id ?? ''),
    ranked[2] || (available[2]?.id ?? ''),
  ]
  const firstFace = sync.state.deeds[picks[0]]?.faceValue ?? 0
  const bid = maxBid === '' ? firstFace : Math.trunc(Number(maxBid))
  const distinct = new Set(picks).size === 3

  return (
    <Panel
      title={`Draft — round ${draft.round} of 7`}
      tone="structural"
      aside={<span className="legend">{draft.submissions.length} of 4 submitted</span>}
    >
      {submitted ? (
        <p className="border-l-2 border-[#1b5e43] bg-[#d7e5dd] py-1.5 pl-2 text-[0.85rem] text-[#1b5e43]">
          Submitted. Waiting for the rest of the table.
        </p>
      ) : (
        <form
          data-draft-form
          onSubmit={(event) => {
            event.preventDefault()
            if (!distinct) return
            onSubmit({ type: 'submit-draft', player: me, ranked: picks, maxBid: bid })
          }}
        >
          <p className="mb-2 text-[0.75rem] leading-snug text-[#8b8570]">
            Rank three different deeds. An uncontested first choice costs face value; a
            contested one goes to the highest bid, and losers cascade to their second
            choice, then their third.
          </p>

          {([0, 1, 2] as const).map((slot) => (
            <label key={slot} className="mb-1.5 block">
              <span className="legend">
                {slot === 0 ? 'First choice' : slot === 1 ? 'Second choice' : 'Third choice'}
              </span>
              <select
                className="field mt-0.5"
                data-rank={slot + 1}
                value={picks[slot]}
                onChange={(e) => {
                  const next: [string, string, string] = [...picks]
                  next[slot] = e.target.value
                  setRanked(next)
                }}
              >
                {available.map((deed) => (
                  <option key={deed.id} value={deed.id}>
                    {deed.id} — ${deed.faceValue}
                  </option>
                ))}
              </select>
            </label>
          ))}

          <label className="mb-2 block">
            <span className="legend">Maximum bid for your first choice</span>
            <input
              className="field mt-0.5"
              data-max-bid
              inputMode="numeric"
              placeholder={String(firstFace)}
              value={maxBid}
              onChange={(e) => { setMaxBid(e.target.value) }}
            />
          </label>

          <Row label="Face value of your first choice"><Money value={firstFace} /></Row>
          <Row label="Your remaining budget">
            <Money value={sync.state.players[me]?.cleanCash ?? 0} />
          </Row>

          {!distinct && (
            <p className="mt-1.5 text-[0.78rem] text-[#7b1e1e]">
              Your three choices must be three different deeds.
            </p>
          )}

          <button
            type="submit"
            className="btn mt-2"
            data-submit-draft
            disabled={disabled || !distinct || available.length < 3}
          >
            Submit
          </button>
        </form>
      )}

      <div className="mt-3 border-t border-[#ddd6c3] pt-2">
        <p className="legend mb-1">Deeds held</p>
        {sync.state.config.turnOrder.map((player) => {
          const held = Object.values(sync.state.deeds).filter((d) => d.owner === player)
          return (
            <Row key={player} label={`${player} · ${held.length} of 7`}>
              <Money value={sync.state.players[player]?.cleanCash ?? 0} />
            </Row>
          )
        })}
        {available.length === 0 ? <Empty>Every deed is allocated.</Empty> : null}
      </div>
    </Panel>
  )
}
