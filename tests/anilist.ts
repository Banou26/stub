import { use, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiShallowDeepEqual from 'chai-shallow-deep-equal'

use(chaiAsPromised)
use(chaiShallowDeepEqual)

// AniList reports failures with an HTTP 200 and `{ data: null, errors: [...] }`, rate limits above
// all. Every call site used to dereference data unguarded, so a rate limit took down the home feed
// with "Cannot read properties of null (reading 'Page')" and lost the actual reason.
const RATE_LIMITED = { data: null, errors: [{ message: 'Too Many Requests', status: 429 }] }

const ctxWith = (body: unknown, status = 200) => ({
  fetch: async () => ({ status, json: async () => body })
}) as any

const drain = async (generator: AsyncGenerator<any>) => {
  const yielded: any[] = []
  for await (const value of generator) yielded.push(value)
  return yielded
}

const captureErrors = async <T>(run: () => Promise<T>): Promise<[T, string]> => {
  const original = console.error
  const lines: string[] = []
  console.error = (...args: unknown[]) => { lines.push(args.map(String).join(' ')) }
  try {
    return [await run(), lines.join('\n')]
  } finally {
    console.error = original
  }
}

const mediaPage = async (input: Record<string, unknown>, ctx: any) => {
  const { resolvers } = await import('../src/sources/anilist/extractor')
  return drain((resolvers as any).Subscription.mediaPage.subscribe(undefined, { input }, ctx))
}

export const rateLimitedReleasingPage = async () => {
  const [yielded, errors] = await captureErrors(() => mediaPage({ status: 'RELEASING' }, ctxWith(RATE_LIMITED)))
  expect(yielded).to.deep.equal([{ mediaPage: { nodes: [] } }])
  // the real reason is surfaced rather than lost behind a TypeError
  expect(errors).to.contain('Too Many Requests')
}

export const rateLimitedSearchPage = async () => {
  const [yielded] = await captureErrors(() => mediaPage({ search: 'frieren' }, ctxWith(RATE_LIMITED)))
  expect(yielded).to.deep.equal([{ mediaPage: { nodes: [] } }])
}

export const malformedBody = async () => {
  const ctx = { fetch: async () => ({ status: 502, json: async () => { throw new Error('not json') } }) } as any
  const [yielded, errors] = await captureErrors(() => mediaPage({ status: 'RELEASING' }, ctx))
  expect(yielded).to.deep.equal([{ mediaPage: { nodes: [] } }])
  expect(errors).to.contain('502')
}

// A GraphQL response may carry partial data alongside errors, which is still worth rendering.
export const partialDataIsKept = async () => {
  const body = {
    data: { Page: { pageInfo: { lastPage: 1 }, media: [{ id: 1, title: { romaji: 'Frieren' }, format: 'TV' }] } },
    errors: [{ message: 'a partial failure' }]
  }
  const [yielded] = await captureErrors(() => mediaPage({ status: 'RELEASING' }, ctxWith(body)))
  expect(yielded[0].mediaPage.nodes.length).to.equal(1)
  expect(yielded[0].mediaPage.nodes[0].origin).to.equal('anilist')
}
