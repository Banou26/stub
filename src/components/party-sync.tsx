import { useEffect, useRef } from 'preact/hooks'
import { useLocation, useSearch } from 'wouter'

import { party } from '../party'
import { scrollFraction, scrollTo } from '../party/scroll'
import { PARTY_PATH } from '../party/invite'
import { useParty, usePartyMessages } from '../party/use-party'

// Where the host is, followed. Mounted once at the router root, so it outlives every page: a party
// is joined on one page and continues on the next.

/** The most scroll messages a host sends per second. The room admits ten of anything, and the heartbeat and the navs share it. */
const SCROLL_HZ = 2

const PartySync = () => {
  const state = useParty()
  const [location, navigate] = useLocation()
  const search = useSearch()
  const path = search ? `${location}?${search}` : location
  const role = state.status === 'active' ? state.role : undefined

  // The host: every move goes out, and the latest is what a joiner is told. Except the party's own
  // page: a host there is managing the door, not taking the party somewhere, and a follower dragged
  // to it would find nothing to follow.
  const atTheDoor = location === PARTY_PATH
  useEffect(() => {
    if (role !== 'host' || atTheDoor) return
    party.setLocation(path, scrollFraction())
    party.send({ t: 'nav', path })
  }, [role, path, atTheDoor])

  useEffect(() => {
    if (role !== 'host' || atTheDoor) return
    let last = 0
    let pending: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      pending = undefined
      last = Date.now()
      const y = scrollFraction()
      party.setLocation(path, y)
      party.send({ t: 'scroll', y })
    }
    // a trailing throttle: the last position of a scroll always goes out, never more than SCROLL_HZ
    const onScroll = () => {
      if (pending) return
      const wait = Math.max(0, 1000 / SCROLL_HZ - (Date.now() - last))
      pending = setTimeout(flush, wait)
    }
    // On the DOCUMENT in the capture phase, not on the window: a scroll inside an element does not
    // bubble, so a window listener hears the page and nothing else. Capture hears every scroll on
    // the way down, whichever box it happened in.
    document.addEventListener('scroll', onScroll, { passive: true, capture: true })
    return () => {
      document.removeEventListener('scroll', onScroll, { capture: true })
      if (pending) clearTimeout(pending)
    }
  }, [role, path])

  // The guest: the host's location becomes this one. A scroll that names a page this guest is not on
  // yet is held until the navigation lands, since the new page has no height to scroll through
  // before it renders.
  const pendingScroll = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (pendingScroll.current === undefined) return
    const y = pendingScroll.current
    pendingScroll.current = undefined
    // Jumped, not glided: the page has only just rendered and the guest is being placed where the
    // party already is. Gliding there would crawl the whole way down a page nobody has seen yet.
    const frame = requestAnimationFrame(() => scrollTo(y))
    return () => cancelAnimationFrame(frame)
  }, [path])

  // Whether this guest has been taken to the party yet. A `state` is the host saying where the party
  // IS, repeated every few seconds for whoever just arrived, and it moves a guest exactly once: on the
  // first one, and on Catch up. A guest who then wandered off on purpose stays wandered until the host
  // actually goes somewhere, which arrives as a `nav` and is always followed.
  const synced = useRef(false)
  const invite = state.status === 'active' ? state.invite : undefined
  useEffect(() => { synced.current = false }, [invite])

  const land = (to: string, y: number) => {
    synced.current = true
    if (to !== path) {
      pendingScroll.current = y
      navigate(to)
    } else {
      // already on the right page, so this is a catch up rather than an arrival: worth gliding, and
      // scroll.ts jumps instead on its own if the party turns out to be a long way off
      scrollTo(y, { smooth: true })
    }
  }

  usePartyMessages((message, { replayed }) => {
    if (role !== 'guest') return
    switch (message.t) {
      case 'nav':
        synced.current = true
        if (message.path !== path) navigate(message.path)
        return
      case 'scroll':
        // the host's scroll is for the host's page; a guest elsewhere has nothing of its own to move
        // Glided, because this is the one that repeats: the host's position lands twice a second while
        // they scroll, and jumping to each in turn reads as a stutter rather than as following someone.
        if (party.hostPath() === path) scrollTo(message.y, { smooth: true })
        return
      case 'state':
        if (!synced.current || replayed) land(message.path, message.y)
        return
    }
  })

  return null
}

export default PartySync
