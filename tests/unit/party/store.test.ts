// The state machine, driven through a fake room: who may speak, who is ignored, what a joiner is
// told, what ends the party, and what a reload gets back. The real rooms api is @fkn/lib, which
// cannot load here, and none of this depends on it.
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { rooms } from '@fkn/lib'
import { createPartyStore, PARTY_SESSION_KEY, STATE_HEARTBEAT_MS, type PartyState } from '../../../src/party/store'
import { decodePartyMessage, encodePartyMessage } from '../../../src/party/protocol'

type RoomEvent = rooms.RoomEvent
type Room = rooms.Room

const INVITE = '1b4e28ba-2fa1-11d2-883f-0016d3cca427.Qm9yZWQtYnV0LWhhcHB5LWV2ZXJ5LWRheS1vay1va2F5'

/** A room as the store sees one, with the wires to drive it from the test. */
const fakeRoom = ({ self, owner, members = [self] }: { self: string, owner: string, members?: string[] }) => {
  const listeners = new Set<(event: RoomEvent) => void>()
  const sent: string[] = []
  let resolveClosed!: (end: rooms.RoomEnd) => void
  const closed = new Promise<rooms.RoomEnd>(resolve => { resolveClosed = resolve })
  const perms = { send: true, receive: true, remove: false, block: false }
  const room = {
    id: INVITE.split('.')[0]!,
    key: INVITE.split('.')[1]!,
    invite: INVITE,
    self: { id: self, permissions: perms },
    owner,
    defaults: () => ({ send: false, receive: true }),
    members: async () => members.map(id => ({ id, permissions: perms })),
    send: vi.fn(async (text: string) => { sent.push(text) }),
    setDefault: vi.fn(async () => {}),
    grant: vi.fn(async () => {}),
    revoke: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
    block: vi.fn(async () => {}),
    unblock: vi.fn(async () => {}),
    on: async (listener: (event: RoomEvent) => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    leave: vi.fn(async () => { resolveClosed({ reason: 'left' }) }),
    closed,
  } satisfies Room
  return {
    room,
    sent,
    emit: (event: RoomEvent) => { for (const listener of listeners) listener(event) },
    end: (reason: rooms.RoomEnd['reason']) => resolveClosed({ reason }),
    join: (id: string) => { members.push(id) },
  }
}

const memoryStorage = () => {
  const store = new Map<string, string>()
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value) },
    removeItem: (key: string) => { store.delete(key) },
  }
}

const roomsError = (code: rooms.RoomsErrorCode) => Object.assign(new Error(`rooms: ${code}`), { code })

const api = (room: Room, joinError?: rooms.RoomsErrorCode) => ({
  available: async () => true,
  create: vi.fn(async () => room),
  join: vi.fn(async () => { if (joinError) throw roomsError(joinError); return room }),
})

const settle = () => new Promise(resolve => setTimeout(resolve, 0))

const lastSent = (sent: string[]) => decodePartyMessage(sent.at(-1)!)

