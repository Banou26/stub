### This current file SHOULD NOT BE COMMITED

Alright so, since we encountered some really nasty source edge cases, we need to fix our architecture.

First of all, the datastore. Instead of rolling our own, let's use https://www.npmjs.com/package/@ladybugdb/core, it's old name is KuzuDB. It's basically a graph database that we can use CYPHER queries with and it runs in the browser.

I want us to keep the graphql design, where we have a yoga server and urql clients querying the sources. It's clean and simple, allows us to make targeted long lived queries.

One thing we should change though is, once results/data return from these sources, we should insert them in the graph db and keep them as originally returned.

We should keep the handle system that links items to each others, but we shall refine it to better handle edge cases.
In every handles, we should have: Edge and Node, Node are the usual Media type, the actual source result. Edge are the relationships between nodes.
And it's in those Edges that we need to add the needed variants/types/fields to better handle edge cases.

So, for example, one of the edge case we encountered was:

MyAnimelist and Anilist have: Mushoku Tensei S1, Mushoku Tensei S1 Court 2, Mushoku Tensei S2, Mushoku Tensei S2 Part 2, Mushoku Tensei S3
Netflix and crunchyroll have: Mushoku Tensei S1, Mushoku Tensei S2, Mushoku Tensei S3

How we managed to handle this edge case(half successfully) was that we ended up:
matching crunchyroll episode dates to MAL/Anilist episode dates
matching netflix by comparing the episode's titles with the crunchyroll episodes that got matched by date through MAL/Anilist, because netflix doesn't have episode dates.

This is very inconvenient. We are missing important data like dates, title names might differ from platform to platform, some platforms might not even have handles linking to them.
We need a unified, consistent and resilient system that can handle edge cases like these.
Maybe something like the core graph with the original sources fetching, and then around that, we could probably have the aggregated result system done in sorts of plugin layers, so e.g if two anime link to each others and declare themselves as precise matches, we merge them as usual into the aggregated entry, then if the source declares itself as non precise, e.g netflix/crunchyroll, instead of taking them as a "SAME_AS" edge, we could treat them as "PART_OF"/"INCLUDES" edges kind of.
Also, because we are now going to keep the edge direction for these links, we can revert/trace paths to better improve sourcing.
For the "INCLUDES"/"PART_OF" edges we could treat a range of episodes as part of another source's season. so e.g crunchyroll's 1-12 = MAL/Anilist's season 1, and crunchyroll's 13-24 = MAL/Anilist's season 2, and so on.
That merging behavior could be an additional plugin layer that runs after the core graph aggregation. And so each merging behavior is composable and very targeted at merging specific types of edges.
This allows us to keep a clean codebase, and easily extend new behavior to try and handle as many edge cases as we possibly can.
These plugins are NOT allowed to modify the original source results/data nodes/edges, they should only be able to create and modify new nodes and edges in the graph.

So, core graph database, then plugins that can create and modify nodes and edges in that database.
Default plugins:
  - Direct Edge Merging(simply),
  - Title matching
  - Season/Episode range matching(based on episode count, episode titles, episode release date)
  - ect...

This also makes it easy to trace changes, e.g if a source adds an edge, if that edge is supported in the sources, we can instantly start fetching it, if a plugin then manages to match that new edge with another edge in the graph, we can automatically compute improved data and fetch even more sources if that new edge contains even more related handles, but we should be careful to check precisely what kind of edge type the related nodes are, because we wouldn't want to merge "SAME_AS" nodes that come from a "Includes" as it would contain data that might not precisely be related to our original media.
Also this allows us to make an extensive testing suite for both the core and the plugins, so that we can make sure edge cases are handled correctly and consistently, and that we don't introduce any regressions.

The goal of this refactor is try to squash out random bugs i encounter when using the app, and try to make the whole codebase/architecture simpler/easier to maintain and reason about.


If you want to use sub-agents, use Fable 5.1 for all of the design decision making / important stuff, and opus for all of the rest.
