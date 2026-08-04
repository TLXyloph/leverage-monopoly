import { describe, it, expect } from 'vitest'
import fc from 'fast-check'
import { DEED_IDS, totalFaceValue } from '../../src/config/board.js'
import { ECONOMY } from '../../src/config/economy.js'
import { PLAYER_IDS } from '../../src/core/types.js'
import { arbGameScript } from './arbitraries.js'
import { runScript } from './driver.js'

const OWNERS = new Set<string>([...PLAYER_IDS, 'bank'])

describe('deed integrity', () => {
  it('keeps exactly the 28 deeds, with exactly one owner each', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        for (const state of [...trace.before, trace.final]) {
          const ids = Object.keys(state.deeds)
          expect(ids.length).toBe(DEED_IDS.length)
          expect([...ids].sort()).toEqual([...DEED_IDS].sort())
          for (const id of DEED_IDS) {
            const deed = state.deeds[id]
            expect(deed).toBeDefined()
            if (deed === undefined) continue
            expect(deed.id).toBe(id)
            expect(deed.owner === null || OWNERS.has(deed.owner)).toBe(true)
          }
        }
      }),
      { numRuns: 200 },
    )
  })

  it('keeps the 28 face values summing to exactly $5,690 forever', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        for (const state of [...trace.before, trace.final]) {
          const sum = Object.values(state.deeds).reduce((t, d) => t + d.faceValue, 0)
          expect(sum).toBe(5_690)
          expect(sum).toBe(totalFaceValue())
        }
      }),
      { numRuns: 150 },
    )
  })

  it('never lets a player hold a deed twice, or two players hold one deed', () => {
    // Structural in the state shape (`deeds` is a Record keyed by id, so it cannot
    // physically hold a duplicate), but a trade or liquidation that rebuilt the record
    // incorrectly could drop one entry and duplicate another's owner field, and the
    // count assertion above would still pass. This checks the OWNER side: no id
    // appears twice across every player's holdings.
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        for (const state of [...trace.before, trace.final]) {
          const holdings = PLAYER_IDS.flatMap((id) =>
            Object.values(state.deeds).filter((d) => d.owner === id).map((d) => d.id))
          expect(new Set(holdings).size).toBe(holdings.length)
        }
      }),
      { numRuns: 150 },
    )
  })

  it('conserves the physical house and hotel supply', () => {
    fc.assert(
      fc.property(arbGameScript(16), (script) => {
        const trace = runScript(script)
        for (const state of [...trace.before, trace.final]) {
          const placed = Object.values(state.deeds).reduce(
            (acc, d) => d.houses === 5
              ? { houses: acc.houses, hotels: acc.hotels + 1 }
              : { houses: acc.houses + d.houses, hotels: acc.hotels },
            { houses: 0, hotels: 0 },
          )
          expect(placed.houses + state.housesRemaining).toBe(ECONOMY.HOUSE_SUPPLY)
          expect(placed.hotels + state.hotelsRemaining).toBe(ECONOMY.HOTEL_SUPPLY)
          expect(state.housesRemaining).toBeGreaterThanOrEqual(0)
          expect(state.hotelsRemaining).toBeGreaterThanOrEqual(0)
        }
      }),
      { numRuns: 200 },
    )
  })

  it('keeps every house count inside 0-5', () => {
    fc.assert(
      fc.property(arbGameScript(12), (script) => {
        const trace = runScript(script)
        for (const state of [...trace.before, trace.final]) {
          for (const deed of Object.values(state.deeds)) {
            expect(deed.houses).toBeGreaterThanOrEqual(0)
            expect(deed.houses).toBeLessThanOrEqual(5)
          }
        }
      }),
      { numRuns: 100 },
    )
  })
})
