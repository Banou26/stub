import { PrismaWASqliteAdapterFactory } from './wa-sqlite-adapter'
// @ts-expect-error
import SQLSchema from '../../../prisma/migrations/0_init/migration.sql?raw'
import { PrismaClient } from './generated/client'

const adapter = new PrismaWASqliteAdapterFactory()
const prismaClient =
  new PrismaClient({
    adapter,
    omit: {
      mediaTitle: {
        mediaUri: true
      },
      mediaShortDescription: {
        mediaUri: true
      },
      mediaDescription: {
        mediaUri: true
      },
      mediaTrailer: {
        mediaUri: true
      },
      mediaCover: {
        mediaUri: true
      },
      mediaBanner: {
        mediaUri: true
      },
      episode: {
        mediaUri: true
      },
      episodeTitle: {
        episodeUri: true
      },
      episodeShortDescription: {
        episodeUri: true
      },
      episodeDescription: {
        episodeUri: true
      },
      episodeThumbnail: {
        episodeUri: true
      },
      playbackSource: {
        episodeUri: true
      }
    } as const
  })
    .$extends({
      result: {
        media: {
          uri: {
            needs: { origin: true, id: true },
            compute: (media) => `${media.origin}:${media.id}`
          }
        },
        episode: {
          uri: {
            needs: { origin: true, id: true },
            compute: (episode) => `${episode.origin}:${episode.id}`
          }
        },
        playbackSource: {
          uri: {
            needs: { origin: true, id: true },
            compute: (playbackSource) => `${playbackSource.origin}:${playbackSource.id}`
          }
        }
      }
    })
await prismaClient.$executeRawUnsafe(SQLSchema as string)

export default prismaClient
