import { useEffect, useState } from 'react'

const MAL_CLIENT_ID = import.meta.env.VITE_MAL_CLIENT_ID
if (!MAL_CLIENT_ID) throw new Error('VITE_MAL_CLIENT_ID is not defined')

export const ORIGINS_OAUTH2_IDS = [
  ['mal', MAL_CLIENT_ID]
]

const BASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
export const generateOauth2State = () => {
  let result = ''
  for (let i = 0; i < 128; i++) {
    result += BASE.charAt(Math.floor(Math.random() * BASE.length))
  }
  return result
}

type AuthState = {
  origin: string
  type: string
  oauth2: {
    accessToken: string
    refreshToken: string
    expiresIn: number
    tokenType: string
  }
}

export const getLocalStorageAuthStates = (): AuthState[] => {
  const states = localStorage.getItem('auth-oauth2-states')
  return states ? JSON.parse(states) : []
}

export const setLocalStorageAuthState = (state: AuthState) => {
  localStorage.setItem('auth-oauth2-states', JSON.stringify([
    ...getLocalStorageAuthStates()
      .filter(authState =>
        authState.origin !== state.origin &&
        authState.type !== state.type
      ),
    state
  ]))
}

export const removeLocalStorageAuthState = (origin: string, type: string) => {
  localStorage.setItem('auth-oauth2-states',
    JSON.stringify(
      getLocalStorageAuthStates()
        .filter(authState =>
          authState.origin !== origin &&
          authState.type !== type
        )
    )
  )
}

export const getLocalStorageAuthState = (origin: string, type: string) => {
  return getLocalStorageAuthStates().find(authState =>
    authState.origin === origin &&
    authState.type === type
  )
}

export const useLocalStorageAuthState = (origin: string, type: string) => {
  const [authState, setAuthState] = useState(getLocalStorageAuthState(origin, type))
  useEffect(() => {
    setAuthState(getLocalStorageAuthState(origin, type))
    const listener = (event) => {
      if (event.key !== 'auth-oauth2-states') return
      setAuthState(getLocalStorageAuthState(origin, type))
    }
    window.addEventListener('storage', listener)

    return () => {
      window.removeEventListener('storage', listener)
    }
  }, [origin, type])
  return authState
}

export const useLocalStorageAuthStates = () => {
  const [authStates, setAuthStates] = useState(getLocalStorageAuthStates())
  useEffect(() => {
    setAuthStates(getLocalStorageAuthStates())
    const listener = (event) => {
      if (event.key !== 'auth-oauth2-states') return
      setAuthStates(getLocalStorageAuthStates())
    }
    window.addEventListener('storage', listener)

    return () => {
      window.removeEventListener('storage', listener)
    }
  }, [])
  return authStates
}
