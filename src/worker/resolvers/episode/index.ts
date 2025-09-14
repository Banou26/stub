import type { Resolvers } from '../../../generated/schema/types.generated'
// @ts-expect-error
import _schema from './schema.gql?raw'
import { EpisodeDescriptionContentType } from '../../../generated/graphql'
import { parseHTMLDescription, parseTextDescription } from '../utils'

export const schema = _schema as string

export const resolvers = {
  Query: {},
  Mutation: {},
  Subscription: {},
  Episode: {
    descriptions: (parent, args) => {
      const descriptions =
        parent
          .descriptions
          ?.slice(0, args.input?.count ? args.input.count : undefined)
          .map(episodeDescription => {
            const parsed =
              args.input?.type === EpisodeDescriptionContentType.Html ? parseHTMLDescription(episodeDescription.description)
              : args.input?.type === EpisodeDescriptionContentType.Text ? parseTextDescription(episodeDescription.description)
              : parseTextDescription(episodeDescription.description)

            return {
              ...episodeDescription,
              shortDescription: parsed
            }
          })

      return descriptions
    },
    shortDescriptions: (parent, args) => {
      const shortDescriptions =
        parent
          .shortDescriptions
          ?.slice(0, args.input?.count ? args.input.count : undefined)
          ?.map(episodeShortDescription => {
            const parsed =
              args.input?.type === EpisodeDescriptionContentType.Html ? parseHTMLDescription(episodeShortDescription.shortDescription)
              : args.input?.type === EpisodeDescriptionContentType.Text ? parseTextDescription(episodeShortDescription.shortDescription)
              : parseTextDescription(episodeShortDescription.shortDescription)

            return {
              ...episodeShortDescription,
              shortDescription: parsed
            }
          })
          .filter((episodeShortDescription): episodeShortDescription is NonNullable<typeof episodeShortDescription> => Boolean(episodeShortDescription))

      return shortDescriptions
    },
  }
} satisfies Resolvers
