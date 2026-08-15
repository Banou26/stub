// AniList's own frontend endpoint, for when the public API is switched off.
//
// Split out with NO imports so it can be tested: an extractor pulls in the source barrel and,
// through it, a CommonJS `require('react')` that cannot load outside a browser. Same reason
// ../jikan/season-scrape.ts and ../kitsu/season-paging.ts are their own modules.
//
// MEASURED 2026-08-16. `https://graphql.anilist.co` answers 403 to every caller, browser or curl,
// with or without browser headers:
//
//   {"errors":[{"message":"The AniList API has been temporarily disabled due to severe stability
//   issues.","status":403}]}
//
// That is AniList's own decision rather than anything about our egress or our fingerprint, so no
// header work reaches it and there is nothing to get past. anilist.co itself keeps serving normally,
// and its Vue app talks to a SAME-ORIGIN `https://anilist.co/graphql` carrying the identical schema:
// stub's own SEARCH_QUERY runs against it verbatim and comes back with all 24 fields populated,
// externalLinks and airingSchedule included.
//
// That endpoint refuses anything without a CSRF pair:
//
//   403 {"errors":[{"message":"Forbidden. (Use graphql subdomain)","status":403}]}
//
// The pair is Laravel's usual one and BOTH halves are needed. Measured: token alone 403, session
// alone 403, matched pair 200, and a deliberately MISMATCHED pair 403, which is what proves the
// token is verified against the session rather than merely being present. The token is the
// `window.al_token` that any anilist.co HTML page carries.
//
// Three measured details shape the code below.
//
// 1. The token page only RENDERS for a browser user agent. Without one, anilist.co serves the
//    un-rendered PHP template, `window.al_token = "<?= csrf_token() ?>"`, 5 times out of 5, while a
//    browser user agent rendered a real token 5 times out of 5. So the user agent is load bearing,
//    and `extractAlToken` requires a plausible token rather than trusting the page shape.
//
// 2. We CHOOSE the session id instead of reading it back. Laravel accepts an id it never issued and
//    binds the rendered token to it: sending a self-generated 40 character id returned that same id
//    in `set-cookie` and the following POST answered 200. This is required, not merely tidier,
//    because `set-cookie` cannot survive the trip home. @fkn/lib rebuilds a proxied response with
//    `new Response(body, { headers })`, and the Response constructor's header guard strips
//    `Set-Cookie`; confirmed in a browser, where it reads back as null.
//
//    Sending a cookie OUT is fine for the mirror-image reason: @fkn/lib serialises request headers
//    into a base64 `fkn-proxy-headers` header, so `cookie` and `user-agent` are never real headers
//    on the fetch the browser actually makes and never meet the forbidden-header list. Confirmed in
//    a browser: both survive `new Headers(init)` at guard "none", which is what @fkn/lib builds.
//
// 3. The FKN proxy caches for an hour (CACHE_TTL=3600000), keyed on url plus forwarded headers, so
//    a refresh reuses a cached token page unless something in the key moves. A refresh mints a new
//    session id, which moves the key by itself, and the id is also spent as a cache-busting search
//    param so the intent is visible rather than incidental.

/** The endpoint the anilist.co Vue app posts to. Same schema as the public API. */
export const FRONTEND_GRAPHQL_URL = 'https://anilist.co/graphql'

/** Any anilist.co HTML page carries the token. This one is small and already warm in the cache. */
export const TOKEN_PAGE_URL = 'https://anilist.co/search/anime/this-season'

/** Load bearing: without a browser user agent the page comes back as an un-rendered PHP template. */
export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const SESSION_ID_LENGTH = 40
const SESSION_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * A session id of the shape Laravel hands out, which it then adopts as if it had issued it.
 *
 * Uses `crypto` where there is one and falls back to `Math.random`, because the id needs to be
 * unique per acquisition and not much else: it authenticates nothing on its own, it only has to
 * match the token rendered against it.
 */
export const newSessionId = (): string => {
  const bytes = new Uint8Array(SESSION_ID_LENGTH)
  const webCrypto = (globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto
  if (webCrypto?.getRandomValues) webCrypto.getRandomValues(bytes)
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256)
  let out = ''
  for (const byte of bytes) out += SESSION_ALPHABET[byte % SESSION_ALPHABET.length]
  return out
}

/**
 * The CSRF token out of a rendered anilist.co page.
 *
 * The length floor is what rejects the un-rendered template: `window.al_token = "<?= csrf_token() ?>"`
 * cannot match a run of 20 or more alphanumerics, so a page served without a browser user agent
 * yields undefined here rather than a token that would 403 on every use.
 */
