import React from 'react'
import { css } from '@emotion/react'

const style = (height?: number, width?: number) => css`
display: flex;
gap: 1rem;
& > span:first-of-type {
  margin-left: 1rem;
  @media (min-width: 1440px) {
    margin-left: 5rem;
  }
  @media (min-width: 2560px) {
    margin-left: 10rem;
  }
}
> span {
  padding: 0 .2rem;
  height: ${height ? `${height}px` : 'auto'};
  width: ${width ? `${width}px` : 'auto'};    
  background: #1a1d24;
  border-radius: .5rem;
}
`

const SkeletonCard = ({
  count = 1,
  height,
  width
}: {
  count?: number
  height?: number
  width?: number
}) => {
  return (
    <div css={style(height, width)}>
      {
        Array.from({length: count}).map((_, index) => (
          <span  key={index} />
        ))
      }
    </div>
  )
}

export default SkeletonCard