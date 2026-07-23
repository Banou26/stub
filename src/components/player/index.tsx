import type { Frame, RemoteVideoElement } from '@fkn/lib'
import type { Media } from '@videojs/core/dom'
import type { ComponentChildren, FunctionComponent } from 'preact'
import type { PlayerCapabilities, PlayerMediaAdapter, PlayerMediaBinding } from './types'

import { css } from '@emotion/react'
import { useEffect } from 'preact/hooks'
import { videoFeatures } from '@videojs/core/dom'
import { createPlayer, useMediaAttach } from '@videojs/react'
import '@videojs/react/video/skin.css'

import VideoSurface from './video-surface'

const { Provider } = createPlayer({ features: videoFeatures })

const normalizeBinding = (value: Media | PlayerMediaBinding): PlayerMediaBinding =>
  'media' in value ? value : { media: value }

// Attaches the (adapter-shaped) remote media to the player store while the
// source has produced both the revived <video> and its frame. Detaches and
// disposes the binding on change/unmount.
const MediaAttach = ({ remote, frame, adapter }: {
  remote: RemoteVideoElement | null
  frame: Frame | null
  adapter?: PlayerMediaAdapter
}) => {
  const setMedia = useMediaAttach()
  useEffect(() => {
    if (!setMedia || !remote || !frame) return
    const adapted = adapter ? adapter(remote, frame) : remote
    if (!adapted) return
    const binding = normalizeBinding(adapted)
    setMedia(binding.media)
    return () => {
      setMedia(null)
      binding.dispose?.()
    }
  }, [remote, frame, adapter, setMedia])
  return null
}

const style = css`
  /* The v10 media-default-skin--video preset otherwise paints a solid black
     background; keep it transparent so the iframe's video pixels (the
     Container's first child) show through. */
  position: absolute;
  inset: 0;
  border-radius: 0.8rem;
  background: transparent !important;
  &.media-default-skin--video {
    background: transparent !important;
  }

  /* The capability menus reuse the skin's surface styling; only the list
     itself needs layout. */
  .media-popover--menu {
    padding: 0.4rem;
  }
  .media-menu {
    display: flex;
    flex-direction: column;
    min-width: 18rem;
    max-height: 32rem;
    overflow-y: auto;
  }
  .media-menu__heading {
    padding: 0.6rem 1rem 0.4rem;
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    opacity: 0.6;
  }
  .media-menu__item {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    padding: 0.6rem 1rem;
    border: none;
    border-radius: 0.4rem;
    background: transparent;
    color: inherit;
    font-size: 1.3rem;
    text-align: left;
    cursor: pointer;

    &:hover:not(:disabled) {
      background: rgba(255, 255, 255, 0.12);
    }
    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
  .media-menu__check {
    display: inline-flex;
    width: 1.6rem;
    flex: none;
  }
  .media-menu__label {
    flex: 1;
  }
  .media-menu__description {
    opacity: 0.6;
    font-size: 1.1rem;
  }
  .media-button--error {
    color: #f66;
  }
`

export type PlayerProps = {
  remote: RemoteVideoElement | null
  frame: Frame | null
  // Per-source media shaping (seek interception, optimistic state). Omit for
  // sources whose <video> behaves like a plain media element.
  adapter?: PlayerMediaAdapter
  // Source-controlled menus; an omitted capability renders no UI for it.
  capabilities?: PlayerCapabilities
  children?: ComponentChildren
}

// The generic source player: one videojs v10 skin over a revived
// RemoteVideoElement. The iframe mounts as the skin's first child (the media
// surface) so attachFrame has it from the start, fullscreen carries the
// video, and the gesture layer stacks above the pointer-events:none iframe.
const Player = ({ remote, frame, adapter, capabilities, children }: PlayerProps) => (
  <Provider>
    <MediaAttach remote={remote} frame={frame} adapter={adapter} />
    <VideoSurface capabilities={capabilities} css={style}>
      {children}
    </VideoSurface>
  </Provider>
)

export default Player as FunctionComponent<PlayerProps>
export type { PlayerCapabilities, PlayerChoice, PlayerMediaAdapter, PlayerMediaBinding, PlayerSelection } from './types'
