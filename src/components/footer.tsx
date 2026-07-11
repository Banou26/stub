import { css } from '@emotion/react'
import { Link, useRoute } from 'wouter'

import { getRouterRoutePath, getRoutePath, Route } from '../router/path'

const style = css`
  display: flex;
  align-items: center;
  gap: 2rem;
  margin-top: 4rem;
  padding: 2.5rem 3rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);

  .wordmark {
    font-size: 1.8rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.8);

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

  @media (max-width: 768px) {
    gap: 1.2rem;
    padding: 2rem 1.5rem;
  }
`

export const Footer = () => {
  const [onWatch] = useRoute(getRouterRoutePath(Route.WATCH))
  const [onLoginCallback] = useRoute(getRouterRoutePath(Route.LOGIN_CALLBACK))

  if (onWatch || onLoginCallback) return null

  return (
    <footer css={style}>
      <Link to={getRoutePath(Route.HOME)} className="wordmark">stub</Link>
      <Link to={getRoutePath(Route.LEGAL)} className="nav-link">Legal</Link>
      <Link to={getRoutePath(Route.PRIVACY)} className="nav-link">Privacy</Link>
    </footer>
  )
}

export default Footer
