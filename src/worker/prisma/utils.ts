import type { Media } from 'src/generated/schema/types.generated'

export const filterNonNullable = <T extends any[]>(array: T) => array.filter((value): value is NonNullable<T[number]> => Boolean(value))

export const makeMediaNonNullable = (media: Media) => ({
  ...media,
  titles: filterNonNullable(media.titles?.filter(mediaTitle => mediaTitle.language && mediaTitle.title) ?? []),
  trailers: filterNonNullable(media.trailers?.filter(mediaTitle => mediaTitle.uri) ?? []),
  shortDescriptions: filterNonNullable(media.shortDescriptions?.filter(mediaShortDescription => mediaShortDescription.language && mediaShortDescription.shortDescription) ?? []),
  descriptions: filterNonNullable(media.descriptions?.filter(mediaDescription => mediaDescription.language && mediaDescription.description) ?? []),
  covers: filterNonNullable(media.covers?.filter(mediaCovers => mediaCovers.language && mediaCovers.url) ?? []),
  banners: filterNonNullable(media.banners?.filter(mediaBanners => mediaBanners.language && mediaBanners.url) ?? []),
})

export const unwrapHandles = (media: Media): ReturnType<typeof makeMediaNonNullable>[] => [
  makeMediaNonNullable(media),
  ...media.handles?.flatMap(media => unwrapHandles(media)) ?? []
]
