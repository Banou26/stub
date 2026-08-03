import type { Resolvers } from './generated/schema/types.generated'

// only Subscription.media and Subscription.mediaPage subscribe generators are served, with an empty resolver ctx

export type StubSource = {
  // contract: every top-level media a plugin yields must carry its declared origin or the worker drops it (enforcePluginOrigin); nested handles are exempt, cross-origin handles are how clustering works
  origin: string
  originUrl: string
  name: string
  icon?: string
  color?: string
  isApiOnly: boolean
  metadataOnly?: boolean
  resolvers: Resolvers
}

export type StubPluginAPI = StubSource | { sources: StubSource[] }

export const STUB_SOURCE_PROTOCOL = 'stub-source@1'
