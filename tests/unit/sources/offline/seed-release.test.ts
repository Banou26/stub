// The seed's release coordinates are written twice: src/sources/offline/seed.ts is what the runtime
// downloads, .github/workflows/season-seed.yml is what the walk uploads. Nothing at run time can tell
// them apart when they drift, because a runtime 404 falls back to the bundle and looks exactly like
// nothing being wrong, while the workflow stays green. This file is what keeps them one fact.
//
// It also pins that every page the exporter opens carries both walk flags, which is the composition
// `refusesSeedAsset` cannot check for itself.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

import {
  SEED_EPISODES_ASSET, SEED_INDEX_ASSET, SEED_MANIFEST_ASSET, SEED_RELEASE_TAG,
} from '../../../../src/sources/offline/seed'
import { readExportFlag, readNoSeedFlag } from '../../../../src/utils/export-flag'

const root = fileURLToPath(new URL('../../../..', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')

const workflow = read('.github/workflows/season-seed.yml')
const exporter = read('scripts/export-season-seed.mjs')

test('the workflow uploads to the tag and the filenames the runtime downloads', () => {
  expect(workflow.match(/^\s*TAG:\s*(\S+)\s*$/m)?.[1]).toBe(SEED_RELEASE_TAG)

  const uploaded = [...workflow.matchAll(/gh release upload "\$TAG"\s+dist-seed\/(\S+)/g)].map(match => match[1])
  expect(uploaded, 'control: the publish step has to name assets for this to prove anything').toHaveLength(3)
  expect(uploaded.sort()).toEqual([SEED_EPISODES_ASSET, SEED_INDEX_ASSET, SEED_MANIFEST_ASSET].sort())
})

test('the relay census reads the manifest the exporter writes', () => {
  expect(workflow).toContain(`dist-seed/${SEED_MANIFEST_ASSET}`)
})

test('every page the exporter opens carries the export hook and the no-seed flag', () => {
  const query = exporter.match(/const WALK_QUERY = '([^']+)'/)?.[1]
  expect(query, 'control: the exporter has to declare one query for this to prove anything').toBeDefined()
  expect(readExportFlag(`https://anime.fkn.app/${query}`)).toBe(true)
  expect(readNoSeedFlag(`https://anime.fkn.app/${query}`)).toBe(true)

  // every navigation either carries the query itself or goes to the one path built with it, so a goto
  // added later with a bare url fails here rather than walking a page that reads the last publish
  const navigations = exporter.split('\n').filter(line => /page\.goto\(|const path = /.test(line))
  expect(navigations, 'control: the walk has to navigate somewhere').not.toHaveLength(0)
  for (const line of navigations) expect(line.trim(), line.trim()).toMatch(/WALK_QUERY|\$\{path\}/)
})
