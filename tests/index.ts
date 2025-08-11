import { use, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

use(chaiAsPromised)

export const test = async () => {
  await expect(true).to.equal(true)
  console.log('Starting Prisma test...')

  try {
    console.log('Fetching Prisma client...')
    const { default: client } = await import('../src/worker/database/prisma-client')
    console.log('Prisma client created:', client)

    const count = await client.media.count()
    console.log('Media count:', count)

    await expect(true).to.equal(true)
    console.log('Test passed!')
  } catch (error) {
    console.error('Test failed:', error)
    throw error
  }
}
