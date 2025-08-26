import type { ExtractTablesWithRelations } from 'drizzle-orm'
import type { SQLiteTransaction } from 'drizzle-orm/sqlite-core'
import type { SqliteRemoteResult } from 'drizzle-orm/sqlite-proxy'

import type { Media, Episode } from '../../generated/schema/types.generated'
import type {
  CreateMedia,
  CreateMediaBanner,
  CreateMediaCover,
  CreateMediaDescription,
  CreateMediaShortDescription,
  CreateMediaTitle,
  CreateMediaTrailer,
  CreateEpisode,
  CreateEpisodeTitle,
  CreateEpisodeDescription,
  CreateEpisodeShortDescription,
  CreateEpisodeThumbnail,
  CreateMediaHandles
} from './schema'

import {
  mediaBannerTable,
  mediaCoverTable,
  mediaDescriptionTable,
  mediaShortDescriptionTable,
  mediaTable,
  mediaTitleTable,
  mediaTrailerTable,
  episodeTable,
  episodeTitleTable,
  episodeDescriptionTable,
  episodeShortDescriptionTable,
  episodeThumbnailTable,
  mediaHandlesTable,
  titlesTable,
  shortDescriptionsTable,
  descriptionsTable,
  imagesTable
} from './schema'
import { sql, eq, inArray } from 'drizzle-orm'
import database from '.'

export type DrizzleSQLiteTransaction = SQLiteTransaction<
  "async",
  SqliteRemoteResult<unknown>,
  typeof import("c:/dev/stub/src/worker/drizzle/schema"),
  ExtractTablesWithRelations<typeof import("c:/dev/stub/src/worker/drizzle/schema")>
>

function removeDuplicatesByUri<T extends { uri: string }>(array: T[]): T[] {
  const seen = new Set<string | number>()
  const result: T[] = []

  for (const item of array) {
    if (!seen.has(item.uri)) {
      seen.add(item.uri)
      result.push(item)
    }
  }

  return result
}

const unwrapCache = new WeakMap<Media, Media[]>()
export const recursivelyUnwrapMediaHandles = (media: Media): Media[] => {
  if (unwrapCache.has(media)) {
    return unwrapCache.get(media)!
  }

  const unwrappedResult =
    media.handles
      ? [
        media,
        ...media
          .handles
          .flatMap(recursivelyUnwrapMediaHandles)
      ]
      : [media]

  if (media.handles) {
    unwrapCache.set(media, unwrappedResult)
  }

  return unwrappedResult
}

