import { css } from '@emotion/react'
import { Link } from 'wouter'
import { useEffect, useState } from 'preact/hooks'

import { party } from '../../party'
import { inviteFromHash } from '../../party/invite'
import { useParty } from '../../party/use-party'
import { getRoutePath, Route } from '../path'

const style = css`
  padding: calc(var(--stub-header-height) + 3rem) 3rem 4rem;
  min-height: 100vh;

  .heading {
    font-size: 2.4rem;
    font-weight: 600;
    margin-bottom: 1rem;
    color: rgba(255, 255, 255, 0.85);
  }

  .status {
    font-size: 1.6rem;
    color: rgba(255, 255, 255, 0.5);
    max-width: 60ch;
    line-height: 1.5;
  }

  a { color: rgba(255, 255, 255, 0.85); text-decoration: underline; }
`

/**
 * Where an invite link lands.
 *
 * The invite is in the fragment. This page joins, and the follow sync mounted at the router root
 * moves the tab to wherever the host is the moment the host answers the join, so a reader sees this
 * page for as long as one round trip takes. It stays on screen only when there is nothing to follow.
 */
const Party = () => {
  const state = useParty()
  const [invite] = useState(() => inviteFromHash(location.hash))

  useEffect(() => {
    if (!invite) return
    // a reload of this url resumes from the session first, and that join is the same one
    const current = party.getState()
    if ((current.status === 'joining' || current.status === 'active') && current.invite === invite) return
    void party.join(invite)
  }, [invite])

  return (
    <div css={style}>
      <div className="heading">Watch together</div>
      <div className="status">
        {
          !invite ? <>This invite link is broken. Ask the host for a new one.</>
          : state.status === 'joining' ? <>Joining the party…</>
          : state.status === 'active' && state.role === 'guest' ? <>Waiting for the host…</>
          : state.status === 'active' ? <>This is your own party. <Link to={getRoutePath(Route.HOME)}>Go home</Link> and your guests will follow.</>
          : state.status === 'failed' ? <>Could not join. {FAILURE[state.code] ?? 'Something went wrong.'}</>
          : state.status === 'ended' ? <>The party ended.</>
          : <Link to={getRoutePath(Route.HOME)}>Go home</Link>
        }
      </div>
    </div>
  )
}

const FAILURE: Record<string, string> = {
  'not-found': 'That party has ended.',
  'bad-key': 'The invite link is not valid.',
  invalid: 'The invite link is broken.',
  full: 'The party is full.',
  blocked: 'You cannot join this party.',
  unavailable: 'Parties are not available right now. Is FKN connected?',
}

export default Party
