import type { Media } from '../../../src/generated/schema/types.generated'
import type { StubPluginAPI } from '../../../src/plugin-api'

// The '@fkn/lib' barrel pulls in the webvpn net/http surface, which needs node stream polyfills a
// plain vite config does not install, and the bundle then dies on evaluation before onConnect runs.
// Import the subpath: a plugin needs the packages API and nothing else.
import * as packages from '@fkn/lib/packages'
import { info } from '@fkn/lib/account'

// A complete stub source plugin. Publish this package with the keywords in package.json and it
// becomes discoverable in stub's Add sources picker; stub installs it through FKN, boots it in a
// hidden sandbox frame, and connects over a brokered port. Real plugins would fetch from an API
// with the plugin's own @fkn/lib `fetch` here instead of serving a static catalog.

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
    cover: 'https://picsum.photos/seed/example1/460/650',
  }),
  media({
    id: '2',
    title: 'Plugin Protocol II',
    description: 'The second demonstration entry, mostly here so search has something to find.',
    cover: 'https://picsum.photos/seed/example2/460/650',
  }),
]

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
})
