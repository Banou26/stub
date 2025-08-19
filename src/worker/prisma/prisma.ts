import { PrismaWASqliteAdapterFactory } from './wa-sqlite-adapter'
// @ts-expect-error
import SQLSchema from '../prisma/migrations/0_init/migration.sql?raw'
import { PrismaClient } from './generated/client'

const adapter = new PrismaWASqliteAdapterFactory()
const prismaClient = new PrismaClient({ adapter })
await prismaClient.$executeRawUnsafe(SQLSchema as string)

export default prismaClient
