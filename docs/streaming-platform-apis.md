# Streaming platform data-source research (2026-06-01)

> Auto-generated from a research sweep (yt-dlp/streamlink/devtools/TMDB) to plumb per-platform source extractors. Endpoints are undocumented internal APIs unless noted; treat as best-effort starting points.

I have everything I need to ground the plan in stub's real conventions. Here is the synthesized plan.

---

# Per-platform extractors for stub: actionable plan

## 1. Bottom line

**TMDB should be the shared metadata/episode backbone.** None of the eight target platforms (Disney+, Prime Video, Apple TV+, Hulu, Max, Peacock, Paramount+, Fubo) offers an *anonymous* public content API; every native API is either login-walled (Disney+, Prime, Hulu, Fubo), HMAC/geo-gated (Peacock, Max), or DRM-blocklisted by yt-dlp (Max, Peacock). Only **three** have anonymous, usable internal endpoints reachable from stub's worker through the FKN proxy: **Apple TV+** (full search+episodes, no token), **Paramount+** (episode-list XHR + a hardcoded yt-dlp `at` token, no search, US-geo), and **Max** (anonymous client-credentials token for metadata/episodes only, no search, US-geo). Everything else collapses to the pattern stub already runs: **TMDB for search + season/episode lists, JustWatch (already wired) for the where-to-watch deep link** — the native APIs add nothing an anonymous worker can reach. So the realistic shape is **one shared `tmdb` source as the spine, plus a thin per-origin availability/deep-link resolver**, with native extractors built *only* for Apple TV+ (now), Paramount+ (now, behind US egress), and Max (optional enrichment).

## 2. Per-platform table

