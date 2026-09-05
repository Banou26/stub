// The context has ONE failure mode worth designing against: arriving empty. Every source falls back to
// today's behaviour when it does, with the whole suite green and the site working, so absence is
// indistinguishable from success by construction. `contextMisses` is the observable that separates
// them, and half the tests here exist to prove it moves.
import { beforeEach, expect, test } from 'vitest'

import {
  closeRoot,
  contextMisses,
  contextOf,
  descend,
  openRoot,
  policyFor,
  readContext,
  registrySize,
  resetContextMisses,
  resetRegistry,
  stamp,
  UNKNOWN_POLICY,
} from './request-context'

beforeEach(() => { resetContextMisses(); resetRegistry() })

test('a listing refuses cross-source work and a detail view spends it', () => {
  const listing = openRoot('MEDIA_PAGE')
  const detail = openRoot('MEDIA')
  const similar = openRoot('SIMILAR_MEDIA')

  expect(policyFor({ context: listing }).crossSource, 'a search result page reads none of it').toBe(false)
  expect(policyFor({ context: detail }).crossSource, 'a detail view is what the id is for').toBe(true)
  expect(policyFor({ context: similar }).crossSource, 'an answering source may walk its seasons').toBe(true)
  closeRoot(listing.rootId)
  closeRoot(detail.rootId)
  closeRoot(similar.rootId)
})

// THE INERT CONTROL. An absent context has to behave exactly as the code did before this module
// existed, which means the only thing distinguishing "working" from "silently disconnected" is the
// counter. If this test is deleted, so is the ability to notice.
test('an absent context reads as today\'s behaviour AND is counted', () => {
  expect(policyFor({}), 'no context must not change what a source does').toEqual(UNKNOWN_POLICY)
  expect(policyFor(undefined)).toEqual(UNKNOWN_POLICY)
  expect(contextMisses(), 'a miss nobody counts is a feature nobody can tell is broken').toBe(2)
})

test('a forged token is a miss, not an answer', () => {
  expect(contextOf('t-not-minted-here')).toBeUndefined()
  expect(readContext({ context: { token: 'FORGED', operation: 'MEDIA' } }), 'only the token is read off the wire').toBeUndefined()
  expect(contextMisses()).toBe(1)
})

// The registry is authoritative, so a caller that rewrites the other fields is describing a hop the
// worker already has its own record of.
test('the operation comes from the registry, never from the wire', () => {
  const root = openRoot('MEDIA_PAGE')
  const lying = { context: { ...root, operation: 'MEDIA' as const } }

  expect(readContext(lying)?.operation, 'the wire said MEDIA and the registry said otherwise').toBe('MEDIA_PAGE')
  expect(policyFor(lying).crossSource).toBe(false)
  closeRoot(root.rootId)
})

test('descend keeps the root and grows the chain by the calling origin', () => {
  const root = openRoot('MEDIA')
  const hop = descend(root, 'kitsu')
  const deeper = descend(hop, 'cr')

  expect(hop.rootId).toBe(root.rootId)
  expect(hop.token, 'each hop is its own registry entry, which is what varies the urql key').not.toBe(root.token)
  expect(deeper.chain).toEqual(['kitsu', 'cr'])
  closeRoot(root.rootId)
})

// A closed root and a forged token are deliberately the same answer: neither is a request this worker
// is still serving, and a hop that outlived its root has nothing to be a policy about.
test('closing a root drops every one of its hops', () => {
  const root = openRoot('MEDIA')
  descend(root, 'kitsu')
  descend(root, 'jw')
  const other = openRoot('MEDIA_PAGE')

  expect(registrySize()).toBe(4)
  closeRoot(root.rootId)
  expect(registrySize(), 'only the unrelated root survives').toBe(1)
  expect(contextOf(other.token)).toBeDefined()
  closeRoot(other.rootId)
})

test('stamp puts the context on the input without disturbing the rest', () => {
  const root = openRoot('MEDIA_PAGE')
  const stamped = stamp({ input: { search: 'Mushoku Tensei' }, other: 1 }, root)

  expect(stamped).toEqual({ input: { search: 'Mushoku Tensei', context: root }, other: 1 })
  expect(policyFor(stamped.input as object).crossSource).toBe(false)
  closeRoot(root.rootId)
})

// Variables with no `input` are left alone rather than having one invented, because a document this
// does not understand is one it must not rewrite.
test('stamp leaves variables it does not recognise untouched', () => {
  const root = openRoot('MEDIA')
  expect(stamp({ somethingElse: 1 }, root)).toEqual({ somethingElse: 1 })
  closeRoot(root.rootId)
})
