const clientID = '45c7955ab6aa13ac1d1dafbc3f6fab4b'
const redirectURL = 'https://fkn.app/app/616331fa7b57db93f0957a18/auth/foo'

const generateChallenge = () => {
  var result = "";
  var characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  var charactersLength = characters.length;
  for (var i = 0; i < 128; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
};

// const callbackResp = () => {
//   const response = req.query;
//   const rn = await fetch(`https://myanimelist.net/v1/oauth2/token`, {
//     method: "POST",
//     headers: {
//       "Content-Type": "application/x-www-form-urlencoded",
//     },
//     body: `grant_type=authorization_code&code=${response.code}&client_id=${this[_clientID]}${
//       this[_clientSecret] ? `&client_secret=${this[_clientSecret]}` : ""
//     }&code_verifier=${this[_codeChallenge]}&redirect_uri=${this[_callback]}`,
//   });

//   const data = await rn.json();
//   req.get_data = data;
//   this[_refreshToken] = data.refresh_token;
//   next();
// }

export default ({ name }: { name?: string }) => {

  // window.location = `https://myanimelist.net/v1/oauth2/authorize?response_type=code&client_id=${this[_clientID]}&code_challenge=${this[_codeChallenge]}&redirect_uri=${this[_callback]}&code_challenge_method=plain`


  return (
    <div>
      {name} AUTH
    </div>
  )
}
