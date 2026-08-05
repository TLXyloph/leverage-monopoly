import { useCallback, useEffect, useRef, useState } from 'react'
import type { Sync, WireCommand } from '@leverage/server'
import type { Rejection } from '@leverage/engine'
import { connect, fetchSync, peekClaims, submitCommand, undo, type Claims } from './api.ts'

/**
 * The client's mirror of the server's state.
 *
 * `sync` is replaced wholesale on every push. There is no local reducer and no patch
 * stream, which is what makes "a player reloading their tab rebuilds exact current
 * state" (a spec hard constraint) true by construction rather than by care.
 */

export interface Game {
  readonly claims: Claims | null
  readonly sync: Sync | null
  readonly live: boolean
  readonly error: string | null
  /** The last engine rejection, for the toast. Cleared by `dismiss`. */
  readonly rejection: Rejection | null
  readonly pending: boolean
  send(command: WireCommand): Promise<boolean>
  rewind(toLength?: number): Promise<void>
  dismiss(): void
}

export function useGame(token: string | null): Game {
  const [claims, setClaims] = useState<Claims | null>(null)
  const [sync, setSync] = useState<Sync | null>(null)
  const [live, setLive] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [rejection, setRejection] = useState<Rejection | null>(null)
  const [pending, setPending] = useState(false)
  const latest = useRef(0)

  useEffect(() => {
    if (token === null) return undefined
    const parsed = peekClaims(token)
    setClaims(parsed)
    if (parsed === null) {
      setError('That link is malformed. Ask the facilitator for a fresh one.')
      return undefined
    }

    let cancelled = false
    /**
     * Fetched once before the socket opens, so a slow or blocked WebSocket still renders
     * a correct board rather than a spinner. The socket's first message supersedes it.
     */
    fetchSync(parsed.gameId, token)
      .then((first) => { if (!cancelled) apply(first) })
      .catch((cause: unknown) => { if (!cancelled) setError(String((cause as Error).message)) })

    const connection = connect(parsed.gameId, token, apply, setLive)
    return () => {
      cancelled = true
      connection.close()
    }

    function apply(next: Sync): void {
      // Out-of-order delivery would rewind the board under the table's feet.
      if (next.length < latest.current) return
      latest.current = next.length
      setSync(next)
      setError(null)
    }
  }, [token])

  const send = useCallback(async (command: WireCommand): Promise<boolean> => {
    if (claims === null || token === null) return false
    setPending(true)
    try {
      const outcome = await submitCommand(claims.gameId, token, command)
      setRejection(outcome.ok ? null : outcome.rejection)
      return outcome.ok
    } finally {
      setPending(false)
    }
  }, [claims, token])

  const rewind = useCallback(async (toLength?: number): Promise<void> => {
    if (claims === null || token === null) return
    setPending(true)
    try {
      const outcome = await undo(claims.gameId, token, toLength)
      setRejection(outcome.ok ? null : outcome.rejection)
    } finally {
      setPending(false)
    }
  }, [claims, token])

  return {
    claims, sync, live, error, rejection, pending, send, rewind,
    dismiss: () => { setRejection(null) },
  }
}