export const insertManyMedia = async (tx: DrizzleSQLiteTransaction, wrappedMedias: Media[]) => {
  const medias = removeDuplicatesByUri(wrappedMedias.flatMap(recursivelyUnwrapMediaHandles))
  const values = medias.map(media => ({
    ...media,
    startDate: media.startDate ? new Date(media.startDate) : null,
    endDate: media.endDate ? new Date(media.endDate) : null
  } satisfies CreateMedia))

  if (values.length) {
    await tx.insert(mediaTable)
        .values(values)
        .onConflictDoUpdate({
          target: mediaTable.uri,
          set: {
            type: sql`excluded.type`,
            status: sql`excluded.status`,
            startDate: sql`excluded.startDate`,
            endDate: sql`excluded.endDate`,
            averageScore: sql`excluded.averageScore`,
            episodeCount: sql`excluded.episodeCount`,
            aggregated: sql`excluded.aggregated`,
            isAdult: sql`excluded.isAdult`,
            popularity: sql`excluded.popularity`
          }
        })
  }

  // Insert titles into shared titles table first
  const allTitles = medias
    .flatMap(media =>
      media.titles?.map(title => ({
        language: title.language,
        title: title.title
      })) || []
    )
    .filter((title): title is NonNullable<typeof title> => title !== null && title !== undefined)
    .filter(title => title.title?.length > 0 && title.language != null)

  // Remove duplicates
  const uniqueTitles = Array.from(
    new Map(allTitles.map(t => [`${t.language}-${t.title}`, t])).values()
  )

  if (uniqueTitles.length > 0) {
    // Insert titles
    for (const title of uniqueTitles) {
      await tx.insert(titlesTable)
        .values({
          language: title.language,
          title: title.title
        })
        .onConflictDoNothing()
    }

    // Get all title IDs for the junction table
    const existingTitles = await tx.select()
      .from(titlesTable)
      .where(sql`(${titlesTable.language}, ${titlesTable.title}) IN (${sql.join(
        uniqueTitles.map(t => sql`(${t.language}, ${t.title})`),
        sql`, `
      )})`)
    
    const titleIds = new Map<string, number>()
    for (const title of existingTitles) {
      titleIds.set(`${title.language}-${title.title}`, title.id)
    }

    // Create media-title junction entries
    const mediaTitleEntries = medias
      .flatMap(media =>
        media.titles?.map(title => {
          const titleId = titleIds.get(`${title.language}-${title.title}`)
          if (titleId) {
            return {
              mediaUri: media.uri,
              titleId: titleId
            }
          }
          return null
        }) || []
      )
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    if (mediaTitleEntries.length > 0) {
      await tx.insert(mediaTitleTable)
        .values(mediaTitleEntries)
        .onConflictDoNothing()
    }
  }

  // Insert descriptions into shared descriptions table
  const allDescriptions = medias
    .flatMap(media =>
      media.descriptions?.map(desc => ({
        language: desc.language,
        description: desc.description
      })) || []
    )
    .filter((desc): desc is NonNullable<typeof desc> => desc !== null && desc !== undefined)
    .filter(desc => desc.description?.length > 0 && desc.language != null)

  const uniqueDescriptions = Array.from(
    new Map(allDescriptions.map(d => [`${d.language}-${d.description}`, d])).values()
  )

  if (uniqueDescriptions.length > 0) {
    // Insert descriptions
    for (const desc of uniqueDescriptions) {
      await tx.insert(descriptionsTable)
        .values({
          language: desc.language,
          description: desc.description
        })
        .onConflictDoNothing()
    }

    // Get description IDs
    const existingDescriptions = await tx.select()
      .from(descriptionsTable)
      .where(sql`(${descriptionsTable.language}, ${descriptionsTable.description}) IN (${sql.join(
        uniqueDescriptions.map(d => sql`(${d.language}, ${d.description})`),
        sql`, `
      )})`)
    
    const descriptionIds = new Map<string, number>()
    for (const desc of existingDescriptions) {
      descriptionIds.set(`${desc.language}-${desc.description}`, desc.id)
    }

    // Create media-description junction entries
    const mediaDescriptionEntries = medias
      .flatMap(media =>
        media.descriptions?.map(desc => {
          const descId = descriptionIds.get(`${desc.language}-${desc.description}`)
          if (descId) {
            return {
              mediaUri: media.uri,
              descriptionId: descId
            }
          }
          return null
        }) || []
      )
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    if (mediaDescriptionEntries.length > 0) {
      await tx.insert(mediaDescriptionTable)
        .values(mediaDescriptionEntries)
        .onConflictDoNothing()
    }
  }

  // Insert short descriptions into shared short descriptions table
  const allShortDescriptions = medias
    .flatMap(media =>
      media.shortDescriptions?.map(shortDesc => ({
        language: shortDesc.language,
        shortDescription: shortDesc.shortDescription
      })) || []
    )
    .filter((shortDesc): shortDesc is NonNullable<typeof shortDesc> => shortDesc !== null && shortDesc !== undefined)
    .filter(shortDesc => shortDesc.shortDescription?.length > 0 && shortDesc.language != null)

  const uniqueShortDescriptions = Array.from(
    new Map(allShortDescriptions.map(sd => [`${sd.language}-${sd.shortDescription}`, sd])).values()
  )

  if (uniqueShortDescriptions.length > 0) {
    // Insert short descriptions
    for (const shortDesc of uniqueShortDescriptions) {
      await tx.insert(shortDescriptionsTable)
        .values({
          language: shortDesc.language,
          shortDescription: shortDesc.shortDescription
        })
        .onConflictDoNothing()
    }

    // Get short description IDs
    const existingShortDescriptions = await tx.select()
      .from(shortDescriptionsTable)
      .where(sql`(${shortDescriptionsTable.language}, ${shortDescriptionsTable.shortDescription}) IN (${sql.join(
        uniqueShortDescriptions.map(sd => sql`(${sd.language}, ${sd.shortDescription})`),
        sql`, `
      )})`)
    
    const shortDescriptionIds = new Map<string, number>()
    for (const shortDesc of existingShortDescriptions) {
      shortDescriptionIds.set(`${shortDesc.language}-${shortDesc.shortDescription}`, shortDesc.id)
    }

    // Create media-short description junction entries
    const mediaShortDescriptionEntries = medias
      .flatMap(media =>
        media.shortDescriptions?.map(shortDesc => {
          const shortDescId = shortDescriptionIds.get(`${shortDesc.language}-${shortDesc.shortDescription}`)
          if (shortDescId) {
            return {
              mediaUri: media.uri,
              shortDescriptionId: shortDescId
            }
          }
          return null
        }) || []
      )
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    if (mediaShortDescriptionEntries.length > 0) {
      await tx.insert(mediaShortDescriptionTable)
        .values(mediaShortDescriptionEntries)
        .onConflictDoNothing()
    }
  }

  const mediaTrailers =
    medias
      .flatMap(media =>
        media.trailers?.map(mediaTrailer => ({
          mediaUri: media.uri,
          uri: mediaTrailer.uri,
          origin: mediaTrailer.origin,
          id: mediaTrailer.id,
          url: mediaTrailer.url,
          language: mediaTrailer.language,
          thumbnail: mediaTrailer.thumbnail,
        }) satisfies CreateMediaTrailer)
      )
      .filter((mediaTrailer): mediaTrailer is NonNullable<typeof mediaTrailer> => mediaTrailer !== null && mediaTrailer !== undefined)

  if (mediaTrailers.length) {
    await tx.insert(mediaTrailerTable)
      .values(mediaTrailers)
      .onConflictDoNothing()
  }

  // Collect all images (covers and banners) and insert into shared images table
  const allImages = [
    ...medias.flatMap(media =>
      media.covers?.map(cover => ({
        url: cover.url!,
        language: cover.language,
        height: cover.height,
        width: cover.width,
        color: cover.color
      })) || []
    ),
    ...medias.flatMap(media =>
      media.banners?.map(banner => ({
        url: banner.url!,
        language: banner.language,
        height: banner.height,
        width: banner.width,
        color: banner.color
      })) || []
    )
  ].filter((img): img is NonNullable<typeof img> => img !== null && img !== undefined && img.url != null)

  const uniqueImages = Array.from(
    new Map(allImages.map(img => [img.url, img])).values()
  )

  if (uniqueImages.length > 0) {
    // Insert images one by one to handle conflicts properly
    for (const img of uniqueImages) {
      await tx.insert(imagesTable)
        .values({
          url: img.url,
          language: img.language || null,
          height: img.height || null,
          width: img.width || null,
          color: img.color || null
        })
        .onConflictDoNothing()
    }

    // Get image IDs
    const existingImages = await tx.select()
      .from(imagesTable)
      .where(sql`${imagesTable.url} IN (${sql.join(
        uniqueImages.map(img => sql`${img.url}`),
        sql`, `
      )})`)
    
    const imageIds = new Map<string, number>()
    for (const img of existingImages) {
      imageIds.set(img.url, img.id)
    }

    // Create media-cover junction entries
    const mediaCoverEntries = medias
      .flatMap(media =>
        media.covers?.map(cover => {
          if (cover.url) {
            const imageId = imageIds.get(cover.url)
            if (imageId) {
              return {
                mediaUri: media.uri,
                imageId: imageId
              }
            }
          }
          return null
        }) || []
      )
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    if (mediaCoverEntries.length > 0) {
      await tx.insert(mediaCoverTable)
        .values(mediaCoverEntries)
        .onConflictDoNothing()
    }

    // Create media-banner junction entries
    const mediaBannerEntries = medias
      .flatMap(media =>
        media.banners?.map(banner => {
          if (banner.url) {
            const imageId = imageIds.get(banner.url)
            if (imageId) {
              return {
                mediaUri: media.uri,
                imageId: imageId
              }
            }
          }
          return null
        }) || []
      )
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    if (mediaBannerEntries.length > 0) {
      await tx.insert(mediaBannerTable)
        .values(mediaBannerEntries)
        .onConflictDoNothing()
    }
  }

  // Handle the many-to-many handles relationship
  const mediaHandles =
    medias
      .flatMap(media =>
        media.handles?.map(handle => ({
          mediaUri: media.uri,
          handleUri: handle.uri
        }) satisfies CreateMediaHandles)
      )
      .filter((mediaHandle): mediaHandle is NonNullable<typeof mediaHandle> => mediaHandle !== null && mediaHandle !== undefined)

  if (mediaHandles.length) {
    await tx.insert(mediaHandlesTable)
      .values(mediaHandles)
      .onConflictDoNothing()
  }

  // Handle episodes for all media
  const allEpisodes = medias.flatMap(media =>
    media.episodes?.map(episode => ({
      ...episode,
      mediaUri: media.uri // Ensure the relation to the parent media
    })) || []
  )

  if (allEpisodes.length) {
    await insertManyEpisode(tx, allEpisodes)
  }
}

