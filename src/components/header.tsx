import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { FocusEvent, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useDebounce } from 'react-use'

import Input from './inputs'

import IconUrl from '../images/icon.webp'
import { getRoutePath, Route } from '../router/path'
import DiscordIconUrl from '../images/discord-mark-blue.svg'
import { useQuery } from 'urql'

const style = css`
  position: fixed;
  height: 6rem;
  width: 100%;
  background-color: rgb(35, 35, 35);

  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: center;

  /* border-bottom: 1px solid rgb(35, 35, 35); */
  /* background-color: rgb(35, 35, 35); */
  color: white;
  
  user-select: none;
  padding: 0 4rem;

  z-index: 100;

  .left {
    display: grid;
    grid-template-columns: 15rem 15rem 15rem auto;
    gap: 2rem;

    .logo-link {
      display: grid;
      grid-template-columns: 5rem auto;
      height: 5rem;
      width: 100%;
      align-items: center;
      justify-content: center;
      font-size: 2.2rem;
      font-weight: bold;
      text-decoration: none;
      gap: 1.5rem;

      .logo-icon {
        height: 5rem;
      }

      &.discord {
        color: #5865F2;
        &:hover {
          color: #fff;
          .discord-logo-icon {
            background-color: #fff;
          }
        }
        .discord-logo-icon {
          width: 5rem;
          height: 100%;
          background-color: #5865F2;
          mask: url(${DiscordIconUrl}) no-repeat center;
        }
      }
    }
  }

  .middle {
    position: relative;
    display: grid;

    .searchResults {
      position: absolute;
      display: grid;
      bottom: 0;
      top: 50px;
      width: 100rem;
      background-color: rgb(35, 35, 35);
      height: fit-content;
      row-gap: 0.5rem;
      height: 50rem;
      /* height: calc(100vh - 10rem); */
      overflow: auto;
      padding: 1.5rem 0;

      a {
        display: grid;
        grid-template-columns: 5rem auto;
        height: 5rem;
        padding-left: 2.5rem;
        overflow: hidden;

        &:hover {
          background-color: rgb(75, 75, 75);
        }

        img {
          /* height: 100%; */
          width: 100%;
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

  query SearchMedia($search: String!) {
    Page {
      media(search: $search) {
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
  const [searchResult] = useQuery({ query: SEARCH_MEDIA, variables: { search: searchValue }, pause: !searchValue })
  // console.log('searchResult', searchResult)
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
          <img src={IconUrl} alt="Stub Logo" className="logo-icon"/>
          <span>Stub</span>
        </Link>
        <a href="https://discord.gg/aVWMJsQxSY" target="_blank" rel="noopener noreferrer" className="logo-link discord">
          <span className="discord-logo-icon"></span>
          <span>Discord</span>
        </a>
        <a href="https://github.com/Banou26/stub" target="_blank" rel="noopener noreferrer" className="logo-link github">
          <svg aria-hidden="true" focusable="false" data-prefix="fab" data-icon="github" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 496 512" class="svg-inline--fa fa-github fa-2x github-logo-icon"><path fill="currentColor" d="M165.9 397.4c0 2-2.3 3.6-5.2 3.6-3.3.3-5.6-1.3-5.6-3.6 0-2 2.3-3.6 5.2-3.6 3-.3 5.6 1.3 5.6 3.6zm-31.1-4.5c-.7 2 1.3 4.3 4.3 4.9 2.6 1 5.6 0 6.2-2s-1.3-4.3-4.3-5.2c-2.6-.7-5.5.3-6.2 2.3zm44.2-1.7c-2.9.7-4.9 2.6-4.6 4.9.3 2 2.9 3.3 5.9 2.6 2.9-.7 4.9-2.6 4.6-4.6-.3-1.9-3-3.2-5.9-2.9zM244.8 8C106.1 8 0 113.3 0 252c0 110.9 69.8 205.8 169.5 239.2 12.8 2.3 17.3-5.6 17.3-12.1 0-6.2-.3-40.4-.3-61.4 0 0-70 15-84.7-29.8 0 0-11.4-29.1-27.8-36.6 0 0-22.9-15.7 1.6-15.4 0 0 24.9 2 38.6 25.8 21.9 38.6 58.6 27.5 72.9 20.9 2.3-16 8.8-27.1 16-33.7-55.9-6.2-112.3-14.3-112.3-110.5 0-27.5 7.6-41.3 23.6-58.9-2.6-6.5-11.1-33.3 2.6-67.9 20.9-6.5 69 27 69 27 20-5.6 41.5-8.5 62.8-8.5s42.8 2.9 62.8 8.5c0 0 48.1-33.6 69-27 13.7 34.7 5.2 61.4 2.6 67.9 16 17.7 25.8 31.5 25.8 58.9 0 96.5-58.9 104.2-114.8 110.5 9.2 7.9 17 22.9 17 46.4 0 33.7-.3 75.4-.3 83.6 0 6.5 4.6 14.4 17.3 12.1C428.2 457.8 496 362.9 496 252 496 113.3 383.5 8 244.8 8zM97.2 352.9c-1.3 1-1 3.3.7 5.2 1.6 1.6 3.9 2.3 5.2 1 1.3-1 1-3.3-.7-5.2-1.6-1.6-3.9-2.3-5.2-1zm-10.8-8.1c-.7 1.3.3 2.9 2.3 3.9 1.6 1 3.6.7 4.3-.7.7-1.3-.3-2.9-2.3-3.9-2-.6-3.6-.3-4.3.7zm32.4 35.6c-1.6 1.3-1 4.3 1.3 6.2 2.3 2.3 5.2 2.6 6.5 1 1.3-1.3.7-4.3-1.3-6.2-2.2-2.3-5.2-2.6-6.5-1zm-11.4-14.7c-1.6 1-1.6 3.6 0 5.9 1.6 2.3 4.3 3.3 5.6 2.3 1.6-1.3 1.6-3.9 0-6.2-1.4-2.3-4-3.3-5.6-2z"></path></svg>
          <span>Github</span>
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
          showSearchResults && searchResult?.data?.Page?.media ? (
            <div className="searchResults" onBlur={hideSearchResults}>
              {
                searchResult?.data?.Page?.media.map(media =>
                  <Link to={{ pathname: getRoutePath(Route.ANIME), search: new URLSearchParams({ details: media.uri }).toString() }}>
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
      </div>
    </header>
  )
}

export default Header
