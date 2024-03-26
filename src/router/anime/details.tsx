import { css } from "@emotion/react"
import { ArrowRight, BarChart, Calendar, Cloud, User } from "react-feather"
import { useSubscription } from "urql"
import { useParams } from "wouter"

export const GET_PREVIEW_MODAL_MEDIA = `#graphql
  subscription GetPreviewModalMedia($input: MediaInput!) {
    media(input: $input) {
      handles {
        edges {
          node {
            handles {
              edges {
                node {
                  origin
                  id
                  uri
                }
              }
            }
            ...GetPreviewModalMediaFragment
          }
        }
      }
      ...GetPreviewModalMediaFragment
    }
  }

  fragment GetPreviewModalMediaEpisodeFragment on Episode {
    origin
    id
    uri
    url
    handles {
      edges {
        node {
          origin
          id
          uri
          url
        }
      }
    }
    airingAt
    number
    mediaUri
    timeUntilAiring
    thumbnail
    title {
      romanized
      english
      native
    }
    description
  }

  fragment GetPreviewModalMediaFragment on Media {
    origin
    id
    uri
    url
    title {
      romanized
      english
      native
    }
    bannerImage
    coverImage {
      color
      default
      extraLarge
      large
      medium
      small
    }
    description
    shortDescription
    season
    seasonYear
    popularity
    averageScore
    episodeCount
    trailers {
      origin
      id
      uri
      url
      thumbnail
    }
    startDate {
      year
      month
      day
    }
    endDate {
      year
      month
      day
    }
    episodes {
      edges {
        node {
          ...GetPreviewModalMediaEpisodeFragment
        }
      }
    }
  }
`

const style = css`
display: grid;
grid-template-columns: 4fr 1fr;
margin: 0 5rem;
.top {
  display: flex;
  justify-content: flex-start;
  align-items: flex-end;
  gap: 1rem;

  .right {
    display: flex;
    flex-direction: column;
    gap: 1rem;

    .title {
      font-size: 2.5rem;
      @media (min-width: 2560px) {
      font-size: 3rem;
      }
      font-weight: 600;
    }

    > div {
      margin-top: 1rem;
      display: flex;
      align-items: center;
      gap: 3rem;

      span {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
    }
  }

  img {
    width: auto;
    height: 50rem;
    object-fit: cover;
    border-radius: .5rem;
  }
}
.episode {
  img {
    width: 100%;
    height: auto;
    object-fit: cover;
  }
}
`

const AnimeDetails = () => {
  const { uri } = useParams()

  const [{ fetching, error, data: { media } = { media: undefined } }] = useSubscription({
    query: GET_PREVIEW_MODAL_MEDIA,
    variables: { input: { uri: uri! } },
    pause: !uri
  })

  console.log('uri1', uri, media)
  
  return (
    <div css={style}>
      <div className="main">
        <div className="top">
          <div>
            <img src={media?.coverImage.at(0)?.default} alt={media?.title?.english} />
          </div>
          <div className="right">
            <h1 className="title">{media?.title?.english}</h1>
            <div>
              <span><Cloud /> {media?.season}</span>
              <span>
                <Calendar />
                {media?.startDate.year}-{media?.startDate.month}-{media?.startDate.day}
                <ArrowRight size={16} />
                {media?.endDate.year}-{media?.endDate.month}-{media?.endDate.day}
              </span>
            </div>
            <div>
              <span><User /> {media?.popularity}</span>
              <span><BarChart /> {media?.averageScore}</span>
              <span>Episodes: {media?.episodeCount}</span>
            </div>
          </div>
        </div>
        <div>
          <h2>Synopsis</h2>
          <p>{media?.description}</p>
        </div>
      </div>
      <div className="episode">
        <h2>Episodes</h2>
        <div>
          {media?.episodes?.edges.map((episode: any) => (
            <div key={episode.node.id}>
              <div className="card">
                <img src={episode.node.thumbnail} alt={episode.node.title.english} />
                <h3>{episode.node.title.english}</h3>
                <span>{episode.node.description}</span>
                <span>{episode.node.airingAt}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default AnimeDetails