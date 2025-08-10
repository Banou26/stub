import { use, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
use(chaiAsPromised)

export const test = async () => {
  const { getPrismaClient } = await import('../src/worker/database/prisma-client-proxy')
  const client = await getPrismaClient()
  console.log('count', client.media.count())
  await expect(true).to.equal(true)
}
