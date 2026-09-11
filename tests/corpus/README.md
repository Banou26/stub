# The merge corpus

32 hand-decided cases about what a set of source rows MEANS: which of them describe one work, which
describe different works, and how many episode rows the result may draw. Every case is a JSON file
that names no function and imports nothing from `src/`, so any store can be run against it by writing
one adapter.

It exists because the store under `src/worker/store/` is being replaced. The four suites the cases
came from are the most expensive tests in the tree: their answers were decided by a person, from real
payloads, and written down with the reason. They are also the four that die with the old store,
because each of them drives `upsertMedia` / `aggregateMedia` / `resetStore` directly. The corpus is
those answers, lifted off the implementation that happened to hold them.

## The rule, which is the whole point

An expected answer NEVER comes from running an implementation. `merge-fixtures.ts:11-17` states it and
this corpus inherits it verbatim:

> THE EXPECTED ANSWERS DO NOT COME FROM THE IMPLEMENTATION, and that is the whole point. If these
> were recorded by running the store and writing down what it did, the file would pin today's
> behaviour including today's bugs and go green forever. The Mushoku Tensei defect fixed in 50cea84
> would have been captured as correct. Every `together` and `apart` below is a claim about the WORKS,
> decided from what the shows are, with the reason written beside it. When the implementation
> disagrees with one of these, the implementation is what is wrong until someone argues otherwise
> here, in the `why`.

Two things follow, and both are load bearing.

**Every case carries `why`, in terms of the works.** Not in terms of a mechanism, a threshold or a
function. "Season 2 aired 2023 and season 3 in 2026, so they are two broadcast runs" is a reason.
"The year bucket refuses them" is not: it describes a store, and the next store will not have one.

**Both directions are required.** A corpus that only says what must merge is passed by an
implementation that merges everything; one that only says what must stay apart is passed by one that
merges nothing. `validateCase` refuses a file that asserts neither.

## The format

One file per case in `cases/`, validated against `types.ts` by
`tests/unit/worker/corpus/current-store.test.ts`. Unknown keys are rejected rather than ignored,
because a typo in an expectation key is a case that asserts nothing.

```jsonc
{
  "name": "the five Mushoku Tensei runs stay five",
  "source": {                       // where it was extracted from, so the two stay readable together
    "file": "tests/unit/worker/store/merge-fixtures.ts",
    "test": "the five Mushoku Tensei runs stay five"
  },
  "why": "These are five distinct broadcast runs: 2021-01, 2021-10, ...",
  "rows": [                         // store-shaped source rows, exactly as the source test feeds them
    {
      "uri": "anizip:14758",
      "origin": "anizip",
      "id": "14758",
      "type": "TV",
      "categories": ["ANIME", "SERIES"],
      "startDate": "2021-01-10T15:00:00Z",
      "episodeCount": 11,
      "score": 0.9,
      "titles": [{ "language": "en", "title": "Mushoku Tensei: Jobless Reincarnation", "score": 0.9 }]
      // an optional "scope": "RUN" | "CONTAINER" goes here. Absent means RUN, which is the default
      // the schema gives an absent scope, and it is spelled out only where the source test spelled it out
    }
  ],
  "claims": [                       // identity links a source really asserts; `relation` absent means SAME_AS
    { "mediaUri": "anizip:14758", "handleUri": "anilist:108465" }
  ],
  "episodes": [                     // optional, and only where the case is about what a cluster DRAWS
    {
      "uri": "anizip:14758-e1", "origin": "anizip", "id": "14758-e1",
      "mediaUri": "anizip:14758", "episodeNumber": 1,
      "releaseDate": "2021-01-10T15:00:00.000Z", "score": 0.9, "titles": []
    }
  ],
  "expect": {
    "together": [["anizip:14758", "kitsu:42323", "anilist:108465"]],  // each group is ONE cluster
    "apart": [["anizip:14758", "anizip:15954"]],                     // no two members share a cluster
    "episodeRows": { "clusterOf": "anilist:108465", "count": 11 },   // optional
    "knownGap": "..."                                                // optional, see below
  }
}
```

