import type { RouteParams } from '../router/path'

import { css } from '@emotion/react'
import { Search, Settings } from 'lucide-react'
import { Link, useLocation, useRoute } from 'wouter'
import { useEffect, useRef, useState } from 'preact/hooks'

import { getRouterRoutePath, getRoutePath, Route } from '../router/path'
import AccountWidget from './account-widget'

const style = css`
  position: fixed;
  /* the FKN broker's docked bar reserves the page's top strip with a root margin, which cannot
     move a fixed element; the variable is its half of the contract and reads 0 everywhere else */
  top: var(--fkn-inset-top, 0px);
  left: 0;
  right: 0;
  z-index: 100;
  /* three tracks rather than a flex row: the search field stays centred on the VIEWPORT whatever the
     wordmark and the action cluster happen to measure, which auto margins on a flex item cannot promise */
  display: grid;
  grid-template-columns: 1fr minmax(0, 32rem) 1fr;
  align-items: center;
  gap: 2rem;
  /* an explicit height rather than padding, so --stub-header-height IS the bar rather than a number
     kept in sync with one */
  height: var(--stub-header-height);
  padding: 0 3rem;
  background: linear-gradient(180deg, rgba(15, 15, 15, 0.95) 0%, rgba(15, 15, 15, 0.55) 55%, rgba(15, 15, 15, 0) 100%);
  pointer-events: none;

  & > * {
    pointer-events: auto;
  }

  /* Docked rather than floating: /watch reserves this strip with its own top padding, so the bar sits
     ON the page instead of over it and the gradient has nothing left to fade across. It stays fixed,
     because "docked" here is about what is underneath it, not about scrolling away. Opaque and edged,
     since the thing below is the source's own player chrome and the two need a seam.

     The border costs no height: box-sizing is border-box globally, so --stub-header-height still IS
     the bar, which is what the pages reserving it measure. */
  &.docked {
    background: #0f0f0f;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    pointer-events: auto;
  }

  .logo {
    justify-self: start;
    font-size: 2.4rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #fff;

    &:hover {
      color: #fff;
    }
  }

  .actions {
    justify-self: end;
    display: flex;
    align-items: center;
    gap: 1.2rem;
  }

  .icon-button {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 4rem;
    height: 4rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 50%;
    background: transparent;
    color: rgba(255, 255, 255, 0.6);
    transition: all 0.15s;

    &:hover {
      color: rgba(255, 255, 255, 0.9);
      border-color: rgba(255, 255, 255, 0.35);
    }
  }

  .search {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    width: 100%;
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
    /* the outer tracks collapse to their content and the search takes what is left: centring it on
       the viewport costs more width than the viewport has */
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 1rem;
    padding: 0 1.5rem;

    .logo {
      font-size: 2rem;
    }

    .actions {
      gap: 0.8rem;
    }

    .icon-button {
      width: 3.4rem;
      height: 3.4rem;
    }

    .search {
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
  const [onLoginCallback] = useRoute(getRouterRoutePath(Route.LOGIN_CALLBACK))
  const [onWatch] = useRoute(getRouterRoutePath(Route.WATCH))
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

  // /login/callback is an OAuth redirect target that calls close() on mount, not a page anyone reads.
  // A header there would mount the account broker's cross-origin iframe and a subscription that are
  // torn down milliseconds later, so it stays bare. Every route a user actually browses gets the bar.
  if (onLoginCallback) return null

  return (
    <header css={style} className={onWatch ? 'docked' : undefined}>
      <Link to={getRoutePath(Route.HOME)} className="logo">stub</Link>
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
      <div className="actions">
        <Link to={getRoutePath(Route.SETTINGS)} className="icon-button" aria-label="Settings" title="Settings">
          <Settings size={20}/>
        </Link>
        <AccountWidget/>
      </div>
    </header>
  )
}

export default Header
