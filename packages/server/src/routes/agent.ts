import type { FastifyInstance } from 'fastify'
import {
  deedValue, expectedHitsPerRound, expectedPoolCashflow, insiderRevealedCard,
  landingProbabilityOfDeed, liquidationPrice, markDeedOption, markLoanNote, markRentFuture,
  markTranche, mortgageImpact, peerLoanInterestDue, ratePool, referenceFace, rentDue,
  requiredCollateral, valueRentFuture, type DiceRoll, type GameState,
} from '@leverage/engine'
import { claimsFor, type Context } from '../app.js'
import { RULE_TOPICS, ruleTopic, staticReference } from '../rules.js'
import { derive } from '../views.js'

/**
 * The read-only surface consumed by the facilitator agent (spec section 14). Claude Code
 * runs in the operator's terminal on their own subscription and curls localhost; it
 * answers rules questions, flags what needs doing this round, and PROPOSES admin
 * actions. It has no write authority over money — nothing here mutates, and the write
 * routes are in `routes/game.ts` behind the admin token.
 *
 * No API key, no LLM dependency: this is a plain deterministic service, and the agent is
 * simply another HTTP client.
 */

/** Any pair summing to 7. Non-utility rent is dice-independent. */
const MEAN_DICE: DiceRoll = [3, 4]

function valuationFor(state: GameState, ref: string): Record<string, unknown> | null {
  const future = state.futures.find((f) => f.id === ref)
  if (future !== undefined) {
    return {
      kind: 'rent-future', contract: future,
      mark: markRentFuture(state, ref), valuation: valueRentFuture(state, ref),
    }
  }
  const option = state.options.find((o) => o.id === ref)
  if (option !== undefined) {
    return { kind: 'deed-option', contract: option, mark: markDeedOption(state, ref) }
  }
  const loan = state.loans.find((l) => l.id === ref)
  if (loan !== undefined) {
    return {
      kind: 'peer-loan', contract: loan,
      mark: markLoanNote(state, loan), interestDue: peerLoanInterestDue(loan),
    }
  }
  const pool = state.pools.find((p) => p.id === ref)
  if (pool !== undefined) {
    return {
      kind: 'pool', contract: pool,
      expectedCashflow: expectedPoolCashflow(state, pool),
      ratings: ratePool(state, pool),
      marks: pool.tranches.map((t) => ({ tranche: t.kind, mark: markTranche(state, pool, t.kind) })),
    }
  }
  const swap = state.swaps.find((s) => s.id === ref)
  if (swap !== undefined) {
    return {
      kind: 'swap', contract: swap,
      referenceFace: referenceFace(state, swap.reference),
      collateralPosted: requiredCollateral(swap.notional),
    }
  }
  const deed = state.deeds[ref]
  if (deed !== undefined) {
    return {
      kind: 'deed', contract: deed,
      value: deedValue(deed),
      liquidationPrice: liquidationPrice(deed),
      landingProbability: landingProbabilityOfDeed(ref),
      expectedHitsPerRound: expectedHitsPerRound(ref),
      rentAtCurrentDevelopment: rentDue(state, ref, MEAN_DICE),
      mortgage: mortgageImpact(state, ref),
    }
  }
  return null
}

export function registerAgentRoutes(app: FastifyInstance, context: Context): void {
  app.get('/api/health', (_request, reply) => {
    reply.send({ ok: true, games: context.store.listGames().length })
  })

  app.get('/api/static', (_request, reply) => {
    reply.send(staticReference())
  })

  app.get('/api/rules', (_request, reply) => {
    reply.send({ topics: RULE_TOPICS })
  })

  app.get<{ Params: { topic: string } }>('/api/rules/:topic', (request, reply) => {
    const body = ruleTopic(request.params.topic)
    if (body === null) {
      reply.code(404).send({ error: 'unknown topic', topics: RULE_TOPICS })
      return
    }
    reply.type('text/markdown; charset=utf-8').send(body)
  })

  app.get<{ Params: { id: string } }>('/api/game/:id/log', (request, reply) => {
    const claims = claimsFor(context, request)
    if (claims === null || claims.gameId !== request.params.id) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    const room = context.games.get(claims.gameId)
    if (room === null) {
      reply.code(404).send({ error: 'no such game' })
      return
    }
    reply.send({ length: room.length, events: room.log })
  })

  /** What the table did, in commands rather than events. Drives the admin history strip. */
  app.get<{ Params: { id: string } }>('/api/game/:id/history', (request, reply) => {
    const claims = claimsFor(context, request)
    if (claims === null || claims.gameId !== request.params.id) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    const room = context.games.get(claims.gameId)
    if (room === null) {
      reply.code(404).send({ error: 'no such game' })
      return
    }
    reply.send({ commands: room.history() })
  })

  app.get<{ Params: { id: string; ref: string } }>(
    '/api/game/:id/valuation/:ref',
    (request, reply) => {
      const claims = claimsFor(context, request)
      if (claims === null || claims.gameId !== request.params.id) {
        reply.code(401).send({ error: 'unauthorized' })
        return
      }
      const room = context.games.get(claims.gameId)
      if (room === null) {
        reply.code(404).send({ error: 'no such game' })
        return
      }
      const valuation = valuationFor(room.state, decodeURIComponent(request.params.ref))
      if (valuation === null) {
        reply.code(404).send({ error: 'nothing in this game has that id' })
        return
      }
      reply.send(valuation)
    },
  )

  /**
   * The one genuinely private read in the game: the card an insider-trading buyer was
   * shown. Deliberately not in the broadcast — putting it there would hand every other
   * player the thing they just paid to withhold.
   */
  app.get<{ Params: { id: string } }>('/api/game/:id/insider', (request, reply) => {
    const claims = claimsFor(context, request)
    if (claims === null || claims.gameId !== request.params.id || claims.role.kind !== 'player') {
      reply.code(401).send({ error: 'a player token is required' })
      return
    }
    const room = context.games.get(claims.gameId)
    if (room === null) {
      reply.code(404).send({ error: 'no such game' })
      return
    }
    reply.send({ card: insiderRevealedCard(room.state, claims.role.player) })
  })

  /** Derived-only view, for an agent that wants the numbers without the whole state. */
  app.get<{ Params: { id: string } }>('/api/game/:id/derived', (request, reply) => {
    const claims = claimsFor(context, request)
    if (claims === null || claims.gameId !== request.params.id) {
      reply.code(401).send({ error: 'unauthorized' })
      return
    }
    const room = context.games.get(claims.gameId)
    if (room === null) {
      reply.code(404).send({ error: 'no such game' })
      return
    }
    reply.send({
      round: room.state.round, era: room.state.era, phase: room.state.phase,
      treasury: room.state.treasury, derived: derive(room.state),
    })
  })
}
