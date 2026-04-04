import type { Frame, VideoHandle } from '@fkn/lib'

import type { PlayerProps } from '../players'

import { css } from '@emotion/react'
import { newFrame } from '@fkn/lib'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { createPlayer, useMediaAttach } from '@videojs/react'
import { VideoSkin, videoFeatures } from '@videojs/react/video'
import '@videojs/react/video/skin.css'

const { Provider } = createPlayer({ features: videoFeatures })

const EMPTY_TIME_RANGES = { length: 0, start: () => 0, end: () => 0 }

const toTimeRanges = (ranges?: Array<{ start: number; end: number }>) => {
  if (!ranges?.length) return EMPTY_TIME_RANGES
  return {
    length: ranges.length,
    start: (i: number) => ranges[i]!.start,
    end: (i: number) => ranges[i]!.end,
  }
}

const EMPTY_TEXT_TRACKS = { length: 0, [Symbol.iterator]: function* () {}, addEventListener: () => {}, removeEventListener: () => {} }

const asMediaElement = (handle: VideoHandle) => ({
  get paused() { return handle.paused },
  get currentTime() { return handle.currentTime },
  set currentTime(v: number) { handle.currentTime = v },
  get duration() { return handle.duration },
  get volume() { return handle.volume },
  set volume(v: number) { handle.volume = v },
  get muted() { return handle.muted },
  set muted(v: boolean) { handle.muted = v },
  get playbackRate() { return handle.playbackRate },
  set playbackRate(v: number) { handle.playbackRate = v },
  get ended() { return handle.ended },
  get seeking() { return false },
  get readyState() { return handle.readyState },
  get src() { return handle.src },
  get currentSrc() { return handle.currentSrc },
  get buffered() { return toTimeRanges(handle.buffered) },
  get seekable() { return toTimeRanges(handle.duration ? [{ start: 0, end: handle.duration }] : []) },
  get error() { return null },
  get textTracks() { return EMPTY_TEXT_TRACKS },
  play: () => handle.play(),
  pause: () => { handle.pause() },
  load: () => {},
  addEventListener: (...args: Parameters<EventTarget['addEventListener']>) => handle.addEventListener(...args),
  removeEventListener: (...args: Parameters<EventTarget['removeEventListener']>) => handle.removeEventListener(...args),
  dispatchEvent: (...args: Parameters<EventTarget['dispatchEvent']>) => handle.dispatchEvent(...args),
})

const RemoteMediaProvider = ({ media }: { media: ReturnType<typeof asMediaElement> }) => {
  const setMedia = useMediaAttach()
  useEffect(() => {
    setMedia?.(media)
    return () => { setMedia?.(null) }
  }, [media, setMedia])
  return null
}

const VideoOverlay = ({ handle }: { handle: VideoHandle }) => {
  const media = useMemo(() => asMediaElement(handle), [handle])
  return (
    <Provider>
      <RemoteMediaProvider media={media} />
      <div
        css={css`
          position: absolute;
          inset: 0;
          z-index: 2;
          pointer-events: none;
          background: transparent;

          & > * {
            pointer-events: auto;
          }

          [class*="media-default-skin"],
          [class*="media-poster"],
          [class*="media-container"] {
            background: transparent !important;
          }
        `}
      >
        <VideoSkin />
      </div>
    </Provider>
  )
}

const CRUNCHYROLL_DOMAINS = [
  'crunchyroll.com',
  'www.crunchyroll.com',
  'sso.crunchyroll.com',
  'static.crunchyroll.com'
]

const CRUNCHYROLL_OUTER_CSS = `
  *:not(:has(.video-player-wrapper)):not(.video-player-wrapper):not(.video-player-wrapper *) {
    display: none !important;
  }
  .video-player-wrapper, .video-player, .player-container {
    position: absolute !important;
    inset: 0 !important;
    z-index: 9999999;
  }
  [data-testid="player-controls-root"] {
    display: none !important;
  }
`

const CRUNCHYROLL_LOGIN_URL = (() => {
  const authorizeParams = new URLSearchParams({
    client_id: 'kmj7imhjt_q90lcbzzsj',
    redirect_uri: 'https://www.crunchyroll.com/',
    response_type: 'cookie'
  })
  return `https://sso.crunchyroll.com/login?return_url=${encodeURIComponent(`/authorize?${authorizeParams}`)}`
})()

