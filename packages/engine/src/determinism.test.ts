import { describe, it, expect, beforeAll } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = join(fileURLToPath(import.meta.url), '..')

describe('engine determinism', () => {
  let builtCode: string

  beforeAll(async () => {
    const distDir = join(__dirname, '..', 'dist')
    try {
      const indexPath = join(distDir, 'index.js')
      builtCode = await fs.readFile(indexPath, 'utf-8')
    } catch (e) {
      const errorMsg =
        e instanceof Error ? e.message : String(e)
      if (errorMsg.includes('ENOENT')) {
        throw new Error(
          `dist/index.js not found. Run "npm run build" first. Error: ${errorMsg}`
        )
      }
      throw e
    }
  })

  it('compiled code contains no Math.random calls', () => {
    const match = builtCode.match(/Math\.random/g)
    expect(match, 'Found Math.random in built code').toBeNull()
  })

  it('compiled code contains no Date.now calls', () => {
    const match = builtCode.match(/Date\.now/g)
    expect(match, 'Found Date.now in built code').toBeNull()
  })

  it('compiled code contains no new Date() calls', () => {
    const match = builtCode.match(/new\s+Date\s*\(/g)
    expect(match, 'Found new Date() in built code').toBeNull()
  })

  it('compiled code contains no require() calls for Node.js modules', () => {
    const match = builtCode.match(/require\s*\(\s*["'`](?:node:|fs|path|crypto|child_process|os|stream)\b/g)
    expect(match, 'Found require() of Node.js module in built code').toBeNull()
  })

  it('compiled code contains no import() calls for Node.js modules', () => {
    const match = builtCode.match(/import\s*\(\s*["'`](?:node:|fs|path|crypto|child_process|os|stream)\b/g)
    expect(match, 'Found import() of Node.js module in built code').toBeNull()
  })
})
