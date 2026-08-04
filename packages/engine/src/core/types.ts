/** Integer dollars. Never fractional. */
export type Money = number

export type PlayerId = 'P1' | 'P2' | 'P3' | 'P4'
export const PLAYER_IDS: readonly PlayerId[] = ['P1', 'P2', 'P3', 'P4'] as const

/** 0-39, index onto the physical board. */
export type SquareIndex = number

/** Kebab-case slug, e.g. 'illinois-avenue', 'reading-railroad'. */
export type DeedId = string

/** 1-24. */
export type RoundNumber = number

export type Era = 1 | 2 | 3 | 4

export type Phase =
  | 'setup'
  | 'draft'
  | 'market'
  | 'open'
  | 'movement'
  | 'settlement'
  | 'scoring'
  | 'complete'

export type ColorGroup =
  | 'brown' | 'light-blue' | 'pink' | 'orange'
  | 'red' | 'yellow' | 'green' | 'dark-blue'
  | 'railroad' | 'utility'

/** A single 2d6 roll, as produced by the physical dice at the table. */
export type DiceRoll = readonly [number, number]

export type ContractId = string

/** Every player-facing capability that era gating can withhold. */
export type Instrument =
  | 'trade' | 'building' | 'mortgage' | 'credit-line'
  | 'peer-loan' | 'rent-future' | 'venture' | 'laundering' | 'bribery'
  | 'cdo' | 'cds' | 'deed-option' | 'insider-trading'
