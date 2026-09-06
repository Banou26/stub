import { describe, expect, test } from 'vitest'

import { inviteFromHash, partyLink, PARTY_PATH } from '../../../src/party/invite'

const INVITE = '1b4e28ba-2fa1-11d2-883f-0016d3cca427.Qm9yZWQtYnV0LWhhcHB5LWV2ZXJ5LWRheS1vay1va2F5'

describe('partyLink and inviteFromHash', () => {
  test('the invite rides in the fragment, and comes back out of it', () => {
    const link = partyLink('https://anime.fkn.app', INVITE)
    expect(link).toBe(`https://anime.fkn.app${PARTY_PATH}#${INVITE}`)
    expect(inviteFromHash(new URL(link).hash)).toBe(INVITE)
  })

  test('with or without the hash mark, and url-encoded', () => {
    expect(inviteFromHash(INVITE)).toBe(INVITE)
    expect(inviteFromHash(`#${encodeURIComponent(INVITE)}`)).toBe(INVITE)
  })

  // The failures a shared link actually suffers: a chat client that dropped the fragment, a copy that
  // cut the key, a key that is not the shape the broker mints. Each has to read as a broken link on
  // the page rather than an opaque refusal from the broker.
  test('a mangled link is nothing', () => {
    for (const hash of ['', '#', '#1b4e28ba-2fa1-11d2-883f-0016d3cca427', '#1b4e28ba-2fa1-11d2-883f-0016d3cca427.short', '#not-a-uuid.Qm9yZWQtYnV0LWhhcHB5LWV2ZXJ5LWRheS1vay1va2F5', '#../../etc']) {
      expect(inviteFromHash(hash), hash).toBeUndefined()
    }
  })
})
