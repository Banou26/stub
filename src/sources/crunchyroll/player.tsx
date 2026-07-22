import type { Frame, RemoteVideoElement } from '@fkn/lib'

import type { PlayerProps } from '../players'

import { css } from '@emotion/react'
import { attachFrame, isExtensionExposed } from '@fkn/lib'
import { useCallback, useEffect, useRef, useState } from 'preact/hooks'

import CrunchyrollVideoJSPlayer from './cr-videojs-player'

const CRUNCHYROLL_DOMAINS = [
  'crunchyroll.com',
  'www.crunchyroll.com',
  'sso.crunchyroll.com',
  'static.crunchyroll.com'
]

// Hide the CR page chrome, force the player to fill the iframe, and keep
// CR's native player UI hidden - but leave the scrubber
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

// The cloud render proxy cannot hand back a RemoteVideoElement, so on that
// backend CR's own player stays in charge: hide only the page chrome AROUND
// the player and stretch it, keeping CR's native controls visible and usable.
const CRUNCHYROLL_CLOUD_CSS = `
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    width: 100% !important;
    height: 100% !important;
    overflow: hidden !important;
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
`

const BASE_URL = 'https://www.crunchyroll.com'

// The SSO authorize endpoint sets the session cookie via `response_type=cookie`
// and then redirects to `state`. The in-frame cloud login returns to the
// episode: the login-return poll keys on the watch page's auth markers, which
// the neutral home page does not reliably render. The extension popup uses the
// neutral home page instead, since it only needs to set the shared cookie and
// returning it to the episode would start a second player there.
const CRUNCHYROLL_SSO_CLIENT_ID = 'noaihdevm_6iyg0a8l0q'
const buildLoginUrl = (watchUrl: string, returnToEpisode: boolean) => {
  const { pathname, search } = new URL(watchUrl)
  const authorizeParams = new URLSearchParams({
    client_id: CRUNCHYROLL_SSO_CLIENT_ID,
    redirect_uri: `${BASE_URL}/callback`,
    response_type: 'cookie',
    state: returnToEpisode ? `${pathname}${search}` : '/',
  })
  return `https://sso.crunchyroll.com/authorize?${authorizeParams}`
}

const LOGIN_TIMEOUT = 30_000
// A human-paced in-frame sign-in gets generous room, but not unbounded: if it
// has not landed after this, surface an error with a retry instead of polling
// a permanently-stuck attempt forever.
const LOGIN_RETURN_TIMEOUT = 600_000

type Backend = 'detecting' | 'extension' | 'cloud'

// Which attachFrame backend this player will get. Mirrors the library's own
// quiet selection (an exposed extension wins, otherwise the cloud render
// proxy) so the layout can be picked BEFORE the iframe mounts: the two
// backends need different trees (skin-driven vs native controls) and moving
// the iframe between parents would tear the attached frame down. On a page
// that is still loading, wait for load plus a short grace so a document_start
// content script gets its chance to expose.
const detectBackend = async (): Promise<Backend> => {
  if (isExtensionExposed()) return 'extension'
  if (document.readyState !== 'complete') {
    // Cap the wait for load: a stalled subresource must not leave the player
    // stuck in 'detecting' forever. Mirrors the library's own selection grace.
    // Remove the listener whichever side resolves so a timeout does not leak it.
    await new Promise<void>(resolve => {
      const onLoad = () => {
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        window.removeEventListener('load', onLoad)
        resolve()
      }, 10_000)
      window.addEventListener('load', onLoad, { once: true })
    })
  }
  await new Promise(r => setTimeout(r, 300))
  return isExtensionExposed() ? 'extension' : 'cloud'
}

