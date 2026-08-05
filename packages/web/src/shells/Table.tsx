import type { ReactNode } from 'react'
import { useGame } from '../useGame.ts'
import { Money, Pct } from '../components/primitives.tsx'
import { Fatal, Loading } from './Player.tsx'

/**
 * `/table` — a television across the room. Large type, no interaction, nothing that
 * rewards standing close to it. The server refuses commands from this token outright, so
 * a curious player cannot drive the game from the TV.
 */
export function TableShell({ token }: { token: string }): ReactNode {
  const game = useGame(token)
  if (game.error !== null) return <Fatal message={game.error} />
  if (game.sync === null) return <Loading />

  const sync = game.sync
  const leader = sync.derived.standings[0]?.netWorth ?? 1
  const floor = Math.min(0, ...sync.derived.standings.map((s) => s.netWorth))
  const span = Math.max(1, leader - floor)

  return (
    <div className="mx-auto max-w-[1600px] px-10 py-8">
      <header className="mb-8 flex items-end justify-between border-b-4 border-[#1b5e43] pb-3">
        <h1 className="text-[3.5rem] leading-none tracking-tight">LEVERAGE</h1>
        <div className="flex gap-10 text-right">
          <Headline label="Round">{sync.state.round} / 24</Headline>
          <Headline label="Era">{sync.state.era}</Headline>
          <Headline label="Phase">{sync.state.phase}</Headline>
          <Headline label="Prevailing rate">
            <Pct value={sync.derived.prevailingRate} places={0} />
          </Headline>
          <Headline label="Treasury">
            <Money value={sync.state.treasury} />
          </Headline>
        </div>
      </header>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <section>
          <h2 className="legend mb-3 text-[0.9rem]">Standings</h2>
          {sync.derived.standings.map((standing) => {
            const player = sync.state.players[standing.player]
            const width = Math.max(2, ((standing.netWorth - floor) / span) * 100)
            const distressed = player.distressedDebt > 0 || player.marginCallFlaggedAt !== null
            return (
              <div key={standing.player} className="mb-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-[2rem] leading-none">
                    <span className="num mr-3 text-[#8b8570]">{standing.rank}</span>
                    {standing.player}
                  </span>
                  <span className="text-[2rem] leading-none">
                    <Money value={standing.netWorth} />
                  </span>
                </div>
                <div className="mt-1.5 h-3 bg-[#eae5d6]">
                  <div
                    className="h-full"
                    style={{ width: `${width}%`, background: distressed ? '#7b1e1e' : '#1b5e43' }}
                  />
                </div>
                <p className="legend mt-1 text-[0.8rem]">
                  cash <Money value={player.cleanCash} /> · drawn{' '}
                  <Money value={player.drawnCredit} /> · heat {player.heat}
                  {player.distressedDebt > 0 && (
                    <span className="ml-2 text-[#7b1e1e]">
                      distressed <Money value={player.distressedDebt} />
                    </span>
                  )}
                </p>
              </div>
            )
          })}
        </section>

        <section>
          <h2 className="legend mb-3 text-[0.9rem]">Live contracts</h2>
          {sync.derived.contracts.length === 0 ? (
            <p className="text-[1.2rem] italic text-[#8b8570]">Nothing outstanding.</p>
          ) : (
            <ul className="space-y-2">
              {sync.derived.contracts.map((contract) => (
                <li
                  key={contract.id}
                  className="panel flex items-baseline justify-between gap-4 px-3 py-2"
                >
                  <span>
                    <span className="legend">{contract.kind}</span>
                    <span className="ml-2 text-[1.05rem]">{contract.summary}</span>
                    <span className="legend ml-2">{contract.counterparties.join(' · ')}</span>
                  </span>
                  <span className="text-[1.2rem]"><Money value={contract.mark} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Headline({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div>
      <p className="legend">{label}</p>
      <p className="num mt-1 text-[1.8rem] leading-none">{children}</p>
    </div>
  )
}
