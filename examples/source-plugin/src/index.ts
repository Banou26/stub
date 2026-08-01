import type { Media } from '../../../src/generated/schema/types.generated'
import type { StubPluginAPI } from '../../../src/plugin-api'

// The '@fkn/lib' barrel pulls in the webvpn net/http surface, which needs node stream polyfills a
// plain vite config does not install, and the bundle then dies on evaluation before onConnect runs.
// Import the subpath: a plugin needs the packages API and nothing else.
import * as packages from '@fkn/lib/packages'
import { info } from '@fkn/lib/account'
// not '@fkn/lib/cloud': that barrel carries the webvpn net/http surface, which reads node stream
// internals as it evaluates and takes the whole bundle down before onConnect can run
import { fetch } from '@fkn/lib/cloud/fetch'
// the promises subpath: '@fkn/lib/cloud/fs' is the node callback-style api, so awaiting it resolves
// instantly with undefined and then throws when it calls the callback that was never passed
import { writeFile } from '@fkn/lib/cloud/fs/promises'

// A complete stub source plugin. Publish this package with the keywords in package.json and it
// becomes discoverable in stub's Add sources picker; stub installs it through FKN, boots it in a
// hidden sandbox frame, and connects over a brokered port.

const media = (entry: { id: string, title: string, description: string, cover: string }): Media => ({
  _id: `example:${entry.id}`,
  uri: `example:${entry.id}`,
  origin: 'example',
  id: entry.id,
  categories: ['ANIME'],
  titles: [{ language: 'en', title: entry.title }],
  descriptions: [{ language: 'en', description: entry.description }],
  covers: [{ url: entry.cover }],
  handles: [],
} as unknown as Media)

const CATALOG = [
  media({
    id: '1',
    title: 'The Example Saga',
    description: 'A demonstration entry served by the stub example source plugin.',
    cover: 'https://placehold.co/460x650/1f2933/e5e7eb.png?text=The+Example+Saga',
  }),
  media({
    id: '2',
    title: 'Plugin Protocol II',
    description: 'The second demonstration entry, mostly here so search has something to find.',
    cover: 'https://placehold.co/460x650/1f2933/e5e7eb.png?text=Plugin+Protocol+II',
  }),
]

// A real source plugin fetches its catalog from somewhere. This one's catalog is static, so it
// pulls its own cover art instead: the point is that the request goes through the PACKAGE's own
// `fetch`, so the bytes meter against the package rather than against the app embedding it.
//
// Run once per connection rather than per query, so a plugin that is installed but never browsed
// still shows a tally. Failures are logged and swallowed: cover art is decoration, and a source
// that cannot reach the network should still serve the catalog it already holds.
const pullCoverArt = async (): Promise<void> => {
  for (const entry of CATALOG) {
    const url = entry.covers?.[0]?.url
    if (!url) continue
    try {
      const response = await fetch(url)
      const bytes = (await response.arrayBuffer()).byteLength
      console.log(`Example Source: pulled ${bytes} bytes of cover art from ${url}`)
    } catch (error) {
      console.warn(`Example Source: could not pull ${url}`, error)
    }
  }
}

// Cloud storage is keyed on the package, like its usage and its quota, so this writes into the
// PACKAGE's own scope and not into the scope of whichever app mounted it. Two apps hosting this
// source therefore see one cache, not two.
//
// Encrypted storage is sealed until the account is unlocked, and a write while sealed is what asks
// the host app's page for that unlock. Failing is normal on a first run and costs only the cache.
const cacheCatalog = async (): Promise<void> => {
  try {
    await writeFile('catalog.json', JSON.stringify(CATALOG))
    console.log('Example Source: cached its catalog in its own cloud storage')
  } catch (error) {
    console.warn('Example Source: could not cache the catalog', error)
  }
}

packages.onConnect(() => ({
  origin: 'example',
  originUrl: 'https://github.com/Banou26/stub',
  name: 'Example Source',
  isApiOnly: false,
  metadataOnly: true,
  resolvers: {
    Query: {},
    Mutation: {},
    Subscription: {
      media: {
        subscribe: async function* (_, { input }) {
          yield { media: CATALOG.find(entry => entry.uri === input?.uri) ?? null }
        },
      },
      mediaPage: {
        subscribe: async function* (_, { input }) {
          const search = input?.search?.toLowerCase()
          yield {
            mediaPage: {
              nodes:
                search
                  ? CATALOG.filter(entry => entry.titles?.some(title => title?.title.toLowerCase().includes(search)))
                  : CATALOG,
            },
          }
        },
      },
    },
  },
} satisfies StubPluginAPI), ({ name, version, from, protocol }) => {
  console.log(`${name}@${version}: connected by ${from} over ${protocol}`)
  // A package follows the host app's FKN account with no second sign-in, and acts as ITSELF: quota,
  // storage scope and usage all key on this package's own id, never the app's.
  info().then(account => console.log(`${name}: signed in as`, account?.name ?? 'nobody'))
  pullCoverArt().then(cacheCatalog).catch(() => {})
})
