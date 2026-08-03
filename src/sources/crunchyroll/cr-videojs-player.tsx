import type { Frame, RemoteVideoElement } from '@fkn/lib'
import type { ComponentChildren, FunctionComponent } from 'preact'

import type { PlayerCapabilities } from '../../components/player'

import Player from '../../components/player'
import { seekCrunchyrollTimeline } from './cr-native-controls'

// a bare `video.currentTime` setter only lands inside Bitmovin's already-buffered range, so writes are replayed onto `.timeline-slider`, a native `<input type="range">` whose `max` is the duration in seconds
const SEEK_REASON = 'Seeks the video to the point you pick on the timeline.'

const seekViaTimeline = (frame: Frame, value: number) => {
  seekCrunchyrollTimeline(frame, value, SEEK_REASON)
    .catch(err => console.warn('[cr] timeline seek failed:', err))
}

// @fkn/lib's RemoteVideoElement already satisfies video.js v10's structural "media" contract, so no compatibility shim is needed
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

// the iframe renders *inside* the skin's Container: the player fullscreens its Container element, and the `pointer-events: none` iframe lets taps land on the skin's gesture layer above it
const CrunchyrollVideoJSPlayer = ({ remote, frame, capabilities, children }: Props) => (
  <Player remote={remote} frame={frame} adapter={withTimelineSeek} capabilities={capabilities}>
    {children}
  </Player>
)

export default CrunchyrollVideoJSPlayer as FunctionComponent<Props>
