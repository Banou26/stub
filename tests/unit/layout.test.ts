import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))

const walk = (dir: string, out: string[] = []) => {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) walk(path, out)
    else out.push(path.slice(root.length))
  }
  return out
}

const src = walk(join(root, 'src'))
const unit = walk(join(root, 'tests/unit'))

// The controls come first: a walk that found nothing would satisfy every emptiness assertion below.
test('the walk can see files at all', () => {
  expect(src.filter(f => f.endsWith('.ts')).length).toBeGreaterThan(0)
  expect(unit.filter(f => f.endsWith('.test.ts')).length).toBeGreaterThanOrEqual(51)
})

test('no test file is left under src/', () => {
  expect(src.filter(f => f.endsWith('.test.ts') || f.endsWith('.test.tsx') || f.endsWith('.spec.ts'))).toEqual([])
})

test('no test fixture is left under src/', () => {
  expect(src.filter(f => f.includes('__fixtures__'))).toEqual([])
})
