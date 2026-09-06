import type { RemoteVideoElement } from '@fkn/lib'
import type { PlaybackState } from './protocol'

import { useEffect } from 'preact/hooks'

import { HEARTBEAT_MS, playbackCorrection } from './playback'

// The player lives inside the same-origin /embed.html iframe and the party lives in the page, so
// what the host's player does and what a follower's player must do both cross a postMessage seam.
// Two halves of one protocol, kept in one file so the message names cannot drift apart.

/** embed to page: what the player just did, or does every heartbeat while it plays */
const REPORT = 'stub:playback:report'
/** page to embed: make the player match this */
const APPLY = 'stub:playback:apply'
/** page to embed: report now, whatever the player is doing */
const ASK = 'stub:playback:ask'

type BridgeMessage =
  | { type: typeof REPORT, state: PlaybackState }
  | { type: typeof APPLY, state: PlaybackState }
  | { type: typeof ASK }

const isBridgeMessage = (data: unknown): data is BridgeMessage =>
  Boolean(data) && typeof data === 'object' && typeof (data as { type?: unknown }).type === 'string'

const stateOf = (remote: RemoteVideoElement): PlaybackState => ({
  paused: remote.paused,
  time: remote.currentTime,
  rate: remote.playbackRate,
  at: Date.now(),
})

/**
 * The embed's half: report what the player does to the page above, and do what the page asks.
 *
 * Reports go out on every event a person can cause and every few seconds while playing. Whether
 * they mean anything is the page's call: only a host forwards them to the room, so a follower's
 * player reporting the play the page just asked of it costs nothing and loops nowhere.
 *
 * Applied only when framed by the same origin. A top-level embed has no party above it, and a page
 * from anywhere else does not get to drive the player.
 */
export const usePlaybackBridge = (remote: RemoteVideoElement | null) => {
  useEffect(() => {
    if (!remote || window.parent === window) return
    const parent = window.parent
    const report = () => parent.postMessage({ type: REPORT, state: stateOf(remote) } satisfies BridgeMessage, location.origin)

    for (const event of PLAYER_EVENTS) remote.addEventListener(event, report)
    const heartbeat = setInterval(() => { if (!remote.paused) report() }, HEARTBEAT_MS)

    const onMessage = (event: MessageEvent) => {
      if (event.source !== parent || event.origin !== location.origin || !isBridgeMessage(event.data)) return
      if (event.data.type === ASK) { report(); return }
      if (event.data.type !== APPLY) return
      const correction = playbackCorrection(stateOf(remote), event.data.state, Date.now())
      if (correction.seek !== undefined) remote.currentTime = correction.seek
      if (correction.rate !== undefined) remote.playbackRate = correction.rate
      if (correction.pause) remote.pause()
      // a play refused by the browser (no gesture yet on this document) is retried by the next heartbeat
      if (correction.play) remote.play().catch(() => {})
    }
    window.addEventListener('message', onMessage)

    return () => {
      for (const event of PLAYER_EVENTS) remote.removeEventListener(event, report)
      clearInterval(heartbeat)
      window.removeEventListener('message', onMessage)
    }
  }, [remote])
}

const PLAYER_EVENTS = ['play', 'pause', 'seeked', 'ratechange'] as const

/**
 * The page's half, over one iframe: hear the player's reports, and drive it.
 *
 * `source` is checked against that iframe's window on every message, so a report from any other
 * frame on the page is not this player's.
 */
export const attachPlaybackBridge = (iframe: HTMLIFrameElement, onReport: (state: PlaybackState) => void) => {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== iframe.contentWindow || event.origin !== location.origin || !isBridgeMessage(event.data)) return
    if (event.data.type === REPORT) onReport(event.data.state)
  }
  window.addEventListener('message', onMessage)
  const post = (message: BridgeMessage) => iframe.contentWindow?.postMessage(message, location.origin)
  return {
    apply: (state: PlaybackState) => post({ type: APPLY, state }),
    ask: () => post({ type: ASK }),
    dispose: () => window.removeEventListener('message', onMessage),
  }
}
