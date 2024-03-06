import { HandleConnection } from '../generated/graphql'

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
        >
        </a>
      )
    }
  </>
)
