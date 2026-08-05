import type { FastifyInstance } from 'fastify'
import { PLAYER_IDS, type GameConfig } from '@leverage/engine'
import { actorFor, claimsFor, type Context } from '../app.js'
import { generateGameId, generateRoomCode, isAdmin, mintGameTokens } from '../auth.js'
import { createGameSchema, undoSchema, wireCommandSchema } from '../commands/schema.js'
import { ConcurrentWriteError } from '../db.js'
import { syncFor } from '../views.js'

/**
 * The write surface. Everything here funnels into `GameRoom.submit`, which is the only
 * code in the process allowed to append to the log.
 *
 * Game creation is deliberately unauthenticated: the server binds to localhost (or an
 * ngrok tunnel the operator opened), and whoever can reach it is the person running the
 * game night. There are no accounts to protect.
 */
export function registerGameRoutes(app: FastifyInstance, context: Context): void {
  app.post('/api/games', (request, reply) => {
    const parsed = createGameSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues })
      return
    }
    const id = generateGameId()
    const roomCode = generateRoomCode()
    const config: GameConfig = {
      turnOrder: PLAYER_IDS,
      unlockMode: parsed.data.unlockMode,
      winCondition: parsed.data.winCondition,
    }
    context.games.create(
      { id, roomCode, createdAt: new Date().toISOString(), label: parsed.data.label },
      config,
    )
    const tokens = mintGameTokens(context.secret, id)
    reply.code(201).send({
      gameId: id,
      roomCode,
      label: parsed.data.label,
      tokens,
      urls: {
        admin: `/admin?token=${tokens.admin}`,
        table: `/table?token=${tokens.table}`,
        players: Object.fromEntries(
          PLAYER_IDS.map((p) => [p, `/p/${tokens.players[p]}`]),
        ),
      },
    })
  })

  app.get('/api/games', (_request, reply) => {
    reply.send({ games: context.store.listGames() })
  })

  /** Resolve a room code read aloud at the table to the game it names. */
  app.get<{ Params: { code: string } }>('/api/join/:code', (request, reply) => {
    const room = context.games.byRoomCode(request.params.code)
    if (room === null) {
      reply.code(404).send({ error: 'no game with that room code' })
      return
    }
    reply.send({ gameId: room.id, label: room.row.label })
  })

  app.post<{ Params: { id: string } }>('/api/game/:id/command', (request, reply) => {
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
    const parsed = wireCommandSchema.safeParse(request.body)
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid command', issues: parsed.error.issues })
      return
    }
    try {
      const result = room.submit(parsed.data, actorFor(claims.role))
      if (!result.ok) {
        /**
         * 409, not 400: the command was well-formed and the engine declined it under
         * the current state. The player-facing `message` is written for the table, so
         * it goes straight into the UI.
         */
        reply.code(409).send(result.rejection)
        return
      }
      reply.send({ ok: true, length: result.length, events: result.events })
    } catch (error) {
      if (error instanceof ConcurrentWriteError) {
        reply.code(409).send({
          rejected: true, code: 'WRONG_PHASE',
          message: 'Someone else acted first. Your view has refreshed — try again.',
        })
        return
      }
      throw error
    }
  })

  /**
   * Undo, exposed as a first-class endpoint rather than an emergency tool: the
   * facilitator WILL mistype a die roll, and this is the most-used admin control.
   * With no body it rewinds the last whole command.
   */
  app.post<{ Params: { id: string } }>('/api/game/:id/undo', (request, reply) => {
    const claims = claimsFor(context, request)
    if (claims === null || claims.gameId !== request.params.id || !isAdmin(claims.role)) {
      reply.code(401).send({ error: 'the facilitator token is required to undo' })
      return
    }
    const room = context.games.get(claims.gameId)
    if (room === null) {
      reply.code(404).send({ error: 'no such game' })
      return
    }
    const parsed = undoSchema.safeParse(request.body ?? {})
    if (!parsed.success) {
      reply.code(400).send({ error: 'invalid body', issues: parsed.error.issues })
      return
    }
    const target = parsed.data.toLength
    const length = target === undefined ? room.undoLastCommand() : room.undo(target)
    reply.send({ ok: true, length })
  })

  /** The same payload the WebSocket pushes. A reload rebuilds exact state from here. */
  app.get<{ Params: { id: string } }>('/api/game/:id/state', (request, reply) => {
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
    reply.send(syncFor(room.id, room.row.label, claims.role, room.length, room.state))
  })
}
