export const icon = 'https://cdn.myanimelist.net/images/favicon.ico'
export const originUrl = 'https://myanimelist.net'
export const origin = 'mal'
export const categories = ['ANIME']
export const name = 'MyAnimeList'
export const official = true
export const metadataOnly = true
export const supportedUris = ['mal']

export interface RecentEpisodes {
  pagination: Pagination
  data: RecentEpisodesData[]
}

export interface Pagination {
  last_visible_page: number
  has_next_page: boolean
}

export interface RecentEpisodesData {
  entry: Entry
  episodes: Episode[]
  region_locked: boolean
}

export interface Entry {
  mal_id: number
  url: string
  images: Images
  title: string
}

export interface Images {
  jpg: Jpg
  webp: Webp
}

export interface Jpg {
  image_url: string
  small_image_url: string
  large_image_url: string
}

export interface Webp {
  image_url: string
  small_image_url: string
  large_image_url: string
}

export interface Episode {
  mal_id: number
  url: string
  title: string
  premium: boolean
}

export interface Root {
  pagination: Pagination
  data: AnimeResponse[]
}

export interface Pagination {
  last_visible_page: number
  has_next_page: boolean
  current_page: number
  items: Items
}

export interface Items {
  count: number
  total: number
  per_page: number
}

export interface Episode {
  mal_id: number
  url: string
  title: string
  title_japanese: string
  title_romanji: string
  aired: string
  score: number
  filler: boolean
  recap: boolean
  forum_url: string
}

export interface AnimeResponse {
  mal_id: number
  url: string
  images: Images
  trailer: Trailer
  approved: boolean
  titles: Title[]
  title: string
  title_english?: string
  title_japanese: string
  title_synonyms: string[]
  type: string
  source: string
  episodes?: number
  status: string
  airing: boolean
  aired: Aired
  duration: string
  rating?: string
  score?: number
  scored_by?: number
  rank?: number
  popularity: number
  members: number
  favorites: number
  synopsis: string
  background: any
  season: string
  year: number
  broadcast: Broadcast
  producers: Producer[]
  licensors: Licensor[]
  studios: Studio[]
  genres: Genre[]
  explicit_genres: any[]
  themes: Theme[]
  demographics: Demographic[]
}

export interface Images {
  jpg: Jpg
  webp: Webp
}

export interface Jpg {
  image_url: string
  small_image_url: string
  large_image_url: string
}

export interface Webp {
  image_url: string
  small_image_url: string
  large_image_url: string
}

export interface Trailer {
  youtube_id: string
  url: string
  embed_url: string
  images: Images2
}

export interface Images2 {
  image_url: string
  small_image_url: string
  medium_image_url: string
  large_image_url: string
  maximum_image_url: string
}

export interface Title {
  type: string
  title: string
}

export interface Aired {
  from: string
  to: any
  prop: Prop
  string: string
}

export interface Prop {
  from: From
  to: To
}

export interface From {
  day: number
  month: number
  year: number
}

export interface To {
  day: any
  month: any
  year: any
}

export interface Broadcast {
  day: string
  time: string
  timezone: string
  string: string
}

export interface Producer {
  mal_id: number
  type: string
  name: string
  url: string
}

export interface Licensor {
  mal_id: number
  type: string
  name: string
  url: string
}

export interface Studio {
  mal_id: number
  type: string
  name: string
  url: string
}

export interface Genre {
  mal_id: number
  type: string
  name: string
  url: string
}

export interface Theme {
  mal_id: number
  type: string
  name: string
  url: string
}

export interface Demographic {
  mal_id: number
  type: string
  name: string
  url: string
}