export const findAllMedia = async () => {
  const results = await database.query.mediaTable.findMany({
    with: {
      mediaTitles: {
        with: {
          title: true
        }
      },
      mediaDescriptions: {
        with: {
          description: true
        }
      },
      mediaShortDescriptions: {
        with: {
          shortDescription: true
        }
      },
      trailers: true,
      mediaCovers: {
        with: {
          image: true
        }
      },
      mediaBanners: {
        with: {
          image: true
        }
      },
      episodes: true,
      handles: {
        with: {
          handle: {
            with: {
              mediaTitles: {
                with: {
                  title: true
                }
              },
              mediaDescriptions: {
                with: {
                  description: true
                }
              },
              mediaShortDescriptions: {
                with: {
                  shortDescription: true
                }
              },
              trailers: true,
              mediaCovers: {
                with: {
                  image: true
                }
              },
              mediaBanners: {
                with: {
                  image: true
                }
              },
              episodes: true
            }
          }
        }
      },
      handleOf: {
        with: {
          media: true
        }
      }
    }
  })

  // Transform the results to match the expected format
  const mappedMedia = results.map(media => ({
    ...media,
    titles: media.mediaTitles?.map(mt => mt.title) || [],
    descriptions: media.mediaDescriptions?.map(md => md.description) || [],
    shortDescriptions: media.mediaShortDescriptions?.map(msd => msd.shortDescription) || [],
    covers: media.mediaCovers?.map(mc => mc.image) || [],
    banners: media.mediaBanners?.map(mb => mb.image) || [],
    handles: media.handles.map(h => ({
      ...h.handle,
      titles: h.handle.mediaTitles?.map(mt => mt.title) || [],
      descriptions: h.handle.mediaDescriptions?.map(md => md.description) || [],
      shortDescriptions: h.handle.mediaShortDescriptions?.map(msd => msd.shortDescription) || [],
      covers: h.handle.mediaCovers?.map(mc => mc.image) || [],
      banners: h.handle.mediaBanners?.map(mb => mb.image) || []
    }))
  }))

  return removeDuplicatesByUri(mappedMedia.flatMap(recursivelyUnwrapMediaHandles))
}

