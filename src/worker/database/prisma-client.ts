import { createWaSQLitePrismaAdapter } from './prisma-wa-sqlite-adapter'
// @ts-expect-error
import SQLSchema from '../../../prisma/init.sql?raw'
import { PrismaClient } from '../../../prisma/generated'

const adapter = await createWaSQLitePrismaAdapter()
const prismaClient = new PrismaClient({ adapter })
await prismaClient.$executeRawUnsafe(SQLSchema)

export default prismaClient
