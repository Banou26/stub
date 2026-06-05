import type { Frame, RemoteVideoElement } from '@fkn/lib'
import type { Media } from '@videojs/core/dom'
import type { ComponentChildren, FunctionComponent } from 'preact'

import { css } from '@emotion/react'
import { permissions } from '@fkn/lib'
import { useEffect } from 'preact/hooks'
import { videoFeatures } from '@videojs/core/dom'
import { createPlayer, useMediaAttach } from '@videojs/react'
import { VideoSkin as VideoSkinBase } from '@videojs/react/video'

const VideoSkin = VideoSkinBase as FunctionComponent<Parameters<typeof VideoSkinBase>[0]>
import '@videojs/react/video/skin.css'

// Netflix's Cadmium is an MSE player that OWNS the <video> timeline: it appends
// segments only around the position its own scheduler believes it's at, so a raw
// `video.currentTime` write lands in an unbuffered gap, desyncs the scheduler and
// trips the M7375 error screen (currentTime is an *output* of Cadmium, not an input).
// So — unlike Crunchyroll, where a bare currentTime write is merely ignored — we must
// NOT let the write reach the element at all. We swallow it, replay the seek onto
// Netflix's own timeline as a positional click (its scrubber is a custom div, not an
// <input>, so CR's value-`fill` doesn't transfer), and show the target optimistically
// until Cadmium's real seek lands. @fkn/lib's `click` takes position as a *fraction*
// of the element box (0..1), so we pass `targetSeconds / duration` — no pixel measuring.
const NF_TIMELINE_SELECTOR = '[data-uia="timeline"]'
const NF_CANVAS_SELECTOR = '[data-uia="video-canvas"]'
const NF_PLAYER_SELECTOR = '[data-uia="player"]'
const SEEK_REASON = 'Seeks the video to the point you pick on the timeline.'
const REVEAL_REASON = 'Reveals the player controls so the timeline can be used.'

// Seeking touches three gated ops on distinct selectors (hover the surface to reveal
// controls, hover the player, click the timeline). Left to themselves each prompts
// separately; requesting them together up front (the scope is the raw selector, the
// key is the op's permission scope) batches them into ONE consent sheet — already
// -granted ones resolve without a sheet, so this is safe to call before every seek.
const SEEK_PERMISSIONS = [
  { key: 'act.hover', scope: NF_CANVAS_SELECTOR, reason: REVEAL_REASON },
  { key: 'act.hover', scope: NF_PLAYER_SELECTOR, reason: REVEAL_REASON },
  { key: 'act.click', scope: NF_TIMELINE_SELECTOR, reason: SEEK_REASON },
] as Parameters<typeof permissions.request>[0]
const SEEK_DEBOUNCE_MS = 140
const LAND_TOLERANCE_S = 2
const OPTIMISTIC_TIMEOUT_MS = 12_000
const REVEAL_ATTEMPTS = 16
const REVEAL_POLL_MS = 110

// `position` (fractional click) and `reason` (permission consent string) aren't in the
// published @fkn/lib types yet; narrow to the shapes we rely on so they ride along —
// harmlessly ignored by builds that predate them (same trick CR uses for fill/reason).
type SeekLocator = {
  click: (options?: { position?: { x?: number, y?: number }, reason?: string }) => Promise<unknown>
  hover: (options?: { reason?: string }) => Promise<unknown>
  exists: (options?: { reason?: string }) => Promise<boolean>
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)

