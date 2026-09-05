import { beforeEach, describe, expect, test, vi } from 'vitest'

import {
  BROWSER_USER_AGENT,
  FRONTEND_GRAPHQL_URL,
  TOKEN_PAGE_URL,
  createAnilistFrontendSession,
  extractAlToken,
  isGateRejection,
  newSessionId,
} from '../../../../src/sources/anilist/frontend'

/** A page as anilist.co renders it for a browser user agent. */
const renderedPage = (token: string) =>
  `<meta name=twitter:site content=@AniListco><script>window.al_token = "${token}";</script><link href="x">`

/**
 * The page anilist.co serves when the request carries no browser user agent: measured 5 times out of
 * 5, the PHP is handed back un-executed.
 */
const UN_RENDERED_PAGE = '<script>window.al_token = "<?= csrf_token() ?>";</script>'

const GATE_403 = {
  status: 403,
  body: { errors: [{ message: 'Forbidden. (Use graphql subdomain)', status: 403 }], data: { Media: null } },
}

type Call = { url: string, init?: { method?: string, headers?: Record<string, string>, body?: string } }

/** A fetch that answers from a script and records what it was asked. */
const fakeFetch = (steps: { status: number, body: unknown }[]) => {
  const calls: Call[] = []
  const impl = async (url: string, init?: Call['init']) => {
    calls.push({ url, init })
    const step = steps.shift() ?? { status: 500, body: {} }
    const text = typeof step.body === 'string' ? step.body : JSON.stringify(step.body)
    return { status: step.status, text: async () => text }
  }
  return { impl, calls }
}

const tokenPageCalls = (calls: Call[]) => calls.filter(c => c.url.startsWith(TOKEN_PAGE_URL))
const graphqlCalls = (calls: Call[]) => calls.filter(c => c.url === FRONTEND_GRAPHQL_URL)
const sessionOf = (call?: Call) => call?.init?.headers?.cookie?.replace('laravel_session=', '')

describe('extractAlToken', () => {
  test('reads the token out of a rendered page', () => {
    expect(extractAlToken(renderedPage('0vRI6fqTtRjDGAUyNi0Hi0L4E2HW4Djh99evh4Xg')))
      .toBe('0vRI6fqTtRjDGAUyNi0Hi0L4E2HW4Djh99evh4Xg')
  })

  /**
   * The reason this function has a length floor at all. Without a browser user agent anilist.co
   * hands back the template rather than the token, and a naive read would return the PHP source as
   * if it were a credential, then 403 on every single use with nothing saying why.
   */
  test('refuses the un-rendered PHP template', () => {
    expect(extractAlToken(UN_RENDERED_PAGE)).toBeUndefined()
  })

  test('returns undefined when the page carries no token at all', () => {
    expect(extractAlToken('<html><body>nothing here</body></html>')).toBeUndefined()
  })
})

describe('newSessionId', () => {
  // Laravel adopts an id it never issued, but only one shaped like its own: 40 alphanumerics.
  test('looks like a session id Laravel would have issued', () => {
    const id = newSessionId()
    expect(id).toMatch(/^[A-Za-z0-9]{40}$/)
  })

  test('is different every time', () => {
    const ids = new Set(Array.from({ length: 50 }, newSessionId))
    expect(ids.size).toBe(50)
  })
})

describe('isGateRejection', () => {
  test('recognises the gate refusing a request', () => {
    expect(isGateRejection(403, GATE_403.body)).toBe(true)
  })

  /**
   * The public API's 403 is a different thing entirely: AniList switched the endpoint off. Treating
   * it as a gate rejection would send us acquiring a pair that cannot help.
   */
  test('does not mistake the disabled public API for the gate', () => {
    expect(isGateRejection(403, {
      errors: [{ message: 'The AniList API has been temporarily disabled due to severe stability issues.', status: 403 }],
    })).toBe(false)
  })

  test('a rate limit is not a gate rejection', () => {
    expect(isGateRejection(429, { errors: [{ message: 'Too Many Requests', status: 429 }] })).toBe(false)
  })

  test('survives a body with no errors', () => {
    expect(isGateRejection(403, undefined)).toBe(false)
    expect(isGateRejection(403, {})).toBe(false)
  })
})