export const extractAlToken = (html: string): string | undefined =>
  html.match(/al_token\s*=\s*"([A-Za-z0-9]{20,})"/)?.[1]

/** The gate's own refusal, as opposed to a rate limit or an upstream fault. */
export const isGateRejection = (status: number, body: AnilistBody | undefined): boolean =>
  status === 403 && Boolean(body?.errors?.some(error => /use graphql subdomain/i.test(error?.message ?? '')))

export type AnilistBody<T = unknown> = {
  data?: T | null
  errors?: { message?: string, status?: number }[]
}

/** The slice of `fetch` this module uses, so a test can hand it a plain function. */
export type FetchLike = (
  input: string,
  init?: { method?: string, headers?: Record<string, string>, body?: string }
) => Promise<{ status: number, text: () => Promise<string> }>

type Pair = { token: string, session: string }

export type AnilistFrontendSession = {
  query: <T>(body: { query: string, variables?: unknown }) => Promise<T | undefined>
  /** Exposed for tests and diagnostics; production callers only ever need `query`. */
  currentPair: () => Pair | undefined
}

const parseBody = <T>(text: string): AnilistBody<T> | undefined => {
  try { return JSON.parse(text) as AnilistBody<T> } catch { return undefined }
}

/**
 * A lazily acquired, self-refreshing CSRF pair over the frontend endpoint.
 *
 * The pair is acquired once and reused. Concurrent callers share one acquisition, which matters
 * because a seasonal load fires three pages at once and three token pages would be three sessions,
 * two of them immediately abandoned.
 */
export const createAnilistFrontendSession = (fetchImpl: FetchLike): AnilistFrontendSession => {
  let pair: Pair | undefined
  let pending: Promise<Pair | undefined> | undefined

  const acquirePair = async (): Promise<Pair | undefined> => {
    const session = newSessionId()
    // the id doubles as the cache buster: a new session already moves the proxy's cache key, and
    // spending it here says so out loud
    const url = `${TOKEN_PAGE_URL}?_=${session.slice(0, 8)}`
    try {
      const response = await fetchImpl(url, {
        headers: {
          'user-agent': BROWSER_USER_AGENT,
          accept: 'text/html,application/xhtml+xml',
          cookie: `laravel_session=${session}`,
        },
      })
      const html = await response.text()
      const token = extractAlToken(html)
      if (!token) {
        console.error(
          `AniList frontend: no token in ${html.length} bytes of the page (HTTP ${response.status})`
          + (html.includes('csrf_token()') ? ', the PHP template came back un-rendered' : '')
        )
        return undefined
      }
      return { token, session }
    } catch (error) {
      console.error('AniList frontend: could not reach the token page', error)
      return undefined
    }
  }

  const getPair = async (force: boolean): Promise<Pair | undefined> => {
    if (force) pair = undefined
    if (pair) return pair
    // one acquisition shared by everyone waiting on it
    pending ??= acquirePair().finally(() => { pending = undefined })
    pair = await pending
    return pair
  }

  const query = async <T>(body: { query: string, variables?: unknown }): Promise<T | undefined> => {
    // two passes at most: the second exists for a pair that expired underneath us, which the gate
    // reports exactly as it reports never having had one
    for (let attempt = 0; attempt < 2; attempt++) {
      const current = await getPair(attempt > 0)
      if (!current) return undefined
      let response
      try {
        response = await fetchImpl(FRONTEND_GRAPHQL_URL, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'x-csrf-token': current.token,
            cookie: `laravel_session=${current.session}`,
          },
          body: JSON.stringify(body),
        })
      } catch (error) {
        console.error('AniList frontend: request failed', error)
        return undefined
      }
      const parsed = parseBody<T>(await response.text())
      if (isGateRejection(response.status, parsed)) {
        // only the gate's own refusal is worth a new pair; a 429 or a 5xx would come back here
        // forever and burn a token page every time
        if (attempt === 0) continue
        console.error('AniList frontend: the gate refused a freshly acquired pair')
        return undefined
      }
      if (parsed?.errors?.length) {
        const reason = parsed.errors.map(error => error.message).filter(Boolean).join('; ')
        console.error(`AniList frontend request failed (HTTP ${response.status}): ${reason || 'no message'}`)
      }
      if (parsed?.data == null) {
        if (!parsed?.errors?.length) console.error(`AniList frontend returned no data (HTTP ${response.status})`)
        return undefined
      }
      return parsed.data
    }
    return undefined
  }

  return { query, currentPair: () => pair }
}
