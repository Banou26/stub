import { css } from '@emotion/react'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'urql'
import { ORIGINS_OAUTH2_IDS, generateOauth2State, useLocalStorageAuthState } from './utils'
import { Route, getRoutePath } from '../path'

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
  query GetOriginAuthentication {
    originAuthentication {
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

const GET_ORIGIN_USER = `#graphql
  query GetOriginUser($input: OriginUserInput!) {
    originUser(input: $input) {
      id
      username
      email
      avatar
    }
  }
`

type OriginAuthentication = {
  origin: {
    id: string
    name: string
    icon: string
  }
  authentication: boolean
  methods: {
    type: string
    url: string
    headers: {
      key: string
      value: string
    }[]
    body: string
  }[]
}

const OriginCard = ({ originAuthentication }: { originAuthentication: OriginAuthentication }) => {
  const method = originAuthentication.methods[0]
  if (!method || method.type !== 'OAUTH2') return null

  const authState = useLocalStorageAuthState(originAuthentication.origin.id, method.type)

  const [{ error, data }] = useQuery({
    query: GET_ORIGIN_USER,
    variables: {
      input: {
        origin: originAuthentication.origin.id,
        type: method.type,
        oauth2: authState?.oauth2 && {
          accessToken: authState.oauth2.accessToken,
          tokenType: authState.oauth2.tokenType
        }
      }
    }
  })

  const originUser = data?.originUser

  if (error) console.error(error)

  const authenticate = (originAuth) => {
    const method = originAuth.methods[0]
    if (method.type === 'OAUTH2') {
      const clientId = ORIGINS_OAUTH2_IDS.find(([id]) => id === originAuth.origin.id)?.[1]
      if (!clientId) throw new Error(`Client ID not found for origin ${originAuth.origin.id}`)
      const challenge = generateOauth2State()
      localStorage.setItem('auth-oauth2-state', challenge)
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: clientId,
        code_challenge: challenge,
        state: challenge,
        redirect_uri: new URL(getRoutePath(Route.AUTH_OAUTH2_CALLBACK, { originId: originAuth.origin.id }), location.origin).href,
      }).toString()
      window.location.href = `${method.url}?${params}`
    }
  }

  return (
    <div key={originAuthentication.origin.id} className='origin'>
      <img src={originAuthentication.origin.icon} />
      <div className='title'>{originAuthentication.origin.name}</div>
      {
        originUser
          ? (
            <div>
              <img src={originUser.avatar}/>
              <div>{originUser.username}</div>
              <div>{originUser.email}</div>
            </div>
          )
          : <button onClick={() => authenticate(originAuthentication)}>Authenticate</button>
      }
    </div>
  )
}

export default () => {
  const [{ data: { originAuthentication } = {} }] = useQuery({ query: GET_ORIGIN_AUTHENTICATION })
  useEffect(() => {
    localStorage.removeItem('auth-oauth2-state')
  }, [])

  return (
    <div css={style}>
      {
        originAuthentication?.map((originAuthentication, i) =>
          <OriginCard key={i} originAuthentication={originAuthentication} />
        )
      }
    </div>
  )
}
