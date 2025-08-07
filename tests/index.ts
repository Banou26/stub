import { use, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'

use(chaiAsPromised)

export const test = async () => {
  await expect(true).to.equal(true)
}