describe('createAnilistFrontendSession', () => {
  beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}) })

  /**
   * The core invariant, and the one the whole module exists for. Measured against the live endpoint:
   * token alone 403, session alone 403, matched pair 200, mismatched pair 403. So the id sent on the
   * token page and the id sent on the query have to be the SAME id, and the token has to be the one
   * that page rendered.
   */
  test('queries with the token bound to the session id it pinned', async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: renderedPage('TOKENabcdefghijklmnopqrstuvwxyz012345678') },
      { status: 200, body: { data: { Media: { id: 21 } } } },
    ])
    const data = await createAnilistFrontendSession(impl).query({ query: '{Media(id:21){id}}' })

    expect(data).toEqual({ Media: { id: 21 } })
    const [page, gql] = calls
    expect(sessionOf(page)).toMatch(/^[A-Za-z0-9]{40}$/)
    expect(sessionOf(gql)).toBe(sessionOf(page))
    expect(gql?.init?.headers?.['x-csrf-token']).toBe('TOKENabcdefghijklmnopqrstuvwxyz012345678')
    expect(gql?.init?.method).toBe('POST')
  })

  // Without it anilist.co returns the un-rendered template and there is no token to bind to.
  test('asks for the token page with a browser user agent', async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: renderedPage('TOKENabcdefghijklmnopqrstuvwxyz012345678') },
      { status: 200, body: { data: { ok: true } } },
    ])
    await createAnilistFrontendSession(impl).query({ query: '{ok}' })
    expect(calls[0]?.init?.headers?.['user-agent']).toBe(BROWSER_USER_AGENT)
  })

  /**
   * The FKN proxy caches for an hour keyed on url plus forwarded headers, so an unbusted token page
   * could hand back a token minted against a session that is no longer ours.
   */
  test('busts the proxy cache on the token page', async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: renderedPage('TOKENabcdefghijklmnopqrstuvwxyz012345678') },
      { status: 200, body: { data: { ok: true } } },
    ])
    await createAnilistFrontendSession(impl).query({ query: '{ok}' })
    expect(calls[0]?.url).toMatch(/\?_=[A-Za-z0-9]{8}$/)
  })

  /**
   * A seasonal load fires three pages at once. Three token pages would be three sessions, two of
   * them abandoned the moment they were created, and three needless round trips through the proxy.
   */
  test('shares one acquisition across concurrent queries', async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: renderedPage('TOKENabcdefghijklmnopqrstuvwxyz012345678') },
      { status: 200, body: { data: { page: 1 } } },
      { status: 200, body: { data: { page: 2 } } },
      { status: 200, body: { data: { page: 3 } } },
    ])
    const session = createAnilistFrontendSession(impl)
    const results = await Promise.all([
      session.query({ query: '{a}' }),
      session.query({ query: '{b}' }),
      session.query({ query: '{c}' }),
    ])

    expect(tokenPageCalls(calls)).toHaveLength(1)
    expect(graphqlCalls(calls)).toHaveLength(3)
    expect(results).toEqual([{ page: 1 }, { page: 2 }, { page: 3 }])
  })

  test('reuses the pair across later queries', async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: renderedPage('TOKENabcdefghijklmnopqrstuvwxyz012345678') },
      { status: 200, body: { data: { first: true } } },
      { status: 200, body: { data: { second: true } } },
    ])
    const session = createAnilistFrontendSession(impl)
    await session.query({ query: '{a}' })
    await session.query({ query: '{b}' })
    expect(tokenPageCalls(calls)).toHaveLength(1)
  })

  /**
   * The session expires after 12 hours, and the gate reports an expired pair exactly as it reports
   * never having had one. So a refresh has to mint a NEW id: retrying the same dead pair would just
   * collect the same 403.
   */
  test('acquires a fresh pair once when the gate refuses, and retries on a new session id', async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: renderedPage('STALEabcdefghijklmnopqrstuvwxyz012345678') },
      GATE_403,
      { status: 200, body: renderedPage('FRESHabcdefghijklmnopqrstuvwxyz012345678') },
      { status: 200, body: { data: { recovered: true } } },
    ])
    const data = await createAnilistFrontendSession(impl).query({ query: '{a}' })

    expect(data).toEqual({ recovered: true })
    expect(tokenPageCalls(calls)).toHaveLength(2)
    const [first, second] = graphqlCalls(calls)
    expect(second?.init?.headers?.['x-csrf-token']).toBe('FRESHabcdefghijklmnopqrstuvwxyz012345678')
    expect(sessionOf(second)).not.toBe(sessionOf(first))
  })

  /**
   * Only the gate's own refusal earns a new pair. A rate limit or a 5xx would otherwise burn a token
   * page on every single query, which is the opposite of what a backed-off caller wants.
   */
  test('does not acquire a new pair for a rate limit', async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: renderedPage('TOKENabcdefghijklmnopqrstuvwxyz012345678') },
      { status: 429, body: { errors: [{ message: 'Too Many Requests', status: 429 }] } },
    ])
    const data = await createAnilistFrontendSession(impl).query({ query: '{a}' })

    expect(data).toBeUndefined()
    expect(tokenPageCalls(calls)).toHaveLength(1)
  })

  test('gives up after one refresh rather than looping', async () => {
    const { impl, calls } = fakeFetch([
      { status: 200, body: renderedPage('ONEabcdefghijklmnopqrstuvwxyz0123456789a') },
      GATE_403,
      { status: 200, body: renderedPage('TWOabcdefghijklmnopqrstuvwxyz0123456789a') },
      GATE_403,
    ])
    const data = await createAnilistFrontendSession(impl).query({ query: '{a}' })

    expect(data).toBeUndefined()
    expect(tokenPageCalls(calls)).toHaveLength(2)
    expect(graphqlCalls(calls)).toHaveLength(2)
  })

  test('never sends a query when the token page came back un-rendered', async () => {
    const { impl, calls } = fakeFetch([{ status: 200, body: UN_RENDERED_PAGE }])
    const data = await createAnilistFrontendSession(impl).query({ query: '{a}' })

    expect(data).toBeUndefined()
    expect(graphqlCalls(calls)).toHaveLength(0)
  })

  test('survives the token page throwing', async () => {
    const impl = async () => { throw new Error('offline') }
    await expect(createAnilistFrontendSession(impl).query({ query: '{a}' })).resolves.toBeUndefined()
  })

  // AniList reports failures in the body, so a 200 with `data: null` is a failure like any other
  test('treats a 200 with no data as a failure', async () => {
    const { impl } = fakeFetch([
      { status: 200, body: renderedPage('TOKENabcdefghijklmnopqrstuvwxyz012345678') },
      { status: 200, body: { data: null, errors: [{ message: 'Not Found', status: 404 }] } },
    ])
    await expect(createAnilistFrontendSession(impl).query({ query: '{a}' })).resolves.toBeUndefined()
  })
})
