import type { Frame } from '@fkn/lib'
import type { Media } from '@videojs/core/dom'

import { css } from '@emotion/react'
import { useEffect } from 'preact/hooks'
import { videoFeatures } from '@videojs/core/dom'
import { createPlayer, useMediaAttach } from '@videojs/react'
import { VideoSkin } from '@videojs/react/video'
import '@videojs/react/video/skin.css'

// Structural shape for the handle returned by @fkn/lib's
// `videoElement()` action — see player.tsx for the longer note.
type VideoHandle = EventTarget & {
  currentTime: number
  volume: number
  muted: boolean
  playbackRate: number
  readonly duration: number
  readonly paused: boolean
  readonly ended: boolean
  readonly readyState: number
  readonly currentSrc: string
  readonly buffered: ReadonlyArray<{ start: number; end: number }>
  play(): Promise<void>
  pause(): void
}

// Video.js v10 decouples the player store from the DOM: its "media"
// object is a structural contract (EventTarget + play/pause/…/buffered),
// not a literal HTMLMediaElement. `VideoHandle` from @fkn/lib already
// covers most of the surface, but is missing a few fields the core
// feature set's capability detectors look for (`seeking`, `load`,
// `seekable`, `error`, `textTracks`) and returns `buffered` as a plain
// `Array<{start, end}>` rather than the `TimeRangeLike` shape the
// buffer feature wants. A Proxy patches those in-place so video.js's
// feature attach succeeds, without touching the underlying handle.
const adaptVideoHandle = (handle: VideoHandle): Media => {
  const emptyRanges = { length: 0, start: () => 0, end: () => 0 }
  const asTimeRanges = (arr: ReadonlyArray<{ start: number, end: number }> | undefined) => ({
    length: arr?.length ?? 0,
    start: (i: number) => arr?.[i]?.start ?? 0,
    end: (i: number) => arr?.[i]?.end ?? 0,
  })
  return new Proxy(handle as unknown as Record<string, unknown>, {
    get(target, prop) {
      if (prop === 'seeking') return false
      if (prop === 'load') return () => {}
      if (prop === 'seekable') return emptyRanges
      if (prop === 'error') return null
      if (prop === 'textTracks') return { length: 0, [Symbol.iterator]: function*() { /* empty */ } }
      if (prop === 'buffered') {
        return asTimeRanges((target as unknown as VideoHandle).buffered)
      }
      return Reflect.get(target, prop)
    },
  }) as unknown as Media
}

const { Provider } = createPlayer({ features: videoFeatures })

const MediaAttach = ({ handle }: { handle: VideoHandle }) => {
  const setMedia = useMediaAttach()
  useEffect(() => {
    if (!setMedia) return
    setMedia(adaptVideoHandle(handle))
    return () => setMedia(null)
  }, [handle, setMedia])
  return null
}

// The skin root passes pointer events through so clicks on empty video
// area can still reach CR's iframe below; the controls / overlays /
// popovers reclaim `pointer-events: auto` so buttons still respond.
const POINTER_EVENTS_OVERRIDE = `
  .media-default-skin .media-controls,
  .media-default-skin .media-controls *,
  .media-default-skin .media-error,
  .media-default-skin .media-error *,
  .media-default-skin .media-popover,
  .media-default-skin .media-popover * {
    pointer-events: auto;
  }
`

type Props = { readonly handle: VideoHandle }

const CrunchyrollVideoJSPlayer = ({ handle }: Props) => (
  <Provider>
    <MediaAttach handle={handle} />
    <style>{POINTER_EVENTS_OVERRIDE}</style>
    <VideoSkin
      css={css`
        position: absolute;
        inset: 0;
        border-radius: 0.8rem;
        /* The v10 media-default-skin--video preset otherwise paints a
           solid black background that would hide the CR iframe's
           pixels; force-transparent the root + the variant selector. */
        background: transparent !important;
        &.media-default-skin--video {
          background: transparent !important;
        }
        pointer-events: none;
      `}
    />
  </Provider>
)

export default CrunchyrollVideoJSPlayer
