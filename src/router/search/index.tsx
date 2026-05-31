import type { RouteParams } from '../path'

import { css } from '@emotion/react'
import { useSubscription } from 'urql'
import { useParams } from 'wouter'
import { useEffect, useState } from 'preact/hooks'

import { gql } from '../../generated'
import { getRoutePath, Route } from '../path'
import MediaTitle from '../../components/media-title'

const SEARCH_MEDIA_PAGE = gql(`
  subscription SearchMediaPage($input: MediaPageInput!, $shortDescriptionInput: MediaShortDescriptionInput!) {
    mediaPage(input: $input) {
      nodes {
        ...MediaFragment
        score
        episodeCount
        titles {
          language
          title
          score
        }
        shortDescriptions(input: $shortDescriptionInput) {
          language
          shortDescription
        }
        covers {
          language
          url
        }
        banners {
          language
          url
        }
        trailers {
          uri
          origin
          id
          url
          thumbnail
        }
        popularity
      }
    }
  }
`)

const style = css`
  padding: 10rem 3rem 4rem;
  min-height: 100vh;

  .heading {
    font-size: 2.4rem;
    font-weight: 600;
    margin-bottom: 2.5rem;
    color: rgba(255, 255, 255, 0.85);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(25rem, 1fr));
    gap: 2rem;
    justify-items: center;
  }

  .status {
    font-size: 1.8rem;
    color: rgba(255, 255, 255, 0.5);
  }
`

const Search = () => {
  const params = useParams<RouteParams['SEARCH']>()
  const query = params.query ? decodeURIComponent(params.query) : ''

  const [{ data }] = useSubscription({
    query: SEARCH_MEDIA_PAGE,
    variables: {
      input: { search: query },
      shortDescriptionInput: { count: 1 },
    },
    pause: !query,
  })

  const [graceElapsed, setGraceElapsed] = useState(false)
  useEffect(() => {
    setGraceElapsed(false)
    const timer = setTimeout(() => setGraceElapsed(true), 5_000)
    return () => clearTimeout(timer)
  }, [query])

  const nodes = data?.mediaPage?.nodes ?? []

  return (
    <div css={style}>
      <div className="heading">
        {query ? `Results for “${query}”` : 'Search'}
      </div>
      {
        nodes.length
          ? (
            <div className="grid">
              {nodes.map(node => (
                <MediaTitle
                  key={node._id}
                  media={node}
                  to={getRoutePath(Route.MEDIA, { uri: node.uri })}
                />
              ))}
            </div>
          )
          : query
            ? <div className="status">{graceElapsed ? 'No results found.' : 'Searching…'}</div>
            : <div className="status">Type to search across every source.</div>
      }
    </div>
  )
}

export default Search
