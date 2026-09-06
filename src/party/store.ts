import type { rooms } from '@fkn/lib'
import type { PartyMessage, PlaybackState } from './protocol'

import { decodePartyMessage, encodePartyMessage } from './protocol'

// The party's state machine, over a room it is handed rather than one it imports: @fkn/lib cannot
// load under vitest, and the machine is where the bugs would live (who may speak, who is ignored,
// what a joiner is told, what ends the party). ./index.ts binds it to the real rooms api.

/** The slice of `@fkn/lib`'s rooms namespace the store calls, so a test can hand it a fake. */
export type RoomsApi = Pick<typeof rooms, 'available' | 'create' | 'join'>
export type Room = rooms.Room

export type PartyRole = 'host' | 'guest'

/** Why a party stopped. The room's own reasons, plus the one only this store can see. */
export type PartyEndReason = rooms.RoomEnd['reason'] | 'host-left'

export type PartyState =
  | { status: 'idle' }
  | { status: 'joining', invite: string }
  | { status: 'active', role: PartyRole, invite: string, members: number }
  | { status: 'ended', reason: PartyEndReason }
  | { status: 'failed', code: rooms.RoomsErrorCode | 'unknown' }

/** Where the host is, as the host's own app keeps reporting it. What a joiner is handed. */
export type PartySnapshot = { path: string, y: number, playback?: PlaybackState }

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type PartyStore = {
  getState: () => PartyState
  subscribe: (listener: (state: PartyState) => void) => () => void
  /**
   * What the host said, decoded. Fires for guests only: a host does not follow itself.
   *
   * `replayed` is true when `replay` is saying it again, which is the guest asking to be caught up
   * rather than the host saying something new.
   */
  onMessage: (listener: (message: PartyMessage, replayed: boolean) => void) => () => void
  create: () => Promise<void>
  join: (invite: string) => Promise<void>
  leave: () => Promise<void>
  /** Rejoin whatever this tab was in before a reload, inside the api's hold. Silent when there was nothing. */
  resume: () => Promise<void>
  /** Host only. Anything else is dropped here, and would be refused by the api anyway. */
  send: (message: PartyMessage) => void
  /** The host's app keeps these current so a joiner can be told where the party is. */
  setLocation: (path: string, y: number) => void
  setPlayback: (playback: PlaybackState | undefined) => void
  /** The link for a follower, or nothing outside an active party. */
  invite: () => string | undefined
  /** Where the host last said it was, for a guest deciding whether a scroll or a playback is for the page it is on. */
  hostPath: () => string | undefined
  /** Say the last thing the host said again, for a guest who wandered off and wants back. */
  replay: () => void
  /** Clear an ended or failed party from view. */
  dismiss: () => void
}

export const PARTY_SESSION_KEY = 'stub-party-invite'

/**
 * How often a host repeats where the party is, whether or not anything happened.
 *
 * A joiner is told on `joined`, but a follower coming back inside the api's hold (a reload, a phone
 * unlocking) is not a joiner: the api reserved its seat, so nobody is told it left or returned, and
 * a store rebuilt by the reload has heard nothing. Ten seconds is one message in ten of the budget a
 * member has every second, and the longest a returning follower waits with nothing to follow.
 */
export const STATE_HEARTBEAT_MS = 10_000

const defaultStorage = (): StorageLike | undefined => {
  try { return globalThis.sessionStorage } catch { return undefined }
}

const isRoomsError = (error: unknown): error is rooms.RoomsError =>
  error instanceof Error && typeof (error as { code?: unknown }).code === 'string'

