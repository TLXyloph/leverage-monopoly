import { describe, it, expect } from 'vitest'
import { resolveTarget, testWorld } from './select.js'
import type { Target } from './effects.js'
import { fixtureTied } from './decks.fixture.js'

const MOST_DRAWN: Target = {
  kind: 'extremum',
  by: { metric: 'drawn-credit', direction: 'max' },
  tieBreak: [{ metric: 'drawn-to-base-ratio', direction: 'max' }],
  among: { kind: 'metric-above', metric: 'drawn-credit', value: 0 },
}

describe('resolveTarget', () => {
  it('resolves the drawer to exactly the drawer', () => {
    const s = fixtureTied()
    expect(resolveTarget(s, { kind: 'drawer' }, 'P3')).toEqual(['P3'])
  })

  it('filters `all` by its predicate', () => {
    const s = fixtureTied() // P1 heat 5, P2 heat 5, P3 heat 1, P4 heat 0
    const t: Target = { kind: 'all', where: { kind: 'metric-at-least', metric: 'heat', value: 5 } }
    expect(resolveTarget(s, t, 'P1')).toEqual(['P1', 'P2'])
  })

  it('breaks a tie on the first tie-break metric', () => {
    // P1 and P2 both drawn 600; P2 has the higher drawn-to-base ratio (one railroad vs two).
    const s = fixtureTied()
    expect(resolveTarget(s, MOST_DRAWN, 'P4')).toEqual(['P2'])
  })

  it('falls through to turn order when every tie-break also ties', () => {
    // P1 and P2 identical on drawn AND ratio (both hold two railroads); turn order P1 first.
    const s = fixtureTied({ identicalRatios: true })
    expect(resolveTarget(s, MOST_DRAWN, 'P4')).toEqual(['P1'])
  })

  it('returns an empty list when the `among` filter excludes everyone', () => {
    const s = fixtureTied({ noDebt: true })
    expect(resolveTarget(s, MOST_DRAWN, 'P4')).toEqual([])
  })

  it('takes N players in ranked order for E4-16', () => {
    const s = fixtureTied()
    expect(resolveTarget(s, { ...MOST_DRAWN, take: 2 }, 'P4')).toEqual(['P2', 'P1'])
  })

  it('reports whether a target matched anybody', () => {
    const s = fixtureTied({ noDebt: true })
    expect(testWorld(s, { kind: 'any-target', of: MOST_DRAWN }, 'P4')).toBe(false)
    expect(testWorld(s, { kind: 'any-entity', of: 'pool' }, 'P4')).toBe(false)
  })

  it('detects when two targets resolve to the same player', () => {
    const s = fixtureTied()
    const same = { kind: 'same-target', a: MOST_DRAWN, b: MOST_DRAWN } as const
    expect(testWorld(s, same, 'P4')).toBe(true)
  })

  it('reports no match when either side of same-target resolves to more than one player', () => {
    const s = fixtureTied({ identicalRatios: true })
    const allHigh: Target = { kind: 'all', where: { kind: 'metric-at-least', metric: 'heat', value: 5 } }
    const same = { kind: 'same-target', a: allHigh, b: MOST_DRAWN } as const
    // allHigh resolves to two players (P1, P2), so `same-target` cannot be true.
    expect(testWorld(s, same, 'P4')).toBe(false)
  })
})