export const findAggregatedMedia = async() =>
  (await database.query.mediaTable.findMany({
    where: eq(mediaTable.origin, 'ag'),
    with: {
      mediaTitles: {
        with: {
          title: true
        }
      },
      mediaDescriptions: {
        with: {
          description: true
        }
      },
      mediaShortDescriptions: {
        with: {
          shortDescription: true
        }
      },
      trailers: true,
      mediaCovers: {
        with: {
          image: true
        }
      },
      mediaBanners: {
        with: {
          image: true
        }
      },
      episodes: true,
      handles: {
        with: {
          handle: {
            with: {
              mediaTitles: {
                with: {
                  title: true
                }
              },
              mediaDescriptions: {
                with: {
                  description: true
                }
              },
              mediaShortDescriptions: {
                with: {
                  shortDescription: true
                }
              },
              trailers: true,
              mediaCovers: {
                with: {
                  image: true
                }
              },
              mediaBanners: {
                with: {
                  image: true
                }
              },
              episodes: true
            }
          }
        }
      }
    }
  }))
  .map(media => ({
    ...media,
    titles: media.mediaTitles?.map(mt => mt.title) || [],
    descriptions: media.mediaDescriptions?.map(md => md.description) || [],
    shortDescriptions: media.mediaShortDescriptions?.map(msd => msd.shortDescription) || [],
    covers: media.mediaCovers?.map(mc => mc.image) || [],
    banners: media.mediaBanners?.map(mb => mb.image) || [],
    handles: media.handles.map(mediaHandle => ({
      ...mediaHandle.handle,
      titles: mediaHandle.handle.mediaTitles?.map(mt => mt.title) || [],
      descriptions: mediaHandle.handle.mediaDescriptions?.map(md => md.description) || [],
      shortDescriptions: mediaHandle.handle.mediaShortDescriptions?.map(msd => msd.shortDescription) || [],
      covers: mediaHandle.handle.mediaCovers?.map(mc => mc.image) || [],
      banners: mediaHandle.handle.mediaBanners?.map(mb => mb.image) || []
    }))
  }))

