import { serverProxyFetch } from '@fkn/lib'
import { useEffect, useState } from 'react'
import { useLocation } from 'wouter';
import { Route, getRoutePath } from '../path';

const clientID = '75e3d0c652ff200e0d63590b9c586b0c'

const BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
const generateChallenge = () => {
  let result = ''
  for (let i = 0; i < 128; i++) {
    result += BASE.charAt(Math.floor(Math.random() * BASE.length))
  }
  return result
}

export type AuthResponse = {
  access_token: string
  expires_in: number
  refresh_token: string
  token_type: 'Bearer'
} | {
  error: string
  message: string
  hint: string
}

type User = {
  id: number,
  name: string,
  location: '',
  // Stringified Date e.g '2016-03-04T22:27:43+00:00'
  joined_at: string,
  picture: string
}

export default ({ name }: { name?: string }) => {
  const challenge = generateChallenge()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientID,
    code_challenge: challenge,
    state: challenge,
    redirect_uri: new URL('/auth/mal', location.origin).href,
  }).toString()

  const searchParams = new URLSearchParams(location.search)
  const authorizationCode = searchParams.get('code')
  const state = searchParams.get('state')

  const [response, setResponse] = useState<AuthResponse>(localStorage.getItem('auth-mal') ? JSON.parse(localStorage.getItem('auth-mal')!) : null)

  const [, setLocation] = useLocation()

  useEffect(() => {
    if (!response) return
    if (response.error && response.hint !== 'Authorization code has expired') {
      console.error(response.hint)
    }
    setLocation(getRoutePath(Route.AUTH, { name: 'mal' }))
  }, [response])

  useEffect(() => {
    if (!authorizationCode || !state || response) return
    const params = new URLSearchParams({
      client_id: clientID,
      code: authorizationCode,
      code_verifier: state,
      grant_type: 'authorization_code',
      redirect_uri: new URL('/auth/mal', location.origin).href
    }).toString()

    serverProxyFetch(`https://myanimelist.net/v1/oauth2/token`, {
      method: 'POST',
      headers:{ 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    }).then(async res => {
      const response = await res.json()
      if (!response.error) localStorage.setItem('auth-mal', JSON.stringify(response))
      setResponse(response)
    })
  }, [authorizationCode, state, response])

  const url = `https://myanimelist.net/v1/oauth2/authorize?${params}`

  const [userData, setUserData] = useState<User>()
  useEffect(() => {
    if (!response || !response.access_token) return
    serverProxyFetch(`https://api.myanimelist.net/v2/users/@me`, {
      headers: { 'Authorization': `Bearer ${response.access_token}` }
    }).then(async res => {
      const response = await res.json()
      setUserData(response)
    })
  }, [response])

  return (
    <div>
      {name} AUTH
      {
        response && response.error && response.hint === 'Authorization code has expired'
          ? (
            <div>
              AUTHORIZATION CODE EXPIRED, YOU CAN RETRY, <a href={url}>CLICK TO AUTH</a>
            </div>
          )
          : (
            userData
              ? (
                <div>
                  AUTHENTIFIED AS {userData?.name}
                </div>
              )
              : (
                authorizationCode
                  ? (
                    <div>
                      AUTHENTICATING
                    </div>
                  )
                  : (
                    <a href={url}>
                      CLICK TO AUTH
                    </a>
                  )
              )
          )
      }
    </div>
  )
}
