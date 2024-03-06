import { css } from '@emotion/react'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'urql'
import { Link, Redirect, useLocation, useParams } from 'wouter'
import { Route, getRoutePath } from '../path'
import { ORIGINS_OAUTH2_IDS, setLocalStorageAuthState } from './utils'

const style = css`
  .origin {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 1rem;
    margin: 1rem;
    border: 1px solid #fff;
    border-radius: 1rem;
    background-color: #1f1f1f;
    color: #fff;
    font-family: Montserrat;
    font-size: 1.6rem;
    width: 25rem;

    img {
      width: 5rem;
      height: 5rem;
    }

    .title {
      font-size: 2.4rem;
    }

    button {
      padding: 1rem;
      border: none;
      border-radius: 1rem;
      background-color: #fff;
      color: #000;
      font-family: Montserrat;
      font-size: 1.6rem;
      cursor: pointer;
    }
  }
`

const GET_ORIGIN_AUTHENTICATION = `#graphql
  query GetAuthentication {
    authentication {
      origin {
        id
        name
        icon
      }
      authentication
      methods {
        type

        url
        headers {
          key
          value
        }
        body
      }
    }
  }
`

const GET_ORIGIN_AUTHENTICATE = `#graphql
  mutation GetAuthenticate($input: AuthenticateInput!) {
    authenticate(input: $input) {
      oauth2 {
        accessToken
        refreshToken
        expiresIn
        tokenType
      }
    }
  }
`

export default () => {
  const [, setLocation] = useLocation()
  const { originId } = useParams()
  const searchParams = new URLSearchParams(location.search)
  const authorizationCode = searchParams.get('code')
  const state = searchParams.get('state')

  const [wrongState, setWrongState] = useState(false)
  const [, executeMutation] = useMutation(GET_ORIGIN_AUTHENTICATE)

  useEffect(() => {
    if (!authorizationCode || !state || !originId) return

    const savedState = localStorage.getItem('auth-oauth2-state')

    if (savedState !== state) {
      setWrongState(true)
      localStorage.removeItem('auth-oauth2-state')
      return
    }
    const clientId = ORIGINS_OAUTH2_IDS.find(([id]) => id === originId)?.[1]

    executeMutation({
      input: {
        origin: originId,
        type: 'OAUTH2',
        oauth2: {
          clientId,
          authorizationCode,
          codeVerifier: state,
          grantType: 'authorization_code',
          redirectUri: new URL(getRoutePath(Route.AUTH_OAUTH2_CALLBACK, { originId }), location.origin).href
        }
      }
    }).then(res => {
      localStorage.removeItem('auth-oauth2-state')
      setLocalStorageAuthState({
        origin: originId,
        type: 'OAUTH2',
        oauth2: {
          accessToken: res.data.authenticate.oauth2.accessToken,
          refreshToken: res.data.authenticate.oauth2.refreshToken,
          expiresIn: res.data.authenticate.oauth2.expiresIn,
          tokenType: res.data.authenticate.oauth2.tokenType
        }
      })
      setLocation(getRoutePath(Route.AUTH))
    })
  }, [authorizationCode, state, originId])

  return (
    <div css={style}>
      {
        !authorizationCode || !state
          ? (
            <div>
              <h1>An issue occured</h1>
              <p>No authorization code or state was found in the current URL</p>
              <Link href={getRoutePath(Route.AUTH)}>Go back</Link>
            </div>
          )
          : (
            wrongState
              ? (
                <div>
                  <h1>Wrong state</h1>
                  <p>Authorization code was not accepted because it returned mismatching state</p>
                  <Link href={getRoutePath(Route.AUTH)}>Go back</Link>
                </div>
              )
              : (
                <div>
                  <h1>Sucessfully authenticated</h1>
                  <p>You will be shortly redirected</p>
                  <Link href={getRoutePath(Route.AUTH)}>Or you can click here</Link>
                </div>
              )
          )
      }
    </div>
  )
}
