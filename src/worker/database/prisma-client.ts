import { createWaSQLitePrismaAdapter } from './prisma-wa-sqlite-adapter'
// @ts-expect-error
import SQLSchema from '../../../prisma/migrations/0_init/migration.sql?raw'
import { PrismaClient } from '../../../prisma/generated'

const adapter = await createWaSQLitePrismaAdapter()
const prismaClient =
  new PrismaClient({
    adapter,
    omit: {
      mediaTrailer: {
        mediaUuid: true
      },
      mediaCover: {
        mediaUuid: true
      },
      mediaBanner: {
        mediaUuid: true
      },
      episode: {
        mediaUuid: true
      },
      episodeThumbnail: {
        episodeUuid: true
      },
      playbackSource: {
        episodeUuid: true
      }
    } as const
  })
    .$extends({
      result: {
        media: {
          uri: {
            needs: { origin: true, id: true },
            compute: (media) => `${media.origin}:${media.id}`
          },
          uid: {
            needs: { origin: true, id: true, language: true },
            compute: (media) => `${media.origin}:${media.language}:${media.id}`
          }
        },
        episode: {
          uri: {
            needs: { origin: true, id: true },
            compute: (episode) => `${episode.origin}:${episode.id}`
          },
          uid: {
            needs: { origin: true, id: true, language: true },
            compute: (episode) => `${episode.origin}:${episode.language}:${episode.id}`
          }
        },
        playbackSource: {
          uri: {
            needs: { origin: true, id: true },
            compute: (playbackSource) => `${playbackSource.origin}:${playbackSource.id}`
          },
          uid: {
            needs: { origin: true, id: true, language: true },
            compute: (playbackSource) => `${playbackSource.origin}:${playbackSource.language}:${playbackSource.id}`
          }
        }
      }
    })
await prismaClient.$executeRawUnsafe(SQLSchema)

export default prismaClient
