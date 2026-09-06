import type { PlaybackLink } from '../party/bridge'
import type { PlaybackState } from '../party'

import { useEffect, useRef } from 'preact/hooks'

import { party } from '../party'
import { advance } from '../party/playback'
import { useParty, usePartyMessages } from '../party/use-party'

/**
 * The watch page's half of playback sync, over whichever player the page has up.
 *
 * A host forwards what its player reports and keeps the store's snapshot current, so a joiner is told
 * where the video is. A guest applies what the host said, and applies it AGAIN on every report from
 * its own player: the first report is the player saying it exists, which is when a state that arrived
 * before it loaded can finally land, and every later one is the player answering a correction, which
 * matches the host and changes nothing, or a person touching a follower's controls, which the host's
 * word overrides.
 */
const PartyPlayback = ({ link }: { link: PlaybackLink | undefined }) => {
  const state = useParty()
  const role = state.status === 'active' ? state.role : undefined
  // what the host last said, and WHEN it was heard on this clock, so a re-apply later is moved
  // forward by the time that passed rather than seeking the player back to a stale second
  const wanted = useRef<{ state: PlaybackState, receivedAt: number } | undefined>(undefined)

  useEffect(() => {
    // a state heard for one player is not for the next: a new link is a new player, or the same
    // player on a different release, and either way it starts from what the host says next
    wanted.current = undefined
    if (!link || !role) return
    const off = link.onReport(reported => {
      if (role === 'host') {
        party.setPlayback(reported)
        party.send({ t: 'playback', s: reported })
      } else if (wanted.current) {
        link.apply(advance(wanted.current.state, wanted.current.receivedAt, Date.now()))
      }
    })
    return () => {
      off()
      if (role === 'host') party.setPlayback(undefined)
    }
  }, [role, link])

  usePartyMessages(message => {
    if (role !== 'guest') return
    const next = message.t === 'playback' ? message.s : message.t === 'state' ? message.s : undefined
    if (!next) return
    // the host's playback is for the host's page: a guest on another episode keeps its own
    const here = location.pathname + location.search
    if (party.hostPath() !== here) return
    wanted.current = { state: next, receivedAt: Date.now() }
    link?.apply(next)
  })

  return null
}

export default PartyPlayback
