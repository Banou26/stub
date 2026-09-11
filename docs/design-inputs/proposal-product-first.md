# Proposal: product first

Stub's new internal representation: LadybugDB in the worker, source results kept as returned, every
merge decision a plugin that writes only its own stamped nodes and edges, and a read path that can
prove every pixel.

Citations name the input file and section: `00` is the engine facts, `01 case N` / `01 RN` / `01 IN`
are the catalogue, refutations and invariants, `02 section N` is the current store, `03 <source>` the
capability matrix, `04 section N` the consumers and tests. A rule marked **NEW** is not in the record
and names the case that motivates it.

## What the user sees, and where it goes wrong

The design starts from the five surfaces and the visible number on each:

| surface | what is drawn | the visible failure | record |
| --- | --- | --- | --- |
| the card | cover, title, `episodeCount`, popularity, one short description | three seasons on one card; a container card with no run; a hybrid card (title from one source, description from another season) | 01 cases 1, 2, 3, 6, 20, 49 |
| the detail page | titles, descriptions, covers, franchise, relations, origin badges, episode list | a welded cluster; a badge missing because a link was refused; a show page with no episodes | 01 cases 1, 42, 49, I2 |
| the episode list, play buttons per platform | one row per episode, up to five source buttons, SAME_AS handles only | **24 rows on a 14 episode run**; 20 rows on a 12 episode run; 13 of 25 rows with a playable but WRONG Netflix url; two full lists of the same twelve; Crunchyroll vanishing rather than being wrong | 01 I10, case 13, case 15 and R1, case 19, case 13's cost |
| the folded season | Netflix season 1 holds cours 1 and 2 | the run refused outright, its offers lost; or accepted and 24 rows drawn | 01 case 9, case 12, I6 |
| the show level id | one Crunchyroll series url on three Kitsu season records | Mushoku Tensei seasons 1, 2 and 3 as one component | 01 case 1, case 5 |
| the 13 versus 12 run | AniList says 13, MAL says nothing, the run aired 12 | a lent season's 24 rows on a 12 episode page | 01 I9 |

The read path guarantees, from which everything below is derived:

- **G1, nothing wrong is ever shown, missing is acceptable.** A row, a button or a field is drawn only
  when an edge path the read is allowed to walk backs it. A refusal renders as absence (01 I2).
- **G2, every shown fact is traceable.** Each field names the source row and the answer it came from,
  each plugin edge names its plugin, its reason and the edges it was derived from, so "why is this
  here" is a query, never a guess (01 I5, case 20).
- **G3, the same graph renders the same page.** No read depends on arrival order and no read writes
  (01 I15; 02 section 2.6).
- **G4, ids are stable while a cluster grows** (04 section 6 contract 1).
- **G5, a page is one or two queries, never a recursion per row** (00 read costs).

---

## 1. Principles