// Poll CR's header until it settles into a known auth state: while the
// shell header is still mounting (`.shell-header`) we keep waiting; once
// it resolves, `#user-menu-anonymous` means logged out and
// `#user-menu-authenticated` means logged in. Stops early if the owning
// effect is cancelled (episode switch, unmount) so a stale pass does not keep
// issuing locator calls against the shared frame.
const checkIsLoggedIn = async (frame: Frame, isCancelled: () => boolean) => {
  const deadline = Date.now() + LOGIN_TIMEOUT
  while (!isCancelled() && Date.now() < deadline) {
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

// Wait for the in-frame SSO login to land the session. The frame's URL is
// not observable across the authorize redirect (neither backend tracks it:
// cloud caches only on goto, the extension reads iframe.src), so poll for the
// authenticated header the callback drops onto the returned watch page. The
// user signs in at their own pace, so the deadline is generous. A return to
// an anonymous watch page means the user backed out of sign-in. Transient
// locator rejections are the SSO redirect replacing the document and are
// retried; a sustained run of them means the frame is gone. Resolves 'authed'
// once signed in, 'backout' on an anonymous return, 'timeout' at the
// deadline, and 'lost' when the frame stops answering.
const waitForLoginReturn = async (frame: Frame, isCancelled: () => boolean) => {
  const deadline = Date.now() + LOGIN_RETURN_TIMEOUT
  let failures = 0
  // The callback watch page can transiently render the anonymous marker while
  // its header hydrates before settling to authenticated, so require the
  // marker across consecutive ticks before treating it as a real backout.
  let anonymousStreak = 0
  while (!isCancelled() && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1000))
    if (isCancelled()) return 'cancelled'
    const [settling, authed, anonymous] = await Promise.all([
      frame.locator('.shell-header').exists().catch(() => null),
      frame.locator('#user-menu-authenticated').exists().catch(() => null),
      frame.locator('#user-menu-anonymous').exists().catch(() => null),
    ])
    if (settling === null && authed === null && anonymous === null) {
      // All locator calls rejected. Tolerate the brief window where the SSO
      // redirect replaces the document; only give up once the frame has been
      // unreachable well past any navigation. Each rejected call can already
      // block on the library's own ~30s retry, so a few consecutive failures
      // mean the frame is gone, not mid-redirect. Reset the anonymous streak
      // too: samples read on either side of a document replacement are not
      // from a single continuously-anonymous page, so they must not stack.
      failures += 1
      anonymousStreak = 0
      if (failures >= 3) return 'lost'
      continue
    }
    failures = 0
    // While the shell header is still mounting, neither auth marker has
    // settled (mirrors checkIsLoggedIn), so hold rather than read a transient
    // anonymous marker as a backout. Reset the streak too: a settling tick
    // means the header is mid-transition, not continuously anonymous.
    if (settling) {
      anonymousStreak = 0
      continue
    }
    if (authed) return 'authed'
    // Only count an anonymous sample when the auth read is a definitive false.
    // A rejected auth read (authed === null) means the page is mid-redirect, so
    // the anonymous marker is not yet trustworthy and the sample must not count.
    anonymousStreak = anonymous && authed === false ? anonymousStreak + 1 : 0
    if (anonymousStreak >= 3) return 'backout'
  }
  return 'timeout'
}

