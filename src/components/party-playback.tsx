import type { RefObject } from 'preact'
import type { PlaybackState } from '../party'

import { useEffect, useRef } from 'preact/hooks'

import { party } from '../party'
import { attachPlaybackBridge } from '../party/bridge'
import { useParty, usePartyMessages } from '../party/use-party'

/**
 * The watch page's half of playback sync, over the embed iframe the page renders.
 *
 * A host forwards what its player reports and keeps the store's snapshot current, so a joiner is told
 * where the video is. A guest applies what the host said, and applies it AGAIN on every report from
 * its own player: the first report is the player saying it exists, which is when a state that arrived
 * before it loaded can finally land, and every later one is the player answering a correction, which
 * matches the host and changes nothing, or a person touching a follower's controls, which the host's
 * word overrides.
 */
const PartyPlayback = ({ iframe, src }: { iframe: RefObject<HTMLIFrameElement>, src: string | undefined }) => {
  const state = useParty()
  const role = state.status === 'active' ? state.role : undefined
  const bridge = useRef<ReturnType<typeof attachPlaybackBridge> | undefined>(undefined)
  const wanted = useRef<PlaybackState | undefined>(undefined)

  useEffect(() => {
    const element = iframe.current
    if (!element || !role || !src) return
    const attached = attachPlaybackBridge(element, reported => {
      if (role === 'host') {
        party.setPlayback(reported)
        party.send({ t: 'playback', s: reported })
      } else if (wanted.current) {
        attached.apply(wanted.current)
      }
    })
    bridge.current = attached
    return () => {
      attached.dispose()
      bridge.current = undefined
      if (role === 'host') party.setPlayback(undefined)
    }
  }, [role, src])

  usePartyMessages(message => {
    if (role !== 'guest') return
    const next = message.t === 'playback' ? message.s : message.t === 'state' ? message.s : undefined
    if (!next) return
    // the host's playback is for the host's page: a guest on another episode keeps its own
    const here = location.pathname + location.search
    if (party.hostPath() !== here) return
    wanted.current = next
    bridge.current?.apply(next)
  })

  return null
}

export default PartyPlayback
