import { use, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { simple } from './simple.js'

use(chaiAsPromised)

export const test = async () => {
  await expect(true).to.equal(true)
}

export { simple }
