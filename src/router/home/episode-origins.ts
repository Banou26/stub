/**
 * Which origins an episode row may show a source for.
 *
 * Read off the episode's own SAME_AS handles, never off its uri. `aggregateEpisode` hands a cluster of
 * ONE its single member's raw uri rather than an `ag:(...)` one (worker/store/aggregate.ts:403-409),
 * so parsing the uri answered nothing for every episode that exactly one source knows. `originPage`
 * then yields nothing at all for an empty id list (worker/resolvers/origin/index.ts:48), and the row
 * rendered with zero icons while holding a perfectly playable url. Netflix is where that surfaced: an
 * episode only Netflix has showed no source, which reads as a missing source rather than as a row that
 * cannot name the one it has.
 *
 * SAME_AS only, matching the source list the modal builds from these ids. A PART_OF handle names a
 * DIFFERENT episode, so an icon minted from one would route playback at the wrong stream.
 */
export const episodeOriginIds = (
  episode: { handles?: readonly { relation: string, node: { origin: string } }[] | null } | null | undefined
): string[] => [...new Set(
  (episode?.handles ?? [])
    .filter(handle => handle.relation === 'SAME_AS')
    .map(handle => handle.node.origin)
)]
