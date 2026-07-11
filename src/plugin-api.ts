import type { Resolvers } from './generated/schema/types.generated'

// The contract a stub source plugin exposes over its FKN packages connection (protocol
// 'stub-source@1'): the same shape as a built-in source module in src/sources, served as the
// plugin's osra payload via `packages.onConnect(() => source satisfies StubPluginAPI)`.
//
// Supported resolvers are Subscription.media and Subscription.mediaPage subscribe generators.
// They run inside the plugin's own sandbox frame: network goes through the plugin's own @fkn/lib
// `fetch` (its own quota and identity, never stub's) and the resolver ctx is empty - stub's
// privileged context (store reads, user keys) never crosses the connection.

export type StubPluginAPI = {
  /** unique lowercase origin slug, e.g. 'myanime' - all yielded media must carry it */
  origin: string
  originUrl: string
  name: string
  icon?: string
  color?: string
  isApiOnly: boolean
  metadataOnly?: boolean
  resolvers: Resolvers
}

export const STUB_SOURCE_PROTOCOL = 'stub-source@1'
