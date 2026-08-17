# Anime data

Two databases are merged at build time into the artifacts stub loads lazily. They have different
licenses, and this directory exists to keep the ODbL one apart from stub's own MIT code.

## manami-project/anime-offline-database

`src/generated/anime-index.ts` and `src/generated/anime-seasons.ts` are built from
[anime-offline-database](https://github.com/manami-project/anime-offline-database) by manami-project,
made available under the **Open Database License (ODbL) v1.0**.

- Full license: [`LICENSE-manami.txt`](./LICENSE-manami.txt), also at <https://opendatacommons.org/licenses/odbl/1-0/>
- Contents are under the Database Contents License (DbCL) v1.0.
- Those artifacts are a Derivative Database under section 4.4, so **they are offered under the ODbL**,
  not under stub's MIT license.
- Each one repeats the license and the source url both in a header comment and in a `license` field,
  per section 4.2(b), which wants the notice to travel inside the database as well as in the docs.

What is kept per entry: the MyAnimeList, AniList, Kitsu and AniDB ids, and for the seasonal window
only, the title, type, episode count, cover path and score. Everything else upstream carries
(synonyms, studios, producers, tags, related anime, duration, thumbnails) is dropped.

Nothing generated is committed. `npm run build` fetches the newest release every time, so a deploy is
never older than the last one published. A build cache under `node_modules/.cache` keeps repeat local
builds off the network; a CI checkout has none, so CI always fetches. If the fetch fails with no
cache, the build fails rather than quietly shipping without the data.

Still outstanding for section 4.3, which asks for a notice on the Produced Work: the rendered app
does not yet name the source anywhere a user can see. The footer already carries the version and
build commit and is the obvious place for it.

## @kawaiioverflow/arm

[arm](https://github.com/kawaiioverflow/arm) is an npm dependency (MIT), pinned by
`package-lock.json`. It supplies MyAnimeList to AniList mappings and carries no titles, covers or
seasons.

## Why both

A wrong id is unrecoverable downstream: the store's union-find has no unlink, so one bad row welds
two unrelated shows together for the worker's lifetime. Neither database is clean alone. manami has
48 rows holding two ids from a single catalog, and its own README reports the data as 65% reviewed;
the two disagree outright on a handful of MyAnimeList ids. Holding both is what makes those
detectable, and the build drops every row they contradict each other on rather than picking a
winner.
