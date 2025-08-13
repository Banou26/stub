import { use, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import chaiShallowDeepEqual from 'chai-shallow-deep-equal'

import { getRelatedMediaHandles } from '../src/worker/prisma/generated/sql'
import { groupAllRelatedMedia } from '../src/worker/prisma/generated/sql'

use(chaiAsPromised)
use(chaiShallowDeepEqual)

export const testCircularRelationships = async () => {
  const { default: client } = await import('../src/worker/prisma')

  const mediaA = await client.media.create({
    data: {
      uid: 'test::A',
      origin: 'test',
      id: 'A',
      language: '',
      title: 'Media A'
    }
  })

  const mediaB = await client.media.create({
    data: {
      uid: 'test::B',
      origin: 'test',
      id: 'B',
      language: '',
      title: 'Media B'
    }
  })

  const mediaC = await client.media.create({
    data: {
      uid: 'test::C',
      origin: 'test',
      id: 'C',
      language: '',
      title: 'Media C'
    }
  })

  await client.media.update({
    where: { uid: mediaA.uid },
    data: {
      handles: {
        connect: { uid: mediaB.uid }
      }
    }
  })

  await client.media.update({
    where: { uid: mediaB.uid },
    data: {
      handles: {
        connect: { uid: mediaC.uid }
      }
    }
  })

  await client.media.update({
    where: { uid: mediaC.uid },
    data: {
      handles: {
        connect: { uid: mediaA.uid }
      }
    }
  })

  const related = await client.$queryRawTyped(getRelatedMediaHandles(mediaA.uid))

  expect(related).to.have.lengthOf(3)
  const uids = related.map((m: any) => m.uid)
  expect(uids).to.include.members(['test::A', 'test::B', 'test::C'])

  const groups = await client.$queryRawTyped(groupAllRelatedMedia())

  const circularGroup = groups.find((g: any) =>
    g.media_uids && g.media_uids.includes('test::A')
  )
  expect(circularGroup).to.exist
  expect(circularGroup?.group_size).to.equal(3)
}
