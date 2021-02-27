import React, { Fragment } from 'react'
import { Link } from 'raviger'

export default () => {
  console.log('Home')
  return (
    <Fragment>
     Home
     <Link href="/animes">Animes</Link>
    </Fragment>
  )
}
