import { useEffect } from 'react';

const clientID = '45c7955ab6aa13ac1d1dafbc3f6fab4b'

const generateChallenge = () => {
  var result = "";
  var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  var charactersLength = characters.length;
  for (var i = 0; i < 128; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

export default ({ name }: { name?: string }) => {
  const challenge = generateChallenge()
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientID,
    code_challenge: challenge,
    state: challenge
  }).toString()

  const searchParams = new URLSearchParams(location.search)
  const authorizationCode = searchParams.get('code')
  const state = searchParams.get('state')

  useEffect(() => {
    if (!authorizationCode || !state) return
    const params = new URLSearchParams({
      client_id: clientID,
      code: authorizationCode,
      code_verifier: state,
      grant_type: 'authorization_code'
    }).toString()

    fetch(`https://myanimelist.net/v1/oauth2/token`, {
      method: 'POST',
      headers:{ 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    }).then(async res => {
      console.log('res', await res.text())
    })
  }, [authorizationCode])

  const url = `https://myanimelist.net/v1/oauth2/authorize?${params}`

  return (
    <div>
      {name} AUTH
      {
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
      }
    </div>
  )
}