describe('hosting', () => {
  test('creating makes this app the host, remembers the invite, and refuses followers a voice', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'me' })
    const storage = memoryStorage()
    const rooms = api(fake.room)
    const party = createPartyStore(rooms, storage)

    await party.create()
    await settle()

    expect(rooms.create).toHaveBeenCalledWith({ defaults: { send: false } })
    expect(party.getState()).toEqual({ status: 'active', role: 'host', invite: INVITE, members: 1 })
    expect(storage.store.get(PARTY_SESSION_KEY)).toBe(INVITE)
  })

  test('a host sends, and a guest does not', async () => {
    const asHost = fakeRoom({ self: 'me', owner: 'me' })
    const host = createPartyStore(api(asHost.room), memoryStorage())
    await host.create()
    host.send({ t: 'nav', path: '/search' })
    expect(asHost.sent).toHaveLength(1)
    expect(lastSent(asHost.sent)).toEqual({ t: 'nav', path: '/search' })

    const asGuest = fakeRoom({ self: 'me', owner: 'them' })
    const guest = createPartyStore(api(asGuest.room), memoryStorage())
    await guest.join(INVITE)
    guest.send({ t: 'nav', path: '/search' })
    expect(asGuest.sent).toHaveLength(0)
  })

  // What a joiner needs is where the party is NOW. The host's app keeps reporting that, and the
  // answer is built from the latest report, not from whatever was last sent.
  test('a joiner is told where the party is, from the latest report', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'me' })
    const party = createPartyStore(api(fake.room), memoryStorage())
    await party.create()
    party.setLocation('/watch/a/b', 0.25)
    party.setPlayback({ paused: false, time: 42, rate: 1, at: 1 })

    fake.join('guest')
    fake.emit({ type: 'joined', member: { id: 'guest', permissions: { send: false, receive: true, remove: false, block: false } } })
    await settle()

    expect(lastSent(fake.sent)).toEqual({ t: 'state', path: '/watch/a/b', y: 0.25, s: { paused: false, time: 42, rate: 1, at: 1 } })
    expect((party.getState() as Extract<PartyState, { status: 'active' }>).members).toBe(2)

    // off the watch page the snapshot carries no playback, so a joiner is not handed a stale one
    party.setPlayback(undefined)
    fake.emit({ type: 'joined', member: { id: 'other', permissions: { send: false, receive: true, remove: false, block: false } } })
    await settle()
    expect(lastSent(fake.sent)).toEqual({ t: 'state', path: '/watch/a/b', y: 0.25 })
  })

  // A follower coming back inside the api's hold is not a joiner: nobody is told it left or returned,
  // and its rebuilt store has heard nothing. The host saying where the party is on a clock is what
  // reaches it. Pinned with the timer, and with the timer STOPPING when the party ends, since a host
  // that kept sending into a room it left would be the store's own leak.
  test('a host repeats where the party is on a clock, and stops when it leaves', async () => {
    vi.useFakeTimers()
    const fake = fakeRoom({ self: 'me', owner: 'me' })
    const party = createPartyStore(api(fake.room), memoryStorage())
    await party.create()
    party.setLocation('/search?q=a', 0.5)
    expect(fake.sent).toHaveLength(0)

    await vi.advanceTimersByTimeAsync(STATE_HEARTBEAT_MS)
    expect(fake.sent).toHaveLength(1)
    expect(lastSent(fake.sent)).toEqual({ t: 'state', path: '/search?q=a', y: 0.5 })
    await vi.advanceTimersByTimeAsync(STATE_HEARTBEAT_MS)
    expect(fake.sent).toHaveLength(2)

    await party.leave()
    await vi.advanceTimersByTimeAsync(STATE_HEARTBEAT_MS * 3)
    expect(fake.sent).toHaveLength(2)
    // the timer itself, not just its silence: `send` refuses after the room is gone, so a leaked
    // interval sends nothing and would pass the count above while ticking for the life of the tab
    expect(vi.getTimerCount()).toBe(0)
  })

  test('and a guest does not', async () => {
    vi.useFakeTimers()
    const fake = fakeRoom({ self: 'me', owner: 'host', members: ['host', 'me'] })
    const party = createPartyStore(api(fake.room), memoryStorage())
    await party.join(INVITE)
    await vi.advanceTimersByTimeAsync(STATE_HEARTBEAT_MS * 2)
    expect(fake.sent).toHaveLength(0)
  })

  // The api hands the sender its own message back with the same seq. A host that followed itself
  // would navigate to where it already is on every move, and scroll to where it already scrolled.
  test('a host does not hear itself', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'me' })
    const party = createPartyStore(api(fake.room), memoryStorage())
    await party.create()
    const heard = vi.fn()
    party.onMessage(heard)

    fake.emit({ type: 'message', message: { seq: 1, from: 'me', at: 1, text: encodePartyMessage({ t: 'nav', path: '/x' }) } })
    expect(heard).not.toHaveBeenCalled()
  })
})

