export type RejectionCode =
  | 'WRONG_PHASE' | 'NOT_YOUR_TURN' | 'INSUFFICIENT_CLEAN_CASH'
  | 'INSUFFICIENT_DIRTY_CASH' | 'INSUFFICIENT_BORROWING_BASE' | 'INVALID_AMOUNT'
  | 'NOT_OWNER' | 'DEED_MORTGAGED' | 'DEED_ENCUMBERED' | 'DEED_UNAVAILABLE'
  | 'INSTRUMENT_LOCKED_THIS_ERA' | 'CONTRACT_NOT_FOUND' | 'INVALID_WINDOW'
  | 'BID_EXCEEDS_BUDGET' | 'BID_BELOW_FACE' | 'ALREADY_SUBMITTED'
  | 'INCOMPLETE_COLOUR_GROUP' | 'UNEVEN_BUILD' | 'NO_HOUSES_REMAINING'
  | 'ALREADY_LAUNDERED_THIS_PHASE' | 'BRIBERY_ALREADY_USED'
  | 'POOL_NEEDS_THREE_ASSETS' | 'TRANCHES_EXCEED_POOL' | 'NOT_ASSET_OWNER'
  | 'INVALID_DICE' | 'VENTURE_ALREADY_ACTIVE' | 'INVALID_BRIBERY_TARGET'
  | 'SELF_DEALING' | 'NEGATIVE_AMOUNT' | 'DUPLICATE_CONTRACT_ID'
  | 'ASSET_ALREADY_POOLED' | 'INVALID_LOAN_TERMS'
  | 'SWAP_NOTIONAL_EXCEEDS_FACE' | 'NO_HOTELS_REMAINING' | 'DEED_DEVELOPED'
  | 'NOT_BUILDABLE' | 'TRADE_NOT_CONFIRMED'
  | 'NO_PENDING_LIQUIDATION' | 'WRONG_LIQUIDATION_LOT'

export interface Rejection {
  readonly rejected: true
  readonly code: RejectionCode
  /** Written for the player, not the developer. Shown directly in the UI. */
  readonly message: string
}

export function reject(code: RejectionCode, message: string): Rejection {
  return { rejected: true, code, message }
}

export function isRejection(value: unknown): value is Rejection {
  return typeof value === 'object' && value !== null && 'rejected' in value
}
