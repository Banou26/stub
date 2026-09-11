# The merge corpus

36 hand-decided cases about what a set of source rows MEANS: which of them describe one work, which
describe different works, which holds which, which two rows are one broadcast episode, and how many
episode rows the result may draw. Every case is a JSON file that names no function and imports
nothing from `src/`, so any store can be run against it by writing one adapter.

It exists because the store under `src/worker/store/` is being replaced. The four suites the cases
came from are the most expensive tests in the tree: their answers were decided by a person, from real
payloads, and written down with the reason. They are also the four that die with the old store,
because each of them drives `upsertMedia` / `aggregateMedia` / `resetStore` directly. The corpus is
those answers, lifted off the implementation that happened to hold them.

Thirty-two of the cases are those. The other four were written from the specification's walkthroughs
(`docs/src/content/docs/design/representation.md`, sections 8.1 to 8.4) and say the things a cluster
listing cannot: a season HOLDS two cours at episodes 1 to 11 and 12 to 23, Crunchyroll's 13 to 20 are
this run's 1 to 8, the special Netflix inserted at position 14 is nobody's episode, one run of 64 is
five Netflix seasons. Those four are what the format grew for, and what the season walk will be
labelled against.

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

### Containment, ranges and episode identity

Five more expectations, all optional, so none of the 32 original files changed. Each one is a
statement the specification's edge model (3.1 to 3.4) can make and `together` / `apart` cannot:

```jsonc
{
  "expect": {
    // the part's cluster is ATTACHED to the whole's cluster and never merged into it. Both halves are
    // asserted: a store that merges the two satisfies "attached" for free and has lost the distinction
    "partOf": [{ "part": "anilist:108465", "whole": "cr:G24H1N3MP-G609CX3J4" }],

    // the container holds the run, and with a range, WHICH of its episodes the run is: the container's
    // 12 to 23 are this run's 1 to 12. A containment with no correspondence is a partOf, never a
    // rangeless includes, so the two can never be read as each other
    "includes": [
      { "container": "cr:G24H1N3MP-G609CX3J4", "run": "anilist:127720",
        "range": { "fromStart": 12, "fromEnd": 23, "toStart": 1, "toEnd": 12 } }
    ],

    // two EPISODE rows that are one broadcast episode, and two that are not. The inserted special is
    // what the second exists for: it pairs with nothing, so every candidate is named
    "episodePairs": [{ "a": "cr:G24H1N3MP-G609CX3J4-e12", "b": "anizip:15954-e1" }],
    "episodeApart": [{ "a": "cr:G24H1N3MP-G609CX3J4-e24", "b": "anizip:15954-e12" }],

    // rows the implementation must neither merge nor attach, in either direction: a row that stays a
    // lone badge carrying its own url
    "unrelated": ["nf:80987039-1"]
  },
  // REQUIRED on any case carrying one of those five, optional on the 32, whose provenance is the test
  // file already in `source`. A case with one of them and no stamp fails validation
  "checked": { "by": "specification 8.1", "at": "2026-09-12", "notes": "where each row came from" },
  "pending": "new store"
}
```

**`pending` is how a case that is right today can wait for a store that can be asked.** Today's store
holds no `INCLUDES` at all and no episode identity that crosses a cluster, so a case carrying those
expectations would be red from the day it was written, and a red suite teaches people to skip it. A
case marked `pending` has `together` and `apart` asserted exactly as any other, and every other
expectation printed as a waiting list instead of failed, naming what the store actually answered. It
is NOT a `knownGap`: a gap says the expectation is wrong and the case is what changes, pending says
the expectation is right and the question cannot be put yet. When the adapter for the new store
lands, delete the line and the case asserts the rest; if the expectations are already met the harness
says so on every run, so nothing has to remember to check.

Two more optional fields carry the season walk, which is what the format grew for. A row may carry
`raw`, the source's answer as recorded, beside the store-shaped fields rather than instead of them:
`scripts/walk-season-answers.mjs` writes one `answers.jsonl` row per answer
(`{key, seq, uri, origin, kind, operation, selection, raw}`), and those rows are the intended source
of it. A case built from the walk names in `source.answers` the `key` of every answer row it was built
from, so the raw answers behind it can be found again without rerunning the walk.

## Running it

```ts
import { currentStore } from '../../../corpus/adapters/current-store'
import { runCorpus } from '../../../corpus/run'

runCorpus(currentStore)
```

An implementation satisfies seven methods and nothing more, none of which names a mechanism:

```ts
type CorpusStore = {
  reset(): Promise<void>
  upsert(rows, claims, episodes?): Promise<void>
  clusters(): Promise<string[][]>   // every cluster, as its member uris, singletons included
  episodesOf(uri: string): Promise<number>   // distinct episode numbers the cluster would draw
  containersOf(uri: string): Promise<string[]>            // the wholes this row's cluster is a part of
  includesOf(uri: string): Promise<{ container, run, range? }[]>   // every INCLUDES naming this uri
  episodePairsOf(episodeUri: string): Promise<string[]>   // the rows drawn as the SAME episode
}
```

`upsert` takes the whole case in one call and returns once the store has settled, including any pass
the app would run before a page is built. `adapters/current-store.ts` does that by driving
`fuzzyMergeMediaClusters` to convergence, the way `merge-fixtures.test.ts:75-80` does.

