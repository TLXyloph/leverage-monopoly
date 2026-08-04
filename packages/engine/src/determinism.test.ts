import { describe, it, expect, beforeAll } from 'vitest'
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = join(fileURLToPath(import.meta.url), '..')

describe('engine determinism', () => {
  let builtFiles: Array<{ path: string; content: string }> = []

  beforeAll(async () => {
    const distDir = join(__dirname, '..', 'dist')
    try {
      builtFiles = await walkDir(distDir, (file) =>
        file.endsWith('.js') && !file.includes('.test.js')
      )
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : String(e)
      if (errorMsg.includes('ENOENT')) {
        throw new Error(
          `dist/ directory not found. Run "npm run build" first. Error: ${errorMsg}`
        )
      }
      throw e
    }

    if (builtFiles.length === 0) {
      throw new Error('No .js files found in dist/ after build')
    }
  })

  it('compiled code contains no Math.random calls', () => {
    const violations = findMatches(builtFiles, /Math\.random/g)
    expect(
      violations,
      `Math.random found in: ${violations.map((v) => v.file).join(', ')}`
    ).toHaveLength(0)
  })

  it('compiled code contains no Date.now calls', () => {
    const violations = findMatches(builtFiles, /Date\.now/g)
    expect(
      violations,
      `Date.now found in: ${violations.map((v) => v.file).join(', ')}`
    ).toHaveLength(0)
  })

  it('compiled code contains no new Date() calls', () => {
    const violations = findMatches(builtFiles, /new\s+Date\s*\(/g)
    expect(
      violations,
      `new Date() found in: ${violations.map((v) => v.file).join(', ')}`
    ).toHaveLength(0)
  })

  it('compiled code contains no require() calls for Node.js modules', () => {
    const violations = findMatches(
      builtFiles,
      /require\s*\(\s*["'`](?:node:|fs|path|crypto|child_process|os|stream)\b/g
    )
    expect(
      violations,
      `require() of Node.js module found in: ${violations.map((v) => v.file).join(', ')}`
    ).toHaveLength(0)
  })

  it('compiled code contains no import() calls for Node.js modules', () => {
    const violations = findMatches(
      builtFiles,
      /import\s*\(\s*["'`](?:node:|fs|path|crypto|child_process|os|stream)\b/g
    )
    expect(
      violations,
      `import() of Node.js module found in: ${violations.map((v) => v.file).join(', ')}`
    ).toHaveLength(0)
  })
})

async function walkDir(
  dir: string,
  predicate: (path: string) => boolean
): Promise<Array<{ path: string; content: string }>> {
  const results: Array<{ path: string; content: string }> = []
  const entries = await fs.readdir(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      const subResults = await walkDir(fullPath, predicate)
      results.push(...subResults)
    } else if (entry.isFile() && predicate(fullPath)) {
      const content = await fs.readFile(fullPath, 'utf-8')
      results.push({ path: fullPath, content })
    }
  }

  return results
}

function findMatches(
  files: Array<{ path: string; content: string }>,
  pattern: RegExp
): Array<{ file: string; match: string }> {
  const violations: Array<{ file: string; match: string }> = []

  for (const file of files) {
    const matches = file.content.match(pattern)
    if (matches) {
      for (const match of matches) {
        violations.push({ file: file.path, match })
      }
    }
  }

  return violations
}
