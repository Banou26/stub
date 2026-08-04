import type { Resolvers } from './generated/schema/types.generated'

// only Subscription.media and Subscription.mediaPage subscribe generators are served, with an empty resolver ctx

export type StubSource = {
  // contract: every top-level media a plugin yields must carry its declared origin or the worker drops it (enforcePluginOrigin); nested handles are exempt, cross-origin handles are how clustering works
  /** unique lowercase origin slug, e.g. 'myanime' - all yielded media must carry it */
  origin: string
  originUrl: string
  name: string
  icon?: string
  color?: string
  isApiOnly: boolean
  metadataOnly?: boolean
  resolvers: Resolvers
  /**
   * Render this source's own picker for the given handle uris. Stub shows the package's frame with
   * `packages.show` and awaits this call; the resolution IS the pick.
   */
  selectRelease?: (uris: string[]) => Promise<string | null>
  /**
   * Play a release inside the package's own frame, resolving true once its player is up.
   *
   * Declaring this is what makes a source self-playing: stub MOUNTS the package into its player area
   * with `packages.mount` and calls this on that connection, so the package renders inside stub's
   * layout and fullscreens with it. Stub never learns how the source plays anything, which is the
   * point: a torrent index can hand its release to a torrent client without stub knowing torrents
   * exist.
   */
  play?: (release: { uri: string, url?: string }) => Promise<boolean>
}

/**
 * What a plugin serves: one source, or a family of them.
 *
 * A source in a family is an ordinary standalone source that happens to arrive over a shared
 * connection. Each registers under its own origin with its own name, icon and colour, and each fails
 * on its own: a malformed or colliding source is skipped and reported while its siblings serve
 * normally, so grouping sources into one package never makes them more fragile than shipping them
 * separately. They are torn down together when the package disconnects.
 */
export type StubPluginAPI = StubSource | { sources: StubSource[] }

export const STUB_SOURCE_PROTOCOL = 'stub-source@1'