1. **Missing beats wrong, and a refusal is a fact, not silence.** A row, a button or a field is drawn
   only when an allowed edge path backs it, and every refusal is written down with its reason so an
   absent Netflix button can be told apart from an unasked one (01 I2, case 6, case 13's cost).
2. **Nothing is irreversible.** Sources write rows and claims, plugins write only edges and nodes
   stamped with their own identity, and every merge is a deletable edge recomputed from evidence, so
   the fix for a wrong weld is never a reload (01 I1; 02 section 5.2).
3. **One chokepoint for sameness.** Every SAME_AS that can reach a cluster, whether a source handle,
   a similar-media answer or a title match, passes the same guard set in the same place (01 case 2,
   case 7).
4. **Unknown is a third state.** Scope, date precision, count kind and season ordinal are evidence
   with an explicit "not stated", never a default, so a silent side is never read as agreeing and a
   missing count is never zero (01 cases 23, 26, 33, I3 as a view).
5. **Sameness closes over SAME_AS within one scope and nothing else.** PART_OF and INCLUDES are
   walked one hop, in a declared direction, and never inside the closure (owner's rule; 01 case 18,
   I14; 02 section 2.1).
6. **Episode identity lives on per-episode edges carrying their evidence, never on arithmetic.** A
   range edge scopes a search and labels a container; it never places a play button (01 R1, R20,
   case 15).
7. **Every fact names its row and its rule.** Per-field provenance on the aggregate, `by`, `reason`
   and `supports` on every plugin edge, the source's answer kept byte for byte (01 I5; 02 section 5.1).
8. **Determinism by construction.** Plugins compute from sorted inputs and materialize their output;
   reads mint nothing; arrival order decides nothing (01 I15, cases 30, 48; 02 section 2.6).

---

## 2. Graph schema

One label per node, rel tables may span several FROM/TO pairs, JSON is native, `DELETE` on edges
selected by a property works (00 supported). No persistence: the graph lives for the worker's
lifetime, as today (02 section 1).

### 2.1 Source tables: written by the ingest only

```cypher
CREATE NODE TABLE Origin(
  id STRING PRIMARY KEY,
  raw JSON,                 -- the Origin row as the resolver returned it
  seq INT64                 -- ingest sequence of the last write
)

CREATE NODE TABLE Media(
  uri STRING PRIMARY KEY,
  origin STRING,            -- 'mal', 'cr', 'nf' ... the ORIGIN, not the module (03 section 1)
  id STRING,
  owned BOOLEAN,            -- true once the origin's own resolver described this uri; false = placeholder
  scope STRING,             -- the owner's LAST word (RUN, CONTAINER, NULL). The ratchet is a view, not this column
  raw JSON,                 -- the owner's row, field-wise union of its answers (section 4.3); NULL on a placeholder
  score DOUBLE,             -- verbatim projections of raw, so a WHERE clause can read them; no coercion, no default
  episodeCount INT64, startDate STRING, endDate STRING, type STRING, status STRING,
  season STRING, seasonYear INT64, titles JSON, categories STRING[],
  fieldSeq MAP(STRING, INT64),  -- field name -> Answer.seq that supplied the current value
  seq INT64
)

CREATE NODE TABLE Episode(
  uri STRING PRIMARY KEY,
  origin STRING, id STRING,
  mediaUri STRING,          -- the uri the source hung it on, as returned
  raw JSON,
  episodeNumber INT64, seasonNumber INT64, absoluteEpisodeNumber INT64,   -- in the SOURCE's numbering space (01 case 14)
  releaseDate STRING,       -- as returned: an instant or a named day (01 case 38); the profile derives the day
  titles JSON,
  fieldSeq MAP(STRING, INT64),
  seq INT64
)

CREATE NODE TABLE Answer(
  seq INT64 PRIMARY KEY,    -- ingest sequence, monotonic
  uri STRING, origin STRING,
  kind STRING,              -- 'media' | 'episode' | 'origin'
  operation STRING,         -- the app document that triggered the resolve: 'MEDIA' | 'MEDIA_PAGE' | 'SIMILAR'
  selection STRING[],       -- the field names the resolver actually returned (a partial answer is visible as such, 01 I5.3)
  raw JSON,                 -- the resolver's return value, byte for byte, handles and episodes included
  at TIMESTAMP DEFAULT current_timestamp()
)
```

```cypher
-- what a source asserted; the ingest writes these and nothing else does
CREATE REL TABLE CLAIMS(FROM Media TO Media,
  kind STRING,              -- 'SAME_AS' | 'PART_OF'   (the schema's MediaHandleRelation, 03 section 1)
  provenance STRING,        -- 'source' | 'ask' | 'seed' | 'address'   (section 3.3)
  claimer STRING,           -- the origin whose resolver returned the handle
  targetScope STRING,       -- the scope stamped on the nested node, or NULL (partOf() stamps CONTAINER, 03 section 1)
  node JSON,                -- the nested node exactly as returned: the claimer's DESCRIPTION of the target (url, titles)
  answerSeq INT64, seq INT64)

CREATE REL TABLE HAS_EPISODE(FROM Media TO Episode, claimer STRING, answerSeq INT64, seq INT64)

CREATE REL TABLE EPISODE_CLAIMS(FROM Episode TO Episode,
  kind STRING, provenance STRING, claimer STRING, node JSON, answerSeq INT64, seq INT64)

-- the narrative axis, never walked by any merge (01 case 50)
CREATE REL TABLE RELATED(FROM Media TO Media,
  relation STRING, format STRING, claimer STRING, node JSON, answerSeq INT64)

CREATE REL TABLE ABOUT(FROM Answer TO Media, FROM Answer TO Episode, FROM Answer TO Origin)
```

**What is raw and why.** `Media.raw` and `Episode.raw` hold the owner's row as a JSON document; the
typed columns beside them are verbatim projections (the same value, copied, never coerced) so a
candidate scan can filter in Cypher. `Answer.raw` is the resolver's return value with nothing removed,
one row per resolve, append only: that is the "kept as originally returned" half, and it is what makes
a policy change replayable, which today takes a reload and a full re-fan-out (02 section 5.2). The
claim's `node` keeps the nested handle node as the claimer returned it, so a container badge can carry
the url Kitsu published for a Crunchyroll series without Crunchyroll ever answering (01 case 1, "a link
a source holds about a CONTAINER, carried with its url and no identity claim").

### 2.2 Plugin tables: written by plugins, through the writer, stamped `by`

```cypher
CREATE NODE TABLE MediaProfile(
  uri STRING PRIMARY KEY, by STRING, version INT64,
  scope STRING,                 -- the EFFECTIVE scope, the ratchet computed as a view (section 5.4 P0); NULL = unknown
  scopeFrom STRING[],           -- which answers or claims said CONTAINER
  titleKeys STRING[],           -- main titles only, stripped keeping \p{L}\p{N}, with a letter (01 case 24, I12)
  titleKeysFolded STRING[],     -- diacritic-folded alternates (01 case 28); read only behind a flag (I8)
  seasonOrdinal INT64, partOrdinal INT64, ordinalFrom STRING,   -- parsed from RAW titles (01 case 25); NULL = silent (case 26)
  year INT64, startDay DATE,
  datePrecision STRING,         -- 'day' | 'month-or-year' | 'none'   (01 cases 33, 34)
  dateDerivation STRING,        -- 'published' | 'coerced'            (01 case 35)
  format STRING, workKind STRING, companion BOOLEAN,   -- as profileCluster (02 section 2.10)
  countKind STRING,             -- 'declared' | 'listLength' | 'none'  (01 cases 22, 23, 45)
  count INT64,
  folding BOOLEAN,              -- origin folds cours into seasons (03 section 1: cr, nf, jw)
  retranslates BOOLEAN,         -- origin commissions its own episode titles (03, 01 R2: nf)
  showLevelOrigin BOOLEAN,      -- every id of this origin names a container (03: imdb, trakt, tvdb, paramount)
  idParent STRING               -- the same-origin prefix parent of this id, when one exists (01 case 5)
)

CREATE NODE TABLE EpisodeProfile(
  uri STRING PRIMARY KEY, by STRING, version INT64,
  day DATE,                     -- UTC day of releaseDate (02 section 2.9 dayOf)
  dayPrecision STRING,          -- 'instant' | 'day' | 'none'         (01 case 38)
  titleKeys STRING[],
  generic BOOLEAN               -- "Episode 13" carries no identity (01 case 21)
)

CREATE NODE TABLE Cluster(
  id STRING PRIMARY KEY,        -- the Media._id the app caches on; minted once, carried across growth (02 section 2.6)
  by STRING, version INT64,
  scope STRING,                 -- 'RUN' | 'CONTAINER'
  key STRING,                   -- lowest member uri
  aggUri STRING,                -- 'ag:(' + sorted routable member uris + ')' (02 section 4.1)
  aliases STRING[],             -- ids retired by a merge; resolve() still answers them
  runLength INT64, runLengthTier STRING, runLengthWitnesses INT64, runLengthFrom STRING[],
  preferredRun STRING,          -- a container cluster's earliest attached run cluster id (02 preferAttachedRun)
  anomalies JSON                -- [{rule, detail}] (02 section 2.11, now a runtime signal)
)

CREATE NODE TABLE Slot(
  id STRING PRIMARY KEY,        -- '<clusterId>#<number>'; the Episode._id
  by STRING, clusterId STRING, number INT64
)
```

```cypher
-- plugin-minted relations between source rows
CREATE REL TABLE LINK(FROM Media TO Media,
  kind STRING,                  -- 'SAME_AS' | 'PART_OF' | 'INCLUDES'
  by STRING, version INT64,
  status STRING,                -- 'active' | 'refused'   (a refused proposal is kept, with its reason)
  reason STRING, confidence DOUBLE, evidence JSON,
  fromStart INT64, fromEnd INT64, toStart INT64, toEnd INT64,   -- INCLUDES only: episodes fromStart..fromEnd of FROM
  contiguous BOOLEAN, aligned INT64, total INT64,               --   correspond to toStart..toEnd of TO (section 3.4)
  supports STRING[])            -- keys of the CLAIMS / LINK / EPISODE_LINK edges it was derived from

CREATE REL TABLE EPISODE_LINK(FROM Episode TO Episode,
  kind STRING,                  -- 'SAME_AS'
  by STRING, version INT64, status STRING, reason STRING, confidence DOUBLE, evidence JSON,
  fromNumber INT64, toNumber INT64)   -- the two rows' own numbers, so a renumbering is readable off the edge

CREATE REL TABLE PROFILE_OF(FROM MediaProfile TO Media, FROM EpisodeProfile TO Episode, by STRING)
CREATE REL TABLE MEMBER_OF(FROM Media TO Cluster, by STRING, version INT64, via STRING)
CREATE REL TABLE ATTACHED_TO(FROM Cluster TO Cluster, by STRING, version INT64, via STRING, supports STRING[])
CREATE REL TABLE SLOT_OF(FROM Slot TO Cluster, by STRING)
CREATE REL TABLE FILLS(FROM Episode TO Slot, by STRING, version INT64, via STRING, number INT64, supports STRING[])
```

### 2.3 Who writes what, and how the writer is recorded

| table | writer | how the writer is recorded |
| --- | --- | --- |
| `Origin`, `Media`, `Episode`, `Answer`, `CLAIMS`, `HAS_EPISODE`, `EPISODE_CLAIMS`, `RELATED`, `ABOUT` | the ingest, one serial queue (section 4) | `Answer.seq` / `answerSeq` names the exact resolver return; `claimer` names the origin; `seq` advances only in the ingest |
| `MediaProfile`, `EpisodeProfile`, `PROFILE_OF` | `plugin:profile` | `by`, `version` |
| `LINK` (SAME_AS, PART_OF) | `plugin:direct`, `plugin:title`, `plugin:containment`, `plugin:range` through the writer's guards | `by`, `reason`, `evidence`, `supports`, `status` |
| `LINK` (INCLUDES), `EPISODE_LINK` | `plugin:range` | same |
| `Cluster`, `MEMBER_OF`, `Slot`, `SLOT_OF`, `FILLS` | `plugin:aggregate` | same |
| `ATTACHED_TO`, `Cluster.preferredRun` | `plugin:containment` | same |

A plugin cannot name a source table in its output type (section 5.1), and the core asserts after every
pass that no source row's `seq` moved and no source edge count changed (section 5.3). That is how the
core proves a plugin never touched a source row.

### 2.4 What is derived

Everything in section 2.2. Nothing in 2.1 is derived: the typed columns on `Media` and `Episode` are
copies of `raw` fields, and `owned`, `fieldSeq`, `seq` are bookkeeping about the answers, not
conclusions about the work.

---

## 3. The edge model

### 3.1 The closed set

| kind | table | direction | meaning | asserted by a source | minted by a plugin |
| --- | --- | --- | --- | --- | --- |
| `SAME_AS` | `CLAIMS`, `LINK` | source: claimer to claimed; plugin: lower uri to higher uri (determinism) | the two uris name one run, or one container, at the same scope | yes: anilist `mal`, kitsu `mal`/`anilist`, anizip, simkl, offline, jikan `anidb`, film links from kitsu, watchmode, justwatch (03 section 2) | `plugin:direct` (from a claim), `plugin:title`, `plugin:range` (reason `aligned`) |
| `PART_OF` | `CLAIMS`, `LINK` | part to whole | X is one of Y's parts: a run of a show, a film of a collection (01 case 41), a cour of a folded season (case 9), a catalogue season of a longer run (case 10) | yes: kitsu `partOf`, justwatch show container and show-level offers, watchmode `imdb`/`tmdb`, the seed's containers (03) | `plugin:direct` (cross-scope demotion, prefix ids), the writer's downgrade of an uncertain SAME_AS (section 5.2), `plugin:title` (run x container), `plugin:containment` (span) |
| `INCLUDES` | `LINK` only | whole to part, with a range | Y's episode list holds X's episodes at Y positions `fromStart..fromEnd`, which are X positions `toStart..toEnd`; `aligned/total` says how much of Y is proven, `contiguous` whether the proven pairs are unbroken | never | `plugin:range` only |
| `HAS_EPISODE` | `HAS_EPISODE` | media to episode | the claimer hung this episode row on this media uri | yes, every episode-emitting source (03 section 3) | never |
| `SAME_AS` (episode) | `EPISODE_CLAIMS`, `EPISODE_LINK` | as above | two episode rows are one broadcast episode | yes, rarely (a source's episode handles) | `plugin:range` (by date, by title), `plugin:aggregate` (by number inside one cluster) |
| `RELATED` | `RELATED` | as the source stated | PREQUEL, SEQUEL, ADAPTATION and the rest of AniList's vocabulary | anilist only (03 anilist) | never, and never walked by any merge (01 case 50) |

Not added, deliberately:

- `EPISODE_PART_OF`: declared, written and read by nothing today (01 case 51). The fold is
  `INCLUDES` plus per-episode `SAME_AS`, which is what cases 9, 12, 13 and 15 actually need.
- `INCLUDES` as a source claim: no source models it, and a show never has an honest episode list to
  include anything with (01 case 18).
- A stored reverse of `PART_OF`: storing both directions lets them disagree, the argument that
  rejected a second `links` field (01 R16). `INCLUDES` is a different fact (an episode range), not
  the reverse of `PART_OF`.

### 3.2 Provenance and confidence on every edge

| on a claim | on a plugin edge |
| --- | --- |
| `claimer`: the origin whose resolver returned it | `by`: the plugin id; `version`: the pass that wrote it |
| `provenance`: `source`, `ask`, `seed`, `address` (3.3) | `reason`: the rule that fired, one token per rule (section 5.4) |
| `answerSeq`: the exact return value it came out of | `confidence`: 1.0 for an id or a date match, the similarity score for a title match |
| `targetScope`: what the claimer stamped on the nested node | `evidence`: the numbers the rule read (titles and score, shared days, counts) |
| `node`: the claimer's description of the target | `supports`: the edges it was derived from, so a trace can descend to the claims and from there to the `Answer` |
| | `status`: `active` or `refused`, so a veto that fired and a veto whose premise was absent are both queryable (01 case 6) |

### 3.3 Provenance values, and the one that is only a pointer

- `source`: a resolver's own handle. Consumed by every plugin.
- `ask`: a `similarMedia` answer the app's consumer wrote as a claim (04 section 1.6). Consumed like
  `source`; the answer's own row lands through the answering extractor as today.
- `seed`: the offline seed's identity handles (03 offline). Consumed like `source`; the seed's
  handle nodes are placeholders and never write a row (01 case 47).
- `address` (**NEW**, 01 case 8, open problem 2): a handle rebuilt from the address bar by
  `buildHandlesFromUri`. It is a POINTER: it routes re-asks (section 7) and never enters the sameness
  closure, so a stale bookmark can no longer re-inject a show-level id and weld it (case 8's "two old
  season links in one session can still weld"). This needs an owner decision (section 11).

### 3.4 The episode range form, literally

```cypher
-- Mushoku Tensei: Crunchyroll's season 1 (23 episodes plus a special) holds both cours
(cr:G24H1N3MP-G609CX3J4)-[:LINK {kind:'INCLUDES', by:'plugin:range', status:'active', reason:'dates',
  fromStart:1,  fromEnd:11, toStart:1, toEnd:11, contiguous:true, aligned:11, total:24, confidence:1.0}]->(anilist:108465)
(cr:G24H1N3MP-G609CX3J4)-[:LINK {kind:'INCLUDES', by:'plugin:range', status:'active', reason:'dates',
  fromStart:12, fromEnd:23, toStart:1, toEnd:12, contiguous:true, aligned:12, total:24, confidence:1.0}]->(anilist:127720)

-- and what places a play button: one edge per episode, carrying the day both sides published
(cr:<episode 12>)-[:EPISODE_LINK {kind:'SAME_AS', by:'plugin:range', reason:'dates', fromNumber:12, toNumber:1,
  evidence:'{"day":"2021-10-03","slack":0}', confidence:1.0}]->(anizip:<cour 2 episode 1>)
```

The `INCLUDES` edge labels the container on the run's page ("Crunchyroll season 1 holds this run,
episodes 1 to 11") and bounds the range plugin's search. It never places a button: a button is an
`EPISODE_LINK` with evidence, one per episode, so one inserted special costs one episode its link
rather than shifting every later one (01 case 15, R1).

### 3.5 Traversal rules, as the Cypher that enforces them

**What the aggregation may walk.** Sameness closes over active `SAME_AS` `LINK` edges only, both
directions, and nothing else. The closure is computed once by `plugin:aggregate` and materialized as
`MEMBER_OF` (00: 6.8 ms recursive against 1.7 ms materialized; 1,033 ms on a dense graph); the same
query is the cross-check the tests run against the materialized membership:

```cypher
MATCH (a:Media {uri: $uri})-[:LINK*0..8 (r, _ | WHERE r.kind = 'SAME_AS' AND r.status = 'active')]-(b:Media)
RETURN DISTINCT b.uri
```

The filter names exactly one kind. A `SAME_AS` is only ever written between two rows of one effective
scope (section 5.2 guard 2), so the closure cannot cross a scope either.

**What a page may walk beyond the closure, one hop each, direction declared:**

```cypher
-- the containers of a run cluster: one hop of PART_OF out of a member, then the target's own cluster
MATCH (c:Cluster {id: $id})<-[:MEMBER_OF]-(:Media)-[l:LINK {kind: 'PART_OF', status: 'active'}]->(t:Media)
OPTIONAL MATCH (t)-[:MEMBER_OF]->(k:Cluster)
RETURN t.uri, l.reason, l.by, k.id

-- the parts of a cluster (a catalogue season that is a piece of this run, case 10; the runs of a show)
MATCH (c:Cluster {id: $id})<-[:MEMBER_OF]-(:Media)<-[l:LINK {kind: 'PART_OF', status: 'active'}]-(p:Media)-[:MEMBER_OF]->(k:Cluster)
RETURN p.uri, l.reason, k.id

-- the episode ranges a container proves it holds
MATCH (c:Cluster {id: $id})<-[:MEMBER_OF]-(:Media)<-[l:LINK {kind: 'INCLUDES', status: 'active'}]-(s:Media)
RETURN s.uri, l.fromStart, l.fromEnd, l.toStart, l.toEnd, l.aligned, l.total
```

**What may never be walked.** Any closure whose filter admits `PART_OF` or `INCLUDES`:

```cypher
-- NEVER. This is the query that welds three seasons through one show id (01 case 1) and puts every
-- season's episodes on one page (01 case 18). No reader, no plugin, no test helper may issue it.
MATCH (a)-[:LINK*1..8 (r, _ | WHERE r.kind IN ['SAME_AS', 'PART_OF', 'INCLUDES'])]-(b)
```

and any episode read that reaches `HAS_EPISODE` through a `PART_OF` or `INCLUDES` target (04 section
2.1, "the most dangerous read in the tree"). The episode read in section 6.4 starts from `Slot`, never
from a media uri, so it cannot be misused.

**The owner's rule, never treat as SAME_AS anything reached through INCLUDES, as a guard.** The
writer refuses a proposed `SAME_AS(a, b)` when the two already stand in a containment relation:

```cypher
MATCH (a:Media {uri: $a})-[l:LINK {status: 'active'}]-(b:Media {uri: $b})
WHERE l.kind IN ['PART_OF', 'INCLUDES']
RETURN count(l) > 0 AS contained     -- true: refused with reason 'contained'
```

The other way a plugin could reach a sibling through a container (X part of Y, Z part of Y, propose
X = Z) is stopped by guard 4 (disagreeing ids) and by the count and date vetoes: two cours of one
show carry different `anilist`, `mal` and `kitsu` ids, and sit about 91 days apart (01 case 36).

---

## 4. Ingest: from a resolver's return value to rows

### 4.1 What is kept

- `useOnResolve` keyed on the named type of the resolved field, installed once in `makeExtractor` so
  every source and every plugin source goes through it (04 section 1.2). Its three consequences stay:
  it fires on the return value, not the selection; episodes are written only when the `episodes`
  field is actually resolved; the media inserter never writes `media.episodes` itself.
- The three DataLoaders with their batch sizes and the 50 ms schedule (04 section 1.3). The batch is
  the unit of an ingest commit and of a plugin pass (section 5.3).
- The fan-out that discards payloads (04 section 1.5): the graph stays the only join point.
- `ctx.findAggregatedMedia` and `ctx.listenForMediaChanges` for sources that block on the store
  mid-resolve (04 section 1.8): both are answered from the read path of section 6 and woken by
  `view:changed`.

### 4.2 The ingest queue

One serial queue owns the only write handle to the source tables. A batch from a DataLoader becomes
one commit of, in order:

1. `UNWIND $answers AS a CREATE (:Answer {seq: a.seq, uri: a.uri, origin: a.origin, kind: a.kind,
   operation: a.operation, selection: a.selection, raw: a.raw})`, one row per resolver return value,
   including nested handle nodes and inline episodes, byte for byte.
2. `UNWIND $uris AS u MATCH (m:Media {uri: u}) RETURN m.uri, m.owned, m.raw, m.fieldSeq` to read the
   rows the batch touches (one round trip, about 1 to 2 ms, 00).
3. The field merge in JS (4.3), producing one row per uri.
4. `UNWIND $rows AS r MERGE (m:Media {uri: r.uri}) ON CREATE SET m.owned = r.owned, m.raw = r.raw,
   m.origin = r.origin, ... ON MATCH SET m.owned = m.owned OR r.owned, m.raw = r.raw, m.fieldSeq =
   r.fieldSeq, m.seq = r.seq` plus the projections. 2,000 nodes in 107 ms batched (00), so a batch of
   250 is well under the 50 ms schedule.
5. Claims: for every handle in every returned row, walked depth first exactly as
   `recursivelyUnwrapMediaHandles` walks today and STOPPING at a `PART_OF` node (02 section 1,
   `part-of-subtree.test.ts`: the handles of a show contribute no pair between two runs that point at
   it): `UNWIND $claims AS h MATCH (a:Media {uri: h.from}) MERGE (b:Media {uri: h.to}) ON CREATE SET
   b.owned = false, b.origin = h.toOrigin, b.id = h.toId MERGE (a)-[c:CLAIMS {kind: h.kind, claimer:
   h.claimer, provenance: h.provenance}]->(b) ON CREATE SET c.targetScope = h.targetScope, c.node =
   h.node, c.answerSeq = h.answerSeq, c.seq = h.seq`. A re-asserted handle matches its existing edge
   and is not new, so it fires nothing (02 section 2.7, `edge-idempotence.test.ts`).
6. Narrative relations to `RELATED`, the same way; `franchise` stays inside `raw`, one source's
   whole graph, never spliced (02 section 4.1).
7. `changed = { media: [uris created or whose raw changed], claims: [new edge keys] }`. If non-empty,
   emit `graph:changed` with that payload. Every emit carries uris (02 section 2.7 records that today's
   payload is always `{}` and that this is why `mediaPage` re-reads the whole store).

Episodes follow the same shape: `MERGE (e:Episode {uri})` with the field merge, `MERGE (m:Media
{uri: e.mediaUri})` as a placeholder when absent, `MERGE (m)-[:HAS_EPISODE {claimer}]->(e)`,
episode handles to `EPISODE_CLAIMS`. Origins: `MERGE (o:Origin {id})` with the field merge, and
`origin:changed` fires only when a row changed (02 section 2.7 records the unconditional emit as a
known asymmetry; the seven `waitForMedia` callers are woken by `view:changed`, section 6.6).

### 4.3 The owner rule, the placeholder rule and the field merge

**Owner.** `owned` becomes true only when the answering source's declared origin equals the row's
origin (`jikan` owns `mal:` rows, `crunchyroll` owns `cr:`, `unogs` owns `nf:`, `justwatch` owns
`jw:`, 03 section 1). Only an owner writes `raw`. A nested node of another origin creates a
placeholder (`owned: false`, `raw: NULL`) and its description rides the claim's `node`: a node
contributing no field cannot take one (01 case 47), and a partial selection can no longer truncate
the owner's copy, which is the class behind 01 I5.3 ("`titles { title }` alone cost crunchyroll's
rows their language and score"). JustWatch's show container node has origin `jw` and is therefore
owned by JustWatch and written whole (03 justwatch).

**Placeholder.** Today a placeholder is not stored and a claim naming it waits in `pendingClaims`
(02 sections 2.3, 2.4; 01 case 48). Here the placeholder IS stored, with `raw: NULL`, the claim edge
is written at once, and `plugin:direct` simply does not evaluate a claim until both endpoints have
an effective scope (section 5.4 P0 computes one for a placeholder only from a `targetScope` stamp or a
show-level origin). Arrival order cannot decide anything because every pass recomputes from the
same evidence; the pending set is the query `MATCH (m:Media {owned: false})`, with no expiry map to
leak (02 section 2.4 records that `pendingClaims` has none).

**Field merge, for an owner answering about one uri more than once.** Kept from
`lastWriteLongestArray` (02 section 2.5), whose rule 04 section 5.1 says "must be restated wherever
field merging lands": per top-level field, the incoming value is taken when it is non-null and, for
an array, non-empty and not strictly shorter than the current one; otherwise the current value
survives; a key absent from the incoming row survives. Two differences from today: the loser is not
destroyed, it is in its `Answer` row; and `fieldSeq[field]` records which answer supplied the value,
so the search-row-after-media-page degradation is both prevented and, if it ever happens through a
rule change, visible.

**Re-fetch of the same uri: keep both, and one merged row.** Replace would lose fields the earlier
answer carried (the listing row after the modal row). Version-only would make every read choose.
Keep-both with a deterministic merged row gives the read one row and the trace the history. The
merged row is recomputable from the `Answer` log by replaying the rule, and the harness does exactly
that (section 9.3).

### 4.4 How the lend arrives, until it is removed

`lendContainingSeason` returns Crunchyroll's episodes re-pointed at the asking run with `handles: []`
(01 case 12; 03 crunchyroll). Until migration step 5 deletes it, those rows arrive as `HAS_EPISODE
{claimer: 'cr'}` from an `anilist:` uri to `cr:` episodes. The aggregation counts an episode as a
MEMBER episode only when the `HAS_EPISODE` claimer is the media's own origin or the episode's origin
is a member of the cluster (section 5.4 P5); a foreign hang is evidence for `plugin:range` and never a
slot by itself. So the lend is harmless during the transition and redundant after it, because
`plugin:range` mints the same correspondence with proof (01 I9's rule, a loan refused whole when
uncorroborated, becomes "a loan is never a row; a proven pair is").

---

## 5. Plugins

### 5.1 The contract

```ts
export type PluginId = `plugin:${string}`

export type SourceNodeTable = 'Media' | 'Episode' | 'Origin' | 'Answer'
export type SourceEdgeTable = 'CLAIMS' | 'HAS_EPISODE' | 'EPISODE_CLAIMS' | 'RELATED' | 'ABOUT'
export type PluginNodeTable = 'MediaProfile' | 'EpisodeProfile' | 'Cluster' | 'Slot'
export type PluginEdgeTable = 'LINK' | 'EPISODE_LINK' | 'PROFILE_OF' | 'MEMBER_OF' | 'ATTACHED_TO' | 'SLOT_OF' | 'FILLS'
export type LinkKind = 'SAME_AS' | 'PART_OF' | 'INCLUDES'

export type Plugin = {
  id: PluginId
  /** What it reads. The scheduler runs it only when one of these carries a delta since its last run. */
  consumes: { nodes: (SourceNodeTable | PluginNodeTable)[], edges: (SourceEdgeTable | PluginEdgeTable)[], kinds?: LinkKind[] }
  /** What it may write. A source table cannot be named here: the type has no member for it. */
  produces: { nodes: PluginNodeTable[], edges: PluginEdgeTable[], kinds?: LinkKind[] }
  /** Plugins that must have run earlier in the same pass. Cycles are legal; the pass iterates to a fixed point (5.3). */
  after: PluginId[]
  /** Bumped when the rule changes; the writer retracts every row stamped with an older version and runs a full pass. */
  version: number
  /**
   * Compute the plugin's WHOLE desired output from the graph. The writer diffs it against what this
   * plugin wrote last time (by = id) and applies the delta, so run() is idempotent by construction:
   * the same graph produces the same output, and the harness asserts it (section 9.3).
   */
  run: (ctx: PluginContext) => Promise<PluginOutput>
}

export type PluginContext = {
  id: PluginId
  /** Read anything: Cypher over the whole graph, other plugins' output included. Write verbs are refused (5.3). */
  query: <Row>(cypher: string, params?: Record<string, unknown>) => Promise<Row[]>
  /** The delta since this plugin's previous run, so a scan can be scoped. `full` on the first run and after a version bump. */
  delta: { media: string[], episodes: string[], claims: string[], links: string[], clusters: string[], full: boolean }
  /** The one evaluation path for sameness (5.2). Exposed so a plugin can ask before it proposes; the writer asks again. */
  guards: Guards
  /** The previous output of this plugin, keyed as the writer keys it, for plugins that carry state across passes (cluster ids). */
  previous: PluginOutputIndex
  log: (event: { level: 'info' | 'warn', rule: string, detail: string, uris?: string[] }) => void
}

export type LinkProposal = {
  kind: LinkKind, from: string, to: string,
  reason: string, confidence: number, evidence?: unknown, supports: string[],
  range?: { fromStart: number, fromEnd: number, toStart: number, toEnd: number, contiguous: boolean, aligned: number, total: number }
}

export type PluginOutput = {
  nodes: { table: PluginNodeTable, rows: Record<string, unknown>[] }[]
  edges: { table: Exclude<PluginEdgeTable, 'LINK' | 'EPISODE_LINK'>, rows: Record<string, unknown>[] }[]
  links: LinkProposal[]            // SAME_AS proposals pass the guards; a refusal is written with status 'refused'
  episodeLinks: { from: string, to: string, reason: string, confidence: number, evidence?: unknown, fromNumber: number, toNumber: number }[]
}

export type Refusal =
  | 'unknown-scope' | 'cross-scope' | 'address-only' | 'disagreeing-ids' | 'contested'
  | 'contained' | 'count-mismatch' | 'no-length' | 'inverted' | 'self'

export type Guards = {
  sameAs: (a: string, b: string, proposal: Pick<LinkProposal, 'reason' | 'supports'>) => Promise<{ ok: true } | { ok: false, reason: Refusal }>
  partOf: (part: string, whole: string) => Promise<{ ok: true } | { ok: false, reason: 'unknown-scope' | 'self' | 'inverted' }>
}
```

### 5.2 The writer: one chokepoint, the guards, and the downgrade

The writer is core code. After `run`, it stamps every row `by = id, version = pass`, computes the
desired set per table keyed by primary key or edge key, reads the current set (`... WHERE by = $id`),
and applies `DELETE current - desired`, `CREATE desired - current`, `SET` on changed properties. A
retract is an empty `desired`. `DELETE e` on edges selected by a property is verified (00).

Every `SAME_AS` proposal, whatever plugin made it, passes these guards in this order (01 case 2:
"identity claims and similarity guesses must travel the SAME evaluation path"; case 7: "a guard placed
in one writer is not a guard"). Refusals are written as `LINK {status: 'refused', reason}` so they
can be queried (01 case 6).

| # | guard | rule | record |
| --- | --- | --- | --- |
| 1 | `unknown-scope` | either endpoint's effective scope is NULL: the proposal waits for the next pass | 01 case 48; 02 section 2.4 |
| 2 | `cross-scope` | effective scopes differ: downgraded (below) | 02 section 2.1 derivation table |
| 3 | `address-only` | an endpoint is an unowned placeholder reached only through `address` claims | **NEW**, 01 case 8 |
| 4 | `disagreeing-ids` | the union would put two ids of one origin in one component that are not prefix related (`A-1` beside `A-2`; `A` beside `A-1` is precision, not disagreement) | 01 case 5, case 46; 04 section 1.6 ("refused when another run of that origin is already in the cluster") |
| 5 | `contested` | within one pass, two proposals would join one target to components that disagree by guard 4: BOTH are refused, neither wins by order | **NEW**, 01 case 11 ("evaluated where both claimants are visible"), I2 |
| 6 | `contained` | an active `PART_OF` or `INCLUDES` already joins the pair (section 3.5) | owner's rule |
| 7 | `count-mismatch` | one side is a season row of a folding origin (profile `folding`) whose `listLength` count differs from the other side's declared `runLength`, and no `plugin:range` proof exists: downgraded | 01 I6 (zero tolerance on longer), case 10 (the split direction, "only exactness counts"), R7 |
| 8 | `no-length` | one side is a season row of a folding origin and the other side has no declared length at all: downgraded, never welded on a guess | 01 case 23 ("no count" is not zero), R7 |

**The downgrade, the RUN versus CONTAINER exchange in one place.** A proposal refused for
`cross-scope`, `count-mismatch` or `no-length` is written instead as `PART_OF` from the run or shorter
side to the container or longer side, with `reason` set to the refusal and `by` set to the proposing
plugin. A wrong CONTAINER is a missing SAME_AS, recoverable by a later proof; a wrong SAME_AS is a
lie about what the user is about to watch (01 I2, I3's reasoning in 02 section 2.2). This is the rule
that today lives in three pair linkers, a scope dispatch and a resolver comment (02 section 3, "where
policy is entangled", items 4 and 5), now stated once.

`partOf` guards: `unknown-scope`, `self` (a run is not part of itself, 02 `findPartOfMedia`),
`inverted` (a CONTAINER proposed as part of a RUN is refused rather than flipped, 02 `linkPartOfPairs`:
"a caller that got the order wrong may have the scopes wrong too"). A catalogue season as a part of a
longer run (01 case 10) is RUN into RUN, which passes.

### 5.3 When plugins run, and how isolation is proven

**Scheduling.** The ingest emits `graph:changed` once per committed batch. The scheduler runs one
PASS per emit, coalescing emits that land mid-pass into one more pass. A pass walks the plugins in
`after` order and runs a plugin only when its `consumes` set carries a delta; a plugin that writes
something gives every consumer of that table a delta. The pass repeats until no plugin has a delta
(the fixed point), capped at four iterations per emit with a warning, because `aggregate` must see
`direct`'s links before `title` and `range` can read clusters, and their links feed `aggregate`
again. Measured costs make this cheap: a candidate scan is 35 ms, a materialized membership read
1.7 ms (00). After the pass the scheduler emits `view:changed { clusters: [...] }` naming the clusters
whose membership, slots or attachments moved; the resolvers re-read only those (section 6.6).

**Full passes.** On worker start, and when a plugin is enabled, disabled, or bumps `version`, the
writer retracts everything stamped with its id and runs it with `delta.full = true`. Disabling a
plugin is therefore a retraction, and re-enabling it recomputes: this is the reversibility 02
section 5.2 says the store lacks.

**Isolation, proven three ways.**

1. By type: `PluginOutput` has no member that can name a source table, and the writer validates every
   row's table against `produces` at runtime.
2. By the query handle: `ctx.query` runs statements through a checker that refuses the write verbs
   (`CREATE`, `MERGE`, `SET`, `DELETE`, `DROP`, `COPY`, `ALTER`) outside string literals before they
   reach the connection. A plugin never holds the connection.
3. By audit: after every pass the core runs `MATCH (m:Media) RETURN max(m.seq), count(m)` and the
   same over `Episode`, `Origin`, `CLAIMS`, `HAS_EPISODE`, `EPISODE_CLAIMS` and compares with the
   values before the pass; a difference throws, names the pass, and the harness (section 9.3)
   additionally hashes every source row and edge before and after each plugin in isolation.

### 5.4 The default plugins

Order in a pass: `profile`, `direct`, `aggregate`, `containment`, `title`, `range`, then `aggregate`
and `containment` again through the fixed point. Six plugins.

#### P0 `plugin:profile`, derivations

- **Consumes** `Media`, `Episode`, `Answer`, `CLAIMS`. **Produces** `MediaProfile`, `EpisodeProfile`,
  `PROFILE_OF`. `after: []`. Runs per changed uri.
- **Evidence.** The row's own `raw`, its `Answer` log, and the claims stamped on it.
- **Candidate scan.**

```cypher
UNWIND $uris AS u
MATCH (m:Media {uri: u})
OPTIONAL MATCH (m)<-[c:CLAIMS]-(:Media)
OPTIONAL MATCH (a:Answer {uri: u})
RETURN m, collect(DISTINCT c {.kind, .targetScope, .claimer, .provenance}) AS claims,
       collect(DISTINCT json_extract(a.raw, 'scope')) AS scopesSaid
```

- **Rules**, every one a derivation from the record, none a merge decision:

| field | rule | record |
| --- | --- | --- |
| `scope` | `CONTAINER` if any answer about this uri said CONTAINER, or any claim stamped `targetScope: CONTAINER`, or `showLevelOrigin`; else `RUN` if the row is owned or any claim stamped RUN; else NULL. Computed from the `Answer` log, so a later RUN never flips it and nothing is overwritten: the ratchet as a view | 01 I3; 02 sections 2.2, 2.3 ("a CONTAINER stamp counts as a description") |
| `showLevelOrigin` | `imdb` (03 imdb, `SHOW_LEVEL_ORIGINS`), and the origins whose own rows are always CONTAINER: `trakt`, `tvdb`, `paramount` (03 section 1) | 01 case 42 |
| `titleKeys` | each `raw.titles[].title`: `stripTitle` keeping `[\p{L}\p{N}\s]`, lower case, spaces collapsed; dropped when it carries no letter or is only a season label. Only `titles`, never a synonym field | 01 case 24 (`1430` pairs on `"2026"`), case 29 and I12, `carriesIdentity` 02 section 2.10 |
| `titleKeysFolded` | the same keys after NFD with combining marks removed (`jôzu` to `jozu`) | 01 case 28, I8: produced now, consumed only behind `foldDiacritics` |
| `seasonOrdinal`, `partOrdinal` | `parseSeasonNumber` over the RAW titles; NULL when no title names one | 01 case 25 (284 of 4159 titles end in a bare number), case 26 (silence is not zero); 02 `profileCluster.seasons` |
| `datePrecision`, `startDay`, `year` | any first-of-month `startDate` from an origin in the coercing set (justwatch, omdb, tmdb, tvdb, unogs, crunchyroll show rows; kitsu and jikan month-only) is `month-or-year`: `startDay` NULL, `year` kept; otherwise `day`. Until an extractor states `startDatePrecision` (section 10 step 7), a first of any month from ANY origin is treated the same, which is the shipped `startDay` rule at ratio 1.02 | 01 cases 33, 34, 35; 03 appendix `namesADay`; 02 section 2.10 |
| `dateDerivation` | `coerced` when the same test fires, else `published` | 01 case 35 |
| `format`, `workKind`, `companion` | as `profileCluster`: MOVIE/SERIES from categories and type with SPECIAL/OVA/ONA neutral; `WORK_KINDS` with TV_SHORT folded to TV; the ten `COMPANION_MARKERS` | 02 section 2.10 |
| `countKind`, `count` | `declared` for a published figure: mal `data.episodes`, anilist `episodes`, anizip `episodeCount`, offline `record.ep`, omdb single season or film, justwatch `totalEpisodeCount`; `listLength` for a fetched list's length: crunchyroll, unogs, appletv, tmdb, tvmaze, kitsu (overwritten by its list, 03 kitsu), simkl, trakt, tvdb, paramount; `none` when null. An empty list is `none`, never 0 | 01 cases 22, 23, 45, R3 ("a declared count beating a derived length"); 03 section 2 |
| `folding` | `cr`, `nf`, `jw` | 03 section 1 "folds cours" |
| `retranslates` | `nf` | 01 R2, I7 |
| `idParent` | the same-origin id this one extends by `-<suffix>`: `cr:<series>-<season>`, `nf:<title>-<n>`, `jw:<object>-<seasonObject>`, `<id>-s<n>` for tmdb, tvmaze, appletv | 01 case 5 ("specificity is PREFIX EXTENSION"); 03 section 1 |
| `EpisodeProfile.day`, `dayPrecision` | an instant is floored to its UTC day (`instant`); a named `YYYY-MM-DD` is that day (`day`); else `none` | 01 case 38; 02 section 2.9 `dayOf` |
| `EpisodeProfile.generic` | `GENERIC_EPISODE` regex | 01 case 21 |

- **Emits** one profile per row. **Failure mode:** a wrong per-origin table entry, which is one line
  and recomputes every dependent plugin on the next full pass.

#### P1 `plugin:direct`, direct edge merging

- **Consumes** `CLAIMS`, `MediaProfile`. **Produces** `LINK` kinds `SAME_AS`, `PART_OF`. `after:
  [profile]`.
- **Evidence.** Source handles: the union-by-id pairs of 03 section 5 (mal, anilist, kitsu, anizip,
  offline, simkl agree by first-party ids and need no matching), plus every `ask` and `seed` claim.
- **Candidate scan** (scoped to `delta.claims` on an incremental pass):

```cypher
MATCH (a:Media)-[c:CLAIMS]->(b:Media)
WHERE c.provenance IN ['source', 'ask', 'seed']
MATCH (pa:MediaProfile)-[:PROFILE_OF]->(a), (pb:MediaProfile)-[:PROFILE_OF]->(b)
RETURN a.uri, b.uri, a.origin, b.origin, c.kind, c.claimer, c.provenance,
       pa.scope AS sa, pb.scope AS sb, pa.idParent AS ia, pb.idParent AS ib
ORDER BY a.uri, b.uri, c.kind, c.claimer
```

- **Decision rule**, the derivation table of 02 section 2.1 kept verbatim, plus the same-origin rule:

| claim | scopes | verdict |
| --- | --- | --- |
| any | `sa` or `sb` NULL | no edge this pass; replayed next pass (01 case 48) |
| `SAME_AS` | equal | propose `SAME_AS` (the writer's guards decide; a refusal is written with its reason) |
| `SAME_AS` | differ | `PART_OF` from the RUN side to the CONTAINER side, reason `cross-scope` ("an edge media to handle, whatever was claimed", 02) |
| `PART_OF` | RUN into RUN or RUN into CONTAINER | `PART_OF` as claimed, reason `asserted` |
| `PART_OF` | CONTAINER into RUN | refused `inverted` (02 `linkPartOfPairs`) |
| any, `a.origin = b.origin` | `b = ia` (`A-1` extends `A`) | `PART_OF(a, b)` reason `prefix` (01 case 5: precision) |
| any, `a.origin = b.origin` | otherwise | refused `disagreeing-ids` (01 case 5: contradiction; 04 section 1.6) |
| any, `provenance = address` | | never consumed here (section 3.3) |

- **Emits** `LINK` rows with `supports = [claim key]`, `confidence: 1.0`, `evidence: {claimer,
  provenance}`.
- **Failure mode.** A per-run origin that is show-level for a minority of ids (01 case 43: `mal:51535`
  on both AoT Final Chapters) still welds two runs when no second id of a shared origin disagrees;
  the weld is visible in `Cluster.anomalies` the moment one does, and deletable, which today it is
  not (01 I1). Blocking `mal` would cost 3184 correct merges (case 43), so it is not blocked.

#### P2 `plugin:containment`, the RUN versus CONTAINER exchange

- **Consumes** `Cluster`, `MEMBER_OF`, `LINK` (`PART_OF`), `MediaProfile`, `HAS_EPISODE`,
  `EpisodeProfile`. **Produces** `ATTACHED_TO`, `Cluster.preferredRun`, `LINK` `PART_OF` (reason
  `span`, `show-show`). `after: [aggregate]`.
- **Evidence.** Active `PART_OF` edges; premiere and last-episode days of a folding origin's season
  (crunchyroll `episode_air_date`, appletv per-episode dates, 03 section 3).
- **Candidate scans.**

```cypher
-- attachments: every run cluster's containers, one hop, expanded to the target's cluster
MATCH (c:Cluster)<-[:MEMBER_OF]-(m:Media)-[l:LINK {kind: 'PART_OF', status: 'active'}]->(t:Media)-[:MEMBER_OF]->(k:Cluster)
WHERE k.id <> c.id
RETURN c.id, k.id, k.scope, collect(l.reason) AS reasons, collect(m.uri + '>' + t.uri) AS supports

-- span: a folding origin's season whose broadcast covers a run's start and which is longer (01 case 12)
MATCH (c:Cluster {scope: 'RUN'})<-[:MEMBER_OF]-(r:Media)<-[:PROFILE_OF]-(pr:MediaProfile)
WHERE pr.startDay IS NOT NULL AND c.runLength IS NOT NULL
MATCH (s:Media)<-[:PROFILE_OF]-(ps:MediaProfile {folding: true})
WHERE ps.count > c.runLength AND NOT EXISTS { MATCH (r)-[:LINK {status: 'active'}]-(s) }
MATCH (s)-[:HAS_EPISODE]->(:Episode)<-[:PROFILE_OF]-(pe:EpisodeProfile)
WITH c, r, s, pr, min(pe.day) AS first, max(pe.day) AS last
WHERE first <= pr.startDay AND pr.startDay <= last
RETURN c.id, r.uri, s.uri, first, last, pr.startDay
```

- **Decision rules.**
  - `ATTACHED_TO(run cluster, container cluster, via: reason)`; a container pointing at another
    container is stamped `show-show` and never rendered as a run link (02 `findRunsOfContainer`).
  - `preferredRun` on a container cluster: the attached run cluster with the earliest `startDay`,
    ties by `key` (02 `preferAttachedRun`, "a show page with no episode and no offer is what
    splitting the spaces cost").
  - `span`: exactly one season may qualify per run (01 case 12: "exactly one may qualify"); two or
    zero is a refusal. Emits `PART_OF(r, s)` reason `span` with `evidence: {first, last, startDay,
    theirCount, runLength}`. The season's episodes are NOT rows yet: `plugin:range` proves them.
  - A catalogue season that is PART_OF a longer run (01 case 10) attaches with `via: 'part'` in
    the other direction, so the run's page can list "Netflix splits this run into seasons 1 to 5" as
    links, never as episodes.
- **Failure mode.** A show whose catalogue season premiered on the same day as the run and is longer
  looks identical to a fold (01 I6: "neither axis can see the fold"); that is why this plugin only
  attaches and never mints sameness.

#### P3 `plugin:title`, title matching

- **Consumes** `Cluster`, `MEMBER_OF`, `MediaProfile`. **Produces** `LINK` `SAME_AS` (through the
  guards, so `PART_OF` by downgrade). `after: [aggregate]`.
- **Evidence.** Main titles only (01 I12), profile keys, years, day-precise start days, formats, work
  kinds, season ordinals, companion markers (02 section 2.10). Per cluster, the six titles by score
  descending then title ascending within a tier (`MAX_TITLES_PER_CLUSTER = 6`, 01 case 30: title
  ascending scored 69.6 / 99.9 / 70.0 against arrival order's 64.5 / 94.9 / 56.0).
- **Candidate scan**, the year buckets, scoped to clusters with a changed profile on an incremental
  pass:

```cypher
MATCH (c:Cluster)<-[:MEMBER_OF]-(m:Media)<-[:PROFILE_OF]-(p:MediaProfile)
WHERE size(p.titleKeys) > 0
WITH c, collect(DISTINCT p.year) AS years
UNWIND years AS year
WITH year, collect(DISTINCT c.id) AS clusterIds
WHERE year IS NOT NULL AND size(clusterIds) > 1
RETURN year, clusterIds
ORDER BY year
```

  then one query per bucket collecting each cluster's profiles, and pairs in fixed lexical order
  (02 section 2.10 step 4).

- **Decision rule**: the six gates, thresholds unchanged (01 R6: "change nothing"; every 0.01 above
  0.9 loses ~1400 correct pairs to refuse ~30 wrong):

| # | gate | rule | record |
| --- | --- | --- | --- |
| 0 | year bucket | only clusters sharing a `year` are compared; a cluster with no title is skipped | 02 section 2.10 |
| 1 | format | both name a format and they are disjoint: refuse | 02 |
| 2 | season | both name an ordinal and they disagree: refuse. Silence never blocks | 01 R4 (silence blocking costs 37 correct per weld stopped) |
| 3 | start date | both have a `startDay` and no pair within `START_DATE_WINDOW_DAYS = 45`: refuse | 01 cases 33, 36 (ratio 1.02; the 91 day cour gap is the ceiling); 02 |
| 4 | companion | both name a work kind, disjoint, AND a companion marker: refuse | 02 (both signals: 49 of 84 refused, 2 correct lost) |
| 5 | title | exact key equality: accept; `differOnlyByTrailingNumber`: skip; `maxPossibleSimilarity < 0.9`: skip; frizbee `>= SIMILARITY_THRESHOLD = 0.9`: accept | 01 case 25; 02 |

  A verdict on a run cluster against a run cluster proposes `SAME_AS`; against a container cluster it
  proposes `SAME_AS` and the writer downgrades it to `PART_OF` reason `cross-scope` ("a title match
  between a run and a show is a guess at containment, so it rides an edge", 02 section 2.10). The
  guards then add what the fuzzy pass never had: disagreeing ids (guard 4), count mismatch against a
  folding origin (guard 7), the contained check (guard 6). The pair is re-evaluated against the
  clusters AS THEY STAND when written, which is the writer's normal behaviour and replaces the
  snapshot re-check (02 section 2.10 step 6).
- **CJK and diacritics.** Keys keep every script, and the similarity call receives the SAME key the
  profile computed, so the double-normalisation that made the `if (!normalA || !normalB)` guard
  unreachable cannot recur (01 case 24, R17). `titleKeysFolded` is read only when `foldDiacritics`
  is on; it is off, because the 0.90 gate "carries measured exchange rates over 150 seasons and
  deserves its own measured change" (01 I8). The measurement is listed in section 11.
- **Emits** `LINK` with `evidence: {titleA, titleB, similarity, year, daysDelta}`, `confidence:
  similarity`, `supports: [profile keys of both sides]`. The decision cache is keyed on both sides'
  cache keys and bounded as an LRU, never wiped wholesale (**NEW**, replacing the 50,000 entry wipe
  02 section 2.10 step 3 records as a cost).
- **Failure mode.** The known gap survives: `86` and `86 Part 2` weld on a shared label when one side
  is silent (01 case 26, pinned as KNOWN GAP). The broadcast-quarter veto that would reach 583 of
  1095 such pairs is unmeasured for cost (01 open problem 5) and is not proposed.

#### P4 `plugin:range`, season and episode range matching

- **Consumes** `Cluster`, `MEMBER_OF`, `LINK` (`PART_OF`), `HAS_EPISODE`, `Episode`,
  `EpisodeProfile`, `MediaProfile`. **Produces** `EPISODE_LINK` `SAME_AS`, `LINK` `INCLUDES`, `LINK`
  `SAME_AS` reason `aligned` (through the guards). `after: [aggregate, containment]`.
- **Evidence**, from 03 section 3 and 5: on our side, dated and titled episodes come from anizip
  (`airDateUtc ?? airdate`, `en` and `ja` titles), the offline seed, and any catalogue member with
  dates (crunchyroll, appletv); on the catalogue side, crunchyroll (dates and titles), appletv
  (dates), tvmaze (dates once the extractor emits them, 03: "fetched and then dropped"), justwatch
  (titles), unogs (titles only, Netflix's own translation, no date at any level), kitsu (numbers
  only). Counts exist on every side and are the only universal axis, "which is precisely why the fold
  defeats them" (03 section 5).
- **Candidate scan**: every folding-origin season attached to a run cluster by an uncertain `PART_OF`,
  plus every MEMBER whose episode numbers do not start at 1 or exceed the run length (01 case 13):

```cypher
MATCH (c:Cluster {scope: 'RUN'})<-[:MEMBER_OF]-(r:Media)
MATCH (r)-[l:LINK {status: 'active'}]->(s:Media)<-[:PROFILE_OF]-(ps:MediaProfile)
WHERE l.kind = 'PART_OF' AND l.reason IN ['count-mismatch', 'no-length', 'span', 'contested', 'cross-scope']
  AND ps.folding
MATCH (s)-[:HAS_EPISODE]->(se:Episode)<-[:PROFILE_OF]-(pse:EpisodeProfile)
WITH c, s, ps, collect(se {.uri, .episodeNumber, day: pse.day, keys: pse.titleKeys, generic: pse.generic}) AS theirs
MATCH (c)<-[:MEMBER_OF]-(o:Media)-[h:HAS_EPISODE]->(oe:Episode)<-[:PROFILE_OF]-(poe:EpisodeProfile)
WHERE h.claimer = o.origin AND oe.origin = o.origin
RETURN c.id, c.runLength, c.runLengthWitnesses, c.runLengthFrom, s.uri, ps.count, ps.retranslates, theirs,
       collect(oe {.uri, .origin, .episodeNumber, day: poe.day, keys: poe.titleKeys, generic: poe.generic}) AS ours
```

- **Decision rules**, in order, each refusing on ambiguity rather than falling through (02 section
  2.9: "NOTHING RATHER THAN A GUESS, in every ambiguous case"):

| # | rule | detail | record |
| --- | --- | --- | --- |
| 1 | by DATE | reference episodes are those of members whose count equals `runLength` (grouped by origin, 02 `alignRunEpisodes`); `runByDay` holds DISTINCT numbers per UTC day; for each of theirs, look at day-1, day, day+1 and pair only when exactly one reference number is reachable; a day naming two reference numbers disqualifies that day. Each pair is an `EPISODE_LINK` with `evidence: {day, slack}`. Minimum `MIN_ALIGNED = 2` pairs or nothing | 01 case 13 (Tokyo day slack), case 38; 02 section 2.9 |
| 2 | by TITLE | refused outright when `retranslates` (Netflix commissions its own translation: 4 of 25 exact, the best wrong pair outscores the true one, 01 R2, I7). Otherwise exact key equality after `stripTitle`, both non-generic (01 case 21); a key present more than once on either side is skipped; the bar to mint anything is `MIN_EPISODE_TITLE_MATCHES = 3` and coverage `>= EPISODE_TITLE_COVERAGE = 0.6` of the candidate's non-generic titles (a fold of two equal cours scores 12/24 and is refused) | 03 section 4 rule 2; 01 R2's surviving half ("decisive between two metadata catalogues") |
| 3 | by COUNT | their count equals `runLength` exactly, `runLengthWitnesses >= 2`, and either both premieres are day precise and within 45 days or no date exists on their side: propose `SAME_AS` reason `count-exact`. Never a longer or shorter season, never nearest, never first | 01 I6, case 10 ("only exactness counts"), R7 ("nearest at any distance" gave 51 welds of 105); 03 section 4 rules 3 and 5 |

  Then the media-level verdict from the pairs:

| pairs found | their count against `runLength` | emit |
| --- | --- | --- |
| >= 2, all `toNumber` within `1..runLength` | longer (the fold, 01 case 9) | `INCLUDES(s, r)` with `fromStart/fromEnd = min/max(fromNumber)`, `toStart/toEnd = min/max(toNumber)`, `contiguous`, `aligned = pairs`, `total = their count`; the `PART_OF` stays |
| every numbered episode of theirs paired, all within the window | shorter or equal (a season still airing, 01 case 13) | `SAME_AS(s, r)` reason `aligned` through the guards; the season becomes a member and its rows are renumbered through `FILLS.number` |
| some pairs, not all | any | the per-episode links alone; the `PART_OF` stays; the page shows exactly the proven buttons |
| none | any | nothing; the refusal is written on the `LINK` as `evidence: {reason: 'no-dates' | 'retranslates' | 'no-titles'}` so it is queryable (01 case 6) |

  Pairs whose `toNumber` falls outside `1..runLength` are dropped: the previous cour lands at zero
  and below, the next above the length (02 section 2.9 gate 4). Pairs are only ever to an EXISTING
  member episode, so no pair can create a row the run's own sources do not list; that is why a
  date-proven pair does not need the two-witness bar that a count-based loan needs (**NEW** relaxation
  of 01 I9's "a LOAN is refused whole when the length is uncorroborated": the loan was placed by
  number; a pair is placed by a shared day onto a row that exists).

- **Emits** as above, every edge with `supports` naming the two episode uris and the `HAS_EPISODE`
  keys, and `confidence: 1.0` for a date pair, the coverage ratio for a title pair.
- **Failure mode, stated plainly.** Netflix: no date at any level and retranslated titles (03 unogs;
  01 R2), so nothing is minted, the run's page shows Netflix as a container link with its offer and
  no per-episode button. Open problem 3 stays open; this plugin makes the absence honest and
  queryable rather than closing it. The mapping datasets (01 R19) and the tvdb offset (01 R20) are
  not used.

#### P5 `plugin:aggregate`, the materialized view

- **Consumes** `Media`, `MediaProfile`, `LINK` (`SAME_AS`), `EPISODE_LINK`, `HAS_EPISODE`,
  `Episode`, `EpisodeProfile`. **Produces** `Cluster`, `MEMBER_OF`, `Slot`, `SLOT_OF`, `FILLS`.
  `after: [direct]` on the first iteration; re-runs whenever `LINK` or `EPISODE_LINK` moved.
- **Membership.** One query reads every active `SAME_AS` link (`MATCH (a)-[l:LINK {kind: 'SAME_AS',
  status: 'active'}]->(b) RETURN a.uri, b.uri ORDER BY a.uri, b.uri`, 7,896 edges at session scale,
  00) and every owned media uri with its effective scope. A JS union-find over the SORTED edge list
  computes components; the result equals the recursive closure of section 3.5 for every uri, and the
  harness checks that equality on the fixture corpus. A placeholder is a member only if an active
  `SAME_AS` reaches it. Every owned row is in exactly one cluster (singletons included), so the
  listing read is uniform and the singleton branch of `aggregateMedia` that skipped every
  normalization (02 section 4.1) is gone.
- **Cluster ids.** `Cluster.id` is minted once per new component and carried: when two old clusters
  merge, the larger keeps its id, ties to the lexicographically smaller `key`, and the other id joins
  `aliases`; when a cluster splits (a link was retracted), the id stays with the part holding the
  old `key`, the other part is new. This is `carryComponentId`'s rule (02 section 2.6) executed in a
  plugin pass instead of during a read, so no read ever writes. `aggUri` is `ag:(` sorted routable
  member uris `)` (02 section 4.1), and grows monotonically while the closure grows (04 contract 2).
- **Run length.** Tiered consensus over member profiles with provenance classes first: a `declared`
  count beats any number of `listLength` counts; within a class, the best score present decides the
  tier, the value most of that tier claim wins, ties go to the larger value; nothing below the tier is
  consulted (01 I11, case 45; 02 section 2.8). `runLengthWitnesses` and `runLengthFrom` name the
  agreeing members. No sum anywhere (01 R3: "five catalogues restating one packaging is ONE
  witness counted five times"). On `anilist(0.8)=13 anizip(null)=12 kitsu(0.3)=22 mal(0.9)=12`
  (01 I9): declared = mal 12, anilist 13, anizip 12; kitsu's 22 is a list length; top tier mal alone:
  12, one witness. Identical to today's answer on the 100 cluster snapshot (02 section 4.1), by
  construction of the same rule.
- **Slots.** Member episodes are `HAS_EPISODE` targets whose claimer is the member's own origin.
  Their numbering for THIS cluster is the episode's own `episodeNumber` unless an `EPISODE_LINK`
  from `plugin:range` gives a `toNumber` onto a reference member's episode (01 case 13: a view
  renumbering, now stored on `FILLS.number`, the stored row untouched). Episodes are grouped by
  `EPISODE_LINK` component and then by positive whole number inside this one cluster
  (`mergeByEpisodeNumber`, 01 case 19, I14: "safe ONLY because its input is one run"); each group
  is a `Slot` `${cluster.id}#${n}` with `FILLS {via: 'member' | 'aligned', number, supports}`.
  Unnumbered rows (specials keyed `S1`, 01 case 14) get no slot, as the resolver drops them today
  (04 section 2.1). Non-member episodes reach a slot only through an `EPISODE_LINK` pair
  (`via: 'aligned'`), only within `1..runLength`, and only onto a slot a member already fills, so a
  lent season can never add a row (01 I9, I10).
- **Trimming.** Member rows numbered beyond `runLength` from an origin in a STRICTLY lower tier than
  the length's tier are kept out of slots only when at least two members back the length and the
  backing weight is at least twice the trimmed claim's (02 section 2.9 gates 2 and 3; 01 I9's margin);
  an equal tier is never trimmed ("two 0.9 catalogues disagreeing is a disagreement"). Member rows
  are never hidden otherwise: that is how episodes that aired disappear (01 I9).
- **Anomalies** on the cluster, evaluated live (01 case 46, today tests only): `disagreeingIds` from
  refused links of that reason among the members' claims; `overLength` when slots exceed
  `runLength` with the witness count in the detail line; `contested` targets.
- **Emits** the four tables. **Failure mode.** Two asserted `SAME_AS` that are both wrong at one
  scope with no shared origin between the sides weld, as today; the difference is the weld is an
  edge with a `supports` list, deletable, and reported the moment a later id disagrees.

---

## 6. The read path

Five reads, as today (04 section 2.1): `mediaPage`, `media`, `Media.episodes`, `origin` /
`originPage`, `exportStore`, plus `ctx.findAggregatedMedia` for sources. Every one is a VIEW: it
reads plugin tables that `plugin:aggregate` and `plugin:containment` materialized, reduces fields
with a pure function, and writes nothing. The budget is 00's: 60 clusters with containers and
counts in one 49 ms query, 12 episodes in 6 ms, a cluster by materialized id in 1.7 ms.

### 6.1 A page (`mediaPage`)

One query. With no known uris the seed is every cluster, which is the whole-store fallback 04 section
2.1 calls load bearing; with `insertedUris` the seed is their clusters.

```cypher
// seeds: every visible cluster, or the clusters of $uris when given
MATCH (c:Cluster)
WHERE ($uris IS NULL OR EXISTS { MATCH (:Media)-[:MEMBER_OF]->(c) WHERE uri IN $uris })
  AND (c.scope = 'RUN'
       OR NOT EXISTS { MATCH (:Cluster {scope: 'RUN'})-[:ATTACHED_TO]->(c) })   -- hideAttachedContainers, store wide
OPTIONAL MATCH (c)<-[:MEMBER_OF]-(m:Media)
WITH c, collect(m {.uri, .origin, .owned, .raw, .score, .fieldSeq}) AS members
OPTIONAL MATCH (c)-[a:ATTACHED_TO]->(k:Cluster)<-[:MEMBER_OF]-(t:Media)
OPTIONAL MATCH (t)<-[cl:CLAIMS]-(:Media)
WITH c, members, a, k, t, collect(cl {.claimer, .node}) AS described
RETURN c, members,
       collect({cluster: k.id, scope: k.scope, uri: t.uri, origin: t.origin, raw: t.raw, described: described, via: a.via}) AS containers
ORDER BY c.key
```

A container is hidden when ANY run cluster points at it, not only one on this page. 04 section 2.1
requires the hide to run before the filter so a filtered-out run cannot leave its container behind
as an orphan card; store-wide is that requirement made exact, and a container with no run anywhere
still gets its card (02 `hideAttachedContainers`, "today's behaviour for live-action catalogues").

Then in JS: `aggregateFields` per cluster (6.3), `applyMediaFilters` unchanged and strict (02
section 4.7), search relevance and sorts unchanged (04 section 2.1). `insertedUris` are mapped to
clusters through `MEMBER_OF`, so a uri whose owner has not answered is simply absent, as today.

### 6.2 A detail view (`media`)

Two small queries rather than one clever one (00 warns that `ORDER BY` on an alias shadowing a node
variable fails, and a resolve-then-fetch reads better in a trace):

```cypher
// 1. resolve: a member uri, any member of an ag:(...) uri, or an _id (current or retired)
MATCH (c:Cluster)
WHERE c.id = $id OR $id IN c.aliases
   OR EXISTS { MATCH (m:Media)-[:MEMBER_OF]->(c) WHERE m.uri IN $uris }
RETURN c.id, c.scope, c.preferredRun, c.key
ORDER BY CASE WHEN c.scope = 'RUN' THEN 0 ELSE 1 END, c.key
LIMIT 1
```

The caller follows `preferredRun` when the resolved cluster is a container (02 `findMediaForPage`
then `preferAttachedRun`: "a show page follows to its attached run, earliest first"), and then runs
the members-and-containers query of 6.1 with `WHERE c.id = $id`, plus the parts and ranges of section
3.5 for the badges of the other direction. Yielding nothing for an empty cluster and waiting for
`view:changed` is kept (04 contract 5).

### 6.3 The aggregated Media, field by field: POLICY, therefore a plugin

`aggregateFields(cluster, members, containers) -> GQLMedia` is a pure function, registered as the
view policy, versioned like a plugin, tested on seeded clusters (section 9.3), and the only place a
field's value is chosen. It reproduces 02 section 4.1 with two changes: ties inside a score tier are
broken by uri, never by arrival order (02 section 5.3 records the reduce as "non-deterministic between
loads"); and every choice is recorded.

| field | rule | provenance recorded |
| --- | --- | --- |
| `_id` | `Cluster.id` | |
| `uri`, `id`, `origin`, `url` | `Cluster.aggUri`, its parenthesized list, `'ag'`, the app's media route | |
| `scope` | `Cluster.scope` | |
| `handles` | members as `SAME_AS` in score order then uri; containers as `PART_OF` with `node.url` from the container's own `raw` or, for a placeholder, the best-scored claimer's `node.url`; parts and proven ranges as `INCLUDES` (**NEW** output-only value of `MediaHandleRelation`, 01 case 10; the badge reader takes "SAME_AS first then anything", 04 section 2.3, playback takes SAME_AS only, so it renders as a link and never as a button) | each handle carries `via` and `by` |
| scalars: `url`, `type`, `status`, `averageScore`, `popularity`, `startDate`, `endDate`, `isAdult`, `nextAiringEpisode` | first non-null in score order, ties by uri | `{field, uri, answerSeq: fieldSeq[field], rule: 'first-non-null'}` |
| `episodeCount` | `Cluster.runLength` | `{uris: runLengthFrom, tier, witnesses, rule: 'tiered'}` |
| `season`, `seasonYear` | the pair from the highest-scored member naming a season; a cluster naming none takes the highest non-null `seasonYear` | `{uri, rule: 'season-pair'}` (01 I13) |
| `categories` | ANIME if present plus exactly one of MOVIE / SERIES, first in score order | `{uri}` |
| `genres`, `tags` | case-insensitive dedupe keeping the best-scored spelling | per value |
| `titles` | concatenated in score order, deduped on the exact string | per title, via its `score` and the member uri |
| `descriptions`, `shortDescriptions`, `covers`, `banners` | sorted by score, not deduped | per item |
| `trailers` | deduped on uri | per item |
| `relations` | from `RELATED`, deduped on `relation` and target, self edges dropped | per edge, `claimer` |
| `franchise` | the first supplier's whole graph, never spliced | `{uri}` |
| `provenance` | the list above, as a **NEW** GraphQL field `provenance: [FieldProvenance!]!` with `{field, uri, answerSeq, rule}` | |
| `anomalies` | `Cluster.anomalies`, **NEW** field | |

The hybrid row of 01 case 20 is now a row whose `provenance` names two members for two fields; the
contamination that produced it is closed upstream (cases 1, 18), and if it recurs it is visible in
the modal's trace panel (section 7.5) rather than looking like "a right row with one wrong field".

### 6.4 The episode list (`Media.episodes`)

One query from the slots, never from a media uri, so it cannot be handed a container's uris (04
section 2.1, "the most dangerous read in the tree"; 02 `sameAsHandleUris`):

```cypher
MATCH (s:Slot)-[:SLOT_OF]->(c:Cluster {id: $id})
OPTIONAL MATCH (e:Episode)-[f:FILLS]->(s)
RETURN s.id, s.number,
       collect(e {.uri, .origin, .raw, .episodeNumber, .releaseDate, .fieldSeq, via: f.via, number: f.number, by: f.by, supports: f.supports}) AS rows
ORDER BY s.number
```

`aggregateEpisodeFields(slot, rows)` per slot, as 02 section 4.2 (scalars first non-null in score
order, arrays concatenated, titles deduped) with `_id = Slot.id`, `uri = ag:(sorted row uris)`,
`episodeNumber = Slot.number` (the run's own numbering: "1 to 12, because showing 13 to 24 leaves 1
to 12 rendering as empty rows", 01 case 14), `mediaUri = Cluster.aggUri` (02 section 5.3 records
that today's aggregate loses the link back), `handles` = the rows as `SAME_AS` each with `via`, and
`provenance` per field. Playback reads `SAME_AS` handles only (04 section 2.3), and a row is a
`SAME_AS` handle only because a `FILLS` edge exists, which exists only because a member hung it or
`plugin:range` proved it: that is guarantee G1 for the play button.

### 6.5 The RUN and CONTAINER exchange and the folded season, rendered

| page | what is drawn | from which edges |
| --- | --- | --- |
| a run (cour 1 of Mushoku Tensei) | badges for its members; a badge "Crunchyroll" with the series url from Kitsu's claim node; a badge "Netflix: season 1 holds this run" with `netflix.com/title/80987039`; JustWatch offers on the show container; 11 episode rows; Crunchyroll buttons on rows 1 to 11 when `plugin:range` proved them by date; no Netflix button | `MEMBER_OF`; `ATTACHED_TO via cross-scope / asserted`; `ATTACHED_TO via count-mismatch`; `INCLUDES`; `FILLS via aligned`; the refused `LINK` for Netflix says `no-dates` |
| a folded Netflix season (`nf:80987039-1`, opened from search) | its own singleton card and page; "contains: Mushoku Tensei cour 1, cour 2" as links; 24 rows with Netflix buttons, Netflix's own titles, placeholders included (01 case 21) | its own cluster; `ATTACHED_TO via part` in the other direction; its own `HAS_EPISODE` |
| a show (`cr:G24H1N3MP` or `jw:222366`, a container cluster) | follows to its preferred run, earliest first; the run's page then lists the show as a container badge | `preferredRun`; `ATTACHED_TO` |
| a run split across catalogue seasons (01 case 10) | badges "Netflix seasons 1 to 5 split this run", links only, never episodes | `ATTACHED_TO via part` |
| a container with no run anywhere (live action) | its own card and page, its own episodes only if its members hang single-season lists (03 section 1: sources that flatten every season emit no list) | its own cluster |

### 6.6 Events and how the read stays a view

`view:changed { clusters }` replaces `media:changed` and `episode:changed`; it fires from the
scheduler after a pass, only when a cluster's membership, slots, attachments, run length or
anomalies moved, and names them. `Subscription.media` re-reads when its cluster (or an alias) is
named; `mediaPage` re-reads the named clusters and re-runs its filter, keeping the 100 ms trailing
debounce (04 section 3); `ctx.listenForMediaChanges` wakes the seven `waitForMedia` callers on any
named cluster containing their uri (04 section 1.8). An idempotent batch produces no pass output
and therefore no event, which is the contract `edge-idempotence.test.ts` pins (04 section 3).
Nothing on the read path mints an id, writes an alias, or unions: `componentId` minting on read
(02 section 2.6) and the fuzzy pass running inside `getPage` (02 section 2.7) are both gone.

---

## 7. The trace loop

### 7.1 The loop

1. **A source answers.** `Answer` rows, owned `Media` rows, `CLAIMS` to placeholders (section 4).
   Example: AniList answers `anilist:108465` with `mal:39535` SAME_AS and, through its own
   `similarMedia('cr', ...)` ask, `cr:G24H1N3MP-G609CX3J4` SAME_AS (03 anilist).
2. **The pass runs.** `profile` stamps scopes; `direct` proposes; the guards decide; `aggregate`
   materializes; `view:changed` names the cluster.
3. **An edge's target is fetchable, so it is fetched.** The resolver's `askUnasked` (04 section 2.1)
   reads the cluster's placeholders and `address` pointers and re-asks the sources whose
   `supportedUris` answer for those origins (04 section 1.5 `answersForOrigins`):

```cypher
MATCH (c:Cluster {id: $id})<-[:MEMBER_OF]-(:Media)-[cl:CLAIMS]->(t:Media {owned: false})
RETURN DISTINCT t.uri, t.origin, cl.provenance
```

   `mal:39535` is a placeholder, so jikan is asked; it answers with `anidb`/`anizip` handles;
   anizip is asked and lands the dated, titled episodes (03 anizip).
4. **A plugin matches.** With a run length and dated episodes present, `range` proves
   Crunchyroll's folded season by date and mints `INCLUDES` plus 11 episode pairs; `containment`
   attaches the show containers; the similar consumer (7.3) asks each container origin that
   implements `similarMedia` which of ITS seasons is this run, and writes the answer as an `ask`
   claim; `direct` evaluates it on the next pass like any other claim.
5. **More handles arrive**, and the loop returns to step 2.

### 7.2 What stops it

| stop | mechanism | record |
| --- | --- | --- |
| a source is asked once per question | `askUnasked` keys on (cluster id, origin, uri) and the set never shrinks within a session; the in-flight dedupe on the normalised question stays (04 section 1.6) | 04 section 2.1's termination argument, now over a cluster that can also lose members, which cannot re-trigger an ask already made |
| the similar consumer's caps | `MAX_ASKS_PER_PAIR = 4` per (cluster, container), one driver per record, `MAX_CONCURRENT_SIMILAR_MEDIA = 32`, `MAX_SIMILAR_MEDIA_PER_CALLER = 8`, `SIMILAR_MEDIA_TIMEOUT_MS = 30_000`, an answer that is not a RUN of the asked origin refused | 04 section 1.6, unchanged; 01 R15 (a re-ask on a changed question, the ceiling is one per declared origin plus one) |
| placeholders are fetched only from the page's own cluster | the query in 7.1 step 3 walks `CLAIMS` from members, never `PART_OF` or `INCLUDES` targets: a container's rows are about a show, not this run; the container page fetches its own | owner's rule |
| the closure cannot grow through a container | guard 6 and the `SAME_AS`-only closure (section 3.5) | owner's rule; 01 case 18 |
| a pass is a fixed point | a plugin's output is a function of the graph; unchanged input, unchanged output, no `view:changed`, no re-read, no re-ask; four iterations cap with a warning | section 5.3 |
| the 50 ms batch is the unit | one pass per DataLoader flush, coalesced, so 24 sources landing in a burst cost one pass each flush, not 24 | 04 section 1.3 |

### 7.3 The similar consumer

Kept as the app's own consumer (04 section 1.6), reading `ATTACHED_TO` containers instead of
`findPartOfMedia`, the run's evidence from its slots instead of the raw walk (01 R2 found the raw
walk carried both cours' titles), and writing its answer as `CLAIMS {provenance: 'ask'}` from the
run's key member to the answer's uri. The answer's own row lands through the answering extractor
(04 section 1.6) and the claim is evaluated when it does (section 4.3). Its two refusals move into
the guards: "another run of that origin is already in the cluster" is guard 4; "the answer's titles
do not name our show" stays in the consumer (`SHOW_TITLE_THRESHOLD = 0.9`, 03 section 4).

### 7.4 The SAME_AS-through-INCLUDES prohibition, end to end

Netflix's season 1 `INCLUDES` cour 1 and cour 2. Cour 2's page sees Netflix season 1 through
`ATTACHED_TO` and asks unogs which season is cour 2; unogs answers season 1 (the only candidate,
03 unogs rule 5 "first"); the consumer writes an `ask` claim `anilist:127720 SAME_AS
nf:80987039-1`; `direct` proposes; guard 6 (`contained`: an active `INCLUDES` already joins them)
refuses it, and guard 7 would have too (24 against 12). The refusal is written, the page is
unchanged, and cour 1 and cour 2 are never one cluster through Netflix. The reachable data is
`nf:80987039-1`'s own rows, which appear on the run's page only as the container badge.

### 7.5 "Why is this here": the debugging story, first class

Every question a bug report asks is one query over the tables above, and the modal runs them
behind `?trace=1` (**NEW**, the panel; 02 section 5 lists the four shapes of loss it answers):

| question | query |
| --- | --- |
| why is this uri in this cluster? | `MATCH p = (a:Media {uri: $a})-[:LINK*1..8 (r, _ \| WHERE r.kind = 'SAME_AS' AND r.status = 'active')]-(b:Media {uri: $b}) RETURN [r IN rels(p) \| {by: r.by, reason: r.reason, supports: r.supports}] LIMIT 1`, then `supports` to `CLAIMS` (`claimer`, `answerSeq`) to `Answer.raw`: the bytes the source returned |
| why is this row on this page, numbered 3? | `MATCH (e:Episode {uri: $e})-[f:FILLS]->(s:Slot)-[:SLOT_OF]->(c:Cluster {id: $c}) RETURN f.via, f.number, f.by, f.supports`, then the `EPISODE_LINK` in `supports` for its `evidence` (`{day, slack}`) |
| why is this field this value? | `provenance[field]` on the aggregate names the member uri and `answerSeq`; `MATCH (a:Answer {seq: $seq}) RETURN a.raw, a.selection, a.operation` |
| why is Netflix missing here? | `MATCH (m:Media)-[l:LINK]-(n:Media {origin: 'nf'}) WHERE m.uri IN $members RETURN n.uri, l.kind, l.status, l.reason, l.evidence` distinguishes `no-dates` from `date-window` from `never proposed` (01 case 6: four silent short-circuits must not read as four passes) |
| why did this count win? | `Cluster.runLengthFrom`, `runLengthTier`, `runLengthWitnesses`, and each member's `countKind` |
| what would this cluster be without source X? | delete nothing: `MATCH (a)-[l:LINK {kind:'SAME_AS', status:'active'}]-(b) WHERE NOT (a.origin = $x OR b.origin = $x) ...` recomputes the closure without X's rows, which is the question `exportStore` walks the asserted adjacency to answer today (02 section 5.2) |
| is the graph contradicting itself? | `MATCH (c:Cluster) WHERE size(c.anomalies) > 0 RETURN c.id, c.anomalies` |
| what did a plugin do this pass? | `MATCH ()-[l:LINK {by: $plugin, version: $pass}]-() RETURN l.kind, l.status, l.reason, count(*)` |

A bug report is therefore a cluster id and a pass number; the harness can replay the `Answer` log
of that session into an empty graph and reproduce the page (section 9.3).

---

## 8. Walkthroughs

Uris and numbers are the record's (01 group B, cases 1, 5, 6, 9, 12, 13, 15; 03 section 5; the
Mushoku fixture `tests/unit/worker/store/mushoku-parts.test.ts`). Where the record names no id, the
placeholder says so.

### 8.1 Mushoku Tensei, the fold end to end

**Rows** (owned `Media`, counts as the source publishes them, 01 group B table):

| run | members | `countKind` | start |
| --- | --- | --- | --- |
| S1 cour 1 | `anilist:108465`, `mal:39535`, `kitsu:42323`, `tvmaze:52279` | declared 11 (mal, anilist); kitsu list 11 | 2021-01-10, day |
| S1 cour 2 | `anilist:127720`, `kitsu:43907` | declared 12 | 2021-10-03 |
| S2 part 1 | `anilist:146065`, `kitsu:45950` | anilist declared 13, mal none (01 I9) | 2023-07-09 |
| S2 part 2 | `anilist:166873`, `kitsu:47694`, `anizip:18104` (episodes keyed 1..12, `episodeNumber` 13..24, absolute 38..49, 01 case 14) | declared 12 | 2024-04-07 |
| S3 | `anilist:178789`, `mal:59193`, `kitsu:49002`, `offline:mal-59193` | declared 14 | 2026 |
| catalogue | `cr:G24H1N3MP` (series, CONTAINER), `cr:G24H1N3MP-G609CX3J4` (season 1: 23 + special, listLength 24), `cr:G24H1N3MP-GS00374452` (a later season), `nf:80987039` (title, CONTAINER), `nf:80987039-1/-2/-3` (24 / 25 / 12, no date at any level), `jw:222366` (show, CONTAINER) with seasons 23 / 24 / 14 (year only), `imdb:tt13303712`, `tmdb:94664` | listLength for every season row | cr and appletv seasons: day; nf: none; jw: year |

**Claims** (`CLAIMS`, provenance `source`): anilist to mal SAME_AS; kitsu to mal and anilist SAME_AS;
kitsu `partOf` `cr:G24H1N3MP` on `kitsu:45950`, `kitsu:47694`, `kitsu:49002` (01 case 1) with the
series url in `node`; simkl and tvmaze to `imdb:tt13303712` SAME_AS stamped CONTAINER; justwatch
season to `jw:222366` PART_OF and the show-level `nf:80987039` PART_OF offer; anilist's `ask` to
crunchyroll answering `cr:G24H1N3MP-G609CX3J4` for cour 1 (03 anilist).

**Pass 1, `profile`.** Scopes: `cr:G24H1N3MP` CONTAINER (own row and three `targetScope` stamps),
`nf:80987039` CONTAINER, `jw:222366` CONTAINER, `imdb:tt13303712` CONTAINER (show-level origin),
every anime run RUN, every `nf:80987039-n` RUN (unogs stamps a season RUN, 03 unogs), `folding` on
cr, nf, jw; `retranslates` on nf; `idParent` of `cr:G24H1N3MP-G609CX3J4` is `cr:G24H1N3MP`.

**Pass 1, `direct`.** Five run clusters form by id: the guards pass every anime pair (same scope,
no disagreeing ids). `kitsu:45950 PART_OF cr:G24H1N3MP` reason `asserted`, likewise 47694 and
49002. simkl's `imdb` SAME_AS becomes `PART_OF` reason `cross-scope`. `cr:G24H1N3MP-G609CX3J4
PART_OF cr:G24H1N3MP` reason `prefix`. anilist's ask claim `anilist:108465 SAME_AS
cr:G24H1N3MP-G609CX3J4`: guard 7 fires (folding origin, listLength 24 against declared 11), the
writer downgrades to `PART_OF(anilist:108465, cr:G24H1N3MP-G609CX3J4)` reason `count-mismatch`.
No edge anywhere joins two of the five runs: what welded them before was the union through the
bare `cr:` and `nf:` ids (02 section 2.1), and both are containers here.

**Pass 1, `aggregate`.** Five run clusters with `runLength` 11, 12, 13 (one witness), 12, 14; four
container clusters. `aggUri` of cour 1: `ag:(anilist:108465,kitsu:42323,mal:39535,tvmaze:52279)`,
without the bare `cr:` and `nf:` that 01 case 6's ARM A showed inside it.

**`containment`.** `ATTACHED_TO` from cour 1: to `cr:G24H1N3MP-G609CX3J4`'s cluster via
`count-mismatch`, to the `imdb` cluster via `cross-scope`, to the `jw:222366` cluster via
`asserted`. The series `cr:G24H1N3MP` is one hop further, through the season's `prefix` edge, and is
not attached from cour 1: a second hop is never walked. Cour 1's own Kitsu record carries no
Crunchyroll claim (01 case 1: its link is an older slug-only url that was declined). The
`cr:G24H1N3MP` container cluster is attached from S2 part 1, S2 part 2 and S3 through kitsu's
`asserted` claims, and its `preferredRun` is S2 part 1, the earliest `startDay` among them.

**`title`.** Year bucket 2021 holds cour 1 and cour 2; gate 3 refuses them: 2021-01-10 against
2021-10-03 is 266 days, outside 45 (01 case 36). `nf:80987039` sits in no bucket: unogs deletes the
season row's date and the title's `2021-01-01` is `month-or-year`, so its `startDay` is NULL and its
`year` is 2021: it is compared, title matches, scopes differ, `PART_OF(anilist:108465, nf:80987039)`
reason `cross-scope`. This is the edge 01 case 6 saw as a bare `nf:` INSIDE the cluster; here it is
a container link outside it.

**The similar consumer.** From cour 1's page: asks `cr`, `nf`, `jw` (three containers, three
implementers, 03 section 4). Crunchyroll answers season 1 by date (rule 1) and it is the same
`count-mismatch` downgrade. unogs: no date, titles retranslated, rule 4 year against season 1 which
holds 24 over 11, fold veto, refusal (01 case 37: "Netflix refuses season 1 of Mushoku Tensei, whose
11 episodes match no season now"). justwatch: `seasonPick=undefined` (01 case 9), `showAsContainer`,
the offers ride the `jw:222366` container. Cour 2's page: unogs answers nothing; the `ask` claim
never exists.

**`range`, cour 1.** Candidate: `cr:G24H1N3MP-G609CX3J4` (PART_OF `count-mismatch`, folding). Ours:
anizip is not yet present for cour 1 in this walkthrough (its `mal:39535` placeholder triggers the
jikan then anizip re-ask in 7.1 step 3), so once anizip lands: reference episodes 1..11 dated
weekly from 2021-01-10 (UTC days), theirs 1..24 dated the Tokyo day (01 case 13's slack). Rule 1
pairs their 1..11 with ours 1..11, `MIN_ALIGNED` met, no day names two references. Their 12..23
fall on cour 2's days, which are not reference days here: unpaired. Emits eleven `EPISODE_LINK`
and `INCLUDES(cr season 1 to anilist:108465, fromStart 1, fromEnd 11, toStart 1, toEnd 11,
contiguous, aligned 11, total 24)`. The same pass on cour 2's cluster pairs their 12..23 with
cour 2's 1..12 and emits `INCLUDES(..., fromStart 12, fromEnd 23, toStart 1, toEnd 12)`. The
special (position 24, or unnumbered) pairs with nothing.

**`range`, Netflix.** No candidate: `nf:80987039-1` was never proposed against cour 1 (unogs refused
the ask, so no `ask` claim exists), and a stale bookmark carrying it is an `address` claim, never
consumed (section 3.3). Nothing is minted; the consumer's refusal is written on the `LINK` to
`nf:80987039` as `evidence: {reason: 'no-dates'}`.

**`aggregate` again.** Cour 1: 11 slots; `FILLS` from anizip (`via member`, numbers 1..11), from
kitsu's numbered rows (`member`), and from the eleven Crunchyroll episodes (`via aligned`, numbers
1..11, `supports` the pairs). S2 part 2: anizip's rows keyed 1..12 fill slots 1..12 (the key is
what the extractor publishes, 01 case 14); Crunchyroll's season for it, if it folds part 1 and part
2 as one season of 24, is proven by dates onto 1..12 the same way.

**The page runs** the resolve, the members-and-containers query and the slot query (6.2, 6.4).

**What the user sees**, cour 1: badges AniList, MAL, Kitsu, TVmaze (members), Crunchyroll (the
season badge "holds this run, episodes 1 to 11", carrying the season row's own url, which is the
series page, 03 crunchyroll),
Netflix "season 1 holds this run" with the title url, JustWatch offers, IMDb. Eleven rows, each with
anizip's title, date and thumbnail, a Crunchyroll play button whose `via` reads `aligned by dates`,
and no Netflix button. `episodeCount` 11 with `provenance` naming mal and anilist. S2 part 1:
`runLength` 13 from AniList's declared count, one witness (01 I9); anizip and kitsu list 12, so 12
slots and no `overLength` (12 is under 13, not over); the card's `episodeCount` 13 carries
`provenance {witnesses: 1}`, which the trace shows. The 24-row page (01 I10) cannot be
drawn: a non-member row reaches a slot only through a proven pair onto an existing member row.

### 8.2 The Elusive Samurai, the renumbering

**Rows** (01 case 13): `anizip:18903` (count 12, episodes 1..12 weekly from 2026-07-17, no row
score), `mal:60059` (0.9, declared 12), `anilist:182616` (0.8, declared 12), `kitsu:49265` (0.3,
list 12), `cr:GQWH0M19X-GS00366034` (0.5, listLength 8, episodes numbered 13..20 on the first eight
of the same days). Crunchyroll enters through AniList's `ask` (03 anilist) as a `SAME_AS` claim.

**`direct`.** Guard 7: folding origin, listLength 8 against declared 12: `count-mismatch`, downgraded
to `PART_OF(anizip cluster's key member, cr season)`. Four metadata rows form the run cluster,
`runLength` 12 with three declared witnesses.

**`range`.** Rule 1: reference days from anizip, 1..12; theirs 13..20 on days 1..8 (Tokyo, one day
of slack). Eight pairs, `fromNumber` 13..20, `toNumber` 1..8, all inside `1..12`. Every numbered
episode of theirs is paired and their count is shorter: `SAME_AS(cr season, run)` reason `aligned`
through the guards (no fold, same scope, no disagreeing ids). Crunchyroll becomes a member.

**`aggregate`.** Twelve slots; `FILLS` for the Crunchyroll rows carry `number` 1..8 from the pairs'
`toNumber`; the stored rows keep 13..20 (02 section 2.9: "the stored node keeps Crunchyroll's own
number"). No twentieth row.

**What the user sees.** Twelve rows numbered 1 to 12, Crunchyroll play buttons on 1 to 8, each
button's trace reading `aligned by dates, 2026-07-17 (cr 13 = anizip 1)`. The record's "unaligned 13
to 20 fails the window and all eight rows are dropped, so Crunchyroll disappears" (01 case 13's cost)
no longer happens when the dates agree; when they do not (a season with no dates), the eight rows
stay off the page, which is the same trade the record accepts.

### 8.3 Blue Exorcist, the special that broke the offset vote

**Rows** (01 case 15, R1): Netflix title `70304252`, season 1 has 26 rows for a 25 episode run;
position 14 is epid `80005451` "Runaway Kuro", a special that aired after the run ended. The
catalogue run's ids are not in the record (`anilist:<Blue Exorcist>` below). Our side has 25
episodes dated by anizip.

**Refuted approach not repeated.** A title-vote offset scored `[[0,12],[1,11]]`, answered offset 0
by one vote, and put 13 wrong playable urls on the page (01 R1). Here no offset exists: only pairs.

**`range`.** Rule 1 cannot fire (Netflix has no dates). Rule 2 is refused: `retranslates`. Rule 3:
26 is not 25. Nothing is minted; the `LINK` from the run to `nf:70304252-1` stays `PART_OF` reason
`count-mismatch` with `evidence: {reason: 'retranslates'}`.

**What the user sees.** A Netflix badge with the title url, 25 rows, no Netflix buttons, no wrong
buttons. The trace answers "why no Netflix" with `retranslates`.

**What it would take.** If a source with dates carried this season (Crunchyroll, Apple TV), rule 1
would pair positions 1..13 to 1..13 and 15..26 to 14..25 as two runs of pairs, and position 14 to
nothing: the piecewise mapping 01 case 15 asks for, with no vote anywhere. Mushoku's own season 2
("Fitz the Guardian" as a special at position 1, regular 1..12 at 2..13) is the same shape and the
same outcome.

### 8.4 Fullmetal Alchemist, 64 episodes in five Netflix seasons

**Rows** (01 case 10): one catalogue run of 64 (the record cites `mal:5114` as a real MAL id in case
40; AniList and Kitsu ids are not in the record, `anilist:<fma>`), Netflix title
`nf:<fma>` (not in the record) with seasons `-1..-5` of about 13 each, no dates.

**`direct` and the consumer.** unogs asked which season is our run: every season holds fewer than
64, the year rule would pick season 1 (01 case 10's BAKI weld went exactly this way, "measured, not
reasoned"), so the exactness rule of `range` rule 3 is what governs here and it refuses: 13 is not
64, and rule 4 (year) of `pickSimilarSeason` is not carried into the plugin at all for a count
mismatch (01 R7). Any `ask` claim naming a season is downgraded by guard 7 to `PART_OF(season, run)`
reason `count-mismatch`, part into whole by episode count.

**`containment`.** Five `ATTACHED_TO via part` edges from the run cluster to five season clusters;
the bare title `nf:<fma>` is a container via `cross-scope`.

**`range`.** No dates, retranslated titles: nothing per episode.

**What the user sees.** The run's page: 64 rows from its own sources, a Netflix badge for the title
and "Netflix splits this run into seasons 1 to 5" as links. Each Netflix season's own page (from
search): 13 rows with Netflix buttons and "part of Fullmetal Alchemist". BAKI (anidb 12569, 26
regular, `nf:80204451` three seasons of 13) renders the same way, which is the correct outcome the
year rule denied it.

### 8.5 The show-level id that must never weld: Kitsu's Crunchyroll series url

**Rows** (01 case 1): `kitsu:45950`, `kitsu:47694`, `kitsu:49002` each carry
`https://www.crunchyroll.com/series/G24H1N3MP/mushoku-tensei-jobless-reincarnation`; kitsu's
extractor emits it as `partOf(cr:G24H1N3MP)` (03 kitsu: SAME_AS only for a film under the `nf:title`
/ `nf:watch` allowlist). Suppose a future extractor, or a plugin source, emitted it as SAME_AS
instead (the mistake the schema doc calls "the single most expensive mistake available here").

**Claims.** Three `SAME_AS` claims into `cr:G24H1N3MP` from three runs.

**`profile`.** `cr:G24H1N3MP`'s scope: CONTAINER from its own crunchyroll row when present (`scopeOf`
returns CONTAINER for the bare series id, 03 crunchyroll) or, when absent, from any `targetScope`
stamp; if a rogue source stamped nothing and crunchyroll never answered, the scope is NULL and the
claims wait (guard 1).

**`direct`.** With the scope CONTAINER: three `PART_OF` edges reason `cross-scope`. If crunchyroll
answered RUN for a bare series id (it does not, but suppose): three `SAME_AS` proposals into one
target from clusters carrying `kitsu:45950`, `kitsu:47694`, `kitsu:49002`, three ids of one origin,
none a prefix of another: guard 5 marks all three `contested` and none is written active (01 case 11:
"evaluated where both claimants are visible"). The record's outcome, three seasons in one component
(01 case 1's 24 rows), is unreachable by either path.

**What the user sees.** Three separate cards; each page shows a Crunchyroll badge with the series
url from the claim's `node`; the trace shows the three edges as `PART_OF cross-scope` or `refused
contested`. The film collections (`cr:GQWH0M1GG` on fifteen Kitsu film records, 01 case 41) behave
identically: fifteen `PART_OF` edges to one container, fifteen cards.

---

## 9. What is kept, what goes

The yoga server per source, the urql client per source, the fan-out, `useOnResolve`, the three
DataLoaders, the `similarMedia` contract, the plugin source protocol (`stub-source@1`, 04 section 4)
and every extractor stay. What changes is the store and the two policies that ran inside reads.

### 9.1 Every current store export, and what replaces it (02 section 1)

| export | replaced by |
| --- | --- |
| `types.ts` enums (`MediaType`, `MediaSeason`, `MediaStatus`, `MediaCategory`, `MediaScope`, `MediaRelation`) and the `Title`, `Cover`, ... row types | kept as the GraphQL-side types; `seed.ts` keeps mirroring them (04 `offline/seed.test.ts` stays KEEP) |
| `HandleRelation` (`SAME_AS`, `PART_OF`) | `CLAIMS.kind`; the GraphQL enum gains an output-only `INCLUDES` (section 6.3) |
| `Relation`, `FranchiseNode`, `FranchiseEdge`, `Franchise` | `RELATED` edges and `raw.franchise` |
| `Media`, `Episode`, `Origin` store row types | `Media.raw`, `Episode.raw`, `Origin.raw` plus the typed projections; the TS types become the row shape of the projection query |
| `createUnionFind`, `createGraph` and every method (`set`, `registerLabel`, `setLabel`, `labeled`, `get`, `has`, `alias`, `resolve`, `link`, `connect`, `neighbours`, `root`, `componentId`, `edge`, `targets`, `sources`, `cluster`, `clusters`, `clear`) | LadybugDB. `link` and `componentId` are `plugin:aggregate`; `connect`/`edge` are `CLAIMS` and `LINK`; `alias`/`resolve` are `Cluster.aliases`; `clear` is a fresh worker |
| `lastWriteLongestArray` | the ingest field merge (section 4.3), same rule, loser archived in `Answer` |
| `HAS_EPISODE_LABEL`, `IDENTITY_LABELS`, `ASSERTED_LABELS` | the `HAS_EPISODE` table; `Cluster.scope`; the `CLAIMS` table, which is the asserted record with claimer and answer |
| `graph` (the singleton) | the worker's LadybugDB connection, held by the ingest and the plugin runner |
| `upsertMedia` | `ingest.media(rows, claims)` (section 4.2); the scope ratchet, placeholder rule, pending claims and relation derivation move to `plugin:profile` and `plugin:direct` |
| `linkSameMediaPairs`, `linkSameContainerPairs`, `linkPartOfPairs` | the writer's guards and downgrade (section 5.2) |
| `findAggregatedMedia` | the resolve query (6.2) plus members; `ctx.findAggregatedMedia` for sources reads the same |
| `findPartOfMedia`, `findRunsOfContainer`, `preferAttachedRun`, `findMediaForPage`, `hideAttachedContainers` | `ATTACHED_TO`, `Cluster.preferredRun`, the page query's hide clause (6.1, 6.2) |
| `findAllAggregatedMedia` | the page query (6.1) |
| `upsertEpisodes` | `ingest.episodes` |
| `findRunEpisodes`, `findAggregatedEpisodesForMedia`, `mergeByEpisodeNumber` | `Slot` / `FILLS` materialized by `plugin:aggregate`; the slot query (6.4). `mergeByEpisodeNumber`'s rule survives inside P5 |
| `resetStore` | a fresh in-memory database per test (the harness, 9.3) |
| `upsertOrigins`, `findOrigin`, `findOrigins` | `ingest.origins`, `MATCH (o:Origin ...)`; the `every`-filter bug (02 section 5.3) is fixed on the way |
| `removeDuplicatesByField`, `sameAsHandleUris`, `recursivelyUnwrapMediaHandles` | `aggregateFields` internals; the slot read needs no SAME_AS filter; the handle walk in the ingest (section 4.2 step 5), stopping at PART_OF as before |
| `aggregateMedia`, `aggregateEpisode` | `aggregateFields`, `aggregateEpisodeFields` (6.3, 6.4), pure, with provenance |
| `tieredConsensus`, `runLength` | `plugin:aggregate`'s run length with provenance classes |
| `alignmentOffset`, `alignRunEpisodes`, `runEpisodes` | `plugin:range` rule 1 (pairs, not an offset) and P5's slots, window and trimming |
| `Anomaly`, `clusterAnomalies` | `Cluster.anomalies`, evaluated every pass |
| `normalizeToStoreMedia` | gone: rows are kept as returned. Its two invariants survive elsewhere: "absence is null, never undefined" is the projection query's contract; "scope defaults to RUN" becomes `MediaProfile.scope` from evidence (section 5.4 P0) |
| `MediaPageFilters`, `applyMediaFilters` | kept verbatim (04: "the whole distance between what the user asked for and what the page lists") |
| `ExportedCluster`, `StoreExport`, `ExportOptions`, `exportStore` | kept as an envelope; the walk becomes a query over `CLAIMS` with `provenance IN ['source','ask']` (never a plugin `LINK`, never a plugin source's rows, 04 contract 10), `excludeOrigins` not walked through, `passThroughOrigins` walked and dropped, output sorted (02 section 4.8) |
| `emit`, `listen`, `listenIterator`, `listenMultipleIterator`, `debouncedListenIterator` | kept; the event set becomes `graph:changed`, `view:changed { clusters }`, `origin:changed { ids }`, every payload populated (section 6.6) |
| `profileCluster`, `fuzzyMergeMediaClusters` | `plugin:profile` (per row) and `plugin:title` |

### 9.2 The 74 tests, by 04's verdicts

| verdict | files | what happens |
| --- | --- | --- |
| KEEP verbatim (55) | the 9 worker files (`backoff`, `plugin-sources`, `request-context`, `similar-document`, `store/consensus` pure half, `store/filter`, `store/merge-fixtures` answers, `store/mushoku-parts`, `store/season-separation`, `store/season-weld`), the 4 router files, the 42 source files | untouched, except that `consensus`, `merge-fixtures`, `mushoku-parts`, `season-separation` and `season-weld` are driven through the new harness (`seed` then `runPasses`) with their assertions unchanged: their answers "do not come from the implementation" (04 `merge-fixtures.ts:11-17`) |
| REWRITE (18) | `similar-consumer`, `store/aggregate-fields`, `store/arrival-order`, `store/container-page`, `store/container-scope`, `store/db`, `store/edge-idempotence`, `store/episode-merge` (the read half), `store/export`, `store/fuzzy-merge`, `store/normalize`, `store/part-of-subtree`, `store/part-of`, `store/stable-id`, `offline/seed-source`, `offline/seed-build`, `offline/seed` (conditional) | same behaviour, rewired: `arrival-order` seeds claims before rows and asserts the same clusters in both orders; `container-scope` asserts the guards' table; `fuzzy-merge`'s cases become `plugin:title`'s spec; `stable-id` asserts `Cluster.id` across growth, aliases and the container cut; `edge-idempotence` asserts no `view:changed` on a re-asserted claim; `export` asserts the `CLAIMS`-only walk; `normalize` shrinks to the projection contract |
| DROP (1) | `store/graph.test.ts` | its `lastWriteLongestArray` cases move to the ingest's field-merge test (section 4.3) |

Adjacent tests that pin store output (04 section 5.5: `urql-keys`, `uri`, `uri-aggregated`,
`franchise-layout`, `relation-lanes`, `relation-labels`, `listed-media`, `theater`, `theater-hold`,
`thumbnails`, `release-date`) stay green because `_id`, `ag:(...)`, `relations`, `franchise`,
`covers`, `thumbnails` and `releaseDate` keep their shapes (04 section 6).

### 9.3 The new test surface

- **A fixture corpus of `Answer` logs.** Real resolver return values recorded from sessions behind
  `?export=answers` (the successor of `?export=store`, 04 section 2.3), starting with the
  2026-08-31 payloads `merge-fixtures.ts` already carries and the five walkthroughs of section 8.
  Replay writes them into an empty graph through the real ingest; the page rendered from the
  replay must equal the page recorded with them, byte for byte after sorting (01 I15).
- **`seed(rows, claims, episodes)`**: writes source tables directly for a test that wants a graph
  shape without a source. **`runPasses()`** runs the pipeline to its fixed point.
  **`runPlugin(id)`** runs exactly one plugin and, around it, (a) hashes every source row and edge
  and asserts equality (isolation, section 5.3), (b) runs it a second time and asserts an empty
  writer delta (idempotency), (c) asserts the materialized closure equals the recursive one of
  section 3.5 for every uri touched. A plugin is therefore tested in isolation on a seeded graph
  with the other plugins' output either seeded or absent.
- **Refusals are assertions with a control.** A test that expects `refused: count-mismatch` also
  seeds the exact-count sibling and expects `active`, so a test that cannot express the failure
  reports nothing (the "check the checker" rule the record applies to every rig).
- **Every case in 01 part 1 is a fixture** with its `Must express` line as the assertion, grouped A
  to G, and every refutation in 01 part 2 is a negative fixture that asserts the refuted outcome is
  NOT produced (R1: no `FILLS` on Blue Exorcist position 14 and beyond; R3: the count on Mushoku S1
  part 1 is 11 with the streaming tier present; R4: a season-silent pair still merges).
- **The trace queries of 7.5 are tests**: each is run against the walkthrough graphs and its
  answer pinned.

---

## 10. Migration

Each step leaves the app running; a flag gates every new read until its step lands.

| step | work | ships |
| --- | --- | --- |
| 1, a day | `@ladybugdb/wasm-core` in the worker, `setWorkerPath` to the 22.1 MB engine in `public/` (00), the schema of section 2 created at start, the ingest of section 4 as a TEE beside `upsertMedia`/`upsertEpisodes`/`upsertOrigins`: every batch writes both stores. No read changes. `?trace=1` runs the 7.5 queries against the shadow. `?export=answers` dumps the `Answer` log | the bug-report-as-a-query story on production data, today's app untouched. Cost: 188 ms init, 2.6 s for a session-sized graph (00), and the download the owner must accept (section 11) |
| 2 | `plugin:profile`, `plugin:direct`, `plugin:aggregate`, `plugin:containment` and the writer with its guards, in the shadow. A comparison harness logs every cluster where the shadow's membership differs from the union-find's, with the reason | the diff report is the acceptance test for step 3; the fixture corpus starts here |
| 3 | `Subscription.media` and `Media.episodes` switch to the shadow behind `?store=graph`: the resolve, members and slot queries of section 6. `_id` changes once for every cached media (04 section 2.3) | the detail page and the episode list on the new store; `mediaPage` still old |
| 4 | `plugin:title` replaces `fuzzyMergeMediaClusters`; `mediaPage` switches; the fuzzy pass no longer runs inside `getPage`; `view:changed` carries cluster ids and `mediaPage` re-reads only those | the listing on the new store; the whole-store re-read on every event gone (02 section 2.7) |
| 5 | `plugin:range`; `lendContainingSeason`, `alignRunEpisodes`, `runEpisodes` deleted; crunchyroll answers its own season; the similar consumer reads `ATTACHED_TO` and writes `ask` claims | the fold and the renumbering as plugin output with proof |
| 6 | `buildHandlesFromUri` stamps `provenance: 'address'`; the old store (`graph.ts`, `db.ts`, `fuzzy-merge.ts`, `consensus.ts`, `anomalies.ts`, `normalize.ts`) deleted; `exportStore` walks `CLAIMS`; the flag removed | one store |
| 7 | extractor changes that unlock evidence: tvmaze, trakt, simkl, tvdb emit the episode dates they already fetch (03 section 3); `startDatePrecision` on `Media` for extractors that know it (01 case 33: the priced 0.52%); anizip's row `score` (01 case 44) becomes moot because the count vote reads classes | more pairs proven by date; more January premieres kept |

Step 1 is the smallest thing that is worth shipping: it is additive, gated, and measured under
stub's own Vite already (00).

---

## 11. Risks, and the decisions only the owner can make

### 11.1 Risks

| risk | what is known | mitigation |
| --- | --- | --- |
| `MERGE` on a relationship pattern with properties, and `DETACH DELETE` of plugin nodes, are not in 00's verified list | 00 verified `MERGE` on nodes and `DELETE e` on edges by property | one measurement in step 1; the fallback is a read-then-`CREATE` in the ingest and edge deletion before node deletion in the writer |
| pass cost under 24 sources landing every 50 ms | a candidate scan is 35 ms, membership 1.7 ms, 2,000 nodes in 107 ms (00); the title plugin's pairwise loop is today's cost bound (36 alignments per pair, 02 section 2.10) | every plugin is delta-scoped; the title plugin compares only clusters whose profile changed against their buckets; the fixed point is capped at four; a pass that exceeds the 50 ms schedule is coalesced, never queued behind |
| P5's JS union-find reads every active `SAME_AS` each pass | 7,896 edges at session scale (00) is a few ms | fine to ~100k edges; beyond that, an incremental component index, which is a plugin-internal change |
| the first `_id` change breaks the urql cache once | 04 section 2.3 | step 3 ships with a cache version bump |
| a 22.1 MB engine download on every cold load | 00 | the owner's call (11.2); the engine is cached by the service worker after the first load |
| guard 5 (`contested`) refuses two correct claims when one is a real weld and the other a real sameness | 01 case 11's residue is 11 of 105; the record's direction is refuse (I2) | `plugin:range` can still prove one side by date; the refusal is queryable and the case is a fixture |
| the two-witness relaxation for date-proven pairs (P4) is NEW | reasoned, not measured: a pair lands on an existing member row, so it cannot add a row | pinned by the I9 fixture: Mushoku S2 part 1 with one witness must still draw 12 rows and never 24 |
| the store-wide hide of attached containers differs from today's page-scoped rule | 04 section 2.1's ordering requirement is what it makes exact | a fixture with a run filtered out and its container asserted hidden |
| per-episode Netflix on a folded cour stays missing | 01 open problem 3: no episode-level identity is published; R2, R19, R20 all refuted | stated as the failure mode; the page is honest about it |
| the fixed-point cap of four passes | a cycle `direct` to `aggregate` to `title`/`range` to `aggregate` converges in two or three iterations on the walkthroughs | the cap logs; a fifth pass would only add links a further pass would add anyway on the next flush |

### 11.2 Decisions for the owner

1. **`address` claims as pointers** (section 3.3): a handle rebuilt from the address bar never
   enters the closure. This closes 01 open problem 2 ("a uri-derived handle should be a POINTER
   rather than an assertion ... it needs the owner") and open problem 1's likely bridge; the cost
   is that a bookmark of a cluster no source currently describes shows only what sources answer.
2. **Contested claims refuse both sides** (guard 5) rather than first-in-sorted-order wins. I2 says
   refuse; the alternative keeps five correct handles per suspect one (01 R8's arithmetic) but
   welds one in ~10.
3. **The diacritic fold**: `titleKeysFolded` exists from step 2; turning `foldDiacritics` on needs
   the measurement 01 I8 asks for (the 150-season gate's exchange rate with folding), which the
   harness can run over the corpus in step 4.
4. **`provenance`, `anomalies` and `INCLUDES` on the GraphQL surface**, and the `?trace=1` panel in
   production builds. They are the debugging story; they are also new public fields.
5. **The two-witness relaxation for date-proven pairs** (P4): keep it, or hold a proven pair to the
   loan's bar as well.
6. **Where the 22.1 MB engine loads**: on every cold load (the shadow runs for everyone from step
   1, which is what makes production bug reports replayable) or only behind `?trace=1` until step 3.
7. **Whether refused edges are kept in `LINK`** (this proposal) or in a separate `Verdict` table.
   Kept in `LINK` they are one query away from the active ones; separate, the `LINK` table holds
   only truths.

### 11.3 The fifteen invariants

None is dropped. Each survives by construction or is strengthened:

| invariant | how it survives |
| --- | --- |
| I1 irreversibility | there is no union; every merge is a `LINK` edge with `by`, deletable, recomputed from evidence; the identity structure is rebuilt each pass |
| I2 the exchange rate | the guards refuse and the writer downgrades to `PART_OF`; the container link and its offers survive every refusal, so refusing costs a button, never a badge (01 R8's 66 handles stay) |
| I3 the scope ratchet | `MediaProfile.scope` reads every answer and stamp, so CONTAINER once said is CONTAINER; the owner's row keeps its own last word; a view, not a write |
| I4 an id reproducible by a second observer | sources still mint ids; the `disagreeing-ids` guard is the second observer at runtime; no plugin mints a uri |
| I5 provenance | `Answer` log, `fieldSeq`, `claimer`, `by`/`reason`/`supports`, `provenance[]` on the aggregate; the four shapes of loss each answered in 7.5 |
| I6 folded cours | guard 7 and `INCLUDES`; the fold veto in both directions (case 10) by exactness |
| I7 retranslated titles | `retranslates` refuses rule 2 for Netflix |
| I8 the diacritic gate | 0.90 unchanged; the fold is an alternate key behind a flag |
| I9 the 13 versus 12 length | classes-first tiers; a loan is never a row; a pair lands only on an existing row |
| I10 the 24 versus 2x12 fold | slots are filled by members and proven pairs only, windowed to `1..runLength` |
| I11 the tier rule | verbatim in P5, classes added, no sum |
| I12 main titles only | the profile reads `titles` and nothing else |
| I13 the season pair | `aggregateFields` takes both from one member |
| I14 grouping by number only inside one run | P5 groups inside one cluster; the slot read cannot be handed a container |
| I15 determinism | sorted edges, id carry by size then key, ties by uri, no minting on read |