const createNetflixSeekMedia = (remote: RemoteVideoElement, frame: Frame) => {
  // The target shown to the skin while Cadmium's real seek is in flight; cleared
  // once the element actually reaches it (or after a timeout, if the seek failed).
  let optimistic: number | null = null
  let debounce: ReturnType<typeof setTimeout> | undefined
  let expire: ReturnType<typeof setTimeout> | undefined

  // Batch all three seek permissions into one consent sheet on the first seek.
  let permissionsPrimed = false
  const primePermissions = async () => {
    if (permissionsPrimed) return
    try {
      await permissions.request(SEEK_PERMISSIONS)
      permissionsPrimed = true
    } catch (err) {
      console.warn('[nf] permission request failed:', err)
    }
  }

  const onTimeUpdate = () => {
    if (optimistic == null) return
    const real = remote.currentTime
    if (Number.isFinite(real) && Math.abs(real - optimistic) < LAND_TOLERANCE_S) {
      optimistic = null
      if (expire) clearTimeout(expire)
    }
  }
  remote.addEventListener('timeupdate', onTimeUpdate)

  const commitSeek = async (targetSeconds: number) => {
    const duration = remote.duration
    if (!Number.isFinite(duration) || duration <= 0) { console.warn('[nf] seek: duration unknown', duration); return }
    const fraction = clamp01(targetSeconds / duration)
    // Fire-and-forget: open the single batched consent sheet, but DON'T block the
    // seek on it — the hover/click ops below self-gate and latch onto that sheet's
    // rows (same key+scope dedupes), so it stays one prompt without stalling the seek.
    void primePermissions()
    const timeline = frame.locator(NF_TIMELINE_SELECTOR) as unknown as SeekLocator
    // Netflix only mounts its controls (incl. the timeline) while PLAYING and shortly
    // after mouse activity; fully paused it shows a title card with no scrubber. So play
    // if paused, keep nudging the controls visible until the timeline mounts (the bar
    // idle-hides ~3s after one mousemove, so re-hover), click, then restore pause.
    const wasPaused = remote.paused === true
    if (wasPaused) { try { await remote.play() } catch { /* ignore */ } }
    let mounted = false
    let hoverOk = 0
    let lastHoverErr: string | undefined
    for (let attempt = 0; attempt < REVEAL_ATTEMPTS; attempt++) {
      if (attempt % 3 === 0) {
        await (frame.locator(NF_CANVAS_SELECTOR) as unknown as SeekLocator).hover({ reason: SEEK_REASON })
          .then(() => { hoverOk++ }, e => { lastHoverErr = e?.message ?? String(e) })
        await (frame.locator(NF_PLAYER_SELECTOR) as unknown as SeekLocator).hover({ reason: SEEK_REASON }).catch(() => {})
      }
      if (await timeline.exists().catch(() => false)) { mounted = true; break }
      await sleep(REVEAL_POLL_MS)
    }
    if (!mounted) {
      console.warn(`[nf] timeline never mounted — wasPaused:${wasPaused} hoverOk:${hoverOk} hoverErr:${lastHoverErr ?? 'none'}`)
      if (wasPaused) { try { await remote.pause() } catch { /* ignore */ } }
      return
    }
    await timeline.click({ position: { x: fraction, y: 0.5 }, reason: SEEK_REASON })
      .then(() => console.log(`[nf] seek → ${Math.round(targetSeconds)}s (x=${fraction.toFixed(3)})`),
        err => console.warn('[nf] timeline click failed:', err?.message ?? err))
    if (wasPaused) { try { await remote.pause() } catch { /* ignore */ } }
  }

  const media = new Proxy(remote, {
    get(target, prop, receiver) {
      if (prop === 'currentTime' && optimistic != null) return optimistic
      return Reflect.get(target, prop, receiver)
    },
    set(target, prop, value, receiver) {
      if (prop === 'currentTime' && typeof value === 'number' && Number.isFinite(value)) {
        optimistic = value
        if (debounce) clearTimeout(debounce)
        debounce = setTimeout(() => { commitSeek(value).catch(err => console.warn('[nf] timeline seek failed:', err)) }, SEEK_DEBOUNCE_MS)
        if (expire) clearTimeout(expire)
        expire = setTimeout(() => { optimistic = null }, OPTIMISTIC_TIMEOUT_MS)
        return true
      }
      return Reflect.set(target, prop, value, receiver)
    },
  }) as unknown as Media

  const dispose = () => {
    remote.removeEventListener('timeupdate', onTimeUpdate)
    if (debounce) clearTimeout(debounce)
    if (expire) clearTimeout(expire)
  }

  return { media, dispose }
}

const { Provider } = createPlayer({ features: videoFeatures })

const MediaAttach = ({ remote, frame }: { remote: RemoteVideoElement | null, frame: Frame | null }) => {
  const setMedia = useMediaAttach()
  useEffect(() => {
    if (!setMedia || !remote || !frame) return
    const { media, dispose } = createNetflixSeekMedia(remote, frame)
    setMedia(media)
    return () => { setMedia(null); dispose() }
  }, [remote, frame, setMedia])
  return null
}

type Props = {
  remote: RemoteVideoElement | null
  frame: Frame | null
  children?: ComponentChildren
}

// The Netflix iframe renders inside the skin's Container (as its first child) so
// fullscreen (which fullscreens the Container) still carries the video, and so taps
// land on the skin's gesture layer above the `pointer-events: none` iframe.
const NetflixVideoJSPlayer = ({ remote, frame, children }: Props) => (
  <Provider>
    <MediaAttach remote={remote} frame={frame} />
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
