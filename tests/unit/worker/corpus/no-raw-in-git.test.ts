import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Recorded source answers never enter git: the dump under corpus/ is ignored, and a case names the
// answer keys it was built from (source.answers) rather than carrying the raw rows. Owner's rule,
// 2026-09-12. The two checks below are what turn the rule into a build failure.
const ROOT = join(import.meta.dirname, '..', '..', '..', '..')
const CASES = join(ROOT, 'tests', 'corpus', 'cases')

const hasRawKey = (value: unknown): boolean => {
  if (Array.isArray(value)) return value.some(hasRawKey)
  if (value === null || typeof value !== 'object') return false
  return Object.entries(value as Record<string, unknown>).some(([key, entry]) => key === 'raw' || hasRawKey(entry))
}

describe('no raw source data in git', () => {
  it('corpus/ is ignored, so a season dump cannot be staged', () => {
    const status = execFileSync('git', ['check-ignore', '-q', 'corpus/season/any/answers.jsonl'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] })
    expect(status).toBeDefined()
  })

  it('a control that must NOT be ignored proves the check can fail', () => {
    expect(() => execFileSync('git', ['check-ignore', '-q', 'tests/corpus/README.md'], { cwd: ROOT, stdio: ['ignore', 'ignore', 'ignore'] })).toThrow()
  })

  it('no case file carries a raw key at any depth', () => {
    const files = readdirSync(CASES).filter(file => file.endsWith('.json'))
    expect(files.length).toBeGreaterThan(0)
    const offenders = files.filter(file => hasRawKey(JSON.parse(readFileSync(join(CASES, file), 'utf8'))))
    expect(offenders).toEqual([])
  })

  it('the raw detector sees a nested raw key (control)', () => {
    expect(hasRawKey({ rows: [{ uri: 'x', raw: {} }] })).toBe(true)
    expect(hasRawKey({ rows: [{ uri: 'x' }] })).toBe(false)
  })
})
