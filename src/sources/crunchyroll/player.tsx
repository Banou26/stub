import type { Frame, RemoteVideoElement } from '@fkn/lib'

import type { PlayerProps } from '../players'

import { css } from '@emotion/react'
import { attachFrame } from '@fkn/lib'
import { useCallback, useEffect, useState } from 'preact/hooks'

import CrunchyrollVideoJSPlayer from './cr-videojs-player'

const CRUNCHYROLL_DOMAINS = [
  'crunchyroll.com',
  'www.crunchyroll.com',
  'sso.crunchyroll.com',
  'static.crunchyroll.com'
]

// Hide the CR page chrome, force the player to fill the iframe, and keep
// CR's native player UI hidden — but leave the scrubber
// (`.timeline-slider`) layout-measurable so the Bitmovin-seek adapter can
// drive it.
//
// Three layers:
//   1. `*:not(:has(.video-player-wrapper))…` collapses everything OUTSIDE
//      the player block (header, episode info, cookie banner, …).
//   2. `.video-player-wrapper *:not(:has(video))…` collapses the player's
//      OWN chrome (Bitmovin control bar, spinner, settings menu …) but
//      keeps `<video>` plus the `.timeline-slider` chain alive.
//   3. `.timeline-container` / `.timeline-slider` stay in layout but go
//      `opacity: 0 / pointer-events: none` so the stock scrubber never
//      flashes during seeks while programmatic fills still resolve.
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
  div[data-testid="player-controls-root"] {
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

const BASE_URL = 'https://www.crunchyroll.com'
const CRUNCHYROLL_LOGIN_URL = (() => {
  const authorizeParams = new URLSearchParams({
    client_id: 'kmj7imhjt_q90lcbzzsj',
    redirect_uri: 'https://www.crunchyroll.com/',
    response_type: 'cookie'
  })
  return `${BASE_URL}/login?return_url=${encodeURIComponent(`/authorize?${authorizeParams}`)}`
})()

const LOGIN_TIMEOUT = 30_000

// Poll CR's header until it settles into a known auth state: while the
// shell header is still mounting (`.shell-header`) we keep waiting; once
// it resolves, `#user-menu-anonymous` means logged out and
// `#user-menu-authenticated` means logged in.
const checkIsLoggedIn = async (frame: Frame) => {
  const deadline = Date.now() + LOGIN_TIMEOUT
  while (Date.now() < deadline) {
    if (await frame.locator('.shell-header').exists()) {
      await new Promise(r => setTimeout(r, 100))
      continue
    }
    const [isLoggedOut, isLoggedIn] = await Promise.all([
      frame.locator('#user-menu-anonymous').exists(),
      frame.locator('#user-menu-authenticated').exists()
    ])
    if (isLoggedIn || isLoggedOut) return { isLoggedIn, isLoggedOut }
    await new Promise(r => setTimeout(r, 100))
  }
  throw new Error('Login state check timed out')
}

// Poll for CR's `<video>` and hand back the revived RemoteVideoElement
// once the player mounts. On non-watch pages CR's player-wrapper stays
// empty, so the loop simply keeps waiting until a playable page loads or
// the effect is cancelled.
const waitForVideoElement = async (frame: Frame, isCancelled: () => boolean) => {
  while (!isCancelled()) {
    try {
      if (await frame.locator('video').exists()) return await frame.locator('video').videoElement()
    } catch { /* frame torn down or not ready yet; retry */ }
    await new Promise(r => setTimeout(r, 100))
  }
  return null
}

const styles = css`
  position: relative;
  width: 100%;
  height: 100%;
  background: #000;
  /* The double-tap-to-fullscreen gesture otherwise word-selects the
     skin's labels/time readouts, flashing them blue. Player chrome isn't
     meant to be selected, so suppress it across the whole player. */
  user-select: none;
  -webkit-user-select: none;

  .cr-frame {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
    background: #000;
    /* CR's own chrome is hidden, so the iframe must not swallow clicks —
       taps belong to the videojs gesture layer stacked above it. */
    pointer-events: none;
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.6rem;
    background: #000;
    font-size: 1.4rem;
    color: rgba(255, 255, 255, 0.8);
    /* Above the skin's own layers (its controls/error dialog top out at
       z-index 20) so the login/loading screen fully covers them. */
    z-index: 30;
  }

  .login-button {
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
  }
`

const CrunchyrollPlayer = ({ url }: PlayerProps) => {
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [loading, setLoading] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)
  const [error, setError] = useState<string>()
  const [remoteVideo, setRemoteVideo] = useState<RemoteVideoElement | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Attach the peer osra channel to the iframe once. The frame outlives
  // re-logins; only the navigation/auth pass below re-runs.
  useEffect(() => {
    if (!iframe) return
    let cancelled = false
    attachFrame({ iframe, domains: CRUNCHYROLL_DOMAINS })
      .then(f => { if (!cancelled) setFrame(f) })
      .catch(err => {
        if (cancelled) return
        console.error('Failed to attach Crunchyroll frame', err)
        setError(err?.message ?? 'Failed to load player')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [iframe])

  // Navigate to the watch URL, hide CR's chrome, confirm login, then wait
  // for the video element. Re-runs when `reloadKey` bumps after a login
  // round-trip (the cookies are now set, so the same URL resolves authed).
  useEffect(() => {
    if (!frame) return
    let cancelled = false
    const isCancelled = () => cancelled
    setLoading(true)
    setError(undefined)
    setLoggedOut(false)
    setRemoteVideo(null)
    ;(async () => {
      await frame.goto(url, { waitUntil: 'documentstart' })
      await frame.addStyleTag({ content: CRUNCHYROLL_OUTER_CSS })
      if (cancelled) return
      const { isLoggedIn } = await checkIsLoggedIn(frame)
      if (cancelled) return
      setLoading(false)
      if (!isLoggedIn) {
        setLoggedOut(true)
        return
      }
      const video = await waitForVideoElement(frame, isCancelled)
      if (cancelled || !video) return
      setRemoteVideo(video)
    })().catch(err => {
      if (cancelled) return
      console.error('Failed to load Crunchyroll player', err)
      setError(err?.message ?? 'Failed to load player')
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [frame, url, reloadKey])

  const openLogin = useCallback(() => {
    const popup = globalThis.open(CRUNCHYROLL_LOGIN_URL, '_blank', 'width=500,height=700')
    if (!popup) return
    const interval = setInterval(() => {
      if (!popup.closed) return
      clearInterval(interval)
      setReloadKey(k => k + 1)
    }, 500)
  }, [])

  const overlay = (loggedOut || error || loading) && (
    <div className="overlay">
      {loggedOut && (
        <>
          You need to be logged in to Crunchyroll to watch this content.
          <button className="login-button" onClick={openLogin}>
            Open Crunchyroll Login Page
          </button>
        </>
      )}
      {error && !loggedOut && error}
      {loading && !error && !loggedOut && 'Loading Crunchyroll player...'}
    </div>
  )

  // The skin is always mounted with the iframe nested inside its
  // Container — attachFrame needs the iframe from the start, fullscreen
  // needs the video inside the fullscreened element, and the skin's
  // gesture layer needs to sit above it. `remote`/`frame` are null until
  // the video is ready, at which point media attaches.
  return (
    <div css={styles}>
      <CrunchyrollVideoJSPlayer remote={remoteVideo} frame={frame}>
        <iframe
          ref={setIframe}
          className="cr-frame"
          referrerPolicy="no-referrer"
          allow="encrypted-media; autoplay; fullscreen;"
        />
      </CrunchyrollVideoJSPlayer>
      {overlay}
    </div>
  )
}

export default CrunchyrollPlayer