export const insertManyEpisode = async (tx: DrizzleSQLiteTransaction, episodes: Episode[]) => {
  const values = episodes.map(episode => ({
    ...episode,
    releaseDate: episode.releaseDate ? new Date(episode.releaseDate) : null
  } satisfies CreateEpisode))

  if (values.length) {
    await tx.insert(episodeTable)
        .values(values)
        .onConflictDoUpdate({
          target: episodeTable.uri,
          set: {
            origin: sql`excluded.origin`,
            id: sql`excluded.id`,
            url: sql`excluded.url`,
            aggregated: sql`excluded.aggregated`,
            releaseDate: sql`excluded.releaseDate`,
            relativeNumber: sql`excluded.relativeNumber`,
            absoluteNumber: sql`excluded.absoluteNumber`,
            mediaUri: sql`excluded.mediaUri`
          }
        })
  }

  // Insert episode titles into shared titles table
  const allEpisodeTitles = episodes
    .flatMap(episode =>
      episode.titles?.map(title => ({
        language: title.language,
        title: title.title
      })) || []
    )
    .filter((title): title is NonNullable<typeof title> => title !== null && title !== undefined)
    .filter(title => title.title?.length > 0 && title.language != null)

  const uniqueEpisodeTitles = Array.from(
    new Map(allEpisodeTitles.map(t => [`${t.language}-${t.title}`, t])).values()
  )

  if (uniqueEpisodeTitles.length > 0) {
    // Insert titles one by one
    for (const title of uniqueEpisodeTitles) {
      await tx.insert(titlesTable)
        .values({
          language: title.language,
          title: title.title
        })
        .onConflictDoNothing()
    }

    // Get title IDs for episodes
    const existingTitles = await tx.select()
      .from(titlesTable)
      .where(sql`(${titlesTable.language}, ${titlesTable.title}) IN (${sql.join(
        uniqueEpisodeTitles.map(t => sql`(${t.language}, ${t.title})`),
        sql`, `
      )})`)
    
    const episodeTitleIds = new Map<string, number>()
    for (const title of existingTitles) {
      episodeTitleIds.set(`${title.language}-${title.title}`, title.id)
    }

    // Create episode-title junction entries
    const episodeTitleEntries = episodes
      .flatMap(episode =>
        episode.titles?.map(title => {
          const titleId = episodeTitleIds.get(`${title.language}-${title.title}`)
          if (titleId) {
            return {
              episodeUri: episode.uri,
              titleId: titleId
            }
          }
          return null
        }) || []
      )
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

    if (episodeTitleEntries.length > 0) {
      await tx.insert(episodeTitleTable)
        .values(episodeTitleEntries)
        .onConflictDoNothing()
    }
  }

  // Insert episode descriptions into shared tables
  const allEpisodeDescriptions = episodes
    .flatMap(episode =>
      episode.descriptions?.map(desc => ({
        language: desc.language,
        description: desc.description
      }))
    )
    .filter((desc): desc is NonNullable<typeof desc> => desc !== null && desc !== undefined)
    .filter(desc => desc.description?.length > 0)

  const uniqueEpisodeDescriptions = Array.from(
    new Map(allEpisodeDescriptions.map(d => [`${d.language}-${d.description}`, d])).values()
  )

  if (uniqueEpisodeDescriptions.length) {
    await tx.insert(descriptionsTable)
      .values(uniqueEpisodeDescriptions)
      .onConflictDoNothing()
  }

  // Get description IDs
  const episodeDescriptionIds = new Map<string, number>()
  if (uniqueEpisodeDescriptions.length) {
    const existingDescriptions = await tx.select()
      .from(descriptionsTable)
      .where(sql`(${descriptionsTable.language}, ${descriptionsTable.description}) IN (${sql.join(
        uniqueEpisodeDescriptions.map(d => sql`(${d.language}, ${d.description})`),
        sql`, `
      )})`)
    
    for (const desc of existingDescriptions) {
      episodeDescriptionIds.set(`${desc.language}-${desc.description}`, desc.id)
    }
  }

  // Create episode-description junction entries
  const episodeDescriptionEntries = episodes
    .flatMap(episode =>
      episode.descriptions?.map(desc => {
        const descId = episodeDescriptionIds.get(`${desc.language}-${desc.description}`)
        if (descId) {
          return {
            episodeUri: episode.uri,
            descriptionId: descId
          }
        }
        return null
      })
    )
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  if (episodeDescriptionEntries.length) {
    await tx.insert(episodeDescriptionTable)
      .values(episodeDescriptionEntries)
      .onConflictDoNothing()
  }

  // Insert episode short descriptions
  const allEpisodeShortDescriptions = episodes
    .flatMap(episode =>
      episode.shortDescriptions?.map(shortDesc => ({
        language: shortDesc.language,
        shortDescription: shortDesc.shortDescription
      }))
    )
    .filter((shortDesc): shortDesc is NonNullable<typeof shortDesc> => shortDesc !== null && shortDesc !== undefined)
    .filter(shortDesc => shortDesc.shortDescription?.length > 0)

  const uniqueEpisodeShortDescriptions = Array.from(
    new Map(allEpisodeShortDescriptions.map(sd => [`${sd.language}-${sd.shortDescription}`, sd])).values()
  )

  if (uniqueEpisodeShortDescriptions.length) {
    await tx.insert(shortDescriptionsTable)
      .values(uniqueEpisodeShortDescriptions)
      .onConflictDoNothing()
  }

  // Get short description IDs
  const episodeShortDescriptionIds = new Map<string, number>()
  if (uniqueEpisodeShortDescriptions.length) {
    const existingShortDescriptions = await tx.select()
      .from(shortDescriptionsTable)
      .where(sql`(${shortDescriptionsTable.language}, ${shortDescriptionsTable.shortDescription}) IN (${sql.join(
        uniqueEpisodeShortDescriptions.map(sd => sql`(${sd.language}, ${sd.shortDescription})`),
        sql`, `
      )})`)
    
    for (const shortDesc of existingShortDescriptions) {
      episodeShortDescriptionIds.set(`${shortDesc.language}-${shortDesc.shortDescription}`, shortDesc.id)
    }
  }

  // Create episode-short description junction entries
  const episodeShortDescriptionEntries = episodes
    .flatMap(episode =>
      episode.shortDescriptions?.map(shortDesc => {
        const shortDescId = episodeShortDescriptionIds.get(`${shortDesc.language}-${shortDesc.shortDescription}`)
        if (shortDescId) {
          return {
            episodeUri: episode.uri,
            shortDescriptionId: shortDescId
          }
        }
        return null
      })
    )
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  if (episodeShortDescriptionEntries.length) {
    await tx.insert(episodeShortDescriptionTable)
      .values(episodeShortDescriptionEntries)
      .onConflictDoNothing()
  }

  // Insert episode thumbnails into shared images table
  const allEpisodeThumbnails = episodes
    .flatMap(episode =>
      episode.thumbnails?.map(thumb => ({
        url: thumb.url,
        language: thumb.language,
        height: thumb.height,
        width: thumb.width,
        color: thumb.color
      }))
    )
    .filter((thumb): thumb is NonNullable<typeof thumb> => thumb !== null && thumb !== undefined)
    .filter(thumb => thumb.url?.length > 0)

  const uniqueEpisodeThumbnails = Array.from(
    new Map(allEpisodeThumbnails.map(thumb => [thumb.url, thumb])).values()
  )

  if (uniqueEpisodeThumbnails.length) {
    await tx.insert(imagesTable)
      .values(uniqueEpisodeThumbnails)
      .onConflictDoNothing()
  }

  // Get thumbnail IDs
  const episodeThumbnailIds = new Map<string, number>()
  if (uniqueEpisodeThumbnails.length) {
    const existingImages = await tx.select()
      .from(imagesTable)
      .where(sql`${imagesTable.url} IN (${sql.join(
        uniqueEpisodeThumbnails.map(thumb => sql`${thumb.url}`),
        sql`, `
      )})`)
    
    for (const img of existingImages) {
      episodeThumbnailIds.set(img.url, img.id)
    }
  }

  // Create episode-thumbnail junction entries
  const episodeThumbnailEntries = episodes
    .flatMap(episode =>
      episode.thumbnails?.map(thumb => {
        const imageId = episodeThumbnailIds.get(thumb.url)
        if (imageId) {
          return {
            episodeUri: episode.uri,
            imageId: imageId
          }
        }
        return null
      })
    )
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

  if (episodeThumbnailEntries.length) {
    await tx.insert(episodeThumbnailTable)
      .values(episodeThumbnailEntries)
      .onConflictDoNothing()
  }
}

