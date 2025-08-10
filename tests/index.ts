import { use, expect } from 'chai'
import chaiAsPromised from 'chai-as-promised'
import { simple } from './simple'
import { driverIntegration } from './driver-integration'
import { driverUnit } from './driver-unit'
import { prismaTest } from './prisma-test'

use(chaiAsPromised)

export const test = async () => {
  await expect(true).to.equal(true)
}

export { simple, driverIntegration, driverUnit, prismaTest }
