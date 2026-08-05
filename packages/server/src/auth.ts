import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { PLAYER_IDS, type PlayerId } from '@leverage/engine'

/**
 * Room code plus a signed per-role token in the URL (spec section 14). No accounts, no
 * passwords, no API keys. The token goes in the path so a player can open their view by
 * scanning a QR code taped to the table, which is also why it must survive a server
 * restart — see `Store.secret()`.
 */

export type Role =
  | { readonly kind: 'player'; readonly player: PlayerId }
  | { readonly kind: 'admin' }
  | { readonly kind: 'table' }

export interface Claims {
  readonly gameId: string
  readonly role: Role
}

/** Unambiguous letters only: no I/O/0/1, because these get read aloud at a table. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateRoomCode(): string {
  return Array.from({ length: 4 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
}

export function generateGameId(): string {
  return Array.from({ length: 8 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)])
    .join('')
    .toLowerCase()
}

function b64url(input: string): string {
  return Buffer.from(input, 'utf8').toString('base64url')
}

function sign(secret: string, body: string): string {
  return createHmac('sha256', secret).update(body).digest('base64url')
}

export function mintToken(secret: string, claims: Claims): string {
  const body = b64url(JSON.stringify(claims))
  return `${body}.${sign(secret, body)}`
}

function claimsAreWellFormed(value: unknown): value is Claims {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { gameId?: unknown; role?: unknown }
  if (typeof candidate.gameId !== 'string') return false
  const role = candidate.role
  if (typeof role !== 'object' || role === null) return false
  const kind = (role as { kind?: unknown }).kind
  if (kind === 'admin' || kind === 'table') return true
  if (kind !== 'player') return false
  const player = (role as { player?: unknown }).player
  return typeof player === 'string' && (PLAYER_IDS as readonly string[]).includes(player)
}

/**
 * Returns null for anything that does not verify. Compared with `timingSafeEqual`
 * rather than `===`: the tokens are bearer credentials in a URL, and a byte-at-a-time
 * comparison leaks the signature to anyone who can time the endpoint.
 */
export function verifyToken(secret: string, token: string): Claims | null {
  const dot = token.indexOf('.')
  if (dot <= 0) return null
  const body = token.slice(0, dot)
  const presented = Buffer.from(token.slice(dot + 1), 'base64url')
  const expected = Buffer.from(sign(secret, body), 'base64url')
  if (presented.length !== expected.length) return null
  if (!timingSafeEqual(presented, expected)) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  return claimsAreWellFormed(parsed) ? parsed : null
}

/** Every token a freshly created game hands out: four players, an admin, a projector. */
export function mintGameTokens(
  secret: string,
  gameId: string,
): { readonly admin: string; readonly table: string
     readonly players: Readonly<Record<PlayerId, string>> } {
  const players = Object.fromEntries(
    PLAYER_IDS.map((player) => [player, mintToken(secret, { gameId, role: { kind: 'player', player } })]),
  ) as Record<PlayerId, string>
  return {
    admin: mintToken(secret, { gameId, role: { kind: 'admin' } }),
    table: mintToken(secret, { gameId, role: { kind: 'table' } }),
    players,
  }
}

export function isAdmin(role: Role): boolean {
  return role.kind === 'admin'
}
