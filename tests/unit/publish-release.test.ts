// The publish workflow signs fkn.json TWICE per release and the two documents are not
// interchangeable. The every-push half signs identity only and COMMITS the result, which is the file
// Cloudflare Pages deploys to anime.fkn.app. The version-change half signs a `contents` list over
// the npm packlist and never commits it, because those bytes are the tarball's rather than the
// website's: a list on the committed copy would name files anime.fkn.app does not serve, and every
// load from that source would be refused for a file that was never wrong.
//
// Nothing here can be seen before a release. A list built from the wrong tree, built before the
// build, or missing the source it is fetched from publishes successfully and fails at every
// consumer, on a version number that npm reserves forever by then.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { MANIFEST_MAX_BYTES, verifyManifest } from '@fkn/sign'

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')

/**
 * The workflow WITHOUT its comments, which every assertion about its steps has to read: the file
 * explains each trap it avoids by name, so `--contents` and `git commit` both appear in prose
 * whether or not the step using them survives an edit.
 */
const steps = read('.github/workflows/publish-lib.yml')
  .split('\n')
  .filter((line) => !line.trim().startsWith('#'))
  .join('\n')

/** Where a command sits in the job, for the assertions that are about ORDER rather than presence. */
const positionOf = (needle: string): number => {
  const index = steps.indexOf(needle)
  expect(index, `${needle} is not in publish-lib.yml, so an order assertion over it would be vacuous`).toBeGreaterThan(-1)
  return index
}

/** Every `fkn-sign sign` invocation in the job, in the order the steps run. */
const signCommands = [...steps.matchAll(/fkn-sign sign [^\n]*/g)].map((match) => match[0])

describe('the two halves sign different documents', () => {
  test('found the workflow at all, so a false pass here is not a bad path', () => {
    expect(steps, 'publish-lib.yml was not read, so every assertion below is vacuous').toContain('runs-on')
    expect(signCommands, 'a release signs once for the website and once for the tarball').toHaveLength(2)
  })

  test('the committed half stays identity only, since the website is not the packlist', () => {
    expect(signCommands[0], 'the every-push half is the document anime.fkn.app serves').not.toContain('--contents')
  })

  test('the listed half is signed after the commit, so nothing lists a packlist on main', () => {
    expect(positionOf('git push origin HEAD:main')).toBeLessThan(positionOf('fkn-sign sign --contents'))
  })

  test('the listed half is signed after the build, since the list is that build output', () => {
    expect(positionOf('fkn-sign sign --contents')).toBeGreaterThan(positionOf('run: npm run build'))
  })

  test('the listed half names both sources, and the npm one it is fetched from', () => {
    // a source left out is SOURCE_NOT_LISTED at every consumer, on a version that is spent by then
    expect(signCommands[1]).toContain('--sources npm:@banou/stub,https:anime.fkn.app')
    expect(signCommands[1]).toContain('--out fkn.json')
  })
})

describe('what the release is read against before it is uploaded', () => {
  const publish = () => positionOf('run: npm publish --access public')

  test('re-places the copies, so all three carry the list and not the committed document', () => {
    expect(positionOf('fkn-sign place --out build')).toBeLessThan(publish())
  })

  test('re-hashes the tree the list was built from, and asserts the source it lists', () => {
    expect(positionOf('npx fkn-sign check')).toBeLessThan(publish())
    expect(positionOf('fkn-sign verify fkn.json --contents . --source npm:@banou/stub')).toBeLessThan(publish())
    expect(positionOf('node -e'), 'the source assertion runs after the publish, which is too late').toBeLessThan(publish())
  })

  test('holds the document under the cap the deployed readers read it at', () => {
    // 0.0.20 verifies under the readers live today because they ignore `contents` entirely. They
    // still cap the document, and past the cap they refuse it outright rather than degrading.
    const gate = steps.match(/SIZE=\$\(wc -c < fkn\.json\)[\s\S]*?-gt (\d+)/)
    expect(gate, 'the size gate moved or changed shape').toBeTruthy()
    expect(Number(gate![1])).toBe(MANIFEST_MAX_BYTES)
  })

  test('verifies what the CDN serves, which is the only reading of the published bytes', () => {
    expect(positionOf('npx fkn-sign verify --published')).toBeGreaterThan(positionOf('the registry still does not serve'))
  })
})

describe('the manifest this branch carries', () => {
  test('lists no files, because anime.fkn.app serves a site rather than a tarball', () => {
    const result = verifyManifest(read('fkn.json').trim(), { now: Math.floor(Date.now() / 1000), webOrigin: 'https://fkn.app' })
    if (!result.ok || result.kind !== 'manifest') throw new Error(`fkn.json did not verify: ${result.ok ? result.kind : result.code}`)
    expect(result.contents, 'a committed list names npm paths the website does not serve').toBeNull()
  })
})
