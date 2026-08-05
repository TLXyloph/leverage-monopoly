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
  const sawSocket = useRef(false)

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
      .then((first) => { if (!cancelled) applyInitialFetch(first) })
      .catch((cause: unknown) => { if (!cancelled) setError(String((cause as Error).message)) })

    const connection = connect(parsed.gameId, token, applyFromSocket, setLive, (reason) => {
      if (!cancelled) setError(reason)
    })
    return () => {
      cancelled = true
      connection.close()
    }

    /**
     * The socket is authoritative and its messages are ordered by the protocol, so every
     * one is applied — INCLUDING one that shortens the log.
     *
     * A guard here that dropped any sync shorter than the last seen looked like
     * protection against out-of-order delivery and was in fact a bug: undo truncates the
     * log, so every client silently ignored the one broadcast that mattered most and
     * froze on the pre-undo state until some later command pushed the length back past
     * the old high-water mark. Undo is the facilitator's most-used control.
     */
    function applyFromSocket(next: Sync): void {
      sawSocket.current = true
      setSync(next)
      setError(null)
    }

    /**
     * The genuine race is the opening HTTP fetch landing AFTER the socket's first push.
     * That one is worth guarding, and it is the only one — hence a flag rather than a
     * comparison on log length.
     */
    function applyInitialFetch(next: Sync): void {
      if (sawSocket.current) return
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
