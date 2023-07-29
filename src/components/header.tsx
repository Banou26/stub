import { css } from '@emotion/react'
import { Link } from 'react-router-dom'
import { FocusEvent, Fragment, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useDebounce } from 'react-use'

import Input from './inputs'

import IconUrl from '../images/icon.png'
import { getRoutePath, Route } from '../router/path'
import DiscordIconUrl from '../images/discord-mark-blue.svg'
import { faGithub } from '@fortawesome/free-brands-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

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

const Header = ({ ...rest }) => {
  const [category, setCategory] = useState<Category>('ANIME')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const { register, watch, handleSubmit, getFieldState } = useForm()
  const search = watch('search')
  // We use a state here because we want to debounce the search
  const [searchValue, setSearchValue] = useState('')
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
          <FontAwesomeIcon icon={faGithub} className="github-logo-icon" size='2x'/>
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
          showSearchResults && data ? (
            <div className="searchResults" onBlur={hideSearchResults}>
              {
                data.map(title =>
                  <Link key={title.uri} href={getRoutePath(Route.TITLE, { uri: title.uri })}>
                    <img src={title.images.at(0)?.url} alt="" referrer-policy="same-origin"/>
                    <span style={{ color: 'white' }}>{title.names.at(0)?.name}</span>
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