`rows` are the store-shaped rows the source test hands the store, not the fixture's own compressed
shape: where a case's rows came from a builder (`media(...)`, `RUN_OF(n)`, `handlesFor(...)`,
`allPairsAcross(...)`), the builder was evaluated and its output written out literally, so every file
stands on its own. Every uri, title, date and count is byte for byte what the source test carried.

`episodeRows` asks the question `together` and `apart` cannot. A cluster can be exactly right about
who it contains and still draw somebody else's episodes, because an episode arrives attached to
whichever media published it: Crunchyroll models a split cour as one season, so an 11 episode run held
a season of 23 and a special and drew all 24 rows. Nothing about the cluster's membership was wrong.

`knownGap` marks a case where `expect` states what the store DOES rather than what is right, and says
what the right answer is. There is exactly one, carried over from the test that pinned it the same
way. An implementation that closes the gap fails that case, and the CASE is what changes.

## Running it

```ts
import { currentStore } from '../../../corpus/adapters/current-store'
import { runCorpus } from '../../../corpus/run'

runCorpus(currentStore)
```

An implementation satisfies four methods and nothing more, none of which names a mechanism:

```ts
type CorpusStore = {
  reset(): Promise<void>
  upsert(rows, claims, episodes?): Promise<void>
  clusters(): Promise<string[][]>   // every cluster, as its member uris, singletons included
  episodesOf(uri: string): Promise<number>   // distinct episode numbers the cluster would draw
}
```

`upsert` takes the whole case in one call and returns once the store has settled, including any pass
the app would run before a page is built. `adapters/current-store.ts` does that by driving
`fuzzyMergeMediaClusters` to convergence, the way `merge-fixtures.test.ts:75-80` does.

**Every case runs TWICE**, once in file order and once with the rows, claims and episodes reversed,
and the two runs must produce the same clusters. Arrival order deciding an outcome is invariant I15
(`docs/design-inputs/01-edge-cases.md`), and it is not a separate suite because a store that gets a
case right in one order and wrong in the other has not got the case right. That check earns its keep:
mutation M1 below is caught by it in the order where the expectations still pass.

## Where the cases came from

| source | cases |
| --- | --- |
| `tests/unit/worker/store/merge-fixtures.ts` | 13 |
| `tests/unit/worker/store/season-separation.test.ts` | 15 |
| `tests/unit/worker/store/season-weld.test.ts` | 1 |
| `tests/unit/worker/store/mushoku-parts.test.ts` | 3 |

Those four files are NOT deleted and are not changed. They stay until the migration retires them, and
until then the corpus and the originals check the same store two ways.

Three things a `together` group can rest on, and all three are decisions about the works rather than
about a store:

1. the source test asserts it outright,
2. a SAME_AS claim in the case's own `claims` asserts it, which is a source saying two uris name one
   work,
3. the `why` argues it from what the shows are.

Most `apart` groups are the source test's own assertion. Where a source test asserted only that two
clusters do not overlap, the cross pairs were written out the way `merge-fixtures.ts` writes them
(`allPairsAcross`), which with the matching `together` groups is the same statement as the original
exact-membership assertion.

## What did not come across

Named because a gap nobody wrote down reads as coverage.

- **`season-weld.test.ts` also asserts PART_OF and the listing.** The original checks that each run
  still points at the series (`findPartOfMedia`) and that a listing shows the two runs and no card for
  the show (`hideAttachedContainers`). `CorpusStore` has no notion of either, so the corpus carries
  the cluster-membership half of that test and the original keeps the rest. Adding a fifth adapter
  method for it is a deliberate decision for whoever designs the replacement, not a detail to slip in.
- **`merge-fixtures.test.ts`'s self-contradiction sweep** (`clusterAnomalies` over every cluster) is
  not here. It needs no expected answer, so it is not corpus material: it is a rule that belongs
  wherever anomaly reporting lands.
