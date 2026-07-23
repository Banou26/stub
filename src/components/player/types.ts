import type { Frame, RemoteVideoElement } from '@fkn/lib'
import type { Media } from '@videojs/core/dom'

// One selectable item in a capability menu (a subtitle language, an audio
// track, a quality level).
export type PlayerChoice = {
  id: string
  label: string
  description?: string
  disabled?: boolean
}

// A source-controlled selection the player renders a menu for. The source
// stays authoritative: it supplies the options, the current selection, and
// performs the change in `onSelect` (usually by driving the underlying
// site's own player through the frame). Omitting the whole capability from
// `PlayerCapabilities` means the source offers no such control, so the
// player renders nothing for it.
export type PlayerSelection = {
  // Accessible name, used for the trigger label and menu heading.
  label: string
  options: readonly PlayerChoice[]
  selectedId: string | null
  onSelect: (id: string | null) => void | Promise<void>
  // When set, an explicit "off" entry is prepended that selects null
  // (fitting for subtitles; audio and quality normally omit it).
  offLabel?: string
}

export type PlayerCapabilities = {
  subtitles?: PlayerSelection
  audioTracks?: PlayerSelection
  qualityLevels?: PlayerSelection
}

export type PlayerMediaBinding = {
  media: Media
  dispose?: () => void
}

// Per-source hook that shapes the raw media handle before it attaches to the
// player: intercepting seeks, adding optimistic state, or translating events.
// Returning null skips attachment (e.g. the frame is not ready yet). Return
// either the adapted media or a { media, dispose } binding when the adapter
// holds listeners/timers that need cleanup.
export type PlayerMediaAdapter = (
  remote: RemoteVideoElement,
  frame: Frame,
) => Media | PlayerMediaBinding | null
