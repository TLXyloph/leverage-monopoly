import { useState, type ReactNode } from 'react'
import type { Sync, WireCommand } from '@leverage/server'
import type { PlayerId } from '@leverage/engine'
import { actionSpecs, type ActionSpec } from '../actionSpecs.ts'
import { Empty, Panel } from './primitives.tsx'

/**
 * The era-gated action panel.
 *
 * Gating reads `assist.unlocked`, which is the engine's own `unlockedInstruments` —
 * never a table of this component's own. Locked instruments are RENDERED, dimmed, with
 * the era they arrive in: a player needs to see what is coming to plan for it, and a
 * button that never renders at all is the same defect as a function nobody calls.
 */

function initialValues(spec: ActionSpec): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of spec.fields) {
    out[field.name] = field.kind === 'number'
      ? String(field.initial ?? field.min ?? 0)
      : field.options[0]?.value ?? ''
  }
  return out
}

function ActionCard(
  { spec, disabled, onSubmit }: {
    spec: ActionSpec
    disabled: boolean
    onSubmit: (command: WireCommand) => void
  },
): ReactNode {
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(spec))
  const unsatisfiable = spec.fields.some((f) => f.kind === 'select' && f.options.length === 0)

  return (
    <form
      data-action={spec.id}
      className="border-b border-dotted border-[#ddd6c3] py-2 last:border-b-0"
      onSubmit={(event) => {
        event.preventDefault()
        const command = spec.build(values)
        if (command !== null) onSubmit(command)
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-[0.9rem]">{spec.title}</h3>
        <button
          type="submit"
          className="btn shrink-0"
          disabled={disabled || unsatisfiable}
        >
          Do it
        </button>
      </div>
      {spec.hint !== undefined && (
        <p className="mt-0.5 text-[0.72rem] leading-snug text-[#8b8570]">{spec.hint}</p>
      )}
      {unsatisfiable ? (
        <p className="mt-1 text-[0.72rem] italic text-[#8b8570]">
          Nothing to do this with yet.
        </p>
      ) : (
        <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {spec.fields.map((field) => (
            <label key={field.name} className="block">
              <span className="legend block">{field.label}</span>
              {field.kind === 'number' ? (
                <input
                  className="field mt-0.5"
                  type="number"
                  inputMode="numeric"
                  name={field.name}
                  min={field.min}
                  value={values[field.name] ?? ''}
                  onChange={(e) => { setValues((v) => ({ ...v, [field.name]: e.target.value })) }}
                />
              ) : (
                <select
                  className="field mt-0.5"
                  name={field.name}
                  value={values[field.name] ?? ''}
                  onChange={(e) => { setValues((v) => ({ ...v, [field.name]: e.target.value })) }}
                >
                  {field.options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              )}
            </label>
          ))}
        </div>
      )}
    </form>
  )
}

export function ActionPanel(
  { sync, me, onSubmit, disabled }: {
    sync: Sync
    me: PlayerId
    onSubmit: (command: WireCommand) => void
    disabled: boolean
  },
): ReactNode {
  const unlocked = new Set<string>(sync.assist[me]?.unlocked ?? [])
  const specs = actionSpecs(sync, me)
  const available = specs.filter((s) => unlocked.has(s.instrument))
  const locked = specs.filter((s) => !unlocked.has(s.instrument))
  const openPhase = sync.state.phase === 'open'

  return (
    <Panel
      title="Actions"
      tone="structural"
      aside={<span className="legend">{openPhase ? 'open phase' : `${sync.state.phase} phase`}</span>}
    >
      {!openPhase && (
        <p className="mb-2 border-l-2 border-[#9a7b28] bg-[#f5eeda] py-1 pl-2 text-[0.78rem] text-[#6b5518]">
          Most actions are only available during the Open phase.
        </p>
      )}
      {available.length === 0 ? <Empty>Nothing is unlocked yet.</Empty> : null}
      {available.map((spec) => (
        <ActionCard key={spec.id} spec={spec} disabled={disabled} onSubmit={onSubmit} />
      ))}

      {locked.length > 0 && (
        <div className="mt-3 border-t border-[#ddd6c3] pt-2 opacity-55">
          <p className="legend mb-1">Locked</p>
          <ul className="grid grid-cols-2 gap-x-3 text-[0.75rem] text-[#55503f]">
            {locked.map((spec) => (
              <li key={spec.id} data-locked-action={spec.id}>
                {spec.title}
                <span className="legend ml-1">
                  era {sync.derived.unlockEra[spec.instrument]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}
