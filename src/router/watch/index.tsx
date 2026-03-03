import { css } from '@emotion/react'
import { useParams } from 'wouter'

import type { RouteParams } from '../path'

const style = css`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100vh;
  color: rgb(255, 255, 255);
  font-size: 2rem;

  .params {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 2.5rem;
    background-color: rgb(35, 35, 35);
    border-radius: 1rem;

    span {
      opacity: 0.7;
      font-size: 1.4rem;
    }
  }
`

const Watch = () => {
  const params = useParams<RouteParams['WATCH']>()

  return (
    <div css={style}>
      <div className="params">
        <div>
          <span>Media</span>
          <div>{params.mediaUri}</div>
        </div>
        <div>
          <span>Episode</span>
          <div>{params.episodeUri}</div>
        </div>
        {
          params.sourceUri
            ? (
              <div>
                <span>Source</span>
                <div>{params.sourceUri}</div>
              </div>
            )
            : undefined
        }
      </div>
    </div>
  )
}

export default Watch
