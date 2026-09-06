// A follower hands a decoded path straight to the router and a decoded state straight to its player,
// so the decoder is the one place that decides what a host can make a follower do.
import { describe, expect, test } from 'vitest'

import { decodePartyMessage, encodePartyMessage, isAppPath, PARTY_PROTOCOL, type PartyMessage } from '../../../src/party/protocol'

const PLAYBACK = { paused: false, time: 421.5, rate: 1, at: 1_788_700_000_000 }

describe('encode and decode', () => {
  test('every message round-trips', () => {
    const messages: PartyMessage[] = [
      { t: 'nav', path: '/search?season=FALL&year=2026' },
      { t: 'scroll', y: 0.42 },
      { t: 'playback', s: PLAYBACK },
      { t: 'state', path: '/watch/a/b', y: 0, s: PLAYBACK },
      { t: 'state', path: '/', y: 1 },
    ]
    for (const message of messages) expect(decodePartyMessage(encodePartyMessage(message))).toEqual(message)
  })

  test('the version is on the wire, and another version is ignored', () => {
    expect(JSON.parse(encodePartyMessage({ t: 'scroll', y: 0 })).v).toBe(PARTY_PROTOCOL)
    expect(decodePartyMessage(JSON.stringify({ v: PARTY_PROTOCOL + 1, t: 'scroll', y: 0 }))).toBeUndefined()
  })

  test('anything that is not a message is nothing, never a throw', () => {
    for (const text of ['', 'hello', '{', 'null', '42', '[]', '{"v":1}', '{"v":1,"t":"dance"}']) {
      expect(() => decodePartyMessage(text), text).not.toThrow()
      expect(decodePartyMessage(text), text).toBeUndefined()
    }
  })

  test('a field of the wrong shape drops the whole message', () => {
    const bad = [
      { v: 1, t: 'scroll', y: 1.5 },
      { v: 1, t: 'scroll', y: -0.1 },
      { v: 1, t: 'scroll', y: '0.5' },
      { v: 1, t: 'playback', s: { ...PLAYBACK, rate: 0 } },
      { v: 1, t: 'playback', s: { ...PLAYBACK, time: -1 } },
      { v: 1, t: 'playback', s: { ...PLAYBACK, paused: 'no' } },
      { v: 1, t: 'playback', s: { ...PLAYBACK, at: Number.NaN } },
      { v: 1, t: 'state', path: '/', y: 0, s: { paused: true } },
    ]
    for (const message of bad) expect(decodePartyMessage(JSON.stringify(message)), JSON.stringify(message)).toBeUndefined()
  })
})

describe('isAppPath', () => {
  test('a path inside the app', () => {
    expect(isAppPath('/')).toBe(true)
    expect(isAppPath('/media/anilist:1')).toBe(true)
    expect(isAppPath('/search?q=a%20b&genre=Action')).toBe(true)
  })

  // Every one of these is a string a browser reads as somewhere else, handed to a router that would
  // pass it on. A host must not be able to send a follower off the site.
  test('anything a browser would take somewhere else is refused', () => {
    for (const path of ['', 'search', '//evil.example/x', '/\\evil.example', 'https://evil.example', 'javascript:alert(1)', '/a\nb', '/'.padEnd(3000, 'a')]) {
      expect(isAppPath(path), JSON.stringify(path)).toBe(false)
    }
    expect(decodePartyMessage(JSON.stringify({ v: 1, t: 'nav', path: '//evil.example' }))).toBeUndefined()
    expect(decodePartyMessage(JSON.stringify({ v: 1, t: 'state', path: 'https://evil.example', y: 0 }))).toBeUndefined()
  })
})