const normalizeToMedia = async (data: AnimeResponse, context): NoExtraProperties<Media> => {
  const searchTitle = data.title_english ?? data.title
  const crunchyrollHandle = undefined
    // querying crunchyroll for all normalize is fine since streaming is only present when querying details
    // context.client && data.streaming?.find(site => site.name === 'Crunchyroll') && searchTitle
    //   ? await findCrunchyrollAnime(context, searchTitle)
    //   : undefined

  const aniDBSource =
    data.external?.find(site => site.name === 'AniDB')
  const aniDBId =
    aniDBSource
      ? (
        new URL(aniDBSource?.url).searchParams.get('aid')
        ?? new URL(aniDBSource?.url).pathname.split('/')[2]
      )
      : undefined

  // todo: make a system to automatically create handle lists that are using same ids
  const aniDBHandle =
    aniDBSource
      ? populateHandle({
        origin: 'anidb',
        id: aniDBId,
        url: aniDBSource?.url,
        handles: []
      })
      : undefined

  const animetoshoHandle =
    aniDBSource
      ? populateHandle({
        origin: 'animetosho',
        id: aniDBId,
        url: `https://animetosho.org/series/_.${aniDBId}`,
        handles: []
      })
      : undefined

  const anizipHandle =
    aniDBSource
      ? populateHandle({
        origin: 'anizip',
        id: aniDBId,
        url: `https://api.ani.zip/mappings?anidb_id=${aniDBId}`,
        handles: []
      })
      : undefined

  return ({
    ...populateHandle({
      origin,
      id: data.mal_id.toString(),
      url: data.url,
      handles: [
        ...crunchyrollHandle ? [crunchyrollHandle] : [],
        ...aniDBHandle ? [aniDBHandle] : [],
        ...animetoshoHandle ? [animetoshoHandle] : [],
        ...anizipHandle ? [anizipHandle] : []
      ]
    }),
    averageScore: data.score,
    description: data.synopsis,
    shortDescription: data.synopsis,
    title: {
      romanized: data.title,
      english: data.title_english,
      native: data.title_japanese
    },
    coverImage: [{
      extraLarge: data.images.webp.large_image_url,
      large: data.images.webp.large_image_url,
      medium: data.images.webp.large_image_url,
      color: ''
    }],
    popularity: data.members,
    status:
      data.status === 'Not yet aired' ? GraphQLTypes.MediaStatus.NotYetReleased
      : data.status === 'Currently Airing' ? GraphQLTypes.MediaStatus.Releasing
      : data.status === 'Finished Airing' ? GraphQLTypes.MediaStatus.Finished
      : undefined,
    startDate: {
      year: data.aired.prop.from.year,
      month: data.aired.prop.from.month,
      day: data.aired.prop.from.day
    },
    endDate: {
      year: data.aired.prop.to.year,
      month: data.aired.prop.to.month,
      day: data.aired.prop.to.day
    },
    trailers:
      data.trailer?.youtube_id
        ? [{
          ...populateHandle({
            origin: 'yt',
            id: data.trailer.youtube_id,
            url: `https://www.youtube.com/watch?v=${data.trailer.youtube_id}`,
            handles: []
          }),
          thumbnail: data.trailer.images.image_url
        }]
      : undefined,
    episodes: []
    // episodes: {
    //   edges: data.episodes?.edges?.filter(Boolean).map(edge => edge?.node && ({
    //     node: {
    //       airingAt: edge.node.airingAt,
    //       episodeNumber: edge.node.episode,
    //       uri: edge.node.id.toString(),
    //       media: edge.node.media,
    //       mediaUri: edge.node?.media?.id.toString(),
    //       timeUntilAiring: edge.node.timeUntilAiring,
    //     }
    //   }))
    // }
  })
}


const normalizeToEpisode = (mediaId: number, data: Episode): NoExtraProperties<Episode> => {
  const id = data.url?.split('/')[4] ?? mediaId
  const episodeNumber = Number(data.url?.split('/')[7] ?? data.mal_id)

  const airingTime = new Date(data.aired).getTime()

  return ({
    ...populateHandle({
      origin,
      id: `${id}-${episodeNumber}`,
      url: data.url,
      handles: []
    }),
    airingAt: airingTime,
    number: episodeNumber,
    media: populateHandle({
      origin,
      id,
      url: data.url?.split('/').slice(0, 4).join('/') ?? `https://myanimelist.net/anime/${id}/`,
      handles: []
    }),
    mediaUri: toUri({ origin, id }),
    timeUntilAiring: airingTime - Date.now(),
    // thumbnail: String
    title: {
      english: data.title,
      native: data.title_japanese,
      romanized: data.title_romanji
    }
    // description: String
  })
}

const fetchEpisodes = ({ id }: { id: number }, context: MediaParams[2]) =>
  context
    .fetch(`https://api.jikan.moe/v4/anime/${id}/episodes`)
    .then(response => response.json())
    .then(json =>
        json.data
          ? json.data.map(node => normalizeToEpisode(id, node))
          : undefined
      )

const fetchSearchAnime = ({ search }: { search: string }, context: MediaParams[2]) =>
  context
    .fetch(`https://api.jikan.moe/v4/anime?q=${search}`)
    .then(response => response.json())
    .then(json =>
      json.data
        ? json.data.map(media => normalizeToMedia(media, context))
        : undefined
    )

const fetchMedia = ({ id }: { id: number }, context: MediaParams[2]) =>
  context
    .fetch(`https://api.jikan.moe/v4/anime/${id}/full`)
    .then(response => response.json())
    .then(json =>
      json.data
        ? normalizeToMedia(json.data, context)
        : undefined
    )


