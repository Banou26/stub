import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'
import { appIdOf, filesPublishes, parseKeysFile, verifyManifest } from '@fkn/sign'

// fkn.json is what the FKN platform reads to learn that this app is stub, from both the npm tarball
// and https://anime.fkn.app/.well-known/fkn.json. The signature covers the exact bytes, so anything
// that edits the file by hand breaks it here rather than in a broker nobody can debug from.

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../../${path}`, import.meta.url)), 'utf-8')

const WEB_ORIGIN = 'https://fkn.app'
const SOURCES = ['npm:@banou/stub', 'https:anime.fkn.app']

const manifest = read('fkn.json').trim()
const pkg = JSON.parse(read('package.json')) as { name: string, files?: string[] }
const now = () => Math.floor(Date.now() / 1000)

describe('the signed app manifest', () => {
  test('verifies for every source the platform can call this app', () => {
    for (const source of SOURCES) {
      const result = verifyManifest(manifest, { now: now(), source, webOrigin: WEB_ORIGIN })
      expect(result.ok ? 'ok' : `${result.code}: ${result.message}`).toBe('ok')
    }
  })

  // CONTROL: the source check above proves nothing unless an unlisted source is refused, since a
  // verifier that ignored `source` would accept both entries and every typo alike.
  test('refuses a source it does not list', () => {
    const result = verifyManifest(manifest, { now: now(), source: 'npm:@banou/other', webOrigin: WEB_ORIGIN })
    expect(result.ok ? 'ok' : result.code).toBe('SOURCE_NOT_LISTED')
  })

  test('names the app the root and the slug derive', () => {
    const result = verifyManifest(manifest, { now: now(), webOrigin: WEB_ORIGIN })
    if (!result.ok || result.kind !== 'manifest') throw new Error(`manifest did not verify: ${result.ok ? result.kind : result.code}`)
    expect(result.slug).toBe('stub')
    expect(result.app).toBe(appIdOf(result.root, 'stub'))
    expect(result.sources).toEqual(SOURCES)
    expect(result.name).toBe('Stub')
  })
})

describe('the key list beside it', () => {
  test('parses and names the same app', () => {
    const keys = parseKeysFile(read('keys.json'))
    const result = verifyManifest(manifest, { now: now(), webOrigin: WEB_ORIGIN })
    if (!result.ok || result.kind !== 'manifest') throw new Error('manifest did not verify')
    expect(keys.app).toBe(result.app)
    expect(keys.slug).toBe('stub')
    expect(keys.keys.membersB64).toEqual(result.keys.membersB64)
  })
})

describe('the npm tarball', () => {
  // `fkn-sign check` in the build script is the real gate, because only `npm pack` sees .npmignore.
  // This is the cheap half, and it is here so a dropped entry reds the unit suite too.
  test('publishes fkn.json from the package root', () => {
    expect(pkg.name).toBe('@banou/stub')
    expect(filesPublishes(pkg.files, 'fkn.json')).toBe(true)
  })
})