export const aggregateMediaHandles = (medias: Media[]) =>
  medias.reduce((acc, media) => ({
    ...acc,
    titles: [...acc.titles ?? [], ...media.titles ?? []]
  }), {
    uri: `ag:(${medias.sort((a, b) => a.uri.localeCompare(b.uri)).map(media => media.uri).join(',')})`,
    id: `(${medias.sort((a, b) => a.uri.localeCompare(b.uri)).map(media => media.uri).join(',')})`,
    origin: 'ag',
    url: undefined,
    aggregated: true,
    handles: removeDuplicatesByUri(medias.flatMap(recursivelyUnwrapMediaHandles))
  } as Media)

export const cleanupDuplicateAggregatedMedia = async () => {
  // Find all aggregated media (origin = 'ag')
  const aggregatedMedia = await database.query.mediaTable.findMany({
    where: eq(mediaTable.origin, 'ag'),
    with: {
      handles: {
        with: {
          handle: true
        }
      }
    }
  })

  // console.log(`Found ${aggregatedMedia.length} aggregated media to check for subsets`)

  // Extract URIs for each aggregated media
  const mediaWithUris = aggregatedMedia.map(media => {
    const match = media.uri.match(/^ag:\((.*)\)$/)
    if (!match) {
      // console.log(`Skipping media with invalid ag: format: ${media.uri}`)
      return null
    }

    const urisSet = new Set(match[1].split(','))
    return { media, urisSet }
  }).filter((item): item is NonNullable<typeof item> => item !== null)

  // Find subsets: if media A contains all URIs of media B, then B is a subset of A
  const toDelete: string[] = []

  for (let i = 0; i < mediaWithUris.length; i++) {
    const { media: mediaA, urisSet: urisA } = mediaWithUris[i]

    for (let j = 0; j < mediaWithUris.length; j++) {
      if (i === j) continue

      const { media: mediaB, urisSet: urisB } = mediaWithUris[j]

      // Check if B is a subset of A (A contains all URIs of B)
      const isSubset = [...urisB].every(uri => urisA.has(uri))

      if (isSubset && urisB.size < urisA.size) {
        // B is a proper subset of A, mark B for deletion
        // console.log(`${mediaB.uri} (${urisB.size} URIs) is a subset of ${mediaA.uri} (${urisA.size} URIs)`)
        if (!toDelete.includes(mediaB.uri)) {
          toDelete.push(mediaB.uri)
        }
      }
    }
  }

  // Delete the duplicate aggregated media
  if (toDelete.length > 0) {
    // console.log(`Deleting ${toDelete.length} duplicate aggregated media:`, toDelete)

    await database.transaction(async (tx) => {
      // Delete related data first (due to foreign key constraints)
      await tx.delete(mediaTitleTable).where(inArray(mediaTitleTable.mediaUri, toDelete))
      await tx.delete(mediaDescriptionTable).where(inArray(mediaDescriptionTable.mediaUri, toDelete))
      await tx.delete(mediaShortDescriptionTable).where(inArray(mediaShortDescriptionTable.mediaUri, toDelete))
      await tx.delete(mediaTrailerTable).where(inArray(mediaTrailerTable.mediaUri, toDelete))
      await tx.delete(mediaCoverTable).where(inArray(mediaCoverTable.mediaUri, toDelete))
      await tx.delete(mediaBannerTable).where(inArray(mediaBannerTable.mediaUri, toDelete))
      await tx.delete(mediaHandlesTable).where(
        sql`${mediaHandlesTable.mediaUri} IN (${sql.join(toDelete.map(uri => sql`${uri}`), sql`, `)}) OR ${mediaHandlesTable.handleUri} IN (${sql.join(toDelete.map(uri => sql`${uri}`), sql`, `)})`
      )
      await tx.delete(episodeTable).where(inArray(episodeTable.mediaUri, toDelete))

      // Finally delete the media itself
      await tx.delete(mediaTable).where(inArray(mediaTable.uri, toDelete))
    })
  }

  return toDelete.length
}