afterEach(() => { vi.useRealTimers() })

describe('following', () => {
  test('joining makes this app a guest, and only the host is heard', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'host', members: ['host', 'me'] })
    const party = createPartyStore(api(fake.room), memoryStorage())
    const heard = vi.fn()
    party.onMessage(heard)

    await party.join(INVITE)
    await settle()
    expect(party.getState()).toEqual({ status: 'active', role: 'guest', invite: INVITE, members: 2 })

    fake.emit({ type: 'message', message: { seq: 1, from: 'host', at: 1, text: encodePartyMessage({ t: 'nav', path: '/x' }) } })
    fake.emit({ type: 'message', message: { seq: 2, from: 'someone', at: 1, text: encodePartyMessage({ t: 'nav', path: '/y' }) } })
    fake.emit({ type: 'message', message: { seq: 3, from: 'host', at: 1, text: 'not a party message' } })
    expect(heard).toHaveBeenCalledTimes(1)
    expect(heard).toHaveBeenCalledWith({ t: 'nav', path: '/x' }, false)
  })

  // A room outlives its owner and a party does not: nobody else can ever send, so a room whose host is
  // gone is a room where nothing will happen again.
  test('the host leaving ends the party for a guest, who leaves the room', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'host', members: ['host', 'me'] })
    const party = createPartyStore(api(fake.room), memoryStorage())
    await party.join(INVITE)

    fake.emit({ type: 'left', id: 'host', reason: 'left' })
    await settle()

    expect(party.getState()).toEqual({ status: 'ended', reason: 'host-left' })
    expect(fake.room.leave).toHaveBeenCalled()
  })

  test('another guest leaving only moves the count', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'host', members: ['host', 'me', 'other'] })
    const party = createPartyStore(api(fake.room), memoryStorage())
    await party.join(INVITE)
    await settle()
    expect((party.getState() as Extract<PartyState, { status: 'active' }>).members).toBe(3)

    fake.room.members = async () => [{ id: 'host', permissions: { send: true, receive: true, remove: false, block: false } }, { id: 'me', permissions: { send: false, receive: true, remove: false, block: false } }]
    fake.emit({ type: 'left', id: 'other', reason: 'left' })
    await settle()
    expect(party.getState()).toMatchObject({ status: 'active', members: 2 })
  })

  test('replay says the last of each thing the host said, the nav first', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'host', members: ['host', 'me'] })
    const party = createPartyStore(api(fake.room), memoryStorage())
    await party.join(INVITE)
    const heard: unknown[] = []
    party.onMessage(message => heard.push(message))

    const say = (seq: number, message: Parameters<typeof encodePartyMessage>[0]) =>
      fake.emit({ type: 'message', message: { seq, from: 'host', at: 1, text: encodePartyMessage(message) } })
    say(1, { t: 'scroll', y: 0.1 })
    say(2, { t: 'nav', path: '/a' })
    say(3, { t: 'scroll', y: 0.9 })
    say(4, { t: 'nav', path: '/b' })
    heard.length = 0

    party.replay()
    expect(heard).toEqual([{ t: 'nav', path: '/b' }, { t: 'scroll', y: 0.9 }])
  })

  test('a replay is marked as one, so a guest can tell being caught up from the host moving', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'host', members: ['host', 'me'] })
    const party = createPartyStore(api(fake.room), memoryStorage())
    await party.join(INVITE)
    const heard = vi.fn()
    party.onMessage(heard)

    fake.emit({ type: 'message', message: { seq: 1, from: 'host', at: 1, text: encodePartyMessage({ t: 'nav', path: '/a' }) } })
    expect(heard).toHaveBeenLastCalledWith({ t: 'nav', path: '/a' }, false)
    party.replay()
    expect(heard).toHaveBeenLastCalledWith({ t: 'nav', path: '/a' }, true)
  })

  // A scroll and a playback are for the page the host is on. The store keeps the latest of each kind,
  // so the path has to come from whichever of `nav` and `state` arrived LAST, not from a fixed one.
  test('hostPath is the path the host named most recently, from either message that carries one', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'host', members: ['host', 'me'] })
    const party = createPartyStore(api(fake.room), memoryStorage())
    await party.join(INVITE)
    expect(party.hostPath()).toBeUndefined()

    const say = (seq: number, message: Parameters<typeof encodePartyMessage>[0]) =>
      fake.emit({ type: 'message', message: { seq, from: 'host', at: 1, text: encodePartyMessage(message) } })
    say(1, { t: 'state', path: '/a', y: 0 })
    expect(party.hostPath()).toBe('/a')
    say(2, { t: 'nav', path: '/b' })
    expect(party.hostPath()).toBe('/b')
    say(3, { t: 'state', path: '/c', y: 0 })
    expect(party.hostPath()).toBe('/c')
    say(4, { t: 'nav', path: '/d' })
    say(5, { t: 'state', path: '/d', y: 0 })
    say(6, { t: 'nav', path: '/e' })
    expect(party.hostPath()).toBe('/e')
  })
})

