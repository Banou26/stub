import type { Path } from 'wouter'
import type { HTMLAttributes, ReactEventHandler } from 'react'

import { css } from '@emotion/react'
import { Link } from 'wouter'
import { useState, useCallback } from 'preact/compat'
import ReactPlayer from 'react-player'

const minimalPlayerStyle = css`
position: absolute;
top: 0;
left: 0;
width: 100%;
height: 100%;
overflow: hidden;
`

const youtubeStyle = css`
grid-area: container;
height: 140vh !important;
width: 100% !important;
margin-top: -20vh;
pointer-events: none;
`

export const YoutubeMinimalPlayer = (
  { url, redirectTo, volume, paused = false, onError, ...rest }:
  HTMLAttributes<HTMLDivElement> & {
    url: string
    redirectTo?: Path
    volume?: number
    paused?: boolean
    onError?: ReactEventHandler<HTMLVideoElement>
  }
) => {
  const [ref, setRef] = useState<HTMLVideoElement | null>(null)
  const [isReady, setIsReady] = useState(false)

  const onReady = useCallback(() => {
    setIsReady(true)
  }, [setIsReady])

  const onEnded = useCallback(() => {
    ref?.play()
  }, [ref])

  const player = (
    <ReactPlayer
      ref={ref => setRef(ref)}
      css={youtubeStyle}
      onReady={onReady}
      controls={false}
      src={url}
      loop={true}
      volume={volume}
      playing={!paused}
      muted={volume === 0}
      style={{ display: isReady ? '' : 'none' }}
      onError={onError}
      onEnded={onEnded}
    />
  )

  return (
    <div css={minimalPlayerStyle} {...rest}>
      {
        redirectTo
          ? <Link to={redirectTo}>{player}</Link>
          : player
      }
    </div>
  )
}

export default YoutubeMinimalPlayer
