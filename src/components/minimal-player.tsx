import { css } from '@emotion/react'
import { useState, useEffect, HTMLAttributes, forwardRef, useRef } from 'react'
// import { Link, To } from 'react-router-dom'
import ReactPlayer from 'react-player/youtube'
import { VolumeX, Volume2, Volume1, Volume } from 'react-feather'

import useNamespacedLocalStorage from '../utils/use-local-storage'
import { Media } from '../generated/graphql'
import useScrub from '../utils/use-scrub'

import '../router/anime/index.css'
import { Link } from 'wouter'

const minimalPlayerStyle = css`
.volume-area-wrapper {
  position: absolute;
  bottom: 2rem;
  left: 1rem;

  display: grid;
  height: 2rem;

  .volume-area {
    display: flex;
    /* grid-template-columns: 4.8rem fit-content(0rem); */
    /* height: 100%; */
    cursor: pointer;
    color: #fff;

    .mute-button {
      color: #fff;
      border: none;
      background: none;
      height: 100%;
      width: 4.8rem;
      cursor: pointer;
    }

    .volume-panel {
      display: inline-block;
      width: 0;
      /* width: 100%; */
      /* width: 12rem; */
      height: 100%;
      -webkit-transition: margin .2s cubic-bezier(0.4,0,1,1),width .2s cubic-bezier(0.4,0,1,1);
      transition: margin .2s cubic-bezier(0.4,0,1,1),width .2s cubic-bezier(0.4,0,1,1);
      cursor: pointer;
      outline: 0;

      &.volume-control-hover {
        width: 6rem;
        /* width: 52px; */
        margin-right: 3px;
        -webkit-transition: margin .2s cubic-bezier(0,0,0.2,1),width .2s cubic-bezier(0,0,0.2,1);
        transition: margin .2s cubic-bezier(0,0,0.2,1),width .2s cubic-bezier(0,0,0.2,1);
      }

      .slider {
        height: 100%;
        min-height: 36px;
        position: relative;
        overflow: hidden;

        .slider-handle {
          /* left: 40px; */
          position: absolute;
          top: 50%;
          width: 12px;
          height: 12px;
          border-radius: 6px;
          margin-top: -6px;
          margin-left: -5px;
          /* background: #fff; */
        }
        .slider-handle::before, .slider-handle::after {
          content: "";
          position: absolute;
          display: block;
          top: 50%;
          left: 0;
          height: 3px;
          margin-top: -2px;
          width: 64px;
        }
        .slider-handle::before {
          left: -58px;
          background: #fff;
        }
        .slider-handle::after {
          left: 6px;
          background: rgba(255,255,255,.2);
        }
      }
    }
  }
}
`

export const MinimalPlayer = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { media: Media, redirectTo?: To, paused?: boolean }>(({ media, redirectTo, paused = false, ...rest }, ref) => {
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

  return (
    <div css={minimalPlayerStyle} ref={ref} {...rest}>
      {
        redirectTo
          ? (
            <Link to={redirectTo}>
              <ReactPlayer
                onReady={onReady}
                controls={false}
                url={`https://www.youtube.com/watch?v=${media.trailers?.at(0)?.id}`}
                loop={true}
                playing={!paused}
                volume={isReady ? playerVolume : undefined}
                muted={isMuted}
                stopOnUnmount={true}
                style={{ display: isReady ? '' : 'none' }}
              />
            </Link>
          )
          : (
            <ReactPlayer
              onReady={onReady}
              controls={false}
              url={`https://www.youtube.com/watch?v=${media.trailers?.at(0)?.id}`}
              loop={true}
              playing={!paused}
              volume={isReady ? playerVolume : undefined}
              muted={isMuted}
              stopOnUnmount={true}
              style={{ display: isReady ? '' : 'none' }}
            />
          )
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
})