describe('ending and failing', () => {
  test('the room closing ends the party with its reason and forgets the invite', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'host', members: ['host', 'me'] })
    const storage = memoryStorage()
    const party = createPartyStore(api(fake.room), storage)
    await party.join(INVITE)
    expect(storage.store.has(PARTY_SESSION_KEY)).toBe(true)

    fake.end('removed')
    await settle()
    expect(party.getState()).toEqual({ status: 'ended', reason: 'removed' })
    expect(storage.store.has(PARTY_SESSION_KEY)).toBe(false)

    party.dismiss()
    expect(party.getState()).toEqual({ status: 'idle' })
  })

  test('a refused join fails with the room code, never with the message', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'host' })
    const party = createPartyStore(api(fake.room, 'full'), memoryStorage())
    await party.join(INVITE)
    expect(party.getState()).toEqual({ status: 'failed', code: 'full' })
  })

  test('leaving is immediate and remembered as such', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'me' })
    const storage = memoryStorage()
    const party = createPartyStore(api(fake.room), storage)
    await party.create()
    await party.leave()
    expect(party.getState()).toEqual({ status: 'ended', reason: 'left' })
    expect(fake.room.leave).toHaveBeenCalledTimes(1)
    expect(storage.store.has(PARTY_SESSION_KEY)).toBe(false)
  })
})

describe('resuming', () => {
  test('a remembered invite is rejoined, and the seat decides the role', async () => {
    const storage = memoryStorage()
    storage.setItem(PARTY_SESSION_KEY, INVITE)
    // the same tab keeps its seed inside the api's hold, so the host comes back as the host
    const fake = fakeRoom({ self: 'me', owner: 'me' })
    const rooms = api(fake.room)
    const party = createPartyStore(rooms, storage)

    await party.resume()
    expect(rooms.join).toHaveBeenCalledWith(INVITE)
    expect(party.getState()).toMatchObject({ status: 'active', role: 'host' })
  })

  // A resume that finds nothing is a party that ended while the tab was closed. There is nothing to
  // announce on a page that never showed one, and a "party failed" on every cold load would be noise.
  test('a party that is gone resumes to nothing, quietly', async () => {
    const storage = memoryStorage()
    storage.setItem(PARTY_SESSION_KEY, INVITE)
    const fake = fakeRoom({ self: 'me', owner: 'me' })
    const party = createPartyStore(api(fake.room, 'not-found'), storage)

    await party.resume()
    expect(party.getState()).toEqual({ status: 'idle' })
    expect(storage.store.has(PARTY_SESSION_KEY)).toBe(false)
  })

  test('nothing remembered is nothing done', async () => {
    const fake = fakeRoom({ self: 'me', owner: 'me' })
    const rooms = api(fake.room)
    const party = createPartyStore(rooms, memoryStorage())
    await party.resume()
    expect(rooms.join).not.toHaveBeenCalled()
    expect(party.getState()).toEqual({ status: 'idle' })
  })
})
