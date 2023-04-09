import { HandleConnection } from '../generated/graphql'
import type { Handle } from '../../../../scannarr/src'

// import { getTarget } from '../../../../scannarr/src'

import { css } from '@emotion/react'

const style = css`
background-size: cover;
`

export default ({ handles }: { handles?: HandleConnection }) => (
  <>
    {
      handles?.nodes?.map(handle =>
        <a
          css={style}
          key={handle.uri}
          // href={handle.url ?? getTarget(handle.scheme)?.origin}
          // style={{ backgroundImage: `url(${getTarget(handle.scheme)?.icon})` }}
        >
        </a>
      )
    }
  </>
)
