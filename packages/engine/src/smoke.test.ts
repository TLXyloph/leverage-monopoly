import { describe, it, expect } from 'vitest'
import { ENGINE_VERSION } from './index.js'

describe('engine package', () => {
  it('exports a version string', () => {
    expect(ENGINE_VERSION).toBe('0.1.0')
  })
})
