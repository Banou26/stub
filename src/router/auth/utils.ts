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
