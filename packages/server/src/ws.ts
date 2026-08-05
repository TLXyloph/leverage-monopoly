import type { WebSocket } from 'ws'
import type { GameRoom } from './game.js'
import { syncFor } from './views.js'
import type { Role } from './auth.js'

/**
 * Broadcast of derived state to every connected client. Push-only: commands go over
 * HTTP, because a rejection needs to come back to exactly the client that caused it and
 * a request/response pair says that without inventing a correlation id.
 *
 * Every state change fans out the full `Sync`. At five clients and a few hundred
 * kilobytes that is comically cheap, and it removes an entire class of bug: there is no
 * patch stream that can drift from the server, so a client that reloads and a client
 * that never disconnected converge on the same bytes.
 */

interface Client {
  readonly socket: WebSocket
  readonly role: Role
}

export class Hub {
  private readonly clients = new Map<string, Set<Client>>()
  private readonly detach = new Map<string, () => void>()

  join(room: GameRoom, socket: WebSocket, role: Role): () => void {
    const client: Client = { socket, role }
    const set = this.clients.get(room.id) ?? new Set<Client>()
    set.add(client)
    this.clients.set(room.id, set)

    if (!this.detach.has(room.id)) {
      this.detach.set(room.id, room.onChange((changed) => { this.broadcast(changed) }))
    }

    this.send(room, client)
    return () => {
      set.delete(client)
      if (set.size > 0) return
      this.clients.delete(room.id)
      this.detach.get(room.id)?.()
      this.detach.delete(room.id)
    }
  }

  connectionCount(gameId: string): number {
    return this.clients.get(gameId)?.size ?? 0
  }

  broadcast(room: GameRoom): void {
    for (const client of this.clients.get(room.id) ?? []) this.send(room, client)
  }

  private send(room: GameRoom, client: Client): void {
    if (client.socket.readyState !== 1) return
    client.socket.send(JSON.stringify(
      syncFor(room.id, room.row.label, client.role, room.length, room.state),
    ))
  }

  closeAll(): void {
    for (const set of this.clients.values()) {
      for (const client of set) client.socket.close()
    }
    for (const stop of this.detach.values()) stop()
    this.clients.clear()
    this.detach.clear()
  }
}
