import type { Frame, RemoteVideoElement } from '@fkn/lib'
import type { ComponentChildren, FunctionComponent } from 'preact'

import Player from '../../components/player'
import type { PlayerCapabilities } from '../../components/player'

// Crunchyroll ships Bitmovin for playback. Bitmovin drives its own MSE
// segment fetcher off *its* UI events, not off raw `video.currentTime`
// writes - so a bare setter only lands inside the already-buffered
// range; anything outside lets the browser fire `seeking` but no bytes
// get fetched and the video hangs. CR's timeline is a native
// `<input type="range">` (`.timeline-slider`) whose `max` matches the
// duration in seconds; driving it with the locator's `fill` makes
// React's onChange fire, which tells Bitmovin's scheduler to seek and
// re-fetch segments just like a user drag. So we intercept `currentTime`
// writes and replay them onto that slider - no arbitrary-code bridge
// into the frame, just a named element with a numeric value through the
// existing locator actions.
const CR_TIMELINE_SELECTOR = '.timeline-slider'
const SEEK_REASON = 'Seeks the video to the point you pick on the timeline.'

// The published @fkn/lib types `fill` as (value, OperationTimeoutOptions)
// and don't yet surface the permission `reason`; narrow to the shape we
// rely on so the reason rides along - harmlessly ignored by builds that
// predate it.
type SeekableLocator = { fill: (value: string, options?: { reason?: string }) => Promise<unknown> }

const seekViaTimeline = (frame: Frame, value: number) => {
  (frame.locator(CR_TIMELINE_SELECTOR) as unknown as SeekableLocator)
    .fill(String(value), { reason: SEEK_REASON })
    .catch(err => console.warn('[cr] timeline seek failed:', err))
}

// video.js v10 decouples its store from the DOM: "media" is a structural
// contract (EventTarget + play/pause/buffered/…), not a literal
// HTMLMediaElement. @fkn/lib's RemoteVideoElement already satisfies it -
// real TimeRanges for buffered/seekable, a MediaError for error, plus
// seeking/load/readyState - so no compatibility shim is needed; the text
// -track feature self-skips when `textTracks` is absent. The only
// wrapping left is the seek interception: a `set` trap that replays
// `currentTime` onto CR's timeline while the optimistic write still falls
// through to the handle so the scrubber UI reflects it immediately.
const withTimelineSeek = (remote: RemoteVideoElement, frame: Frame) =>
  new Proxy(remote, {
    set(target, prop, value, receiver) {
      if (prop === 'currentTime' && typeof value === 'number' && Number.isFinite(value)) {
        seekViaTimeline(frame, value)
      }
      return Reflect.set(target, prop, value, receiver)
    },
  })

type Props = {
  remote: RemoteVideoElement | null
  frame: Frame | null
  capabilities?: PlayerCapabilities
  children?: ComponentChildren
}

// The CR iframe renders *inside* the skin's Container (as its first
// child) for two reasons the sibling layout couldn't satisfy:
//   1. Fullscreen - the player fullscreens its Container element, so the
//      iframe carrying the actual video must live inside it, or
//      fullscreen shows only the transparent skin.
//   2. Pointer events - the iframe is `pointer-events: none` (its CR
//      chrome is hidden anyway), so taps land on the skin's gesture layer
//      above it (tap → play/pause, double-tap → fullscreen) instead of
//      falling through to a dead iframe. The skin keeps its default
//      pointer handling; no root override needed.
const CrunchyrollVideoJSPlayer = ({ remote, frame, capabilities, children }: Props) => (
  <Player remote={remote} frame={frame} adapter={withTimelineSeek} capabilities={capabilities}>
    {children}
  </Player>
)

export default CrunchyrollVideoJSPlayer as FunctionComponent<Props>
