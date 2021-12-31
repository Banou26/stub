import { FieldFunctionOptions, makeVar } from '@apollo/client'
import { Episode, EpisodeHandle, Image, Name, Relation, Relationship, ReleaseDate, Synopsis, Title, TitleHandle } from 'src/lib'
import { EpisodeApolloCache, EpisodeHandleApolloCache, GET_TITLE, ImageApolloCache, NameApolloCache, RelationApolloCache, ReleaseDateApolloCache, SynopsisApolloCache, TitleApolloCache, TitleHandleApolloCache } from '.'
import { get } from '../../lib/targets'
import cache from '../cache'

export const asyncRead = (fn, query) => {
  return (_, args) => {
      if (!args.storage.var) {
          args.storage.var = makeVar(undefined)
          fn(_, args).then(
              data => {
                  args.storage.var(data)
                  args.cache.writeQuery({
                      query,
                      data: { [args.fieldName]: data }
                  })
              }
          )
      }
      return args.storage.var()
  }
}

const nameToNameApolloCache = (name: Name): NameApolloCache => ({
  __typename: 'Name',
  ...name
})

const imageToImageApolloCache = (image: Image): ImageApolloCache => ({
  __typename: 'Image',
  ...image
})

const synopsisToSynopsisApolloCache = (synopsis: Synopsis): SynopsisApolloCache => ({
  __typename: 'Synopsis',
  ...synopsis
})

// todo: try to fix this mess of type casting
const relationToRelationApolloCache = <T, T2 = any>(relation: Relation<T2>): RelationApolloCache<T> => ({
  __typename: 'Relation',
  relation: relation.relation as any,
  reference: relation.reference as unknown as T
})

const releaseDateToReleaseDateApolloCache = <T>(releaseDate: ReleaseDate): ReleaseDateApolloCache => ({
  __typename: 'ReleaseDate',
  ...releaseDate
})

const episodeHandleToEpisodeHandleApolloCache = (episode: EpisodeHandle): EpisodeHandleApolloCache => ({
  __typename: 'EpisodeHandle',
  ...episode,
  names: episode.names.map(nameToNameApolloCache),
  related: episode.related.map(relation => relationToRelationApolloCache<EpisodeHandleApolloCache>(relation)),
  releaseDates: episode.releaseDates.map(releaseDateToReleaseDateApolloCache),
  images: episode.images.map(imageToImageApolloCache),
  synopses: episode.synopses.map(synopsisToSynopsisApolloCache),
  handles: episode.handles?.map(episodeHandleToEpisodeHandleApolloCache)
})

const episodeToEpisodeApolloCache = (episode: Episode): EpisodeApolloCache => ({
  __typename: 'Episode',
  ...episode,
  names: episode.names.map(nameToNameApolloCache),
  related: episode.related.map(relation => relationToRelationApolloCache<EpisodeApolloCache>(relation)),
  releaseDates: episode.releaseDates.map(releaseDateToReleaseDateApolloCache),
  images: episode.images.map(imageToImageApolloCache),
  synopses: episode.synopses.map(synopsisToSynopsisApolloCache),
  handles: episode.handles.map(episodeHandleToEpisodeHandleApolloCache)
})

const titleHandleToTitleHandleApolloCache = (titleHandle: TitleHandle): TitleHandleApolloCache => ({
  __typename: 'TitleHandle',
  ...titleHandle,
  names: titleHandle.names.map(nameToNameApolloCache),
  related: titleHandle.related.map(relation => relationToRelationApolloCache<TitleHandleApolloCache>(relation)),
  releaseDates: titleHandle.releaseDates.map(releaseDateToReleaseDateApolloCache),
  images: titleHandle.images.map(imageToImageApolloCache),
  synopses: titleHandle.synopses.map(synopsisToSynopsisApolloCache),
  handles: titleHandle.handles?.map(titleHandleToTitleHandleApolloCache)
})

const titleToTitleApolloCache = (title: Title): TitleApolloCache => ({
  __typename: 'Title',
  ...title,
  names: title.names.map(nameToNameApolloCache),
  related: title.related.map(relation => relationToRelationApolloCache<TitleApolloCache>(relation)),
  recommended: title.recommended.map(titleToTitleApolloCache),
  releaseDates: title.releaseDates.map(releaseDateToReleaseDateApolloCache),
  images: title.images.map(imageToImageApolloCache),
  synopses: title.synopses.map(synopsisToSynopsisApolloCache),
  handles: title.handles.map(titleHandleToTitleHandleApolloCache),
  episodes: title.episodes.map(episodeToEpisodeApolloCache)
})

cache.policies.addTypePolicies({
  Query: {
    fields: {
      title: (_, args: FieldFunctionOptions & { args: { uri: string } | { scheme: string, id: string } }) => {
        const { toReference, args: { uri, scheme, id }, storage, cache, fieldName } = args
        console.log('GET TITLE ARGS', args)
        if (!storage.var) {
          args.storage.var = makeVar(undefined)
          get({ title: true, uri, scheme, id }).then((data) => {
            const title = titleHandleToTitleHandleApolloCache(data[0] as TitleHandle)
            console.log('data res', title)
            storage.var(title)
            cache.writeQuery({ query: GET_TITLE, data: { [fieldName]: title } })
          })
        }
        console.log('GET TITLE', storage.var())
        return storage.var()
        // toReference({ __typename: 'Title', id })
      },
      titles: (_, { toReference, args: { id } }: FieldFunctionOptions & { args: { id: string } }) =>
        toReference({
          __typename: 'Title',
          id
        })
    }
  }
})

export const foo = undefined
