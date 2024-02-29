import { css } from '@emotion/react'
import { Link } from 'wouter'
import { FocusEvent, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useDebounce } from 'react-use'
import { useQuery } from 'urql'

import { getRoutePath, Route } from '../router/path'
import DiscordIconUrl from '../images/discord-mark-blue.svg'
import IconUrl from '../images/icon.webp'
import MALIconUrl from '../images/mal-icon.webp'
import ALIconUrl from '../images/al-icon.webp'
import Input from './inputs'

const style = css`
  position: fixed;
  width: 100%;
  background-color: rgb(35, 35, 35);
  color: white;

  display: grid;
  grid-template-columns: auto auto auto;
  @media (min-width: 960px) {
    grid-template-columns: 1fr 1fr 1fr;
  }
  align-items: center;

  user-select: none;

  z-index: 100;

  @media (min-width: 960px) {
    padding: 0 4rem;
    height: 4rem;
  }
  @media (min-width: 2560px) {
    height: 6rem;
  }

  .left {
    display: grid;
    grid-template-columns: auto auto auto;
    gap: .5rem;
    margin-right: .5rem;
    @media (min-width: 960px) {
      grid-template-columns: 15rem 15rem 15rem auto;
      gap: 2rem;
      margin-right: 0;
    }

    .logo-link {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1rem;
      width: 100%;

      font-size: 2rem;
      font-weight: 600;
      text-decoration: none;
      @media (min-width: 2560px) {
        font-size: 2.2rem;
        font-weight: bold;  
      }

      img, svg, .discord-logo-icon {
        height: 2rem;
        width: 2rem;
        @media (min-width: 960px) {
          height: 2.5rem;
          width: 2.5rem;  
        }
        @media (min-width: 2560px) {
          height: 5rem;
          width: 5rem;
        }
      }

      &.github {
        svg {
          fill: #fff;
        }
      }

      &.discord {
        .discord-logo-icon {
          height: 100%;
          background-color: #5865F2;
          mask: url(${DiscordIconUrl}) no-repeat center;
        }
      }

      .link-text {
        display: none;
        @media (min-width: 960px) {
          display: inline;
        }
      }
    }
  }

  .middle {
    position: relative;
    display: grid;

    .searchResults {
      position: absolute;
      display: flex;
      flex-direction: column;
      bottom: 0;
      top: 3.25rem;
      @media (min-width: 2560px) {
        top: 5rem;
      }
      width: 100%;
      background-color: rgb(35, 35, 35);
      min-height: 40rem;
      border-radius: 0.5rem;
      @media (min-width: 2560px) {
        height: 50rem;
      }
      overflow: auto;

      a {
        display: grid;
        grid-template-columns: 5rem auto;
        min-height: 5rem;
        padding-left: 1rem;
        @media (min-width: 2560px) {
          padding-left: 2.5rem;
        }
        overflow: hidden;

        &:hover {
          background-color: rgb(75, 75, 75);
        }

        img {
          width: 100%;
          height: 80%;
          object-fit: contain;
          margin: auto;
        }

        span {
          display: grid;
          align-items: center;
          height: 5rem;
          margin-left: 1rem;
        }
      }
    }
  }

  .right {
    display: grid;
    justify-items: end;
    align-items: center;

    .authenticate {
      display: flex;
      align-items: center;
      gap: 1rem;
      padding: 0.5rem 1rem;
      .login-text {
        > span {
          display: none;
          @media (min-width: 960px) {
            display: inline;
          }
        }
      }
      font-size: 1.5rem;
      font-weight: 600;
      text-decoration: none;
      @media (min-width: 2560px) {
        font-size: 2rem;
      }

      img {
        height: 2rem;
        width: 2rem;
        @media (min-width: 960px) {
          height: 2.5rem;
          width: 2.5rem;  
        }
        @media (min-width: 2560px) {
          height: 3rem;
          width: 3rem;
        }
      }
    }
  }
`


export const SEARCH_MEDIA = `#graphql
  fragment SearchMediaFragment on Media {
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
  }

  query SearchMedia($input: MediaPageInput!) {
    mediaPage(input: $input) {
      nodes {
        ...SearchMediaFragment
        handles {
          edges {
            node {
              ...SearchMediaFragment
            }
          }
        }
      }
    }
  }
`

const Header = ({ ...rest }) => {
  const [category, setCategory] = useState<Category>('ANIME')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const { register, watch, handleSubmit, getFieldState } = useForm()
  const search = watch('search')
  // We use a state here because we want to debounce the search
  const [searchValue, setSearchValue] = useState('')
  const [searchResult] = useQuery({ query: SEARCH_MEDIA, variables: { input: { search: searchValue } }, pause: !searchValue })

  // const { completed, value: data } = useObservable(() => searchSeries({ categories: [category], search: searchValue }, { fetch: fetch }), [searchValue])
  const completed = true
  const data = []
  const loading = !completed

  useDebounce(() => {
    if (!search?.length) return
    setSearchValue(search)
    setShowSearchResults(true)
  }, 500, [search])

  const onSubmit = (v) => {
  }
  
  const _showSearchResults = () => setShowSearchResults(true)

  const hideSearchResults = (ev: FocusEvent<HTMLInputElement>) => {
    if (ev.relatedTarget?.tagName === 'A') return
    setShowSearchResults(false)
  }

  return (
    <header css={style} {...rest}>
      <div className="left">
        <Link to={getRoutePath(Route.HOME)} className="logo-link">
          <img src={IconUrl} alt="Stub Logo" />
          <span className="link-text">Stub</span>
        </Link>
        <a
          href="https://discord.gg/aVWMJsQxSY"
          target="_blank"
          rel="noopener noreferrer"
          className="logo-link discord"
        >
          <span className="discord-logo-icon" />
          <span className="link-text">Discord</span>
        </a>
        <a
          href="https://github.com/Banou26/stub"
          target="_blank"
          rel="noopener noreferrer"
          className="logo-link github"
        >
          <svg height="32" aria-hidden="true" viewBox="0 0 16 16" version="1.1" width="32" data-view-component="true" className="octicon octicon-mark-github v-align-middle color-fg-default"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"></path></svg>
          <span className="link-text">Github</span>
        </a>
      </div>
      <div className="middle">
        <form onSubmit={handleSubmit(onSubmit)}>
          <Input
            type="text"
            placeholder='Search' {...register('search', { onBlur: hideSearchResults })}
            onFocus={_showSearchResults}
            autoComplete="off"
          />
        </form>
        {
          showSearchResults && searchResult?.data?.mediaPage ? (
            <div className="searchResults" onBlur={hideSearchResults}>
              {
                searchResult?.data?.mediaPage?.nodes.map(media =>
                  <Link to={`${getRoutePath(Route.ANIME)}?${new URLSearchParams({ details: media.uri }).toString()}`}>
                    <img src={media.coverImage.at(0)?.default} alt="" referrer-policy="same-origin"/>
                    <span style={{ color: 'white' }}>{media.title.romanized}</span>
                  </Link>
                )
              }
            </div>
          ) : null
        }
      </div>
      <div className="right">
        <Link to={getRoutePath(Route.AUTH)} className='authenticate'>
          <div className="login-text">Login <span>with your favorite trackers!</span></div>
          <img src={MALIconUrl}/>
          <img src={ALIconUrl}/>
        </Link>
      </div>
    </header>
  )
}

export default Header
