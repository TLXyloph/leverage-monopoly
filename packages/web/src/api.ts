import type { WireCommand } from '@leverage/server'
import type { Sync } from '@leverage/server'
import type { Rejection } from '@leverage/engine'

/**
 * The client's whole conversation with the server. The server is authoritative: this
 * file sends commands and receives state, and computes nothing the engine could compute.
 *
 * Optimistic UI is deliberately absent for anything the engine owns. A form's own local
 * text is optimistic; a dollar never is.
 */

export interface Claims {
  readonly gameId: string
  readonly role:
    | { readonly kind: 'player'; readonly player: 'P1' | 'P2' | 'P3' | 'P4' }
    | { readonly kind: 'admin' }
    | { readonly kind: 'table' }
}

/**
 * Reads the unsigned half of the token so the client knows which game and role it is,
 * without a round trip. The SIGNATURE is what authorises, and only the server can check
 * it — nothing here is trusted, it just saves a request before the first render.
 */
export function peekClaims(token: string): Claims | null {
  const body = token.split('.')[0]
  if (body === undefined) return null
  try {
    return JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/'))) as Claims
  } catch {
    return null
  }
}

export type CommandOutcome =
  | { readonly ok: true; readonly length: number }
  | { readonly ok: false; readonly rejection: Rejection }

async function send(
  path: string, token: string, body: unknown,
): Promise<CommandOutcome> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const payload = (await response.json()) as Record<string, unknown>
  if (response.ok) return { ok: true, length: Number(payload['length'] ?? 0) }
  return {
    ok: false,
    rejection: {
      rejected: true,
      code: (payload['code'] as Rejection['code']) ?? 'WRONG_PHASE',
      message: String(payload['message'] ?? payload['error'] ?? 'The server refused that.'),
    },
  }
}

export function submitCommand(
  gameId: string, token: string, command: WireCommand,
): Promise<CommandOutcome> {
  return send(`/api/game/${gameId}/command`, token, command)
}

export function undo(
  gameId: string, token: string, toLength?: number,
): Promise<CommandOutcome> {
  return send(`/api/game/${gameId}/undo`, token, toLength === undefined ? {} : { toLength })
}

export async function fetchSync(gameId: string, token: string): Promise<Sync> {
  const response = await fetch(`/api/game/${gameId}/state`, {
    headers: { authorization: `Bearer ${token}` },
  })
  if (!response.ok) throw new Error('That link is not valid for this game.')
  return (await response.json()) as Sync
}

export interface StaticReference {
  readonly squares: { index: number; name: string; kind: string; deed: string | null }[]
  readonly deeds: { id: string; name: string; square: number; group: string; faceValue: number
                    houseCost: number; rentTable: number[] }[]
  readonly cards: { id: string; era: number; title: string; rules: string; targets: string }[]
  readonly topics: string[]
}

let staticCache: Promise<StaticReference> | null = null

/** Board and card reference. Fetched once per page load; none of it ever changes. */
export function fetchStatic(): Promise<StaticReference> {
  staticCache ??= fetch('/api/static').then((r) => r.json() as Promise<StaticReference>)
  return staticCache
}

export interface Connection {
  close(): void
}

/**
 * A WebSocket that reconnects on its own. The server sends a full `Sync` on open, so a
 * reconnect needs no replay negotiation and no missed-message window: whatever the
 * client's mirror was, the next message replaces it wholesale with the server's truth.
 */
/**
 * Close codes the server uses to refuse a socket outright. Retrying these is pointless
 * and rude: a bad or expired token reconnected every 1.2 seconds forever, hammering an
 * endpoint that will never accept it, with the client showing "reconnecting" instead of
 * the reason.
 */
const TERMINAL_CLOSE: Readonly<Record<number, string>> = {
  4401: 'That link is not valid for this game. Ask the facilitator for a fresh one.',
  4404: 'That game no longer exists on this server.',
}

export function connect(
  gameId: string, token: string,
  onSync: (sync: Sync) => void,
  onStatus: (live: boolean) => void,
  onFatal: (reason: string) => void,
): Connection {
  let socket: WebSocket | null = null
  let timer: number | undefined
  let closed = false

  const open = (): void => {
    if (closed) return
    const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws'
    socket = new WebSocket(
      `${scheme}://${window.location.host}/ws/${gameId}?token=${encodeURIComponent(token)}`,
    )
    socket.addEventListener('open', () => { onStatus(true) })
    socket.addEventListener('message', (event) => {
      onSync(JSON.parse(String(event.data)) as Sync)
    })
    socket.addEventListener('close', (event) => {
      onStatus(false)
      if (closed) return
      const terminal = TERMINAL_CLOSE[event.code]
      if (terminal !== undefined) {
        closed = true
        onFatal(terminal)
        return
      }
      timer = window.setTimeout(open, 1200)
    })
  }

  open()
  return {
    close: () => {
      closed = true
      window.clearTimeout(timer)
      socket?.close()
    },
  }
}
