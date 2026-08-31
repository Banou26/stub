/**
 * Corpus for the JustWatch offer-id measurement in scripts/measure-justwatch-offer-ids.probe.ts.
 *
 * Fetches once into node_modules/.cache and is a no-op afterwards, the same shape as
 * scripts/measure-unogs-season-match.mjs and scripts/fetch-title-corpus.mjs.
 *
 *   node scripts/measure-justwatch-offer-ids.mjs
 *   ./node_modules/.bin/vitest run --config vitest.probe.config.ts \
 *     scripts/measure-justwatch-offer-ids.probe.ts --disableConsoleIntercept --reporter=verbose
 *
 * WHAT IT COLLECTS. Every streaming offer JustWatch returns for a spread of titles, as
 * `{ shortName, standardWebURL }` plus the JustWatch title the offer hangs off. That is exactly the
 * input `buildOffersAsHandles` sees, so the probe can drive the REAL `PACKAGE_ORIGIN_MAP` and
 * `extractContentId` over it and ask the only question that matters: does any provider id come back
 * identical for two DIFFERENT titles? That is a weld, and `graph.link` cannot undo one.
 *
 * The title list deliberately reaches past anime into western animation and prestige drama, because
 * the services whose url shapes drift most (HBO Max, Peacock, Paramount+) carry little anime and a
 * corpus that cannot reach a provider cannot measure it.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const OUT = new URL('../node_modules/.cache/justwatch-offer-pool.json', import.meta.url).pathname

if (existsSync(OUT)) {
  console.log(`already have ${OUT}`)
  process.exit(0)
}

const SEARCH = `
  query GetSearchTitles($searchTitlesFilter: TitleFilter!, $country: Country!, $language: Language!, $first: Int!) {
    popularTitles(country: $country, filter: $searchTitlesFilter, first: $first, sortBy: POPULAR, sortRandomSeed: 0) {
      edges {
        node {
          objectId
          objectType
          content(country: $country, language: $language) { title }
          offers(country: $country, platform: WEB, filter: { bestOnly: true }) {
            monetizationType
            standardWebURL
            package { shortName clearName }
          }
        }
      }
    }
  }`

const TITLES = [
  'Spirited Away', 'Naruto', 'Bleach', 'One Piece', 'Sailor Moon', 'Dragon Ball',
  'Pokemon', 'Digimon', 'Gundam', 'Demon Slayer', 'Attack on Titan', 'Jujutsu Kaisen',
  'Cowboy Bebop', 'Death Note', 'My Hero Academia', 'Fullmetal Alchemist', 'Hunter x Hunter',
  'Your Name', 'Akira', 'Ghost in the Shell', 'Vinland Saga', 'Frieren', 'Chainsaw Man',
  'Spy x Family', 'Solo Leveling', 'Mob Psycho 100', 'Yu Yu Hakusho', 'Beyblade',
  'Avatar The Last Airbender', 'Rick and Morty', 'Adventure Time', 'Steven Universe',
  'Gravity Falls', 'Teen Titans', 'SpongeBob', 'Family Guy', 'South Park', 'The Simpsons',
  'Bluey', 'Peppa Pig', 'Paw Patrol', 'Severance', 'Ted Lasso', 'The Office',
  'Parks and Recreation', 'Friends', 'Breaking Bad', 'Succession', 'The Last of Us',
  'House of the Dragon', 'Game of Thrones', 'Star Trek', 'Batman', 'Superman',
]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

const search = async title => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://apis.justwatch.com/graphql', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: '*/*' },
      body: JSON.stringify({
        query: SEARCH,
        variables: { searchTitlesFilter: { searchQuery: title }, country: 'US', language: 'en', first: 10 },
      }),
    }).catch(() => undefined)
    const body = await res?.json().catch(() => undefined)
    if (body?.data?.popularTitles) return body.data.popularTitles.edges ?? []
    await sleep(1500 * (attempt + 1))
  }
  return []
}

const titles = []
for (const query of TITLES) {
  const edges = await search(query)
  for (const { node } of edges) {
    titles.push({
      jwId: String(node.objectId),
      objectType: node.objectType,
      title: node.content?.title ?? '',
      offers: (node.offers ?? []).map(offer => ({
        shortName: offer.package.shortName,
        clearName: offer.package.clearName,
        monetizationType: offer.monetizationType,
        standardWebURL: offer.standardWebURL,
      })),
    })
  }
  console.log(`  ${query}: ${edges.length} titles`)
  await sleep(300)
}

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ searches: TITLES.length, titles }))
console.log(`\n${titles.length} titles, ${titles.reduce((n, t) => n + t.offers.length, 0)} offers -> ${OUT}`)
