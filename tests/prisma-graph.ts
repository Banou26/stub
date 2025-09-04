import type PrismaClient from '../src/worker/prisma'

import { use, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiShallowDeepEqual from 'chai-shallow-deep-equal'

import { getRelatedMediaHandles } from '../src/worker/prisma/generated/sql/getRelatedMediaHandles'
import { groupAllRelatedMedia } from '../src/worker/prisma/generated/sql/groupAllRelatedMedia'

use(chaiAsPromised)
use(chaiShallowDeepEqual)

// Helper to create test data
const createTestMedia = async (client: typeof PrismaClient, id: string) =>
  client.media.upsert({
    where: { uri: `t:${id}` },
    update: {},
    create: {
      uri: `t:${id}`,
      origin: 't',
      id,
      type: 'ANIME'
    }
  })

// Helper to connect media handles
const connectMedia = async (client: any, fromUri: string, toUri: string) => {
  await client.media.update({
    where: { uri: fromUri },
    data: {
      handles: {
        connect: { uri: toUri }
      }
    }
  })
}

// Test 1: Basic recursive query
export const testRecursiveQuery = async () => {
  const { default: client } = await import('../src/worker/prisma')

  // Setup: A -> B -> C
  await client.media.deleteMany({ where: { origin: 't' } })

  const mediaA = await createTestMedia(client, 'A')
  const mediaB = await createTestMedia(client, 'B')
  const mediaC = await createTestMedia(client, 'C')

  await connectMedia(client, mediaA.uri, mediaB.uri)
  await connectMedia(client, mediaB.uri, mediaC.uri)

  // Test: Starting from A should find all 3
  const result = await client.$queryRawTyped(getRelatedMediaHandles(mediaA.uri))

  expect(result).to.have.lengthOf(3)
  expect(result.map(m => m.uri)).to.include.members([
    't:A',
    't:B',
    't:C'
  ])

  await client.media.deleteMany({ where: { origin: 't' } })
}

// Test 2: Bidirectional relationships
export const testBidirectionalRelations = async () => {
  const { default: client } = await import('../src/worker/prisma')

  // Setup: A <-> B
  await client.media.deleteMany({ where: { origin: 't' } })

  const mediaA = await createTestMedia(client, 'A')
  const mediaB = await createTestMedia(client, 'B')

  await connectMedia(client, mediaA.uri, mediaB.uri)
  await connectMedia(client, mediaB.uri, mediaA.uri)

  // Test: Should find both from either starting point
  const fromA = await client.$queryRawTyped(getRelatedMediaHandles(mediaA.uri))
  const fromB = await client.$queryRawTyped(getRelatedMediaHandles(mediaB.uri))

  expect(fromA).to.have.lengthOf(2)
  expect(fromB).to.have.lengthOf(2)

  await client.media.deleteMany({ where: { origin: 't' } })
}

// Test 3: Circular relationships
export const testCircularRelations = async () => {
  const { default: client } = await import('../src/worker/prisma')

  // Setup: A -> B -> C -> A (circular)
  await client.media.deleteMany({ where: { origin: 't' } })

  const mediaA = await createTestMedia(client, 'A')
  const mediaB = await createTestMedia(client, 'B')
  const mediaC = await createTestMedia(client, 'C')

  await connectMedia(client, mediaA.uri, mediaB.uri)
  await connectMedia(client, mediaB.uri, mediaC.uri)
  await connectMedia(client, mediaC.uri, mediaA.uri)

  // Test: Should find all 3 without infinite loop
  const result = await client.$queryRawTyped(getRelatedMediaHandles(mediaA.uri))

  expect(result).to.have.lengthOf(3)

  await client.media.deleteMany({ where: { origin: 't' } })
}

// Test 4: Standalone media
export const testStandaloneMedia = async () => {
  const { default: client } = await import('../src/worker/prisma')

  // Setup: Single media with no relationships
  await client.media.deleteMany({ where: { origin: 't' } })

  const standalone = await createTestMedia(client, 'S')

  // Test: Should return only itself
  const result = await client.$queryRawTyped(getRelatedMediaHandles(standalone.uri))

  expect(result).to.have.lengthOf(1)
  expect(result[0]?.uri).to.equal('t:S')

  await client.media.deleteMany({ where: { origin: 't' } })
}

// Test 5: Group all media - basic
export const testGroupAllMedia = async () => {
  const { default: client } = await import('../src/worker/prisma')

  // Setup: Two separate groups and one standalone
  await client.media.deleteMany({ where: { origin: 't' } })

  // Group 1: A -> B
  const mediaA = await createTestMedia(client, 'A')
  const mediaB = await createTestMedia(client, 'B')
  await connectMedia(client, mediaA.uri, mediaB.uri)

  // Group 2: C -> D
  const mediaC = await createTestMedia(client, 'C')
  const mediaD = await createTestMedia(client, 'D')
  await connectMedia(client, mediaC.uri, mediaD.uri)

  // Standalone
  await createTestMedia(client, 'S')

  // Test: Should identify 3 groups
  const groups = await client.$queryRawTyped(groupAllRelatedMedia())
  const testGroups = groups.filter(g => g.media_uris?.includes('t:'))

  expect(testGroups).to.have.lengthOf(3)

  // Verify group sizes
  const sizes = testGroups.map(g => Number(g.group_size)).sort((a, b) => b - a)
  expect(sizes).to.deep.equal([2, 2, 1])

  await client.media.deleteMany({ where: { origin: 't' } })
}

// Test 6: Group all media - circular
export const testGroupAllMediaCircular = async () => {
  const { default: client } = await import('../src/worker/prisma')

  // Setup: Circular group
  await client.media.deleteMany({ where: { origin: 't' } })

  const mediaA = await createTestMedia(client, 'A')
  const mediaB = await createTestMedia(client, 'B')
  const mediaC = await createTestMedia(client, 'C')

  await connectMedia(client, mediaA.uri, mediaB.uri)
  await connectMedia(client, mediaB.uri, mediaC.uri)
  await connectMedia(client, mediaC.uri, mediaA.uri)

  // Test: Should be one group of size 3
  const groups = await client.$queryRawTyped(groupAllRelatedMedia())
  const circularGroup = groups.find(g => g.media_uris?.includes('t:A'))

  expect(circularGroup).to.exist
  expect(Number(circularGroup?.group_size)).to.equal(3)

  await client.media.deleteMany({ where: { origin: 't' } })
}
