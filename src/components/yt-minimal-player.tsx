import type { Path } from 'wouter'
import type { HTMLAttributes, EventHandler, TargetedEvent } from 'react'

import { css } from '@emotion/react'
import { Link } from 'wouter'
import { useState, useCallback, useEffect } from 'preact/compat'
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
    onError?: EventHandler<TargetedEvent<HTMLVideoElement>>
  }
) => {
  const [ref, setRef] = useState<HTMLVideoElement | null>(null)
  const [started, setStarted] = useState(false)
  const [masked, setMasked] = useState(true)

  const onPlaying = useCallback(() => {
    setStarted(true)
  }, [setStarted])

  const onWaiting = useCallback(() => {
    setStarted(false)
  }, [setStarted])

  // hide the iframe until youtube's undisableable center play/pause button auto hides (~3s after play)
  useEffect(() => {
    if (!started || paused) {
      setMasked(true)
      return
    }
    const timeout = setTimeout(() => setMasked(false), 4_000)
    return () => clearTimeout(timeout)
  }, [started, paused])

  const showing = started && !paused && !masked

  const onEnded = useCallback(() => {
    setStarted(false)
    ref?.play()
  }, [ref])

  const player = (
    <ReactPlayer
      ref={ref => setRef(ref)}
      css={youtubeStyle}
      onPlaying={onPlaying}
      onWaiting={onWaiting}
      // controls=0 gets youtube's minimal ui with a persistent center button, classic chrome idle
      // hides instead, and both surfaces crop the iframe so the bar and title sit off screen
      controls={true}
      src={url}
      loop={true}
      volume={volume}
      playing={!paused}
      muted={volume === 0}
      style={{ opacity: showing ? 1 : 0, transition: showing ? 'opacity .3s ease' : undefined }}
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
