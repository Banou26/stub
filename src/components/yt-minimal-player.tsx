import type { Path } from 'wouter'

import { css } from '@emotion/react'
import { Link } from 'wouter'
import { useState, useEffect, HTMLAttributes, useRef } from 'preact/compat'
import ReactPlayer from 'react-player'
import { VolumeX, Volume2, Volume1, Volume } from 'lucide-react'

import useNamespacedLocalStorage from '../utils/use-local-storage'
import useScrub from '../utils/use-scrub'

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
  { url, redirectTo, paused = false, ...rest }:
  HTMLAttributes<HTMLDivElement> & {
    url: string
    redirectTo?: Path
    paused?: boolean
  }
) => {
  const [playerVolume, setPlayerVolume] = useState(1)
  const [isReady, setIsReady] = useState(false)

  const volumeBarRef = useRef<HTMLDivElement>(null)
  const [hiddenVolumeArea, setHiddenVolumeArea] = useState(true)
  const useStoredValue = useNamespacedLocalStorage<{ volume: number, muted: boolean }>('title-hovercard')
  const [volume, setStoredVolume] = useStoredValue('volume', 1)
  const [isMuted, setStoredMuted] = useStoredValue('muted', true)
  const { scrub: volumeScrub, value: volumeScrubValue } = useScrub({ ref: volumeBarRef, defaultValue: volume })

  useEffect(() => {
    if (isMuted) {
      setStoredMuted(isMuted)
      if (volumeScrubValue) setStoredVolume(volumeScrubValue)
      return
    }
    if (volumeScrubValue === undefined) return
    setPlayerVolume(volumeScrubValue ** 2)
    setStoredVolume(volumeScrubValue)
    setStoredMuted(isMuted)
  }, [volumeScrubValue, isMuted])

  const toggleMuteButton = () => {
    setStoredMuted(value => !value)
    if (volumeScrubValue === undefined) return
    setPlayerVolume(volumeScrubValue ** 2)
  }

  const hoverVolumeArea: React.DOMAttributes<HTMLDivElement>['onMouseOver'] = () => {
    setHiddenVolumeArea(false)
  }

  const mouseOutBottom: React.DOMAttributes<HTMLDivElement>['onMouseOut'] = (ev) => {
    setHiddenVolumeArea(true)
  }

  const onReady = () => {
    setIsReady(true)
  }

  const player = (
    <ReactPlayer
      css={youtubeStyle}
      onReady={onReady}
      controls={false}
      src={url}
      loop={true}
      playing={!paused}
      volume={isReady ? playerVolume : undefined}
      muted={isMuted}
      style={{ display: isReady ? '' : 'none' }}
    />
  )

  return (
    <div css={minimalPlayerStyle} {...rest}>
      {
        redirectTo
          ? <Link to={redirectTo}>${player}</Link>
          : player
      }
      <div className="volume-area-wrapper" onMouseLeave={mouseOutBottom}>
        <div className="volume-area" onMouseOver={hoverVolumeArea}>
          <button className="mute-button" data-tip data-for="mute-button-tooltip" onClick={toggleMuteButton}>
            {
              isMuted ? <VolumeX/>
              : (volume ?? 0) > 0.66 ? <Volume2/>
              : (volume ?? 0) > 0.33 ? <Volume1/>
              : (volume ?? 0) > 0 ? <Volume/>
              : <VolumeX/>
            }
          </button>
          <div ref={volumeBarRef} className={`volume-panel${hiddenVolumeArea ? '' : ' volume-control-hover'}`} onMouseDown={volumeScrub}>
            <div className="slider">
              <div className="slider-handle" style={{ left: `${(volume ?? 0) * 100}%` }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
