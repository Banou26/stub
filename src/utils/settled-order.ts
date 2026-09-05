// Keep a listing's order still once it has one, so late data changes what a card SAYS and never where
// it SITS. No app imports, so it can be tested: the vitest project picks up src/worker, src/sources
// and src/utils only.

/** Only the part of a media this reads. Structural, so any listing can use it. */
export type Orderable = { _id?: string | null, uri?: string | null, popularity?: number | null }

const keyOf = (media: Orderable): string => media._id ?? media.uri ?? ''

/**
 * The listing in a stable order: everything already placed keeps its place, everything new is
 * appended in the order the resolver gave it.
 *
 * Measured on the deployed home page 2026-09-06: the top ten changed five times over twenty seconds,
 * settling at 2.0 s and then reordering AGAIN at 9.0 s, when positions 2 and 3 swapped. The listing
 * sorts on popularity and re-sorts on every store change, so a show the bundle carries no count for
 * sits low, then jumps the moment a live source supplies one. The owner's words: "the top10 list keeps
 * changing for like freaking 10-15 seconds, I don't want that".
 *
 * Placement is remembered by cluster `_id`, which rides the union-find root and survives a cluster
 * gaining members, so a merge keeps a card where it was rather than moving it. A card whose `_id`
 * changed is simply new and appends.
 *
 * This does not slow anything down or hide anything: every field still updates in place, the titles
 * and covers still sharpen as sources answer, and a genuinely new show still appears. It only refuses
 * to move a card the user has already seen.
 */
export const settledOrder = <T extends Orderable>(nodes: readonly T[], placed: readonly string[]): T[] => {
  const rank = new Map(placed.map((key, at) => [key, at]))
  const known: T[] = []
  const fresh: T[] = []
  for (const node of nodes) (rank.has(keyOf(node)) ? known : fresh).push(node)
  known.sort((a, b) => rank.get(keyOf(a))! - rank.get(keyOf(b))!)
  return [...known, ...fresh]
}

/** The keys of a listing, in the order it is currently shown: what to remember for the next update. */
export const orderKeys = (nodes: readonly Orderable[]): string[] => nodes.map(keyOf).filter(Boolean)
