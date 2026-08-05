import type { ReactNode } from 'react'
import type { PlayerAssist } from '@leverage/server'
import { Empty, Money, Panel, Pct, Row } from './primitives.tsx'

/**
 * The assist panel: **the math, never the move.**
 *
 * Nothing here ranks an option, scores a decision or suggests an action. It closes the
 * information gap between a player who knows heavy economic games and one who knows
 * Monopoly, without closing the skill gap between them — which is a spec rule, not a
 * preference.
 *
 * Every number arrives computed from the server. The client formats; it never derives.
 */

const SEVERITY: Record<string, { border: string; bg: string; text: string }> = {
  risk: { border: '#7b1e1e', bg: '#f0dcdc', text: '#7b1e1e' },
  caution: { border: '#9a7b28', bg: '#f5eeda', text: '#6b5518' },
  info: { border: '#ddd6c3', bg: '#fbfaf5', text: '#55503f' },
}

export function Warnings({ assist }: { assist: PlayerAssist }): ReactNode {
  if (assist.warnings.length === 0) {
    return (
      <Panel title="Warnings">
        <Empty>Nothing is about to go wrong.</Empty>
      </Panel>
    )
  }
  return (
    <Panel
      title="Warnings"
      tone={assist.warnings.some((w) => w.severity === 'risk') ? 'risk' : 'plain'}
    >
      <ul className="space-y-1.5">
        {assist.warnings.map((warning) => {
          const tone = SEVERITY[warning.severity] ?? SEVERITY['info']
          return (
            <li
              key={warning.id}
              data-warning={warning.id}
              className="border-l-2 py-1 pl-2 text-[0.82rem] leading-snug"
              style={{ borderColor: tone?.border, background: tone?.bg, color: tone?.text }}
            >
              {warning.message}
            </li>
          )
        })}
      </ul>
    </Panel>
  )
}

export function CreditGauge({ assist }: { assist: PlayerAssist }): ReactNode {
  const { credit } = assist
  const used = credit.borrowingBase === 0
    ? 0
    : Math.min(1.2, credit.drawn / credit.borrowingBase)
  const breached = credit.underMarginCall
  return (
    <Panel title="Credit" tone={breached ? 'risk' : 'structural'}>
      <div
        className="relative mb-2 h-3 border border-[#ddd6c3] bg-[#eae5d6]"
        role="meter"
        aria-valuenow={Math.round(used * 100)}
        aria-label="drawn against borrowing base"
      >
        <div
          className="absolute inset-y-0 left-0"
          style={{
            width: `${Math.min(100, used * 100)}%`,
            background: breached ? '#7b1e1e' : '#1b5e43',
          }}
        />
      </div>
      <Row label="Borrowing base"><Money value={credit.borrowingBase} /></Row>
      <Row label="Drawn"><Money value={credit.drawn} /></Row>
      <Row label="Headroom"><Money value={credit.headroom} /></Row>
      <Row label="Rate this round"><Pct value={credit.interestRate} places={1} /></Row>
      <Row label="Interest next Settlement">
        <Money value={credit.interestDueNextSettlement} />
      </Row>
      <Row label="Carrying cost next Settlement">
        <Money value={credit.carryingCostNextSettlement} />
      </Row>
      {credit.underMarginCall && (
        <Row label="Margin shortfall" tone="risk"><Money value={credit.marginShortfall} /></Row>
      )}
      {credit.liquidationRound !== null && (
        <Row label="Forced liquidation from round" tone="risk">
          <span className="num">{credit.liquidationRound}</span>
        </Row>
      )}
    </Panel>
  )
}

/**
 * The single highest-value thing on the screen.
 *
 * Ventures cost CLEAN cash and pay DIRTY cash, so a venture must return over 133% of its
 * cost merely to break even after the laundering haircut. Simulation put the gap between
 * correct and naive underworld play at roughly $1,290 — the largest skill cliff in the
 * economy — and it exists almost entirely because players read the dirty figure. So the
 * laundered number is the one set in the large type, and the dirty number is a footnote.
 */
