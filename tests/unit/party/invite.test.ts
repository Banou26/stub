import { describe, expect, test } from 'vitest'

import { inviteFromHash, partyLink, PARTY_PATH } from '../../../src/party/invite'

const INVITE = 'Qm9yZWQtYnV0LWhhcHB5LWV2ZXJ5LWRheS1vay1va2F.https://anime.fkn.app/1b4e28ba2fa111d2883f0016d3cc'

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
  // cut the key, a key that is not the shape the broker mints, a name the grammar refuses. Each has to read as a broken link on
  // the page rather than an opaque refusal from the broker.
  test('a mangled link is nothing', () => {
    for (const hash of ['', '#', '#Qm9yZWQtYnV0LWhhcHB5LWV2ZXJ5LWRheS1vay1va2F', '#short.https://anime.fkn.app/lobby', '#Qm9yZWQtYnV0LWhhcHB5LWV2ZXJ5LWRheS1vay1va2F.no-slash', '#Qm9yZWQtYnV0LWhhcHB5LWV2ZXJ5LWRheS1vay1va2F.https://anime.fkn.app/Upper', '#../../etc']) {
      expect(inviteFromHash(hash), hash).toBeUndefined()
    }
  })
})
