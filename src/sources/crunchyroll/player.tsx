import type { Frame } from '@fkn/lib'

import type { PlayerProps } from '../players'

import { css } from '@emotion/react'
import { attachFrame } from '@fkn/lib'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import CrunchyrollVideoJSPlayer from './cr-videojs-player'
import { wrapWithBitmovin } from './cr-bitmovin-adapter'

// @fkn/lib's `videoElement()` returns a `RemoteVideoElement` (the
// revived proxy from the extension), but the published .d.ts declares
// that type without exporting it, so we can't name it here. Casting
// through `unknown` to this minimal structural shape gives us the
// fields the skin + Bitmovin adapter touch without depending on the
// internal name. If the type ever gets re-exported from @fkn/lib,
// switch this to the real alias.
type VideoHandle = EventTarget & {
  currentTime: number
  volume: number
  muted: boolean
  playbackRate: number
  src: string
  readonly duration: number
  readonly paused: boolean
  readonly ended: boolean
  readonly seeking?: boolean
  readonly readyState: number
  readonly currentSrc: string
  readonly videoWidth: number
  readonly videoHeight: number
  readonly error?: unknown
  readonly buffered: ReadonlyArray<{ start: number; end: number }>
  play(): Promise<void>
  pause(): void
  load?: () => void
}

const CRUNCHYROLL_DOMAINS = [
  'crunchyroll.com',
  'www.crunchyroll.com',
  'sso.crunchyroll.com',
  'static.crunchyroll.com'
]

// Hide the CR page chrome, force the player to fill the iframe, and
// keep CR's native player UI hidden — but leave the scrubber
// (`.timeline-slider`) layout-measurable so our Bitmovin-seek adapter
// can dispatch pointer events at the right `clientX`.
//
// Three layers, matching the layers above:
//   1. `*:not(:has(.video-player-wrapper))…` collapses everything
//      OUTSIDE the player block (header, episode info, cookie banner,
//      next-episode panel, …).
//   2. `.video-player-wrapper *:not(:has(video))…` collapses the
//      player's OWN chrome (Bitmovin control bar, buffering spinner,
//      replay button, settings menu …) but keeps `<video>` plus the
//      `.timeline-slider` chain alive for programmatic seeking.
//   3. `.timeline-container` / `.timeline-slider` stay in layout but
//      go `opacity: 0 / pointer-events: none` so the user doesn't see
//      the stock scrubber flash during seeks, while the programmatic
//      pointerdown/pointerup events still resolve a valid clientX.
const CRUNCHYROLL_OUTER_CSS = `
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: 100% !important;
    background: #000 !important;
  }
  *:not(:has(.video-player-wrapper)):not(.video-player-wrapper):not(.video-player-wrapper *) {
    display: none !important;
  }
  .video-player-wrapper,
  .video-player,
  .player-container,
  .video-player-wrapper > *,
  .video-player > *,
  .player-container > * {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    z-index: 9999999;
  }
  .video-player-wrapper video,
  .video-player video,
  .player-container video {
    width: 100% !important;
    height: 100% !important;
    object-fit: contain !important;
  }
  .video-player-wrapper *:not(:has(video)):not(video):not(:has(.timeline-slider)):not(.timeline-slider) {
    display: none !important;
  }
  .timeline-container,
  .timeline-container *,
  .timeline-slider {
    opacity: 0 !important;
    pointer-events: none !important;
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

// Belt-and-braces retry for the narrow window between document_start
// (child CS injected) and the peer osra channel being fully wired.
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

const checkIsLoggedIn = async (frame: Frame): Promise<boolean> => {
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
  return false
}

// Poll for a `<video>` inside the frame and hand back a `VideoHandle`
// once CR has mounted its player. On non-watch pages (homepage,
// search, discover …) CR's player-wrapper stays empty, so the loop
// naturally stays in "waiting" until a playable page loads.
const waitForVideoHandle = async (
  frame: Frame,
  isCancelled: () => boolean,
): Promise<VideoHandle | null> => {
  while (!isCancelled()) {
    try {
      const exists = await frame.locator('video').exists()
      if (exists) return (await frame.locator('video').videoElement()) as unknown as VideoHandle
    } catch { /* frame torn down or not ready yet; retry */ }
    await new Promise(r => setTimeout(r, 500))
  }
  return null
}

const CrunchyrollPlayer = ({ url }: PlayerProps) => {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const frameRef = useRef<Frame | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)
  const [error, setError] = useState<string>()
  const [videoHandle, setVideoHandle] = useState<VideoHandle | null>(null)

  useEffect(() => {
    if (!iframe || frameRef.current) return
    let cancelled = false
    const isCancelled = () => cancelled
    ;(async () => {
      const frame = await attachFrame({
        iframe,
        domains: CRUNCHYROLL_DOMAINS
      })
      if (cancelled) return
      frameRef.current = frame
      // First pass at document_start — the self-healing observer in
      // addStyleTag keeps the CSS alive through CR's hydration in the
      // *same* document. CR's subsequent internal route change
      // (`/watch/X` → its localised equivalent) replaces the document
      // entirely, so we re-apply once we've seen a live `<video>`.
      console.log('goto', url)
      await frame.goto(url, { waitUntil: 'documentstart' })
      console.log('goto done')
      setInterval(() => {
        console.log('interval addstyle')
        frame.addStyleTag({ content: ` * { background-color: red; } ` })
        console.log('interval addstyle done')
      }, 1000)
      console.log('addstyle')
      await frame.addStyleTag({ content: CRUNCHYROLL_OUTER_CSS })
      console.log('addstyle done')
      if (cancelled) return
      setLoading(false)
      const isLoggedIn = await checkIsLoggedIn(frame)
      if (cancelled) return
      if (!isLoggedIn) {
        setLoggedOut(true)
        return
      }
      const handle = await waitForVideoHandle(frame, isCancelled)
      if (cancelled || !handle) return
      setVideoHandle(wrapWithBitmovin(handle, frame))
    })().catch(err => {
      console.error(err)
      if (cancelled) return
      setLoading(false)
      setError(err?.message ?? 'Failed to load player')
    })
    return () => { cancelled = true }
  }, [iframe, url])

  const openLogin = useCallback(() => {
    const popup = globalThis.open(CRUNCHYROLL_LOGIN_URL, '_blank', 'width=500,height=700')
    if (!popup) return
    const interval = setInterval(() => {
      if (!popup.closed) return
      clearInterval(interval)
      frameRef.current = undefined
      setLoggedOut(false)
      setLoading(true)
      setVideoHandle(null)
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
        z-index: 1;
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
      {videoHandle && frameRef.current && (
        <CrunchyrollVideoJSPlayer handle={videoHandle} />
      )}
    </div>
  )
}

export default CrunchyrollPlayer
export { CRUNCHYROLL_DOMAINS, CRUNCHYROLL_OUTER_CSS }