export function Ventures({ assist }: { assist: PlayerAssist }): ReactNode {
  return (
    <Panel title="Ventures — valued after laundering">
      <table className="w-full text-[0.8rem]">
        <thead>
          <tr className="legend border-b border-[#ddd6c3] text-left">
            <th className="pb-1 font-normal">Venture</th>
            <th className="pb-1 text-right font-normal">Cost</th>
            <th className="pb-1 text-right font-normal">Worth laundered</th>
            <th className="pb-1 text-right font-normal">Net</th>
          </tr>
        </thead>
        <tbody>
          {assist.ventures.map((venture) => (
            <tr key={venture.kind} data-venture={venture.kind} className="border-b border-dotted border-[#ddd6c3] last:border-b-0">
              <td className="py-1.5">
                {venture.kind}
                {venture.active && <span className="legend ml-2 text-[#1b5e43]">running</span>}
                <div className="text-[0.7rem] text-[#8b8570]">
                  {venture.rounds} rounds · +{venture.heat} heat · pays{' '}
                  <span className="num">${venture.expectedDirty.toLocaleString('en-US')}</span> dirty
                </div>
              </td>
              <td className="py-1.5 text-right align-top"><Money value={venture.cost} /></td>
              <td className="py-1.5 text-right align-top text-[0.95rem]">
                <Money value={venture.launderedValue} />
              </td>
              <td
                className="py-1.5 text-right align-top"
                style={{ color: venture.netOfCost < 0 ? '#7b1e1e' : '#1b5e43' }}
              >
                <Money value={venture.netOfCost} sign />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-[0.72rem] leading-snug text-[#8b8570]">
        Ventures are paid for in clean cash and pay out in dirty cash. The laundered
        column is what the payout is actually worth to you at your Heat.
      </p>
    </Panel>
  )
}

export function Exposure({ assist }: { assist: PlayerAssist }): ReactNode {
  const { audit, launder } = assist
  return (
    <Panel title="Heat" tone={audit.probability >= 0.5 && audit.live ? 'risk' : 'plain'}>
      <Row label="Heat"><span className="num">{audit.heat}</span></Row>
      <Row label={audit.live ? 'Audit probability this round' : 'Audits begin round 13'}>
        {audit.live ? <Pct value={audit.probability} /> : <span className="num">—</span>}
      </Row>
      <Row label="Fine if audited"><Money value={audit.fineIfAudited} /></Row>
      <Row label="Dirty cash at risk"><Money value={audit.dirtyAtRisk} /></Row>
      <Row label="Laundering haircut"><Pct value={launder.haircutBps / 10_000} /></Row>
      <Row label="All dirty cash, laundered">
        <Money value={launder.proceedsIfLaunderedInFull} />
      </Row>
    </Panel>
  )
}

export function Portfolio({ assist }: { assist: PlayerAssist }): ReactNode {
  if (assist.deeds.length === 0) {
    return <Panel title="Deeds"><Empty>You hold no deeds.</Empty></Panel>
  }
  return (
    <Panel title="Deeds">
      <table className="w-full text-[0.8rem]">
        <thead>
          <tr className="legend border-b border-[#ddd6c3] text-left">
            <th className="pb-1 font-normal">Deed</th>
            <th className="pb-1 text-right font-normal">Rent</th>
            <th className="pb-1 text-right font-normal">Traffic</th>
            <th className="pb-1 text-right font-normal">Exp. rent / round</th>
          </tr>
        </thead>
        <tbody>
          {assist.deeds.map((deed) => (
            <tr key={deed.deed} className="border-b border-dotted border-[#ddd6c3] last:border-b-0">
              <td className="py-1">{deed.deed}</td>
              <td className="py-1 text-right"><Money value={deed.rentAtCurrentDevelopment} /></td>
              <td className="py-1 text-right">
                <span className="num">{deed.expectedHitsPerRound.toFixed(2)}</span>
              </td>
              <td className="py-1 text-right"><Money value={deed.expectedRentPerRound} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  )
}

export function NetWorth({ assist }: { assist: PlayerAssist }): ReactNode {
  const n = assist.netWorth
  return (
    <Panel title="Net worth" tone="structural">
      <Row label="Clean cash"><Money value={n.cleanCash} /></Row>
      <Row label="Deeds"><Money value={n.deedValue} /></Row>
      <Row label="Buildings"><Money value={n.buildingCost} /></Row>
      <Row label="Instruments"><Money value={n.instruments} /></Row>
      <Row label="Dirty cash (scores $0)"><Money value={n.dirtyCash} /></Row>
      <Row label="Drawn credit"><Money value={-n.drawnCredit} /></Row>
      <Row label="Peer loans owed"><Money value={-n.peerLoansOwed} /></Row>
      <Row label="Distressed debt"><Money value={-n.distressedDebt} /></Row>
      <div className="mt-1 flex items-baseline justify-between border-t-2 border-[#1b5e43] pt-1.5">
        <span className="legend">Total</span>
        <span className="text-[1.1rem]"><Money value={n.total} /></span>
      </div>
    </Panel>
  )
}