| Platform | Best anonymous data source | Search? | Episodes? | Auth needed | Reliability | yt-dlp / ref link |
|---|---|---|---|---|---|---|
| **Apple TV+** (`appletv`) | `uts-api.itunes.apple.com/uts/v3` (native, anonymous) | ✅ native (`searchTerm`) | ✅ native (per-season) | **None** | Fragile (`v=58` drifts) | No yt-dlp extractor (DRM); [quacksire UTS route gist](https://gist.github.com/quacksire/6d42a9eaed6a216584b54b082061765c) |
| **Paramount+** (`paramount`) | `paramountplus.com/.../xhr/episodes` (native) + TMDB/JW for search | ⚠️ TMDB/JW only | ✅ native XHR | None (hardcoded `at` token) — **US egress** | Stable (episodes); search via TMDB | [yt-dlp paramountplus.py (Debian mirror)](https://salsa.debian.org/debian/yt-dlp/-/raw/master/yt_dlp/extractor/paramountplus.py) |
| **Max / HBO** (`hbo`) | TMDB (search+eps); `comet.api.hbo.com` native eps optional | ⚠️ TMDB only | ✅ TMDB (native optional) | Anon token for native — **US egress** | Stable (TMDB); native fragile/geo | No yt-dlp (DRM, [#3145 wontfix](https://github.com/yt-dlp/yt-dlp/issues/3145)); [EnthusiastAnon config.py](https://github.com/EnthusiastAnon/HBO-MAX-BLIM-TV-Paramount-4k-Downloader) |
| **Disney+** (`disney`) | TMDB (search+eps) + JustWatch (deep link) | ⚠️ TMDB only | ✅ TMDB | TMDB key only (native needs login) | Stable (TMDB) | No global yt-dlp extractor (only Hotstar); [pydisney](https://github.com/pam-param-pam/Disney-Plus-api-wrapper) |
| **Prime Video** (`amazon`) | TMDB (search+eps) + JustWatch (deep link + imdbId) | ⚠️ TMDB only | ✅ TMDB | TMDB key only (native needs login+cookies) | Stable (TMDB) | Only `amazonminitv.py` (India MiniTV, ≠ Prime); [Sandmann79 Kodi](https://github.com/Sandmann79/xbmc) |
| **Hulu** (`hulu`) | TMDB (search+eps) + JustWatch (deep link) | ⚠️ TMDB only | ✅ TMDB | TMDB key only (native needs login+US) | Stable (TMDB) | No yt-dlp/streamlink extractor; [babbling api.ts](https://github.com/dhleong/babbling/blob/main/src/apps/hulu/api.ts) |
| **Peacock** (`peacock`) | TMDB (search+eps) + JustWatch (deep link) | ⚠️ TMDB only | ✅ TMDB | TMDB key only (native needs HMAC+login+US) | Stable (TMDB) | yt-dlp [KnownDRM blocklist](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/unsupported.py); [154.pages.dev/media/peacock](https://pkg.go.dev/154.pages.dev/media/peacock) |
| **Fubo** (`fubo`) | TMDB (search+eps) + JustWatch (deep link) | ⚠️ TMDB only | ✅ TMDB (no Fubo native eps exist) | TMDB key only (native = live/EPG, login+US, blocks datacenter IPs) | Stable (TMDB) | No content extractor (AdobePass MSO only); [eracknaphobia Kodi](https://github.com/eracknaphobia/plugin.video.fubotv) |

Provider IDs for `/watch/providers` filtering: Disney+ **337**, Prime Video **9** (buy/rent **119**), Apple TV+ **2**, Hulu **15**, Max **1899** (legacy 384), Peacock **386**/**387**, Paramount+ read live from `/3/watch/providers/tv` (network 4330), Fubo **257**.

## 3. Recommended architecture — opinionated

**Add one shared `src/sources/tmdb/extractor.ts` as the metadata spine, plus thin per-origin availability/deep-link resolvers. Do NOT build eight independent full extractors.** This is the clear winner, and it's the *same* split stub already ships:

- **JustWatch precedent**: `src/sources/justwatch/extractor.ts` already does where-to-watch for all eight (`PACKAGE_ORIGIN_MAP` at line 24: `hlu→hulu, hbm→hbo, pcp→peacock, pmp→paramount, fuv→fubo`, plus `dnp→disney, amp→amazon, atp→appletv`), and `extractContentId` (line 39) already parses `disneyplus.com`, `tv.apple.com`, `peacocktv.com`, `paramountplus.com`, `amazon.*`, `hulu.com`, `netflix.com`. So **deep links already flow today** for most of these.
- **UNOGS precedent**: `unogs/extractor.ts` is the exact template — `metadataOnly = true`, `official = false`, `SCORE = 0.2`, the `makeMedia`/`makeEpisode`/`desc`/`img`/`buildHandlesFromUri`/`waitForMedia` helpers from `../utils`, in-flight dedup map, and the `Subscription.media` / `Subscription.mediaPage` / `Media.episodes` resolver triad.

Building eight separate native extractors would mean eight login flows, six geo-locks, three HMAC/token schemes that rotate, and yt-dlp gives you a copyable endpoint map for *none* of the eight. That's pure maintenance debt for data TMDB already serves cleanly and legally. The correct shape:

```
TMDB extractor (origin 'tmdb')        ← search + series/season/episode metadata (the spine)
   │  /search/tv, /search/multi
   │  /tv/{id}?append_to_response=watch/providers
   │  /tv/{id}/season/{n}
   ▼
JustWatch (already wired)             ← per-title platform deep link (standardWebURL)
   │  PACKAGE_ORIGIN_MAP → origin handles, extractContentId → content id
   ▼
union-find aggregation merges TMDB media + JustWatch 'disney'/'amazon'/… handles
   ▼
Native extractors (appletv now, paramount now/US, hbo optional/US)
                                      ← only where an anonymous endpoint gives
                                        richer episode ids/stills than TMDB
```

Each per-platform origin stays a `metadataOnly`, link-out source. Availability comes from `watch/providers` (provider-id filter) **or** the JustWatch offer; the deep link comes from JustWatch's `standardWebURL`; metadata+episodes come from TMDB unless a native anonymous endpoint exists. **Wire `watch/providers` via `append_to_response=watch/providers` on the `/tv/{id}` call** so "search → episodes → which platforms" is 2 HTTP calls + 1/season. Keep the TMDB key server-side (inject in the FKN proxy / `TMDB_API_KEY` env), never client-side — TMDB rate-limits per IP, so cache aggressively in the proxy R2/LRU since all users share the proxy's IP budget.

## 4. Per-platform "how to wire it"

**Plumb a real native API now (2):**

- **Apple TV+ (`appletv`) — plumb now.** New `src/sources/appletv/extractor.ts`, copy `unogs/extractor.ts` structure but **delete the `getToken` machinery** (no token). Base `const ATV = 'https://uts-api.itunes.apple.com/uts/v3'`, shared params `sf=143441&locale=en-US&pfm=web&v=58&utsk=0&caller=web` (US). Endpoints (all anonymous GET via `ctx.fetch`, verified HTTP 200):
  - Search: `/search?…&searchTerm=<q>` — param **must** be `searchTerm` (`term`/`q` return `{data:{}}`); parse `data.canvas.shelves[].items[]`, keep `type==='Show'||'Movie'`.
  - Detail: `/shows/{id}` → `data.content` + `data.seasons` (dict). Episodes: `/shows/{id}/episodes?…&selectedSeasonId=<id>` per season (default returns only first 6 of `totalEpisodeCount`; `nextToken` is rejected — loop `selectedSeasonId` and filter `ep.seasonNumber`).
  - URL/deep link: `item.url` is the canonical `tv.apple.com/...` link. Images: substitute the mzstatic `{w}x{h}.{f}` template (e.g. `600x900.jpg`), preserving any `sr`/`cc` crop suffix. `releaseDate` is epoch ms. Register `export * as appletv from './appletv/extractor'` in `index.ts`.

- **Paramount+ (`paramount`) — plumb episodes now (US egress), search via TMDB/JW.** New `src/sources/paramount/extractor.ts`. Native episode/season list (anonymous, but US-geo — route through FKN proxy with US egress): `GET https://www.paramountplus.com/shows/{slug}/xhr/episodes/page/0/size/100000/xs/0/season/0/` → `result.data[]`, each `{content_id, url (relative), title, episode_num, season_num, thumbnail}`; watch URL = `'https://www.paramountplus.com' + item.url`. `size/100000` pulls the whole series, no pagination. The `{slug}` comes from the JustWatch-resolved `paramountplus.com/shows/{slug}` URL (`extractContentId` already returns `parts[1]` for `paramountplus.com`). **No native search** — delegate `mediaPage.subscribe` to TMDB/JustWatch. Optional per-episode enrichment: `apps-api/v2.0/androidtv/video/cid/{content_id}.json?locale=en-us&at=ABCqWNNSwhIqINWIIAG+DFzcFUvF8/vcN6cNyXFFfNzWAIvXuoVgX+fK4naOC7V8MLI=` (hardcoded yt-dlp token; skip — the XHR already has title+thumbnail).

**Scaffold + TODO (5) — back with TMDB+JustWatch, no native code:**

- **Disney+ (`disney`)**, **Prime Video (`amazon`)**, **Hulu (`hulu`)**, **Peacock (`peacock`)**, **Fubo (`fubo`)** — all the same: **no anonymous native API**. Wire each origin as a `metadataOnly` link-out backed by the shared `tmdb` source for search+episodes and JustWatch for the deep link. Their `PACKAGE_ORIGIN_MAP` entries and `extractContentId` host branches already exist (except Fubo — see below). For each, the resolver path is: TMDB `/search/tv` → `/tv/{id}?append_to_response=watch/providers` (filter to the provider id) → `/tv/{id}/season/{n}` for episodes, then attach the JustWatch `standardWebURL` as the watch URL via the existing union-find handle merge.
  - **Disney+/Prime/Hulu/Peacock native = TODO behind login/extension.** Each *has* a richer native API but all require account login (Disney+ BAMGRID device-grant + email/password + `switchProfile`; Prime atv-ps cookies + device reg; Hulu logged-in `discover.hulu.com` cookies + US; Peacock `x-skyott-*` + HMAC `x-sky-signature` + login + US). Scaffold a `// TODO: native … behind web-extension session tunnel + FKN permission system` and stop there for R1.
  - **Fubo = link-out only, permanently.** Fubo has **no VOD search/episode API at all** (yt-dlp = AdobePass MSO login only; streamlink = none; Kodi addon = live channels/EPG only) and **hard-blocks datacenter/VPN/proxy IPs** — stub's cloud proxy physically can't reach `api.fubo.tv` (redirects to `/unavailable/`). Keep `fubo` purely as a JustWatch availability badge + TMDB metadata. One small gap to optionally close: `extractContentId` in `justwatch/extractor.ts` has **no `fubo.tv` branch**, so the Fubo handle currently has no stable content id — add a `host === 'fubo.tv'` case returning the series-slug segment if you want a resolvable handle (pattern `fubo.tv/welcome/series/<id>/<slug>`).

- **Max / HBO (`hbo`) — scaffold now, native episodes are an optional US-egress enrichment.** Default it to the TMDB+JustWatch path (provider id **1899**). Two cheap wins available: (1) add a `max.com`/`play.max.com` branch to `extractContentId` so the existing JustWatch offer emits an `hbo` handle with a real deep link (today there's no `max.com` case, so no content id is extracted); (2) optionally, behind US egress, mint an **anonymous** token `POST https://comet.api.hbo.com/auth/tokens` (`client_id/secret 24fa5e36-3dc4-4ed0-b3f1-29909271b63d`, `grant_type:client_credentials`, `scope:'browse video_playback_free'`) then `POST https://comet.api.hbo.com/content` with `[{"id":"urn:hbo:series:<id>"}]` for native season/episode URNs — metadata works anonymously, only DRM playback needs login. Treat the hardcoded `client_id`/Hadron headers as a maintenance liability; this is enrichment, not the search path.

## 5. Legal / ToS reality check

These are all **undocumented internal/app endpoints, not licensed public APIs**, and consuming them is contrary to each platform's ToS — but it's the *same* grey-area posture stub already runs with its anonymous UNOGS token, anonymous JustWatch GraphQL, and Crunchyroll anonymous `client_id` grant, so this introduces no new category of exposure. The plan deliberately keeps it as conservative as that precedent: **TMDB is a sanctioned free API** (requires attribution, non-commercial, per-IP rate-limited — read-only metadata, the clean/legal core); **JustWatch is anonymous where-to-watch already in the tree**; the only native calls added (Apple UTS, Paramount+ XHR, optional Max anonymous token) are **read-only metadata fetched without any user credentials or DRM circumvention** — playback stays out of scope and is handled separately by linking out or tunneling the **user's own logged-in session** through the web-extension (the user accesses their own account, not a shared one). Crucially, **no native path here requires shipping or sharing platform login credentials** — the five login-gated platforms are explicitly scaffolded as TODO behind the user-consented extension session + FKN permission system rather than embedding service credentials. Worth stating plainly in the source/PR: each origin is `official = false`, metadata-only, link-out; this is acceptable for the showcase but should never be marketed as official platform integration.

Grounding refs in-tree: template `/home/banou/dev/stub/src/sources/unogs/extractor.ts`; deep-link/availability map `/home/banou/dev/stub/src/sources/justwatch/extractor.ts` (`PACKAGE_ORIGIN_MAP` L24, `extractContentId` L39); origin registry `/home/banou/dev/stub/src/sources/streaming-platforms.ts`; source barrel `/home/banou/dev/stub/src/sources/index.ts` (add `tmdb`, `appletv`, `paramount`).

---

## TMDB backbone notes

I now have all the verified facts I need. The endpoints, auth model (confirmed by the live 401), rate limits, image base URLs, and field structures are all confirmed from official TMDB sources. Here is the report.

---

# TMDB API as a cross-platform metadata + episode + availability backbone

**Docs root:** https://developer.themoviedb.org/docs · **API reference:** https://developer.themoviedb.org/reference/intro/getting-started · **API base:** `https://api.themoviedb.org/3`

Verified live: a keyless call to `https://api.themoviedb.org/3/configuration` returns **HTTP 401**, confirming auth is mandatory on every request.

## Auth (free, two interchangeable schemes)

TMDB issues credentials free after creating an account and requesting an API key. You get **two tokens that authenticate the same v3 endpoints** — pick one:

- **v3 API key** — append `?api_key=<KEY>` as a query param. Classic, simplest.
- **v4 Bearer token (read access token)** — send header `Authorization: Bearer <TOKEN>`. This is the recommended modern style; it hits the *same* `/3/...` endpoints (the "v4" name refers to the token format, not a different URL path). The separate `/4/...` endpoints exist only for user-list/account features you don't need here.

Both are free for this read-only metadata use. Getting started: https://developer.themoviedb.org/docs/getting-started

## Rate limits

- Legacy hard limit (40 req / 10 s) was **disabled in Dec 2019**. Current practical ceiling is **~50 requests/second** with ~20 connections per IP; the published "abuse mitigation" threshold sits "around 40 req/s" and is intentionally vague.
- **Limiting is per-IP, not per-key.** Over-limit returns **HTTP 429** (respect `Retry-After`).
- **No documented daily cap.** Docs: https://developer.themoviedb.org/docs/rate-limiting

Practical note for your architecture: since limits are per-IP, routing TMDB calls through fkn/proxy means all users share one IP's budget — cache aggressively (TMDB data changes slowly; the proxy's R2/LRU cache is a good fit).

## Image base URLs

Base: `https://image.tmdb.org/t/p/`. Build a URL as `{base}{size}{file_path}`, e.g. `https://image.tmdb.org/t/p/w500/1E5baAaEse26fej7uHcjOgEE2t2.jpg`. The authoritative `secure_base_url` and size lists come from `GET /3/configuration` (cache it; it rarely changes). Stable size buckets:

- **still_sizes** (episode stills): `w92, w185, w300, original`
- **poster_sizes**: `w92, w154, w185, w342, w500, w780, original`
- **backdrop_sizes**: `w300, w780, w1280, original`
- **logo_sizes** (provider/network logos): `w45, w92, w154, w185, w300, w500, original` — provider logos are PNG; use `original` for SVG network logos.

Docs: https://developer.themoviedb.org/docs/image-basics

## Search endpoints

**`GET /3/search/multi`** — one call across movies + TV + people. Each result carries a **`media_type`** discriminator (`"tv"` / `"movie"` / `"person"`) so you can branch. Params: `query` (required), `page`, `language`, `include_adult`.
`https://api.themoviedb.org/3/search/multi?query=Severance`
Docs: https://developer.themoviedb.org/reference/search-multi

**`GET /3/search/tv`** — TV-only, matches original/translated/AKA names. Params: `query` (required), `first_air_date_year`, `year`, `page`, `language`, `include_adult`. Use this over `/search/multi` when you already know the title is a show — fewer false matches.
`https://api.themoviedb.org/3/search/tv?query=Severance&first_air_date_year=2022`
Docs: https://developer.themoviedb.org/reference/search-tv

Both return `results[]` with `id` (the `series_id` you carry forward), `name`, `overview`, `poster_path`, `backdrop_path`, `first_air_date`, `vote_average`.

## Season + episode lists

**`GET /3/tv/{series_id}/season/{season_number}`** — returns the full episode list for one season. Path params: `series_id`, `season_number` (0 = specials). Query: `language`, `append_to_response` (chain up to 20 sub-endpoints, e.g. `?append_to_response=credits,videos,images`).

The response has an **`episodes[]`** array; each episode object contains exactly the fields you need:
`episode_number`, `name`, `overview`, `still_path`, `air_date`, `runtime`, `episode_type`, `season_number`, `show_id`, `id`, `production_code`, `vote_average`, `vote_count`, plus `crew[]` and `guest_stars[]`. (`still_path` may be `null`.)
`https://api.themoviedb.org/3/tv/95396/season/1`
Docs: https://developer.themoviedb.org/reference/tv-season-details

To discover *which* seasons exist first, call **`GET /3/tv/{series_id}`** (TV Series Details) — its `seasons[]` array lists each season's `season_number`, `episode_count`, `name`, `air_date`, `poster_path`. Docs: https://developer.themoviedb.org/reference/tv-series-details

## Watch providers (JustWatch-powered)

**`GET /3/tv/{series_id}/watch/providers`** — "availabilities per country by provider," **powered by TMDB's JustWatch partnership** (TMDB refreshes it daily; their terms require displaying a JustWatch attribution/link). Response shape:

```
{
  "id": 95396,
  "results": {
    "US": {
      "link": "https://www.themoviedb.org/tv/95396/watch?locale=US",
      "flatrate": [ { "provider_id": 350, "provider_name": "Apple TV Plus",
                      "logo_path": "/...png", "display_priority": 5 } ],
      "rent": [ ... ],
      "buy":  [ ... ]
    },
    "GB": { ... }, "FR": { ... }
  }
}
```

Key facts:
- **Keyed by ISO-3166-1 region code** (`US`, `GB`, `FR`, …). Filter to the user's region client-side — the endpoint returns all regions at once and takes no region param.
- Monetization buckets: **`flatrate`** (subscription), **`free`**, **`ads`**, **`rent`**, **`buy`**. Not every bucket exists per region.
- Each provider entry: `provider_id`, `provider_name`, `logo_path`, `display_priority`.
- The `link` is a **TMDB watch page**, *not* a deep link into the platform. There is **no per-title deep link** to Netflix/Apple TV/etc. in this payload — that's the gap your extractors fill (see assessment).

Companion: **`GET /3/watch/providers/tv?watch_region=US`** lists all provider IDs/names for a region (use to map `provider_id` → your extractor). Docs: https://developer.themoviedb.org/reference/tv-series-watch-providers and https://developer.themoviedb.org/reference/watch-providers-tv-list

## Assessment: can TMDB be the single backbone for all platform extractors?

**Yes, for metadata + episode/season structure + "which platforms is it on" — this is exactly what TMDB is good at, and it cleanly decouples those concerns from per-platform extractors.** Concretely:

- **Metadata + season/episode lists are platform-agnostic and complete.** One `series_id` gives you titles, overviews, stills, air dates, and stable episode numbering for every show, regardless of where it streams. Your extractors no longer each scrape their own episode lists — they consume TMDB's.
- **`watch/providers` tells you *which* platforms carry a title, per region**, via JustWatch. So TMDB answers "search → episodes → which platforms" end-to-end. This lets each extractor be invoked only when TMDB says its platform (`provider_id`) actually has the title — no blind probing.

**The hard boundary TMDB does *not* cross — and this is precisely the residual job for each platform extractor:**

1. **No deep links / no platform-native IDs.** `watch/providers` gives a provider *name/id* and a TMDB watch page, never the Netflix title ID, Crunchyroll series slug, or an `apple-tv://` URL. Each extractor must **resolve TMDB title → platform-specific ID/URL** (its own search by title/year, or maintaining an ID map).
2. **No per-episode availability.** Providers are reported at the *title* level, not "is S2E04 on this platform." Extractors confirm episode-level presence + the playable stream/deep link.
3. **Provider data is coarse and region-lagged.** JustWatch is daily-batch and occasionally misses or mis-attributes a title (well-documented in TMDB forums). Treat it as a *strong hint to prioritize which extractors to try*, not ground truth — fall back to running the extractor's own search when providers look empty/stale.
4. **Anime/episode-numbering mismatches.** TMDB seasons sometimes don't line up with a platform's own season/part split (Crunchyroll especially). Your `seal-wasm`/`sacha` fuzzy-matching layer is still needed to bridge TMDB episode → platform episode.

**Net recommendation:** Use TMDB as the canonical spine — one `series_id` per show, TMDB episode list as the canonical episode set, `provider_id` set as the routing table for which extractors to fire. Reduce each platform extractor to two responsibilities: **(a) map TMDB title/episode → platform ID, (b) produce the playable deep link / stream URL.** This is a clean architecture and matches stub's existing "aggregate metadata, resolve playback separately" split — TMDB would replace the per-source metadata scraping with a single well-numbered backbone, while extractors shrink to availability+deep-link resolvers.

## Recommended call sequence: "search a show → get its episodes → know which platforms it's on"

```
1. (once, cached)  GET /3/configuration
                   → secure_base_url + still/poster/logo sizes for image URLs

2. SEARCH          GET /3/search/tv?query=<title>&first_air_date_year=<yr>
                   (or /search/multi, branch on media_type==="tv")
                   → results[0].id  ==> series_id

3. STRUCTURE       GET /3/tv/{series_id}?append_to_response=watch/providers
                   → seasons[] (each season_number + episode_count)
                   → AND watch/providers in the SAME response (append saves a call)

4. EPISODES        for each season_number:
                   GET /3/tv/{series_id}/season/{season_number}
                   → episodes[]: episode_number, name, overview,
                     still_path, air_date, runtime

5. AVAILABILITY    (already fetched in step 3 via append_to_response)
                   results[<userRegion>].flatrate / rent / buy
                   → provider_id list  ==> route to matching extractors
```

Step 3's `append_to_response=watch/providers` folds details + providers into **one HTTP request**, so a full "search → know platforms" path is **2 calls** (search + details+providers), plus **1 call per season** for episode stills/titles. Append docs: https://developer.themoviedb.org/docs/append-to-response

**Sources:** [TMDB API reference](https://developer.themoviedb.org/reference/intro/getting-started) · [Rate limiting](https://developer.themoviedb.org/docs/rate-limiting) · [Image basics](https://developer.themoviedb.org/docs/image-basics) · [search/multi](https://developer.themoviedb.org/reference/search-multi) · [search/tv](https://developer.themoviedb.org/reference/search-tv) · [TV Season Details](https://developer.themoviedb.org/reference/tv-season-details) · [TV Series Watch Providers](https://developer.themoviedb.org/reference/tv-series-watch-providers) · [Getting Started / API key](https://developer.themoviedb.org/docs/getting-started)
