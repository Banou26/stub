// Split out of ./urql.ts so it can be tested: that module imports urql itself, and through it a
// CommonJS require of react that cannot load outside a browser. Same reason sources/aired-date.ts is
// its own file.
import type { KeyingConfig } from '@urql/exchange-graphcache'

import type { Episode, Media, MediaTrailer, PlaybackSource } from './generated/schema/types.generated'

/**
 * How graphcache identifies each type in the schema.
 *
 * A type with no identity of its own answers null, which tells graphcache to embed it in its parent
 * rather than normalise it. `satisfies KeyingConfig` does NOT force exhaustiveness, so a type missing
 * from here compiles and type-checks, and shows up only as a dev-console warning while the cache
 * invents a key for an object that has none. tests/unit/urql-keys.test.ts is what actually pins it.
 */
export const keyResolvers = {
  Media: (media) => (media as Media)._id,
  // An EDGE has no identity of its own: it is a relation between two rows, and the row it points at is
  // keyed by its own `_id`. Null tells graphcache to embed it in its parent rather than normalise it.
  // Omitting these compiles, because `satisfies KeyingConfig` does not force exhaustiveness, and shows
  // up only as a dev-console warning while the cache invents keys for unkeyable objects.
  MediaHandle: () => null,
  EpisodeHandle: () => null,
  MediaTitle: () => null,
  MediaDescription: () => null,
  MediaShortDescription: () => null,
  MediaCover: () => null,
  MediaBanner: () => null,
  MediaAiringEpisode: () => null,
  MediaTrailer: (trailer) => (trailer as MediaTrailer).uri,
  Episode: (episode) => (episode as Episode)._id,
  EpisodeTitle: () => null,
  EpisodeDescription: () => null,
  EpisodeShortDescription: () => null,
  EpisodeThumbnail: () => null,
  PlaybackSource: (playbackSource) => (playbackSource as PlaybackSource).uri,
} satisfies KeyingConfig
