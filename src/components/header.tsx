import type { RouteParams } from '../router/path'

import { css } from '@emotion/react'
import { Search } from 'lucide-react'
import { Link, useLocation, useRoute } from 'wouter'
import { useEffect, useRef, useState } from 'preact/hooks'

import { getRouterRoutePath, getRoutePath, Route } from '../router/path'

const style = css`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  gap: 2rem;
  padding: 1.5rem 3rem;
  background: linear-gradient(180deg, rgba(15, 15, 15, 0.95) 0%, rgba(15, 15, 15, 0.55) 55%, rgba(15, 15, 15, 0) 100%);
  pointer-events: none;

  & > * {
    pointer-events: auto;
  }

  .logo {
    font-size: 2.4rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #fff;

    &:hover {
      color: #fff;
    }
  }

  .nav-link {
    font-size: 1.4rem;
    white-space: nowrap;
    color: rgba(255, 255, 255, 0.55);

    &:hover {
      color: #fff;
    }
  }

  .search {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    margin-left: auto;
    width: 32rem;
    max-width: 50vw;
    padding: 0.8rem 1.4rem;
    background: rgba(35, 35, 35, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.8rem;
    backdrop-filter: blur(8px);
    transition: border-color 0.2s ease, background 0.2s ease;

    &:focus-within {
      border-color: rgba(255, 255, 255, 0.35);
      background: rgba(35, 35, 35, 0.95);
    }

    svg {
      flex-shrink: 0;
      color: rgba(255, 255, 255, 0.6);
    }

    input {
      width: 100%;
      background: transparent;
      border: none;
      outline: none;
      color: #fff;
      font-family: inherit;
      font-size: 1.5rem;

      &::placeholder {
        color: rgba(255, 255, 255, 0.4);
      }
    }
  }

  @media (max-width: 768px) {
    gap: 1rem;
    padding: 1.2rem 1.5rem;

    .logo {
      font-size: 2rem;
    }

    .nav-link {
      font-size: 1.3rem;
    }

    .search {
      width: auto;
      flex: 1 1 auto;
      min-width: 0;
      max-width: none;
      padding: 0.6rem 1rem;

      input {
        font-size: 1.4rem;
      }
    }
  }
`

export const Header = () => {
  const [, navigate] = useLocation()
  const [, searchParams] = useRoute<RouteParams['SEARCH']>(getRouterRoutePath(Route.SEARCH))
  const [onWatch] = useRoute(getRouterRoutePath(Route.WATCH))
  const [onLoginCallback] = useRoute(getRouterRoutePath(Route.LOGIN_CALLBACK))
  const routeQuery = searchParams?.query ? decodeURIComponent(searchParams.query) : ''
  const [query, setQuery] = useState(routeQuery)
  const inputRef = useRef<HTMLInputElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (document.activeElement !== inputRef.current && routeQuery !== query) setQuery(routeQuery)
  }, [routeQuery])

  const runSearch = (value: string, replace: boolean) => {
    const trimmed = value.trim()
    if (!trimmed) return
    navigate(getRoutePath(Route.SEARCH, { query: trimmed }), { replace })
  }

  if (onWatch || onLoginCallback) return null

  return (
    <header css={style}>
      <Link to={getRoutePath(Route.HOME)} className="logo">stub</Link>
      <Link to={getRoutePath(Route.LEGAL)} className="nav-link">Legal</Link>
      <Link to={getRoutePath(Route.PRIVACY)} className="nav-link">Privacy</Link>
      <Link to={getRoutePath(Route.SETTINGS)} className="nav-link">Settings</Link>
      <form
        className="search"
        onSubmit={event => {
          event.preventDefault()
          if (timer.current) clearTimeout(timer.current)
          runSearch(query, false)
          inputRef.current?.blur()
        }}
      >
        <Search size={20} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          placeholder="Search anime, shows, movies…"
          aria-label="Search"
          onInput={event => {
            const value = event.currentTarget.value
            setQuery(value)
            if (timer.current) clearTimeout(timer.current)
            timer.current = setTimeout(() => runSearch(value, true), 350)
          }}
        />
      </form>
    </header>
  )
}

export default Header