- **Two cases pin a defect whose fix is at the SOURCE, and they carry no `knownGap`.**
  `a-member-carrying-another-seasons-date-widens-the-year-set` and
  `a-show-level-source-id-welds-two-season-clusters` both weld two seasons, and both are correct given
  their rows: one row lies about its own date, the other hands two seasons the same catalogue id. No
  merge rule can recover from either, which is why tvmaze, tmdb and Apple TV were each fixed where the
  id and the date are minted. Each case says so in its `why`, and each is paired with a control case
  that must stay apart.
- **`docs/design-inputs/04-consumers-and-tests.md` says `merge-fixtures.ts` holds 14 cases. It holds
  13.** `MERGE_CASES.length` is 13 at `cfd0f1f`. The corpus follows the file.

## The mutation run, 2026-09-12

A corpus that stays green under a broken store proves nothing, so the store was broken five ways, one
at a time, and restored exactly after each. All five were caught. Test counts are out of 100: 32 cases
in file order, 32 reversed, 32 order-independence checks, 3 `episodeRows` checks and 1 format check.

| # | the mutation | red |
| --- | --- | --- |
| M1 | `upsertMedia`'s scope ratchet removed, so a later RUN stamp flips a stored CONTAINER back (`db.ts:146`) | 2 |
| M2 | the fuzzy pass welds across scopes: its cross-scope branch unions instead of riding an edge, and `linkSameMediaPairs` stops refusing a CONTAINER (`fuzzy-merge.ts:659`, `db.ts:219`) | 2 |
| M3 | the start date window, 45 days to 400 (`fuzzy-merge.ts:46`) | 4 |
| M4 | the title similarity threshold, 0.9 to 0.3 (`fuzzy-merge.ts:7`) | 4 |
| M5 | `runEpisodes` stops trimming, so a folded season's whole list is drawn (`consensus.ts:157`) | 1 |

What each one caught, and why that case and not another:

- **M1** turned `the-live-mushoku-s1-s3-weld` red, which is the one case whose rows stamp the same uri
  CONTAINER three times and RUN once. Without the ratchet the last stamp wins, the crunchyroll series
  id becomes a RUN, and the claim `anilist:178789 SAME_AS cr:G24H1N3MP` unions season 3 into the show,
  which is the live weld this repo is named for. **It went red in file order and STAYED GREEN
  reversed**, because reversing the rows puts the RUN stamp first and a CONTAINER stamp after it. The
  expectations alone would have caught it once; the order-independence check caught it twice and named
  the reason.
- **M2** turned the same case red in both orders. Different mechanism, same defect: the title match
  between the run and the show becomes a union instead of an edge.
- **M3** turned `one-side-silent-on-the-season-six-months-apart` and
  `we-never-learn-held-apart-by-the-date-alone` red. Both are pairs inside one calendar year where the
  season ordinal is silent or absent on at least one side, so the days between the two premieres are
  the only thing left. We Never Learn is the sharper of the two: two of its title pairs score exactly
  1.0000, so the title axis actively says these are one show.
- **M4** turned `oshiri-tantei-first-of-month-premiere` and `two-shows-premiering-the-same-week` red.
  Oshiri Tantei has no usable day (season 2 premiered on a first of the month) and no readable season
  ordinal, so the title axis is carrying it alone. Grand Blue season 3 and Mushoku Tensei season 3
  start three days apart and are both somebody's "Season 3", so every date mechanism is silent there
  too. Those are exactly the two cases written to leave the title axis unaided.
- **M5** turned the `episodeRows` check on
  `run-lists-its-own-episodes-not-the-folded-season` red and nothing else, which is the point of that
  expectation existing: the cluster's membership is right in both states, so `together` and `apart`
  cannot see the difference. Untrimmed, the 11 episode run draws Crunchyroll's 24.

The HARNESS was controlled separately, because none of the five mutations exercises the `together`
direction: all of them weld things, so all of them fail through `WELD`. A throwaway case asserting
that Mushoku Tensei season 1 and season 3 are one cluster produced the `SPLIT` lines, one asserting
that two members of one cluster are apart produced `WELD`, and one asking for 999 episode rows
produced the `episodeRows` failure. All three paths can report a failure; the file was deleted after.

Re-run the sweep after adding cases. It is a `perl -pi` and a minute, and a case that no mutation can
redden is a case that is testing the harness.
