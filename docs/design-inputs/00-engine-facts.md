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
