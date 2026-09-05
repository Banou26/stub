// The document the `similarMedia` funnel subscribes with, in its own module so a test can parse and
// validate it: worker/extractor.ts reaches urql and cannot load under vitest.

/**
 * What an ask selects off an answer. The store does not read it: `useOnResolve` in the extractor fires
 * on the RESOLVER'S RETURN VALUE, not on the selection set, so the full row is inserted whatever is
 * asked for here. The caller needs enough to build a handle, the scope the answer is checked against,
 * and the titles for the consumer's which-show check.
 *
 * The titles are selected WHOLE. A caller that attaches the answer as a handle writes the node back to
 * the store as a row, where an array of equal length replaces the one it finds, so titles selected as
 * `{ title }` alone cost crunchyroll's rows their language and score (2026-09-05). Every field of
 * `MediaTitle` is here so that row is complete whoever writes it.
 */
export const SIMILAR_MEDIA_DOCUMENT = `
  subscription SimilarMedia($input: SimilarMediaInput!) {
    similarMedia(input: $input) {
      uri
      origin
      id
      url
      scope
      titles { language title score }
    }
  }
`