const getSeasonNow = (page = 1, context: MediaParams[2]): Promise<Root> =>
  context
    .fetch(`https://api.jikan.moe/v4/seasons/now?page=${page}&sfw=true`)
    .then(res => res.json())

const getRecentEpisodesJson = (page = 1, context: MediaParams[2]): Promise<RecentEpisodes> =>
  context
    .fetch(`https://api.jikan.moe/v4/watch/episodes?page=${page}`)
    .then(res => res.json())

const getRecentEpisodes = (page = 1, context: MediaParams[2]): Promise<Episode[]> =>
  getRecentEpisodesJson(page, context)
    .then(({ data }) =>
      data.map(item =>
        item
          .episodes
          .map(episode => ({
            ...populateHandle({
              origin,
              id: `${item.entry.mal_id}-${episode.mal_id}`,
              url: episode.url,
              handles: []
            }),
            number: episode.mal_id,
            media: populateHandle({
              origin,
              id: item.entry.mal_id.toString(),
              url: item.entry.url,
              handles: [],
              title: {
                romanized: item.entry.title
              },
              coverImage: [{
                extraLarge: item.entry.images.webp.large_image_url,
                large: item.entry.images.webp.large_image_url,
                medium: item.entry.images.webp.large_image_url,
                color: ''
              }]
            }),
            mediaUri: toUri({ origin, id: item.entry.mal_id.toString() }),
            // thumbnail: item.thumbnail,
            title: {
              romanized:
                episode.title.startsWith('Episode')
                  ? undefined
                  : episode.title
            }
          }))
          .at(0)
      )
      .filter(episode => episode.number !== undefined && episode.number !== null)
    )

const getFullSeasonNow = async (_, { season, seasonYear }: MediaParams[1], context: MediaParams[2], __) => {
  const { data, pagination } = await getSeasonNow(1, context)
  return (
    [
      ...data,
      ...(await Promise.all(
        new Array(Math.min(2, pagination.last_visible_page - 1))
          .fill(undefined)
          .map((_, i) => getSeasonNow(i + 2, context).then(({ data }) => data))
      )).flat()
    ]
      .map(normalizeToMedia)
  )
}

const searchAnime = async (_, { input: { search } }: MediaParams[1], context: MediaParams[2], __) =>
  fetchSearchAnime({ search: search! }, context)