const waitForContentScript = async <T,>(fn: () => Promise<T>, retries = 10, delay = 500): Promise<T> => {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i === retries - 1 || !(err instanceof Error) || !err.message.includes('not registered')) throw err
      await new Promise(r => setTimeout(r, delay))
    }
  }
  throw new Error('unreachable')
}

const checkIsLoggedIn = async (frame: Frame) => {
  for (let i = 0; i < 300; i++) {
    if (i === 299) throw new Error('Login state check timed out')
    const isLoading = await frame.locator('.shell-header-user-avatar [class*="loading"]').exists()
    if (isLoading) {
      await new Promise(r => setTimeout(r, 100))
      continue
    }
    const isLoggedOut = await frame.locator('.erc-anonymous-user-menu-old').exists()
    const isLoggedIn = await frame.locator('.erc-authenticated-user-menu-old').exists()
    if (isLoggedOut) return false
    if (isLoggedIn) return true
    await new Promise(r => setTimeout(r, 100))
  }
}

const CrunchyrollPlayer = ({ url }: PlayerProps) => {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const frameRef = useRef<Frame>(undefined)
  const [loading, setLoading] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)
  const [error, setError] = useState<string>()
  const [videoHandle, setVideoHandle] = useState<VideoHandle | null>(null)

  useEffect(() => {
    if (!iframe || frameRef.current) return
    let cancelled = false
    ;(async () => {
      const frame = await newFrame({
        iframe,
        domains: CRUNCHYROLL_DOMAINS
      })
      if (cancelled) return
      frameRef.current = frame
      await frame.goto(url, { waitUntil: 'documentstart' })
      await waitForContentScript(() => frame.addStyleTag({ content: CRUNCHYROLL_OUTER_CSS }))
      if (cancelled) return
      setLoading(false)
      const isLoggedIn = await checkIsLoggedIn(frame)
      if (cancelled) return
      if (!isLoggedIn) {
        setLoggedOut(true)
        return
      }
      let playerDoesntExists = true
      while (playerDoesntExists) {
        playerDoesntExists = !(await frame.locator('video').exists())
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      const handle = await frame.locator('video').video()
      if (cancelled) return
      setVideoHandle(handle)
    })().catch(err => {
      console.error(err)
      if (cancelled) return
      setLoading(false)
      setError(err?.message ?? 'Failed to load player')
    })
    return () => {
      cancelled = true
    }
  }, [iframe, url])

  useEffect(() => {
    if (!videoHandle) return
    return () => { videoHandle[Symbol.dispose]() }
  }, [videoHandle])

  const openLogin = useCallback(() => {
    const popup = globalThis.open(CRUNCHYROLL_LOGIN_URL, '_blank', 'width=500,height=700')
    if (!popup) return
    const interval = setInterval(() => {
      if (!popup.closed) return
      clearInterval(interval)
      frameRef.current = undefined
      setLoggedOut(false)
      setVideoHandle(null)
      setLoading(true)
    }, 500)
  }, [url])

  const overlay = (loggedOut || error || loading) && (
    <div
      css={css`
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 1.6rem;
        background: #000;
        border-radius: 0.8rem;
        font-size: 1.4rem;
        color: rgba(255, 255, 255, 0.8);
        z-index: 3;
      `}
    >
      {loggedOut && (
        <>
          You need to be logged in to Crunchyroll to watch this content.
          <button
            onClick={openLogin}
            css={css`
              padding: 0.8rem 2rem;
              background: #f47521;
              color: #fff;
              border: none;
              border-radius: 0.4rem;
              font-size: 1.4rem;
              font-weight: 600;
              cursor: pointer;
              &:hover {
                background: #e0651a;
              }
            `}
          >
            Open Crunchyroll Login Page
          </button>
        </>
      )}
      {error && !loggedOut && error}
      {loading && !error && !loggedOut && 'Loading Crunchyroll player...'}
    </div>
  )

  return (
    <div
      css={css`
        position: relative;
      `}
    >
      {overlay}
      {videoHandle && <VideoOverlay handle={videoHandle} />}
      <iframe
        ref={setIframe}
        referrerPolicy="no-referrer"
        allow="encrypted-media; autoplay; fullscreen;"
        css={css`
          width: 100%;
          aspect-ratio: 16 / 9;
          border: none;
          border-radius: 0.8rem;
          background: #000;
        `}
      />
    </div>
  )
}

export default CrunchyrollPlayer
export { CRUNCHYROLL_DOMAINS, CRUNCHYROLL_OUTER_CSS }
