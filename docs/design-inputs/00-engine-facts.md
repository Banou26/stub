# LadybugDB, as measured on 2026-09-11 (not as documented)

Package: `@ladybugdb/wasm-core` 0.20.4, DEFAULT variant (single threaded, async: the engine runs in its own
Web Worker, nested inside stub's existing worker). `@ladybugdb/core` is the Node native addon and is not
usable in the browser. No persistence (owner's decision): in-memory for the worker's lifetime.

## Verified in a real headless Chromium under stub's Vite (vp, Vite 8.1.3)
- init 188 ms, first query round trip 273 ms. The lbug client bundles to a 54 KB worker chunk; the engine is
  one 22.1 MB `lbug_wasm_worker.js` served from `public/` and named by `lbug.setWorkerPath()` before any call.
- Every call is an async round trip to the nested worker (about 1 to 2 ms floor). Batch writes with
  `UNWIND $rows AS r CREATE (...)`: 2,000 nodes in 107 ms, against 935 ms one execute per row (18x).
- `conn.query` THROWS on a binder error (it does not return isSuccess false). Params are strictly typed: a
  STRING param into a DATE column is a binder error; write `date($x)` in the query.
- `ORDER BY` on an alias that shadows a node variable fails (`Order by NODE is not supported`).

## Supported, exercised
- `CREATE NODE TABLE T(uri STRING PRIMARY KEY, raw JSON, titles STRING[], meta STRUCT(...), tags MAP(STRING,STRING), d DATE, at TIMESTAMP DEFAULT current_timestamp())`.
  One label per node (no multi label). Primary key: STRING, numeric, DATE or SERIAL.
- `CREATE REL TABLE R(FROM A TO B, FROM A TO C, FROM C TO C, relation STRING, by STRING, score DOUBLE, episodeFrom INT64, episodeTo INT64, evidence JSON)`:
  one rel table may span several FROM/TO pairs and carries typed properties.
- JSON is native: a JSON string param lands in a JSON column, reads back as a string, `json_extract(m.raw, 'episodeCount')` and `to_json({...})` work.
- `MERGE (m:Media {uri: $uri}) ON CREATE SET ... ON MATCH SET ...` with params. MERGE is all or nothing over its pattern.
- Filtered variable length paths: `MATCH (a)-[e:CLAIMS*1..3 (r, _ | WHERE r.relation = 'INCLUDES')]->(b)`, and undirected `-[...]-`.
- `NOT EXISTS { MATCH ... }` subqueries, `OPTIONAL MATCH`, `collect(DISTINCT ...)`, `count(DISTINCT ...)`, `WITH ... LIMIT`.
- `DELETE e` on edges selected by a property (`{by: 'plugin:range'}`): a plugin can retract its own output.
- Multi statement `query("...; ...")`. Returned nodes carry `_label` and `_id {offset, table}`; rels carry `_src`, `_dst`.

## Read costs on a session sized graph (5,796 media in 1,000 clusters of 3 to 8 rows across 8 origins, 7,896 edges, 2,400 episodes; inserted in 2.6 s)
- component of one uri over SAME_AS only, recursive 0..8 hops: 6.8 ms; by a materialized `clusterId` property: 1.7 ms
- a 60 cluster page with containers and episode counts in ONE query: 49 ms
- the 12 episodes of one run, ordered: 6 ms
- a plugin candidate scan (`mal` rows with no `nf` SAME_AS partner, NOT EXISTS): 35 ms
- a dense random graph (2,000 nodes, 6,000 edges, 1..10 hops) recursive component: 1,033 ms. So: a plugin
  materializes cluster membership; the read path never recurses per request.

## Measured on 2026-09-12 while building the Answer log (step 1a)

- The nine spellings section 11.1 of the specification listed as unmeasured are ALL exercised on 0.20.4:
  a struct literal inside `collect`; the named filtered variable-length path (`LINK*0..8`, undirected,
  two-clause filter; self is included at 0 hops); `MERGE` bound to an `UNWIND` variable with `ON CREATE`
  and `ON MATCH`; a correlated `NOT EXISTS` naming an `UNWIND` variable; `CASE` as a projected column
  beside `DISTINCT`, ordered by the alias; `SET` on a relationship matched by property; `IN` over a
  `STRING[]` column; `coalesce` in a `WHERE` and a projection; `count(DISTINCT ...)` under a `WHERE` on
  the edge. `tests/unit/worker/graph/spellings.test.ts` asserts the exact rows each returns, and its
  control (`ORDER BY` a node) is refused, so the harness can report a refusal.
- **An object parameter binds as a STRUCT, and a `MAP` column refuses it.** Write a map as
  `map($keys, $values)`; that spelling works inline and inside an `UNWIND` struct.
- **`WITH x ORDER BY ...` without `SKIP` or `LIMIT` is refused.**
- **An empty `STRING[]` reads back as NULL.** Normalize on the way out.
- `BOOLEAN` and `MAP(STRING, INT64)` columns load and carry values; the specification's DDL is kept
  verbatim (24 tables, `IF NOT EXISTS` throughout).
- **`openGraph()` resolves before the DDL has run** (several awaits earlier), so a reader can meet
  `Binder exception: Table Answer does not exist` 300 ms into a 470 ms boot. Every reader and writer
  goes through `graphReady()`, which awaits the schema; pinned in `tests/unit/worker/graph/ready.test.ts`.
- The Answer log on one real page fan-out (`/media/ag:(anilist:108465)`, 24 sources): 843 to 896 rows,
  1.6 to 1.9 MB of raw, the first row 1.7 to 2.1 s after navigation, read back in 41 to 61 ms.

## Measured on 2026-09-12 while building the ingest (step 1b)

How a JS param becomes a column value is the whole of this section, and each line below rejected or
corrupted a WHOLE batch rather than one row.

- **A struct field is typed from the FIRST row of the `UNWIND` list.** A field that is an empty list
  in row one and a filled list in row two binds as `LIST(ANY)` and the statement dies at RUNTIME with
  `Trying to a create a vector with ANY type. This should not happen.`, after the binder passed it.
  `cast(r.x AS STRING[])` does NOT rescue it, and the reverse order (filled first) works, which is
  what makes it read as a data problem rather than a spelling one. It cost a real page 148 of its 816
  answers, visible only because the browser arm reads the row counts back.
  **So no list travels as a list**: join it into a STRING and split it in the statement, where the
  type is written down, with the empty case spelled as NULL:
  ```cypher
  UNWIND $rows AS r MERGE (m:Media {uri: r.uri})
  ON CREATE SET m.categories = CASE WHEN r.categories = '' THEN cast(NULL AS STRING[])
                               ELSE string_split(r.categories, $separator) END,
    m.fieldSeq = CASE WHEN r.fieldKeys = '' THEN cast(NULL AS MAP(STRING, INT64))
                 ELSE map(string_split(r.fieldKeys, $separator), cast(string_split(r.fieldSeqs, $separator) AS INT64[])) END
  ```
  `string_split` exists, takes the separator as a param (a NUL works), returns `['']` for an empty
  input, and `cast(<STRING[]> AS INT64[])` parses element by element.
- **A column whose param is null in EVERY row binds as STRING**, so `m.episodeCount = r.episodeCount`
  dies with `has data type STRING but expected INT64` on a batch where nobody stated a count.
- **`cast(<INT64> AS DOUBLE)` REINTERPRETS the bits rather than converting.** A DOUBLE field holding
  `0.5` in one row and the integer `3` in the next reads back as `1.5e-323`. Nothing errors.
- Both are answered by the same rule: **every typed scalar travels as a STRING and is cast in the
  statement**. `cast('3' AS DOUBLE)` is 3.0, `cast('12' AS INT64)` is 12, `cast(NULL AS T)` is NULL,
  and it binds identically whether or not any row in the batch carries a value.
- **An INT64 may only be offered a SAFE integer.** `String(1e21)` is `'1e+21'` and
  `cast('1e+21' AS INT64)` fails with `Conversion exception: Cast failed`. `Number.MAX_SAFE_INTEGER`
  round trips.
- 2,000 rows through `MERGE ... ON CREATE SET ... ON MATCH SET` with those spellings: 434 ms (against
  107 ms for 2,000 plain `CREATE`s), so a MERGE-shaped batch is about 4x a create-shaped one.
- `MATCH (a:Media)-[c:CLAIMS {key: k}]->(b:Media)` under `UNWIND` reads an edge back by property, and
  `WHERE NOT EXISTS { MATCH (a)-[:CLAIMS {key: h.key}]->(b) } CREATE ...` is idempotent on a re-run.
- The ingest on one real page (`/media/ag:(anilist:108465)`, 24 sources, 2026-09-12): 824 answers
  become `Media` 673, `Episode` 263, `Origin` 24, `CLAIMS` 683, `HAS_EPISODE` 263, `RELATED` 7,
  `ABOUT` 824. Replaying 800 recorded rows of one page costs 1,444 ms in one batch, 2,608 ms over the
  22 flush-sized batches a live page actually writes, and 150 ms on a second identical pass, which
  writes nothing.

## Measured on 2026-09-12 while building the plugin runtime (step 2a)

- **An empty `UNWIND` list dies at runtime** (`Trying to create a vector with ANY type`): never run a
  statement with no rows; skip it.
- **A node that still carries an edge cannot be deleted with `DELETE n`**; use `DETACH DELETE` when a
  plugin retracts a node another plugin's edge may hang off.
- **`json_extract` returns a JSON string WITH its quotes** (`"RUN"`, not `RUN`); parse it.
- The writer parses column types and FROM/TO pairs out of `GRAPH_SCHEMA` itself, so it cannot disagree
  with `schema.ts` about a type. A pass over 800 recorded rows: 1,188 ms the first time (audit 181 ms of
  it), 307 ms the second, which writes nothing.

## Measured on 2026-09-12 while building the guards and `plugin:direct` (step 2b)

Every spelling the nine guards of 5.2 needed, each exercised by
`tests/unit/worker/graph/plugins/guards.test.ts` against 0.20.4:

- **A SELF LOOP is legal on a rel table.** `MATCH (a:Media {uri: $x}), (b:Media {uri: $x}) CREATE
  (a)-[:LINK {...}]->(b)` creates an edge whose `_src` and `_dst` are one node, and it reads back
  with `a.uri = b.uri`. So the `self` refusal of 5.2 is a ROW rather than a silence.
- **An UNDIRECTED match with a struct param under `UNWIND`**:
  `UNWIND $pairs AS p MATCH (a:Media {uri: p.a})-[l:LINK {status: 'active'}]-(b:Media {uri: p.b})`.
  Both fields are STRINGs in every row, which is what keeps the struct out of the `LIST(ANY)` trap.
  It matches a self loop for `p.a = p.b`.
- **A list literal in a `WHERE`**: `WHERE l.kind IN ['PART_OF', 'INCLUDES']`.
- **Two comma-separated patterns under `UNWIND`**, which is how a profile and its own `Media` row are
  read in one statement: `UNWIND $uris AS u MATCH (p:MediaProfile {uri: u}), (m:Media {uri: u})`.
- **`RETURN DISTINCT` over a named filtered variable-length path under `UNWIND`**:
  `UNWIND $uris AS u MATCH (a:Media {uri: u})-[e:LINK*0..8 (r, _ | WHERE r.kind = 'SAME_AS' AND
  r.status = 'active')]-(b:Media) RETURN DISTINCT u AS uri, b.uri AS member`. One walk per uri is
  6.8 ms on a session sized graph, so the guards read the active `SAME_AS` edge list once instead and
  union them in JS; the test asserts the two agree uri by uri.

Costs, on the same 800 recorded rows the ingest and the profile were measured on: a pass of
`plugin:profile` then `plugin:direct` is **1,880 ms over 2 iterations** (the audit 178 ms of it), and
the second pass over the same graph is **560 ms in 1 iteration and writes nothing**.

## Measured on 2026-09-12 while building plugin:aggregate (step 2c)

- **The engine cannot be closed and reopened in one process**: `closeGraph()` resolves and the next
  `openGraph()` never settles (20 s timeout, node, 0.20.4). A harness resets by truncation:
  `MATCH (n:T) DETACH DELETE n` over the node tables empties the rel tables with them, 9 ms on a
  case-sized graph (245 ms on a process's first call, engine warm-up).
- **`ingestAnswers` has no dedupe of its own**: two byte-identical answers in one batch die with
  `Found duplicated primary key value` and take the batch with them; `answers.ts` dedupes in the flush
  window, so any caller bypassing the log owes the same.
- A row with no cluster must come back ABSENT, not as a null row: `UNWIND $uris AS u MATCH (m:Media
  {uri: u})-[:MEMBER_OF]->(c:Cluster)` as its own statement is the working spelling.
- A full pass over 800 recorded rows with profile, direct and aggregate: 3,212 ms, three iterations,
  audit about 190 ms of it; the second pass 856 ms writing nothing. The corpus (249 cases, both
  orders, 16,926 answers) replays through the new store in 354 s.

## Measured on 2026-09-12 while building plugin:containment (step 2d)

- **`distinct` is a RESERVED WORD as a column alias.** `RETURN p.countDistinct AS distinct` dies with
  `Parser exception: mismatched input 'distinct' expecting {ADD, ALTER, ...}` listing every keyword it
  wanted instead, which reads as a broken statement rather than as a name collision.
- **Two aggregations over one group are UNMEASURED** (`count(s)` beside `max(s.number)` under one
  `RETURN`), so `over-length` returns one row per slot and counts in JS. Same reasoning as the JSON
  struct above: a spelling the binder accepts and the runtime refuses costs a whole statement.
- **A rel row whose endpoint names a row that is not of the declared label writes NOTHING and reports
  nothing.** The writer's `CREATE` matches `(b:Cluster {id: $to})`, so an `ATTACHED_TO` built with a
  `Media.uri` in place of a `Cluster.id` matches no pattern, creates no edge and raises no error; the
  desired row is still missing on the next pass, so the plugin rewrites it forever and the ONLY
  symptom is `fixed-point-cap` at the end of the pass (5.3). A test that asserts the pass carries no
  `fixed-point-cap` anomaly is what catches this class.
- Costs, 800 recorded rows, profile then direct, aggregate and containment: a pass is **4,832 ms over
  4 iterations** (the fourth applying nothing, so no cap is reported), `plugin:containment` 159 to
  199 ms of each; the second pass **975 ms in 1 iteration writing nothing**. The corpus (249 cases,
  both orders) replays through the four plugins in **391 s**.

## Measured on 2026-09-12 while building plugin:range (step 2f)

- **Row order inside an `ORDER BY` tie is NOT stable between two passes in one process.** Two
  `PART_OF` rows reach one season (`plugin:direct`'s `asserted` beside `plugin:containment`'s
  `span`), the scan returns one row per link per episode, and a `supports` list derived in scan
  order flipped between two spellings from one pass to the next: 11 `EPISODE_LINK` rows rewritten
  every iteration and `fixed-point-cap` reported on about half the runs. Any list a plugin derives
  from a scan and writes onto a row is sorted first; pinned by a test whose mutation reverses the
  sort.
- **An undirected `-[l:LINK]-` with a property `WHERE` and an `s.uri <> r.uri` guard** works, which
  is how the class 1 scan sees a `PART_OF` whichever way it points (a downgrade points from the
  shorter side to the longer, so a run-to-season scan written directed never sees 8.4's seasons).
- **A list literal in a `WHERE` OR'd with a bare `BOOLEAN` column**, `coalesce(ps.countDistinct,
  ps.countStated)` in a projection, and an `ORDER BY` mixing a relationship property with a node
  property: all exercised on 0.20.4.
- **A JSON column inside a `collect({...})` struct is UNMEASURED**, and the failure mode of a struct
  the binder accepts is a runtime death, so `plugin:range` returns flat rows and groups them in JS.
- Costs, 800 recorded rows, profile then direct, aggregate, containment and range: a pass is
  **4.6 to 6.8 s over 3 iterations**, `plugin:range` 199 to 437 ms of each iteration; the second
  pass 1.2 to 1.7 s in 1 iteration writing nothing. The recorded page contributes 7 pairs, 0 ranges
  and 0 refusals on its own (no source ships `containing` yet, so class 1 is nearly empty on a real
  page and the transitional lend of 4.4 carries what there is).