// Poll for CR's `<video>` and hand back the revived RemoteVideoElement
// once the player mounts. Bounded: if no video appears in time the episode is
// unavailable or the player failed to mount, so surface that instead of
// leaving a black, inert player.
const VIDEO_TIMEOUT = 30_000
const waitForVideoElement = async (frame: Frame, isCancelled: () => boolean) => {
  const deadline = Date.now() + VIDEO_TIMEOUT
  while (!isCancelled() && Date.now() < deadline) {
    try {
      if (await frame.locator('video').exists()) return await frame.locator('video').videoElement()
    } catch (err) {
      // Terminal: this backend can never produce the handle (the cloud path
      // rejects videoElement); surface it instead of polling forever.
      if ((err as Error | null)?.name === 'LocatorUnsupportedError') throw err
      /* frame torn down or not ready yet; retry */
    }
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
    /* CR's own chrome is hidden, so the iframe must not swallow clicks -
       taps belong to the videojs gesture layer stacked above it. */
    pointer-events: none;
  }

  /* On the cloud backend CR's native controls ARE the player UI (and the
     in-frame sign-in needs a working form), so the frame takes the taps. */
  .cr-frame.cloud {
    pointer-events: auto;
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

    &:disabled {
      opacity: 0.6;
      cursor: default;
    }
  }
`

const CrunchyrollPlayer = ({ url }: PlayerProps) => {
  const [mode, setMode] = useState<Backend>('detecting')
  const [iframe, setIframe] = useState<HTMLIFrameElement | null>(null)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [loading, setLoading] = useState(true)
  const [loggedOut, setLoggedOut] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [error, setError] = useState<string>()
  const [remoteVideo, setRemoteVideo] = useState<RemoteVideoElement | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [attachKey, setAttachKey] = useState(0)
  const [popupOpen, setPopupOpen] = useState(false)
  const [popupBlocked, setPopupBlocked] = useState(false)
  const popupInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    let cancelled = false
    detectBackend().then(detected => { if (!cancelled) setMode(detected) })
    return () => { cancelled = true }
  }, [])

  // Attach the peer osra channel to the iframe once. The frame outlives
  // re-logins; only the navigation/auth pass below re-runs. If the library
  // lands on the other backend after all (a content script exposing at the
  // last moment), flip the mode: the keyed iframe remounts in the right
  // tree and this effect re-attaches.
  useEffect(() => {
    if (!iframe || mode === 'detecting') return
    let cancelled = false
    attachFrame({ iframe, domains: CRUNCHYROLL_DOMAINS })
      .then(f => {
        if (cancelled) return
        const actual: Backend = isExtensionExposed() ? 'extension' : 'cloud'
        if (actual !== mode) {
          setMode(actual)
          return
        }
        setFrame(f)
      })
      .catch(err => {
        if (cancelled) return
        console.error('Failed to attach Crunchyroll frame', err)
        setError(err?.message ?? 'Failed to load player')
        setLoading(false)
      })
    return () => { cancelled = true }
  }, [iframe, mode])

  // Navigate to the watch URL and confirm login. The two backends differ: on
  // the extension the chrome CSS goes in at documentstart (pre-paint) and, once
  // authed, the video element is revived for the skin; a logged-out user signs
  // in via a popup over the shared browser session. On the cloud backend the
  // chrome CSS and native player apply at load, and a logged-out user signs in
  // inside the frame (its cookie jar is separate). `reloadKey` re-runs the pass
  // after a login round-trip so the same URL resolves authed.
  useEffect(() => {
    if (!frame) return
    let cancelled = false
    const isCancelled = () => cancelled
    setLoading(true)
    setError(undefined)
    setLoggedOut(false)
    setLoggingIn(false)
    setRemoteVideo(null)
    ;(async () => {
      if (mode === 'cloud') {
        // 'load', not 'documentstart': the render proxy applies locator calls
        // to the committed document, so nothing may race the navigation.
        await frame.goto(url, { waitUntil: 'load' })
        if (cancelled) return
        const { isLoggedIn } = await checkIsLoggedIn(frame, isCancelled)
        if (cancelled) return
        if (isLoggedIn) {
          // Authed: hide the page chrome and surface CR's native player. The
          // cloud path keeps CR's own controls, so it ends at the auth check.
          await frame.addStyleTag({ content: CRUNCHYROLL_CLOUD_CSS })
          if (cancelled) return
          setLoading(false)
          return
        }
        // Logged out: the watch page shows a premium wall and no player, so
        // don't hide chrome. The proxied frame reads the render proxy's own
        // cookie jar, which an out-of-frame popup never writes, so the sign-in
        // must run inside the frame. Open CR's SSO login pointed back at this
        // episode and wait for the session; the authorize callback already
        // landed the frame back on the watch page, so continue in place
        // rather than re-navigate to a URL it is already showing.
        setLoading(false)
        setLoggedOut(true)
        setLoggingIn(true)
        await frame.goto(buildLoginUrl(url, true), { waitUntil: 'load' })
        const outcome = await waitForLoginReturn(frame, isCancelled)
        if (cancelled) return
        setLoggingIn(false)
        if (outcome === 'backout') {
          // The user backed out of sign-in onto the anonymous watch page.
          // Return to the logged-out state so the overlay offers a fresh
          // attempt rather than an error.
          setLoggedOut(true)
          setLoading(false)
          return
        }
        if (outcome === 'lost') throw new Error('Lost the connection to the player frame')
        if (outcome !== 'authed') throw new Error('Sign-in was not completed in time')
        // The session is established. The SSO callback usually lands back on
        // this episode, but the authenticated header alone does not prove the
        // frame is on the right watch page (the user could have navigated to a
        // different episode or page mid-login), so navigate to the episode
        // before styling it. Keep the loading overlay up through the reload,
        // and re-check auth in case the session dropped between the poll and
        // the navigation (the cloud CSS hides a page with no player, so a wall
        // must surface the login prompt, not go black).
        setLoading(true)
        setLoggedOut(false)
        await frame.goto(url, { waitUntil: 'load' })
        if (cancelled) return
        const { isLoggedIn: stillAuthed } = await checkIsLoggedIn(frame, isCancelled)
        if (cancelled) return
        if (!stillAuthed) {
          setLoading(false)
          setLoggedOut(true)
          return
        }
        await frame.addStyleTag({ content: CRUNCHYROLL_CLOUD_CSS })
        if (cancelled) return
        setLoading(false)
        return
      }
      // Extension backend. Inject the chrome CSS at documentstart so it lands
      // pre-paint (and so the library's style observer disconnects on the load
      // event instead of watching every DOM mutation for the frame's life).
      // On the wall page those selectors match nothing, so a logged-out user
      // is unaffected.
      await frame.goto(url, { waitUntil: 'documentstart' })
      await frame.addStyleTag({ content: CRUNCHYROLL_OUTER_CSS })
      if (cancelled) return
      const { isLoggedIn } = await checkIsLoggedIn(frame, isCancelled)
      if (cancelled) return
      if (!isLoggedIn) {
        setLoading(false)
        // The frame shares the user's real browser session, so a popup on the
        // real site sets the cookie the frame uses. The overlay's login button
        // drives that round-trip.
        setLoggedOut(true)
        return
      }
      // Keep the loading overlay up while the video mounts so a slow start
      // shows progress instead of a black player. On timeout this throws to a
      // recoverable error (Retry re-attaches).
      const video = await waitForVideoElement(frame, isCancelled)
      if (cancelled) return
      setLoading(false)
      if (!video) throw new Error('The episode did not load a player. It may be unavailable or require a different plan.')
      setRemoteVideo(video)
    })().catch(err => {
      if (cancelled) return
      console.error('Failed to load Crunchyroll player', err)
      setError(err?.message || 'Failed to load player')
      setLoading(false)
      setLoggingIn(false)
    })
    return () => { cancelled = true }
  }, [frame, url, reloadKey, mode])

  // On the extension backend the frame shares the user's real browser session,
  // so a popup on the real site sets the cookie the frame uses. Point it at the
  // SSO authorize URL; the popup returns to a neutral page (not the episode, so
  // it does not start a second player there), then reload the player once it
  // closes.
  const openLogin = useCallback(() => {
    // Single-flight: one popup and one close-watcher at a time, so a second
    // click cannot open a parallel login or fire a redundant reload on close.
    if (popupInterval.current !== null) return
    const popup = globalThis.open(buildLoginUrl(url, false), '_blank', 'width=500,height=700')
    if (!popup) {
      // Popup blocked: tell the user instead of failing silently. Track it
      // separately from a real error so the retry button re-opens the popup
      // rather than needlessly re-attaching the frame.
      setPopupBlocked(true)
      setLoading(false)
      return
    }
    setPopupBlocked(false)
    setPopupOpen(true)
    popupInterval.current = setInterval(() => {
      if (!popup.closed) return
      clearInterval(popupInterval.current!)
      popupInterval.current = null
      setPopupOpen(false)
      setReloadKey(k => k + 1)
    }, 500)
  }, [url])

  // Release the close-watcher if the player unmounts with a popup still open.
  useEffect(() => () => {
    if (popupInterval.current !== null) {
      clearInterval(popupInterval.current)
      popupInterval.current = null
    }
  }, [])

  // On an episode switch, drop the single-flight lock: the old popup (if still
  // open) belongs to the previous episode, so its close should not reload this
  // one, and this episode's login button must work. Close the old popup too so
  // it cannot linger as a duplicate player.
  useEffect(() => {
    if (popupInterval.current !== null) {
      clearInterval(popupInterval.current)
      popupInterval.current = null
      setPopupOpen(false)
    }
  }, [url])

  // While logging in on the cloud backend the frame shows CR's own login page
  // and needs no overlay; the frame itself is the UI. Otherwise surface
  // loading / error, and a logged-out prompt: a popup-driven login button on
  // the extension backend, or on cloud (after the user backed out of the
  // in-frame sign-in) a retry that re-runs the automatic in-frame login.
  // Retry after an error. Bumping attachKey remounts the iframe (keyed on it)
  // so attachFrame runs against a fresh element: the cloud backend refuses to
  // re-attach an iframe it already attached, and a lost frame needs a fresh
  // element anyway. Clearing frame and error lets the whole attach + navigate
  // pass start clean.
  const retry = useCallback(() => {
    setFrame(null)
    setError(undefined)
    setRemoteVideo(null)
    setLoggedOut(false)
    setPopupBlocked(false)
    setLoading(true)
    setAttachKey(k => k + 1)
  }, [])
  const overlay = (loading || error || popupBlocked || (loggedOut && !loggingIn)) && (
    <div className="overlay">
      {loggedOut && !error && (
        <>
          You need to be logged in to Crunchyroll to watch this content.
          {mode === 'extension'
            ? (
              <button className="login-button" onClick={openLogin} disabled={popupOpen}>
                {popupOpen ? 'Finish signing in the popup...' : 'Open Crunchyroll Login Page'}
              </button>
            )
            : <button className="login-button" onClick={retry}>Try signing in again</button>
          }
        </>
      )}
      {popupBlocked && !error && (
        <>
          The login popup was blocked. Allow popups for this page and try again.
          <button className="login-button" onClick={openLogin}>Open Crunchyroll Login Page</button>
        </>
      )}
      {error && (
        <>
          {error}
          <button className="login-button" onClick={retry}>Retry</button>
        </>
      )}
      {loading && !error && !loggedOut && 'Loading Crunchyroll player...'}
    </div>
  )

  // Extension backend: the skin is always mounted with the iframe nested
  // inside its Container - attachFrame needs the iframe from the start,
  // fullscreen needs the video inside the fullscreened element, and the
  // skin's gesture layer needs to sit above it. `remote`/`frame` are null
  // until the video is ready, at which point media attaches.
  // Cloud backend: no skin; CR's native player takes the pointer events and
  // fullscreens itself through the delegated allow list. The keyed iframes
  // keep a mode flip from silently reparenting an attached frame.
  return (
    <div css={styles}>
      {mode === 'extension' && (
        <CrunchyrollVideoJSPlayer remote={remoteVideo} frame={frame}>
          <iframe
            key={`extension-${attachKey}`}
            ref={setIframe}
            className="cr-frame"
            referrerPolicy="no-referrer"
            allow="encrypted-media; autoplay; fullscreen;"
          />
        </CrunchyrollVideoJSPlayer>
      )}
      {mode === 'cloud' && (
        <iframe
          key={`cloud-${attachKey}`}
          ref={setIframe}
          className="cr-frame cloud"
          referrerPolicy="no-referrer"
          allow="encrypted-media; autoplay; fullscreen;"
        />
      )}
      {overlay}
    </div>
  )
}

export default CrunchyrollPlayer