**A store that lacks one of those concepts returns an empty result and never throws.** An empty
answer reads as "this store cannot hold that fact", which is what `pending` is for; a throw is a
broken adapter, and the two must not look alike. Today's adapter is honest about three gaps, which is
why three of the four new cases are pending:

- `containersOf` is `findPartOfMedia`, which is the whole of containment in this store: one directed
  `PART_OF` edge per pair, no range, no per-episode consequence. It drops a target that ended up
  inside the asking cluster, so a run welded to its own container reports no container at all.
- `includesOf` is **always empty. This store has no `INCLUDES`.** `consensus.ts` aligns a folded
  season's episode numbers at read time to decide what a run may draw and throws the alignment away,
  so no edge survives the call and there is nothing to report even rangeless.
- `episodePairsOf` answers with `findAggregatedEpisodesForMedia`, which is an explicit
  `EPISODE_SAME_AS` handle (nothing first-party emits one, `db.ts:460`) plus `mergeByEpisodeNumber`,
  keyed on the NUMBER alone inside one run cluster. So two rows pair when they share a number in one
  cluster and never otherwise: nothing pairs across a container boundary, and a renumbering pairs
  nothing at all.

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
| `docs/src/content/docs/design/representation.md` sections 8.1 to 8.4 | 4 |

Those four files are NOT deleted and are not changed. They stay until the migration retires them, and
until then the corpus and the originals check the same store two ways.

The four from the specification are the ones that carry a `checked` stamp, and each one says in its
`notes` exactly which uris and numbers are the record's and which are not:

| case | what it states | today |
| --- | --- | --- |
| `mushoku-one-crunchyroll-season-holds-two-cours` | 8.1: one Crunchyroll season of 24 holds an 11 episode cour at 1..11 and a 12 episode cour at 12..23, with 23 episode pairs, a special that pairs with nothing, and a Netflix season that relates to nothing | pending: the store has no `INCLUDES`, and it welds the season into cour 1 rather than attaching it |
| `elusive-samurai-thirteen-to-twenty-are-one-to-eight` | 8.2: Crunchyroll continues its own count, so its 13 to 20 are this run's 1 to 8 on the same days | pending: nothing pairs episodes across a renumbering |
| `blue-exorcist-the-inserted-special-pairs-with-nothing` | 8.3: 26 Netflix rows for a 25 episode run, position 14 an inserted special, so no shift maps one onto the other and position 14 is nobody's episode | asserted |
| `fullmetal-alchemist-five-netflix-seasons-hold-one-run` | 8.4: one run of 64 is five Netflix seasons, each a part of it and none of them it | asserted |

Their rows are the record's own wherever the record has them: the Mushoku and Elusive Samurai rows,
claims and episodes are copied out of the corpus's existing case files, which took them from
`merge-fixtures.ts` and from `dist-seed/snapshots.jsonl`. Where the record names no id it says so
rather than inventing one, and these cases carry the placeholder uris the record itself writes
(`anilist:<Blue Exorcist>`, `nf:<fma>`) instead of a plausible looking number nobody can check.

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
at a time, and restored exactly after each. All five were caught. Test counts are out of the 100 the
suite held that day: 32 cases in file order, 32 reversed, 32 order-independence checks, 3
`episodeRows` checks and 1 format check. The four cases below took it to 116, adding 4 more of each of
the first three plus one containment and episode identity check each.

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

## Controlling the four new cases, 2026-09-12

The sweep above is a sweep over the STORE, and it was not re-run for the four cases from the
specification, because it could not say anything about them: three are pending, and the fourth,
Blue Exorcist, asserts that a set of episode rows stay apart in a store that has no way of putting
them together. Both of those pass under every mutation in the table for the same reason they pass
unmutated. So the new checks were controlled where they can actually be reddened, and here is exactly
what that covers:

- **The adapter, mutated.** `containersOf` made to return `[]` turned
  `fullmetal-alchemist-five-netflix-seasons-hold-one-run` red with 22 failures (11 containments, both
  arrival orders) and nothing else. Restored exactly after.
- **`episodePairsOf` mutated to return the whole cluster's episodes reddened NOTHING**, which is the
  finding rather than a miss: today's store cannot pair two rows that sit in different clusters, so
  the `episodeApart` lines in the Blue Exorcist case are true today for a reason narrower than the one
  they will be true for later. They are kept because they are right and because the new store can
  fail them, and the check itself is controlled below instead.
- **The harness, against a stub store** (`tests/unit/worker/corpus/relation-checks.test.ts`). Every
  line the containment and episode checks can print is produced there by a store that answers wrongly
  on purpose: `PART_OF`, `PART_OF MERGED`, `INCLUDES`, `INCLUDES RANGE` (a wrong range and a missing
  one), `EPISODE_PAIR` in both directions, `EPISODE_WELD`, and all four ways `UNRELATED` breaks. A
  store that agrees produces none of them, which is the control on the control.
- **The format, against itself** (`tests/unit/worker/corpus/validate-case.test.ts`). One passing case
  per new expectation, then one failing case per rule, each asserting the message: a uri no row
  describes, an episode no episode row describes, a range that runs backwards, a range whose two sides
  are different lengths, a new expectation with no `checked` stamp (all five kinds), a stamp whose day
  is not `YYYY-MM-DD`, and an unknown key at each of the seven places one can be typed.
