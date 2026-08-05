import { existsSync } from 'node:fs'
import fastifyStatic from '@fastify/static'
import websocket from '@fastify/websocket'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import { Store } from './db.js'
import { GameRegistry, type Actor } from './game.js'
import { Hub } from './ws.js'
import { verifyToken, type Claims, type Role } from './auth.js'
import { registerGameRoutes } from './routes/game.js'
import { registerAgentRoutes } from './routes/agent.js'

export interface ServerOptions {
  /** SQLite file. `:memory:` in tests; a real path for a game night. */
  readonly databaseFile: string
  /** Directory of the built web bundle, served at the root when it exists. */
  readonly webRoot?: string
  readonly logger?: boolean
}

export interface Context {
  readonly store: Store
  readonly games: GameRegistry
  readonly hub: Hub
  readonly secret: string
}

/**
 * Tokens may arrive in an `Authorization: Bearer` header (the facilitator agent's curl),
 * or in `?token=` (a browser opening a QR-code URL, which cannot set headers).
 */
export function tokenFrom(request: FastifyRequest): string | null {
  const header = request.headers.authorization
  if (typeof header === 'string' && header.startsWith('Bearer ')) return header.slice(7)
  const query = request.query as { token?: unknown } | undefined
  if (typeof query?.token === 'string') return query.token
  return null
}

export function claimsFor(context: Context, request: FastifyRequest): Claims | null {
  const token = tokenFrom(request)
  return token === null ? null : verifyToken(context.secret, token)
}

export function actorFor(role: Role): Actor {
  return role.kind === 'player' ? { kind: 'player', player: role.player } : { kind: role.kind }
}

export function createApp(options: ServerOptions): FastifyInstance & { context: Context } {
  const store = new Store(options.databaseFile)
  const context: Context = {
    store,
    games: new GameRegistry(store),
    hub: new Hub(),
    secret: store.secret(),
  }

  const app = Fastify({ logger: options.logger ?? false })

  app.register(websocket)
  registerGameRoutes(app, context)
  registerAgentRoutes(app, context)

  /**
   * Push-only. A client that reconnects gets a full `Sync` immediately on open, which is
   * the whole reconnect story: no replay negotiation, no missed-message window.
   */
  app.register(async (scoped) => {
    scoped.get<{ Params: { id: string } }>('/ws/:id', { websocket: true }, (socket, request) => {
      const claims = claimsFor(context, request)
      if (claims === null || claims.gameId !== request.params.id) {
        socket.close(4401, 'unauthorized')
        return
      }
      const room = context.games.get(claims.gameId)
      if (room === null) {
        socket.close(4404, 'no such game')
        return
      }
      const leave = context.hub.join(room, socket, claims.role)
      socket.on('close', leave)
      socket.on('error', leave)
    })
  })

  const webRoot = options.webRoot
  if (webRoot !== undefined && existsSync(webRoot)) {
    app.register(fastifyStatic, { root: webRoot })
    /** The three shells are client-routed, so any unmatched GET falls back to the app. */
    app.setNotFoundHandler((request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api')) {
        reply.code(404).send({ error: 'not found' })
        return
      }
      reply.sendFile('index.html')
    })
  }

  app.addHook('onClose', async () => {
    context.hub.closeAll()
    store.close()
  })

  return Object.assign(app, { context })
}