export const createPartyStore = (api: RoomsApi, storage: StorageLike | undefined = defaultStorage()): PartyStore => {
  let state: PartyState = { status: 'idle' }
  let room: Room | undefined
  let unlisten: (() => void) | undefined
  const snapshot: PartySnapshot = { path: '/', y: 0 }
  const stateListeners = new Set<(state: PartyState) => void>()
  const messageListeners = new Set<(message: PartyMessage, replayed: boolean) => void>()
  let heartbeat: ReturnType<typeof setInterval> | undefined
  // the latest of each kind the host said, so a guest can be brought back without asking the host
  const heard = new Map<PartyMessage['t'], PartyMessage>()

  const setState = (next: PartyState) => {
    state = next
    for (const listener of stateListeners) listener(state)
  }

  const remember = (invite: string) => { try { storage?.setItem(PARTY_SESSION_KEY, invite) } catch {} }
  const forget = () => { try { storage?.removeItem(PARTY_SESSION_KEY) } catch {} }
  const remembered = (): string | undefined => { try { return storage?.getItem(PARTY_SESSION_KEY) ?? undefined } catch { return undefined } }

  const roleIn = (joined: Room): PartyRole => joined.owner === joined.self.id ? 'host' : 'guest'

  const memberCount = async (joined: Room) => {
    const members = await joined.members().catch(() => undefined)
    if (room !== joined || state.status !== 'active') return
    if (members) setState({ ...state, members: members.length })
  }

  // Sending is fire and forget: a refusal on one message is not the party's business. `rate-limited`
  // is the host scrubbing faster than the room admits, and the next heartbeat carries the position
  // anyway; `closed` is answered through `room.closed` below.
  const send = (message: PartyMessage) => {
    if (!room || state.status !== 'active' || state.role !== 'host') return
    room.send(encodePartyMessage(message)).catch(() => {})
  }

  const whereWeAre = (): PartyMessage => ({ t: 'state', path: snapshot.path, y: snapshot.y, ...snapshot.playback ? { s: snapshot.playback } : {} })

  const detach = () => {
    unlisten?.()
    unlisten = undefined
    room = undefined
    if (heartbeat) clearInterval(heartbeat)
    heartbeat = undefined
  }

  const attach = async (joined: Room) => {
    room = joined
    const role = roleIn(joined)
    setState({ status: 'active', role, invite: joined.invite, members: 1 })
    remember(joined.invite)

    unlisten = await joined.on(event => {
      if (room !== joined) return
      switch (event.type) {
        case 'message': {
          // The host hears its own messages back with the same seq, and a guest could in principle
          // hear another guest if the defaults were ever loosened. Neither is the host speaking.
          if (role === 'host' || event.message.from !== joined.owner) return
          const message = decodePartyMessage(event.message.text)
          if (!message) return
          heard.delete(message.t)
          heard.set(message.t, message)
          for (const listener of messageListeners) listener(message, false)
          return
        }
        case 'joined': {
          // What a joiner needs is where the party is NOW, so it is built from the latest report
          // rather than from the last thing that happened to be sent.
          if (role === 'host') send(whereWeAre())
          void memberCount(joined)
          return
        }
        case 'left': {
          // A room outlives its owner, a party does not: nobody else can ever send, so a room whose
          // host is gone is a room where nothing will ever happen again.
          if (role === 'guest' && event.id === joined.owner) {
            void end('host-left')
            return
          }
          void memberCount(joined)
          return
        }
      }
    })
    if (room !== joined) { unlisten(); unlisten = undefined; return }

    if (role === 'host') heartbeat = setInterval(() => send(whereWeAre()), STATE_HEARTBEAT_MS)
    void memberCount(joined)
    joined.closed.then(({ reason }) => {
      if (room !== joined) return
      detach()
      forget()
      setState({ status: 'ended', reason })
    })
  }

  const end = async (reason: PartyEndReason) => {
    const leaving = room
    detach()
    forget()
    setState({ status: 'ended', reason })
    await leaving?.leave().catch(() => {})
  }

  const fail = (error: unknown, resuming: boolean) => {
    forget()
    // A resume that finds no room is a party that ended while the tab was closed, and there is
    // nothing to announce on a page that never showed one.
    if (resuming) { setState({ status: 'idle' }); return }
    setState({ status: 'failed', code: isRoomsError(error) ? error.code : 'unknown' })
  }

  const open = async (invite: string | undefined, start: () => Promise<Room>, resuming = false) => {
    if (room) await end('left')
    heard.clear()
    setState({ status: 'joining', invite: invite ?? '' })
    try {
      const joined = await start()
      await attach(joined)
    } catch (error) {
      fail(error, resuming)
    }
  }

  return {
    getState: () => state,
    subscribe: listener => { stateListeners.add(listener); return () => { stateListeners.delete(listener) } },
    onMessage: listener => { messageListeners.add(listener); return () => { messageListeners.delete(listener) } },
    // Followers cannot send: the room is created with `send` off by default, and the owner keeps every
    // permission whatever the defaults say. That is the whole permission model, enforced by the api.
    create: () => open(undefined, () => api.create({ defaults: { send: false } })),
    join: invite => open(invite, () => api.join(invite)),
    resume: async () => {
      const invite = remembered()
      if (!invite || room) return
      await open(invite, () => api.join(invite), true)
    },
    leave: async () => { if (room) await end('left') },
    send,
    setLocation: (path, y) => { snapshot.path = path; snapshot.y = y },
    setPlayback: playback => { snapshot.playback = playback },
    invite: () => state.status === 'active' ? state.invite : undefined,
    hostPath: () => {
      const last = [...heard.values()].filter((message): message is Extract<PartyMessage, { path: string }> => 'path' in message)
      // whichever of the two carried a path was heard last: the store keeps one per kind, so the later
      // one is the one with the higher seq, and both are set in order of arrival
      return last.at(-1)?.path
    },
    replay: () => {
      // a nav first, so a scroll or a playback lands on the page it was meant for
      for (const kind of ['state', 'nav', 'scroll', 'playback'] as const) {
        const message = heard.get(kind)
        if (message) for (const listener of messageListeners) listener(message, true)
      }
    },
    dismiss: () => { if (state.status === 'ended' || state.status === 'failed') setState({ status: 'idle' }) },
  }
}