export const resolvers: Resolvers = {
  Query: {
    user: async (...args) => {
      const [_, { input: { origin: _origin, type, oauth2 } = {} }, { fetch }] = args
      if (_origin !== origin || !oauth2) return undefined
      const response = await (await fetch(
        `https://api.myanimelist.net/v2/users/@me`,
        { headers: { 'Authorization': `Bearer ${oauth2.accessToken}` } }
      )).json()
      return {
        id: response.id,
        username: response.name,
        email: null,
        avatar: response.picture
      }
    },
    authentications: async (...args) => {
      const [_, __, { origin }] = args
      return [{
        origin,
        authentication: true,
        methods: [
          {
            type: 'OAUTH2',
            url: `https://myanimelist.net/v1/oauth2/authorize`,
            headers: [],
            body: ''
          }
        ]
      }]
    },
  },
  Mutation: {
    authenticate: async (...args) => {
      const [_, { input: { origin, type, oauth2: { clientId, authorizationCode, codeVerifier, grantType, redirectUri } } }, { fetch }] = args
      if (origin !== 'mal' || type !== 'OAUTH2') return undefined
      const params = new URLSearchParams({
        client_id: clientId,
        code: authorizationCode,
        code_verifier: codeVerifier,
        grant_type: grantType,
        redirect_uri: redirectUri
      }).toString()

      return fetch(`https://myanimelist.net/v1/oauth2/token`, {
        method: 'POST',
        headers:{ 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params
      }).then(async res => {
        const response = await res.json()
        if (response.error) throw new Error(`Error from MAL: ${response.error}, ${response.message}, ${response.hint}`)
        return {
          oauth2: {
            accessToken: response.access_token,
            refreshToken: response.refresh_token,
            expiresIn: response.expires_in,
            tokenType: response.token_type,
          }
        }
      })
    },
    updateUserMedia: async (_, { input, input: { mediaUri, authentications, status, isRewatching, rewatchCount, score, progress } }, { fetch }) => {
      const oauthAuthentication = authentications?.find(auth => auth.origin === origin && auth.type === 'OAUTH2')
      if (!oauthAuthentication || !oauthAuthentication.oauth2) return undefined

      if (!mediaUri) return undefined
      const malUri = fromScannarrUri(mediaUri)?.handleUrisValues.find(({ origin }) => origin === 'mal')
      if (!malUri) return undefined

      const params = new URLSearchParams({
        ...status ? { status: status.toLowerCase() } : {},
        ...isRewatching ? { is_rewatching: isRewatching } : {},
        ...rewatchCount ? { num_times_rewatched: rewatchCount } : {},
        ...score ? { score } : {},
        ...progress ? { num_watched_episodes: progress } : {}
      }).toString()

      const response = await (await fetch(`https://api.myanimelist.net/v2/anime/${malUri.id}/my_list_status`,
        {
          headers: {
            'Authorization': `Bearer ${oauthAuthentication.oauth2.accessToken}`,
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          method: 'PATCH',
          body: params
        }
      )).json()

      return {
        ...populateHandle({
          origin,
          id: malUri.id,
          url: null
        }),

        status:
          response.status === 'completed' ? GraphQLTypes.UserMediaStatus.Completed
          : response.status === 'dropped' ? GraphQLTypes.UserMediaStatus.Dropped
          : response.status === 'on_hold' ? GraphQLTypes.UserMediaStatus.OnHold
          : response.status === 'plan_to_watch' ? GraphQLTypes.UserMediaStatus.PlanToWatch
          : response.status === 'watching' ? GraphQLTypes.UserMediaStatus.Watching
          : undefined,
        score: response.score,
        progress: response.num_episodes_watched,
        isRewatching: response.is_rewatching,
        updatedAt: new Date(response.updated_at).getTime()
      }
    }
  },
  Subscription: {
    media: {
      subscribe: async function*(_, { input: { uri } }, ctx) {
        if (!uri) return
        const uriValues =
          isScannarrUri(uri)
            ? (
              fromScannarrUri(uri)
                ?.handleUrisValues
                .find(({ origin: _origin }) => _origin === origin)
            )
            : fromUri(uri)
        if (!uriValues || uriValues.origin !== origin) return
        yield {
          media: await fetchMedia({ id: Number(uriValues.id) }, ctx)
        }
      }
    },
    mediaPage: {
      subscribe: async function*(_, { input: { search, seasonYear, season } }, ctx) {
        if (search) {
          return yield {
            mediaPage: {
              nodes: await Promise.all(await fetchSearchAnime({ search }, ctx))
            }
          }
        } else if (season && seasonYear) {
          return yield {
            mediaPage: {
              nodes: await Promise.all(await getFullSeasonNow(undefined, { seasonYear, season }, ctx, undefined))
            }
          }
        }
      }
    },
    userMediaPage: {
      subscribe: async function*(_, { input: { status, authentications } }, { fetch }) {
        const oauthAuthentication = authentications?.find(auth => auth.origin === origin && auth.type === 'OAUTH2')
        if (!oauthAuthentication || !oauthAuthentication.oauth2) return undefined
        const response = await (await fetch(
          `https://api.myanimelist.net/v2/users/@me/animelist?${
            new URLSearchParams({
              // https://github.com/SuperMarcus/myanimelist-api-specification?tab=readme-ov-file#animeobject
              fields: [
                'list_status',
                'title',
                'alternative_titles',
                'main_picture',
                'synopsis',
                'mean',
                'popularity',
                'status',
                'start_date',
                'end_date'
              ].join(','),
              limit: '1000',
              status: status.map(s => s.toLowerCase()).join(','),
            }).toString()
          }`,
          { headers: { 'Authorization': `Bearer ${oauthAuthentication.oauth2.accessToken}` } }
        )).json()

        return yield {
          userMediaPage: {
            nodes: response.data.map(({ node, list_status }) => {
              const media = MALNormalizeToMedia(node)

              return ({
                origin: media.origin,
                id: media.id,
                uri: media.uri,
                url: null,
                handles: [],
                episodes: [],
                media,
                status:
                  list_status.status === 'completed' ? GraphQLTypes.UserMediaStatus.Completed
                  : list_status.status === 'dropped' ? GraphQLTypes.UserMediaStatus.Dropped
                  : list_status.status === 'on_hold' ? GraphQLTypes.UserMediaStatus.OnHold
                  : list_status.status === 'plan_to_watch' ? GraphQLTypes.UserMediaStatus.PlanToWatch
                  : list_status.status === 'watching' ? GraphQLTypes.UserMediaStatus.Watching
                  : undefined,
                score: list_status.score,
                progress: list_status.num_episodes_watched,
                isRewatching: list_status.is_rewatching,
                updatedAt: new Date(list_status.updated_at).getTime()
              })
            })
          }
        }
      }
    }
  }
} satisfies GraphQLTypes.Resolvers
