/** @jsx jsx */
import { Fragment } from 'react'
import { css, jsx } from '@emotion/react'

import Router from '../router'

const Mount = () => {
  console.log('Mount')
  return (
    <Fragment>
      <Router/>
    </Fragment>
  )
}

export default Mount
