import type { Frame, RemoteVideoElement } from '@fkn/lib'
import type { Media } from '@videojs/core/dom'
import type { ComponentChildren, FunctionComponent } from 'preact'

import { css } from '@emotion/react'
import { useEffect } from 'preact/hooks'
import { videoFeatures } from '@videojs/core/dom'
import { createPlayer, useMediaAttach } from '@videojs/react'
import { VideoSkin as VideoSkinBase } from '@videojs/react/video'

const VideoSkin = VideoSkinBase as FunctionComponent<Parameters<typeof VideoSkinBase>[0]>
import '@videojs/react/video/skin.css'

// Same shape as the Crunchyroll skin, minus the seek adapter. Netflix's Cadmium
// player honours raw `video.currentTime` writes (it re-buffers off the element's
// own `seeking` event), unlike Crunchyroll's Bitmovin which only re-fetches off its
// own scrubber UI — so the RemoteVideoElement drives the skin directly, no replay
// onto a native scrubber needed. If a future Netflix build stops honouring direct
// seeks, mirror Crunchyroll's `withTimelineSeek` with a Netflix scrubber selector.

const { Provider } = createPlayer({ features: videoFeatures })

const MediaAttach = ({ remote }: { remote: RemoteVideoElement | null }) => {
  const setMedia = useMediaAttach()
  useEffect(() => {
    if (!setMedia || !remote) return
    setMedia(remote as unknown as Media)
    return () => setMedia(null)
  }, [remote, setMedia])
  return null
}

type Props = {
  remote: RemoteVideoElement | null
  children?: ComponentChildren
}

// The Netflix iframe renders inside the skin's Container (as its first child) so
// fullscreen (which fullscreens the Container) still carries the video, and so taps
// land on the skin's gesture layer above the `pointer-events: none` iframe.
const NetflixVideoJSPlayer = ({ remote, children }: Props) => (
  <Provider>
    <MediaAttach remote={remote} />
    <VideoSkin
      css={css`
        position: absolute;
        inset: 0;
        border-radius: 0.8rem;
        background: transparent !important;
        &.media-default-skin--video {
          background: transparent !important;
        }
      `}
    >
      {children}
    </VideoSkin>
  </Provider>
)

export default NetflixVideoJSPlayer
